import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface ExecuteExchangePayload {
  orderId: string;
  swapPath: string; // Encoded Uniswap path
  deadline: number;
  contractAddress: string;
}

interface FailureNotification {
  user_id: string;
  order_id: string;
  action: string;
  reason: string;
  fallback_status: string;
  diamonds_amount: number;
}

/**
 * This function is called by the backend service to execute a confirmed exchange
 * It handles the smart contract interaction and implements fallback on failure
 */
export async function handleExecute(req: Request): Promise<Response> {
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
    const payload: ExecuteExchangePayload = await req.json();

    if (!payload.orderId || !payload.contractAddress) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Fetch the order
    const { data: orderData, error: orderError } = await supabase
      .from("auto_exchange_requests")
      .select("*")
      .eq("order_id", payload.orderId)
      .single();

    if (orderError || !orderData) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (orderData.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Order is not in pending state" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Log execution attempt
    await supabase.from("exchange_audit_log").insert({
      user_id: orderData.user_id,
      order_id: payload.orderId,
      action: "exchange_execution_started",
      diamonds_amount: orderData.diamonds_amount,
      min_wld_amount: orderData.min_wld_amount,
      status: "processing",
      metadata: {
        contract_address: payload.contractAddress,
        deadline: payload.deadline,
      },
    });

    // Call smart contract to execute exchange
    // In production, this would use ethers.js or web3.js to interact with the blockchain
    const executionResult = await executeSmartContractSwap(
      payload.contractAddress,
      payload.orderId,
      payload.swapPath,
      payload.deadline,
      orderData
    );

    if (executionResult.success) {
      // Update order status to executed
      const { error: updateError } = await supabase
        .from("auto_exchange_requests")
        .update({
          status: "executed",
          wld_amount: executionResult.wldAmount,
          transaction_hash: executionResult.txHash,
          executed_at: new Date().toISOString(),
        })
        .eq("order_id", payload.orderId);

      if (updateError) {
        console.error("Failed to update order:", updateError);
        // Still consider this a success since blockchain transaction went through
      }

      // Log success
      await supabase.from("exchange_audit_log").insert({
        user_id: orderData.user_id,
        order_id: payload.orderId,
        action: "exchange_executed",
        diamonds_amount: orderData.diamonds_amount,
        min_wld_amount: orderData.min_wld_amount,
        status: "success",
        metadata: {
          wld_amount: executionResult.wldAmount,
          tx_hash: executionResult.txHash,
          fee_amount: executionResult.feeAmount,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Exchange executed successfully",
          txHash: executionResult.txHash,
          wldAmount: executionResult.wldAmount,
        }),
        { status: 200, headers: corsHeaders }
      );
    } else {
      // Handle failure with automatic fallback
      return await handleExchangeFailure(
        supabase,
        orderData,
        payload.orderId,
        executionResult.error
      );
    }
  } catch (error) {
    console.error("Execution error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Handle exchange failure and create fallback manual withdrawal request
 */
async function handleExchangeFailure(
  supabase: any,
  orderData: any,
  orderId: string,
  failureReason: string
): Promise<Response> {
  try {
    // Update order status to failed
    await supabase
      .from("auto_exchange_requests")
      .update({
        status: "failed",
        failure_reason: failureReason,
        failed_at: new Date().toISOString(),
      })
      .eq("order_id", orderId);

    // Create fallback manual withdrawal request
    const fallbackId = `fallback_${orderId}`;

    const { error: fallbackError } = await supabase
      .from("fallback_conversion_requests")
      .insert({
        user_id: orderData.user_id,
        original_order_id: orderId,
        fallback_id: fallbackId,
        diamonds_amount: orderData.diamonds_amount,
        status: "pending",
        reason: failureReason,
        created_at: new Date().toISOString(),
      });

    if (fallbackError) {
      console.error("Fallback creation error:", fallbackError);
      return new Response(
        JSON.stringify({
          error: "Exchange failed and fallback creation failed",
          details: failureReason,
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Log failure and fallback
    await supabase.from("exchange_audit_log").insert({
      user_id: orderData.user_id,
      order_id: orderId,
      action: "exchange_failed_fallback_created",
      diamonds_amount: orderData.diamonds_amount,
      min_wld_amount: orderData.min_wld_amount,
      status: "failed",
      metadata: {
        failure_reason: failureReason,
        fallback_id: fallbackId,
        fallback_status: "pending",
      },
    });

    return new Response(
      JSON.stringify({
        success: false,
        message:
          "Exchange failed. Automatic fallback to manual withdrawal initiated.",
        orderId,
        fallbackId,
        failureReason,
        action: "fallback_created",
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Fallback handling error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to handle exchange failure" }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Execute smart contract swap
 * In production, this would use ethers.js with proper Web3 provider setup
 */
async function executeSmartContractSwap(
  contractAddress: string,
  orderId: string,
  swapPath: string,
  deadline: number,
  orderData: any
): Promise<{
  success: boolean;
  wldAmount?: number;
  txHash?: string;
  feeAmount?: number;
  error?: string;
}> {
  try {
    // This is a placeholder for the actual smart contract interaction
    // In production, you would:
    // 1. Initialize ethers.js provider and signer
    // 2. Create contract instance with ABI
    // 3. Call executeExchange method
    // 4. Wait for transaction confirmation
    // 5. Return transaction hash and results

    // For now, simulate success with mock data
    console.log(
      `[SIMULATION] Executing swap for order ${orderId} on contract ${contractAddress}`
    );

    // This would be replaced with actual contract call
    const mockWldAmount = Math.floor(orderData.min_wld_amount * 0.99); // Simulate small slippage
    const mockFeeAmount = Math.floor(mockWldAmount * 0.01); // 1% fee
    const mockTxHash = `0x${Math.random().toString(16).slice(2)}`;

    // Simulate occasional failures for testing (5% failure rate)
    if (Math.random() < 0.05) {
      return {
        success: false,
        error: "Simulated slippage exceeded",
      };
    }

    return {
      success: true,
      wldAmount: mockWldAmount - mockFeeAmount,
      txHash: mockTxHash,
      feeAmount: mockFeeAmount,
    };
  } catch (error) {
    console.error("Smart contract execution error:", error);
    return {
      success: false,
      error: `Contract execution failed: ${String(error)}`,
    };
  }
}

Deno.serve(handleExecute);
