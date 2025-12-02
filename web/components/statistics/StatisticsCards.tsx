'use client';

import { useStatistics } from '@/hooks/useStatistics';
import { StatCard } from './StatCard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, AlertTriangle, XCircle } from 'lucide-react';
import type { ReportFilters } from '@/types';

interface StatisticsCardsProps {
  filters?: ReportFilters;
}

export function StatisticsCards({ filters }: StatisticsCardsProps): JSX.Element {
  const { data, isLoading, error } = useStatistics(filters);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-6">
            <Skeleton className="h-4 w-24 mb-4" />
            <Skeleton className="h-8 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-destructive py-8">
        Error loading statistics: {error.message}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard
        title="Total Reports"
        value={data.totalReports}
        icon={<BarChart3 />}
      />
      <StatCard
        title="Total Variances"
        value={data.totalVariances.toLocaleString()}
        icon={<AlertTriangle />}
      />
      <StatCard
        title="Validation Errors"
        value={data.totalValidationErrors.toLocaleString()}
        icon={<XCircle />}
      />
    </div>
  );
}

