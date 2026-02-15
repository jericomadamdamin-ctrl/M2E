import { useState, useCallback, useEffect } from 'react';
import {
  requestAutoExchange,
  getAutoExchangeConfig,
  updateAutoExchangeConfig,
  getAutoExchangeStatus,
} from '@/lib/backend';

export interface AutoExchangeConfig {
  user_id: string;
  enabled: boolean;
  slippage_tolerance: number;
  min_wld_amount: number;
  auto_retry: boolean;
}

export interface ExchangeRequest {
  id: string;
  diamond_amount: number;
  wld_target_amount: number;
  wld_received?: number;
  status: string;
  slippage_tolerance: number;
  tx_hash?: string;
  error_message?: string;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export function useAutoExchange() {
  const [config, setConfig] = useState<AutoExchangeConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user config
  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAutoExchangeConfig();
      setConfig(response.config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch config';
      setError(message);
      console.error('Error fetching config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Update config
  const updateConfig = useCallback(
    async (updates: {
      enabled?: boolean;
      slippageTolerance?: number;
      minWldAmount?: number;
      autoRetry?: boolean;
    }) => {
      try {
        setLoading(true);
        setError(null);
        const response = await updateAutoExchangeConfig(updates);
        setConfig(response.config);
        return response.config;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update config';
        setError(message);
        console.error('Error updating config:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Request exchange
  const requestExchange = useCallback(
    async (diamondAmount: number, slippageTolerance: number) => {
      try {
        setLoading(true);
        setError(null);
        const response = await requestAutoExchange(diamondAmount, slippageTolerance);
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to request exchange';
        setError(message);
        console.error('Error requesting exchange:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Get status
  const getStatus = useCallback(
    async (requestId?: string, limit?: number, offset?: number) => {
      try {
        setLoading(true);
        setError(null);
        const response = await getAutoExchangeStatus(requestId, limit, offset);
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch status';
        setError(message);
        console.error('Error fetching status:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Auto-fetch config on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    loading,
    error,
    fetchConfig,
    updateConfig,
    requestExchange,
    getStatus,
  };
}
