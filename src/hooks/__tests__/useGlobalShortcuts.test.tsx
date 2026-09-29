import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useGlobalShortcuts } from '../useGlobalShortcuts';
import { ModalDialog } from '../../components/ui/ModalDialog';

function ShortcutHarness({ onRefresh }: { onRefresh: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  useGlobalShortcuts({ onRefresh });

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open modal</button>
      {isOpen && (
        <ModalDialog isOpen labelledBy="shortcut-modal-title" onRequestClose={() => setIsOpen(false)}>
          <div><h2 id="shortcut-modal-title">Shortcut modal</h2><button>Dismiss</button></div>
        </ModalDialog>
      )}
    </>
  );
}

describe('useGlobalShortcuts', () => {
  it('leaves Ctrl+R untouched while a modal covers the application', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<ShortcutHarness onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: 'Open modal' }));
    const refresh = new KeyboardEvent('keydown', {
      key: 'r',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(refresh);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(refresh.defaultPrevented).toBe(false);

    fireEvent(screen.getByRole('dialog', { name: 'Shortcut modal' }), new Event('cancel', { cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
