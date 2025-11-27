/**
 * Variance analysis logic with progress broadcasting
 */

import { logger } from './logger.js';
import { AgileReporterClient } from './api-client.js';
import { findInstanceByDate, findInstanceBeforeDate, InstanceSearchResult } from './data-processor.js';
//import { ReturnConfig } from './models.js';
import { MultiProgressBar } from './progress-bar.js';
import pLimit from 'p-limit';
import { EventEmitter } from 'events';
import { AnalysisResult, ReturnConfig, ValidationResult } from './types/index.js';

export interface ProgressEvent {
  type: 'progress';
  step: string;
  current: number;
  total: number;
  message: string;
}

export class VarianceAnalyzer extends EventEmitter {
  constructor(
    private client: AgileReporterClient
  ) {
    super();
  }

  /**
   * Emit progress update
   */
  private emitProgress(step: string, current: number, total: number, message: string): void {
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
  async analyzeReturns(
    returns: ReturnConfig[],
    baseDate: string
  ): Promise<AnalysisResult[]> {
    const limit = pLimit(3);
    const results: AnalysisResult[] = [];
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

    const promises = returns.map(returnConfig =>
      limit(async () => {
        try {
          // Step 1: Fetch versions
          multibar.update(returnConfig.code, 1, 'Fetching versions...');
          currentStep++;
          this.emitProgress(
            'analyzing',
            currentStep,
            totalSteps,
            `Fetching ${returnConfig.name} versions (${currentStep}/${totalSteps})`
          );
          
          const result = await this.analyzeReturn(returnConfig, baseDate, (step : string, _message: string) => {
            // Sub-progress callback
            if (step === 'analyze') {
              multibar.update(returnConfig.code, 2, 'Analyzing variances...');
              currentStep++;
              this.emitProgress(
                'analyzing',
                currentStep,
                totalSteps,
                `Analyzing ${returnConfig.name} (${currentStep}/${totalSteps})`
              );
            } else if (step === 'validate') {
              multibar.update(returnConfig.code, 3, 'Validating...');
              currentStep++;
              this.emitProgress(
                'analyzing',
                currentStep,
                totalSteps,
                `Validating ${returnConfig.name} (${currentStep}/${totalSteps})`
              );
            }
          });
          
          multibar.update(returnConfig.code, 3, '✓ Complete');
          
          if (result) results.push(result);
        } catch (error: any) {
          multibar.update(returnConfig.code, 3, '✗ Failed');
          logger.error(`Error: ${returnConfig.name}`, { error: error.message });
          
          // Still increment step counter on failure
          currentStep = Math.min(currentStep + 2, totalSteps);
          this.emitProgress(
            'analyzing',
            currentStep,
            totalSteps,
            `Failed ${returnConfig.name} (${currentStep}/${totalSteps})`
          );
        }
      })
    );

    await Promise.all(promises);
    multibar.stop();

    return results;
  }

  /**
   * Analyze a single return against the base date
   */
  private async analyzeReturn(
returnConfig: ReturnConfig, baseDate: string, _p0?: (step: string, _message: string) => void  ): Promise<AnalysisResult | null> {
    // Get all versions of the form
    this.emitProgress(
      'analyzing',
      1,
      3,
      `Fetching version ${returnConfig.name} (1/3)`
    );
    const versionsResult = await this.client.getFormVersions(returnConfig.code);

    if(!versionsResult.success) {
      logger.warn(`No instances found for ${returnConfig.code}, error: ${versionsResult.error}`);
      return null;
    }

    const instances = versionsResult.data;

    logger.info(`Found ${instances.length} instances`);

    // Find base instance (exact match on base date)
    const bInstance = findInstanceByDate(instances, baseDate);

    if(!bInstance.success){
      logger.warn(`No instance found for base date ${baseDate}, error: ${bInstance.error}`);
      return null;
    }

    const baseInstance = bInstance.data;

    logger.info(`Base instance: ${baseInstance.instance.referenceDate} (ID: ${baseInstance.instance.id})`);

    // Find comparison instance (most recent before base date where expected date not provided)
    let comparisonInstance: InstanceSearchResult | null
    if (!returnConfig.expectedDate) {
      const beforeResult = findInstanceBeforeDate(instances, baseDate);
      comparisonInstance = beforeResult.success ? beforeResult.data : null;
    } else {
      const expectedResult = findInstanceByDate(instances, returnConfig.expectedDate);
      comparisonInstance = expectedResult.success ? expectedResult.data : null;
      if (!comparisonInstance) {
        logger.warn(`No comparison instance found for expected date ${returnConfig.expectedDate} picking next closest instance before ${returnConfig.expectedDate}`);
        const beforeResult = findInstanceBeforeDate(instances, returnConfig.expectedDate);
        comparisonInstance = beforeResult.success ? beforeResult.data : null;
      }
    }

    if (!comparisonInstance) {
      logger.warn(`No comparison instance found before ${baseDate}`);
      return null;
    }

    logger.info(
      `Comparison instance: ${comparisonInstance.instance.referenceDate} (ID: ${comparisonInstance.instance.id})`
    );

    // Get variance analysis
    logger.info('Fetching variance data...');
    this.emitProgress(
      'analyzing',
      2,
      3,
      `Retrieving variance results ${returnConfig.name} (2/3)`
    );
    const variances = await this.client.getFormAnalysis(
      returnConfig.code,
      comparisonInstance.instance,
      baseInstance.instance
    );

    if(!variances.success) {
      logger.error(`Failed to fetch variance data, error: ${variances.error}`);
      return null;
    }

    // Get validation errors
    logger.info('Fetching validation results...');
    this.emitProgress(
      'analyzing',
      3,
      3,
      `Retrieving validation results ${returnConfig.name} (3/3)`
    );
    let validationErrors: ValidationResult[] = [];
    try {
      const validationsResult = await this.client.validateReturn(baseInstance.instance);
      if(!validationsResult.success) {
        logger.error(`Failed to fetch validation results, error: ${validationsResult.error}`);
        return null;
      }

      const allValidations = validationsResult.data;
      // Filter only failed validations
      validationErrors = allValidations.filter((v) => v.status === 'Fail');
      logger.info(`Found ${validationErrors.length} validation errors`);
    } catch (error: any) {
      logger.error('Failed to fetch validation results', { error: error.message });
    }

    const result: AnalysisResult= {
      formName: returnConfig.name,
      formCode: returnConfig.code,
      confirmed: returnConfig.confirmed || false,
      baseInstance: baseInstance.instance,
      comparisonInstance: comparisonInstance.instance,
      variances: variances.data,
      validationsErrors: validationErrors,
    };

    logger.info(
      `✓ Completed: ${variances.data.length} variance records, ${validationErrors.length} validation errors`
    );

    return result;
  }
}