/**
 * Type-safe data processing utilities for variance analysis
 * 
 * Features:
 * - Strict TypeScript typing throughout
 * - Result<T, E> pattern for error handling
 * - Pure functions with no side effects
 * - Comprehensive validation
 * - Immutable operations
 * 
 * @module data-processor
 */

import { parseISO, isBefore, isValid } from 'date-fns';
import { z } from 'zod';
import type {
  FormInstance,
  Result,
} from './types/index.js';
import { logger } from './logger.js';

// ============================================
// ERROR TYPES
// ============================================

/**
 * Data processor error codes
 */
export enum DataProcessorErrorCode {
  INVALID_DATE = 'INVALID_DATE',
  NO_INSTANCES = 'NO_INSTANCES',
  INSTANCE_NOT_FOUND = 'INSTANCE_NOT_FOUND',
  INVALID_SHEET_NAME = 'INVALID_SHEET_NAME',
  INVALID_INPUT = 'INVALID_INPUT',
}

/**
 * Data processor error class
 */
export class DataProcessorError extends Error {
  constructor(
    message: string,
    public readonly code: DataProcessorErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DataProcessorError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DataProcessorError);
    }
  }
}

// ============================================
// VALIDATION SCHEMAS
// ============================================

/**
 * ISO date string schema (YYYY-MM-DD)
 */
const IsoDateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in ISO format (YYYY-MM-DD)'
);

/**
 * Sheet name validation schema
 */
const SheetNameSchema = z.string().min(1).max(31);

// ============================================
// CONSTANTS
// ============================================

/**
 * Excel sheet name constraints
 */
export const EXCEL_CONSTRAINTS = {
  /**
   * Maximum length for Excel sheet names
   */
  MAX_SHEET_NAME_LENGTH: 31,

  /**
   * Characters that are invalid in Excel sheet names
   */
  INVALID_CHARS: ['\\', '/', '*', '?', ':', '[', ']'] as const,

  /**
   * Default replacement character for invalid characters
   */
  REPLACEMENT_CHAR: '_',
} as const;

/**
 * Variance filtering criteria
 */
export const VARIANCE_CRITERIA = {
  /**
   * Default difference column name
   */
  DEFAULT_DIFF_COLUMN: 'Difference',

  /**
   * Default cell reference column name
   */
  DEFAULT_CELL_REF_COLUMN: 'Cell Reference',

  /**
   * Keywords indicating subtotal rows
   */
  SUBTOTAL_KEYWORDS: ['subtotal', 'total', 'sum'] as const,
} as const;

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Instance search result with metadata
 */
export interface InstanceSearchResult {
  readonly instance: FormInstance;
  readonly searchDate: string;
  readonly matchType: 'exact' | 'before';
  readonly daysDifference: number;
}

/**
 * Sheet name sanitization result
 */
export interface SanitizationResult {
  readonly original: string;
  readonly sanitized: string;
  readonly wasTruncated: boolean;
  readonly replacedChars: readonly string[];
}

/**
 * Variance statistics
 */
export interface VarianceStatistics {
  readonly totalCount: number;
  readonly nonZeroCount: number;
  readonly subtotalCount: number;
  readonly meaningfulCount: number;
  readonly maxAbsValue: number;
  readonly avgAbsValue: number;
}

// ============================================
// DATE OPERATIONS
// ============================================

/**
 * Validate ISO date string
 * 
 * @param dateStr - Date string to validate
 * @returns Result with parsed Date or error
 * 
 * @example
 * ```typescript
 * const result = validateDateString('2025-06-30');
 * if (result.success) {
 *   console.log('Valid date:', result.data);
 * }
 * ```
 */
export function validateDateString(
  dateStr: string
): Result<Date, DataProcessorError> {
  // Validate format
  const formatResult = IsoDateSchema.safeParse(dateStr);
  if (!formatResult.success) {
    return {
      success: false,
      error: new DataProcessorError(
        `Invalid date format: ${dateStr}`,
        DataProcessorErrorCode.INVALID_DATE,
        { dateStr, formatError: formatResult.error }
      ),
    };
  }

  // Parse and validate actual date
  const date = parseISO(dateStr);
  if (!isValid(date)) {
    return {
      success: false,
      error: new DataProcessorError(
        `Invalid date value: ${dateStr}`,
        DataProcessorErrorCode.INVALID_DATE,
        { dateStr }
      ),
    };
  }

  return { success: true, data: date };
}

/**
 * Calculate days between two ISO date strings
 * 
 * @param date1 - First date string
 * @param date2 - Second date string
 * @returns Result with day difference or error
 */
export function daysBetween(
  date1: string,
  date2: string
): Result<number, DataProcessorError> {
  const d1Result = validateDateString(date1);
  if (!d1Result.success) {
    return d1Result;
  }

  const d2Result = validateDateString(date2);
  if (!d2Result.success) {
    return d2Result;
  }

  const diffMs = d2Result.data.getTime() - d1Result.data.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return { success: true, data: diffDays };
}

// ============================================
// INSTANCE FINDING
// ============================================

/**
 * Find instance with exact target date
 * 
 * Pure function with no side effects
 * 
 * @param instances - Array of form instances to search
 * @param targetDate - Target date in ISO format (YYYY-MM-DD)
 * @returns Result with instance or error
 * 
 * @example
 * ```typescript
 * const result = findInstanceByDate(instances, '2025-06-30');
 * if (result.success) {
 *   console.log('Found:', result.data.instance.id);
 * }
 * ```
 */
export function findInstanceByDate(
  instances: readonly FormInstance[],
  targetDate: string
): Result<InstanceSearchResult, DataProcessorError> {
  // Validate inputs
  if (instances.length === 0) {
    return {
      success: false,
      error: new DataProcessorError(
        'No instances provided',
        DataProcessorErrorCode.NO_INSTANCES,
        { targetDate }
      ),
    };
  }

  const dateResult = validateDateString(targetDate);
  if (!dateResult.success) {
    return dateResult;
  }

  // Find exact match
  const instance = instances.find((inst) => inst.referenceDate === targetDate);

  if (!instance) {
    return {
      success: false,
      error: new DataProcessorError(
        `No instance found for date ${targetDate}`,
        DataProcessorErrorCode.INSTANCE_NOT_FOUND,
        {
          targetDate,
          availableDates: instances.map((i) => i.referenceDate),
        }
      ),
    };
  }

  logger.debug('Found exact instance match', {
    targetDate,
    instanceId: instance.id,
  });

  return {
    success: true,
    data: {
      instance,
      searchDate: targetDate,
      matchType: 'exact',
      daysDifference: 0,
    },
  };
}

/**
 * Find most recent instance before target date
 * 
 * Pure function with no side effects
 * 
 * @param instances - Array of form instances to search
 * @param targetDate - Target date in ISO format (YYYY-MM-DD)
 * @returns Result with instance or error
 * 
 * @example
 * ```typescript
 * const result = findInstanceBeforeDate(instances, '2025-06-30');
 * if (result.success) {
 *   console.log('Days before target:', result.data.daysDifference);
 * }
 * ```
 */
export function findInstanceBeforeDate(
  instances: readonly FormInstance[],
  targetDate: string
): Result<InstanceSearchResult, DataProcessorError> {
  // Validate inputs
  if (instances.length === 0) {
    return {
      success: false,
      error: new DataProcessorError(
        'No instances provided',
        DataProcessorErrorCode.NO_INSTANCES,
        { targetDate }
      ),
    };
  }

  const dateResult = validateDateString(targetDate);
  if (!dateResult.success) {
    return dateResult;
  }

  const targetDt = dateResult.data;

  // Filter instances before target date
  const beforeInstances = instances.filter((inst) => {
    const instDateResult = validateDateString(inst.referenceDate);
    if (!instDateResult.success) {
      logger.warn('Invalid instance date, skipping', {
        instanceId: inst.id,
        refDate: inst.referenceDate,
      });
      return false;
    }
    return isBefore(instDateResult.data, targetDt);
  });

  if (beforeInstances.length === 0) {
    return {
      success: false,
      error: new DataProcessorError(
        `No instances found before ${targetDate}`,
        DataProcessorErrorCode.INSTANCE_NOT_FOUND,
        {
          targetDate,
          availableDates: instances.map((i) => i.referenceDate),
        }
      ),
    };
  }

  // Sort by date (most recent first) and get first
  const sortedInstances = [...beforeInstances].sort((a, b) =>
    b.referenceDate.localeCompare(a.referenceDate)
  );

  const mostRecent = sortedInstances[0];

  // Calculate days difference
  const daysResult = daysBetween(mostRecent.referenceDate, targetDate);
  const daysDiff = daysResult.success ? daysResult.data : 0;

  logger.debug('Found instance before target date', {
    targetDate,
    foundDate: mostRecent.referenceDate,
    daysDifference: daysDiff,
    instanceId: mostRecent.id,
  });

  return {
    success: true,
    data: {
      instance: mostRecent,
      searchDate: targetDate,
      matchType: 'before',
      daysDifference: daysDiff,
    },
  };
}

/**
 * Find instance by date with fallback to before
 * 
 * Attempts exact match first, then falls back to most recent before target
 * 
 * @param instances - Array of form instances to search
 * @param targetDate - Target date in ISO format
 * @returns Result with instance or error
 */
export function findInstanceByDateOrBefore(
  instances: readonly FormInstance[],
  targetDate: string
): Result<InstanceSearchResult, DataProcessorError> {
  // Try exact match first
  const exactResult = findInstanceByDate(instances, targetDate);
  if (exactResult.success) {
    return exactResult;
  }

  // Fall back to before
  logger.debug('Exact match not found, searching for instance before date', {
    targetDate,
  });

  return findInstanceBeforeDate(instances, targetDate);
}

/**
 * Sort instances by reference date
 * 
 * @param instances - Instances to sort
 * @param order - Sort order ('asc' or 'desc')
 * @returns Sorted array (new array, original unchanged)
 */
export function sortInstancesByDate(
  instances: readonly FormInstance[],
  order: 'asc' | 'desc' = 'asc'
): readonly FormInstance[] {
  const sorted = [...instances].sort((a, b) => {
    const comparison = a.referenceDate.localeCompare(b.referenceDate);
    return order === 'asc' ? comparison : -comparison;
  });

  return sorted;
}

// ============================================
// SHEET NAME SANITIZATION
// ============================================

/**
 * Check if character is invalid for Excel sheet names
 * 
 * @param char - Character to check
 * @returns true if character is invalid
 */
function isInvalidSheetChar(char: string): boolean {
  return EXCEL_CONSTRAINTS.INVALID_CHARS.includes(
    char as typeof EXCEL_CONSTRAINTS.INVALID_CHARS[number]
  );
}

/**
 * Sanitize string to be valid Excel sheet name
 * 
 * Pure function with no side effects
 * 
 * @param name - Name to sanitize
 * @param maxLength - Maximum length (default: 31)
 * @param replacementChar - Character to replace invalid chars (default: '_')
 * @returns Sanitization result with metadata
 * 
 * @example
 * ```typescript
 * const result = sanitizeSheetName('Balance Sheet: 2025/06/30', 31);
 * console.log(result.sanitized); // "Balance Sheet_ 2025_06_30"
 * console.log(result.wasTruncated); // false
 * ```
 */
export function sanitizeSheetName(
  name: string,
  maxLength: number = EXCEL_CONSTRAINTS.MAX_SHEET_NAME_LENGTH,
  replacementChar: string = EXCEL_CONSTRAINTS.REPLACEMENT_CHAR
): Result<SanitizationResult, DataProcessorError> {
  // Validate inputs
  if (!name || name.trim().length === 0) {
    return {
      success: false,
      error: new DataProcessorError(
        'Sheet name cannot be empty',
        DataProcessorErrorCode.INVALID_SHEET_NAME,
        { name }
      ),
    };
  }

  if (maxLength < 1 || maxLength > EXCEL_CONSTRAINTS.MAX_SHEET_NAME_LENGTH) {
    return {
      success: false,
      error: new DataProcessorError(
        `Invalid max length: ${maxLength}`,
        DataProcessorErrorCode.INVALID_INPUT,
        { maxLength }
      ),
    };
  }

  const original = name;
  const replacedChars: string[] = [];

  // Replace invalid characters
  let sanitized = '';
  for (const char of name) {
    if (isInvalidSheetChar(char)) {
      sanitized += replacementChar;
      if (!replacedChars.includes(char)) {
        replacedChars.push(char);
      }
    } else {
      sanitized += char;
    }
  }

  // Truncate if necessary
  const wasTruncated = sanitized.length > maxLength;
  if (wasTruncated) {
    sanitized = sanitized.substring(0, maxLength);
    logger.debug('Sheet name truncated', {
      original,
      sanitized,
      maxLength,
    });
  }

  // Validate result
  const validationResult = SheetNameSchema.safeParse(sanitized);
  if (!validationResult.success) {
    return {
      success: false,
      error: new DataProcessorError(
        'Sanitized sheet name is invalid',
        DataProcessorErrorCode.INVALID_SHEET_NAME,
        {
          original,
          sanitized,
          validationError: validationResult.error,
        }
      ),
    };
  }

  return {
    success: true,
    data: {
      original,
      sanitized,
      wasTruncated,
      replacedChars,
    },
  };
}

/**
 * Batch sanitize multiple sheet names
 * 
 * @param names - Array of names to sanitize
 * @param maxLength - Maximum length for each name
 * @returns Array of sanitization results
 */
export function sanitizeSheetNames(
  names: readonly string[],
  maxLength: number = EXCEL_CONSTRAINTS.MAX_SHEET_NAME_LENGTH
): ReadonlyArray<Result<SanitizationResult, DataProcessorError>> {
  return names.map((name) => sanitizeSheetName(name, maxLength));
}

// ============================================
// VARIANCE ANALYSIS
// ============================================

/**
 * Check if value represents a meaningful difference
 * 
 * @param value - Value to check
 * @returns true if value is meaningful (non-zero, non-null, non-empty)
 */
function isMeaningfulDifference(value: unknown): boolean {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return !isNaN(parsed) && parsed !== 0;
  }

  return false;
}

/**
 * Check if cell reference indicates a subtotal row
 * 
 * @param cellReference - Cell reference string
 * @returns true if cell reference indicates subtotal
 */
function isSubtotalCell(cellReference: unknown): boolean {
  if (typeof cellReference !== 'string') {
    return false;
  }

  const lowerRef = cellReference.toLowerCase();
  return VARIANCE_CRITERIA.SUBTOTAL_KEYWORDS.some((keyword) =>
    lowerRef.includes(keyword)
  );
}

/**
 * Count meaningful differences in variance data
 * 
 * Pure function with no side effects
 * 
 * @param variances - Array of variance records
 * @param diffColumn - Column name containing differences
 * @param cellRefColumn - Column name containing cell references
 * @returns Count of meaningful differences (excluding subtotals)
 * 
 * @example
 * ```typescript
 * const count = countMeaningfulDifferences(variances, 'Difference', 'Cell Reference');
 * console.log(`Found ${count} meaningful variances`);
 * ```
 */
export function countMeaningfulDifferences(
  variances: ReadonlyArray<Record<string, unknown>>,
  diffColumn: string = VARIANCE_CRITERIA.DEFAULT_DIFF_COLUMN,
  cellRefColumn: string = VARIANCE_CRITERIA.DEFAULT_CELL_REF_COLUMN
): number {
  if (!variances || variances.length === 0) {
    return 0;
  }

  let count = 0;

  for (const variance of variances) {
    const diffValue = variance[diffColumn];
    const cellRef = variance[cellRefColumn];

    // Check for meaningful difference
    if (!isMeaningfulDifference(diffValue)) {
      continue;
    }

    // Exclude subtotals
    if (isSubtotalCell(cellRef)) {
      continue;
    }

    count++;
  }

  logger.debug('Counted meaningful differences', {
    total: variances.length,
    meaningful: count,
    diffColumn,
  });

  return count;
}

/**
 * Check if variance data contains any meaningful differences
 * 
 * @param variances - Array of variance records
 * @param diffColumn - Column name containing differences
 * @returns true if at least one meaningful difference exists
 */
export function hasMeaningfulDifferences(
  variances: ReadonlyArray<Record<string, unknown>>,
  diffColumn: string = VARIANCE_CRITERIA.DEFAULT_DIFF_COLUMN
): boolean {
  return countMeaningfulDifferences(variances, diffColumn) > 0;
}

/**
 * Calculate variance statistics
 * 
 * @param variances - Array of variance records
 * @param diffColumn - Column name containing differences
 * @param cellRefColumn - Column name containing cell references
 * @returns Detailed statistics about variances
 */
export function calculateVarianceStatistics(
  variances: ReadonlyArray<Record<string, unknown>>,
  diffColumn: string = VARIANCE_CRITERIA.DEFAULT_DIFF_COLUMN,
  cellRefColumn: string = VARIANCE_CRITERIA.DEFAULT_CELL_REF_COLUMN
): VarianceStatistics {
  const stats = {
    totalCount: variances.length,
    nonZeroCount: 0,
    subtotalCount: 0,
    meaningfulCount: 0,
    maxAbsValue: 0,
    avgAbsValue: 0,
  };

  if (variances.length === 0) {
    return stats;
  }

  let sum = 0;
  const absValues: number[] = [];

  for (const variance of variances) {
    const diffValue = variance[diffColumn];
    const cellRef = variance[cellRefColumn];

    // Check if subtotal
    if (isSubtotalCell(cellRef)) {
      stats.subtotalCount++;
    }

    // Check if meaningful
    if (isMeaningfulDifference(diffValue)) {
      stats.nonZeroCount++;

      // Parse numeric value
      const numValue =
        typeof diffValue === 'number'
          ? diffValue
          : typeof diffValue === 'string'
          ? parseFloat(diffValue)
          : NaN;

      if (!isNaN(numValue)) {
        const absValue = Math.abs(numValue);
        absValues.push(absValue);
        sum += absValue;

        if (absValue > stats.maxAbsValue) {
          stats.maxAbsValue = absValue;
        }

        // Count meaningful (non-subtotal)
        if (!isSubtotalCell(cellRef)) {
          stats.meaningfulCount++;
        }
      }
    }
  }

  if (absValues.length > 0) {
    stats.avgAbsValue = sum / absValues.length;
  }

  logger.debug('Calculated variance statistics', stats);

  return stats;
}

/**
 * Filter variances by criteria
 * 
 * @param variances - Array of variance records
 * @param options - Filter options
 * @returns Filtered array (new array, original unchanged)
 */
export function filterVariances(
  variances: ReadonlyArray<Record<string, unknown>>,
  options: {
    readonly minAbsValue?: number;
    readonly excludeSubtotals?: boolean;
    readonly diffColumn?: string;
    readonly cellRefColumn?: string;
  } = {}
): ReadonlyArray<Record<string, unknown>> {
  const {
    minAbsValue = 0,
    excludeSubtotals = false,
    diffColumn = VARIANCE_CRITERIA.DEFAULT_DIFF_COLUMN,
    cellRefColumn = VARIANCE_CRITERIA.DEFAULT_CELL_REF_COLUMN,
  } = options;

  return variances.filter((variance) => {
    const diffValue = variance[diffColumn];
    const cellRef = variance[cellRefColumn];

    // Check meaningful
    if (!isMeaningfulDifference(diffValue)) {
      return false;
    }

    // Exclude subtotals if requested
    if (excludeSubtotals && isSubtotalCell(cellRef)) {
      return false;
    }

    // Check minimum absolute value
    if (minAbsValue > 0) {
      const numValue =
        typeof diffValue === 'number'
          ? diffValue
          : typeof diffValue === 'string'
          ? parseFloat(diffValue)
          : NaN;

      if (isNaN(numValue) || Math.abs(numValue) < minAbsValue) {
        return false;
      }
    }

    return true;
  });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Group instances by year
 * 
 * @param instances - Array of form instances
 * @returns Map of year to instances
 */
export function groupInstancesByYear(
  instances: readonly FormInstance[]
): ReadonlyMap<number, readonly FormInstance[]> {
  const grouped = new Map<number, FormInstance[]>();

  for (const instance of instances) {
    const dateResult = validateDateString(instance.referenceDate);
    if (!dateResult.success) {
      logger.warn('Skipping instance with invalid date', {
        instanceId: instance.id,
        refDate: instance.referenceDate,
      });
      continue;
    }

    const year = dateResult.data.getFullYear();
    const existing = grouped.get(year) || [];
    grouped.set(year, [...existing, instance]);
  }

  return grouped;
}

/**
 * Get unique reference dates from instances
 * 
 * @param instances - Array of form instances
 * @returns Sorted array of unique dates
 */
export function getUniqueDates(
  instances: readonly FormInstance[]
): readonly string[] {
  const dates = new Set(instances.map((i) => i.referenceDate));
  return Array.from(dates).sort();
}

/**
 * Check if two instances represent the same period
 * 
 * @param instance1 - First instance
 * @param instance2 - Second instance
 * @returns true if instances have the same reference date
 */
export function isSamePeriod(
  instance1: FormInstance,
  instance2: FormInstance
): boolean {
  return instance1.referenceDate === instance2.referenceDate;
}

// ============================================
// LEGACY COMPATIBILITY
// ============================================

/**
 * @deprecated Use findInstanceByDate instead
 */
export class DataProcessor {
  /**
   * @deprecated Use findInstanceByDate function
   */
  static findInstanceByDate(
    instances: FormInstance[],
    targetDate: string
  ): FormInstance | null {
    const result = findInstanceByDate(instances, targetDate);
    return result.success ? result.data.instance : null;
  }

  /**
   * @deprecated Use findInstanceBeforeDate function
   */
  static findInstanceBeforeDate(
    instances: FormInstance[],
    targetDate: string
  ): FormInstance | null {
    const result = findInstanceBeforeDate(instances, targetDate);
    return result.success ? result.data.instance : null;
  }

  /**
   * @deprecated Use sanitizeSheetName function
   */
  static sanitizeSheetName(name: string, maxLength: number = 31): string {
    const result = sanitizeSheetName(name, maxLength);
    return result.success ? result.data.sanitized : name;
  }

  /**
   * @deprecated Use countMeaningfulDifferences function
   */
  static hasDifferences(
    variances: Record<string, any>[],
    diffColumn: string = 'Difference'
  ): number {
    return countMeaningfulDifferences(variances, diffColumn);
  }
}