import { supabase } from '@/integrations/supabase/client';
import { GameStateResponse } from '@/types/game';
import { getSessionToken } from '@/lib/session';

export const authHeaders = () => {
  const token = getSessionToken();
  // Do not override `Authorization` because Supabase Edge Functions may require a valid
  // Supabase JWT there. We send our app session token in a separate header.
  return token ? { 'x-app-session': token } : {};
};

function isEdgeErrorPayload(data: unknown): data is { error: string } {
  if (!data || typeof data !== 'object') return false;
  if (!('error' in data)) return false;
  return typeof (data as { error?: unknown }).error === 'string';
}

export async function fetchGameState(): Promise<GameStateResponse> {
  const { data, error } = await supabase.functions.invoke('game-state', {
    headers: authHeaders(),
  });
  if (error) await handleFunctionError(error);
  if (isEdgeErrorPayload(data)) {
    throw new Error(data.error);
  }
  return data as GameStateResponse;
}

export async function gameAction(action: string, payload?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('game-action', {
    headers: authHeaders(),
    body: { action, payload },
  });
  if (error) await handleFunctionError(error);
  if (isEdgeErrorPayload(data)) {
    throw new Error(data.error);
  }
  // biome-ignore lint/suspicious/noExplicitAny: Backend response type
  return data as { state: GameStateResponse['state']; machines: GameStateResponse['machines'] };
}

export async function fetchConfig() {
  const { data, error } = await supabase.functions.invoke('config-get', {
    headers: authHeaders(),
  });
  if (error) await handleFunctionError(error);
  if (isEdgeErrorPayload(data)) {
    throw new Error(data.error);
  }
  // biome-ignore lint/suspicious/noExplicitAny: Backend response type
  return data as { config: GameStateResponse['config'] };
}

export async function updateConfig(updates: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('config-set', {
    headers: authHeaders(),
    body: { updates },
  });
  if (error) await handleFunctionError(error);
  if (isEdgeErrorPayload(data)) {
    throw new Error(data.error);
  }
  // biome-ignore lint/suspicious/noExplicitAny: Backend response type
  return data as { config: GameStateResponse['config'] };
}

export async function requestCashout(diamonds: number) {
  const { data, error } = await supabase.functions.invoke('cashout-request', {
    headers: authHeaders(),
    body: { diamonds },
  });
  if (error) await handleFunctionError(error);
  if (isEdgeErrorPayload(data)) {
    throw new Error(data.error);
  }
  return data as { success: boolean; message?: string };
}

export async function getAuthNonce() {
  const { data, error } = await supabase.functions.invoke('auth-nonce');
  if (error) await handleFunctionError(error);
  return data as { nonce: string };
}

// Helper to extract error message from Edge Function response
async function handleFunctionError(error: unknown): Promise<never> {
  let message = 'Request to edge function failed';

  if (error && typeof error === 'object') {
    // Check if there's a context Response we can parse
    const maybeErr = error as { context?: unknown; message?: unknown };
    if (maybeErr.context instanceof Response) {
      try {
        const ctx: Response = maybeErr.context;
        const json = await ctx.clone().json().catch(() => null);
        if (isEdgeErrorPayload(json)) {
          message = json.error;
        } else {
          const text = await ctx.clone().text().catch(() => '');
          if (text) {
            message = text;
          }
        }
      } catch {
        // ignore parse errors
      }
    } else if (typeof maybeErr.message === 'string') {
      message = maybeErr.message;
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  throw new Error(message);
}

export async function completeWalletAuth(payload: unknown, nonce: string, playerName?: string, username?: string, referralCode?: string) {
  const { data, error } = await supabase.functions.invoke('auth-complete', {
    body: { payload, nonce, player_name: playerName, username, referral_code: referralCode },
  });
  if (error) await handleFunctionError(error);
  return data as {
    session: {
      token: string;
      user_id: string;
      player_name?: string;
      is_admin?: boolean;
      is_human_verified?: boolean;
    };
  };
}

export async function initiateOilPurchase(token: 'WLD' | 'USDC', oilAmount: number) {
  const { data, error } = await supabase.functions.invoke('oil-purchase-initiate', {
    headers: authHeaders(),
    body: { token, oil_amount: oilAmount },
  });
  if (error) await handleFunctionError(error);
  return data as {
    reference: string;
    token: 'WLD' | 'USDC';
    amount_token: number;
    amount_oil: number;
    to_address: string;
    description: string;
  };
}

export async function confirmOilPurchase(payload: unknown) {
  const { data, error } = await supabase.functions.invoke('oil-purchase-confirm', {
    headers: authHeaders(),
    body: { payload },
  });
  if (error) await handleFunctionError(error);
  return data as { status: string; oil_balance?: number };
}

export async function updateProfile(updates: { playerName?: string }) {
  const { data, error } = await supabase.functions.invoke('profile-update', {
    headers: authHeaders(),
    body: { player_name: updates.playerName },
  });
  if (error) await handleFunctionError(error);
  return data as { ok: boolean };
}

export async function initiateSlotPurchase() {
  const { data, error } = await supabase.functions.invoke('slot-purchase-initiate', {
    headers: authHeaders(),
    body: {},
  });
  if (error) await handleFunctionError(error);
  return data as {
    reference: string;
    slots_to_add: number;
    amount_wld: number;
    to_address: string;
    description: string;
    current_slots: number;
    new_max_slots: number;
  };
}

export async function confirmSlotPurchase(payload: unknown) {
  const { data, error } = await supabase.functions.invoke('slot-purchase-confirm', {
    headers: authHeaders(),
    body: payload,
  });
  if (error) await handleFunctionError(error);
  return data as { ok: boolean; slots_added: number };
}

export async function initiateMachinePurchase(machineType: string) {
  const { data, error } = await supabase.functions.invoke('machine-purchase-initiate', {
    headers: authHeaders(),
    body: { machineType },
  });
  if (error) await handleFunctionError(error);
  return data as {
    reference: string;
    machine_type: string;
    amount_wld: number;
    to_address: string;
    description: string;
  };
}

export async function confirmMachinePurchase(reference: string) {
  const { data, error } = await supabase.functions.invoke('machine-purchase-confirm', {
    headers: authHeaders(),
    body: { reference },
  });
  if (error) await handleFunctionError(error);
  // biome-ignore lint/suspicious/noExplicitAny: Machine type
  return data as { ok: boolean; machine: any; message: string };
}

export async function fetchAdminStats(accessKey?: string) {
  const headers = authHeaders();
  if (accessKey) headers['x-admin-key'] = accessKey;

  const { data, error } = await supabase.functions.invoke('admin-stats', {
    method: 'GET',
    headers,
  });
  if (error) await handleFunctionError(error);
  // biome-ignore lint/suspicious/noExplicitAny: Admin stats type
  return data as {
    open_rounds: any[];
    execution_rounds: any[];
  };
}

export async function processCashoutRound(roundId: string, accessKey?: string) {
  const headers = authHeaders();
  if (accessKey) headers['x-admin-key'] = accessKey;

  const { data, error } = await supabase.functions.invoke('cashout-process', {
    headers,
    body: { round_id: roundId },
  });
  if (error) await handleFunctionError(error);
  return data as { ok: boolean; total_diamonds: number; payout_pool: number };
}

export async function executeCashoutPayouts(roundId: string, accessKey?: string) {
  const headers = authHeaders() as Record<string, string>;
  if (accessKey) headers['x-admin-key'] = accessKey;

  const { data, error } = await supabase.functions.invoke('cashout-execute', {
    headers,
    body: { round_id: roundId },
  });
  if (error) await handleFunctionError(error);
  // biome-ignore lint/suspicious/noExplicitAny: Payout results
  return data as { ok: boolean; results: any[] };
}

export async function fetchTable(table: string, accessKey?: string) {
  const headers = authHeaders();
  if (accessKey) headers['x-admin-key'] = accessKey;

  const { data, error } = await supabase.functions.invoke('admin-db', {
    headers,
    body: { table, action: 'fetch' },
  });
  if (error) await handleFunctionError(error);
  return data;
}

export async function updateTableRow(table: string, id: string, updates: Record<string, unknown>, accessKey?: string) {
  const headers = authHeaders();
  if (accessKey) headers['x-admin-key'] = accessKey;

  const { data, error } = await supabase.functions.invoke('admin-db', {
    headers,
    body: { table, action: 'update', id, updates },
  });
  if (error) await handleFunctionError(error);
  return data;
}

export async function updateGlobalSetting(key: string, value: number, accessKey?: string) {
  const headers = authHeaders();
  if (accessKey) headers['x-admin-key'] = accessKey;

  const { data, error } = await supabase.functions.invoke('admin-db', {
    headers,
    body: { table: 'global_game_settings', action: 'update', id: key, updates: { value } },
  });
  if (error) await handleFunctionError(error);
  return data;
}
