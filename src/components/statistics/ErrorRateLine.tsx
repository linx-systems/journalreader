import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import type { TimeseriesPoint } from '../../lib/types';

interface ErrorRateLineProps {
  data: TimeseriesPoint[];
  onPointClick?: (point: TimeseriesPoint) => void;
}

export function ErrorRateLine({ data, onPointClick }: ErrorRateLineProps) {
  const chartData = data.map((point, index) => ({
    ...point,
    index,
    time: format(new Date(point.timestamp), 'MMM d HH:mm'),
    errorRate: point.count > 0 ? (point.errorCount / point.count) * 100 : 0,
  }));

  const avgErrorRate =
    chartData.length > 0
      ? chartData.reduce((sum, p) => sum + p.errorRate, 0) / chartData.length
      : 0;

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-sm font-medium text-theme mb-2">
        Error Rate Over Time
        <span className="ml-2 text-xs font-normal text-theme-secondary">
          (avg: {avgErrorRate.toFixed(1)}%)
        </span>
      </h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
              className="text-theme-secondary"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              domain={[0, 'auto']}
              tickFormatter={(value) => `${value}%`}
              className="text-theme-secondary"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
              formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Error Rate']}
            />
            <ReferenceLine
              y={avgErrorRate}
              stroke="#6b7280"
              strokeDasharray="3 3"
              label={{
                value: 'avg',
                position: 'right',
                fontSize: 10,
                fill: '#6b7280',
              }}
            />
            <Line
              type="monotone"
              dataKey="errorRate"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 3, cursor: 'pointer' }}
              activeDot={{
                r: 6,
                onClick: (_e, payload) => {
                  const idx = (payload as { index?: number })?.index;
                  if (idx !== undefined && data[idx]) {
                    onPointClick?.(data[idx]);
                  }
                },
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
