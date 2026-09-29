import { useState } from 'react';
import { X, Palette, Sun, Moon, Monitor, Check, Copy, Upload, Download, Trash2, Edit3, Cloud } from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore';
import { BUILT_IN_THEMES, exportTheme, importTheme, type Theme } from '../../lib/theme';
import { ThemeEditor } from './ThemeEditor';
import { ThemePreview } from './ThemePreview';
import { OfflineSettingsPanel } from './OfflineSettingsPanel';
import clsx from 'clsx';
import { ModalDialog } from '../ui/ModalDialog';

type SettingsTab = 'theme' | 'offline';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const {
    currentThemeId,
    followSystem,
    customThemes,
    getCurrentTheme,
    setTheme,
    setFollowSystem,
    duplicateTheme,
    deleteCustomTheme,
    importTheme: importToStore,
  } = useThemeStore();

  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('theme');

  const currentTheme = getCurrentTheme();

  const handleThemeSelect = (themeId: string) => {
    setTheme(themeId);
  };

  const handleFollowSystemToggle = () => {
    setFollowSystem(!followSystem);
  };

  const handleDuplicate = (themeId: string) => {
    const newTheme = duplicateTheme(themeId);
    if (newTheme) {
      setEditingTheme(newTheme);
    }
  };

  const handleEdit = (theme: Theme) => {
    if (theme.isBuiltIn) {
      // Duplicate built-in theme for editing
      const newTheme = duplicateTheme(theme.id);
      if (newTheme) {
        setEditingTheme(newTheme);
      }
    } else {
      setEditingTheme(theme);
    }
  };

  const handleDelete = (themeId: string) => {
    if (confirm('Are you sure you want to delete this theme?')) {
      deleteCustomTheme(themeId);
    }
  };

  const handleExport = (theme: Theme) => {
    const json = exportTheme(theme);
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const theme = importTheme(text);
        if (theme) {
          importToStore(theme);
          setImportError(null);
        } else {
          setImportError('Invalid theme file');
        }
      } catch {
        setImportError('Failed to read theme file');
      }
    };
    input.click();
  };

  const handleCreateNew = () => {
    const newTheme = duplicateTheme(currentTheme.isDark ? 'dark' : 'light');
    if (newTheme) {
      setEditingTheme(newTheme);
    }
  };

  if (!isOpen) return null;

  if (editingTheme) {
    return (
      <ThemeEditor
        theme={editingTheme}
        onClose={() => setEditingTheme(null)}
        onSave={() => {
          setEditingTheme(null);
        }}
      />
    );
  }

  return (
    <ModalDialog
      isOpen={isOpen}
      onRequestClose={onClose}
      labelledBy="settings-dialog-title"
    >
      <div className="bg-theme border border-theme rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme">
          <div className="flex items-center gap-3">
            <h2 id="settings-dialog-title" className="text-lg font-semibold text-theme">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors"
            title="Close settings"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-theme px-6">
          <button
            onClick={() => setActiveTab('theme')}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === 'theme'
                ? 'border-current text-theme'
                : 'border-transparent text-theme-secondary hover:text-theme'
            )}
            style={{ borderColor: activeTab === 'theme' ? 'var(--color-accent)' : undefined }}
            title="Show theme settings"
          >
            <Palette className="h-4 w-4" />
            Theme
          </button>
          <button
            onClick={() => setActiveTab('offline')}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === 'offline'
                ? 'border-current text-theme'
                : 'border-transparent text-theme-secondary hover:text-theme'
            )}
            style={{ borderColor: activeTab === 'offline' ? 'var(--color-accent)' : undefined }}
            title="Show offline and sync settings"
          >
            <Cloud className="h-4 w-4" />
            Offline & Sync
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'theme' && (
            <>
              {/* System theme preference */}
              <div className="flex items-center justify-between p-4 bg-theme-secondary rounded-lg">
                <div className="flex items-center gap-3">
                  <Monitor className="h-5 w-5 text-theme-secondary" />
                  <div>
                    <p className="font-medium text-theme">Follow system theme</p>
                    <p className="text-sm text-theme-secondary">
                      Automatically switch between light and dark themes
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleFollowSystemToggle}
                  className={clsx(
                    'relative w-11 h-6 rounded-full transition-colors',
                    followSystem ? 'bg-accent-theme' : 'bg-theme-secondary border border-theme'
                  )}
                  style={{ backgroundColor: followSystem ? 'var(--color-accent)' : undefined }}
                  title={followSystem ? 'Stop following system theme' : 'Follow system theme'}
                  aria-label={followSystem ? 'Stop following system theme' : 'Follow system theme'}
                >
                  <span
                    className={clsx(
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow',
                      followSystem && 'translate-x-5'
                    )}
                  />
                </button>
              </div>

              {/* Theme actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateNew}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium
                             bg-accent-theme text-white rounded-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                  title="Create new theme"
                >
                  <Edit3 className="h-4 w-4" />
                  Create New Theme
                </button>
                <button
                  onClick={handleImport}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium
                             bg-theme border border-theme rounded-lg hover:bg-theme-secondary transition-colors"
                  title="Import theme"
                >
                  <Upload className="h-4 w-4" />
                  Import Theme
                </button>
              </div>

              {importError && (
                <p className="text-sm" style={{ color: 'var(--color-priority-error)' }}>
                  {importError}
                </p>
              )}

              {/* Theme grid */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-theme-secondary uppercase tracking-wide">
                  Built-in Themes
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {BUILT_IN_THEMES.map((theme) => (
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      isSelected={!followSystem && currentThemeId === theme.id}
                      onSelect={() => handleThemeSelect(theme.id)}
                      onDuplicate={() => handleDuplicate(theme.id)}
                      onEdit={() => handleEdit(theme)}
                      onExport={() => handleExport(theme)}
                    />
                  ))}
                </div>

                {customThemes.length > 0 && (
                  <>
                    <h3 className="text-sm font-medium text-theme-secondary uppercase tracking-wide pt-4">
                      Custom Themes
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {customThemes.map((theme) => (
                        <ThemeCard
                          key={theme.id}
                          theme={theme}
                          isSelected={!followSystem && currentThemeId === theme.id}
                          onSelect={() => handleThemeSelect(theme.id)}
                          onDuplicate={() => handleDuplicate(theme.id)}
                          onEdit={() => handleEdit(theme)}
                          onExport={() => handleExport(theme)}
                          onDelete={() => handleDelete(theme.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Preview */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-theme-secondary uppercase tracking-wide">
                  Preview
                </h3>
                <ThemePreview theme={currentTheme} />
              </div>
            </>
          )}

          {activeTab === 'offline' && <OfflineSettingsPanel />}
        </div>

        {/* Footer */}
        {activeTab === 'theme' && (
          <div className="px-6 py-4 border-t border-theme flex items-center justify-between">
            <p className="text-sm text-theme-secondary">
              Current theme: <span className="font-medium text-theme">{currentTheme.name}</span>
              {followSystem && ' (following system)'}
            </p>
            {copied && (
              <span className="text-sm flex items-center gap-1" style={{ color: 'var(--color-priority-notice)' }}>
                <Check className="h-4 w-4" />
                Theme copied to clipboard
              </span>
            )}
          </div>
        )}
      </div>
    </ModalDialog>
  );
}

interface ThemeCardProps {
  theme: Theme;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onExport: () => void;
  onDelete?: () => void;
}

function ThemeCard({
  theme,
  isSelected,
  onSelect,
  onDuplicate,
  onEdit,
  onExport,
  onDelete,
}: ThemeCardProps) {
  return (
    <div
      className={clsx(
        'relative p-3 rounded-lg border-2 cursor-pointer transition-all',
        isSelected ? 'border-current' : 'border-theme hover:border-theme-secondary'
      )}
      style={{
        backgroundColor: theme.colors.background,
        borderColor: isSelected ? theme.colors.accent : undefined,
      }}
      onClick={onSelect}
    >
      {/* Theme preview colors */}
      <div className="flex items-center gap-2 mb-2">
        {theme.isDark ? (
          <Moon className="h-4 w-4" style={{ color: theme.colors.foregroundSecondary }} />
        ) : (
          <Sun className="h-4 w-4" style={{ color: theme.colors.foregroundSecondary }} />
        )}
        <span className="font-medium" style={{ color: theme.colors.foreground }}>
          {theme.name}
        </span>
        {isSelected && (
          <Check className="h-4 w-4 ml-auto" style={{ color: theme.colors.accent }} />
        )}
      </div>

      {/* Priority color preview */}
      <div className="flex gap-1 mb-2">
        {Object.values(theme.colors.priority).map((color, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-sm"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 pt-2 border-t" style={{ borderColor: theme.colors.border }}>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1 rounded hover:opacity-70"
          style={{ color: theme.colors.foregroundSecondary }}
          title="Edit"
          aria-label="Edit"
        >
          <Edit3 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="p-1 rounded hover:opacity-70"
          style={{ color: theme.colors.foregroundSecondary }}
          title="Duplicate"
          aria-label="Duplicate"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onExport(); }}
          className="p-1 rounded hover:opacity-70"
          style={{ color: theme.colors.foregroundSecondary }}
          title="Export"
          aria-label="Export"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded hover:opacity-70 ml-auto"
            style={{ color: theme.colors.priority.error }}
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
