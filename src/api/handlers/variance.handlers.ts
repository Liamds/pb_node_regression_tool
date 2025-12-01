/**
 * API handlers for variance operations
 * Pure functions that can be used in Express or Next.js
 * 
 * @module api/handlers/variance
 */

import type {
  VarianceWithAnnotation,
  VarianceAnnotation,
  AsyncResult,
} from '../../types/index.js';
import { VarianceService, VarianceServiceError } from '../../services/VarianceService.js';

/**
 * API handler error
 */
export class ApiHandlerError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ApiHandlerError';
  }
}

/**
 * Convert service error to API error
 */
function toApiError(error: VarianceServiceError): ApiHandlerError {
  const statusCode = error.code === 'INVALID_INPUT' ? 400 : 500;
  return new ApiHandlerError(error.message, statusCode, error);
}

/**
 * Get variances for a report/form
 */
export async function handleGetVariances(
  service: VarianceService,
  reportId: string,
  formCode?: string
): AsyncResult<readonly VarianceWithAnnotation[], ApiHandlerError> {
  const result = await service.getVariances(reportId, formCode);

  if (!result.success) {
    return {
      success: false,
      error: toApiError(result.error),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Update variance annotation
 */
export async function handleUpdateAnnotation(
  service: VarianceService,
  annotation: VarianceAnnotation
): AsyncResult<void, ApiHandlerError> {
  const result = await service.updateAnnotation(annotation);

  if (!result.success) {
    return {
      success: false,
      error: toApiError(result.error),
    };
  }

  return { success: true, data: undefined };
}