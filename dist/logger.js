/**
 * Logging configuration using Winston
 */
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Create logs directory
const logsDir = join(dirname(__dirname), 'logs');
if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
}
// Define log format
const logFormat = winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.errors({ stack: true }), winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} - ${level.toUpperCase().padEnd(10)} - ${message}`;
    if (stack) {
        log += `\n${stack}`;
    }
    if (Object.keys(meta).length > 0) {
        log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return log;
}));
/**
 * Setup logging with console, app.log, and errors.log
 */
export function setupLogging(verbose = false) {
    const fileLevel = verbose ? 'debug' : 'info';
    const consoleLevel = verbose ? 'debug' : 'info';
    const logger = winston.createLogger({
        level: 'debug',
        format: logFormat,
        transports: [
            // Console handler
            new winston.transports.Console({
                level: consoleLevel,
                format: winston.format.combine(winston.format.colorize(), logFormat),
            }),
            // All logs file handler (rotating)
            new DailyRotateFile({
                filename: join(logsDir, 'app-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                level: fileLevel,
                maxSize: '200m',
                maxFiles: '5d',
            }),
            // Error logs file handler
            new DailyRotateFile({
                filename: join(logsDir, 'errors-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                level: 'error',
                maxSize: '200m',
                maxFiles: '5d',
            }),
        ],
    });
    return logger;
}
// Default logger instance
export const logger = setupLogging();
//# sourceMappingURL=logger.js.map