/**
 * Progress bar utilities for visual feedback
 */
import cliProgress from 'cli-progress';
import colors from 'ansi-colors';
export class ProgressBar {
    bar;
    startTime = 0;
    constructor(total, title = 'Processing') {
        this.bar = new cliProgress.SingleBar({
            format: colors.cyan('{title}') +
                ' |' +
                colors.green('{bar}') +
                '| ' +
                colors.yellow('{percentage}%') +
                ' | ETA: {eta_formatted} | {value}/{total} | ' +
                colors.gray('{current}'),
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true,
            stopOnComplete: true,
            clearOnComplete: false,
            formatValue: (value, _options, type) => {
                if (type === 'eta') {
                    const eta = Math.floor(value);
                    if (eta === 0 || !isFinite(eta)) {
                        return '0s';
                    }
                    const minutes = Math.floor(eta / 60);
                    const seconds = eta % 60;
                    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
                }
                return value.toString();
            },
        }, cliProgress.Presets.shades_classic);
        this.bar.start(total, 0, {
            title,
            current: 'Initializing...',
        });
        this.startTime = Date.now();
    }
    /**
     * Update progress
     */
    update(value, current) {
        this.bar.update(value, {
            current: current || '',
            eta_formatted: this.formatETA(value),
        });
    }
    /**
     * Increment progress by 1
     */
    increment(current) {
        this.bar.increment(1, {
            current: current || '',
        });
    }
    /**
     * Stop the progress bar
     */
    stop() {
        const elapsed = Date.now() - this.startTime;
        const elapsedStr = this.formatDuration(elapsed);
        this.bar.update(this.bar.getTotal(), {
            current: `Completed in ${elapsedStr}`,
        });
        this.bar.stop();
    }
    /**
     * Format ETA in human-readable format
     */
    formatETA(current) {
        const total = this.bar.getTotal();
        if (current === 0)
            return 'Calculating...';
        const elapsed = Date.now() - this.startTime;
        const rate = elapsed / current;
        const remaining = (total - current) * rate;
        return this.formatDuration(remaining);
    }
    /**
     * Format duration in ms to human-readable string
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        else {
            return `${seconds}s`;
        }
    }
}
/**
 * Multi-bar progress for multiple concurrent operations
 */
export class MultiProgressBar {
    multibar;
    bars = new Map();
    constructor() {
        this.multibar = new cliProgress.MultiBar({
            format: colors.cyan('{name}') +
                ' |' +
                colors.green('{bar}') +
                '| ' +
                colors.yellow('{percentage}%') +
                ' | {value}/{total} | ' +
                colors.gray('{status}'),
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true,
            clearOnComplete: false,
            stopOnComplete: true,
        }, cliProgress.Presets.shades_grey);
    }
    /**
     * Create a new progress bar
     */
    create(key, total, name) {
        const bar = this.multibar.create(total, 0, {
            name,
            status: 'Waiting...',
        });
        this.bars.set(key, bar);
    }
    /**
     * Update a specific progress bar
     */
    update(key, value, status) {
        const bar = this.bars.get(key);
        if (bar) {
            bar.update(value, { status: status || '' });
        }
    }
    /**
     * Increment a specific progress bar
     */
    increment(key, status) {
        const bar = this.bars.get(key);
        if (bar) {
            bar.increment(1, { status: status || '' });
        }
    }
    /**
     * Stop all progress bars
     */
    stop() {
        this.multibar.stop();
    }
}
//# sourceMappingURL=progress-bar.js.map