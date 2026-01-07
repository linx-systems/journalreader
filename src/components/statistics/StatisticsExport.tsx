import { useState } from 'react';
import { Download, Image, Check, AlertCircle } from 'lucide-react';
import type { JournalStatistics } from '../../lib/types';

interface StatisticsExportProps {
  statistics: JournalStatistics;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function StatisticsExport({ statistics, containerRef }: StatisticsExportProps) {
  const [exportStatus, setExportStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const exportCSV = () => {
    const lines: string[] = [
      '# Journal Statistics Export',
      `# Generated: ${new Date().toISOString()}`,
      `# Total Entries: ${statistics.totalCount}`,
      `# Error Rate: ${statistics.errorRate.toFixed(2)}%`,
      '',
      '## Time Series Data',
      'Timestamp,Count,Errors,Warnings',
      ...statistics.timeseries.map(
        (p) =>
          `${new Date(p.timestamp).toISOString()},${p.count},${p.errorCount},${p.warningCount}`
      ),
      '',
      '## Priority Distribution',
      'Priority,Label,Count',
      ...statistics.priorityDistribution.map((p) => `${p.priority},${p.label},${p.count}`),
      '',
      '## Top Services',
      'Service,Count',
      ...statistics.topServices.map((s) => `"${s.service}",${s.count}`),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal-statistics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportImage = async () => {
    if (!containerRef.current) return;

    try {
      setExportStatus({ type: 'success', message: 'Exporting...' });
      const html2canvas = (await import('html2canvas')).default;

      // Capture full scrollable content by specifying dimensions
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: null,
        scale: 2,
        windowWidth: containerRef.current.scrollWidth,
        windowHeight: containerRef.current.scrollHeight,
        width: containerRef.current.scrollWidth,
        height: containerRef.current.scrollHeight,
      });

      const filename = `journal-statistics-${new Date().toISOString().slice(0, 10)}.png`;
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      setExportStatus({ type: 'success', message: `Saved "${filename}" to Downloads` });
      setTimeout(() => setExportStatus(null), 4000);
    } catch (err) {
      console.error('Failed to export image:', err);
      setExportStatus({ type: 'error', message: 'Export failed' });
      setTimeout(() => setExportStatus(null), 4000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={exportCSV}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                   text-theme bg-theme border border-theme rounded-lg
                   hover:bg-theme-secondary transition-colors"
        title="Export as CSV"
      >
        <Download className="h-4 w-4" />
        CSV
      </button>
      <button
        onClick={exportImage}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                   text-theme bg-theme border border-theme rounded-lg
                   hover:bg-theme-secondary transition-colors"
        title="Export as PNG image"
      >
        <Image className="h-4 w-4" />
        PNG
      </button>

      {/* Export status notification */}
      {exportStatus && (
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg ${
            exportStatus.type === 'success'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
          }`}
        >
          {exportStatus.type === 'success' ? (
            <Check className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {exportStatus.message}
        </div>
      )}
    </div>
  );
}
