import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireAdmin, requireAdminOrKey } from '../_shared/supabase.ts';

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
    await requireAdminOrKey(req, userId);

    const { round_id } = await req.json();
    if (!round_id) throw new Error('Missing round_id');
    console.log(`Processing cashout round: ${round_id}`);

    const admin = getAdminClient();
    const { data: round, error: roundError } = await admin
      .from('cashout_rounds')
      .select('*')
      .eq('id', round_id)
      .single();

    if (roundError || !round) {
      console.error('Round not found:', roundError);
      throw new Error(`Round not found: ${round_id}`);
    }
    if (round.status !== 'open') throw new Error(`Round ${round_id} is already ${round.status}`);

    const { data: requests, error: requestsError } = await admin
      .from('cashout_requests')
      .select('*')
      .eq('payout_round_id', round_id)
      .eq('status', 'pending');

    if (requestsError) {
      console.error('Failed to fetch requests:', requestsError);
      throw new Error('Failed to fetch cashout requests');
    }

    if (!requests || requests.length === 0) {
      console.warn('No pending requests for round:', round_id);
      throw new Error('No pending requests found for this round');
    }

    console.log(`Found ${requests.length} requests to process`);

    const totalDiamonds = requests.reduce((sum: number, r: any) => sum + Number(r.diamonds_submitted || 0), 0);
    const payoutPool = Number(round.payout_pool_wld || 0);
    console.log(`Total Diamonds: ${totalDiamonds}, Payout Pool: ${payoutPool} WLD`);

    let remainingPool = payoutPool;

    for (let i = 0; i < requests.length; i++) {
      const reqRow = requests[i] as any;
      const share = totalDiamonds > 0 ? Number(reqRow.diamonds_submitted) / totalDiamonds : 0;
      let payout = payoutPool * share;

      if (i === requests.length - 1) {
        payout = Math.max(0, remainingPool);
      }
      remainingPool = Math.max(0, remainingPool - payout);

      const { error: payoutError } = await admin
        .from('cashout_payouts')
        .insert({
          round_id,
          user_id: reqRow.user_id,
          diamonds_burned: reqRow.diamonds_submitted,
          payout_wld: payout,
          status: 'pending',
        });

      if (payoutError) {
        console.error(`Failed to insert payout for user ${reqRow.user_id}:`, payoutError);
        throw new Error(`Failed to create payout record for user ${reqRow.user_id}`);
      }

      const { error: updateRequestError } = await admin
        .from('cashout_requests')
        .update({ status: 'approved', processed_at: new Date().toISOString() })
        .eq('id', reqRow.id);

      if (updateRequestError) {
        console.error(`Failed to update request ${reqRow.id}:`, updateRequestError);
      }
    }

    const { error: updateRoundError } = await admin
      .from('cashout_rounds')
      .update({ status: 'closed', total_diamonds: totalDiamonds })
      .eq('id', round_id);

    if (updateRoundError) {
      console.error('Failed to close round:', updateRoundError);
      throw new Error('Failed to close the cashout round');
    }

    console.log(`Successfully processed round ${round_id}`);

    return new Response(JSON.stringify({
      ok: true,
      total_diamonds: totalDiamonds,
      payout_pool: payoutPool,
      message: `Processed ${requests.length} requests successfully`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Cashout process error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
