import type { Quotation, Lead } from '../types';
import { pdfService } from './pdfService';

const CACHE_NAME = 'ges-quotation-pdf-v1';
const memoryPdfCache = new Map<string, Blob>();

/**
 * Clean key for cache indexing
 */
function getCleanKey(key: string): string {
  return key.replace(/[\/\s]/g, '_');
}

/**
 * Retrieve cached PDF Blob from Memory or CacheStorage (0ms to <10ms lookup)
 */
export async function getCachedPdfBlob(key: string): Promise<Blob | null> {
  if (!key) return null;
  const cleanKey = getCleanKey(key);

  // 1. Memory Cache Map (0ms)
  if (memoryPdfCache.has(cleanKey)) {
    return memoryPdfCache.get(cleanKey)!;
  }

  // 2. CacheStorage API (Persisted across refreshes, navigation, & restarts)
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cache = await caches.open(CACHE_NAME);
      const res = await cache.match(`/pdf-cache/${cleanKey}.pdf`);
      if (res) {
        const blob = await res.blob();
        memoryPdfCache.set(cleanKey, blob);
        return blob;
      }
    }
  } catch (err) {
    console.warn('CacheStorage read note:', err);
  }

  return null;
}

/**
 * Persist PDF Blob into Memory Map & CacheStorage API
 */
export async function setCachedPdfBlob(key: string, blob: Blob): Promise<void> {
  if (!key || !blob) return;
  const cleanKey = getCleanKey(key);

  memoryPdfCache.set(cleanKey, blob);

  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cache = await caches.open(CACHE_NAME);
      const res = new Response(blob, {
        headers: { 'Content-Type': 'application/pdf' }
      });
      await cache.put(`/pdf-cache/${cleanKey}.pdf`, res);
    }
  } catch (err) {
    console.warn('CacheStorage write note:', err);
  }
}

/**
 * Ensure PDF Blob is immediately available.
 * Checks Memory/CacheStorage -> Cloud URL -> pdfBlob field -> Generates on demand.
 */
export async function ensurePdfBlobForQuotation(
  quotation: Quotation,
  lead?: Lead | null,
  creatorName: string = 'Nitin Thakre',
  onProgress?: (current: number, total: number) => void
): Promise<Blob> {
  if (!quotation) return new Blob([], { type: 'application/pdf' });
  const propNo = quotation.quotationNumber || quotation.proposalId || quotation.id || 'EST';

  // 1. Try cache
  const cached = await getCachedPdfBlob(propNo);
  if (cached) return cached;
  if (quotation.id) {
    const cachedById = await getCachedPdfBlob(quotation.id);
    if (cachedById) return cachedById;
  }

  // 2. Try in-memory pdfBlob property
  if (quotation.pdfBlob && quotation.pdfBlob.size > 0) {
    await setCachedPdfBlob(propNo, quotation.pdfBlob);
    return quotation.pdfBlob;
  }

  // 3. Try fetching from Cloud URL (if pdfUrl exists)
  if (quotation.pdfUrl && typeof quotation.pdfUrl === 'string' && quotation.pdfUrl.startsWith('http')) {
    try {
      const res = await fetch(quotation.pdfUrl);
      if (res.ok) {
        const blob = await res.blob();
        await setCachedPdfBlob(propNo, blob);
        if (quotation.id) await setCachedPdfBlob(quotation.id, blob);
        return blob;
      }
    } catch (e) {
      console.warn('Cloud PDF fetch note:', e);
    }
  }

  // 4. Generate on-the-fly & cache
  const mockLead: Lead = lead || {
    id: quotation.leadId || '',
    name: quotation.consumerName || 'Valued Customer',
    phoneNumber: quotation.consumerMobile || '',
    email: quotation.consumerEmail || '',
    requirement: `${quotation.systemCapacity || 'Solar Rooftop'} System`,
    description: quotation.city || '',
    createdBy: creatorName,
    status: 'quotation_sent',
    createdAt: quotation.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const generatedBlob = await pdfService.generateQuotationPDF(quotation, mockLead, creatorName, onProgress);
  if (generatedBlob) {
    await setCachedPdfBlob(propNo, generatedBlob);
    if (quotation.id) await setCachedPdfBlob(quotation.id, generatedBlob);
  }
  return generatedBlob;
}
