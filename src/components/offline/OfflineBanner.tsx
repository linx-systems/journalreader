import { WifiOff } from 'lucide-react';
import { useOfflineStore } from '../../stores/offlineStore';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useConnectionStore } from '../../stores/connectionStore';

/**
 * Format a timestamp into a human-readable relative time string.
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted relative time string (e.g., "2 minutes ago", "1 hour ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return 'just now';
  } else if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else {
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Banner component that displays when the app is in offline mode.
 * Shows the offline status, last sync time, and a reconnect button.
 * Only displays when connected to a remote host - local logs are always available.
 */
export function OfflineBanner() {
  const { setOfflineMode } = useOfflineStore();
  const { lastSyncTime, isOffline } = useOfflineSync();
  const { connectedHostId } = useConnectionStore();

  // Don't show banner for local logs - they're always available
  if (!connectedHostId) return null;

  if (!isOffline) return null;

  return (
    <div
      className="bg-yellow-100 dark:bg-yellow-900/30 border-b border-yellow-300 dark:border-yellow-700 px-4 py-2 flex items-center justify-between"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <WifiOff className="h-4 w-4 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
        <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
          Offline Mode
        </span>
        {lastSyncTime && (
          <span className="text-xs text-yellow-600 dark:text-yellow-400">
            Last synced: {formatRelativeTime(lastSyncTime)}
          </span>
        )}
      </div>
      <button
        onClick={() => setOfflineMode(false)}
        className="text-xs text-yellow-700 dark:text-yellow-300 hover:underline focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-1 rounded px-1"
      >
        Try to reconnect
      </button>
    </div>
  );
}
