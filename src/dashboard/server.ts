/**
 * Web dashboard server with SQLite and CSV export
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

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Get all reports
    this.app.get('/api/reports', async (req: Request, res: Response) => {
      try {
        const { status, baseDate, formCode } = req.query;
        const reports = await this.dbManager.getReports({
          status: status as string,
          baseDate: baseDate as string,
          formCode: formCode as string,
        });
        
        logger.info(`Fetched ${reports.length} reports`);
        reports.forEach((r, i) => {
          logger.info(`Report ${i}: ${r.id} - ${r.timestamp} - ${r.baseDate}`);
        });

        res.json({ reports });
      } catch (error: any) {
        logger.error('Error listing reports', { error });
        res.status(500).json({ error: error.message });
      }
    });

    // Get specific report
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

    // Get report details (form data with variances)
    this.app.get('/api/reports/:id/details', async (req: Request, res: Response) => {
      try {
        const formDetails = await this.dbManager.getFormDetails(req.params.id);
        
        // Get top variances for each form (limit to 100 for UI performance)
        const results = await Promise.all(
          formDetails.map(async (form) => {
            const variances = await this.dbManager.getVariances(req.params.id, form.formCode);
            
            // Filter non-zero, non-subtotal variances and limit to top 100
            const topVariances = variances
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

        res.json({ results });
      } catch (error: any) {
        logger.error('Error getting report details', { error });
        res.status(500).json({ error: error.message });
      }
    });

    // Update variance annotation
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

    // Export form variances to CSV
    this.app.get('/api/reports/:id/export/:formCode', async (req: Request, res: Response) => {
      try {
        const { id, formCode } = req.params;
        
        const report = await this.dbManager.getReport(id);
        if (!report) {
          return res.status(404).json({ error: 'Report not found' });
        }

        const formDetails = await this.dbManager.getFormDetails(id);
        const form = formDetails.find(f => f.formCode === formCode);
        if (!form) {
          return res.status(404).json({ error: 'Form not found' });
        }

        const variances = await this.dbManager.getVariances(id, formCode);

        // Prepare CSV data
        const csvData = variances.map(v => ({
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

        // Convert to CSV
        const csv = await json2csv(csvData);

        // Send CSV file
        const filename = `${formCode}_${report.baseDate}_variances.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
        return;
      } catch (error: any) {
        logger.error('Error exporting CSV', { error });
        return res.status(500).json({ error: error.message });
      }
    });

    // Download Excel file
    this.app.get('/api/reports/:id/download', async (req: Request, res: Response) => {
      try {
        const report = await this.dbManager.getReport(req.params.id);
        if (!report) {
          return res.status(404).json({ error: 'Report not found' });
        }

        const filePath = join(this.reportsDir, report.outputFile);
        if (!existsSync(filePath)) {
          return res.status(404).json({ error: 'Excel file not found' });
        }

        return res.download(filePath);
      } catch (error: any) {
        logger.error('Error downloading report', { error });
        return res.status(500).json({ error: error.message });
      }
    });

    // Delete report
    this.app.delete('/api/reports/:id', async (req: Request, res: Response) => {
      try {
        await this.dbManager.deleteReport(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        logger.error('Error deleting report', { error });
        res.status(500).json({ error: error.message });
      }
    });

    // Get statistics with filters
    this.app.get('/api/statistics', async (req: Request, res: Response) => {
      try {
        const { status, baseDate, formCode } = req.query;
        const stats = await this.dbManager.getStatistics({
          status: status as string,
          baseDate: baseDate as string,
          formCode: formCode as string,
        });
        res.json(stats);
      } catch (error: any) {
        logger.error('Error getting statistics', { error });
        res.status(500).json({ error: error.message });
      }
    });

    // Get filter options
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

    // Run analysis endpoint
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

    // Stop analysis endpoint
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

  /**
   * Run analysis as a child process
   */
  private async runAnalysis(configFile: string, _outputFile: string): Promise<string> {
    const reportId = `report-${Date.now()}`;
    const startTime = Date.now();
    const reportFilename = `${reportId}.xlsx`;

    // Broadcast initial status
    this.broadcastProgress({
      type: 'progress',
      current: 0,
      total: 100,
      reportId,
      message: 'Starting analysis...',
    });

    // Spawn the analysis process
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

    // Handle stdout - parse JSON progress
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
          // Not JSON, regular log
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

    // Handle stderr
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

    // Handle process completion
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

    // Handle process errors
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

  /**
   * Broadcast progress update to all connected clients
   */
  broadcastProgress(update: ProgressUpdate): void {
    const message = JSON.stringify(update);

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    // Initialize database
    await this.dbManager.initialize();

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        logger.info(`Dashboard server running at http://localhost:${this.port}`);
        console.log(`\n🌐 Dashboard: http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
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