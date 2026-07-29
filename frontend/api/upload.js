const B2_KEY_ID = process.env.VITE_B2_KEY_ID || process.env.B2_KEY_ID || '005ff217b03db580000000001';
const B2_APPLICATION_KEY = process.env.VITE_B2_APPLICATION_KEY || process.env.B2_APPLICATION_KEY || 'K005gOTKgViCFANig1DqeD7fLVoNU80';
const B2_BUCKET_ID = process.env.VITE_B2_BUCKET_ID || process.env.B2_BUCKET_ID || '7fffc2f1470ba0d39dfb0518';
const B2_BUCKET_NAME = process.env.VITE_B2_BUCKET_NAME || process.env.B2_BUCKET_NAME || 'Green-Energy-Solution';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { imageBase64, storagePath, contentType } = body;

    if (!imageBase64 || !storagePath) {
      return res.status(400).json({ error: 'imageBase64 and storagePath are required.' });
    }

    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    const cleanPath = storagePath.replace(/^\/+/, '');

    // 1. Authorize B2 Account
    const credentials = Buffer.from(`${B2_KEY_ID}:${B2_APPLICATION_KEY}`).toString('base64');
    const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      headers: { Authorization: `Basic ${credentials}` }
    });

    if (!authRes.ok) {
      const errText = await authRes.text().catch(() => '');
      throw new Error(`B2 authorize failed (${authRes.status}): ${errText}`);
    }
    const auth = await authRes.json();

    // 2. Get Upload URL
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

    // 3. Upload File Buffer
    const uploadRes = await fetch(uploadInfo.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadInfo.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(cleanPath),
        'Content-Type': contentType || 'application/octet-stream',
        'X-Bz-Content-Sha1': 'do_not_verify'
      },
      body: buffer
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      throw new Error(`B2 file upload failed (${uploadRes.status}): ${errText}`);
    }

    // 4. Download Auth Token (7 days)
    const dnldAuthRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken },
      body: JSON.stringify({
        bucketId: B2_BUCKET_ID,
        fileNamePrefix: cleanPath,
        validDurationInSeconds: 604800
      })
    });

    let url = `${auth.downloadUrl}/file/${B2_BUCKET_NAME}/${cleanPath}`;
    if (dnldAuthRes.ok) {
      const dnldData = await dnldAuthRes.json();
      if (dnldData.authorizationToken) {
        url += `?Authorization=${encodeURIComponent(dnldData.authorizationToken)}`;
      }
    }

    return res.status(200).json({ success: true, url, storagePath: cleanPath });
  } catch (err) {
    console.error('Vercel B2 Upload Function error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
