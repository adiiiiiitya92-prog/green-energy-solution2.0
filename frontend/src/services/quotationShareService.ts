import type { Quotation, Lead } from '../types';
import { quotationService } from './quotationService';
import { pdfService } from './pdfService';

export interface ShareQuotationParams {
  quotation: Quotation;
  pdfBlob?: Blob;
  lead?: Lead | null;
}

/**
 * Ultra-fast WhatsApp PDF sharing via Native Web Share API.
 *
 * Flow:
 * 1. Use cached PDF blob if available (instant), otherwise generate on-the-fly.
 * 2. Create a File object from the PDF blob.
 * 3. Call navigator.share({ files: [pdfFile] }) — this opens the native OS share sheet.
 *    The user picks WhatsApp and then chooses which contact/group to send to.
 *    No phone number redirect — user has full control.
 * 4. Fallback: If native share is not supported, open wa.me (without phone number)
 *    so user can pick who to send to manually.
 */
export async function shareQuotationViaWhatsapp(params: ShareQuotationParams): Promise<{ success: boolean; method: 'native' | 'fallback' }> {
  const { quotation, lead } = params;
  let pdfBlob = params.pdfBlob;

  // 1. Ensure we have a valid PDF blob (use cached blob for speed, generate only if missing)
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

  // -------------------------------------------------------
  // Strategy 1: Native OS Web Share API (instant, no redirect)
  // Opens the system share sheet → user picks WhatsApp → picks contact
  // -------------------------------------------------------
  if (pdfBlob && typeof navigator !== 'undefined' && (navigator as any).canShare) {
    try {
      const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });
      if ((navigator as any).canShare({ files: [pdfFile] })) {
        await (navigator as any).share({
          title: `Solar Proposal ${propNo}`,
          text: `Solar Rooftop Quotation ${propNo} - Green Energy Solution`,
          files: [pdfFile]
        });

        // Mark DB state as Sent (fire-and-forget for speed)
        if (quotation.id) {
          quotationService.markQuotationAsSent(quotation.id).catch(() => {});
        }
        return { success: true, method: 'native' };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.log('Share dialog dismissed by user');
        return { success: false, method: 'native' };
      }
      console.warn('Native share not supported, using fallback:', err);
    }
  }

  // -------------------------------------------------------
  // Strategy 2: Fallback — open WhatsApp WITHOUT phone number
  // User picks the contact themselves inside WhatsApp
  // -------------------------------------------------------
  const clientName = quotation.consumerName || lead?.name || 'Valued Customer';

  let message = `☀️ *GREEN ENERGY SOLUTION* ☀️\n`;
  message += `📄 *Solar Proposal & Quotation*\n\n`;
  message += `📌 *Proposal No:* ${propNo}\n`;
  message += `👤 *Client:* ${clientName}\n`;
  if (quotation.systemCapacity) {
    message += `⚡ *System:* ${quotation.systemCapacity}\n`;
  }
  message += `💰 *Grand Total:* ₹${(quotation.grandTotal || quotation.subtotal || 0).toLocaleString('en-IN')}\n\n`;
  message += `Thank you for choosing *Green Energy Solution*!`;

  const encodedMsg = encodeURIComponent(message);
  // No phone number — user picks contact themselves
  const waUrl = `https://wa.me/?text=${encodedMsg}`;

  const win = window.open(waUrl, '_blank');
  if (!win || win.closed || typeof win.closed === 'undefined') {
    window.location.href = waUrl;
  }

  // Mark DB state as Sent (fire-and-forget for speed)
  if (quotation.id) {
    quotationService.markQuotationAsSent(quotation.id).catch(() => {});
  }

  return { success: true, method: 'fallback' };
}
