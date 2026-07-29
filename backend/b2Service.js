import dotenv from 'dotenv';
dotenv.config();

const B2_KEY_ID = process.env.B2_KEY_ID || '005ff217b03db580000000001';
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || 'K005gOTKgViCFANig1DqeD7fLVoNU80';
const B2_BUCKET_ID = process.env.B2_BUCKET_ID || '7fffc2f1470ba0d39dfb0518';
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || 'Green-Energy-Solution';

let cachedAuth = null;
let lastAuthTime = 0;

/**
 * Authorize account with Backblaze B2 API
 */
export async function getB2Auth() {
  const now = Date.now();
  if (cachedAuth && (now - lastAuthTime < 12 * 3600 * 1000)) {
    return cachedAuth;
  }
  const credentials = Buffer.from(`${B2_KEY_ID}:${B2_APPLICATION_KEY}`).toString('base64');
  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` }
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`B2 authorize account failed (${res.status}): ${errText}`);
  }
  const data = await res.json();
  cachedAuth = data;
  lastAuthTime = now;
  return data;
}

/**
 * Uploads a Buffer file to Backblaze B2 storage bucket and returns long-lived access URL
 */
export async function uploadToB2(buffer, storagePath, contentType = 'application/octet-stream') {
  const auth = await getB2Auth();

  // 1. Get Upload URL
  const uploadUrlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken },
    body: JSON.stringify({ bucketId: B2_BUCKET_ID })
  });

  if (!uploadUrlRes.ok) {
    const errText = await uploadUrlRes.text().catch(() => '');
    throw new Error(`B2 get upload url failed (${uploadUrlRes.status}): ${errText}`);
  }

  const uploadInfo = await uploadUrlRes.json();
  const cleanPath = storagePath.replace(/^\/+/, '');

  // 2. Upload file content
  const uploadFileRes = await fetch(uploadInfo.uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: uploadInfo.authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(cleanPath),
      'Content-Type': contentType || 'application/octet-stream',
      'X-Bz-Content-Sha1': 'do_not_verify'
    },
    body: buffer
  });

  if (!uploadFileRes.ok) {
    const errText = await uploadFileRes.text().catch(() => '');
    throw new Error(`B2 file upload failed (${uploadFileRes.status}): ${errText}`);
  }

  // 3. Obtain 7-day download authorization token for direct URL access
  const dnldAuthRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken },
    body: JSON.stringify({
      bucketId: B2_BUCKET_ID,
      fileNamePrefix: cleanPath,
      validDurationInSeconds: 604800 // 7 days (604800s)
    })
  });

  let directUrl = `${auth.downloadUrl}/file/${B2_BUCKET_NAME}/${cleanPath}`;
  if (dnldAuthRes.ok) {
    const dnldData = await dnldAuthRes.json();
    if (dnldData.authorizationToken) {
      directUrl += `?Authorization=${encodeURIComponent(dnldData.authorizationToken)}`;
    }
  }

  return directUrl;
}

/**
 * Fetches/Streams file from Backblaze B2 for Backend proxy serving
 */
export async function getFileStreamFromB2(storagePath) {
  const auth = await getB2Auth();
  const cleanPath = storagePath.replace(/^\/+/, '');

  const dnldAuthRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
    method: 'POST',
    headers: { Authorization: auth.authorizationToken },
    body: JSON.stringify({
      bucketId: B2_BUCKET_ID,
      fileNamePrefix: cleanPath,
      validDurationInSeconds: 3600
    })
  });

  if (!dnldAuthRes.ok) {
    throw new Error(`Failed to get download authorization for B2 path ${cleanPath}`);
  }

  const dnldData = await dnldAuthRes.json();
  const fileUrl = `${auth.downloadUrl}/file/${B2_BUCKET_NAME}/${cleanPath}?Authorization=${encodeURIComponent(dnldData.authorizationToken)}`;

  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error(`Failed to fetch file from B2: ${fileRes.status}`);
  }

  const contentType = fileRes.headers.get('content-type') || (cleanPath.endsWith('.pdf') ? 'application/pdf' : 'image/webp');
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  return {
    contentType,
    buffer
  };
}
