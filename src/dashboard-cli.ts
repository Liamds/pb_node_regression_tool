/**
 * Standalone dashboard server CLI
 * Supports both Express (legacy) and Next.js (new) dashboard modes
 */

import { Command } from 'commander';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { DashboardServer } from './dashboard/server.js';
import { logger } from './logger.js';

interface DashboardOptions {
  port: number;
  mode: 'express' | 'nextjs' | 'auto';
}

/**
 * Start Next.js development server
 */
function startNextJsServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const webDir = join(process.cwd(), 'web');
    
    if (!existsSync(webDir)) {
      reject(new Error('Next.js web directory not found. Run Phase 2 setup first.'));
      return;
    }

    logger.info('Starting Next.js dashboard server...');
    logger.info(`Dashboard will be available at: http://localhost:${port}`);
    logger.info('Note: Next.js runs on port 3000 by default. API backend should run on port 5000.');

    const nextProcess = spawn('npm', ['run', 'dev'], {
      cwd: webDir,
      stdio: 'inherit',
      shell: true,
    });

    nextProcess.on('error', (error) => {
      logger.error('Failed to start Next.js server', { error: error.message });
      reject(error);
    });

    nextProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Next.js server exited with code ${code}`));
      }
    });

    // Give Next.js a moment to start
    setTimeout(() => {
      logger.info('Next.js server starting...');
      resolve();
    }, 2000);

    // Handle graceful shutdown
    const shutdown = () => {
      logger.info('\nShutting down Next.js server...');
      nextProcess.kill('SIGTERM');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}

/**
 * Start Express dashboard server (legacy)
 */
async function startExpressServer(port: number): Promise<void> {
  const dashboard = new DashboardServer(port);
  await dashboard.start();

  logger.info('Express dashboard server started successfully');
  logger.info(`Open your browser to: http://localhost:${port}`);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('\nShutting down dashboard server...');
    await dashboard.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('\nShutting down dashboard server...');
    await dashboard.stop();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

/**
 * Auto-detect which server to use
 */
function detectServerMode(): 'express' | 'nextjs' {
  const webDir = join(process.cwd(), 'web');
  const nextConfigExists = existsSync(join(webDir, 'next.config.js')) || 
                          existsSync(join(webDir, 'next.config.ts'));
  
  if (nextConfigExists) {
    logger.info('Next.js detected. Using Next.js dashboard mode.');
    return 'nextjs';
  }
  
  logger.info('Next.js not found. Using Express dashboard mode (legacy).');
  return 'express';
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('dashboard')
    .description('Start the variance analysis dashboard server')
    .version('1.0.0')
    .option('-p, --port <number>', 'Server port (Next.js uses 3000, Express uses specified port)', '3000')
    .option('-m, --mode <mode>', 'Server mode: express, nextjs, or auto (default: auto)', 'auto')
    .parse(process.argv);

  const options = program.opts();
  const port = parseInt(options.port);
  const mode = (options.mode || 'auto') as DashboardOptions['mode'];

  try {
    let serverMode: 'express' | 'nextjs';
    
    if (mode === 'auto') {
      serverMode = detectServerMode();
    } else {
      serverMode = mode;
    }

    if (serverMode === 'nextjs') {
      await startNextJsServer(port);
    } else {
      await startExpressServer(port);
    }
  } catch (error: any) {
    logger.error('Failed to start dashboard server', { error: error.message });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});