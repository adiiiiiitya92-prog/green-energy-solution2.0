import { compressImage, compressDataUrl, type ImageCompressionConfig } from './imageCompressionService';

// Backend API URL (relies on current origin / Vite proxy or explicit backend URL)
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";
const buildApiUrl = (path: string) => `${BACKEND_URL}${path}`;

// Safe compatibility stubs for legacy Firebase imports
export const TARGET_DATABASE_ID = "green_energy_crm";
export const auth: any = {
  currentUser: null,
  onAuthStateChanged: (callback: any) => {
    callback(null);
    return () => {};
  },
  signOut: async () => {}
};
export const storage: any = {};
export const firestoreDb: any = {};

const B2_KEY_ID = import.meta.env.VITE_B2_KEY_ID || '005ff217b03db580000000001';
const B2_APP_KEY = import.meta.env.VITE_B2_APPLICATION_KEY || 'K005gOTKgViCFANig1DqeD7fLVoNU80';
const B2_BUCKET_ID = import.meta.env.VITE_B2_BUCKET_ID || '7fffc2f1470ba0d39dfb0518';
const B2_BUCKET_NAME = import.meta.env.VITE_B2_BUCKET_NAME || 'Green-Energy-Solution';

let cachedClientAuth: any = null;
let lastClientAuthTime = 0;

/**
 * Exponential backoff retry utility (3 attempts: 1s, 2s, 4s)
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let attempt = 0;
  let delay = initialDelayMs;
  let lastError: any = null;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      console.warn(`[Backblaze B2 Retry] Attempt ${attempt}/${maxAttempts} failed: ${err?.message || err}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw lastError || new Error(`Operation failed after ${maxAttempts} retry attempts`);
}

/**
 * Direct Client-Side Backblaze B2 Upload Helper
 */
async function uploadViaClientDirectB2(base64Data: string, storagePath: string, contentType: string): Promise<string | null> {
  if (!B2_KEY_ID || !B2_APP_KEY || !B2_BUCKET_ID) {
    console.warn("Backblaze B2 environment variables are missing on client.");
    return null;
  }

  const now = Date.now();
  let authData = cachedClientAuth;
  if (!authData || (now - lastClientAuthTime > 12 * 3600 * 1000)) {
    const credentials = btoa(`${B2_KEY_ID}:${B2_APP_KEY}`);
    const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      headers: { Authorization: `Basic ${credentials}` }
    });
    if (!authRes.ok) {
      const errTxt = await authRes.text().catch(() => '');
      throw new Error(`B2 Account Authorization failed (${authRes.status}): ${errTxt}`);
    }
    authData = await authRes.json();
    cachedClientAuth = authData;
    lastClientAuthTime = now;
  }

  const uploadUrlRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: authData.authorizationToken },
    body: JSON.stringify({ bucketId: B2_BUCKET_ID })
  });
  if (!uploadUrlRes.ok) {
    const errTxt = await uploadUrlRes.text().catch(() => '');
    throw new Error(`B2 Get Upload URL failed (${uploadUrlRes.status}): ${errTxt}`);
  }
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
  if (!uploadRes.ok) {
    const errTxt = await uploadRes.text().catch(() => '');
    throw new Error(`B2 Binary File Upload failed (${uploadRes.status}): ${errTxt}`);
  }

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
  console.log(`📦 Direct Upload to Backblaze B2 Storage Succeeded: ${directUrl}`);
  return directUrl;
}

/**
 * Upload helper across backend and client endpoints
 */
async function uploadViaBackend(base64Data: string, storagePath: string, contentType: string): Promise<string | null> {
  return withExponentialBackoff(async () => {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const backendUrl = import.meta.env.VITE_BACKEND_URL || '';

    const uploadEndpoints = Array.from(new Set([
      buildApiUrl('/api/upload'),
      '/api/upload',
      `${currentOrigin}/api/upload`,
      backendUrl ? `${backendUrl}/api/upload` : '',
      '/.netlify/functions/upload'
    ])).filter(Boolean);

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

    // Try client direct fallback
    const directUrl = await uploadViaClientDirectB2(base64Data, storagePath, contentType);
    if (directUrl && (directUrl.startsWith('http://') || directUrl.startsWith('https://'))) {
      return directUrl;
    }

    throw new Error("All Backblaze B2 upload endpoints failed.");
  }, 3, 1000);
}

interface B2CachedAuth {
  downloadUrl: string;
  bucketName: string;
  downloadAuthToken: string;
  expiresAt: number;
}

const CACHE_KEY = 'ges_b2_master_auth_v1';
let b2AuthCache: B2CachedAuth | null = (() => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.expiresAt > Date.now() + 5 * 60 * 1000) {
        return parsed;
      }
    }
  } catch (_) {}
  return null;
})();

let pendingAuthPromise: Promise<B2CachedAuth | null> | null = null;

export async function getMasterB2DownloadAuth(): Promise<B2CachedAuth | null> {
  const now = Date.now();
  if (b2AuthCache && b2AuthCache.expiresAt > now + 5 * 60 * 1000) {
    return b2AuthCache;
  }
  if (pendingAuthPromise) {
    return pendingAuthPromise;
  }

  pendingAuthPromise = (async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const authEndpoints = Array.from(new Set([
        buildApiUrl('/api/b2-upload-url'),
        '/api/b2-upload-url',
        `${currentOrigin}/api/b2-upload-url`,
        backendUrl ? `${backendUrl}/api/b2-upload-url` : '',
        '/.netlify/functions/b2-upload-url'
      ])).filter(Boolean);

      for (const endpoint of authEndpoints) {
        try {
          const res = await fetch(endpoint);
          if (res.ok) {
            const authInfo = await res.json();
            if (authInfo.downloadUrl && authInfo.downloadAuthToken) {
              const cacheObj: B2CachedAuth = {
                downloadUrl: authInfo.downloadUrl,
                bucketName: authInfo.bucketName || B2_BUCKET_NAME || 'Green-Energy-Solution',
                downloadAuthToken: authInfo.downloadAuthToken,
                expiresAt: Date.now() + (6 * 24 * 3600 * 1000)
              };
              b2AuthCache = cacheObj;
              try { localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObj)); } catch (_) {}
              return cacheObj;
            }
          }
        } catch (_) {}
      }

      if (B2_KEY_ID && B2_APP_KEY && B2_BUCKET_ID) {
        const credentials = btoa(`${B2_KEY_ID}:${B2_APP_KEY}`);
        const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
          headers: { Authorization: `Basic ${credentials}` }
        });
        if (authRes.ok) {
          const authData = await authRes.json();
          const dnldAuthRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_download_authorization`, {
            method: 'POST',
            headers: { Authorization: authData.authorizationToken },
            body: JSON.stringify({
              bucketId: B2_BUCKET_ID,
              fileNamePrefix: '',
              validDurationInSeconds: 604800
            })
          });
          if (dnldAuthRes.ok) {
            const dnldData = await dnldAuthRes.json();
            const cacheObj: B2CachedAuth = {
              downloadUrl: authData.downloadUrl,
              bucketName: B2_BUCKET_NAME || 'Green-Energy-Solution',
              downloadAuthToken: dnldData.authorizationToken || '',
              expiresAt: Date.now() + (6 * 24 * 3600 * 1000)
            };
            b2AuthCache = cacheObj;
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObj)); } catch (_) {}
            return cacheObj;
          }
        }
      }
    } catch (err) {
      console.warn("Master B2 download auth note:", err);
    } finally {
      pendingAuthPromise = null;
    }
    return null;
  })();

  return pendingAuthPromise;
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    getMasterB2DownloadAuth().catch(() => {});
  }, 100);
}

export function getQuickB2Url(storagePathOrUrl: any): string {
  if (!storagePathOrUrl) return '';
  if (typeof storagePathOrUrl !== 'string') return '';
  if (storagePathOrUrl.startsWith('data:') || storagePathOrUrl.startsWith('blob:')) {
    return storagePathOrUrl;
  }
  if (!storagePathOrUrl.includes('backblazeb2.com') && !storagePathOrUrl.includes('/file/')) {
    return storagePathOrUrl;
  }

  let cleanPath = storagePathOrUrl.replace(/^https?:\/\/[^\/]+\/file\/[^\/]+\//, '');
  cleanPath = cleanPath.split('?')[0].replace(/^\/+/, '');
  if (!cleanPath) return storagePathOrUrl;

  if (b2AuthCache && b2AuthCache.downloadAuthToken) {
    return `${b2AuthCache.downloadUrl}/file/${b2AuthCache.bucketName}/${cleanPath}?Authorization=${encodeURIComponent(b2AuthCache.downloadAuthToken)}`;
  }

  if (storagePathOrUrl.includes('Authorization=')) {
    return storagePathOrUrl;
  }

  getMasterB2DownloadAuth().then((auth) => {
    if (auth?.downloadAuthToken && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('b2-auth-refreshed'));
    }
  }).catch(() => {});
  return storagePathOrUrl.split('?')[0];
}

export async function getFreshB2SignedUrl(storagePathOrUrl: string): Promise<string> {
  if (!storagePathOrUrl) return storagePathOrUrl;
  if (typeof storagePathOrUrl !== 'string') return storagePathOrUrl;
  if (storagePathOrUrl.startsWith('data:') || storagePathOrUrl.startsWith('blob:')) {
    return storagePathOrUrl;
  }
  if (!storagePathOrUrl.includes('backblazeb2.com') && !storagePathOrUrl.includes('/file/')) {
    return storagePathOrUrl;
  }

  let cleanPath = storagePathOrUrl.replace(/^https?:\/\/[^\/]+\/file\/[^\/]+\//, '');
  cleanPath = cleanPath.split('?')[0].replace(/^\/+/, '');
  if (!cleanPath) return storagePathOrUrl;

  try {
    const auth = await getMasterB2DownloadAuth();
    if (auth && auth.downloadAuthToken) {
      return `${auth.downloadUrl}/file/${auth.bucketName}/${cleanPath}?Authorization=${encodeURIComponent(auth.downloadAuthToken)}`;
    }
  } catch (err) {
    console.warn("Signed URL refresh note:", err);
  }

  if (storagePathOrUrl.includes('Authorization=')) {
    return storagePathOrUrl;
  }

  return storagePathOrUrl.split('?')[0];
}

/**
 * Upload image to Backblaze B2 Cloud Storage (zero Firebase upload)
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

  try {
    const b2Url = await uploadViaBackend(base64Data, storagePath, compressedFile.type);
    if (b2Url && (b2Url.startsWith('http://') || b2Url.startsWith('https://'))) {
      return b2Url;
    }
  } catch (err: any) {
    console.warn("Backblaze B2 Image Upload failed, returning base64 fallback:", err);
  }

  return base64Data;
}

export async function uploadDataUrlToFirebase(
  dataUrl: string,
  rawPath: string,
  compressionConfig: ImageCompressionConfig = {}
): Promise<string> {
  const compressedFile = await compressDataUrl(dataUrl, `upload_${Date.now()}.webp`, compressionConfig);
  const storagePath = rawPath.replace(/^green-energy-solution\//, '');

  try {
    const b2Url = await uploadViaBackend(dataUrl, storagePath, compressedFile.type);
    if (b2Url && (b2Url.startsWith('http://') || b2Url.startsWith('https://'))) return b2Url;
  } catch (err: any) {
    console.warn("Backblaze B2 Data URL Upload note, returning original:", err);
  }

  return dataUrl;
}

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

  try {
    const b2Url = await uploadViaBackend(base64Data, storagePath, 'application/pdf');
    if (b2Url && (b2Url.startsWith('http://') || b2Url.startsWith('https://'))) {
      console.log(`📦 PDF Uploaded to Backblaze B2 Storage Bucket: ${b2Url}`);
      return b2Url;
    }
  } catch (err) {
    console.warn("Backblaze B2 PDF upload failed, using Data URL fallback:", err);
  }

  return base64Data;
}

export async function deleteFileFromFirebase(_storagePathOrUrl: string): Promise<boolean> {
  return true; // No-op for B2 deletion from client
}

// =========================================================================
// MONGODB ATLAS DATABASE API CRUD HELPERS (CONNECTED TO BACKEND API)
// =========================================================================

function sanitizeForMongo(data: any): any {
  if (data === null || data === undefined) return data;
  if (data instanceof Blob || data instanceof File) return undefined;
  if (Array.isArray(data)) return data.map(sanitizeForMongo).filter(v => v !== undefined);
  if (typeof data === 'object') {
    const cleanObj: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const val = sanitizeForMongo(data[key]);
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

interface PendingSave {
  collectionName: string;
  id: string;
  data: any;
  timestamp: number;
}

const PENDING_SAVES_KEY = 'ges_pending_mongo_saves';

function getPendingSaves(): Record<string, PendingSave> {
  try {
    const raw = localStorage.getItem(PENDING_SAVES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePendingQueue(queue: Record<string, PendingSave>) {
  try {
    localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify(queue));
  } catch {}
}

export function enqueuePendingSave(collectionName: string, id: string, data: any) {
  const queue = getPendingSaves();
  queue[`${collectionName}/${id}`] = {
    collectionName,
    id,
    data,
    timestamp: Date.now()
  };
  savePendingQueue(queue);
}

export function dequeuePendingSave(collectionName: string, id: string) {
  const queue = getPendingSaves();
  if (queue[`${collectionName}/${id}`]) {
    delete queue[`${collectionName}/${id}`];
    savePendingQueue(queue);
  }
}

let isProcessingPendingSaves = false;
export async function processPendingSaves(): Promise<void> {
  if (isProcessingPendingSaves) return;
  isProcessingPendingSaves = true;
  try {
    const queue = getPendingSaves();
    const entries = Object.entries(queue);
    if (entries.length === 0) return;

    console.log(`[MongoDB Sync Queue] Processing ${entries.length} pending writes...`);
    for (const [, item] of entries) {
      try {
        const cleanData = sanitizeForMongo(item.data);
        const res = await fetch(buildApiUrl(`/api/firestore/${encodeCollectionPath(item.collectionName)}/${encodeURIComponent(item.id)}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanData)
        });
        if (res.ok) {
          dequeuePendingSave(item.collectionName, item.id);
          console.log(`[MongoDB Sync Queue] Flushed [${item.collectionName}/${item.id}] -> DB [green_energy_crm]`);
        }
      } catch (err) {
        // Retry next cycle
      }
    }
  } finally {
    isProcessingPendingSaves = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log("🌐 Network online detected! Flushing pending MongoDB saves...");
    processPendingSaves();
    syncAllLocalDataToFirestore(true);
  });
  setInterval(() => {
    processPendingSaves();
  }, 15000);
}

/**
 * Saves or updates a document in MongoDB Atlas via Backend API
 */
export async function saveRecordToFirestore(collectionName: string, id: string, data: any): Promise<void> {
  const cleanData = sanitizeForMongo(data);
  try {
    const res = await fetch(buildApiUrl(`/api/firestore/${encodeCollectionPath(collectionName)}/${encodeURIComponent(id)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanData)
    });
    if (res.ok) {
      dequeuePendingSave(collectionName, id);
      console.log(`✅ MongoDB synced [${collectionName}/${id}] -> DB: [green_energy_crm]`);
      // Broadcast update across tabs
      broadcastDataUpdate(collectionName, id);
      return;
    }
  } catch (err) {
    console.warn(`MongoDB save offline or error [${collectionName}/${id}], queueing for retry:`, err);
  }

  // Fallback to queue
  enqueuePendingSave(collectionName, id, cleanData);
}

/**
 * Fetches all documents in a collection from MongoDB Atlas via Backend API
 */
export async function fetchCollectionFromFirestore<T extends { id?: string; isDeleted?: boolean; leadId?: string }>(
  collectionName: string,
  timeoutMs: number = 30000
): Promise<T[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(buildApiUrl(`/api/firestore/${encodeCollectionPath(collectionName)}`), {
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`Failed to fetch collection [${collectionName}]: HTTP ${res.status}`);
      return [];
    }

    const rawDocs: T[] = await res.json();
    if (!Array.isArray(rawDocs)) return [];

    // Tombstone filtering
    if (collectionName === 'deletedRecords') {
      return rawDocs;
    }

    const { getDeletedRecordIdsSet } = await import('./db');
    const deletedIds = await getDeletedRecordIdsSet();

    const validDocs: T[] = [];
    for (const docItem of rawDocs) {
      if (docItem.id && deletedIds.has(docItem.id)) {
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
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn(`MongoDB fetch note for [${collectionName}]:`, err);
    }
    return [];
  }
}

/**
 * Deletes a document from MongoDB Atlas via Backend API
 */
export async function deleteRecordFromFirestore(collectionName: string, id: string): Promise<void> {
  if (!id) return;
  try {
    const res = await fetch(buildApiUrl(`/api/firestore/${encodeCollectionPath(collectionName)}/${encodeURIComponent(id)}`), {
      method: 'DELETE'
    });
    if (res.ok) {
      console.log(`🗑️ MongoDB deleted [${collectionName}/${id}]`);
      broadcastDataUpdate(collectionName, id);
    }
  } catch (err) {
    console.warn(`MongoDB delete note [${collectionName}/${id}]:`, err);
  }
}

let lastSyncTimestamp = 0;
const SYNC_COOLDOWN_MS = 10 * 1000; // 10 seconds throttle

/**
 * Smart reconciliation sync between local Dexie IndexedDB and MongoDB Atlas
 */
export async function syncAllLocalDataToFirestore(force: boolean = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastSyncTimestamp < SYNC_COOLDOWN_MS) {
    return;
  }
  lastSyncTimestamp = now;

  // Flush any pending failed saves first
  await processPendingSaves();

  try {
    const { db, getDeletedRecordIdsSet, markRecordAsDeleted } = await import('./db');
    const deletedIds = await getDeletedRecordIdsSet();

    // 1. Fetch remote deletedRecords tombstones first
    try {
      const remoteDeleted = await fetchCollectionFromFirestore<{ id: string; collectionName: string }>('deletedRecords', 15000);
      if (Array.isArray(remoteDeleted)) {
        for (const rd of remoteDeleted) {
          if (rd.id) {
            deletedIds.add(rd.id);
            await markRecordAsDeleted(rd.id, rd.collectionName || 'leads');
          }
        }
      }
    } catch (_) {}

    // 2. Reconcile & Sync Leads
    try {
      const remoteLeads = await fetchCollectionFromFirestore<any>('leads', 25000);
      if (Array.isArray(remoteLeads) && remoteLeads.length > 0) {
        const remoteLeadMap = new Map<string, any>(remoteLeads.map(r => [r.id, r]));
        const localLeads = await db.leads.toArray();

        for (const l of localLeads) {
          if (deletedIds.has(l.id)) {
            await db.leads.delete(l.id);
            continue;
          }
          const remoteLead = remoteLeadMap.get(l.id);
          if (!remoteLead) {
            // Push locally created lead to remote if not yet on MongoDB
            saveRecordToFirestore('leads', l.id, l).catch(() => {});
          } else if (l.updatedAt && remoteLead.updatedAt && new Date(l.updatedAt).getTime() > new Date(remoteLead.updatedAt).getTime()) {
            saveRecordToFirestore('leads', l.id, l).catch(() => {});
          }
        }

        const validRemoteLeads = remoteLeads.filter(rl => rl && rl.id && !deletedIds.has(rl.id));
        if (validRemoteLeads.length > 0) {
          await db.leads.bulkPut(validRemoteLeads);
        }
      }
    } catch (err) {
      console.warn("Lead sync note:", err);
    }

    // 3. Reconcile & Sync Quotations
    try {
      const remoteQuotes = await fetchCollectionFromFirestore<any>('quotations', 25000);
      if (Array.isArray(remoteQuotes) && remoteQuotes.length > 0) {
        const remoteQuoteMap = new Map<string, any>(remoteQuotes.map(r => [r.id, r]));
        const localQuotes = await db.quotations.toArray();

        for (const q of localQuotes) {
          if (deletedIds.has(q.id) || (q.leadId && deletedIds.has(q.leadId))) {
            await db.quotations.delete(q.id);
            continue;
          }
          const remoteQuote = remoteQuoteMap.get(q.id);
          if (!remoteQuote) {
            saveRecordToFirestore('quotations', q.id, q).catch(() => {});
          } else if (q.updatedAt && remoteQuote.updatedAt && new Date(q.updatedAt).getTime() > new Date(remoteQuote.updatedAt).getTime()) {
            saveRecordToFirestore('quotations', q.id, q).catch(() => {});
          }
        }

        const validRemoteQuotes = remoteQuotes.filter(rq => rq && rq.id && !deletedIds.has(rq.id) && (!rq.leadId || !deletedIds.has(rq.leadId)));
        if (validRemoteQuotes.length > 0) {
          await db.quotations.bulkPut(validRemoteQuotes);
        }
      }
    } catch (err) {
      console.warn("Quotation sync note:", err);
    }

    // 4. Reconcile & Sync Order Confirmations
    try {
      const remoteOcs = await fetchCollectionFromFirestore<any>('orderConfirmations', 25000);
      if (Array.isArray(remoteOcs) && remoteOcs.length > 0) {
        const remoteOcMap = new Map<string, any>(remoteOcs.map(r => [r.id, r]));
        const localOcs = await db.orderConfirmations.toArray();

        for (const oc of localOcs) {
          if (deletedIds.has(oc.id) || (oc.leadId && deletedIds.has(oc.leadId))) {
            await db.orderConfirmations.delete(oc.id);
            continue;
          }
          const remoteOc = remoteOcMap.get(oc.id);
          if (!remoteOc) {
            saveRecordToFirestore('orderConfirmations', oc.id, oc).catch(() => {});
          } else {
            const localPayments = oc.payments || [];
            const remotePayments = remoteOc.payments || [];
            const localPaid = localPayments.reduce((s: number, p: any) => s + (p?.amount || 0), 0) || oc.advanceAmount || 0;
            const remotePaid = remotePayments.reduce((s: number, p: any) => s + (p?.amount || 0), 0) || remoteOc.advanceAmount || 0;

            if (localPaid > remotePaid) {
              await saveRecordToFirestore('orderConfirmations', oc.id, oc);
            }
          }
        }

        const validRemoteOcs = remoteOcs.filter(roc => roc && roc.id && !deletedIds.has(roc.id) && (!roc.leadId || !deletedIds.has(roc.leadId)));
        if (validRemoteOcs.length > 0) {
          await db.orderConfirmations.bulkPut(validRemoteOcs);
        }
      }
    } catch (err) {
      console.warn("OrderConfirmation sync note:", err);
    }

    // 5. Sync Products & Inventory
    try {
      const remoteProducts = await fetchCollectionFromFirestore<any>('products', 15000);
      if (Array.isArray(remoteProducts) && remoteProducts.length > 0) {
        for (const p of remoteProducts) {
          if (p?.id && !deletedIds.has(p.id)) {
            await db.products.put(p);
          }
        }
      }
    } catch (_) {}

    // 6. Sync Delivery Challans
    try {
      const remoteChallans = await fetchCollectionFromFirestore<any>('challans', 15000);
      if (Array.isArray(remoteChallans)) {
        for (const ch of remoteChallans) {
          if (ch?.id && !deletedIds.has(ch.id)) {
            await db.challans.put(ch);
          }
        }
      }
    } catch (_) {}

    // 7. Sync Field Visit Reports
    try {
      const remoteVisits = await fetchCollectionFromFirestore<any>('fieldVisitReports', 15000);
      if (Array.isArray(remoteVisits)) {
        for (const v of remoteVisits) {
          if (v?.id && !deletedIds.has(v.id)) {
            await db.fieldVisitReports.put(v);
          }
        }
      }
    } catch (_) {}

    // 8. Sync B2B Businesses & Stock Transactions
    try {
      const remoteB2b = await fetchCollectionFromFirestore<any>('b2bBusinesses', 15000);
      if (Array.isArray(remoteB2b)) {
        for (const b of remoteB2b) {
          if (b?.id && !deletedIds.has(b.id)) {
            await db.b2bBusinesses.put(b);
          }
        }
      }
      const remoteTxns = await fetchCollectionFromFirestore<any>('stockTransactions', 15000);
      if (Array.isArray(remoteTxns)) {
        for (const t of remoteTxns) {
          if (t?.id && !deletedIds.has(t.id)) {
            await db.stockTransactions.put(t);
          }
        }
      }
    } catch (_) {}

    // 9. Sync Client Documents, Registrations, Installation Photos, Release Docs, Complaints
    try {
      const remoteDocs = await fetchCollectionFromFirestore<any>('clientDocuments', 15000);
      if (Array.isArray(remoteDocs)) {
        for (const d of remoteDocs) {
          if (d?.id && !deletedIds.has(d.id)) {
            const local = await db.clientDocuments.get(d.id);
            await db.clientDocuments.put(local?.fileBlob && !d.fileBlob ? { ...d, fileBlob: local.fileBlob } : d);
          }
        }
      }

      const remoteRegs = await fetchCollectionFromFirestore<any>('clientRegistrations', 15000);
      if (Array.isArray(remoteRegs)) {
        for (const r of remoteRegs) {
          if (r?.leadId && !deletedIds.has(r.leadId)) {
            await db.clientRegistrations.put(r);
          }
        }
      }

      const remotePhotos = await fetchCollectionFromFirestore<any>('installationPhotos', 15000);
      if (Array.isArray(remotePhotos)) {
        for (const p of remotePhotos) {
          if (p?.id && !deletedIds.has(p.id)) {
            await db.installationPhotos.put(p);
          }
        }
      }

      const remoteReleases = await fetchCollectionFromFirestore<any>('releaseDocuments', 15000);
      if (Array.isArray(remoteReleases)) {
        for (const r of remoteReleases) {
          if (r?.id && !deletedIds.has(r.id)) {
            await db.releaseDocuments.put(r);
          }
        }
      }

      const remoteComplaints = await fetchCollectionFromFirestore<any>('complaints', 15000);
      if (Array.isArray(remoteComplaints)) {
        for (const c of remoteComplaints) {
          if (c?.id && !deletedIds.has(c.id)) {
            await db.complaints.put(c);
          }
        }
      }
    } catch (_) {}

    console.log("🔥 Smart reconciliation completed with MongoDB Atlas [green_energy_crm]!");
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app-realtime-update'));
    }
  } catch (err) {
    console.warn("syncAllLocalDataToFirestore note:", err);
  }
}

// Multi-tab BroadcastChannel for zero-latency inter-tab updates
const realtimeChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('app_realtime_broadcast_channel') : null;

function broadcastDataUpdate(collectionName: string, id: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-realtime-update', { detail: { collectionName, id } }));
    if (realtimeChannel) {
      try {
        realtimeChannel.postMessage({ type: 'REALTIME_UPDATE', collectionName, id });
      } catch (_) {}
    }
  }
}

if (realtimeChannel) {
  realtimeChannel.onmessage = (event) => {
    if (event.data?.type === 'REALTIME_UPDATE') {
      window.dispatchEvent(new CustomEvent('app-realtime-update', { detail: event.data }));
    }
  };
}

// Persistent Cross-Device Realtime SSE Stream connection
let sseConnection: EventSource | null = null;
let sseReconnectTimer: any = null;

export function connectCrossDeviceRealtimeStream(): void {
  if (typeof window === 'undefined') return;

  if (sseConnection) {
    try { sseConnection.close(); } catch (_) {}
    sseConnection = null;
  }

  const streamUrl = buildApiUrl('/api/realtime/stream');
  try {
    sseConnection = new EventSource(streamUrl);

    sseConnection.onopen = () => {
      console.log('⚡ [Cross-Device Sync] Connected to MongoDB Atlas real-time SSE stream!');
    };

    sseConnection.onmessage = async (e) => {
      try {
        if (!e.data) return;
        const msg = JSON.parse(e.data);
        if (msg.type === 'CHANGE') {
          const { collection, id, action, data } = msg;
          const { db, getDeletedRecordIdsSet, markRecordAsDeleted } = await import('./db');

          if (action === 'delete') {
            await markRecordAsDeleted(id, collection);
            if ((db as any)[collection]) {
              await (db as any)[collection].delete(id).catch(() => {});
            }
          } else if (action === 'upsert' && data) {
            const deletedIds = await getDeletedRecordIdsSet();
            if (!deletedIds.has(id) && (db as any)[collection]) {
              await (db as any)[collection].put(data).catch(() => {});
            }
          }

          // Instantly notify local UI components & other tabs
          broadcastDataUpdate(collection, id);
        }
      } catch (err) {
        console.warn('Real-time event processing note:', err);
      }
    };

    sseConnection.onerror = () => {
      try { sseConnection?.close(); } catch (_) {}
      sseConnection = null;
      if (!sseReconnectTimer) {
        sseReconnectTimer = setTimeout(() => {
          sseReconnectTimer = null;
          connectCrossDeviceRealtimeStream();
        }, 3000);
      }
    };
  } catch (err) {
    console.warn("Could not start EventSource stream:", err);
  }
}

let isRealtimeSyncInitialized = false;

/**
 * Real-time sync initialization: Instant cross-device SSE streaming + periodic sync fallback
 * ZERO Firestore listeners, ZERO Firebase quota consumption!
 */
export function initializeRealtimeFirestoreSync(): void {
  if (isRealtimeSyncInitialized) return;
  isRealtimeSyncInitialized = true;

  // 1. Establish persistent cross-device SSE real-time stream
  connectCrossDeviceRealtimeStream();

  // 2. Initial background sync with MongoDB Atlas
  syncAllLocalDataToFirestore(true).catch(() => {});

  if (typeof window !== 'undefined') {
    // 3. Reconnect & sync on tab focus
    window.addEventListener('focus', () => {
      if (!sseConnection || sseConnection.readyState === EventSource.CLOSED) {
        connectCrossDeviceRealtimeStream();
      }
      syncAllLocalDataToFirestore(false).catch(() => {});
    });

    // 4. Periodic safety sync every 30 seconds
    setInterval(() => {
      syncAllLocalDataToFirestore(false).catch(() => {});
    }, 30000);
  }
}
