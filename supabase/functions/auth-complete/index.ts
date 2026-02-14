import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { createSession, getAdminClient } from '../_shared/supabase.ts';
import { logSecurityEvent, extractClientInfo } from '../_shared/security.ts';
import { SiweMessage } from 'https://esm.sh/siwe@2.3.2';
import { verifyMessage } from 'https://esm.sh/ethers@6.11.1';

interface CompleteRequest {
  payload: {
    message: string;
    signature: string;
    address?: string;
  };
  nonce: string;
  player_name?: string;
  username?: string;
  referral_code?: string;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { payload, nonce, player_name, username, referral_code } = (await req.json()) as CompleteRequest;
    if (!payload || !nonce) {
      throw new Error('Missing payload or nonce');
    }

    const admin = getAdminClient();
    const { data: nonceRow } = await admin
      .from('auth_nonces')
      .select('*')
      .eq('nonce', nonce)
      .single();

    if (!nonceRow) {
      throw new Error('Invalid nonce');
    }

    const expiresAt = new Date(nonceRow.expires_at).getTime();
    if (Date.now() > expiresAt) {
      throw new Error('Nonce expired');
    }

    // Verify SIWE message using standard siwe library
    const { message, signature, address: payloadAddress } = payload;

    if (!message || !signature) {
      throw new Error('Missing message or signature in payload');
    }

    console.log(`[AuthComplete] Received auth request for nonce: ${nonce}`);
    console.log(`[AuthComplete] Message: ${message.substring(0, 50)}...`);
    console.log(`[AuthComplete] Payload Address: ${payloadAddress}`);

    let walletAddress: string | undefined;

    try {
      // Parse the SIWE message
      const siweMessage = new SiweMessage(message);

      // Verify the nonce matches
      if (siweMessage.nonce !== nonce) {
        console.error(`[AuthComplete] Nonce mismatch. Expected: ${nonce}, Received: ${siweMessage.nonce}`);
        throw new Error('Nonce mismatch');
      }

      console.log(`[AuthComplete] SIWE address: ${siweMessage.address}`);

      // Verify the signature using the built-in SiweMessage verify method
      // This is more robust as it handles all SIWE requirements
      try {
        const { success, error, data } = await siweMessage.verify({
          signature,
          nonce,
        });

        if (success) {
          console.log(`[AuthComplete] SIWE Verification Success for address: ${data.address}`);
          walletAddress = data.address;
        } else {
          console.error(`[AuthComplete] SIWE Verification Failed: ${error}`);
          // Fall through to manual check as fallback
        }
      } catch (e) {
        console.error(`[AuthComplete] siweMessage.verify error:`, e);
      }

      if (!walletAddress) {
        // Double check with ethers directly as extra fallback
        const recoveredAddress = verifyMessage(message, signature);
        console.log(`[AuthComplete] Manual recovery (ethers): ${recoveredAddress}`);

        if (recoveredAddress.toLowerCase() === siweMessage.address.toLowerCase()) {
          console.log(`[AuthComplete] Manual recovery matched SIWE address.`);
          walletAddress = siweMessage.address;
        } else {
          console.error(`[AuthComplete] Manual recovery mismatch: ${recoveredAddress.toLowerCase()} vs ${siweMessage.address.toLowerCase()}`);
          throw new Error('Signature verification failed');
        }
      }
    } catch (e) {
      console.error(`[AuthComplete] Primary SIWE path failed:`, e);
      // Fallback path for non-standard SIWE payloads:
      // still require signature recovery + nonce presence to avoid trusting raw payload address.
      if (payloadAddress) {
        console.log(`[AuthComplete] Attempting fallback for payloadAddress: ${payloadAddress}`);
        const recoveredAddress = verifyMessage(message, signature);
        console.log(`[AuthComplete] Recovered from fallback: ${recoveredAddress}`);

        if (recoveredAddress.toLowerCase() !== payloadAddress.toLowerCase()) {
          console.error(`[AuthComplete] Fallback mismatch: ${recoveredAddress.toLowerCase()} vs ${payloadAddress.toLowerCase()}`);
          throw new Error('Signature/address mismatch');
        }
        if (!message.includes(nonce)) {
          console.error(`[AuthComplete] Nonce not found in fallback message`);
          throw new Error('Nonce mismatch');
        }
        walletAddress = recoveredAddress;
      } else {
        throw new Error('SIWE validation failed: ' + (e as Error).message);
      }
    }

    if (!walletAddress) {
      throw new Error('Wallet address missing');
    }

    // Consume nonce only after successful verification.
    await admin.from('auth_nonces').delete().eq('nonce', nonce);

    let { data: profile } = await admin
      .from('profiles')
      .select('id, player_name, is_admin, is_human_verified')
      .eq('wallet_address', walletAddress)
      .single();

    let userId: string | null = profile?.id ?? null;

    if (!userId) {
      const email = `wallet_${walletAddress.toLowerCase()}@world.local`;
      const password = crypto.randomUUID() + crypto.randomUUID();

      let userIdFromAuth = '';

      const { data: authUser, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        // Check if user already exists
        const { data: users } = await admin.auth.admin.listUsers();
        // biome-ignore lint/suspicious/noExplicitAny: User type definition
        const existingUser = users.users.find((u: any) => u.email === email);
        if (existingUser) {
          userIdFromAuth = existingUser.id;
        } else {
          throw new Error('Failed to create auth user: ' + authError.message);
        }
      } else {
        userIdFromAuth = authUser.user.id;
      }

      userId = userIdFromAuth;

      const resolvedName = player_name || username || 'Miner';

      // Look up referrer by referral_code if provided
      let referrerId: string | null = null;
      if (referral_code) {
        const { data: referrer } = await admin
          .from('profiles')
          .select('id')
          .eq('referral_code', referral_code.toUpperCase())
          .single();
        if (referrer && referrer.id !== userId) {
          referrerId = referrer.id;
        }
      }

      const { data: createdProfile, error: profileError } = await admin
        .from('profiles')
        .upsert({
          id: userId,
          player_name: resolvedName,
          wallet_address: walletAddress,
          referred_by: referrerId,
        })
        .select('id, player_name, is_admin, is_human_verified')
        .single();

      if (profileError || !createdProfile) {
        throw new Error('Failed to create profile');
      }

      profile = createdProfile;
    } else if (player_name && profile?.player_name !== player_name) {
      await admin
        .from('profiles')
        .update({ player_name })
        .eq('id', userId);
    }

    if (!userId) throw new Error('User ID not resolved');

    const session = await createSession(userId);

    return new Response(
      JSON.stringify({
        session: {
          token: session.token,
          user_id: userId,
          player_name: player_name || profile?.player_name || 'Miner',
          is_admin: Boolean(profile?.is_admin),
          is_human_verified: Boolean(profile?.is_human_verified),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('auth-complete error:', err);
    const clientInfo = extractClientInfo(req);
    logSecurityEvent({
      event_type: 'auth_failure',
      severity: 'warning',
      action: 'auth-complete',
      details: { error: (err as Error).message },
      ...clientInfo,
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
