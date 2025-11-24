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