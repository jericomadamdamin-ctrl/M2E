export interface AppSession {
  token: string;
  userId: string;
  playerName?: string;
  isAdmin?: boolean;
  isHumanVerified?: boolean;
}

const STORAGE_KEY = 'mine_to_earn_session';

export const getSession = (): AppSession | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppSession;
  } catch {
    return null;
  }
};

export const setSession = (session: AppSession) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const clearSession = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const getSessionToken = () => getSession()?.token || null;
