/**
 * Variance analysis logic with progress broadcasting
 */
import { AgileReporterClient } from './api-client.js';
import { ReturnConfig, AnalysisResult } from './models.js';
import { EventEmitter } from 'events';
export interface ProgressEvent {
    type: 'progress';
    step: string;
    current: number;
    total: number;
    message: string;
}
export declare class VarianceAnalyzer extends EventEmitter {
    private client;
    constructor(client: AgileReporterClient);
    /**
     * Emit progress update
     */
    private emitProgress;
    /**
     * Analyze multiple returns against a base date
     */
    analyzeReturns(returns: ReturnConfig[], baseDate: string): Promise<AnalysisResult[]>;
    /**
     * Analyze a single return against the base date
     */
    private analyzeReturn;
}
//# sourceMappingURL=variance-analyzer.d.ts.map