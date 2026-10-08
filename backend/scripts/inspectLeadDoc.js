import { connectMongo } from '../mongoService.js';

async function main() {
  const db = await connectMongo();
  const leads = await db.collection('leads').find({ name: { $regex: 'DINESH', $options: 'i' } }).toArray();
  console.log(`Found ${leads.length} leads matching DINESH:`);
  for (const lead of leads) {
    console.log(`- Lead ID: ${lead.id}, Name: ${lead.name}`);
    const docs = await db.collection('clientDocuments').find({
      $or: [
        { leadId: lead.id },
        { leadId: String(lead.id) }
      ]
    }).toArray();
    console.log(`  clientDocuments count: ${docs.length}`);
    for (const d of docs) {
      console.log(`    Doc ID: ${d.id}, docType: ${d.docType}`);
      console.log(`      fileBlob:`, typeof d.fileBlob, typeof d.fileBlob === 'string' ? d.fileBlob : (d.fileBlob ? '[binary]' : d.fileBlob));
      console.log(`      fileUrl:`, d.fileUrl);
      console.log(`      url:`, d.url);
      console.log(`      storagePath:`, d.storagePath);
      console.log(`      keys:`, Object.keys(d));
    }
  }
  process.exit(0);
}

main().catch(console.error);
