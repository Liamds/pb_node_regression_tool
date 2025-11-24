/**
 * Standalone dashboard server CLI
 */
import { Command } from 'commander';
import { DashboardServer } from './dashboard/server.js';
import { logger } from './logger.js';
async function main() {
    const program = new Command();
    program
        .name('dashboard')
        .description('Start the variance analysis dashboard server')
        .version('1.0.0')
        .option('-p, --port <number>', 'Server port', '3000')
        .parse(process.argv);
    const options = program.opts();
    const port = parseInt(options.port);
    try {
        const dashboard = new DashboardServer(port);
        await dashboard.start();
        logger.info('Dashboard server started successfully');
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
        await new Promise(() => { });
    }
    catch (error) {
        logger.error('Failed to start dashboard server', { error: error.message });
        process.exit(1);
    }
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=dashboard-cli.js.map