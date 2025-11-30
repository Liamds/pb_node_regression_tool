/**
 * Type-safe Excel export functionality for variance analysis results
 * 
 * Features:
 * - 100% TypeScript safety with explicit return types
 * - Result<T, E> pattern for all operations
 * - Pure functions for data transformation
 * - Comprehensive error handling
 * - Branded types for workbook operations
 * - Zero implicit any types
 * 
 * @module excel-exporter
 */

import ExcelJS from 'exceljs';
import { z } from 'zod';
import { logger } from './logger.js';
import { getExcelProperties, ExcelConfig, type ExcelColor } from './config.js';
import { 
  sanitizeSheetName, 
  countMeaningfulDifferences,
} from './data-processor.js';
import type {
  AnalysisResult,
  SummaryRecord,
  ValidationResult,
  AsyncResult,
} from './types/index.js';

// ============================================
// ERROR TYPES
// ============================================

/**
 * Excel exporter error codes
 */
export enum ExcelExporterErrorCode {
  NO_RESULTS = 'NO_RESULTS',
  SHEET_CREATION_FAILED = 'SHEET_CREATION_FAILED',
  DATA_WRITE_FAILED = 'DATA_WRITE_FAILED',
  TABLE_CREATION_FAILED = 'TABLE_CREATION_FAILED',
  FILE_SAVE_FAILED = 'FILE_SAVE_FAILED',
  INVALID_DATA = 'INVALID_DATA',
  SANITIZATION_FAILED = 'SANITIZATION_FAILED',
}

/**
 * Excel exporter error class
 */
export class ExcelExporterError extends Error {
  constructor(
    message: string,
    public readonly code: ExcelExporterErrorCode,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ExcelExporterError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExcelExporterError);
    }
  }
}

// ============================================
// VALIDATION SCHEMAS
// ============================================

/**
 * Excel cell value schema
 */
const ExcelCellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.date(),
  z.null(),
]);

type ExcelCellValue = z.infer<typeof ExcelCellValueSchema>;

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Excel properties for document metadata
 */
interface ExcelProperties {
  readonly author: string;
  readonly title: string;
  readonly category: string;
}

/**
 * Sheet creation result
 */
interface SheetCreationResult {
  readonly sheetName: string;
  readonly rowCount: number;
  readonly varianceCount: number;
  readonly hasValidationErrors: boolean;
}

/**
 * Export summary
 */
interface ExportSummary {
  readonly totalSheets: number;
  readonly totalRows: number;
  readonly totalVariances: number;
  readonly totalValidationErrors: number;
  readonly outputFile: string;
}

// ============================================
// EXCEL EXPORTER
// ============================================

/**
 * Type-safe Excel exporter for variance analysis results
 * 
 * @example
 * ```typescript
 * const exporter = new ExcelExporter();
 * const result = await exporter.exportResults(results, 'output.xlsx');
 * 
 * if (result.success) {
 *   console.log('Exported:', result.data.outputFile);
 * } else {
 *   console.error('Export failed:', result.error.message);
 * }
 * ```
 */
export class ExcelExporter {
  private readonly config: typeof ExcelConfig;
  private readonly excelProperties: ExcelProperties;

  constructor(
    config: typeof ExcelConfig = ExcelConfig,
    excelProperties?: ExcelProperties
  ) {
    this.config = config;
    this.excelProperties = excelProperties || getExcelProperties();
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Export variance analysis results to Excel with formatting and filters
   * 
   * @param results - Array of analysis results
   * @param outputFile - Output file path
   * @returns Result with export summary or error
   */
  async exportResults(
    results: readonly AnalysisResult[],
    outputFile: string
  ): AsyncResult<ExportSummary, ExcelExporterError> {
    // Validate inputs
    if (!results || results.length === 0) {
      logger.warn('No results to export');
      return {
        success: false,
        error: new ExcelExporterError(
          'No results to export',
          ExcelExporterErrorCode.NO_RESULTS
        ),
      };
    }

    if (!outputFile || outputFile.trim().length === 0) {
      return {
        success: false,
        error: new ExcelExporterError(
          'Output file path is required',
          ExcelExporterErrorCode.INVALID_DATA
        ),
      };
    }

    logger.info(`Exporting ${results.length} sheets to Excel`);

    try {
      // Create workbook
      const workbook = this.createWorkbook();

      // Sort results alphabetically by form name
      const sortedResults = this.sortResultsByFormName(results);

      // Process each result
      const summaryRecords: SummaryRecord[] = [];
      let totalRows = 0;
      let totalVariances = 0;
      let totalValidationErrors = 0;

      for (const result of sortedResults) {
        const sheetResult = await this.createSheetForResult(workbook, result);
        
        if (sheetResult.success) {
          const sheet = sheetResult.data;
          totalRows += sheet.rowCount;
          totalVariances += sheet.varianceCount;

          // Create validation sheet if needed
          if (result.validationsErrors.length > 0) {
            const validationResult = await this.createValidationSheet(
              workbook,
              result
            );
            
            if (validationResult.success) {
              totalValidationErrors += result.validationsErrors.length;
            } else {
              logger.warn(
                `Failed to create validation sheet for ${result.formName}`,
                { error: validationResult.error.message }
              );
            }
          }

          // Create summary record
          summaryRecords.push({
            formName: result.formName,
            formCode: result.formCode,
            varianceCount: sheet.varianceCount,
            validationErrorCount: result.validationsErrors.length,
          });
        } else {
          logger.error(
            `Failed to process ${result.formName}`,
            { error: sheetResult.error.message }
          );
        }
      }

      // Create summary sheet
      const summaryResult = await this.createSummarySheet(
        workbook,
        summaryRecords
      );

      if (!summaryResult.success) {
        logger.warn('Failed to create summary sheet', {
          error: summaryResult.error.message,
        });
      }

      // Save workbook
      const saveResult = await this.saveWorkbook(workbook, outputFile);
      if (!saveResult.success) {
        return saveResult;
      }

      // Create export summary
      const summary: ExportSummary = {
        totalSheets: workbook.worksheets.length,
        totalRows,
        totalVariances,
        totalValidationErrors,
        outputFile,
      };

      this.logExportSummary(summary, summaryRecords);

      return { success: true, data: summary };
    } catch (error) {
      logger.error('Unexpected error during export', { error });
      return {
        success: false,
        error: new ExcelExporterError(
          `Export failed: ${this.getErrorMessage(error)}`,
          ExcelExporterErrorCode.FILE_SAVE_FAILED,
          { outputFile },
          error
        ),
      };
    }
  }

  // ============================================
  // WORKBOOK CREATION
  // ============================================

  /**
   * Create and configure Excel workbook
   */
  private createWorkbook(): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();

    // Set document properties
    workbook.creator = this.excelProperties.author;
    workbook.title = this.excelProperties.title;
    workbook.category = this.excelProperties.category;
    workbook.created = new Date();
    workbook.modified = new Date();

    return workbook;
  }

  // ============================================
  // SHEET CREATION
  // ============================================

  /**
   * Create and populate a worksheet for a single result
   */
  private async createSheetForResult(
    workbook: ExcelJS.Workbook,
    result: AnalysisResult
  ): AsyncResult<SheetCreationResult, ExcelExporterError> {
    try {
      // Sanitize sheet name
      const nameResult = sanitizeSheetName(
        result.formName,
        this.config.SHEET_NAME_MAX_LENGTH
      );

      if (!nameResult.success) {
        logger.error(
          `Failed to sanitize sheet name for ${result.formName}`,
          { error: nameResult.error.message }
        );
        
        return {
          success: false,
          error: new ExcelExporterError(
            `Sheet name sanitization failed: ${nameResult.error.message}`,
            ExcelExporterErrorCode.SANITIZATION_FAILED,
            { formName: result.formName },
            nameResult.error
          ),
        };
      }

      const sheetName = nameResult.data.sanitized;

      logger.info(
        `Processing: ${result.formName} (${result.formCode}) -> Sheet: ${sheetName}`
      );

      // Skip if no variance data
      if (result.variances.length === 0) {
        logger.info(`Skipping ${result.formName} - no variance data`);
        return {
          success: true,
          data: {
            sheetName,
            rowCount: 0,
            varianceCount: 0,
            hasValidationErrors: result.validationsErrors.length > 0,
          },
        };
      }

      // Create worksheet
      const worksheet = workbook.addWorksheet(sheetName);

      // Write data
      this.writeDataToSheet(worksheet, result.variances);

      // Count meaningful differences
      const varianceCount = countMeaningfulDifferences(result.variances);

      // Apply tab color
      this.applyTabColor(worksheet, result.confirmed, varianceCount);

      // Create table
      const tableResult = await this.createTable(worksheet, sheetName, [
        ...result.variances,
      ]);

      if (!tableResult.success) {
        logger.warn(`Failed to create table for ${sheetName}`, {
          error: tableResult.error.message,
        });
      }

      logger.info(
        `✓ Written ${result.variances.length} rows to sheet '${sheetName}'`
      );

      return {
        success: true,
        data: {
          sheetName,
          rowCount: result.variances.length,
          varianceCount,
          hasValidationErrors: result.validationsErrors.length > 0,
        },
      };
    } catch (error) {
      logger.error(`Failed to create sheet for ${result.formName}`, { error });
      return {
        success: false,
        error: new ExcelExporterError(
          `Sheet creation failed: ${this.getErrorMessage(error)}`,
          ExcelExporterErrorCode.SHEET_CREATION_FAILED,
          { formName: result.formName },
          error
        ),
      };
    }
  }

  /**
   * Create validation errors sheet
   */
  private async createValidationSheet(
    workbook: ExcelJS.Workbook,
    result: AnalysisResult
  ): AsyncResult<void, ExcelExporterError> {
    try {
      const nameResult = sanitizeSheetName(
        `${result.formName}_ValidationErrors`,
        this.config.SHEET_NAME_MAX_LENGTH - 18
      );

      if (!nameResult.success) {
        return {
          success: false,
          error: new ExcelExporterError(
            'Failed to sanitize validation sheet name',
            ExcelExporterErrorCode.SANITIZATION_FAILED,
            { formName: result.formName },
            nameResult.error
          ),
        };
      }

      const sheetName = nameResult.data.sanitized;

      logger.info(
        `Processing Validation Errors: ${result.formName} (${result.formCode}) -> Sheet: ${sheetName}`
      );

      const worksheet = workbook.addWorksheet(sheetName);
      this.writeValidationDataToSheet(worksheet, result.validationsErrors);

      logger.info(
        `✓ Written ${result.validationsErrors.length} rows to sheet '${sheetName}'`
      );

      return { success: true, data: undefined };
    } catch (error) {
      logger.error(
        `Failed to create validation sheet for ${result.formName}`,
        { error }
      );
      return {
        success: false,
        error: new ExcelExporterError(
          'Validation sheet creation failed',
          ExcelExporterErrorCode.SHEET_CREATION_FAILED,
          { formName: result.formName },
          error
        ),
      };
    }
  }

  /**
   * Create summary worksheet
   */
  private async createSummarySheet(
    workbook: ExcelJS.Workbook,
    summary: readonly SummaryRecord[]
  ): AsyncResult<void, ExcelExporterError> {
    try {
      const sheetName = 'Summary';

      logger.info(`Processing Summary results: -> Sheet: ${sheetName}`);

      if (!summary || summary.length === 0) {
        logger.info('Skipping summary - no records');
        return { success: true, data: undefined };
      }

      const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      this.writeSummaryDataToSheet(worksheet, summary);

      logger.info(`✓ Written ${summary.length} rows to sheet '${sheetName}'`);

      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Failed to create summary sheet', { error });
      return {
        success: false,
        error: new ExcelExporterError(
          'Summary sheet creation failed',
          ExcelExporterErrorCode.SHEET_CREATION_FAILED,
          undefined,
          error
        ),
      };
    }
  }

  // ============================================
  // DATA WRITING
  // ============================================

  /**
   * Write variance data to worksheet
   */
  private writeDataToSheet(
    worksheet: ExcelJS.Worksheet,
    data: ReadonlyArray<Record<string, unknown>>
  ): void {
    if (data.length === 0) {
      return;
    }

    const headers = Object.keys(data[0]);

    // Set columns
    const columns = headers.map((key) => ({
      header: key,
      key,
      width: 20,
    }));

    worksheet.columns = columns;

    // Add rows
    data.forEach((row) => {
      worksheet.addRow(row);
    });

    // Format header
    const headerRow = worksheet.getRow(1);
    headers.forEach((_key, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.font = { bold: true, color: { argb: this.config.COLORS.WHITE } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.config.COLORS.BLUE },
      };
    });
  }

  /**
   * Write validation data to worksheet with custom formatting
   */
  private writeValidationDataToSheet(
    worksheet: ExcelJS.Worksheet,
    results: readonly ValidationResult[]
  ): void {
    let currentRow = 1;

    const headerFont = { bold: true };
    const headerFill = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: this.config.COLORS.ORANGE },
    };
    const statusFont = { bold: true, color: { argb: this.config.COLORS.RED } };

    for (const result of results) {
      // Validation Headers
      const validationHeaders = ['Severity', 'Status', 'Message'];
      validationHeaders.forEach((header, idx) => {
        const cell = worksheet.getCell(currentRow, idx + 1);
        cell.value = header;
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.border = {
          bottom: { style: 'thin' },
        };
      });
      currentRow++;

      // Validation Data
      worksheet.getCell(currentRow, 1).value = result.severity;
      const statusCell = worksheet.getCell(currentRow, 2);
      statusCell.value = result.status;
      statusCell.font = statusFont;

      const messageCell = worksheet.getCell(currentRow, 3);
      messageCell.value = result.message || '';
      messageCell.alignment = { wrapText: true };
      currentRow++;

      // Empty row
      currentRow++;

      // Expression
      worksheet.getCell(currentRow, 1).value = 'Expression:';
      const expressionCell = worksheet.getCell(currentRow, 2);
      expressionCell.value = result.expression;
      expressionCell.alignment = { wrapText: true };
      currentRow++;

      // Cell Headers
      const cellHeaders = ['Cell', 'Value', 'Form', 'Reference Date'];
      cellHeaders.forEach((header, idx) => {
        const cell = worksheet.getCell(currentRow, idx + 1);
        cell.value = header;
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.border = {
          bottom: { style: 'thin' },
        };
      });
      currentRow++;

      // Cell Details
      if (result.referencedCells && result.referencedCells.length > 0) {
        for (const cellData of result.referencedCells) {
          worksheet.getCell(currentRow, 1).value = cellData.cell;
          const valueCell = worksheet.getCell(currentRow, 2);
          valueCell.value = this.parseCellValue(cellData.value);
          valueCell.font = { bold: true };
          worksheet.getCell(currentRow, 3).value = cellData.form;
          worksheet.getCell(currentRow, 4).value = cellData.referenceDate;
          currentRow++;
        }
      } else {
        currentRow++;
      }

      // Separator
      currentRow += 3;
    }

    // Auto-adjust column widths
    for (let colIdx = 1; colIdx <= 4; colIdx++) {
      let maxLength = 0;
      worksheet.getColumn(colIdx).eachCell({ includeEmpty: false }, (cell) => {
        const cellValue = cell.value ? cell.value.toString() : '';
        maxLength = Math.max(maxLength, cellValue.length);
      });
      worksheet.getColumn(colIdx).width = Math.min(maxLength + 2, 120);
    }
  }

  /**
   * Write summary data to worksheet
   */
  private writeSummaryDataToSheet(
    worksheet: ExcelJS.Worksheet,
    summary: readonly SummaryRecord[]
  ): void {
    const headerFont = { bold: true, color: { argb: this.config.COLORS.WHITE } };
    const headerFill = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: this.config.COLORS.BLUE },
    };

    const cellFontBold = { bold: true };
    const cellFillGreen = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FFC6EFCE' },
    };
    const cellFillRed = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FFFFC7CE' },
    };

    // Headers
    const summaryHeaders = [
      'Form',
      '# Variances',
      '# Validation Errors',
      'Notes',
      'Jira Tickets',
    ];

    worksheet.columns = summaryHeaders.map((header) => ({
      header,
      key: header,
      width: 20,
    }));

    const headerRow = worksheet.getRow(1);
    summaryHeaders.forEach((_header, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.border = { bottom: { style: 'thin' } };
    });

    // Data rows
    summary.forEach((record) => {
      const row = worksheet.addRow({
        Form: record.formCode,
        '# Variances': record.varianceCount || 0,
        '# Validation Errors': record.validationErrorCount || 0,
        Notes: '',
        'Jira Tickets': '',
      });

      const hasIssues =
        (record.varianceCount || 0) > 0 ||
        (record.validationErrorCount || 0) > 0;
      const fill = hasIssues ? cellFillRed : cellFillGreen;

      row.eachCell((cell) => {
        cell.fill = fill;
      });

      row.getCell(1).font = cellFontBold;

      logger.info(
        `Summary - Form: ${record.formName} (${record.formCode}) | Variances: ${record.varianceCount} | Validation Errors: ${record.validationErrorCount}`
      );
    });

    // Auto-adjust column widths
    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell!({ includeEmpty: false }, (cell) => {
        const cellValue = cell.value ? cell.value.toString() : '';
        maxLength = Math.max(maxLength, cellValue.length);
      });
      column.width = Math.min(maxLength + 2, 120);
    });
  }

  // ============================================
  // FORMATTING
  // ============================================

  /**
   * Apply color to worksheet tab
   */
  private applyTabColor(
    worksheet: ExcelJS.Worksheet,
    confirmed: boolean,
    countDiff: number
  ): void {
    let color: ExcelColor;
    let logMessage: string;

    if (confirmed && countDiff > 0) {
      color = this.config.COLORS.RED;
      logMessage = `🔴 ✓ Tab colored RED (confirmed return with ${countDiff} differences)`;
    } else if (countDiff > 0) {
      color = this.config.COLORS.YELLOW;
      logMessage = `🟡 ✓ Tab colored YELLOW (${countDiff} differences found)`;
    } else {
      color = this.config.COLORS.GREEN;
      logMessage = '🟢 ✓ Tab colored GREEN (no differences)';
    }

    worksheet.properties.tabColor = { argb: color };
    logger.info(logMessage);
  }

  /**
   * Create an Excel table for the data
   */
  private async createTable(
    worksheet: ExcelJS.Worksheet,
    sheetName: string,
    data: ReadonlyArray<Record<string, unknown>>
  ): AsyncResult<void, ExcelExporterError> {
    try {
      if (data.length === 0) {
        return { success: true, data: undefined };
      }

      const lastRow = worksheet.actualRowCount;
      const lastCol = worksheet.actualColumnCount;

      if (lastRow <= 1 || lastCol <= 0) {
        // Only headers or no data
        return { success: true, data: undefined };
      }

      const headerRow = worksheet.getRow(1);
      const headerValues = headerRow.values ?? [];
      const headerArray = Array.isArray(headerValues) ? headerValues : [];

      const tableName = this.generateTableName(sheetName);
      const tableRef = `A1:${this.getColumnLetter(lastCol)}${lastRow}`;

      worksheet.addTable({
        name: tableName,
        ref: tableRef,
        headerRow: true,
        style: {
          theme: this.config.TABLE_STYLE_NAME,
          showRowStripes: true,
        },
        columns: headerArray.slice(1).map((header: unknown) => ({
          name: header ? String(header) : 'Column',
          filterButton: true,
        })),
        rows: data.map((row) => Object.values(row)),
      });

      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Failed to create table', { error, sheetName });
      return {
        success: false,
        error: new ExcelExporterError(
          'Table creation failed',
          ExcelExporterErrorCode.TABLE_CREATION_FAILED,
          { sheetName },
          error
        ),
      };
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Parse cell value to appropriate type
   */
  private parseCellValue(value: unknown): ExcelCellValue {
    const result = ExcelCellValueSchema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    // Try to parse as number or string
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
      return value;
    }

    const str = String(value);
    if (/^\d+$/.test(str)) {
      return parseInt(str, 10);
    }
    if (/^\d+\.\d+$/.test(str)) {
      return parseFloat(str);
    }

    return str;
  }

  /**
   * Generate a unique, valid table name
   */
  private generateTableName(sheetName: string): string {
    const uuid = Math.random().toString(36).substring(2, 8);
    const cleanName = sheetName.replace(/[^A-Za-z0-9_]/g, '_') || 'Sheet';
    const tableName = `T_${cleanName}_${uuid}`;
    return tableName.substring(0, 255);
  }

  /**
   * Get Excel column letter from number (1-based)
   */
  private getColumnLetter(colNum: number): string {
    let letter = '';
    let num = colNum;

    while (num > 0) {
      const remainder = (num - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      num = Math.floor((num - 1) / 26);
    }

    return letter;
  }

  /**
   * Sort results alphabetically by form name
   */
  private sortResultsByFormName(
    results: readonly AnalysisResult[]
  ): readonly AnalysisResult[] {
    return [...results].sort((a, b) => a.formName.localeCompare(b.formName));
  }

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

  // ============================================
  // FILE OPERATIONS
  // ============================================

  /**
   * Save the workbook to file
   */
  private async saveWorkbook(
    workbook: ExcelJS.Workbook,
    outputFile: string
  ): AsyncResult<void, ExcelExporterError> {
    try {
      await workbook.xlsx.writeFile(outputFile);

      logger.info(`\n✓ Excel file created successfully: ${outputFile}`);
      logger.info(`Total sheets: ${workbook.worksheets.length}`);
      logger.info('\nColor coding:');
      logger.info('  🔴 RED tabs = Confirmed return with differences (filters applied)');
      logger.info('  🟢 GREEN tabs = No differences (no filters applied)');
      logger.info('  🟡 YELLOW tabs = Differences found (filters applied)');

      return { success: true, data: undefined };
    } catch (error) {
      logger.error('Error saving workbook', { error });
      return {
        success: false,
        error: new ExcelExporterError(
          `Failed to save workbook: ${this.getErrorMessage(error)}`,
          ExcelExporterErrorCode.FILE_SAVE_FAILED,
          { outputFile },
          error
        ),
      };
    }
  }

  // ============================================
  // LOGGING
  // ============================================

  /**
   * Log export summary
   */
  private logExportSummary(
    summary: ExportSummary,
    records: readonly SummaryRecord[]
  ): void {
    logger.info('='.repeat(80));
    logger.info('EXPORT SUMMARY');
    logger.info('='.repeat(80));
    logger.info(`Total Sheets: ${summary.totalSheets}`);
    logger.info(`Total Rows: ${summary.totalRows}`);
    logger.info(`Total Variances: ${summary.totalVariances}`);
    logger.info(`Total Validation Errors: ${summary.totalValidationErrors}`);
    logger.info(`Output File: ${summary.outputFile}`);
    logger.info('='.repeat(80));
    logger.info('FORM DETAILS');
    logger.info('='.repeat(80));

    for (const record of records) {
      logger.info(`Form: ${record.formName} (${record.formCode})`);
      logger.info(`  Variance Count: ${record.varianceCount}`);
      logger.info(`  Validation Error Count: ${record.validationErrorCount}`);
    }

    logger.info('='.repeat(80));
  }
}

// ============================================
// EXPORTS
// ============================================

export type {
  ExcelProperties,
  SheetCreationResult,
  ExportSummary,
  ExcelCellValue,
};