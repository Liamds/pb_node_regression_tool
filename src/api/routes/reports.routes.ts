/**
 * Express routes for reports
 * Clean routing layer that delegates to handlers
 * 
 * @module api/routes/reports
 */

import { Router, Request, Response } from 'express';
import { ReportService } from '../../services/ReportService.js';
import {
  handleGetReports,
  handleGetReportById,
  handleGetReportDetails,
  handleDeleteReport,
  handleGetStatistics,
  handleGetFilterOptions,
} from '../handlers/report.handlers.js';
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
  router.get('/', async (req: Request, res: Response) => {
    try {
      const filters: ReportFilters = {
        status: req.query.status as any,
        baseDate: req.query.baseDate as string | undefined,
        formCode: req.query.formCode as string | undefined,
      };

      const result = await handleGetReports(reportService, filters);

      if (!result.success) {
        return res.status(result.error.statusCode).json({
          error: result.error.message,
        });
      }

      return res.json({ reports: result });
    } catch (error: any) {
      logger.error('Route error: GET /reports', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/reports/:id
   * Get report by ID
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const result = await handleGetReportById(reportService, req.params.id);

      if (!result.success) {
        return res.status(result.error.statusCode).json({
          error: result.error.message,
        });
      }

      return res.json(result);
    } catch (error: any) {
      logger.error('Route error: GET /reports/:id', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/reports/:id/details
   * Get report with details
   */
  router.get('/:id/details', async (req: Request, res: Response) => {
    try {
      const result = await handleGetReportDetails(reportService, req.params.id);

      if (!result.success) {
        return res.status(result.error.statusCode).json({
          error: result.error.message,
        });
      }

      return res.json(result);
    } catch (error: any) {
      logger.error('Route error: GET /reports/:id/details', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * DELETE /api/reports/:id
   * Delete report
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const result = await handleDeleteReport(reportService, req.params.id);

      if (!result.success) {
        return res.status(result.error.statusCode).json({
          error: result.error.message,
        });
      }

      return res.json({ success: true });
    } catch (error: any) {
      logger.error('Route error: DELETE /reports/:id', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/statistics
   * Get statistics
   */
  router.get('/statistics', async (req: Request, res: Response) => {
    try {
      const filters: ReportFilters = {
        status: req.query.status as any,
        baseDate: req.query.baseDate as string | undefined,
        formCode: req.query.formCode as string | undefined,
      };

      const result = await handleGetStatistics(reportService, filters);

      if (!result.success) {
        return res.status(result.error.statusCode).json({
          error: result.error.message,
        });
      }

      return res.json(result);
    } catch (error: any) {
      logger.error('Route error: GET /statistics', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/filters
   * Get filter options
   */
  router.get('/filters', async (req: Request, res: Response) => {
    try {
      const result = await handleGetFilterOptions(reportService);

      if (!result.success) {
        return res.status(result.error.statusCode).json({
          error: result.error.message,
        });
      }

      return res.json(result);
    } catch (error: any) {
      logger.error('Route error: GET /filters', { error });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}