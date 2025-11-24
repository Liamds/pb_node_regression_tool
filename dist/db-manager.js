/**
 * SQLite Database Manager using sql.js WASM
 */
import initSqlJs from 'sql.js';
import { readFile, writeFile, rename, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';
export class DatabaseManager {
    db = null;
    dbPath;
    SQL = null;
    needsReload = false;
    constructor(dbPath) {
        this.dbPath = dbPath || join(process.cwd(), 'reports', 'reports.db');
    }
    /**
     * Initialize SQLite database
     */
    async initialize() {
        try {
            logger.info('Initializing SQLite database...');
            // Initialize sql.js
            this.SQL = await initSqlJs();
            // Load existing database or create new
            if (existsSync(this.dbPath)) {
                const buffer = await readFile(this.dbPath);
                this.db = new this.SQL.Database(buffer);
                logger.info('Loaded existing database');
            }
            else {
                this.db = new this.SQL.Database();
                logger.info('Created new database');
            }
            // Create tables
            await this.createTables();
            logger.info('Database initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize database', { error });
            throw error;
        }
    }
    /**
     * Mark database as dirty to trigger reload on next read
     */
    markDirty() {
        this.needsReload = true;
    }
    /**
     * Ensure database is fresh by reloading if needed
     */
    async ensureFresh() {
        if (!this.needsReload || !this.SQL)
            return;
        if (existsSync(this.dbPath)) {
            const buffer = await readFile(this.dbPath);
            this.db?.close();
            this.db = new this.SQL.Database(buffer);
            this.needsReload = false;
            logger.debug('Database reloaded from disk');
        }
    }
    /**
     * Create database tables
     */
    async createTables() {
        if (!this.db)
            throw new Error('Database not initialized');
        const tables = [
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
     * Save database to disk with atomic write operation
     */
    async save() {
        if (!this.db)
            throw new Error('Database not initialized');
        try {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            const tempPath = `${this.dbPath}.tmp`;
            // Write to temporary file
            await writeFile(tempPath, buffer);
            // Atomically rename (overwrites existing file)
            await rename(tempPath, this.dbPath);
            logger.debug('Database saved atomically');
        }
        catch (error) {
            // Clean up temp file if it exists
            const tempPath = `${this.dbPath}.tmp`;
            if (existsSync(tempPath)) {
                await unlink(tempPath).catch(() => { });
            }
            logger.error('Failed to save database', { error });
            throw error;
        }
    }
    /**
     * Execute operation within a transaction
     */
    async withTransaction(operation) {
        if (!this.db)
            throw new Error('Database not initialized');
        try {
            this.db.run('BEGIN TRANSACTION');
            const result = operation();
            this.db.run('COMMIT');
            return result;
        }
        catch (error) {
            this.db.run('ROLLBACK');
            logger.error('Transaction rolled back', { error });
            throw error;
        }
    }
    /**
     * Save report with all details in a transaction
     */
    async saveReport(metadata, formDetails, variances) {
        if (!this.db)
            throw new Error('Database not initialized');
        try {
            await this.withTransaction(() => {
                // Insert report metadata
                this.db.run(`INSERT OR REPLACE INTO reports 
          (id, timestamp, baseDate, totalReturns, totalVariances, totalValidationErrors, 
           configFile, outputFile, duration, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
                ]);
                // Insert form details
                if (formDetails.length > 0) {
                    const formStmt = this.db.prepare(`INSERT INTO form_details 
            (reportId, formName, formCode, confirmed, varianceCount, validationErrorCount, baseDate, comparisonDate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
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
                // Insert variances
                if (variances.length > 0) {
                    const varianceStmt = this.db.prepare(`INSERT INTO variances 
            (reportId, formCode, cellReference, cellDescription, comparisonValue, baseValue, difference, percentDifference)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
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
            });
            await this.save();
            this.markDirty();
            logger.info(`Report ${metadata.id} saved to database`);
        }
        catch (error) {
            logger.error('Error saving report', { error });
            throw error;
        }
    }
    /**
     * Get all reports with optional filters
     */
    async getReports(filters) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.ensureFresh();
        let sql = 'SELECT * FROM reports WHERE 1=1';
        const params = [];
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
        logger.debug('Executing query:', sql, 'with params:', params);
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const reports = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            reports.push({
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
            });
        }
        stmt.free();
        logger.info(`Fetched ${reports.length} reports from database`);
        return reports;
    }
    /**
     * Get report by ID
     */
    async getReport(reportId) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.ensureFresh();
        const stmt = this.db.prepare('SELECT * FROM reports WHERE id = ?');
        stmt.bind([reportId]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return {
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
            };
        }
        stmt.free();
        return null;
    }
    /**
     * Get form details for a report
     */
    async getFormDetails(reportId) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.ensureFresh();
        const stmt = this.db.prepare('SELECT * FROM form_details WHERE reportId = ? ORDER BY formName');
        stmt.bind([reportId]);
        const forms = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            forms.push({
                id: row.id,
                reportId: row.reportId,
                formName: row.formName,
                formCode: row.formCode,
                confirmed: row.confirmed === 1,
                varianceCount: row.varianceCount,
                validationErrorCount: row.validationErrorCount,
                baseDate: row.baseDate,
                comparisonDate: row.comparisonDate,
            });
        }
        stmt.free();
        return forms;
    }
    /**
     * Get variances with filtering and sorting
     */
    async getVariances(reportId, formCode, filters) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.ensureFresh();
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
        const params = [reportId];
        if (formCode) {
            sql += ' AND v.formCode = ?';
            params.push(formCode);
        }
        if (filters?.minDifference !== undefined) {
            sql += ' AND CAST(v.difference AS REAL) >= ?';
            params.push(filters.minDifference);
        }
        if (filters?.category) {
            sql += ' AND a.category = ?';
            params.push(filters.category);
        }
        if (filters?.flaggedOnly) {
            sql += ' AND a.flagged = 1';
        }
        // Add sorting
        const sortBy = filters?.sortBy || 'cellReference';
        const sortOrder = filters?.sortOrder || 'asc';
        sql += ` ORDER BY v.${sortBy} ${sortOrder.toUpperCase()}`;
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const variances = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            variances.push({
                id: row.id,
                reportId: row.reportId,
                formCode: row.formCode,
                cellReference: row.cellReference,
                cellDescription: row.cellDescription,
                comparisonValue: row.comparisonValue,
                baseValue: row.baseValue,
                difference: row.difference,
                percentDifference: row.percentDifference,
                flagged: row.flagged === 1,
                category: row.category,
                comment: row.comment,
            });
        }
        stmt.free();
        return variances;
    }
    /**
     * Update variance annotation in transaction
     */
    async updateVarianceAnnotation(annotation) {
        if (!this.db)
            throw new Error('Database not initialized');
        try {
            await this.withTransaction(() => {
                this.db.run(`INSERT INTO variance_annotations 
          (reportId, formCode, cellReference, flagged, category, comment, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(reportId, formCode, cellReference) 
          DO UPDATE SET 
            flagged = excluded.flagged,
            category = excluded.category,
            comment = excluded.comment,
            updatedAt = CURRENT_TIMESTAMP`, [
                    annotation.reportId,
                    annotation.formCode,
                    annotation.cellReference,
                    annotation.flagged ? 1 : 0,
                    annotation.category,
                    annotation.comment,
                ]);
            });
            await this.save();
            this.markDirty();
        }
        catch (error) {
            logger.error('Error updating annotation', { error });
            throw error;
        }
    }
    /**
     * Batch update annotations in transaction
     */
    async batchUpdateAnnotations(annotations) {
        if (!this.db)
            throw new Error('Database not initialized');
        try {
            await this.withTransaction(() => {
                const stmt = this.db.prepare(`INSERT INTO variance_annotations 
          (reportId, formCode, cellReference, flagged, category, comment, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(reportId, formCode, cellReference) 
          DO UPDATE SET 
            flagged = excluded.flagged,
            category = excluded.category,
            comment = excluded.comment,
            updatedAt = CURRENT_TIMESTAMP`);
                for (const annotation of annotations) {
                    stmt.run([
                        annotation.reportId,
                        annotation.formCode,
                        annotation.cellReference,
                        annotation.flagged ? 1 : 0,
                        annotation.category,
                        annotation.comment,
                    ]);
                }
                stmt.free();
            });
            await this.save();
            this.markDirty();
            logger.info(`Batch updated ${annotations.length} annotations`);
        }
        catch (error) {
            logger.error('Error batch updating annotations', { error });
            throw error;
        }
    }
    /**
     * Delete report and all related data in transaction
     */
    async deleteReport(reportId) {
        if (!this.db)
            throw new Error('Database not initialized');
        try {
            await this.withTransaction(() => {
                this.db.run('DELETE FROM reports WHERE id = ?', [reportId]);
            });
            await this.save();
            this.markDirty();
            logger.info(`Deleted report ${reportId}`);
        }
        catch (error) {
            logger.error('Error deleting report', { error });
            throw error;
        }
    }
    /**
     * Batch delete reports in transaction
     */
    async batchDeleteReports(reportIds) {
        if (!this.db)
            throw new Error('Database not initialized');
        try {
            await this.withTransaction(() => {
                const stmt = this.db.prepare('DELETE FROM reports WHERE id = ?');
                for (const id of reportIds) {
                    stmt.run([id]);
                }
                stmt.free();
            });
            await this.save();
            this.markDirty();
            logger.info(`Batch deleted ${reportIds.length} reports`);
        }
        catch (error) {
            logger.error('Error batch deleting reports', { error });
            throw error;
        }
    }
    /**
     * Get statistics with filters
     */
    async getStatistics(filters) {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.ensureFresh();
        const reports = await this.getReports(filters);
        const totalReports = reports.length;
        const completedReports = reports.filter((r) => r.status === 'completed').length;
        const failedReports = reports.filter((r) => r.status === 'failed').length;
        const runningReports = reports.filter((r) => r.status === 'running').length;
        const totalVariances = reports.reduce((sum, r) => sum + r.totalVariances, 0);
        const totalValidationErrors = reports.reduce((sum, r) => sum + r.totalValidationErrors, 0);
        const avgDuration = reports.length > 0 ? reports.reduce((sum, r) => sum + r.duration, 0) / reports.length : 0;
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
    async getBaseDates() {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.ensureFresh();
        const stmt = this.db.prepare('SELECT DISTINCT baseDate FROM reports ORDER BY baseDate DESC');
        const dates = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            dates.push(row.baseDate);
        }
        stmt.free();
        return dates;
    }
    /**
     * Get unique form codes
     */
    async getFormCodes() {
        if (!this.db)
            throw new Error('Database not initialized');
        await this.ensureFresh();
        const stmt = this.db.prepare('SELECT DISTINCT formCode, formName FROM form_details ORDER BY formName');
        const forms = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            forms.push({
                code: row.formCode,
                name: row.formName,
            });
        }
        stmt.free();
        return forms;
    }
    /**
     * Close database connection
     */
    async close() {
        if (this.db) {
            await this.save();
            this.db.close();
            this.db = null;
            logger.info('Database closed');
        }
    }
}
//# sourceMappingURL=db-manager.js.map