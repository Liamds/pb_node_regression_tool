/**
 * Type-safe AgileReporter API client with comprehensive error handling
 * 
 * Features:
 * - Strict TypeScript typing throughout
 * - Zod validation for all API responses
 * - Result<T, E> pattern for error handling
 * - Token management with expiry tracking
 * - Automatic retry logic with exponential backoff
 * - Request timeout management
 * - Comprehensive logging
 * 
 * @module api-client
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import https from 'https';
import { z } from 'zod';
import type {
  AuthConfig,
  APIConfig,
  FormInstance,
  CellMetadata,
  CellBusinessRule,
  CellRecordHeader,
  ValidationResult,
  AsyncResult,
} from './types/index.js';
import {
  ValidationResultSchema,
  validateFormInstances,
} from './validation/schemas.js';
import { logger } from './logger.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

/**
 * OAuth token response schema
 */
const TokenResponseSchema = z.object({
  access_token: z.string().min(1, 'Access token is required'),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().optional(),
});

type TokenResponse = z.infer<typeof TokenResponseSchema>;

/**
 * Cell metadata response schema
 */
const CellMetadataSchema = z.object({
  id: z.string(),
  physicalName: z.string(),
  viewCode: z.string(),
});

/**
 * Cell business rule schema
 */
const CellBusinessRuleSchema = z.object({
  id: z.number(),
  content: z.string(),
  seqNumber: z.string(),
});

/**
 * Cell record header schema
 */
const CellRecordHeaderSchema = z.object({
  columnName: z.string(),
  columnLabel: z.string(),
  description: z.string().nullable(),
  visible: z.boolean(),
  columnType: z.string(),
  valueType: z.string(),
  highlighted: z.boolean(),
});

/**
 * Variance instance schema (from API)
 */
const VarianceInstanceSchema = z.object({
  cellNotPresent: z.boolean().optional(),
  value: z.unknown(),
  difference: z.object({
    valueDiff: z.unknown(),
    percentageDiff: z.unknown(),
  }).nullable().optional(),
});

/**
 * Variance record schema (from API)
 */
const VarianceRecordSchema = z.object({
  cell: z.object({
    name: z.string(),
    description: z.string().nullable(),
    subtotal: z.boolean().optional(),
  }),
  instances: z.array(VarianceInstanceSchema),
});

// ============================================
// ERROR TYPES
// ============================================

/**
 * API client error codes
 */
export enum ApiErrorCode {
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_ERROR = 'AUTH_ERROR',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  REQUEST_FAILED = 'REQUEST_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT = 'RATE_LIMIT',
}

/**
 * Custom error class for API client errors
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: ApiErrorCode,
    public readonly statusCode?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiClientError);
    }
  }

  /**
   * Create error from Axios error
   */
  static fromAxiosError(error: AxiosError): ApiClientError {
    if (error.code === 'ECONNABORTED') {
      return new ApiClientError(
        'Request timeout',
        ApiErrorCode.TIMEOUT,
        error.response?.status,
        error
      );
    }

    if (!error.response) {
      return new ApiClientError(
        'Network error: ' + error.message,
        ApiErrorCode.NETWORK_ERROR,
        undefined,
        error
      );
    }

    const statusCode = error.response.status;

    if (statusCode === 401) {
      return new ApiClientError(
        'Authentication failed',
        ApiErrorCode.AUTH_FAILED,
        statusCode,
        error
      );
    }

    if (statusCode === 404) {
      return new ApiClientError(
        'Resource not found',
        ApiErrorCode.NOT_FOUND,
        statusCode,
        error
      );
    }

    if (statusCode === 429) {
      return new ApiClientError(
        'Rate limit exceeded',
        ApiErrorCode.RATE_LIMIT,
        statusCode,
        error
      );
    }

    return new ApiClientError(
      `Request failed with status ${statusCode}`,
      ApiErrorCode.REQUEST_FAILED,
      statusCode,
      error
    );
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return (
      this.code === ApiErrorCode.NETWORK_ERROR ||
      this.code === ApiErrorCode.TIMEOUT ||
      this.code === ApiErrorCode.RATE_LIMIT ||
      (this.statusCode !== undefined && this.statusCode >= 500)
    );
  }
}

// ============================================
// RETRY CONFIGURATION
// ============================================

/**
 * Retry configuration options
 */
interface RetryConfig {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
} as const;

// ============================================
// API CLIENT
// ============================================

/**
 * Type-safe AgileReporter API client
 * 
 * @example
 * ```typescript
 * const client = new AgileReporterClient(authConfig, apiConfig);
 * const authResult = await client.authenticate();
 * 
 * if (authResult.success) {
 *   const versionsResult = await client.getFormVersions('ARF1100');
 *   if (versionsResult.success) {
 *     console.log(versionsResult.data);
 *   }
 * }
 * ```
 */
export class AgileReporterClient {
  private token: string | null = null;
  private tokenExpiry: number | null = null;
  private readonly host: string;
  private readonly axiosInstance: AxiosInstance;

  constructor(
    private readonly authConfig: Readonly<AuthConfig>,
    private readonly apiConfig: Readonly<APIConfig>,
    private readonly retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ) {
    // Extract host from base URL
    const url = new URL(this.apiConfig.baseUrl);
    this.host = url.host;

    // Create axios instance with configuration
    this.axiosInstance = axios.create({
      httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: 10,
      }),
      timeout: 1200000, // 20 minutes
      validateStatus: (status) => status >= 200 && status < 500,
    });

    // Add request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.debug('API Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
        });
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug('API Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => Promise.reject(error)
    );
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  /**
   * Authenticate with AgileReporter API and obtain access token
   * 
   * @returns Result with token string or error
   * 
   * @example
   * ```typescript
   * const result = await client.authenticate();
   * if (result.success) {
   *   console.log('Token:', result.data);
   * } else {
   *   console.error('Auth failed:', result.error.message);
   * }
   * ```
   */
  async authenticate(): AsyncResult<string, ApiClientError> {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Connection': 'keep-alive',
    } as const;

    const data = new URLSearchParams({
      username: this.authConfig.username,
      password: this.authConfig.password,
      grant_type: this.authConfig.grantType,
      client_id: this.authConfig.clientId,
      client_secret: this.authConfig.clientSecret,
    });

    try {
      logger.info('Authenticating with AgileReporter...');

      const response = await this.axiosInstance.post(
        this.authConfig.url,
        data.toString(),
        { headers }
      );

      if (response.status !== 200) {
        return {
          success: false,
          error: new ApiClientError(
            `Authentication failed with status ${response.status}`,
            ApiErrorCode.AUTH_FAILED,
            response.status
          ),
        };
      }

      // Validate and parse response
      const parseResult = TokenResponseSchema.safeParse(response.data);
      if (!parseResult.success) {
        logger.error('Invalid token response', { error: parseResult.error });
        return {
          success: false,
          error: new ApiClientError(
            'Invalid token response format',
            ApiErrorCode.INVALID_RESPONSE,
            response.status,
            parseResult.error
          ),
        };
      }

      const tokenData = parseResult.data;
      this.token = tokenData.access_token;

      // Calculate token expiry if provided
      if (tokenData.expires_in) {
        this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
        logger.debug(`Token expires in ${tokenData.expires_in} seconds`);
      }

      logger.info('Authentication successful');
      return { success: true, data: this.token };
    } catch (error) {
      logger.error('Authentication failed', { error });

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: ApiClientError.fromAxiosError(error),
        };
      }

      return {
        success: false,
        error: new ApiClientError(
          this.getErrorMessage(error),
          ApiErrorCode.AUTH_ERROR,
          undefined,
          error
        ),
      };
    }
  }

  /**
   * Ensure client is authenticated, refresh if needed
   */
  private async ensureAuthenticated(): AsyncResult<void, ApiClientError> {
    if (!this.token || this.isTokenExpired()) {
      logger.debug('Token expired or missing, re-authenticating...');
      const authResult = await this.authenticate();
      if (!authResult.success) {
        return authResult;
      }
    }
    return { success: true, data: undefined };
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) {
      return false; // No expiry set, assume valid
    }
    // Add 5 minute buffer
    return Date.now() > (this.tokenExpiry - 300000);
  }

  // ============================================
  // FORM VERSIONS
  // ============================================

  /**
   * Get all versions/instances of a form
   * 
   * @param formCode - AgileReporter form code (e.g., 'ARF1100')
   * @returns Result with sorted array of form instances
   * 
   * @example
   * ```typescript
   * const result = await client.getFormVersions('ARF1100');
   * if (result.success) {
   *   result.data.forEach(instance => {
   *     console.log(instance.refDate, instance.instanceId);
   *   });
   * }
   * ```
   */
  async getFormVersions(
    formCode: string
  ): AsyncResult<readonly FormInstance[], ApiClientError> {
    const authResult = await this.ensureAuthenticated();
    if (!authResult.success) {
      return authResult;
    }

    const path = `/agilereporter/rest/api/returns?productPrefix=APRA&entityCode=PBL&formCode=${encodeURIComponent(formCode)}`;
    const url = `https://${this.host}${path}`;

    const headers = {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json',
      Connection: 'keep-alive',
    } as const;

    try {
      logger.info(`Fetching form versions for ${formCode}`);

      const response = await this.axiosInstance.get(url, { headers });

      if (response.status !== 200) {
        return {
          success: false,
          error: new ApiClientError(
            `Request failed with status ${response.status}`,
            ApiErrorCode.REQUEST_FAILED,
            response.status
          ),
        };
      }

      // Validate response
      try {
        const instances = validateFormInstances(response.data);

        // Sort by reference date
        const sorted = [...instances].sort((a, b) =>
          a.refDate.localeCompare(b.refDate)
        );

        logger.debug(`Retrieved ${sorted.length} versions for ${formCode}`);

        return { success: true, data: sorted };
      } catch (validationError) {
        logger.error('Form versions validation failed', { error: validationError });
        return {
          success: false,
          error: new ApiClientError(
            'Invalid form versions response format',
            ApiErrorCode.VALIDATION_ERROR,
            response.status,
            validationError
          ),
        };
      }
    } catch (error) {
      logger.error(`Failed to get form versions for ${formCode}`, { error });

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: ApiClientError.fromAxiosError(error),
        };
      }

      return {
        success: false,
        error: new ApiClientError(
          this.getErrorMessage(error),
          ApiErrorCode.REQUEST_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  // ============================================
  // CELL METADATA
  // ============================================

  /**
   * Get metadata for a specific cell
   * 
   * @param instanceId - Form instance ID
   * @param cellId - Cell identifier
   * @returns Result with cell metadata
   */
  async getCellMetadata(
    instanceId: string,
    cellId: string
  ): AsyncResult<CellMetadata, ApiClientError> {
    const authResult = await this.ensureAuthenticated();
    if (!authResult.success) {
      return authResult;
    }

    const path = `/agilereporter/rest/api/products/APRA/FCR_APRA/views?formInstanceId=${encodeURIComponent(instanceId)}&cellName=${encodeURIComponent(cellId)}`;
    const url = `https://${this.host}${path}`;

    const headers = {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json',
      Connection: 'keep-alive',
    } as const;

    try {
      logger.info(`Fetching cell metadata for ${cellId}`);

      const response = await this.axiosInstance.get(url, { headers });

      if (response.status !== 200) {
        return {
          success: false,
          error: new ApiClientError(
            `Request failed with status ${response.status}`,
            ApiErrorCode.REQUEST_FAILED,
            response.status
          ),
        };
      }

      // Validate and parse response
      const dataArray = z.array(CellMetadataSchema).safeParse(response.data);
      if (!dataArray.success || dataArray.data.length === 0) {
        return {
          success: false,
          error: new ApiClientError(
            `No metadata found for cell ${cellId}`,
            ApiErrorCode.NOT_FOUND,
            response.status,
            dataArray.success ? undefined : dataArray.error
          ),
        };
      }

      const metadata = dataArray.data[0];
      logger.debug(`Retrieved metadata for cell ${cellId}`);

      return { success: true, data: metadata };
    } catch (error) {
      logger.error(`Failed to get cell metadata for ${cellId}`, { error });

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: ApiClientError.fromAxiosError(error),
        };
      }

      return {
        success: false,
        error: new ApiClientError(
          this.getErrorMessage(error),
          ApiErrorCode.REQUEST_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  // ============================================
  // CELL BUSINESS RULES
  // ============================================

  /**
   * Get business rules for a specific cell
   * 
   * @param instanceId - Form instance ID
   * @param cell - Cell metadata
   * @returns Result with array of business rules
   */
  async getCellBusinessRules(
    instanceId: string,
    cell: CellMetadata
  ): AsyncResult<readonly CellBusinessRule[], ApiClientError> {
    const authResult = await this.ensureAuthenticated();
    if (!authResult.success) {
      return authResult;
    }

    const path = `/agilereporter/rest/api/products/APRA/FCR_APRA/conditions?formInstanceId=${encodeURIComponent(instanceId)}&viewCode=${encodeURIComponent(cell.viewCode)}&cellName=${encodeURIComponent(cell.id)}`;
    const url = `https://${this.host}${path}`;

    const headers = {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json',
      Connection: 'keep-alive',
    } as const;

    try {
      logger.info(`Fetching cell business rules for ${cell.id}`);

      const response = await this.axiosInstance.get(url, { headers });

      if (response.status !== 200) {
        return {
          success: false,
          error: new ApiClientError(
            `Request failed with status ${response.status}`,
            ApiErrorCode.REQUEST_FAILED,
            response.status
          ),
        };
      }

      // Validate response
      const rulesResult = z.array(CellBusinessRuleSchema).safeParse(response.data);
      if (!rulesResult.success) {
        return {
          success: false,
          error: new ApiClientError(
            'Invalid business rules response format',
            ApiErrorCode.VALIDATION_ERROR,
            response.status,
            rulesResult.error
          ),
        };
      }

      if (rulesResult.data.length === 0) {
        return {
          success: false,
          error: new ApiClientError(
            `No business rules found for cell ${cell.id}`,
            ApiErrorCode.NOT_FOUND,
            response.status
          ),
        };
      }

      logger.debug(`Retrieved ${rulesResult.data.length} business rules for cell ${cell.id}`);

      return { success: true, data: rulesResult.data };
    } catch (error) {
      logger.error(`Failed to get business rules for ${cell.id}`, { error });

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: ApiClientError.fromAxiosError(error),
        };
      }

      return {
        success: false,
        error: new ApiClientError(
          this.getErrorMessage(error),
          ApiErrorCode.REQUEST_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  // ============================================
  // CELL HEADERS
  // ============================================

  /**
   * Get headers for cell data
   * 
   * @param instanceId - Form instance ID
   * @param cell - Cell metadata
   * @returns Result with array of cell record headers
   */
  async getCellHeaders(
    instanceId: string,
    cell: CellMetadata
  ): AsyncResult<readonly CellRecordHeader[], ApiClientError> {
    const authResult = await this.ensureAuthenticated();
    if (!authResult.success) {
      return authResult;
    }

    const path = `/agilereporter/rest/api/products/APRA/FCR_APRA/allocationReportContent?page=0&size=1&cellName=${encodeURIComponent(cell.id)}&formInstanceId=${encodeURIComponent(instanceId)}&pageInstanceCode=1&viewCode=${encodeURIComponent(cell.viewCode.toUpperCase())}`;
    const url = `https://${this.host}${path}`;

    const headers = {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json',
      Connection: 'keep-alive',
    } as const;

    try {
      logger.info(`Fetching cell data headers for ${cell.id}`);

      const response = await this.axiosInstance.get(url, { headers });

      if (response.status !== 200) {
        return {
          success: false,
          error: new ApiClientError(
            `Request failed with status ${response.status}`,
            ApiErrorCode.REQUEST_FAILED,
            response.status
          ),
        };
      }

      // Validate response
      const headersResult = z.array(CellRecordHeaderSchema).safeParse(response.data);
      if (!headersResult.success) {
        return {
          success: false,
          error: new ApiClientError(
            'Invalid cell headers response format',
            ApiErrorCode.VALIDATION_ERROR,
            response.status,
            headersResult.error
          ),
        };
      }

      if (headersResult.data.length === 0) {
        return {
          success: false,
          error: new ApiClientError(
            `No cell data headers found for cell ${cell.id}`,
            ApiErrorCode.NOT_FOUND,
            response.status
          ),
        };
      }

      logger.debug(`Retrieved ${headersResult.data.length} headers for cell ${cell.id}`);

      return { success: true, data: headersResult.data };
    } catch (error) {
      logger.error(`Failed to get cell headers for ${cell.id}`, { error });

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: ApiClientError.fromAxiosError(error),
        };
      }

      return {
        success: false,
        error: new ApiClientError(
          this.getErrorMessage(error),
          ApiErrorCode.REQUEST_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  // ============================================
  // CELL RECORD EXPORT
  // ============================================

  /**
   * Get cell records and save as XLSX file
   * 
   * @param instanceId - Form instance ID
   * @param cell - Cell metadata
   * @param headers - Cell record headers
   * @param outputFile - Output file path
   * @returns Result with void or error
   */
  async getCellRecordXlsx(
    instanceId: string,
    cell: CellMetadata,
    headers: readonly CellRecordHeader[],
    outputFile: string
  ): AsyncResult<void, ApiClientError> {
    const authResult = await this.ensureAuthenticated();
    if (!authResult.success) {
      return authResult;
    }

    const columnsParam = headers.map(h => `columns=${encodeURIComponent(h.columnName)}`).join('&');
    const path = `/agilereporter/rest/api/products/APRA/FCR_APRA/allocationReportContent/export?${columnsParam}&cellName=${encodeURIComponent(cell.id)}&formInstanceId=${encodeURIComponent(instanceId)}&pageInstanceCode=1&viewCode=${encodeURIComponent(cell.viewCode.toUpperCase())}`;
    const url = `https://${this.host}${path}`;

    const requestHeaders = {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json',
      Connection: 'keep-alive',
    } as const;

    try {
      logger.info(`Fetching cell record data for ${cell.id}`);

      const response = await this.axiosInstance.get(url, {
        headers: requestHeaders,
        responseType: 'arraybuffer',
      });

      if (response.status !== 200) {
        return {
          success: false,
          error: new ApiClientError(
            `Request failed with status ${response.status}`,
            ApiErrorCode.REQUEST_FAILED,
            response.status
          ),
        };
      }

      if (!response.data) {
        return {
          success: false,
          error: new ApiClientError(
            `No data found for cell ${cell.id}`,
            ApiErrorCode.NOT_FOUND,
            response.status
          ),
        };
      }

      // Save to file
      const fs = await import('fs/promises');
      await fs.writeFile(outputFile, response.data);

      logger.info(`Saved cell data to ${outputFile}`);

      return { success: true, data: undefined };
    } catch (error) {
      logger.error(`Failed to get cell record data for ${cell.id}`, { error });

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: ApiClientError.fromAxiosError(error),
        };
      }

      return {
        success: false,
        error: new ApiClientError(
          this.getErrorMessage(error),
          ApiErrorCode.REQUEST_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  // ============================================
  // FORM ANALYSIS (WITH RETRY)
  // ============================================

  /**
   * Get variance analysis between two form instances with automatic retry
   * 
   * @param formCode - Form code for logging
   * @param instance1 - First form instance (comparison)
   * @param instance2 - Second form instance (base)
   * @returns Result with variance records
   * 
   * @example
   * ```typescript
   * const result = await client.getFormAnalysis(
   *   'ARF1100',
   *   comparisonInstance,
   *   baseInstance
   * );
   * if (result.success) {
   *   console.log(`Found ${result.data.length} variances`);
   * }
   * ```
   */
  async getFormAnalysis(
    formCode: string,
    instance1: FormInstance,
    instance2: FormInstance
  ): AsyncResult<ReadonlyArray<Record<string, unknown>>, ApiClientError> {
    return this.retryOperation(
      async () => this.getFormAnalysisInternal(formCode, instance1, instance2),
      `getFormAnalysis(${formCode})`
    );
  }

  /**
   * Internal implementation of form analysis
   */
  private async getFormAnalysisInternal(
    formCode: string,
    instance1: FormInstance,
    instance2: FormInstance
  ): AsyncResult<ReadonlyArray<Record<string, unknown>>, ApiClientError> {
    const authResult = await this.ensureAuthenticated();
    if (!authResult.success) {
      return authResult;
    }

    const queryParams = new URLSearchParams({
      formInstances: `${instance1.instanceId},${instance2.instanceId}`,
      pageInstance: '1',
      constraintType: 'CELLGROUP',
      constraintId: 'ALL',
    });

    const path = `/agilereporter/rest/api/analysis/cellAnalyses?${queryParams}`;
    const url = `https://${this.host}${path}`;

    const headers = {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
    } as const;

    try {
      logger.info(`Fetching variance analysis for ${formCode}`);

      const response = await this.axiosInstance.get(url, {
        headers,
        decompress: true,
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            if (percentCompleted % 20 === 0) {
              logger.debug(`Download progress: ${percentCompleted}%`);
            }
          }
        },
      });

      if (response.status !== 200) {
        return {
          success: false,
          error: new ApiClientError(
            `Request failed with status ${response.status}`,
            ApiErrorCode.REQUEST_FAILED,
            response.status
          ),
        };
      }

      logger.info(`Received complete response for ${formCode}`);

      // Validate and parse variance records
      const variancesResult = z.array(VarianceRecordSchema).safeParse(response.data);
      if (!variancesResult.success) {
        logger.error('Variance records validation failed', { error: variancesResult.error });
        return {
          success: false,
          error: new ApiClientError(
            'Invalid variance records response format',
            ApiErrorCode.VALIDATION_ERROR,
            response.status,
            variancesResult.error
          ),
        };
      }

      const variances = this.parseVarianceRecords(
        variancesResult.data,
        instance1,
        instance2
      );

      logger.info(`Retrieved ${variances.length} variance records`);

      return { success: true, data: variances };
    } catch (error) {
      logger.error(`Failed to get form analysis for ${formCode}`, { error });

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: ApiClientError.fromAxiosError(error),
        };
      }

      return {
        success: false,
        error: new ApiClientError(
          this.getErrorMessage(error),
          ApiErrorCode.REQUEST_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  // ============================================
  // VALIDATION (WITH RETRY)
  // ============================================

  /**
   * Validate a return and get validation results
   * 
   * @param instance - Form instance to validate
   * @returns Result with validation results
   */
  async validateReturn(
    instance: FormInstance
  ): AsyncResult<readonly ValidationResult[], ApiClientError> {
    return this.retryOperation(
      async () => this.validateReturnInternal(instance),
      `validateReturn(${instance.instanceId})`
    );
  }

  /**
   * Internal implementation of return validation
   */
  private async validateReturnInternal(
    instance: FormInstance
  ): AsyncResult<readonly ValidationResult[], ApiClientError> {
    const authResult = await this.ensureAuthenticated();
    if (!authResult.success) {
      return authResult;
    }

    const queryParams = new URLSearchParams({
      validationResultDetails: 'true',
    });

    const path = `/agilereporter/rest/api/v1/returns/${encodeURIComponent(instance.instanceId)}/validation?${queryParams}`;
    const url = `https://${this.host}${path}`;

    const headers = {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
    } as const;

    try {
      logger.info(`Fetching validation results for ${instance.instanceId}`);

      const response = await this.axiosInstance.put(url, null, {
        headers,
        decompress: true,
        timeout: 600000, // 10 minutes
      });

      if (response.status !== 200) {
        return {
          success: false,
          error: new ApiClientError(
            `Request failed with status ${response.status}`,
            ApiErrorCode.REQUEST_FAILED,
            response.status
          ),
        };
      }

      logger.info(`Received validation response for ${instance.instanceId}`);

      // Parse validation results
      const validations = this.parseValidationResults(response.data, instance);

      logger.info(`Retrieved ${validations.length} validation records`);

      return { success: true, data: validations };
    } catch (error) {
      logger.error(`Failed to validate return ${instance.instanceId}`, { error });

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: ApiClientError.fromAxiosError(error),
        };
      }

      return {
        success: false,
        error: new ApiClientError(
          this.getErrorMessage(error),
          ApiErrorCode.REQUEST_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  // ============================================
  // PARSING HELPERS
  // ============================================

  /**
   * Parse variance records from API response
   * 
   * @param data - Validated variance records from API
   * @param instance1 - First instance
   * @param instance2 - Second instance
   * @returns Parsed variance records
   */
  private parseVarianceRecords(
    data: z.infer<typeof VarianceRecordSchema>[],
    instance1: FormInstance,
    instance2: FormInstance
  ): ReadonlyArray<Record<string, unknown>> {
    const variances: Array<Record<string, unknown>> = [];

    for (const record of data) {
      const cell = record.cell;
      const cellName = cell.subtotal ? `${cell.name} (Subtotal)` : cell.name;
      const descValue = cell.description || '';
      const instances = record.instances;

      // Get instance values
      const instance1Value = instances[0]?.cellNotPresent ? '' : instances[0]?.value ?? '';
      const instance2Value = instances[1]?.cellNotPresent ? '' : instances[1]?.value ?? '';

      // Get difference values
      let diffValue: unknown;
      let diffPerc: unknown;

      if (!instances[1]?.difference) {
        diffValue = instances[1]?.value ?? '';
        diffPerc = '';
      } else {
        diffValue = instances[1].difference.valueDiff;
        diffPerc = instances[1].difference.percentageDiff;
      }

      // Skip GRID keys
      if (!/GRID\d*KEY/.test(cell.name)) {
        const variance: Record<string, unknown> = {
          'Cell Reference': cellName,
          'Cell Description': descValue,
          [instance1.refDate]: instance1Value,
          [instance2.refDate]: instance2Value,
          'Difference': diffValue,
          '% Difference': diffPerc,
        };
        variances.push(variance);
      }
    }

    // Sort by cell reference
    variances.sort((a, b) => {
      const refA = String(a['Cell Reference']);
      const refB = String(b['Cell Reference']);
      return refA.localeCompare(refB);
    });

    return variances;
  }

  /**
   * Parse validation results from API response
   * 
   * @param data - Raw API response data
   * @param instance - Form instance
   * @returns Parsed validation results
   */
  private parseValidationResults(
    data: unknown,
    instance: FormInstance
  ): readonly ValidationResult[] {
    // Validate response structure
    const responseSchema = z.object({
      validationDetails: z.array(z.unknown()).optional(),
    });

    const parseResult = responseSchema.safeParse(data);
    if (!parseResult.success || !parseResult.data.validationDetails) {
      logger.warn('Invalid validation response structure, returning empty results');
      return [];
    }

    const validationResults: ValidationResult[] = [];

    for (const detail of parseResult.data.validationDetails) {
      const validationResult = ValidationResultSchema.safeParse(detail);
      if (!validationResult.success) {
        logger.warn('Skipping invalid validation detail', { error: validationResult.error });
        continue;
      }

      validationResults.push(validationResult.data);
    }

    const failures = validationResults.filter((v) => v.status === 'Fail').length;
    const warnings = validationResults.filter((v) => v.severity === 'Warning').length;

    logger.info(
      `Parsed ${validationResults.length} validation results for ${instance.instanceId}`
    );
    logger.info(`Failures: ${failures}, Warnings: ${warnings}`);

    return validationResults;
  }

  // ============================================
  // RETRY LOGIC
  // ============================================

  /**
   * Retry an operation with exponential backoff
   * 
   * @param operation - Async operation to retry
   * @param operationName - Name for logging
   * @returns Result from operation
   */
  private async retryOperation<T>(
    operation: () => AsyncResult<T, ApiClientError>,
    operationName: string
  ): AsyncResult<T, ApiClientError> {
    let lastError: ApiClientError | null = null;
    let delay = this.retryConfig.initialDelayMs;

    for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
      const result = await operation();

      if (result.success) {
        if (attempt > 0) {
          logger.info(`${operationName} succeeded on attempt ${attempt + 1}`);
        }
        return result;
      }

      lastError = result.error;

      // Don't retry if error is not retryable
      if (!result.error.isRetryable()) {
        logger.debug(`${operationName} failed with non-retryable error`);
        return result;
      }

      // Don't retry on last attempt
      if (attempt < this.retryConfig.maxRetries - 1) {
        logger.warn(
          `${operationName} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries}), retrying in ${delay}ms...`,
          { error: result.error.message }
        );

        await this.sleep(delay);

        // Exponential backoff with max delay cap
        delay = Math.min(
          delay * this.retryConfig.backoffMultiplier,
          this.retryConfig.maxDelayMs
        );
      }
    }

    logger.error(`${operationName} failed after ${this.retryConfig.maxRetries} attempts`);

    return {
      success: false,
      error: lastError ?? new ApiClientError(
        'Operation failed after retries',
        ApiErrorCode.REQUEST_FAILED
      ),
    };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Extract error message from unknown error
   * 
   * @param error - Unknown error object
   * @returns Error message string
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred';
  }

  /**
   * Check if client has valid authentication
   * 
   * @returns true if authenticated and token is valid
   */
  isAuthenticated(): boolean {
    return this.token !== null && !this.isTokenExpired();
  }

  /**
   * Get current token (if authenticated)
   * 
   * @returns Current access token or null
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Clear authentication state
   */
  clearAuthentication(): void {
    this.token = null;
    this.tokenExpiry = null;
    logger.debug('Authentication state cleared');
  }
}

// ============================================
// EXPORTS
// ============================================

export type { TokenResponse };
export { DEFAULT_RETRY_CONFIG };
export type { RetryConfig };