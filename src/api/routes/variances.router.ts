/**
 * Variances router with validation
 * Dedicated router for variance and annotation endpoints
 * 
 * @module api/routes/variances.router
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { VarianceService } from '../../services/VarianceService.js';
import { ReportService } from '../../services/ReportService.js';
import {
  handleGetVariances,
  handleUpdateAnnotation,
} from '../handlers/variance.handlers.js';
import { handleGetReportDetails } from '../handlers/report.handlers.js';
import {
  validateParams,
  validateBody,
  ValidatedRequest,
} from '../middleware/validation.js';
import {
  createSuccessResponse,
  createErrorResponse,
  HttpStatus,
  ErrorCode,
} from '../types/responses.js';
import type { VarianceAnnotation } from '../../types/index.js';
import { logger } from '../../logger.js';
import { json2csv } from 'json-2-csv';

/**
 * Annotation update request schema
 */
const AnnotationUpdateSchema = z.object({
  formCode: z.string().min(1, 'Form code is required'),
  cellReference: z.string().min(1, 'Cell reference is required'),
  flagged: z.boolean().optional(),
  category: z.enum(['expected', 'unexpected', 'resolved', 'investigating']).nullable().optional(),
  comment: z.string().nullable().optional(),
});

/**
 * Create variances router
 */
export function createVariancesRouter(
  varianceService: VarianceService,
  reportService: ReportService
): Router {
  const router = Router();

  /**
   * GET /api/reports/:reportId/variances
   * Get all variances for a report
   */
  router.get(
    '/reports/:reportId/variances',
    validateParams(z.object({ reportId: z.string().min(1) })),
    async (req: ValidatedRequest<any, any, { reportId: string }>, res: Response) => {
      try {
        const { reportId } = req.validatedParams!;
        const formCode = req.query.formCode as string | undefined;

        const result = await handleGetVariances(varianceService, reportId, formCode);

        if (!result.success) {
          return res.status(result.error.statusCode).json(
            createErrorResponse(
              result.error.message,
              result.error.statusCode,
              ErrorCode.INTERNAL_ERROR
            )
          );
        }

        return res.json(createSuccessResponse({ variances: result.data }));
      } catch (error: any) {
        logger.error('Route error: GET /reports/:reportId/variances', { error });
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
   * POST /api/reports/:reportId/annotations
   * Update variance annotation
   */
  router.post(
    '/reports/:reportId/annotations',
    validateParams(z.object({ reportId: z.string().min(1) })),
    validateBody(AnnotationUpdateSchema),
    async (
      req: ValidatedRequest<
        z.infer<typeof AnnotationUpdateSchema>,
        any,
        { reportId: string }
      >,
      res: Response
    ) => {
      try {
        const { reportId } = req.validatedParams!;
        const { formCode, cellReference, flagged, category, comment } = req.validatedBody!;

        const annotation: VarianceAnnotation = {
          reportId,
          formCode,
          cellReference,
          flagged: flagged ?? false,
          category: category ?? null,
          comment: comment ?? null,
        };

        const result = await handleUpdateAnnotation(varianceService, annotation);

        if (!result.success) {
          return res.status(result.error.statusCode).json(
            createErrorResponse(
              result.error.message,
              result.error.statusCode,
              ErrorCode.INVALID_INPUT
            )
          );
        }

        return res.json(createSuccessResponse({ updated: true }));
      } catch (error: any) {
        logger.error('Route error: POST /reports/:reportId/annotations', { error });
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
   * GET /api/reports/:reportId/export/:formCode
   * Export variances to CSV
   */
  router.get(
    '/reports/:reportId/export/:formCode',
    validateParams(
      z.object({
        reportId: z.string().min(1),
        formCode: z.string().min(1),
      })
    ),
    async (
      req: ValidatedRequest<any, any, { reportId: string; formCode: string }>,
      res: Response
    ) => {
      try {
        const { reportId, formCode } = req.validatedParams!;

        // Get report details to find form
        const detailsResult = await handleGetReportDetails(reportService, reportId);
        if (!detailsResult.success) {
          return res.status(detailsResult.error.statusCode).json(
            createErrorResponse(
              detailsResult.error.message,
              detailsResult.error.statusCode,
              ErrorCode.NOT_FOUND
            )
          );
        }

        const form = detailsResult.data.forms.find(f => f.formCode === formCode);
        if (!form) {
          return res.status(HttpStatus.NOT_FOUND).json(
            createErrorResponse(
              'Form not found',
              HttpStatus.NOT_FOUND,
              ErrorCode.NOT_FOUND
            )
          );
        }

        // Get variances
        const variancesResult = await handleGetVariances(
          varianceService,
          reportId,
          formCode
        );

        if (!variancesResult.success) {
          return res.status(variancesResult.error.statusCode).json(
            createErrorResponse(
              variancesResult.error.message,
              variancesResult.error.statusCode,
              ErrorCode.INTERNAL_ERROR
            )
          );
        }

        // Convert to CSV format
        const csvData = variancesResult.data.map(v => ({
          'Cell Reference': v.cellReference,
          'Cell Description': v.cellDescription,
          [form.comparisonDate]: v.comparisonValue,
          [form.baseDate]: v.baseValue,
          'Difference': v.difference,
          '% Difference': v.percentDifference,
          'Flagged': v.flagged ? 'Yes' : 'No',
          'Category': v.category || '',
          'Comment': v.comment || '',
        }));

        const csv = await json2csv(csvData);

        const filename = `${formCode}_${detailsResult.data.metadata.baseDate}_variances.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
      } catch (error: any) {
        logger.error('Route error: GET /reports/:reportId/export/:formCode', { error });
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