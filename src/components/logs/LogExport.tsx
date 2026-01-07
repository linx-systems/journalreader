import { useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import type { JournalEntry, JournalFilter } from '../../lib/types';
import { PRIORITY_LABELS } from '../../lib/types';

export interface LogExportResult {
  type: 'success' | 'error';
  message: string;
}

interface LogExportProps {
  entries: JournalEntry[];
  filter: JournalFilter;
  onExportComplete?: (result: LogExportResult) => void;
}

type ExportFormat = 'json' | 'csv' | 'text';

interface FormatConfig {
  extension: string;
  filterName: string;
}

const FORMAT_CONFIG: Record<ExportFormat, FormatConfig> = {
  json: { extension: 'json', filterName: 'JSON Files' },
  csv: { extension: 'csv', filterName: 'CSV Files' },
  text: { extension: 'log', filterName: 'Log Files' },
};

function formatTimestamp(realtimeTimestamp: number): string {
  return new Date(realtimeTimestamp / 1000).toISOString();
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function generateExportData(
  entries: JournalEntry[],
  filter: JournalFilter,
  format: ExportFormat
): string {
  const metadata = {
    exportedAt: new Date().toISOString(),
    entryCount: entries.length,
    filter: {
      units: filter.units,
      excludedUnits: filter.excludedUnits,
      priorities: filter.priorities,
      since: filter.since,
      until: filter.until,
      grepPattern: filter.grepPattern,
      caseSensitive: filter.caseSensitive,
      bootId: filter.bootId,
    },
  };

  switch (format) {
    case 'json': {
      const exportObj = {
        ...metadata,
        entries: entries.map((e) => ({
          timestamp: formatTimestamp(e.realtimeTimestamp),
          priority: e.priority,
          priorityLabel: PRIORITY_LABELS[e.priority],
          unit: e.systemdUnit || e.syslogIdentifier || null,
          message: e.message,
          bootId: e.bootId,
          pid: e.pid,
          hostname: e.hostname,
        })),
      };
      return JSON.stringify(exportObj, null, 2);
    }

    case 'csv': {
      const header = 'timestamp,priority,priority_label,unit,message,boot_id,pid';
      const rows = entries.map((e) =>
        [
          formatTimestamp(e.realtimeTimestamp),
          e.priority,
          PRIORITY_LABELS[e.priority],
          escapeCSV(e.systemdUnit || e.syslogIdentifier || ''),
          escapeCSV(e.message),
          e.bootId,
          e.pid ?? '',
        ].join(',')
      );
      const metaComment = [
        `# Exported: ${metadata.exportedAt}`,
        `# Entry Count: ${metadata.entryCount}`,
        filter.grepPattern ? `# Search Pattern: ${filter.grepPattern}` : null,
        filter.since ? `# Since: ${filter.since}` : null,
        filter.until ? `# Until: ${filter.until}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      return `${metaComment}\n${header}\n${rows.join('\n')}`;
    }

    case 'text': {
      const lines = entries.map((e) => {
        const ts = formatTimestamp(e.realtimeTimestamp);
        const unit = e.systemdUnit || e.syslogIdentifier || '-';
        const level = PRIORITY_LABELS[e.priority].toUpperCase().padEnd(7);
        return `${ts} ${level} [${unit}] ${e.message}`;
      });
      const metaLines = [
        `# Journal Log Export`,
        `# Exported: ${metadata.exportedAt}`,
        `# Entry Count: ${metadata.entryCount}`,
        filter.grepPattern ? `# Search Pattern: ${filter.grepPattern}` : null,
        filter.since ? `# Since: ${filter.since}` : null,
        filter.until ? `# Until: ${filter.until}` : null,
        `#`,
      ]
        .filter(Boolean)
        .join('\n');
      return `${metaLines}\n${lines.join('\n')}`;
    }
  }
}

function getDefaultFilename(format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10);
  return `journal-logs-${date}.${FORMAT_CONFIG[format].extension}`;
}

export function LogExport({ entries, filter, onExportComplete }: LogExportProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    setIsOpen(false);

    if (entries.length === 0) {
      onExportComplete?.({ type: 'error', message: 'No entries to export' });
      return;
    }

    try {
      const config = FORMAT_CONFIG[format];

      // Show native save dialog via Tauri
      const filePath = await save({
        defaultPath: getDefaultFilename(format),
        filters: [
          {
            name: config.filterName,
            extensions: [config.extension],
          },
        ],
      });

      // User cancelled
      if (!filePath) {
        return;
      }

      // Generate and write the data
      const data = generateExportData(entries, filter, format);
      await writeTextFile(filePath, data);

      // Extract filename from path for display
      const filename = filePath.split('/').pop() || filePath;
      onExportComplete?.({
        type: 'success',
        message: `Exported ${entries.length} entries to "${filename}"`,
      });
    } catch (err) {
      console.error('Export failed:', err);
      onExportComplete?.({ type: 'error', message: 'Export failed' });
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={entries.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                   text-theme bg-theme border border-theme rounded-lg
                   hover:bg-theme-secondary transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
        title={entries.length === 0 ? 'No entries to export' : 'Export logs'}
      >
        <Download className="h-4 w-4" />
        Export
        <ChevronDown className="h-3 w-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div
            className="absolute right-0 mt-1 py-1 w-32 bg-theme border border-theme
                       rounded-lg shadow-lg z-20"
          >
            <button
              onClick={() => handleExport('json')}
              className="w-full px-3 py-1.5 text-left text-sm text-theme
                         hover:bg-theme-secondary transition-colors"
            >
              JSON
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="w-full px-3 py-1.5 text-left text-sm text-theme
                         hover:bg-theme-secondary transition-colors"
            >
              CSV
            </button>
            <button
              onClick={() => handleExport('text')}
              className="w-full px-3 py-1.5 text-left text-sm text-theme
                         hover:bg-theme-secondary transition-colors"
            >
              Plain Text
            </button>
          </div>
        </>
      )}
    </div>
  );
}
