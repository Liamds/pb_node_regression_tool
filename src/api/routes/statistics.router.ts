/**
 * Statistics and filters router
 * Dedicated router for statistics and filter options
 * 
 * @module api/routes/statistics.router
 */

import { Router, Response } from 'express';
import { ReportService } from '../../services/ReportService.js';
import {
  handleGetStatistics,
  handleGetFilterOptions,
} from '../handlers/report.handlers.js';
import {
  validateQuery,
  ValidatedRequest,
} from '../middleware/validation.js';
import {
  createSuccessResponse,
  createErrorResponse,
  HttpStatus,
  ErrorCode,
} from '../types/responses.js';
import { ReportFiltersSchema } from '../../validation/schemas.js';
import type { ReportFilters } from '../../types/index.js';
import { logger } from '../../logger.js';

/**
 * Create statistics router
 */
export function createStatisticsRouter(reportService: ReportService): Router {
  const router = Router();

  /**
   * GET /api/statistics
   * Get statistics with optional filters
   */
  router.get(
    '/',
    validateQuery(ReportFiltersSchema),
    async (req: ValidatedRequest<any, ReportFilters>, res: Response) => {
      try {
        const filters = req.validatedQuery!;
        const result = await handleGetStatistics(reportService, filters);

        if (!result.success) {
          return res.status(result.error.statusCode).json(
            createErrorResponse(
              result.error.message,
              result.error.statusCode,
              ErrorCode.INTERNAL_ERROR
            )
          );
        }

        return res.json(createSuccessResponse(result.data));
      } catch (error: any) {
        logger.error('Route error: GET /statistics', { error });
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
          createErrorResponse(
            'Internal server error',
            HttpStatus.INTERNAL_SERVER_ERROR,
            ErrorCode.INTERNAL_ERROR
          )
        );
      }
    }
  );

  /**
   * GET /api/filters
   * Get filter options (base dates and form codes)
   */
  router.get('/filters', async (_req, res: Response) => {
    try {
      const result = await handleGetFilterOptions(reportService);

      if (!result.success) {
        return res.status(result.error.statusCode).json(
          createErrorResponse(
            result.error.message,
            result.error.statusCode,
            ErrorCode.INTERNAL_ERROR
          )
        );
      }

      return res.json(createSuccessResponse(result.data));
    } catch (error: any) {
      logger.error('Route error: GET /filters', { error });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        createErrorResponse(
          'Internal server error',
          HttpStatus.INTERNAL_SERVER_ERROR,
          ErrorCode.INTERNAL_ERROR
        )
      );
    }
  });

  return router;
}