'use client';

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

interface VarianceTrendChartProps {
  reports: ReportMetadata[];
}

export function VarianceTrendChart({ reports }: VarianceTrendChartProps): JSX.Element {
  const sortedReports = [...reports].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const data = sortedReports.map((report) => ({
    date: new Date(report.timestamp).toLocaleDateString(),
    variances: report.totalVariances,
    errors: report.totalValidationErrors,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="variances"
          stroke="#2563eb"
          strokeWidth={2}
          name="Variances"
        />
        <Line
          type="monotone"
          dataKey="errors"
          stroke="#ef4444"
          strokeWidth={2}
          name="Errors"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

