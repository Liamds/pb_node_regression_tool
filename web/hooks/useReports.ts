/**
 * Custom hook for fetching reports
 * This will be replaced with oRPC + TanStack Query in Phase 3
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type { ReportMetadata, ReportFilters } from '@/types';

export function useReports(filters?: ReportFilters) {
  return useQuery({
    queryKey: ['reports', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.baseDate) params.append('baseDate', filters.baseDate);
      if (filters?.formCode) params.append('formCode', filters.formCode);

      const result = await apiRequest<{ reports: ReportMetadata[] }>(
        `/reports?${params.toString()}`
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch reports');
      }

      return result.data?.reports || [];
    },
  });
}

