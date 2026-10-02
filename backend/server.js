import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { uploadToB2, getFileStreamFromB2 } from './b2Service.js';
import {
  connectMongo,
  findDocuments,
  getDocumentById,
  upsertDocument,
  deleteDocument,
  getDb
} from './mongoService.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support base64 image/PDF payloads

// Connect to MongoDB Atlas on startup
await connectMongo().catch(err => {
  console.error('Fatal: Could not connect to MongoDB Atlas on startup:', err);
});

// Health Check
app.get('/api/health', (req, res) => {
  let isDbConnected = false;
  try {
    isDbConnected = !!getDb();
  } catch (_) {}

  res.json({
    status: 'ok',
    service: 'Green Energy Solution Solar CRM Backend API (MongoDB Atlas)',
    database: {
      type: 'MongoDB Atlas',
      connected: isDbConnected,
      name: process.env.MONGODB_DB_NAME || 'green_energy_crm'
    },
    storage: 'Backblaze B2 (10 GB Free Tier Connected)',
    timestamp: new Date().toISOString()
  });
});

function handleApiError(res, message, err) {
  const status = err?.statusCode || 500;
  console.error(`API Error: ${message}`, err);
  res.status(status).json({ error: message, details: String(err?.message || err) });
}

function validateCollection(colName) {
  if (!colName || !/^[A-Za-z0-9_-]+$/.test(colName)) {
    const err = new Error(`Invalid collection name: ${colName}`);
    err.statusCode = 400;
    throw err;
  }
}

// ==============================================================
// REAL-TIME SERVER-SENT EVENTS (SSE) FOR INSTANT CROSS-DEVICE SYNC
// ==============================================================
const sseClients = new Set();

function stripBlobsForRealtime(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  delete out.signatureBlob;
  delete out.clientSignatureBlob;
  delete out.confirmationPdfBlob;
  delete out.bankDocumentBlob;
  delete out.vehiclePhotoBlob;
  delete out.pdfBlob;
  delete out.fileBlob;
  delete out.photoBlob;
  delete out.photoBlobs;
  return out;
}

export function broadcastRealtimeChange(collection, id, action = 'upsert', data = null) {
  if (sseClients.size === 0) return;
  const cleanData = data ? stripBlobsForRealtime(data) : null;
  const payload = JSON.stringify({
    type: 'CHANGE',
    collection,
    id,
    action,
    data: cleanData,
    timestamp: Date.now()
  });

  for (const client of Array.from(sseClients)) {
    try {
      client.res.write(`data: ${payload}\n\n`);
      if (typeof client.res.flush === 'function') client.res.flush();
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

app.get('/api/realtime/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });

  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

  const client = { id: Date.now() + Math.random(), res };
  sseClients.add(client);

  const heartbeatTimer = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
      if (typeof res.flush === 'function') res.flush();
    } catch (_) {}
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    sseClients.delete(client);
  });
});

// ==============================================================
// UNIVERSAL DATABASE CRUD (COMPATIBLE WITH FIRESTORE ENDPOINTS)
// ==============================================================
app.get(['/api/firestore/:collection', '/api/db/:collection'], async (req, res) => {
  try {
    const { collection } = req.params;
    validateCollection(collection);

    // Support query parameters for filtering/sorting
    const filter = {};
    if (req.query.leadId) filter.leadId = req.query.leadId;
    if (req.query.assignedEmployeeId) filter.assignedEmployeeId = req.query.assignedEmployeeId;
    if (req.query.status) filter.status = req.query.status;

    let sort = undefined;
    if (['leads', 'quotations', 'challans', 'stockTransactions', 'orderConfirmations'].includes(collection)) {
      sort = { createdAt: -1 };
    } else if (collection === 'fieldVisitReports') {
      sort = { visitedAt: -1 };
    } else if (collection === 'products') {
      sort = { name: 1 };
    }

    const records = await findDocuments(collection, filter, { sort });
    res.json(records);
  } catch (err) {
    handleApiError(res, `Failed to fetch collection ${req.params.collection}`, err);
  }
});

app.get(['/api/firestore/:collection/:id', '/api/db/:collection/:id'], async (req, res) => {
  try {
    const { collection, id } = req.params;
    validateCollection(collection);
    const doc = await getDocumentById(collection, id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found', id });
    }
    res.json(doc);
  } catch (err) {
    handleApiError(res, `Failed to fetch document ${req.params.collection}/${req.params.id}`, err);
  }
});

app.put(['/api/firestore/:collection/:id', '/api/db/:collection/:id'], async (req, res) => {
  try {
    const { collection, id } = req.params;
    validateCollection(collection);
    const saved = await upsertDocument(collection, id, req.body);
    broadcastRealtimeChange(collection, id, 'upsert', saved);
    res.json({ success: true, id, data: saved });
  } catch (err) {
    handleApiError(res, `Failed to save document in ${req.params.collection}/${req.params.id}`, err);
  }
});

app.post(['/api/firestore/:collection', '/api/db/:collection'], async (req, res) => {
  try {
    const { collection } = req.params;
    validateCollection(collection);
    const id = req.body.id || req.body._id || `${collection}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const saved = await upsertDocument(collection, id, { ...req.body, id });
    broadcastRealtimeChange(collection, id, 'upsert', saved);
    res.status(201).json(saved);
  } catch (err) {
    handleApiError(res, `Failed to create document in ${req.params.collection}`, err);
  }
});

app.delete(['/api/firestore/:collection/:id', '/api/db/:collection/:id'], async (req, res) => {
  try {
    const { collection, id } = req.params;
    validateCollection(collection);
    const success = await deleteDocument(collection, id);
    broadcastRealtimeChange(collection, id, 'delete', { id });
    res.json({ success, id });
  } catch (err) {
    handleApiError(res, `Failed to delete document ${req.params.collection}/${req.params.id}`, err);
  }
});

// ===================================
// FAST BULK BOOTSTRAP SYNC API
// ===================================
app.get('/api/sync/bootstrap', async (req, res) => {
  try {
    const [leads, quotations, orderConfirmations, products, challans, deletedRecords] = await Promise.all([
      findDocuments('leads', {}, { sort: { createdAt: -1 } }),
      findDocuments('quotations', {}, { sort: { createdAt: -1 } }),
      findDocuments('orderConfirmations', {}, { sort: { createdAt: -1 } }),
      findDocuments('products', {}, { sort: { name: 1 } }),
      findDocuments('challans', {}, { sort: { createdAt: -1 } }),
      findDocuments('deletedRecords', {})
    ]);
    res.json({
      success: true,
      leads,
      quotations,
      orderConfirmations,
      products,
      challans,
      deletedRecords,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    handleApiError(res, 'Failed to fetch bootstrap sync', err);
  }
});

// ===================================
// 1. LEADS API ENDPOINTS
// ===================================
app.get('/api/leads', async (req, res) => {
  try {
    const leads = await findDocuments('leads', {}, { sort: { createdAt: -1 } });
    res.json(leads);
  } catch (err) {
    handleApiError(res, 'Failed to fetch leads', err);
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    const id = req.body.id || `lead_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();
    const newLead = { ...req.body, id, createdAt: req.body.createdAt || now, updatedAt: now };
    await upsertDocument('leads', id, newLead);
    broadcastRealtimeChange('leads', id, 'upsert', newLead);
    res.status(201).json(newLead);
  } catch (err) {
    handleApiError(res, 'Failed to create lead', err);
  }
});

app.put('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedAt = new Date().toISOString();
    const updatedData = { ...req.body, updatedAt };
    const saved = await upsertDocument('leads', id, updatedData);
    broadcastRealtimeChange('leads', id, 'upsert', saved);
    res.json(saved);
  } catch (err) {
    handleApiError(res, 'Failed to update lead', err);
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteDocument('leads', id);
    broadcastRealtimeChange('leads', id, 'delete', { id });
    res.json({ success: true, id });
  } catch (err) {
    handleApiError(res, 'Failed to delete lead', err);
  }
});

// ===================================
// 2. QUOTATIONS API ENDPOINTS
// ===================================
app.get('/api/quotations', async (req, res) => {
  try {
    const quotes = await findDocuments('quotations', {}, { sort: { createdAt: -1 } });
    res.json(quotes);
  } catch (err) {
    handleApiError(res, 'Failed to fetch quotations', err);
  }
});

app.post('/api/quotations', async (req, res) => {
  try {
    const id = req.body.id || `q_${Date.now()}`;
    const rawQuote = { ...req.body, id, createdAt: req.body.createdAt || new Date().toISOString() };
    const saved = await upsertDocument('quotations', id, rawQuote);
    broadcastRealtimeChange('quotations', id, 'upsert', saved);
    res.status(201).json(saved);
  } catch (err) {
    handleApiError(res, 'Failed to save quotation', err);
  }
});

app.delete('/api/quotations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteDocument('quotations', id);
    broadcastRealtimeChange('quotations', id, 'delete', { id });
    res.json({ success: true, id });
  } catch (err) {
    handleApiError(res, 'Failed to delete quotation', err);
  }
});

// ===================================
// ORDER CONFIRMATIONS API ENDPOINTS
// ===================================
app.get(['/api/order-confirmations', '/api/orderConfirmations'], async (req, res) => {
  try {
    const ocs = await findDocuments('orderConfirmations', {}, { sort: { createdAt: -1 } });
    res.json(ocs);
  } catch (err) {
    handleApiError(res, 'Failed to fetch order confirmations', err);
  }
});

app.post(['/api/order-confirmations', '/api/orderConfirmations'], async (req, res) => {
  try {
    const id = req.body.id || `oc_${Date.now()}`;
    const rawOc = { ...req.body, id, createdAt: req.body.createdAt || new Date().toISOString() };
    const saved = await upsertDocument('orderConfirmations', id, rawOc);
    broadcastRealtimeChange('orderConfirmations', id, 'upsert', saved);
    res.status(201).json(saved);
  } catch (err) {
    handleApiError(res, 'Failed to save order confirmation', err);
  }
});

// ===================================
// 3. PRODUCTS & INVENTORY API
// ===================================
app.get('/api/products', async (req, res) => {
  try {
    const products = await findDocuments('products', {}, { sort: { name: 1 } });
    res.json(products);
  } catch (err) {
    handleApiError(res, 'Failed to fetch products', err);
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const id = req.body.id || `prod_${Date.now()}`;
    const newProd = { ...req.body, id, createdAt: req.body.createdAt || new Date().toISOString() };
    const saved = await upsertDocument('products', id, newProd);
    broadcastRealtimeChange('products', id, 'upsert', saved);
    res.status(201).json(saved);
  } catch (err) {
    handleApiError(res, 'Failed to save product', err);
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteDocument('products', id);
    broadcastRealtimeChange('products', id, 'delete', { id });
    res.json({ success: true, id });
  } catch (err) {
    handleApiError(res, 'Failed to delete product', err);
  }
});

// ===================================
// 4. DELIVERY CHALLANS API
// ===================================
app.get('/api/challans', async (req, res) => {
  try {
    const challans = await findDocuments('challans', {}, { sort: { createdAt: -1 } });
    res.json(challans);
  } catch (err) {
    handleApiError(res, 'Failed to fetch challans', err);
  }
});

app.post('/api/challans', async (req, res) => {
  try {
    const id = req.body.id || `ch_${Date.now()}`;
    const newChallan = { ...req.body, id, createdAt: req.body.createdAt || new Date().toISOString() };
    const saved = await upsertDocument('challans', id, newChallan);
    broadcastRealtimeChange('challans', id, 'upsert', saved);
    res.status(201).json(saved);
  } catch (err) {
    handleApiError(res, 'Failed to save challan', err);
  }
});

// ===================================
// 5. FIELD VISITS API
// ===================================
app.get('/api/visits', async (req, res) => {
  try {
    const visits = await findDocuments('fieldVisitReports', {}, { sort: { visitedAt: -1 } });
    res.json(visits);
  } catch (err) {
    handleApiError(res, 'Failed to fetch visits', err);
  }
});

app.post('/api/visits', async (req, res) => {
  try {
    const id = req.body.id || `visit_${Date.now()}`;
    const newVisit = { ...req.body, id, visitedAt: req.body.visitedAt || new Date().toISOString() };
    const saved = await upsertDocument('fieldVisitReports', id, newVisit);
    broadcastRealtimeChange('fieldVisitReports', id, 'upsert', saved);
    res.status(201).json(saved);
  } catch (err) {
    handleApiError(res, 'Failed to save visit report', err);
  }
});

// ===================================
// 6. B2B BUSINESSES & STOCK TRANSACTIONS API
// ===================================
app.get('/api/b2b-businesses', async (req, res) => {
  try {
    const businesses = await findDocuments('b2bBusinesses', {}, { sort: { createdAt: -1 } });
    res.json(businesses);
  } catch (err) {
    handleApiError(res, 'Failed to fetch B2B businesses', err);
  }
});

app.post('/api/b2b-businesses', async (req, res) => {
  try {
    const id = req.body.id || `b2b_${Date.now()}`;
    const now = new Date().toISOString();
    const newBusiness = { ...req.body, id, updatedAt: now };
    if (!newBusiness.createdAt) newBusiness.createdAt = now;
    const saved = await upsertDocument('b2bBusinesses', id, newBusiness);
    res.status(201).json(saved);
  } catch (err) {
    handleApiError(res, 'Failed to save B2B business', err);
  }
});

app.get('/api/stock-transactions', async (req, res) => {
  try {
    const txns = await findDocuments('stockTransactions', {}, { sort: { timestamp: -1 } });
    res.json(txns);
  } catch (err) {
    handleApiError(res, 'Failed to fetch stock transactions', err);
  }
});

app.post('/api/stock-transactions', async (req, res) => {
  try {
    const id = req.body.id || `stk_txn_${Date.now()}`;
    const newTxn = { ...req.body, id, timestamp: req.body.timestamp || new Date().toISOString() };
    const saved = await upsertDocument('stockTransactions', id, newTxn);
    res.status(201).json(saved);
  } catch (err) {
    handleApiError(res, 'Failed to save stock transaction', err);
  }
});

// ===================================
// 7. AUTH API ENDPOINTS (MONGODB BASED)
// ===================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;
    if (!emailOrPhone) {
      return res.status(400).json({ error: 'Email or phone is required' });
    }
    const input = emailOrPhone.trim().toLowerCase();
    const profiles = await findDocuments('profiles', {});
    const profile = profiles.find(p =>
      (p.email?.toLowerCase() === input || p.phone === input || p.id === input) && p.isActive !== false
    );

    if (!profile) {
      return res.status(404).json({ error: 'User profile not found or inactive' });
    }

    if (profile.password && password && profile.password !== password) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    res.json({ success: true, profile });
  } catch (err) {
    handleApiError(res, 'Login failed', err);
  }
});

// ==============================================================
// 8. BACKBLAZE B2 STORAGE ENDPOINTS (PRESERVED AS-IS)
// ==============================================================
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

app.post('/api/upload', async (req, res) => {
  try {
    const { imageBase64, storagePath, contentType } = req.body;
    if (!imageBase64 || !storagePath) {
      return res.status(400).json({ error: 'Missing imageBase64 or storagePath' });
    }
    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    const fileContentType = contentType || (storagePath.endsWith('.pdf') ? 'application/pdf' : 'image/webp');

    const b2Url = await uploadToB2(buffer, storagePath, fileContentType);
    console.log(`📦 Backend Uploaded to Backblaze B2 [Green-Energy-Solution]: ${b2Url}`);
    res.json({ url: b2Url });
  } catch (err) {
    console.error("Backend Backblaze B2 Upload Error:", err);
    res.status(500).json({ error: 'Backblaze B2 Upload failed', details: String(err) });
  }
});

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

const PORT = process.env.PORT || 5050;
const server = app.listen(PORT, () => {
  console.log(`🚀 Solar CRM MongoDB Backend Server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use by another process.`);
    console.error(`💡 Tip: Close any existing terminal running server.js or free port ${PORT}.`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});
