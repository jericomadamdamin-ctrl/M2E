import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireAdmin, requireAdminKey } from '../_shared/supabase.ts';

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

    const userId = await requireUserId(req);
    await requireAdmin(userId);
    requireAdminKey(req);

    const { round_id } = await req.json();
    if (!round_id) throw new Error('Missing round_id');

    const admin = getAdminClient();
    const { data: round } = await admin
      .from('cashout_rounds')
      .select('*')
      .eq('id', round_id)
      .single();

    if (!round) throw new Error('Round not found');
    if (round.status !== 'open') throw new Error('Round already processed');

    const { data: requests } = await admin
      .from('cashout_requests')
      .select('*')
      .eq('payout_round_id', round_id)
      .eq('status', 'pending');

    if (!requests || requests.length === 0) {
      throw new Error('No requests to process');
    }

    const totalDiamonds = requests.reduce((sum, r: { diamonds_submitted: number }) => sum + Number(r.diamonds_submitted || 0), 0);
    const payoutPool = Number(round.payout_pool_wld || 0);

    let remainingPool = payoutPool;

    for (let i = 0; i < requests.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reqRow = requests[i] as any;
      const share = totalDiamonds > 0 ? Number(reqRow.diamonds_submitted) / totalDiamonds : 0;
      let payout = payoutPool * share;
      if (i === requests.length - 1) {
        payout = Math.max(0, remainingPool);
      }
      remainingPool = Math.max(0, remainingPool - payout);

      await admin
        .from('cashout_payouts')
        .insert({
          round_id,
          user_id: reqRow.user_id,
          diamonds_burned: reqRow.diamonds_submitted,
          payout_wld: payout,
          status: 'pending',
        });

      await admin
        .from('cashout_requests')
        .update({ status: 'approved', processed_at: new Date().toISOString() })
        .eq('id', reqRow.id);
    }

    await admin
      .from('cashout_rounds')
      .update({ status: 'closed', total_diamonds: totalDiamonds })
      .eq('id', round_id);

    return new Response(JSON.stringify({ ok: true, total_diamonds: totalDiamonds, payout_pool: payoutPool }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
