import { create } from 'zustand';
import type { AppError } from '../lib/errorLogger';

interface ErrorState {
  errors: AppError[];
  addError: (error: AppError) => void;
  clearError: (id: string) => void;
  clearAll: () => void;
}

export const useErrorStore = create<ErrorState>((set) => ({
  errors: [],

  addError: (error) =>
    set((state) => ({
      errors: [...state.errors, error],
    })),

  clearError: (id) =>
    set((state) => ({
      errors: state.errors.filter((e) => e.id !== id),
    })),

  clearAll: () => set({ errors: [] }),
}));
