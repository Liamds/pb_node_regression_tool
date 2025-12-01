/**
 * Repository for report data access
 * Abstracts database operations for reports
 * 
 * @module repositories/ReportRepository
 */

import type {
  ReportMetadata,
  FormDetail,
  VarianceDetail,
  ReportFilters,
  Statistics,
  FormCodeWithName,
  AsyncResult,
} from '../types/index.js';
import { DatabaseManager } from '../db-manager.js';
import { logger } from '../logger.js';

/**
 * Repository error codes
 */
export enum ReportRepositoryErrorCode {
  DB_ERROR = 'DB_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

/**
 * Repository error class
 */
export class ReportRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: ReportRepositoryErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ReportRepositoryError';
  }
}

/**
 * Report data repository
 * 
 * Provides type-safe data access for reports
 * 
 * @example
 * ```typescript
 * const repo = new ReportRepository(dbManager);
 * const result = await repo.findAll();
 * if (result.success) {
 *   console.log(result.data);
 * }
 * ```
 */
export class ReportRepository {
  constructor(private readonly db: DatabaseManager) {}

  /**
   * Find all reports with optional filters
   */
  async findAll(
    filters?: ReportFilters
  ): AsyncResult<readonly ReportMetadata[], ReportRepositoryError> {
    try {
      const result = await this.db.getReports(filters);

      if (!result.success) {
        return {
          success: false,
          error: new ReportRepositoryError(
            'Failed to fetch reports',
            ReportRepositoryErrorCode.DB_ERROR,
            result.error
          ),
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      logger.error('Repository: Failed to find reports', { error });
      return {
        success: false,
        error: new ReportRepositoryError(
          'Unexpected error fetching reports',
          ReportRepositoryErrorCode.DB_ERROR,
          error
        ),
      };
    }
  }

  /**
   * Find report by ID
   */
  async findById(
    id: string
  ): AsyncResult<ReportMetadata, ReportRepositoryError> {
    try {
      const result = await this.db.getReport(id);

      if (!result.success) {
        const code = result.error.code === 'NOT_FOUND'
          ? ReportRepositoryErrorCode.NOT_FOUND
          : ReportRepositoryErrorCode.DB_ERROR;

        return {
          success: false,
          error: new ReportRepositoryError(
            result.error.message,
            code,
            result.error
          ),
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      logger.error('Repository: Failed to find report', { error, id });
      return {
        success: false,
        error: new ReportRepositoryError(
          'Unexpected error fetching report',
          ReportRepositoryErrorCode.DB_ERROR,
          error
        ),
      };
    }
  }

  /**
   * Find form details for a report
   */
  async findFormDetails(
    reportId: string
  ): AsyncResult<readonly FormDetail[], ReportRepositoryError> {
    try {
      const result = await this.db.getFormDetails(reportId);

      if (!result.success) {
        return {
          success: false,
          error: new ReportRepositoryError(
            'Failed to fetch form details',
            ReportRepositoryErrorCode.DB_ERROR,
            result.error
          ),
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      logger.error('Repository: Failed to find form details', { error, reportId });
      return {
        success: false,
        error: new ReportRepositoryError(
          'Unexpected error fetching form details',
          ReportRepositoryErrorCode.DB_ERROR,
          error
        ),
      };
    }
  }

  /**
   * Save complete report
   */
  async save(
    metadata: ReportMetadata,
    formDetails: readonly FormDetail[],
    variances: readonly VarianceDetail[]
  ): AsyncResult<void, ReportRepositoryError> {
    try {
      const result = await this.db.saveReport(metadata, formDetails, variances);

      if (!result.success) {
        return {
          success: false,
          error: new ReportRepositoryError(
            'Failed to save report',
            ReportRepositoryErrorCode.DB_ERROR,
            result.error
          ),
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Repository: Failed to save report', { error });
      return {
        success: false,
        error: new ReportRepositoryError(
          'Unexpected error saving report',
          ReportRepositoryErrorCode.DB_ERROR,
          error
        ),
      };
    }
  }

  /**
   * Delete report
   */
  async delete(id: string): AsyncResult<void, ReportRepositoryError> {
    try {
      const result = await this.db.deleteReport(id);

      if (!result.success) {
        return {
          success: false,
          error: new ReportRepositoryError(
            'Failed to delete report',
            ReportRepositoryErrorCode.DB_ERROR,
            result.error
          ),
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Repository: Failed to delete report', { error, id });
      return {
        success: false,
        error: new ReportRepositoryError(
          'Unexpected error deleting report',
          ReportRepositoryErrorCode.DB_ERROR,
          error
        ),
      };
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(
    filters?: ReportFilters
  ): AsyncResult<Statistics, ReportRepositoryError> {
    try {
      const result = await this.db.getStatistics(filters);

      if (!result.success) {
        return {
          success: false,
          error: new ReportRepositoryError(
            'Failed to get statistics',
            ReportRepositoryErrorCode.DB_ERROR,
            result.error
          ),
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      logger.error('Repository: Failed to get statistics', { error });
      return {
        success: false,
        error: new ReportRepositoryError(
          'Unexpected error getting statistics',
          ReportRepositoryErrorCode.DB_ERROR,
          error
        ),
      };
    }
  }

  /**
   * Get unique base dates
   */
  async getBaseDates(): AsyncResult<readonly string[], ReportRepositoryError> {
    try {
      const result = await this.db.getBaseDates();

      if (!result.success) {
        return {
          success: false,
          error: new ReportRepositoryError(
            'Failed to get base dates',
            ReportRepositoryErrorCode.DB_ERROR,
            result.error
          ),
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      logger.error('Repository: Failed to get base dates', { error });
      return {
        success: false,
        error: new ReportRepositoryError(
          'Unexpected error getting base dates',
          ReportRepositoryErrorCode.DB_ERROR,
          error
        ),
      };
    }
  }

  /**
   * Get form codes with names
   */
  async getFormCodes(): AsyncResult<readonly FormCodeWithName[], ReportRepositoryError> {
    try {
      const result = await this.db.getFormCodes();

      if (!result.success) {
        return {
          success: false,
          error: new ReportRepositoryError(
            'Failed to get form codes',
            ReportRepositoryErrorCode.DB_ERROR,
            result.error
          ),
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      logger.error('Repository: Failed to get form codes', { error });
      return {
        success: false,
        error: new ReportRepositoryError(
          'Unexpected error getting form codes',
          ReportRepositoryErrorCode.DB_ERROR,
          error
        ),
      };
    }
  }
}