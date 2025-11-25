/**
 * Excel export functionality for variance analysis results
 */

import ExcelJS from 'exceljs';
import { logger } from './logger.js';
import { getExcelProperties, ExcelConfig } from './config.js';
import { DataProcessor } from './data-processor.js';
import { AnalysisResult, SummaryRecord, ValidationResult } from './models.js';

export class ExcelExporter {
  constructor(
    private config = ExcelConfig,
    private excelProperties = getExcelProperties()
  ) {}

  /**
   * Export variance analysis results to Excel with formatting and filters
   */
  async exportResults(results: AnalysisResult[], outputFile: string): Promise<void> {
    if (!results || results.length === 0) {
      logger.warn('No results to export');
      return;
    }

    logger.info(`Exporting ${results.length} sheets to Excel`);

    const workbook = new ExcelJS.Workbook();

    // Set document properties
    workbook.creator = this.excelProperties.author;
    workbook.title = this.excelProperties.title;
    workbook.category = this.excelProperties.category;
    workbook.created = new Date();
    workbook.modified = new Date();

    results.sort((a, b) => a.formName.localeCompare(b.formName));

    const summaryRecords: SummaryRecord[] = [];

    for (const result of results) {
      try {
        const varianceCount = await this.createSheetForResult(workbook, result);

        if (result.validationsErrors.length > 0) {
          await this.createSheetForValidationErrors(workbook, result);
        }

        // Create summary record
        const summary: SummaryRecord = {
          formName: result.formName,
          formCode: result.formCode,
          varianceCount,
          validationErrorCount: result.validationsErrors.length,
        };
        summaryRecords.push(summary);
      } catch (error: any) {
        logger.error(`Error processing ${result.formName}`, { error: error.message });
        continue;
      }
    }

    await this.createSheetForSummary(workbook, summaryRecords);
    await this.saveWorkbook(workbook, outputFile);

    logger.info('='.repeat(200));
    logger.info('SUMMARY OF RESULTS');
    logger.info('='.repeat(200));
    for (const summary of summaryRecords) {
      logger.info(`  Form: ${summary.formName} (${summary.formCode})`);
      logger.info(`    Variance Count: ${summary.varianceCount}`);
      logger.info(`    Validation Error Count: ${summary.validationErrorCount}`);
    }
  }

  /**
   * Create and populate a worksheet for a single result
   */
  private async createSheetForResult(
    workbook: ExcelJS.Workbook,
    result: AnalysisResult
  ): Promise<number> {
    const sheetName = DataProcessor.sanitizeSheetName(
      result.formName,
      this.config.SHEET_NAME_MAX_LENGTH
    );

    logger.info(`Processing: ${result.formName} (${result.formCode}) -> Sheet: ${sheetName}`);

    if (result.variances.length === 0) {
      logger.info(`  Skipping ${result.formName} - no variance data`);
      return 0;
    }

    const worksheet = workbook.addWorksheet(sheetName);

    // Write data
    this.writeDataToSheet(worksheet, result.variances);

    // Check for differences
    const countDiff = DataProcessor.hasDifferences(
      result.variances,
      this.config.COLUMN_NAMES.DIFFERENCE
    );

    // Apply tab color
    this.applyTabColor(worksheet, result.confirmed, countDiff);

    // Create table
    await this.createTable(worksheet, sheetName, result.variances);

    logger.info(`  ✓ Written ${result.variances.length} rows to sheet '${sheetName}'`);

    return countDiff;
  }

  /**
   * Create and populate a worksheet for validation errors
   */
  private async createSheetForValidationErrors(
    workbook: ExcelJS.Workbook,
    result: AnalysisResult
  ): Promise<void> {
    let sheetName = DataProcessor.sanitizeSheetName(
      result.formName,
      this.config.SHEET_NAME_MAX_LENGTH - 18
    );
    sheetName = (sheetName + '_ValidationErrors').substring(0, 31);

    logger.info(
      `Processing Validation Errors: ${result.formName} (${result.formCode}) -> Sheet: ${sheetName}`
    );

    const worksheet = workbook.addWorksheet(sheetName);
    this.writeValidationDataToSheet(worksheet, result.validationsErrors);

    logger.info(`  ✓ Written ${result.validationsErrors.length} rows to sheet '${sheetName}'`);
  }

  /**
   * Create and populate summary worksheet
   */
  private async createSheetForSummary(
    workbook: ExcelJS.Workbook,
    summary: SummaryRecord[]
  ): Promise<void> {
    const sheetName = 'Summary';

    logger.info(`Processing Summary results: -> Sheet: ${sheetName}`);

    if (!summary || summary.length === 0) {
      logger.info('  Skipping summary - no records');
      return;
    }

    const worksheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
    //worksheet.orderNo = 0; // Move to first position

    this.writeSummaryDataToSheet(worksheet, summary);

    logger.info(`  ✓ Written ${summary.length} rows to sheet '${sheetName}'`);
  }

  /**
   * Write variance data to worksheet
   */
  private writeDataToSheet(worksheet: ExcelJS.Worksheet, data: Record<string, any>[]): void {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);

    const columns = Object.keys(data[0]).map((key) => ({
      header: key,
      key: key,
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
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
  });
  }

  /**
   * Write validation data to worksheet with custom formatting
   */
  private writeValidationDataToSheet(
    worksheet: ExcelJS.Worksheet,
    results: ValidationResult[]
  ): void {
    let currentRow = 1;

    const headerFont = { bold: true };
    const headerFill = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FFFFC000' },
    };
    const statusFont = { bold: true, color: { argb: 'FFFF0000' } };

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
          valueCell.value = this.parseCellValue(cellData.value) || '';
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
    summary: SummaryRecord[]
  ): void {
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } };
    const headerFill = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FF2F75B5' },
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
    const summaryHeaders = ['Form', '# Variances', '# Validation Errors', 'Notes', 'Jira Tickets'];
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

      const hasIssues = (record.varianceCount || 0) > 0 || (record.validationErrorCount || 0) > 0;
      const fill = hasIssues ? cellFillRed : cellFillGreen;

      row.eachCell((cell) => {
        cell.fill = fill;
      });

      row.getCell(1).font = cellFontBold;

      logger.info(
        `  Summary - Form: ${record.formName} (${record.formCode}) | Variances: ${record.varianceCount} | Validation Errors: ${record.validationErrorCount}`
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

  /**
   * Parse cell value to appropriate type
   */
  private parseCellValue(value: any): string | number | boolean | Date | null {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) return value;

    const str = String(value);
    if (/^\d+$/.test(str)) return parseInt(str, 10);
    if (/^\d+\.\d+$/.test(str)) return parseFloat(str);
    return str;
  }

  /**
   * Apply color to worksheet tab
   */
  private applyTabColor(
    worksheet: ExcelJS.Worksheet,
    confirmed: boolean,
    countDiff: number
  ): void {
    if (confirmed && countDiff > 0) {
      worksheet.properties.tabColor = { argb: this.config.COLORS.RED };
      logger.info(` 🔴 ✓ Tab colored RED (confirmed return with ${countDiff} differences)`);
    } else if (countDiff > 0) {
      worksheet.properties.tabColor = { argb: this.config.COLORS.YELLOW };
      logger.info(` 🟡 ✓ Tab colored YELLOW (${countDiff} differences found)`);
    } else {
      worksheet.properties.tabColor = { argb: this.config.COLORS.GREEN };
      logger.info(' 🟢 ✓ Tab colored GREEN (no differences)');
    }
  }

  /**
   * Create an Excel table for the data
   */
  private async createTable(
    worksheet: ExcelJS.Worksheet,
    sheetName: string,
    data: Record<string, any>[]
  ): Promise<void> {
    if (data.length === 0) return;

    const lastRow = worksheet.actualRowCount;
    const lastCol = worksheet.actualColumnCount;

    if (lastRow <= 1 || lastCol <= 0) return; // Only headers

    const headerRow = worksheet.getRow(1);
    const headerValues = headerRow.values ?? [];
    const headerArray = Array.isArray(headerValues) ? headerValues : [];

    worksheet.addTable({
      name: this.generateTableName(sheetName),
      ref: `A1:${this.getColumnLetter(lastCol)}${lastRow}`,
      headerRow: true,
      style: {
        theme: this.config.TABLE_STYLE_NAME,
        showRowStripes: true,
      },
      columns: headerArray.slice(1).map((header: any) => ({
        name: header ? String(header) : 'Column',
        filterButton: true,
      })),
      rows: data.map((row) => Object.values(row)),
    });
  }

  /**
   * Generate a unique, valid table name
   */
  private generateTableName(sheetName: string): string {
    const uuid = Math.random().toString(36).substring(2, 8);
    let cleanName = sheetName.replace(/[^A-Za-z0-9_]/g, '_') || 'Sheet';
    let tableName = `T_${cleanName}_${uuid}`;
    return tableName.substring(0, 255);
  }

  /**
   * Get Excel column letter from number (1-based)
   */
  private getColumnLetter(colNum: number): string {
    let letter = '';
    while (colNum > 0) {
      const remainder = (colNum - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      colNum = Math.floor((colNum - 1) / 26);
    }
    return letter;
  }

  /**
   * Save the workbook to file
   */
  private async saveWorkbook(workbook: ExcelJS.Workbook, outputFile: string): Promise<void> {
    try {
      await workbook.xlsx.writeFile(outputFile);
      logger.info(`\n✓ Excel file created successfully: ${outputFile}`);
      logger.info(`Total sheets: ${workbook.worksheets.length}`);
      logger.info('\nColor coding:');
      logger.info('  🔴 RED tabs = Confirmed return with differences (filters applied)');
      logger.info('  🟢 GREEN tabs = No differences (no filters applied)');
      logger.info('  🟡 YELLOW tabs = Differences found (filters applied)');
    } catch (error: any) {
      logger.error(`\n✗ Error saving workbook`, { error: error.message });
      throw error;
    }
  }
}