import { Download, Image } from 'lucide-react';
import type { JournalStatistics } from '../../lib/types';

interface StatisticsExportProps {
  statistics: JournalStatistics;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function StatisticsExport({ statistics, containerRef }: StatisticsExportProps) {
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
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: null,
        scale: 2,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `journal-statistics-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (err) {
      console.error('Failed to export image:', err);
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
