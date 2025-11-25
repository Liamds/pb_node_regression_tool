# Development Guide

Guide for developers working on the AgileReporter Variance Analysis Tool.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Architecture](#code-architecture)
- [Adding New Features](#adding-new-features)
- [Testing](#testing)
- [Code Style](#code-style)
- [Debugging](#debugging)
- [Contributing](#contributing)

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- TypeScript knowledge
- Familiarity with Express and WebSocket
- Git

### Setup Development Environment

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd agilereporter-variance-analysis
   npm install
   npm run setup
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Build and Run**
   ```bash
   # Development mode with hot reload
   npm run dev config.json --verbose
   
   # Or run dashboard separately
   npm run dashboard
   ```

### Development Tools

- **tsx**: TypeScript execution with hot reload
- **TypeScript**: Type checking and compilation
- **ESLint**: Code linting (optional)
- **Winston**: Logging framework
- **sql.js**: WASM SQLite database

## Development Workflow

### 1. Make Changes

Edit TypeScript files in `src/`:

```
src/
├── main.ts                 # CLI entry point
├── api-client.ts           # API client
├── variance-analyzer.ts    # Core logic
├── excel-exporter.ts       # Excel generation
├── dashboard/
│   ├── server.ts           # Express server
│   └── public/
│       ├── index.html
│       ├── app.js
│       └── styles.css
```

### 2. Test Changes

```bash
# Run with hot reload
npm run dev config.json --verbose

# Or test specific component
npm run dashboard
```

### 3. Build for Production

```bash
npm run build
```

This:
- Compiles TypeScript to JavaScript
- Copies static assets to `dist/`
- Generates source maps

### 4. Run Production Build

```bash
npm run start config.json
```

## Code Architecture

### Core Components

#### 1. API Client (`api-client.ts`)

Handles all communication with AgileReporter API.

**Key Methods**:
- `authenticate()`: OAuth authentication
- `getFormVersions()`: Fetch form instances
- `getFormAnalysis()`: Get variance data
- `validateReturn()`: Execute validation rules

**Adding New API Calls**:

```typescript
async getCustomData(instanceId: string): Promise<CustomData> {
  if (!this.token) {
    throw new Error('Not authenticated');
  }

  const url = `https://${this.host}/path/to/endpoint?param=${instanceId}`;
  const headers = {
    Authorization: `Bearer ${this.token}`,
    Accept: 'application/json',
  };

  const response = await this.axiosInstance.get(url, { headers });
  return this.parseCustomData(response.data);
}
```

#### 2. Variance Analyzer (`variance-analyzer.ts`)

Core analysis engine with event emission for progress tracking.

**Key Methods**:
- `analyzeReturns()`: Process multiple returns
- `analyzeReturn()`: Process single return

**Adding Progress Events**:

```typescript
this.emit('progress', {
  type: 'progress',
  step: 'custom-step',
  current: 1,
  total: 5,
  message: 'Processing custom data...',
});
```

#### 3. Excel Exporter (`excel-exporter.ts`)

Generates formatted Excel workbooks.

**Key Methods**:
- `exportResults()`: Main export function
- `createSheetForResult()`: Create sheet for form
- `writeDataToSheet()`: Write data with formatting

**Adding Custom Formatting**:

```typescript
private applyCustomFormatting(worksheet: ExcelJS.Worksheet, data: any[]): void {
  // Apply conditional formatting
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  
  // Auto-fit columns
  worksheet.columns.forEach(column => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: false }, cell => {
      maxLength = Math.max(maxLength, cell.value?.toString().length || 0);
    });
    column.width = Math.min(maxLength + 2, 50);
  });
}
```

#### 4. Database Manager (`db-manager.ts`)

SQLite database operations using sql.js WASM.

**Key Methods**:
- `initialize()`: Setup database and tables
- `saveReport()`: Save report with details
- `getReports()`: Query reports with filters
- `updateVarianceAnnotation()`: Update flags/comments

**Adding New Tables**:

```typescript
private async createTables(): Promise<void> {
  const tables = [
    `CREATE TABLE IF NOT EXISTS custom_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reportId TEXT NOT NULL,
      customField TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reportId) REFERENCES reports(id) ON DELETE CASCADE
    )`,
  ];

  for (const sql of tables) {
    this.db.run(sql);
  }
  
  await this.save();
}
```

#### 5. Dashboard Server (`dashboard/server.ts`)

Express server with WebSocket support.

**Key Features**:
- REST API endpoints
- WebSocket for real-time updates
- Child process spawning for analysis
- Static file serving

**Adding New Endpoints**:

```typescript
private setupRoutes(): void {
  // GET endpoint
  this.app.get('/api/custom-data', async (req: Request, res: Response) => {
    try {
      const data = await this.dbManager.getCustomData();
      res.json({ data });
    } catch (error: any) {
      logger.error('Error getting custom data', { error });
      res.status(500).json({ error: error.message });
    }
  });

  // POST endpoint
  this.app.post('/api/custom-data', async (req: Request, res: Response) => {
    try {
      const { field1, field2 } = req.body;
      await this.dbManager.saveCustomData({ field1, field2 });
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Error saving custom data', { error });
      res.status(500).json({ error: error.message });
    }
  });
}
```

### Data Flow

```
User Action (CLI/Dashboard)
    ↓
Main Entry Point (main.ts / server.ts)
    ↓
Configuration Loading (config.ts)
    ↓
API Authentication (api-client.ts)
    ↓
Variance Analysis (variance-analyzer.ts)
    ↓ (Progress Events)
Dashboard (WebSocket Broadcast)
    ↓
Data Processing (data-processor.ts)
    ↓
Excel Export (excel-exporter.ts)
    ↓
Database Storage (db-manager.ts)
    ↓
Report Display (Dashboard UI)
```

## Adding New Features

### Example: Add Custom Metric Calculation

#### 1. Define Model (`models.ts`)

```typescript
export interface CustomMetric {
  reportId: string;
  formCode: string;
  metricName: string;
  metricValue: number;
  threshold: number;
  exceededThreshold: boolean;
}
```

#### 2. Add Database Support (`db-manager.ts`)

```typescript
// In createTables()
`CREATE TABLE IF NOT EXISTS custom_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reportId TEXT NOT NULL,
  formCode TEXT NOT NULL,
  metricName TEXT NOT NULL,
  metricValue REAL NOT NULL,
  threshold REAL NOT NULL,
  exceededThreshold INTEGER NOT NULL,
  FOREIGN KEY (reportId) REFERENCES reports(id) ON DELETE CASCADE
)`,

// Add method
async saveCustomMetrics(metrics: CustomMetric[]): Promise<void> {
  const stmt = this.db.prepare(
    `INSERT INTO custom_metrics 
    (reportId, formCode, metricName, metricValue, threshold, exceededThreshold)
    VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const metric of metrics) {
    stmt.run([
      metric.reportId,
      metric.formCode,
      metric.metricName,
      metric.metricValue,
      metric.threshold,
      metric.exceededThreshold ? 1 : 0,
    ]);
  }
  stmt.free();
  await this.save();
}

async getCustomMetrics(reportId: string): Promise<CustomMetric[]> {
  const stmt = this.db.prepare(
    'SELECT * FROM custom_metrics WHERE reportId = ?'
  );
  stmt.bind([reportId]);

  const metrics: CustomMetric[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    metrics.push({
      reportId: row.reportId as string,
      formCode: row.formCode as string,
      metricName: row.metricName as string,
      metricValue: row.metricValue as number,
      threshold: row.threshold as number,
      exceededThreshold: (row.exceededThreshold as number) === 1,
    });
  }
  stmt.free();
  return metrics;
}
```

#### 3. Add Calculation Logic (`variance-analyzer.ts`)

```typescript
private calculateCustomMetrics(variances: Record<string, any>[]): CustomMetric[] {
  const metrics: CustomMetric[] = [];
  
  const largeVarianceCount = variances.filter(
    v => Math.abs(v.Difference) > 1000000
  ).length;
  
  metrics.push({
    reportId: '',
    formCode: '',
    metricName: 'Large Variances',
    metricValue: largeVarianceCount,
    threshold: 10,
    exceededThreshold: largeVarianceCount > 10,
  });
  
  return metrics;
}
```

#### 4. Add API Endpoint (`dashboard/server.ts`)

```typescript
this.app.get('/api/reports/:id/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await this.dbManager.getCustomMetrics(req.params.id);
    res.json({ metrics });
  } catch (error: any) {
    logger.error('Error getting metrics', { error });
    res.status(500).json({ error: error.message });
  }
});
```

#### 5. Add Dashboard UI (`dashboard/public/app.js`)

```javascript
async function loadCustomMetrics(reportId) {
  try {
    const response = await fetch(`${API_BASE}/reports/${reportId}/metrics`);
    const data = await response.json();
    
    const metricsHtml = data.metrics.map(m => `
      <div class="metric-card ${m.exceededThreshold ? 'warning' : 'success'}">
        <div class="metric-name">${m.metricName}</div>
        <div class="metric-value">${m.metricValue}</div>
        <div class="metric-threshold">Threshold: ${m.threshold}</div>
      </div>
    `).join('');
    
    document.getElementById('customMetrics').innerHTML = metricsHtml;
  } catch (error) {
    console.error('Error loading metrics:', error);
  }
}
```

## Testing

### Manual Testing

```bash
# Test CLI
npm run dev config.json --verbose

# Test Dashboard
npm run dashboard
# Open http://localhost:3000
```

### Testing API Client

```bash
# Create debug script
cat > src/test-api.ts << 'EOF'
import { AgileReporterClient } from './api-client.js';
import { Config } from './config.js';

async function test() {
  const authConfig = Config.getAuthConfig();
  const apiConfig = Config.getApiConfig();
  
  const client = new AgileReporterClient(authConfig, apiConfig);
  await client.authenticate();
  
  const versions = await client.getFormVersions('ARF1100');
  console.log('Versions:', versions);
}

test().catch(console.error);
EOF

# Run test
tsx src/test-api.ts
```

### Testing Database Operations

```bash
# Check database content
sqlite3 reports/reports.db
> SELECT * FROM reports;
> .exit
```

### Load Testing

```bash
# Concurrent analysis runs
for i in {1..5}; do
  npm run dev config.json --output "report_${i}.xlsx" &
done
wait
```

## Code Style

### TypeScript Guidelines

1. **Type Everything**
   ```typescript
   // Good
   function processData(data: AnalysisResult[]): number {
     return data.length;
   }

   // Avoid
   function processData(data: any) {
     return data.length;
   }
   ```

2. **Use Interfaces**
   ```typescript
   interface ProcessOptions {
     verbose: boolean;
     timeout: number;
   }

   function process(options: ProcessOptions): void {
     // ...
   }
   ```

3. **Async/Await**
   ```typescript
   // Good
   async function fetchData(): Promise<Data> {
     const response = await fetch(url);
     return await response.json();
   }

   // Avoid promises chains when possible
   ```

4. **Error Handling**
   ```typescript
   try {
     await riskyOperation();
   } catch (error: any) {
     logger.error('Operation failed', { error: error.message });
     throw error; // or handle gracefully
   }
   ```

### Naming Conventions

- **Files**: kebab-case (`variance-analyzer.ts`)
- **Classes**: PascalCase (`VarianceAnalyzer`)
- **Functions**: camelCase (`analyzeReturns`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Interfaces**: PascalCase with descriptive names (`AnalysisResult`)

### Logging

```typescript
// Use appropriate log levels
logger.debug('Detailed information for debugging');
logger.info('General information');
logger.warn('Warning - something unexpected');
logger.error('Error occurred', { error: error.message });

// Include context
logger.info('Processing form', { 
  formCode: 'ARF1100', 
  instanceId: '12345' 
});
```

## Debugging

### Enable Debug Logging

```bash
# CLI
npm run dev config.json --verbose

# View logs
tail -f logs/app-$(date +%Y-%m-%d).log
```

### Debug TypeScript

Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "sourceMap": true
  }
}
```

Use VS Code debugger with `launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Analysis",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/main.ts",
      "args": ["config.json", "--verbose"],
      "runtimeArgs": ["-r", "tsx/cjs"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    }
  ]
}
```

### Debug Dashboard

```javascript
// Add to app.js
console.log('Report data:', report);
debugger; // Pause execution
```

### Debug API Calls

```typescript
// In api-client.ts
this.axiosInstance.interceptors.request.use(request => {
  logger.debug('API Request', {
    method: request.method,
    url: request.url,
  });
  return request;
});

this.axiosInstance.interceptors.response.use(response => {
  logger.debug('API Response', {
    status: response.status,
    data: response.data,
  });
  return response;
});
```

### Common Issues

1. **Database Locked**
   ```bash
   # Stop all processes
   pkill -f "node.*dashboard"
   
   # Remove lock
   rm reports/reports.db-journal
   ```

2. **Port In Use**
   ```bash
   # Find process
   lsof -i :3000
   
   # Kill process
   kill -9 <PID>
   ```

3. **Type Errors**
   ```bash
   # Check types without running
   npm run build
   ```

## Contributing

### Workflow

1. **Create Branch**
   ```bash
   git checkout -b feature/custom-metrics
   ```

2. **Make Changes**
   - Write code
   - Test locally
   - Update documentation

3. **Commit**
   ```bash
   git add .
   git commit -m "feat: add custom metrics calculation"
   ```

4. **Push and PR**
   ```bash
   git push origin feature/custom-metrics
   # Create pull request on GitHub
   ```

### Commit Messages

Follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance tasks

Examples:
```
feat: add custom metrics calculation
fix: resolve database locking issue
docs: update API reference
refactor: simplify variance calculation logic
```

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested locally
- [ ] Added/updated tests
- [ ] Verified dashboard works

## Checklist
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Proper error handling
```

## Release Process

1. **Update Version**
   ```bash
   npm version patch  # or minor, major
   ```

2. **Update Changelog**
   Edit `CHANGELOG.md` with changes

3. **Build**
   ```bash
   npm run build
   ```

4. **Test**
   ```bash
   npm run start config.json
   npm run dashboard
   ```

5. **Tag**
   ```bash
   git tag v1.0.1
   git push --tags
   ```

6. **Deploy**
   - Update production server
   - Notify users

## Resources

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Express Guide](https://expressjs.com/en/guide/routing.html)
- [ExcelJS Documentation](https://github.com/exceljs/exceljs)
- [sql.js Documentation](https://sql.js.org/)
- [Winston Logging](https://github.com/winstonjs/winston)

## Getting Help

- Check existing documentation
- Search issues on GitHub
- Ask in team chat
- Review code examples in repository

---

**Happy Coding!** 🚀