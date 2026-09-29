import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { isKeyringAvailable } from '../../lib/tauri';
import type { RemoteHost, RemoteHostInput, AuthMethod } from '../../lib/types';
import { PORT_MIN, PORT_MAX, DEFAULT_SSH_PORT } from '../../lib/constants';
import clsx from 'clsx';
import { ModalDialog } from '../ui/ModalDialog';

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= PORT_MIN && port <= PORT_MAX;
}

export interface HostEditorProps {
  host: RemoteHost | null;
  onSave: (input: RemoteHostInput) => Promise<void>;
  onCancel: () => void;
}

export function HostEditor({ host, onSave, onCancel }: HostEditorProps) {
  const [name, setName] = useState(host?.name ?? '');
  const [hostname, setHostname] = useState(host?.hostname ?? '');
  const [port, setPort] = useState(host?.port ?? DEFAULT_SSH_PORT);
  const [username, setUsername] = useState(host?.username ?? '');
  const [authMethod, setAuthMethod] = useState<AuthMethod>(host?.authMethod ?? 'agent');
  const [keyPath, setKeyPath] = useState(host?.keyPath ?? '~/.ssh/id_rsa');
  const [sudoRequired, setSudoRequired] = useState(host?.sudoRequired ?? false);
  const [savePassword, setSavePassword] = useState(host?.savePassword ?? false);
  const [keyringAvailable, setKeyringAvailable] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check keyring availability on mount
  useEffect(() => {
    isKeyringAvailable().then(setKeyringAvailable).catch(() => setKeyringAvailable(false));
  }, []);

  // Reset savePassword when switching away from password auth
  useEffect(() => {
    if (authMethod !== 'password') {
      setSavePassword(false);
    }
  }, [authMethod]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !hostname.trim() || !username.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    if (!isValidPort(port)) {
      setError(`Port must be between ${PORT_MIN} and ${PORT_MAX}`);
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
        savePassword: authMethod === 'password' ? savePassword : false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalDialog
      isOpen
      onRequestClose={onCancel}
      labelledBy="host-editor-title"
    >
      <div className="bg-theme border border-theme rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme">
          <h2 id="host-editor-title" className="text-lg font-semibold text-theme">
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
                min={PORT_MIN}
                max={PORT_MAX}
                value={port}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  setPort(isNaN(value) ? DEFAULT_SSH_PORT : value);
                }}
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

          {/* Save Password option - only for password auth */}
          {authMethod === 'password' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="savePassword"
                  checked={savePassword}
                  onChange={(e) => setSavePassword(e.target.checked)}
                  disabled={keyringAvailable === false}
                  className="rounded disabled:opacity-50"
                />
                <label
                  htmlFor="savePassword"
                  className={clsx(
                    'text-sm',
                    keyringAvailable === false ? 'text-theme-secondary' : 'text-theme'
                  )}
                >
                  Save password in system keyring
                </label>
              </div>
              {keyringAvailable === false && (
                <p className="text-xs text-amber-600 dark:text-amber-400 ml-6">
                  System keyring not available. Passwords cannot be saved securely.
                  This may happen on headless servers or systems without a keyring service
                  (e.g., GNOME Keyring, KWallet, macOS Keychain).
                </p>
              )}
              {keyringAvailable === true && savePassword && (
                <p className="text-xs text-theme-secondary ml-6">
                  Password will be stored securely in your system's credential manager.
                </p>
              )}
            </div>
          )}

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
    </ModalDialog>
  );
}
