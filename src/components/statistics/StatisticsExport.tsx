import { Download, Image } from 'lucide-react';
import type { JournalStatistics } from '../../lib/types';

export interface ExportResult {
  type: 'success' | 'error';
  message: string;
}

interface StatisticsExportProps {
  statistics: JournalStatistics;
  chartsRef: React.RefObject<HTMLDivElement | null>;
  onExportComplete?: (result: ExportResult) => void;
}

export function StatisticsExport({
  statistics,
  chartsRef,
  onExportComplete,
}: StatisticsExportProps) {
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

    const filename = `journal-statistics-${new Date().toISOString().slice(0, 10)}.csv`;
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    onExportComplete?.({ type: 'success', message: `Saved "${filename}" to Downloads` });
  };

  const exportImage = async () => {
    if (!chartsRef.current) return;

    const target = chartsRef.current;
    const scrollParent = target.parentElement;
    const originalOverflow = scrollParent?.style.overflow;
    const originalHeight = scrollParent?.style.height;

    try {
      // Temporarily modify layout for full capture
      if (scrollParent) {
        scrollParent.style.overflow = 'visible';
        scrollParent.style.height = 'auto';
      }

      const html2canvas = (await import('html2canvas')).default;

      // Get computed background color for the theme
      const bgColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-bg-secondary')
        .trim() || '#1f2937';

      const canvas = await html2canvas(target, {
        backgroundColor: bgColor,
        scale: 2,
        useCORS: true,
        logging: false,
      });

      // Restore original layout
      if (scrollParent) {
        scrollParent.style.overflow = originalOverflow || '';
        scrollParent.style.height = originalHeight || '';
      }

      const filename = `journal-statistics-${new Date().toISOString().slice(0, 10)}.png`;
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      onExportComplete?.({ type: 'success', message: `Saved "${filename}" to Downloads` });
    } catch (err) {
      // Restore layout on error
      if (scrollParent) {
        scrollParent.style.overflow = originalOverflow || '';
        scrollParent.style.height = originalHeight || '';
      }
      console.error('Failed to export image:', err);
      onExportComplete?.({ type: 'error', message: 'Export failed' });
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
    </div>
  );
}
