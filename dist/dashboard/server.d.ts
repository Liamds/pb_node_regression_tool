/**
 * Enhanced Web dashboard server with batch operations
 */
interface ProgressUpdate {
    type: 'progress' | 'complete' | 'error' | 'log';
    current?: number;
    total?: number;
    currentItem?: string;
    message?: string;
    reportId?: string;
    logLevel?: 'info' | 'warn' | 'error' | 'debug';
}
export declare class DashboardServer {
    private app;
    private server;
    private wss;
    private port;
    private reportsDir;
    private clients;
    private runningJobs;
    private dbManager;
    constructor(port?: number);
    private setupMiddleware;
    private setupWebSocket;
    private setupRoutes;
    private ensureReportsDirectory;
    /**
     * Clean up job process and resources
     */
    private cleanupJob;
    /**
     * Run analysis as a child process
     */
    private runAnalysis;
    /**
     * Broadcast progress update to all connected clients
     */
    broadcastProgress(update: ProgressUpdate): void;
    /**
     * Start the server
     */
    start(): Promise<void>;
    /**
     * Stop the server
     */
    stop(): Promise<void>;
}
export {};
//# sourceMappingURL=server.d.ts.map