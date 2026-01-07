import { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Server,
  Trash2,
  Edit3,
  Check,
  Loader2,
  AlertCircle,
  Key,
  Lock,
  Shield,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { testHostConnection, connectToHostAcceptKey } from '../../lib/tauri';
import type { RemoteHost, RemoteHostInput, AuthMethod } from '../../lib/types';
import { HostKeyVerificationDialog } from './HostKeyVerificationDialog';
import clsx from 'clsx';

interface ConnectionManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectionManager({ isOpen, onClose }: ConnectionManagerProps) {
  const {
    hosts,
    isLoadingHosts,
    hostsError,
    loadHosts,
    addHost,
    updateHost,
    deleteHost,
    connectedHostId,
    connectionStatus,
    connect,
    disconnect,
  } = useConnectionStore();

  const [editingHost, setEditingHost] = useState<RemoteHost | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [testResult, setTestResult] = useState<{
    hostId: string;
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{
    hostId: string;
    action: 'connect' | 'test';
  } | null>(null);
  const [password, setPassword] = useState('');
  const [hostKeyVerification, setHostKeyVerification] = useState<{
    host: RemoteHost;
    errorMessage: string;
    password?: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadHosts();
    }
  }, [isOpen, loadHosts]);

  const handleConnect = async (host: RemoteHost, pwd?: string) => {
    // Check if password is needed
    if (host.authMethod === 'password' && !pwd) {
      setPasswordPrompt({ hostId: host.id, action: 'connect' });
      return;
    }

    setIsConnecting(host.id);
    try {
      await connect(host.id, pwd);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Check if this is a host key verification error
      if (errorMessage.includes('Host key verification required') ||
          errorMessage.includes('HOST KEY HAS CHANGED')) {
        setHostKeyVerification({ host, errorMessage, password: pwd });
      }
      // Other errors are shown through connection store
    } finally {
      setIsConnecting(null);
    }
  };

  const handleConnectWithPassword = async () => {
    if (!passwordPrompt) return;

    const hostId = passwordPrompt.hostId;
    const action = passwordPrompt.action;
    const pwd = password;
    const host = hosts.find((h) => h.id === hostId);

    setIsConnecting(hostId);
    setPasswordPrompt(null);
    setPassword('');

    try {
      if (action === 'connect') {
        await connect(hostId, pwd);
      } else {
        setIsTesting(hostId);
        const result = await testHostConnection(hostId, pwd);
        setTestResult({
          hostId: hostId,
          success: result.success,
          message: result.message,
        });
        setIsTesting(null);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Check if this is a host key verification error
      if (host && (errorMessage.includes('Host key verification required') ||
          errorMessage.includes('HOST KEY HAS CHANGED'))) {
        setHostKeyVerification({ host, errorMessage, password: pwd });
      }
      // Other errors are shown through connection store
    } finally {
      setIsConnecting(null);
    }
  };

  const handleTest = async (host: RemoteHost) => {
    if (host.authMethod === 'password') {
      setPasswordPrompt({ hostId: host.id, action: 'test' });
      return;
    }

    setIsTesting(host.id);
    setTestResult(null);
    try {
      const result = await testHostConnection(host.id);
      setTestResult({
        hostId: host.id,
        success: result.success,
        message: result.message,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Check if this is a host key verification error
      if (errorMessage.includes('Host key verification required') ||
          errorMessage.includes('HOST KEY HAS CHANGED')) {
        setHostKeyVerification({ host, errorMessage });
      } else {
        setTestResult({
          hostId: host.id,
          success: false,
          message: errorMessage,
        });
      }
    } finally {
      setIsTesting(null);
    }
  };

  const handleDelete = async (host: RemoteHost) => {
    if (!confirm(`Delete host "${host.name}"?`)) return;
    await deleteHost(host.id);
  };

  if (!isOpen) return null;

  // Handle host key verification dialog
  if (hostKeyVerification) {
    const handleAcceptHostKey = async () => {
      const { host, password: pwd } = hostKeyVerification;
      setHostKeyVerification(null);
      setIsConnecting(host.id);
      try {
        // This accepts the key and connects in one step
        await connectToHostAcceptKey(host.id, pwd);
        // Refresh connection state from backend to update the store
        await useConnectionStore.getState().refreshConnectionState();
      } catch (error) {
        // Error will be shown through connection store
      } finally {
        setIsConnecting(null);
      }
    };

    return (
      <HostKeyVerificationDialog
        host={hostKeyVerification.host}
        errorMessage={hostKeyVerification.errorMessage}
        onAccept={handleAcceptHostKey}
        onReject={() => setHostKeyVerification(null)}
      />
    );
  }

  if (editingHost || isCreating) {
    return (
      <HostEditor
        host={editingHost}
        onSave={async (input) => {
          if (editingHost) {
            await updateHost(editingHost.id, input);
          } else {
            await addHost(input);
          }
          setEditingHost(null);
          setIsCreating(false);
        }}
        onCancel={() => {
          setEditingHost(null);
          setIsCreating(false);
        }}
      />
    );
  }

  if (passwordPrompt) {
    const host = hosts.find((h) => h.id === passwordPrompt.hostId);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-theme border border-theme rounded-lg shadow-xl w-full max-w-sm p-6">
          <h3 className="text-lg font-semibold text-theme mb-4">
            {passwordPrompt.action === 'connect' ? 'Connect to' : 'Test connection to'} {host?.name}
          </h3>
          <p className="text-sm text-theme-secondary mb-4">
            {host?.authMethod === 'password'
              ? 'Enter password for authentication'
              : 'Enter key passphrase (leave empty if none)'}
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={host?.authMethod === 'password' ? 'Password' : 'Key passphrase (optional)'}
            className="w-full px-3 py-2 border border-theme rounded-lg bg-theme text-theme mb-4"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleConnectWithPassword();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setPasswordPrompt(null);
                setPassword('');
              }}
              className="px-4 py-2 text-sm text-theme-secondary hover:text-theme"
            >
              Cancel
            </button>
            <button
              onClick={handleConnectWithPassword}
              className="px-4 py-2 text-sm font-medium bg-accent-theme text-white rounded-lg hover:opacity-90"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              {passwordPrompt.action === 'connect' ? 'Connect' : 'Test'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-theme border border-theme rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme">
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 accent-theme" />
            <h2 className="text-lg font-semibold text-theme">Remote Hosts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {hostsError && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {hostsError}
            </div>
          )}

          {isLoadingHosts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-theme-secondary" />
            </div>
          ) : hosts.length === 0 ? (
            <div className="text-center py-8">
              <Server className="h-12 w-12 mx-auto text-theme-secondary opacity-50 mb-3" />
              <p className="text-theme-secondary">No remote hosts configured</p>
              <p className="text-sm text-theme-secondary mt-1">
                Add a host to view logs from remote machines
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {hosts.map((host) => (
                <HostCard
                  key={host.id}
                  host={host}
                  isConnected={connectedHostId === host.id}
                  isConnecting={isConnecting === host.id || (connectionStatus === 'connecting' && connectedHostId === host.id)}
                  isTesting={isTesting === host.id}
                  testResult={testResult?.hostId === host.id ? testResult : null}
                  onConnect={() => handleConnect(host)}
                  onDisconnect={disconnect}
                  onTest={() => handleTest(host)}
                  onEdit={() => setEditingHost(host)}
                  onDelete={() => handleDelete(host)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-theme">
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-theme text-white rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <Plus className="h-4 w-4" />
            Add Host
          </button>
        </div>
      </div>
    </div>
  );
}

interface HostCardProps {
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

function HostCard({
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
              className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={onConnect}
              disabled={isConnecting}
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
          >
            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 text-theme-secondary hover:text-theme hover:bg-theme rounded transition-colors"
            title="Edit"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={isConnected}
            className="p-1.5 text-theme-secondary hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
            title={isConnected ? 'Disconnect first to delete' : 'Delete'}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface HostEditorProps {
  host: RemoteHost | null;
  onSave: (input: RemoteHostInput) => Promise<void>;
  onCancel: () => void;
}

function HostEditor({ host, onSave, onCancel }: HostEditorProps) {
  const [name, setName] = useState(host?.name ?? '');
  const [hostname, setHostname] = useState(host?.hostname ?? '');
  const [port, setPort] = useState(host?.port ?? 22);
  const [username, setUsername] = useState(host?.username ?? '');
  const [authMethod, setAuthMethod] = useState<AuthMethod>(host?.authMethod ?? 'agent');
  const [keyPath, setKeyPath] = useState(host?.keyPath ?? '~/.ssh/id_rsa');
  const [sudoRequired, setSudoRequired] = useState(host?.sudoRequired ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !hostname.trim() || !username.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        hostname: hostname.trim(),
        port,
        username: username.trim(),
        authMethod,
        keyPath: authMethod === 'key' ? keyPath : undefined,
        sudoRequired,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-theme border border-theme rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme">
          <h2 className="text-lg font-semibold text-theme">
            {host ? 'Edit Host' : 'Add Host'}
          </h2>
          <button
            onClick={onCancel}
            className="p-1.5 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-theme mb-1">
              Display Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Server"
              className="w-full px-3 py-2 border border-theme rounded-lg bg-theme text-theme"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-theme mb-1">
                Hostname *
              </label>
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="192.168.1.100 or server.example.com"
                className="w-full px-3 py-2 border border-theme rounded-lg bg-theme text-theme"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-theme mb-1">
                Port
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 22)}
                className="w-full px-3 py-2 border border-theme rounded-lg bg-theme text-theme"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-theme mb-1">
              Username *
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="root"
              className="w-full px-3 py-2 border border-theme rounded-lg bg-theme text-theme"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-theme mb-1">
              Authentication Method
            </label>
            <select
              value={authMethod}
              onChange={(e) => setAuthMethod(e.target.value as AuthMethod)}
              className="w-full px-3 py-2 border border-theme rounded-lg bg-theme text-theme"
            >
              <option value="agent">SSH Agent</option>
              <option value="key">Key File</option>
              <option value="password">Password</option>
            </select>
          </div>

          {authMethod === 'key' && (
            <div>
              <label className="block text-sm font-medium text-theme mb-1">
                Key Path
              </label>
              <input
                type="text"
                value={keyPath}
                onChange={(e) => setKeyPath(e.target.value)}
                placeholder="~/.ssh/id_rsa"
                className="w-full px-3 py-2 border border-theme rounded-lg bg-theme text-theme"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sudoRequired"
              checked={sudoRequired}
              onChange={(e) => setSudoRequired(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="sudoRequired" className="text-sm text-theme">
              Require sudo for journalctl
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-theme-secondary hover:text-theme"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-theme text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-accent)' }}
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {host ? 'Save Changes' : 'Add Host'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
