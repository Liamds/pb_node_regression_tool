/**
 * Utility for saving reports to the database
 */
import { logger } from './logger.js';
import { randomUUID } from 'crypto';
import { DatabaseManager, } from './db-manager.js';
export class ReportSaver {
    dbManager;
    constructor(dbManager) {
        this.dbManager = dbManager || new DatabaseManager();
    }
    /**
     * Initialize database connection
     */
    async initialize() {
        await this.dbManager.initialize();
    }
    /**
     * Save a report to the database
     */
    async saveReport(results, config, outputFile, duration, status = 'completed') {
        const reportId = `report-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const totalVariances = results.reduce((sum, r) => sum +
            r.variances.filter((v) => v.Difference !== 0 &&
                v.Difference !== '' &&
                !v['Cell Reference'].includes('Subtotal')).length, 0);
        const totalValidationErrors = results.reduce((sum, r) => sum + r.validationsErrors.length, 0);
        // Prepare metadata
        const metadata = {
            id: reportId,
            timestamp: new Date().toISOString(),
            baseDate: config.baseDate,
            totalReturns: results.length,
            totalVariances,
            totalValidationErrors,
            configFile: 'config.json',
            outputFile: this.getFilename(outputFile),
            duration,
            status,
        };
        // Prepare form details
        const formDetails = results.map((r) => ({
            reportId,
            formName: r.formName,
            formCode: r.formCode,
            confirmed: r.confirmed,
            varianceCount: r.variances.filter((v) => v.Difference !== 0 &&
                v.Difference !== '' &&
                !v['Cell Reference'].includes('Subtotal')).length,
            validationErrorCount: r.validationsErrors.length,
            baseDate: r.baseInstance.refDate,
            comparisonDate: r.comparisonInstance.refDate,
        }));
        // Prepare variance details (all variances with non-zero differences)
        const variances = [];
        for (const result of results) {
            for (const v of result.variances) {
                // Store all variances including subtotals for complete export
                variances.push({
                    reportId,
                    formCode: result.formCode,
                    cellReference: v['Cell Reference'],
                    cellDescription: v['Cell Description'],
                    comparisonValue: String(v[result.comparisonInstance.refDate] || '0'),
                    baseValue: String(v[result.baseInstance.refDate] || '0'),
                    difference: String(v['Difference'] || '0'),
                    percentDifference: String(v['% Difference'] || '0'),
                });
            }
        }
        // Save to database
        await this.dbManager.saveReport(metadata, formDetails, variances);
        logger.info(`Saved report ${reportId} to database with ${variances.length} variances`);
        return reportId;
    }
    /**
     * Get just the filename from a path
     */
    getFilename(filepath) {
        const parts = filepath.split(/[\/\\]/);
        return parts[parts.length - 1];
    }
    /**
     * Clean up old reports, keeping only the most recent N reports
     */
    async cleanupOldReports(keepCount = 20) {
        try {
            const reports = await this.dbManager.getReports();
            if (reports.length <= keepCount) {
                return; // Nothing to clean up
            }
            // Sort by timestamp and get reports to delete
            reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            const toDelete = reports.slice(keepCount);
            // Delete old reports
            for (const report of toDelete) {
                await this.dbManager.deleteReport(report.id);
            }
            logger.info(`Cleaned up ${toDelete.length} old reports`);
        }
        catch (error) {
            logger.error('Error cleaning up old reports', { error });
        }
    }
    /**
     * Close database connection
     */
    async close() {
        await this.dbManager.close();
    }
}
//# sourceMappingURL=report-saver.js.map