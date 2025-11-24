/**
 * Data processing utilities for variance analysis
 */
import { FormInstance } from './models.js';
export declare class DataProcessor {
    /**
     * Find an instance with the exact target date
     */
    static findInstanceByDate(instances: FormInstance[], targetDate: string): FormInstance | null;
    /**
     * Find the most recent instance before the target date
     */
    static findInstanceBeforeDate(instances: FormInstance[], targetDate: string): FormInstance | null;
    /**
     * Sanitize a string to be a valid Excel sheet name
     */
    static sanitizeSheetName(name: string, maxLength?: number): string;
    /**
     * Check if variance data contains any non-zero, non-null differences
     * Returns count of variance entries with meaningful differences (excluding subtotals)
     */
    static hasDifferences(variances: Record<string, any>[], diffColumn?: string): number;
}
//# sourceMappingURL=data-processor.d.ts.map