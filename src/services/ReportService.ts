/**
 * Report business logic service
 * Pure business logic, no HTTP concerns
 * 
 * @module services/ReportService
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
import { ReportRepository } from '../repositories/ReportRepository.js';
import { logger } from '../logger.js';

/**
 * Service error codes
 */
export enum ReportServiceErrorCode {
  REPOSITORY_ERROR = 'REPOSITORY_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
}

/**
 * Service error class
 */
export class ReportServiceError extends Error {
  constructor(
    message: string,
    public readonly code: ReportServiceErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ReportServiceError';
  }
}

/**
 * Report details with forms
 */
export interface ReportWithDetails {
  readonly metadata: ReportMetadata;
  readonly forms: readonly FormDetail[];
}

/**
 * Report service
 * 
 * Handles business logic for report operations
 * 
 * @example
 * ```typescript
 * const service = new ReportService(reportRepo);
 * const result = await service.getReports();
 * if (result.success) {
 *   console.log(result.data);
 * }
 * ```
 */
export class ReportService {
  constructor(private readonly reportRepo: ReportRepository) {}

  /**
   * Get all reports with optional filters
   */
  async getReports(
    filters?: ReportFilters
  ): AsyncResult<readonly ReportMetadata[], ReportServiceError> {
    logger.debug('Service: Getting reports', { filters });

    const result = await this.reportRepo.findAll(filters);

    if (!result.success) {
      return {
        success: false,
        error: new ReportServiceError(
          'Failed to get reports',
          ReportServiceErrorCode.REPOSITORY_ERROR,
          result.error
        ),
      };
    }

    return { success: true, data: result.data };
  }

  /**
   * Get report by ID
   */
  async getReportById(
    id: string
  ): AsyncResult<ReportMetadata, ReportServiceError> {
    if (!id || id.trim().length === 0) {
      return {
        success: false,
        error: new ReportServiceError(
          'Report ID is required',
          ReportServiceErrorCode.INVALID_INPUT
        ),
      };
    }

    logger.debug('Service: Getting report by ID', { id });

    const result = await this.reportRepo.findById(id);

    if (!result.success) {
      const code = result.error.code === 'NOT_FOUND'
        ? ReportServiceErrorCode.NOT_FOUND
        : ReportServiceErrorCode.REPOSITORY_ERROR;

      return {
        success: false,
        error: new ReportServiceError(
          result.error.message,
          code,
          result.error
        ),
      };
    }

    return { success: true, data: result.data };
  }

  /**
   * Get report with details (metadata + forms)
   */
  async getReportWithDetails(
    id: string
  ): AsyncResult<ReportWithDetails, ReportServiceError> {
    logger.debug('Service: Getting report with details', { id });

    // Get metadata
    const metadataResult = await this.getReportById(id);
    if (!metadataResult.success) {
      return metadataResult;
    }

    // Get form details
    const formsResult = await this.reportRepo.findFormDetails(id);
    if (!formsResult.success) {
      return {
        success: false,
        error: new ReportServiceError(
          'Failed to get form details',
          ReportServiceErrorCode.REPOSITORY_ERROR,
          formsResult.error
        ),
      };
    }

    return {
      success: true,
      data: {
        metadata: metadataResult.data,
        forms: formsResult.data,
      },
    };
  }

  /**
   * Save new report
   */
  async saveReport(
    metadata: ReportMetadata,
    formDetails: readonly FormDetail[],
    variances: readonly VarianceDetail[]
  ): AsyncResult<void, ReportServiceError> {
    logger.info('Service: Saving report', { reportId: metadata.id });

    const result = await this.reportRepo.save(metadata, formDetails, variances);

    if (!result.success) {
      return {
        success: false,
        error: new ReportServiceError(
          'Failed to save report',
          ReportServiceErrorCode.REPOSITORY_ERROR,
          result.error
        ),
      };
    }

    return { success: true, data: undefined };
  }

  /**
   * Delete report
   */
  async deleteReport(id: string): AsyncResult<void, ReportServiceError> {
    if (!id || id.trim().length === 0) {
      return {
        success: false,
        error: new ReportServiceError(
          'Report ID is required',
          ReportServiceErrorCode.INVALID_INPUT
        ),
      };
    }

    logger.info('Service: Deleting report', { id });

    const result = await this.reportRepo.delete(id);

    if (!result.success) {
      return {
        success: false,
        error: new ReportServiceError(
          'Failed to delete report',
          ReportServiceErrorCode.REPOSITORY_ERROR,
          result.error
        ),
      };
    }

    return { success: true, data: undefined };
  }

  /**
   * Get statistics
   */
  async getStatistics(
    filters?: ReportFilters
  ): AsyncResult<Statistics, ReportServiceError> {
    logger.debug('Service: Getting statistics', { filters });

    const result = await this.reportRepo.getStatistics(filters);

    if (!result.success) {
      return {
        success: false,
        error: new ReportServiceError(
          'Failed to get statistics',
          ReportServiceErrorCode.REPOSITORY_ERROR,
          result.error
        ),
      };
    }

    return { success: true, data: result.data };
  }

  /**
   * Get filter options (base dates and form codes)
   */
  async getFilterOptions(): AsyncResult<
    {
      readonly baseDates: readonly string[];
      readonly formCodes: readonly FormCodeWithName[];
    },
    ReportServiceError
  > {
    logger.debug('Service: Getting filter options');

    const [baseDatesResult, formCodesResult] = await Promise.all([
      this.reportRepo.getBaseDates(),
      this.reportRepo.getFormCodes(),
    ]);

    if (!baseDatesResult.success) {
      return {
        success: false,
        error: new ReportServiceError(
          'Failed to get base dates',
          ReportServiceErrorCode.REPOSITORY_ERROR,
          baseDatesResult.error
        ),
      };
    }

    if (!formCodesResult.success) {
      return {
        success: false,
        error: new ReportServiceError(
          'Failed to get form codes',
          ReportServiceErrorCode.REPOSITORY_ERROR,
          formCodesResult.error
        ),
      };
    }

    return {
      success: true,
      data: {
        baseDates: baseDatesResult.data,
        formCodes: formCodesResult.data,
      },
    };
  }
}