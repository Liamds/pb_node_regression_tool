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
import { DatabaseManager } from '../db-manager.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';

// New imports for layered architecture
import { ReportRepository } from '../repositories/ReportRepository.js';
import { VarianceRepository } from '../repositories/VarianceRepository.js';
import { ReportService } from '../services/ReportService.js';
import { VarianceService } from '../services/VarianceService.js';

// Import routers
import { createReportsRouter } from '../api/routes/reports.router.js';
import { createVariancesRouter } from '../api/routes/variances.router.js';
import { createStatisticsRouter } from '../api/routes/statistics.router.js';
import { createAnalysisRouter } from '../api/routes/analysis.router.js';

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

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS
    this.app.use(cors());

    // JSON body parser
    this.app.use(express.json());

    // Request logging
    this.app.use((req: Request, _res: Response, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });

    // Static files
    const possiblePublicDirs = [
      join(__dirname, 'public'),
      join(process.cwd(), 'src/dashboard/public'),
      join(process.cwd(), 'dist/dashboard/public'),
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

  /**
   * Setup WebSocket server
   */
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

  /**
   * Setup Swagger documentation
   */
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
   * Setup all API routes using the new router architecture
   */
  private setupRoutes(): void {
    /**
     * Health check endpoint
     */
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Mount routers
    this.app.use('/api/reports', createReportsRouter(this.reportService));
    this.app.use('/api', createVariancesRouter(this.varianceService, this.reportService));
    this.app.use('/api', createStatisticsRouter(this.reportService));
    this.app.use('/api', createAnalysisRouter(
      this.runAnalysis.bind(this),
      this.stopAnalysis.bind(this)
    ));

    // Serve dashboard (catch-all for client-side routing)
    this.app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
      const indexPath = join(__dirname, 'public', 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Dashboard not found. Please build the project first.');
      }
    });

    // 404 handler for API routes
    this.app.use('/api/*', (_req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'API endpoint not found',
        statusCode: 404,
        timestamp: new Date().toISOString(),
      });
    });

    // Global error handler
    this.app.use((err: any, _req: Request, res: Response, _next: any) => {
      logger.error('Unhandled error', { error: err });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        statusCode: 500,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Ensure reports directory exists
   */
  private async ensureReportsDirectory(): Promise<void> {
    if (!existsSync(this.reportsDir)) {
      await mkdir(this.reportsDir, { recursive: true });
      logger.info(`Created reports directory: ${this.reportsDir}`);
    }
  }

  /**
   * Run analysis job
   */
  private async runAnalysis(configFile: string, outputFile: string): Promise<string> {
    const reportId = `report-${Date.now()}`;
    const startTime = Date.now();
    const reportFilename = outputFile ||`${reportId}.xlsx`;

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

    // Handle stdout
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
          // Not JSON, treat as log
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
   * Stop analysis job
   */
  private async stopAnalysis(reportId: string): Promise<boolean> {
    const job = this.runningJobs.get(reportId);

    if (!job) {
      return false;
    }

    try {
      job.process.kill('SIGTERM');
      this.runningJobs.delete(reportId);

      this.broadcastProgress({
        type: 'error',
        reportId,
        message: 'Analysis stopped by user',
      });

      return true;
    } catch (error) {
      logger.error(`Failed to stop analysis ${reportId}`, { error });
      return false;
    }
  }

  /**
   * Broadcast progress update to all connected clients
   */
  broadcastProgress(update: ProgressUpdate): void {
    const message = JSON.stringify(update);

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          logger.error('Failed to send progress update', { error });
        }
      }
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    // Initialize database
    logger.info('Initializing database...');
    const initDB = await this.dbManager.initialize();
    if (!initDB.success) {
      throw new Error('Failed to initialize database: ' + initDB.error.message);
    }
    logger.info('Database initialized successfully');

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
        console.log(`📊 Statistics: http://localhost:${this.port}/api/statistics`);
        console.log(`🔍 Health: http://localhost:${this.port}/api/health\n`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    logger.info('Stopping dashboard server...');

    // Stop all running jobs
    for (const [reportId, job] of this.runningJobs.entries()) {
      logger.info(`Stopping running job: ${reportId}`);
      try {
        job.process.kill('SIGTERM');
      } catch (error) {
        logger.warn(`Failed to stop job ${reportId}`, { error });
      }
    }
    this.runningJobs.clear();

    // Close WebSocket connections
    this.clients.forEach((client) => {
      client.close();
    });
    this.clients.clear();

    // Close database
    await this.dbManager.close();

    return new Promise((resolve, reject) => {
      this.wss.close(() => {
        this.server.close((err: any) => {
          if (err) {
            logger.error('Error closing server', { error: err });
            reject(err);
          } else {
            logger.info('Dashboard server stopped');
            resolve();
          }
        });
      });
    });
  }

  /**
   * Get current port
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Get reports directory
   */
  getReportsDir(): string {
    return this.reportsDir;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server && this.server.listening;
  }
}