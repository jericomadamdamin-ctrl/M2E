import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface AutoExchangeRequestPayload {
  worldId: string;
  diamondAmount: number;
  minWldAmount: number;
  walletAddress: string;
}

interface ExchangeAuditLog {
  user_id: string;
  order_id: string;
  action: string;
  diamonds_amount: number;
  min_wld_amount: number;
  status: string;
  metadata: Record<string, unknown>;
  ip_address?: string;
}

export async function handleRequest(req: Request): Promise<Response> {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const payload: AutoExchangeRequestPayload = await req.json();

    // Validate input
    if (
      !payload.worldId ||
      !payload.diamondAmount ||
      !payload.walletAddress ||
      !payload.minWldAmount
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (payload.diamondAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Diamond amount must be positive" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (payload.minWldAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Min WLD amount must be positive" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify user exists and get their ID
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("world_id", payload.worldId)
      .single();

    if (userError || !userData) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    const userId = userData.id;

    // Check user's auto-exchange settings
    const { data: configData, error: configError } = await supabase
      .from("auto_exchange_config")
      .select("enabled, max_daily_exchange")
      .eq("user_id", userId)
      .single();

    if (configError && configError.code !== "PGRST116") {
      console.error("Config fetch error:", configError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch user config" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // If no config exists, create default enabled config
    if (!configData) {
      const { error: insertError } = await supabase
        .from("auto_exchange_config")
        .insert({
          user_id: userId,
          enabled: true,
          max_daily_exchange: 10000,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("Config creation error:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create user config" }),
          { status: 500, headers: corsHeaders }
        );
      }
    } else if (!configData.enabled) {
      return new Response(
        JSON.stringify({ error: "Auto-exchange is disabled for this user" }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Generate unique order ID
    const orderId = `order_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create exchange request
    const { data: orderData, error: orderError } = await supabase
      .from("auto_exchange_requests")
      .insert({
        user_id: userId,
        order_id: orderId,
        diamonds_amount: payload.diamondAmount,
        min_wld_amount: payload.minWldAmount,
        wallet_address: payload.walletAddress,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      console.error("Order creation error:", orderError);
      return new Response(
        JSON.stringify({ error: "Failed to create exchange request" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Log to audit trail
    const auditLog: ExchangeAuditLog = {
      user_id: userId,
      order_id: orderId,
      action: "exchange_requested",
      diamonds_amount: payload.diamondAmount,
      min_wld_amount: payload.minWldAmount,
      status: "pending",
      metadata: {
        wallet_address: payload.walletAddress,
        ip_address: req.headers.get("x-forwarded-for") || "unknown",
      },
    };

    await supabase.from("exchange_audit_log").insert(auditLog);

    return new Response(
      JSON.stringify({
        success: true,
        orderId,
        message: "Exchange request created successfully",
        order: orderData,
      }),
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

Deno.serve(handleRequest);
