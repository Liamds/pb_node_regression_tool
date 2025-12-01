# API Architecture Documentation

## Overview

The variance analysis tool now uses a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────┐
│  Routes (Express Routers)                   │
│  - Handle HTTP concerns                     │
│  - Validation middleware                    │
│  - Response formatting                      │
└────────────┬────────────────────────────────┘
             │
┌────────────▼────────────────────────────────┐
│  Handlers (Pure Functions)                  │
│  - Framework agnostic                       │
│  - Convert service results to API responses │
│  - Error mapping                            │
└────────────┬────────────────────────────────┘
             │
┌────────────▼────────────────────────────────┐
│  Services (Business Logic)                  │
│  - Domain logic                             │
│  - Orchestration                            │
│  - Validation                               │
└────────────┬────────────────────────────────┘
             │
┌────────────▼────────────────────────────────┐
│  Repositories (Data Access)                 │
│  - Database operations                      │
│  - Query building                           │
│  - Data transformation                      │
└────────────┬────────────────────────────────┘
             │
┌────────────▼────────────────────────────────┐
│  Database Manager (SQLite)                  │
│  - Low-level DB operations                  │
│  - Connection management                    │
│  - Transaction support                      │
└─────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── api/
│   ├── handlers/
│   │   ├── report.handlers.ts      # Report operation handlers
│   │   ├── variance.handlers.ts    # Variance operation handlers
│   │   └── index.ts                # Handlers index
│   ├── middleware/
│   │   └── validation.ts           # Zod validation middleware
│   ├── routes/
│   │   ├── reports.router.ts       # Reports endpoints
│   │   ├── variances.router.ts     # Variances endpoints
│   │   ├── statistics.router.ts    # Statistics endpoints
│   │   ├── analysis.router.ts      # Analysis control endpoints
│   │   └── index.ts                # Routes index
│   ├── types/
│   │   └── responses.ts            # Standard API response types
│   └── index.ts                    # API module index
├── services/
│   ├── ReportService.ts            # Report business logic
│   ├── VarianceService.ts          # Variance business logic
│   └── index.ts                    # Services index
├── repositories/
│   ├── ReportRepository.ts         # Report data access
│   ├── VarianceRepository.ts       # Variance data access
│   └── index.ts                    # Repositories index
└── dashboard/
    └── server.ts                   # Express server setup
```

## Layer Responsibilities

### 1. Routes Layer (`src/api/routes/`)

**Purpose**: Handle HTTP-specific concerns

**Responsibilities**:
- Define Express routes
- Apply validation middleware
- Call handlers
- Format HTTP responses
- Handle HTTP errors

**Example**:
```typescript
router.get(
  '/reports/:id',
  validateParams(z.object({ id: z.string().min(1) })),
  async (req: ValidatedRequest<any, any, { id: string }>, res: Response) => {
    const { id } = req.validatedParams!;
    const result = await handleGetReportById(reportService, id);
    
    if (!result.success) {
      return res.status(result.error.statusCode).json(
        createErrorResponse(result.error.message, result.error.statusCode)
      );
    }
    
    return res.json(createSuccessResponse(result.data));
  }
);
```

### 2. Handlers Layer (`src/api/handlers/`)

**Purpose**: Framework-agnostic API logic

**Responsibilities**:
- Call service methods
- Convert service errors to API errors
- Return standard API responses
- No HTTP knowledge (can be used in Next.js, tRPC, etc.)

**Example**:
```typescript
export async function handleGetReportById(
  service: ReportService,
  id: string
): AsyncResult<ReportMetadata, ApiHandlerError> {
  const result = await service.getReportById(id);
  
  if (!result.success) {
    return {
      success: false,
      error: toApiError(result.error),
    };
  }
  
  return { success: true, data: result.data };
}
```

### 3. Services Layer (`src/services/`)

**Purpose**: Business logic and orchestration

**Responsibilities**:
- Validate business rules
- Orchestrate multiple repository calls
- Transform data for business needs
- Domain-specific error handling

**Example**:
```typescript
export class ReportService {
  constructor(private readonly reportRepo: ReportRepository) {}
  
  async getReportWithDetails(
    id: string
  ): AsyncResult<ReportWithDetails, ReportServiceError> {
    // Input validation
    if (!id || id.trim().length === 0) {
      return {
        success: false,
        error: new ReportServiceError('ID is required', 'INVALID_INPUT'),
      };
    }
    
    // Get metadata
    const metadataResult = await this.getReportById(id);
    if (!metadataResult.success) {
      return metadataResult;
    }
    
    // Get forms
    const formsResult = await this.reportRepo.findFormDetails(id);
    if (!formsResult.success) {
      return {
        success: false,
        error: new ReportServiceError('Failed to get forms', 'REPOSITORY_ERROR'),
      };
    }
    
    // Combine results
    return {
      success: true,
      data: {
        metadata: metadataResult.data,
        forms: formsResult.data,
      },
    };
  }
}
```

### 4. Repositories Layer (`src/repositories/`)

**Purpose**: Data access abstraction

**Responsibilities**:
- Execute database queries
- Transform database results to domain types
- Handle database errors
- No business logic

**Example**:
```typescript
export class ReportRepository {
  constructor(private readonly db: DatabaseManager) {}
  
  async findById(
    id: string
  ): AsyncResult<ReportMetadata, ReportRepositoryError> {
    try {
      const result = await this.db.getReport(id);
      
      if (!result.success) {
        const code = result.error.code === 'NOT_FOUND'
          ? ReportRepositoryErrorCode.NOT_FOUND
          : ReportRepositoryErrorCode.DB_ERROR;
        
        return {
          success: false,
          error: new ReportRepositoryError(result.error.message, code),
        };
      }
      
      return { success: true, data: result.data };
    } catch (error) {
      logger.error('Failed to find report', { error, id });
      return {
        success: false,
        error: new ReportRepositoryError('DB error', 'DB_ERROR', error),
      };
    }
  }
}
```

## Benefits of This Architecture

### 1. Type Safety
- Full TypeScript typing from DB to API response
- No `any` types
- Compile-time error detection

### 2. Testability
- Each layer can be tested independently
- Easy to mock dependencies
- Handlers are pure functions

### 3. Framework Independence
- Handlers can be reused in Next.js, tRPC, GraphQL
- No Express-specific code in business logic
- Easy migration path to other frameworks

### 4. Maintainability
- Clear separation of concerns
- Easy to locate and fix bugs
- Consistent error handling

### 5. Scalability
- Easy to add new endpoints
- Simple to add new business logic
- Cacheable at any layer

## API Endpoints

### Reports
- `GET /api/reports` - List all reports with filters
- `GET /api/reports/:id` - Get report by ID
- `GET /api/reports/:id/details` - Get report with form details
- `DELETE /api/reports/:id` - Delete report

### Variances
- `GET /api/reports/:reportId/variances` - Get variances for report
- `POST /api/reports/:reportId/annotations` - Update variance annotation
- `GET /api/reports/:reportId/export/:formCode` - Export variances to CSV

### Statistics
- `GET /api/statistics` - Get statistics with filters
- `GET /api/filters` - Get filter options (base dates, form codes)

### Analysis
- `POST /api/analysis/run` - Start new analysis job
- `POST /api/analysis/stop/:reportId` - Stop running analysis

## Error Handling

All layers use the `Result<T, E>` pattern:

```typescript
type Result<T, E> = 
  | { success: true; data: T }
  | { success: false; error: E };
```

Each layer has its own error types:

```typescript
// Repository Layer
class ReportRepositoryError extends Error {
  code: 'DB_ERROR' | 'NOT_FOUND' | 'VALIDATION_ERROR';
}

// Service Layer
class ReportServiceError extends Error {
  code: 'REPOSITORY_ERROR' | 'NOT_FOUND' | 'INVALID_INPUT';
}

// Handler Layer
class ApiHandlerError extends Error {
  statusCode: number; // HTTP status code
}
```

## Validation

All input validation uses Zod schemas:

```typescript
// Define schema
const ReportFiltersSchema = z.object({
  status: z.enum(['completed', 'running', 'failed']).optional(),
  baseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  formCode: z.string().optional(),
});

// Use in router
router.get(
  '/reports',
  validateQuery(ReportFiltersSchema),
  async (req: ValidatedRequest<any, ReportFilters>, res: Response) => {
    // req.validatedQuery is typed and validated
    const filters = req.validatedQuery!;
    // ...
  }
);
```

## Response Format

All API responses use a standard format:

```typescript
// Success
{
  "success": true,
  "data": { /* response data */ },
  "timestamp": "2025-12-02T10:00:00.000Z"
}

// Error
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "timestamp": "2025-12-02T10:00:00.000Z"
}
```

## Migration to Next.js

This architecture is **Next.js ready**:

1. **Handlers** can be used directly in Next.js API routes
2. **Services** can be called from Server Components
3. **Repositories** work identically
4. **Routes** can be converted to Next.js route handlers

Example Next.js route:

```typescript
// app/api/reports/[id]/route.ts
import { handleGetReportById } from '@/api/handlers';
import { reportService } from '@/services';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const result = await handleGetReportById(reportService, params.id);
  
  if (!result.success) {
    return Response.json(
      createErrorResponse(result.error.message),
      { status: result.error.statusCode }
    );
  }
  
  return Response.json(createSuccessResponse(result.data));
}
```

## Development Guidelines

### Adding a New Endpoint

1. **Define types** in `src/types/index.ts`
2. **Create repository method** in `src/repositories/`
3. **Create service method** in `src/services/`
4. **Create handler** in `src/api/handlers/`
5. **Add route** in `src/api/routes/`
6. **Test each layer** independently

### Naming Conventions

- Routes: `createXRouter`
- Handlers: `handleVerbNoun` (e.g., `handleGetReport`)
- Services: `verbNoun` (e.g., `getReport`)
- Repositories: `findX`, `saveX`, `deleteX`

### Error Handling

Always use the `Result` pattern:

```typescript
// ✅ Good
async function doSomething(): AsyncResult<Data, Error> {
  try {
    const result = await riskyOperation();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: new MyError('Failed') };
  }
}

// ❌ Bad - throwing errors
async function doSomething(): Promise<Data> {
  return await riskyOperation(); // May throw!
}
```

## Testing Strategy

Each layer should have its own tests:

```typescript
// Repository test
test('ReportRepository.findById returns report', async () => {
  const mockDb = createMockDb();
  const repo = new ReportRepository(mockDb);
  
  const result = await repo.findById('report-1');
  
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.id).toBe('report-1');
  }
});

// Service test
test('ReportService.getReportWithDetails combines data', async () => {
  const mockRepo = createMockRepository();
  const service = new ReportService(mockRepo);
  
  const result = await service.getReportWithDetails('report-1');
  
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.metadata).toBeDefined();
    expect(result.data.forms).toHaveLength(3);
  }
});

// Handler test
test('handleGetReportById converts service errors', async () => {
  const mockService = createMockService();
  
  const result = await handleGetReportById(mockService, 'invalid');
  
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.statusCode).toBe(404);
  }
});
```

## Performance Considerations

- **Caching**: Add caching at the service layer
- **Pagination**: Use `createPaginatedResponse` helper
- **Lazy loading**: Load form details only when needed
- **Database indexing**: Ensure proper indexes on foreign keys
- **Connection pooling**: Already handled by DatabaseManager

## Next Steps

1. ✅ Complete TypeScript refactoring
2. ✅ Implement layered architecture
3. ✅ Add validation middleware
4. ✅ Create standard response types
5. ⬜ Add unit tests for each layer
6. ⬜ Add integration tests
7. ⬜ Add API documentation (Swagger)
8. ⬜ Implement caching strategy
9. ⬜ Add rate limiting
10. ⬜ Prepare for Next.js migration