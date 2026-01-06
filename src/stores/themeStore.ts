import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '../lib/theme';
import {
  LIGHT_THEME,
  DARK_THEME,
  BUILT_IN_THEMES,
  validateTheme,
  createCustomTheme,
} from '../lib/theme';

const STORAGE_KEY = 'journal-reader-theme';

interface ThemeState {
  currentThemeId: string;
  customThemes: Theme[];
  followSystem: boolean;

  // Computed
  getCurrentTheme: () => Theme;
  getAllThemes: () => Theme[];

  // Actions
  setTheme: (themeId: string) => void;
  setFollowSystem: (follow: boolean) => void;
  addCustomTheme: (theme: Theme) => void;
  updateCustomTheme: (themeId: string, updates: Partial<Theme>) => void;
  deleteCustomTheme: (themeId: string) => void;
  duplicateTheme: (themeId: string) => Theme | null;
  importTheme: (theme: Theme) => void;
}

function getSystemTheme(): Theme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? DARK_THEME
      : LIGHT_THEME;
  }
  return LIGHT_THEME;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      currentThemeId: 'dark',
      customThemes: [],
      followSystem: false,

      getCurrentTheme: () => {
        const state = get();
        if (state.followSystem) {
          return getSystemTheme();
        }
        const allThemes = [...BUILT_IN_THEMES, ...state.customThemes];
        return allThemes.find((t) => t.id === state.currentThemeId) || DARK_THEME;
      },

      getAllThemes: () => {
        const state = get();
        return [...BUILT_IN_THEMES, ...state.customThemes];
      },

      setTheme: (themeId) => {
        set({ currentThemeId: themeId, followSystem: false });
      },

      setFollowSystem: (follow) => {
        set({ followSystem: follow });
      },

      addCustomTheme: (theme) => {
        if (!validateTheme(theme)) return;
        set((state) => ({
          customThemes: [...state.customThemes, { ...theme, isBuiltIn: false }],
        }));
      },

      updateCustomTheme: (themeId, updates) => {
        set((state) => ({
          customThemes: state.customThemes.map((t) =>
            t.id === themeId ? { ...t, ...updates, isBuiltIn: false } : t
          ),
        }));
      },

      deleteCustomTheme: (themeId) => {
        const state = get();
        const theme = state.customThemes.find((t) => t.id === themeId);
        if (!theme || theme.isBuiltIn) return;

        set((state) => {
          const newCustomThemes = state.customThemes.filter((t) => t.id !== themeId);
          const newCurrentThemeId =
            state.currentThemeId === themeId ? 'dark' : state.currentThemeId;
          return {
            customThemes: newCustomThemes,
            currentThemeId: newCurrentThemeId,
          };
        });
      },

      duplicateTheme: (themeId) => {
        const state = get();
        const allThemes = [...BUILT_IN_THEMES, ...state.customThemes];
        const baseTheme = allThemes.find((t) => t.id === themeId);
        if (!baseTheme) return null;

        const newTheme = createCustomTheme(baseTheme, {
          id: `custom-${Date.now()}`,
          name: `${baseTheme.name} (Copy)`,
        });

        set((state) => ({
          customThemes: [...state.customThemes, newTheme],
        }));

        return newTheme;
      },

      importTheme: (theme) => {
        if (!validateTheme(theme)) return;
        const newTheme = {
          ...theme,
          id: `imported-${Date.now()}`,
          isBuiltIn: false,
        };
        set((state) => ({
          customThemes: [...state.customThemes, newTheme],
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        currentThemeId: state.currentThemeId,
        customThemes: state.customThemes,
        followSystem: state.followSystem,
      }),
    }
  )
);

// Listen for system theme changes
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const state = useThemeStore.getState();
    if (state.followSystem) {
      // Force a re-render by triggering a state update
      useThemeStore.setState({});
    }
  });
}
