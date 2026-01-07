import { useEffect, useRef, useCallback } from 'react';

export interface GlobalShortcutsOptions {
  /** Callback for search focus (/ or Ctrl+F) */
  onFocusSearch?: () => void;
  /** Callback for refresh (Ctrl+R) */
  onRefresh?: () => void;
  /** Callback for opening settings (Ctrl+,) */
  onOpenSettings?: () => void;
  /** Callback for toggling sidebar ([ or ]) */
  onToggleSidebar?: () => void;
  /** Callback for showing help modal (?) */
  onShowHelp?: () => void;
  /** Whether shortcuts are enabled */
  enabled?: boolean;
}

/**
 * Hook that enables global keyboard shortcuts for the application.
 *
 * Supported shortcuts:
 * - / : Focus search input
 * - Ctrl+F : Focus search input
 * - Ctrl+R : Refresh logs
 * - Ctrl+, : Open settings
 * - [ or ] : Toggle sidebar
 * - ? : Show keyboard shortcuts help
 */
export function useGlobalShortcuts({
  onFocusSearch,
  onRefresh,
  onOpenSettings,
  onToggleSidebar,
  onShowHelp,
  enabled = true,
}: GlobalShortcutsOptions) {
  const optionsRef = useRef({
    onFocusSearch,
    onRefresh,
    onOpenSettings,
    onToggleSidebar,
    onShowHelp,
    enabled,
  });
  optionsRef.current = {
    onFocusSearch,
    onRefresh,
    onOpenSettings,
    onToggleSidebar,
    onShowHelp,
    enabled,
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const {
      onFocusSearch,
      onRefresh,
      onOpenSettings,
      onToggleSidebar,
      onShowHelp,
      enabled,
    } = optionsRef.current;

    if (!enabled) return;

    // Check if user is in an input field
    const isInInput =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement;

    // Handle Ctrl+key shortcuts (work even in inputs for some)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'f':
          e.preventDefault();
          onFocusSearch?.();
          return;
        case 'r':
          e.preventDefault();
          onRefresh?.();
          return;
        case ',':
          e.preventDefault();
          onOpenSettings?.();
          return;
      }
    }

    // Don't handle non-Ctrl shortcuts when in inputs
    if (isInInput) return;

    // Non-modifier shortcuts
    switch (e.key) {
      case '/':
        e.preventDefault();
        onFocusSearch?.();
        break;
      case '[':
      case ']':
        e.preventDefault();
        onToggleSidebar?.();
        break;
      case '?':
        e.preventDefault();
        onShowHelp?.();
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
