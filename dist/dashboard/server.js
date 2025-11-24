/**
 * Enhanced Web dashboard server with batch operations
 */
import express from 'express';
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
export class DashboardServer {
    app;
    server;
    wss;
    port;
    reportsDir;
    clients = new Set();
    runningJobs = new Map();
    dbManager;
    constructor(port = 3000) {
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
    setupMiddleware() {
        // CORS configuration
        this.app.use(cors({
            origin: process.env.NODE_ENV === 'production'
                ? process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
                : true
        }));
        this.app.use(express.json());
        // Serve React build in production or fallback to old public
        const possiblePublicDirs = [
            join(__dirname, 'public-react'), // React build output
            join(__dirname, 'public'), // Original static files
            join(process.cwd(), 'src/dashboard/public-react'),
            join(process.cwd(), 'src/dashboard/public'),
        ];
        for (const dir of possiblePublicDirs) {
            if (existsSync(dir)) {
                this.app.use(express.static(dir));
                logger.info(`Serving static files from: ${dir}`);
                break;
            }
        }
    }
    setupWebSocket() {
        this.wss.on('connection', (ws) => {
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
    setupRoutes() {
        // Health check
        this.app.get('/api/health', (_req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });
        // Get all reports with filters
        this.app.get('/api/reports', async (req, res) => {
            try {
                const { status, baseDate, formCode } = req.query;
                const reports = await this.dbManager.getReports({
                    status: status,
                    baseDate: baseDate,
                    formCode: formCode,
                });
                logger.info(`Fetched ${reports.length} reports`);
                res.json({ reports });
            }
            catch (error) {
                logger.error('Error listing reports', { error });
                res.status(500).json({ error: error.message });
            }
        });
        // Get specific report
        this.app.get('/api/reports/:id', async (req, res) => {
            try {
                const report = await this.dbManager.getReport(req.params.id);
                if (!report) {
                    return res.status(404).json({ error: 'Report not found' });
                }
                return res.json(report);
            }
            catch (error) {
                logger.error('Error getting report', { error });
                return res.status(500).json({ error: error.message });
            }
        });
        // Get report details (form data with variances)
        this.app.get('/api/reports/:id/details', async (req, res) => {
            try {
                const { minDifference, category, flaggedOnly, sortBy, sortOrder } = req.query;
                const formDetails = await this.dbManager.getFormDetails(req.params.id);
                // Get variances for each form with filtering
                const results = await Promise.all(formDetails.map(async (form) => {
                    const variances = await this.dbManager.getVariances(req.params.id, form.formCode, {
                        minDifference: minDifference ? Number(minDifference) : undefined,
                        category: category,
                        flaggedOnly: flaggedOnly === 'true',
                        sortBy: sortBy,
                        sortOrder: sortOrder
                    });
                    // Filter and limit for UI performance
                    const topVariances = variances
                        .filter(v => v.difference !== '0' &&
                        v.difference !== '' &&
                        !v.cellReference.includes('Subtotal'))
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
                }));
                res.json({ results });
            }
            catch (error) {
                logger.error('Error getting report details', { error });
                res.status(500).json({ error: error.message });
            }
        });
        // Update variance annotation
        this.app.post('/api/reports/:id/annotations', async (req, res) => {
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
            }
            catch (error) {
                logger.error('Error updating annotation', { error });
                res.status(500).json({ error: error.message });
            }
        });
        // Batch update annotations
        this.app.post('/api/reports/:id/annotations/batch', async (req, res) => {
            try {
                const { annotations } = req.body;
                if (!Array.isArray(annotations)) {
                    return res.status(400).json({ error: 'annotations must be an array' });
                }
                await this.dbManager.batchUpdateAnnotations(annotations.map((a) => ({
                    reportId: req.params.id,
                    ...a
                })));
                return res.json({ success: true, count: annotations.length }); // Added return statement
            }
            catch (error) {
                logger.error('Error batch updating annotations', { error });
                return res.status(500).json({ error: error.message });
            }
        });
        // Export form variances to CSV
        this.app.get('/api/reports/:id/export/:formCode', async (req, res) => {
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
                const csv = await json2csv(csvData);
                const filename = `${formCode}_${report.baseDate}_variances.csv`;
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(csv);
                return;
            }
            catch (error) {
                logger.error('Error exporting CSV', { error });
                return res.status(500).json({ error: error.message });
            }
        });
        // Download Excel file
        this.app.get('/api/reports/:id/download', async (req, res) => {
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
            }
            catch (error) {
                logger.error('Error downloading report', { error });
                return res.status(500).json({ error: error.message });
            }
        });
        // Delete single report
        this.app.delete('/api/reports/:id', async (req, res) => {
            try {
                await this.dbManager.deleteReport(req.params.id);
                res.json({ success: true });
            }
            catch (error) {
                logger.error('Error deleting report', { error });
                res.status(500).json({ error: error.message });
            }
        });
        // Batch delete reports
        this.app.post('/api/reports/batch-delete', async (req, res) => {
            try {
                const { reportIds } = req.body;
                if (!Array.isArray(reportIds)) {
                    return res.status(400).json({ error: 'reportIds must be an array' });
                }
                await this.dbManager.batchDeleteReports(reportIds);
                return res.json({ success: true, count: reportIds.length }); // Added return statement
            }
            catch (error) {
                logger.error('Error batch deleting reports', { error });
                return res.status(500).json({ error: error.message });
            }
        });
        // Get statistics with filters
        this.app.get('/api/statistics', async (req, res) => {
            try {
                const { status, baseDate, formCode } = req.query;
                const stats = await this.dbManager.getStatistics({
                    status: status,
                    baseDate: baseDate,
                    formCode: formCode,
                });
                res.json(stats);
            }
            catch (error) {
                logger.error('Error getting statistics', { error });
                res.status(500).json({ error: error.message });
            }
        });
        // Get filter options
        this.app.get('/api/filters', async (_req, res) => {
            try {
                const [baseDates, formCodes] = await Promise.all([
                    this.dbManager.getBaseDates(),
                    this.dbManager.getFormCodes(),
                ]);
                res.json({ baseDates, formCodes });
            }
            catch (error) {
                logger.error('Error getting filters', { error });
                res.status(500).json({ error: error.message });
            }
        });
        // Run analysis endpoint
        this.app.post('/api/run-analysis', async (req, res) => {
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
            }
            catch (error) {
                logger.error('Error starting analysis', { error });
                return res.status(500).json({ error: error.message });
            }
        });
        // Stop analysis endpoint
        this.app.post('/api/stop-analysis/:id', async (req, res) => {
            try {
                const reportId = req.params.id;
                const job = this.runningJobs.get(reportId);
                if (!job) {
                    return res.status(404).json({ error: 'Job not found' });
                }
                this.cleanupJob(reportId);
                this.broadcastProgress({
                    type: 'error',
                    reportId,
                    message: 'Analysis stopped by user',
                });
                return res.json({ success: true });
            }
            catch (error) {
                logger.error('Error stopping analysis', { error });
                return res.status(500).json({ error: error.message });
            }
        });
        // Serve React app for all non-API routes
        this.app.get(/^(?!\/api).*/, (_req, res) => {
            const indexPath = join(__dirname, 'public-react', 'index.html');
            const fallbackPath = join(__dirname, 'public', 'index.html');
            if (existsSync(indexPath)) {
                res.sendFile(indexPath);
            }
            else if (existsSync(fallbackPath)) {
                res.sendFile(fallbackPath);
            }
            else {
                res.status(404).send('Dashboard not found. Please build the React app first.');
            }
        });
    }
    async ensureReportsDirectory() {
        if (!existsSync(this.reportsDir)) {
            await mkdir(this.reportsDir, { recursive: true });
            logger.info(`Created reports directory: ${this.reportsDir}`);
        }
    }
    /**
     * Clean up job process and resources
     */
    cleanupJob(reportId) {
        const job = this.runningJobs.get(reportId);
        if (job?.process) {
            job.process.removeAllListeners();
            if (!job.process.killed) {
                job.process.kill('SIGTERM');
                // Force kill after 5 seconds
                setTimeout(() => {
                    if (!job.process.killed) {
                        job.process.kill('SIGKILL');
                    }
                }, 5000);
            }
        }
        this.runningJobs.delete(reportId);
    }
    /**
     * Run analysis as a child process
     */
    async runAnalysis(configFile, _outputFile) {
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
        // Handle stdout
        childProcess.stdout.on('data', (data) => {
            const output = data.toString();
            const lines = output.split('\n').filter((line) => line.trim());
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
                }
                catch (e) {
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
        // Handle completion
        childProcess.on('close', async (code) => {
            try {
                const report = await this.dbManager.getReport(reportId);
                if (report) {
                    await this.dbManager.saveReport({ ...report, status: code === 0 ? 'completed' : 'failed' }, [], []);
                }
            }
            catch (error) {
                logger.error('Error updating report status', { error });
            }
            finally {
                this.cleanupJob(reportId);
            }
            if (code === 0) {
                logger.info(`Analysis completed successfully: ${reportId}`);
                this.broadcastProgress({
                    type: 'complete',
                    reportId,
                    message: 'Analysis completed successfully',
                });
            }
            else {
                logger.error(`Analysis failed with code ${code}: ${reportId}`);
                this.broadcastProgress({
                    type: 'error',
                    reportId,
                    message: `Analysis failed with exit code ${code}`,
                });
            }
        });
        // Handle errors
        childProcess.on('error', async (error) => {
            logger.error(`Process error for ${reportId}:`, { error });
            this.cleanupJob(reportId);
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
    broadcastProgress(update) {
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
    async start() {
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
    async stop() {
        // Clean up all running jobs
        for (const reportId of this.runningJobs.keys()) {
            this.cleanupJob(reportId);
        }
        await this.dbManager.close();
        return new Promise((resolve, reject) => {
            this.wss.close(() => {
                this.server.close((err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
        });
    }
}
//# sourceMappingURL=server.js.map