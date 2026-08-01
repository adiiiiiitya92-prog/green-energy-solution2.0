import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

function b2DevServerPlugin() {
  return {
    name: 'b2-dev-server-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith('/api/upload') && req.method === 'POST') {
          let bodyData = '';
          req.on('data', (chunk: any) => { bodyData += chunk; });
          req.on('end', async () => {
            try {
              const { imageBase64, storagePath, contentType } = JSON.parse(bodyData || '{}');
              if (!imageBase64 || !storagePath) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: 'Missing imageBase64 or storagePath' }));
              }

              const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
              const buffer = Buffer.from(cleanBase64, 'base64');
              const cleanPath = storagePath.replace(/^\/+/, '');

              const keyId = process.env.VITE_B2_KEY_ID || '005ff217b03db580000000001';
              const appKey = process.env.VITE_B2_APPLICATION_KEY || 'K005gOTKgViCFANig1DqeD7fLVoNU80';
              const bucketId = process.env.VITE_B2_BUCKET_ID || '7fffc2f1470ba0d39dfb0518';
              const bucketName = process.env.VITE_B2_BUCKET_NAME || 'Green-Energy-Solution';

              const credentials = Buffer.from(`${keyId}:${appKey}`).toString('base64');
              const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
                headers: { Authorization: `Basic ${credentials}` }
              });
              if (!authRes.ok) {
                const errTxt = await authRes.text().catch(() => '');
                throw new Error(`B2 authorize failed (${authRes.status}): ${errTxt}`);
              }
              const auth: any = await authRes.json();

              const uploadUrlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
                method: 'POST',
                headers: { Authorization: auth.authorizationToken },
                body: JSON.stringify({ bucketId })
              });
              if (!uploadUrlRes.ok) throw new Error('B2 get upload url failed');
              const uploadInfo: any = await uploadUrlRes.json();

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
              if (!uploadRes.ok) throw new Error('B2 file upload failed');

              const dnldAuthRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_download_authorization`, {
                method: 'POST',
                headers: { Authorization: auth.authorizationToken },
                body: JSON.stringify({
                  bucketId,
                  fileNamePrefix: cleanPath,
                  validDurationInSeconds: 604800
                })
              });

              let url = `${auth.downloadUrl}/file/${bucketName}/${cleanPath}`;
              if (dnldAuthRes.ok) {
                const dnldData: any = await dnldAuthRes.json();
                if (dnldData.authorizationToken) {
                  url += `?Authorization=${encodeURIComponent(dnldData.authorizationToken)}`;
                }
              }

              console.log(`📦 Dev Server Uploaded to Backblaze B2 [Green-Energy-Solution]: ${url}`);
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, url, storagePath: cleanPath }));
            } catch (err: any) {
              console.error('Dev B2 Upload Error:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message || 'Backblaze B2 Upload Failed' }));
            }
          });
          return;
        }

        if (req.url && req.url.startsWith('/api/b2-upload-url')) {
          try {
            const keyId = process.env.VITE_B2_KEY_ID || '005ff217b03db580000000001';
            const appKey = process.env.VITE_B2_APPLICATION_KEY || 'K005gOTKgViCFANig1DqeD7fLVoNU80';
            const bucketId = process.env.VITE_B2_BUCKET_ID || '7fffc2f1470ba0d39dfb0518';
            const bucketName = process.env.VITE_B2_BUCKET_NAME || 'Green-Energy-Solution';

            const credentials = Buffer.from(`${keyId}:${appKey}`).toString('base64');
            const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
              headers: { Authorization: `Basic ${credentials}` }
            });
            if (!authRes.ok) throw new Error('B2 authorize failed');
            const auth: any = await authRes.json();

            const uploadUrlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
              method: 'POST',
              headers: { Authorization: auth.authorizationToken },
              body: JSON.stringify({ bucketId })
            });
            if (!uploadUrlRes.ok) throw new Error('B2 get upload url failed');
            const uploadInfo: any = await uploadUrlRes.json();

            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({
              uploadUrl: uploadInfo.uploadUrl,
              authorizationToken: uploadInfo.authorizationToken,
              downloadUrl: auth.downloadUrl,
              bucketName
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message || 'Failed to get upload URL' }));
          }
          return;
        }

        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res && typeof (res as any).writeHead === 'function' && !(res as any).headersSent) {
              try {
                (res as any).writeHead(200, { 'Content-Type': 'application/json' });
                (res as any).end(JSON.stringify({ success: true, offlineFallback: true }));
              } catch (_) {}
            }
          });
        }
      }
    }
  },
  plugins: [
    b2DevServerPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      selfDestroying: true,
      devOptions: {
        enabled: false
      },
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'favicon.png',
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-512x512-maskable.png',
        'robots.txt'
      ],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: [],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      },
      manifest: {
        name: 'Green Energy Solution - Solar CRM',
        short_name: 'Green Energy',
        description: 'Offline-first Solar Installation Pipeline & CRM for Green Energy Solution',
        theme_color: '#15803d',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  build: {
    target: 'esnext',
    sourcemap: false,
    cssMinify: false,
    minify: false,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
            if (id.includes('leaflet')) return 'vendor-maps';
            if (id.includes('react')) return 'vendor-react';
            return 'vendor-libs';
          }
        }
      }
    }
  }
})
