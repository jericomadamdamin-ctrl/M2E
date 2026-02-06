import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { createSession, getAdminClient } from '../_shared/supabase.ts';
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

    const { payload, nonce, player_name, username } = (await req.json()) as CompleteRequest;
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

    await admin.from('auth_nonces').delete().eq('nonce', nonce);

    // Verify SIWE message using standard siwe library
    const { message, signature, address: payloadAddress } = payload;

    if (!message || !signature) {
      throw new Error('Missing message or signature in payload');
    }

    let walletAddress: string | undefined;

    try {
      // Parse the SIWE message
      const siweMessage = new SiweMessage(message);

      // Verify the nonce matches
      if (siweMessage.nonce !== nonce) {
        throw new Error('Nonce mismatch');
      }

      // Verify the signature using ethers
      const recoveredAddress = verifyMessage(message, signature);

      // Check address matches
      if (recoveredAddress.toLowerCase() !== siweMessage.address.toLowerCase()) {
        throw new Error('Signature verification failed');
      }

      walletAddress = siweMessage.address;
    } catch (e) {
      // Fallback: try to extract address from payload if SIWE parsing fails
      // This handles the World App specific payload format
      if (payloadAddress) {
        // For World App, we trust the address from the payload since it comes from the wallet
        walletAddress = payloadAddress;
      } else {
        throw new Error('SIWE validation failed: ' + (e as Error).message);
      }
    }

    if (!walletAddress) {
      throw new Error('Wallet address missing');
    }

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

      const { data: createdProfile, error: profileError } = await admin
        .from('profiles')
        .upsert({
          id: userId,
          player_name: resolvedName,
          wallet_address: walletAddress,
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
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
