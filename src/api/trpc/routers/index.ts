/**
 * Main tRPC router
 */

import { router } from '../trpc.js';
import { reportsRouter } from './reports.router.js';
import { variancesRouter } from './variances.router.js';
import { statisticsRouter } from './statistics.router.js';
import { filtersRouter } from './filters.router.js';
import { createAnalysisRouter } from './analysis.router.js';

export function createAppRouter(
  runAnalysisFn: (configFile: string, outputFile: string) => Promise<string>,
  stopAnalysisFn: (reportId: string) => Promise<boolean>
) {
  return router({
    reports: reportsRouter,
    variances: variancesRouter,
    statistics: statisticsRouter,
    filters: filtersRouter,
    analysis: createAnalysisRouter(runAnalysisFn, stopAnalysisFn),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

