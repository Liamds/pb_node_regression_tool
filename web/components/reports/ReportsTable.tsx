'use client';

import { useReports } from '@/hooks/useReports';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, Download, Trash2 } from 'lucide-react';
import type { ReportFilters, ReportMetadata } from '@/types';
import { formatDateTime, formatDuration } from '@/lib/format';

interface ReportsTableProps {
  filters?: ReportFilters;
  onViewDetails?: (reportId: string) => void;
  onDownload?: (reportId: string) => void;
  onDelete?: (reportId: string) => void;
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  const variantMap: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
    completed: 'success',
    running: 'warning',
    failed: 'destructive',
  };

  return (
    <Badge variant={variantMap[status] || 'default'}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

export function ReportsTable({
  filters,
  onViewDetails,
  onDownload,
  onDelete,
}: ReportsTableProps): JSX.Element {
  const { data: reports, isLoading, error } = useReports(filters);

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-destructive py-8">
        Error loading reports: {error.message}
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No reports found
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Base Date</TableHead>
            <TableHead>Returns</TableHead>
            <TableHead>Variances</TableHead>
            <TableHead>Errors</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((report) => (
            <TableRow key={report.id}>
              <TableCell>{formatDateTime(report.timestamp)}</TableCell>
              <TableCell>{report.baseDate}</TableCell>
              <TableCell>{report.totalReturns}</TableCell>
              <TableCell>{report.totalVariances.toLocaleString()}</TableCell>
              <TableCell>{report.totalValidationErrors.toLocaleString()}</TableCell>
              <TableCell>{formatDuration(report.duration)}</TableCell>
              <TableCell>
                <StatusBadge status={report.status} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewDetails?.(report.id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDownload?.(report.id)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete?.(report.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

