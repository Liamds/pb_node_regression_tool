'use client';

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type { ReportMetadata } from '@/types';

/**
 * Polling fallback for analysis progress when WebSocket is unavailable
 */
export function useAnalysisPolling(reportId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['analysis-status', reportId],
    queryFn: async () => {
      if (!reportId) return null;

      const result = await apiRequest<ReportMetadata>(`/reports/${reportId}`);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: enabled && !!reportId,
    refetchInterval: (data) => {
      // Stop polling if report is completed or failed
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false;
      }
      return 2000; // Poll every 2 seconds
    },
    refetchIntervalInBackground: true,
  });
}

