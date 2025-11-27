/**
 * Type-safe variance analysis engine with granular progress tracking
 * 
 * Features:
 * - Strict TypeScript typing throughout
 * - Result<T, E> pattern for error handling
 * - Granular progress events per form and action
 * - Concurrent processing with configurable limits
 * - Pure business logic with dependency injection
 * - Comprehensive error handling and logging
 * 
 * @module variance-analyzer
 */

import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import type {
  ReturnConfig,
  AnalysisResult,
  FormInstance,
  ValidationResult,
  Result,
  AsyncResult,
} from './types/index.js';
import { AgileReporterClient, ApiClientError } from './api-client.js';
import {
  findInstanceByDate,
  findInstanceBeforeDate,
  type InstanceSearchResult,
} from './data-processor.js';
import { logger } from './logger.js';

// ============================================
// ERROR TYPES
// ============================================

/**
 * Variance analyzer error codes
 */
export enum AnalyzerErrorCode {
  NO_BASE_INSTANCE = 'NO_BASE_INSTANCE',
  NO_COMPARISON_INSTANCE = 'NO_COMPARISON_INSTANCE',
  ANALYSIS_FAILED = 'ANALYSIS_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INSTANCE_LOOKUP_FAILED = 'INSTANCE_LOOKUP_FAILED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
}

/**
 * Variance analyzer error class
 */
export class VarianceAnalyzerError extends Error {
  constructor(
    message: string,
    public readonly code: AnalyzerErrorCode,
    public readonly formCode?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'VarianceAnalyzerError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VarianceAnalyzerError);
    }
  }
}

// ============================================
// PROGRESS EVENT TYPES
// ============================================

/**
 * Analysis step types for granular tracking
 */
export enum AnalysisStep {
  FETCHING_VERSIONS = 'FETCHING_VERSIONS',
  FINDING_BASE_INSTANCE = 'FINDING_BASE_INSTANCE',
  FINDING_COMPARISON_INSTANCE = 'FINDING_COMPARISON_INSTANCE',
  ANALYZING_VARIANCES = 'ANALYZING_VARIANCES',
  VALIDATING_RETURN = 'VALIDATING_RETURN',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
}

/**
 * Progress event for a specific form
 */
export interface FormProgressEvent {
  readonly type: 'form-progress';
  readonly formCode: string;
  readonly formName: string;
  readonly step: AnalysisStep;
  readonly message: string;
  readonly metadata?: {
    readonly instanceCount?: number;
    readonly baseDate?: string;
    readonly comparisonDate?: string;
    readonly varianceCount?: number;
    readonly errorCount?: number;
  };
}

/**
 * Overall progress event
 */
export interface OverallProgressEvent {
  readonly type: 'overall-progress';
  readonly current: number;
  readonly total: number;
  readonly completedForms: number;
  readonly failedForms: number;
  readonly message: string;
}

/**
 * Form completion event
 */
export interface FormCompleteEvent {
  readonly type: 'form-complete';
  readonly formCode: string;
  readonly formName: string;
  readonly success: boolean;
  readonly result?: AnalysisResult;
  readonly error?: VarianceAnalyzerError | ApiClientError;
}

/**
 * Analysis completion event
 */
export interface AnalysisCompleteEvent {
  readonly type: 'analysis-complete';
  readonly totalForms: number;
  readonly successfulForms: number;
  readonly failedForms: number;
  readonly results: readonly AnalysisResult[];
  readonly duration: number;
}

/**
 * Union of all progress event types
 */
export type ProgressEvent =
  | FormProgressEvent
  | OverallProgressEvent
  | FormCompleteEvent
  | AnalysisCompleteEvent;

// ============================================
// CONFIGURATION
// ============================================

/**
 * Analyzer configuration options
 */
export interface AnalyzerConfig {
  /**
   * Maximum number of concurrent form analyses
   * @default 3
   */
  readonly concurrency?: number;

  /**
   * Whether to continue on individual form failures
   * @default true
   */
  readonly continueOnError?: boolean;

  /**
   * Whether to fetch validation results
   * @default true
   */
  readonly fetchValidations?: boolean;
}

/**
 * Default analyzer configuration
 */
const DEFAULT_CONFIG: Required<AnalyzerConfig> = {
  concurrency: 3,
  continueOnError: true,
  fetchValidations: true,
} as const;

// ============================================
// TYPE-SAFE EVENT EMITTER
// ============================================

/**
 * Type-safe event emitter for variance analyzer
 */
export interface VarianceAnalyzerEvents {
  'form-progress': (event: FormProgressEvent) => void;
  'overall-progress': (event: OverallProgressEvent) => void;
  'form-complete': (event: FormCompleteEvent) => void;
  'analysis-complete': (event: AnalysisCompleteEvent) => void;
}

/**
 * Type-safe EventEmitter extension
 */
export declare interface VarianceAnalyzer {
  on<E extends keyof VarianceAnalyzerEvents>(
    event: E,
    listener: VarianceAnalyzerEvents[E]
  ): this;

  emit<E extends keyof VarianceAnalyzerEvents>(
    event: E,
    ...args: Parameters<VarianceAnalyzerEvents[E]>
  ): boolean;

  off<E extends keyof VarianceAnalyzerEvents>(
    event: E,
    listener: VarianceAnalyzerEvents[E]
  ): this;

  once<E extends keyof VarianceAnalyzerEvents>(
    event: E,
    listener: VarianceAnalyzerEvents[E]
  ): this;
}

// ============================================
// VARIANCE ANALYZER
// ============================================

/**
 * Type-safe variance analyzer with granular progress tracking
 */
export class VarianceAnalyzer extends EventEmitter {
  private readonly config: Required<AnalyzerConfig>;

  constructor(
    private readonly client: AgileReporterClient,
    config?: AnalyzerConfig
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Analyze multiple returns against a base date
   */
  async analyzeReturns(
    returns: readonly ReturnConfig[],
    baseDate: string
  ): AsyncResult<readonly AnalysisResult[], VarianceAnalyzerError> {
    const startTime = Date.now();

    if (returns.length === 0) {
      return {
        success: false,
        error: new VarianceAnalyzerError(
          'No returns provided for analysis',
          AnalyzerErrorCode.INVALID_CONFIGURATION
        ),
      };
    }

    logger.info('Starting variance analysis', {
      formCount: returns.length,
      baseDate,
      concurrency: this.config.concurrency,
    });

    this.emitOverallProgress(0, returns.length, 0, 0, 'Initializing analysis...');

    const results: AnalysisResult[] = [];
    const failures: Array<{
      formCode: string;
      error: VarianceAnalyzerError | ApiClientError;
    }> = [];

    const limit = pLimit(this.config.concurrency);
    let completedForms = 0;

    const analysisPromises = returns.map((returnConfig) =>
      limit(async (): Promise<void> => {
        const result = await this.analyzeReturn(returnConfig, baseDate);

        completedForms++;

        if (result.success) {
          results.push(result.data);
          this.emitFormComplete(returnConfig, true, result.data);
        } else {
          failures.push({
            formCode: returnConfig.code,
            error: result.error,
          });
          this.emitFormComplete(returnConfig, false, undefined, result.error);
        }

        this.emitOverallProgress(
          completedForms,
          returns.length,
          results.length,
          failures.length,
          `Completed ${completedForms}/${returns.length} forms`
        );
      })
    );

    await Promise.all(analysisPromises);

    const duration = Date.now() - startTime;

    this.emit('analysis-complete', {
      type: 'analysis-complete',
      totalForms: returns.length,
      successfulForms: results.length,
      failedForms: failures.length,
      results,
      duration,
    });

    logger.info('Analysis complete', {
      totalForms: returns.length,
      successfulForms: results.length,
      failedForms: failures.length,
      durationMs: duration,
    });

    if (failures.length > 0) {
      logger.warn('Some forms failed to analyze', {
        failedForms: failures.map((f) => ({
          formCode: f.formCode,
          error: f.error.message,
        })),
      });
    }

    if (results.length === 0) {
      return {
        success: false,
        error: new VarianceAnalyzerError(
          'All forms failed to analyze',
          AnalyzerErrorCode.ANALYSIS_FAILED
        ),
      };
    }

    return { success: true, data: results };
  }

  // ============================================
  // SINGLE FORM ANALYSIS
  // ============================================

  /**
   * Analyze a single return against the base date
   */
  private async analyzeReturn(
    returnConfig: ReturnConfig,
    baseDate: string
  ): AsyncResult<AnalysisResult, VarianceAnalyzerError | ApiClientError> {
    logger.info(`Starting analysis: ${returnConfig.name} (${returnConfig.code})`);

    try {
      // Step 1: Fetch form versions
      this.emitFormProgress(
        returnConfig,
        AnalysisStep.FETCHING_VERSIONS,
        'Fetching form versions...'
      );

      const versionsResult = await this.fetchFormVersions(returnConfig);
      if (!versionsResult.success) {
        return versionsResult;
      }

      const instances = versionsResult.data;

      logger.debug(`Found ${instances.length} instances for ${returnConfig.code}`);

      this.emitFormProgress(
        returnConfig,
        AnalysisStep.FETCHING_VERSIONS,
        `Found ${instances.length} versions`,
        { instanceCount: instances.length }
      );

      // Step 2: Find base instance
      this.emitFormProgress(
        returnConfig,
        AnalysisStep.FINDING_BASE_INSTANCE,
        `Finding base instance (${baseDate})...`
      );

      const baseInstanceResult = await this.findBaseInstance(
        returnConfig,
        instances,
        baseDate
      );
      if (!baseInstanceResult.success) {
        return baseInstanceResult;
      }

      const baseInstance = baseInstanceResult.data.instance;

      logger.info(`Base instance: ${baseInstance.referenceDate}`, {
        formCode: returnConfig.code,
        instanceId: baseInstance.id,
      });

      this.emitFormProgress(
        returnConfig,
        AnalysisStep.FINDING_BASE_INSTANCE,
        `Base instance: ${baseInstance.referenceDate}`,
        { baseDate: baseInstance.referenceDate }
      );

      // Step 3: Find comparison instance
      this.emitFormProgress(
        returnConfig,
        AnalysisStep.FINDING_COMPARISON_INSTANCE,
        'Finding comparison instance...'
      );

      const comparisonInstanceResult = await this.findComparisonInstance(
        returnConfig,
        instances,
        baseDate
      );
      if (!comparisonInstanceResult.success) {
        return comparisonInstanceResult;
      }

      const comparisonInstance = comparisonInstanceResult.data.instance;

      logger.info(`Comparison instance: ${comparisonInstance.referenceDate}`, {
        formCode: returnConfig.code,
        instanceId: comparisonInstance.id,
      });

      this.emitFormProgress(
        returnConfig,
        AnalysisStep.FINDING_COMPARISON_INSTANCE,
        `Comparison: ${comparisonInstance.referenceDate}`,
        { comparisonDate: comparisonInstance.referenceDate }
      );

      // Step 4: Analyze variances
      this.emitFormProgress(
        returnConfig,
        AnalysisStep.ANALYZING_VARIANCES,
        'Analyzing variances...'
      );

      const variancesResult = await this.analyzeVariances(
        returnConfig,
        comparisonInstance,
        baseInstance
      );
      if (!variancesResult.success) {
        return variancesResult;
      }

      const variances = variancesResult.data;

      logger.info(`Retrieved ${variances.length} variance records`, {
        formCode: returnConfig.code,
      });

      this.emitFormProgress(
        returnConfig,
        AnalysisStep.ANALYZING_VARIANCES,
        `Found ${variances.length} variances`,
        { varianceCount: variances.length }
      );

      // Step 5: Fetch validations (optional)
      let validationErrors: readonly ValidationResult[] = [];

      if (this.config.fetchValidations) {
        this.emitFormProgress(
          returnConfig,
          AnalysisStep.VALIDATING_RETURN,
          'Fetching validation results...'
        );

        const validationsResult = await this.fetchValidations(
          returnConfig,
          baseInstance
        );

        if (validationsResult.success) {
          validationErrors = validationsResult.data;
          logger.info(`Found ${validationErrors.length} validation errors`, {
            formCode: returnConfig.code,
          });

          this.emitFormProgress(
            returnConfig,
            AnalysisStep.VALIDATING_RETURN,
            `Found ${validationErrors.length} validation errors`,
            { errorCount: validationErrors.length }
          );
        } else {
          logger.warn('Validation failed, continuing without validation results', {
            formCode: returnConfig.code,
            error: validationsResult.error.message,
          });
        }
      }

      // Create result
      const result: AnalysisResult = {
        formName: returnConfig.name,
        formCode: returnConfig.code,
        confirmed: returnConfig.confirmed ?? false,
        baseInstance,
        comparisonInstance,
        variances,
        validationsErrors: validationErrors,
      };

      this.emitFormProgress(
        returnConfig,
        AnalysisStep.COMPLETE,
        'Analysis complete',
        {
          varianceCount: variances.length,
          errorCount: validationErrors.length,
        }
      );

      logger.info(`Analysis complete: ${returnConfig.name}`, {
        varianceCount: variances.length,
        errorCount: validationErrors.length,
      });

      return { success: true, data: result };
    } catch (error) {
      const analyzerError = new VarianceAnalyzerError(
        `Unexpected error analyzing ${returnConfig.name}: ${this.getErrorMessage(error)}`,
        AnalyzerErrorCode.ANALYSIS_FAILED,
        returnConfig.code,
        error
      );

      this.emitFormProgress(
        returnConfig,
        AnalysisStep.FAILED,
        `Analysis failed: ${analyzerError.message}`
      );

      logger.error(`Analysis failed: ${returnConfig.name}`, { error });

      return { success: false, error: analyzerError };
    }
  }

  // ============================================
  // INDIVIDUAL STEPS
  // ============================================

  /**
   * Fetch all versions of a form
   */
  private async fetchFormVersions(
    returnConfig: ReturnConfig
  ): AsyncResult<readonly FormInstance[], VarianceAnalyzerError | ApiClientError> {
    const versionsResult = await this.client.getFormVersions(returnConfig.code);

    if (!versionsResult.success) {
      logger.error(`Failed to fetch versions: ${returnConfig.name}`, {
        error: versionsResult.error.message,
      });
      return versionsResult;
    }

    if (versionsResult.data.length === 0) {
      return {
        success: false,
        error: new VarianceAnalyzerError(
          `No instances found for ${returnConfig.code}`,
          AnalyzerErrorCode.INSTANCE_LOOKUP_FAILED,
          returnConfig.code
        ),
      };
    }

    return versionsResult;
  }

  /**
   * Find base instance by date
   */
  private async findBaseInstance(
    returnConfig: ReturnConfig,
    instances: readonly FormInstance[],
    baseDate: string
  ): AsyncResult<InstanceSearchResult, VarianceAnalyzerError> {
    const baseResult = findInstanceByDate(instances, baseDate);

    if (!baseResult.success) {
      logger.error(`No base instance found: ${returnConfig.name}`, {
        baseDate,
        error: baseResult.error.message,
      });

      return {
        success: false,
        error: new VarianceAnalyzerError(
          `No base instance found for ${returnConfig.code} on ${baseDate}`,
          AnalyzerErrorCode.NO_BASE_INSTANCE,
          returnConfig.code,
          baseResult.error
        ),
      };
    }

    return baseResult;
  }

  /**
   * Find comparison instance
   */
  private async findComparisonInstance(
    returnConfig: ReturnConfig,
    instances: readonly FormInstance[],
    baseDate: string
  ): AsyncResult<InstanceSearchResult, VarianceAnalyzerError> {
    let comparisonResult: Result<InstanceSearchResult, unknown>;

    if (returnConfig.expectedDate) {
      comparisonResult = findInstanceByDate(instances, returnConfig.expectedDate);

      if (!comparisonResult.success) {
        logger.warn(
          `Expected date not found, falling back to before date: ${returnConfig.name}`,
          { expectedDate: returnConfig.expectedDate }
        );

        comparisonResult = findInstanceBeforeDate(
          instances,
          returnConfig.expectedDate
        );
      }
    } else {
      comparisonResult = findInstanceBeforeDate(instances, baseDate);
    }

    if (!comparisonResult.success) {
      logger.error(`No comparison instance found: ${returnConfig.name}`, {
        error: comparisonResult.error,
      });

      return {
        success: false,
        error: new VarianceAnalyzerError(
          `No comparison instance found for ${returnConfig.code}`,
          AnalyzerErrorCode.NO_COMPARISON_INSTANCE,
          returnConfig.code,
          comparisonResult.error
        ),
      };
    }

    return comparisonResult;
  }

  /**
   * Analyze variances between two instances
   */
  /**
   * Analyze variances between two instances
   */
  private async analyzeVariances(
    returnConfig: ReturnConfig,
    comparisonInstance: FormInstance,
    baseInstance: FormInstance
  ): AsyncResult<ReadonlyArray<Record<string, unknown>>, VarianceAnalyzerError | ApiClientError> {
    const variancesResult = await this.client.getFormAnalysis(
      returnConfig.code,
      comparisonInstance,
      baseInstance
    );

    if (!variancesResult.success) {
      logger.error(`Variance analysis failed: ${returnConfig.name}`, {
        error: variancesResult.error.message,
      });
      return variancesResult;
    }

    return variancesResult;
  }
   
  /**
   * Fetch validation results
   */
  private async fetchValidations(
    returnConfig: ReturnConfig,
    baseInstance: FormInstance
  ): AsyncResult<readonly ValidationResult[], VarianceAnalyzerError | ApiClientError> {
    const validationsResult = await this.client.validateReturn(baseInstance);

    if (!validationsResult.success) {
      logger.warn(`Validation fetch failed: ${returnConfig.name}`, {
        error: validationsResult.error.message,
      });
      return validationsResult;
    }

    const failures = validationsResult.data.filter((v) => v.status === 'Fail');

    return { success: true, data: failures };
  }

  // ============================================
  // EVENT EMISSION HELPERS
  // ============================================

  /**
   * Emit form-specific progress event
   */
  private emitFormProgress(
    returnConfig: ReturnConfig,
    step: AnalysisStep,
    message: string,
    metadata?: FormProgressEvent['metadata']
  ): void {
    const event: FormProgressEvent = {
      type: 'form-progress',
      formCode: returnConfig.code,
      formName: returnConfig.name,
      step,
      message,
      metadata,
    };

    this.emit('form-progress', event);
  }

  /**
   * Emit overall progress event
   */
  private emitOverallProgress(
    current: number,
    total: number,
    completedForms: number,
    failedForms: number,
    message: string
  ): void {
    const event: OverallProgressEvent = {
      type: 'overall-progress',
      current,
      total,
      completedForms,
      failedForms,
      message,
    };

    this.emit('overall-progress', event);
  }

  /**
   * Emit form completion event
   */
  private emitFormComplete(
    returnConfig: ReturnConfig,
    success: boolean,
    result?: AnalysisResult,
    error?: VarianceAnalyzerError | ApiClientError
  ): void {
    const event: FormCompleteEvent = {
      type: 'form-complete',
      formCode: returnConfig.code,
      formName: returnConfig.name,
      success,
      result,
      error,
    };

    this.emit('form-complete', event);
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Extract error message from unknown error
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
   * Get current configuration
   */
  getConfig(): Readonly<Required<AnalyzerConfig>> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<AnalyzerConfig>): void {
    Object.assign(this.config, config);
    logger.debug('Analyzer configuration updated', { config: this.config });
  }
}
