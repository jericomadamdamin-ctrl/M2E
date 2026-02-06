import { supabase } from '@/integrations/supabase/client';
import { GameStateResponse } from '@/types/game';
import { getSessionToken } from '@/lib/session';

export const authHeaders = () => {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function fetchGameState(): Promise<GameStateResponse> {
  const { data, error } = await supabase.functions.invoke('game-state', {
    headers: authHeaders(),
  });
  if (error) throw error;
  return data as GameStateResponse;
}

export async function gameAction(action: string, payload?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('game-action', {
    headers: authHeaders(),
    body: { action, payload },
  });
  if (error) throw error;
  // biome-ignore lint/suspicious/noExplicitAny: Backend response type
  return data as { state: GameStateResponse['state']; machines: GameStateResponse['machines'] };
}

export async function fetchConfig() {
  const { data, error } = await supabase.functions.invoke('config-get', {
    headers: authHeaders(),
  });
  if (error) throw error;
  // biome-ignore lint/suspicious/noExplicitAny: Backend response type
  return data as { config: GameStateResponse['config'] };
}

export async function updateConfig(updates: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('config-set', {
    headers: authHeaders(),
    body: { updates },
  });
  if (error) throw error;
  // biome-ignore lint/suspicious/noExplicitAny: Backend response type
  return data as { config: GameStateResponse['config'] };
}

export async function requestCashout(diamonds: number) {
  const { data, error } = await supabase.functions.invoke('cashout-request', {
    headers: authHeaders(),
    body: { diamonds },
  });
  if (error) throw error;
  return data as { success: boolean; message?: string };
}

export async function getAuthNonce() {
  const { data, error } = await supabase.functions.invoke('auth-nonce');
  if (error) await handleFunctionError(error);
  return data as { nonce: string };
}

// Helper to extract error message from Edge Function response
async function handleFunctionError(error: any) {
  if (error && typeof error === 'object' && 'context' in error) {
    // Attempt to parse the response body from the error context
    try {
      const body = await error.context.json();
      if (body && typeof body === 'object' && 'error' in body) {
        throw new Error(body.error);
      }
    } catch {
      // ignore parse error types
    }
  }
  throw error;
}

export async function completeWalletAuth(payload: unknown, nonce: string, playerName?: string, username?: string) {
  const { data, error } = await supabase.functions.invoke('auth-complete', {
    body: { payload, nonce, player_name: playerName, username },
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
