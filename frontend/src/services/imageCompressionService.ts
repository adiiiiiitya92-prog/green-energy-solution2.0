import imageCompression from 'browser-image-compression';

export interface ImageCompressionConfig {
  maxSizeKB?: number;      // Target size in KB (default 60 KB)
  maxWidthOrHeight?: number; // Max resolution dimension (default 1280px)
  isDocument?: boolean;     // If true, uses higher quality (1600px, 80KB) for document text readability
  useWebP?: boolean;       // Convert to WebP format if supported
}

/**
 * Aggressively compresses an image File or Blob down to ultra-low KB sizes (30KB - 80KB)
 * for 1-year Firebase Storage free-tier sustainability.
 */
export async function compressImage(
  fileOrBlob: File | Blob,
  config: ImageCompressionConfig = {}
): Promise<File> {
  const isDoc = config.isDocument || false;
  const targetSizeKB = config.maxSizeKB || (isDoc ? 75 : 50);
  const targetDimension = config.maxWidthOrHeight || (isDoc ? 1400 : 1200);
  const quality = isDoc ? 0.65 : 0.52;

  // Convert Blob to File if needed
  let inputfile: File;
  if (fileOrBlob instanceof File) {
    inputfile = fileOrBlob;
  } else {
    inputfile = new File([fileOrBlob], `upload_${Date.now()}.webp`, { type: fileOrBlob.type || 'image/webp' });
  }

  // If already a tiny WebP (< 50 KB), keep as is
  if (inputfile.size <= 50 * 1024 && (inputfile.type === 'image/webp' || inputfile.name.endsWith('.webp'))) {
    return inputfile;
  }

  try {
    const options = {
      maxSizeMB: targetSizeKB / 1024, // Convert KB to MB
      maxWidthOrHeight: targetDimension,
      useWebWorker: false, // Fast main thread single pass
      fileType: 'image/webp',
      initialQuality: quality
    };

    const compressedBlob = await imageCompression(inputfile, options);

    const fileName = inputfile.name.replace(/\.[^/.]+$/, "") + '.webp';
    const compressedFile = new File([compressedBlob], fileName, {
      type: 'image/webp',
      lastModified: Date.now()
    });

    console.log(
      `⚡ Fast WebP Compressed: ${(inputfile.size / 1024).toFixed(1)} KB ➔ ${(compressedFile.size / 1024).toFixed(1)} KB`
    );

    return compressedFile;
  } catch (error) {
    console.warn("Fast compression fallback triggered:", error);
    return await compressImageCanvasFallback(inputfile, targetDimension, quality);
  }
}

/**
 * Converts a Base64 data URL to an aggressively compressed File object.
 */
export async function compressDataUrl(
  dataUrl: string,
  fileName: string = `image_${Date.now()}.webp`,
  config: ImageCompressionConfig = {}
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], fileName, { type: blob.type || 'image/webp' });
  return compressImage(file, config);
}

/**
 * Canvas-based fallback compression engine (produces crisp WebP)
 */
async function compressImageCanvasFallback(
  file: File,
  maxDimension: number,
  quality: number
): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".webp"), {
                type: 'image/webp',
                lastModified: Date.now()
              });
              resolve(compFile);
            } else {
              resolve(file);
            }
          },
          'image/webp',
          quality
        );
      } else {
        resolve(file);
      }
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}
