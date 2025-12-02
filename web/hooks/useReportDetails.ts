'use client';

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';

interface FormDetail {
  formName: string;
  formCode: string;
  varianceCount: number;
  validationErrorCount: number;
  baseDate: string;
  comparisonDate: string;
  confirmed: boolean;
  topVariances?: Array<Record<string, unknown>>;
}

/**
 * Hook to fetch report details for a specific report
 */
export function useReportDetails(reportId: string | null) {
  return useQuery({
    queryKey: ['report-details', reportId],
    queryFn: async () => {
      if (!reportId) return null;

      const result = await apiRequest<FormDetail[]>(`/reports/${reportId}/details`);

      if (!result.success) throw new Error(result.error || 'Failed to fetch report details');
      return result.data!;
    },
    enabled: !!reportId,
  });
}

/**
 * Hook to fetch details for multiple reports (for charts)
 */
export function useReportsDetails(reportIds: string[]) {
  return useQuery({
    queryKey: ['reports-details', reportIds.sort().join(',')],
    queryFn: async () => {
      if (reportIds.length === 0) return [];

      const details = await Promise.all(
        reportIds.map(async (id) => {
          try {
            const result = await apiRequest<FormDetail[]>(`/reports/${id}/details`);
            return result.success ? result.data! : [];
          } catch (error) {
            console.error(`Error loading details for report ${id}:`, error);
            return [];
          }
        })
      );

      return details.flat();
    },
    enabled: reportIds.length > 0,
    staleTime: 60000, // Cache for 1 minute
  });
}

