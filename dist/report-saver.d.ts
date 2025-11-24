/**
 * Utility for saving reports to the database
 */
import { AnalysisResult, ConfigFile } from './models.js';
import { DatabaseManager } from './db-manager.js';
export declare class ReportSaver {
    private dbManager;
    constructor(dbManager?: DatabaseManager);
    /**
     * Initialize database connection
     */
    initialize(): Promise<void>;
    /**
     * Save a report to the database
     */
    saveReport(results: AnalysisResult[], config: ConfigFile, outputFile: string, duration: number, status?: 'completed' | 'failed'): Promise<string>;
    /**
     * Get just the filename from a path
     */
    private getFilename;
    /**
     * Clean up old reports, keeping only the most recent N reports
     */
    cleanupOldReports(keepCount?: number): Promise<void>;
    /**
     * Close database connection
     */
    close(): Promise<void>;
}
//# sourceMappingURL=report-saver.d.ts.map