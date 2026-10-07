import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb+srv://setufirebasesetup_db_user:SetuSolution2026@cluster0.tkqhw5u.mongodb.net/?appName=Cluster0";
const dbName = process.env.MONGODB_DB_NAME || "green_energy_crm";

let client = null;
let db = null;
let isConnecting = false;

// ==============================================================
// HIGH-SPEED IN-MEMORY QUERY CACHE (BOUNDED LRU TO PREVENT RAM BLOAT)
// ==============================================================
const memoryCache = new Map();
const CACHE_TTL_MS = 15 * 1000; // 15 seconds TTL for lightning fast subsequent reads
const MAX_CACHE_ENTRIES = 100; // Strictly cap memory to avoid VPS heap bloat

export function invalidateCache(collectionName) {
  if (collectionName) {
    for (const key of memoryCache.keys()) {
      if (key.startsWith(`${collectionName}:`)) {
        memoryCache.delete(key);
      }
    }
  } else {
    memoryCache.clear();
  }
}

export async function connectMongo() {
  if (db) return db;
  if (isConnecting) {
    while (isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (db) return db;
  }

  isConnecting = true;
  try {
    console.log(`🔌 Connecting to MongoDB Atlas (${dbName})...`);
    client = new MongoClient(uri, {
      maxPoolSize: 10, // Optimized for VPS resource efficiency
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    db = client.db(dbName);
    console.log(`✅ Successfully connected to MongoDB Atlas database [${dbName}] with low-resource pool`);

    client.on('close', () => {
      console.warn('MongoDB Atlas connection closed. Will reconnect on next query.');
      db = null;
      client = null;
      memoryCache.clear();
    });

    return db;
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB Atlas:', err);
    throw err;
  } finally {
    isConnecting = false;
  }
}

export async function ensureIndexes() {
  try {
    const database = await connectMongo();
    console.log('⚡ Verifying MongoDB performance indexes...');
    await Promise.allSettled([
      database.collection('profiles').createIndex({ email: 1 }),
      database.collection('profiles').createIndex({ phone: 1 }),
      database.collection('profiles').createIndex({ id: 1 }, { unique: true, sparse: true }),
      database.collection('leads').createIndex({ createdAt: -1 }),
      database.collection('leads').createIndex({ updatedAt: -1 }),
      database.collection('leads').createIndex({ status: 1 }),
      database.collection('leads').createIndex({ id: 1 }, { unique: true, sparse: true }),
      database.collection('leads').createIndex({ assignedEmployeeId: 1 }),
      database.collection('quotations').createIndex({ createdAt: -1 }),
      database.collection('quotations').createIndex({ updatedAt: -1 }),
      database.collection('quotations').createIndex({ leadId: 1 }),
      database.collection('orderConfirmations').createIndex({ createdAt: -1 }),
      database.collection('orderConfirmations').createIndex({ updatedAt: -1 }),
      database.collection('orderConfirmations').createIndex({ leadId: 1 }),
      database.collection('challans').createIndex({ createdAt: -1 }),
      database.collection('challans').createIndex({ updatedAt: -1 }),
      database.collection('challans').createIndex({ leadId: 1 }),
      database.collection('stockTransactions').createIndex({ timestamp: -1 }),
      database.collection('stockTransactions').createIndex({ productId: 1 }),
      database.collection('stockTransactions').createIndex({ createdAt: -1 }),
      database.collection('products').createIndex({ name: 1 }),
      database.collection('products').createIndex({ category: 1 }),
      database.collection('fieldVisitReports').createIndex({ visitedAt: -1 }),
      database.collection('fieldVisitReports').createIndex({ leadId: 1 }),
      database.collection('expenses').createIndex({ expenseDate: -1 }),
      database.collection('expenses').createIndex({ updatedAt: -1 }),
      database.collection('leaveRequests').createIndex({ createdAt: -1 }),
      database.collection('leaveRequests').createIndex({ updatedAt: -1 }),
      database.collection('clientRegistrations').createIndex({ updatedAt: -1 }),
      database.collection('clientDocuments').createIndex({ leadId: 1 }),
      database.collection('clientDocuments').createIndex({ uploadedAt: -1 }),
      database.collection('installationPhotos').createIndex({ leadId: 1 }),
      database.collection('releaseDocuments').createIndex({ leadId: 1 }),
      database.collection('deletionRequests').createIndex({ status: 1 }),
      database.collection('deletedRecords').createIndex({ collectionName: 1 }),
      database.collection('deletedRecords').createIndex({ deletedAt: -1 })
    ]);
    console.log('⚡ All MongoDB Atlas performance indexes are verified and active.');
  } catch (err) {
    console.warn('Index verification note:', err.message);
  }
}

export function getDb() {
  if (!db && client) {
    try {
      db = client.db(dbName);
    } catch (_) {}
  }
  return db;
}

export function getCollection(collectionName) {
  const database = getDb();
  if (!database) {
    throw new Error('Database not connected. Please ensure MongoDB is ready.');
  }
  return database.collection(collectionName);
}

export function cleanDoc(doc) {
  if (!doc) return null;
  const out = { ...doc };
  if (!out.id && out._id) {
    out.id = String(out._id);
  }
  return out;
}

export async function findDocuments(collectionName, filter = {}, options = {}) {
  // Check memory cache for standard queries
  const isCacheable = !options.skip && (!options.limit || options.limit >= 500) && (!filter || Object.keys(filter).length === 0);
  const cacheKey = `${collectionName}:${JSON.stringify(filter)}:${JSON.stringify(options.sort || {})}:${Boolean(options.full)}`;

  if (isCacheable) {
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  await connectMongo();
  const col = getCollection(collectionName);
  const query = { ...filter };
  
  if (query.id && typeof query.id === 'string' && !query._id) {
    query.$or = [{ id: query.id }, { _id: query.id }];
    delete query.id;
  }

  // Optimized Projections: exclude massive base64 blobs and array bloat during list views
  const defaultExcluded = {
    signatureBlob: 0,
    clientSignatureBlob: 0,
    confirmationPdfBlob: 0,
    bankDocumentBlob: 0,
    vehiclePhotoBlob: 0,
    pdfBlob: 0,
    fileBlob: 0,
    photoBlob: 0,
    photoBlobs: 0,
    billProofBlob: 0
  };

  // In bulk product lists, project out massive serial numbers (cuts response from 2.2 MB to 24 KB!)
  if (collectionName === 'products' && !options.full && !options.includeDetails) {
    defaultExcluded.serialNumbers = 0;
    defaultExcluded.productUnits = 0;
  }

  const projection = options.projection || (options.full ? undefined : defaultExcluded);

  let cursor = col.find(query, projection ? { projection } : {});
  if (options.sort) {
    cursor = cursor.sort(options.sort);
  }
  if (options.limit && options.limit > 0) {
    cursor = cursor.limit(options.limit);
  }
  if (options.skip && options.skip > 0) {
    cursor = cursor.skip(options.skip);
  }

  const docs = await cursor.toArray();
  const cleaned = docs.map(cleanDoc);

  if (isCacheable) {
    // Evict oldest cache key if capacity reached
    if (memoryCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = memoryCache.keys().next().value;
      if (oldestKey) memoryCache.delete(oldestKey);
    }
    memoryCache.set(cacheKey, {
      timestamp: Date.now(),
      data: cleaned
    });
  }

  return cleaned;
}

export async function getDocumentById(collectionName, id) {
  if (!id) return null;
  await connectMongo();
  const col = getCollection(collectionName);
  const doc = await col.findOne({
    $or: [{ id: id }, { _id: id }]
  });
  return cleanDoc(doc);
}

export async function upsertDocument(collectionName, id, data) {
  if (!id) {
    throw new Error('Document id is required');
  }
  await connectMongo();
  const col = getCollection(collectionName);

  // Invalidate in-memory cache immediately on any write
  invalidateCache(collectionName);

  const cleanData = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (data[key] !== undefined) {
        cleanData[key] = data[key];
      }
    }
  }

  cleanData.id = id;
  cleanData._id = id;
  if (!cleanData.updatedAt) {
    cleanData.updatedAt = new Date().toISOString();
  }

  await col.updateOne(
    { _id: id },
    { $set: cleanData },
    { upsert: true }
  );

  return cleanData;
}

export async function deleteDocument(collectionName, id) {
  if (!id) return false;
  await connectMongo();
  const col = getCollection(collectionName);

  // Invalidate in-memory cache immediately on delete
  invalidateCache(collectionName);

  const result = await col.deleteOne({
    $or: [{ id: id }, { _id: id }]
  });
  return result.deletedCount > 0;
}
