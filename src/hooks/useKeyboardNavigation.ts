import { useEffect, useRef, useCallback } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import { KEYBOARD_SEQUENCE_TIMEOUT_MS } from '../lib/constants';
import { isModalOpen } from '../components/ui/ModalDialog';

export interface KeyboardNavigationOptions {
  /** Total number of items in the list */
  itemCount: number;
  /** Current selected index (controlled) */
  selectedIndex: number | null;
  /** Callback when selection changes */
  onSelectionChange: (index: number | null) => void;
  /** Callback when Enter/Space pressed on selected item */
  onToggleExpand?: (index: number) => void;
  /** TanStack Virtual virtualizer instance for scrolling */
  virtualizer?: Virtualizer<HTMLDivElement, Element>;
  /** Whether navigation is enabled (disabled in inputs, modals, etc.) */
  enabled?: boolean;
}

/**
 * Hook that enables keyboard navigation for log list.
 *
 * Supported keys:
 * - j / ArrowDown: Move to next entry
 * - k / ArrowUp: Move to previous entry
 * - Enter / Space: Expand/collapse selected entry
 * - g g: Go to top (first entry)
 * - G (Shift+g): Go to bottom (last entry)
 * - Escape: Clear selection
 */
export function useKeyboardNavigation({
  itemCount,
  selectedIndex,
  onSelectionChange,
  onToggleExpand,
  virtualizer,
  enabled = true,
}: KeyboardNavigationOptions) {
  // Track 'g' key for 'gg' sequence
  const lastKeyRef = useRef<{ key: string; time: number } | null>(null);

  // Store current values in refs to avoid recreating handler
  const optionsRef = useRef({
    itemCount,
    selectedIndex,
    onSelectionChange,
    onToggleExpand,
    virtualizer,
    enabled,
  });
  optionsRef.current = {
    itemCount,
    selectedIndex,
    onSelectionChange,
    onToggleExpand,
    virtualizer,
    enabled,
  };

  const scrollToIndex = useCallback((index: number) => {
    const { virtualizer } = optionsRef.current;
    if (virtualizer) {
      virtualizer.scrollToIndex(index, { align: 'auto', behavior: 'auto' });
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isModalOpen()) return;
    const {
      itemCount,
      selectedIndex,
      onSelectionChange,
      onToggleExpand,
      enabled,
    } = optionsRef.current;

    if (!enabled || itemCount === 0) return;

    // Don't intercept if user is in an input field
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }

    // Don't intercept if modifier keys are held (except Shift for G)
    if (e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }

    const currentIndex = selectedIndex ?? -1;
    const now = Date.now();
    const lastKey = lastKeyRef.current;

    switch (e.key) {
      case 'j':
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, itemCount - 1);
        onSelectionChange(nextIndex);
        scrollToIndex(nextIndex);
        lastKeyRef.current = null;
        break;
      }

      case 'k':
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
        onSelectionChange(prevIndex);
        scrollToIndex(prevIndex);
        lastKeyRef.current = null;
        break;
      }

      case 'Enter':
      case ' ': {
        if (currentIndex >= 0 && onToggleExpand) {
          e.preventDefault();
          onToggleExpand(currentIndex);
        }
        lastKeyRef.current = null;
        break;
      }

      case 'g': {
        // Check for 'gg' sequence
        if (lastKey?.key === 'g' && now - lastKey.time < KEYBOARD_SEQUENCE_TIMEOUT_MS) {
          e.preventDefault();
          onSelectionChange(0);
          scrollToIndex(0);
          lastKeyRef.current = null;
        } else {
          lastKeyRef.current = { key: 'g', time: now };
        }
        break;
      }

      case 'G': {
        // Shift+G goes to bottom
        if (e.shiftKey) {
          e.preventDefault();
          const lastIndex = itemCount - 1;
          onSelectionChange(lastIndex);
          scrollToIndex(lastIndex);
        }
        lastKeyRef.current = null;
        break;
      }

      case 'Escape': {
        e.preventDefault();
        onSelectionChange(null);
        lastKeyRef.current = null;
        break;
      }

      default:
        // Reset 'g' sequence on any other key
        if (e.key !== 'g') {
          lastKeyRef.current = null;
        }
    }
  }, [scrollToIndex]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
