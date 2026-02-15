import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId } from '../_shared/supabase.ts';

/**
 * Check auto-exchange request status and history
 */
Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = await requireUserId(req);
    const url = new URL(req.url);
    const requestId = url.searchParams.get('requestId');

    const admin = getAdminClient();

    if (requestId) {
      // Get specific request status with fallback info
      const { data: request, error } = await admin
        .from('auto_exchange_requests')
        .select('*')
        .eq('id', requestId)
        .eq('user_id', userId)
        .single();

      if (error || !request) {
        throw new Error('Request not found');
      }

      // Get related fallback if exists
      let fallback = null;
      if (request.status === 'fallback' || request.status === 'failed') {
        const { data: fallbackData } = await admin
          .from('fallback_conversion_requests')
          .select('*')
          .eq('auto_exchange_request_id', requestId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        fallback = fallbackData;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          request: {
            id: request.id,
            diamond_amount: request.diamond_amount,
            wld_target_amount: request.wld_target_amount,
            wld_received: request.wld_received,
            status: request.status,
            slippage_tolerance: request.slippage_tolerance,
            tx_hash: request.tx_hash,
            error_message: request.error_message,
            retry_count: request.retry_count,
            created_at: request.created_at,
            updated_at: request.updated_at,
          },
          fallback: fallback ? {
            id: fallback.id,
            fallback_reason: fallback.fallback_reason,
            status: fallback.status,
            created_at: fallback.created_at,
          } : null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      // Get all requests for user with pagination
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const { data: requests, error, count } = await admin
        .from('auto_exchange_requests')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new Error('Failed to fetch requests');
      }

      return new Response(
        JSON.stringify({
          ok: true,
          requests: (requests || []).map((r: any) => ({
            id: r.id,
            diamond_amount: r.diamond_amount,
            wld_target_amount: r.wld_target_amount,
            wld_received: r.wld_received,
            status: r.status,
            slippage_tolerance: r.slippage_tolerance,
            tx_hash: r.tx_hash,
            error_message: r.error_message,
            created_at: r.created_at,
            updated_at: r.updated_at,
          })),
          total: count || 0,
          limit,
          offset,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('[v0] Auto-exchange status error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
