import { useState, useEffect } from 'react';
import { X, Plus, Server, Loader2, AlertCircle } from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import {
  testHostConnection,
  connectToHostAcceptKey,
  getHostPassword,
  saveHostPassword,
  deleteHostPassword,
} from '../../lib/tauri';
import { isHostKeyVerificationError, isAuthenticationError, getErrorMessage } from '../../lib/sshErrors';
import { logError } from '../../lib/errorLogger';
import type { RemoteHost, RemoteHostInput } from '../../lib/types';
import { HostKeyVerificationDialog } from './HostKeyVerificationDialog';
import { HostCard } from './HostCard';
import { HostEditor } from './HostEditor';
import { PasswordPromptDialog } from './PasswordPromptDialog';
import { ModalDialog } from '../ui/ModalDialog';

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

  /**
   * Checks if the error is a host key verification error and sets up the verification dialog.
   * Returns true if it was a host key error (caller should return early), false otherwise.
   */
  const checkHostKeyError = (
    errorMessage: string,
    host: RemoteHost,
    password?: string
  ): boolean => {
    if (isHostKeyVerificationError(errorMessage)) {
      setHostKeyVerification({ host, errorMessage, password });
      return true;
    }
    return false;
  };

  const handleConnect = async (host: RemoteHost, pwd?: string) => {
    // Check if password is needed
    if (host.authMethod === 'password' && !pwd) {
      // Try to get saved password from keyring first
      if (host.savePassword) {
        try {
          const savedPassword = await getHostPassword(host.id);
          if (savedPassword) {
            // Use saved password
            setIsConnecting(host.id);
            try {
              await connect(host.id, savedPassword);
              return;
            } catch (error) {
              const errorMessage = getErrorMessage(error);
              if (checkHostKeyError(errorMessage, host, savedPassword)) {
                return;
              }
              // If auth failed, prompt for password (saved password might be outdated)
              if (isAuthenticationError(errorMessage)) {
                // Delete outdated password - may fail if password doesn't exist in keyring
                await deleteHostPassword(host.id).catch((err) =>
                  logError(err, { component: 'ConnectionManager', action: 'deleteOutdatedPassword', hostId: host.id })
                );
              } else {
                // Other errors are shown through connection store
                return;
              }
            } finally {
              setIsConnecting(null);
            }
          }
        } catch {
          // Keyring error, fall through to password prompt
        }
      }
      setPasswordPrompt({ hostId: host.id, action: 'connect' });
      return;
    }

    setIsConnecting(host.id);
    try {
      await connect(host.id, pwd);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      checkHostKeyError(errorMessage, host, pwd);
      // Other errors are shown through connection store
    } finally {
      setIsConnecting(null);
    }
  };

  const handleConnectWithPassword = async (password: string) => {
    if (!passwordPrompt) return;

    const hostId = passwordPrompt.hostId;
    const action = passwordPrompt.action;
    const host = hosts.find((h) => h.id === hostId);

    setPasswordPrompt(null);
    setIsConnecting(hostId);

    try {
      if (action === 'connect') {
        await connect(hostId, password);
        // Save password to keyring if enabled and connection succeeded
        if (host?.savePassword && password) {
          try {
            await saveHostPassword(hostId, password);
          } catch (err) {
            // Password save is optional - log but don't fail the connection
            logError(err, { component: 'ConnectionManager', action: 'savePassword', hostId });
          }
        }
      } else {
        setIsTesting(hostId);
        const result = await testHostConnection(hostId, password);
        setTestResult({
          hostId: hostId,
          success: result.success,
          message: result.message,
        });
        setIsTesting(null);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      if (host) {
        checkHostKeyError(errorMessage, host, password);
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
      const errorMessage = getErrorMessage(error);
      if (!checkHostKeyError(errorMessage, host)) {
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
    // Delete saved password from keyring if any
    if (host.savePassword) {
      try {
        await deleteHostPassword(host.id);
      } catch (err) {
        // Password deletion is optional - log but still proceed with host deletion
        logError(err, { component: 'ConnectionManager', action: 'deletePasswordOnHostDelete', hostId: host.id });
      }
    }
    await deleteHost(host.id);
  };

  const handleSaveHost = async (input: RemoteHostInput) => {
    if (editingHost) {
      // If savePassword was disabled, delete the saved password
      if (editingHost.savePassword && !input.savePassword) {
        try {
          await deleteHostPassword(editingHost.id);
        } catch (err) {
          // Password deletion is optional - log but still proceed with host update
          logError(err, { component: 'ConnectionManager', action: 'deletePasswordOnSavePasswordDisabled', hostId: editingHost.id });
        }
      }
      await updateHost(editingHost.id, input);
    } else {
      await addHost(input);
    }
    setEditingHost(null);
    setIsCreating(false);
  };

  const handleCancelEdit = () => {
    setEditingHost(null);
    setIsCreating(false);
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
      } catch {
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
        onSave={handleSaveHost}
        onCancel={handleCancelEdit}
      />
    );
  }

  if (passwordPrompt) {
    const host = hosts.find((h) => h.id === passwordPrompt.hostId);
    return (
      <PasswordPromptDialog
        host={host}
        action={passwordPrompt.action}
        onSubmit={handleConnectWithPassword}
        onCancel={() => setPasswordPrompt(null)}
      />
    );
  }

  return (
    <ModalDialog
      isOpen={isOpen}
      onRequestClose={onClose}
      labelledBy="connection-manager-title"
    >
      <div className="bg-theme border border-theme rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme">
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 accent-theme" />
            <h2 id="connection-manager-title" className="text-lg font-semibold text-theme">Remote Hosts</h2>
          </div>
          <button
            onClick={onClose}
            title="Close remote hosts"
            aria-label="Close remote hosts"
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
            title="Add remote host"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-theme text-white rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            <Plus className="h-4 w-4" />
            Add Host
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
