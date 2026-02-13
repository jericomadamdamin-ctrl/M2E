import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireAdminOrKey } from '../_shared/supabase.ts';
import { getGameConfig } from '../_shared/mining.ts';

interface CashoutRequestBody {
  round_id: string;
  manual_pool_wld?: number;
  action?: 'recalculate' | 'process';
}

interface CashoutRound {
  id: string;
  status: string;
  payout_pool_wld?: number;
  total_diamonds?: number;
  revenue_window_start?: string;
  revenue_window_end?: string;
  revenue_wld?: number;
  round_date?: string;
  created_at?: string;
}

interface CashoutPayout {
  id: string;
  round_id: string;
  user_id: string;
  diamonds_burned: number;
  payout_wld: number;
  status: string;
}

interface CashoutRequest {
  id: string;
  payout_round_id: string;
  user_id: string;
  diamonds_submitted: number;
  status: string;
  created_at: string;
}

interface OilPurchase {
  amount_wld?: number;
  status?: string;
  created_at?: string;
}


Deno.serve(async (req: Request) => {
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

    const { round_id, manual_pool_wld, action } = await req.json() as CashoutRequestBody;
    if (!round_id) throw new Error('Missing round_id');
    console.log(`Processing cashout round: ${round_id}, Action: ${action || 'process'}, Manual Pool: ${manual_pool_wld}`);

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

    // --- MODE 1: RECALCULATE CLOSED ROUND ---
    if (action === 'recalculate') {
      if (round.status !== 'closed') {
        throw new Error(`Cannot recalculate round ${round_id} because it is ${round.status} (must be 'closed')`);
      }
      if (typeof manual_pool_wld !== 'number' || manual_pool_wld < 0) {
        throw new Error('Valid manual_pool_wld is required for recalculation');
      }

      console.log(`Recalculating round ${round_id} with new pool: ${manual_pool_wld}`);

      // 1. Update round pool
      const { error: updateRoundError } = await admin
        .from('cashout_rounds')
        .update({ payout_pool_wld: manual_pool_wld })
        .eq('id', round_id);

      if (updateRoundError) throw new Error('Failed to update round pool');

      // 2. Fetch all payouts
      const { data: payouts, error: payoutsError } = await admin
        .from('cashout_payouts')
        .select('*')
        .eq('round_id', round_id);

      if (payoutsError) throw new Error('Failed to fetch payouts for recalculation');

      // 3. Recalculate each user's share
      const totalDiamonds = Number(round.total_diamonds || 0);
      const newPool = manual_pool_wld;

      if (totalDiamonds <= 0) {
        console.warn('Total diamonds is 0, skipping recalculation of shares');
        return new Response(JSON.stringify({ ok: true, message: 'Pool updated, but no diamonds to distribute.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let remainingPool = newPool;
      const failures: string[] = [];

      for (let i = 0; i < payouts.length; i++) {
        const payoutRow = payouts[i];
        const share = Number(payoutRow.diamonds_burned) / totalDiamonds;
        let newPayout = newPool * share;

        if (i === payouts.length - 1) {
          newPayout = Math.max(0, remainingPool); // Handle dust
        }
        remainingPool = Math.max(0, remainingPool - newPayout);

        const { error: updatePayoutError } = await admin
          .from('cashout_payouts')
          .update({ payout_wld: newPayout })
          .eq('id', payoutRow.id);

        if (updatePayoutError) {
          console.error(`Failed to update payout ${payoutRow.id}:`, updatePayoutError);
          failures.push(payoutRow.id);
        }
      }

      if (failures.length > 0) throw new Error(`Recalculation partial failure. Failed items: ${failures.length}`);

      return new Response(JSON.stringify({
        ok: true,
        total_diamonds: totalDiamonds,
        payout_pool: newPool,
        message: `Recalculated ${payouts.length} payouts successfully`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- MODE 2: PROCESS OPEN ROUND (Default) ---
    if (round.status !== 'open') throw new Error(`Round ${round_id} is already ${round.status}`);

    // Calculate revenue window end time
    const revenueWindowEnd = new Date().toISOString();

    // Fetch total diamonds for this round
    const { data: pendingRequests, error: pendingRequestsError } = await admin
      .from('cashout_requests')
      .select('diamonds_submitted')
      .eq('payout_round_id', round_id)
      .eq('status', 'pending');

    if (pendingRequestsError) throw new Error('Failed to fetch cashout requests');

    const roundTotalDiamonds = (pendingRequests || []).reduce((sum: number, r: any) => sum + Number(r.diamonds_submitted || 0), 0);

    // Fetch diamond exchange rate from global settings
    const { data: exchangeRateSetting } = await admin
      .from('global_game_settings')
      .select('value')
      .eq('key', 'diamond_wld_exchange_rate')
      .single();

    const exchangeRate = Number(exchangeRateSetting?.value || 0.1);

    // Calculate pool: manual override takes precedence, otherwise use exchange rate
    let targetPool = 0;
    if (manual_pool_wld !== undefined && manual_pool_wld !== null) {
      targetPool = Number(manual_pool_wld);
      console.log(`Using manual pool override: ${targetPool} WLD`);
    } else {
      targetPool = roundTotalDiamonds * exchangeRate;
      console.log(`Calculated pool: ${roundTotalDiamonds} diamonds × ${exchangeRate} rate = ${targetPool} WLD`);
    }

    // Still track revenue for historical purposes
    let refreshedRevenueWld = 0;
    {
      const { data: revenueRows } = await admin
        .from('oil_purchases')
        .select('amount_wld')
        .eq('status', 'confirmed')
        .gte('created_at', round.revenue_window_start)
        .lte('created_at', revenueWindowEnd);
      refreshedRevenueWld = (revenueRows || []).reduce((sum: number, r: OilPurchase) => sum + Number(r.amount_wld || 0), 0);
    }

    const { data: refreshedRound, error: refreshedRoundError } = await admin
      .from('cashout_rounds')
      .update({
        revenue_window_end: revenueWindowEnd,
        revenue_wld: refreshedRevenueWld,
        payout_pool_wld: targetPool, // Use our resolved target
      })
      .eq('id', round_id)
      .eq('status', 'open')
      .select('*')
      .single();

    if (refreshedRoundError || !refreshedRound) {
      throw new Error('Failed to refresh cashout round totals');
    }

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

    const totalDiamonds = requests.reduce((sum: number, r: CashoutRequest) => sum + Number(r.diamonds_submitted || 0), 0);
    const payoutPool = Number(refreshedRound.payout_pool_wld || 0);
    console.log(`Total Diamonds: ${totalDiamonds}, Payout Pool: ${payoutPool} WLD`);

    let remainingPool = payoutPool;
    const failures: string[] = [];

    for (let i = 0; i < requests.length; i++) {
      const reqRow = requests[i] as CashoutRequest;
      const share = totalDiamonds > 0 ? Number(reqRow.diamonds_submitted) / totalDiamonds : 0;
      let payout = payoutPool * share;

      if (i === requests.length - 1) {
        payout = Math.max(0, remainingPool);
      }
      remainingPool = Math.max(0, remainingPool - payout);

      const { error: payoutError } = await admin
        .from('cashout_payouts')
        .upsert({
          round_id,
          user_id: reqRow.user_id,
          diamonds_burned: reqRow.diamonds_submitted,
          payout_wld: payout,
          status: 'pending',
        }, { onConflict: 'round_id,user_id' });

      if (payoutError) {
        console.error(`Failed to upsert payout for user ${reqRow.user_id}:`, payoutError);
        failures.push(`payout:${reqRow.id}`);
        continue;
      }

      const { error: updateRequestError } = await admin
        .from('cashout_requests')
        .update({ status: 'approved', processed_at: new Date().toISOString() })
        .eq('id', reqRow.id);

      if (updateRequestError) {
        console.error(`Failed to update request ${reqRow.id}:`, updateRequestError);
        failures.push(`request:${reqRow.id}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Round partially processed. Failed items: ${failures.length}`);
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
