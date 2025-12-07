/**
 * tRPC router for variances
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc.js';
import { handleGetVariances, handleUpdateAnnotation } from '../../handlers/variance.handlers.js';
import { VarianceCategorySchema } from '../../../validation/schemas.js';

export const variancesRouter = router({
  list: publicProcedure
    .input(z.object({
      reportId: z.string().min(1),
      formCode: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const result = await handleGetVariances(
        ctx.varianceService,
        input.reportId,
        input.formCode
      );
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return { variances: result.data };
    }),

  updateAnnotation: publicProcedure
    .input(z.object({
      reportId: z.string().min(1),
      formCode: z.string().min(1),
      cellReference: z.string().min(1),
      flagged: z.boolean().optional(),
      category: VarianceCategorySchema.optional(),
      comment: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const annotation = {
        reportId: input.reportId,
        formCode: input.formCode,
        cellReference: input.cellReference,
        flagged: input.flagged ?? false,
        category: input.category ?? null,
        comment: input.comment ?? null,
      };

      const result = await handleUpdateAnnotation(ctx.varianceService, annotation);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return { updated: true };
    }),
});

