import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { PriorityCount } from '../../lib/types';

const PRIORITY_COLORS: Record<number, string> = {
  0: '#dc2626', // emerg - red
  1: '#ea580c', // alert - orange
  2: '#d97706', // crit - amber
  3: '#ca8a04', // err - yellow
  4: '#84cc16', // warning - lime
  5: '#22c55e', // notice - green
  6: '#3b82f6', // info - blue
  7: '#6b7280', // debug - gray
};

interface PriorityDistributionProps {
  data: PriorityCount[];
  onSliceClick?: (priority: number) => void;
}

export function PriorityDistribution({ data, onSliceClick }: PriorityDistributionProps) {
  // Filter out zero counts and sort by count descending for better visualization
  const filteredData = data.filter((d) => d.count > 0);

  // Convert to format compatible with recharts
  const chartData = filteredData.map((d) => ({
    priority: d.priority,
    label: d.label,
    count: d.count,
  }));

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-sm font-medium text-theme mb-2">Priority Distribution</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius="70%"
              onClick={(entry) => onSliceClick?.(entry.priority)}
              cursor="pointer"
              label={({ payload, percent }) => {
                const p = percent ?? 0;
                return p > 0.05 ? `${payload.label} (${(p * 100).toFixed(0)}%)` : '';
              }}
              labelLine={false}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.priority}
                  fill={PRIORITY_COLORS[entry.priority] || '#6b7280'}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
              formatter={(value) => [Number(value).toLocaleString(), 'Count']}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value) => <span className="text-theme">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
