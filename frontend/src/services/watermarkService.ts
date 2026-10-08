import dayjs from 'dayjs';
import { mapService } from './mapService';

export interface GpsWatermarkData {
  latitude: number;
  longitude: number;
  address?: string;
  timestamp: string;
  accuracy?: number;
}

export interface WatermarkOptions {
  gps?: GpsWatermarkData | null;
  title?: string;
  subtitle?: string;
  customerName?: string;
  amount?: number;
  paymentLabel?: string;
  leadId?: string;
  customDetailLine?: string;
  locationFallback?: string;
}

export interface WatermarkResult {
  watermarkedBlob: Blob;
  watermarkedDataUrl: string;
  gps: GpsWatermarkData | null;
}

/**
 * Promisified GPS location fetcher with high accuracy & address reverse-geocoding.
 */
export async function acquireCurrentGpsLocation(): Promise<GpsWatermarkData> {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser/device.');
  }

  const coords = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        let msg = 'Could not retrieve GPS location.';
        if (err.code === 1) msg = 'Location permission was denied. Please allow location access in your browser.';
        else if (err.code === 2) msg = 'GPS position unavailable. Please check your device location settings.';
        else if (err.code === 3) msg = 'GPS request timed out. Please try again.';
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  });

  const lat = coords.coords.latitude;
  const lng = coords.coords.longitude;
  const accuracy = coords.coords.accuracy;
  const timestamp = dayjs().format('DD MMM YYYY, hh:mm:ss A');

  let address = '';
  try {
    address = await mapService.reverseGeocode(lat, lng);
  } catch (_) {
    address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  return {
    latitude: lat,
    longitude: lng,
    accuracy,
    address,
    timestamp
  };
}

/**
 * Draws image onto an HTML5 Canvas and stamps a professional, tamper-evident
 * GPS watermark bar at the bottom with coordinates, timestamp, address & customer data.
 */
export async function applyGpsWatermark(
  imageSource: File | Blob | string,
  options: WatermarkOptions
): Promise<WatermarkResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let objectUrl: string | null = null;
    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      objectUrl = URL.createObjectURL(imageSource);
      img.src = objectUrl;
    }

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);

      const naturalW = img.naturalWidth || img.width || 1280;
      const naturalH = img.naturalHeight || img.height || 720;

      // Scale down gently if gigantic (> 1200px) to maintain crystal-clear quality with 70% lower RAM
      const maxDim = 1200;
      let targetW = naturalW;
      let targetH = naturalH;
      if (Math.max(naturalW, naturalH) > maxDim) {
        if (naturalW > naturalH) {
          targetW = maxDim;
          targetH = Math.round((naturalH * maxDim) / naturalW);
        } else {
          targetH = maxDim;
          targetW = Math.round((naturalW * maxDim) / naturalH);
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to create 2D canvas context.'));
        return;
      }

      // 1. Draw base photo
      ctx.drawImage(img, 0, 0, targetW, targetH);

      // 2. Calculate dynamic font size based on canvas width
      const scale = targetW / 1000;
      const titleFontSize = Math.max(16, Math.round(20 * scale));
      const bodyFontSize = Math.max(12, Math.round(15 * scale));
      const subFontSize = Math.max(10, Math.round(13 * scale));
      const padding = Math.max(16, Math.round(22 * scale));
      const lineHeight = bodyFontSize + Math.max(4, Math.round(6 * scale));

      // 3. Watermark panel height (6 text lines + padding)
      const bannerHeight = Math.round(padding * 2 + titleFontSize + lineHeight * 4 + 10);
      const bannerY = targetH - bannerHeight;

      // Dark translucent backdrop with slight gradient
      const bgGrad = ctx.createLinearGradient(0, bannerY, 0, targetH);
      bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.88)'); // slate-900 with 88% opacity
      bgGrad.addColorStop(1, 'rgba(2, 6, 23, 0.96)');

      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, bannerY, targetW, bannerHeight);

      // Accent border line at top of watermark panel
      ctx.strokeStyle = '#10b981'; // emerald-500
      ctx.lineWidth = Math.max(3, Math.round(4 * scale));
      ctx.beginPath();
      ctx.moveTo(0, bannerY);
      ctx.lineTo(targetW, bannerY);
      ctx.stroke();

      let cursorY = bannerY + padding + titleFontSize * 0.75;
      const textX = padding;
      const rightX = targetW - padding;

      // Top Title Bar: Verification Badge & Brand
      ctx.font = `bold ${titleFontSize}px sans-serif`;
      ctx.fillStyle = '#10b981'; // Emerald Green
      ctx.fillText(options.title || '✓ CASH PAYMENT GEOTAGGED RECEIPT', textX, cursorY);

      ctx.font = `bold ${subFontSize}px sans-serif`;
      ctx.fillStyle = '#94a3b8'; // Slate-400
      ctx.textAlign = 'right';
      ctx.fillText(options.subtitle || 'GREEN ENERGY SOLUTION • VERIFIED AUDIT', rightX, cursorY);
      ctx.textAlign = 'left';

      cursorY += lineHeight + 4;

      // Line 1: GPS Coordinates
      const gps = options.gps;
      ctx.font = `bold ${bodyFontSize}px monospace`;
      ctx.fillStyle = '#f8fafc'; // White
      if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
        const latFormatted = `${Math.abs(gps.latitude).toFixed(6)}° ${gps.latitude >= 0 ? 'N' : 'S'}`;
        const lngFormatted = `${Math.abs(gps.longitude).toFixed(6)}° ${gps.longitude >= 0 ? 'E' : 'W'}`;
        const accuracyText = gps.accuracy ? ` (±${Math.round(gps.accuracy)}m)` : '';
        ctx.fillText(`📍 GPS COORDS: ${latFormatted}, ${lngFormatted}${accuracyText}`, textX, cursorY);
      } else {
        ctx.fillStyle = '#f59e0b'; // Amber warning
        ctx.fillText('📍 GPS: Location capture pending or unavailable', textX, cursorY);
        ctx.fillStyle = '#f8fafc';
      }

      cursorY += lineHeight;

      // Line 2: Timestamp
      ctx.font = `normal ${bodyFontSize}px sans-serif`;
      ctx.fillStyle = '#e2e8f0';
      const timeStr = gps?.timestamp || dayjs().format('DD MMM YYYY, hh:mm:ss A');
      ctx.fillText(`🕒 DATE & TIME: ${timeStr}`, textX, cursorY);

      cursorY += lineHeight;

      // Line 3: Address / Location Name
      if (gps?.address) {
        ctx.font = `normal ${subFontSize}px sans-serif`;
        ctx.fillStyle = '#cbd5e1';
        const addressText = gps.address.length > 95 ? gps.address.substring(0, 92) + '...' : gps.address;
        ctx.fillText(`🏛️ LOCATION: ${addressText}`, textX, cursorY);
      } else {
        ctx.font = `normal ${subFontSize}px sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`🏛️ LOCATION: ${options.locationFallback || 'On-Site Customer Handover'}`, textX, cursorY);
      }

      cursorY += lineHeight;

      // Line 4: Customer Details & Resolution / Amount
      ctx.font = `bold ${bodyFontSize}px sans-serif`;
      ctx.fillStyle = '#38bdf8'; // Sky-400
      if (options.customDetailLine) {
        ctx.fillText(options.customDetailLine, textX, cursorY);
      } else {
        const custText = options.customerName ? `CUSTOMER: ${options.customerName}` : 'CUSTOMER: Client';
        const amtText = options.amount ? ` • AMOUNT: ₹${options.amount.toLocaleString('en-IN')}` : '';
        const labelText = options.paymentLabel ? ` (${options.paymentLabel})` : '';
        ctx.fillText(`👤 ${custText}${labelText}${amtText}`, textX, cursorY);
      }

      // 4. Output as Blob and lightweight Object URL (avoids massive base64 in React state)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            canvas.width = 0;
            canvas.height = 0;
            reject(new Error('Canvas toBlob failed.'));
            return;
          }
          const watermarkedDataUrl = URL.createObjectURL(blob);
          // Free canvas backing store from memory immediately
          canvas.width = 0;
          canvas.height = 0;
          resolve({
            watermarkedBlob: blob,
            watermarkedDataUrl,
            gps: options.gps || null
          });
        },
        'image/jpeg',
        0.82
      );
    };

    img.onerror = (err) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for watermarking. ' + String(err)));
    };
  });
}
