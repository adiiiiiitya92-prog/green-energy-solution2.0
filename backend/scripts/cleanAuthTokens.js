import { connectMongo } from '../mongoService.js';

function stripAuthToken(url) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('Authorization=')) return url;
  return url.split('?')[0];
}

async function run() {
  const db = await connectMongo();
  console.log('--- Cleaning expired Backblaze B2 tokens from MongoDB Atlas ---');

  // 1. installationPhotos
  const photos = await db.collection('installationPhotos').find({ photoBlob: { $regex: 'Authorization=' } }).toArray();
  console.log(`Found ${photos.length} installationPhotos with Authorization=`);
  for (const p of photos) {
    const cleanUrl = stripAuthToken(p.photoBlob);
    await db.collection('installationPhotos').updateOne({ _id: p._id }, { $set: { photoBlob: cleanUrl } });
  }

  // 2. clientDocuments
  const docs = await db.collection('clientDocuments').find({ fileBlob: { $regex: 'Authorization=' } }).toArray();
  console.log(`Found ${docs.length} clientDocuments with Authorization=`);
  for (const d of docs) {
    const cleanUrl = stripAuthToken(d.fileBlob);
    await db.collection('clientDocuments').updateOne({ _id: d._id }, { $set: { fileBlob: cleanUrl } });
  }

  // 3. releaseDocuments
  const rels = await db.collection('releaseDocuments').find({ fileBlob: { $regex: 'Authorization=' } }).toArray();
  console.log(`Found ${rels.length} releaseDocuments with Authorization=`);
  for (const r of rels) {
    const cleanUrl = stripAuthToken(r.fileBlob);
    await db.collection('releaseDocuments').updateOne({ _id: r._id }, { $set: { fileBlob: cleanUrl } });
  }

  // 4. fieldVisitReports
  const visits = await db.collection('fieldVisitReports').find({}).toArray();
  let visitUpdated = 0;
  for (const v of visits) {
    if (Array.isArray(v.photoBlobs) && v.photoBlobs.some(b => typeof b === 'string' && b.includes('Authorization='))) {
      const cleanBlobs = v.photoBlobs.map(b => stripAuthToken(b));
      await db.collection('fieldVisitReports').updateOne({ _id: v._id }, { $set: { photoBlobs: cleanBlobs } });
      visitUpdated++;
    }
  }
  console.log(`Updated ${visitUpdated} fieldVisitReports with clean photoBlobs`);

  // 5. orderConfirmations
  const ocs = await db.collection('orderConfirmations').find({
    $or: [
      { clientSignatureBlob: { $regex: 'Authorization=' } },
      { confirmationPdfBlob: { $regex: 'Authorization=' } },
      { cashProofImageUrl: { $regex: 'Authorization=' } }
    ]
  }).toArray();
  console.log(`Found ${ocs.length} orderConfirmations with Authorization=`);
  for (const oc of ocs) {
    const updates = {};
    if (oc.clientSignatureBlob && oc.clientSignatureBlob.includes('Authorization=')) {
      updates.clientSignatureBlob = stripAuthToken(oc.clientSignatureBlob);
    }
    if (oc.confirmationPdfBlob && oc.confirmationPdfBlob.includes('Authorization=')) {
      updates.confirmationPdfBlob = stripAuthToken(oc.confirmationPdfBlob);
    }
    if (oc.cashProofImageUrl && oc.cashProofImageUrl.includes('Authorization=')) {
      updates.cashProofImageUrl = stripAuthToken(oc.cashProofImageUrl);
    }
    if (Object.keys(updates).length > 0) {
      await db.collection('orderConfirmations').updateOne({ _id: oc._id }, { $set: updates });
    }
  }

  console.log('✅ Successfully cleaned all expired tokens from MongoDB Atlas database!');
  process.exit(0);
}

run().catch(err => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
