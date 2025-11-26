// ============================================
// CONFIGURATION TYPES
// ============================================

/**
 * Authentication configuration from environment
 */
export interface AuthConfig {
  readonly url: string;
  readonly username: string;
  readonly password: string;
  readonly grantType: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * API endpoint configuration
 */
export interface APIConfig {
  readonly baseUrl: string;
  readonly returnsEndpoint: string;
  readonly analysisEndpoint: string;
}

/**
 * Return configuration for analysis
 */
export interface ReturnConfig {
  readonly code: string;
  readonly name: string;
  readonly expectedDate?: string;
  readonly confirmed?: boolean;
}

/**
 * Complete analysis configuration file structure
 */
export interface ConfigFile {
  readonly baseDate: string;
  readonly returns: readonly ReturnConfig[];
  readonly excluded?: readonly ReturnConfig[];
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Form instance from AgileReporter API
 */
export interface FormInstance {
  readonly id: string;
  readonly referenceDate: string;
}

/**
 * Cell metadata from API
 */
export interface CellMetadata {
  readonly id: string;
  readonly physicalName: string;
  readonly viewCode: string;
}

/**
 * Cell business rule
 */
export interface CellBusinessRule {
  readonly id: number;
  readonly content: string;
  readonly seqNumber: string;
}

/**
 * Cell record header definition
 */
export interface CellRecordHeader {
  readonly columnName: string;
  readonly columnLabel: string;
  readonly description: string | null;
  readonly visible: boolean;
  readonly columnType: string;
  readonly valueType: string;
  readonly highlighted: boolean;
}

/**
 * Validation cell reference
 */
export interface ValidationCells {
  readonly cell: string;
  readonly value: string;
  readonly instanceId: string;
  readonly pageName: string;
  readonly form: string;
  readonly referenceDate: string;
}

/**
 * Validation result from API
 */
export interface ValidationResult {
  readonly severity: string;
  readonly expression: string;
  readonly status: string;
  readonly message: string | null;
  readonly referencedCells: readonly ValidationCells[];
}

/**
 * Variance record structure
 */
export interface VarianceRecord {
  readonly cellReference: string;
  readonly cellDescription: string;
  readonly instance1Value: unknown;
  readonly instance2Value: unknown;
  readonly difference: unknown;
  readonly percentDifference: unknown;
}

// ============================================
// ANALYSIS RESULT TYPES
// ============================================

/**
 * Complete analysis result for a single form
 */
export interface AnalysisResult {
  readonly formName: string;
  readonly formCode: string;
  readonly confirmed: boolean;
  readonly baseInstance: FormInstance;
  readonly comparisonInstance: FormInstance;
  readonly variances: ReadonlyArray<Record<string, unknown>>;
  readonly validationsErrors: readonly ValidationResult[];
}

/**
 * Summary record for dashboard
 */
export interface SummaryRecord {
  readonly formName: string;
  readonly formCode: string;
  readonly varianceCount: number;
  readonly validationErrorCount: number;
}

// ============================================
// DATABASE TYPES
// ============================================

/**
 * Report status enum
 */
export type ReportStatus = 'completed' | 'running' | 'failed';

/**
 * Report metadata stored in database
 */
export interface ReportMetadata {
  readonly id: string;
  readonly timestamp: string;
  readonly baseDate: string;
  readonly totalReturns: number;
  readonly totalVariances: number;
  readonly totalValidationErrors: number;
  readonly configFile: string;
  readonly outputFile: string;
  readonly duration: number;
  readonly status: ReportStatus;
  readonly createdAt?: string;
}

/**
 * Variance annotation category enum
 */
export type VarianceCategory = 'expected' | 'unexpected' | 'resolved' | 'investigating' | null;

/**
 * Variance annotation
 */
export interface VarianceAnnotation {
  readonly id?: number;
  readonly reportId: string;
  readonly formCode: string;
  readonly cellReference: string;
  readonly flagged: boolean;
  readonly category: VarianceCategory;
  readonly comment: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/**
 * Form detail record
 */
export interface FormDetail {
  readonly id?: number;
  readonly reportId: string;
  readonly formName: string;
  readonly formCode: string;
  readonly confirmed: boolean;
  readonly varianceCount: number;
  readonly validationErrorCount: number;
  readonly baseDate: string;
  readonly comparisonDate: string;
}

/**
 * Variance detail record
 */
export interface VarianceDetail {
  readonly id?: number;
  readonly reportId: string;
  readonly formCode: string;
  readonly cellReference: string;
  readonly cellDescription: string;
  readonly comparisonValue: string;
  readonly baseValue: string;
  readonly difference: string;
  readonly percentDifference: string;
}

/**
 * Variance with annotations
 */
export type VarianceWithAnnotation = VarianceDetail & Partial<VarianceAnnotation>;

/**
 * Statistics aggregate
 */
export interface Statistics {
  readonly totalReports: number;
  readonly completedReports: number;
  readonly failedReports: number;
  readonly runningReports: number;
  readonly totalVariances: number;
  readonly totalValidationErrors: number;
  readonly avgDuration: number;
}

/**
 * Form code with name
 */
export interface FormCodeWithName {
  readonly code: string;
  readonly name: string;
}

// ============================================
// DASHBOARD/API TYPES
// ============================================

/**
 * Progress update message types
 */
export type ProgressType = 'progress' | 'complete' | 'error' | 'log';

/**
 * Log level for console output
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Progress update payload
 */
export interface ProgressUpdate {
  readonly type: ProgressType;
  readonly current?: number;
  readonly total?: number;
  readonly currentItem?: string;
  readonly message?: string;
  readonly reportId?: string;
  readonly logLevel?: LogLevel;
}

/**
 * Running job state
 */
export interface RunningJob {
  readonly reportId: string;
  readonly configFile: string;
  readonly startTime: number;
  readonly process: NodeJS.Process;
}

/**
 * API filter parameters
 */
export interface ReportFilters {
  readonly status?: ReportStatus;
  readonly baseDate?: string;
  readonly formCode?: string;
}

/**
 * Analysis request payload
 */
export interface AnalysisRequest {
  readonly configFile: string;
  readonly outputFile?: string;
}

/**
 * Progress event from analyzer
 */
export interface ProgressEvent {
  readonly type: 'progress';
  readonly step: string;
  readonly current: number;
  readonly total: number;
  readonly message: string;
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Async result type
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Non-empty array type
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Ensure at least one property is present
 */
export type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U];

/**
 * Make specific properties required
 */
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/**
 * Deep readonly type
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends Record<string, unknown>
    ? DeepReadonly<T[P]>
    : T[P];
};

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if value is a valid ReportStatus
 */
export function isReportStatus(value: unknown): value is ReportStatus {
  return value === 'completed' || value === 'running' || value === 'failed';
}

/**
 * Check if value is a valid VarianceCategory
 */
export function isVarianceCategory(value: unknown): value is VarianceCategory {
  return (
    value === null ||
    value === 'expected' ||
    value === 'unexpected' ||
    value === 'resolved' ||
    value === 'investigating'
  );
}

/**
 * Check if value is a valid LogLevel
 */
export function isLogLevel(value: unknown): value is LogLevel {
  return (
    value === 'info' ||
    value === 'warn' ||
    value === 'error' ||
    value === 'debug'
  );
}

/**
 * Check if Result is successful
 */
export function isSuccess<T, E>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success === true;
}

/**
 * Check if Result is failure
 */
export function isFailure<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return result.success === false;
}

// ============================================
// BRANDED TYPES (for extra safety)
// ============================================

/**
 * Brand for report IDs
 */
export type ReportId = string & { readonly __brand: 'ReportId' };

/**
 * Brand for form codes
 */
export type FormCode = string & { readonly __brand: 'FormCode' };

/**
 * Brand for cell references
 */
export type CellReference = string & { readonly __brand: 'CellReference' };

/**
 * Create branded ReportId
 */
export function createReportId(id: string): ReportId {
  return id as ReportId;
}

/**
 * Create branded FormCode
 */
export function createFormCode(code: string): FormCode {
  return code as FormCode;
}

/**
 * Create branded CellReference
 */
export function createCellReference(ref: string): CellReference {
  return ref as CellReference;
}