import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId } from '../_shared/supabase.ts';
import { getGameConfig, processMining } from '../_shared/mining.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const userId = await requireUserId(req);

    const config = await getGameConfig();
    // Ensure state exists and process mining before returning state
    const { state, machines } = await processMining(userId, { config });

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('player_name, is_admin, is_human_verified, wallet_address')
      .eq('id', userId)
      .single();

    return new Response(JSON.stringify({ ok: true, config, state, machines, profile }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
