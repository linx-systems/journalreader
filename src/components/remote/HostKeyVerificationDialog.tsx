import { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, Loader2, AlertTriangle, X } from 'lucide-react';
import { fetchHostKey, acceptHostKey, removeHostKey } from '../../lib/tauri';
import type { RemoteHost, HostKeyInfo } from '../../lib/types';
import { ModalDialog } from '../ui/ModalDialog';

interface HostKeyVerificationDialogProps {
  host: RemoteHost;
  errorMessage: string;
  onAccept: () => void;
  onReject: () => void;
}

export function HostKeyVerificationDialog({
  host,
  errorMessage,
  onAccept,
  onReject,
}: HostKeyVerificationDialogProps) {
  const [hostKeyInfo, setHostKeyInfo] = useState<HostKeyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine if this is a new host or a changed key based on error message
  const isKeyChanged = errorMessage.includes('HOST KEY HAS CHANGED');

  useEffect(() => {
    async function loadHostKey() {
      setIsLoading(true);
      setError(null);
      try {
        const keyInfo = await fetchHostKey(host.id);
        setHostKeyInfo(keyInfo);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    }
    loadHostKey();
  }, [host.id]);

  const handleAccept = async () => {
    setIsAccepting(true);
    setError(null);
    try {
      // If the key changed, we need to remove the old key first
      if (isKeyChanged) {
        await removeHostKey(host.hostname, host.port);
      }
      // Accept the new key
      await acceptHostKey(host.id);
      onAccept();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsAccepting(false);
    }
  };

  return (
    <ModalDialog
      isOpen
      onRequestClose={onReject}
      labelledBy="host-key-verification-title"
    >
      <div className="bg-theme border border-theme rounded-lg shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme">
          <div className="flex items-center gap-3">
            {isKeyChanged ? (
              <ShieldAlert className="h-6 w-6 text-red-500" />
            ) : (
              <ShieldCheck className="h-6 w-6 text-amber-500" />
            )}
            <h2 id="host-key-verification-title" className="text-lg font-semibold text-theme">
              {isKeyChanged ? 'Host Key Changed!' : 'Verify Host Key'}
            </h2>
          </div>
          <button
            onClick={onReject}
            className="p-1.5 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isKeyChanged && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700 dark:text-red-300">
                  <p className="font-semibold mb-1">Warning: Potential Security Risk!</p>
                  <p>
                    The host key for this server has changed. This could indicate:
                  </p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>The server was reinstalled or reconfigured</li>
                    <li>A man-in-the-middle attack is in progress</li>
                    <li>The server's SSH keys were rotated</li>
                  </ul>
                  <p className="mt-2">
                    Only proceed if you trust this change.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!isKeyChanged && (
            <p className="text-sm text-theme-secondary mb-4">
              This is the first time connecting to <strong>{host.name}</strong>.
              Please verify the host key fingerprint matches what you expect.
            </p>
          )}

          <div className="mb-4">
            <div className="text-sm text-theme-secondary mb-2">Connecting to:</div>
            <div className="font-mono text-sm bg-theme-secondary p-3 rounded-lg">
              {host.username}@{host.hostname}:{host.port}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-theme-secondary" />
              <span className="ml-2 text-theme-secondary">Fetching host key...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              Failed to fetch host key: {error}
            </div>
          ) : hostKeyInfo && (
            <div className="space-y-3">
              <div>
                <div className="text-sm text-theme-secondary mb-1">Key Type:</div>
                <div className="font-mono text-sm bg-theme-secondary p-2 rounded">
                  {hostKeyInfo.keyType}
                </div>
              </div>
              <div>
                <div className="text-sm text-theme-secondary mb-1">Fingerprint:</div>
                <div className="font-mono text-xs bg-theme-secondary p-3 rounded break-all select-all">
                  {hostKeyInfo.fingerprint}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-theme">
          <button
            onClick={onReject}
            className="px-4 py-2 text-sm text-theme-secondary hover:text-theme"
          >
            Cancel
          </button>
          <button
            onClick={handleAccept}
            disabled={isLoading || isAccepting || !!error}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            style={{
              backgroundColor: isKeyChanged ? 'rgb(220, 38, 38)' : 'var(--color-accent)'
            }}
          >
            {isAccepting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isKeyChanged ? 'Accept Changed Key' : 'Accept & Connect'}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
