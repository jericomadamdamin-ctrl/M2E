import { useCallback, useEffect, useState } from 'react';
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

  const handleAuthFailure = (message: string) => {
    if (/session expired|invalid session token|missing authorization/i.test(message)) {
      clearSession();
      window.location.href = '/auth';
      return true;
    }
    return false;
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = getSession();
      if (!session) {
        setLoading(false);
        return;
      }
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    // Session changes are handled by consumers (Auth/Index) via localStorage.
    const interval = setInterval(() => {
      const session = getSession();
      if (!session) {
        setPlayer({ oilBalance: 0, diamondBalance: 0, minerals: defaultMinerals });
        setMachines([]);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);

      // Poll faster (5s) when visible, slower (30s) when hidden
      const isVisible = document.visibilityState === 'visible';
      const delay = isVisible ? 5000 : 30000;

      intervalId = setInterval(() => {
        refresh();
      }, delay);
    };

    const handleVisibilityChange = () => {
      startPolling();
      if (document.visibilityState === 'visible') {
        refresh(); // Immediate refresh when returning to tab
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
      // Use toast for action errors instead of global state
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
    refresh,
    buyMachine,
    fuelMachine,
    startMachine,
    stopMachine,
    upgradeMachine,
    exchangeMineral,
  };
};
