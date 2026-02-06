import { getAdminClient } from './supabase.ts';

type GameConfig = {
  pricing: { oil_per_wld: number; oil_per_usdc: number; usdc_to_wld_rate?: number };
  machines: Record<string, { cost_oil: number; speed_actions_per_hour: number; oil_burn_per_hour: number; tank_capacity: number; max_level: number }>;
  mining: { action_rewards: { minerals: Record<string, { drop_rate: number; oil_value: number }>; diamond: { drop_rate_per_action: number } } };
  diamond_controls: { daily_cap_per_user: number; excess_diamond_oil_value: number };
  progression: { level_speed_multiplier: number; level_oil_burn_multiplier: number; level_capacity_multiplier: number; upgrade_cost_multiplier: number };
  cashout?: { enabled: boolean; minimum_diamonds_required: number; cooldown_days: number };
  treasury?: { payout_percentage: number; treasury_address?: string | null };
  anti_abuse?: { rate_limits?: { cashout_requests_per_day?: number } };
};

type PlayerStateRow = {
  user_id: string;
  oil_balance: number;
  diamond_balance: number;
  minerals: Record<string, number>;
  daily_diamond_count: number;
  daily_diamond_reset_at: string;
};

type MachineRow = {
  id: string;
  type: string;
  level: number;
  fuel_oil: number;
  is_active: boolean;
  last_processed_at: string | null;
};

const MS_PER_HOUR = 3600 * 1000;

const getMultiplier = (base: number, level: number, perLevel: number) => {
  return base * (1 + Math.max(0, level - 1) * perLevel);
};

export async function getGameConfig(): Promise<GameConfig> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('game_config')
    .select('value')
    .eq('key', 'current')
    .single();
  if (error || !data) {
    throw new Error('Missing game_config');
  }
  return data.value as GameConfig;
}

export async function ensurePlayerState(userId: string): Promise<PlayerStateRow> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('player_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (data && !error) {
    return data as PlayerStateRow;
  }

  const { data: created, error: createError } = await admin
    .from('player_state')
    .insert({ user_id: userId })
    .select('*')
    .single();

  if (createError || !created) {
    throw new Error('Failed to create player state');
  }

  return created as PlayerStateRow;
}

export async function getPlayerMachines(userId: string): Promise<MachineRow[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('player_machines')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error('Failed to fetch machines');
  }
  return (data ?? []) as MachineRow[];
}

export async function processMining(userId: string) {
  const admin = getAdminClient();
  const config = await getGameConfig();
  const state = await ensurePlayerState(userId);
  const machines = await getPlayerMachines(userId);

  const mineralDefaults = Object.fromEntries(Object.keys(config.mining.action_rewards.minerals).map((key) => [key, 0])) as Record<string, number>;
  const minerals = { ...mineralDefaults, ...(state.minerals || {}) } as Record<string, number>;
  let oilBalance = Number(state.oil_balance);
  let diamondBalance = Number(state.diamond_balance);
  let dailyCount = Number(state.daily_diamond_count);
  let resetAt = new Date(state.daily_diamond_reset_at).getTime();

  const now = Date.now();
  if (now - resetAt >= 24 * MS_PER_HOUR) {
    dailyCount = 0;
    resetAt = now;
  }

  const diamondCap = config.diamond_controls.daily_cap_per_user;
  const excessDiamondOilValue = config.diamond_controls.excess_diamond_oil_value ?? 0;
  const diamondDrop = config.mining.action_rewards.diamond.drop_rate_per_action;
  const mineralDefs = config.mining.action_rewards.minerals;

  const machineUpdates: { id: string; fuel_oil: number; is_active: boolean; last_processed_at: string | null }[] = [];

  for (const machine of machines) {
    if (!machine.is_active) continue;
    if (!machine.last_processed_at) {
      machineUpdates.push({
        id: machine.id,
        fuel_oil: machine.fuel_oil,
        is_active: machine.is_active,
        last_processed_at: new Date(now).toISOString(),
      });
      continue;
    }

    const last = new Date(machine.last_processed_at).getTime();
    const elapsedMs = now - last;
    if (elapsedMs <= 0) continue;

    const configMachine = config.machines[machine.type];
    if (!configMachine) continue;

    const speed = getMultiplier(configMachine.speed_actions_per_hour, machine.level, config.progression.level_speed_multiplier);
    const burn = getMultiplier(configMachine.oil_burn_per_hour, machine.level, config.progression.level_oil_burn_multiplier);

    const elapsedHours = elapsedMs / MS_PER_HOUR;
    const maxHoursByFuel = burn > 0 ? machine.fuel_oil / burn : 0;
    const effectiveHours = Math.min(elapsedHours, maxHoursByFuel);

    if (effectiveHours <= 0) {
      machineUpdates.push({
        id: machine.id,
        fuel_oil: machine.fuel_oil,
        is_active: false,
        last_processed_at: machine.last_processed_at,
      });
      continue;
    }

    const actions = Math.floor(effectiveHours * speed);
    const oilUsed = effectiveHours * burn;
    const fuelRemaining = Math.max(0, machine.fuel_oil - oilUsed);

    if (actions > 0) {
      for (let i = 0; i < actions; i++) {
        for (const [mineral, def] of Object.entries(mineralDefs)) {
          if (Math.random() < def.drop_rate) {
            minerals[mineral] = (minerals[mineral] || 0) + 1;
          }
        }
        if (Math.random() < diamondDrop) {
          if (dailyCount < diamondCap) {
            diamondBalance += 1;
            dailyCount += 1;
          } else if (excessDiamondOilValue > 0) {
            oilBalance += excessDiamondOilValue;
          }
        }
      }
    }

    const newLast = new Date(last + effectiveHours * MS_PER_HOUR).toISOString();
    machineUpdates.push({
      id: machine.id,
      fuel_oil: fuelRemaining,
      is_active: fuelRemaining > 0,
      last_processed_at: newLast,
    });
  }

  await admin
    .from('player_state')
    .update({
      minerals,
      oil_balance: oilBalance,
      diamond_balance: diamondBalance,
      daily_diamond_count: dailyCount,
      daily_diamond_reset_at: new Date(resetAt).toISOString(),
      last_active_at: new Date(now).toISOString(),
    })
    .eq('user_id', userId);

  if (machineUpdates.length > 0) {
    for (const update of machineUpdates) {
      await admin
        .from('player_machines')
        .update(update)
        .eq('id', update.id);
    }
  }

  const refreshedMachines = await getPlayerMachines(userId);

  return { state: { ...state, minerals, oil_balance: oilBalance, diamond_balance: diamondBalance, daily_diamond_count: dailyCount, daily_diamond_reset_at: new Date(resetAt).toISOString() }, machines: refreshedMachines };
}

export function getTankCapacity(config: GameConfig, type: string, level: number) {
  const base = config.machines[type]?.tank_capacity ?? 0;
  return getMultiplier(base, level, config.progression.level_capacity_multiplier);
}

export function getUpgradeCost(config: GameConfig, type: string, level: number) {
  const base = config.machines[type]?.cost_oil ?? 0;
  return Math.floor(base * level * config.progression.upgrade_cost_multiplier);
}
