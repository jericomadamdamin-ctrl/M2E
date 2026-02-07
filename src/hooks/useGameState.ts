import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [player, setPlayer] = useState<PlayerState>({
    oilBalance: 0,
    diamondBalance: 0,
    minerals: defaultMinerals,
  });
  const [machines, setMachines] = useState<Machine[]>([]);
  const [profile, setProfile] = useState<{ playerName?: string; isAdmin?: boolean; isHumanVerified?: boolean; referralCode?: string; referralCount?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Prevent concurrent refreshes while a mutation is in-flight (avoids UI lag + DB row lock contention).
  const isFetchingRef = useRef(false);
  const isMutatingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);

  const handleAuthFailure = (message: string) => {
    if (/session expired|invalid session token|missing authorization|missing app session token/i.test(message)) {
      clearSession();
      navigate('/auth', { replace: true });
      return true;
    }
    return false;
  };

  const refresh = useCallback(async (showLoading = false, force = false) => {
    // Prevent concurrent refreshes unless forced
    if (isFetchingRef.current && !force) return;
    // Avoid racing refreshes with actions (they touch the same rows) unless forced
    if (isMutatingRef.current && !force) return;

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
          referralCode: response.profile.referral_code,
          referralCount: response.profile.referral_count || 0,
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
    // Optimistic UX for start/stop so the game feels instant.
    const machineId = (payload?.machineId as string | undefined) ?? undefined;
    const prevMachine = machineId ? machines.find((m) => m.id === machineId) : undefined;
    const prevIsActive = prevMachine?.isActive;
    const prevLastProcessedAt = prevMachine?.lastProcessedAt;
    const prevFuelOil = prevMachine?.fuelOil;

    if (machineId && action === 'start_machine') {
      const nowIso = new Date().toISOString();
      setMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, isActive: true, lastProcessedAt: nowIso } : m
        )
      );
    }
    if (machineId && action === 'stop_machine') {
      const nowIso = new Date().toISOString();
      setMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, isActive: false, lastProcessedAt: nowIso } : m
        )
      );
    }
    if (machineId && action === 'fuel_machine') {
      // Calculate optimistic fuel amount
      const amount = (payload?.amount as number | undefined) ?? undefined;
      setMachines((prev) =>
        prev.map((m) => {
          if (m.id !== machineId) return m;
          // Ideally calculate capacity, but for now just fill it optimistically or add amount
          // We don't have capacity here easily without config, but we can assume full fuel if amount is undefined
          // Or we can just set fuel to a high number as a placeholder until refresh
          // Better: fetch config to know capacity? We have config in state.
          // Let's just set it to 'full' based on visual feedback or just +amount if provided.
          // Since we don't have easy access to config inside this callback without dependency issues or stale closures,
          // let's just optimistically update the UI to show 'full' if no amount, or +amount.
          // Actually, we can use the `config` state if we add it to dependency array, but let's keep it simple.
          // We will rely on the backend response to correct it, but for now, let's just make it look full.
          return { ...m, fuelOil: 10000 }; // Placeholder high value to show full bar temporarily
        })
      );
    }

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

      // Success Toasts
      if (action === 'buy_machine') {
        toast({ title: 'Machine Purchased!', description: `You bought a ${payload?.machineType} machine.`, className: 'glow-green' });
      } else if (action === 'upgrade_machine') {
        toast({ title: 'Upgrade Complete!', description: 'Machine upgraded successfully.', className: 'glow-green' });
      } else if (action === 'fuel_machine') {
        toast({ title: 'Refueled!', description: 'Machine tank refilled.', className: 'glow-green' });
      } else if (action === 'exchange_minerals') {
        toast({ title: 'Exchange Successful!', description: 'Minerals exchanged for OIL.', className: 'glow-green' });
      } else if (action === 'start_machine') {
        toast({ title: 'Mining Started!', description: 'Machine is now active.', className: 'glow-green' });
      } else if (action === 'stop_machine') {
        toast({ title: 'Mining Stopped', description: 'Machine halted.' });
      }
    } catch (err) {
      const message = getErrorMessage(err);
      if (handleAuthFailure(message)) {
        return;
      }
      // Revert optimistic start/stop on failure.
      if (machineId && (action === 'start_machine' || action === 'stop_machine' || action === 'fuel_machine') && prevMachine) {
        setMachines((prev) =>
          prev.map((m) =>
            m.id === machineId
              ? {
                ...m,
                isActive: Boolean(prevIsActive),
                lastProcessedAt: prevLastProcessedAt ?? null,
                fuelOil: Number(prevFuelOil)
              }
              : m
          )
        );
      }
      toast({
        title: 'Action Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      isMutatingRef.current = false;
    }
  }, [toast, machines, handleAuthFailure]);

  const buyMachine = useCallback((type: MachineType) => executeAction('buy_machine', { machineType: type }), [executeAction]);
  const fuelMachine = useCallback((machineId: string, amount?: number) => executeAction('fuel_machine', { machineId, amount }), [executeAction]);
  const startMachine = useCallback((machineId: string) => executeAction('start_machine', { machineId }), [executeAction]);
  const stopMachine = useCallback((machineId: string) => executeAction('stop_machine', { machineId }), [executeAction]);
  const upgradeMachine = useCallback((machineId: string) => executeAction('upgrade_machine', { machineId }), [executeAction]);
  const exchangeMineral = useCallback((mineral: MineralType, amount: number) => executeAction('exchange_minerals', { mineral, amount }), [executeAction]);

  const mutateState = useCallback((updater: (prev: PlayerState) => PlayerState) => {
    setPlayer(updater);
  }, []);

  return {
    config,
    player,
    machines,
    loading,
    error,
    profile,
    refresh: (force = false) => refresh(true, force),
    mutateState,
    buyMachine,
    fuelMachine,
    startMachine,
    stopMachine,
    upgradeMachine,
    exchangeMineral,
  };
};
