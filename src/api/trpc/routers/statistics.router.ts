/**
 * tRPC router for statistics
 */

import { router, publicProcedure } from '../trpc.js';
import { ReportFiltersSchema } from '../../../validation/schemas.js';
import { handleGetStatistics } from '../../handlers/report.handlers.js';

export const statisticsRouter = router({
  get: publicProcedure
    .input(ReportFiltersSchema.optional())
    .query(async ({ input, ctx }) => {
      const result = await handleGetStatistics(ctx.reportService, input);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return result.data;
    }),
});

