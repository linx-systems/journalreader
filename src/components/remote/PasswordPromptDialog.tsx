import { useRef, useCallback } from 'react';
import type { RemoteHost } from '../../lib/types';

export interface PasswordPromptDialogProps {
  host: RemoteHost | undefined;
  action: 'connect' | 'test';
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordPromptDialog({
  host,
  action,
  onSubmit,
  onCancel,
}: PasswordPromptDialogProps) {
  // Use ref for password to avoid persisting in React state/DevTools
  const passwordRef = useRef<string>('');
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const clearPassword = useCallback(() => {
    passwordRef.current = '';
    if (passwordInputRef.current) {
      passwordInputRef.current.value = '';
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const password = passwordRef.current;
    clearPassword();
    onSubmit(password);
  }, [onSubmit, clearPassword]);

  const handleCancel = useCallback(() => {
    clearPassword();
    onCancel();
  }, [onCancel, clearPassword]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-theme border border-theme rounded-lg shadow-xl w-full max-w-sm p-6">
        <h3 className="text-lg font-semibold text-theme mb-4">
          {action === 'connect' ? 'Connect to' : 'Test connection to'} {host?.name}
        </h3>
        <p className="text-sm text-theme-secondary mb-4">
          {host?.authMethod === 'password'
            ? 'Enter password for authentication'
            : 'Enter key passphrase (leave empty if none)'}
        </p>
        <input
          type="password"
          ref={passwordInputRef}
          onChange={(e) => { passwordRef.current = e.target.value; }}
          placeholder={host?.authMethod === 'password' ? 'Password' : 'Key passphrase (optional)'}
          className="w-full px-3 py-2 border border-theme rounded-lg bg-theme text-theme mb-4"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSubmit();
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-theme-secondary hover:text-theme"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium bg-accent-theme text-white rounded-lg hover:opacity-90"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {action === 'connect' ? 'Connect' : 'Test'}
          </button>
        </div>
      </div>
    </div>
  );
}
