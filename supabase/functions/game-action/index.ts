import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { getAdminClient, requireUserId, requireHuman } from '../_shared/supabase.ts';
import { ensurePlayerState, getGameConfig, getPlayerMachines, processMining, getTankCapacity, getUpgradeCost, getTotalInvestment } from '../_shared/mining.ts';
import { logSecurityEvent, extractClientInfo, checkRateLimit, isFeatureEnabled, validateRange } from '../_shared/security.ts';

type MachineRow = Awaited<ReturnType<typeof processMining>>['machines'][number];

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
    const { action, payload } = await req.json();

    if (!action) {
      throw new Error('Missing action');
    }

    // Phase 0: Feature flag check
    const gameEnabled = await isFeatureEnabled('game_actions_enabled');
    if (!gameEnabled) {
      throw new Error('Game actions temporarily disabled');
    }

    // Phase 3: Rate limiting (10 actions per minute)
    const rateCheck = await checkRateLimit(userId, 'game_action', 60, 1);
    if (!rateCheck.allowed) {
      const clientInfo = extractClientInfo(req);
      logSecurityEvent({
        event_type: 'rate_limit_exceeded',
        user_id: userId,
        severity: 'warning',
        action: 'game_action',
        details: { attempted_action: action },
        ...clientInfo,
      });
      throw new Error('Rate limit exceeded. Please slow down.');
    }

    const admin = getAdminClient();
    const config = await getGameConfig();

    // Fetch state/machines once, process mining, then perform the action in-memory to avoid extra round-trips.
    const stateRow = await ensurePlayerState(userId);
    const machinesRow = await getPlayerMachines(userId);
    const mined = await processMining(userId, { config, state: stateRow, machines: machinesRow });
    const state = mined.state;
    let machines: MachineRow[] = mined.machines as MachineRow[];

    const mineralDefaults = Object.fromEntries(
      Object.keys(config.mining.action_rewards.minerals).map((key) => [key, 0])
    ) as Record<string, number>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedState = { ...state, minerals: { ...mineralDefaults, ...(state.minerals || {}) } } as any;

    const patchMachine = (machineId: string, patch: Partial<MachineRow>) => {
      machines = machines.map((m) => (m.id === machineId ? { ...m, ...patch } : m));
    };

    // buy_machine has been moved to machine-purchase-initiate/confirm (WLD only)

    if (action === 'fuel_machine') {
      const machineId = payload?.machineId as string;
      const machine = machines.find((m) => m.id === machineId);

      if (!machine) throw new Error('Machine not found');

      const capacity = getTankCapacity(config, machine.type, machine.level);
      const needed = Math.max(0, capacity - Number(machine.fuel_oil));
      const requested = typeof payload?.amount === 'number' ? Math.floor(payload.amount) : needed;

      if (requested < 0) throw new Error('Invalid fuel amount');
      const fillAmount = Math.min(needed, requested, Number(updatedState.oil_balance));

      if (fillAmount <= 0) throw new Error('No OIL available to fuel');

      const { error: updateError } = await admin
        .from('player_machines')
        .update({ fuel_oil: Number(machine.fuel_oil) + fillAmount })
        .eq('id', machineId)
        .eq('user_id', userId);

      if (updateError) throw updateError;
      patchMachine(machineId, { fuel_oil: Number(machine.fuel_oil) + fillAmount });

      updatedState.oil_balance = Number(updatedState.oil_balance) - fillAmount;
    }

    if (action === 'start_machine') {
      const machineId = payload?.machineId as string;
      const machine = machines.find((m) => m.id === machineId);

      if (!machine) throw new Error('Machine not found');
      if (Number(machine.fuel_oil) <= 0) throw new Error('Machine has no fuel');

      const nowIso = new Date().toISOString();
      await admin
        .from('player_machines')
        .update({ is_active: true, last_processed_at: nowIso })
        .eq('id', machineId)
        .eq('user_id', userId);
      patchMachine(machineId, { is_active: true, last_processed_at: nowIso });
    }

    if (action === 'stop_machine') {
      const machineId = payload?.machineId as string;
      const nowIso = new Date().toISOString();
      await admin
        .from('player_machines')
        .update({ is_active: false, last_processed_at: nowIso })
        .eq('id', machineId)
        .eq('user_id', userId);
      patchMachine(machineId, { is_active: false, last_processed_at: nowIso });
    }

    if (action === 'upgrade_machine') {
      const machineId = payload?.machineId as string;
      const machine = machines.find((m) => m.id === machineId);

      if (!machine) throw new Error('Machine not found');
      const machineConfig = config.machines[machine.type];
      if (!machineConfig) throw new Error('Invalid machine');
      if (machine.level >= machineConfig.max_level) throw new Error('Machine at max level');

      const cost = getUpgradeCost(config, machine.type, machine.level);
      if (Number(updatedState.oil_balance) < cost) throw new Error('Insufficient OIL');

      await admin
        .from('player_machines')
        .update({ level: machine.level + 1 })
        .eq('id', machineId)
        .eq('user_id', userId);
      patchMachine(machineId, { level: machine.level + 1 });

      updatedState.oil_balance = Number(updatedState.oil_balance) - cost;
    }

    if (action === 'exchange_minerals') {
      const mineral = payload?.mineral as string;
      const amount = Math.floor(Number(payload?.amount || 0));
      const mineralDef = config.mining.action_rewards.minerals[mineral];
      if (!mineralDef) throw new Error('Invalid mineral');
      if (amount <= 0 || isNaN(amount) || !Number.isFinite(amount)) throw new Error('Invalid amount');
      if (amount > 1000000) throw new Error('Maximum exchange amount is 1,000,000');

      const current = Number(updatedState.minerals?.[mineral] || 0);
      if (current < amount) throw new Error('Insufficient minerals');

      const oilGain = amount * mineralDef.oil_value;
      updatedState.minerals[mineral] = current - amount;
      updatedState.oil_balance = Number(updatedState.oil_balance) + oilGain;
    }

    if (action === 'discard_machine') {
      const machineId = payload?.machineId as string;
      const machine = machines.find((m) => m.id === machineId);

      if (!machine) throw new Error('Machine not found');

      const machineConfig = config.machines[machine.type];
      if (!machineConfig) throw new Error('Invalid machine type');

      // Discard Logic: No refund, just delete.
      // 1. Delete the machine
      const { error: deleteError } = await admin
        .from('player_machines')
        .delete()
        .eq('id', machineId)
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Remove from memory list so the response is correct
      machines = machines.filter(m => m.id !== machineId);

      logSecurityEvent({
        event_type: 'machine_discarded',
        user_id: userId,
        severity: 'info',
        action,
        details: { machineId, type: machine.type, level: machine.level },
      });
    }

    await admin
      .from('player_state')
      .update({
        oil_balance: updatedState.oil_balance,
        minerals: updatedState.minerals,
        diamond_balance: updatedState.diamond_balance,
      })
      .eq('user_id', userId);

    // Log successful game action
    logSecurityEvent({
      event_type: 'game_action',
      user_id: userId,
      severity: 'info',
      action,
      details: { payload },
    });

    return new Response(JSON.stringify({ ok: true, state: updatedState, machines }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const clientInfo = extractClientInfo(req);
    logSecurityEvent({
      event_type: 'validation_failed',
      severity: 'warning',
      action: 'game_action',
      details: { error: (err as Error).message },
      ...clientInfo,
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
