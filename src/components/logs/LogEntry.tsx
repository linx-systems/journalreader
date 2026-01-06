import { memo, useState } from 'react';
import type { JournalEntry } from '../../lib/types';
import { PRIORITY_LABELS, PRIORITY_COLORS, PRIORITY_BG_COLORS } from '../../lib/types';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import clsx from 'clsx';

interface LogEntryProps {
  entry: JournalEntry;
  searchPattern?: string;
}

function highlightText(text: string, pattern?: string): React.ReactNode {
  if (!pattern) return text;

  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
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

export const LogEntryRow = memo(function LogEntryRow({ entry, searchPattern }: LogEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
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
        'border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50',
        isExpanded && 'bg-gray-50 dark:bg-gray-800/50'
      )}
    >
      <div
        className="flex items-start gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button className="mt-1 text-gray-400">
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>

        {/* Timestamp */}
        <div className="w-28 flex-shrink-0">
          <div className="text-xs text-gray-500 dark:text-gray-400" title={absoluteTime}>
            {relativeTime}
          </div>
        </div>

        {/* Priority badge */}
        <span
          className={clsx(
            'w-16 flex-shrink-0 px-1.5 py-0.5 text-xs font-medium rounded text-center',
            PRIORITY_BG_COLORS[entry.priority],
            PRIORITY_COLORS[entry.priority]
          )}
        >
          {PRIORITY_LABELS[entry.priority]}
        </span>

        {/* Unit */}
        <div className="w-48 flex-shrink-0 truncate">
          <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
            {entry.systemdUnit || entry.syslogIdentifier || '-'}
          </span>
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-gray-900 dark:text-gray-100 truncate">
            {highlightText(entry.message, searchPattern)}
          </p>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-10 pb-3 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700
                         rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
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
          <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded font-mono text-sm whitespace-pre-wrap break-all">
            {highlightText(entry.message, searchPattern)}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Time:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">{absoluteTime}</span>
            </div>
            {entry.pid && (
              <div>
                <span className="text-gray-500">PID:</span>{' '}
                <span className="text-gray-900 dark:text-gray-100">{entry.pid}</span>
              </div>
            )}
            {entry.exe && (
              <div className="col-span-2">
                <span className="text-gray-500">Executable:</span>{' '}
                <span className="text-gray-900 dark:text-gray-100 font-mono">{entry.exe}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">Boot ID:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100 font-mono text-xs">
                {entry.bootId.substring(0, 8)}...
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
