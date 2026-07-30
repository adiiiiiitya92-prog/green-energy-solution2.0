import dayjs from 'dayjs';
import type { Quotation, Lead } from '../types';
import { quotationService, getCleanWhatsAppPhone } from './quotationService';
import { uploadPdfToFirebase } from './firebase';
import { pdfService } from './pdfService';

export interface ShareQuotationParams {
  quotation: Quotation;
  pdfBlob?: Blob;
  lead?: Lead | null;
}

/**
 * Dual-Strategy PDF/Quotation sharing logic on WhatsApp with Web Share API and Cloud Storage fallback:
 * 
 * 1. Primary (Native Share):
 *    - Takes PDF blob and checks navigator.canShare({ files: [pdfFile] }).
 *    - If supported, triggers navigator.share() with the PDF File object for direct native OS sharing.
 * 
 * 2. Secondary / Fallback (Cloud Storage Presigned URL + wa.me link):
 *    - Uploads PDF Blob to Cloud Storage (Backblaze B2) if pdfUrl is not present.
 *    - Formats a structured WhatsApp message with Header, Proposal No, Client Name, Itemized Summary, Grand Total & PDF link.
 *    - Opens WhatsApp using https://wa.me/<country_code><phone_number>?text=<url_encoded_message> in a new tab.
 * 
 * 3. DB State Update:
 *    - Updates database quotation status to 'Sent' (sentViaWhatsapp: true) upon sharing initiation.
 */
export async function shareQuotationViaWhatsapp(params: ShareQuotationParams): Promise<{ success: boolean; method: 'native' | 'fallback' }> {
  const { quotation, lead } = params;
  let pdfBlob = params.pdfBlob;

  // 1. Ensure we have a valid PDF blob
  if (!pdfBlob) {
    if (quotation.pdfBlob) {
      pdfBlob = quotation.pdfBlob;
    } else {
      try {
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
      } catch (e) {
        console.warn('PDF generation on share note:', e);
      }
    }
  }

  const propNo = quotation.quotationNumber || quotation.proposalId || 'EST-001';
  const sanitizedPropNo = (propNo || quotation.id).replace(/\//g, '_');
  const pdfFileName = `Solar_Quotation_${sanitizedPropNo}.pdf`;
  const rawPhone = quotation.consumerMobile || quotation.consumerNo || lead?.phoneNumber || '';
  const targetPhone = getCleanWhatsAppPhone(rawPhone);
  const clientName = quotation.consumerName || lead?.name || 'Valued Customer';

  // ----------------------------------------------------
  // Strategy 1: Primary Native OS Web Share API
  // ----------------------------------------------------
  if (pdfBlob && typeof navigator !== 'undefined' && (navigator as any).canShare) {
    try {
      const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });
      if ((navigator as any).canShare({ files: [pdfFile] })) {
        await (navigator as any).share({
          title: `Solar Proposal ${propNo}`,
          text: `Solar Rooftop Quotation ${propNo} for ${clientName}`,
          files: [pdfFile]
        });

        // Mark DB state as Sent
        if (quotation.id) {
          await quotationService.markQuotationAsSent(quotation.id);
        }
        return { success: true, method: 'native' };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.log('Native share dialog dismissed by user');
      } else {
        console.warn('Native share failed or unsupported for this file, triggering fallback strategy:', err);
      }
    }
  }

  // ----------------------------------------------------
  // Strategy 2: Secondary / Fallback (Cloud Storage + wa.me link)
  // ----------------------------------------------------
  let cloudPdfUrl = quotation.pdfUrl;

  if (!cloudPdfUrl && pdfBlob) {
    try {
      const storagePath = `quotations/pdf_${sanitizedPropNo}.pdf`;
      const uploadedUrl = await uploadPdfToFirebase(pdfBlob, storagePath);
      if (uploadedUrl && (uploadedUrl.startsWith('http://') || uploadedUrl.startsWith('https://'))) {
        cloudPdfUrl = uploadedUrl;
        if (quotation.id) {
          await quotationService.updateQuotation({ ...quotation, pdfUrl: cloudPdfUrl });
        }
      }
    } catch (uploadErr) {
      console.warn('Cloud Storage PDF upload fallback note:', uploadErr);
    }
  }

  // Itemized summary calculation
  let itemizedText = '';
  if (quotation.items && quotation.items.length > 0) {
    itemizedText = quotation.items
      .map(item => `• ${item.name} (${item.quantity} ${item.unit || 'Nos'}) - ₹${(item.amount || item.rate * item.quantity).toLocaleString('en-IN')}`)
      .join('\n');
  } else {
    itemizedText = `• ${quotation.systemCapacity || 'Solar Rooftop System'} - ₹${(quotation.grandTotal || 0).toLocaleString('en-IN')}`;
  }

  // Construct structured WhatsApp message
  let message = `☀️ *GREEN ENERGY SOLUTION* ☀️\n`;
  message += `📄 *Solar Proposal & Quotation*\n\n`;
  message += `📌 *Proposal No:* ${propNo}\n`;
  message += `📅 *Date:* ${quotation.proposalDate ? dayjs(quotation.proposalDate).format('DD/MM/YYYY') : dayjs().format('DD/MM/YYYY')}\n`;
  message += `👤 *Client Name:* ${clientName}\n`;
  if (quotation.systemCapacity) {
    message += `⚡ *System Capacity:* ${quotation.systemCapacity}\n`;
  }
  message += `\n📋 *Itemized Summary:*\n${itemizedText}\n\n`;
  message += `💰 *Grand Total:* ₹${(quotation.grandTotal || quotation.subtotal || 0).toLocaleString('en-IN')}\n\n`;

  if (cloudPdfUrl) {
    message += `📄 *Click link to download/view PDF Proposal:*\n${cloudPdfUrl}\n\n`;
  }

  message += `Thank you for choosing *Green Energy Solution*! Feel free to reply for any queries.`;

  const encodedMsg = encodeURIComponent(message);
  const waUrl = targetPhone
    ? `https://wa.me/${targetPhone}?text=${encodedMsg}`
    : `https://wa.me/?text=${encodedMsg}`;

  // Open WhatsApp in new window/tab
  const win = window.open(waUrl, '_blank');
  if (!win || win.closed || typeof win.closed === 'undefined') {
    window.location.href = waUrl;
  }

  // Trigger local auto-download backup if PDF blob exists
  if (pdfBlob) {
    try {
      const blobUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = pdfFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (_) {}
  }

  // Mark DB state as Sent
  if (quotation.id) {
    await quotationService.markQuotationAsSent(quotation.id);
  }

  return { success: true, method: 'fallback' };
}
