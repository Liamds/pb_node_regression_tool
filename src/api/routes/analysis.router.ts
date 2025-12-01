/**
 * Analysis control router
 * Dedicated router for starting and stopping analysis jobs
 * 
 * @module api/routes/analysis.router
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { validateBody, validateParams, ValidatedRequest } from '../middleware/validation.js';
import {
  createSuccessResponse,
  createErrorResponse,
  HttpStatus,
  ErrorCode,
} from '../types/responses.js';
import { logger } from '../../logger.js';
import { resolve, normalize } from 'path';

/**
 * Analysis request schema
 */
const AnalysisRequestSchema = z.object({
  configFile: z.string().min(1, 'Configuration file is required'),
  outputFile: z.string().optional(),
});

/**
 * Create analysis router
 */
export function createAnalysisRouter(
  runAnalysisFn: (configFile: string, outputFile: string) => Promise<string>,
  stopAnalysisFn: (reportId: string) => Promise<boolean>
): Router {
  const router = Router();

  /**
   * POST /api/analysis/run
   * Start a new analysis job
   */
  router.post(
    '/run',
    validateBody(AnalysisRequestSchema),
    async (
      req: ValidatedRequest<z.infer<typeof AnalysisRequestSchema>>,
      res: Response
    ) => {
      try {
        const { configFile, outputFile } = req.validatedBody!;

        // Validate file path security
        const safePath = normalize(resolve(process.cwd(), configFile));
        if (!safePath.startsWith(process.cwd())) {
          return res.status(HttpStatus.BAD_REQUEST).json(
            createErrorResponse(
              'Invalid file path - path traversal not allowed',
              HttpStatus.BAD_REQUEST,
              ErrorCode.INVALID_INPUT
            )
          );
        }

        // Start analysis
        const reportId = await runAnalysisFn(
          safePath,
          outputFile || 'dashboard_report.xlsx'
        );

        return res.json(
          createSuccessResponse({
            started: true,
            reportId,
          })
        );
      } catch (error: any) {
        logger.error('Route error: POST /analysis/run', { error });
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          createErrorResponse(
            error.message || 'Failed to start analysis',
            HttpStatus.INTERNAL_SERVER_ERROR,
            ErrorCode.INTERNAL_ERROR
          )
        );
      }
    }
  );

  /**
   * POST /api/analysis/stop/:reportId
   * Stop a running analysis job
   */
  router.post(
    '/stop/:reportId',
    validateParams(z.object({ reportId: z.string().min(1) })),
    async (
      req: ValidatedRequest<any, any, { reportId: string }>,
      res: Response
    ) => {
      try {
        const { reportId } = req.validatedParams!;

        const stopped = await stopAnalysisFn(reportId);

        if (!stopped) {
          return res.status(HttpStatus.NOT_FOUND).json(
            createErrorResponse(
              'Analysis job not found or already completed',
              HttpStatus.NOT_FOUND,
              ErrorCode.NOT_FOUND
            )
          );
        }

        return res.json(
          createSuccessResponse({
            stopped: true,
            reportId,
          })
        );
      } catch (error: any) {
        logger.error('Route error: POST /analysis/stop/:reportId', { error });
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          createErrorResponse(
            error.message || 'Failed to stop analysis',
            HttpStatus.INTERNAL_SERVER_ERROR,
            ErrorCode.INTERNAL_ERROR
          )
        );
      }
    }
  );

  logger.info('Routes: Analysis router created');

  return router;
}