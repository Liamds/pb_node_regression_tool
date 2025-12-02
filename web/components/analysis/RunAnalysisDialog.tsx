'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { apiRequest } from '@/lib/api-client';

interface RunAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnalysisStarted?: (reportId: string) => void;
}

export function RunAnalysisDialog({
  open,
  onOpenChange,
  onAnalysisStarted,
}: RunAnalysisDialogProps): JSX.Element {
  const [configFile, setConfigFile] = useState('config.json');
  const [outputFile, setOutputFile] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRun = async (): Promise<void> => {
    if (!configFile.trim()) {
      alert('Please provide a configuration file');
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest<{ reportId: string }>('/analysis/run', {
        method: 'POST',
        body: JSON.stringify({
          configFile: configFile.trim(),
          outputFile: outputFile.trim() || undefined,
        }),
      });

      if (result.success && result.data) {
        onAnalysisStarted?.(result.data.reportId);
        onOpenChange(false);
        // Reset form
        setConfigFile('config.json');
        setOutputFile('');
      } else {
        alert(`Error: ${result.error || 'Failed to start analysis'}`);
      }
    } catch (error) {
      alert('Failed to start analysis');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run Analysis</DialogTitle>
          <DialogDescription>
            Start a new variance analysis with the specified configuration file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="configFile">Configuration File</Label>
            <Input
              id="configFile"
              value={configFile}
              onChange={(e) => setConfigFile(e.target.value)}
              placeholder="e.g., config.json"
            />
            <p className="text-sm text-muted-foreground">
              Path to the JSON configuration file
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="outputFile">Output File (optional)</Label>
            <Input
              id="outputFile"
              value={outputFile}
              onChange={(e) => setOutputFile(e.target.value)}
              placeholder="e.g., report.xlsx"
            />
            <p className="text-sm text-muted-foreground">
              Leave empty for auto-generated name
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRun} disabled={loading}>
            {loading ? 'Starting...' : 'Start Analysis'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
