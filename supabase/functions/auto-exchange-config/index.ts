import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface ConfigPayload {
  worldId: string;
  enabled?: boolean;
  maxDailyExchange?: number;
  autoApproveThreshold?: number;
}

/**
 * Manage user auto-exchange configuration
 */
export async function handleConfig(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return await getConfig(req);
  } else if (req.method === "PUT" || req.method === "POST") {
    return await updateConfig(req);
  } else {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }
}

/**
 * Get user's auto-exchange configuration
 */
async function getConfig(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const worldId = url.searchParams.get("worldId");

    if (!worldId) {
      return new Response(
        JSON.stringify({ error: "worldId is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get user
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

    // Get config
    const { data: configData, error: configError } = await supabase
      .from("auto_exchange_config")
      .select("*")
      .eq("user_id", userData.id)
      .single();

    if (configError && configError.code !== "PGRST116") {
      console.error("Config fetch error:", configError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch config" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Return default config if none exists
    if (!configData) {
      const defaultConfig = {
        user_id: userData.id,
        enabled: true,
        max_daily_exchange: 10000,
        auto_approve_threshold: 1000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      return new Response(JSON.stringify({ success: true, config: defaultConfig }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({ success: true, config: configData }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Get config error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Update user's auto-exchange configuration
 */
async function updateConfig(req: Request): Promise<Response> {
  try {
    const payload: ConfigPayload = await req.json();

    if (!payload.worldId) {
      return new Response(
        JSON.stringify({ error: "worldId is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate amounts
    if (payload.maxDailyExchange !== undefined && payload.maxDailyExchange <= 0) {
      return new Response(
        JSON.stringify({ error: "maxDailyExchange must be positive" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (
      payload.autoApproveThreshold !== undefined &&
      payload.autoApproveThreshold < 0
    ) {
      return new Response(
        JSON.stringify({ error: "autoApproveThreshold cannot be negative" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get user
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

    // Get existing config
    const { data: existingConfig } = await supabase
      .from("auto_exchange_config")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Prepare update data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.enabled !== undefined) {
      updateData.enabled = payload.enabled;
    }

    if (payload.maxDailyExchange !== undefined) {
      updateData.max_daily_exchange = payload.maxDailyExchange;
    }

    if (payload.autoApproveThreshold !== undefined) {
      updateData.auto_approve_threshold = payload.autoApproveThreshold;
    }

    if (existingConfig) {
      // Update existing config
      const { data: updatedConfig, error: updateError } = await supabase
        .from("auto_exchange_config")
        .update(updateData)
        .eq("user_id", userId)
        .select()
        .single();

      if (updateError) {
        console.error("Config update error:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update config" }),
          { status: 500, headers: corsHeaders }
        );
      }

      // Log audit
      await supabase.from("exchange_audit_log").insert({
        user_id: userId,
        order_id: `config_${userId}`,
        action: "config_updated",
        diamonds_amount: 0,
        min_wld_amount: 0,
        status: "success",
        metadata: updateData,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Configuration updated successfully",
          config: updatedConfig,
        }),
        { status: 200, headers: corsHeaders }
      );
    } else {
      // Create new config
      const newConfig = {
        user_id: userId,
        enabled: payload.enabled ?? true,
        max_daily_exchange: payload.maxDailyExchange ?? 10000,
        auto_approve_threshold: payload.autoApproveThreshold ?? 1000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: createdConfig, error: createError } = await supabase
        .from("auto_exchange_config")
        .insert(newConfig)
        .select()
        .single();

      if (createError) {
        console.error("Config creation error:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create config" }),
          { status: 500, headers: corsHeaders }
        );
      }

      // Log audit
      await supabase.from("exchange_audit_log").insert({
        user_id: userId,
        order_id: `config_${userId}`,
        action: "config_created",
        diamonds_amount: 0,
        min_wld_amount: 0,
        status: "success",
        metadata: newConfig,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Configuration created successfully",
          config: createdConfig,
        }),
        { status: 201, headers: corsHeaders }
      );
    }
  } catch (error) {
    console.error("Update config error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

Deno.serve(handleConfig);
