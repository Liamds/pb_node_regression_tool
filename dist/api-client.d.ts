/**
 * API client for interacting with AgileReporter API
 */
import { AuthConfig, APIConfig } from './config.js';
import { FormInstance, CellMetadata, CellBusinessRule, CellRecordHeader, ValidationResult } from './models.js';
export declare class AgileReporterClient {
    private authConfig;
    private apiConfig;
    private token;
    private readonly host;
    private axiosInstance;
    constructor(authConfig: AuthConfig, apiConfig: APIConfig);
    /**
     * Authenticate and get access token
     */
    authenticate(): Promise<string>;
    /**
     * Get all versions/instances of a form
     */
    getFormVersions(formCode: string): Promise<FormInstance[]>;
    /**
     * Get metadata related to an individual cell
     */
    getCellMetadata(instanceId: string, cellId: string): Promise<CellMetadata>;
    /**
     * Get Business Rules related to an individual cell
     */
    getCellBusinessRules(instanceId: string, cell: CellMetadata): Promise<CellBusinessRule[]>;
    /**
     * Get cell headers for data for an individual cell
     */
    getCellHeaders(instanceId: string, cell: CellMetadata): Promise<CellRecordHeader[]>;
    /**
     * Get cell records for an individual cell and save as an XLSX file
     */
    getCellRecordXlsx(instanceId: string, cell: CellMetadata, headers: CellRecordHeader[], outputFile: string): Promise<void>;
    /**
     * Get variance analysis between two form instances
     */
    getFormAnalysis(formCode: string, instance1: FormInstance, instance2: FormInstance, maxRetries?: number): Promise<Record<string, any>[]>;
    /**
     * Validate and return results for a single form instance
     */
    validateReturn(instance: FormInstance, maxRetries?: number): Promise<ValidationResult[]>;
    /**
     * Parse variance records from API response
     */
    private parseVarianceRecords;
    /**
     * Parse validation results from API response
     */
    private parseValidationResults;
}
//# sourceMappingURL=api-client.d.ts.map