/**
 * Main application entry point for variance analysis
 */

import { readFile } from 'fs/promises';
import { Command } from 'commander';
import { logger, setupLogging } from './logger.js';
//import { Config } from './config.js';
import { getApiConfig, getAuthConfig } from './config.js';
import { AgileReporterClient } from './api-client.js';
import { VarianceAnalyzer } from './variance-analyzer.js';
import { ExcelExporter } from './excel-exporter.js';
import { ConfigFile, ReturnConfig, AnalysisResult } from './models.js';
import { DashboardServer } from './dashboard/server.js';
import { ReportSaver } from './report-saver.js';

/**
 * Global dashboard reference for progress broadcasting
 */
let globalDashboard: DashboardServer | null = null;

/**
 * Broadcast progress to dashboard
 * UPDATED: Now sends JSON to stdout for server parsing
 */
function broadcastProgress(step: string, current: number, total: number, message: string, reportId?: string): void {
  // Send as JSON to stdout for server to parse (when running as child process)
  console.log(JSON.stringify({
    type: 'dashboard-progress',
    current,
    total,
    message: `[${step}] ${message}`,
    reportId
  }));
  
  // Also broadcast to local dashboard if running
  if (globalDashboard) {
    globalDashboard.broadcastProgress({
      type: 'progress',
      current,
      total,
      currentItem: `[${step}] ${message}`,
      reportId
    });
  }
}

/**
 * Load and validate configuration file
 */
async function loadConfigFile(configPath: string): Promise<ConfigFile> {
  try {
    const fileContent = await readFile(configPath, 'utf-8');
    const config: ConfigFile = JSON.parse(fileContent);

    // Validate required fields
    if (!config.baseDate) {
      throw new Error("Configuration must contain 'baseDate' field");
    }
    if (!config.returns) {
      throw new Error("Configuration must contain 'returns' field");
    }

    return config;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    throw error;
  }
}

/**
 * Parse return configurations from config data
 */
function parseReturnConfigs(returnsData: any[]): ReturnConfig[] {
  return returnsData.map((r) => ({
    code: r.code,
    name: r.name,
    expectedDate: r.expectedDate,
    confirmed: r.confirmed || false,
  }));
}

/**
 * Print summary of analysis results
 */
function printSummary(results: AnalysisResult[]): void {
  logger.info('='.repeat(80));
  logger.info('SUMMARY');
  logger.info('='.repeat(80));

  for (const result of results) {
    logger.info(`${result.formName} (${result.formCode}):`);
    logger.info(
      `  Comparison: ${result.comparisonInstance.refDate} vs ${result.baseInstance.refDate}`
    );
    logger.info(`  Variances: ${result.variances.length} records`);
    logger.info(`  Validation Errors: ${result.validationsErrors.length} records`);
  }
}

/**
 * Main application function
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
    .option('--report-id <id>', 'Report ID for dashboard tracking') // ADDED
    .parse(process.argv);

  const options = program.opts();
  const [configPath] = program.args;
  const reportIdFromArgs = options.reportId; // ADDED

  // Setup logging
  const appLogger = setupLogging(options.verbose);

  const startTime = Date.now();
  let dashboard: DashboardServer | null = null;

  // Progress tracking
  const STEPS = {
    AUTHENTICATION: { index: 1, total: 4, name: 'Authentication' },
    ANALYZING: { index: 2, total: 4, name: 'Analyzing Returns' },
    EXPORTING: { index: 3, total: 4, name: 'Exporting to Excel' },
    SAVING: { index: 4, total: 4, name: 'Saving Report' },
  };

  try {
    // Load configuration
    appLogger.info(`Loading configuration from: ${configPath}`);
    const configData = await loadConfigFile(configPath);

    const baseDate = configData.baseDate;
    const returns = parseReturnConfigs(configData.returns);

    appLogger.info(`Base date: ${baseDate}`);
    appLogger.info(`Number of returns to process: ${returns.length}`);

    // Initialize dashboard if requested
    if (options.serve) {
      appLogger.info('Starting dashboard server...');
      dashboard = new DashboardServer(parseInt(options.port));
      await dashboard.start();
    }

    // Set global dashboard for progress broadcasting
    globalDashboard = dashboard;

    // Get application config
    const authConfig = getAuthConfig();
    const apiConfig = getApiConfig();

    // STEP 1: Authentication
    appLogger.info('='.repeat(80));
    appLogger.info('STEP 1: AUTHENTICATION');
    appLogger.info('='.repeat(80));
    broadcastProgress(
      STEPS.AUTHENTICATION.name,
      STEPS.AUTHENTICATION.index,
      STEPS.AUTHENTICATION.total,
      'Authenticating with AgileReporter...',
      reportIdFromArgs // ADDED
    );

    const client = new AgileReporterClient(authConfig, apiConfig);
    await client.authenticate();
    appLogger.info('✓ Authentication successful');

    // STEP 2: Analyze Returns
    appLogger.info('='.repeat(80));
    appLogger.info(`STEP 2: ANALYZING ${returns.length} RETURNS`);
    appLogger.info('='.repeat(80));
    broadcastProgress(
      STEPS.ANALYZING.name,
      STEPS.ANALYZING.index,
      STEPS.ANALYZING.total,
      `Analyzing ${returns.length} returns...`,
      reportIdFromArgs // ADDED
    );

    const analyzer = new VarianceAnalyzer(client);
    
    // Listen to analyzer progress events
    analyzer.on('progress', (event) => {
      broadcastProgress(
        STEPS.ANALYZING.name,
        STEPS.ANALYZING.index,
        STEPS.ANALYZING.total,
        `Processing returns: ${event.current}/${event.total} - ${event.message}`,
        reportIdFromArgs // ADDED
      );
    });

    const results = await analyzer.analyzeReturns(returns, baseDate);
    appLogger.info(`✓ Analyzed ${results.length} returns`);

    // Print summary
    printSummary(results);

    // STEP 3: Export to Excel
    if (results.length > 0) {
      appLogger.info('='.repeat(80));
      appLogger.info('STEP 3: EXPORTING TO EXCEL');
      appLogger.info('='.repeat(80));
      broadcastProgress(
        STEPS.EXPORTING.name,
        STEPS.EXPORTING.index,
        STEPS.EXPORTING.total,
        'Creating Excel workbook...',
        reportIdFromArgs // ADDED
      );

      try {
        const exporter = new ExcelExporter();
        await exporter.exportResults(results, options.output);
        appLogger.info(`✓ Excel file created: ${options.output}`);

        // STEP 4: Save Report
        appLogger.info('='.repeat(80));
        appLogger.info('STEP 4: SAVING REPORT FOR DASHBOARD');
        appLogger.info('='.repeat(80));
        broadcastProgress(
          STEPS.SAVING.name,
          STEPS.SAVING.index,
          STEPS.SAVING.total,
          'Saving report metadata and details...',
          reportIdFromArgs // ADDED
        );

        const reportSaver = new ReportSaver();
        await reportSaver.initialize();
        
        const reportId = await reportSaver.saveReport(
          results,
          configData,
          options.output,
          Date.now() - startTime,
          'completed'
        );
        
        await reportSaver.close();
        
        appLogger.info(`✓ Report saved to dashboard: ${reportId}`);

        // Broadcast completion
        if (dashboard) {
          appLogger.info('Broadcasting completion to dashboard clients...');
          dashboard.broadcastProgress({
            type: 'complete',
            current: STEPS.SAVING.total,
            total: STEPS.SAVING.total,
            reportId,
          });
        }

        // Optional: Clean up old reports (keep last 20)
        // await reportSaver.cleanupOldReports(20);
      } catch (saveError: any) {
        appLogger.error('Failed to save report', {
          error: saveError.message,
          stack: saveError.stack,
        });
        throw saveError;
      }
    } else {
      appLogger.warn('No results to export');
    }

    appLogger.info('='.repeat(80));
    appLogger.info('✓ PROCESS COMPLETED SUCCESSFULLY');
    appLogger.info('='.repeat(80));

    // Keep server running if dashboard is active
    if (dashboard) {
      appLogger.info('\n📊 Dashboard is running. Press Ctrl+C to stop.');
      // Keep process alive
      await new Promise(() => {}); // Never resolves
    }

    return 0;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      appLogger.error(`File error: ${error.message}`);
    } else if (error instanceof SyntaxError) {
      appLogger.error(`Invalid JSON in configuration file: ${error.message}`);
    } else {
      appLogger.error(`Unexpected error: ${error.message}`, { error });
    }

    // Broadcast error to dashboard
    if (dashboard) {
      dashboard.broadcastProgress({
        type: 'error',
        current: 0,
        total: 0,
        message: error.message,
      });
    }

    return 1;
  }
}

// Run main function
main()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });