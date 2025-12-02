'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import type { ReportMetadata } from '@/types';

interface ReportDetailsDialogProps {
  reportId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ReportDetails {
  metadata: ReportMetadata;
  forms: Array<{
    formName: string;
    formCode: string;
    varianceCount: number;
    validationErrorCount: number;
    baseDate: string;
    comparisonDate: string;
    confirmed: boolean;
    topVariances?: Array<Record<string, unknown>>;
  }>;
}

export function ReportDetailsDialog({
  reportId,
  open,
  onOpenChange,
}: ReportDetailsDialogProps): JSX.Element {
  const [details, setDetails] = useState<ReportDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && reportId) {
      setLoading(true);
      Promise.all([
        apiRequest<ReportMetadata>(`/reports/${reportId}`),
        apiRequest<ReportDetails['forms']>(`/reports/${reportId}/details`),
      ])
        .then(([metadataRes, detailsRes]) => {
          if (metadataRes.success && detailsRes.success) {
            setDetails({
              metadata: metadataRes.data!,
              forms: detailsRes.data!,
            });
          }
        })
        .finally(() => setLoading(false));
    }
  }, [open, reportId]);

  const handleExportCSV = (formCode: string): void => {
    if (!reportId) return;
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/reports/${reportId}/export/${formCode}`;
  };

  if (!reportId) return <></>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Report Details: {details?.metadata.baseDate || reportId}
          </DialogTitle>
          <DialogDescription>
            {details?.metadata.timestamp && new Date(details.metadata.timestamp).toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center">Loading...</div>
        ) : details ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Total Returns</div>
                <div className="text-2xl font-bold">{details.metadata.totalReturns}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Variances</div>
                <div className="text-2xl font-bold">
                  {details.metadata.totalVariances.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Validation Errors</div>
                <div className="text-2xl font-bold">
                  {details.metadata.totalValidationErrors.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Status</div>
                <Badge variant={details.metadata.status === 'completed' ? 'success' : 'default'}>
                  {details.metadata.status}
                </Badge>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Forms Analysis</h3>
              <div className="space-y-4">
                {details.forms.map((form) => (
                  <div
                    key={form.formCode}
                    className={`border rounded-lg p-4 ${
                      form.varianceCount > 0 || form.validationErrorCount > 0
                        ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'
                        : ''
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-semibold">
                          {form.formName} ({form.formCode})
                        </h4>
                        {form.confirmed && (
                          <Badge variant="warning" className="mt-1">
                            Confirmed
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportCSV(form.formCode)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                      </Button>
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>📊 {form.varianceCount} variances</span>
                      <span>❌ {form.validationErrorCount} errors</span>
                      <span>
                        📅 {form.comparisonDate} → {form.baseDate}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-destructive">
            Failed to load report details
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

