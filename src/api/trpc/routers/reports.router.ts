/**
 * tRPC router for reports
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { ReportFiltersSchema } from '../../../validation/schemas.js';
import { handleGetReports, handleGetReportById, handleGetReportDetails, handleDeleteReport } from '../../handlers/report.handlers.js';
import { handleGetVariances } from '../../handlers/index.js';

export const reportsRouter = router({
  list: publicProcedure
    .input(ReportFiltersSchema.optional())
    .query(async ({ input, ctx }) => {
      const result = await handleGetReports(ctx.reportService, input);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return result.data;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const result = await handleGetReportById(ctx.reportService, input.id);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return result.data;
    }),

  getDetails: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const reportResult = await handleGetReportDetails(ctx.reportService, input.id);
      if (!reportResult.success) {
        throw new Error(reportResult.error.message);
      }

      const results = await Promise.all(
        reportResult.data.forms.map(async (form) => {
          const variancesResult = await handleGetVariances(
            ctx.varianceService,
            input.id,
            form.formCode
          );

          const variances = variancesResult.success ? variancesResult.data : [];

          const topVariances = variances
            .filter(v => 
              v.difference !== '0' && 
              v.difference !== '' && 
              !v.cellReference.includes('Subtotal')
            )
            .slice(0, 100)
            .map(v => ({
              'Cell Reference': v.cellReference,
              'Cell Description': v.cellDescription,
              [form.comparisonDate]: v.comparisonValue,
              [form.baseDate]: v.baseValue,
              'Difference': v.difference,
              '% Difference': v.percentDifference,
              flagged: v.flagged,
              category: v.category,
              comment: v.comment,
            }));

          return {
            ...form,
            topVariances,
          };
        })
      );

      return results;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const result = await handleDeleteReport(ctx.reportService, input.id);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return { deleted: true };
    }),
});

