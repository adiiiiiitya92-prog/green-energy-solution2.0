import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || "mongodb+srv://setufirebasesetup_db_user:SetuSolution2026@cluster0.tkqhw5u.mongodb.net/?appName=Cluster0";
const dbName = process.env.MONGODB_DB_NAME || "green_energy_crm";

let client = null;
let db = null;
let isConnecting = false;

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
      maxPoolSize: 15,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });

    await client.connect();
    db = client.db(dbName);
    console.log(`✅ Successfully connected to MongoDB Atlas database [${dbName}]`);

    client.on('close', () => {
      console.warn('MongoDB Atlas connection closed. Will reconnect on next query.');
      db = null;
      client = null;
    });

    return db;
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB Atlas:', err);
    throw err;
  } finally {
    isConnecting = false;
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

function cleanDoc(doc) {
  if (!doc) return null;
  const out = { ...doc };
  if (!out.id && out._id) {
    out.id = String(out._id);
  }
  return out;
}

export async function findDocuments(collectionName, filter = {}, options = {}) {
  await connectMongo();
  const col = getCollection(collectionName);
  const query = { ...filter };
  
  if (query.id && typeof query.id === 'string' && !query._id) {
    query.$or = [{ id: query.id }, { _id: query.id }];
    delete query.id;
  }

  const projection = options.projection || {
    signatureBlob: 0,
    clientSignatureBlob: 0,
    confirmationPdfBlob: 0,
    bankDocumentBlob: 0,
    vehiclePhotoBlob: 0,
    pdfBlob: 0,
    fileBlob: 0,
    photoBlob: 0,
    photoBlobs: 0
  };

  let cursor = col.find(query, { projection });
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
  return docs.map(cleanDoc);
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

  // Clean data: remove undefined, retain fields
  const cleanData = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (data[key] !== undefined) {
        cleanData[key] = data[key];
      }
    }
  }

  cleanData.id = id;
  cleanData._id = id; // Ensure string _id for exact Firestore compatibility
  if (!cleanData.updatedAt) {
    cleanData.updatedAt = new Date().toISOString();
  }

  await col.updateOne(
    { $or: [{ id: id }, { _id: id }] },
    { $set: cleanData },
    { upsert: true }
  );

  return cleanData;
}

export async function deleteDocument(collectionName, id) {
  if (!id) return false;
  await connectMongo();
  const col = getCollection(collectionName);
  const result = await col.deleteOne({
    $or: [{ id: id }, { _id: id }]
  });
  return result.deletedCount > 0;
}
