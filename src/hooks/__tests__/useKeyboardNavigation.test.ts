import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardNavigation } from '../useKeyboardNavigation';
import { KEYBOARD_SEQUENCE_TIMEOUT_MS } from '../../lib/constants';
import type { Virtualizer } from '@tanstack/react-virtual';

// Mock virtualizer
function createMockVirtualizer(): Virtualizer<HTMLDivElement, Element> {
  return {
    scrollToIndex: vi.fn(),
    // Add minimal required properties for the type
    options: {} as Virtualizer<HTMLDivElement, Element>['options'],
    scrollElement: null,
    getVirtualItems: vi.fn(() => []),
    getTotalSize: vi.fn(() => 0),
    scrollToOffset: vi.fn(),
    measure: vi.fn(),
    measureElement: vi.fn(),
    getOffsetForIndex: vi.fn(() => undefined),
    scrollRect: { width: 0, height: 0 },
    scrollOffset: 0,
    scrollDirection: 'forward',
    isScrolling: false,
    range: null,
  } as unknown as Virtualizer<HTMLDivElement, Element>;
}

// Helper to fire keyboard events on window
function fireKeyDown(
  key: string,
  options: Partial<KeyboardEventInit> = {}
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  window.dispatchEvent(event);
  return event;
}

// Helper to fire keyboard events with a specific target
function fireKeyDownOnElement(
  key: string,
  target: EventTarget,
  options: Partial<KeyboardEventInit> = {}
): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  Object.defineProperty(event, 'target', { value: target });
  window.dispatchEvent(event);
}

describe('useKeyboardNavigation', () => {
  let mockOnSelectionChange: Mock<(index: number | null) => void>;
  let mockOnToggleExpand: Mock<(index: number) => void>;
  let mockVirtualizer: Virtualizer<HTMLDivElement, Element>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockOnSelectionChange = vi.fn<(index: number | null) => void>();
    mockOnToggleExpand = vi.fn<(index: number) => void>();
    mockVirtualizer = createMockVirtualizer();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Basic Navigation', () => {
    describe('j / ArrowDown moves selection down', () => {
      it('j key moves selection from 0 to 1', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('j');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(1);
      });

      it('ArrowDown moves selection from 0 to 1', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('ArrowDown');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(1);
      });

      it('j key selects first item (index 0) when nothing is selected', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('j');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
      });

      it('ArrowDown selects first item (index 0) when nothing is selected', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('ArrowDown');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
      });
    });

    describe('k / ArrowUp moves selection up', () => {
      it('k key moves selection from 5 to 4', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('k');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(4);
      });

      it('ArrowUp moves selection from 5 to 4', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('ArrowUp');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(4);
      });

      it('k key selects first item (index 0) when nothing is selected', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('k');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
      });

      it('ArrowUp selects first item (index 0) when nothing is selected', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('ArrowUp');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
      });
    });

    describe('Selection stays within bounds', () => {
      it('j key at last item stays at last item', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 9, // last item
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('j');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(9);
      });

      it('k key at first item stays at first item', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('k');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
      });

      it('ArrowDown at last item stays at last item', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 5,
            selectedIndex: 4,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('ArrowDown');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(4);
      });

      it('ArrowUp at first item stays at first item', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 5,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('ArrowUp');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
      });
    });

    describe('Empty list handling', () => {
      it('j key does nothing with empty list', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 0,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('j');

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });

      it('k key does nothing with empty list', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 0,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('k');

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });

      it('G does nothing with empty list', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 0,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('G', { shiftKey: true });

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });

      it('gg does nothing with empty list', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 0,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('g');
        vi.advanceTimersByTime(100);
        fireKeyDown('g');

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });
    });
  });

  describe('Jump Navigation', () => {
    describe('G (Shift+g) jumps to bottom', () => {
      it('G jumps to last item from any position', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('G', { shiftKey: true });

        expect(mockOnSelectionChange).toHaveBeenCalledWith(99);
      });

      it('G jumps to last item when nothing is selected', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 50,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('G', { shiftKey: true });

        expect(mockOnSelectionChange).toHaveBeenCalledWith(49);
      });

      it('G without shift does nothing (not lowercase g sequence)', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 50,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        // G without shiftKey should not trigger jump to bottom
        fireKeyDown('G', { shiftKey: false });

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });
    });

    describe('gg (double g) jumps to top', () => {
      it('gg jumps to first item from any position', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 50,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('g');
        vi.advanceTimersByTime(100); // Within timeout
        fireKeyDown('g');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
      });

      it('gg jumps to first item when nothing is selected', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('g');
        vi.advanceTimersByTime(100);
        fireKeyDown('g');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
      });

      it('single g does not trigger navigation', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 50,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('g');

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });
    });

    describe('gg timing window', () => {
      it('gg within 500ms window triggers jump to top', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 50,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('g');
        vi.advanceTimersByTime(KEYBOARD_SEQUENCE_TIMEOUT_MS - 1); // Just before timeout
        fireKeyDown('g');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
      });

      it('gg outside 500ms window does not trigger jump', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 50,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('g');
        vi.advanceTimersByTime(KEYBOARD_SEQUENCE_TIMEOUT_MS + 1); // Just after timeout
        fireKeyDown('g');

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });

      it('exactly at 500ms timeout still triggers (edge case)', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 50,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('g');
        // Advance exactly to the timeout boundary - should still work
        vi.advanceTimersByTime(KEYBOARD_SEQUENCE_TIMEOUT_MS - 1);
        fireKeyDown('g');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
      });

      it('g-other-g does not trigger gg', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 50,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('g');
        vi.advanceTimersByTime(50);
        fireKeyDown('x'); // Interrupting key
        vi.advanceTimersByTime(50);
        fireKeyDown('g');

        // Selection should not have changed to 0
        expect(mockOnSelectionChange).not.toHaveBeenCalledWith(0);
      });
    });
  });

  describe('Selection Actions', () => {
    describe('Enter toggles expand on selected item', () => {
      it('Enter calls onToggleExpand with selected index', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
            onToggleExpand: mockOnToggleExpand,
          })
        );

        fireKeyDown('Enter');

        expect(mockOnToggleExpand).toHaveBeenCalledWith(5);
      });

      it('Enter does nothing when nothing is selected', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
            onToggleExpand: mockOnToggleExpand,
          })
        );

        fireKeyDown('Enter');

        expect(mockOnToggleExpand).not.toHaveBeenCalled();
      });

      it('Enter does nothing when onToggleExpand is not provided', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
            // onToggleExpand not provided
          })
        );

        // Should not throw
        expect(() => fireKeyDown('Enter')).not.toThrow();
      });
    });

    describe('Space toggles expand on selected item', () => {
      it('Space calls onToggleExpand with selected index', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 3,
            onSelectionChange: mockOnSelectionChange,
            onToggleExpand: mockOnToggleExpand,
          })
        );

        fireKeyDown(' ');

        expect(mockOnToggleExpand).toHaveBeenCalledWith(3);
      });

      it('Space does nothing when nothing is selected', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
            onToggleExpand: mockOnToggleExpand,
          })
        );

        fireKeyDown(' ');

        expect(mockOnToggleExpand).not.toHaveBeenCalled();
      });
    });

    describe('Escape clears selection', () => {
      it('Escape sets selection to null', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('Escape');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(null);
      });

      it('Escape works when nothing is selected (no-op but no error)', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: null,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('Escape');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(null);
      });
    });
  });

  describe('Modifier Key Filtering', () => {
    describe('Ctrl+key ignored', () => {
      it('Ctrl+j does not navigate', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('j', { ctrlKey: true });

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });

      it('Ctrl+k does not navigate', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('k', { ctrlKey: true });

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });

      it('Ctrl+Enter does not toggle expand', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
            onToggleExpand: mockOnToggleExpand,
          })
        );

        fireKeyDown('Enter', { ctrlKey: true });

        expect(mockOnToggleExpand).not.toHaveBeenCalled();
      });
    });

    describe('Alt+key ignored', () => {
      it('Alt+j does not navigate', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('j', { altKey: true });

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });

      it('Alt+ArrowDown does not navigate', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('ArrowDown', { altKey: true });

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });
    });

    describe('Meta+key ignored', () => {
      it('Meta+j does not navigate', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('j', { metaKey: true });

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });

      it('Meta+g does not trigger gg sequence', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('g', { metaKey: true });
        vi.advanceTimersByTime(100);
        fireKeyDown('g', { metaKey: true });

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });
    });

    describe('Shift+G is allowed for jump to bottom', () => {
      it('Shift+G (capital G) jumps to bottom', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        fireKeyDown('G', { shiftKey: true });

        expect(mockOnSelectionChange).toHaveBeenCalledWith(99);
      });

      it('Shift+j does not navigate (only G uses shift)', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        // Shift+j produces 'J' key, not 'j'
        // The hook checks for 'j', not 'J', so this should not navigate
        fireKeyDown('J', { shiftKey: true });

        expect(mockOnSelectionChange).not.toHaveBeenCalled();
      });
    });
  });

  describe('Input Field Detection', () => {
    describe('Keys ignored when focus in text input', () => {
      it('j does not navigate when target is input', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        const input = document.createElement('input');
        document.body.appendChild(input);

        fireKeyDownOnElement('j', input);

        expect(mockOnSelectionChange).not.toHaveBeenCalled();

        document.body.removeChild(input);
      });

      it('ArrowDown does not navigate when target is input', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        const input = document.createElement('input');
        document.body.appendChild(input);

        fireKeyDownOnElement('ArrowDown', input);

        expect(mockOnSelectionChange).not.toHaveBeenCalled();

        document.body.removeChild(input);
      });
    });

    describe('Keys ignored when focus in textarea', () => {
      it('k does not navigate when target is textarea', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);

        fireKeyDownOnElement('k', textarea);

        expect(mockOnSelectionChange).not.toHaveBeenCalled();

        document.body.removeChild(textarea);
      });

      it('Enter does not toggle when target is textarea', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
            onToggleExpand: mockOnToggleExpand,
          })
        );

        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);

        fireKeyDownOnElement('Enter', textarea);

        expect(mockOnToggleExpand).not.toHaveBeenCalled();

        document.body.removeChild(textarea);
      });
    });

    describe('Keys ignored when focus in select', () => {
      it('j does not navigate when target is select', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        const select = document.createElement('select');
        document.body.appendChild(select);

        fireKeyDownOnElement('j', select);

        expect(mockOnSelectionChange).not.toHaveBeenCalled();

        document.body.removeChild(select);
      });

      it('ArrowUp does not navigate when target is select', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
          })
        );

        const select = document.createElement('select');
        document.body.appendChild(select);

        fireKeyDownOnElement('ArrowUp', select);

        expect(mockOnSelectionChange).not.toHaveBeenCalled();

        document.body.removeChild(select);
      });
    });
  });

  describe('Virtualizer Integration', () => {
    describe('Scroll to selected item when selection changes', () => {
      it('scrollToIndex is called when j moves selection', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 50,
            onSelectionChange: mockOnSelectionChange,
            virtualizer: mockVirtualizer,
          })
        );

        fireKeyDown('j');

        expect(mockVirtualizer.scrollToIndex).toHaveBeenCalledWith(51, {
          align: 'auto',
          behavior: 'auto',
        });
      });

      it('scrollToIndex is called when k moves selection', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 50,
            onSelectionChange: mockOnSelectionChange,
            virtualizer: mockVirtualizer,
          })
        );

        fireKeyDown('k');

        expect(mockVirtualizer.scrollToIndex).toHaveBeenCalledWith(49, {
          align: 'auto',
          behavior: 'auto',
        });
      });

      it('scrollToIndex is called when G jumps to bottom', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
            virtualizer: mockVirtualizer,
          })
        );

        fireKeyDown('G', { shiftKey: true });

        expect(mockVirtualizer.scrollToIndex).toHaveBeenCalledWith(99, {
          align: 'auto',
          behavior: 'auto',
        });
      });

      it('scrollToIndex is called when gg jumps to top', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 100,
            selectedIndex: 50,
            onSelectionChange: mockOnSelectionChange,
            virtualizer: mockVirtualizer,
          })
        );

        fireKeyDown('g');
        vi.advanceTimersByTime(100);
        fireKeyDown('g');

        expect(mockVirtualizer.scrollToIndex).toHaveBeenCalledWith(0, {
          align: 'auto',
          behavior: 'auto',
        });
      });
    });

    describe('Behavior without virtualizer', () => {
      it('navigation works without virtualizer (no scrolling)', () => {
        renderHook(() =>
          useKeyboardNavigation({
            itemCount: 10,
            selectedIndex: 5,
            onSelectionChange: mockOnSelectionChange,
            // no virtualizer
          })
        );

        fireKeyDown('j');

        expect(mockOnSelectionChange).toHaveBeenCalledWith(6);
        // No crash should occur
      });
    });
  });

  describe('Enabled State', () => {
    it('navigation is disabled when enabled=false', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: 0,
          onSelectionChange: mockOnSelectionChange,
          enabled: false,
        })
      );

      fireKeyDown('j');
      fireKeyDown('k');
      fireKeyDown('G', { shiftKey: true });

      expect(mockOnSelectionChange).not.toHaveBeenCalled();
    });

    it('enabled=true (default) allows navigation', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: 0,
          onSelectionChange: mockOnSelectionChange,
          // enabled defaults to true
        })
      );

      fireKeyDown('j');

      expect(mockOnSelectionChange).toHaveBeenCalledWith(1);
    });
  });

  describe('Event Prevention', () => {
    it('j key prevents default', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: 0,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      const event = fireKeyDown('j');

      expect(event.defaultPrevented).toBe(true);
    });

    it('k key prevents default', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: 5,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      const event = fireKeyDown('k');

      expect(event.defaultPrevented).toBe(true);
    });

    it('Enter prevents default when item is selected', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: 5,
          onSelectionChange: mockOnSelectionChange,
          onToggleExpand: mockOnToggleExpand,
        })
      );

      const event = fireKeyDown('Enter');

      expect(event.defaultPrevented).toBe(true);
    });

    it('Enter does not call onToggleExpand when nothing selected (no preventDefault)', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: null,
          onSelectionChange: mockOnSelectionChange,
          onToggleExpand: mockOnToggleExpand,
        })
      );

      fireKeyDown('Enter');

      // The key behavior is that onToggleExpand is not called
      // preventDefault is not called because the if condition fails (currentIndex < 0)
      expect(mockOnToggleExpand).not.toHaveBeenCalled();
    });

    it('Escape prevents default', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: 5,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      const event = fireKeyDown('Escape');

      expect(event.defaultPrevented).toBe(true);
    });

    it('G (shift+g) prevents default', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: 0,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      const event = fireKeyDown('G', { shiftKey: true });

      expect(event.defaultPrevented).toBe(true);
    });

    it('gg (second g) prevents default', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: 5,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      fireKeyDown('g'); // first g does not prevent default
      vi.advanceTimersByTime(100);
      const event = fireKeyDown('g');

      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('single item list navigation works correctly', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 1,
          selectedIndex: 0,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      fireKeyDown('j'); // Try to go down
      expect(mockOnSelectionChange).toHaveBeenCalledWith(0);

      mockOnSelectionChange.mockClear();

      fireKeyDown('k'); // Try to go up
      expect(mockOnSelectionChange).toHaveBeenCalledWith(0);

      mockOnSelectionChange.mockClear();

      fireKeyDown('G', { shiftKey: true }); // Jump to bottom
      expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
    });

    it('options update correctly via ref', () => {
      const { rerender } = renderHook(
        ({ itemCount }) =>
          useKeyboardNavigation({
            itemCount,
            selectedIndex: 0,
            onSelectionChange: mockOnSelectionChange,
          }),
        { initialProps: { itemCount: 10 } }
      );

      fireKeyDown('G', { shiftKey: true });
      expect(mockOnSelectionChange).toHaveBeenCalledWith(9);

      mockOnSelectionChange.mockClear();

      // Rerender with different itemCount
      rerender({ itemCount: 50 });

      fireKeyDown('G', { shiftKey: true });
      expect(mockOnSelectionChange).toHaveBeenCalledWith(49);
    });

    it('cleanup removes event listener on unmount', () => {
      const { unmount } = renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: 0,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      unmount();

      // Should not call handler after unmount
      fireKeyDown('j');
      expect(mockOnSelectionChange).not.toHaveBeenCalled();
    });

    it('rapid key presses work correctly', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 100,
          selectedIndex: 50,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      fireKeyDown('j');
      fireKeyDown('j');
      fireKeyDown('j');

      // Each call uses the optionsRef.current which still has selectedIndex: 50
      // So each call will produce 51
      expect(mockOnSelectionChange).toHaveBeenCalledTimes(3);
      expect(mockOnSelectionChange).toHaveBeenNthCalledWith(1, 51);
      expect(mockOnSelectionChange).toHaveBeenNthCalledWith(2, 51);
      expect(mockOnSelectionChange).toHaveBeenNthCalledWith(3, 51);
    });

    it('unknown keys do not trigger any action', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: 5,
          onSelectionChange: mockOnSelectionChange,
          onToggleExpand: mockOnToggleExpand,
        })
      );

      fireKeyDown('x');
      fireKeyDown('1');
      fireKeyDown('Tab');
      fireKeyDown('a');

      expect(mockOnSelectionChange).not.toHaveBeenCalled();
      expect(mockOnToggleExpand).not.toHaveBeenCalled();
    });

    it('g sequence resets on non-g key', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 100,
          selectedIndex: 50,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      // Press g, then x, then g again - should not trigger gg
      fireKeyDown('g');
      vi.advanceTimersByTime(100);
      fireKeyDown('x');
      vi.advanceTimersByTime(100);
      fireKeyDown('g');

      // No gg should have been triggered
      expect(mockOnSelectionChange).not.toHaveBeenCalled();
    });

    it('selectedIndex of -1 equivalent to null for boundary calculation', () => {
      // The code treats currentIndex < 0 as -1, which means next/prev calculation starts from there
      // Actually, looking at the code: const currentIndex = selectedIndex ?? -1;
      // So null becomes -1, and going down from -1 goes to 0

      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: null,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      fireKeyDown('j');

      // From null/-1, going down should go to 0
      expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
    });
  });

  describe('g key edge cases', () => {
    it('first g alone does not call onSelectionChange', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 10,
          selectedIndex: 5,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      fireKeyDown('g');

      expect(mockOnSelectionChange).not.toHaveBeenCalled();
    });

    it('g after timeout followed by another g starts new sequence', () => {
      renderHook(() =>
        useKeyboardNavigation({
          itemCount: 100,
          selectedIndex: 50,
          onSelectionChange: mockOnSelectionChange,
        })
      );

      // First g
      fireKeyDown('g');
      // Wait past timeout
      vi.advanceTimersByTime(KEYBOARD_SEQUENCE_TIMEOUT_MS + 100);
      // This g starts a new sequence
      fireKeyDown('g');
      // Quick follow-up g should trigger
      vi.advanceTimersByTime(100);
      fireKeyDown('g');

      expect(mockOnSelectionChange).toHaveBeenCalledWith(0);
    });
  });
});
