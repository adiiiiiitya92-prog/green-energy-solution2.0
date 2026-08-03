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
 * Ultra-fast WhatsApp PDF share.
 * Shares the PDF file directly via native Web Share API on mobile without requiring prior download.
 * Uses persistent PDF Blob Cache to instantly retrieve cached PDF blob in 0ms.
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

  let pdfUrlToUse = quotation.pdfUrl;
  if (pdfUrlToUse && pdfUrlToUse.includes('backblaze')) {
    try {
      pdfUrlToUse = await getFreshB2SignedUrl(pdfUrlToUse);
    } catch (_) {}
  }

  let shareText = `Dear ${consumerName}, Greetings from Green Energy Solutions! ☀️\n\nPlease find attached our official Solar Rooftop Proposal (${propNo}) for your reference.`;
  if (pdfUrlToUse && typeof pdfUrlToUse === 'string' && pdfUrlToUse.startsWith('http')) {
    shareText += `\n📄 Download Proposal PDF: ${pdfUrlToUse}`;
  }

  // Retrieve or ensure PDF blob is cached for instant speed
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

  // Native Web Share API (Mobile Android / iOS):
  // Must be executed synchronously within user gesture callstack for zero-lag share sheet popup
  if (typeof navigator !== 'undefined' && (navigator as any).canShare && (navigator as any).canShare({ files: [pdfFile] })) {
    try {
      // Direct local file download in parallel
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
        }, 3000);
      } catch (_) {}

      await (navigator as any).share({
        files: [pdfFile],
        title: `Solar Proposal - ${sanitizedPropNo}`,
        text: shareText
      });
      if (quotation.id && quotation.id !== 'temp') {
        quotationService.markQuotationAsSent(quotation.id).catch(() => {});
      }
      return { success: true, method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { success: false, method: 'native' };
      console.warn('Native share fallback note:', err);
    }
  }

  // Desktop / Web Fallback:
  // Opens WhatsApp Web chat directly with phone number & text pre-filled
  const whatsappUrl = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(shareText)}`
    : `https://web.whatsapp.com/`;

  // Only download local file as backup if cloud link is not available
  if (!quotation.pdfUrl) {
    const blobUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = pdfFileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  }

  window.open(whatsappUrl, '_blank');

  if (quotation.id && quotation.id !== 'temp') {
    quotationService.markQuotationAsSent(quotation.id).catch(() => {});
  }
  return { success: true, method: 'fallback' };
}
