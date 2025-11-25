# Complete TypeScript Refactoring Guide

## Overview

This guide provides the complete approach to refactoring the variance analysis tool to be 100% TypeScript-safe while maintaining all functionality and preparing for Next.js migration.

## What Has Been Completed

### 1. Type System (`src/types/index.ts`)
- ✅ Comprehensive interfaces for all data structures
- ✅ Branded types for IDs (ReportId, FormCode, CellReference)
- ✅ Result<T, E> type for error handling
- ✅ Type guards for runtime checking
- ✅ Utility types (DeepReadonly, NonEmptyArray, etc.)

### 2. Validation Layer (`src/validation/schemas.ts`)
- ✅ Zod schemas for all data types
- ✅ Runtime validation functions
- ✅ Environment variable validation
- ✅ Error formatting helpers

### 3. Configuration (`src/config.ts`)
- ✅ Type-safe configuration management
- ✅ Validated environment variables
- ✅ Readonly configuration objects
- ✅ Backward compatibility layer

## Files That Need Refactoring

### Priority 1: Core Infrastructure

#### 1. `src/api-client.ts`

**Current Issues:**
- Uses `any` for axios responses
- No validation of API responses
- Error handling not type-safe
- Token management not strictly typed

**Refactoring Plan:**

```typescript
/**
 * Type-safe AgileReporter API client
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import https from 'https';
import { z } from 'zod';
import type {
  AuthConfig,
  APIConfig,
  FormInstance,
  ValidationResult,
  Result,
} from './types/index.js';
import {
  validateFormInstances,
  validateValidationResults,
} from './validation/schemas.js';
import { logger } from './logger.js';

/**
 * OAuth token response schema
 */
const TokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});

type TokenResponse = z.infer<typeof TokenResponseSchema>;

/**
 * API client error types
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * Type-safe AgileReporter API client
 */
export class AgileReporterClient {
  private token: string | null = null;
  private tokenExpiry: number | null = null;
  private readonly host: string;
  private readonly axiosInstance: AxiosInstance;

  constructor(
    private readonly authConfig: Readonly<AuthConfig>,
    private readonly apiConfig: Readonly<APIConfig>
  ) {
    // Extract host from base URL
    const url = new URL(apiConfig.baseUrl);
    this.host = url.host;

    // Create axios instance with strict typing
    this.axiosInstance = axios.create({
      httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: 10,
      }),
      timeout: 1200000, // 20 minutes
      validateStatus: (status) => status >= 200 && status < 500,
    });
  }

  /**
   * Authenticate and get access token
   * @returns Result with token or error
   */
  async authenticate(): Promise<Result<string, ApiClientError>> {
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
            'AUTH_FAILED',
            response.status
          ),
        };
      }

      // Validate and parse response
      const parseResult = TokenResponseSchema.safeParse(response.data);
      if (!parseResult.success) {
        return {
          success: false,
          error: new ApiClientError(
            'Invalid token response format',
            'INVALID_RESPONSE'
          ),
        };
      }

      const tokenData = parseResult.data;
      this.token = tokenData.access_token;
      
      // Calculate token expiry if provided
      if (tokenData.expires_in) {
        this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
      }

      logger.info('Authentication successful');
      return { success: true, data: this.token };
    } catch (error) {
      logger.error('Authentication failed', { error });
      return {
        success: false,
        error: new ApiClientError(
          this.getErrorMessage(error),
          'AUTH_ERROR'
        ),
      };
    }
  }

  /**
   * Get all versions/instances of a form
   * @param formCode - Form code to fetch
   * @returns Result with form instances or error
   */
  async getFormVersions(
    formCode: string
  ): Promise<Result<readonly FormInstance[], ApiClientError>> {
    const authResult = await this.ensureAuthenticated();
    if (!authResult.success) {
      return authResult;
    }

    const path = `/agilereporter/rest/api/returns?productPrefix=APRA&entityCode=PBL&formCode=${formCode}`;
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
            'REQUEST_FAILED',
            response.status
          ),
        };
      }

      // Validate response
      const instances = validateFormInstances(response.data);

      // Sort by reference date
      const sorted = [...instances].sort((a, b) => 
        a.refDate.localeCompare(b.refDate)
      );

      logger.debug(`Retrieved ${sorted.length} versions for ${formCode}`);

      return { success: true, data: sorted };
    } catch (error) {
      logger.error(`Failed to get form versions for ${formCode}`, { error });
      return {
        success: false,
        error: new ApiClientError(
          this.getErrorMessage(error),
          'FETCH_ERROR'
        ),
      };
    }
  }

  /**
   * Ensure client is authenticated, refresh if needed
   * @returns Result with success or auth error
   */
  private async ensureAuthenticated(): Promise<Result<void, ApiClientError>> {
    if (!this.token || this.isTokenExpired()) {
      const authResult = await this.authenticate();
      if (!authResult.success) {
        return authResult;
      }
    }
    return { success: true, data: undefined };
  }

  /**
   * Check if token is expired
   * @returns true if token is expired
   */
  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) {
      return false; // No expiry set, assume valid
    }
    // Add 5 minute buffer
    return Date.now() > (this.tokenExpiry - 300000);
  }

  /**
   * Extract error message from unknown error
   * @param error - Unknown error object
   * @returns Error message string
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (axios.isAxiosError(error)) {
      return error.message;
    }
    return String(error);
  }
}
```

**Key Improvements:**
1. All methods return `Result<T, E>` type
2. Strict typing for axios responses
3. Zod validation for API responses
4. Custom error class with error codes
5. Token expiry management
6. Type-safe headers and configurations

#### 2. `src/variance-analyzer.ts`

**Current Issues:**
- Event emitter not strictly typed
- No validation of analysis results
- Progress events loosely typed
- Error handling not consistent

**Refactoring Approach:**

```typescript
import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import type {
  ReturnConfig,
  AnalysisResult,
  FormInstance,
  ValidationResult,
  ProgressEvent,
  Result,
} from './types/index.js';
import { AgileReporterClient, ApiClientError } from './api-client.js';
import { DataProcessor } from './data-processor.js';
import { logger } from './logger.js';

/**
 * Analysis error type
 */
export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly formCode: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

/**
 * Typed event emitter for progress events
 */
interface AnalyzerEvents {
  progress: (event: ProgressEvent) => void;
  error: (error: AnalysisError) => void;
}

/**
 * Declare event emitter interface for TypeScript
 */
declare interface VarianceAnalyzer {
  on<U extends keyof AnalyzerEvents>(
    event: U,
    listener: AnalyzerEvents[U]
  ): this;
  emit<U extends keyof AnalyzerEvents>(
    event: U,
    ...args: Parameters<AnalyzerEvents[U]>
  ): boolean;
}

/**
 * Variance analyzer with strict typing and error handling
 */
class VarianceAnalyzer extends EventEmitter {
  constructor(private readonly client: AgileReporterClient) {
    super();
  }

  /**
   * Analyze multiple returns against a base date
   * @param returns - Return configurations
   * @param baseDate - Base date for comparison
   * @returns Result with analysis results or errors
   */
  async analyzeReturns(
    returns: readonly ReturnConfig[],
    baseDate: string
  ): Promise<Result<readonly AnalysisResult[], AnalysisError>> {
    const limit = pLimit(3);
    const results: AnalysisResult[] = [];
    const errors: AnalysisError[] = [];

    const totalSteps = returns.length * 3;
    let currentStep = 0;

    this.emitProgress('analyzing', currentStep, totalSteps, 'Starting...');

    const promises = returns.map((returnConfig) =>
      limit(async () => {
        try {
          currentStep++;
          this.emitProgress(
            'analyzing',
            currentStep,
            totalSteps,
            `Fetching ${returnConfig.name} versions`
          );

          const result = await this.analyzeReturn(returnConfig, baseDate);
          
          if (result.success) {
            results.push(result.data);
          } else {
            errors.push(result.error);
            this.emit('error', result.error);
          }
        } catch (error) {
          const analysisError = new AnalysisError(
            `Unexpected error analyzing ${returnConfig.name}`,
            returnConfig.code,
            error instanceof Error ? error : undefined
          );
          errors.push(analysisError);
          this.emit('error', analysisError);
        }
      })
    );

    await Promise.all(promises);

    if (results.length === 0) {
      return {
        success: false,
        error: new AnalysisError(
          'No returns were successfully analyzed',
          'ALL',
          errors[0]
        ),
      };
    }

    if (errors.length > 0) {
      logger.warn(`Completed with ${errors.length} errors`);
    }

    return { success: true, data: results };
  }

  /**
   * Emit typed progress event
   */
  private emitProgress(
    step: string,
    current: number,
    total: number,
    message: string
  ): void {
    this.emit('progress', {
      type: 'progress',
      step,
      current,
      total,
      message,
    });
  }

  /**
   * Analyze single return (implementation continues...)
   */
  private async analyzeReturn(
    returnConfig: ReturnConfig,
    baseDate: string
  ): Promise<Result<AnalysisResult, AnalysisError>> {
    // Implementation with strict typing...
  }
}
```

### Priority 2: Database Layer

#### `src/db-manager.ts`

**Key Changes:**
- Use branded types for IDs
- Return Result<T, E> for all operations
- Strict typing for SQLite queries
- Transaction support
- Connection pooling

### Priority 3: Excel Export

#### `src/excel-exporter.ts`

**Key Changes:**
- Strict typing for ExcelJS operations
- Use ExcelConfig constants
- Type-safe color functions
- Validation of export data

## Next Steps

1. **Install Dependencies:**
```bash
npm install zod
npm install -D @types/node
```

2. **Update tsconfig.json:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"],
      "@types/*": ["./src/types/*"]
    }
  }
}
```

3. **Refactor Files in Order:**
   1. config.ts ✅
   2. types/index.ts ✅
   3. validation/schemas.ts ✅
   4. api-client.ts (in progress)
   5. data-processor.ts
   6. db-manager.ts
   7. variance-analyzer.ts
   8. excel-exporter.ts
   9. report-saver.ts
   10. main.ts

4. **Testing Strategy:**
   - Unit tests for each module
   - Integration tests for API client
   - E2E tests for complete workflow

## Benefits After Refactoring

1. **Type Safety:** Zero runtime type errors
2. **Better IntelliSense:** Full autocomplete
3. **Easier Refactoring:** Compiler catches breaking changes
4. **Runtime Validation:** Zod catches bad data early
5. **Error Handling:** Consistent Result<T, E> pattern
6. **Next.js Ready:** Clean API layer for migration

## Questions to Address

1. Should we use dependency injection for all services?
2. Do we want to add automated tests now or after refactoring?
3. Should we create a separate `@/lib` folder for shared utilities?
4. Do we want to add OpenAPI/tRPC now or wait for Next.js?

Let me know which file you'd like me to refactor next in complete detail!