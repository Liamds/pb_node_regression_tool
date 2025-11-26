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

### 4. API Client (`src/api-client.ts`)
- ✅ Axios integration
- ✅ Type-safe API responses
- ✅ Validation of API responses
- ✅ Retry logic with exponential backoff

## Files That Need Refactoring

### Priority 1: Core Infrastructure

#### 1. `src/variance-analyzer.ts`

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
   4. api-client.ts ✅
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