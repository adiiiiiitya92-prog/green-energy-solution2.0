import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirestore, doc, setDoc, getDocs, collection, deleteDoc, onSnapshot } from 'firebase/firestore';
import { compressImage, compressDataUrl, type ImageCompressionConfig } from './imageCompressionService';

// Firebase Project Configuration
const NATIVE_BUCKET = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "green-energy-solution-dcfa8.appspot.com";
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

const B2_KEY_ID = import.meta.env.VITE_B2_KEY_ID || '';
const B2_APP_KEY = import.meta.env.VITE_B2_APPLICATION_KEY || '';
const B2_BUCKET_ID = import.meta.env.VITE_B2_BUCKET_ID || '';
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
      if (attempt >= maxAttempts) {
        break;
      }
      console.warn(`[Backblaze B2 Retry] Attempt ${attempt}/${maxAttempts} failed: ${err?.message || err}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw lastError || new Error(`Operation failed after ${maxAttempts} retry attempts`);
}

/**
 * Direct Client-Side Backblaze B2 Upload Helper (Used with pre-signed upload credentials)
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
      validDurationInSeconds: 604800 // 7 days (604800s)
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
 * Upload helper with exponential backoff retry (3 attempts) across Serverless & Client endpoints
 */
async function uploadViaBackend(base64Data: string, storagePath: string, contentType: string): Promise<string | null> {
  return withExponentialBackoff(async () => {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const backendUrl = import.meta.env.VITE_BACKEND_URL || '';

    const uploadEndpoints = Array.from(new Set([
      '/api/upload',
      `${currentOrigin}/api/upload`,
      backendUrl ? `${backendUrl}/api/upload` : '',
      '/.netlify/functions/upload'
    ])).filter(Boolean);

    // 1. Try Backend & Netlify / Vercel Serverless Function Upload Endpoints
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

    // 2. Try Client Pre-signed Upload URL Endpoints
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

    // 3. Fallback: Direct Client B2 Upload using frontend environment credentials
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
                expiresAt: Date.now() + (6 * 24 * 3600 * 1000) // Valid for 6 days
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
              fileNamePrefix: '', // Empty prefix authorizes ALL files across bucket
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

// Prefetch B2 master token in the background on module initialization
if (typeof window !== 'undefined') {
  setTimeout(() => {
    getMasterB2DownloadAuth().catch(() => {});
  }, 100);
}

/**
 * Synchronous instant URL resolver for images/thumbnails:
 * Returns the fresh signed URL in 0ms if cached, or clean URL if not yet cached.
 */
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

  // Preserve working Authorization token if already present on URL
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

/**
 * Regenerates or refreshes a 7-day signed download URL on demand for any stored B2 path or URL.
 * Automatically cleans any expired ?Authorization tokens and attaches the fresh master token.
 * Instant ~0ms when cached, ~300ms when fresh auth needed.
 */
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

  // Preserve existing Authorization token if refresh was not possible
  if (storagePathOrUrl.includes('Authorization=')) {
    return storagePathOrUrl;
  }

  return storagePathOrUrl.split('?')[0];
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

  // 1. Primary: Backblaze B2 Cloud Storage Upload
  try {
    const b2Url = await uploadViaBackend(base64Data, storagePath, compressedFile.type);
    if (b2Url && (b2Url.startsWith('http://') || b2Url.startsWith('https://'))) return b2Url;
  } catch (err: any) {
    console.warn("Backblaze B2 Image Upload note, trying Firebase Storage fallback:", err);
  }

  // 2. Fallback: Firebase Native Cloud Storage Bucket Upload
  try {
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, compressedFile, { contentType: compressedFile.type || 'image/webp' });
    const downloadUrl = await getDownloadURL(snapshot.ref);
    console.log(`📦 Image Uploaded to Firebase Storage Bucket: ${downloadUrl}`);
    return downloadUrl;
  } catch (err: any) {
    console.warn("Firebase Storage image upload note:", err);
    return base64Data; // Ultimate fallback: return Data URL so user is never blocked
  }
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
    console.warn("Backblaze B2 Data URL Upload note, trying Firebase Storage fallback:", err);
  }

  try {
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, compressedFile, { contentType: compressedFile.type || 'image/webp' });
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (err: any) {
    console.warn("Firebase Storage Data URL upload note:", err);
    return dataUrl;
  }
}

/**
 * Uploads a PDF Blob (e.g. quotation proposals, WCR, DCR, Annexures) to Backblaze B2 / Firebase Cloud Storage bucket.
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

  // 1. Primary: Backblaze B2 Storage Upload
  try {
    const b2Url = await uploadViaBackend(base64Data, storagePath, 'application/pdf');
    if (b2Url && (b2Url.startsWith('http://') || b2Url.startsWith('https://'))) {
      console.log(`📦 PDF Uploaded to Backblaze B2 Storage Bucket: ${b2Url}`);
      return b2Url;
    }
  } catch (err) {
    console.warn("Backblaze B2 PDF upload note, trying Firebase Storage fallback...", err);
  }

  // 2. Fallback: Firebase Native Cloud Storage Bucket Upload
  try {
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, pdfBlob, { contentType: 'application/pdf' });
    const downloadUrl = await getDownloadURL(snapshot.ref);
    console.log(`📦 PDF Uploaded to Firebase Storage Bucket: ${downloadUrl}`);
    return downloadUrl;
  } catch (err: any) {
    console.warn("Firebase Storage PDF upload note:", err);
    return base64Data; // Ultimate fallback: return base64 Data URL so PDF download/view never breaks
  }
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

interface PendingSave {
  collectionName: string;
  id: string;
  data: any;
  timestamp: number;
}

const PENDING_SAVES_KEY = 'ges_pending_firestore_saves';

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

    console.log(`[Firestore Sync Queue] Processing ${entries.length} pending writes...`);
    for (const [, item] of entries) {
      try {
        const cleanData = sanitizeForFirestore(item.data);
        const docRef = doc(firestoreDb, item.collectionName, item.id);
        await setDoc(docRef, cleanData, { merge: true });
        dequeuePendingSave(item.collectionName, item.id);
        console.log(`[Firestore Sync Queue] Flushed [${item.collectionName}/${item.id}] -> DB: [${TARGET_DATABASE_ID}]`);
      } catch (err) {
        // Will retry on next cycle
      }
    }
  } finally {
    isProcessingPendingSaves = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log("🌐 Network online detected! Flushing pending Firestore saves...");
    processPendingSaves();
    syncAllLocalDataToFirestore(true);
  });
  setInterval(() => {
    processPendingSaves();
  }, 15000);
}

/**
 * Saves or updates a document in Firebase Firestore (strictly targets green-energy-solution database)
 */
export async function saveRecordToFirestore(collectionName: string, id: string, data: any): Promise<void> {
  const cleanData = sanitizeForFirestore(data);
  try {
    const docRef = doc(firestoreDb, collectionName, id);
    await setDoc(docRef, cleanData, { merge: true });
    dequeuePendingSave(collectionName, id);
    console.log(`Firestore synced [${collectionName}/${id}] -> DB: [${TARGET_DATABASE_ID}]`);
    return;
  } catch (err) {
    console.warn(`Firestore direct save note [${collectionName}/${id}], trying backend:`, err);
    const saved = await saveRecordViaBackend(collectionName, id, cleanData);
    if (saved) {
      dequeuePendingSave(collectionName, id);
      console.log(`Firestore synced through backend [${collectionName}/${id}] -> DB: [${TARGET_DATABASE_ID}]`);
      return;
    }
    console.warn(`Firestore save queued for background retry [${collectionName}/${id}]`);
    enqueuePendingSave(collectionName, id, cleanData);
  }
}

/**
 * Fetches all documents in a collection from Firebase Firestore (strictly from green-energy-solution database)
 */
export async function fetchCollectionFromFirestore<T extends { id?: string; isDeleted?: boolean; leadId?: string }>(
  collectionName: string,
  timeoutMs: number = 15000
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
    if (BACKEND_URL) {
      deleteRecordViaBackend(collectionName, id).catch(() => {});
    }
  }
}

let lastSyncTimestamp = 0;
const SYNC_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes throttle

/**
 * Background sync function to push unsynced local Dexie records to Firestore Cloud Database.
 * Only uploads records that are genuinely new or newer locally to prevent exhausting write quotas.
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
      const remoteLeads = await fetchCollectionFromFirestore<any>('leads', 15000);
      const remoteLeadMap = new Map<string, any>((Array.isArray(remoteLeads) ? remoteLeads : []).map(r => [r.id, r]));
      const localLeads = await db.leads.toArray();

      for (const l of localLeads) {
        if (deletedIds.has(l.id)) {
          await db.leads.delete(l.id);
          continue;
        }
        const remoteLead = remoteLeadMap.get(l.id);
        if (!remoteLead) {
          const age = Date.now() - new Date(l.createdAt || 0).getTime();
          if (age > 3 * 60 * 1000) {
            await db.leads.delete(l.id);
          } else {
            await saveRecordToFirestore('leads', l.id, l);
          }
        } else if (l.updatedAt && remoteLead.updatedAt && new Date(l.updatedAt).getTime() > new Date(remoteLead.updatedAt).getTime()) {
          await saveRecordToFirestore('leads', l.id, l);
        }
      }

      if (Array.isArray(remoteLeads)) {
        for (const rl of remoteLeads) {
          if (rl && rl.id && !deletedIds.has(rl.id)) {
            const local = await db.leads.get(rl.id);
            if (local) {
              const rTime = new Date(rl.updatedAt || 0).getTime();
              const lTime = new Date(local.updatedAt || 0).getTime();
              if (rTime >= lTime) {
                const merged = { ...local, ...rl };
                if (!merged.clientSignatureBlob && local.clientSignatureBlob) merged.clientSignatureBlob = local.clientSignatureBlob;
                if (!merged.vehiclePhotoBlob && local.vehiclePhotoBlob) merged.vehiclePhotoBlob = local.vehiclePhotoBlob;
                if (!merged.bankDocumentBlob && local.bankDocumentBlob) merged.bankDocumentBlob = local.bankDocumentBlob;
                await db.leads.put(merged);
              }
            } else {
              await db.leads.put(rl);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Lead sync note:", err);
    }

    // 3. Reconcile & Sync Quotations
    try {
      const remoteQuotes = await fetchCollectionFromFirestore<any>('quotations', 15000);
      const remoteQuoteMap = new Map<string, any>((Array.isArray(remoteQuotes) ? remoteQuotes : []).map(r => [r.id, r]));
      const localQuotes = await db.quotations.toArray();

      for (const q of localQuotes) {
        if (deletedIds.has(q.id) || (q.leadId && deletedIds.has(q.leadId))) {
          await db.quotations.delete(q.id);
          continue;
        }
        const remoteQuote = remoteQuoteMap.get(q.id);
        if (!remoteQuote) {
          const age = Date.now() - new Date(q.createdAt || 0).getTime();
          if (age > 3 * 60 * 1000) {
            await db.quotations.delete(q.id);
          } else {
            await saveRecordToFirestore('quotations', q.id, q);
          }
        } else if (q.updatedAt && remoteQuote.updatedAt && new Date(q.updatedAt).getTime() > new Date(remoteQuote.updatedAt).getTime()) {
          await saveRecordToFirestore('quotations', q.id, q);
        }
      }

      if (Array.isArray(remoteQuotes)) {
        for (const rq of remoteQuotes) {
          if (rq && rq.id && !deletedIds.has(rq.id) && (!rq.leadId || !deletedIds.has(rq.leadId))) {
            const local = await db.quotations.get(rq.id);
            if (!local) {
              await db.quotations.put(rq);
            } else {
              const rTime = new Date(rq.updatedAt || 0).getTime();
              const lTime = new Date(local.updatedAt || 0).getTime();
              if (rTime >= lTime) {
                await db.quotations.put(rq);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Quotation sync note:", err);
    }

    // 4. Reconcile & Sync Order Confirmations (with Payments protection)
    try {
      const remoteOcs = await fetchCollectionFromFirestore<any>('orderConfirmations', 15000);
      const remoteOcMap = new Map<string, any>((Array.isArray(remoteOcs) ? remoteOcs : []).map(r => [r.id, r]));
      const localOcs = await db.orderConfirmations.toArray();

      for (const oc of localOcs) {
        if (deletedIds.has(oc.id) || (oc.leadId && deletedIds.has(oc.leadId))) {
          await db.orderConfirmations.delete(oc.id);
          continue;
        }
        const remoteOc = remoteOcMap.get(oc.id);
        if (!remoteOc) {
          const age = Date.now() - new Date(oc.createdAt || 0).getTime();
          if (age > 3 * 60 * 1000) {
            await db.orderConfirmations.delete(oc.id);
          } else {
            await saveRecordToFirestore('orderConfirmations', oc.id, oc);
          }
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

      if (Array.isArray(remoteOcs)) {
        for (const roc of remoteOcs) {
          if (roc && roc.id && !deletedIds.has(roc.id) && (!roc.leadId || !deletedIds.has(roc.leadId))) {
            const local = await db.orderConfirmations.get(roc.id);
            if (!local) {
              await db.orderConfirmations.put(roc);
            } else {
              const localPayments = local.payments || [];
              const remotePayments = roc.payments || [];
              const localPaid = localPayments.reduce((s: number, p: any) => s + (p?.amount || 0), 0) || local.advanceAmount || 0;
              const remotePaid = remotePayments.reduce((s: number, p: any) => s + (p?.amount || 0), 0) || roc.advanceAmount || 0;

              if (localPaid > remotePaid) {
                const merged = { ...roc, payments: localPayments, advanceAmount: local.advanceAmount || roc.advanceAmount };
                await db.orderConfirmations.put(merged);
              } else {
                await db.orderConfirmations.put(roc);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("OrderConfirmation sync note:", err);
    }

    // 5. Reconcile & Sync Delivery Challans
    try {
      const remoteChallans = await fetchCollectionFromFirestore<any>('challans', 15000);
      const remoteChallanMap = new Map<string, any>((Array.isArray(remoteChallans) ? remoteChallans : []).map(r => [r.id, r]));
      const localChallans = await db.challans.toArray();

      for (const ch of localChallans) {
        if (deletedIds.has(ch.id) || (ch.leadId && deletedIds.has(ch.leadId))) {
          await db.challans.delete(ch.id);
          continue;
        }
        if (!remoteChallanMap.has(ch.id)) {
          const age = Date.now() - new Date(ch.createdAt || 0).getTime();
          if (age > 3 * 60 * 1000) {
            await db.challans.delete(ch.id);
          } else {
            await saveRecordToFirestore('challans', ch.id, ch);
          }
        }
      }

      if (Array.isArray(remoteChallans)) {
        for (const rch of remoteChallans) {
          if (rch && rch.id && !deletedIds.has(rch.id) && (!rch.leadId || !deletedIds.has(rch.leadId))) {
            await db.challans.put(rch);
          }
        }
      }
    } catch (err) {
      console.warn("Challan sync note:", err);
    }

    // 6. Reconcile & Sync Client Registrations
    try {
      const remoteRegs = await fetchCollectionFromFirestore<any>('clientRegistrations', 15000);
      const remoteRegMap = new Map<string, any>((Array.isArray(remoteRegs) ? remoteRegs : []).map(r => [r.leadId, r]));
      const localRegs = await db.clientRegistrations.toArray();

      for (const reg of localRegs) {
        if (deletedIds.has(reg.leadId)) {
          await db.clientRegistrations.delete(reg.leadId);
          continue;
        }
        if (!remoteRegMap.has(reg.leadId)) {
          await saveRecordToFirestore('clientRegistrations', reg.leadId, reg);
        }
      }

      if (Array.isArray(remoteRegs)) {
        for (const rr of remoteRegs) {
          if (rr && rr.leadId && !deletedIds.has(rr.leadId)) {
            await db.clientRegistrations.put(rr);
          }
        }
      }
    } catch (err) {
      console.warn("Client registration sync note:", err);
    }

    // 7. Reconcile & Sync Client Documents
    try {
      const remoteClientDocs = await fetchCollectionFromFirestore<any>('clientDocuments', 15000);
      const remoteDocMap = new Map<string, any>((Array.isArray(remoteClientDocs) ? remoteClientDocs : []).map(r => [r.id, r]));
      const localClientDocs = await db.clientDocuments.toArray();

      for (const cd of localClientDocs) {
        if (deletedIds.has(cd.id) || (cd.leadId && deletedIds.has(cd.leadId))) {
          await db.clientDocuments.delete(cd.id);
          continue;
        }
        const remoteDoc = remoteDocMap.get(cd.id);
        if (!remoteDoc) {
          await saveRecordToFirestore('clientDocuments', cd.id, cd);
        }
      }

      if (Array.isArray(remoteClientDocs)) {
        for (const rd of remoteClientDocs) {
          if (rd && rd.id && !deletedIds.has(rd.id) && (!rd.leadId || !deletedIds.has(rd.leadId))) {
            const local = await db.clientDocuments.get(rd.id);
            if (local?.fileBlob && !rd.fileBlob) {
              await db.clientDocuments.put({ ...rd, fileBlob: local.fileBlob });
            } else {
              await db.clientDocuments.put(rd);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Client document sync note:", err);
    }

    // 8. Reconcile & Sync Complaints
    try {
      const remoteComplaints = await fetchCollectionFromFirestore<any>('complaints', 15000).catch(() => []);
      const remoteCompMap = new Map<string, any>((Array.isArray(remoteComplaints) ? remoteComplaints : []).map(r => [r.id, r]));
      const localComplaints = await db.complaints.toArray();

      for (const cmp of localComplaints) {
        if (deletedIds.has(cmp.id)) {
          await db.complaints.delete(cmp.id);
          continue;
        }
        if (!remoteCompMap.has(cmp.id)) {
          await saveRecordToFirestore('complaints', cmp.id, cmp);
        }
      }
    } catch (err) {
      console.warn("Complaint sync note:", err);
    }

    // 9. Reconcile & Sync Release Documents
    try {
      const remoteReleases = await fetchCollectionFromFirestore<any>('releaseDocuments', 15000).catch(() => []);
      const remoteRelMap = new Map<string, any>((Array.isArray(remoteReleases) ? remoteReleases : []).map(r => [r.id, r]));
      const localReleases = await db.releaseDocuments.toArray();

      for (const rel of localReleases) {
        if (deletedIds.has(rel.id) || (rel.leadId && deletedIds.has(rel.leadId))) {
          await db.releaseDocuments.delete(rel.id);
          continue;
        }
        if (!remoteRelMap.has(rel.id)) {
          await saveRecordToFirestore('releaseDocuments', rel.id, rel);
        }
      }

      if (Array.isArray(remoteReleases)) {
        for (const rd of remoteReleases) {
          if (rd && rd.id && !deletedIds.has(rd.id) && (!rd.leadId || !deletedIds.has(rd.leadId))) {
            const local = await db.releaseDocuments.get(rd.id);
            if (local?.fileBlob && !rd.fileBlob) {
              await db.releaseDocuments.put({ ...rd, fileBlob: local.fileBlob });
            } else {
              await db.releaseDocuments.put(rd);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Release document sync note:", err);
    }

    // 10. Reconcile & Sync Installation Photos
    try {
      const remotePhotos = await fetchCollectionFromFirestore<any>('installationPhotos', 15000).catch(() => []);
      const remotePhotoMap = new Map<string, any>((Array.isArray(remotePhotos) ? remotePhotos : []).map(r => [r.id, r]));
      const localPhotos = await db.installationPhotos.toArray();

      for (const p of localPhotos) {
        if (deletedIds.has(p.id) || (p.leadId && deletedIds.has(p.leadId))) {
          await db.installationPhotos.delete(p.id);
          continue;
        }
        if (!remotePhotoMap.has(p.id)) {
          await saveRecordToFirestore('installationPhotos', p.id, p);
        }
      }

      if (Array.isArray(remotePhotos)) {
        for (const rp of remotePhotos) {
          if (rp && rp.id && !deletedIds.has(rp.id) && (!rp.leadId || !deletedIds.has(rp.leadId))) {
            const local = await db.installationPhotos.get(rp.id);
            if (local?.photoBlob && !rp.photoBlob) {
              await db.installationPhotos.put({ ...rp, photoBlob: local.photoBlob });
            } else {
              await db.installationPhotos.put(rp);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Installation photo sync note:", err);
    }

    console.log("🔥 Smart reconciliation completed for all CRM collections!");
  } catch (err) {
    console.warn("syncAllLocalDataToFirestore note:", err);
  }
}

/**
 * Real-time Firestore sync subscriptions to sync changes across all devices & PWA apps in real-time.
 */
let isRealtimeSyncInitialized = false;

const realtimeChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('app_realtime_broadcast_channel') : null;

if (realtimeChannel) {
  realtimeChannel.onmessage = (event) => {
    if (event.data?.type === 'REALTIME_UPDATE') {
      window.dispatchEvent(new CustomEvent('app-realtime-update'));
    }
  };
}

export function initializeRealtimeFirestoreSync(): void {
  if (isRealtimeSyncInitialized) return;
  isRealtimeSyncInitialized = true;

  let dispatchTimer: any = null;
  const dispatchRealtimeUpdate = () => {
    if (dispatchTimer) clearTimeout(dispatchTimer);
    dispatchTimer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('app-realtime-update'));
      if (realtimeChannel) {
        try { realtimeChannel.postMessage({ type: 'REALTIME_UPDATE' }); } catch (e) {}
      }
    }, 800);
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
            } else if (collectionName === 'complaints') {
              await db.complaints.delete(id);
            } else if (collectionName === 'b2b_businesses' || collectionName === 'b2bBusinesses') {
              await db.b2bBusinesses.delete(id);
            } else if (collectionName === 'profiles') {
              await db.profiles.delete(id);
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
            const incomingData = { id: docId, ...change.doc.data() } as any;
            if (dexieTable) {
              const existing = await dexieTable.get(docId);
              if (existing) {
                // If colName is orderConfirmations, protect local payments
                if (colName === 'orderConfirmations') {
                  const existingPayments = existing.payments || [];
                  const incomingPayments = incomingData.payments || [];
                  const existingPaid = existingPayments.reduce((s: number, p: any) => s + (p?.amount || 0), 0) || existing.advanceAmount || 0;
                  const incomingPaid = incomingPayments.reduce((s: number, p: any) => s + (p?.amount || 0), 0) || incomingData.advanceAmount || 0;
                  if (existingPaid > incomingPaid) {
                    incomingData.payments = existingPayments;
                    incomingData.advanceAmount = existing.advanceAmount || incomingData.advanceAmount;
                  }
                }
                // If local has a later updatedAt, don't let older remote overwrite it
                if (existing.updatedAt && incomingData.updatedAt) {
                  const exTime = new Date(existing.updatedAt).getTime();
                  const inTime = new Date(incomingData.updatedAt).getTime();
                  if (exTime > inTime) {
                    continue;
                  }
                }
                const mergedData = { ...incomingData };
                if (!mergedData.photoBlob && existing.photoBlob) mergedData.photoBlob = existing.photoBlob;
                if (!mergedData.fileBlob && existing.fileBlob) mergedData.fileBlob = existing.fileBlob;
                if (!mergedData.clientSignatureBlob && existing.clientSignatureBlob) mergedData.clientSignatureBlob = existing.clientSignatureBlob;
                if (!mergedData.vehiclePhotoBlob && existing.vehiclePhotoBlob) mergedData.vehiclePhotoBlob = existing.vehiclePhotoBlob;
                if (!mergedData.bankDocumentBlob && existing.bankDocumentBlob) mergedData.bankDocumentBlob = existing.bankDocumentBlob;
                await dexieTable.put(mergedData);
              } else {
                await dexieTable.put(incomingData);
              }
            }
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
  setupCollectionListener('complaints', (db) => db.complaints);
  setupCollectionListener('b2b_businesses', (db) => db.b2bBusinesses);
  setupCollectionListener('b2bBusinesses', (db) => db.b2bBusinesses);
  setupCollectionListener('profiles', (db) => db.profiles);
  setupCollectionListener('clientDocuments', (db) => db.clientDocuments);
  setupCollectionListener('clientRegistrations', (db) => db.clientRegistrations);
  setupCollectionListener('installationPhotos', (db) => db.installationPhotos);
  setupCollectionListener('releaseDocuments', (db) => db.releaseDocuments);
  setupCollectionListener('shadowAnalyses', (db) => db.shadowAnalyses);
  setupCollectionListener('deletionRequests', (db) => db.deletionRequests);
  setupCollectionListener('stockTransactions', (db) => db.stockTransactions);
  setupCollectionListener('packages', (db) => db.packages);
  setupCollectionListener('complaintConfigCategories', (db) => db.complaintConfigCategories);
}

