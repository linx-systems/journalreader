import { useCallback, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react';

interface ModalDialogProps {
  isOpen: boolean;
  onRequestClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
  closeOnBackdrop?: boolean;
}

let rootOpener: HTMLElement | null = null;
const openDialogs = new Set<HTMLDialogElement>();
let restorePending = false;

function restoreRootOpenerWhenIdle() {
  if (restorePending) return;

  restorePending = true;
  queueMicrotask(() => {
    restorePending = false;
    if (openDialogs.size > 0) return;

    const opener = rootOpener;
    rootOpener = null;
    if (opener?.isConnected) {
      try {
        opener.focus();
      } catch {
        // A connected opener may still become unfocusable during teardown.
      }
    }
  });
}

function focusFirstControl(dialog: HTMLDialogElement) {
  const control = dialog.querySelector<HTMLElement>(
    'button:not([disabled]):not([aria-disabled="true"]), [href], input:not([type="hidden"]):not([disabled]):not([aria-disabled="true"]), select:not([disabled]):not([aria-disabled="true"]), textarea:not([disabled]):not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"]):not([disabled]):not([aria-disabled="true"])'
  );

  if (!control) return;

  const style = window.getComputedStyle(control);
  const isHidden = control.hidden ||
    control.closest('[hidden], [aria-hidden="true"]') !== null ||
    style.display === 'none' ||
    style.visibility === 'hidden';
  if (!isHidden) {
    control.focus();
  }
}

/** Returns whether a native modal dialog currently covers the application. */
export function isModalOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('dialog[open]') !== null;
}

/**
 * Controlled native modal dialog with application-wide opener restoration.
 * Parent/child replacement flows retain the first opener until the final dialog closes.
 */
export function ModalDialog({
  isOpen,
  onRequestClose,
  labelledBy,
  children,
  className,
  closeOnBackdrop = false,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const registeredDialogRef = useRef<HTMLDialogElement | null>(null);

  const releaseDialog = useCallback((dialog: HTMLDialogElement) => {
    if (registeredDialogRef.current !== dialog) return;

    registeredDialogRef.current = null;
    openDialogs.delete(dialog);
    restoreRootOpenerWhenIdle();
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return;

    if (openDialogs.size === 0 && rootOpener === null) {
      const activeElement = document.activeElement;
      rootOpener = activeElement instanceof HTMLElement && activeElement.isConnected
        ? activeElement
        : null;
    }

    openDialogs.add(dialog);
    registeredDialogRef.current = dialog;

    if (!dialog.open) {
      dialog.showModal();
    }

    queueMicrotask(() => {
      if (dialog.isConnected && dialog.open) {
        focusFirstControl(dialog);
      }
    });

    return () => {
      if (dialog.open) {
        dialog.close();
      }
      releaseDialog(dialog);
    };
  }, [isOpen, releaseDialog]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onRequestClose();
    };
    const handleClose = () => releaseDialog(dialog);

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
    };
  }, [onRequestClose, releaseDialog]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen || !dialog?.open) return;

    dialog.close();
  }, [isOpen]);

  const handleClick = useCallback((event: MouseEvent<HTMLDialogElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onRequestClose();
    }
  }, [closeOnBackdrop, onRequestClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      className={className ? `modal-dialog ${className}` : 'modal-dialog'}
      onClick={handleClick}
    >
      {children}
    </dialog>
  );
}
