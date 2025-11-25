/**
 * Configuration management for variance analysis application
 * 100% type-safe with runtime validation using Zod
 * 
 * @module config
 */

import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import type { AuthConfig, APIConfig } from './types/index.js';
import { safeValidateEnv, formatZodError } from './validation/schemas.js';

// Load environment variables
dotenvConfig();

// ============================================
// EXCEL CONSTANTS (Type-Safe)
// ============================================

/**
 * Excel configuration constants
 * All values are readonly and type-safe
 */
export const ExcelConfig = {
  /**
   * Maximum length for Excel sheet names
   */
  SHEET_NAME_MAX_LENGTH: 31 as const,

  /**
   * Characters that are invalid in Excel sheet names
   */
  INVALID_SHEET_NAME_CHARS: ['\\', '/', '*', '?', ':', '[', ']'] as const,

  /**
   * Excel color codes (ARGB format)
   */
  COLORS: {
    YELLOW: 'FFFFFF00' as const,
    GREEN: 'FF00B050' as const,
    RED: 'FFFF0000' as const,
    WHITE: 'FFFFFFFF' as const,
    BLUE: 'FF4472C4' as const,
    ORANGE: 'FFFFC000' as const,
  } as const,

  /**
   * Default table style for Excel tables
   */
  TABLE_STYLE_NAME: 'TableStyleMedium9' as const,

  /**
   * Column name constants
   */
  COLUMN_NAMES: {
    DIFFERENCE: 'Difference' as const,
    CELL_REF: 'Cell Reference' as const,
    CELL_DESCRIPTION: 'Cell Description' as const,
    PERCENT_DIFFERENCE: '% Difference' as const,
  } as const,
} as const;

// Type alias for Excel colors
export type ExcelColor = typeof ExcelConfig.COLORS[keyof typeof ExcelConfig.COLORS];

// ============================================
// ENVIRONMENT VALIDATION
// ============================================

/**
 * Validated environment configuration
 * Throws detailed error if validation fails
 */
class ValidatedEnvironment {
  private static instance: ValidatedEnvironment | null = null;
  private readonly env: z.infer<typeof import('./validation/schemas.js').EnvSchema>;

  private constructor() {
    const result = safeValidateEnv(process.env);
    
    if (!result.success) {
      const errorMessage = formatZodError(result.error);
      throw new Error(
        `Environment validation failed:\n${errorMessage}\n\n` +
        'Please check your .env file and ensure all required variables are set.'
      );
    }

    this.env = result.data;
  }

  /**
   * Get singleton instance of validated environment
   * @returns Validated environment instance
   * @throws Error if environment validation fails
   */
  public static getInstance(): ValidatedEnvironment {
    if (!ValidatedEnvironment.instance) {
      ValidatedEnvironment.instance = new ValidatedEnvironment();
    }
    return ValidatedEnvironment.instance;
  }

  /**
   * Get a validated environment variable
   * @param key - Environment variable key
   * @returns Value of the environment variable
   */
  public get<K extends keyof z.infer<typeof import('./validation/schemas.js').EnvSchema>>(
    key: K
  ): z.infer<typeof import('./validation/schemas.js').EnvSchema>[K] {
    return this.env[key];
  }

  /**
   * Get all validated environment variables
   * @returns Complete validated environment object
   */
  public getAll(): Readonly<z.infer<typeof import('./validation/schemas.js').EnvSchema>> {
    return { ...this.env };
  }
}

// ============================================
// CONFIGURATION GETTERS
// ============================================

/**
 * Get authentication configuration from validated environment
 * 
 * @returns Authentication configuration with all required fields
 * @throws Error if environment validation fails
 * 
 * @example
 * ```typescript
 * const authConfig = Config.getAuthConfig();
 * console.log(authConfig.username); // Type-safe access
 * ```
 */
export function getAuthConfig(): Readonly<AuthConfig> {
  const env = ValidatedEnvironment.getInstance();

  return Object.freeze({
    url: env.get('AUTH_URL'),
    username: env.get('APRA_USERNAME'),
    password: env.get('PASSWORD'),
    grantType: env.get('GRANT_TYPE'),
    clientId: env.get('CLIENT_ID'),
    clientSecret: env.get('CLIENT_SECRET'),
  });
}

/**
 * Get API configuration from validated environment
 * 
 * @returns API configuration with base URL and endpoints
 * @throws Error if environment validation fails
 * 
 * @example
 * ```typescript
 * const apiConfig = Config.getApiConfig();
 * console.log(apiConfig.returnsEndpoint); // Type-safe access
 * ```
 */
export function getApiConfig(): Readonly<APIConfig> {
  const env = ValidatedEnvironment.getInstance();
  const baseUrl = env.get('API_BASE_URL');

  return Object.freeze({
    baseUrl,
    returnsEndpoint: `${baseUrl}/returns`,
    analysisEndpoint: `${baseUrl}/analysis/cellAnalyses`,
  });
}

/**
 * Get Excel document properties from environment
 * 
 * @returns Excel document metadata (author, title, category)
 * 
 * @example
 * ```typescript
 * const excelProps = Config.getExcelProperties();
 * workbook.creator = excelProps.author;
 * ```
 */
export function getExcelProperties(): Readonly<{
  author: string;
  title: string;
  category: string;
}> {
  const env = ValidatedEnvironment.getInstance();

  return Object.freeze({
    author: env.get('EXCEL_AUTHOR') || '',
    title: env.get('EXCEL_TITLE') || '',
    category: env.get('EXCEL_CATEGORY') || '',
  });
}

// ============================================
// LEGACY COMPATIBILITY (Deprecated)
// ============================================

/**
 * @deprecated Use getAuthConfig(), getApiConfig(), and ExcelConfig instead
 * 
 * Legacy Config class for backward compatibility
 * Will be removed in v2.0.0
 */
export class Config {
  /**
   * @deprecated Use ExcelConfig.SHEET_NAME_MAX_LENGTH
   */
  static readonly EXCEL_SHEET_NAME_MAX_LENGTH = ExcelConfig.SHEET_NAME_MAX_LENGTH;

  /**
   * @deprecated Use ExcelConfig.INVALID_SHEET_NAME_CHARS
   */
  static readonly INVALID_SHEET_NAME_CHARS = ExcelConfig.INVALID_SHEET_NAME_CHARS;

  /**
   * @deprecated Use ExcelConfig.COLORS.YELLOW
   */
  static readonly COLOR_YELLOW = ExcelConfig.COLORS.YELLOW;

  /**
   * @deprecated Use ExcelConfig.COLORS.GREEN
   */
  static readonly COLOR_GREEN = ExcelConfig.COLORS.GREEN;

  /**
   * @deprecated Use ExcelConfig.COLORS.RED
   */
  static readonly COLOR_RED = ExcelConfig.COLORS.RED;

  /**
   * @deprecated Use ExcelConfig.COLUMN_NAMES.DIFFERENCE
   */
  static readonly COLUMN_NAME_DIFFERENCE = ExcelConfig.COLUMN_NAMES.DIFFERENCE;

  /**
   * @deprecated Use ExcelConfig.COLUMN_NAMES.CELL_REF
   */
  static readonly COLUMN_NAME_CELL_REF = ExcelConfig.COLUMN_NAMES.CELL_REF;

  /**
   * @deprecated Use ExcelConfig.TABLE_STYLE_NAME
   */
  static readonly TABLE_STYLE_NAME = ExcelConfig.TABLE_STYLE_NAME;

  /**
   * @deprecated Use getExcelProperties()
   */
  static readonly EXCEL_AUTHOR = process.env.EXCEL_AUTHOR || '';

  /**
   * @deprecated Use getExcelProperties()
   */
  static readonly EXCEL_TITLE = process.env.EXCEL_TITLE || '';

  /**
   * @deprecated Use getExcelProperties()
   */
  static readonly EXCEL_CATEGORY = process.env.EXCEL_CATEGORY || '';

  /**
   * @deprecated Use getAuthConfig() instead
   */
  static getAuthConfig(): AuthConfig {
    return getAuthConfig();
  }

  /**
   * @deprecated Use getApiConfig() instead
   */
  static getApiConfig(): APIConfig {
    return getApiConfig();
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if environment is properly configured
 * Non-throwing version that returns boolean
 * 
 * @returns true if environment is valid, false otherwise
 * 
 * @example
 * ```typescript
 * if (!Config.isEnvironmentValid()) {
 *   console.error('Please configure your .env file');
 *   process.exit(1);
 * }
 * ```
 */
export function isEnvironmentValid(): boolean {
  try {
    ValidatedEnvironment.getInstance();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get environment validation errors if any
 * 
 * @returns Array of validation error messages, or empty array if valid
 * 
 * @example
 * ```typescript
 * const errors = Config.getEnvironmentErrors();
 * if (errors.length > 0) {
 *   console.error('Configuration errors:', errors.join('\n'));
 * }
 * ```
 */
export function getEnvironmentErrors(): readonly string[] {
  const result = safeValidateEnv(process.env);
  
  if (result.success) {
    return [];
  }

  return result.error.issues.map((err) => {
    const path = err.path.join('.');
    return `${path ? `${path}: ` : ''}${err.message}`;
  });
}

/**
 * Validate environment and throw detailed error if invalid
 * Useful for early validation in main entry point
 * 
 * @throws Error with detailed validation errors
 * 
 * @example
 * ```typescript
 * // At the top of main.ts
 * Config.validateEnvironmentOrThrow();
 * ```
 */
export function validateEnvironmentOrThrow(): void {
  ValidatedEnvironment.getInstance();
}

// ============================================
// TYPE EXPORTS
// ============================================

// Re-export types for convenience
export type { AuthConfig, APIConfig } from './types/index.js';