import type { Quotation, Lead } from '../types';
import { quotationService, getCleanWhatsAppPhone } from './quotationService';
import { ensurePdfBlobForQuotation } from './pdfCacheService';
import { getFreshB2SignedUrl } from './firebase';

export interface ShareQuotationParams {
  quotation: Quotation;
  pdfBlob?: Blob;
  lead?: Lead | null;
}

/**
 * Ultra-fast WhatsApp PDF share for mobile.
 * 
 * Critical speed optimizations:
 * 1. No blocking network calls before share — Backblaze URL refresh happens in background
 * 2. navigator.share() fires FIRST within user gesture window (mandatory for Android/iOS)
 * 3. Local download triggers in parallel — does NOT block share sheet
 * 4. If pdfBlob is already provided (pre-cached), zero generation time
 */
export async function shareQuotationViaWhatsapp(params: ShareQuotationParams): Promise<{ success: boolean; method: 'native' | 'fallback' }> {
  const { quotation, lead } = params;
  let pdfBlob = params.pdfBlob;

  const propNo = quotation.quotationNumber || quotation.proposalId || 'EST-001';
  const sanitizedPropNo = (propNo || quotation.id).replace(/\//g, '_');
  const pdfFileName = `Solar_Quotation_${sanitizedPropNo}.pdf`;

  const rawMobile = quotation.consumerMobile || lead?.phoneNumber;
  const cleanPhone = getCleanWhatsAppPhone(rawMobile);
  const consumerName = quotation.consumerName || lead?.name || 'Valued Customer';

  // Build share text immediately (no async blocking)
  let shareText = `Dear ${consumerName}, Greetings from Green Energy Solutions! ☀️\n\nPlease find attached our official Solar Rooftop Proposal (${propNo}) for your reference.`;

  // Append cloud PDF link only if already available (no blocking fetch)
  if (quotation.pdfUrl && typeof quotation.pdfUrl === 'string' && quotation.pdfUrl.startsWith('http')) {
    shareText += `\n📄 Download Proposal PDF: ${quotation.pdfUrl}`;
  }

  // Ensure PDF blob — should already be cached from background pre-generation
  if (!pdfBlob) {
    pdfBlob = await ensurePdfBlobForQuotation(
      quotation,
      lead,
      quotation.preparedBy || quotation.createdBy || 'Admin'
    );
  }

  if (!pdfBlob) {
    alert('PDF generate nahi ho paya. Please try again.');
    return { success: false, method: 'native' };
  }

  const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });

  // === MOBILE: Native Web Share API ===
  // CRITICAL: navigator.share() MUST fire within the synchronous user gesture callstack.
  // Any async work before this (like Backblaze URL fetch) kills the gesture context on Android.
  if (typeof navigator !== 'undefined' && (navigator as any).canShare && (navigator as any).canShare({ files: [pdfFile] })) {
    try {
      await (navigator as any).share({
        files: [pdfFile],
        title: `Solar Proposal - ${sanitizedPropNo}`,
        text: shareText
      });

      // Fire-and-forget: mark as sent + refresh B2 URL in background
      if (quotation.id && quotation.id !== 'temp') {
        quotationService.markQuotationAsSent(quotation.id).catch(() => {});
      }
      // Refresh Backblaze signed URL in background (for next time)
      if (quotation.pdfUrl && quotation.pdfUrl.includes('backblaze')) {
        getFreshB2SignedUrl(quotation.pdfUrl).catch(() => {});
      }
      return { success: true, method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { success: false, method: 'native' };
      console.warn('Native share fallback note:', err);
      // Fall through to desktop fallback below
    }
  }

  // === DESKTOP FALLBACK: Download + WhatsApp Web ===
  // 1. Trigger local file download
  try {
    const blobUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = pdfFileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 5000);
  } catch (_) {}

  // 2. Open WhatsApp Web with pre-filled message
  const whatsappUrl = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(shareText)}`
    : `https://web.whatsapp.com/`;

  window.open(whatsappUrl, '_blank');

  if (quotation.id && quotation.id !== 'temp') {
    quotationService.markQuotationAsSent(quotation.id).catch(() => {});
  }
  return { success: true, method: 'fallback' };
}
