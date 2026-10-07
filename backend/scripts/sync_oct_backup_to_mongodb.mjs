import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectMongo, getDb } from '../mongoService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Primary and fallback backup file paths
const candidatePaths = [
  'C:\\Users\\LOQ\\Downloads\\GreenEnergySolution_Full_Backup_2026-10-07_1633.json',
  path.resolve(__dirname, '../../backups/GreenEnergySolution_Full_Backup_2026-10-07_1633.json'),
  path.resolve(__dirname, '../../backups/SolarCRM_Latest_Backup.json'),
  'D:\\green energy solution\\backups\\SolarCRM_Latest_Backup.json'
];

async function syncBackup() {
  console.log('=====================================================');
  console.log('🚀 GREEN ENERGY SOLUTION - DATABASE SYNC (OCT 2 - OCT 7)');
  console.log('=====================================================\n');

  let backupFilePath = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      backupFilePath = p;
      break;
    }
  }

  if (!backupFilePath) {
    throw new Error('❌ Backup file not found in any expected location.');
  }

  console.log(`📂 Using Backup File: ${backupFilePath}`);
  const rawData = fs.readFileSync(backupFilePath, 'utf8');
  const backup = JSON.parse(rawData);

  console.log(`📅 Backup Snapshot Timestamp: ${backup.meta?.timestamp || 'N/A'}`);
  console.log(`📦 Backup Total Entities: ${backup.meta?.totalEntities || 'N/A'}\n`);

  const db = await connectMongo();
  console.log(`✅ Connected to MongoDB Atlas Database: [${db.databaseName}]\n`);

  const collections = backup.data || {};
  const syncResults = [];
  let totalNewInserted = 0;
  let totalUpdated = 0;
  let totalUnchanged = 0;

  for (const [colName, docs] of Object.entries(collections)) {
    if (!Array.isArray(docs) || docs.length === 0) {
      console.log(`⏩ Skipping '${colName}' (0 records in backup)`);
      continue;
    }

    const col = db.collection(colName);
    const initialCount = await col.countDocuments();

    // Fetch existing docs summary to track differences
    const existingDocs = await col.find({}, { projection: { id: 1, _id: 1, updatedAt: 1, createdAt: 1, timestamp: 1 } }).toArray();
    const existingMap = new Map();
    for (const d of existingDocs) {
      const key = String(d.id || d._id);
      existingMap.set(key, d);
    }

    let colInserted = 0;
    let colUpdated = 0;
    let colUnchanged = 0;

    const bulkOps = [];

    for (const doc of docs) {
      const docId = String(doc.id || doc._id || `gen_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);
      const cleanDoc = { ...doc };
      cleanDoc.id = docId;
      cleanDoc._id = docId; // Primary key matches Firestore document ID

      const existing = existingMap.get(docId);
      if (!existing) {
        // Brand new record (created between Oct 2 and Oct 7)
        colInserted++;
        bulkOps.push({
          updateOne: {
            filter: { _id: docId },
            update: { $set: cleanDoc },
            upsert: true
          }
        });
      } else {
        // Record existed before Oct 2 - check if updated
        const bTime = cleanDoc.updatedAt || cleanDoc.createdAt || cleanDoc.timestamp;
        const eTime = existing.updatedAt || existing.createdAt || existing.timestamp;

        if (bTime && eTime && bTime > eTime) {
          colUpdated++;
        } else {
          colUnchanged++;
        }

        bulkOps.push({
          updateOne: {
            filter: { _id: docId },
            update: { $set: cleanDoc },
            upsert: true
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      // Execute in chunks of 500 to prevent payload limits
      const chunkSize = 500;
      for (let i = 0; i < bulkOps.length; i += chunkSize) {
        const chunk = bulkOps.slice(i, i + chunkSize);
        await col.bulkWrite(chunk, { ordered: false });
      }
    }

    // Ensure index on id and _id
    await col.createIndex({ id: 1 }, { background: true }).catch(() => {});

    const finalCount = await col.countDocuments();

    totalNewInserted += colInserted;
    totalUpdated += colUpdated;
    totalUnchanged += colUnchanged;

    syncResults.push({
      Collection: colName,
      'Initial in DB': initialCount,
      'In Backup': docs.length,
      'New (Oct 2-7)': colInserted,
      'Updated (Oct 2-7)': colUpdated,
      Unchanged: colUnchanged,
      'Final in DB': finalCount
    });

    console.log(`✅ [${colName}] -> Synced: ${docs.length} docs (New: +${colInserted}, Updated: ${colUpdated}, Final Total: ${finalCount})`);
  }

  // Record sync event in _import_metadata
  const metaCol = db.collection('_import_metadata');
  await metaCol.insertOne({
    syncEvent: 'Oct 2 - Oct 7 Incremental & Full Sync',
    sourceFile: path.basename(backupFilePath),
    backupTimestamp: backup.meta?.timestamp || '2026-10-07T11:03:32.969Z',
    syncedAt: new Date().toISOString(),
    totalNewInserted,
    totalUpdated,
    summary: syncResults
  });

  console.log('\n=====================================================');
  console.log('🎉 SYNC COMPLETE! SUMMARY REPORT:');
  console.log('=====================================================');
  console.table(syncResults);
  console.log(`✨ Total Brand New Records Added: +${totalNewInserted}`);
  console.log(`🔄 Total Existing Records Updated: ${totalUpdated}`);
  console.log(`💾 Total Synced From Backup: ${totalNewInserted + totalUpdated + totalUnchanged}`);
  console.log('=====================================================\n');

  process.exit(0);
}

syncBackup().catch(err => {
  console.error('❌ Sync failed with error:', err);
  process.exit(1);
});
