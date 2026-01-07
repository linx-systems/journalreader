import { useEffect, useState } from 'react';
import { listUnits, listBoots } from '../lib/tauri';
import type { SystemUnit, BootInfo } from '../lib/types';

export function useUnits() {
  const [units, setUnits] = useState<SystemUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUnits() {
      try {
        setIsLoading(true);
        const result = await listUnits();
        setUnits(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    }

    fetchUnits();
  }, []);

  return { units, isLoading, error };
}

export function useBoots() {
  const [boots, setBoots] = useState<BootInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBoots = async () => {
    try {
      setIsLoading(true);
      const result = await listBoots();
      setBoots(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBoots();
  }, []);

  const refresh = () => {
    fetchBoots();
  };

  return { boots, isLoading, error, refresh };
}
