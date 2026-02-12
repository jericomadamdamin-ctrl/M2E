import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireHuman } from '../_shared/supabase.ts';
import { getGameConfig, ensurePlayerState, processMining } from '../_shared/mining.ts';
import { logSecurityEvent, extractClientInfo, isFeatureEnabled } from '../_shared/security.ts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
    await requireHuman(userId);
    const { diamonds } = await req.json();
    const requestedDiamonds = Math.floor(Number(diamonds || 0));

    if (requestedDiamonds <= 0 || isNaN(requestedDiamonds) || !Number.isFinite(requestedDiamonds)) {
      throw new Error('Invalid diamond amount');
    }

    if (requestedDiamonds > 1000000) {
      throw new Error('Maximum payout request is 1,000,000 diamonds');
    }

    // Phase 0: Feature flag check
    const cashoutEnabled = await isFeatureEnabled('cashout_enabled');
    if (!cashoutEnabled) {
      throw new Error('Cashout temporarily disabled');
    }

    const config = await getGameConfig();
    if (!config.cashout?.enabled) {
      throw new Error('Cashout disabled');
    }

    const minRequired = Number(config.cashout.minimum_diamonds_required || 0);
    if (requestedDiamonds < minRequired) {
      throw new Error(`Minimum ${minRequired} diamonds required`);
    }

    await ensurePlayerState(userId);
    await processMining(userId);

    const admin = getAdminClient();
    const { data: state } = await admin
      .from('player_state')
      .select('diamond_balance')
      .eq('user_id', userId)
      .single();

    const currentDiamonds = Number(state?.diamond_balance || 0);
    if (currentDiamonds < requestedDiamonds) {
      throw new Error('Insufficient diamonds');
    }

    const cooldownDays = Number(config.cashout.cooldown_days || 0);
    const cooldownMs = cooldownDays * MS_PER_DAY;
    const since = new Date(Date.now() - cooldownMs).toISOString();

    const { data: recentRequests } = await admin
      .from('cashout_requests')
      .select('id, requested_at')
      .eq('user_id', userId)
      .gte('requested_at', since);

    if (recentRequests && recentRequests.length > 0) {
      throw new Error('Cashout cooldown active');
    }

    const daySince = new Date(Date.now() - MS_PER_DAY).toISOString();
    const { data: dailyRequests } = await admin
      .from('cashout_requests')
      .select('id')
      .eq('user_id', userId)
      .gte('requested_at', daySince);

    if (dailyRequests && dailyRequests.length >= (config.anti_abuse?.rate_limits?.cashout_requests_per_day ?? 1)) {
      throw new Error('Daily cashout limit reached');
    }

    const now = new Date();
    const roundDate = now.toISOString().slice(0, 10);

    let { data: round } = await admin
      .from('cashout_rounds')
      .select('*')
      .eq('round_date', roundDate)
      .single();

    if (!round) {
      const revenueWindowStart = new Date(Date.now() - MS_PER_DAY).toISOString();
      const revenueWindowEnd = now.toISOString();

      const { data: createdRound } = await admin
        .from('cashout_rounds')
        .insert({
          round_date: roundDate,
          revenue_window_start: revenueWindowStart,
          revenue_window_end: revenueWindowEnd,
          revenue_wld: 0,
          payout_pool_wld: 0,
          total_diamonds: 0,
          status: 'open',
        })
        .select('*')
        .single();

      round = createdRound;
    }

    if (!round) throw new Error('Failed to open cashout round');
    if (round.status !== 'open') throw new Error('Cashout round is closed');

    // Keep round pool synced with latest window revenue so users see fairer variable payouts.
    const revenueWindowStart = round.revenue_window_start || new Date(Date.now() - MS_PER_DAY).toISOString();
    const revenueWindowEnd = now.toISOString();
    const { data: revenueRows } = await admin
      .from('oil_purchases')
      .select('amount_wld')
      .eq('status', 'confirmed')
      .gte('created_at', revenueWindowStart)
      .lte('created_at', revenueWindowEnd);

    const revenueWld = (revenueRows || []).reduce((sum, r: { amount_wld: number }) => sum + Number(r.amount_wld || 0), 0);
    const payoutPercentage = Number(config.treasury.payout_percentage || 0);
    const payoutPool = revenueWld * payoutPercentage;

    const { data: refreshedRound } = await admin
      .from('cashout_rounds')
      .update({
        revenue_window_start: revenueWindowStart,
        revenue_window_end: revenueWindowEnd,
        revenue_wld: revenueWld,
        payout_pool_wld: payoutPool,
      })
      .eq('id', round.id)
      .select('*')
      .single();

    if (refreshedRound) {
      round = refreshedRound;
    }

    // Burn diamonds on request
    const newDiamondBalance = currentDiamonds - requestedDiamonds;

    const { data: requestRow, error } = await admin
      .from('cashout_requests')
      .insert({
        user_id: userId,
        diamonds_submitted: requestedDiamonds,
        payout_round_id: round.id,
        status: 'pending',
      })
      .select('*')
      .single();

    if (error || !requestRow) throw new Error('Failed to create cashout request');

    await admin
      .from('player_state')
      .update({ diamond_balance: newDiamondBalance })
      .eq('user_id', userId);

    await admin
      .from('cashout_rounds')
      .update({ total_diamonds: Number(round.total_diamonds || 0) + requestedDiamonds })
      .eq('id', round.id);

    // Log successful cashout request
    logSecurityEvent({
      event_type: 'cashout_request',
      user_id: userId,
      severity: 'info',
      action: 'cashout_submit',
      details: { diamonds: requestedDiamonds, round_id: round.id },
    });

    return new Response(JSON.stringify({ ok: true, request: requestRow, round }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const clientInfo = extractClientInfo(req);
    logSecurityEvent({
      event_type: 'validation_failed',
      severity: 'warning',
      action: 'cashout_request',
      details: { error: (err as Error).message },
      ...clientInfo,
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
