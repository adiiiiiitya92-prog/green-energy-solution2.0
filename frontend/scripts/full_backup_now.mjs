import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const firebaseConfig = {
  apiKey: "AIzaSyBKLwdN137XN8xbFU58BATMRoVFPyVbVVE",
  authDomain: "green-energy-solution-dcfa8.firebaseapp.com",
  projectId: "green-energy-solution-dcfa8",
  storageBucket: "green-energy-solution-dcfa8.firebasestorage.app",
  messagingSenderId: "169155482765",
  appId: "1:169155482765:web:955e322b4c1655fe2ebec4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// All known collections across Solar CRM
const collectionsToFetch = [
  'profiles',
  'leads',
  'quotations',
  'orderConfirmations',
  'challans',
  'products',
  'b2bBusinesses',
  'fieldVisitReports',
  'complaints',
  'complaintConfigCategories',
  'leaveRequests',
  'expenses',
  'stockTransactions',
  'packages',
  'shadowAnalyses',
  'deletionRequests',
  'deletedRecords',
  'clientRegistrations',
  'clientDocuments',
  'installationPhotos',
  'releaseDocuments',
  'notifications',
  'settings'
];

async function runFullBackup() {
  console.log('🚀 Starting Full Database Backup from Firebase Firestore...');
  const startTime = Date.now();
  
  const backupData = {};
  const counts = {};
  let totalEntities = 0;

  for (const colName of collectionsToFetch) {
    try {
      process.stdout.write(`📥 Fetching '${colName}'... `);
      const colRef = collection(db, colName);
      const snap = await getDocs(colRef);
      const docs = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      backupData[colName] = docs;
      counts[colName] = docs.length;
      totalEntities += docs.length;
      console.log(`✅ ${docs.length} records`);
    } catch (err) {
      console.log(`⚠️ Note: ${err.message}`);
      backupData[colName] = [];
      counts[colName] = 0;
    }
  }

  const nowIso = new Date().toISOString();
  const fileDateStr = nowIso.replace(/:/g, '-').replace(/\./g, '-');

  const finalBackup = {
    meta: {
      system: "Green Energy Solution Solar CRM",
      exporter: "Full Database Snapshot Engine (Automated Complete Backup)",
      timestamp: nowIso,
      version: "2.0.0",
      totalEntities,
      counts
    },
    data: backupData
  };

  const backupDir = path.resolve('..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestampedFileName = `SolarCRM_Full_Backup_${fileDateStr}.json`;
  const timestampedFilePath = path.join(backupDir, timestampedFileName);
  const latestFilePath = path.join(backupDir, 'SolarCRM_Latest_Backup.json');

  const jsonContent = JSON.stringify(finalBackup, null, 2);
  fs.writeFileSync(timestampedFilePath, jsonContent, 'utf8');
  fs.writeFileSync(latestFilePath, jsonContent, 'utf8');

  // Also write to user Downloads if path accessible
  try {
    const userDownloads = path.join(process.env.USERPROFILE || 'C:\\Users\\LOQ', 'Downloads');
    const localDate = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dStr = `${localDate.getFullYear()}-${pad(localDate.getMonth() + 1)}-${pad(localDate.getDate())}_${pad(localDate.getHours())}${pad(localDate.getMinutes())}`;
    const downloadsFilePath = path.join(userDownloads, `GreenEnergySolution_Full_Backup_${dStr}.json`);
    fs.writeFileSync(downloadsFilePath, jsonContent, 'utf8');
    console.log(`📂 Also saved to Downloads: ${downloadsFilePath}`);
  } catch (err) {
    // Ignore if downloads path write fails
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n===========================================');
  console.log(`🎉 BACKUP COMPLETED SUCCESSFULLY in ${durationSec}s!`);
  console.log(`📊 Total Records Exported: ${totalEntities}`);
  console.log(`💾 Saved to: ${timestampedFilePath}`);
  console.log(`💾 Saved to: ${latestFilePath}`);
  console.log('===========================================\n');
  console.log('Summary Breakdown:');
  console.table(counts);
}

runFullBackup().catch(err => {
  console.error('❌ Backup Failed:', err);
  process.exit(1);
});
