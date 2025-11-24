# SQLite WASM Implementation Guide

This guide covers the migration from JSON file storage to SQLite using sql.js WASM.

## Overview of Changes

### 1. **Database Layer** (`db-manager.ts`)
- Replaced JSON file storage with SQLite database using sql.js
- All report metadata, form details, variances, and annotations stored in database
- Automatic indexing for fast queries
- Support for filtered queries (status, baseDate, formCode)

### 2. **Persistent Storage**
- Database file: `reports/reports.db`
- Variance annotations (flags, categories, comments) stored in database
- No more localStorage - all data persists in SQLite

### 3. **Real-time Progress Tracking**
- Granular progress for each step:
  - Authentication (1 step)
  - Analyzing each form (3 sub-steps per form: fetch, analyze, validate)
  - Exporting to Excel (1 step)
  - Saving to database (1 step)
- Progress broadcast via WebSocket to dashboard
- Step indicators with visual feedback

### 4. **Dynamic Filtering**
- Statistics update based on selected filters
- Charts update to show only filtered data
- Filter by: status, base date, form code

### 5. **CSV Export**
- Export individual form variances to CSV
- Includes all annotations (flags, categories, comments)
- Export button available per form in report details

## Installation

```bash
# Install new dependencies
npm install sql.js json2csv

# Or update all dependencies
npm install
```

## Database Schema

### Tables

#### `reports`
```sql
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  baseDate TEXT NOT NULL,
  totalReturns INTEGER NOT NULL,
  totalVariances INTEGER NOT NULL,
  totalValidationErrors INTEGER NOT NULL,
  configFile TEXT NOT NULL,
  outputFile TEXT NOT NULL,
  duration INTEGER NOT NULL,
  status TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### `form_details`
```sql
CREATE TABLE form_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reportId TEXT NOT NULL,
  formName TEXT NOT NULL,
  formCode TEXT NOT NULL,
  confirmed INTEGER NOT NULL,
  varianceCount INTEGER NOT NULL,
  validationErrorCount INTEGER NOT NULL,
  baseDate TEXT NOT NULL,
  comparisonDate TEXT NOT NULL,
  FOREIGN KEY (reportId) REFERENCES reports(id) ON DELETE CASCADE
);
```

#### `variances`
```sql
CREATE TABLE variances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reportId TEXT NOT NULL,
  formCode TEXT NOT NULL,
  cellReference TEXT NOT NULL,
  cellDescription TEXT NOT NULL,
  comparisonValue TEXT,
  baseValue TEXT,
  difference TEXT,
  percentDifference TEXT,
  FOREIGN KEY (reportId) REFERENCES reports(id) ON DELETE CASCADE
);
```

#### `variance_annotations`
```sql
CREATE TABLE variance_annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reportId TEXT NOT NULL,
  formCode TEXT NOT NULL,
  cellReference TEXT NOT NULL,
  flagged INTEGER DEFAULT 0,
  category TEXT,
  comment TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(reportId, formCode, cellReference),
  FOREIGN KEY (reportId) REFERENCES reports(id) ON DELETE CASCADE
);
```

## API Endpoints

### New/Updated Endpoints

#### `GET /api/filters`
Get available filter options (base dates, form codes)

#### `GET /api/reports?status=&baseDate=&formCode=`
Get reports with optional filters

#### `GET /api/statistics?status=&baseDate=&formCode=`
Get statistics with optional filters

#### `POST /api/reports/:id/annotations`
Update variance annotation (flag, category, comment)
```json
{
  "formCode": "ARS_110_0",
  "cellReference": "CELL_123",
  "flagged": true,
  "category": "expected",
  "comment": "Known variance due to policy change"
}
```

#### `GET /api/reports/:id/export/:formCode`
Export form variances to CSV with annotations

## Usage

### Running Analysis
```bash
# Build TypeScript
npm run build

# Run analysis
npm start config.json -- --output report.xlsx

# Start dashboard
npm run dashboard
```

### Dashboard Features

1. **Filtering**
   - Select status, base date, or form to filter reports
   - Statistics and charts update automatically

2. **Variance Annotations**
   - Click flag icon to flag/unflag variance
   - Select category from dropdown
   - Add comments in text field
   - Changes saved automatically to database

3. **CSV Export**
   - Open report details
   - Click "Export CSV" button for desired form
   - CSV includes all variances with annotations

## Migration from JSON

If you have existing JSON report files:

```typescript
// Migration script (one-time use)
import { DatabaseManager } from './db-manager.js';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

async function migrateFromJSON() {
  const dbManager = new DatabaseManager();
  await dbManager.initialize();
  
  const reportsDir = join(process.cwd(), 'reports');
  const files = await readdir(reportsDir);
  
  for (const file of files) {
    if (file.endsWith('.metadata.json')) {
      const metadata = JSON.parse(
        await readFile(join(reportsDir, file), 'utf-8')
      );
      
      const detailsFile = file.replace('.metadata.json', '.details.json');
      if (files.includes(detailsFile)) {
        const details = JSON.parse(
          await readFile(join(reportsDir, detailsFile), 'utf-8')
        );
        
        // Convert to new format and save
        // ... conversion logic ...
      }
    }
  }
  
  await dbManager.close();
}
```

## Performance Considerations

1. **Database Size**
   - Variances stored efficiently in database
   - Typical report: 5-10 MB in database
   - 100 reports ≈ 500 MB - 1 GB

2. **Query Performance**
   - Indexed columns for fast filtering
   - Top 100 variances loaded per form for UI
   - Full dataset available for CSV export

3. **Concurrent Access**
   - sql.js uses single file
   - Write operations are serialized
   - Suitable for single-user/low-concurrency scenarios

## Troubleshooting

### Database locked error
If you see "database is locked" errors:
- Ensure only one process accesses the database at a time
- Check for orphaned processes

### Memory issues with large reports
- Database handles large datasets efficiently
- UI loads only top 100 variances per form
- Use CSV export for complete datasets

### WebSocket connection issues
- Check firewall settings
- Verify port 3000 (or custom port) is available
- Browser console will show connection errors

## Future Enhancements

Potential improvements:

1. **Multi-user Support**
   - Add PostgreSQL/MySQL option for concurrent access
   - User authentication and permissions

2. **Advanced Filtering**
   - Date range filters
   - Variance threshold filters
   - Annotation-based filters (flagged only, by category)

3. **Batch Operations**
   - Bulk annotation updates
   - Bulk CSV exports

4. **Reporting**
   - Trend analysis reports
   - Variance summary dashboards
   - Export annotations separately