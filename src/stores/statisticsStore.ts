import { create } from 'zustand';
import type { JournalStatistics, TimeGranularity } from '../lib/types';

interface StatisticsState {
  viewMode: 'logs' | 'statistics';
  granularity: TimeGranularity;
  statistics: JournalStatistics | null;
  isLoading: boolean;
  error: string | null;

  setViewMode: (mode: 'logs' | 'statistics') => void;
  setGranularity: (granularity: TimeGranularity) => void;
  setStatistics: (statistics: JournalStatistics | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useStatisticsStore = create<StatisticsState>((set) => ({
  viewMode: 'logs',
  granularity: 'auto',
  statistics: null,
  isLoading: false,
  error: null,

  setViewMode: (viewMode) => set({ viewMode }),
  setGranularity: (granularity) => set({ granularity }),
  setStatistics: (statistics) => set({ statistics }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
