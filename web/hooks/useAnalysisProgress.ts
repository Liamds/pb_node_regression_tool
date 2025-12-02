'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket, type ProgressUpdate } from './useWebSocket';
import { useQueryClient } from '@tanstack/react-query';

interface AnalysisProgressState {
  current: number;
  total: number;
  percent: number;
  message: string;
  currentItem?: string;
  reportId: string | null;
  status: 'idle' | 'running' | 'completed' | 'error';
  logs: Array<{ message: string; level: 'info' | 'warn' | 'error' | 'debug' }>;
  steps: {
    step1: 'pending' | 'active' | 'completed' | 'failed';
    step2: 'pending' | 'active' | 'completed' | 'failed';
    step3: 'pending' | 'active' | 'completed' | 'failed';
    step4: 'pending' | 'active' | 'completed' | 'failed';
  };
}

const initialProgressState: AnalysisProgressState = {
  current: 0,
  total: 100,
  percent: 0,
  message: '',
  reportId: null,
  status: 'idle',
  logs: [],
  steps: {
    step1: 'pending',
    step2: 'pending',
    step3: 'pending',
    step4: 'pending',
  },
};

export function useAnalysisProgress(reportId: string | null) {
  const [progress, setProgress] = useState<AnalysisProgressState>(initialProgressState);
  const queryClient = useQueryClient();

  const handleProgressUpdate = useCallback(
    (data: ProgressUpdate) => {
      if (data.type === 'progress') {
        const percent = data.total ? Math.round((data.current! / data.total) * 100) : 0;
        const currentStep = Math.min(Math.ceil((data.current! / data.total) * 4), 4);

        setProgress((prev) => ({
          ...prev,
          current: data.current || 0,
          total: data.total || 100,
          percent,
          message: data.currentItem || data.message || 'Processing...',
          currentItem: data.currentItem,
          reportId: data.reportId || prev.reportId,
          status: 'running',
          steps: {
            step1: currentStep >= 1 ? 'active' : 'pending',
            step2: currentStep >= 2 ? 'active' : currentStep < 2 ? 'pending' : 'active',
            step3: currentStep >= 3 ? 'active' : currentStep < 3 ? 'pending' : 'active',
            step4: currentStep >= 4 ? 'active' : currentStep < 4 ? 'pending' : 'active',
          },
        }));
      } else if (data.type === 'log') {
        setProgress((prev) => ({
          ...prev,
          logs: [
            ...prev.logs,
            { message: data.message || '', level: data.logLevel || 'info' },
          ].slice(-100), // Keep last 100 logs
        }));
      } else if (data.type === 'complete') {
        setProgress((prev) => ({
          ...prev,
          percent: 100,
          message: 'Analysis completed successfully!',
          status: 'completed',
          steps: {
            step1: 'completed',
            step2: 'completed',
            step3: 'completed',
            step4: 'completed',
          },
        }));

        // Refresh data after completion
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['reports'] });
          queryClient.invalidateQueries({ queryKey: ['statistics'] });
        }, 1000);

        // Reset after 3 seconds
        setTimeout(() => {
          setProgress(initialProgressState);
        }, 3000);
      } else if (data.type === 'error') {
        setProgress((prev) => ({
          ...prev,
          message: `Error: ${data.message || 'Unknown error'}`,
          status: 'error',
          steps: {
            ...prev.steps,
            step1: prev.steps.step1 === 'active' ? 'failed' : prev.steps.step1,
            step2: prev.steps.step2 === 'active' ? 'failed' : prev.steps.step2,
            step3: prev.steps.step3 === 'active' ? 'failed' : prev.steps.step3,
            step4: prev.steps.step4 === 'active' ? 'failed' : prev.steps.step4,
          },
        }));

        // Reset after 5 seconds
        setTimeout(() => {
          setProgress(initialProgressState);
        }, 5000);
      }
    },
    [queryClient]
  );

  // Auto-start progress when reportId is provided
  useEffect(() => {
    if (reportId && progress.status === 'idle') {
      setProgress({
        ...initialProgressState,
        reportId,
        status: 'running',
        message: 'Starting analysis...',
      });
    }
  }, [reportId]);

  const { isConnected } = useWebSocket({
    onMessage: handleProgressUpdate,
    enabled: !!reportId || progress.status === 'running',
  });

  const startProgress = useCallback((newReportId: string) => {
    setProgress({
      ...initialProgressState,
      reportId: newReportId,
      status: 'running',
      message: 'Starting analysis...',
    });
  }, []);

  const stopProgress = useCallback(() => {
    setProgress(initialProgressState);
  }, []);

  return {
    progress,
    isConnected,
    startProgress,
    stopProgress,
  };
}

