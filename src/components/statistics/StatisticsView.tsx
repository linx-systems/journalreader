import { useRef, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useStatistics } from '../../hooks/useStatistics';
import { useFilterStore } from '../../stores/filterStore';
import { useStatisticsStore } from '../../stores/statisticsStore';
import { computeGranularityMs } from '../../lib/statistics';
import { TimelineHistogram } from './TimelineHistogram';
import { PriorityDistribution } from './PriorityDistribution';
import { TopServices } from './TopServices';
import { ErrorRateLine } from './ErrorRateLine';
import { GranularitySelector } from './GranularitySelector';
import { StatisticsExport, type ExportResult } from './StatisticsExport';
import { Toast } from './Toast';

export function StatisticsView() {
  const chartsRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<ExportResult | null>(null);
  const { statistics, isLoading, error, refresh } = useStatistics();
  const { filter, setFilter } = useFilterStore();
  const { granularity, setViewMode } = useStatisticsStore();

  const handleTimeRangeClick = (point: { timestamp: number }) => {
    // Calculate the bucket end time based on granularity
    const granularityMs = computeGranularityMs(granularity, filter.since, filter.until);
    const start = new Date(point.timestamp);
    const end = new Date(point.timestamp + granularityMs);

    setFilter({
      since: start.toISOString(),
      until: end.toISOString(),
    });
    setViewMode('logs');
  };

  const handlePriorityClick = (priority: number) => {
    setFilter({ priorities: [priority] });
    setViewMode('logs');
  };

  const handleServiceClick = (service: string) => {
    setFilter({ units: [service], excludedUnits: [] });
    setViewMode('logs');
  };

  const handleExportComplete = (result: ExportResult) => {
    setToast(result);
  };

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-lg font-medium text-theme mb-2">Error loading statistics</h3>
          <p className="text-sm text-theme-secondary max-w-md mb-4">{error}</p>
          <button
            onClick={refresh}
            className="flex items-center gap-2 mx-auto px-4 py-2 text-sm font-medium
                       text-theme bg-theme border border-theme rounded-lg
                       hover:bg-theme-secondary transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !statistics) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <Loader2 className="h-12 w-12 text-accent animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-medium text-theme mb-2">Computing statistics...</h3>
          <p className="text-sm text-theme-secondary">
            Analyzing journal entries
          </p>
        </div>
      </div>
    );
  }

  const hasData = statistics.totalCount > 0;

  if (!hasData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="h-12 w-12 mx-auto mb-4 text-theme-secondary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M7 16l4-8 4 4 6-6" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-theme mb-2">No data available</h3>
          <p className="text-sm text-theme-secondary max-w-md">
            No journal entries match your current filters. Try adjusting the time range or filters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme">
        <div className="flex items-center gap-4">
          <span className="text-sm text-theme-secondary">
            <span className="font-medium text-theme">
              {statistics.totalCount.toLocaleString()}
            </span>{' '}
            total entries
          </span>
          <span className="text-sm text-theme-secondary">
            Error rate:{' '}
            <span className="font-medium text-theme">{statistics.errorRate.toFixed(1)}%</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <GranularitySelector />
          <StatisticsExport
            statistics={statistics}
            chartsRef={chartsRef}
            onExportComplete={handleExportComplete}
          />
        </div>
      </div>

      {/* Charts Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Timeline - full width on top */}
          <div className="lg:col-span-2 bg-theme rounded-lg p-4 border border-theme h-64">
            <TimelineHistogram data={statistics.timeseries} onBarClick={handleTimeRangeClick} />
          </div>

          {/* Priority Distribution */}
          <div className="bg-theme rounded-lg p-4 border border-theme h-72">
            <PriorityDistribution
              data={statistics.priorityDistribution}
              onSliceClick={handlePriorityClick}
            />
          </div>

          {/* Top Services */}
          <div className="bg-theme rounded-lg p-4 border border-theme h-72">
            <TopServices data={statistics.topServices} onBarClick={handleServiceClick} />
          </div>

          {/* Error Rate - full width on bottom */}
          <div className="lg:col-span-2 bg-theme rounded-lg p-4 border border-theme h-64">
            <ErrorRateLine data={statistics.timeseries} onPointClick={handleTimeRangeClick} />
          </div>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
