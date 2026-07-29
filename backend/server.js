import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { uploadToB2, getFileStreamFromB2 } from './b2Service.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize Firebase Admin SDK
const projectId = process.env.FIREBASE_PROJECT_ID || 'green-energy-solution-dcfa8';
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || 'green-energy-solution-dcfa8.firebasestorage.app';
const databaseId = process.env.FIREBASE_DATABASE_ID || '(default)';

if (!getApps().length) {
  initializeApp({
    projectId,
    storageBucket
  });
}

const db = databaseId && databaseId !== '(default)'
  ? getFirestore(databaseId)
  : getFirestore();

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Green Energy Solution Solar CRM Backend API',
    storage: 'Backblaze B2 (10 GB Free Tier Connected)',
    firebase: {
      projectId,
      databaseId,
      storageBucket
    },
    timestamp: new Date().toISOString()
  });
});

// Helper to strip undefined values for Firestore Admin SDK
function sanitizeFirestoreData(data) {
  if (data === null || data === undefined) return undefined;
  if (Array.isArray(data)) return data.map(sanitizeFirestoreData).filter(v => v !== undefined);
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleanObj = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const val = sanitizeFirestoreData(data[key]);
        if (val !== undefined) cleanObj[key] = val;
      }
    }
    return cleanObj;
  }
  return data;
}

function getSafeCollectionRef(collectionName) {
  if (!/^[A-Za-z0-9_-]+$/.test(collectionName)) {
    const err = new Error(`Invalid collection name: ${collectionName}`);
    err.statusCode = 400;
    throw err;
  }
  return db.collection(collectionName);
}

function handleApiError(res, message, err) {
  const status = err?.statusCode || 500;
  res.status(status).json({ error: message, details: String(err) });
}

// Generic Firestore API fallback for the frontend SDK. Always targets FIREBASE_DATABASE_ID.
app.get('/api/firestore/:collection', async (req, res) => {
  try {
    const snapshot = await getSafeCollectionRef(req.params.collection).get();
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(records);
  } catch (err) {
    handleApiError(res, 'Failed to fetch Firestore collection', err);
  }
});

app.put('/api/firestore/:collection/:id', async (req, res) => {
  try {
    const cleanData = sanitizeFirestoreData({ ...req.body, id: req.params.id });
    await getSafeCollectionRef(req.params.collection).doc(req.params.id).set(cleanData, { merge: true });
    res.json({ success: true, id: req.params.id, databaseId });
  } catch (err) {
    handleApiError(res, 'Failed to save Firestore document', err);
  }
});

app.delete('/api/firestore/:collection/:id', async (req, res) => {
  try {
    await getSafeCollectionRef(req.params.collection).doc(req.params.id).delete();
    res.json({ success: true, id: req.params.id, databaseId });
  } catch (err) {
    handleApiError(res, 'Failed to delete Firestore document', err);
  }
});

// Get Backblaze B2 Upload Credentials & URL for Direct Client Uploads
app.get('/api/b2-upload-url', async (req, res) => {
  try {
    const { getB2Auth } = await import('./b2Service.js');
    const auth = await getB2Auth();
    const B2_BUCKET_ID = process.env.B2_BUCKET_ID || '7fffc2f1470ba0d39dfb0518';
    const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || 'Green-Energy-Solution';

    const uploadUrlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken },
      body: JSON.stringify({ bucketId: B2_BUCKET_ID })
    });

    if (!uploadUrlRes.ok) {
      const errText = await uploadUrlRes.text().catch(() => '');
      return res.status(500).json({ error: `B2 get upload url failed: ${errText}` });
    }

    const uploadInfo = await uploadUrlRes.json();

    // Get 7-day download auth token
    const dnldAuthRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken },
      body: JSON.stringify({
        bucketId: B2_BUCKET_ID,
        fileNamePrefix: '',
        validDurationInSeconds: 604800 // 7 days
      })
    });
    let downloadAuthToken = '';
    if (dnldAuthRes.ok) {
      const dnldData = await dnldAuthRes.json();
      downloadAuthToken = dnldData.authorizationToken || '';
    }

    res.json({
      uploadUrl: uploadInfo.uploadUrl,
      authorizationToken: uploadInfo.authorizationToken,
      downloadUrl: auth.downloadUrl,
      bucketName: B2_BUCKET_NAME,
      downloadAuthToken
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get B2 upload URL', details: String(err) });
  }
});

// Upload File to Backblaze B2 Storage Bucket (10 GB Free Storage Capacity)
app.post('/api/upload', async (req, res) => {
  try {
    const { imageBase64, storagePath, contentType } = req.body;
    if (!imageBase64 || !storagePath) {
      return res.status(400).json({ error: 'Missing imageBase64 or storagePath' });
    }
    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    const fileContentType = contentType || (storagePath.endsWith('.pdf') ? 'application/pdf' : 'image/webp');
    
    // Upload to Backblaze B2 Storage Bucket
    const b2Url = await uploadToB2(buffer, storagePath, fileContentType);
    console.log(`📦 Backend Uploaded to Backblaze B2 [Green-Energy-Solution]: ${b2Url}`);
    res.json({ url: b2Url });
  } catch (err) {
    console.error("Backend Backblaze B2 Upload Error:", err);
    res.status(500).json({ error: 'Backblaze B2 Upload failed', details: String(err) });
  }
});

// Stream/Proxy Files directly from Backblaze B2 Bucket
app.get('/api/files/*', async (req, res) => {
  try {
    const rawPath = req.params[0];
    if (!rawPath) return res.status(400).send('Missing file path');
    const { contentType, buffer } = await getFileStreamFromB2(rawPath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);
  } catch (err) {
    console.error(`Error proxying file from B2 [${req.params[0]}]:`, err);
    res.status(404).send('File not found');
  }
});

// ===================================
// 1. LEADS API ENDPOINTS
// ===================================
app.get('/api/leads', async (req, res) => {
  try {
    const snapshot = await db.collection('leads').orderBy('createdAt', 'desc').get();
    const leads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leads', details: String(err) });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    const id = req.body.id || `lead_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();
    const newLead = { ...req.body, id, createdAt: now, updatedAt: now };
    await db.collection('leads').doc(id).set(newLead, { merge: true });
    res.status(201).json(newLead);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create lead', details: String(err) });
  }
});

app.put('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedAt = new Date().toISOString();
    const updatedData = { ...req.body, updatedAt };
    await db.collection('leads').doc(id).set(updatedData, { merge: true });
    res.json({ id, ...updatedData });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lead', details: String(err) });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('leads').doc(id).delete();
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete lead', details: String(err) });
  }
});

// ===================================
// 2. QUOTATIONS API ENDPOINTS
// ===================================
app.get('/api/quotations', async (req, res) => {
  try {
    const snapshot = await db.collection('quotations').orderBy('createdAt', 'desc').get();
    const quotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(quotes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quotations', details: String(err) });
  }
});

app.post('/api/quotations', async (req, res) => {
  try {
    const id = req.body.id || `q_${Date.now()}`;
    const rawQuote = { ...req.body, id, createdAt: req.body.createdAt || new Date().toISOString() };
    const cleanQuote = sanitizeFirestoreData(rawQuote);
    await db.collection('quotations').doc(id).set(cleanQuote, { merge: true });
    res.status(201).json(cleanQuote);
  } catch (err) {
    console.error("Backend Quotation Save Error:", err);
    res.status(500).json({ error: 'Failed to save quotation', details: String(err) });
  }
});

app.delete('/api/quotations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('quotations').doc(id).delete();
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete quotation', details: String(err) });
  }
});

// ===================================
// 3. PRODUCTS & INVENTORY API
// ===================================
app.get('/api/products', async (req, res) => {
  try {
    const snapshot = await db.collection('products').orderBy('name').get();
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products', details: String(err) });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const id = req.body.id || `prod_${Date.now()}`;
    const newProd = { ...req.body, id, createdAt: new Date().toISOString() };
    await db.collection('products').doc(id).set(newProd, { merge: true });
    res.status(201).json(newProd);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save product', details: String(err) });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('products').doc(id).delete();
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product', details: String(err) });
  }
});

// ===================================
// 4. DELIVERY CHALLANS API
// ===================================
app.get('/api/challans', async (req, res) => {
  try {
    const snapshot = await db.collection('challans').orderBy('createdAt', 'desc').get();
    const challans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(challans);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch challans', details: String(err) });
  }
});

app.post('/api/challans', async (req, res) => {
  try {
    const id = req.body.id || `ch_${Date.now()}`;
    const newChallan = { ...req.body, id, createdAt: new Date().toISOString() };
    await db.collection('challans').doc(id).set(newChallan, { merge: true });
    res.status(201).json(newChallan);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save challan', details: String(err) });
  }
});

// ===================================
// 5. FIELD VISITS API
// ===================================
app.get('/api/visits', async (req, res) => {
  try {
    const snapshot = await db.collection('fieldVisitReports').orderBy('visitedAt', 'desc').get();
    const visits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(visits);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch visits', details: String(err) });
  }
});

app.post('/api/visits', async (req, res) => {
  try {
    const id = req.body.id || `visit_${Date.now()}`;
    const newVisit = { ...req.body, id, visitedAt: new Date().toISOString() };
    await db.collection('fieldVisitReports').doc(id).set(newVisit, { merge: true });
    res.status(201).json(newVisit);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save visit report', details: String(err) });
  }
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`🚀 Solar CRM Backend Server running on port ${PORT}`);
});
