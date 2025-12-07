/**
 * Type-safe utility for saving analysis reports to the database
 * 
 * Features:
 * - 100% TypeScript safety with explicit types
 * - Result<T, E> pattern for error handling
 * - Dependency injection for testability
 * - Pure business logic with side effects isolated
 * - Comprehensive error handling
 * - JSDoc documentation for all exports
 * 
 * @module report-saver
 */

import { randomUUID } from 'crypto';
import { logger } from './logger.js';
import { DatabaseManager, DatabaseError } from './db-manager.js';
import type {
  AnalysisResult,
  ConfigFile,
  FormDetail,
  ReportMetadata,
  VarianceDetail,
  ReportStatus,
  Result,
  AsyncResult,
} from './types/index.js';

// ============================================
// ERROR TYPES
// ============================================

/**
 * Report saver error codes
 */
export enum ReportSaverErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  SAVE_FAILED = 'SAVE_FAILED',
  CLEANUP_FAILED = 'CLEANUP_FAILED',
}

/**
 * Report saver error class
 */
export class ReportSaverError extends Error {
  constructor(
    message: string,
    public readonly code: ReportSaverErrorCode,
    public readonly context?: Record<string, unknown>,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ReportSaverError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ReportSaverError);
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return this.code === ReportSaverErrorCode.DATABASE_ERROR;
  }
}

// ============================================
// CONFIGURATION TYPES
// ============================================

/**
 * Report saver configuration
 */
export interface ReportSaverConfig {
  /**
   * Database manager instance (optional, will create new if not provided)
   */
  readonly dbManager?: DatabaseManager;

  /**
   * Whether to automatically initialize database on construction
   * @default false
   */
  readonly autoInitialize?: boolean;

  /**
   * Default number of reports to keep during cleanup
   * @default 20
   */
  readonly defaultKeepCount?: number;
}

/**
 * Report generation metadata
 */
export interface ReportGenerationMetadata {
  readonly configFile: string;
  readonly outputFile: string;
  readonly duration: number;
  readonly status: ReportStatus;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract filename from a file path
 * Pure function with no side effects
 * 
 * @param filepath - Full file path
 * @returns Filename only
 * 
 * @example
 * ```typescript
 * getFilename('/path/to/report.xlsx'); // 'report.xlsx'
 * getFilename('report.xlsx'); // 'report.xlsx'
 * getFilename('C:\\Users\\report.xlsx'); // 'report.xlsx'
 * ```
 */
function getFilename(filepath: string): string {
  const parts = filepath.split(/[\/\\]/);
  const filename = parts[parts.length - 1];
  return filename || filepath;
}

/**
 * Generate a unique report ID
 * Pure function with deterministic output
 * 
 * @returns Unique report ID
 * 
 * @example
 * ```typescript
 * generateReportId(); // 'report-1700000000000-abc12345'
 * ```
 */
function generateReportId(): string {
  const timestamp = Date.now();
  const uuid = randomUUID().slice(0, 8);
  return `report-${timestamp}-${uuid}`;
}

/**
 * Calculate total variances across all results
 * Pure function with no side effects
 * 
 * @param results - Array of analysis results
 * @returns Total count of meaningful variances
 */
function calculateTotalVariances(
  results: readonly AnalysisResult[]
): number {
  return results.reduce((sum, result) => {
    const meaningfulVariances = result.variances.filter(
      (v) =>
        v.Difference !== 0 &&
        v.Difference !== '' &&
        typeof v['Cell Reference'] === 'string' &&
        !v['Cell Reference'].includes('Subtotal')
    );
    return sum + meaningfulVariances.length;
  }, 0);
}

/**
 * Calculate total validation errors across all results
 * Pure function with no side effects
 * 
 * @param results - Array of analysis results
 * @returns Total count of validation errors
 */
function calculateTotalValidationErrors(
  results: readonly AnalysisResult[]
): number {
  return results.reduce(
    (sum, result) => sum + result.validationsErrors.length,
    0
  );
}

/**
 * Transform analysis result to form detail
 * Pure function with no side effects
 * 
 * @param result - Analysis result
 * @param reportId - Associated report ID
 * @returns Form detail record
 */
function resultToFormDetail(
  result: AnalysisResult,
  reportId: string
): FormDetail {
  const meaningfulVariances = result.variances.filter(
    (v) =>
      v.Difference !== 0 &&
      v.Difference !== '' &&
      typeof v['Cell Reference'] === 'string' &&
      !v['Cell Reference'].includes('Subtotal')
  );

  return {
    reportId,
    formName: result.formName,
    formCode: result.formCode,
    confirmed: result.confirmed,
    varianceCount: meaningfulVariances.length,
    validationErrorCount: result.validationsErrors.length,
    baseDate: result.baseInstance.referenceDate,
    comparisonDate: result.comparisonInstance.referenceDate,
  };
}

/**
 * Transform variance record to variance detail
 * Pure function with no side effects
 * 
 * @param variance - Variance record
 * @param result - Parent analysis result
 * @param reportId - Associated report ID
 * @returns Variance detail record
 */
function varianceToDetail(
  variance: Record<string, unknown>,
  result: AnalysisResult,
  reportId: string
): VarianceDetail {
  return {
    reportId,
    formCode: result.formCode,
    cellReference: String(variance['Cell Reference'] || ''),
    cellDescription: String(variance['Cell Description'] || ''),
    comparisonValue: String(
      variance[result.comparisonInstance.referenceDate] || '0'
    ),
    baseValue: String(variance[result.baseInstance.referenceDate] || '0'),
    difference: String(variance['Difference'] || '0'),
    percentDifference: String(variance['% Difference'] || '0'),
  };
}

// ============================================
// REPORT SAVER CLASS
// ============================================

/**
 * Type-safe report saver for persisting analysis results
 * 
 * @example
 * ```typescript
 * const saver = new ReportSaver();
 * const initResult = await saver.initialize();
 * 
 * if (initResult.success) {
 *   const saveResult = await saver.saveReport(
 *     results,
 *     config,
 *     'output.xlsx',
 *     180000,
 *     'completed'
 *   );
 *   
 *   if (saveResult.success) {
 *     console.log('Saved report:', saveResult.data);
 *   }
 * }
 * ```
 */
export class ReportSaver {
  private readonly dbManager: DatabaseManager;
  private readonly defaultKeepCount: number;
  private isInitialized: boolean = false;

  constructor(config?: ReportSaverConfig) {
    this.dbManager = config?.dbManager || new DatabaseManager();
    this.defaultKeepCount = config?.defaultKeepCount ?? 20;

    if (config?.autoInitialize) {
      this.initialize().catch((error) => {
        logger.error('Failed to auto-initialize ReportSaver', { error });
      });
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize database connection
   * 
   * @returns Result with void on success or error
   * 
   * @example
   * ```typescript
   * const result = await saver.initialize();
   * if (!result.success) {
   *   console.error('Initialization failed:', result.error.message);
   * }
   * ```
   */
  async initialize(): AsyncResult<void, ReportSaverError> {
    if (this.isInitialized) {
      return { success: true, data: undefined };
    }

    logger.info('Initializing ReportSaver...');

    const dbResult = await this.dbManager.initialize();

    if (!dbResult.success) {
      logger.error('Failed to initialize database', {
        error: dbResult.error.message,
      });

      return {
        success: false,
        error: new ReportSaverError(
          'Failed to initialize database',
          ReportSaverErrorCode.INITIALIZATION_FAILED,
          undefined,
          dbResult.error
        ),
      };
    }

    this.isInitialized = true;
    logger.info('ReportSaver initialized successfully');

    return { success: true, data: undefined };
  }

  /**
   * Check if saver is initialized
   */
  private assertInitialized(): Result<void, ReportSaverError> {
    if (!this.isInitialized) {
      return {
        success: false,
        error: new ReportSaverError(
          'ReportSaver not initialized. Call initialize() first.',
          ReportSaverErrorCode.INITIALIZATION_FAILED
        ),
      };
    }
    return { success: true, data: undefined };
  }

  // ============================================
  // SAVE OPERATIONS
  // ============================================

  /**
   * Save a complete analysis report to the database
   * 
   * @param results - Array of analysis results
   * @param config - Configuration used for analysis
   * @param outputFile - Path to generated Excel file
   * @param duration - Analysis duration in milliseconds
   * @param status - Report status
   * @returns Result with report ID on success or error
   * 
   * @example
   * ```typescript
   * const result = await saver.saveReport(
   *   results,
   *   config,
   *   'output.xlsx',
   *   180000,
   *   'completed'
   * );
   * 
   * if (result.success) {
   *   console.log('Report ID:', result.data);
   * }
   * ```
   */
  async saveReport(
    results: readonly AnalysisResult[],
    config: ConfigFile,
    outputFile: string,
    duration: number,
    status: ReportStatus = 'completed'
  ): AsyncResult<string, ReportSaverError> {
    // Check initialization
    const initCheck = this.assertInitialized();
    if (!initCheck.success) {
      return initCheck;
    }

    // Validate inputs
    const validationResult = this.validateSaveInputs(
      results,
      config,
      outputFile,
      duration
    );
    if (!validationResult.success) {
      return validationResult;
    }

    try {
      // Generate report ID
      const reportId = generateReportId();

      // Calculate totals
      const totalVariances = calculateTotalVariances(results);
      const totalValidationErrors = calculateTotalValidationErrors(results);

      // Prepare metadata
      const metadata = this.createReportMetadata(
        reportId,
        config,
        outputFile,
        results.length,
        totalVariances,
        totalValidationErrors,
        duration,
        status
      );

      // Prepare form details
      const formDetails = this.createFormDetails(results, reportId);

      // Prepare variance details
      const varianceDetails = this.createVarianceDetails(results, reportId);

      // Save to database
      logger.info(
        `Saving report ${reportId} to database with ${varianceDetails.length} variances`
      );

      const saveResult = await this.dbManager.saveReport(
        metadata,
        formDetails,
        varianceDetails
      );

      if (!saveResult.success) {
        return {
          success: false,
          error: new ReportSaverError(
            'Failed to save report to database',
            ReportSaverErrorCode.SAVE_FAILED,
            { reportId },
            saveResult.error
          ),
        };
      }

      logger.info(
        `Successfully saved report ${reportId} with ${varianceDetails.length} variances`
      );

      return { success: true, data: reportId };
    } catch (error) {
      logger.error('Unexpected error saving report', { error });

      return {
        success: false,
        error: new ReportSaverError(
          `Failed to save report: ${this.getErrorMessage(error)}`,
          ReportSaverErrorCode.SAVE_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  // ============================================
  // DATA PREPARATION
  // ============================================

  /**
   * Create report metadata
   */
  private createReportMetadata(
    reportId: string,
    config: ConfigFile,
    outputFile: string,
    totalReturns: number,
    totalVariances: number,
    totalValidationErrors: number,
    duration: number,
    status: ReportStatus
  ): ReportMetadata {
    return {
      id: reportId,
      timestamp: new Date().toISOString(),
      baseDate: config.baseDate,
      totalReturns,
      totalVariances,
      totalValidationErrors,
      configFile: 'config.json',
      outputFile: getFilename(outputFile || ''),
      duration,
      status,
    };
  }

  /**
   * Create form details from analysis results
   */
  private createFormDetails(
    results: readonly AnalysisResult[],
    reportId: string
  ): readonly FormDetail[] {
    return results.map((result) => resultToFormDetail(result, reportId));
  }

  /**
   * Create variance details from analysis results
   */
  private createVarianceDetails(
    results: readonly AnalysisResult[],
    reportId: string
  ): readonly VarianceDetail[] {
    const variances: VarianceDetail[] = [];

    for (const result of results) {
      for (const variance of result.variances) {
        variances.push(varianceToDetail(variance, result, reportId));
      }
    }

    return variances;
  }

  // ============================================
  // VALIDATION
  // ============================================

  /**
   * Validate save inputs
   */
  private validateSaveInputs(
    results: readonly AnalysisResult[],
    config: ConfigFile,
    outputFile: string,
    duration: number
  ): Result<void, ReportSaverError> {
    if (!results || results.length === 0) {
      return {
        success: false,
        error: new ReportSaverError(
          'No results provided for saving',
          ReportSaverErrorCode.INVALID_INPUT,
          { resultsLength: results?.length }
        ),
      };
    }

    if (!config || !config.baseDate) {
      return {
        success: false,
        error: new ReportSaverError(
          'Invalid configuration: missing baseDate',
          ReportSaverErrorCode.INVALID_INPUT,
          { config }
        ),
      };
    }

    if (!outputFile || outputFile.trim().length === 0) {
      return {
        success: false,
        error: new ReportSaverError(
          'Invalid output file path',
          ReportSaverErrorCode.INVALID_INPUT,
          { outputFile }
        ),
      };
    }

    if (duration < 0) {
      return {
        success: false,
        error: new ReportSaverError(
          'Invalid duration: must be non-negative',
          ReportSaverErrorCode.INVALID_INPUT,
          { duration }
        ),
      };
    }

    return { success: true, data: undefined };
  }

  // ============================================
  // CLEANUP OPERATIONS
  // ============================================

  /**
   * Clean up old reports, keeping only the most recent N reports
   * 
   * @param keepCount - Number of reports to keep (default: from config)
   * @returns Result with number of deleted reports or error
   * 
   * @example
   * ```typescript
   * const result = await saver.cleanupOldReports(20);
   * if (result.success) {
   *   console.log(`Deleted ${result.data} old reports`);
   * }
   * ```
   */
  async cleanupOldReports(
    keepCount?: number
  ): AsyncResult<number, ReportSaverError> {
    // Check initialization
    const initCheck = this.assertInitialized();
    if (!initCheck.success) {
      return initCheck;
    }

    const count = keepCount ?? this.defaultKeepCount;

    if (count < 0) {
      return {
        success: false,
        error: new ReportSaverError(
          'Invalid keep count: must be non-negative',
          ReportSaverErrorCode.INVALID_INPUT,
          { keepCount: count }
        ),
      };
    }

    try {
      logger.info(`Cleaning up old reports, keeping last ${count} reports`);

      // Get all reports
      const reportsResult = await this.dbManager.getReports();

      if (!reportsResult.success) {
        return {
          success: false,
          error: new ReportSaverError(
            'Failed to fetch reports for cleanup',
            ReportSaverErrorCode.CLEANUP_FAILED,
            undefined,
            reportsResult.error
          ),
        };
      }

      const reports = reportsResult.data;

      if (reports.length <= count) {
        logger.info(`No cleanup needed: ${reports.length} <= ${count}`);
        return { success: true, data: 0 };
      }

      // Sort by timestamp (newest first) and get reports to delete
      const sortedReports = [...reports].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const toDelete = sortedReports.slice(count);

      // Delete old reports
      let deletedCount = 0;
      const errors: DatabaseError[] = [];

      for (const report of toDelete) {
        const deleteResult = await this.dbManager.deleteReport(report.id);

        if (deleteResult.success) {
          deletedCount++;
        } else {
          logger.warn(`Failed to delete report ${report.id}`, {
            error: deleteResult.error.message,
          });
          errors.push(deleteResult.error);
        }
      }

      if (errors.length > 0) {
        logger.warn(
          `Cleanup completed with ${errors.length} errors: deleted ${deletedCount}/${toDelete.length} reports`
        );
      } else {
        logger.info(`Successfully cleaned up ${deletedCount} old reports`);
      }

      return { success: true, data: deletedCount };
    } catch (error) {
      logger.error('Unexpected error during cleanup', { error });

      return {
        success: false,
        error: new ReportSaverError(
          `Cleanup failed: ${this.getErrorMessage(error)}`,
          ReportSaverErrorCode.CLEANUP_FAILED,
          { keepCount: count },
          error
        ),
      };
    }
  }

  // ============================================
  // RESOURCE MANAGEMENT
  // ============================================

  /**
   * Close database connection
   * 
   * @returns Result with void on success or error
   * 
   * @example
   * ```typescript
   * await saver.close();
   * ```
   */
  async close(): AsyncResult<void, ReportSaverError> {
    if (!this.isInitialized) {
      return { success: true, data: undefined };
    }

    logger.info('Closing ReportSaver...');

    const closeResult = await this.dbManager.close();

    if (!closeResult.success) {
      return {
        success: false,
        error: new ReportSaverError(
          'Failed to close database connection',
          ReportSaverErrorCode.DATABASE_ERROR,
          undefined,
          closeResult.error
        ),
      };
    }

    this.isInitialized = false;
    logger.info('ReportSaver closed successfully');

    return { success: true, data: undefined };
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Extract error message from unknown error
   * 
   * @param error - Unknown error
   * @returns Error message
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred';
  }

  /**
   * Get database manager instance
   * 
   * @returns Database manager
   */
  getDatabaseManager(): DatabaseManager {
    return this.dbManager;
  }

  /**
   * Check if saver is initialized
   * 
   * @returns true if initialized
   */
  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get default keep count for cleanup
   * 
   * @returns Default keep count
   */
  getDefaultKeepCount(): number {
    return this.defaultKeepCount;
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create and initialize a ReportSaver instance
 * 
 * @param config - Optional configuration
 * @returns Result with initialized ReportSaver or error
 * 
 * @example
 * ```typescript
 * const result = await createReportSaver();
 * if (result.success) {
 *   const saver = result.data;
 *   // Use saver...
 * }
 * ```
 */
export async function createReportSaver(
  config?: ReportSaverConfig
): AsyncResult<ReportSaver, ReportSaverError> {
  const saver = new ReportSaver(config);
  const initResult = await saver.initialize();

  if (!initResult.success) {
    return {
      success: false,
      error: initResult.error,
    };
  }

  return { success: true, data: saver };
}

/**
 * Create a ReportSaver with default configuration
 * 
 * @returns Initialized ReportSaver
 * 
 * @example
 * ```typescript
 * const saver = await createDefaultReportSaver();
 * ```
 */
export async function createDefaultReportSaver(): Promise<ReportSaver> {
  const result = await createReportSaver({
    autoInitialize: true,
    defaultKeepCount: 20,
  });

  if (!result.success) {
    throw result.error;
  }

  return result.data;
}

// ============================================
// HELPER EXPORTS
// ============================================

/**
 * Calculate report statistics from analysis results
 * Pure function for testing and reuse
 * 
 * @param results - Array of analysis results
 * @returns Statistics object
 * 
 * @example
 * ```typescript
 * const stats = calculateReportStatistics(results);
 * console.log(stats.totalVariances);
 * ```
 */
export function calculateReportStatistics(
  results: readonly AnalysisResult[]
): {
  readonly totalVariances: number;
  readonly totalValidationErrors: number;
  readonly totalReturns: number;
} {
  return {
    totalVariances: calculateTotalVariances(results),
    totalValidationErrors: calculateTotalValidationErrors(results),
    totalReturns: results.length,
  };
}

/**
 * Validate report generation metadata
 * Pure function for validation
 * 
 * @param metadata - Report generation metadata
 * @returns Validation result
 */
export function validateReportMetadata(
  metadata: ReportGenerationMetadata
): Result<void, ReportSaverError> {
  if (!metadata.configFile || metadata.configFile.trim().length === 0) {
    return {
      success: false,
      error: new ReportSaverError(
        'Invalid config file path',
        ReportSaverErrorCode.INVALID_INPUT,
        { metadata }
      ),
    };
  }

  if (!metadata.outputFile || metadata.outputFile.trim().length === 0) {
    return {
      success: false,
      error: new ReportSaverError(
        'Invalid output file path',
        ReportSaverErrorCode.INVALID_INPUT,
        { metadata }
      ),
    };
  }

  if (metadata.duration < 0) {
    return {
      success: false,
      error: new ReportSaverError(
        'Invalid duration: must be non-negative',
        ReportSaverErrorCode.INVALID_INPUT,
        { metadata }
      ),
    };
  }

  const validStatuses: readonly ReportStatus[] = [
    'completed',
    'running',
    'failed',
  ];

  if (!validStatuses.includes(metadata.status)) {
    return {
      success: false,
      error: new ReportSaverError(
        'Invalid report status',
        ReportSaverErrorCode.INVALID_INPUT,
        { metadata, validStatuses }
      ),
    };
  }

  return { success: true, data: undefined };
}

// ============================================
// EXPORTS
// ============================================
export {
  getFilename,
  generateReportId,
  calculateTotalVariances,
  calculateTotalValidationErrors,
  resultToFormDetail,
  varianceToDetail,
};