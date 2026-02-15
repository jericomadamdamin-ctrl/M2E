import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireHuman } from '../_shared/supabase.ts';
import { logSecurityEvent, extractClientInfo } from '../_shared/security.ts';

/**
 * Manage user auto-exchange configuration
 * GET: Retrieve current config
 * POST/PUT: Update config
 */
Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const userId = await requireUserId(req);
    await requireHuman(userId);

    const admin = getAdminClient();
    const clientInfo = extractClientInfo(req);

    if (req.method === 'GET') {
      // Get current auto-exchange config
      const { data: config, error } = await admin
        .from('auto_exchange_config')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw new Error('Failed to fetch config');
      }

      return new Response(
        JSON.stringify({
          ok: true,
          config: config || {
            user_id: userId,
            enabled: false,
            slippage_tolerance: 1.0,
            min_wld_amount: 10,
            auto_retry: true,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else if (req.method === 'POST' || req.method === 'PUT') {
      // Update auto-exchange config
      const { enabled, slippageTolerance, minWldAmount, autoRetry } = await req.json();

      // Validate inputs
      if (typeof enabled !== 'boolean') {
        throw new Error('enabled must be a boolean');
      }

      if (slippageTolerance !== undefined) {
        if (slippageTolerance < 0.1 || slippageTolerance > 5.0) {
          throw new Error('Slippage tolerance must be between 0.1% and 5%');
        }
      }

      if (minWldAmount !== undefined && minWldAmount !== null) {
        if (minWldAmount <= 0) {
          throw new Error('Min WLD amount must be positive');
        }
      }

      // Upsert config
      const { data: config, error: upsertError } = await admin
        .from('auto_exchange_config')
        .upsert({
          user_id: userId,
          enabled,
          slippage_tolerance: slippageTolerance ?? 1.0,
          min_wld_amount: minWldAmount ?? 10,
          auto_retry: autoRetry !== false,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (upsertError) {
        throw new Error('Failed to update config');
      }

      // Log security event
      await logSecurityEvent({
        user_id: userId,
        action: 'auto_exchange_config_updated',
        details: {
          enabled,
          slippage_tolerance: slippageTolerance ?? 1.0,
          auto_retry: autoRetry !== false,
        },
        ip_address: clientInfo.ip,
        user_agent: clientInfo.userAgent,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Config updated successfully',
          config,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      throw new Error('Method not allowed');
    }
  } catch (error) {
    console.error('[v0] Auto-exchange config error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
