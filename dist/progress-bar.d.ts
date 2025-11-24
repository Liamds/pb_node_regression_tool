/**
 * Progress bar utilities for visual feedback
 */
export declare class ProgressBar {
    private bar;
    private startTime;
    constructor(total: number, title?: string);
    /**
     * Update progress
     */
    update(value: number, current?: string): void;
    /**
     * Increment progress by 1
     */
    increment(current?: string): void;
    /**
     * Stop the progress bar
     */
    stop(): void;
    /**
     * Format ETA in human-readable format
     */
    private formatETA;
    /**
     * Format duration in ms to human-readable string
     */
    private formatDuration;
}
/**
 * Multi-bar progress for multiple concurrent operations
 */
export declare class MultiProgressBar {
    private multibar;
    private bars;
    constructor();
    /**
     * Create a new progress bar
     */
    create(key: string, total: number, name: string): void;
    /**
     * Update a specific progress bar
     */
    update(key: string, value: number, status?: string): void;
    /**
     * Increment a specific progress bar
     */
    increment(key: string, status?: string): void;
    /**
     * Stop all progress bars
     */
    stop(): void;
}
//# sourceMappingURL=progress-bar.d.ts.map