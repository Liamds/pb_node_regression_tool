'use client';

import { useState } from 'react';
import { StatisticsCards } from '@/components/statistics/StatisticsCards';
import { ReportsTable } from '@/components/reports/ReportsTable';
import { ReportDetailsDialog } from '@/components/reports/ReportDetailsDialog';
import { RunAnalysisDialog } from '@/components/analysis/RunAnalysisDialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Play, RefreshCw, FileText } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import type { ReportFilters } from '@/types';

export default function DashboardPage(): JSX.Element {
  const [filters, setFilters] = useState<ReportFilters>({});
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Load filter options
  const { data: filterOptions } = useQuery({
    queryKey: ['filterOptions'],
    queryFn: async () => {
      const result = await apiRequest<{
        baseDates: string[];
        formCodes: Array<{ code: string; name: string }>;
      }>('/filters');
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },
  });

  const handleViewDetails = (reportId: string): void => {
    setSelectedReportId(reportId);
    setIsDetailsOpen(true);
  };

  const handleDownload = (reportId: string): void => {
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/reports/${reportId}/download`;
  };

  const handleDelete = async (reportId: string): Promise<void> => {
    if (!confirm('Are you sure you want to delete this report?')) return;

    const result = await apiRequest(`/reports/${reportId}`, {
      method: 'DELETE',
    });

    if (result.success) {
      // Refresh the page or invalidate queries
      window.location.reload();
    } else {
      alert(`Error: ${result.error}`);
    }
  };

  const handleRefresh = (): void => {
    window.location.reload();
  };

  return (
    <ErrorBoundary>
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">📊 Variance Analysis Dashboard</h1>
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsRunDialogOpen(true)}>
              <Play className="h-4 w-4 mr-2" />
              Run Analysis
            </Button>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <ThemeToggle />
            <Button variant="outline" asChild>
              <a href="/api-docs" target="_blank">
                <FileText className="h-4 w-4 mr-2" />
                API Docs
              </a>
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <StatisticsCards filters={filters} />

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <Input
            placeholder="🔍 Search reports..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
          <Select
            value={filters.status || ''}
            onValueChange={(value) =>
              setFilters({ ...filters, status: value || undefined })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.baseDate || ''}
            onValueChange={(value) =>
              setFilters({ ...filters, baseDate: value || undefined })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Base Dates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Base Dates</SelectItem>
              {filterOptions?.baseDates.map((date) => (
                <SelectItem key={date} value={date}>
                  {date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.formCode || ''}
            onValueChange={(value) =>
              setFilters({ ...filters, formCode: value || undefined })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Forms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Forms</SelectItem>
              {filterOptions?.formCodes.map((form) => (
                <SelectItem key={form.code} value={form.code}>
                  {form.name} ({form.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Reports Table */}
        <ReportsTable
          filters={filters}
          onViewDetails={handleViewDetails}
          onDownload={handleDownload}
          onDelete={handleDelete}
        />

        {/* Dialogs */}
        <ReportDetailsDialog
          reportId={selectedReportId}
          open={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
        />
        <RunAnalysisDialog
          open={isRunDialogOpen}
          onOpenChange={setIsRunDialogOpen}
          onAnalysisStarted={(reportId) => {
            console.log('Analysis started:', reportId);
            // TODO: Show progress indicator
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
