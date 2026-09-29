import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasswordPromptDialog } from '../PasswordPromptDialog';
import type { RemoteHost } from '../../../lib/types';

const host: RemoteHost = {
  id: 'host-1',
  name: 'Secure host',
  hostname: 'secure.example.test',
  port: 22,
  username: 'reader',
  authMethod: 'password',
  sudoRequired: false,
  savePassword: false,
};

describe('PasswordPromptDialog', () => {
  it('clears the secret and invokes cancellation once when native Escape cancels the dialog', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <PasswordPromptDialog
        host={host}
        action="connect"
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    );

    const dialog = screen.getByRole('dialog', { name: /connect to secure host/i });
    const password = screen.getByPlaceholderText('Password');
    await waitFor(() => expect(password).toHaveFocus());
    await user.type(password, 'never-retain-this');

    fireEvent(dialog, new Event('cancel', { cancelable: true }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(password).toHaveValue('');
  });
});
