/**
 * Runtime validation schemas using Zod
 * Ensures type safety at runtime, especially for API responses and user input
 */

import { z } from 'zod';
import type {
  ConfigFile,
  ReturnConfig,
  FormInstance,
  ValidationResult,
  ReportMetadata,
  VarianceAnnotation,
  AnalysisRequest,
  ReportFilters,
} from '../types/index.js';

// ============================================
// CONFIGURATION SCHEMAS
// ============================================

/**
 * Return configuration schema
 */
export const ReturnConfigSchema = z.object({
  code: z.string().min(1, 'Form code is required'),
  name: z.string().min(1, 'Form name is required'),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  confirmed: z.boolean().optional().default(false),
}) satisfies z.ZodType<ReturnConfig>;

/**
 * Configuration file schema
 */
export const ConfigFileSchema = z.object({
  baseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Base date must be in YYYY-MM-DD format'),
  returns: z.array(ReturnConfigSchema).min(1, 'At least one return must be configured'),
  excluded: z.array(ReturnConfigSchema).optional().default([]),
}) satisfies z.ZodType<ConfigFile>;

// ============================================
// API RESPONSE SCHEMAS
// ============================================

/**
 * Form instance schema
 */
export const FormInstanceSchema = z.object({
  instanceId: z.string(),
  refDate: z.string(),
}) satisfies z.ZodType<FormInstance>;

/**
 * Validation cells schema
 */
export const ValidationCellsSchema = z.object({
  cell: z.string(),
  value: z.string(),
  instanceId: z.string(),
  pageName: z.string(),
  form: z.string(),
  referenceDate: z.string(),
});

/**
 * Validation result schema
 */
export const ValidationResultSchema = z.object({
  severity: z.string(),
  expression: z.string(),
  status: z.string(),
  message: z.string().nullable(),
  referencedCells: z.array(ValidationCellsSchema),
}) satisfies z.ZodType<ValidationResult>;

// ============================================
// DATABASE SCHEMAS
// ============================================

/**
 * Report status schema
 */
export const ReportStatusSchema = z.enum(['completed', 'running', 'failed']);

/**
 * Report metadata schema
 */
export const ReportMetadataSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  baseDate: z.string(),
  totalReturns: z.number().int().nonnegative(),
  totalVariances: z.number().int().nonnegative(),
  totalValidationErrors: z.number().int().nonnegative(),
  configFile: z.string(),
  outputFile: z.string(),
  duration: z.number().int().nonnegative(),
  status: ReportStatusSchema,
  createdAt: z.string().optional(),
}) satisfies z.ZodType<ReportMetadata>;

/**
 * Variance category schema
 */
export const VarianceCategorySchema = z.enum([
  'expected',
  'unexpected',
  'resolved',
  'investigating',
]).nullable();

/**
 * Variance annotation schema
 */
export const VarianceAnnotationSchema = z.object({
  id: z.number().int().optional(),
  reportId: z.string(),
  formCode: z.string(),
  cellReference: z.string(),
  flagged: z.boolean(),
  category: VarianceCategorySchema,
  comment: z.string().nullable(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}) satisfies z.ZodType<VarianceAnnotation>;

// ============================================
// API REQUEST SCHEMAS
// ============================================

/**
 * Analysis request schema
 */
export const AnalysisRequestSchema = z.object({
  configFile: z.string().min(1, 'Configuration file path is required'),
  outputFile: z.string().optional(),
}) satisfies z.ZodType<AnalysisRequest>;

/**
 * Report filters schema
 */
export const ReportFiltersSchema = z.object({
  status: ReportStatusSchema.optional(),
  baseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  formCode: z.string().optional(),
}) satisfies z.ZodType<ReportFilters>;

/**
 * Variance annotation update schema (for API requests)
 */
export const VarianceAnnotationUpdateSchema = z.object({
  formCode: z.string().min(1),
  cellReference: z.string().min(1),
  flagged: z.boolean().optional(),
  category: VarianceCategorySchema.optional(),
  comment: z.string().nullable().optional(),
});

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate and parse configuration file
 * @param data - Raw configuration data
 * @returns Validated configuration
 * @throws ZodError if validation fails
 */
export function validateConfigFile(data: unknown): ConfigFile {
  return ConfigFileSchema.parse(data);
}

/**
 * Safe validation that returns Result type
 * @param data - Raw configuration data
 * @returns Result with validated config or error
 */
export function safeValidateConfigFile(
  data: unknown
): { success: true; data: ConfigFile } | { success: false; error: z.ZodError } {
  const result = ConfigFileSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate form instances array
 * @param data - Raw form instances data
 * @returns Validated form instances
 */
export function validateFormInstances(data: unknown): FormInstance[] {
  return z.array(FormInstanceSchema).parse(data);
}

/**
 * Validate validation results array
 * @param data - Raw validation results data
 * @returns Validated validation results
 */
export function validateValidationResults(data: unknown): ValidationResult[] {
  return z.array(ValidationResultSchema).parse(data);
}

/**
 * Validate report metadata
 * @param data - Raw report metadata
 * @returns Validated report metadata
 */
export function validateReportMetadata(data: unknown): ReportMetadata {
  return ReportMetadataSchema.parse(data);
}

/**
 * Validate variance annotation
 * @param data - Raw variance annotation
 * @returns Validated variance annotation
 */
export function validateVarianceAnnotation(data: unknown): VarianceAnnotation {
  return VarianceAnnotationSchema.parse(data);
}

/**
 * Validate analysis request
 * @param data - Raw analysis request
 * @returns Validated analysis request
 */
export function validateAnalysisRequest(data: unknown): AnalysisRequest {
  return AnalysisRequestSchema.parse(data);
}

/**
 * Validate report filters
 * @param data - Raw report filters
 * @returns Validated report filters
 */
export function validateReportFilters(data: unknown): ReportFilters {
  return ReportFiltersSchema.parse(data);
}

// ============================================
// ENVIRONMENT VALIDATION
// ============================================

/**
 * Environment variables schema
 */
export const EnvSchema = z.object({
  AUTH_URL: z.string().url('AUTH_URL must be a valid URL'),
  API_BASE_URL: z.string().url('API_BASE_URL must be a valid URL'),
  APRA_USERNAME: z.string().min(1, 'APRA_USERNAME is required'),
  PASSWORD: z.string().min(1, 'PASSWORD is required'),
  GRANT_TYPE: z.string().min(1, 'GRANT_TYPE is required'),
  CLIENT_ID: z.string().min(1, 'CLIENT_ID is required'),
  CLIENT_SECRET: z.string().min(1, 'CLIENT_SECRET is required'),
  EXCEL_AUTHOR: z.string().optional(),
  EXCEL_TITLE: z.string().optional(),
  EXCEL_CATEGORY: z.string().optional(),
});

/**
 * Validate environment variables
 * @param env - Process environment
 * @returns Validated environment
 * @throws ZodError if validation fails
 */
export function validateEnv(env: NodeJS.ProcessEnv): z.infer<typeof EnvSchema> {
  return EnvSchema.parse(env);
}

/**
 * Safe environment validation
 * @param env - Process environment
 * @returns Result with validated env or error
 */
export function safeValidateEnv(
  env: NodeJS.ProcessEnv
): 
  | { success: true; data: z.infer<typeof EnvSchema> }
  | { success: false; error: z.ZodError } {
  const result = EnvSchema.safeParse(env);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// ============================================
// ERROR FORMATTING
// ============================================

/**
 * Format Zod error for user-friendly display
 * @param error - Zod validation error
 * @returns Formatted error message
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((err) => {
      const path = err.path.join('.');
      return `${path ? `${path}: ` : ''}${err.message}`;
    })
    .join('\n');
}

/**
 * Extract first error message from Zod error
 * @param error - Zod validation error
 * @returns First error message
 */
export function getFirstZodError(error: z.ZodError): string {
  const firstError = error.issues[0];
  if (!firstError) {
    return 'Validation failed';
  }
  const path = firstError.path.join('.');
  return `${path ? `${path}: ` : ''}${firstError.message}`;
}