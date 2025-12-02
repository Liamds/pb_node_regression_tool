'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, Loader2, Circle } from 'lucide-react';
import { useAnalysisProgress } from '@/hooks/useAnalysisProgress';
import { apiRequest } from '@/lib/api-client';
import { useState } from 'react';

interface ProgressIndicatorProps {
  reportId: string | null;
  onStop?: () => void;
}

function StepIndicator({
  step,
  label,
  status,
}: {
  step: number;
  label: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
}): JSX.Element {
  const getIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'active':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-muted">
        {getIcon()}
      </div>
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-sm text-muted-foreground">Step {step}</div>
      </div>
    </div>
  );
}

export function ProgressIndicator({ reportId, onStop }: ProgressIndicatorProps): JSX.Element {
  const { progress, isConnected, stopProgress } = useAnalysisProgress(reportId);
  const [stopping, setStopping] = useState(false);

  // Show progress if we have a reportId or if progress is active
  if (progress.status === 'idle' && !reportId) {
    return null;
  }

  const handleStop = async (): Promise<void> => {
    if (!reportId || !confirm('Are you sure you want to stop the running analysis?')) {
      return;
    }

    setStopping(true);
    try {
      const result = await apiRequest(`/analysis/stop/${reportId}`, {
        method: 'POST',
      });

      if (result.success) {
        stopProgress();
        onStop?.();
      } else {
        alert(`Error: ${result.error || 'Failed to stop analysis'}`);
      }
    } catch (error) {
      console.error('Error stopping analysis:', error);
      alert('Failed to stop analysis');
    } finally {
      setStopping(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {progress.status === 'running' && <Loader2 className="h-5 w-5 animate-spin" />}
            {progress.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {progress.status === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
            Analysis in Progress
          </CardTitle>
          {progress.status === 'running' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStop}
              disabled={stopping}
            >
              {stopping ? 'Stopping...' : 'Stop'}
            </Button>
          )}
        </div>
        {!isConnected && (
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            ⚠️ WebSocket disconnected. Using polling fallback.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{progress.message || 'Processing...'}</span>
            <span>{progress.percent}%</span>
          </div>
          <Progress value={progress.percent} />
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StepIndicator
            step={1}
            label="Authentication"
            status={progress.steps.step1}
          />
          <StepIndicator
            step={2}
            label="Analyzing Returns"
            status={progress.steps.step2}
          />
          <StepIndicator
            step={3}
            label="Export to Excel"
            status={progress.steps.step3}
          />
          <StepIndicator
            step={4}
            label="Saving Report"
            status={progress.steps.step4}
          />
        </div>

        {/* Console Output */}
        {progress.logs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Console Output</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Clear logs would be handled by the hook
                }}
              >
                Clear
              </Button>
            </div>
            <div className="bg-muted rounded-md p-4 max-h-48 overflow-y-auto font-mono text-xs">
              {progress.logs.map((log, index) => (
                <div
                  key={index}
                  className={`mb-1 ${
                    log.level === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : log.level === 'warn'
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-foreground'
                  }`}
                >
                  {log.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

