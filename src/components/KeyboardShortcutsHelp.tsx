import { X, Keyboard } from 'lucide-react';
import { ModalDialog } from './ui/ModalDialog';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Log Navigation',
    shortcuts: [
      { keys: ['j', '↓'], description: 'Move to next log entry' },
      { keys: ['k', '↑'], description: 'Move to previous log entry' },
      { keys: ['Enter', 'Space'], description: 'Expand/collapse selected entry' },
      { keys: ['g g'], description: 'Go to first entry' },
      { keys: ['G'], description: 'Go to last entry' },
      { keys: ['Esc'], description: 'Clear selection' },
    ],
  },
  {
    title: 'Search & Filtering',
    shortcuts: [
      { keys: ['/', 'Ctrl+F'], description: 'Focus search input' },
      { keys: ['Ctrl+1-9'], description: 'Load bookmark 1-9' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['f', 'F'], description: 'Toggle follow mode' },
      { keys: ['Ctrl+R'], description: 'Refresh logs' },
      { keys: ['Ctrl+,'], description: 'Open settings' },
      { keys: ['[', ']'], description: 'Toggle sidebar' },
      { keys: ['?'], description: 'Show this help' },
    ],
  },
];

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  if (!isOpen) return null;

  return (
    <ModalDialog
      isOpen={isOpen}
      onRequestClose={onClose}
      labelledBy="keyboard-shortcuts-title"
      closeOnBackdrop
    >
      <div className="bg-theme border border-theme rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 accent-theme" />
            <h2 id="keyboard-shortcuts-title" className="text-lg font-semibold text-theme">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-theme-secondary hover:text-theme hover:bg-theme-secondary rounded transition-colors"
            title="Close keyboard shortcuts"
            aria-label="Close keyboard shortcuts"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-60px)]">
          <div className="space-y-6">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-medium text-theme-secondary mb-3">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm text-theme">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center gap-1">
                            {keyIndex > 0 && (
                              <span className="text-xs text-theme-secondary">or</span>
                            )}
                            <kbd
                              className="px-2 py-1 text-xs font-mono bg-theme-secondary
                                         border border-theme rounded shadow-sm text-theme"
                            >
                              {key}
                            </kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-theme bg-theme-secondary">
          <p className="text-xs text-theme-secondary text-center">
            Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-theme border border-theme rounded">Esc</kbd> or click outside to close
          </p>
        </div>
      </div>
    </ModalDialog>
  );
}
