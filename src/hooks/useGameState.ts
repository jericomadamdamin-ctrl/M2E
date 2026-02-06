import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGameState, gameAction } from '@/lib/backend';
import { clearSession, getSession } from '@/lib/session';
import { GameConfig, Machine, PlayerState, GameStateResponse, MachineType, MineralType } from '@/types/game';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/lib/error';

const defaultMinerals: Record<MineralType, number> = {
  bronze: 0,
  silver: 0,
  gold: 0,
  iron: 0,
};

const mapState = (response: GameStateResponse) => {
  const state: PlayerState = {
    oilBalance: Number(response.state.oil_balance || 0),
    diamondBalance: Number(response.state.diamond_balance || 0),
    minerals: { ...defaultMinerals, ...(response.state.minerals || {}) },
  };

  const machines: Machine[] = response.machines.map((m) => ({
    id: m.id,
    type: m.type,
    level: m.level,
    fuelOil: Number(m.fuel_oil || 0),
    isActive: Boolean(m.is_active),
    lastProcessedAt: m.last_processed_at ?? null,
  }));

  return { state, machines, config: response.config };
};

export const useGameState = () => {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [player, setPlayer] = useState<PlayerState>({
    oilBalance: 0,
    diamondBalance: 0,
    minerals: defaultMinerals,
  });
  const [machines, setMachines] = useState<Machine[]>([]);
  const [profile, setProfile] = useState<{ playerName?: string; isAdmin?: boolean; isHumanVerified?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Prevent concurrent fetches
  const isFetchingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);

  const handleAuthFailure = (message: string) => {
    if (/session expired|invalid session token|missing authorization/i.test(message)) {
      clearSession();
      window.location.href = '/auth';
      return true;
    }
    return false;
  };

  const refresh = useCallback(async (showLoading = false) => {
    // Prevent concurrent refreshes
    if (isFetchingRef.current) return;

    const session = getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    isFetchingRef.current = true;
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const response = await fetchGameState();
      const mapped = mapState(response);
      setConfig(mapped.config);
      setPlayer(mapped.state);
      setMachines(mapped.machines);
      if (response.profile) {
        setProfile({
          playerName: response.profile.player_name || 'Miner',
          isAdmin: Boolean(response.profile.is_admin),
          isHumanVerified: Boolean(response.profile.is_human_verified),
        });
      }
    } catch (err) {
      const message = getErrorMessage(err);
      if (!handleAuthFailure(message)) {
        setError(message);
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Initial fetch only - runs once
  useEffect(() => {
    if (!initialFetchDoneRef.current) {
      initialFetchDoneRef.current = true;
      refresh(true);
    }
  }, [refresh]);

  // Single polling effect with visibility-aware interval
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);

      // Poll every 10s when visible, 60s when hidden (reduced from 5s/30s)
      const isVisible = document.visibilityState === 'visible';
      const delay = isVisible ? 10000 : 60000;

      intervalId = setInterval(() => {
        refresh(false); // Don't show loading spinner for background refreshes
      }, delay);
    };

    const handleVisibilityChange = () => {
      startPolling();
      if (document.visibilityState === 'visible') {
        refresh(false); // Immediate refresh when returning to tab
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startPolling();

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refresh]);

  const executeAction = useCallback(async (action: string, payload?: Record<string, unknown>) => {
    try {
      const result = await gameAction(action, payload);
      if (result?.state) {
        setPlayer((prev) => ({
          ...prev,
          oilBalance: Number(result.state.oil_balance ?? prev.oilBalance),
          diamondBalance: Number(result.state.diamond_balance ?? prev.diamondBalance),
          minerals: { ...defaultMinerals, ...(result.state.minerals ?? prev.minerals) },
        }));
      }
      if (result?.machines) {
        setMachines(
          result.machines.map((m) => ({
            id: m.id,
            type: m.type,
            level: m.level,
            fuelOil: Number(m.fuel_oil || 0),
            isActive: Boolean(m.is_active),
            lastProcessedAt: m.last_processed_at ?? null,
          }))
        );
      }
    } catch (err) {
      const message = getErrorMessage(err);
      if (handleAuthFailure(message)) {
        return;
      }
      toast({
        title: 'Action Failed',
        description: message,
        variant: 'destructive',
      });
    }
  }, [toast]);

  const buyMachine = useCallback((type: MachineType) => executeAction('buy_machine', { machineType: type }), [executeAction]);
  const fuelMachine = useCallback((machineId: string, amount?: number) => executeAction('fuel_machine', { machineId, amount }), [executeAction]);
  const startMachine = useCallback((machineId: string) => executeAction('start_machine', { machineId }), [executeAction]);
  const stopMachine = useCallback((machineId: string) => executeAction('stop_machine', { machineId }), [executeAction]);
  const upgradeMachine = useCallback((machineId: string) => executeAction('upgrade_machine', { machineId }), [executeAction]);
  const exchangeMineral = useCallback((mineral: MineralType, amount: number) => executeAction('exchange_minerals', { mineral, amount }), [executeAction]);

  return {
    config,
    player,
    machines,
    loading,
    error,
    profile,
    refresh: () => refresh(true),
    buyMachine,
    fuelMachine,
    startMachine,
    stopMachine,
    upgradeMachine,
    exchangeMineral,
  };
};
