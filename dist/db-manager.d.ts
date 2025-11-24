/**
 * SQLite Database Manager using sql.js WASM
 */
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
export declare class DatabaseManager {
    private db;
    private dbPath;
    private SQL;
    private needsReload;
    constructor(dbPath?: string);
    /**
     * Initialize SQLite database
     */
    initialize(): Promise<void>;
    /**
     * Mark database as dirty to trigger reload on next read
     */
    private markDirty;
    /**
     * Ensure database is fresh by reloading if needed
     */
    private ensureFresh;
    /**
     * Create database tables
     */
    private createTables;
    /**
     * Save database to disk with atomic write operation
     */
    save(): Promise<void>;
    /**
     * Execute operation within a transaction
     */
    private withTransaction;
    /**
     * Save report with all details in a transaction
     */
    saveReport(metadata: ReportMetadata, formDetails: FormDetail[], variances: VarianceDetail[]): Promise<void>;
    /**
     * Get all reports with optional filters
     */
    getReports(filters?: {
        status?: string;
        baseDate?: string;
        formCode?: string;
    }): Promise<ReportMetadata[]>;
    /**
     * Get report by ID
     */
    getReport(reportId: string): Promise<ReportMetadata | null>;
    /**
     * Get form details for a report
     */
    getFormDetails(reportId: string): Promise<FormDetail[]>;
    /**
     * Get variances with filtering and sorting
     */
    getVariances(reportId: string, formCode?: string, filters?: {
        minDifference?: number;
        category?: string;
        flaggedOnly?: boolean;
        sortBy?: 'cellReference' | 'difference' | 'percentDifference';
        sortOrder?: 'asc' | 'desc';
    }): Promise<(VarianceDetail & Partial<VarianceAnnotation>)[]>;
    /**
     * Update variance annotation in transaction
     */
    updateVarianceAnnotation(annotation: VarianceAnnotation): Promise<void>;
    /**
     * Batch update annotations in transaction
     */
    batchUpdateAnnotations(annotations: VarianceAnnotation[]): Promise<void>;
    /**
     * Delete report and all related data in transaction
     */
    deleteReport(reportId: string): Promise<void>;
    /**
     * Batch delete reports in transaction
     */
    batchDeleteReports(reportIds: string[]): Promise<void>;
    /**
     * Get statistics with filters
     */
    getStatistics(filters?: {
        status?: string;
        baseDate?: string;
        formCode?: string;
    }): Promise<any>;
    /**
     * Get unique base dates
     */
    getBaseDates(): Promise<string[]>;
    /**
     * Get unique form codes
     */
    getFormCodes(): Promise<Array<{
        code: string;
        name: string;
    }>>;
    /**
     * Close database connection
     */
    close(): Promise<void>;
}
//# sourceMappingURL=db-manager.d.ts.map