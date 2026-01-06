export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  foreground: string;
  foregroundSecondary: string;
  accent: string;
  accentHover: string;
  selection: string;
  border: string;
  priority: {
    emergency: string;
    alert: string;
    critical: string;
    error: string;
    warning: string;
    notice: string;
    info: string;
    debug: string;
  };
  priorityBg: {
    emergency: string;
    alert: string;
    critical: string;
    error: string;
    warning: string;
    notice: string;
    info: string;
    debug: string;
  };
}

export interface ThemeTypography {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  monospace: boolean;
}

export interface Theme {
  id: string;
  name: string;
  isDark: boolean;
  isBuiltIn: boolean;
  colors: ThemeColors;
  typography: ThemeTypography;
}

export const DEFAULT_TYPOGRAPHY: ThemeTypography = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 14,
  lineHeight: 1.5,
  monospace: false,
};

export const MONOSPACE_TYPOGRAPHY: ThemeTypography = {
  fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
  fontSize: 13,
  lineHeight: 1.4,
  monospace: true,
};

export const LIGHT_THEME: Theme = {
  id: 'light',
  name: 'Light',
  isDark: false,
  isBuiltIn: true,
  colors: {
    background: '#ffffff',
    backgroundSecondary: '#f9fafb',
    foreground: '#111827',
    foregroundSecondary: '#6b7280',
    accent: '#3b82f6',
    accentHover: '#2563eb',
    selection: '#dbeafe',
    border: '#e5e7eb',
    priority: {
      emergency: '#dc2626',
      alert: '#ea580c',
      critical: '#d97706',
      error: '#ca8a04',
      warning: '#65a30d',
      notice: '#16a34a',
      info: '#0284c7',
      debug: '#6b7280',
    },
    priorityBg: {
      emergency: '#fee2e2',
      alert: '#ffedd5',
      critical: '#fef3c7',
      error: '#fef9c3',
      warning: '#ecfccb',
      notice: '#dcfce7',
      info: '#e0f2fe',
      debug: '#f3f4f6',
    },
  },
  typography: DEFAULT_TYPOGRAPHY,
};

export const DARK_THEME: Theme = {
  id: 'dark',
  name: 'Dark',
  isDark: true,
  isBuiltIn: true,
  colors: {
    background: '#030712',
    backgroundSecondary: '#111827',
    foreground: '#f9fafb',
    foregroundSecondary: '#9ca3af',
    accent: '#3b82f6',
    accentHover: '#60a5fa',
    selection: '#1e3a5f',
    border: '#374151',
    priority: {
      emergency: '#f87171',
      alert: '#fb923c',
      critical: '#fbbf24',
      error: '#facc15',
      warning: '#a3e635',
      notice: '#4ade80',
      info: '#38bdf8',
      debug: '#9ca3af',
    },
    priorityBg: {
      emergency: 'rgba(220, 38, 38, 0.2)',
      alert: 'rgba(234, 88, 12, 0.2)',
      critical: 'rgba(217, 119, 6, 0.2)',
      error: 'rgba(202, 138, 4, 0.2)',
      warning: 'rgba(101, 163, 13, 0.2)',
      notice: 'rgba(22, 163, 74, 0.2)',
      info: 'rgba(2, 132, 199, 0.2)',
      debug: 'rgba(107, 114, 128, 0.2)',
    },
  },
  typography: DEFAULT_TYPOGRAPHY,
};

export const HIGH_CONTRAST_THEME: Theme = {
  id: 'high-contrast',
  name: 'High Contrast',
  isDark: true,
  isBuiltIn: true,
  colors: {
    background: '#000000',
    backgroundSecondary: '#0a0a0a',
    foreground: '#ffffff',
    foregroundSecondary: '#d4d4d4',
    accent: '#00ff00',
    accentHover: '#33ff33',
    selection: '#004400',
    border: '#404040',
    priority: {
      emergency: '#ff0000',
      alert: '#ff6600',
      critical: '#ffcc00',
      error: '#ffff00',
      warning: '#99ff00',
      notice: '#00ff00',
      info: '#00ccff',
      debug: '#999999',
    },
    priorityBg: {
      emergency: 'rgba(255, 0, 0, 0.3)',
      alert: 'rgba(255, 102, 0, 0.3)',
      critical: 'rgba(255, 204, 0, 0.3)',
      error: 'rgba(255, 255, 0, 0.3)',
      warning: 'rgba(153, 255, 0, 0.3)',
      notice: 'rgba(0, 255, 0, 0.3)',
      info: 'rgba(0, 204, 255, 0.3)',
      debug: 'rgba(153, 153, 153, 0.3)',
    },
  },
  typography: DEFAULT_TYPOGRAPHY,
};

export const SOLARIZED_LIGHT_THEME: Theme = {
  id: 'solarized-light',
  name: 'Solarized Light',
  isDark: false,
  isBuiltIn: true,
  colors: {
    background: '#fdf6e3',
    backgroundSecondary: '#eee8d5',
    foreground: '#657b83',
    foregroundSecondary: '#93a1a1',
    accent: '#268bd2',
    accentHover: '#2aa198',
    selection: '#eee8d5',
    border: '#93a1a1',
    priority: {
      emergency: '#dc322f',
      alert: '#cb4b16',
      critical: '#b58900',
      error: '#b58900',
      warning: '#859900',
      notice: '#2aa198',
      info: '#268bd2',
      debug: '#93a1a1',
    },
    priorityBg: {
      emergency: 'rgba(220, 50, 47, 0.15)',
      alert: 'rgba(203, 75, 22, 0.15)',
      critical: 'rgba(181, 137, 0, 0.15)',
      error: 'rgba(181, 137, 0, 0.15)',
      warning: 'rgba(133, 153, 0, 0.15)',
      notice: 'rgba(42, 161, 152, 0.15)',
      info: 'rgba(38, 139, 210, 0.15)',
      debug: 'rgba(147, 161, 161, 0.15)',
    },
  },
  typography: DEFAULT_TYPOGRAPHY,
};

export const SOLARIZED_DARK_THEME: Theme = {
  id: 'solarized-dark',
  name: 'Solarized Dark',
  isDark: true,
  isBuiltIn: true,
  colors: {
    background: '#002b36',
    backgroundSecondary: '#073642',
    foreground: '#839496',
    foregroundSecondary: '#586e75',
    accent: '#268bd2',
    accentHover: '#2aa198',
    selection: '#073642',
    border: '#586e75',
    priority: {
      emergency: '#dc322f',
      alert: '#cb4b16',
      critical: '#b58900',
      error: '#b58900',
      warning: '#859900',
      notice: '#2aa198',
      info: '#268bd2',
      debug: '#586e75',
    },
    priorityBg: {
      emergency: 'rgba(220, 50, 47, 0.2)',
      alert: 'rgba(203, 75, 22, 0.2)',
      critical: 'rgba(181, 137, 0, 0.2)',
      error: 'rgba(181, 137, 0, 0.2)',
      warning: 'rgba(133, 153, 0, 0.2)',
      notice: 'rgba(42, 161, 152, 0.2)',
      info: 'rgba(38, 139, 210, 0.2)',
      debug: 'rgba(88, 110, 117, 0.2)',
    },
  },
  typography: DEFAULT_TYPOGRAPHY,
};

export const NORD_THEME: Theme = {
  id: 'nord',
  name: 'Nord',
  isDark: true,
  isBuiltIn: true,
  colors: {
    background: '#2e3440',
    backgroundSecondary: '#3b4252',
    foreground: '#eceff4',
    foregroundSecondary: '#d8dee9',
    accent: '#88c0d0',
    accentHover: '#8fbcbb',
    selection: '#434c5e',
    border: '#4c566a',
    priority: {
      emergency: '#bf616a',
      alert: '#d08770',
      critical: '#ebcb8b',
      error: '#ebcb8b',
      warning: '#a3be8c',
      notice: '#a3be8c',
      info: '#81a1c1',
      debug: '#4c566a',
    },
    priorityBg: {
      emergency: 'rgba(191, 97, 106, 0.2)',
      alert: 'rgba(208, 135, 112, 0.2)',
      critical: 'rgba(235, 203, 139, 0.2)',
      error: 'rgba(235, 203, 139, 0.2)',
      warning: 'rgba(163, 190, 140, 0.2)',
      notice: 'rgba(163, 190, 140, 0.2)',
      info: 'rgba(129, 161, 193, 0.2)',
      debug: 'rgba(76, 86, 106, 0.2)',
    },
  },
  typography: DEFAULT_TYPOGRAPHY,
};

export const DRACULA_THEME: Theme = {
  id: 'dracula',
  name: 'Dracula',
  isDark: true,
  isBuiltIn: true,
  colors: {
    background: '#282a36',
    backgroundSecondary: '#44475a',
    foreground: '#f8f8f2',
    foregroundSecondary: '#6272a4',
    accent: '#bd93f9',
    accentHover: '#ff79c6',
    selection: '#44475a',
    border: '#6272a4',
    priority: {
      emergency: '#ff5555',
      alert: '#ffb86c',
      critical: '#f1fa8c',
      error: '#f1fa8c',
      warning: '#50fa7b',
      notice: '#50fa7b',
      info: '#8be9fd',
      debug: '#6272a4',
    },
    priorityBg: {
      emergency: 'rgba(255, 85, 85, 0.2)',
      alert: 'rgba(255, 184, 108, 0.2)',
      critical: 'rgba(241, 250, 140, 0.2)',
      error: 'rgba(241, 250, 140, 0.2)',
      warning: 'rgba(80, 250, 123, 0.2)',
      notice: 'rgba(80, 250, 123, 0.2)',
      info: 'rgba(139, 233, 253, 0.2)',
      debug: 'rgba(98, 114, 164, 0.2)',
    },
  },
  typography: DEFAULT_TYPOGRAPHY,
};

export const MONOKAI_THEME: Theme = {
  id: 'monokai',
  name: 'Monokai',
  isDark: true,
  isBuiltIn: true,
  colors: {
    background: '#272822',
    backgroundSecondary: '#3e3d32',
    foreground: '#f8f8f2',
    foregroundSecondary: '#75715e',
    accent: '#a6e22e',
    accentHover: '#66d9ef',
    selection: '#49483e',
    border: '#75715e',
    priority: {
      emergency: '#f92672',
      alert: '#fd971f',
      critical: '#e6db74',
      error: '#e6db74',
      warning: '#a6e22e',
      notice: '#a6e22e',
      info: '#66d9ef',
      debug: '#75715e',
    },
    priorityBg: {
      emergency: 'rgba(249, 38, 114, 0.2)',
      alert: 'rgba(253, 151, 31, 0.2)',
      critical: 'rgba(230, 219, 116, 0.2)',
      error: 'rgba(230, 219, 116, 0.2)',
      warning: 'rgba(166, 226, 46, 0.2)',
      notice: 'rgba(166, 226, 46, 0.2)',
      info: 'rgba(102, 217, 239, 0.2)',
      debug: 'rgba(117, 113, 94, 0.2)',
    },
  },
  typography: DEFAULT_TYPOGRAPHY,
};

export const BUILT_IN_THEMES: Theme[] = [
  LIGHT_THEME,
  DARK_THEME,
  HIGH_CONTRAST_THEME,
  SOLARIZED_LIGHT_THEME,
  SOLARIZED_DARK_THEME,
  NORD_THEME,
  DRACULA_THEME,
  MONOKAI_THEME,
];

export function createCustomTheme(base: Theme, overrides: Partial<Theme>): Theme {
  return {
    ...base,
    ...overrides,
    id: overrides.id || `custom-${Date.now()}`,
    name: overrides.name || 'Custom Theme',
    isBuiltIn: false,
    colors: {
      ...base.colors,
      ...overrides.colors,
      priority: {
        ...base.colors.priority,
        ...(overrides.colors?.priority || {}),
      },
      priorityBg: {
        ...base.colors.priorityBg,
        ...(overrides.colors?.priorityBg || {}),
      },
    },
    typography: {
      ...base.typography,
      ...(overrides.typography || {}),
    },
  };
}

export function validateTheme(theme: unknown): theme is Theme {
  if (!theme || typeof theme !== 'object') return false;
  const t = theme as Record<string, unknown>;

  if (typeof t.id !== 'string' || !t.id) return false;
  if (typeof t.name !== 'string' || !t.name) return false;
  if (typeof t.isDark !== 'boolean') return false;

  if (!t.colors || typeof t.colors !== 'object') return false;
  const colors = t.colors as Record<string, unknown>;

  const requiredColorFields = [
    'background', 'backgroundSecondary', 'foreground', 'foregroundSecondary',
    'accent', 'accentHover', 'selection', 'border'
  ];

  for (const field of requiredColorFields) {
    if (typeof colors[field] !== 'string') return false;
  }

  if (!colors.priority || typeof colors.priority !== 'object') return false;
  if (!colors.priorityBg || typeof colors.priorityBg !== 'object') return false;

  const priorityFields = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'];
  const priority = colors.priority as Record<string, unknown>;
  const priorityBg = colors.priorityBg as Record<string, unknown>;

  for (const field of priorityFields) {
    if (typeof priority[field] !== 'string') return false;
    if (typeof priorityBg[field] !== 'string') return false;
  }

  if (!t.typography || typeof t.typography !== 'object') return false;
  const typography = t.typography as Record<string, unknown>;

  if (typeof typography.fontFamily !== 'string') return false;
  if (typeof typography.fontSize !== 'number') return false;
  if (typeof typography.lineHeight !== 'number') return false;
  if (typeof typography.monospace !== 'boolean') return false;

  return true;
}

export function exportTheme(theme: Theme): string {
  const exportable = { ...theme, isBuiltIn: false };
  return JSON.stringify(exportable, null, 2);
}

export function importTheme(json: string): Theme | null {
  try {
    const parsed = JSON.parse(json);
    if (validateTheme(parsed)) {
      return {
        ...parsed,
        id: `imported-${Date.now()}`,
        isBuiltIn: false,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const PRIORITY_KEYS = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'] as const;
export type PriorityKey = typeof PRIORITY_KEYS[number];

export function getPriorityKey(priority: number): PriorityKey {
  const mapping: Record<number, PriorityKey> = {
    0: 'emergency',
    1: 'alert',
    2: 'critical',
    3: 'error',
    4: 'warning',
    5: 'notice',
    6: 'info',
    7: 'debug',
  };
  return mapping[priority] || 'debug';
}
