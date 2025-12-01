/**
 * API handlers index
 * Central export point for all handlers
 * 
 * @module api/handlers
 */

export {
  handleGetReports,
  handleGetReportById,
  handleGetReportDetails,
  handleDeleteReport,
  handleGetStatistics,
  handleGetFilterOptions,
  ApiHandlerError as ReportHandlerError,
} from './report.handlers.js';

export {
  handleGetVariances,
  handleUpdateAnnotation,
  ApiHandlerError as VarianceHandlerError,
} from './variance.handlers.js';