import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireHuman } from '../_shared/supabase.ts';
import { logSecurityEvent, extractClientInfo, isFeatureEnabled } from '../_shared/security.ts';

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

    // Check if auto-exchange feature is enabled
    const featureEnabled = await isFeatureEnabled('auto_exchange_enabled');
    if (!featureEnabled) {
      throw new Error('Auto-exchange feature not enabled');
    }

    const { diamondAmount, slippageTolerance } = await req.json();
    const diamonds = Math.floor(Number(diamondAmount || 0));

    if (diamonds <= 0 || isNaN(diamonds) || !Number.isFinite(diamonds)) {
      throw new Error('Invalid diamond amount');
    }

    if (diamonds > 1000000) {
      throw new Error('Maximum exchange amount is 1,000,000 diamonds');
    }

    // Validate slippage (0.1% to 5%)
    if (!slippageTolerance || slippageTolerance < 0.1 || slippageTolerance > 5.0) {
      throw new Error('Slippage tolerance must be between 0.1% and 5%');
    }

    const admin = getAdminClient();

    // Check user's auto-exchange config
    const { data: config, error: configError } = await admin
      .from('auto_exchange_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!config?.enabled) {
      throw new Error('Auto-exchange not enabled for this user');
    }

    // Check player diamond balance
    const { data: playerState } = await admin
      .from('player_state')
      .select('diamond_balance')
      .eq('user_id', userId)
      .single();

    const currentDiamonds = Number(playerState?.diamond_balance || 0);
    if (currentDiamonds < diamonds) {
      throw new Error('Insufficient diamonds');
    }

    // Get diamond-to-WLD exchange rate
    const { data: rateConfig } = await admin
      .from('game_config')
      .select('value')
      .eq('key', 'diamond_to_wld_rate')
      .maybeSingle();

    const exchangeRate = Number(rateConfig?.value?.rate || 0.001);
    const wldTarget = diamonds * exchangeRate;

    // Create auto-exchange request (diamonds NOT locked yet - handled during execution)
    const { data: request, error: createError } = await admin
      .from('auto_exchange_requests')
      .insert({
        user_id: userId,
        diamond_amount: diamonds,
        wld_target_amount: wldTarget,
        slippage_tolerance: slippageTolerance,
        status: 'pending',
        retry_count: 0,
      })
      .select()
      .single();

    if (createError) {
      throw new Error('Failed to create exchange request');
    }

    // Log security event
    const clientInfo = extractClientInfo(req);
    await logSecurityEvent({
      user_id: userId,
      action: 'auto_exchange_requested',
      details: {
        request_id: request.id,
        diamond_amount: diamonds,
        wld_target: wldTarget,
      },
      ip_address: clientInfo.ip,
      user_agent: clientInfo.userAgent,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        request_id: request.id,
        diamond_amount: diamonds,
        wld_target_amount: wldTarget,
        slippage_tolerance: slippageTolerance,
        status: 'pending',
      }),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[v0] Auto-exchange request error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
