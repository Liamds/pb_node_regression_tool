/**
 * Updated Web dashboard server with layered architecture
 * Now uses Repository -> Service -> Handler -> Route pattern
 * 
 * File: src/dashboard/server.ts
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { logger } from '../logger.js';
import { resolve, normalize } from 'path';
import { DatabaseManager } from '../db-manager.js';
import { json2csv } from 'json-2-csv';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';

// New imports for layered architecture
import { ReportRepository } from '../repositories/ReportRepository.js';
import { VarianceRepository } from '../repositories/VarianceRepository.js';
import { ReportService } from '../services/ReportService.js';
import { VarianceService } from '../services/VarianceService.js';
import { 
  handleGetReports,
  handleGetReportById,
  handleGetReportDetails,
  handleDeleteReport,
  handleGetStatistics,
  handleGetFilterOptions,
} from '../api/handlers/report.handlers.js';
import {
  handleGetVariances,
  handleUpdateAnnotation,
} from '../api/handlers/variance.handlers.js';
import type { ReportFilters, VarianceAnnotation } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ProgressUpdate {
  type: 'progress' | 'complete' | 'error' | 'log';
  current?: number;
  total?: number;
  currentItem?: string;
  message?: string;
  reportId?: string;
  logLevel?: 'info' | 'warn' | 'error' | 'debug';
}

interface RunningJob {
  reportId: string;
  configFile: string;
  startTime: number;
  process: any;
}

export class DashboardServer {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer;
  private port: number;
  private reportsDir: string;
  private clients: Set<WebSocket> = new Set();
  private runningJobs: Map<string, RunningJob> = new Map();
  private dbManager: DatabaseManager;

  // Service layer instances
  private reportService!: ReportService;
  private varianceService!: VarianceService;

  constructor(port: number = 3000) {
    this.port = port;
    this.reportsDir = join(process.cwd(), 'reports');
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.dbManager = new DatabaseManager();

    this.setupMiddleware();
    this.setupWebSocket();
    this.setupSwagger();
    this.ensureReportsDirectory();
  }

  /**
   * Initialize services after database is ready
   */
  private initializeServices(): void {
    logger.info('Initializing service layer...');

    // Create repositories
    const reportRepo = new ReportRepository(this.dbManager);
    const varianceRepo = new VarianceRepository(this.dbManager);

    // Create services
    this.reportService = new ReportService(reportRepo);
    this.varianceService = new VarianceService(varianceRepo);

    logger.info('Service layer initialized successfully');
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    const possiblePublicDirs = [
      join(__dirname, 'public'),
      join(process.cwd(), 'src/dashboard/public'),
      join(process.cwd(), 'public'),
    ];

    for (const dir of possiblePublicDirs) {
      if (existsSync(dir)) {
        this.app.use(express.static(dir));
        logger.info(`Serving static files from: ${dir}`);
        break;
      }
    }
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('Dashboard client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        logger.info('Dashboard client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error });
        ws.terminate();
        this.clients.delete(ws);
      });
    });
  }

  private setupSwagger(): void {
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Variance Analysis API Docs',
      customfavIcon: '/favicon.ico'
    }));

    this.app.get('/api-docs.json', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });

    logger.info('Swagger documentation available at /api-docs');
  }

  /**
   * Setup all API routes using the new handler architecture
   */
  private setupRoutes(): void {
    /**
     * @swagger
     * /api/health:
     *   get:
     *     summary: Health check
     *     tags: [Health]
     *     responses:
     *       200:
     *         description: Server is healthy
     */
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ============================================
    // REPORTS ENDPOINTS
    // ============================================

    /**
     * @swagger
     * /api/reports:
     *   get:
     *     summary: Get all reports
     *     tags: [Reports]
     *     parameters:
     *       - in: query
     *         name: status
     *         schema:
     *           type: string
     *       - in: query
     *         name: baseDate
     *         schema:
     *           type: string
     *       - in: query
     *         name: formCode
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: List of reports
     */
    this.app.get('/api/reports', async (req: Request, res: Response) => {
      try {
        const filters: ReportFilters = {
          status: req.query.status as any,
          baseDate: req.query.baseDate as string | undefined,
          formCode: req.query.formCode as string | undefined,
        };

        const result = await handleGetReports(this.reportService, filters);

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
     * @swagger
     * /api/reports/{id}:
     *   get:
     *     summary: Get report by ID
     *     tags: [Reports]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Report metadata
     *       404:
     *         description: Report not found
     */
    this.app.get('/api/reports/:id', async (req: Request, res: Response) => {
      try {
        const result = await handleGetReportById(this.reportService, req.params.id);

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
     * @swagger
     * /api/reports/{id}/details:
     *   get:
     *     summary: Get report details
     *     tags: [Reports]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Report with form details
     */
    this.app.get('/api/reports/:id/details', async (req: Request, res: Response) => {
      try {
        // Get report with forms
        const reportResult = await handleGetReportDetails(this.reportService, req.params.id);

        if (!reportResult.success) {
          return res.status(reportResult.error.statusCode).json({
            error: reportResult.error.message,
          });
        }

        // Get variances for each form and build results
        const results = await Promise.all(
          reportResult.data.forms.map(async (form) => {
            const variancesResult = await handleGetVariances(
              this.varianceService,
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

        return res.json({ results });
      } catch (error: any) {
        logger.error('Route error: GET /reports/:id/details', { error });
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    /**
     * @swagger
     * /api/reports/{id}:
     *   delete:
     *     summary: Delete report
     *     tags: [Reports]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Report deleted
     */
    this.app.delete('/api/reports/:id', async (req: Request, res: Response) => {
      try {
        const result = await handleDeleteReport(this.reportService, req.params.id);

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

    // ============================================
    // STATISTICS & FILTERS
    // ============================================

    /**
     * @swagger
     * /api/statistics:
     *   get:
     *     summary: Get statistics
     *     tags: [Statistics]
     *     responses:
     *       200:
     *         description: Statistics data
     */
    this.app.get('/api/statistics', async (req: Request, res: Response) => {
      try {
        const filters: ReportFilters = {
          status: req.query.status as any,
          baseDate: req.query.baseDate as string | undefined,
          formCode: req.query.formCode as string | undefined,
        };

        const result = await handleGetStatistics(this.reportService, filters);

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
     * @swagger
     * /api/filters:
     *   get:
     *     summary: Get filter options
     *     tags: [Filters]
     *     responses:
     *       200:
     *         description: Filter options
     */
    this.app.get('/api/filters', async (_req: Request, res: Response) => {
      try {
        const result = await handleGetFilterOptions(this.reportService);

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

    // ============================================
    // VARIANCE ANNOTATIONS
    // ============================================

    /**
     * @swagger
     * /api/reports/{id}/annotations:
     *   post:
     *     summary: Update variance annotation
     *     tags: [Annotations]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *     responses:
     *       200:
     *         description: Annotation updated
     */
    this.app.post('/api/reports/:id/annotations', async (req: Request, res: Response) => {
      try {
        const { formCode, cellReference, flagged, category, comment } = req.body;

        const annotation: VarianceAnnotation = {
          reportId: req.params.id,
          formCode,
          cellReference,
          flagged: flagged || false,
          category: category || null,
          comment: comment || null,
        };

        const result = await handleUpdateAnnotation(this.varianceService, annotation);

        if (!result.success) {
          return res.status(result.error.statusCode).json({
            error: result.error.message,
          });
        }

        return res.json({ success: true });
      } catch (error: any) {
        logger.error('Route error: POST /reports/:id/annotations', { error });
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // ============================================
    // EXPORT ENDPOINTS
    // ============================================

    /**
     * @swagger
     * /api/reports/{id}/export/{formCode}:
     *   get:
     *     summary: Export form variances to CSV
     *     tags: [Export]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *       - in: path
     *         name: formCode
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: CSV file
     */
    this.app.get('/api/reports/:id/export/:formCode', async (req: Request, res: Response) => {
      try {
        const { id, formCode } = req.params;

        // Get report metadata
        const reportResult = await handleGetReportById(this.reportService, id);
        if (!reportResult.success) {
          return res.status(reportResult.error.statusCode).json({
            error: reportResult.error.message,
          });
        }

        // Get report details to find form
        const detailsResult = await handleGetReportDetails(this.reportService, id);
        if (!detailsResult.success) {
          return res.status(detailsResult.error.statusCode).json({
            error: detailsResult.error.message,
          });
        }

        const form = detailsResult.data.forms.find(f => f.formCode === formCode);
        if (!form) {
          return res.status(404).json({ error: 'Form not found' });
        }

        // Get variances
        const variancesResult = await handleGetVariances(this.varianceService, id, formCode);
        if (!variancesResult.success) {
          return res.status(variancesResult.error.statusCode).json({
            error: variancesResult.error.message,
          });
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

        const filename = `${formCode}_${reportResult.data.baseDate}_variances.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
      } catch (error: any) {
        logger.error('Route error: GET /reports/:id/export/:formCode', { error });
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    /**
     * @swagger
     * /api/reports/{id}/download:
     *   get:
     *     summary: Download Excel report
     *     tags: [Export]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Excel file
     */
    this.app.get('/api/reports/:id/download', async (req: Request, res: Response) => {
      try {
        const reportResult = await handleGetReportById(this.reportService, req.params.id);
        if (!reportResult.success) {
          return res.status(reportResult.error.statusCode).json({
            error: reportResult.error.message,
          });
        }

        const filePath = join(this.reportsDir, reportResult.data.outputFile);
        if (!existsSync(filePath)) {
          return res.status(404).json({ error: 'Excel file not found' });
        }

        return res.download(filePath);
      } catch (error: any) {
        logger.error('Route error: GET /reports/:id/download', { error });
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // ============================================
    // ANALYSIS CONTROL
    // ============================================

    /**
     * @swagger
     * /api/run-analysis:
     *   post:
     *     summary: Run analysis
     *     tags: [Analysis]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               configFile:
     *                 type: string
     *               outputFile:
     *                 type: string
     *     responses:
     *       200:
     *         description: Analysis started
     */
    this.app.post('/api/run-analysis', async (req: Request, res: Response) => {
      try {
        const { configFile, outputFile } = req.body;

        if (!configFile) {
          return res.status(400).json({ error: 'configFile is required' });
        }

        const safePath = normalize(resolve(process.cwd(), configFile));
        if (!safePath.startsWith(process.cwd())) {
          return res.status(400).json({ error: 'Invalid file path' });
        }

        const reportId = await this.runAnalysis(safePath, outputFile || 'dashboard_report.xlsx');
        return res.json({ success: true, reportId });
      } catch (error: any) {
        logger.error('Route error: POST /run-analysis', { error });
        return res.status(500).json({ error: error.message });
      }
    });

    /**
     * @swagger
     * /api/stop-analysis/{id}:
     *   post:
     *     summary: Stop analysis
     *     tags: [Analysis]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Analysis stopped
     */
    this.app.post('/api/stop-analysis/:id', async (req: Request, res: Response) => {
      try {
        const reportId = req.params.id;
        const job = this.runningJobs.get(reportId);

        if (!job) {
          return res.status(404).json({ error: 'Job not found' });
        }

        job.process.kill();
        this.runningJobs.delete(reportId);

        this.broadcastProgress({
          type: 'error',
          reportId,
          message: 'Analysis stopped by user',
        });

        return res.json({ success: true });
      } catch (error: any) {
        logger.error('Route error: POST /stop-analysis/:id', { error });
        return res.status(500).json({ error: error.message });
      }
    });

    // Serve dashboard
    this.app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
      res.sendFile(join(__dirname, 'public', 'index.html'));
    });
  }

  private async ensureReportsDirectory(): Promise<void> {
    if (!existsSync(this.reportsDir)) {
      await mkdir(this.reportsDir, { recursive: true });
      logger.info(`Created reports directory: ${this.reportsDir}`);
    }
  }

  private async runAnalysis(configFile: string, _outputFile: string): Promise<string> {
    const reportId = `report-${Date.now()}`;
    const startTime = Date.now();
    const reportFilename = `${reportId}.xlsx`;

    this.broadcastProgress({
      type: 'progress',
      current: 0,
      total: 100,
      reportId,
      message: 'Starting analysis...',
    });

    const nodeExe = process.execPath;
    const mainScript = join(process.cwd(), 'dist', 'main.js');

    const args = [
      mainScript,
      configFile,
      '--output',
      join(this.reportsDir, reportFilename),
      '--report-id',
      reportId,
      '--verbose',
    ];

    logger.info(`Starting analysis: ${nodeExe} ${args.join(' ')}`);

    const childProcess = spawn(nodeExe, args, {
      cwd: process.cwd(),
      env: { ...process.env },
    });

    this.runningJobs.set(reportId, {
      reportId,
      configFile,
      startTime,
      process: childProcess,
    });

    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines: string[] = output.split('\n').filter((line: string) => line.trim());

      lines.forEach((line) => {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'dashboard-progress') {
            this.broadcastProgress({
              type: 'progress',
              current: parsed.current,
              total: parsed.total,
              currentItem: parsed.message,
              message: parsed.message,
              reportId: parsed.reportId || reportId,
            });
            return;
          }
        } catch (e) {
          // Not JSON
        }

        logger.info(`[${reportId}] ${line}`);

        this.broadcastProgress({
          type: 'log',
          reportId,
          message: line,
          logLevel: 'info',
        });
      });
    });

    childProcess.stderr.on('data', (data) => {
      const output = data.toString();
      logger.error(`[${reportId}] ${output}`);

      this.broadcastProgress({
        type: 'log',
        reportId,
        message: output,
        logLevel: 'error',
      });
    });

    childProcess.on('close', async (code) => {
      this.runningJobs.delete(reportId);

      if (code === 0) {
        logger.info(`Analysis completed successfully: ${reportId}`);

        this.broadcastProgress({
          type: 'complete',
          reportId,
          message: 'Analysis completed successfully',
        });
      } else {
        logger.error(`Analysis failed with code ${code}: ${reportId}`);

        this.broadcastProgress({
          type: 'error',
          reportId,
          message: `Analysis failed with exit code ${code}`,
        });
      }
    });

    childProcess.on('error', async (error) => {
      childProcess.kill('SIGKILL');
      logger.error(`Process error for ${reportId}:`, { error });
      this.runningJobs.delete(reportId);

      this.broadcastProgress({
        type: 'error',
        reportId,
        message: error.message,
      });
    });

    return reportId;
  }

  broadcastProgress(update: ProgressUpdate): void {
    const message = JSON.stringify(update);

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  async start(): Promise<void> {
    // Initialize database
    const initDB = await this.dbManager.initialize();
    if (!initDB.success) {
      throw new Error('Failed to initialize database: ' + initDB.error);
    }

    // Initialize services after DB is ready
    this.initializeServices();

    // Setup routes after services are initialized
    this.setupRoutes();

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        logger.info(`Dashboard server running at http://localhost:${this.port}`);
        logger.info(`API Documentation at http://localhost:${this.port}/api-docs`);
        console.log(`\n🌐 Dashboard: http://localhost:${this.port}`);
        console.log(`📚 API Docs: http://localhost:${this.port}/api-docs`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await this.dbManager.close();
    
    return new Promise((resolve, reject) => {
      this.wss.close(() => {
        this.server.close((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }
}