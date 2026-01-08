import { X, RefreshCw } from 'lucide-react';
import { useOfflineStore } from '../../stores/offlineStore';
import { useConnectionStore } from '../../stores/connectionStore';

export function SyncProgress() {
  const { currentSync, cancelSync } = useOfflineStore();
  const { hosts } = useConnectionStore();

  if (!currentSync) return null;

  const host = hosts.find((h) => h.id === currentSync.hostId);
  const hostName = host?.name || currentSync.hostId;

  return (
    <div className="fixed bottom-4 right-4 bg-theme border border-theme rounded-lg shadow-lg p-4 w-72 z-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-theme">Syncing {hostName}</span>
        <button
          onClick={() => cancelSync(currentSync.hostId)}
          className="p-1 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors"
          aria-label="Cancel sync"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-accent animate-spin" />
        <span className="text-xs text-theme-secondary">
          {currentSync.entriesSynced.toLocaleString()} entries synced
        </span>
      </div>
      {currentSync.status === 'error' && currentSync.error && (
        <div className="mt-2 text-xs text-red-500 dark:text-red-400">
          Error: {currentSync.error}
        </div>
      )}
    </div>
  );
}
