import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp';

function HelpHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Show help</button>
      <KeyboardShortcutsHelp isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

describe('KeyboardShortcutsHelp', () => {
  it('closes through its native Escape cancellation path and restores its opener', async () => {
    const user = userEvent.setup();
    render(<HelpHarness />);

    const opener = screen.getByRole('button', { name: 'Show help' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard Shortcuts' });

    fireEvent(dialog, new Event('cancel', { cancelable: true }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });
});
