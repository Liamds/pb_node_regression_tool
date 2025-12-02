'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VarianceTrendChart } from './VarianceTrendChart';
import { ErrorTrendChart } from './ErrorTrendChart';
import { TopFormsChart } from './TopFormsChart';
import { Skeleton } from '@/components/ui/skeleton';
import { useReports } from '@/hooks/useReports';
import { useReportsDetails } from '@/hooks/useReportDetails';
import { useMemo } from 'react';
import type { ReportFilters } from '@/types';

interface ChartsSectionProps {
  filters?: ReportFilters;
}

export function ChartsSection({ filters }: ChartsSectionProps): JSX.Element {
  const { data: reports, isLoading: reportsLoading } = useReports(filters);

  // Limit to most recent 20 reports for performance
  const recentReports = useMemo(() => {
    if (!reports) return [];
    return [...reports]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20);
  }, [reports]);

  // Get report IDs for fetching details (limited to recent reports)
  const reportIds = useMemo(() => {
    return recentReports.map((r) => r.id);
  }, [recentReports]);

  const { data: allReportDetails, isLoading: detailsLoading } = useReportsDetails(reportIds);

  // Aggregate form variance data
  const topFormsData = useMemo(() => {
    if (!allReportDetails || allReportDetails.length === 0) return [];

    const formVariances: Record<string, number> = {};

    allReportDetails.forEach((form) => {
      const key = `${form.formName} (${form.formCode})`;
      formVariances[key] = (formVariances[key] || 0) + form.varianceCount;
    });

    return Object.entries(formVariances)
      .map(([formName, varianceCount]) => ({
        formName,
        varianceCount,
      }))
      .sort((a, b) => b.varianceCount - a.varianceCount)
      .slice(0, 10);
  }, [allReportDetails]);

  const isLoading = reportsLoading || detailsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[300px] w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No data available for charts. Run an analysis to see trends.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">📈 Trend Analysis</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Variance Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Variances Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <VarianceTrendChart reports={recentReports} />
          </CardContent>
        </Card>

        {/* Top Forms Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top Forms by Variance</CardTitle>
          </CardHeader>
          <CardContent>
            {topFormsData.length > 0 ? (
              <TopFormsChart data={topFormsData} />
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No form data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error Trend Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Validation Errors Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorTrendChart reports={recentReports} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

