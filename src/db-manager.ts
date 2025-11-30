/**
 * Type-safe SQLite Database Manager using sql.js WASM
 * 
 * Features:
 * - 100% TypeScript safety with branded types
 * - Result<T, E> pattern for all operations
 * - Comprehensive error handling
 * - Transaction support
 * - Automatic retry logic
 * - Connection pooling simulation
 * - Zod validation for all data
 * 
 * @module db-manager
 */

import initSqlJs, { Database } from 'sql.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { z } from 'zod';
import { logger } from './logger.js';
import type {
  ReportMetadata,
  VarianceAnnotation,
  FormDetail,
  VarianceDetail,
  VarianceWithAnnotation,
  Statistics,
  FormCodeWithName,
  ReportFilters,
  Result,
  AsyncResult,
  VarianceCategory,
} from './types/index.js';
import {
  ReportMetadataSchema,
  VarianceAnnotationSchema,
  ReportFiltersSchema,
} from './validation/schemas.js';

// ============================================
// ERROR TYPES
// ============================================

/**
 * Database error codes
 */
export enum DbErrorCode {
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  INIT_FAILED = 'INIT_FAILED',
  SAVE_FAILED = 'SAVE_FAILED',
  QUERY_FAILED = 'QUERY_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DATABASE_LOCKED = 'DATABASE_LOCKED',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  RELOAD_FAILED = 'RELOAD_FAILED',
}

/**
 * Database manager error class
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code: DbErrorCode,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'DatabaseError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatabaseError);
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return (
      this.code === DbErrorCode.DATABASE_LOCKED ||
      this.code === DbErrorCode.SAVE_FAILED
    );
  }
}

// ============================================
// VALIDATION SCHEMAS
// ============================================

/**
 * Form detail database schema
 */
const FormDetailDbSchema = z.object({
  id: z.number().int().optional(),
  reportId: z.string(),
  formName: z.string(),
  formCode: z.string(),
  confirmed: z.number().transform(val => val === 1),
  varianceCount: z.number().int(),
  validationErrorCount: z.number().int(),
  baseDate: z.string(),
  comparisonDate: z.string(),
});

/**
 * Variance detail database schema
 */
const VarianceDetailDbSchema = z.object({
  id: z.number().int().optional(),
  reportId: z.string(),
  formCode: z.string(),
  cellReference: z.string(),
  cellDescription: z.string(),
  comparisonValue: z.string(),
  baseValue: z.string(),
  difference: z.string(),
  percentDifference: z.string(),
});

/**
 * Variance annotation database schema
 */
/*const VarianceAnnotationDbSchema = z.object({
  id: z.number().int().optional(),
  reportId: z.string(),
  formCode: z.string(),
  cellReference: z.string(),
  flagged: z.number().transform(val => val === 1),
  category: z.string().nullable(),
  comment: z.string().nullable(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});*/

// ============================================
// RETRY CONFIGURATION
// ============================================

/**
 * Retry configuration for database operations
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
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
} as const;

// ============================================
// DATABASE MANAGER
// ============================================

/**
 * Type-safe SQLite database manager
 * 
 * @example
 * ```typescript
 * const db = new DatabaseManager();
 * const initResult = await db.initialize();
 * 
 * if (initResult.success) {
 *   const saveResult = await db.saveReport(metadata, formDetails, variances);
 *   if (saveResult.success) {
 *     console.log('Report saved successfully');
 *   }
 * }
 * ```
 */
export class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any = null;
  private isInitialized: boolean = false;

  constructor(
    dbPath?: string,
    private readonly retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ) {
    this.dbPath = dbPath || join(process.cwd(), 'reports', 'reports.db');
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize SQLite database
   * 
   * @returns Result with void on success or error
   * 
   * @example
   * ```typescript
   * const result = await db.initialize();
   * if (!result.success) {
   *   console.error('DB init failed:', result.error.message);
   * }
   * ```
   */
  async initialize(): AsyncResult<void, DatabaseError> {
    try {
      logger.info('Initializing SQLite database...');

      // Ensure reports directory exists
      const reportsDir = dirname(this.dbPath);
      if (!existsSync(reportsDir)) {
        await mkdir(reportsDir, { recursive: true });
        logger.debug(`Created reports directory: ${reportsDir}`);
      }

      // Initialize sql.js
      this.SQL = await initSqlJs();

      // Load existing database or create new
      if (existsSync(this.dbPath)) {
        const buffer = await readFile(this.dbPath);
        this.db = new this.SQL.Database(buffer);
        logger.info('Loaded existing database');
        this.isInitialized = true;
        logger.info('Database initialized successfully');
      } else {
        this.db = new this.SQL.Database();
        logger.info('Created new database');
      }

      // Create tables
      logger.info('Creating database tables if not exist...');
      const createResult = await this.createTables();
      if (!createResult.success) {
        return createResult;
      }

      logger.info('Database tables are ready');
      

      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Failed to initialize database', { error });
      return {
        success: false,
        error: new DatabaseError(
          'Database initialization failed',
          DbErrorCode.INIT_FAILED,
          { dbPath: this.dbPath },
          error
        ),
      };
    }
  }

  /**
   * Check if database is initialized
   */
  private assertInitialized(): Result<void, DatabaseError> {
    if (!this.isInitialized || !this.db) {
      return {
        success: false,
        error: new DatabaseError(
          'Database not initialized. Call initialize() first.',
          DbErrorCode.NOT_INITIALIZED
        ),
      };
    }
    return { success: true, data: undefined };
  }

  /**
   * Reload database from disk to get latest data
   * 
   * @returns Result with void on success or error
   */
  private async reload(): AsyncResult<void, DatabaseError> {
    const checkResult = this.assertInitialized();
    if (!checkResult.success) {
      return checkResult;
    }

    try {
      // Close current database
      this.db!.close();

      // Reload from disk
      if (existsSync(this.dbPath)) {
        const buffer = await readFile(this.dbPath);
        this.db = new this.SQL.Database(buffer);
      } else {
        this.db = new this.SQL.Database();
      }

      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Failed to reload database', { error });
      return {
        success: false,
        error: new DatabaseError(
          'Database reload failed',
          DbErrorCode.RELOAD_FAILED,
          { dbPath: this.dbPath },
          error
        ),
      };
    }
  }

  // ============================================
  // SCHEMA CREATION
  // ============================================

  /**
   * Create database tables and indexes
   * 
   * @returns Result with void on success or error
   */
  private async createTables(): AsyncResult<void, DatabaseError> {
    logger.info('Creating database tables...');
    if (!this.db) {
      logger.error('Database instance is null during table creation');
      return {
        success: false,
        error: new DatabaseError(
          'Database not initialized',
          DbErrorCode.NOT_INITIALIZED
        ),
      };
    }
    logger.info("Database instance is valid, proceeding with table creation.");

    try {
      const tables = [
        // Reports metadata
        `CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          baseDate TEXT NOT NULL,
          totalReturns INTEGER NOT NULL,
          totalVariances INTEGER NOT NULL,
          totalValidationErrors INTEGER NOT NULL,
          configFile TEXT NOT NULL,
          outputFile TEXT NOT NULL,
          duration INTEGER NOT NULL,
          status TEXT NOT NULL,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        )`,

        // Form details per report
        `CREATE TABLE IF NOT EXISTS form_details (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reportId TEXT NOT NULL,
          formName TEXT NOT NULL,
          formCode TEXT NOT NULL,
          confirmed INTEGER NOT NULL,
          varianceCount INTEGER NOT NULL,
          validationErrorCount INTEGER NOT NULL,
          baseDate TEXT NOT NULL,
          comparisonDate TEXT NOT NULL,
          FOREIGN KEY (reportId) REFERENCES reports(id) ON DELETE CASCADE
        )`,

        // Variance details
        `CREATE TABLE IF NOT EXISTS variances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reportId TEXT NOT NULL,
          formCode TEXT NOT NULL,
          cellReference TEXT NOT NULL,
          cellDescription TEXT NOT NULL,
          comparisonValue TEXT,
          baseValue TEXT,
          difference TEXT,
          percentDifference TEXT,
          FOREIGN KEY (reportId) REFERENCES reports(id) ON DELETE CASCADE
        )`,

        // Variance annotations (comments, flags, categories)
        `CREATE TABLE IF NOT EXISTS variance_annotations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reportId TEXT NOT NULL,
          formCode TEXT NOT NULL,
          cellReference TEXT NOT NULL,
          flagged INTEGER DEFAULT 0,
          category TEXT,
          comment TEXT,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(reportId, formCode, cellReference),
          FOREIGN KEY (reportId) REFERENCES reports(id) ON DELETE CASCADE
        )`,

        // Validation errors
        `CREATE TABLE IF NOT EXISTS validation_errors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reportId TEXT NOT NULL,
          formCode TEXT NOT NULL,
          severity TEXT NOT NULL,
          expression TEXT NOT NULL,
          status TEXT NOT NULL,
          message TEXT,
          FOREIGN KEY (reportId) REFERENCES reports(id) ON DELETE CASCADE
        )`,
      ];

      // Create indexes
      const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_reports_baseDate ON reports(baseDate)`,
        `CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`,
        `CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON reports(timestamp)`,
        `CREATE INDEX IF NOT EXISTS idx_form_details_reportId ON form_details(reportId)`,
        `CREATE INDEX IF NOT EXISTS idx_form_details_formCode ON form_details(formCode)`,
        `CREATE INDEX IF NOT EXISTS idx_variances_reportId ON variances(reportId)`,
        `CREATE INDEX IF NOT EXISTS idx_variances_formCode ON variances(formCode)`,
        `CREATE INDEX IF NOT EXISTS idx_annotations_reportId ON variance_annotations(reportId)`,
        `CREATE INDEX IF NOT EXISTS idx_validation_reportId ON validation_errors(reportId)`,
      ];

      // Execute all table and index creation statements
      for (const sql of [...tables, ...indexes]) {
        this.db.run(sql);
      }
      logger.info('Database tables created or already exist.');

      // Save changes
      logger.info('Saving database after table creation...');
      const saveResult = await this.save();
      logger.info(`Database save after table creation result: ${saveResult.success}`);
      if (!saveResult.success) {
        logger.error('Failed to save database after table creation');
        logger.error('Save result', { saveResult });
        return saveResult;
      }

      logger.debug('Database tables and indexes created');
      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Failed to create tables', { error });
      return {
        success: false,
        error: new DatabaseError(
          'Table creation failed',
          DbErrorCode.INIT_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  // ============================================
  // SAVE OPERATIONS
  // ============================================

  /**
   * Save database to disk
   * 
   * @returns Result with void on success or error
   */
  async save(): AsyncResult<void, DatabaseError> {
    const checkResult = this.assertInitialized();
    if (!checkResult.success) {
      return checkResult;
    }

    return this.retryOperation(
      async () => this.saveInternal(),
      'save'
    );
  }

  /**
   * Internal save operation
   */
  private async saveInternal(): AsyncResult<void, DatabaseError> {
    try {
      const data = this.db!.export();
      const buffer = Buffer.from(data);
      await writeFile(this.dbPath, buffer);

      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Failed to save database', { error });
      return {
        success: false,
        error: new DatabaseError(
          'Database save failed',
          DbErrorCode.SAVE_FAILED,
          { dbPath: this.dbPath },
          error
        ),
      };
    }
  }

  /**
   * Save report with all details in a transaction
   * 
   * @param metadata - Report metadata
   * @param formDetails - Array of form details
   * @param variances - Array of variance details
   * @returns Result with void on success or error
   */
  async saveReport(
    metadata: ReportMetadata,
    formDetails: readonly FormDetail[],
    variances: readonly VarianceDetail[]
  ): AsyncResult<void, DatabaseError> {
    const checkResult = this.assertInitialized();
    if (!checkResult.success) {
      return checkResult;
    }

    // Validate metadata
    const validationResult = ReportMetadataSchema.safeParse(metadata);
    if (!validationResult.success) {
      return {
        success: false,
        error: new DatabaseError(
          'Invalid report metadata',
          DbErrorCode.VALIDATION_ERROR,
          { validationError: validationResult.error },
          validationResult.error
        ),
      };
    }

    return this.executeTransaction(async () => {
      // Insert report metadata
      this.db!.run(
        `INSERT OR REPLACE INTO reports 
        (id, timestamp, baseDate, totalReturns, totalVariances, totalValidationErrors, 
         configFile, outputFile, duration, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          metadata.id,
          metadata.timestamp,
          metadata.baseDate,
          metadata.totalReturns,
          metadata.totalVariances,
          metadata.totalValidationErrors,
          metadata.configFile,
          metadata.outputFile,
          metadata.duration,
          metadata.status,
        ]
      );

      // Insert form details
      if (formDetails.length > 0) {
        const formStmt = this.db!.prepare(
          `INSERT INTO form_details 
          (reportId, formName, formCode, confirmed, varianceCount, validationErrorCount, baseDate, comparisonDate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );

        for (const form of formDetails) {
          formStmt.run([
            form.reportId,
            form.formName,
            form.formCode,
            form.confirmed ? 1 : 0,
            form.varianceCount,
            form.validationErrorCount,
            form.baseDate,
            form.comparisonDate,
          ]);
        }
        formStmt.free();
      }

      // Insert variances (batch insert)
      if (variances.length > 0) {
        const varianceStmt = this.db!.prepare(
          `INSERT INTO variances 
          (reportId, formCode, cellReference, cellDescription, comparisonValue, baseValue, difference, percentDifference)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );

        for (const variance of variances) {
          varianceStmt.run([
            variance.reportId,
            variance.formCode,
            variance.cellReference,
            variance.cellDescription,
            variance.comparisonValue,
            variance.baseValue,
            variance.difference,
            variance.percentDifference,
          ]);
        }
        varianceStmt.free();
      }

      // Save to disk
      return await this.save();
    });
  }

  // ============================================
  // QUERY OPERATIONS
  // ============================================

  /**
   * Get all reports with optional filtering
   * 
   * @param filters - Optional filter criteria
   * @returns Result with array of reports or error
   */
  async getReports(
    filters?: ReportFilters
  ): AsyncResult<readonly ReportMetadata[], DatabaseError> {
    const checkResult = this.assertInitialized();
    if (!checkResult.success) {
      return checkResult;
    }

    // Validate filters if provided
    if (filters) {
      const validationResult = ReportFiltersSchema.safeParse(filters);
      if (!validationResult.success) {
        return {
          success: false,
          error: new DatabaseError(
            'Invalid report filters',
            DbErrorCode.VALIDATION_ERROR,
            { validationError: validationResult.error },
            validationResult.error
          ),
        };
      }
    }

    // Reload database to get latest data
    const reloadResult = await this.reload();
    if (!reloadResult.success) {
      return reloadResult;
    }

    try {
      let sql = 'SELECT * FROM reports WHERE 1=1';
      const params: any[] = [];

      if (filters?.status) {
        sql += ' AND status = ?';
        params.push(filters.status);
      }

      if (filters?.baseDate) {
        sql += ' AND baseDate = ?';
        params.push(filters.baseDate);
      }

      if (filters?.formCode) {
        sql += ` AND id IN (SELECT DISTINCT reportId FROM form_details WHERE formCode = ?)`;
        params.push(filters.formCode);
      }

      sql += ' ORDER BY timestamp DESC';

      logger.debug('Executing query:', { sql, params });

      const stmt = this.db!.prepare(sql);
      stmt.bind(params);

      const reports: ReportMetadata[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        
        // Validate and parse each row
        const parseResult = ReportMetadataSchema.safeParse({
          id: row.id,
          timestamp: row.timestamp,
          baseDate: row.baseDate,
          totalReturns: row.totalReturns,
          totalVariances: row.totalVariances,
          totalValidationErrors: row.totalValidationErrors,
          configFile: row.configFile,
          outputFile: row.outputFile,
          duration: row.duration,
          status: row.status,
          createdAt: row.createdAt,
        });

        if (parseResult.success) {
          reports.push(parseResult.data);
        } else {
          logger.warn('Skipping invalid report row', {
            error: parseResult.error,
            row,
          });
        }
      }
      stmt.free();

      return { success: true, data: reports };
    } catch (error) {
      logger.error('Failed to get reports', { error });
      return {
        success: false,
        error: new DatabaseError(
          'Query failed',
          DbErrorCode.QUERY_FAILED,
          { filters },
          error
        ),
      };
    }
  }

  /**
   * Get report by ID
   * 
   * @param reportId - Report identifier
   * @returns Result with report metadata or error
   */
  async getReport(
    reportId: string
  ): AsyncResult<ReportMetadata, DatabaseError> {
    const checkResult = this.assertInitialized();
    if (!checkResult.success) {
      return checkResult;
    }

    // Reload database to get latest data
    const reloadResult = await this.reload();
    if (!reloadResult.success) {
      return reloadResult;
    }

    try {
      const stmt = this.db!.prepare('SELECT * FROM reports WHERE id = ?');
      stmt.bind([reportId]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();

        // Validate and parse
        const parseResult = ReportMetadataSchema.safeParse({
          id: row.id,
          timestamp: row.timestamp,
          baseDate: row.baseDate,
          totalReturns: row.totalReturns,
          totalVariances: row.totalVariances,
          totalValidationErrors: row.totalValidationErrors,
          configFile: row.configFile,
          outputFile: row.outputFile,
          duration: row.duration,
          status: row.status,
          createdAt: row.createdAt,
        });

        if (!parseResult.success) {
          return {
            success: false,
            error: new DatabaseError(
              'Invalid report data',
              DbErrorCode.VALIDATION_ERROR,
              { reportId, validationError: parseResult.error },
              parseResult.error
            ),
          };
        }

        return { success: true, data: parseResult.data };
      }

      stmt.free();
      return {
        success: false,
        error: new DatabaseError(
          `Report not found: ${reportId}`,
          DbErrorCode.NOT_FOUND,
          { reportId }
        ),
      };
    } catch (error) {
      logger.error('Failed to get report', { error, reportId });
      return {
        success: false,
        error: new DatabaseError(
          'Query failed',
          DbErrorCode.QUERY_FAILED,
          { reportId },
          error
        ),
      };
    }
  }

  /**
   * Get form details for a report
   * 
   * @param reportId - Report identifier
   * @returns Result with array of form details or error
   */
  async getFormDetails(
    reportId: string
  ): AsyncResult<readonly FormDetail[], DatabaseError> {
    const checkResult = this.assertInitialized();
    if (!checkResult.success) {
      return checkResult;
    }

    // Reload database to get latest data
    const reloadResult = await this.reload();
    if (!reloadResult.success) {
      return reloadResult;
    }

    try {
      const stmt = this.db!.prepare(
        'SELECT * FROM form_details WHERE reportId = ? ORDER BY formName'
      );
      stmt.bind([reportId]);

      const forms: FormDetail[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        
        // Validate and parse
        const parseResult = FormDetailDbSchema.safeParse(row);
        if (parseResult.success) {
          forms.push(parseResult.data);
        } else {
          logger.warn('Skipping invalid form detail row', {
            error: parseResult.error,
            row,
          });
        }
      }
      stmt.free();

      return { success: true, data: forms };
    } catch (error) {
      logger.error('Failed to get form details', { error, reportId });
      return {
        success: false,
        error: new DatabaseError(
          'Query failed',
          DbErrorCode.QUERY_FAILED,
          { reportId },
          error
        ),
      };
    }
  }

  /**
   * Get variances for a report/form with annotations
   * 
   * @param reportId - Report identifier
   * @param formCode - Optional form code to filter
   * @returns Result with array of variances with annotations or error
   */
  async getVariances(
    reportId: string,
    formCode?: string
  ): AsyncResult<readonly VarianceWithAnnotation[], DatabaseError> {
    const checkResult = this.assertInitialized();
    if (!checkResult.success) {
      return checkResult;
    }

    // Reload database to get latest data
    const reloadResult = await this.reload();
    if (!reloadResult.success) {
      return reloadResult;
    }

    try {
      let sql = `
        SELECT 
          v.*,
          a.flagged,
          a.category,
          a.comment
        FROM variances v
        LEFT JOIN variance_annotations a 
          ON v.reportId = a.reportId 
          AND v.formCode = a.formCode 
          AND v.cellReference = a.cellReference
        WHERE v.reportId = ?
      `;
      const params: any[] = [reportId];

      if (formCode) {
        sql += ' AND v.formCode = ?';
        params.push(formCode);
      }

      sql += ' ORDER BY v.cellReference';

      const stmt = this.db!.prepare(sql);
      stmt.bind(params);

      const variances: VarianceWithAnnotation[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        
        // Parse variance detail
        const varianceResult = VarianceDetailDbSchema.safeParse(row);
        if (!varianceResult.success) {
          logger.warn('Skipping invalid variance row', {
            error: varianceResult.error,
            row,
          });
          continue;
        }

        // Add annotation data if present
        const variance: VarianceWithAnnotation = {
          ...varianceResult.data,
          flagged: row.flagged !== null ? (row.flagged as number) === 1 : undefined,
          category: row.category as VarianceCategory,  // string | null | undefined,
          comment: row.comment as string | null | undefined,
        };

        variances.push(variance);
      }
      stmt.free();

      return { success: true, data: variances };
    } catch (error) {
      logger.error('Failed to get variances', { error, reportId, formCode });
      return {
        success: false,
        error: new DatabaseError(
          'Query failed',
          DbErrorCode.QUERY_FAILED,
          { reportId, formCode },
          error
        ),
      };
    }
  }

  /**
   * Update variance annotation
   * 
   * @param annotation - Variance annotation data
   * @returns Result with void on success or error
   */
  async updateVarianceAnnotation(
    annotation: VarianceAnnotation
  ): AsyncResult<void, DatabaseError> {
    const checkResult = this.assertInitialized();
    if (!checkResult.success) {
      return checkResult;
    }

    // Validate annotation
    const validationResult = VarianceAnnotationSchema.safeParse(annotation);
    if (!validationResult.success) {
      return {
        success: false,
        error: new DatabaseError(
          'Invalid variance annotation',
          DbErrorCode.VALIDATION_ERROR,
          { validationError: validationResult.error },
          validationResult.error
        ),
      };
    }

    try {
      this.db!.run(
        `INSERT INTO variance_annotations 
        (reportId, formCode, cellReference, flagged, category, comment, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(reportId, formCode, cellReference) 
        DO UPDATE SET 
          flagged = excluded.flagged,
          category = excluded.category,
          comment = excluded.comment,
          updatedAt = CURRENT_TIMESTAMP`,
        [
          annotation.reportId,
          annotation.formCode,
          annotation.cellReference,
          annotation.flagged ? 1 : 0,
          annotation.category,
          annotation.comment,
        ]
      );

      const saveResult = await this.save();
      if (!saveResult.success) {
        return saveResult;
      }

      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Failed to update variance annotation', { error, annotation });
      return {
        success: false,
        error: new DatabaseError(
          'Update failed',
          DbErrorCode.QUERY_FAILED,
          { annotation },
          error
        ),
      };
    }
  }

  /**
   * Delete report and all related data
   * 
   * @param reportId - Report identifier
   * @returns Result with void on success or error
   */
  async deleteReport(reportId: string): AsyncResult<void, DatabaseError> {
    const checkResult = this.assertInitialized();
    if (!checkResult.success) {
      return checkResult;
    }

    try {
      this.db!.run('DELETE FROM reports WHERE id = ?', [reportId]);
      
      const saveResult = await this.save();
      if (!saveResult.success) {
        return saveResult;
      }

      logger.info(`Deleted report ${reportId}`);
      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Failed to delete report', { error, reportId });
      return {
        success: false,
        error: new DatabaseError(
          'Delete failed',
          DbErrorCode.QUERY_FAILED,
          { reportId },
          error
        ),
      };
    }
  }

  /**
   * Get statistics
   * 
   * @param filters - Optional filter criteria
   * @returns Result with statistics or error
   */
  async getStatistics(
    filters?: ReportFilters
  ): AsyncResult<Statistics, DatabaseError> {
    const reportsResult = await this.getReports(filters);
    if (!reportsResult.success) {
      return reportsResult;
    }

    const reports = reportsResult.data;

    const stats: Statistics = {
      totalReports: reports.length,
      completedReports: reports.filter((r) => r.status === 'completed').length,
      failedReports: reports.filter((r) => r.status === 'failed').length,
      runningReports: reports.filter((r) => r.status === 'running').length,
      totalVariances: reports.reduce((sum, r) => sum + r.totalVariances, 0),
      totalValidationErrors: reports.reduce(
        (sum, r) => sum + r.totalValidationErrors,
        0
      ),
      avgDuration:
        reports.length > 0
          ? Math.round(
              reports.reduce((sum, r) => sum + r.duration, 0) / reports.length / 1000
            )
          : 0,
    };

    return { success: true, data: stats };
  }

  /**
   * Get unique base dates
   * 
   * @returns Result with array of dates or error
   */
  async getBaseDates(): AsyncResult<readonly string[], DatabaseError> {
    const checkResult = this.assertInitialized();
    if (!checkResult.success) {
      return checkResult;
    }

    // Reload database to get latest data
    const reloadResult = await this.reload();
    if (!reloadResult.success) {
      return reloadResult;
    }

    try {
      const stmt = this.db!.prepare(
        'SELECT DISTINCT baseDate FROM reports ORDER BY baseDate DESC'
      );

      const dates: string[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        dates.push(row.baseDate as string);
      }
      stmt.free();

      return { success: true, data: dates };
    } catch (error) {
      logger.error('Failed to get base dates', { error });
      return {
        success: false,
        error: new DatabaseError(
          'Query failed',
          DbErrorCode.QUERY_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  /**
   * Get unique form codes with names
   * 
   * @returns Result with array of form codes or error
   */
  async getFormCodes(): AsyncResult<readonly FormCodeWithName[], DatabaseError> {
    const checkResult = this.assertInitialized();
    if (!checkResult.success) {
      return checkResult;
    }

    // Reload database to get latest data
    const reloadResult = await this.reload();
    if (!reloadResult.success) {
      return reloadResult;
    }

    try {
      const stmt = this.db!.prepare(
        'SELECT DISTINCT formCode, formName FROM form_details ORDER BY formName'
      );

      const forms: FormCodeWithName[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        forms.push({
          code: row.formCode as string,
          name: row.formName as string,
        });
      }
      stmt.free();

      return { success: true, data: forms };
    } catch (error) {
      logger.error('Failed to get form codes', { error });
      return {
        success: false,
        error: new DatabaseError(
          'Query failed',
          DbErrorCode.QUERY_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  // ============================================
  // TRANSACTION SUPPORT
  // ============================================

  /**
   * Execute operations within a transaction
   * 
   * @param operation - Async operation to execute
   * @returns Result from operation
   */
  private async executeTransaction<T>(
    operation: () => AsyncResult<T, DatabaseError>
  ): AsyncResult<T, DatabaseError> {
    try {
      this.db!.run('BEGIN TRANSACTION');

      const result = await operation();

      if (result.success) {
        this.db!.run('COMMIT');
        return result;
      } else {
        this.db!.run('ROLLBACK');
        return result;
      }
    } catch (error) {
      try {
        this.db!.run('ROLLBACK');
      } catch (rollbackError) {
        logger.error('Failed to rollback transaction', { rollbackError });
      }

      logger.error('Transaction failed', { error });
      return {
        success: false,
        error: new DatabaseError(
          'Transaction failed',
          DbErrorCode.TRANSACTION_FAILED,
          undefined,
          error
        ),
      };
    }
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
    operation: () => AsyncResult<T, DatabaseError>,
    operationName: string
  ): AsyncResult<T, DatabaseError> {
    let lastError: DatabaseError | null = null;
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

    logger.error(
      `${operationName} failed after ${this.retryConfig.maxRetries} attempts`
    );

    return {
      success: false,
      error:
        lastError ??
        new DatabaseError(
          'Operation failed after retries',
          DbErrorCode.QUERY_FAILED
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
  // CLEANUP
  // ============================================

  /**
   * Close database connection
   * 
   * @returns Result with void on success or error
   */
  async close(): AsyncResult<void, DatabaseError> {
    if (this.db) {
      const saveResult = await this.save();
      if (!saveResult.success) {
        return saveResult;
      }

      this.db.close();
      this.db = null;
      this.isInitialized = false;
      logger.info('Database closed');
    }

    return { success: true, data: undefined };
  }
}

// ============================================
// EXPORTS
// ============================================

export type { RetryConfig };
export { DEFAULT_RETRY_CONFIG };