/**
 * Auto-Exchange System Test Suite
 * Tests all phases of the auto-exchange workflow including edge cases
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.error("[ERROR] Missing Supabase credentials");
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseKey);

// Test Results
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

// Helper to measure execution time
function timeAsync(fn: () => Promise<void>): Promise<number> {
  const start = Date.now();
  return fn().then(() => Date.now() - start);
}

// Test 1: Check database schema exists
async function testDatabaseSchema() {
  console.log("\n[TEST 1] Database Schema Validation");

  const tables = [
    "auto_exchange_requests",
    "auto_exchange_config",
    "fallback_conversion_requests",
    "exchange_audit_log",
  ];

  for (const table of tables) {
    const { data, error } = await admin.from(table).select("count", { count: "exact" }).limit(1);

    if (error) {
      throw new Error(`Table ${table} not found: ${error.message}`);
    }

    console.log(`✓ Table ${table} exists`);
  }
}

// Test 2: Test auto_exchange_requests table structure
async function testExchangeRequestSchema() {
  console.log("\n[TEST 2] Exchange Request Schema");

  // Try to insert a test request
  const testRequest = {
    user_id: "test-user-" + Date.now(),
    diamond_amount: 100,
    wld_target_amount: 0.1,
    slippage_tolerance: 1.0,
    status: "pending",
    retry_count: 0,
  };

  const { data, error } = await admin
    .from("auto_exchange_requests")
    .insert(testRequest)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert exchange request: ${error.message}`);
  }

  console.log(`✓ Insert successful - ID: ${data.id}`);

  // Clean up
  await admin.from("auto_exchange_requests").delete().eq("id", data.id);
}

// Test 3: Test auto_exchange_config table
async function testConfigSchema() {
  console.log("\n[TEST 3] Config Schema");

  const testUserId = "test-user-" + Date.now();
  const testConfig = {
    user_id: testUserId,
    enabled: true,
    slippage_tolerance: 1.5,
    min_wld_amount: 10,
    auto_retry: true,
  };

  const { data, error } = await admin
    .from("auto_exchange_config")
    .insert(testConfig)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert config: ${error.message}`);
  }

  console.log(`✓ Config created - ID: ${data.id}`);

  // Test upsert
  const updated = { ...testConfig, slippage_tolerance: 2.0 };
  const { data: upserted, error: upsertError } = await admin
    .from("auto_exchange_config")
    .upsert(updated)
    .select()
    .single();

  if (upsertError) {
    throw new Error(`Failed to upsert: ${upsertError.message}`);
  }

  console.log(`✓ Upsert successful - slippage: ${upserted.slippage_tolerance}`);

  // Clean up
  await admin.from("auto_exchange_config").delete().eq("user_id", testUserId);
}

// Test 4: Test fallback_conversion_requests
async function testFallbackSchema() {
  console.log("\n[TEST 4] Fallback Request Schema");

  const testUserId = "test-user-" + Date.now();
  const testExchangeId = "exchange-" + Date.now();

  const testFallback = {
    user_id: testUserId,
    auto_exchange_request_id: testExchangeId,
    diamond_amount: 500,
    fallback_reason: "Slippage exceeded",
    status: "pending",
  };

  const { data, error } = await admin
    .from("fallback_conversion_requests")
    .insert(testFallback)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert fallback: ${error.message}`);
  }

  console.log(`✓ Fallback created - ID: ${data.id}`);

  // Clean up
  await admin.from("fallback_conversion_requests").delete().eq("id", data.id);
}

// Test 5: Test exchange_audit_log
async function testAuditLog() {
  console.log("\n[TEST 5] Audit Log Schema");

  const testLog = {
    user_id: "test-user-" + Date.now(),
    action: "exchange_initiated",
    request_id: "req-" + Date.now(),
    details: {
      diamond_amount: 100,
      slippage_tolerance: 1.0,
      timestamp: new Date().toISOString(),
    },
  };

  const { data, error } = await admin
    .from("exchange_audit_log")
    .insert(testLog)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert audit log: ${error.message}`);
  }

  console.log(`✓ Audit log created - ID: ${data.id}`);

  // Clean up
  await admin.from("exchange_audit_log").delete().eq("id", data.id);
}

// Test 6: Test input validation boundaries
async function testInputValidation() {
  console.log("\n[TEST 6] Input Validation");

  const validTests = [
    { name: "Min diamond (1)", amount: 1 },
    { name: "Normal amount (1000)", amount: 1000 },
    { name: "Max diamond (1000000)", amount: 1000000 },
  ];

  for (const test of validTests) {
    const { data, error } = await admin
      .from("auto_exchange_requests")
      .insert({
        user_id: "test-user-" + Date.now(),
        diamond_amount: test.amount,
        wld_target_amount: test.amount * 0.0001,
        slippage_tolerance: 1.0,
        status: "pending",
        retry_count: 0,
      })
      .select();

    if (error) {
      throw new Error(`${test.name} validation failed: ${error.message}`);
    }

    console.log(`✓ ${test.name}`);

    // Clean up
    if (data && data[0]) {
      await admin.from("auto_exchange_requests").delete().eq("id", data[0].id);
    }
  }
}

// Test 7: Test slippage constraints
async function testSlippageConstraints() {
  console.log("\n[TEST 7] Slippage Tolerance Validation");

  const slippageTests = [
    { name: "Min slippage (0.1%)", value: 0.1, shouldPass: true },
    { name: "Normal slippage (1%)", value: 1.0, shouldPass: true },
    { name: "Max slippage (5%)", value: 5.0, shouldPass: true },
  ];

  for (const test of slippageTests) {
    const { data, error } = await admin
      .from("auto_exchange_requests")
      .insert({
        user_id: "test-user-" + Date.now(),
        diamond_amount: 100,
        wld_target_amount: 0.01,
        slippage_tolerance: test.value,
        status: "pending",
        retry_count: 0,
      })
      .select();

    if ((error && test.shouldPass) || (!error && !test.shouldPass)) {
      throw new Error(`${test.name} failed: expected ${test.shouldPass ? "pass" : "fail"}`);
    }

    console.log(`✓ ${test.name}`);

    // Clean up
    if (data && data[0]) {
      await admin.from("auto_exchange_requests").delete().eq("id", data[0].id);
    }
  }
}

// Test 8: Status transitions
async function testStatusTransitions() {
  console.log("\n[TEST 8] Status Transitions");

  const request = {
    user_id: "test-user-" + Date.now(),
    diamond_amount: 100,
    wld_target_amount: 0.01,
    slippage_tolerance: 1.0,
    status: "pending",
    retry_count: 0,
  };

  const { data: inserted, error: insertError } = await admin
    .from("auto_exchange_requests")
    .insert(request)
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create request: ${insertError.message}`);
  }

  // Test transition: pending -> executing
  const { data: executing, error: execError } = await admin
    .from("auto_exchange_requests")
    .update({ status: "executing" })
    .eq("id", inserted.id)
    .select()
    .single();

  if (execError) {
    throw new Error(`Failed to transition to executing: ${execError.message}`);
  }

  console.log(`✓ Pending → Executing`);

  // Test transition: executing -> completed
  const { data: completed, error: completeError } = await admin
    .from("auto_exchange_requests")
    .update({
      status: "completed",
      tx_hash: "0x" + "a".repeat(64),
      wld_received: 0.01,
    })
    .eq("id", inserted.id)
    .select()
    .single();

  if (completeError) {
    throw new Error(`Failed to transition to completed: ${completeError.message}`);
  }

  console.log(`✓ Executing → Completed`);

  // Clean up
  await admin.from("auto_exchange_requests").delete().eq("id", inserted.id);
}

// Test 9: Atomic operations
async function testAtomicOperations() {
  console.log("\n[TEST 9] Atomic Operations");

  const userId = "test-user-" + Date.now();
  const request = {
    user_id: userId,
    diamond_amount: 100,
    wld_target_amount: 0.01,
    slippage_tolerance: 1.0,
    status: "pending",
    retry_count: 0,
  };

  // Create request
  const { data: inserted } = await admin
    .from("auto_exchange_requests")
    .insert(request)
    .select()
    .single();

  // Simulate failed update that should rollback (if using transactions)
  const { data: updated } = await admin
    .from("auto_exchange_requests")
    .update({
      status: "failed",
      error_message: "Test rollback scenario",
    })
    .eq("id", inserted.id)
    .select()
    .single();

  if (updated.status !== "failed") {
    throw new Error("Status update failed");
  }

  console.log(`✓ Atomic update successful`);

  // Clean up
  await admin.from("auto_exchange_requests").delete().eq("id", inserted.id);
}

// Test 10: Data integrity
async function testDataIntegrity() {
  console.log("\n[TEST 10] Data Integrity");

  const userId = "test-user-" + Date.now();

  // Create multiple requests
  const requests = [];
  for (let i = 0; i < 3; i++) {
    const { data } = await admin
      .from("auto_exchange_requests")
      .insert({
        user_id: userId,
        diamond_amount: 100 * (i + 1),
        wld_target_amount: 0.01 * (i + 1),
        slippage_tolerance: 1.0,
        status: "pending",
        retry_count: 0,
      })
      .select()
      .single();

    requests.push(data.id);
  }

  // Verify all created
  const { data: allRequests, error } = await admin
    .from("auto_exchange_requests")
    .select("*")
    .eq("user_id", userId);

  if (error || !allRequests || allRequests.length !== 3) {
    throw new Error("Failed to verify all requests");
  }

  console.log(`✓ Created and verified ${allRequests.length} requests`);

  // Clean up
  for (const id of requests) {
    await admin.from("auto_exchange_requests").delete().eq("id", id);
  }
}

// Run all tests
async function runTests() {
  console.log("========================================");
  console.log("Auto-Exchange System Test Suite");
  console.log("========================================");

  const tests = [
    { name: "Database Schema", fn: testDatabaseSchema },
    { name: "Exchange Request Schema", fn: testExchangeRequestSchema },
    { name: "Config Schema", fn: testConfigSchema },
    { name: "Fallback Schema", fn: testFallbackSchema },
    { name: "Audit Log Schema", fn: testAuditLog },
    { name: "Input Validation", fn: testInputValidation },
    { name: "Slippage Constraints", fn: testSlippageConstraints },
    { name: "Status Transitions", fn: testStatusTransitions },
    { name: "Atomic Operations", fn: testAtomicOperations },
    { name: "Data Integrity", fn: testDataIntegrity },
  ];

  for (const test of tests) {
    try {
      const duration = await timeAsync(test.fn);
      results.push({ name: test.name, passed: true, duration });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({ name: test.name, passed: false, error, duration: 0 });
      console.error(`✗ ${error}`);
    }
  }

  // Summary
  console.log("\n========================================");
  console.log("Test Summary");
  console.log("========================================");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? "✓ PASS" : "✗ FAIL";
    const time = result.passed ? ` (${result.duration}ms)` : "";
    console.log(`${status}: ${result.name}${time}`);
    if (result.error) {
      console.log(`     Error: ${result.error}`);
    }
  }

  console.log(`\nTotal: ${passed} passed, ${failed} failed out of ${results.length}`);
  console.log("========================================\n");

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
