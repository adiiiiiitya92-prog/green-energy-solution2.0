import { connectMongo } from '../mongoService.js';

async function main() {
  const db = await connectMongo();

  console.log('--- Checking installationPhotos ---');
  const photos = await db.collection('installationPhotos').find({}).limit(10).toArray();
  for (const p of photos) {
    console.log('Photo ID:', p.id, 'leadId:', p.leadId, 'photoType:', p.photoType);
    console.log('  photoBlob:', typeof p.photoBlob === 'string' ? p.photoBlob.substring(0, 120) : p.photoBlob);
    console.log('  url:', p.url, 'photoUrl:', p.photoUrl);
  }

  console.log('\n--- Checking clientDocuments ---');
  const docs = await db.collection('clientDocuments').find({}).limit(10).toArray();
  for (const d of docs) {
    console.log('Doc ID:', d.id, 'docType:', d.docType);
    console.log('  fileBlob:', typeof d.fileBlob === 'string' ? d.fileBlob.substring(0, 120) : d.fileBlob);
    console.log('  fileUrl:', d.fileUrl, 'url:', d.url);
  }

  console.log('\n--- Checking releaseDocuments ---');
  const rels = await db.collection('releaseDocuments').find({}).limit(5).toArray();
  for (const r of rels) {
    console.log('Rel ID:', r.id);
    console.log('  fileBlob:', typeof r.fileBlob === 'string' ? r.fileBlob.substring(0, 120) : r.fileBlob);
    console.log('  fileUrl:', r.fileUrl);
  }

  console.log('\n--- Checking fieldVisitReports ---');
  const visits = await db.collection('fieldVisitReports').find({ photoBlobs: { $exists: true, $ne: [] } }).limit(5).toArray();
  for (const v of visits) {
    console.log('Visit ID:', v.id, 'photoBlobs count:', v.photoBlobs?.length);
    if (v.photoBlobs && v.photoBlobs.length > 0) {
      console.log('  first blob:', typeof v.photoBlobs[0] === 'string' ? v.photoBlobs[0].substring(0, 120) : v.photoBlobs[0]);
    }
  }

  console.log('\n--- Checking orderConfirmations ---');
  const ocs = await db.collection('orderConfirmations').find({
    $or: [
      { cashProofImageUrl: { $exists: true } },
      { clientSignatureBlob: { $exists: true } },
      { confirmationPdfBlob: { $exists: true } }
    ]
  }).limit(5).toArray();
  for (const oc of ocs) {
    console.log('OC ID:', oc.id);
    console.log('  cashProofImageUrl:', oc.cashProofImageUrl ? oc.cashProofImageUrl.substring(0, 100) : undefined);
    console.log('  clientSignatureBlob:', typeof oc.clientSignatureBlob === 'string' ? oc.clientSignatureBlob.substring(0, 100) : oc.clientSignatureBlob);
    console.log('  confirmationPdfBlob:', typeof oc.confirmationPdfBlob === 'string' ? oc.confirmationPdfBlob.substring(0, 100) : oc.confirmationPdfBlob);
  }

  process.exit(0);
}

main().catch(console.error);
