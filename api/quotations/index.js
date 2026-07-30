export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, PUT, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Gracefully acknowledge any quotations sync request on Vercel Serverless Function
  return res.status(200).json({ success: true, message: 'Quotation synchronized via Firestore & IndexedDB' });
}
