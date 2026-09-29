import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalDialog } from '../ModalDialog';

function ReplacementFlow() {
  const [current, setCurrent] = useState<'parent' | 'child' | null>(null);

  return (
    <>
      <button onClick={() => setCurrent('parent')}>Open settings</button>
      {current === 'parent' && (
        <ModalDialog
          isOpen
          labelledBy="parent-dialog-title"
          onRequestClose={() => setCurrent(null)}
        >
          <div>
            <h2 id="parent-dialog-title">Settings</h2>
            <button onClick={() => setCurrent('child')}>Edit theme</button>
          </div>
        </ModalDialog>
      )}
      {current === 'child' && (
        <ModalDialog
          isOpen
          labelledBy="child-dialog-title"
          onRequestClose={() => setCurrent(null)}
        >
          <div>
            <h2 id="child-dialog-title">Edit theme</h2>
            <button>Save</button>
          </div>
        </ModalDialog>
      )}
    </>
  );
}
afterEach(cleanup);


describe('ModalDialog', () => {
  it('opens a labelled native dialog, focuses its first enabled control, and restores its opener after cancellation', async () => {
    const user = userEvent.setup();
    const onRequestClose = vi.fn();

    function ControlledDialog() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button onClick={() => setIsOpen(true)}>Open dialog</button>
          {isOpen && (
            <ModalDialog
              isOpen
              labelledBy="controlled-dialog-title"
              onRequestClose={() => {
                onRequestClose();
                setIsOpen(false);
              }}
            >
              <div>
                <h2 id="controlled-dialog-title">Controlled dialog</h2>
                <button>First action</button>
                <button>Second action</button>
              </div>
            </ModalDialog>
          )}
        </>
      );
    }

    render(<ControlledDialog />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Controlled dialog' });
    expect(dialog).toHaveAttribute('open');
    await waitFor(() => expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus());

    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('closes only when a backdrop click is allowed', () => {
    const permittedClose = vi.fn();
    const blockedClose = vi.fn();

    const permitted = render(
      <ModalDialog isOpen labelledBy="permitted-title" onRequestClose={permittedClose} closeOnBackdrop>
        <div><h2 id="permitted-title">Permitted</h2><button>Confirm</button></div>
      </ModalDialog>
    );

    fireEvent.click(screen.getByRole('dialog', { name: 'Permitted' }));
    expect(permittedClose).toHaveBeenCalledTimes(1);
    permitted.unmount();

    render(
      <ModalDialog isOpen labelledBy="blocked-title" onRequestClose={blockedClose}>
        <div><h2 id="blocked-title">Blocked</h2><button>Cancel</button></div>
      </ModalDialog>
    );

    fireEvent.click(screen.getByRole('dialog', { name: 'Blocked' }));
    expect(blockedClose).not.toHaveBeenCalled();
  });

  it('keeps the root opener through a parent-child replacement and restores it after the child closes', async () => {
    const user = userEvent.setup();
    render(<ReplacementFlow />);

    const opener = screen.getByRole('button', { name: 'Open settings' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Edit theme' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const childDialog = screen.getByRole('dialog', { name: 'Edit theme' });
    fireEvent(childDialog, new Event('cancel', { cancelable: true }));

    await waitFor(() => expect(opener).toHaveFocus());
  });
});
