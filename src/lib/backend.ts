import { supabase } from '@/integrations/supabase/client';
import { GameStateResponse } from '@/types/game';
import { getSessionToken } from '@/lib/session';

export const authHeaders = () => {
  const token = getSessionToken();
  // Do not override `Authorization` because Supabase Edge Functions may require a valid
  // Supabase JWT there. We send our app session token in a separate header.
  return token ? { 'x-app-session': token } : {};
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
async function handleFunctionError(error: any): Promise<never> {
  let message = 'Request to edge function failed';

  if (error && typeof error === 'object') {
    // Check if there's a context Response we can parse
    if ('context' in error && error.context instanceof Response) {
      try {
        const ctx: Response = error.context;
        const json = await ctx.clone().json().catch(() => null);
        if (json && typeof json === 'object' && 'error' in json) {
          message = (json as any).error;
        } else {
          const text = await ctx.clone().text().catch(() => '');
          if (text) {
            message = text;
          }
        }
      } catch {
        // ignore parse errors
      }
    } else if ('message' in error && typeof error.message === 'string') {
      message = error.message;
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  throw new Error(message);
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
