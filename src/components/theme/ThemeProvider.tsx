import { useEffect } from 'react';
import { useThemeStore } from '../../stores/themeStore';
import type { Theme } from '../../lib/theme';

function applyThemeToDocument(theme: Theme): void {
  const root = document.documentElement;

  // Set color scheme for browser UI
  root.style.colorScheme = theme.isDark ? 'dark' : 'light';

  // Base colors
  root.style.setProperty('--color-background', theme.colors.background);
  root.style.setProperty('--color-background-secondary', theme.colors.backgroundSecondary);
  root.style.setProperty('--color-foreground', theme.colors.foreground);
  root.style.setProperty('--color-foreground-secondary', theme.colors.foregroundSecondary);
  root.style.setProperty('--color-accent', theme.colors.accent);
  root.style.setProperty('--color-accent-hover', theme.colors.accentHover);
  root.style.setProperty('--color-selection', theme.colors.selection);
  root.style.setProperty('--color-border', theme.colors.border);

  // Priority colors
  root.style.setProperty('--color-priority-emergency', theme.colors.priority.emergency);
  root.style.setProperty('--color-priority-alert', theme.colors.priority.alert);
  root.style.setProperty('--color-priority-critical', theme.colors.priority.critical);
  root.style.setProperty('--color-priority-error', theme.colors.priority.error);
  root.style.setProperty('--color-priority-warning', theme.colors.priority.warning);
  root.style.setProperty('--color-priority-notice', theme.colors.priority.notice);
  root.style.setProperty('--color-priority-info', theme.colors.priority.info);
  root.style.setProperty('--color-priority-debug', theme.colors.priority.debug);

  // Priority background colors
  root.style.setProperty('--color-priority-bg-emergency', theme.colors.priorityBg.emergency);
  root.style.setProperty('--color-priority-bg-alert', theme.colors.priorityBg.alert);
  root.style.setProperty('--color-priority-bg-critical', theme.colors.priorityBg.critical);
  root.style.setProperty('--color-priority-bg-error', theme.colors.priorityBg.error);
  root.style.setProperty('--color-priority-bg-warning', theme.colors.priorityBg.warning);
  root.style.setProperty('--color-priority-bg-notice', theme.colors.priorityBg.notice);
  root.style.setProperty('--color-priority-bg-info', theme.colors.priorityBg.info);
  root.style.setProperty('--color-priority-bg-debug', theme.colors.priorityBg.debug);

  // Typography
  root.style.setProperty('--font-family', theme.typography.fontFamily);
  root.style.setProperty('--font-size', `${theme.typography.fontSize}px`);
  root.style.setProperty('--line-height', String(theme.typography.lineHeight));

  // Set data attribute for conditional styling
  root.dataset.theme = theme.id;
  root.dataset.dark = theme.isDark ? 'true' : 'false';
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps): React.ReactElement {
  const getCurrentTheme = useThemeStore((state) => state.getCurrentTheme);
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const followSystem = useThemeStore((state) => state.followSystem);
  const customThemes = useThemeStore((state) => state.customThemes);

  useEffect(() => {
    const theme = getCurrentTheme();
    applyThemeToDocument(theme);
  }, [getCurrentTheme, currentThemeId, followSystem, customThemes]);

  // Listen for system theme changes when following system
  useEffect(() => {
    if (!followSystem) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const theme = getCurrentTheme();
      applyThemeToDocument(theme);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [followSystem, getCurrentTheme]);

  return <>{children}</>;
}

export default ThemeProvider;
