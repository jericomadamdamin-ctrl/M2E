import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { createSession, getAdminClient } from '../_shared/supabase.ts';
import { verifySiweMessage } from 'https://esm.sh/@worldcoin/minikit-js@1.9.6';

interface CompleteRequest {
  payload: unknown;
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
      throw new Error('Missing payload');
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

    const validation = await verifySiweMessage(payload, nonce);
    if (!validation?.isValid) {
      throw new Error('SIWE validation failed');
    }

    // biome-ignore lint/suspicious/noExplicitAny: Payload structure varies
    const walletAddress = validation.address || (payload as any).address || (payload as any).walletAddress;
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

      // Check if profile exists (maybe we missed it in the first check due to race?)
      // We already checked profile by wallet address. 
      // If we are here, profile by wallet address was NULL.
      // But maybe profile by ID exists? (Unlikely unless wallet address changed? which is impossible for same user)
      // So valid to insert.

      const { data: createdProfile, error: profileError } = await admin
        .from('profiles')
        .upsert({ // Changed to upsert to be safe
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
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
