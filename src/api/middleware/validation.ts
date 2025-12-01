/**
 * Request validation middleware using Zod
 * Validates request body, query, and params
 * 
 * @module api/middleware/validation
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { logger } from '../../logger.js';
import { createErrorResponse, HttpStatus, ErrorCode } from '../types/responses.js';

/**
 * Extended Request type with validated data
 */
export interface ValidatedRequest<
  TBody = any,
  TQuery = any,
  TParams = any
> extends Request {
  validatedBody?: TBody;
  validatedQuery?: TQuery;
  validatedParams?: TParams;
}

/**
 * Format Zod error for API response
 */
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

/**
 * Validate request body
 * 
 * @example
 * ```typescript
 * router.post('/reports',
 *   validateBody(ReportMetadataSchema),
 *   async (req: ValidatedRequest<ReportMetadata>, res) => {
 *     const data = req.validatedBody!;
 *     // Use validated data...
 *   }
 * );
 * ```
 */
export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: ValidatedRequest, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);

      if (!result.success) {
        logger.warn('Request body validation failed', {
          path: req.path,
          errors: result.error.issues,
        });

        res.status(HttpStatus.BAD_REQUEST).json(
          createErrorResponse(
            'Invalid request body',
            HttpStatus.BAD_REQUEST,
            ErrorCode.VALIDATION_ERROR,
            {
              errors: result.error.issues,
              message: formatZodError(result.error),
            }
          )
        );
        return;
      }

      req.validatedBody = result.data;
      next();
    } catch (error) {
      logger.error('Validation middleware error', { error });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        createErrorResponse(
          'Validation error',
          HttpStatus.INTERNAL_SERVER_ERROR,
          ErrorCode.INTERNAL_ERROR
        )
      );
    }
  };
}

/**
 * Validate request query parameters
 * 
 * @example
 * ```typescript
 * router.get('/reports',
 *   validateQuery(ReportFiltersSchema),
 *   async (req: ValidatedRequest<any, ReportFilters>, res) => {
 *     const filters = req.validatedQuery!;
 *     // Use validated filters...
 *   }
 * );
 * ```
 */
export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: ValidatedRequest, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.query);

      if (!result.success) {
        logger.warn('Request query validation failed', {
          path: req.path,
          errors: result.error.issues,
        });

        res.status(HttpStatus.BAD_REQUEST).json(
          createErrorResponse(
            'Invalid query parameters',
            HttpStatus.BAD_REQUEST,
            ErrorCode.VALIDATION_ERROR,
            {
              errors: result.error.issues,
              message: formatZodError(result.error),
            }
          )
        );
        return;
      }

      req.validatedQuery = result.data;
      next();
    } catch (error) {
      logger.error('Validation middleware error', { error });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        createErrorResponse(
          'Validation error',
          HttpStatus.INTERNAL_SERVER_ERROR,
          ErrorCode.INTERNAL_ERROR
        )
      );
    }
  };
}

/**
 * Validate request path parameters
 * 
 * @example
 * ```typescript
 * const IdParamsSchema = z.object({ id: z.string().uuid() });
 * 
 * router.get('/reports/:id',
 *   validateParams(IdParamsSchema),
 *   async (req: ValidatedRequest<any, any, { id: string }>, res) => {
 *     const { id } = req.validatedParams!;
 *     // Use validated id...
 *   }
 * );
 * ```
 */
export function validateParams<T extends z.ZodType>(schema: T) {
  return (req: ValidatedRequest, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.params);

      if (!result.success) {
        logger.warn('Request params validation failed', {
          path: req.path,
          errors: result.error.issues,
        });

        res.status(HttpStatus.BAD_REQUEST).json(
          createErrorResponse(
            'Invalid path parameters',
            HttpStatus.BAD_REQUEST,
            ErrorCode.VALIDATION_ERROR,
            {
              errors: result.error.issues,
              message: formatZodError(result.error),
            }
          )
        );
        return;
      }

      req.validatedParams = result.data;
      next();
    } catch (error) {
      logger.error('Validation middleware error', { error });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        createErrorResponse(
          'Validation error',
          HttpStatus.INTERNAL_SERVER_ERROR,
          ErrorCode.INTERNAL_ERROR
        )
      );
    }
  };
}

/**
 * Validate multiple parts of the request at once
 * 
 * @example
 * ```typescript
 * router.post('/reports/:id',
 *   validateRequest({
 *     params: IdParamsSchema,
 *     body: ReportMetadataSchema,
 *     query: ReportFiltersSchema,
 *   }),
 *   async (req: ValidatedRequest, res) => {
 *     // All parts validated
 *   }
 * );
 * ```
 */
export function validateRequest<
  TBody extends z.ZodType = z.ZodType<any>,
  TQuery extends z.ZodType = z.ZodType<any>,
  TParams extends z.ZodType = z.ZodType<any>
>(schemas: {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
}) {
  return (req: ValidatedRequest, res: Response, next: NextFunction): void => {
    try {
      const errors: string[] = [];

      // Validate body
      if (schemas.body) {
        const bodyResult = schemas.body.safeParse(req.body);
        if (!bodyResult.success) {
          errors.push(`Body: ${formatZodError(bodyResult.error)}`);
        } else {
          req.validatedBody = bodyResult.data;
        }
      }

      // Validate query
      if (schemas.query) {
        const queryResult = schemas.query.safeParse(req.query);
        if (!queryResult.success) {
          errors.push(`Query: ${formatZodError(queryResult.error)}`);
        } else {
          req.validatedQuery = queryResult.data;
        }
      }

      // Validate params
      if (schemas.params) {
        const paramsResult = schemas.params.safeParse(req.params);
        if (!paramsResult.success) {
          errors.push(`Params: ${formatZodError(paramsResult.error)}`);
        } else {
          req.validatedParams = paramsResult.data;
        }
      }

      if (errors.length > 0) {
        logger.warn('Request validation failed', {
          path: req.path,
          errors,
        });

        res.status(HttpStatus.BAD_REQUEST).json(
          createErrorResponse(
            'Validation failed',
            HttpStatus.BAD_REQUEST,
            ErrorCode.VALIDATION_ERROR,
            { errors }
          )
        );
        return;
      }

      next();
    } catch (error) {
      logger.error('Validation middleware error', { error });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
        createErrorResponse(
          'Validation error',
          HttpStatus.INTERNAL_SERVER_ERROR,
          ErrorCode.INTERNAL_ERROR
        )
      );
    }
  };
}

/**
 * Common validation schemas
 */
export const CommonSchemas = {
  /**
   * UUID parameter
   */
  uuid: z.object({
    id: z.string().uuid('Invalid UUID format'),
  }),

  /**
   * Pagination query parameters
   */
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  }),

  /**
   * Sort query parameters
   */
  sort: z.object({
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  /**
   * Date range query parameters
   */
  dateRange: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
};