import { useEffect, useState } from 'react';
import {
  RefreshCw,
  Trash2,
  Download,
  HardDrive,
  Clock,
  Database,
  ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';
import { save } from '@tauri-apps/plugin-dialog';
import { useOfflineStore } from '../../stores/offlineStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { exportOfflineLogs } from '../../lib/offlineTauri';
import type { OfflineSettings, StorageStats, SyncState, ExportFormat } from '../../lib/offlineTypes';
import type { JournalFilter } from '../../lib/types';

interface OfflineSettingsPanelProps {
  className?: string;
}

export function OfflineSettingsPanel({ className }: OfflineSettingsPanelProps) {
  const {
    settings,
    storageStats,
    syncStates,
    isLoadingSettings,
    isLoadingStorageStats,
    loadSettings,
    loadStorageStats,
    loadSyncStates,
    updateSettings,
    triggerSync,
    deleteOfflineLogs,
    currentSync,
  } = useOfflineStore();

  const { hosts } = useConnectionStore();

  // Local state for form editing
  const [localSettings, setLocalSettings] = useState<OfflineSettings>(settings);
  const [deleteConfirmHost, setDeleteConfirmHost] = useState<string | null>(null);
  const [exportMenuHost, setExportMenuHost] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Load data on mount
  useEffect(() => {
    loadSettings();
    loadStorageStats();
    loadSyncStates();
  }, [loadSettings, loadStorageStats, loadSyncStates]);

  // Reload storage stats when sync completes
  useEffect(() => {
    if (currentSync?.status === 'completed') {
      loadStorageStats();
      loadSyncStates();
    }
  }, [currentSync?.status, loadStorageStats, loadSyncStates]);

  // Sync local settings with store
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await updateSettings(localSettings);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleSync = async (hostId: string) => {
    try {
      await triggerSync(hostId);
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  const handleDelete = async (hostId: string) => {
    try {
      await deleteOfflineLogs(hostId);
      setDeleteConfirmHost(null);
      // Reload stats after delete
      await loadStorageStats();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleExport = async (hostId: string, format: ExportFormat) => {
    setExportMenuHost(null);

    // Get extension and filter for the format
    const extensions: Record<ExportFormat, { ext: string; name: string }> = {
      json: { ext: 'json', name: 'JSON Files' },
      text: { ext: 'txt', name: 'Text Files' },
      csv: { ext: 'csv', name: 'CSV Files' },
    };
    const { ext, name } = extensions[format];

    // Find host name for default filename
    const host = hosts.find((h) => h.id === hostId);
    const hostName = host?.name || hostId;
    const timestamp = new Date().toISOString().split('T')[0];
    const defaultFilename = `${hostName.replace(/[^a-zA-Z0-9-_]/g, '_')}-logs-${timestamp}.${ext}`;

    try {
      // Show save dialog
      const filePath = await save({
        defaultPath: defaultFilename,
        filters: [{ name, extensions: [ext] }],
      });

      if (!filePath) {
        return; // User cancelled
      }

      // Create empty filter to export all entries for this host
      const filter: JournalFilter = {
        units: [],
        excludedUnits: [],
        priorities: [],
        caseSensitive: false,
        limit: 0, // Export all
        reverse: false,
      };

      const count = await exportOfflineLogs(hostId, filter, format, filePath);
      console.log(`Exported ${count} entries to ${filePath}`);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimestamp = (timestamp: number): string => {
    if (timestamp === 0) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  // Get hosts with offline data - combine hosts from storageStats, syncStates, and configured hosts
  const hostsWithData = (() => {
    const hostIds = new Set<string>();

    // Add hosts from storage stats
    for (const hostId of storageStats.keys()) {
      hostIds.add(hostId);
    }

    // Add hosts from sync states (may have synced but stats not loaded yet)
    for (const hostId of syncStates.keys()) {
      hostIds.add(hostId);
    }

    return Array.from(hostIds).map((hostId) => {
      const host = hosts.find((h) => h.id === hostId);
      const stats = storageStats.get(hostId);
      const syncState = syncStates.get(hostId);
      return {
        id: hostId,
        name: host?.name || hostId,
        stats: stats || {
          hostId,
          entryCount: syncState?.entriesSynced || 0,
          oldestTimestamp: null,
          newestTimestamp: null,
          dbSizeBytes: 0,
        },
        syncState,
      };
    });
  })();

  const isSyncing = (hostId: string) =>
    currentSync?.hostId === hostId && currentSync?.status !== 'completed' && currentSync?.status !== 'error';

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Auto-sync Settings */}
      <section>
        <h3 className="text-sm font-medium text-theme-secondary uppercase tracking-wide mb-4">
          Auto-sync Settings
        </h3>
        <div className="space-y-4 bg-theme-secondary rounded-lg p-4">
          {/* Enable auto-sync toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-theme">Enable auto-sync</p>
              <p className="text-sm text-theme-secondary">
                Automatically sync when connected to remote hosts
              </p>
            </div>
            <button
              onClick={() => setLocalSettings({ ...localSettings, autoSync: !localSettings.autoSync })}
              className={clsx(
                'relative w-11 h-6 rounded-full transition-colors',
                localSettings.autoSync ? 'bg-accent-theme' : 'bg-theme-secondary border border-theme'
              )}
              style={{ backgroundColor: localSettings.autoSync ? 'var(--color-accent)' : undefined }}
            >
              <span
                className={clsx(
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow',
                  localSettings.autoSync && 'translate-x-5'
                )}
              />
            </button>
          </div>

          {/* Boots to sync */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-theme">Boots to sync</p>
              <p className="text-sm text-theme-secondary">
                Number of system boots to sync and retain (1-20)
              </p>
            </div>
            <input
              type="number"
              min={1}
              max={20}
              value={localSettings.syncBoots}
              onChange={(e) => setLocalSettings({ ...localSettings, syncBoots: parseInt(e.target.value) || 5 })}
              className="w-20 px-2 py-1 text-sm bg-theme border border-theme rounded text-theme focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Sync on startup toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-theme">Sync on startup</p>
              <p className="text-sm text-theme-secondary">
                Sync immediately when connecting to a host
              </p>
            </div>
            <button
              onClick={() => setLocalSettings({ ...localSettings, enabled: !localSettings.enabled })}
              className={clsx(
                'relative w-11 h-6 rounded-full transition-colors',
                localSettings.enabled ? 'bg-accent-theme' : 'bg-theme-secondary border border-theme'
              )}
              style={{ backgroundColor: localSettings.enabled ? 'var(--color-accent)' : undefined }}
            >
              <span
                className={clsx(
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow',
                  localSettings.enabled && 'translate-x-5'
                )}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className={clsx(
            'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            saveStatus === 'saved'
              ? 'bg-green-600 text-white'
              : saveStatus === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-accent-theme text-white hover:opacity-90'
          )}
          style={{
            backgroundColor:
              saveStatus === 'saved'
                ? undefined
                : saveStatus === 'error'
                ? undefined
                : 'var(--color-accent)',
          }}
        >
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && 'Saved!'}
          {saveStatus === 'error' && 'Error saving'}
          {saveStatus === 'idle' && 'Save Settings'}
        </button>
      </div>

      {/* Storage per Host */}
      <section>
        <h3 className="text-sm font-medium text-theme-secondary uppercase tracking-wide mb-4">
          Storage per Host
        </h3>

        {isLoadingStorageStats ? (
          <div className="flex items-center justify-center p-8 text-theme-secondary">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading storage data...
          </div>
        ) : hostsWithData.length === 0 ? (
          <div className="text-center p-8 bg-theme-secondary rounded-lg">
            <Database className="h-8 w-8 mx-auto mb-2 text-theme-secondary" />
            <p className="text-theme-secondary">No offline data stored yet</p>
            <p className="text-sm text-theme-secondary mt-1">
              Connect to a remote host and sync to start storing offline data
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {hostsWithData.map(({ id, name, stats, syncState }) => (
              <HostStorageCard
                key={id}
                hostId={id}
                hostName={name}
                stats={stats}
                syncState={syncState}
                isSyncing={isSyncing(id)}
                isDeleteConfirm={deleteConfirmHost === id}
                isExportMenuOpen={exportMenuHost === id}
                onSync={() => handleSync(id)}
                onDelete={() => handleDelete(id)}
                onDeleteConfirm={() => setDeleteConfirmHost(id)}
                onDeleteCancel={() => setDeleteConfirmHost(null)}
                onExportMenuToggle={() => setExportMenuHost(exportMenuHost === id ? null : id)}
                onExport={(format) => handleExport(id, format)}
                formatBytes={formatBytes}
                formatTimestamp={formatTimestamp}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface HostStorageCardProps {
  hostId: string;
  hostName: string;
  stats: StorageStats;
  syncState?: SyncState;
  isSyncing: boolean;
  isDeleteConfirm: boolean;
  isExportMenuOpen: boolean;
  onSync: () => void;
  onDelete: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onExportMenuToggle: () => void;
  onExport: (format: ExportFormat) => void;
  formatBytes: (bytes: number) => string;
  formatTimestamp: (timestamp: number) => string;
}

function HostStorageCard({
  hostName,
  stats,
  syncState,
  isSyncing,
  isDeleteConfirm,
  isExportMenuOpen,
  onSync,
  onDelete,
  onDeleteConfirm,
  onDeleteCancel,
  onExportMenuToggle,
  onExport,
  formatBytes,
  formatTimestamp,
}: HostStorageCardProps) {
  return (
    <div className="bg-theme-secondary rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-theme truncate">{hostName}</h4>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-theme-secondary">
              <Database className="h-3.5 w-3.5" />
              <span>{stats.entryCount.toLocaleString()} entries</span>
            </div>
            <div className="flex items-center gap-1.5 text-theme-secondary" title="Total database size (shared across all hosts)">
              <HardDrive className="h-3.5 w-3.5" />
              <span>{formatBytes(stats.dbSizeBytes)} total</span>
            </div>
            <div className="flex items-center gap-1.5 text-theme-secondary col-span-2">
              <Clock className="h-3.5 w-3.5" />
              <span>Last sync: {formatTimestamp(syncState?.lastSyncTimestamp || 0)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-4">
          {/* Sync button */}
          <button
            onClick={onSync}
            disabled={isSyncing}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              isSyncing
                ? 'text-theme-secondary cursor-not-allowed'
                : 'text-theme-secondary hover:text-theme hover:bg-theme'
            )}
            title={isSyncing ? 'Syncing...' : 'Sync now'}
          >
            <RefreshCw className={clsx('h-4 w-4', isSyncing && 'animate-spin')} />
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={onExportMenuToggle}
              className="p-2 rounded-lg text-theme-secondary hover:text-theme hover:bg-theme transition-colors"
              title="Export"
            >
              <Download className="h-4 w-4" />
              <ChevronDown className="h-3 w-3 absolute bottom-1 right-1" />
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-theme border border-theme rounded-lg shadow-lg py-1 z-10 min-w-[100px]">
                <button
                  onClick={() => onExport('json')}
                  className="w-full px-3 py-1.5 text-left text-sm text-theme hover:bg-theme-secondary transition-colors"
                >
                  JSON
                </button>
                <button
                  onClick={() => onExport('text')}
                  className="w-full px-3 py-1.5 text-left text-sm text-theme hover:bg-theme-secondary transition-colors"
                >
                  Text
                </button>
                <button
                  onClick={() => onExport('csv')}
                  className="w-full px-3 py-1.5 text-left text-sm text-theme hover:bg-theme-secondary transition-colors"
                >
                  CSV
                </button>
              </div>
            )}
          </div>

          {/* Delete button */}
          {isDeleteConfirm ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onDelete}
                className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={onDeleteCancel}
                className="px-2 py-1 text-xs font-medium bg-theme border border-theme rounded text-theme-secondary hover:text-theme transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={onDeleteConfirm}
              className="p-2 rounded-lg text-theme-secondary hover:text-red-500 hover:bg-theme transition-colors"
              title="Delete offline data"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sync status indicator */}
      {syncState && syncState.syncStatus === 'failed' && syncState.syncError && (
        <div className="mt-2 text-xs text-red-500 dark:text-red-400">
          Sync error: {syncState.syncError}
        </div>
      )}
    </div>
  );
}
