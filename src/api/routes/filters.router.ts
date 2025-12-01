/**
 * Statistics and filters router
 * Dedicated router for statistics and filter options
 * 
 * @module api/routes/statistics.router
 */

import { Router, Response } from 'express';
import { ReportService } from '../../services/ReportService.js';
import {
  handleGetFilterOptions,
} from '../handlers/report.handlers.js';
import {
  createSuccessResponse,
  createErrorResponse,
  HttpStatus,
  ErrorCode,
} from '../types/responses.js';
import { logger } from '../../logger.js';

/**
 * Create statistics router
 */
export function createFiltersRouter(reportService: ReportService): Router {
  const router = Router();

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

  logger.info('Routes: Statistics router created');

  return router;
}