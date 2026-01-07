import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { ServiceCount } from '../../lib/types';

interface TopServicesProps {
  data: ServiceCount[];
  onBarClick?: (service: string) => void;
}

interface ChartDataItem {
  service: string;
  count: number;
  shortName: string;
}

export function TopServices({ data, onBarClick }: TopServicesProps) {
  // Take top 10 and shorten service names
  const chartData: ChartDataItem[] = data.slice(0, 10).map((s) => ({
    service: s.service,
    count: s.count,
    shortName: s.service
      .replace('.service', '')
      .replace('.scope', '')
      .replace('.slice', ''),
  }));

  const handleBarClick = (entry: ChartDataItem) => {
    onBarClick?.(entry.service);
  };

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-sm font-medium text-theme mb-2">Top Services</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
          >
            <XAxis type="number" tick={{ fontSize: 10 }} className="text-theme-secondary" />
            <YAxis
              type="category"
              dataKey="shortName"
              tick={{ fontSize: 10 }}
              width={120}
              className="text-theme-secondary"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
              formatter={(value) => [Number(value).toLocaleString(), 'Entries']}
              labelFormatter={(label) => `Service: ${label}`}
            />
            <Bar
              dataKey="count"
              fill="#8b5cf6"
              onClick={(data) => handleBarClick(data as unknown as ChartDataItem)}
              cursor="pointer"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
