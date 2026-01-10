import { useCallback, useEffect, useRef } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { useStatisticsStore } from '../stores/statisticsStore';
import { useConnectionStore } from '../stores/connectionStore';
import { getStatistics, getRemoteStatistics } from '../lib/tauri';
import { computeGranularityMs } from '../lib/statistics';

export function useStatistics() {
  const { filter } = useFilterStore();
  const {
    viewMode,
    granularity,
    statistics,
    isLoading,
    error,
    setStatistics,
    setLoading,
    setError,
  } = useStatisticsStore();

  const { connectedHostId, connectionStatus } = useConnectionStore();
  const isRemote = connectionStatus === 'connected' && connectedHostId !== null;
  const isRemoteRef = useRef(isRemote);
  isRemoteRef.current = isRemote;

  const fetchStatistics = useCallback(async () => {
    if (viewMode !== 'statistics') return;

    setLoading(true);
    setError(null);

    try {
      const granularityMs = computeGranularityMs(
        granularity,
        filter.since,
        filter.until
      );

      const request = {
        units: filter.units,
        excludedUnits: filter.excludedUnits,
        priorities: filter.priorities,
        since: filter.since,
        until: filter.until,
        grepPattern: filter.grepPattern,
        caseSensitive: filter.caseSensitive,
        bootId: filter.bootId,
        bootOffset: filter.bootOffset,
        identifier: filter.identifier,
        granularityMs,
      };

      const result = isRemoteRef.current
        ? await getRemoteStatistics(request)
        : await getStatistics(request);

      setStatistics(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [
    filter,
    viewMode,
    granularity,
    setStatistics,
    setLoading,
    setError,
  ]);

  useEffect(() => {
    if (viewMode === 'statistics') {
      fetchStatistics();
    }
  }, [viewMode, filter, granularity, isRemote, fetchStatistics]);

  return {
    statistics,
    isLoading,
    error,
    refresh: fetchStatistics,
  };
}
