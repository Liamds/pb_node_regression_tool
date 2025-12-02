'use client';

import { useTheme } from 'next-themes';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ReportMetadata } from '@/types';
import { useMemo } from 'react';

interface ErrorTrendChartProps {
  reports: ReportMetadata[];
}

export function ErrorTrendChart({ reports }: ErrorTrendChartProps): JSX.Element {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const chartData = useMemo(() => {
    const sortedReports = [...reports].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return sortedReports.map((report) => ({
      date: new Date(report.timestamp).toLocaleDateString(),
      errors: report.totalValidationErrors,
    }));
  }, [reports]);

  const textColor = isDark ? '#e2e8f0' : '#334155';
  const gridColor = isDark ? '#334155' : '#e2e8f0';

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey="date"
          tick={{ fill: textColor }}
          style={{ fontSize: '12px' }}
        />
        <YAxis
          tick={{ fill: textColor }}
          style={{ fontSize: '12px' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            border: `1px solid ${gridColor}`,
            borderRadius: '8px',
            color: textColor,
          }}
        />
        <Legend
          wrapperStyle={{ color: textColor }}
        />
        <Line
          type="monotone"
          dataKey="errors"
          stroke="#ef4444"
          strokeWidth={2}
          name="Validation Errors"
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

