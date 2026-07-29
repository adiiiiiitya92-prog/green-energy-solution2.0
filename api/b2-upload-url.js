const B2_KEY_ID = process.env.VITE_B2_KEY_ID || process.env.B2_KEY_ID || '005ff217b03db580000000001';
const B2_APPLICATION_KEY = process.env.VITE_B2_APPLICATION_KEY || process.env.B2_APPLICATION_KEY || 'K005gOTKgViCFANig1DqeD7fLVoNU80';
const B2_BUCKET_ID = process.env.VITE_B2_BUCKET_ID || process.env.B2_BUCKET_ID || '7fffc2f1470ba0d39dfb0518';
const B2_BUCKET_NAME = process.env.VITE_B2_BUCKET_NAME || process.env.B2_BUCKET_NAME || 'Green-Energy-Solution';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const credentials = Buffer.from(`${B2_KEY_ID}:${B2_APPLICATION_KEY}`).toString('base64');
    const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      headers: { Authorization: `Basic ${credentials}` }
    });
    if (!authRes.ok) {
      throw new Error(`B2 authorize failed (${authRes.status})`);
    }
    const auth = await authRes.json();

    const uploadUrlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken },
      body: JSON.stringify({ bucketId: B2_BUCKET_ID })
    });
    if (!uploadUrlRes.ok) {
      throw new Error(`B2 get upload url failed (${uploadUrlRes.status})`);
    }
    const uploadInfo = await uploadUrlRes.json();

    const dnldAuthRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
      method: 'POST',
      headers: { Authorization: auth.authorizationToken },
      body: JSON.stringify({
        bucketId: B2_BUCKET_ID,
        fileNamePrefix: '',
        validDurationInSeconds: 604800
      })
    });

    let downloadAuthToken = '';
    if (dnldAuthRes.ok) {
      const dnldData = await dnldAuthRes.json();
      downloadAuthToken = dnldData.authorizationToken || '';
    }

    return res.status(200).json({
      uploadUrl: uploadInfo.uploadUrl,
      authorizationToken: uploadInfo.authorizationToken,
      downloadUrl: auth.downloadUrl,
      bucketName: B2_BUCKET_NAME,
      downloadAuthToken
    });
  } catch (err) {
    console.error('Vercel B2 Upload URL Function error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
