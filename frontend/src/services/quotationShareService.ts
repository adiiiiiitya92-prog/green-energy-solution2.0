import type { Quotation, Lead } from '../types';
import { quotationService } from './quotationService';
import { pdfService } from './pdfService';

export interface ShareQuotationParams {
  quotation: Quotation;
  pdfBlob?: Blob;
  lead?: Lead | null;
}

/**
 * Ultra-fast WhatsApp PDF share.
 * Just shares the PDF file directly — no text, no links, no cloud upload.
 * Uses navigator.share() to open WhatsApp with the PDF attached.
 */
export async function shareQuotationViaWhatsapp(params: ShareQuotationParams): Promise<{ success: boolean; method: 'native' | 'fallback' }> {
  const { quotation, lead } = params;
  let pdfBlob = params.pdfBlob;

  // Get PDF blob — use cached/provided blob for instant speed
  if (!pdfBlob) {
    if (quotation.pdfBlob) {
      pdfBlob = quotation.pdfBlob;
    } else {
      const mockLead: Lead = lead || {
        id: quotation.leadId || '',
        name: quotation.consumerName || 'Valued Customer',
        phoneNumber: quotation.consumerMobile || '',
        email: quotation.consumerEmail || '',
        requirement: `${quotation.systemCapacity || 'Solar Rooftop'} System`,
        description: quotation.city || '',
        createdBy: quotation.preparedBy || quotation.createdBy || 'Admin',
        status: 'quotation_sent',
        createdAt: quotation.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      pdfBlob = await pdfService.generateQuotationPDF(quotation, mockLead, quotation.preparedBy || quotation.createdBy || 'Admin');
    }
  }

  if (!pdfBlob) {
    alert('PDF generate nahi ho paya. Please try again.');
    return { success: false, method: 'native' };
  }

  const propNo = quotation.quotationNumber || quotation.proposalId || 'EST-001';
  const sanitizedPropNo = (propNo || quotation.id).replace(/\//g, '_');
  const pdfFileName = `Solar_Quotation_${sanitizedPropNo}.pdf`;
  const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });

  // Native Share API — directly opens WhatsApp with PDF file attached
  if (typeof navigator !== 'undefined' && (navigator as any).canShare && (navigator as any).canShare({ files: [pdfFile] })) {
    try {
      await (navigator as any).share({ files: [pdfFile] });
      // Fire-and-forget DB update
      if (quotation.id) quotationService.markQuotationAsSent(quotation.id).catch(() => {});
      return { success: true, method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { success: false, method: 'native' };
    }
  }

  // Fallback for desktop: auto-download PDF + open WhatsApp
  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = pdfFileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

  window.open('https://web.whatsapp.com/', '_blank');

  if (quotation.id) quotationService.markQuotationAsSent(quotation.id).catch(() => {});
  return { success: true, method: 'fallback' };
}
