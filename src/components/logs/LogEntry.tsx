import { memo, useState } from 'react';
import type { JournalEntry } from '../../lib/types';
import { PRIORITY_LABELS } from '../../lib/types';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import clsx from 'clsx';

interface LogEntryProps {
  entry: JournalEntry;
  searchPattern?: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function highlightText(text: string, pattern?: string): React.ReactNode {
  if (!pattern) return text;

  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="selection-theme rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  } catch {
    return text;
  }
}

const PRIORITY_CSS_CLASSES: Record<number, string> = {
  0: 'log-emerg priority-bg-emerg',
  1: 'log-alert priority-bg-alert',
  2: 'log-crit priority-bg-crit',
  3: 'log-err priority-bg-err',
  4: 'log-warning priority-bg-warning',
  5: 'log-notice priority-bg-notice',
  6: 'log-info priority-bg-info',
  7: 'log-debug priority-bg-debug',
};

export const LogEntryRow = memo(function LogEntryRow({ entry, searchPattern, isExpanded, onToggleExpand }: LogEntryProps) {
  const [copied, setCopied] = useState(false);

  const timestamp = new Date(entry.realtimeTimestamp / 1000);
  const relativeTime = formatDistanceToNow(timestamp, { addSuffix: true });
  const absoluteTime = timestamp.toLocaleString();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(entry.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={clsx(
        'border-b border-theme',
        isExpanded ? 'bg-theme-secondary' : 'hover:bg-theme-secondary'
      )}
    >
      <div
        className="flex items-start gap-2 px-3 py-2 cursor-pointer"
        onClick={onToggleExpand}
      >
        <button className="mt-1 text-theme-secondary">
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>

        {/* Timestamp */}
        <div className="w-28 flex-shrink-0">
          <div className="text-xs text-theme-secondary" title={absoluteTime}>
            {relativeTime}
          </div>
        </div>

        {/* Priority badge */}
        <span
          className={clsx(
            'w-16 flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded text-center',
            PRIORITY_CSS_CLASSES[entry.priority]
          )}
        >
          {PRIORITY_LABELS[entry.priority]}
        </span>

        {/* Unit */}
        <div className="w-48 flex-shrink-0 truncate">
          <span className="text-xs font-mono text-theme-secondary">
            {entry.systemdUnit || entry.syslogIdentifier || '-'}
          </span>
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-theme truncate">
            {highlightText(entry.message, searchPattern)}
          </p>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-10 pb-3 space-y-2 max-h-[300px] overflow-y-auto">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-theme-secondary
                         rounded hover:opacity-80 transition-opacity"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 accent-theme" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy message
                </>
              )}
            </button>
          </div>

          {/* Full message */}
          <div className="p-2 bg-theme-secondary rounded font-mono text-sm whitespace-pre-wrap break-all">
            {highlightText(entry.message, searchPattern)}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-theme-secondary">Time:</span>{' '}
              <span className="text-theme">{absoluteTime}</span>
            </div>
            {entry.pid && (
              <div>
                <span className="text-theme-secondary">PID:</span>{' '}
                <span className="text-theme">{entry.pid}</span>
              </div>
            )}
            {entry.exe && (
              <div className="col-span-2">
                <span className="text-theme-secondary">Executable:</span>{' '}
                <span className="text-theme font-mono">{entry.exe}</span>
              </div>
            )}
            <div className="col-span-2">
              <span className="text-theme-secondary">Boot ID:</span>{' '}
              <span className="text-theme font-mono text-xs break-all">
                {entry.bootId}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
