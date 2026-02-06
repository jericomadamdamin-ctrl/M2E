import { useCallback, useState } from 'react';
import { AppSession, clearSession as clearStoredSession, getSession, setSession as storeSession } from '@/lib/session';

export const useSession = () => {
  const [session, setSessionState] = useState<AppSession | null>(() => getSession());

  const setSession = useCallback((next: AppSession) => {
    storeSession(next);
    setSessionState(next);
  }, []);

  const clearSession = useCallback(() => {
    clearStoredSession();
    setSessionState(null);
  }, []);

  return { session, setSession, clearSession };
};
