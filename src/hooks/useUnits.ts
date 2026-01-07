import { useEffect, useState, useCallback } from 'react';
import { listUnits, listBoots, listRemoteUnits, listRemoteBoots } from '../lib/tauri';
import { useConnectionStore } from '../stores/connectionStore';
import type { SystemUnit, BootInfo } from '../lib/types';

export function useUnits() {
  const [units, setUnits] = useState<SystemUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { connectedHostId, connectionStatus } = useConnectionStore();
  const isRemote = connectionStatus === 'connected' && connectedHostId !== null;

  const fetchUnits = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = isRemote ? await listRemoteUnits() : await listUnits();
      setUnits(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [isRemote]);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  return { units, isLoading, error, refresh: fetchUnits };
}

export function useBoots() {
  const [boots, setBoots] = useState<BootInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { connectedHostId, connectionStatus } = useConnectionStore();
  const isRemote = connectionStatus === 'connected' && connectedHostId !== null;

  const fetchBoots = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = isRemote ? await listRemoteBoots() : await listBoots();
      setBoots(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [isRemote]);

  useEffect(() => {
    fetchBoots();
  }, [fetchBoots]);

  return { boots, isLoading, error, refresh: fetchBoots };
}
