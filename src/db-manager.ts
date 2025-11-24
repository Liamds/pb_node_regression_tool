/**
 * SQLite Database Manager using sql.js WASM
 */

import initSqlJs, { Database } from 'sql.js';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';

export interface ReportMetadata {
  id: string;
  timestamp: string;
  baseDate: string;
  totalReturns: number;
  totalVariances: number;
  totalValidationErrors: number;
  configFile: string;
  outputFile: string;
  duration: number;
  status: 'completed' | 'running' | 'failed';
}

export interface VarianceAnnotation {
  id?: number;
  reportId: string;
  formCode: string;
  cellReference: string;
  flagged: boolean;
  category: string | null;
  comment: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FormDetail {
  id?: number;
  reportId: string;
  formName: string;
  formCode: string;
  confirmed: boolean;
  varianceCount: number;
  validationErrorCount: number;
  baseDate: string;
  comparisonDate: string;
}

export interface VarianceDetail {
  id?: number;
  reportId: string;
  formCode: string;
  cellReference: string;
  cellDescription: string;
  comparisonValue: string;
  baseValue: string;
  difference: string;
  percentDifference: string;
}

export class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(process.cwd(), 'reports', 'reports.db');
  }

  /**
   * Initialize SQLite database
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing SQLite database...');
      
      // Initialize sql.js
      this.SQL = await initSqlJs();
      
      // Load existing database or create new
      if (existsSync(this.dbPath)) {
        const buffer = await readFile(this.dbPath);
        this.db = new this.SQL.Database(buffer);
        logger.info('Loaded existing database');
      } else {
        this.db = new this.SQL.Database();
        logger.info('Created new database');
      }

      // Create tables
      await this.createTables();
      
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database', { error });
      throw error;
    }
  }

  /**
   * Reload database from disk to get latest data
   */
  private async reload(): Promise<void> {
    if (!this.db || !this.SQL) return;
    
    // Close current database
    this.db.close();
    
    // Reload from disk
    if (existsSync(this.dbPath)) {
      const buffer = await readFile(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }
  }

  /**
   * Create database tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

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

    for (const sql of [...tables, ...indexes]) {
      this.db.run(sql);
    }

    await this.save();
  }

  /**
   * Save database to disk
   */
  async save(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const data = this.db.export();
    const buffer = Buffer.from(data);
    await writeFile(this.dbPath, buffer);
  }

  /**
   * Save report with all details
   */
  async saveReport(
    metadata: ReportMetadata,
    formDetails: FormDetail[],
    variances: VarianceDetail[]
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Insert report metadata
      this.db.run(
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
      const formStmt = this.db.prepare(
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

      // Insert variances (batch insert)
      if (variances.length > 0) {
        const varianceStmt = this.db.prepare(
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

      await this.save();
      logger.info(`Report ${metadata.id} saved to database`);
    } catch (error) {
      logger.error('Error saving report', { error });
      throw error;
    }
  }

  /**
   * Get all reports
   */
  async getReports(filters?: {
    status?: string;
    baseDate?: string;
    formCode?: string;
  }): Promise<ReportMetadata[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Reload database to get latest data
    await this.reload();

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

    logger.info('Executing query:', sql, 'with params:', params);

    const stmt = this.db.prepare(sql);
    stmt.bind(params);

    const reports: ReportMetadata[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      reports.push({
        id: row.id as string,
        timestamp: row.timestamp as string,
        baseDate: row.baseDate as string,
        totalReturns: row.totalReturns as number,
        totalVariances: row.totalVariances as number,
        totalValidationErrors: row.totalValidationErrors as number,
        configFile: row.configFile as string,
        outputFile: row.outputFile as string,
        duration: row.duration as number,
        status: row.status as 'completed' | 'running' | 'failed',
      });
    }
    stmt.free();
    
    logger.info(`Fetched ${reports.length} reports from database`);

    return reports;
  }

  /**
   * Get report by ID
   */
  async getReport(reportId: string): Promise<ReportMetadata | null> {
    if (!this.db) throw new Error('Database not initialized');

    // Reload database to get latest data
    await this.reload();

    const stmt = this.db.prepare('SELECT * FROM reports WHERE id = ?');
    stmt.bind([reportId]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return {
        id: row.id as string,
        timestamp: row.timestamp as string,
        baseDate: row.baseDate as string,
        totalReturns: row.totalReturns as number,
        totalVariances: row.totalVariances as number,
        totalValidationErrors: row.totalValidationErrors as number,
        configFile: row.configFile as string,
        outputFile: row.outputFile as string,
        duration: row.duration as number,
        status: row.status as 'completed' | 'running' | 'failed',
      };
    }

    stmt.free();
    return null;
  }

  /**
   * Get form details for a report
   */
  async getFormDetails(reportId: string): Promise<FormDetail[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Reload database to get latest data
    await this.reload();

    const stmt = this.db.prepare(
      'SELECT * FROM form_details WHERE reportId = ? ORDER BY formName'
    );
    stmt.bind([reportId]);

    const forms: FormDetail[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      forms.push({
        id: row.id as number,
        reportId: row.reportId as string,
        formName: row.formName as string,
        formCode: row.formCode as string,
        confirmed: (row.confirmed as number) === 1,
        varianceCount: row.varianceCount as number,
        validationErrorCount: row.validationErrorCount as number,
        baseDate: row.baseDate as string,
        comparisonDate: row.comparisonDate as string,
      });
    }
    stmt.free();

    return forms;
  }

  /**
   * Get variances for a report/form with annotations
   */
  async getVariances(
    reportId: string,
    formCode?: string
  ): Promise<(VarianceDetail & Partial<VarianceAnnotation>)[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Reload database to get latest data
    await this.reload();

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

    const stmt = this.db.prepare(sql);
    stmt.bind(params);

    const variances: (VarianceDetail & Partial<VarianceAnnotation>)[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      variances.push({
        id: row.id as number,
        reportId: row.reportId as string,
        formCode: row.formCode as string,
        cellReference: row.cellReference as string,
        cellDescription: row.cellDescription as string,
        comparisonValue: row.comparisonValue as string,
        baseValue: row.baseValue as string,
        difference: row.difference as string,
        percentDifference: row.percentDifference as string,
        flagged: (row.flagged as number) === 1,
        category: row.category as string | null,
        comment: row.comment as string | null,
      });
    }
    stmt.free();

    return variances;
  }

  /**
   * Update variance annotation
   */
  async updateVarianceAnnotation(annotation: VarianceAnnotation): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
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

    await this.save();
  }

  /**
   * Delete report and all related data
   */
  async deleteReport(reportId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM reports WHERE id = ?', [reportId]);
    await this.save();
    logger.info(`Deleted report ${reportId}`);
  }

  /**
   * Get statistics
   */
  async getStatistics(filters?: {
    status?: string;
    baseDate?: string;
    formCode?: string;
  }): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    // Reload database to get latest data
    await this.reload();

    const reports = await this.getReports(filters);

    const totalReports = reports.length;
    const completedReports = reports.filter((r) => r.status === 'completed').length;
    const failedReports = reports.filter((r) => r.status === 'failed').length;
    const runningReports = reports.filter((r) => r.status === 'running').length;

    const totalVariances = reports.reduce((sum, r) => sum + r.totalVariances, 0);
    const totalValidationErrors = reports.reduce(
      (sum, r) => sum + r.totalValidationErrors,
      0
    );

    const avgDuration =
      reports.length > 0 ? reports.reduce((sum, r) => sum + r.duration, 0) / reports.length : 0;

    return {
      totalReports,
      completedReports,
      failedReports,
      runningReports,
      totalVariances,
      totalValidationErrors,
      avgDuration: Math.round(avgDuration / 1000),
    };
  }

  /**
   * Get unique base dates
   */
  async getBaseDates(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    // Reload database to get latest data
    await this.reload();

    const stmt = this.db.prepare('SELECT DISTINCT baseDate FROM reports ORDER BY baseDate DESC');

    const dates: string[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      dates.push(row.baseDate as string);
    }
    stmt.free();

    return dates;
  }

  /**
   * Get unique form codes
   */
  async getFormCodes(): Promise<Array<{ code: string; name: string }>> {
    if (!this.db) throw new Error('Database not initialized');

    // Reload database to get latest data
    await this.reload();

    const stmt = this.db.prepare(
      'SELECT DISTINCT formCode, formName FROM form_details ORDER BY formName'
    );

    const forms: Array<{ code: string; name: string }> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      forms.push({
        code: row.formCode as string,
        name: row.formName as string,
      });
    }
    stmt.free();

    return forms;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.save();
      this.db.close();
      this.db = null;
      logger.info('Database closed');
    }
  }
}