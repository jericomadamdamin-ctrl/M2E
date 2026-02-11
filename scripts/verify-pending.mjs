#!/usr/bin/env node
/**
 * Batch verify all pending purchases against the World Dev Portal API.
 * Before crediting, checks player_machines, player_state, security_events,
 * and all confirmed purchase records to avoid double-crediting.
 */

const SUPABASE_URL = 'https://kinfgzrpwdoroahsnzbr.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpbmZnenJwd2Rvcm9haHNuemJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM4NzM2MCwiZXhwIjoyMDg1OTYzMzYwfQ.vBWZEmMA-AXDYekKzaTJHxdqYFxjK4Axzs5Gtg8M35M';
const WORLD_APP_ID = 'app_a21ec98d42542ddf3761d5644707afe6';
const WORLD_API_KEY = 'api_a2V5Xzc2YzdjOWEzMDkyYjZkM2ExYTIxMWUxYTFlOGQwNmRlOnNrX2Q5MDNjOGEyZWUwOTZkMmM3Y2VhMjY5ZGI2MDg2OTczNDk0ZjhiOTA2M2Y0ZTk2Nw';
const DEV_PORTAL_API = 'https://developer.worldcoin.org/api/v2/minikit/transaction';
const SUCCESS_STATUSES = ['mined', 'completed', 'confirmed', 'success'];

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

/* ── Supabase helpers ──────────────────────────────────────────── */

async function supaGet(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supaPatch(table, id, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table}/${id} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supaPost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supaRpc(fn, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/* ── World API helper ──────────────────────────────────────────── */

async function verifyWithWorld(transactionId) {
  const res = await fetch(`${DEV_PORTAL_API}/${transactionId}?app_id=${WORLD_APP_ID}&type=payment`, {
    headers: { Authorization: `Bearer ${WORLD_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: `World API ${res.status}: ${text}` };
  }
  return res.json();
}

/* ── Main ──────────────────────────────────────────────────────── */

async function main() {
  console.log('=== Fetching all pending purchases ===\n');

  const [oilPending, machinePending, slotPending] = await Promise.all([
    supaGet('oil_purchases', 'status=eq.pending&order=created_at.asc'),
    supaGet('machine_purchases', 'status=eq.pending&order=created_at.asc'),
    supaGet('slot_purchases', 'status=eq.pending&order=created_at.asc'),
  ]);

  console.log(`Pending oil:     ${oilPending.length}`);
  console.log(`Pending machine: ${machinePending.length}`);
  console.log(`Pending slot:    ${slotPending.length}`);
  console.log(`Total:           ${oilPending.length + machinePending.length + slotPending.length}\n`);

  // Pre-fetch all credit-related tables for cross-checking
  console.log('=== Pre-fetching credit tables for double-credit detection ===\n');

  const [allPlayerMachines, allPlayerState, allConfirmedOil, allConfirmedMachines, allConfirmedSlots, allSecurityEvents] = await Promise.all([
    supaGet('player_machines', 'select=id,user_id,type,created_at'),
    supaGet('player_state', 'select=user_id,oil_balance,diamond_balance,purchased_slots'),
    supaGet('oil_purchases', 'status=eq.confirmed&select=id,user_id,reference,amount_oil'),
    supaGet('machine_purchases', 'status=eq.confirmed&select=id,user_id,machine_type,reference'),
    supaGet('slot_purchases', 'status=eq.confirmed&select=id,user_id,slots_purchased,reference'),
    supaGet('security_events', "event_type=eq.purchase_confirmed&select=id,user_id,action,details&order=created_at.desc&limit=500"),
  ]);

  console.log(`  player_machines rows:     ${allPlayerMachines.length}`);
  console.log(`  player_state rows:        ${allPlayerState.length}`);
  console.log(`  confirmed oil purchases:  ${allConfirmedOil.length}`);
  console.log(`  confirmed machine purch:  ${allConfirmedMachines.length}`);
  console.log(`  confirmed slot purch:     ${allConfirmedSlots.length}`);
  console.log(`  security_events (confirmed): ${allSecurityEvents.length}\n`);

  // Build lookup maps
  const machinesByUser = {};
  for (const m of allPlayerMachines) {
    const key = `${m.user_id}::${m.type}`;
    machinesByUser[key] = (machinesByUser[key] || 0) + 1;
  }

  const confirmedMachinesByUser = {};
  for (const m of allConfirmedMachines) {
    const key = `${m.user_id}::${m.machine_type}`;
    confirmedMachinesByUser[key] = (confirmedMachinesByUser[key] || 0) + 1;
  }

  const stateByUser = {};
  for (const s of allPlayerState) {
    stateByUser[s.user_id] = s;
  }

  // Track references already seen in security_events
  const confirmedRefs = new Set();
  for (const e of allSecurityEvents) {
    if (e.details?.reference) confirmedRefs.add(e.details.reference);
    if (e.details?.id) confirmedRefs.add(e.details.id);
  }

  const results = [];

  /* ── Process Oil Purchases ───────────────────────────────────── */
  console.log('=== Processing Oil Purchases ===\n');
  for (const p of oilPending) {
    const tag = `[OIL ${p.id.slice(0, 8)}]`;
    const txId = p.transaction_id;

    if (!txId) {
      console.log(`${tag} SKIP - no transaction_id`);
      results.push({ type: 'oil', id: p.id, status: 'skip_no_txid' });
      continue;
    }

    // Verify with World API
    const tx = await verifyWithWorld(txId);
    if (tx.error) {
      console.log(`${tag} API ERROR - ${tx.error}`);
      results.push({ type: 'oil', id: p.id, status: 'api_error', detail: tx.error });
      continue;
    }

    const txStatus = tx?.transaction_status;
    console.log(`${tag} World status: ${txStatus}, ref: ${tx?.reference || 'none'}`);

    // Reference check
    if (tx?.reference && p.reference && tx.reference !== p.reference) {
      console.log(`${tag} SKIP - reference mismatch (world: ${tx.reference}, db: ${p.reference})`);
      results.push({ type: 'oil', id: p.id, status: 'ref_mismatch' });
      continue;
    }

    // Amount check (1% tolerance)
    if (tx?.input_token?.amount) {
      const txAmt = parseFloat(tx.input_token.amount);
      const expected = Number(p.amount_token ?? p.amount_wld);
      if (txAmt < expected * 0.99) {
        console.log(`${tag} SKIP - underpaid (expected ${expected}, got ${txAmt})`);
        results.push({ type: 'oil', id: p.id, status: 'underpaid' });
        continue;
      }
    }

    if (txStatus === 'failed') {
      await supaPatch('oil_purchases', p.id, { status: 'failed', metadata: tx });
      console.log(`${tag} FAILED on-chain - marked failed`);
      results.push({ type: 'oil', id: p.id, status: 'tx_failed' });
      continue;
    }

    if (txStatus && !SUCCESS_STATUSES.includes(txStatus)) {
      console.log(`${tag} SKIP - still pending on-chain (${txStatus})`);
      results.push({ type: 'oil', id: p.id, status: `pending_${txStatus}` });
      continue;
    }

    // Double-credit check: reference in security_events, or metadata already has tx data
    const alreadyCredited = confirmedRefs.has(p.reference) || confirmedRefs.has(p.id) ||
      (p.metadata && typeof p.metadata === 'object' && p.metadata.transaction_status);

    if (alreadyCredited) {
      // Just update DB, no credit
      await supaPatch('oil_purchases', p.id, { status: 'confirmed', transaction_id: txId, metadata: tx });
      console.log(`${tag} CONFIRMED (DB only - already credited)`);
      results.push({ type: 'oil', id: p.id, status: 'confirmed', credited: false });
    } else {
      // Credit oil
      const state = stateByUser[p.user_id];
      const currentOil = Number(state?.oil_balance || 0);
      const addOil = Number(p.amount_oil || 0);
      const newOil = currentOil + addOil;

      await supaPatch('player_state', p.user_id, { oil_balance: newOil });
      // Update in-memory state too
      if (state) state.oil_balance = newOil;

      await supaPatch('oil_purchases', p.id, { status: 'confirmed', transaction_id: txId, metadata: tx });
      console.log(`${tag} CONFIRMED + CREDITED ${addOil} oil (${currentOil} -> ${newOil})`);
      results.push({ type: 'oil', id: p.id, status: 'confirmed', credited: true, oil: addOil });
    }
  }

  /* ── Process Machine Purchases ───────────────────────────────── */
  console.log('\n=== Processing Machine Purchases ===\n');
  for (const p of machinePending) {
    const tag = `[MACHINE ${p.id.slice(0, 8)}]`;
    const txId = p.transaction_id;

    if (!txId) {
      console.log(`${tag} SKIP - no transaction_id`);
      results.push({ type: 'machine', id: p.id, status: 'skip_no_txid' });
      continue;
    }

    const tx = await verifyWithWorld(txId);
    if (tx.error) {
      console.log(`${tag} API ERROR - ${tx.error}`);
      results.push({ type: 'machine', id: p.id, status: 'api_error', detail: tx.error });
      continue;
    }

    const txStatus = tx?.transaction_status;
    console.log(`${tag} World status: ${txStatus}, type: ${p.machine_type}`);

    if (tx?.reference && p.reference && tx.reference !== p.reference) {
      console.log(`${tag} SKIP - reference mismatch`);
      results.push({ type: 'machine', id: p.id, status: 'ref_mismatch' });
      continue;
    }

    if (tx?.input_token?.amount) {
      const txAmt = parseFloat(tx.input_token.amount);
      const expected = Number(p.amount_wld);
      if (txAmt < expected * 0.99) {
        console.log(`${tag} SKIP - underpaid (expected ${expected}, got ${txAmt})`);
        results.push({ type: 'machine', id: p.id, status: 'underpaid' });
        continue;
      }
    }

    if (txStatus === 'failed') {
      await supaPatch('machine_purchases', p.id, { status: 'failed', metadata: tx });
      console.log(`${tag} FAILED on-chain`);
      results.push({ type: 'machine', id: p.id, status: 'tx_failed' });
      continue;
    }

    if (txStatus && !SUCCESS_STATUSES.includes(txStatus)) {
      console.log(`${tag} SKIP - still pending on-chain (${txStatus})`);
      results.push({ type: 'machine', id: p.id, status: `pending_${txStatus}` });
      continue;
    }

    // Double-credit check: count owned machines vs confirmed purchases
    const machKey = `${p.user_id}::${p.machine_type}`;
    const ownedCount = machinesByUser[machKey] || 0;
    const confirmedCount = confirmedMachinesByUser[machKey] || 0;
    const alreadyCredited = ownedCount > confirmedCount ||
      confirmedRefs.has(p.reference) || confirmedRefs.has(p.id);

    if (alreadyCredited) {
      await supaPatch('machine_purchases', p.id, { status: 'confirmed', transaction_id: txId, metadata: tx });
      console.log(`${tag} CONFIRMED (DB only - machine already in player_machines: owned=${ownedCount}, confirmed=${confirmedCount})`);
      results.push({ type: 'machine', id: p.id, status: 'confirmed', credited: false });
    } else {
      // Grant machine
      await supaPost('player_machines', {
        user_id: p.user_id,
        type: p.machine_type,
        level: 1,
        fuel_oil: 0,
        is_active: false,
        last_processed_at: new Date().toISOString(),
      });
      // Update in-memory count
      machinesByUser[machKey] = (machinesByUser[machKey] || 0) + 1;

      await supaPatch('machine_purchases', p.id, { status: 'confirmed', transaction_id: txId, metadata: tx });
      console.log(`${tag} CONFIRMED + CREDITED machine "${p.machine_type}"`);
      results.push({ type: 'machine', id: p.id, status: 'confirmed', credited: true, machine_type: p.machine_type });
    }
    // Update confirmed count for next iteration
    confirmedMachinesByUser[machKey] = (confirmedMachinesByUser[machKey] || 0) + 1;
  }

  /* ── Process Slot Purchases ──────────────────────────────────── */
  console.log('\n=== Processing Slot Purchases ===\n');
  for (const p of slotPending) {
    const tag = `[SLOT ${p.id.slice(0, 8)}]`;
    const txId = p.transaction_id;

    if (!txId) {
      console.log(`${tag} SKIP - no transaction_id`);
      results.push({ type: 'slot', id: p.id, status: 'skip_no_txid' });
      continue;
    }

    const tx = await verifyWithWorld(txId);
    if (tx.error) {
      console.log(`${tag} API ERROR - ${tx.error}`);
      results.push({ type: 'slot', id: p.id, status: 'api_error', detail: tx.error });
      continue;
    }

    const txStatus = tx?.transaction_status;
    console.log(`${tag} World status: ${txStatus}, slots: ${p.slots_purchased}`);

    if (tx?.reference && p.reference && tx.reference !== p.reference) {
      console.log(`${tag} SKIP - reference mismatch`);
      results.push({ type: 'slot', id: p.id, status: 'ref_mismatch' });
      continue;
    }

    if (tx?.input_token?.amount) {
      const txAmt = parseFloat(tx.input_token.amount);
      const expected = Number(p.amount_wld);
      if (txAmt < expected * 0.99) {
        console.log(`${tag} SKIP - underpaid (expected ${expected}, got ${txAmt})`);
        results.push({ type: 'slot', id: p.id, status: 'underpaid' });
        continue;
      }
    }

    if (txStatus === 'failed') {
      await supaPatch('slot_purchases', p.id, { status: 'failed', metadata: tx });
      console.log(`${tag} FAILED on-chain`);
      results.push({ type: 'slot', id: p.id, status: 'tx_failed' });
      continue;
    }

    if (txStatus && !SUCCESS_STATUSES.includes(txStatus)) {
      console.log(`${tag} SKIP - still pending on-chain (${txStatus})`);
      results.push({ type: 'slot', id: p.id, status: `pending_${txStatus}` });
      continue;
    }

    // Double-credit check
    const alreadyCredited = confirmedRefs.has(p.reference) || confirmedRefs.has(p.id) ||
      (p.metadata && typeof p.metadata === 'object' && p.metadata.transaction_status);

    if (alreadyCredited) {
      await supaPatch('slot_purchases', p.id, { status: 'confirmed', transaction_id: txId, metadata: tx });
      console.log(`${tag} CONFIRMED (DB only - slots already credited)`);
      results.push({ type: 'slot', id: p.id, status: 'confirmed', credited: false });
    } else {
      // Increment slots via RPC
      const slotsToAdd = Number(p.slots_purchased ?? 0);
      await supaRpc('increment_slots', { user_id_param: p.user_id, slots_add: slotsToAdd });
      await supaPatch('slot_purchases', p.id, { status: 'confirmed', transaction_id: txId, metadata: tx });
      console.log(`${tag} CONFIRMED + CREDITED ${slotsToAdd} slots`);
      results.push({ type: 'slot', id: p.id, status: 'confirmed', credited: true, slots: slotsToAdd });
    }
  }

  /* ── Summary ─────────────────────────────────────────────────── */
  console.log('\n========================================');
  console.log('            SUMMARY');
  console.log('========================================\n');

  const confirmed = results.filter(r => r.status === 'confirmed');
  const credited = results.filter(r => r.credited === true);
  const dbOnly = results.filter(r => r.status === 'confirmed' && r.credited === false);
  const skipped = results.filter(r => r.status.startsWith('skip') || r.status.startsWith('pending'));
  const failed = results.filter(r => ['tx_failed', 'api_error', 'ref_mismatch', 'underpaid'].includes(r.status));

  console.log(`Total processed:    ${results.length}`);
  console.log(`Confirmed:          ${confirmed.length}`);
  console.log(`  - Newly credited: ${credited.length}`);
  console.log(`  - DB-only update: ${dbOnly.length} (already had credits)`);
  console.log(`Skipped:            ${skipped.length}`);
  console.log(`Failed/Rejected:    ${failed.length}`);
  console.log('');

  if (credited.length > 0) {
    console.log('Newly credited:');
    for (const r of credited) {
      console.log(`  ${r.type} ${r.id.slice(0, 8)} - ${r.oil ? r.oil + ' oil' : r.machine_type ? 'machine: ' + r.machine_type : r.slots + ' slots'}`);
    }
  }

  if (dbOnly.length > 0) {
    console.log('\nDB-only updates (user already had credits):');
    for (const r of dbOnly) {
      console.log(`  ${r.type} ${r.id.slice(0, 8)}`);
    }
  }

  if (failed.length > 0) {
    console.log('\nFailed/Rejected:');
    for (const r of failed) {
      console.log(`  ${r.type} ${r.id.slice(0, 8)} - ${r.status}${r.detail ? ': ' + r.detail : ''}`);
    }
  }

  if (skipped.length > 0) {
    console.log('\nSkipped (no txid or still pending on-chain):');
    for (const r of skipped) {
      console.log(`  ${r.type} ${r.id.slice(0, 8)} - ${r.status}`);
    }
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
