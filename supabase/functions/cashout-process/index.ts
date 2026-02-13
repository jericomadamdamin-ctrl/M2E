import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireAdminOrKey } from '../_shared/supabase.ts';

interface CashoutRequestBody {
  round_id: string;
  manual_pool_wld?: number;
  action?: 'recalculate' | 'process';
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
      throw new Error(`Round not found: ${round_id}`);
    }

    // ─── MODE 1: RECALCULATE (works on CLOSED or OPEN rounds) ───
    if (action === 'recalculate') {
      if (typeof manual_pool_wld !== 'number' || manual_pool_wld < 0) {
        throw new Error('Valid manual_pool_wld is required for recalculation');
      }

      console.log(`Recalculating round ${round_id} (status: ${round.status}) with new pool: ${manual_pool_wld}`);

      // Update round pool
      const { error: updateRoundError } = await admin
        .from('cashout_rounds')
        .update({ payout_pool_wld: manual_pool_wld })
        .eq('id', round_id);
      if (updateRoundError) throw new Error('Failed to update round pool');

      // Fetch all payouts
      const { data: payouts, error: payoutsError } = await admin
        .from('cashout_payouts')
        .select('*')
        .eq('round_id', round_id);
      if (payoutsError) throw new Error('Failed to fetch payouts for recalculation');

      if (!payouts || payouts.length === 0) {
        return jsonResponse({ ok: true, message: 'Pool updated, but no payouts to recalculate.' });
      }

      // Recalculate each user's share
      const totalDiamonds = Number(round.total_diamonds || 0);
      if (totalDiamonds <= 0) {
        return jsonResponse({ ok: true, message: 'Pool updated, but no diamonds to distribute.' });
      }

      let remainingPool = manual_pool_wld;
      const failures: string[] = [];

      for (let i = 0; i < payouts.length; i++) {
        const payoutRow = payouts[i];
        const share = Number(payoutRow.diamonds_burned) / totalDiamonds;
        let newPayout = manual_pool_wld * share;

        if (i === payouts.length - 1) {
          newPayout = Math.max(0, remainingPool);
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

      return jsonResponse({
        ok: true,
        total_diamonds: totalDiamonds,
        payout_pool: manual_pool_wld,
        message: `Recalculated ${payouts.length} payouts successfully`
      });
    }

    // ─── MODE 2: PROCESS OPEN ROUND (Finalize & Distribute) ───
    if (round.status !== 'open') throw new Error(`Round ${round_id} is already ${round.status}`);

    // Revenue tracking
    const revenueWindowEnd = new Date().toISOString();
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

    // Fetch ALL requests for this round
    const { data: allRequests, error: fetchError } = await admin
      .from('cashout_requests')
      .select('id, user_id, diamonds_submitted, status')
      .eq('payout_round_id', round_id);

    if (fetchError) throw new Error('Failed to fetch requests');

    const pendingList = (allRequests || []).filter((r: any) => r.status === 'pending');
    const approvedList = (allRequests || []).filter((r: any) => r.status === 'approved');

    // ─── STALE ROUND HANDLING ───
    // If there are NO pending and NO approved requests, this round is stale.
    // Close it gracefully instead of erroring.
    if (pendingList.length === 0 && approvedList.length === 0) {
      const totalReqs = (allRequests || []).length;
      const statuses = (allRequests || []).map((r: any) => r.status);
      const statusSummary = [...new Set(statuses)].join(', ');

      console.warn(`Stale round detected: ${round_id}. ${totalReqs} requests, all with status: [${statusSummary}]. Auto-closing.`);

      const { error: closeError } = await admin.from('cashout_rounds').update({
        status: 'closed',
        payout_pool_wld: round.payout_pool_wld || 0,
        total_diamonds: round.total_diamonds || 0,
        revenue_window_end: revenueWindowEnd,
        revenue_wld: refreshedRevenueWld,
      }).eq('id', round_id);

      if (closeError) throw closeError;

      return jsonResponse({
        ok: true,
        total_diamonds: round.total_diamonds || 0,
        payout_pool: round.payout_pool_wld || 0,
        message: `Stale round closed. ${totalReqs} request(s) were already finalized (${statusSummary}).`
      });
    }

    // ─── NORMAL PROCESSING ───
    let requestsToProcess: any[];
    let isRecovery = false;

    if (pendingList.length > 0) {
      requestsToProcess = pendingList;
    } else {
      // Recovery: approved requests but round still open
      console.warn(`Recovery mode: ${approvedList.length} approved requests in open round.`);
      isRecovery = true;
      requestsToProcess = approvedList;
    }

    // Calculate totals
    const totalDiamonds = requestsToProcess.reduce((sum: number, r: any) => sum + Number(r.diamonds_submitted || 0), 0);

    // Exchange rate
    const { data: exchangeRateSetting } = await admin
      .from('global_game_settings')
      .select('value')
      .eq('key', 'diamond_wld_exchange_rate')
      .single();
    const exchangeRate = Number(exchangeRateSetting?.value || 0.1);

    // Calculate pool
    let targetPool: number;
    if (manual_pool_wld !== undefined && manual_pool_wld !== null) {
      targetPool = Number(manual_pool_wld);
      console.log(`Manual pool override: ${targetPool} WLD`);
    } else {
      targetPool = totalDiamonds * exchangeRate;
      console.log(`Calculated pool: ${totalDiamonds} × ${exchangeRate} = ${targetPool} WLD`);
    }

    // Update round with calculated values
    const { data: refreshedRound, error: refreshedRoundError } = await admin
      .from('cashout_rounds')
      .update({
        revenue_window_end: revenueWindowEnd,
        revenue_wld: refreshedRevenueWld,
        payout_pool_wld: targetPool,
        total_diamonds: totalDiamonds,
      })
      .eq('id', round_id)
      .eq('status', 'open')
      .select('*')
      .single();

    if (refreshedRoundError || !refreshedRound) {
      throw new Error('Failed to refresh cashout round totals');
    }

    // Build payouts
    const payouts: any[] = [];
    let remainingPool = targetPool;

    for (let i = 0; i < requestsToProcess.length; i++) {
      const req = requestsToProcess[i];
      const share = totalDiamonds > 0 ? Number(req.diamonds_submitted) / totalDiamonds : 0;
      let payout = targetPool * share;

      if (i === requestsToProcess.length - 1) {
        payout = Math.max(0, remainingPool);
      }
      remainingPool = Math.max(0, remainingPool - payout);

      payouts.push({
        round_id,
        user_id: req.user_id,
        diamonds_burned: req.diamonds_submitted,
        payout_wld: payout,
        status: 'pending',
      });
    }

    // Upsert payouts
    const { error: upsertError } = await admin
      .from('cashout_payouts')
      .upsert(payouts, { onConflict: 'round_id,user_id' });
    if (upsertError) throw new Error(`Failed to insert payouts: ${upsertError.message}`);

    // Approve requests (skip if recovery)
    if (!isRecovery) {
      const reqIds = requestsToProcess.map((r: any) => r.id);
      const { error: reqUpdateError } = await admin
        .from('cashout_requests')
        .update({ status: 'approved', processed_at: new Date().toISOString() })
        .in('id', reqIds);
      if (reqUpdateError) throw new Error(`Failed to update requests: ${reqUpdateError.message}`);
    }

    // Close the round
    const { error: finalCloseError } = await admin
      .from('cashout_rounds')
      .update({
        status: 'closed',
        total_diamonds: totalDiamonds,
        payout_pool_wld: targetPool,
      })
      .eq('id', round_id)
      .eq('status', 'open');
    if (finalCloseError) throw new Error(`Failed to close round: ${finalCloseError.message}`);

    return jsonResponse({
      ok: true,
      total_diamonds: totalDiamonds,
      payout_pool: targetPool,
      message: `Processed ${requestsToProcess.length} requests successfully.`
    });

  } catch (err) {
    console.error('Cashout process error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
