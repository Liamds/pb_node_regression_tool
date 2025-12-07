/**
 * API handlers for report operations
 * Pure functions that can be used in Express or Next.js
 * 
 * @module api/handlers/report
 */

import type {
  ReportMetadata,
  ReportFilters,
  Statistics,
  FormCodeWithName,
  AsyncResult,
} from '../../types/index.js';
import { ReportService, ReportServiceError } from '../../services/ReportService.js';
import type { ReportWithDetails } from '../../services/ReportService.js';

/**
 * API handler error
 */
export class ApiHandlerError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ApiHandlerError';
  }
}

/**
 * Convert service error to API error
 */
function toApiError(error: ReportServiceError): ApiHandlerError {
  const statusCode = error.code === 'NOT_FOUND' ? 404 : 500;
  return new ApiHandlerError(error.message, statusCode, error);
}

/**
 * Get all reports
 */
export async function handleGetReports(
  service: ReportService,
  filters?: ReportFilters
): AsyncResult<readonly ReportMetadata[], ApiHandlerError> {
  const result = await service.getReports(filters);

  if (!result.success) {
    return {
      success: false,
      error: toApiError(result.error),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Get report by ID
 */
export async function handleGetReportById(
  service: ReportService,
  id: string
): AsyncResult<ReportMetadata, ApiHandlerError> {
  const result = await service.getReportById(id);

  if (!result.success) {
    return {
      success: false,
      error: toApiError(result.error),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Get report with details
 */
export async function handleGetReportDetails(
  service: ReportService,
  id: string
): AsyncResult<ReportWithDetails, ApiHandlerError> {
  const result = await service.getReportWithDetails(id);

  if (!result.success) {
    return {
      success: false,
      error: toApiError(result.error),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Delete report
 */
export async function handleDeleteReport(
  service: ReportService,
  id: string
): AsyncResult<void, ApiHandlerError> {
  const result = await service.deleteReport(id);

  if (!result.success) {
    return {
      success: false,
      error: toApiError(result.error),
    };
  }

  return { success: true, data: undefined };
}

/**
 * Get statistics
 */
export async function handleGetStatistics(
  service: ReportService,
  filters?: ReportFilters
): AsyncResult<Statistics, ApiHandlerError> {
  const result = await service.getStatistics(filters);

  if (!result.success) {
    return {
      success: false,
      error: toApiError(result.error),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Get filter options
 */
export async function handleGetFilterOptions(
  service: ReportService
): AsyncResult<
  {
    readonly baseDates: readonly string[];
    readonly formCodes: readonly FormCodeWithName[];
  },
  ApiHandlerError
> {
  const result = await service.getFilterOptions();

  if (!result.success) {
    return {
      success: false,
      error: toApiError(result.error),
    };
  }

  return { success: true, data: result.data };
}