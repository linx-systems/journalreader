import { useCallback, useEffect } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { useStatisticsStore } from '../stores/statisticsStore';
import { getStatistics } from '../lib/tauri';
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

      const result = await getStatistics({
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
      });

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
  }, [viewMode, filter, granularity, fetchStatistics]);

  return {
    statistics,
    isLoading,
    error,
    refresh: fetchStatistics,
  };
}
