/**
 * tRPC context setup
 * Provides services and database manager to tRPC procedures
 */

import type { ReportService } from '../../services/ReportService.js';
import type { VarianceService } from '../../services/VarianceService.js';
import type { DatabaseManager } from '../../db-manager.js';

export interface Context {
  reportService: ReportService;
  varianceService: VarianceService;
  dbManager: DatabaseManager;
}

export function createContext(
  reportService: ReportService,
  varianceService: VarianceService,
  dbManager: DatabaseManager
): Context {
  return {
    reportService,
    varianceService,
    dbManager,
  };
}

