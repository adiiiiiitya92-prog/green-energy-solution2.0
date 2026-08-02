import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirestore, doc, setDoc, getDocs, collection, deleteDoc, onSnapshot } from 'firebase/firestore';
import { compressImage, compressDataUrl, type ImageCompressionConfig } from './imageCompressionService';

// Firebase Project Configuration
const NATIVE_BUCKET = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "green-energy-solution-dcfa8.firebasestorage.app";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";
const buildApiUrl = (path: string) => `${BACKEND_URL}${path}`;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBKLwdN137XN8xbFU58BATMRoVFPyVbVVE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "green-energy-solution-dcfa8.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "green-energy-solution-dcfa8",
  storageBucket: NATIVE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "169155482765",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:169155482765:web:955e322b4c1655fe2ebec4"
};

// Initialize distinct Firebase App instance for Green Energy Solution
const APP_NAME = "GreenEnergySolutionApp";
const app = !getApps().some(a => a.name === APP_NAME)
  ? initializeApp(firebaseConfig, APP_NAME)
  : getApp(APP_NAME);

// Export isolated Firebase Auth instance bound to GreenEnergySolutionApp
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Firebase Auth persistence configuration note:", err);
});

// Primary Storage Bucket targeting
export const storage = getStorage(app);

// Custom Firestore Database ID targeting
export const TARGET_DATABASE_ID = import.meta.env.VITE_FIREBASE_DATABASE_ID || "(default)";
export const firestoreDb = TARGET_DATABASE_ID && TARGET_DATABASE_ID !== '(default)'
  ? getFirestore(app, TARGET_DATABASE_ID)
  : getFirestore(app);

const B2_KEY_ID = import.meta.env.VITE_B2_KEY_ID || '005ff217b03db580000000001';
const B2_APP_KEY = import.meta.env.VITE_B2_APPLICATION_KEY || 'K005gOTKgViCFANig1DqeD7fLVoNU80';
const B2_BUCKET_ID = import.meta.env.VITE_B2_BUCKET_ID || '7fffc2f1470ba0d39dfb0518';
const B2_BUCKET_NAME = import.meta.env.VITE_B2_BUCKET_NAME || 'Green-Energy-Solution';

let cachedClientAuth: any = null;
let lastClientAuthTime = 0;

/**
 * Direct Client-Side Backblaze B2 Upload Helper (Works 100% even when local backend server is offline)
 */
async function uploadViaClientDirectB2(base64Data: string, storagePath: string, contentType: string): Promise<string | null> {
  try {
    const now = Date.now();
    let authData = cachedClientAuth;
    if (!authData || (now - lastClientAuthTime > 12 * 3600 * 1000)) {
      const credentials = btoa(`${B2_KEY_ID}:${B2_APP_KEY}`);
      const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
        headers: { Authorization: `Basic ${credentials}` }
      });
      if (!authRes.ok) return null;
      authData = await authRes.json();
      cachedClientAuth = authData;
      lastClientAuthTime = now;
    }

    const uploadUrlRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: { Authorization: authData.authorizationToken },
      body: JSON.stringify({ bucketId: B2_BUCKET_ID })
    });
    if (!uploadUrlRes.ok) return null;
    const uploadInfo = await uploadUrlRes.json();

    const cleanPath = storagePath.replace(/^\/+/, '');
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const binaryStr = atob(cleanBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const uploadRes = await fetch(uploadInfo.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadInfo.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(cleanPath),
        'Content-Type': contentType || 'application/octet-stream',
        'X-Bz-Content-Sha1': 'do_not_verify'
      },
      body: bytes
    });
    if (!uploadRes.ok) return null;

    const dnldAuthRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_download_authorization`, {
      method: 'POST',
      headers: { Authorization: authData.authorizationToken },
      body: JSON.stringify({
        bucketId: B2_BUCKET_ID,
        fileNamePrefix: cleanPath,
        validDurationInSeconds: 604800 // 7 days
      })
    });

    let directUrl = `${authData.downloadUrl}/file/${B2_BUCKET_NAME}/${cleanPath}`;
    if (dnldAuthRes.ok) {
      const dnldData = await dnldAuthRes.json();
      if (dnldData.authorizationToken) {
        directUrl += `?Authorization=${encodeURIComponent(dnldData.authorizationToken)}`;
      }
    }
    console.log(`📦 Directly Uploaded from Client to Backblaze B2 Storage: ${directUrl}`);
    return directUrl;
  } catch (err) {
    console.warn("Direct Client Backblaze B2 upload note:", err);
    return null;
  }
}

/**
 * Helper to upload via backend API / Netlify Serverless Functions to Backblaze B2 Storage Bucket (10 GB Free Storage)
 */
async function uploadViaBackend(base64Data: string, storagePath: string, contentType: string): Promise<string | null> {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5050' : '');
  
  const uploadEndpoints = Array.from(new Set([
    '/api/upload',
    `${backendUrl}/api/upload`.replace(/^\/api/, '/api'),
    '/.netlify/functions/upload'
  ])).filter(Boolean);

  // 1. Try Backend & Netlify Function Upload Endpoints
  for (const apiUrl of uploadEndpoints) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data, storagePath, contentType })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url && (data.url.startsWith('http://') || data.url.startsWith('https://'))) {
          console.log(`📦 Uploaded to Backblaze B2 Storage via ${apiUrl}: ${data.url}`);
          return data.url;
        }
      }
    } catch (err) {
      console.warn(`API upload note for ${apiUrl}:`, err);
    }
  }

  // 2. Fallback: Try Client Direct B2 Upload using Upload URL Endpoints
  const authEndpoints = Array.from(new Set([
    '/api/b2-upload-url',
    `${backendUrl}/api/b2-upload-url`,
    '/.netlify/functions/b2-upload-url'
  ])).filter(Boolean);

  for (const authUrl of authEndpoints) {
    try {
      const authRes = await fetch(authUrl);
      if (authRes.ok) {
        const authInfo = await authRes.json();
        const cleanPath = storagePath.replace(/^\/+/, '');
        const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const binaryStr = atob(cleanBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const uploadRes = await fetch(authInfo.uploadUrl, {
          method: 'POST',
          headers: {
            Authorization: authInfo.authorizationToken,
            'X-Bz-File-Name': encodeURIComponent(cleanPath),
            'Content-Type': contentType || 'application/octet-stream',
            'X-Bz-Content-Sha1': 'do_not_verify'
          },
          body: bytes
        });

        if (uploadRes.ok) {
          let directUrl = `${authInfo.downloadUrl}/file/${authInfo.bucketName}/${cleanPath}`;
          if (authInfo.downloadAuthToken) {
            directUrl += `?Authorization=${encodeURIComponent(authInfo.downloadAuthToken)}`;
          }
          console.log(`📦 Directly Uploaded from Client to Backblaze B2 Storage: ${directUrl}`);
          return directUrl;
        }
      }
    } catch (err2) {
      console.warn(`Client Direct B2 Upload note for ${authUrl}:`, err2);
    }
  }

  // 3. Direct Client B2 Upload using frontend environment credentials
  try {
    const directUrl = await uploadViaClientDirectB2(base64Data, storagePath, contentType);
    if (directUrl && (directUrl.startsWith('http://') || directUrl.startsWith('https://'))) {
      console.log(`📦 Directly Uploaded from Client to Backblaze B2 Storage: ${directUrl}`);
      return directUrl;
    }
  } catch (err3) {
    console.warn("Direct Client B2 Upload note:", err3);
  }

  return null;
}

/**
 * Auto-compresses an image File/Blob down to ultra-low KB sizes (<60KB-90KB)
 * and uploads it directly to Backblaze B2 Cloud Storage (10 GB free bucket capacity).
 */
export async function uploadImageToFirebase(
  fileOrBlob: File | Blob,
  rawPath: string,
  compressionConfig: ImageCompressionConfig = {}
): Promise<string> {
  const compressedFile = fileOrBlob.size <= 100 * 1024 
    ? (fileOrBlob instanceof File ? fileOrBlob : new File([fileOrBlob], `upload_${Date.now()}.webp`, { type: fileOrBlob.type || 'image/webp' }))
    : await compressImage(fileOrBlob, compressionConfig);

  const storagePath = rawPath.replace(/^green-energy-solution\//, '');

  const base64Data = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(compressedFile);
  });

  const b2Url = await uploadViaBackend(base64Data, storagePath, compressedFile.type);
  if (b2Url && (b2Url.startsWith('http://') || b2Url.startsWith('https://'))) return b2Url;

  return base64Data;
}

export async function uploadDataUrlToFirebase(
  dataUrl: string,
  rawPath: string,
  compressionConfig: ImageCompressionConfig = {}
): Promise<string> {
  const compressedFile = await compressDataUrl(dataUrl, `upload_${Date.now()}.webp`, compressionConfig);

  const storagePath = rawPath.replace(/^green-energy-solution\//, '');

  const b2Url = await uploadViaBackend(dataUrl, storagePath, compressedFile.type);
  if (b2Url && (b2Url.startsWith('http://') || b2Url.startsWith('https://'))) return b2Url;

  return dataUrl;
}

/**
 * Uploads a PDF Blob (e.g. quotation proposals, WCR, DCR, Annexures) to Backblaze B2 Cloud Storage bucket.
 */
export async function uploadPdfToFirebase(
  pdfBlob: Blob,
  rawPath: string
): Promise<string> {
  const storagePath = rawPath.replace(/^green-energy-solution\//, '');

  const base64Data = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(pdfBlob);
  });

  const b2Url = await uploadViaBackend(base64Data, storagePath, 'application/pdf');
  if (b2Url && (b2Url.startsWith('http://') || b2Url.startsWith('https://'))) {
    return b2Url;
  }

  throw new Error('Backblaze B2 PDF upload failed: Could not obtain a valid cloud storage URL.');
}

/**
 * Deletes a file from Firebase Cloud Storage by its full URL or path.
 */
export async function deleteFileFromFirebase(storagePathOrUrl: string): Promise<boolean> {
  try {
    if (!storagePathOrUrl || !storagePathOrUrl.includes('firebasestorage')) return false;
    const storageRef = ref(storage, storagePathOrUrl);
    await deleteObject(storageRef);
    return true;
  } catch (err) {
    console.warn("Could not delete Firebase file:", err);
    return false;
  }
}

// ==========================================
// FIRESTORE DATABASE SCALABLE CRUD HELPERS
// ==========================================

/**
 * Helper to strip Blobs or non-serializable objects before sending to Firestore
 */
function sanitizeForFirestore(data: any): any {
  if (data === null || data === undefined) return data;
  if (data instanceof Blob || data instanceof File) return undefined;
  if (Array.isArray(data)) return data.map(sanitizeForFirestore).filter(v => v !== undefined);
  if (typeof data === 'object') {
    const cleanObj: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const val = sanitizeForFirestore(data[key]);
        if (val !== undefined) cleanObj[key] = val;
      }
    }
    return cleanObj;
  }
  return data;
}

function encodeCollectionPath(collectionName: string): string {
  return collectionName
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

async function saveRecordViaBackend(collectionName: string, id: string, data: any): Promise<boolean> {
  try {
    const res = await fetch(buildApiUrl(`/api/firestore/${encodeCollectionPath(collectionName)}/${encodeURIComponent(id)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`Backend Firestore save failed [${collectionName}/${id}]:`, text || res.statusText);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`Backend Firestore save note [${collectionName}/${id}]:`, err);
    return false;
  }
}

async function fetchCollectionViaBackend<T>(collectionName: string, timeoutMs: number = 2500): Promise<T[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(buildApiUrl(`/api/firestore/${encodeCollectionPath(collectionName)}`), {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`Backend Firestore fetch failed [${collectionName}]:`, text || res.statusText);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data as T[] : [];
  } catch (err) {
    console.warn(`Backend Firestore fetch note [${collectionName}]:`, err);
    return [];
  }
}

async function deleteRecordViaBackend(collectionName: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(buildApiUrl(`/api/firestore/${encodeCollectionPath(collectionName)}/${encodeURIComponent(id)}`), {
      method: 'DELETE'
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`Backend Firestore delete failed [${collectionName}/${id}]:`, text || res.statusText);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`Backend Firestore delete note [${collectionName}/${id}]:`, err);
    return false;
  }
}

/**
 * Saves or updates a document in Firebase Firestore (strictly targets green-energy-solution database)
 */
export async function saveRecordToFirestore(collectionName: string, id: string, data: any): Promise<void> {
  const cleanData = sanitizeForFirestore(data);
  try {
    const docRef = doc(firestoreDb, collectionName, id);
    await setDoc(docRef, cleanData, { merge: true });
    console.log(`Firestore synced [${collectionName}/${id}] -> DB: [${TARGET_DATABASE_ID}]`);
    return;
  } catch (err) {
    console.warn(`Firestore direct save note [${collectionName}/${id}], trying backend:`, err);
    const saved = await saveRecordViaBackend(collectionName, id, cleanData);
    if (saved) {
      console.log(`Firestore synced through backend [${collectionName}/${id}] -> DB: [${TARGET_DATABASE_ID}]`);
    }
    return;
  }
}

/**
 * Fetches all documents in a collection from Firebase Firestore (strictly from green-energy-solution database)
 */
/**
 * Fetches all documents in a collection from Firebase Firestore (strictly from green-energy-solution database)
 */
export async function fetchCollectionFromFirestore<T extends { id?: string; isDeleted?: boolean; leadId?: string }>(
  collectionName: string,
  timeoutMs: number = 2500
): Promise<T[]> {
  try {
    const colRef = collection(firestoreDb, collectionName);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Firestore fetch timeout [${collectionName}]`)), timeoutMs)
    );
    const snapshot = await Promise.race([getDocs(colRef), timeoutPromise]);
    const rawDocs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as unknown as T);
    
    // Tombstone filtering
    const { getDeletedRecordIdsSet } = await import('./db');
    const deletedIds = await getDeletedRecordIdsSet();

    const validDocs: T[] = [];
    for (const docItem of rawDocs) {
      if (docItem.id && deletedIds.has(docItem.id)) {
        // Cleanup orphaned record in Firestore if found
        deleteRecordFromFirestore(collectionName, docItem.id).catch(() => {});
        continue;
      }
      if (docItem.isDeleted) {
        if (docItem.id) deleteRecordFromFirestore(collectionName, docItem.id).catch(() => {});
        continue;
      }
      validDocs.push(docItem);
    }
    return validDocs;
  } catch (err) {
    console.warn(`Firestore direct fetch note [${collectionName}], trying backend:`, err);
    const backendDocs = await fetchCollectionViaBackend<T>(collectionName, timeoutMs);
    const { getDeletedRecordIdsSet } = await import('./db');
    const deletedIds = await getDeletedRecordIdsSet();
    return backendDocs.filter(d => (!d.id || !deletedIds.has(d.id)) && !d.isDeleted);
  }
}

/**
 * Deletes a document from Firebase Firestore (strictly from green-energy-solution database)
 */
export async function deleteRecordFromFirestore(collectionName: string, id: string): Promise<void> {
  if (!id) return;
  try {
    const docRef = doc(firestoreDb, collectionName, id);
    await deleteDoc(docRef);
    console.log(`Firestore deleted [${collectionName}/${id}] -> DB: [${TARGET_DATABASE_ID}]`);
  } catch (err) {
    console.warn(`Firestore direct delete note [${collectionName}/${id}], trying backend:`, err);
  }
  
  // Call Express backend DELETE API fallback as well
  deleteRecordViaBackend(collectionName, id).catch(() => {});
}

/**
 * Background sync function to push all local Dexie records to Firestore Cloud Database
 */
export async function syncAllLocalDataToFirestore(): Promise<void> {
  try {
    const { db, getDeletedRecordIdsSet, markRecordAsDeleted } = await import('./db');
    const deletedIds = await getDeletedRecordIdsSet();

    // Fetch remote deletedRecords tombstones first so locally cached deleted items are purged and never re-uploaded
    try {
      const remoteDeleted = await fetchCollectionFromFirestore<{ id: string; collectionName: string }>('deletedRecords', 3000);
      if (Array.isArray(remoteDeleted)) {
        for (const rd of remoteDeleted) {
          if (rd.id) {
            deletedIds.add(rd.id);
            await markRecordAsDeleted(rd.id, rd.collectionName || 'leads');
          }
        }
      }
    } catch (_) {}

    const leads = await db.leads.toArray();
    for (const l of leads) {
      if (deletedIds.has(l.id)) {
        await db.leads.delete(l.id);
      } else {
        await saveRecordToFirestore('leads', l.id, l);
      }
    }
    const quotations = await db.quotations.toArray();
    for (const q of quotations) {
      if (deletedIds.has(q.id) || (q.leadId && deletedIds.has(q.leadId))) {
        await db.quotations.delete(q.id);
      } else {
        await saveRecordToFirestore('quotations', q.id, q);
      }
    }
    const releaseDocs = await db.releaseDocuments.toArray();
    for (const r of releaseDocs) {
      if (deletedIds.has(r.id) || (r.leadId && deletedIds.has(r.leadId))) {
        await db.releaseDocuments.delete(r.id);
      } else {
        await saveRecordToFirestore('releaseDocuments', r.id, r);
      }
    }
    const clientDocs = await db.clientDocuments.toArray();
    for (const cd of clientDocs) {
      if (deletedIds.has(cd.id) || (cd.leadId && deletedIds.has(cd.leadId))) {
        await db.clientDocuments.delete(cd.id);
      } else {
        await saveRecordToFirestore('clientDocuments', cd.id, cd);
      }
    }
    console.log("🔥 Initialized background dual-sync of all local data to Firestore!");
  } catch (err) {
    console.warn("syncAllLocalDataToFirestore note:", err);
  }
}

/**
 * Real-time Firestore sync subscriptions to sync changes across all devices & PWA apps in real-time.
 */
let isRealtimeSyncInitialized = false;

export function initializeRealtimeFirestoreSync(): void {
  if (isRealtimeSyncInitialized) return;
  isRealtimeSyncInitialized = true;

  const dispatchRealtimeUpdate = () => {
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  };

  // 1. Subscribe to deletedRecords tombstones collection
  try {
    const deletedColRef = collection(firestoreDb, 'deletedRecords');
    onSnapshot(deletedColRef, async (snapshot) => {
      let changed = false;
      const { db } = await import('./db');
      for (const change of snapshot.docChanges()) {
        const data = change.doc.data() as { id?: string; collectionName?: string; deletedAt?: string };
        const id = data.id || change.doc.id;
        const collectionName = data.collectionName || 'leads';
        if (id) {
          try {
            await db.deletedRecords.put({
              id,
              collectionName,
              deletedAt: data.deletedAt || new Date().toISOString()
            });

            // Immediately purge the deleted entity from local Dexie IndexedDB tables
            if (collectionName === 'leads' || !collectionName) {
              await db.leads.delete(id);
              await db.quotations.where({ leadId: id }).delete();
              await db.orderConfirmations.where({ leadId: id }).delete();
              await db.clientDocuments.where({ leadId: id }).delete();
              await db.clientRegistrations.where({ leadId: id }).delete();
              await db.installationPhotos.where({ leadId: id }).delete();
              await db.releaseDocuments.where({ leadId: id }).delete();
              await db.fieldVisitReports.where({ leadId: id }).delete();
              await db.challans.where({ leadId: id }).delete();
              await db.shadowAnalyses.where({ leadId: id }).delete();
            } else if (collectionName === 'quotations') {
              await db.quotations.delete(id);
            } else if (collectionName === 'orderConfirmations') {
              await db.orderConfirmations.delete(id);
            } else if (collectionName === 'products') {
              await db.products.delete(id);
            } else if (collectionName === 'challans') {
              await db.challans.delete(id);
            } else if (collectionName === 'fieldVisitReports') {
              await db.fieldVisitReports.delete(id);
            } else if (collectionName === 'shadowAnalyses') {
              await db.shadowAnalyses.delete(id);
            }
            changed = true;
          } catch (e) {
            console.warn("Error handling realtime deletedRecord change:", e);
          }
        }
      }
      if (changed) dispatchRealtimeUpdate();
    }, (err) => console.warn("DeletedRecords realtime listener note:", err));
  } catch (err) {
    console.warn("DeletedRecords listener init note:", err);
  }

  // 2. Helper to set up collection listener
  const setupCollectionListener = (colName: string, getDexieTable: (dbInstance: any) => any) => {
    try {
      const colRef = collection(firestoreDb, colName);
      onSnapshot(colRef, async (snapshot) => {
        const { db, getDeletedRecordIdsSet, markRecordAsDeleted } = await import('./db');
        const dexieTable = getDexieTable(db);
        const deletedIds = await getDeletedRecordIdsSet();
        let changed = false;

        for (const change of snapshot.docChanges()) {
          const docId = change.doc.id;
          if (deletedIds.has(docId)) {
            if (dexieTable) await dexieTable.delete(docId);
            changed = true;
            continue;
          }

          if (change.type === 'removed') {
            if (dexieTable) await dexieTable.delete(docId);
            await markRecordAsDeleted(docId, colName);
            changed = true;
          } else if (change.type === 'added' || change.type === 'modified') {
            const data = { id: docId, ...change.doc.data() };
            if (dexieTable) await dexieTable.put(data);
            changed = true;
          }
        }

        if (changed) dispatchRealtimeUpdate();
      }, (err) => console.warn(`Realtime listener note for ${colName}:`, err));
    } catch (err) {
      console.warn(`Listener init note for ${colName}:`, err);
    }
  };

  setupCollectionListener('leads', (db) => db.leads);
  setupCollectionListener('quotations', (db) => db.quotations);
  setupCollectionListener('orderConfirmations', (db) => db.orderConfirmations);
  setupCollectionListener('products', (db) => db.products);
  setupCollectionListener('challans', (db) => db.challans);
  setupCollectionListener('fieldVisitReports', (db) => db.fieldVisitReports);
}

