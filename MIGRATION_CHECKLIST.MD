# Migration Checklist

## Files to Create (New)

1. **`src/db-manager.ts`** - SQLite database manager using sql.js
   - Handles all database operations
   - Creates tables and indexes
   - Provides query methods

## Files to Replace (Complete Rewrite)

2. **`src/report-saver.ts`** - Updated to use DatabaseManager
   - Initializes database connection
   - Saves reports to SQLite instead of JSON
   - Cleanup now uses database operations

3. **`src/dashboard/server.ts`** - Updated with database integration
   - Uses DatabaseManager for all queries
   - Adds CSV export endpoint
   - Adds annotation update endpoint
   - Adds filter options endpoint
   - Removes JSON file reading

4. **`src/dashboard/public/app.js`** - Frontend rewrite
   - Removes localStorage usage
   - Adds API calls for annotations
   - Implements CSV export
   - Implements filter-based stats/charts updates
   - Updates modal to show export buttons

## Files to Update (Partial Changes)

5. **`src/variance-analyzer.ts`**
   - Update `analyzeReturns()` method for granular progress
   - Update `analyzeReturn()` to accept progress callback
   - Track progress per sub-step (fetch, analyze, validate)

6. **`src/main.ts`**
   - Add `reportSaver.initialize()` call
   - Add `reportSaver.close()` call
   - Update progress broadcasting

## Files to Update (Dependencies Only)

7. **`package.json`**
   - Add `sql.js: ^1.10.2`
   - Add `json2csv: ^6.0.0-alpha.2`
   - Run `npm install` after updating

## Implementation Steps

### Step 1: Install Dependencies
```bash
npm install sql.js json2csv
```

### Step 2: Create New Files
- Create `src/db-manager.ts` with the provided code
- Copy all table creation and query logic

### Step 3: Update report-saver.ts
- Replace file with updated version
- Ensure DatabaseManager import is correct

### Step 4: Update dashboard/server.ts
- Replace file with updated version
- Add new API endpoints
- Remove JSON file handling

### Step 5: Update dashboard/public/app.js
- Replace file with updated version
- Remove localStorage code
- Add API integration for annotations

### Step 6: Update variance-analyzer.ts
Apply these specific changes:
```typescript
// In analyzeReturns method:
- const totalSteps = returns.length * 3;
+ Add progress tracking for each sub-step

// In analyzeReturn method:
+ Add progressCallback parameter
+ Call progressCallback('analyze', ...) before variance fetch
+ Call progressCallback('validate', ...) before validation
```

### Step 7: Update main.ts
```typescript
// After creating ReportSaver:
const reportSaver = new ReportSaver();
+ await reportSaver.initialize();

// After saving report:
await reportSaver.saveReport(...);
+ await reportSaver.close();
```

### Step 8: Build and Test
```bash
# Build TypeScript
npm run build

# Test with existing config
npm start config.json

# Start dashboard
npm run dashboard

# Open browser to http://localhost:3000
```

## Verification Checklist

After implementation, verify:

- [ ] Database file created at `reports/reports.db`
- [ ] Reports list loads in dashboard
- [ ] Filters work (status, base date, form)
- [ ] Statistics update when filters change
- [ ] Charts update when filters change
- [ ] Report details modal opens
- [ ] Variance flags can be toggled
- [ ] Categories can be selected
- [ ] Comments can be added
- [ ] Changes persist after page reload
- [ ] CSV export button appears per form
- [ ] CSV download includes annotations
- [ ] Running analysis shows granular progress
- [ ] Progress steps update correctly
- [ ] Excel file generates successfully
- [ ] Report saved to database after analysis

## Rollback Plan

If issues occur:

1. **Keep backup of JSON reports**
   ```bash
   cp -r reports reports_backup
   ```

2. **Git commit before migration**
   ```bash
   git add .
   git commit -m "Before SQLite migration"
   ```

3. **To rollback**: 
   ```bash
   git checkout HEAD~1
   npm install
   npm run build
   ```

## Data Migration (Optional)

If you have existing JSON reports and want to preserve them:

```typescript
// Create migration script: src/migrate-json-to-sqlite.ts

import { DatabaseManager, ReportMetadata, FormDetail, VarianceDetail } from './db-manager.js';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

async function migrate() {
  const dbManager = new DatabaseManager();
  await dbManager.initialize();
  
  const reportsDir = join(process.cwd(), 'reports');
  const files = await readdir(reportsDir);
  
  let migratedCount = 0;
  
  for (const file of files) {
    if (file.endsWith('.metadata.json')) {
      try {
        const metadataPath = join(reportsDir, file);
        const detailsPath = metadataPath.replace('.metadata.json', '.details.json');
        
        if (!existsSync(detailsPath)) continue;
        
        const metadata: ReportMetadata = JSON.parse(
          await readFile(metadataPath, 'utf-8')
        );
        
        const details = JSON.parse(
          await readFile(detailsPath, 'utf-8')
        );
        
        // Convert details to FormDetail format
        const formDetails: FormDetail[] = details.results.map((r: any) => ({
          reportId: metadata.id,
          formName: r.formName,
          formCode: r.formCode,
          confirmed: r.confirmed,
          varianceCount: r.varianceCount,
          validationErrorCount: r.validationErrorCount,
          baseDate: r.baseDate,
          comparisonDate: r.comparisonDate,
        }));
        
        // Convert variances
        const variances: VarianceDetail[] = [];
        for (const form of details.results) {
          if (form.topVariances) {
            for (const v of form.topVariances) {
              variances.push({
                reportId: metadata.id,
                formCode: form.formCode,
                cellReference: v['Cell Reference'],
                cellDescription: v['Cell Description'],
                comparisonValue: String(v[form.comparisonDate] || ''),
                baseValue: String(v[form.baseDate] || ''),
                difference: String(v['Difference'] || ''),
                percentDifference: String(v['% Difference'] || ''),
              });
            }
          }
        }
        
        await dbManager.saveReport(metadata, formDetails, variances);
        migratedCount++;
        console.log(`Migrated report ${metadata.id}`);
      } catch (error) {
        console.error(`Error migrating ${file}:`, error);
      }
    }
  }
  
  await dbManager.close();
  console.log(`Migration complete. Migrated ${migratedCount} reports.`);
}

migrate().catch(console.error);
```

Run migration:
```bash
npx tsx src/migrate-json-to-sqlite.ts
```

## Testing Scenarios

### Test 1: Fresh Analysis
1. Run analysis with config file
2. Verify database created
3. Check dashboard shows report
4. Verify all data present

### Test 2: Annotations
1. Open report details
2. Flag a variance
3. Add category
4. Add comment
5. Reload page
6. Verify changes persist

### Test 3: CSV Export
1. Open report details
2. Click "Export CSV" for a form
3. Open CSV file
4. Verify all columns present
5. Verify annotations included

### Test 4: Filtering
1. Select base date filter
2. Verify reports list updates
3. Verify stats update
4. Verify charts update
5. Clear filter
6. Verify all data returns

### Test 5: Progress Tracking
1. Run analysis with multiple forms
2. Watch progress bar
3. Verify step indicators update
4. Verify granular progress messages
5. Verify completion

## Support

If you encounter issues:

1. Check logs in `logs/` directory
2. Check browser console for frontend errors
3. Verify database file permissions
4. Ensure port 3000 is available
5. Check Node.js version (>=18.0.0)

## Performance Optimization

For large datasets:

1. **Limit UI variances**: Already limited to top 100 per form
2. **Database indexing**: Already implemented
3. **Batch operations**: Use CSV export for bulk data
4. **Cleanup old reports**: Run periodically
   ```typescript
   await reportSaver.cleanupOldReports(20); // Keep last 20
   ```