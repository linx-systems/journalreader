import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import type { TimeseriesPoint } from '../../lib/types';

interface TimelineHistogramProps {
  data: TimeseriesPoint[];
  onBarClick?: (point: TimeseriesPoint) => void;
}

export function TimelineHistogram({ data, onBarClick }: TimelineHistogramProps) {
  const chartData = data.map((point) => ({
    ...point,
    time: format(new Date(point.timestamp), 'MMM d HH:mm'),
    normal: point.count - point.errorCount - point.warningCount,
  }));

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-sm font-medium text-theme mb-2">Log Volume Over Time</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
              className="text-theme-secondary"
            />
            <YAxis tick={{ fontSize: 10 }} className="text-theme-secondary" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
              labelStyle={{ color: 'var(--color-text)' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar
              dataKey="normal"
              name="Normal"
              stackId="a"
              fill="#3b82f6"
              onClick={(data) => onBarClick?.(data as unknown as TimeseriesPoint)}
              cursor="pointer"
            />
            <Bar
              dataKey="warningCount"
              name="Warning"
              stackId="a"
              fill="#eab308"
              onClick={(data) => onBarClick?.(data as unknown as TimeseriesPoint)}
              cursor="pointer"
            />
            <Bar
              dataKey="errorCount"
              name="Error"
              stackId="a"
              fill="#ef4444"
              onClick={(data) => onBarClick?.(data as unknown as TimeseriesPoint)}
              cursor="pointer"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
