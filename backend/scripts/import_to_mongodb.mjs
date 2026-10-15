import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB Connection Configuration
// Agar VPS par chala rahe hain to 'mongodb://127.0.0.1:27017' use karein
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGO_DB_NAME || 'green_energy_crm';

async function importBackupToMongo() {
  console.log(`🔌 Connecting to MongoDB at: ${MONGO_URI}...`);
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`✅ Connected to database: '${DB_NAME}'\n`);

  // Path to latest backup file
  const backupFilePath = path.resolve(__dirname, '../../backups/SolarCRM_Latest_Backup.json');
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at: ${backupFilePath}`);
  }

  console.log(`📖 Reading backup data from: ${backupFilePath}...`);
  const rawContent = fs.readFileSync(backupFilePath, 'utf8');
  const backupJson = JSON.parse(rawContent);

  const collections = backupJson.data || {};
  console.log(`📦 Found ${Object.keys(collections).length} collections in backup.\n`);

  let totalUpserted = 0;

  for (const [colName, docs] of Object.entries(collections)) {
    if (!Array.isArray(docs) || docs.length === 0) {
      console.log(`⏩ Skipping '${colName}' (0 records)`);
      continue;
    }

    const col = db.collection(colName);

    // Ensure index on 'id' for fast lookups
    await col.createIndex({ id: 1 }, { unique: true, sparse: true }).catch(() => {});

    // Bulk upsert: Purana data delete nahi hoga, existing update hoga, naya insert hoga
    const bulkOps = docs.map(doc => {
      const docId = doc.id || doc._id || `gen_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const cleanDoc = { ...doc, id: docId };
      return {
        updateOne: {
          filter: { id: docId },
          update: { $set: cleanDoc },
          upsert: true
        }
      };
    });

    const result = await col.bulkWrite(bulkOps, { ordered: false });
    const inserted = result.upsertedCount || 0;
    const modified = result.modifiedCount || 0;
    const matched = result.matchedCount || 0;
    totalUpserted += docs.length;

    console.log(`✅ Collection '${colName}': Processed ${docs.length} docs (Inserted: ${inserted}, Updated: ${modified}, Unchanged: ${matched - modified})`);
  }

  console.log('\n===========================================');
  console.log(`🎉 MONGODB IMPORT COMPLETE!`);
  console.log(`📊 Total Documents Synced: ${totalUpserted}`);
  console.log(`🗄️ Database: ${DB_NAME}`);
  console.log('===========================================\n');

  await client.close();
}

importBackupToMongo().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
