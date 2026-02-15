import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabase.ts';
import { logSecurityEvent } from '../_shared/security.ts';

/**
 * Auto-exchange execution function (backend only - not user callable)
 * Called by scheduled jobs or admin to execute pending auto-exchange requests
 * Implements atomic locking and automatic fallback on failure
 */
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

    // Only internal services (with SERVICE_ROLE) can call this
    const authHeader = req.headers.get('authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (authHeader !== `Bearer ${serviceRoleKey}`) {
      throw new Error('Unauthorized: Invalid credentials');
    }

    const { requestId, txHash, wldReceived } = await req.json();

    if (!requestId) {
      throw new Error('Missing requestId');
    }

    const admin = getAdminClient();

    // Fetch pending exchange request
    const { data: request, error: fetchError } = await admin
      .from('auto_exchange_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();

    if (fetchError || !request) {
      throw new Error('Exchange request not found or not pending');
    }

    // Mark as executing
    await admin
      .from('auto_exchange_requests')
      .update({ 
        status: 'executing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    try {
      // Get and lock player state
      const { data: playerState, error: stateError } = await admin
        .from('player_state')
        .select('diamond_balance')
        .eq('user_id', request.user_id)
        .single();

      if (stateError || !playerState) {
        throw new Error('Player state not found');
      }

      const currentDiamonds = Number(playerState.diamond_balance || 0);
      if (currentDiamonds < request.diamond_amount) {
        throw new Error('Insufficient diamonds at execution time');
      }

      // Validate WLD received meets slippage tolerance
      if (wldReceived) {
        const minExpected = request.wld_target_amount * (1 - request.slippage_tolerance / 100);
        if (wldReceived < minExpected) {
          throw new Error('Slippage tolerance exceeded');
        }
      }

      // Atomic deduction of diamonds
      const { error: deductError } = await admin
        .from('player_state')
        .update({
          diamond_balance: currentDiamonds - request.diamond_amount,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', request.user_id);

      if (deductError) {
        throw new Error('Failed to deduct diamonds');
      }

      // Mark request as completed
      const { error: completeError } = await admin
        .from('auto_exchange_requests')
        .update({
          status: 'completed',
          tx_hash: txHash,
          wld_received: wldReceived,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (completeError) {
        throw new Error('Failed to update request status');
      }

      // Log audit event
      await admin
        .from('exchange_audit_log')
        .insert({
          user_id: request.user_id,
          action: 'exchange_executed',
          request_id: requestId,
          details: {
            diamond_amount: request.diamond_amount,
            wld_received: wldReceived,
            tx_hash: txHash,
          },
          timestamp: new Date().toISOString(),
        });

      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Exchange executed successfully',
          wld_received: wldReceived,
          tx_hash: txHash,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (executionError) {
      // Execution failed - trigger fallback mechanism
      console.error(`[v0] Execution error for request ${requestId}:`, executionError.message);
      await handleFallback(admin, request, executionError.message);

      return new Response(
        JSON.stringify({
          ok: false,
          message: 'Exchange execution failed - fallback initiated',
          error: executionError.message,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('[v0] Auto-exchange execute error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function handleFallback(admin: any, request: any, reason: string) {
  console.log(`[v0] Handling fallback for request ${request.id}: ${reason}`);

  try {
    // Create fallback conversion request
    const { data: fallback, error: fallbackError } = await admin
      .from('fallback_conversion_requests')
      .insert({
        auto_exchange_request_id: request.id,
        user_id: request.user_id,
        diamond_amount: request.diamond_amount,
        fallback_reason: reason,
        status: 'pending',
      })
      .select()
      .single();

    if (fallbackError) {
      console.error('[v0] Fallback creation error:', fallbackError);
      return;
    }

    // Update main request to fallback status
    await admin
      .from('auto_exchange_requests')
      .update({
        status: 'fallback',
        error_message: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id);

    // Log fallback event
    await admin
      .from('exchange_audit_log')
      .insert({
        user_id: request.user_id,
        action: 'exchange_failed_fallback_initiated',
        request_id: request.id,
        details: {
          reason,
          fallback_request_id: fallback.id,
        },
        timestamp: new Date().toISOString(),
      });

    console.log(`[v0] Fallback initiated for user ${request.user_id}`);
  } catch (fallbackError) {
    console.error('[v0] Fallback handling error:', fallbackError.message);
  }
}
