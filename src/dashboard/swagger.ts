// src/dashboard/swagger.ts
/**
 * Swagger/OpenAPI documentation configuration
 * Automatically generates API documentation from JSDoc comments
 */

import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Variance Analysis Dashboard API',
      version: '1.0.0',
      description: `
        REST API for the AgileReporter Variance Analysis Dashboard.
        
        This API provides endpoints for:
        - Managing variance analysis reports
        - Retrieving form-level details and variances
        - Annotating variances with flags, categories, and comments
        - Exporting data to CSV
        - Running and monitoring analysis jobs
        - Accessing statistics and filter options
        
        ## WebSocket Support
        Real-time updates are available via WebSocket connection at \`ws://localhost:3000\`
        
        ## Authentication
        Currently no authentication is required. All endpoints are publicly accessible.
      `
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'http://localhost:{port}',
        description: 'Custom port server',
        variables: {
          port: {
            default: '3000',
            description: 'Server port number'
          }
        }
      }
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints'
      },
      {
        name: 'Reports',
        description: 'Report management endpoints'
      },
      {
        name: 'Annotations',
        description: 'Variance annotation endpoints'
      },
      {
        name: 'Statistics',
        description: 'Statistics and aggregations'
      },
      {
        name: 'Filters',
        description: 'Filter options'
      },
      {
        name: 'Analysis',
        description: 'Analysis job control'
      },
      {
        name: 'Export',
        description: 'Data export endpoints'
      }
    ],
    components: {
      schemas: {
        Report: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique report identifier',
              example: 'report-1700000000000-abc123'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Report creation timestamp',
              example: '2025-11-24T10:00:00.000Z'
            },
            baseDate: {
              type: 'string',
              format: 'date',
              description: 'Base reference date',
              example: '2025-06-30'
            },
            totalReturns: {
              type: 'integer',
              description: 'Number of returns analyzed',
              example: 24
            },
            totalVariances: {
              type: 'integer',
              description: 'Total variance count',
              example: 145
            },
            totalValidationErrors: {
              type: 'integer',
              description: 'Total validation error count',
              example: 3
            },
            configFile: {
              type: 'string',
              description: 'Configuration file used',
              example: 'config.json'
            },
            outputFile: {
              type: 'string',
              description: 'Generated Excel filename',
              example: 'variance_results.xlsx'
            },
            duration: {
              type: 'integer',
              description: 'Analysis duration in milliseconds',
              example: 180000
            },
            status: {
              type: 'string',
              enum: ['completed', 'running', 'failed'],
              description: 'Report status',
              example: 'completed'
            }
          }
        },
        FormDetail: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Database record ID'
            },
            reportId: {
              type: 'string',
              description: 'Parent report ID'
            },
            formName: {
              type: 'string',
              description: 'Form display name',
              example: 'Balance Sheet'
            },
            formCode: {
              type: 'string',
              description: 'Form code',
              example: 'ARF1100'
            },
            confirmed: {
              type: 'boolean',
              description: 'Whether return is confirmed'
            },
            varianceCount: {
              type: 'integer',
              description: 'Number of variances found'
            },
            validationErrorCount: {
              type: 'integer',
              description: 'Number of validation errors'
            },
            baseDate: {
              type: 'string',
              format: 'date',
              description: 'Base instance date'
            },
            comparisonDate: {
              type: 'string',
              format: 'date',
              description: 'Comparison instance date'
            },
            topVariances: {
              type: 'array',
              description: 'Top 100 variances for this form',
              items: {
                $ref: '#/components/schemas/Variance'
              }
            }
          }
        },
        Variance: {
          type: 'object',
          properties: {
            'Cell Reference': {
              type: 'string',
              description: 'Cell identifier',
              example: 'Cell_A123'
            },
            'Cell Description': {
              type: 'string',
              description: 'Cell description',
              example: 'Total Assets_Current Assets_Cash'
            },
            'Difference': {
              type: 'string',
              description: 'Difference value',
              example: '500000'
            },
            '% Difference': {
              type: 'string',
              description: 'Percentage difference',
              example: '10.00'
            },
            flagged: {
              type: 'boolean',
              description: 'Whether variance is flagged'
            },
            category: {
              type: 'string',
              nullable: true,
              enum: ['expected', 'unexpected', 'resolved', 'investigating', null],
              description: 'Variance category'
            },
            comment: {
              type: 'string',
              nullable: true,
              description: 'User comment'
            }
          }
        },
        VarianceAnnotation: {
          type: 'object',
          required: ['formCode', 'cellReference'],
          properties: {
            formCode: {
              type: 'string',
              description: 'Form code',
              example: 'ARF1100'
            },
            cellReference: {
              type: 'string',
              description: 'Cell reference',
              example: 'Cell_A123'
            },
            flagged: {
              type: 'boolean',
              description: 'Flag status',
              example: true
            },
            category: {
              type: 'string',
              nullable: true,
              enum: ['expected', 'unexpected', 'resolved', 'investigating'],
              description: 'Variance category',
              example: 'investigating'
            },
            comment: {
              type: 'string',
              nullable: true,
              description: 'Comment text',
              example: 'Large cash increase - verifying with finance'
            }
          }
        },
        Statistics: {
          type: 'object',
          properties: {
            totalReports: {
              type: 'integer',
              description: 'Total report count'
            },
            completedReports: {
              type: 'integer',
              description: 'Completed report count'
            },
            failedReports: {
              type: 'integer',
              description: 'Failed report count'
            },
            runningReports: {
              type: 'integer',
              description: 'Currently running report count'
            },
            totalVariances: {
              type: 'integer',
              description: 'Sum of all variances'
            },
            totalValidationErrors: {
              type: 'integer',
              description: 'Sum of all validation errors'
            },
            avgDuration: {
              type: 'integer',
              description: 'Average duration in seconds'
            }
          }
        },
        AnalysisRequest: {
          type: 'object',
          required: ['configFile'],
          properties: {
            configFile: {
              type: 'string',
              description: 'Path to configuration JSON file',
              example: 'config.json'
            },
            outputFile: {
              type: 'string',
              description: 'Optional output filename',
              example: 'report_2025-06-30.xlsx'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            }
          }
        }
      }
    }
  },
  apis: ['./src/dashboard/server.ts']
};

export const swaggerSpec = swaggerJsdoc(options);