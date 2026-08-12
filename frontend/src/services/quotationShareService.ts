import type { Quotation, Lead } from '../types';
import { quotationService, getCleanWhatsAppPhone } from './quotationService';
import { ensurePdfBlobForQuotation, getCachedPdfBlob } from './pdfCacheService';
import { getFreshB2SignedUrl } from './firebase';

export interface ShareQuotationParams {
  quotation: Quotation;
  pdfBlob?: Blob;
  lead?: Lead | null;
}

/**
 * Robust, Ultra-fast WhatsApp PDF Share for Mobile & Desktop.
 */
export async function shareQuotationViaWhatsapp(params: ShareQuotationParams): Promise<{ success: boolean; method: 'native' | 'fallback' | 'prompt' }> {
  const { quotation, lead } = params;
  let pdfBlob = params.pdfBlob;

  const propNo = quotation.quotationNumber || quotation.proposalId || quotation.id || 'EST-001';
  const sanitizedPropNo = (propNo || 'EST').replace(/[\/\s]/g, '_');
  const pdfFileName = `Solar_Quotation_${sanitizedPropNo}.pdf`;

  const rawMobile = quotation.consumerMobile || lead?.phoneNumber;
  const cleanPhone = getCleanWhatsAppPhone(rawMobile);
  const consumerName = quotation.consumerName || lead?.name || 'Valued Customer';

  // Build clean, concise WhatsApp text
  let shareText = `Dear ${consumerName}, Greetings from Green Energy Solution! ☀️\n\nPlease find attached our official Solar Rooftop Proposal (${propNo}).`;

  if (quotation.pdfUrl && typeof quotation.pdfUrl === 'string' && quotation.pdfUrl.startsWith('http')) {
    shareText += `\n📄 Download Link: ${quotation.pdfUrl}`;
  }

  // 1. If pdfBlob is not provided, try instant memory/CacheStorage lookup
  if (!pdfBlob || pdfBlob.size < 100) {
    const cached = await getCachedPdfBlob(propNo);
    if (cached && cached.size > 100) {
      pdfBlob = cached;
    }
  }

  // 2. If STILL not cached, generate PDF now
  const wasGeneratedOnDemand = !pdfBlob || pdfBlob.size < 100;
  if (wasGeneratedOnDemand) {
    pdfBlob = await ensurePdfBlobForQuotation(
      quotation,
      lead,
      quotation.preparedBy || quotation.createdBy || 'Admin'
    );
  }

  if (!pdfBlob || pdfBlob.size < 100) {
    alert('PDF generate nahi ho paya. Please try again.');
    return { success: false, method: 'native' };
  }

  const uniquePdfFileName = `Solar_Quotation_${sanitizedPropNo}_${Date.now().toString().slice(-4)}.pdf`;
  const pdfFile = new File([pdfBlob], uniquePdfFileName, { type: 'application/pdf' });

  // Check if browser supports Web Share API with files
  const canShareFiles = typeof navigator !== 'undefined' && 
                        (navigator as any).canShare && 
                        (navigator as any).canShare({ files: [pdfFile] });

  // If PDF was generated on-the-fly right now, user gesture might have expired during canvas render on mobile.
  // If on mobile, trigger a clean 1-tap prompt so navigator.share() executes in a fresh user touch event!
  const isMobile = typeof window !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (canShareFiles && wasGeneratedOnDemand && isMobile) {
    showMobileShareModal(pdfFile, sanitizedPropNo, shareText, cleanPhone, quotation.id);
    return { success: true, method: 'prompt' };
  }

  // If pdfBlob was ALREADY cached, user gesture is 100% active (<5ms elapsed)
  if (canShareFiles) {
    try {
      await (navigator as any).share({
        files: [pdfFile],
        title: `Solar Proposal - ${sanitizedPropNo}`,
        text: shareText
      });

      if (quotation.id && quotation.id !== 'temp') {
        quotationService.markQuotationAsSent(quotation.id).catch(() => {});
      }
      if (quotation.pdfUrl && quotation.pdfUrl.includes('backblaze')) {
        getFreshB2SignedUrl(quotation.pdfUrl).catch(() => {});
      }
      return { success: true, method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { success: false, method: 'native' };
      console.warn('Native share error, switching to prompt/fallback:', err);
      if (isMobile) {
        showMobileShareModal(pdfFile, sanitizedPropNo, shareText, cleanPhone, quotation.id);
        return { success: true, method: 'prompt' };
      }
    }
  }

  // === DESKTOP / FALLBACK ===
  executeFallbackShare(pdfBlob, pdfFileName, shareText, cleanPhone, quotation.id);
  return { success: true, method: 'fallback' };
}

/**
 * Mobile 1-Tap Share Modal Helper: Fixes user gesture expiration when PDF generation takes time
 */
function showMobileShareModal(
  pdfFile: File,
  sanitizedPropNo: string,
  shareText: string,
  cleanPhone: string,
  quotationId?: string
) {
  const existingModal = document.getElementById('mobile-pdf-share-modal');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'mobile-pdf-share-modal';
  modalOverlay.className = 'fixed inset-0 z-[99999] bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn';

  modalOverlay.innerHTML = `
    <div class="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4 border border-emerald-100">
      <div class="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 text-3xl shadow-inner">
        📲
      </div>
      <div>
        <h3 class="text-base font-black text-slate-800">Proposal PDF Ready!</h3>
        <p class="text-xs text-slate-500 mt-1 font-medium">Tap button below to send quotation PDF directly via WhatsApp.</p>
      </div>

      <button id="mobile-share-confirm-btn" class="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-transform cursor-pointer">
        <span>💬 Send on WhatsApp Now</span>
      </button>

      <button id="mobile-share-cancel-btn" class="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer">
        Cancel
      </button>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  const confirmBtn = document.getElementById('mobile-share-confirm-btn');
  const cancelBtn = document.getElementById('mobile-share-cancel-btn');

  const removeModal = () => {
    if (document.body.contains(modalOverlay)) {
      document.body.removeChild(modalOverlay);
    }
  };

  cancelBtn?.addEventListener('click', removeModal);

  confirmBtn?.addEventListener('click', async () => {
    removeModal();
    try {
      if ((navigator as any).canShare && (navigator as any).canShare({ files: [pdfFile] })) {
        await (navigator as any).share({
          files: [pdfFile],
          title: `Solar Proposal - ${sanitizedPropNo}`,
          text: shareText
        });
        if (quotationId && quotationId !== 'temp') {
          quotationService.markQuotationAsSent(quotationId).catch(() => {});
        }
      } else {
        executeFallbackShare(pdfFile, pdfFile.name, shareText, cleanPhone, quotationId);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        executeFallbackShare(pdfFile, pdfFile.name, shareText, cleanPhone, quotationId);
      }
    }
  });
}

/**
 * Fallback Share: Direct download + WhatsApp link
 */
function executeFallbackShare(
  pdfBlob: Blob,
  pdfFileName: string,
  shareText: string,
  cleanPhone: string,
  quotationId?: string
) {
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

  const whatsappUrl = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(shareText)}`
    : `https://web.whatsapp.com/`;

  window.open(whatsappUrl, '_blank');

  if (quotationId && quotationId !== 'temp') {
    quotationService.markQuotationAsSent(quotationId).catch(() => {});
  }
}
