import { useState, useEffect, useRef } from 'react';
import { Monitor, Server, ChevronDown, Settings, Wifi } from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { ConnectionManager } from './ConnectionManager';
import clsx from 'clsx';

export function HostSelector() {
  const {
    hosts,
    connectedHostId,
    connectionStatus,
    loadHosts,
    connect,
    disconnect,
    getConnectedHost,
  } = useConnectionStore();

  const [isOpen, setIsOpen] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const connectedHost = getConnectedHost();
  const isConnected = connectionStatus === 'connected' && connectedHost;
  const isConnecting = connectionStatus === 'connecting';

  useEffect(() => {
    loadHosts();
  }, [loadHosts]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = async (hostId: string | null) => {
    setIsOpen(false);
    if (hostId === null) {
      await disconnect();
    } else if (hostId !== connectedHostId) {
      const host = hosts.find((h) => h.id === hostId);
      if (host?.authMethod === 'password') {
        // Need to show manager for password input
        setShowManager(true);
      } else {
        try {
          await connect(hostId);
        } catch {
          // Error handled by store
        }
      }
    }
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isConnecting}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors',
            isConnected
              ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
              : 'bg-theme border-theme text-theme hover:bg-theme-secondary'
          )}
        >
          {isConnecting ? (
            <Wifi className="h-4 w-4 animate-pulse" />
          ) : isConnected ? (
            <Server className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          )}
          <span className="max-w-[120px] truncate">
            {isConnecting
              ? 'Connecting...'
              : isConnected
              ? connectedHost.name
              : 'Local'}
          </span>
          <ChevronDown className="h-4 w-4" />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-theme border border-theme rounded-lg shadow-lg z-50">
            {/* Local option */}
            <button
              onClick={() => handleSelect(null)}
              className={clsx(
                'flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-theme-secondary transition-colors rounded-t-lg',
                !isConnected && 'bg-theme-secondary'
              )}
            >
              <Monitor className="h-4 w-4 text-theme-secondary" />
              <div className="flex-1">
                <div className="text-sm font-medium text-theme">Local Machine</div>
                <div className="text-xs text-theme-secondary">View local journal logs</div>
              </div>
              {!isConnected && (
                <span className="text-xs text-green-600 dark:text-green-400">Active</span>
              )}
            </button>

            {hosts.length > 0 && (
              <>
                <div className="border-t border-theme" />
                <div className="py-1">
                  {hosts.map((host) => (
                    <button
                      key={host.id}
                      onClick={() => handleSelect(host.id)}
                      className={clsx(
                        'flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-theme-secondary transition-colors',
                        connectedHostId === host.id && 'bg-theme-secondary'
                      )}
                    >
                      <Server className="h-4 w-4 text-theme-secondary" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-theme truncate">{host.name}</div>
                        <div className="text-xs text-theme-secondary truncate">
                          {host.username}@{host.hostname}
                        </div>
                      </div>
                      {connectedHostId === host.id && (
                        <span className="text-xs text-green-600 dark:text-green-400">Connected</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="border-t border-theme" />
            <button
              onClick={() => {
                setIsOpen(false);
                setShowManager(true);
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-theme-secondary transition-colors rounded-b-lg"
            >
              <Settings className="h-4 w-4 text-theme-secondary" />
              <span className="text-sm text-theme">Manage Hosts...</span>
            </button>
          </div>
        )}
      </div>

      <ConnectionManager isOpen={showManager} onClose={() => setShowManager(false)} />
    </>
  );
}
