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

    const walletAddress = validation.address || payload.address || payload.walletAddress;
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

      const { data: authUser, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError || !authUser?.user?.id) {
        throw new Error('Failed to create auth user');
      }

      userId = authUser.user.id;

      const resolvedName = player_name || username || 'Miner';

      const { data: createdProfile, error: profileError } = await admin
        .from('profiles')
        .insert({
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
