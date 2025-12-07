/**
 * tRPC router for filters
 */

import { router, publicProcedure } from '../trpc.js';
import { handleGetFilterOptions } from '../../handlers/report.handlers.js';

export const filtersRouter = router({
  getOptions: publicProcedure
    .query(async ({ ctx }) => {
      const result = await handleGetFilterOptions(ctx.reportService);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return result.data;
    }),
});

