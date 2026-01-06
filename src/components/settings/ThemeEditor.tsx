import { useState, useEffect } from 'react';
import { X, Save, RotateCcw, Moon, Sun, Type, Palette } from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore';
import type { Theme, ThemeColors, ThemeTypography } from '../../lib/theme';
import { PRIORITY_KEYS, LIGHT_THEME, DARK_THEME } from '../../lib/theme';
import { ThemePreview } from './ThemePreview';
import clsx from 'clsx';

interface ThemeEditorProps {
  theme: Theme;
  onClose: () => void;
  onSave: () => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  emergency: 'Emergency (0)',
  alert: 'Alert (1)',
  critical: 'Critical (2)',
  error: 'Error (3)',
  warning: 'Warning (4)',
  notice: 'Notice (5)',
  info: 'Info (6)',
  debug: 'Debug (7)',
};

const FONT_OPTIONS = [
  { label: 'System Default', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Inter', value: '"Inter", system-ui, sans-serif' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", "Fira Code", monospace' },
  { label: 'Fira Code', value: '"Fira Code", "JetBrains Mono", monospace' },
  { label: 'Consolas', value: '"Consolas", "Courier New", monospace' },
  { label: 'Source Code Pro', value: '"Source Code Pro", monospace' },
];

export function ThemeEditor({ theme, onClose, onSave }: ThemeEditorProps) {
  const { addCustomTheme, updateCustomTheme, setTheme, customThemes } = useThemeStore();

  const [name, setName] = useState(theme.name);
  const [isDark, setIsDark] = useState(theme.isDark);
  const [colors, setColors] = useState<ThemeColors>(theme.colors);
  const [typography, setTypography] = useState<ThemeTypography>(theme.typography);
  const [activeTab, setActiveTab] = useState<'colors' | 'priority' | 'typography'>('colors');

  const isExisting = customThemes.some((t) => t.id === theme.id);

  const previewTheme: Theme = {
    ...theme,
    name,
    isDark,
    colors,
    typography,
  };

  const updateColor = (key: keyof ThemeColors, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
  };

  const updatePriorityColor = (key: string, value: string) => {
    setColors((prev) => ({
      ...prev,
      priority: { ...prev.priority, [key]: value },
    }));
  };

  const updatePriorityBgColor = (key: string, value: string) => {
    setColors((prev) => ({
      ...prev,
      priorityBg: { ...prev.priorityBg, [key]: value },
    }));
  };

  const updateTypographyValue = <K extends keyof ThemeTypography>(key: K, value: ThemeTypography[K]) => {
    setTypography((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const updatedTheme: Theme = {
      ...theme,
      name,
      isDark,
      colors,
      typography,
      isBuiltIn: false,
    };

    if (isExisting) {
      updateCustomTheme(theme.id, updatedTheme);
    } else {
      addCustomTheme(updatedTheme);
    }

    setTheme(theme.id);
    onSave();
  };

  const handleReset = () => {
    const baseTheme = isDark ? DARK_THEME : LIGHT_THEME;
    setColors(baseTheme.colors);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-theme border border-theme rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme">
          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5 accent-theme" />
            <h2 className="text-lg font-semibold text-theme">
              {isExisting ? 'Edit Theme' : 'Create Theme'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Editor sidebar */}
          <div className="w-80 border-r border-theme overflow-y-auto p-4 space-y-6">
            {/* Theme name */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-theme">Theme Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-theme rounded-lg bg-theme text-theme
                           focus:ring-2 focus:outline-none"
                style={{ '--tw-ring-color': 'var(--color-accent)' } as React.CSSProperties}
              />
            </div>

            {/* Dark mode toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                <span className="text-sm font-medium text-theme">
                  {isDark ? 'Dark Theme' : 'Light Theme'}
                </span>
              </div>
              <button
                onClick={() => setIsDark(!isDark)}
                className={clsx(
                  'relative w-11 h-6 rounded-full transition-colors',
                  isDark ? 'bg-accent-theme' : 'bg-theme-secondary border border-theme'
                )}
                style={{ backgroundColor: isDark ? 'var(--color-accent)' : undefined }}
              >
                <span
                  className={clsx(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow',
                    isDark && 'translate-x-5'
                  )}
                />
              </button>
            </div>

            {/* Tab navigation */}
            <div className="flex border-b border-theme">
              {(['colors', 'priority', 'typography'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={clsx(
                    'flex-1 py-2 text-sm font-medium border-b-2 transition-colors',
                    activeTab === tab
                      ? 'border-current accent-theme'
                      : 'border-transparent text-theme-secondary hover:text-theme'
                  )}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'colors' && (
              <div className="space-y-4">
                <ColorInput
                  label="Background"
                  value={colors.background}
                  onChange={(v) => updateColor('background', v)}
                />
                <ColorInput
                  label="Secondary Background"
                  value={colors.backgroundSecondary}
                  onChange={(v) => updateColor('backgroundSecondary', v)}
                />
                <ColorInput
                  label="Foreground (Text)"
                  value={colors.foreground}
                  onChange={(v) => updateColor('foreground', v)}
                />
                <ColorInput
                  label="Secondary Text"
                  value={colors.foregroundSecondary}
                  onChange={(v) => updateColor('foregroundSecondary', v)}
                />
                <ColorInput
                  label="Accent"
                  value={colors.accent}
                  onChange={(v) => updateColor('accent', v)}
                />
                <ColorInput
                  label="Accent Hover"
                  value={colors.accentHover}
                  onChange={(v) => updateColor('accentHover', v)}
                />
                <ColorInput
                  label="Selection"
                  value={colors.selection}
                  onChange={(v) => updateColor('selection', v)}
                />
                <ColorInput
                  label="Border"
                  value={colors.border}
                  onChange={(v) => updateColor('border', v)}
                />
              </div>
            )}

            {activeTab === 'priority' && (
              <div className="space-y-4">
                <p className="text-xs text-theme-secondary">
                  Customize colors for each log priority level.
                </p>
                {PRIORITY_KEYS.map((key) => (
                  <div key={key} className="space-y-2">
                    <p className="text-sm font-medium text-theme">{PRIORITY_LABELS[key]}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <ColorInput
                        label="Text"
                        value={colors.priority[key]}
                        onChange={(v) => updatePriorityColor(key, v)}
                        compact
                      />
                      <ColorInput
                        label="Background"
                        value={colors.priorityBg[key]}
                        onChange={(v) => updatePriorityBgColor(key, v)}
                        compact
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'typography' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-theme">Font Family</label>
                  <select
                    value={typography.fontFamily}
                    onChange={(e) => updateTypographyValue('fontFamily', e.target.value)}
                    className="w-full px-3 py-2 border border-theme rounded-lg bg-theme text-theme"
                  >
                    {FONT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-theme">
                    Font Size: {typography.fontSize}px
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="20"
                    value={typography.fontSize}
                    onChange={(e) => updateTypographyValue('fontSize', parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-theme">
                    Line Height: {typography.lineHeight.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="2"
                    step="0.1"
                    value={typography.lineHeight}
                    onChange={(e) => updateTypographyValue('lineHeight', parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    <span className="text-sm font-medium text-theme">Monospace Mode</span>
                  </div>
                  <button
                    onClick={() => updateTypographyValue('monospace', !typography.monospace)}
                    className={clsx(
                      'relative w-11 h-6 rounded-full transition-colors',
                      typography.monospace ? 'bg-accent-theme' : 'bg-theme-secondary border border-theme'
                    )}
                    style={{ backgroundColor: typography.monospace ? 'var(--color-accent)' : undefined }}
                  >
                    <span
                      className={clsx(
                        'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow',
                        typography.monospace && 'translate-x-5'
                      )}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* Reset button */}
            <button
              onClick={handleReset}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium
                         text-theme-secondary border border-theme rounded-lg
                         hover:bg-theme-secondary transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Default Colors
            </button>
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-sm font-medium text-theme-secondary uppercase tracking-wide mb-4">
              Live Preview
            </h3>
            <ThemePreview theme={previewTheme} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-theme flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-theme-secondary
                       border border-theme rounded-lg hover:bg-theme-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                       text-white rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <Save className="h-4 w-4" />
            Save Theme
          </button>
        </div>
      </div>
    </div>
  );
}

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

function ColorInput({ label, value, onChange, compact }: ColorInputProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleTextChange = (newValue: string) => {
    setLocalValue(newValue);
    // Only propagate valid colors
    if (/^#[0-9A-Fa-f]{6}$/.test(newValue) || /^rgba?\([^)]+\)$/.test(newValue)) {
      onChange(newValue);
    }
  };

  return (
    <div className={clsx('space-y-1', compact && 'space-y-0.5')}>
      <label className={clsx('block font-medium text-theme', compact ? 'text-xs' : 'text-sm')}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value.startsWith('#') ? value : '#888888'}
          onChange={(e) => {
            setLocalValue(e.target.value);
            onChange(e.target.value);
          }}
          className={clsx('rounded cursor-pointer border-0', compact ? 'w-6 h-6' : 'w-8 h-8')}
        />
        <input
          type="text"
          value={localValue}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={() => setLocalValue(value)}
          className={clsx(
            'flex-1 px-2 border border-theme rounded bg-theme text-theme font-mono',
            compact ? 'py-1 text-xs' : 'py-1.5 text-sm'
          )}
        />
      </div>
    </div>
  );
}
