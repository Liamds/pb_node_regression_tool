/**
 * Repository for variance data access
 * Abstracts database operations for variances and annotations
 * 
 * @module repositories/VarianceRepository
 */

import type {
  VarianceWithAnnotation,
  VarianceAnnotation,
  AsyncResult,
} from '../types/index.js';
import { DatabaseManager } from '../db-manager.js';
import { logger } from '../logger.js';

/**
 * Variance repository error codes
 */
export enum VarianceRepositoryErrorCode {
  DB_ERROR = 'DB_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

/**
 * Variance repository error class
 */
export class VarianceRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: VarianceRepositoryErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'VarianceRepositoryError';
  }
}

/**
 * Variance data repository
 * 
 * Provides type-safe data access for variances and annotations
 */
export class VarianceRepository {
  constructor(private readonly db: DatabaseManager) {}

  /**
   * Find variances for a report/form
   */
  async findByReport(
    reportId: string,
    formCode?: string
  ): AsyncResult<readonly VarianceWithAnnotation[], VarianceRepositoryError> {
    try {
      const result = await this.db.getVariances(reportId, formCode);

      if (!result.success) {
        return {
          success: false,
          error: new VarianceRepositoryError(
            'Failed to fetch variances',
            VarianceRepositoryErrorCode.DB_ERROR,
            result.error
          ),
        };
      }

      return { success: true, data: result.data };
    } catch (error) {
      logger.error('Repository: Failed to find variances', { error, reportId, formCode });
      return {
        success: false,
        error: new VarianceRepositoryError(
          'Unexpected error fetching variances',
          VarianceRepositoryErrorCode.DB_ERROR,
          error
        ),
      };
    }
  }

  /**
   * Update variance annotation
   */
  async updateAnnotation(
    annotation: VarianceAnnotation
  ): AsyncResult<void, VarianceRepositoryError> {
    try {
      const result = await this.db.updateVarianceAnnotation(annotation);

      if (!result.success) {
        return {
          success: false,
          error: new VarianceRepositoryError(
            'Failed to update annotation',
            VarianceRepositoryErrorCode.DB_ERROR,
            result.error
          ),
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Repository: Failed to update annotation', { error, annotation });
      return {
        success: false,
        error: new VarianceRepositoryError(
          'Unexpected error updating annotation',
          VarianceRepositoryErrorCode.DB_ERROR,
          error
        ),
      };
    }
  }
}