/**
 * Utility for saving reports to the database
 */

import { logger } from './logger.js';
//import { ConfigFile } from './models.js';
import { randomUUID } from 'crypto';
import {
  DatabaseManager,
  ReportMetadata,
  FormDetail,
  VarianceDetail,
} from './db-manager.js';
import { AnalysisResult, ConfigFile } from './types/index.js';

export class ReportSaver {
  private dbManager: DatabaseManager;

  constructor(dbManager?: DatabaseManager) {
    this.dbManager = dbManager || new DatabaseManager();
  }

  /**
   * Initialize database connection
   */
  async initialize(): Promise<void> {
    await this.dbManager.initialize();
  }

  /**
   * Save a report to the database
   */
  async saveReport(
    results: AnalysisResult[],
    config: ConfigFile,
    outputFile: string,
    duration: number,
    status: 'completed' | 'failed' = 'completed'
  ): Promise<string> {
    const reportId = `report-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const totalVariances = results.reduce(
      (sum, r) =>
        sum +
        r.variances.filter(
          (v) =>
            v.Difference !== 0 &&
            v.Difference !== '' &&
            typeof v['Cell Reference'] === 'string' && !v['Cell Reference'].includes('Subtotal')
        ).length,
      0
    );
    const totalValidationErrors = results.reduce(
      (sum, r) => sum + r.validationsErrors.length,
      0
    );

    // Prepare metadata
    const metadata: ReportMetadata = {
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
    const formDetails: FormDetail[] = results.map((r) => ({
      reportId,
      formName: r.formName,
      formCode: r.formCode,
      confirmed: r.confirmed,
      varianceCount: r.variances.filter(
        (v) =>
          v.Difference !== 0 &&
          v.Difference !== '' &&
          typeof v['Cell Reference'] === 'string' && !v['Cell Reference'].includes('Subtotal')
      ).length,
      validationErrorCount: r.validationsErrors.length,
      baseDate: r.baseInstance.referenceDate,
      comparisonDate: r.comparisonInstance.referenceDate,
    }));

    // Prepare variance details (all variances with non-zero differences)
    const variances: VarianceDetail[] = [];
    for (const result of results) {
      for (const v of result.variances) {
        // Store all variances including subtotals for complete export
        variances.push({
          reportId,
          formCode: result.formCode,
          cellReference: String((v as any)['Cell Reference'] || ''),
          cellDescription: String((v as any)['Cell Description'] || ''),
          comparisonValue: String(v[result.comparisonInstance.referenceDate] || '0'),
          baseValue: String(v[result.baseInstance.referenceDate] || '0'),
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
  private getFilename(filepath: string): string {
    const parts = filepath.split(/[\/\\]/);
    return parts[parts.length - 1];
  }

  /**
   * Clean up old reports, keeping only the most recent N reports
   */
  async cleanupOldReports(keepCount: number = 20): Promise<void> {
    try {
      const reports = await this.dbManager.getReports();
      
      if(!reports.success) {
        logger.error('Failed to get reports to clean up', { error: reports.error.message });
        return;
      }

      if (reports.data.length <= keepCount) {
        return; // Nothing to clean up
      }
      // Sort by timestamp and get reports to delete (make a mutable copy first because reports.data is readonly)
      const reportsArray = Array.from(reports.data);
      reportsArray.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const toDelete = reportsArray.slice(keepCount);

      // Delete old reports
      for (const report of toDelete) {
        await this.dbManager.deleteReport(report.id);
      }

      logger.info(`Cleaned up ${toDelete.length} old reports`);
    } catch (error) {
      logger.error('Error cleaning up old reports', { error });
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.dbManager.close();
  }
}