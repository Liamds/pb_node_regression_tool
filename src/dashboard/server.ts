/**
 * Updated Web dashboard server with Swagger API documentation
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
import { ReportStatus } from '../types/index.js';

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
    this.setupRoutes();
    this.ensureReportsDirectory();
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
    // Serve Swagger UI
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Variance Analysis API Docs',
      customfavIcon: '/favicon.ico'
    }));

    // Serve OpenAPI JSON spec
    this.app.get('/api-docs.json', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });

    logger.info('Swagger documentation available at /api-docs');
  }

  private setupRoutes(): void {
    /**
     * @swagger
     * /api/health:
     *   get:
     *     summary: Health check
     *     description: Check if the API server is running
     *     tags: [Health]
     *     responses:
     *       200:
     *         description: Server is healthy
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status:
     *                   type: string
     *                   example: ok
     *                 timestamp:
     *                   type: string
     *                   format: date-time
     *                   example: 2025-11-24T10:00:00.000Z
     */
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    /**
     * @swagger
     * /api/reports:
     *   get:
     *     summary: Get all reports
     *     description: Retrieve a list of all analysis reports with optional filtering
     *     tags: [Reports]
     *     parameters:
     *       - in: query
     *         name: status
     *         schema:
     *           type: string
     *           enum: [completed, running, failed]
     *         description: Filter by report status
     *       - in: query
     *         name: baseDate
     *         schema:
     *           type: string
     *           format: date
     *         description: Filter by base date (YYYY-MM-DD)
     *         example: 2025-06-30
     *       - in: query
     *         name: formCode
     *         schema:
     *           type: string
     *         description: Filter by form code
     *         example: ARF1100
     *     responses:
     *       200:
     *         description: List of reports
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 reports:
     *                   type: array
     *                   items:
     *                     $ref: '#/components/schemas/Report'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    this.app.get('/api/reports', async (req: Request, res: Response) => {
      try {
        const { status, baseDate, formCode } = req.query;
        const reports = await this.dbManager.getReports({
          status: status as ReportStatus,
          baseDate: baseDate as string,
          formCode: formCode as string,
        });

        if(!reports.success) {
          return res.status(500).json({ error: reports.error.message });
        }
        
        logger.info(`Fetched ${reports.data.length} reports`);
        return res.json({ reports });
      } catch (error: any) {
        logger.error('Error listing reports', { error });
        return res.status(500).json({ error: error.message });
      }
    });

    /**
     * @swagger
     * /api/reports/{id}:
     *   get:
     *     summary: Get report by ID
     *     description: Retrieve detailed metadata for a specific report
     *     tags: [Reports]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Report ID
     *         example: report-1700000000000-abc123
     *     responses:
     *       200:
     *         description: Report metadata
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Report'
     *       404:
     *         description: Report not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    this.app.get('/api/reports/:id', async (req: Request, res: Response) => {
      try {
        const report = await this.dbManager.getReport(req.params.id);
        if (!report) {
          return res.status(404).json({ error: 'Report not found' });
        }
        return res.json(report);
      } catch (error: any) {
        logger.error('Error getting report', { error });
        return res.status(500).json({ error: error.message });
      }
    });

    /**
     * @swagger
     * /api/reports/{id}/details:
     *   get:
     *     summary: Get report details
     *     description: Retrieve detailed form-level data including top variances
     *     tags: [Reports]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Report ID
     *     responses:
     *       200:
     *         description: Report details with form data
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 results:
     *                   type: array
     *                   items:
     *                     $ref: '#/components/schemas/FormDetail'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    this.app.get('/api/reports/:id/details', async (req: Request, res: Response) => {
      try {
        const formDetails = await this.dbManager.getFormDetails(req.params.id);
        if(!formDetails.success) {
          return res.status(500).json({ error: formDetails.error.message });
        }
        
        const results = await Promise.all(
          formDetails.data.map(async (form) => {
            const variances = await this.dbManager.getVariances(req.params.id, form.formCode);

            if(!variances.success) {
              return res.status(500).json({ error: variances.error.message });
            }
            
            const topVariances = variances.data
              .filter(v => 
                v.difference !== '0' && 
                v.difference !== '' && 
                !v.cellReference.includes('Subtotal')
              )
              .slice(0, 100);

            return {
              ...form,
              topVariances: topVariances.map(v => ({
                'Cell Reference': v.cellReference,
                'Cell Description': v.cellDescription,
                [form.comparisonDate]: v.comparisonValue,
                [form.baseDate]: v.baseValue,
                'Difference': v.difference,
                '% Difference': v.percentDifference,
                flagged: v.flagged,
                category: v.category,
                comment: v.comment,
              })),
            };
          })
        );

        return res.json({ results });
      } catch (error: any) {
        logger.error('Error getting report details', { error });
        return res.status(500).json({ error: error.message });
      }
    });

    /**
     * @swagger
     * /api/reports/{id}/annotations:
     *   post:
     *     summary: Update variance annotation
     *     description: Add or update flags, categories, and comments for a variance
     *     tags: [Annotations]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Report ID
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/VarianceAnnotation'
     *     responses:
     *       200:
     *         description: Annotation updated successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    this.app.post('/api/reports/:id/annotations', async (req: Request, res: Response) => {
      try {
        const { formCode, cellReference, flagged, category, comment } = req.body;

        await this.dbManager.updateVarianceAnnotation({
          reportId: req.params.id,
          formCode,
          cellReference,
          flagged: flagged || false,
          category: category || null,
          comment: comment || null,
        });

        res.json({ success: true });
      } catch (error: any) {
        logger.error('Error updating annotation', { error });
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * @swagger
     * /api/reports/{id}/export/{formCode}:
     *   get:
     *     summary: Export form variances to CSV
     *     description: Download all variances for a specific form as CSV file
     *     tags: [Export]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Report ID
     *       - in: path
     *         name: formCode
     *         required: true
     *         schema:
     *           type: string
     *         description: Form code
     *         example: ARF1100
     *     responses:
     *       200:
     *         description: CSV file download
     *         content:
     *           text/csv:
     *             schema:
     *               type: string
     *       404:
     *         description: Report or form not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    this.app.get('/api/reports/:id/export/:formCode', async (req: Request, res: Response) => {
      try {
        const { id, formCode } = req.params;
        
        const report = await this.dbManager.getReport(id);
        if (!report.success) {
          return res.status(404).json({ error: 'Report not found' });
        }

        const formDetails = await this.dbManager.getFormDetails(id);
        if(!formDetails.success) {
          return res.status(500).json({ error: formDetails.error.message });
        }

        const form = formDetails.data.find(f => f.formCode === formCode);
        if (!form) {
          return res.status(404).json({ error: 'Form not found' });
        }

        const variances = await this.dbManager.getVariances(id, formCode);

        if(!variances.success) {
          return res.status(500).json({ error: variances.error.message });
        }

        const csvData = variances.data.map(v => ({
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

        const filename = `${formCode}_${report.data.baseDate}_variances.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
        return;
      } catch (error: any) {
        logger.error('Error exporting CSV', { error });
        return res.status(500).json({ error: error.message });
      }
    });

    /**
     * @swagger
     * /api/reports/{id}/download:
     *   get:
     *     summary: Download Excel report
     *     description: Download the original Excel workbook for a report
     *     tags: [Export]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Report ID
     *     responses:
     *       200:
     *         description: Excel file download
     *         content:
     *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
     *             schema:
     *               type: string
     *               format: binary
     *       404:
     *         description: Report or file not found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     *       500:
     *         description: Server error
     */
    this.app.get('/api/reports/:id/download', async (req: Request, res: Response) => {
      try {
        const report = await this.dbManager.getReport(req.params.id);
        if (!report.success) {
          return res.status(404).json({ error: 'Report not found' });
        }

        const filePath = join(this.reportsDir, report.data.outputFile);
        if (!existsSync(filePath)) {
          return res.status(404).json({ error: 'Excel file not found' });
        }

        return res.download(filePath);
      } catch (error: any) {
        logger.error('Error downloading report', { error });
        return res.status(500).json({ error: error.message });
      }
    });

    /**
     * @swagger
     * /api/reports/{id}:
     *   delete:
     *     summary: Delete report
     *     description: Permanently delete a report and all associated data
     *     tags: [Reports]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Report ID
     *     responses:
     *       200:
     *         description: Report deleted successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *       500:
     *         description: Server error
     */
    this.app.delete('/api/reports/:id', async (req: Request, res: Response) => {
      try {
        await this.dbManager.deleteReport(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        logger.error('Error deleting report', { error });
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * @swagger
     * /api/statistics:
     *   get:
     *     summary: Get statistics
     *     description: Retrieve aggregated statistics with optional filtering
     *     tags: [Statistics]
     *     parameters:
     *       - in: query
     *         name: status
     *         schema:
     *           type: string
     *         description: Filter by status
     *       - in: query
     *         name: baseDate
     *         schema:
     *           type: string
     *         description: Filter by base date
     *       - in: query
     *         name: formCode
     *         schema:
     *           type: string
     *         description: Filter by form code
     *     responses:
     *       200:
     *         description: Statistics data
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Statistics'
     *       500:
     *         description: Server error
     */
    this.app.get('/api/statistics', async (req: Request, res: Response) => {
      try {
        const { status, baseDate, formCode } = req.query;
        const stats = await this.dbManager.getStatistics({
          status: status as ReportStatus,
          baseDate: baseDate as string,
          formCode: formCode as string,
        });
        res.json(stats);
      } catch (error: any) {
        logger.error('Error getting statistics', { error });
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * @swagger
     * /api/filters:
     *   get:
     *     summary: Get filter options
     *     description: Retrieve available filter values for reports
     *     tags: [Filters]
     *     responses:
     *       200:
     *         description: Filter options
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 baseDates:
     *                   type: array
     *                   items:
     *                     type: string
     *                     format: date
     *                   example: ['2025-06-30', '2025-03-31']
     *                 formCodes:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       code:
     *                         type: string
     *                         example: ARF1100
     *                       name:
     *                         type: string
     *                         example: Balance Sheet
     *       500:
     *         description: Server error
     */
    this.app.get('/api/filters', async (_req: Request, res: Response) => {
      try {
        const [baseDates, formCodes] = await Promise.all([
          this.dbManager.getBaseDates(),
          this.dbManager.getFormCodes(),
        ]);

        res.json({ baseDates, formCodes });
      } catch (error: any) {
        logger.error('Error getting filters', { error });
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * @swagger
     * /api/run-analysis:
     *   post:
     *     summary: Run analysis
     *     description: Start a new variance analysis job
     *     tags: [Analysis]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/AnalysisRequest'
     *     responses:
     *       200:
     *         description: Analysis started successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 reportId:
     *                   type: string
     *                   example: report-1700000000000-xyz789
     *       400:
     *         description: Invalid request
     *       500:
     *         description: Server error
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
        logger.error('Error starting analysis', { error });
        return res.status(500).json({ error: error.message });
      }
    });

    /**
     * @swagger
     * /api/stop-analysis/{id}:
     *   post:
     *     summary: Stop analysis
     *     description: Stop a currently running analysis job
     *     tags: [Analysis]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: string
     *         description: Report ID of running job
     *     responses:
     *       200:
     *         description: Analysis stopped successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *       404:
     *         description: Job not found
     *       500:
     *         description: Server error
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
        logger.error('Error stopping analysis', { error });
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
    await this.dbManager.initialize();

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