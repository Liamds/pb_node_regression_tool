/**
 * Variance analysis logic with progress broadcasting
 */
import { logger } from './logger.js';
import { DataProcessor } from './data-processor.js';
import { MultiProgressBar } from './progress-bar.js';
import pLimit from 'p-limit';
import { EventEmitter } from 'events';
export class VarianceAnalyzer extends EventEmitter {
    client;
    constructor(client) {
        super();
        this.client = client;
    }
    /**
     * Emit progress update
     */
    emitProgress(step, current, total, message) {
        this.emit('progress', {
            type: 'progress',
            step,
            current,
            total,
            message,
        });
    }
    /**
     * Analyze multiple returns against a base date
     */
    async analyzeReturns(returns, baseDate) {
        const limit = pLimit(3);
        const results = [];
        const multibar = new MultiProgressBar();
        // Total steps: fetch versions + analyze + validate for each form
        const totalSteps = returns.length * 3;
        let currentStep = 0;
        // Emit initial progress
        this.emitProgress('analyzing', currentStep, totalSteps, 'Starting return analysis...');
        // Create a progress bar for each form
        returns.forEach(r => {
            multibar.create(r.code, 3, r.name); // 3 steps: fetch, analyze, validate
        });
        const promises = returns.map(returnConfig => limit(async () => {
            try {
                // Step 1: Fetch versions
                multibar.update(returnConfig.code, 1, 'Fetching versions...');
                currentStep++;
                this.emitProgress('analyzing', currentStep, totalSteps, `Fetching ${returnConfig.name} versions (${currentStep}/${totalSteps})`);
                const result = await this.analyzeReturn(returnConfig, baseDate, (step, _message) => {
                    // Sub-progress callback
                    if (step === 'analyze') {
                        multibar.update(returnConfig.code, 2, 'Analyzing variances...');
                        currentStep++;
                        this.emitProgress('analyzing', currentStep, totalSteps, `Analyzing ${returnConfig.name} (${currentStep}/${totalSteps})`);
                    }
                    else if (step === 'validate') {
                        multibar.update(returnConfig.code, 3, 'Validating...');
                        currentStep++;
                        this.emitProgress('analyzing', currentStep, totalSteps, `Validating ${returnConfig.name} (${currentStep}/${totalSteps})`);
                    }
                });
                multibar.update(returnConfig.code, 3, '✓ Complete');
                if (result)
                    results.push(result);
            }
            catch (error) {
                multibar.update(returnConfig.code, 3, '✗ Failed');
                logger.error(`Error: ${returnConfig.name}`, { error: error.message });
                // Still increment step counter on failure
                currentStep = Math.min(currentStep + 2, totalSteps);
                this.emitProgress('analyzing', currentStep, totalSteps, `Failed ${returnConfig.name} (${currentStep}/${totalSteps})`);
            }
        }));
        await Promise.all(promises);
        multibar.stop();
        return results;
    }
    /**
     * Analyze a single return against the base date
     */
    async analyzeReturn(returnConfig, baseDate, _p0) {
        // Get all versions of the form
        const instances = await this.client.getFormVersions(returnConfig.code);
        if (instances.length === 0) {
            logger.warn(`No instances found for ${returnConfig.code}`);
            return null;
        }
        logger.info(`Found ${instances.length} instances`);
        // Find base instance (exact match on base date)
        const baseInstance = DataProcessor.findInstanceByDate(instances, baseDate);
        if (!baseInstance) {
            logger.warn(`No instance found for base date ${baseDate}`);
            return null;
        }
        logger.info(`Base instance: ${baseInstance.refDate} (ID: ${baseInstance.instanceId})`);
        // Find comparison instance (most recent before base date where expected date not provided)
        let comparisonInstance = null;
        if (!returnConfig.expectedDate) {
            comparisonInstance = DataProcessor.findInstanceBeforeDate(instances, baseDate);
        }
        else {
            comparisonInstance = DataProcessor.findInstanceByDate(instances, returnConfig.expectedDate);
            if (!comparisonInstance) {
                logger.warn(`No comparison instance found for expected date ${returnConfig.expectedDate} picking next closest instance before ${returnConfig.expectedDate}`);
                comparisonInstance = DataProcessor.findInstanceBeforeDate(instances, returnConfig.expectedDate);
            }
        }
        if (!comparisonInstance) {
            logger.warn(`No comparison instance found before ${baseDate}`);
            return null;
        }
        logger.info(`Comparison instance: ${comparisonInstance.refDate} (ID: ${comparisonInstance.instanceId})`);
        // Get variance analysis
        logger.info('Fetching variance data...');
        const variances = await this.client.getFormAnalysis(returnConfig.code, comparisonInstance, baseInstance);
        // Get validation errors
        logger.info('Fetching validation results...');
        let validationErrors = [];
        try {
            const allValidations = await this.client.validateReturn(baseInstance);
            // Filter only failed validations
            validationErrors = allValidations.filter((v) => v.status === 'Fail');
            logger.info(`Found ${validationErrors.length} validation errors`);
        }
        catch (error) {
            logger.error('Failed to fetch validation results', { error: error.message });
        }
        const result = {
            formName: returnConfig.name,
            formCode: returnConfig.code,
            confirmed: returnConfig.confirmed || false,
            baseInstance,
            comparisonInstance,
            variances,
            validationsErrors: validationErrors,
        };
        logger.info(`✓ Completed: ${variances.length} variance records, ${validationErrors.length} validation errors`);
        return result;
    }
}
//# sourceMappingURL=variance-analyzer.js.map