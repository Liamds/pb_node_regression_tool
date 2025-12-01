/**
 * Standard API response types
 * Ensures consistent response format across all endpoints
 * 
 * @module api/types/responses
 */

/**
 * Successful API response
 */
export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly data: T;
  readonly timestamp?: string;
}

/**
 * Error API response
 */
export interface ApiErrorResponse {
  readonly success: false;
  readonly error: string;
  readonly code?: string;
  readonly statusCode?: number;
  readonly timestamp?: string;
  readonly details?: unknown;
}

/**
 * Union type for all API responses
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Paginated response metadata
 */
export interface PaginationMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPrevPage: boolean;
}

/**
 * Paginated API response
 */
export interface ApiPaginatedResponse<T> {
  readonly success: true;
  readonly data: readonly T[];
  readonly pagination: PaginationMeta;
  readonly timestamp?: string;
}

/**
 * Create a successful response
 */
export function createSuccessResponse<T>(
  data: T,
  includeTimestamp: boolean = true
): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    ...(includeTimestamp && { timestamp: new Date().toISOString() }),
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(
  error: string,
  statusCode?: number,
  code?: string,
  details?: unknown,
  includeTimestamp: boolean = true
): ApiErrorResponse {
  return {
    success: false,
    error,
    ...(statusCode && { statusCode }),
    ...(code && { code }),
    ...(details !== undefined && { details }),
    ...(includeTimestamp && { timestamp: new Date().toISOString() }),
  };
}

/**
 * Create a paginated response
 */
export function createPaginatedResponse<T>(
  data: readonly T[],
  page: number,
  pageSize: number,
  totalItems: number,
  includeTimestamp: boolean = true
): ApiPaginatedResponse<T> {
  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    success: true,
    data,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
    ...(includeTimestamp && { timestamp: new Date().toISOString() }),
  };
}

/**
 * HTTP status codes enum
 */
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

/**
 * Common error codes
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}