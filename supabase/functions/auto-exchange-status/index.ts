import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface StatusCheckPayload {
  orderId?: string;
  worldId?: string;
}

/**
 * Check status of auto-exchange orders and fallback requests
 */
export async function handleStatusCheck(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    let payload: StatusCheckPayload = {};

    if (req.method === "POST") {
      payload = await req.json();
    } else {
      const url = new URL(req.url);
      payload = {
        orderId: url.searchParams.get("orderId") || undefined,
        worldId: url.searchParams.get("worldId") || undefined,
      };
    }

    if (!payload.orderId && !payload.worldId) {
      return new Response(
        JSON.stringify({
          error: "Either orderId or worldId is required",
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    if (payload.orderId) {
      return await getOrderStatus(supabase, payload.orderId);
    } else {
      return await getUserOrders(supabase, payload.worldId!);
    }
  } catch (error) {
    console.error("Status check error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Get single order status
 */
async function getOrderStatus(supabase: any, orderId: string): Promise<Response> {
  try {
    // Fetch auto-exchange order
    const { data: orderData, error: orderError } = await supabase
      .from("auto_exchange_requests")
      .select("*")
      .eq("order_id", orderId)
      .single();

    if (orderError && orderError.code !== "PGRST116") {
      console.error("Order fetch error:", orderError);
      return new Response(JSON.stringify({ error: "Failed to fetch order" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (!orderData) {
      // Check if it's a fallback request
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("fallback_conversion_requests")
        .select("*")
        .eq("original_order_id", orderId)
        .single();

      if (fallbackError && fallbackError.code !== "PGRST116") {
        console.error("Fallback fetch error:", fallbackError);
        return new Response(JSON.stringify({ error: "Failed to fetch order" }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      if (!fallbackData) {
        return new Response(JSON.stringify({ error: "Order not found" }), {
          status: 404,
          headers: corsHeaders,
        });
      }

      // Return fallback status
      return new Response(
        JSON.stringify({
          success: true,
          type: "fallback",
          order: fallbackData,
          status: fallbackData.status,
          diamonds_amount: fallbackData.diamonds_amount,
          reason: fallbackData.reason,
          created_at: fallbackData.created_at,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Get related fallback if order failed
    let fallbackRequest = null;
    if (orderData.status === "failed") {
      const { data: fb } = await supabase
        .from("fallback_conversion_requests")
        .select("*")
        .eq("original_order_id", orderId)
        .single();
      fallbackRequest = fb;
    }

    return new Response(
      JSON.stringify({
        success: true,
        type: "auto_exchange",
        order: orderData,
        status: orderData.status,
        diamonds_amount: orderData.diamonds_amount,
        wld_amount: orderData.wld_amount || null,
        min_wld_amount: orderData.min_wld_amount,
        transaction_hash: orderData.transaction_hash,
        created_at: orderData.created_at,
        executed_at: orderData.executed_at,
        failed_at: orderData.failed_at,
        failure_reason: orderData.failure_reason,
        fallback_request: fallbackRequest,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Order status error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to get order status" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Get all orders for a user
 */
async function getUserOrders(
  supabase: any,
  worldId: string
): Promise<Response> {
  try {
    // Get user ID from world ID
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("world_id", worldId)
      .single();

    if (userError || !userData) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const userId = userData.id;

    // Fetch all auto-exchange orders
    const { data: autoExchangeOrders, error: autoError } = await supabase
      .from("auto_exchange_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (autoError) {
      console.error("Auto exchange orders fetch error:", autoError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch auto-exchange orders" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Fetch all fallback requests
    const { data: fallbackOrders, error: fallbackError } = await supabase
      .from("fallback_conversion_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (fallbackError) {
      console.error("Fallback orders fetch error:", fallbackError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch fallback orders" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Calculate statistics
    const stats = {
      total_auto_exchanges: autoExchangeOrders?.length || 0,
      successful_exchanges: autoExchangeOrders?.filter(
        (o) => o.status === "executed"
      ).length || 0,
      failed_exchanges: autoExchangeOrders?.filter(
        (o) => o.status === "failed"
      ).length || 0,
      pending_exchanges: autoExchangeOrders?.filter(
        (o) => o.status === "pending"
      ).length || 0,
      total_fallbacks: fallbackOrders?.length || 0,
      pending_fallbacks: fallbackOrders?.filter(
        (o) => o.status === "pending"
      ).length || 0,
      completed_fallbacks: fallbackOrders?.filter(
        (o) => o.status === "completed"
      ).length || 0,
    };

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        world_id: worldId,
        auto_exchange_orders: autoExchangeOrders || [],
        fallback_orders: fallbackOrders || [],
        statistics: stats,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("User orders error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to get user orders" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

Deno.serve(handleStatusCheck);
