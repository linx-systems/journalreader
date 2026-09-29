import { Lock, Key, Shield, Check, Edit3, Trash2, Loader2 } from 'lucide-react';
import type { RemoteHost } from '../../lib/types';
import clsx from 'clsx';

export interface HostCardProps {
  host: RemoteHost;
  isConnected: boolean;
  isConnecting: boolean;
  isTesting: boolean;
  testResult: { success: boolean; message: string } | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function HostCard({
  host,
  isConnected,
  isConnecting,
  isTesting,
  testResult,
  onConnect,
  onDisconnect,
  onTest,
  onEdit,
  onDelete,
}: HostCardProps) {
  const AuthIcon = host.authMethod === 'password' ? Lock : host.authMethod === 'key' ? Key : Shield;

  return (
    <div
      className={clsx(
        'p-4 rounded-lg border-2 transition-colors',
        isConnected
          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
          : 'border-theme bg-theme-secondary'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className={clsx(
              'font-medium',
              isConnected ? 'text-green-900 dark:text-green-100' : 'text-theme'
            )}>{host.name}</h3>
            {isConnected && (
              <span className="px-2 py-0.5 text-xs font-medium bg-green-500 text-white rounded">
                Connected
              </span>
            )}
          </div>
          <p className={clsx(
            'text-sm mt-1',
            isConnected ? 'text-green-700 dark:text-green-300' : 'text-theme-secondary'
          )}>
            {host.username}@{host.hostname}:{host.port}
          </p>
          <div className={clsx(
            'flex items-center gap-3 mt-2 text-xs',
            isConnected ? 'text-green-600 dark:text-green-400' : 'text-theme-secondary'
          )}>
            <span className="flex items-center gap-1">
              <AuthIcon className="h-3 w-3" />
              {host.authMethod === 'agent' ? 'SSH Agent' : host.authMethod === 'key' ? 'Key File' : 'Password'}
            </span>
            {host.sudoRequired && (
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Sudo
              </span>
            )}
          </div>
          {testResult && (
            <div
              className={clsx(
                'mt-2 text-xs',
                testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}
            >
              {testResult.message}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isConnected ? (
            <button
              onClick={onDisconnect}
              title={`Disconnect from ${host.name}`}
              className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={onConnect}
              disabled={isConnecting}
              title={isConnecting ? `Connecting to ${host.name}` : `Connect to ${host.name}`}
              aria-label={isConnecting ? `Connecting to ${host.name}` : undefined}
              className="px-3 py-1.5 text-sm font-medium text-theme bg-theme border border-theme rounded hover:bg-theme-secondary transition-colors disabled:opacity-50"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Connect'
              )}
            </button>
          )}
          <button
            onClick={onTest}
            disabled={isTesting}
            className="p-1.5 text-theme-secondary hover:text-theme hover:bg-theme rounded transition-colors disabled:opacity-50"
            title="Test connection"
            aria-label="Test connection"
          >
            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 text-theme-secondary hover:text-theme hover:bg-theme rounded transition-colors"
            title="Edit"
            aria-label="Edit"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={isConnected}
            className="p-1.5 text-theme-secondary hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
            title={isConnected ? 'Disconnect first to delete' : 'Delete'}
            aria-label={isConnected ? 'Disconnect first to delete' : 'Delete'}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
