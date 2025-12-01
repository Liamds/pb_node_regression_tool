/**
 * Reports router with validation
 * Dedicated router for all report-related endpoints
 * 
 * @module api/routes/reports.router
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { ReportService } from '../../services/ReportService.js';
import {
  handleGetReports,
  handleGetReportById,
  handleGetReportDetails,
  handleDeleteReport,
} from '../handlers/report.handlers.js';
import {
  validateQuery,
  validateParams,
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
 * Create reports router
 */
export function createReportsRouter(reportService: ReportService): Router {
  const router = Router();

  /**
   * GET /api/reports
   * Get all reports with optional filters
   */
  router.get(
    '/',
    validateQuery(ReportFiltersSchema),
    async (req: ValidatedRequest<any, ReportFilters>, res: Response) => {
      try {
        const filters = req.validatedQuery!;
        const result = await handleGetReports(reportService, filters);

        if (!result.success) {
          return res.status(result.error.statusCode).json(
            createErrorResponse(
              result.error.message,
              result.error.statusCode,
              ErrorCode.INTERNAL_ERROR
            )
          );
        }

        return res.json(createSuccessResponse({ reports: result.data }));
      } catch (error: any) {
        logger.error('Route error: GET /reports', { error });
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
   * GET /api/reports/:id
   * Get report by ID
   */
  router.get(
    '/:id',
    validateParams(z.object({ id: z.string().min(1) })),
    async (req: ValidatedRequest<any, any, { id: string }>, res: Response) => {
      try {
        const { id } = req.validatedParams!;
        const result = await handleGetReportById(reportService, id);

        if (!result.success) {
          const errorCode = result.error.statusCode === HttpStatus.NOT_FOUND
            ? ErrorCode.NOT_FOUND
            : ErrorCode.INTERNAL_ERROR;

          return res.status(result.error.statusCode).json(
            createErrorResponse(
              result.error.message,
              result.error.statusCode,
              errorCode
            )
          );
        }

        return res.json(createSuccessResponse(result.data));
      } catch (error: any) {
        logger.error('Route error: GET /reports/:id', { error });
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
   * GET /api/reports/:id/details
   * Get report with details
   */
  router.get(
    '/:id/details',
    validateParams(z.object({ id: z.string().min(1) })),
    async (req: ValidatedRequest<any, any, { id: string }>, res: Response) => {
      try {
        const { id } = req.validatedParams!;
        const result = await handleGetReportDetails(reportService, id);

        if (!result.success) {
          const errorCode = result.error.statusCode === HttpStatus.NOT_FOUND
            ? ErrorCode.NOT_FOUND
            : ErrorCode.INTERNAL_ERROR;

          return res.status(result.error.statusCode).json(
            createErrorResponse(
              result.error.message,
              result.error.statusCode,
              errorCode
            )
          );
        }

        return res.json(createSuccessResponse(result.data));
      } catch (error: any) {
        logger.error('Route error: GET /reports/:id/details', { error });
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
   * DELETE /api/reports/:id
   * Delete report
   */
  router.delete(
    '/:id',
    validateParams(z.object({ id: z.string().min(1) })),
    async (req: ValidatedRequest<any, any, { id: string }>, res: Response) => {
      try {
        const { id } = req.validatedParams!;
        const result = await handleDeleteReport(reportService, id);

        if (!result.success) {
          const errorCode = result.error.statusCode === HttpStatus.NOT_FOUND
            ? ErrorCode.NOT_FOUND
            : ErrorCode.INTERNAL_ERROR;

          return res.status(result.error.statusCode).json(
            createErrorResponse(
              result.error.message,
              result.error.statusCode,
              errorCode
            )
          );
        }

        return res.json(createSuccessResponse({ deleted: true }));
      } catch (error: any) {
        logger.error('Route error: DELETE /reports/:id', { error });
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

  return router;
}