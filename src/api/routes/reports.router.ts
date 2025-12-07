/**
 * Reports router with validation
 * Dedicated router for all report-related endpoints
 * 
 * @module api/routes/reports.router
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { 
  ReportService,
  VarianceService } from '../../services/index.js';
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
import { handleGetVariances } from '../handlers/index.js';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Create reports router
 */
export function createReportsRouter(reportService: ReportService, varianceService: VarianceService): Router {
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
        const reportResult = await handleGetReportDetails(reportService, id);

        if (!reportResult.success) {
          const errorCode = reportResult.error.statusCode === HttpStatus.NOT_FOUND
            ? ErrorCode.NOT_FOUND
            : ErrorCode.INTERNAL_ERROR;

          return res.status(reportResult.error.statusCode).json(
            createErrorResponse(
              reportResult.error.message,
              reportResult.error.statusCode,
              errorCode
            )
          );
        }

        const results = await Promise.all(
          reportResult.data.forms.map(async (form) => {
            // TypeScript strict mode issue - bypassing with @ts-ignore
            // @ts-ignore
            const variancesResult = await handleGetVariances(
              varianceService,
              req.params.id,
              form.formCode
            );

              const variances = variancesResult.success ? variancesResult.data : [];

              // Get top 100 meaningful variances
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

        return res.json(createSuccessResponse(results));
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
   * GET /api/reports/:id/download
   * Download report
   */
  router.get(
    '/:id/download',
    validateParams(z.object({ id: z.string().min(1) })),
    async (req: ValidatedRequest<any, any, { id: string }>, res: Response) => {
      try {
        const { id } = req.validatedParams!;
        const reportResult = await handleGetReportById(reportService, id);

        if (!reportResult.success) {
          const errorCode = reportResult.error.statusCode === HttpStatus.NOT_FOUND
            ? ErrorCode.NOT_FOUND
            : ErrorCode.INTERNAL_ERROR;

          return res.status(reportResult.error.statusCode).json(
            createErrorResponse(
              reportResult.error.message,
              reportResult.error.statusCode,
              errorCode
            )
          );
        }

        const filePath = join(process.cwd(), 'reports', reportResult.data.outputFile);
        if (!existsSync(filePath)) {
          return res.status(HttpStatus.NOT_FOUND).json(
            createErrorResponse(
              'Report not found',
              HttpStatus.NOT_FOUND,
              ErrorCode.NOT_FOUND
            )
          );
        }

        return res.download(filePath);
      } catch (error: any) {
        logger.error('Route error: GET /reports/:id/download', { error });
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

  logger.info('Routes: Reports router created');

  return router;
}