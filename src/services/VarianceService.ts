/**
 * Variance business logic service
 * Pure business logic for variances and annotations
 * 
 * @module services/VarianceService
 */

import type {
  VarianceWithAnnotation,
  VarianceAnnotation,
  AsyncResult,
} from '../types/index.js';
import { VarianceRepository } from '../repositories/VarianceRepository.js';
import { logger } from '../logger.js';

/**
 * Service error codes
 */
export enum VarianceServiceErrorCode {
  REPOSITORY_ERROR = 'REPOSITORY_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
}

/**
 * Service error class
 */
export class VarianceServiceError extends Error {
  constructor(
    message: string,
    public readonly code: VarianceServiceErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'VarianceServiceError';
  }
}

/**
 * Variance service
 * 
 * Handles business logic for variance operations
 */
export class VarianceService {
  constructor(private readonly varianceRepo: VarianceRepository) {}

  /**
   * Get variances for a report/form
   */
  async getVariances(
    reportId: string,
    formCode?: string
  ): AsyncResult<readonly VarianceWithAnnotation[], VarianceServiceError> {
    if (!reportId || reportId.trim().length === 0) {
      return {
        success: false,
        error: new VarianceServiceError(
          'Report ID is required',
          VarianceServiceErrorCode.INVALID_INPUT
        ),
      };
    }

    logger.debug('Service: Getting variances', { reportId, formCode });

    const result = await this.varianceRepo.findByReport(reportId, formCode);

    if (!result.success) {
      return {
        success: false,
        error: new VarianceServiceError(
          'Failed to get variances',
          VarianceServiceErrorCode.REPOSITORY_ERROR,
          result.error
        ),
      };
    }

    return { success: true, data: result.data };
  }

  /**
   * Update variance annotation
   */
  async updateAnnotation(
    annotation: VarianceAnnotation
  ): AsyncResult<void, VarianceServiceError> {
    // Validate input
    if (!annotation.reportId || !annotation.formCode || !annotation.cellReference) {
      return {
        success: false,
        error: new VarianceServiceError(
          'Missing required annotation fields',
          VarianceServiceErrorCode.INVALID_INPUT
        ),
      };
    }

    logger.debug('Service: Updating annotation', { annotation });

    const result = await this.varianceRepo.updateAnnotation(annotation);

    if (!result.success) {
      return {
        success: false,
        error: new VarianceServiceError(
          'Failed to update annotation',
          VarianceServiceErrorCode.REPOSITORY_ERROR,
          result.error
        ),
      };
    }

    return { success: true, data: undefined };
  }
}