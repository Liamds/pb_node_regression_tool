/**
 * tRPC router for analysis control
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';

export function createAnalysisRouter(
  runAnalysisFn: (configFile: string, outputFile: string) => Promise<string>,
  stopAnalysisFn: (reportId: string) => Promise<boolean>
) {
  return router({
    run: publicProcedure
      .input(z.object({
        configFile: z.string().min(1, 'Configuration file is required'),
        outputFile: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const reportId = await runAnalysisFn(
          input.configFile,
          input.outputFile || 'dashboard_report.xlsx'
        );
        return {
          started: true,
          reportId,
        };
      }),

    stop: publicProcedure
      .input(z.object({ reportId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const stopped = await stopAnalysisFn(input.reportId);
        if (!stopped) {
          throw new Error('Analysis job not found or already completed');
        }
        return {
          stopped: true,
          reportId: input.reportId,
        };
      }),
  });
}

