import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Copy, FileJson, Filter, MinusCircle, Search, AlertTriangle } from 'lucide-react';
import type { JournalEntry } from '../../lib/types';
import { PRIORITY_LABELS } from '../../lib/types';
import { isModalOpen } from '../ui/ModalDialog';

export interface ContextMenuItem {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  entry: JournalEntry;
  onClose: () => void;
  onCopyMessage: () => void;
  onCopyJson: () => void;
  onFilterByUnit: () => void;
  onExcludeUnit: () => void;
  onFilterByPriority: () => void;
  onSearchSimilar: () => void;
}

export function ContextMenu({
  x,
  y,
  entry,
  onClose,
  onCopyMessage,
  onCopyJson,
  onFilterByUnit,
  onExcludeUnit,
  onFilterByPriority,
  onSearchSimilar,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (isModalOpen()) return;
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Adjust position if menu would overflow viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 8;
      }

      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 8;
      }

      if (adjustedX !== x || adjustedY !== y) {
        menuRef.current.style.left = `${adjustedX}px`;
        menuRef.current.style.top = `${adjustedY}px`;
      }
    }
  }, [x, y]);

  const unitName = entry.systemdUnit || entry.syslogIdentifier;

  const items: ContextMenuItem[] = [
    {
      label: 'Copy message',
      icon: <Copy className="h-4 w-4" />,
      action: () => {
        onCopyMessage();
        onClose();
      },
    },
    {
      label: 'Copy as JSON',
      icon: <FileJson className="h-4 w-4" />,
      action: () => {
        onCopyJson();
        onClose();
      },
    },
    {
      label: `Filter by unit${unitName ? `: ${unitName}` : ''}`,
      icon: <Filter className="h-4 w-4" />,
      action: () => {
        onFilterByUnit();
        onClose();
      },
      disabled: !unitName,
    },
    {
      label: `Exclude unit${unitName ? `: ${unitName}` : ''}`,
      icon: <MinusCircle className="h-4 w-4" />,
      action: () => {
        onExcludeUnit();
        onClose();
      },
      disabled: !unitName,
    },
    {
      label: `Filter by priority: ${PRIORITY_LABELS[entry.priority]}`,
      icon: <AlertTriangle className="h-4 w-4" />,
      action: () => {
        onFilterByPriority();
        onClose();
      },
    },
    {
      label: 'Search similar messages',
      icon: <Search className="h-4 w-4" />,
      action: () => {
        onSearchSimilar();
        onClose();
      },
    },
  ];

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[220px] py-1 bg-theme border border-theme rounded-lg shadow-xl"
      style={{
        left: x,
        top: y,
        backgroundColor: 'var(--color-background)',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
      }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={item.action}
          disabled={item.disabled}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-theme
                     hover:bg-theme-secondary transition-colors disabled:opacity-50
                     disabled:cursor-not-allowed"
          style={{ color: 'var(--color-foreground)' }}
        >
          <span className="text-theme-secondary" style={{ color: 'var(--color-foreground-secondary)' }}>
            {item.icon}
          </span>
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
}
