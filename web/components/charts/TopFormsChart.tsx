'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface TopFormsData {
  formName: string;
  varianceCount: number;
}

interface TopFormsChartProps {
  data: TopFormsData[];
}

export function TopFormsChart({ data }: TopFormsChartProps): JSX.Element {
  const top10 = data
    .sort((a, b) => b.varianceCount - a.varianceCount)
    .slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={top10} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis dataKey="formName" type="category" width={150} />
        <Tooltip />
        <Legend />
        <Bar dataKey="varianceCount" fill="#10b981" name="Variances" />
      </BarChart>
    </ResponsiveContainer>
  );
}

