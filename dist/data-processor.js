/**
 * Data processing utilities for variance analysis
 */
import { parseISO, isBefore } from 'date-fns';
import { logger } from './logger.js';
export class DataProcessor {
    /**
     * Find an instance with the exact target date
     */
    static findInstanceByDate(instances, targetDate) {
        const instance = instances.find((inst) => inst.refDate === targetDate);
        return instance || null;
    }
    /**
     * Find the most recent instance before the target date
     */
    static findInstanceBeforeDate(instances, targetDate) {
        try {
            const targetDt = parseISO(targetDate);
            const beforeInstances = instances.filter((inst) => {
                const instDt = parseISO(inst.refDate);
                return isBefore(instDt, targetDt);
            });
            if (beforeInstances.length === 0) {
                return null;
            }
            // Return the most recent instance before target date
            return beforeInstances[beforeInstances.length - 1];
        }
        catch (error) {
            logger.error(`Invalid date format '${targetDate}'`, { error });
            return null;
        }
    }
    /**
     * Sanitize a string to be a valid Excel sheet name
     */
    static sanitizeSheetName(name, maxLength = 31) {
        const invalidChars = ['\\', '/', '*', '?', ':', '[', ']'];
        let sanitized = name;
        // Replace invalid characters
        for (const char of invalidChars) {
            sanitized = sanitized.replace(new RegExp(`\\${char}`, 'g'), '_');
        }
        // Truncate to max length
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength);
        }
        return sanitized;
    }
    /**
     * Check if variance data contains any non-zero, non-null differences
     * Returns count of variance entries with meaningful differences (excluding subtotals)
     */
    static hasDifferences(variances, diffColumn = 'Difference') {
        if (!variances || variances.length === 0) {
            return 0;
        }
        let countVariances = 0;
        for (const variance of variances) {
            const value = variance[diffColumn];
            const reference = variance['Cell Reference'];
            // Check for non-null and non-zero values
            if (value !== null &&
                value !== undefined &&
                value !== '' &&
                value !== 0 &&
                reference &&
                !reference.toLowerCase().includes('subtotal')) {
                countVariances++;
            }
        }
        return countVariances;
    }
}
//# sourceMappingURL=data-processor.js.map