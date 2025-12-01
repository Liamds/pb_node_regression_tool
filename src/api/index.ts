/**
 * API module index
 * Central export point for the entire API layer
 * 
 * @module api
 */

// Routes
export * from './routes/index.js';

// Handlers
export * from './handlers/index.js';

// Middleware
export {
  validateBody,
  validateQuery,
  validateParams,
  validateRequest,
  ValidatedRequest,
  CommonSchemas,
} from './middleware/validation.js';

// Types
export {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  ApiPaginatedResponse,
  PaginationMeta,
  createSuccessResponse,
  createErrorResponse,
  createPaginatedResponse,
  HttpStatus,
  ErrorCode,
} from './types/responses.js';