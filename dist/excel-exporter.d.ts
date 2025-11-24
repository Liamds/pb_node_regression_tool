/**
 * Excel export functionality for variance analysis results
 */
import { Config } from './config.js';
import { AnalysisResult } from './models.js';
export declare class ExcelExporter {
    private config;
    constructor(config?: typeof Config);
    /**
     * Export variance analysis results to Excel with formatting and filters
     */
    exportResults(results: AnalysisResult[], outputFile: string): Promise<void>;
    /**
     * Create and populate a worksheet for a single result
     */
    private createSheetForResult;
    /**
     * Create and populate a worksheet for validation errors
     */
    private createSheetForValidationErrors;
    /**
     * Create and populate summary worksheet
     */
    private createSheetForSummary;
    /**
     * Write variance data to worksheet
     */
    private writeDataToSheet;
    /**
     * Write validation data to worksheet with custom formatting
     */
    private writeValidationDataToSheet;
    /**
     * Write summary data to worksheet
     */
    private writeSummaryDataToSheet;
    /**
     * Parse cell value to appropriate type
     */
    private parseCellValue;
    /**
     * Apply color to worksheet tab
     */
    private applyTabColor;
    /**
     * Create an Excel table for the data
     */
    private createTable;
    /**
     * Generate a unique, valid table name
     */
    private generateTableName;
    /**
     * Get Excel column letter from number (1-based)
     */
    private getColumnLetter;
    /**
     * Save the workbook to file
     */
    private saveWorkbook;
}
//# sourceMappingURL=excel-exporter.d.ts.map