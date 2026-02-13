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
    // Fetch total diamonds for this round (pending + approved to handle recovery/resume)
    const { data: requestSums, error: pendingRequestsError } = await admin
      .from('cashout_requests')
      .select('diamonds_submitted, status')
      .eq('payout_round_id', round_id)
      .in('status', ['pending', 'approved']);

    if (pendingRequestsError) throw new Error('Failed to fetch cashout requests sum');

    const roundTotalDiamonds = (requestSums || []).reduce((sum: number, r: any) => sum + Number(r.diamonds_submitted || 0), 0);

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

    // --- ROBUST PROCESS LOGIC ---
    // 1. Fetch Requests & Status
    // Fetch count first to be safe
    const { count, error: countError } = await admin
      .from('cashout_requests')
      .select('*', { count: 'exact', head: true })
      .eq('payout_round_id', round_id);

    if (countError) throw new Error('Failed to count requests');

    // Fetch all requests (up to a reasonable safe limit for an edge function, e.g. 5000)
    // If count > 5000, we need pagination, but for now let's just bump the limit from default 1000.
    const { data: allRequests, error: fetchError } = await admin
      .from('cashout_requests')
      .select('id, user_id, diamonds_submitted, status')
      .eq('payout_round_id', round_id)
      .range(0, (count || 1000) + 100); // Fetch all including buffer

    if (fetchError) throw new Error('Failed to fetch requests');

    if (count && (allRequests || []).length < count) {
      throw new Error(`Data integrity error: Expected ${count} requests but fetched ${allRequests?.length}. Aborting to prevent data loss.`);
    }

    // Type checking for allRequests
    const pendingRequestsList = (allRequests || []).filter((r: any) => r.status === 'pending');
    const approvedRequestsList = (allRequests || []).filter((r: any) => r.status === 'approved');

    // 2. State Resolution
    let requestsToProcess: any[] = [];
    let isRecovery = false;

    if (pendingRequestsList.length > 0) {
      // Normal case: process pending
      requestsToProcess = pendingRequestsList;
    } else if (approvedRequestsList.length > 0 && round.status === 'open') {
      // Recovery case: Requests already approved but round stuck open
      console.warn(`Round ${round_id} is OPEN but has ${approvedRequestsList.length} approved requests. Recovery mode.`);
      isRecovery = true;
      requestsToProcess = approvedRequestsList;
    } else {
      // Ghost Round (0 total) or already done
      if ((allRequests || []).length === 0) {
        console.warn('Ghost round detected (0 requests). Closing.');
        const { error: closeError } = await admin.from('cashout_rounds').update({
          status: 'closed',
          payout_pool_wld: 0,
          total_diamonds: 0,
          revenue_window_end: revenueWindowEnd,
          revenue_wld: refreshedRevenueWld
        }).eq('id', round_id);
        if (closeError) throw closeError;
        return new Response(JSON.stringify({ ok: true, message: 'Ghost round closed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw new Error('No pending requests found (and no approved requests to recover).');
    }

    // 3. Calculation
    const totalDiamonds = requestsToProcess.reduce((sum: number, r: any) => sum + Number(r.diamonds_submitted || 0), 0);
    const payoutPool = Number(refreshedRound.payout_pool_wld || 0);

    if (Number.isNaN(payoutPool) || payoutPool < 0) throw new Error('Invalid payout pool calculated');

    console.log(`Processing: ${requestsToProcess.length} requests, ${totalDiamonds} diamonds, ${payoutPool} WLD. Recovery: ${isRecovery}`);

    // 4. Batch Operations (Bulk Upsert/Update)
    const payouts: CashoutPayout[] = [];
    let remainingPool = payoutPool;

    for (let i = 0; i < requestsToProcess.length; i++) {
      const req = requestsToProcess[i];
      const share = totalDiamonds > 0 ? Number(req.diamonds_submitted) / totalDiamonds : 0;
      let payout = payoutPool * share;

      if (i === requestsToProcess.length - 1) {
        payout = Math.max(0, remainingPool);
      }
      remainingPool = Math.max(0, remainingPool - payout);

      payouts.push({
        round_id,
        user_id: req.user_id,
        diamonds_burned: req.diamonds_submitted,
        payout_wld: payout,
        status: 'pending' // Initial status of payout
      } as any);
    }

    // Check total payout sanity
    const totalCheck = payouts.reduce((s, p) => s + p.payout_wld, 0);
    if (Math.abs(totalCheck - payoutPool) > 0.0001) {
      console.warn(`Math mismatch: Total distributed ${totalCheck} != Pool ${payoutPool}`);
    }

    // A. Upsert Payouts
    const { error: upsertError } = await admin
      .from('cashout_payouts')
      .upsert(payouts, { onConflict: 'round_id,user_id' });

    if (upsertError) throw new Error(`Failed to insert payouts: ${upsertError.message}`);

    // B. Approve Requests (only if not recovery)
    if (!isRecovery) {
      const reqIds = requestsToProcess.map((r: any) => r.id);
      const { error: reqUpdateError } = await admin
        .from('cashout_requests')
        .update({ status: 'approved', processed_at: new Date().toISOString() })
        .in('id', reqIds);

      if (reqUpdateError) throw new Error(`Failed to update requests: ${reqUpdateError.message}`);
    }

    // 5. Atomic Close
    const { error: finalCloseError } = await admin
      .from('cashout_rounds')
      .update({
        status: 'closed',
        total_diamonds: totalDiamonds,
        payout_pool_wld: payoutPool
      })
      .eq('id', round_id)
      .eq('status', 'open');

    if (finalCloseError) throw new Error(`Failed to close round: ${finalCloseError.message}`);

    // Return Success
    return new Response(JSON.stringify({
      ok: true,
      total_diamonds: totalDiamonds,
      payout_pool: payoutPool,
      message: `Processed ${requestsToProcess.length} requests successfully.`
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
