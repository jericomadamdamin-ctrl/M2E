import { supabase } from '@/integrations/supabase/client';
import { GameStateResponse } from '@/types/game';
import { getSessionToken } from '@/lib/session';

const authHeaders = () => {
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
  return data as { state: any; machines: any[] };
}

export async function fetchConfig() {
  const { data, error } = await supabase.functions.invoke('config-get', {
    headers: authHeaders(),
  });
  if (error) throw error;
  return data as { config: any };
}

export async function updateConfig(updates: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('config-set', {
    headers: authHeaders(),
    body: { updates },
  });
  if (error) throw error;
  return data as { config: any };
}

export async function requestCashout(diamonds: number) {
  const { data, error } = await supabase.functions.invoke('cashout-request', {
    headers: authHeaders(),
    body: { diamonds },
  });
  if (error) throw error;
  return data as any;
}

export async function getAuthNonce() {
  const { data, error } = await supabase.functions.invoke('auth-nonce');
  if (error) throw error;
  return data as { nonce: string };
}

export async function completeWalletAuth(payload: any, nonce: string, playerName?: string, username?: string) {
  const { data, error } = await supabase.functions.invoke('auth-complete', {
    body: { payload, nonce, player_name: playerName, username },
  });
  if (error) throw error;
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
