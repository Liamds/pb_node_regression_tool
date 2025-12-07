/**
 * Main application entry point for variance analysis
 * 
 * Features:
 * - 100% TypeScript safety with explicit return types
 * - Result<T, E> pattern for error handling
 * - Comprehensive error boundaries
 * - Dependency injection ready
 * - Pure business logic with isolated side effects
 * - Zero implicit any types
 * 
 * @module main
 */

import { readFile } from 'fs/promises';
import { Command } from 'commander';
import { z } from 'zod';
import { logger, setupLogging } from './logger.js';
import { getApiConfig, getAuthConfig, validateEnvironmentOrThrow } from './config.js';
import { AgileReporterClient } from './api-client.js';
import { VarianceAnalyzer } from './variance-analyzer.js';
import { ExcelExporter } from './excel-exporter.js';
import { DashboardServer } from './dashboard/server.js';
import { ReportSaver } from './report-saver.js';
import type {
  AnalysisResult,
  ConfigFile,
  ReturnConfig,
  AsyncResult,
} from './types/index.js';
import { validateConfigFile } from './validation/schemas.js';

// ============================================
// ERROR TYPES
// ============================================

/**
 * Main application error codes
 */
export enum MainErrorCode {
  CONFIG_LOAD_FAILED = 'CONFIG_LOAD_FAILED',
  CONFIG_PARSE_FAILED = 'CONFIG_PARSE_FAILED',
  CONFIG_VALIDATION_FAILED = 'CONFIG_VALIDATION_FAILED',
  ENVIRONMENT_VALIDATION_FAILED = 'ENVIRONMENT_VALIDATION_FAILED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  ANALYSIS_FAILED = 'ANALYSIS_FAILED',
  EXPORT_FAILED = 'EXPORT_FAILED',
  SAVE_FAILED = 'SAVE_FAILED',
  DASHBOARD_FAILED = 'DASHBOARD_FAILED',
  INVALID_ARGUMENTS = 'INVALID_ARGUMENTS',
}

/**
 * Main application error class
 */
export class MainError extends Error {
  constructor(
    message: string,
    public readonly code: MainErrorCode,
    public readonly context?: Record<string, unknown>,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'MainError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MainError);
    }
  }
}

// ============================================
// CLI ARGUMENT TYPES
// ============================================

/**
 * CLI argument schema with validation
 */
const CliArgumentsSchema = z.object({
  config: z.string().min(1, 'Config file path is required'),
  output: z.string().default('variance_results.xlsx'),
  verbose: z.boolean().default(false),
  progress: z.boolean().default(true),
  serve: z.boolean().default(false),
  port: z.string().default('3000').transform(val => parseInt(val, 10)),
  reportId: z.string().optional(),
});

type CliArguments = z.infer<typeof CliArgumentsSchema>;

// ============================================
// PROGRESS TRACKING
// ============================================

/**
 * Analysis steps with metadata
 */
const ANALYSIS_STEPS = {
  AUTHENTICATION: { index: 1, total: 4, name: 'Authentication' },
  ANALYZING: { index: 2, total: 4, name: 'Analyzing Returns' },
  EXPORTING: { index: 3, total: 4, name: 'Exporting to Excel' },
  SAVING: { index: 4, total: 4, name: 'Saving Report' },
} as const;


/**
 * Progress broadcaster for dashboard integration
 */
interface ProgressBroadcaster {
  broadcast(step: string, current: number, total: number, message: string, reportId?: string): void;
}

/**
 * Create progress broadcaster
 */
function createProgressBroadcaster(
  dashboard: DashboardServer | null
): ProgressBroadcaster {
  return {
    broadcast(step: string, current: number, total: number, message: string, reportId?: string): void {
      // Send as JSON to stdout for server parsing (when running as child process)
      console.log(JSON.stringify({
        type: 'dashboard-progress',
        current,
        total,
        message: `[${step}] ${message}`,
        reportId
      }));
      
      // Also broadcast to local dashboard if running
      if (dashboard) {
        dashboard.broadcastProgress({
          type: 'progress',
          current,
          total,
          currentItem: `[${step}] ${message}`,
          reportId
        });
      }
    }
  };
}

// ============================================
// CONFIGURATION LOADING
// ============================================

/**
 * Load and validate configuration file
 * 
 * @param configPath - Path to configuration file
 * @returns Result with validated config or error
 */
async function loadConfigFile(
  configPath: string
): AsyncResult<ConfigFile, MainError> {
  try {
    logger.info(`Loading configuration from: ${configPath}`);
    
    const fileContent = await readFile(configPath, 'utf-8');
    
    // Parse JSON
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(fileContent);
    } catch (parseError) {
      return {
        success: false,
        error: new MainError(
          `Invalid JSON in configuration file: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`,
          MainErrorCode.CONFIG_PARSE_FAILED,
          { configPath },
          parseError
        ),
      };
    }

    // Validate with Zod
    try {
      const validConfig = validateConfigFile(parsedData);
      logger.info(`Configuration loaded successfully`);
      logger.info(`Base date: ${validConfig.baseDate}`);
      logger.info(`Number of returns: ${validConfig.returns.length}`);
      
      return { success: true, data: validConfig };
    } catch (validationError) {
      return {
        success: false,
        error: new MainError(
          `Configuration validation failed: ${validationError instanceof Error ? validationError.message : 'Validation failed'}`,
          MainErrorCode.CONFIG_VALIDATION_FAILED,
          { configPath },
          validationError
        ),
      };
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        success: false,
        error: new MainError(
          `Configuration file not found: ${configPath}`,
          MainErrorCode.CONFIG_LOAD_FAILED,
          { configPath },
          error
        ),
      };
    }

    return {
      success: false,
      error: new MainError(
        `Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        MainErrorCode.CONFIG_LOAD_FAILED,
        { configPath },
        error
      ),
    };
  }
}

/**
 * Parse return configurations from config data
 * 
 * @param returnsData - Raw return configurations
 * @returns Array of validated return configs
 */
function parseReturnConfigs(
  returnsData: readonly ReturnConfig[]
): readonly ReturnConfig[] {
  return returnsData.map((r) => ({
    code: r.code,
    name: r.name,
    expectedDate: r.expectedDate,
    confirmed: r.confirmed ?? false,
  }));
}

// ============================================
// SUMMARY PRINTING
// ============================================

/**
 * Print analysis summary to console
 * 
 * @param results - Analysis results to summarize
 */
function printAnalysisSummary(results: readonly AnalysisResult[]): void {
  logger.info('='.repeat(80));
  logger.info('ANALYSIS SUMMARY');
  logger.info('='.repeat(80));

  for (const result of results) {
    logger.info(`${result.formName} (${result.formCode}):`);
    logger.info(
      `  Comparison: ${result.comparisonInstance.referenceDate} → ${result.baseInstance.referenceDate}`
    );
    logger.info(`  Variances: ${result.variances.length} records`);
    logger.info(`  Validation Errors: ${result.validationsErrors.length} records`);
  }

  logger.info('='.repeat(80));
}

// ============================================
// STEP EXECUTION FUNCTIONS
// ============================================

/**
 * Execute authentication step
 */
async function executeAuthentication(
  broadcaster: ProgressBroadcaster,
  reportId?: string
): AsyncResult<AgileReporterClient, MainError> {
  logger.info('='.repeat(80));
  logger.info('STEP 1: AUTHENTICATION');
  logger.info('='.repeat(80));

  broadcaster.broadcast(
    ANALYSIS_STEPS.AUTHENTICATION.name,
    ANALYSIS_STEPS.AUTHENTICATION.index,
    ANALYSIS_STEPS.AUTHENTICATION.total,
    'Authenticating with AgileReporter...',
    reportId
  );

  try {
    const authConfig = getAuthConfig();
    const apiConfig = getApiConfig();

    const client = new AgileReporterClient(authConfig, apiConfig);
    const authResult = await client.authenticate();

    if (!authResult.success) {
      return {
        success: false,
        error: new MainError(
          `Authentication failed: ${authResult.error.message}`,
          MainErrorCode.AUTHENTICATION_FAILED,
          undefined,
          authResult.error
        ),
      };
    }

    logger.info('✓ Authentication successful');
    return { success: true, data: client };
  } catch (error) {
    return {
      success: false,
      error: new MainError(
        `Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        MainErrorCode.AUTHENTICATION_FAILED,
        undefined,
        error
      ),
    };
  }
}

/**
 * Execute analysis step
 */
async function executeAnalysis(
  client: AgileReporterClient,
  returns: readonly ReturnConfig[],
  baseDate: string,
  broadcaster: ProgressBroadcaster,
  reportId?: string
): AsyncResult<readonly AnalysisResult[], MainError> {
  logger.info('='.repeat(80));
  logger.info(`STEP 2: ANALYZING ${returns.length} RETURNS`);
  logger.info('='.repeat(80));

  broadcaster.broadcast(
    ANALYSIS_STEPS.ANALYZING.name,
    ANALYSIS_STEPS.ANALYZING.index,
    ANALYSIS_STEPS.ANALYZING.total,
    `Analyzing ${returns.length} returns...`,
    reportId
  );

  try {
    const analyzer = new VarianceAnalyzer(client);

    // Listen to analyzer progress events
    analyzer.on('progress', (event) => {
      broadcaster.broadcast(
        ANALYSIS_STEPS.ANALYZING.name,
        ANALYSIS_STEPS.ANALYZING.index,
        ANALYSIS_STEPS.ANALYZING.total,
        `Processing returns: ${event.current}/${event.total} - ${event.message}`,
        reportId
      );
    });

    const analysisResult = await analyzer.analyzeReturns(returns, baseDate);

    if (!analysisResult.success) {
      return {
        success: false,
        error: new MainError(
          `Analysis failed: ${analysisResult.error.message}`,
          MainErrorCode.ANALYSIS_FAILED,
          { formCode: analysisResult.error.formCode },
          analysisResult.error
        ),
      };
    }

    logger.info(`✓ Analyzed ${analysisResult.data.length} returns`);
    return analysisResult;
  } catch (error) {
    return {
      success: false,
      error: new MainError(
        `Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        MainErrorCode.ANALYSIS_FAILED,
        undefined,
        error
      ),
    };
  }
}

/**
 * Execute export step
 */
async function executeExport(
  results: readonly AnalysisResult[],
  outputFile: string,
  broadcaster: ProgressBroadcaster,
  reportId?: string
): AsyncResult<void, MainError> {
  logger.info('='.repeat(80));
  logger.info('STEP 3: EXPORTING TO EXCEL');
  logger.info('='.repeat(80));

  broadcaster.broadcast(
    ANALYSIS_STEPS.EXPORTING.name,
    ANALYSIS_STEPS.EXPORTING.index,
    ANALYSIS_STEPS.EXPORTING.total,
    'Creating Excel workbook...',
    reportId
  );

  try {
    const exporter = new ExcelExporter();
    const exportResult = await exporter.exportResults(results, outputFile);

    if (!exportResult.success) {
      return {
        success: false,
        error: new MainError(
          `Export failed: ${exportResult.error.message}`,
          MainErrorCode.EXPORT_FAILED,
          { outputFile },
          exportResult.error
        ),
      };
    }

    logger.info(`✓ Excel file created: ${outputFile}`);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new MainError(
        `Export error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        MainErrorCode.EXPORT_FAILED,
        { outputFile },
        error
      ),
    };
  }
}

/**
 * Execute save step
 */
async function executeSave(
  results: readonly AnalysisResult[],
  config: ConfigFile,
  outputFile: string,
  duration: number,
  broadcaster: ProgressBroadcaster,
  dashboard: DashboardServer | null,
  reportId?: string
): AsyncResult<string, MainError> {
  logger.info('='.repeat(80));
  logger.info('STEP 4: SAVING REPORT FOR DASHBOARD');
  logger.info('='.repeat(80));

  broadcaster.broadcast(
    ANALYSIS_STEPS.SAVING.name,
    ANALYSIS_STEPS.SAVING.index,
    ANALYSIS_STEPS.SAVING.total,
    'Saving report metadata and details...',
    reportId
  );

  try {
    const reportSaver = new ReportSaver();
    const initResult = await reportSaver.initialize();

    if (!initResult.success) {
      return {
        success: false,
        error: new MainError(
          `Failed to initialize report saver: ${initResult.error.message}`,
          MainErrorCode.SAVE_FAILED,
          undefined,
          initResult.error
        ),
      };
    }

    const saveResult = await reportSaver.saveReport(
      results,
      config,
      outputFile,
      duration,
      'completed'
    );

    if (!saveResult.success) {
      await reportSaver.close();
      return {
        success: false,
        error: new MainError(
          `Failed to save report: ${saveResult.error.message}`,
          MainErrorCode.SAVE_FAILED,
          undefined,
          saveResult.error
        ),
      };
    }

    const savedReportId = saveResult.data;
    await reportSaver.close();

    logger.info(`✓ Report saved to dashboard: ${savedReportId}`);

    // Broadcast completion
    if (dashboard) {
      logger.info('Broadcasting completion to dashboard clients...');
      dashboard.broadcastProgress({
        type: 'complete',
        current: ANALYSIS_STEPS.SAVING.total,
        total: ANALYSIS_STEPS.SAVING.total,
        reportId: savedReportId,
      });
    }

    return { success: true, data: savedReportId };
  } catch (error) {
    return {
      success: false,
      error: new MainError(
        `Save error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        MainErrorCode.SAVE_FAILED,
        undefined,
        error
      ),
    };
  }
}

// ============================================
// MAIN APPLICATION LOGIC
// ============================================

/**
 * Main application function with comprehensive error handling
 * 
 * @returns Exit code (0 for success, 1 for failure)
 */
async function main(): Promise<number> {
  const program = new Command();

  program
    .name('variance-analysis')
    .description('Generate variance analysis reports from AgileReporter')
    .version('1.0.0')
    .argument('<config>', 'Path to JSON configuration file')
    .option('-o, --output <file>', 'Output Excel file path', 'variance_results.xlsx')
    .option('-v, --verbose', 'Enable verbose logging (DEBUG level)', false)
    .option('--no-progress', 'Disable progress bar', false)
    .option('-s, --serve', 'Start dashboard server after analysis', false)
    .option('-p, --port <number>', 'Dashboard server port', '3000')
    .option('--report-id <id>', 'Report ID for dashboard tracking')
    .parse(process.argv);

  // Parse and validate CLI arguments
  let args: CliArguments;
  try {
    const rawArgs = {
      config: program.args[0],
      ...program.opts(),
    };

    args = CliArgumentsSchema.parse(rawArgs);
  } catch (error) {
    console.error('Invalid arguments:', error instanceof Error ? error.message : 'Validation failed');
    return 1;
  }

  // Setup logging (must be done after args parsing to get verbose flag)
  setupLogging(args.verbose);

  // Validate environment
  try {
    validateEnvironmentOrThrow();
  } catch (error) {
    logger.error('Environment validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return 1;
  }

  const startTime = Date.now();
  let dashboard: DashboardServer | null = null;

  try {
    // Initialize dashboard if requested
    if (args.serve) {
      logger.info('Starting dashboard server...');
      dashboard = new DashboardServer(args.port);
      
      await dashboard.start().catch((error) => {
        throw new MainError(
          `Dashboard start failed: ${error.message}`,
          MainErrorCode.DASHBOARD_FAILED,
          undefined,
          error
        );
      });

      logger.info('Dashboard server started successfully');
    }

    // Create progress broadcaster
    const broadcaster = createProgressBroadcaster(dashboard);

    // STEP 1: Load configuration
    const configResult = await loadConfigFile(args.config);
    if (!configResult.success) {
      if (dashboard) {
        dashboard.broadcastProgress({
          type: 'error',
          message: configResult.error.message,
        });
      }
      logger.error(configResult.error.message, {
        code: configResult.error.code,
        context: configResult.error.context,
      });
      return 1;
    }

    const config = configResult.data;
    const returns = parseReturnConfigs(config.returns);

    // STEP 2: Authenticate
    const clientResult = await executeAuthentication(broadcaster, args.reportId);
    if (!clientResult.success) {
      if (dashboard) {
        dashboard.broadcastProgress({
          type: 'error',
          message: clientResult.error.message,
        });
      }
      logger.error(clientResult.error.message, {
        code: clientResult.error.code,
      });
      return 1;
    }

    const client = clientResult.data;

    // STEP 3: Analyze returns
    const analysisResult = await executeAnalysis(
      client,
      returns,
      config.baseDate,
      broadcaster,
      args.reportId
    );

    if (!analysisResult.success) {
      if (dashboard) {
        dashboard.broadcastProgress({
          type: 'error',
          message: analysisResult.error.message,
        });
      }
      logger.error(analysisResult.error.message, {
        code: analysisResult.error.code,
        context: analysisResult.error.context,
      });
      return 1;
    }

    const results = analysisResult.data;

    // Print summary
    printAnalysisSummary(results);

    // STEP 4: Export to Excel
    if (results.length > 0) {
      const exportResult = await executeExport(
        results,
        args.output,
        broadcaster,
        args.reportId
      );

      if (!exportResult.success) {
        if (dashboard) {
          dashboard.broadcastProgress({
            type: 'error',
            message: exportResult.error.message,
          });
        }
        logger.error(exportResult.error.message, {
          code: exportResult.error.code,
          context: exportResult.error.context,
        });
        return 1;
      }

      // STEP 5: Save report
      const saveResult = await executeSave(
        results,
        config,
        args.output,
        Date.now() - startTime,
        broadcaster,
        dashboard,
        args.reportId
      );

      if (!saveResult.success) {
        if (dashboard) {
          dashboard.broadcastProgress({
            type: 'error',
            message: saveResult.error.message,
          });
        }
        logger.error(saveResult.error.message, {
          code: saveResult.error.code,
        });
        return 1;
      }
    } else {
      logger.warn('No results to export');
    }

    logger.info('='.repeat(80));
    logger.info('✓ PROCESS COMPLETED SUCCESSFULLY');
    logger.info('='.repeat(80));

    // Keep server running if dashboard is active
    if (dashboard) {
      logger.info('\n📊 Dashboard is running. Press Ctrl+C to stop.');
      // Keep process alive
      await new Promise(() => {}); // Never resolves
    }

    return 0;
  } catch (error) {
    // Catch-all error handler
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorCode = error instanceof MainError ? error.code : MainErrorCode.ANALYSIS_FAILED;

    logger.error(`Fatal error: ${errorMessage}`, {
      code: errorCode,
      error: error instanceof Error ? error.stack : undefined,
    });

    // Broadcast error to dashboard
    if (dashboard) {
      dashboard.broadcastProgress({
        type: 'error',
        message: errorMessage,
      });
    }

    return 1;
  }
}

// ============================================
// ENTRY POINT
// ============================================

/**
 * Application entry point with top-level error handling
 */
main()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Fatal error in main', { error: errorMessage, stack: error instanceof Error ? error.stack : undefined });
    console.error('Fatal error:', error);
    process.exit(1);
  });