import jsPDF from 'jspdf';
import type { Lead, Quotation, OrderConfirmation } from '../types';
import dayjs from 'dayjs';
import logoImg from '../assets/Green-Energy-Solution.png';
import solarEngineerImg from '../assets/solar_engineer_installing.png';
import customPage4Img from '../assets/pannel.png';
import qoutation1Img from '../assets/qoutation 1.png';
import stampImg from '../assets/stamp.png';
import paymentQrImg from '../assets/payment_qr.png';
import { generateQuotationDocumentPDF } from './pdfOptimizationService';
import { sortAndFormatBomItems, getBomCategoryIndex, getStandardCategoryName } from './quotationService';

let cachedLogoDataUrl: string | null = null;
let cachedEngineerDataUrl: string | null = null;
let cachedPage4DataUrl: string | null = null;
let cachedQuotationCoverDataUrl: string | null = null;
let cachedStampDataUrl: string | null = null;
let cachedPaymentQrDataUrl: string | null = null;

async function getCompressedAssetBase64(imgSrc: string, quality = 0.60): Promise<string | null> {
  if (!imgSrc) return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imgSrc;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width || 800;
    canvas.height = img.height || 600;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/jpeg', quality);
    }
  } catch (err) {
    console.warn("Asset base64 load error:", err);
  }
  return null;
}

async function getLogoBase64(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  cachedLogoDataUrl = await getCompressedAssetBase64(logoImg, 0.65);
  return cachedLogoDataUrl;
}

async function getSolarEngineerBase64(): Promise<string | null> {
  if (cachedEngineerDataUrl) return cachedEngineerDataUrl;
  cachedEngineerDataUrl = await getCompressedAssetBase64(solarEngineerImg, 0.55);
  return cachedEngineerDataUrl;
}

async function getPage4ImgBase64(): Promise<string | null> {
  if (cachedPage4DataUrl) return cachedPage4DataUrl;
  cachedPage4DataUrl = await getCompressedAssetBase64(customPage4Img, 0.55);
  return cachedPage4DataUrl;
}

async function getQuotationCoverBase64(): Promise<string | null> {
  if (cachedQuotationCoverDataUrl) return cachedQuotationCoverDataUrl;
  cachedQuotationCoverDataUrl = await getCompressedAssetBase64(qoutation1Img, 0.55);
  return cachedQuotationCoverDataUrl;
}

async function getStampBase64(): Promise<string | null> {
  if (cachedStampDataUrl) return cachedStampDataUrl;
  cachedStampDataUrl = await getCompressedAssetBase64(stampImg, 0.65);
  return cachedStampDataUrl;
}

async function getPaymentQrBase64(): Promise<string | null> {
  if (cachedPaymentQrDataUrl) return cachedPaymentQrDataUrl;
  cachedPaymentQrDataUrl = await getCompressedAssetBase64(paymentQrImg, 0.65);
  return cachedPaymentQrDataUrl;
}

async function convertImageToBase64(srcUrlOrBlob: any): Promise<string | null> {
  if (!srcUrlOrBlob) return null;
  if (typeof srcUrlOrBlob === 'string' && srcUrlOrBlob.startsWith('data:image')) {
    return srcUrlOrBlob;
  }

  // Direct conversion for Blob or File objects using FileReader
  if (srcUrlOrBlob instanceof Blob || srcUrlOrBlob instanceof File) {
    try {
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(srcUrlOrBlob);
      });
    } catch (_) {}
  }

  // Fetch conversion for HTTP / HTTPS / Blob URLs to avoid CORS canvas taints
  if (typeof srcUrlOrBlob === 'string' && (srcUrlOrBlob.startsWith('http') || srcUrlOrBlob.startsWith('blob:'))) {
    try {
      const res = await fetch(srcUrlOrBlob);
      if (res.ok) {
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.warn("Fetch image base64 conversion note:", e);
    }
  }

  // Fallback: standard Image & Canvas element loading
  let src = typeof srcUrlOrBlob === 'string' ? srcUrlOrBlob : '';
  if (!src && (srcUrlOrBlob instanceof Blob || srcUrlOrBlob instanceof File)) {
    try {
      src = URL.createObjectURL(srcUrlOrBlob);
    } catch (_) {}
  }

  if (!src) return null;

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = () => resolve(null);
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width || 300;
    canvas.height = img.height || 150;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/png');
    }
  } catch (err) {
    console.warn("Signature base64 conversion note:", err);
  }
  return null;
}

const getAbsUrl = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    return new URL(url, origin).href;
  } catch (_) {
    return url;
  }
};

function renderPageFooter(pageNum: number): string {
  return `
    <div style="background: #16a34a; padding: 10px 24px; display: flex; justify-content: space-between; align-items: center; font-weight: 900; font-size: 12px; color: #ffffff; flex-shrink: 0; box-sizing: border-box; width: 100%;">
      <span style="font-weight: 900; font-size: 12px; color: #ffffff; font-family: Arial, sans-serif;">Green Energy Solutions Pvt. Ltd.</span>
      
      <!-- Social Media Icons (Facebook, Instagram, LinkedIn, Twitter/X) -->
      <div style="display: flex; gap: 8px; align-items: center;">
        <!-- Facebook -->
        <div style="width: 22px; height: 22px; border-radius: 50%; background: #1877F2; display: flex; align-items: center; justify-content: center;" title="Facebook">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffffff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        </div>
        <!-- Instagram -->
        <div style="width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); display: flex; align-items: center; justify-content: center;" title="Instagram">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffffff"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
        </div>
        <!-- LinkedIn -->
        <div style="width: 22px; height: 22px; border-radius: 50%; background: #0A66C2; display: flex; align-items: center; justify-content: center;" title="LinkedIn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffffff"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
        </div>
        <!-- Twitter / X -->
        <div style="width: 22px; height: 22px; border-radius: 50%; background: #000000; display: flex; align-items: center; justify-content: center;" title="Twitter/X">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#ffffff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </div>
      </div>

      <span style="font-weight: 900; font-size: 12px; color: #ffffff; font-family: Arial, sans-serif;">${pageNum}/8</span>
    </div>
  `;
}

function numberToWordsINR(num: number): string {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  }

  const rounded = Math.round(num);
  if (rounded === 0) return 'Zero Rupees Only';
  return 'Indian Rupee ' + inWords(rounded) + ' Rupees Only';
}

export function createNewQuotationProposalHtml(q: any, lead: any, creatorName: string): string {
  const logo = getAbsUrl(logoImg);
  const engineer = getAbsUrl(solarEngineerImg);
  const page4Img = getAbsUrl(customPage4Img);
  const qoutationCover = getAbsUrl(qoutation1Img);
  const stamp = getAbsUrl(stampImg);
  const paymentQr = getAbsUrl(paymentQrImg);

  const cName = q.consumerName || lead?.name || 'Valued Customer';
  const cMobile = q.consumerMobile || (lead?.phoneNumber ? `+91 ${lead.phoneNumber}` : '');
  const cEmail = q.consumerEmail || lead?.email || '';
  const propId = q.quotationNumber || q.proposalId || 'EST-001';
  const propDate = q.proposalDate || dayjs(q.createdAt || new Date()).format('DD MMM, YYYY');
  const byName = q.createdBy || creatorName || 'Nitin Thakre';
  const city = q.city || (lead?.description ? lead.description.split(',')[0] : 'Nagpur');
  const statePin = q.statePin || 'Maharashtra';
  const capacity = q.systemCapacity || '5.0';
  const pvMake = q.pvModuleMake || '';
  const pvCount = q.pvModuleCount || `${Math.ceil((parseFloat(capacity) || 5) * 1000 / 540)} Qty`;
  const invMake = q.inverterMake || '';

  const items = q.items || q.lineItems || [];
  const subtotal = q.subtotal || items.reduce((s: number, i: any) => s + (i.amount || (i.qty * i.rate)), 0);
  const subsidy = q.subsidyAmount !== undefined && q.subsidyAmount !== null && q.subsidyAmount !== '' ? q.subsidyAmount : '78000';
  const gstRateVal = q.gstRate !== undefined && q.gstRate !== null ? Number(q.gstRate) : 13.8;

  const subTotalAmt = Number(subtotal) || 49000;
  const taxAmt = Math.round(subTotalAmt * (gstRateVal / 100));
  const cgstAmt = Math.round(taxAmt / 2);
  const sgstAmt = taxAmt - cgstAmt;
  const halfTaxPctStr = (gstRateVal / 2).toFixed(1).replace('.0', '');

  const finalInvoiceTotal = subTotalAmt + taxAmt;
  const amountInWordsStr = numberToWordsINR(finalInvoiceTotal);
  const expiryDateStr = dayjs(propDate, 'DD MMM, YYYY').isValid() ? dayjs(propDate, 'DD MMM, YYYY').add(5, 'day').format('DD MMM, YYYY') : dayjs().add(5, 'day').format('DD MMM, YYYY');

  const itemsRows = items.length > 0 ? items.map((item: any, idx: number) => {
    const rate = Number(item.rate || 0);
    const amt = Number(item.amount || (item.qty * rate));
    const cTax = Math.round(amt * (gstRateVal / 200));
    const sTax = Math.round(amt * (gstRateVal / 200));
    const unitStr = item.unit || 'Nos';

    const brandPart = item.brand ? `<p style="margin: 0 0 2px 0; font-weight: 700; color: #0f172a; font-size: 10px;">Brand: ${item.brand}</p>` : '';
    const descPart = item.description ? `<p style="margin: 2px 0 4px 0; font-size: 9.5px; color: #334155; line-height: 1.3;">${item.description}</p>` : '';

    const fallbackSpecs = (!item.brand && !item.description && (pvMake || invMake)) ? `
      ${pvMake ? `<p style="margin: 0 0 2px 0;">1. Solar Panels Brand: ${pvMake} (${pvCount})</p>` : ''}
      ${invMake ? `<p style="margin: 0 0 4px 0;">2. Solar Inverter Brand: ${invMake}</p>` : ''}
    ` : '';

    return `
      <tr style="vertical-align: top; border-bottom: 1px solid #cbd5e1;">
        <td style="padding: 8px; text-align: center; font-weight: bold; border-right: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 8px; border-right: 1px solid #cbd5e1; color: #0f172a;">
          <p style="font-weight: 900; font-size: 11.5px; margin: 0 0 4px 0; color: #0f172a;">${item.itemName || item.name}</p>
          ${brandPart}
          ${descPart}
          ${fallbackSpecs}
          <p style="margin: 6px 0 2px 0; font-style: italic; color: #475569; font-size: 9.5px;">Please find detailed BOM & Scope on next page.</p>
          ${Number(subsidy) > 0 ? `<p style="margin: 0; font-style: italic; color: #0f172a; font-size: 9.5px;">₹${Number(subsidy).toLocaleString('en-IN')} Subsidy will be credited to your bank account direct.</p>` : ''}
        </td>
        <td style="padding: 8px; text-align: center; border-right: 1px solid #cbd5e1; font-weight: bold;">
          ${item.qty} ${unitStr}<br/>₹${rate.toLocaleString('en-IN')}
        </td>
        <td style="padding: 8px; text-align: center; border-right: 1px solid #cbd5e1;">0 ₹</td>
        <td style="padding: 8px; text-align: center; border-right: 1px solid #cbd5e1;">₹${cTax.toLocaleString('en-IN')}<br/><span style="font-size: 9.5px; color: #64748b;">${halfTaxPctStr} %</span></td>
        <td style="padding: 8px; text-align: center; border-right: 1px solid #cbd5e1;">₹${sTax.toLocaleString('en-IN')}<br/><span style="font-size: 9.5px; color: #64748b;">${halfTaxPctStr} %</span></td>
        <td style="padding: 8px; text-align: right; font-weight: 900; color: #0f172a;">₹ ${amt.toLocaleString('en-IN')}</td>
      </tr>
    `;
  }).join('') : `
    <tr style="vertical-align: top; border-bottom: 1px solid #cbd5e1;">
      <td style="padding: 8px; text-align: center; font-weight: bold; border-right: 1px solid #cbd5e1;">1</td>
      <td style="padding: 8px; border-right: 1px solid #cbd5e1; color: #0f172a;">
        <p style="font-weight: 900; font-size: 11.5px; margin: 0 0 4px 0; color: #0f172a;">Residential Solar Rooftop solar Plant</p>
        <p style="margin: 0 0 2px 0;">1. Solar Panels Brand: ${pvMake} (${pvCount})</p>
        <p style="margin: 0 0 10px 0;">2. Solar Inverter Brand: ${invMake}</p>
        <p style="margin: 10px 0 2px 0; font-style: italic; color: #475569;">Please find detailed BOM & Scope on next page.</p>
        <p style="margin: 0; font-style: italic; color: #0f172a;">₹${Number(subsidy).toLocaleString('en-IN')} Subsidy will be credited to your bank account direct.</p>
      </td>
      <td style="padding: 8px; text-align: center; border-right: 1px solid #cbd5e1; font-weight: bold;">
        ${capacity} Kw<br/>${Number(subTotalAmt).toLocaleString('en-IN')}
      </td>
      <td style="padding: 8px; text-align: center; border-right: 1px solid #cbd5e1;">0 ₹</td>
      <td style="padding: 8px; text-align: center; border-right: 1px solid #cbd5e1;">${cgstAmt.toLocaleString('en-IN')}<br/><span style="font-size: 9.5px; color: #64748b;">${halfTaxPctStr} %</span></td>
      <td style="padding: 8px; text-align: center; border-right: 1px solid #cbd5e1;">${sgstAmt.toLocaleString('en-IN')}<br/><span style="font-size: 9.5px; color: #64748b;">${halfTaxPctStr} %</span></td>
      <td style="padding: 8px; text-align: right; font-weight: 900; color: #0f172a;">₹ ${subTotalAmt.toLocaleString('en-IN')}</td>
    </tr>
  `;

  // Dynamic Bill of Materials (BOM) Rows with Categorized Group Headers (Strict Sequence)
  const rawBomItems = (q.bomItems && q.bomItems.length > 0) ? q.bomItems : [];
  const sortedBomItems = sortAndFormatBomItems(rawBomItems);

  let currentCategoryHeader = '';
  const bomTableRowsHtml = sortedBomItems.length > 0 ? sortedBomItems.map((bItem: any) => {
    if (bItem.isHeader) {
      return `
        <tr style="background: #e2e8f0; color: #0f172a; font-weight: 800; font-size: 10.5px;">
          <td style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center;">${bItem.srNo || ''}</td>
          <td style="padding: 5px 8px; border: 1px solid #cbd5e1; color: #0f172a;" colspan="4"><strong>${bItem.itemName}</strong></td>
        </tr>
      `;
    }

    let categoryHeaderHtml = '';
    const catName = getStandardCategoryName(bItem.category, bItem.itemName);
    const catIdx = getBomCategoryIndex(bItem.category, bItem.itemName);

    if (catIdx >= 4 && catIdx <= 8 && catName !== currentCategoryHeader) {
      currentCategoryHeader = catName;
      categoryHeaderHtml = `
        <tr style="background: #e2e8f0; color: #0f172a; font-weight: 900; font-size: 10.5px;">
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: 900;">${catIdx}</td>
          <td style="padding: 4px 8px; border: 1px solid #cbd5e1; font-weight: 900; color: #0f172a;" colspan="4"><strong>${catName}</strong></td>
        </tr>
      `;
    }

    const itemDesc = bItem.description ? `<br/><span style="font-size: 9px; font-weight: normal; color: #475569; white-space: pre-line;">${bItem.description}</span>` : '';

    return `
      ${categoryHeaderHtml}
      <tr style="vertical-align: top;">
        <td style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${bItem.srNo}</td>
        <td style="padding: 5px 8px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">
          ${bItem.itemName}
          ${itemDesc}
        </td>
        <td style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${bItem.qty}</td>
        <td style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center;">${bItem.unit || 'Nos'}</td>
        <td style="padding: 5px 8px; border: 1px solid #cbd5e1; font-weight: 600;">${bItem.brand || 'As specified'}</td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="5" style="padding: 14px; text-align: center; color: #64748b; font-style: italic; font-size: 10.5px; border: 1px solid #cbd5e1;">
        No Bill of Materials (BOM) items selected.
      </td>
    </tr>
  `;

  return `
    <!-- PAGE 1: EXACT MATCH PROPOSAL COVER PAGE (TEMPLATE BASED WITH VECTOR SVGS) -->
    <div class="quotation-document-page" style="width: 210mm; height: 297mm; min-width: 210mm; min-height: 297mm; max-width: 210mm; max-height: 297mm; background: #ffffff url('${qoutationCover}') center center / 100% 100% no-repeat; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; position: relative; overflow: hidden; flex-shrink: 0; padding: 0;">
      
      <!-- Top Right Logo (Extra Large Logo for Page 1) -->
      <div style="position: absolute; top: 32px; right: 36px; text-align: right;">
        <img src="${logo}" style="height: 85px; max-width: 260px; width: auto; object-fit: contain;" />
      </div>

      <!-- Proposal Title Block (Top Right White Section - Larger, Spacious & Positioned Down) -->
      <div style="position: absolute; top: 235px; right: 36px; text-align: left; width: 46%;">
        <span style="background: #EAA20A; color: #ffffff; font-size: 12px; font-weight: 800; padding: 6px 18px; border-radius: 14px; letter-spacing: 1px; text-transform: uppercase; display: inline-block;">
          PROPOSAL FOR
        </span>
        <h1 style="font-size: 52px; font-weight: 900; color: #0d2847; margin: 12px 0 0 0; text-transform: uppercase; letter-spacing: 1px; line-height: 0.92;">
          ROOFTOP
        </h1>
        <h2 style="font-size: 58px; font-weight: 900; color: #EAA20A; margin: 3px 0 0 0; text-transform: uppercase; letter-spacing: 1px; line-height: 0.92;">
          SOLAR
        </h2>
        <h3 style="font-size: 30px; font-weight: 800; color: #0d2847; margin: 6px 0 0 0; text-transform: uppercase; letter-spacing: 6px;">
          PROJECT
        </h3>
        <div style="display: flex; align-items: center; margin-top: 14px;">
          <div style="height: 3.5px; width: 210px; background: #EAA20A; border-radius: 2px;"></div>
          <div style="width: 9px; height: 9px; background: #EAA20A; border-radius: 50%; margin-left: -3px;"></div>
        </div>
      </div>

      <!-- Dark Blue Customer Info Bar Overlay (Middle Right - Perfectly Inside Dark Blue Bar with Generous Spacing) -->
      <div style="position: absolute; top: 568px; right: 0px; width: 54%; height: 130px; display: flex; align-items: center; padding-left: 32px; box-sizing: border-box;">
        <!-- Yellow User Icon Circle -->
        <div style="width: 52px; height: 52px; border-radius: 50%; background: #EAA20A; display: flex; align-items: center; justify-content: center; margin-right: 18px; flex-shrink: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <!-- Customer Details (Generous Spacing, Clean Line Height, Zero Overlap) -->
        <div style="color: #ffffff; text-align: left; display: flex; flex-direction: column; justify-content: center; width: calc(100% - 70px);">
          <h2 style="font-size: 21px; font-weight: 900; margin: 0 0 8px 0; text-transform: uppercase; color: #ffffff; letter-spacing: 0.8px; line-height: 1.25; word-break: break-word;">
            ${cName}
          </h2>
          <div style="font-size: 13px; font-weight: 600; color: #ffffff; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#EAA20A" stroke="#EAA20A" stroke-width="1" style="flex-shrink: 0;">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3" fill="#0d2847"></circle>
            </svg>
            <span style="line-height: 1.2; font-weight: 700;">${city}, ${statePin}</span>
          </div>
          ${cMobile ? `
            <div style="font-size: 12.5px; font-weight: 600; color: #ffffff; margin-top: 1px; display: flex; align-items: center; gap: 8px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#EAA20A" stroke="#EAA20A" style="flex-shrink: 0;">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              <span style="line-height: 1.2; font-weight: 700;">${cMobile}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- 3 Feature Badges Section (Shifted Down & Right for Perfect Clearance) -->
      <div style="position: absolute; top: 760px; right: 12px; width: 48%; display: flex; justify-content: space-between; text-align: center;">
        <!-- Clean Energy Badge Card -->
        <div style="display: flex; flex-direction: column; align-items: center; width: 31%; background: #ffffff; padding: 12px 6px; border-radius: 14px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          <div style="width: 46px; height: 46px; border-radius: 50%; background: #fffbeb; border: 1.5px solid #fde68a; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; box-shadow: 0 2px 6px rgba(234, 162, 10, 0.15);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EAA20A" stroke-width="2">
              <circle cx="12" cy="12" r="4"></circle>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
            </svg>
          </div>
          <span style="font-size: 10px; font-weight: 800; color: #0d2847; text-transform: uppercase; line-height: 1.25; letter-spacing: 0.3px;">CLEAN<br/>ENERGY</span>
        </div>

        <!-- Sustainable Future Badge Card -->
        <div style="display: flex; flex-direction: column; align-items: center; width: 31%; background: #ffffff; padding: 12px 6px; border-radius: 14px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          <div style="width: 46px; height: 46px; border-radius: 50%; background: #ecfdf5; border: 1.5px solid #a7f3d0; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; box-shadow: 0 2px 6px rgba(5, 150, 105, 0.15);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path>
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>
            </svg>
          </div>
          <span style="font-size: 10px; font-weight: 800; color: #0d2847; text-transform: uppercase; line-height: 1.25; letter-spacing: 0.3px;">SUSTAINABLE<br/>FUTURE</span>
        </div>

        <!-- Lower Bills Badge Card -->
        <div style="display: flex; flex-direction: column; align-items: center; width: 34%; background: #ffffff; padding: 12px 6px; border-radius: 14px; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          <div style="width: 46px; height: 46px; border-radius: 50%; background: #fffbeb; border: 1.5px solid #fde68a; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; box-shadow: 0 2px 6px rgba(234, 162, 10, 0.15);">
            <span style="font-size: 22px; font-weight: 900; color: #0d2847;">₹</span>
          </div>
          <span style="font-size: 10px; font-weight: 800; color: #0d2847; text-transform: uppercase; line-height: 1.25; letter-spacing: 0.3px;">LOWER BILLS<br/>HIGHER SAVINGS</span>
        </div>
      </div>

      <!-- Bottom Left Dark Blue Block Metadata (All White Text & Clean SVGs) -->
      <div style="position: absolute; bottom: 38px; left: 68px; width: 42%; color: #ffffff; font-size: 14px; font-weight: 700; line-height: 2.3; text-align: left;">
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <div style="width: 28px; display: flex; align-items: center; justify-content: center; margin-right: 10px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#EAA20A" stroke="#EAA20A" stroke-width="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <span style="color: #ffffff; font-weight: 800; font-size: 15px; width: 55px;">Lead</span>
          <span style="color: #ffffff; font-weight: 800; font-size: 15px;">: &nbsp; B2C</span>
        </div>

        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <div style="width: 28px; display: flex; align-items: center; justify-content: center; margin-right: 10px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EAA20A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="3"></rect>
              <circle cx="9" cy="10" r="2.5" fill="#EAA20A"></circle>
              <line x1="15" y1="9" x2="18" y2="9"></line>
              <line x1="15" y1="12" x2="18" y2="12"></line>
              <line x1="7" y1="16" x2="17" y2="16"></line>
            </svg>
          </div>
          <span style="color: #ffffff; font-weight: 800; font-size: 15px; width: 55px;">ID</span>
          <span style="color: #ffffff; font-weight: 800; font-size: 15px;">: &nbsp; ${propId}</span>
        </div>

        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <div style="width: 28px; display: flex; align-items: center; justify-content: center; margin-right: 10px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EAA20A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="3" ry="3"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
              <rect x="7" y="13" width="3" height="3" fill="#EAA20A"></rect>
              <rect x="14" y="13" width="3" height="3" fill="#EAA20A"></rect>
            </svg>
          </div>
          <span style="color: #ffffff; font-weight: 800; font-size: 15px; width: 55px;">Date</span>
          <span style="color: #ffffff; font-weight: 800; font-size: 15px;">: &nbsp; ${propDate}</span>
        </div>

        <div style="display: flex; align-items: center;">
          <div style="width: 28px; display: flex; align-items: center; justify-content: center; margin-right: 10px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EAA20A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" fill="#EAA20A"></path>
            </svg>
          </div>
          <span style="color: #ffffff; font-weight: 800; font-size: 15px; width: 55px;">By</span>
          <span style="color: #ffffff; font-weight: 800; font-size: 15px;">: &nbsp; ${byName}</span>
        </div>
      </div>

    </div>

    <!-- PAGE 2: ABOUT GREEN ENERGY SOLUTIONS -->
    <div class="quotation-document-page" style="width: 210mm; height: 297mm; min-width: 210mm; min-height: 297mm; max-width: 210mm; max-height: 297mm; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; font-family: Arial, sans-serif; position: relative; overflow: hidden; flex-shrink: 0; padding: 0;">
      <div style="padding: 36px 48px 0 48px; flex: 1;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; height: 48px;">
          <h3 style="font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase;">Company Profile</h3>
          <img src="${logo}" style="max-height: 60px; max-width: 210px; height: 60px; width: auto; display: inline-block; object-fit: contain;" />
        </div>
        <!-- Solar Engineer Hero Visual Banner (330px height + center 35% alignment to show both full head & solar panels) -->
        <div style="width: 100%; height: 330px; background: #f1f5f9 url('${engineer}') center 35% / cover no-repeat; border-radius: 12px 12px 0 0; border: 1px solid #cbd5e1; border-bottom: none; overflow: hidden; position: relative; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
        </div>

        <!-- Premium Redesigned Green Banner -->
        <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 14px 24px; display: flex; justify-content: space-between; align-items: center; border-radius: 0 0 12px 12px; border-bottom: 3.5px solid #fbbf24; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.25);">
          <div style="display: flex; align-items: center; gap: 8px; color: #ecfdf5; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;">
            <span style="display: inline-block; width: 8px; height: 8px; background: #fbbf24; border-radius: 50%;"></span>
            Turnkey Solar EPC & Renewable Energy Excellence
          </div>
          <span style="font-weight: 900; font-size: 13.5px; color: #ffffff; text-transform: uppercase; letter-spacing: 1px;">
            GREEN ENERGY SOLUTIONS PVT. LTD.
          </span>
        </div>
        <div style="margin-top: 24px; color: #0f172a;">
          <h2 style="font-size: 22px; font-weight: 900; margin-bottom: 16px;">About Green Energy Solutions Pvt. Ltd</h2>
          <p style="font-size: 13px; line-height: 1.8; color: #334155; margin-bottom: 16px; text-align: justify;">
            <strong>Green Energy Solutions Pvt. Ltd.</strong> is a trusted and fast-growing solar EPC company committed to delivering high-quality, cost-effective, and sustainable energy solutions across residential, commercial, industrial, and institutional sectors.
          </p>
          <p style="font-size: 13px; line-height: 1.8; color: #334155; margin-bottom: 16px; text-align: justify;">
            With extensive experience in the solar industry and a strong focus on quality, innovation, and customer satisfaction, we provide complete end-to-end services including system design, engineering, procurement, installation, testing, commissioning, subsidy assistance, and after-sales support.
          </p>
          <p style="font-size: 13px; line-height: 1.8; color: #334155; margin-bottom: 16px; text-align: justify;">
            Our team of experienced professionals ensures that every project is executed with the highest standards of safety, efficiency, and workmanship. We work with leading brands and advanced technologies to deliver reliable, high-performance solar power systems that help customers reduce electricity costs while contributing to a cleaner and greener future.
          </p>
        </div>
      </div>
      ${renderPageFooter(2)}
    </div>

    <!-- PAGE 3: WHY CHOOSE US, VISION & MISSION -->
    <div class="quotation-document-page" style="width: 210mm; height: 297mm; min-width: 210mm; min-height: 297mm; max-width: 210mm; max-height: 297mm; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; font-family: Arial, sans-serif; position: relative; overflow: hidden; flex-shrink: 0;">
      <div style="padding: 36px 48px 0 48px; flex: 1; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; height: 48px; margin-bottom: 16px;">
          <h3 style="font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase;">Why Choose Us & Values</h3>
          <img src="${logo}" style="height: 60px; max-width: 210px; object-fit: contain;" />
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px; margin-top: 12px;">
          <!-- Section 1: Why Choose Us -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px 24px;">
            <h2 style="font-size: 20px; font-weight: 900; color: #0f172a; text-align: center; margin: 0 0 14px 0; font-family: Arial, sans-serif;">Why Choose Green Energy Solutions Pvt. Ltd.?</h2>
            <ul style="line-height: 1.9; padding-left: 20px; color: #1e293b; font-weight: 600; font-size: 12.5px; margin: 0; list-style-type: disc;">
              <li>Complete Turnkey Solar EPC Solutions</li>
              <li>Customized Design Based on Customer Energy Requirements</li>
              <li>High-Quality Components from Trusted Brands</li>
              <li>Professional Installation by Trained Engineers</li>
              <li>Government Subsidy Assistance (Applicable Schemes)</li>
              <li>Dedicated After-Sales Service & Technical Support</li>
              <li>Transparent Pricing with No Hidden Charges</li>
              <li>On-Time Project Execution</li>
              <li>Commitment to Quality, Safety & Customer Satisfaction</li>
            </ul>
          </div>

          <!-- Section 2: Our Vision -->
          <div style="background: #f8fafc; padding: 18px 22px; border-radius: 6px; border: 1px solid #cbd5e1; border-left: 4px solid #16a34a;">
            <h2 style="font-size: 17px; font-weight: 900; color: #0f172a; margin: 0 0 6px 0;">Our Vision</h2>
            <p style="color: #334155; font-size: 12.5px; font-weight: 600; line-height: 1.7; margin: 0;">
              To become one of India's most trusted renewable energy companies by making clean, affordable, and sustainable solar energy accessible to every home and business.
            </p>
          </div>

          <!-- Section 3: Our Mission -->
          <div style="background: #f8fafc; padding: 18px 22px; border-radius: 6px; border: 1px solid #cbd5e1; border-left: 4px solid #2563eb;">
            <h2 style="font-size: 17px; font-weight: 900; color: #0f172a; margin: 0 0 6px 0;">Our Mission</h2>
            <p style="color: #334155; font-size: 12.5px; font-weight: 600; line-height: 1.7; margin: 0;">
              To empower customers with reliable solar energy solutions through innovative technology, superior service, and long-term value while contributing to a greener and more sustainable future.
            </p>
          </div>
        </div>
      </div>
      ${renderPageFooter(3)}
    </div>

    <!-- PAGE 4: ARCHITECTURAL ROOFTOP SOLAR SYSTEM DESIGN LAYOUT -->
    <div class="quotation-document-page" style="width: 210mm; height: 297mm; min-width: 210mm; min-height: 297mm; max-width: 210mm; max-height: 297mm; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; font-family: Arial, sans-serif; position: relative; overflow: hidden; flex-shrink: 0;">
      <div style="padding: 28px 36px 0 36px; flex: 1; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 8px;">
          <div>
            <h3 style="font-size: 16px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin: 0; letter-spacing: 0.5px;">Architectural Solar System Design & Layout</h3>
            <p style="font-size: 10.5px; color: #64748b; margin: 2px 0 0 0; font-weight: 700;">Minimalist Technical Engineering Blueprint & Array Placement Diagram</p>
          </div>
          <img src="${logo}" style="height: 52px; max-width: 190px; object-fit: contain;" />
        </div>
        
        <!-- Minimalist High-Resolution 80% Area CAD Layout Container -->
        <div style="flex: 1; display: flex; justify-content: center; align-items: center; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; padding: 14px; margin-bottom: 16px; max-height: 210mm; box-shadow: 0 4px 14px rgba(0,0,0,0.04);">
          <img src="${page4Img}" style="width: 100%; height: 100%; max-height: 200mm; object-fit: contain; border-radius: 8px;" />
        </div>
      </div>
      ${renderPageFooter(4)}
    </div>

    <!-- PAGE 5: COMMERCIAL QUOTATION INVOICE -->
    <div class="quotation-document-page" style="width: 210mm; height: 297mm; min-width: 210mm; min-height: 297mm; max-width: 210mm; max-height: 297mm; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; font-family: Arial, sans-serif; position: relative; overflow: hidden; flex-shrink: 0;">
      <div style="padding: 24px 36px 0 36px; flex: 1; display: flex; flex-direction: column;">
        
        <!-- Top Header with Logo Right & Quotation Title Center -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
          <div style="width: 120px;"></div>
          <div style="text-align: center; flex: 1;">
            <h1 style="font-size: 26px; font-weight: 900; color: #193047; text-decoration: underline; margin: 0; text-transform: none;">Quotation</h1>
          </div>
          <div style="width: 140px; text-align: right;">
            <img src="${logo}" style="height: 58px; max-width: 200px; object-fit: contain;" />
          </div>
        </div>

        <!-- 3-Column Top Info Header Section -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 11px; line-height: 1.5; color: #1e293b;">
          <!-- Column 1: From -->
          <div style="width: 28%;">
            <p style="font-weight: 800; color: #193047; margin: 0 0 2px 0;">From</p>
            <p style="font-weight: 900; color: #0f172a; margin: 0;">Green Energy Solutions</p>
            <p style="margin: 2px 0 0 0; color: #475569;">Maharashtra,<br/>India</p>
          </div>

          <!-- Column 2: Bill To -->
          <div style="width: 42%; border-left: 1px solid #cbd5e1; padding-left: 14px;">
            <p style="font-weight: 800; color: #193047; margin: 0 0 2px 0;">Bill To</p>
            <p style="font-size: 13px; font-weight: 900; color: #0f172a; margin: 0 0 4px 0;">${cName}</p>
            <p style="margin: 0; color: #475569;">${city}, ${statePin}, India</p>
            <p style="margin: 2px 0 0 0;">Mobile: ${cMobile}</p>
            ${cEmail ? `<p style="margin: 1px 0 0 0;">Email : ${cEmail}</p>` : ''}
          </div>

          <!-- Column 3: Quotation Metadata -->
          <div style="width: 28%; border-left: 1px solid #cbd5e1; padding-left: 14px; color: #0f172a;">
            <p style="margin: 0;"><strong>Date:</strong> ${propDate}</p>
            <p style="margin: 3px 0;"><strong>Expiry Date:</strong> ${expiryDateStr}</p>
            <p style="margin: 3px 0;"><strong>Estimate#:</strong> ${propId}</p>
            <p style="margin: 3px 0 0 0;"><strong>Created by:</strong> ${byName}</p>
            <p style="margin: 3px 0 0 0;"><strong>Contact:</strong> +918999365894</p>
          </div>
        </div>

        <!-- Main Items Table with Dark Navy Header -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 0px; font-size: 10.5px; border: 1px solid #193047;">
          <thead>
            <tr style="background: #193047; color: #ffffff; font-weight: bold; text-align: left;">
              <th style="padding: 7px; width: 24px; text-align: center; border-right: 1px solid #334155;">#</th>
              <th style="padding: 7px; border-right: 1px solid #334155;">Item & Description</th>
              <th style="padding: 7px; text-align: center; width: 65px; border-right: 1px solid #334155;">Qty Rate</th>
              <th style="padding: 7px; text-align: center; width: 60px; border-right: 1px solid #334155;">Discount</th>
              <th style="padding: 7px; text-align: center; width: 65px; border-right: 1px solid #334155;">CGST</th>
              <th style="padding: 7px; text-align: center; width: 65px; border-right: 1px solid #334155;">SGST</th>
              <th style="padding: 7px; text-align: right; width: 75px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <!-- Amount In Words & Totals Box Below Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10.5px; border: 1px solid #cbd5e1; border-top: none;">
          <tr>
            <td style="padding: 10px 14px; vertical-align: middle; border-right: 1px solid #cbd5e1; color: #0f172a; font-weight: 700;">
              ${amountInWordsStr}
            </td>
            <td style="padding: 0; width: 210px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 5px 10px; font-weight: bold; color: #475569;">Sub Total:</td>
                  <td style="padding: 5px 10px; text-align: right; font-weight: bold; color: #0f172a;">₹ ${subTotalAmt.toLocaleString('en-IN')}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 5px 10px; font-weight: bold; color: #475569;">Tax(GST):</td>
                  <td style="padding: 5px 10px; text-align: right; font-weight: bold; color: #0f172a;">₹ ${taxAmt.toLocaleString('en-IN')}</td>
                </tr>
                <tr style="background: #f8fafc;">
                  <td style="padding: 6px 10px; font-weight: 900; color: #193047;">Total:</td>
                  <td style="padding: 6px 10px; text-align: right; font-weight: 900; color: #193047; font-size: 11.5px;">₹ ${finalInvoiceTotal.toLocaleString('en-IN')}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Notes, Bank Details & Signature Section -->
        <div style="display: flex; justify-content: space-between; border: 1px solid #cbd5e1; padding: 12px; margin-bottom: 16px; font-size: 10px; line-height: 1.5; background: #ffffff;">
          <!-- Notes & Bank Info -->
          <div style="width: 30%; color: #334155; padding-right: 8px;">
            <p style="font-weight: 900; color: #0f172a; margin: 0 0 4px 0;">Notes / Bank Details:</p>
            <p style="font-weight: 900; color: #059669; margin: 0 0 3px 0;">GREEN ENERGY SOLUTIONS PVT. LTD.</p>
            <p style="margin: 2px 0 0 0; color: #0f172a; font-weight: 700;">Account No : <span style="font-weight: 900; color: #0f172a;">575705000030</span></p>
            <p style="margin: 2px 0 0 0; color: #0f172a; font-weight: 700;">IFSC Code : <span style="font-weight: 900; color: #0f172a;">ICICI0005757</span></p>
            <p style="margin: 2px 0 0 0; font-weight: 800; color: #0f172a;">Bank: ICICI Bank</p>
            <p style="margin: 1px 0 0 0; font-weight: 700; color: #059669; font-size: 9px;">Branch: Nagpur - Ajni Square</p>
          </div>

          <!-- Payment QR Code (Scan to Pay) -->
          <div style="width: 22%; border-left: 1px solid #cbd5e1; padding: 4px 8px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <p style="font-weight: 900; color: #0f172a; margin: 0 0 4px 0; font-size: 9.5px;">Scan to Pay</p>
            <img src="${paymentQr}" style="width: 95px; height: 95px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 4px;" />
            <p style="margin: 3px 0 0 0; font-size: 8px; color: #64748b; font-weight: 700;">UPI / Google Pay / PhonePe</p>
          </div>

          <!-- Authorized Signature & Official Company Stamp Box -->
          <div style="width: 28%; border-left: 1px solid #cbd5e1; padding: 4px 10px; text-align: center; display: flex; flex-direction: column; justify-content: space-between; align-items: center; min-height: 105px; position: relative;">
            <div style="flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; max-height: 90px; margin-bottom: 2px;">
              <img src="${stamp}" style="max-height: 85px; max-width: 165px; width: auto; height: auto; object-fit: contain;" />
            </div>
            <p style="font-weight: 800; color: #0f172a; margin: 0; border-top: 1.5px solid #0f172a; padding-top: 4px; width: 100%; font-size: 10px; text-transform: uppercase;">Authorized Signature</p>
          </div>
        </div>

        <!-- Section Heading at Bottom -->
        <h2 style="font-size: 18px; font-weight: 900; text-align: center; color: #0f172a; margin: 8px 0 0 0;">Terms & Condition</h2>
      </div>
      ${renderPageFooter(5)}
    </div>

    <!-- PAGE 6: BILL OF MATERIAL (BOM) -->
    <div class="quotation-document-page" style="width: 210mm; height: 297mm; min-width: 210mm; min-height: 297mm; max-width: 210mm; max-height: 297mm; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; font-family: Arial, sans-serif; position: relative; overflow: hidden; flex-shrink: 0;">
      <div style="padding: 24px 36px 0 36px; flex: 1; display: flex; flex-direction: column;">
        <!-- Top Header with Logo Right & Title Center -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div style="width: 100px;"></div>
          <div style="text-align: center; flex: 1;">
            <h1 style="font-size: 22px; font-weight: 900; color: #0f172a; margin: 0;">Bill of Material</h1>
          </div>
          <div style="width: 140px; text-align: right;">
            <img src="${logo}" style="height: 58px; max-width: 200px; object-fit: contain;" />
          </div>
        </div>

        <!-- BOM Table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <thead>
            <tr style="background: #e2e8f0; color: #0f172a; font-weight: 800; text-align: left; font-size: 10.5px;">
              <th style="padding: 5px 6px; width: 45px; text-align: center; border: 1px solid #cbd5e1;">Sr No.</th>
              <th style="padding: 5px 8px; border: 1px solid #cbd5e1;">Item</th>
              <th style="padding: 5px 6px; width: 40px; text-align: center; border: 1px solid #cbd5e1;">Qty</th>
              <th style="padding: 5px 6px; width: 45px; text-align: center; border: 1px solid #cbd5e1;">Unit</th>
              <th style="padding: 5px 8px; width: 120px; text-align: left; border: 1px solid #cbd5e1;">Brand</th>
            </tr>
          <tbody>
            ${bomTableRowsHtml}
          </tbody>
        </table>

        <!-- Warranty Terms & General Terms Section at bottom of Page 6 -->
        <div style="margin-top: 4px; color: #0f172a;">
          <h2 style="font-size: 14px; font-weight: 900; text-align: center; margin: 0 0 4px 0; text-transform: uppercase; color: #0f172a;">WARRANTY TERMS</h2>
          <h4 style="font-size: 11px; font-weight: 800; margin: 0 0 3px 0; color: #0f172a;">General Terms:</h4>
          <ul style="font-size: 9.5px; color: #334155; line-height: 1.45; padding-left: 18px; margin: 0; font-weight: 600;">
            <li>Material dispatch and Installation shall be started upon DISCOM approval only.</li>
            <li>For better performance, solar panels should be cleaned by customer two times in a week.</li>
            <li>Concealed wiring shall be done by company, if possible only. Otherwise, customer should do concealed wiring with their wiremen where material shall be provided by Company.</li>
            <li>After successful installation, Customer shall take care of solar plant by doing timely cleaning. If we found less generation at the time of attending complaint due to non-cleaning, we may charge you additional service charge.</li>
            <li>There is manufacturing warranty for all electronics equipment. Company will help to claim this warranty if require.</li>
          </ul>
        </div>
      </div>
      ${renderPageFooter(6)}
    </div>

    <!-- PAGE 7: WARRANTY TERMS & GOVT SUBSIDY -->
    <div class="quotation-document-page" style="width: 210mm; height: 297mm; min-width: 210mm; min-height: 297mm; max-width: 210mm; max-height: 297mm; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; font-family: Arial, sans-serif; position: relative; overflow: hidden; flex-shrink: 0;">
      <div style="padding: 20px 32px 0 32px; flex: 1; display: flex; flex-direction: column; font-size: 9.5px; line-height: 1.4; color: #1e293b;">
        <!-- Top Header with Logo Right & Title Left -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <h3 style="font-size: 13px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin: 0;">Warranties & Terms of Agreement</h3>
            <p style="font-size: 9px; color: #64748b; margin: 2px 0 0 0;">Green Energy Solutions Pvt. Ltd. — Solar Rooftop EPC Policy</p>
          </div>
          <img src="${logo}" style="height: 54px; max-width: 190px; object-fit: contain;" />
        </div>

        <!-- Section 1: Government Subsidy -->
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; margin-bottom: 6px;">
          <h4 style="font-size: 10px; font-weight: 800; color: #0f172a; margin: 0 0 3px 0;">Government Subsidy:</h4>
          <p style="margin: 0 0 2px 0;"><strong>Subsidy Credit:</strong> If applicable, any subsidy will be directly credited to the customer's account. Our company will handle all necessary documentation with the government.</p>
          <p style="margin: 0;"><strong>Delay Disclaimer:</strong> Please note that subsidy amounts may experience delays from the government's side. Our company is not liable to compensate for any delays or non-receipt of subsidies if not provided by the government.</p>
        </div>

        <!-- Section 2: Warranties (1 to 4) -->
        <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; margin-bottom: 6px; background: #ffffff;">
          <h4 style="font-size: 10px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0;">System Component Warranties:</h4>
          <div style="margin-bottom: 3px;">
            <p style="margin: 0; font-weight: 800; color: #0f172a;">1. Solar Panel (PV Modules) Performance Warranty:</p>
            <ul style="margin: 1px 0 2px 0; padding-left: 16px;">
              <li>90% of rated capacity for the first 10 years.</li>
              <li>80% of rated capacity for the next 15 years. Total Panel Life: 25 years.</li>
              <li style="font-style: italic; color: #64748b;">Refer Solar Panel Datasheet for detailed warranty terms.</li>
            </ul>
          </div>
          <div style="margin-bottom: 3px;">
            <p style="margin: 0; font-weight: 800; color: #0f172a;">2. Inverter Manufacturing Defect Warranty:</p>
            <ul style="margin: 1px 0 2px 0; padding-left: 16px;">
              <li>5 years, extendable. <span style="font-style: italic; color: #64748b;">(Refer Inverter Datasheet for detailed warranty terms)</span></li>
            </ul>
          </div>
          <div style="margin-bottom: 3px;">
            <p style="margin: 0; font-weight: 800; color: #0f172a;">3. Balance of System (BOS):</p>
            <p style="margin: 1px 0 0 0; padding-left: 8px;">Equipment/products supplied by us which are warranted against defects due to poor material, design, or workmanship. Valid for 12 months from date of commissioning or when put into service, whichever is earlier.</p>
          </div>
          <div>
            <p style="margin: 0; font-weight: 800; color: #0f172a;">4. Operation & Maintenance:</p>
            <p style="margin: 1px 0 0 0; padding-left: 8px;">We offer 5 years of O&M support, including fault finding, remote monitoring, site visits, and assistance with warranty claims for components. O&M does not include solar panel cleaning and washing.</p>
          </div>
        </div>

        <!-- Section 3: Warranty Notes -->
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 10px; margin-bottom: 6px;">
          <h4 style="font-size: 9.5px; font-weight: 800; color: #0f172a; margin: 0 0 2px 0;">Warranty Notes:</h4>
          <ul style="margin: 0; padding-left: 16px; font-size: 8.8px;">
            <li>All warranties provided by the manufacturer/supplier are in favor of the buyer and cover the equipment for the specified period.</li>
            <li>Warranties ensure safe working of individual components and vary in validity period.</li>
            <li>Warranties do not cover damages caused by external hazardous conditions.</li>
          </ul>
        </div>

        <!-- Section 4: Schedule, Payment Terms & Validity Grid -->
        <div style="display: flex; gap: 6px; margin-bottom: 6px;">
          <div style="flex: 1.2; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 8px; background: #ffffff;">
            <h4 style="font-size: 9.5px; font-weight: 800; color: #0f172a; margin: 0 0 2px 0;">Schedule for Site Completion:</h4>
            <p style="margin: 0 0 1px 0; font-size: 8.8px;">• Dispatch within 6 weeks after order confirmation with payment.</p>
            <p style="margin: 0; font-size: 8.8px;">• Installed & commissioned within 60-70 days (approx.) after accreditation, contract & site possession.</p>
          </div>
          <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 8px; background: #ffffff;">
            <h4 style="font-size: 9.5px; font-weight: 800; color: #0f172a; margin: 0 0 2px 0;">Payment Terms:</h4>
            <p style="margin: 0; font-size: 8.8px;">• 10% advance | 50% structure delivery | 30% modules delivery | 10% before net meter</p>
            <p style="margin: 2px 0 0 0; font-weight: 800; color: #0f172a; font-size: 9px;">Quotation Validity: <span style="font-weight: 600; color: #334155;">1 week from date of issue.</span></p>
          </div>
        </div>

        <!-- Section 5: Warranty Exclusions -->
        <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 10px; margin-bottom: 6px; background: #ffffff;">
          <h4 style="font-size: 9.5px; font-weight: 800; color: #0f172a; margin: 0 0 2px 0;">Warranty Exclusions:</h4>
          <p style="margin: 0 0 2px 0; font-size: 8.8px;">The warranty will not cover failures due to:</p>
          <ul style="margin: 0; padding-left: 16px; font-size: 8.5px; line-height: 1.3;">
            <li>Damage/defect caused by transportation, accident, misuse, lack of maintenance, improper usage, or owner negligence.</li>
            <li>Wilful damage, normal wear and tear, abuse, or misuse of equipment/product.</li>
            <li>Damage/defect caused by Force Majeure events (fire, earthquake, flood, natural disasters).</li>
            <li>Damage/defect caused by unauthorized alterations, modifications, conversions, or unauthorized repairs.</li>
            <li>Defects or damages due to external causes. Replaced material will be taken back by contractor.</li>
          </ul>
        </div>

        <!-- Section 6: Scope of Work For Customer -->
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 10px; margin-bottom: 6px;">
          <h4 style="font-size: 9.5px; font-weight: 800; color: #0f172a; margin: 0 0 2px 0;">Scope of Work For Customer:</h4>
          <ul style="margin: 0; padding-left: 16px; font-size: 8.5px; line-height: 1.3;">
            <li>Providing access/approach to rooftop & safe place for material unloading and storage during work execution.</li>
            <li>Customer shall provide necessary support if electrical modifications (ELCB, changeover switch etc.) required by DISCOM.</li>
            <li>Provide necessary documents for project approvals from State/Central Government.</li>
            <li>Site clearance, ladders, water, and electricity supply for smooth installation and commissioning.</li>
          </ul>
        </div>

        <!-- Section 7: Document Required for Load Expansion, Net Metering -->
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 10px; margin-top: 2px;">
          <h4 style="font-size: 9.5px; font-weight: 900; text-align: center; color: #0f172a; margin: 0 0 3px 0; text-transform: uppercase;">Document Required for Load Expansion, Net Metering</h4>
          <ul style="margin: 0; padding-left: 16px; font-size: 8.3px; line-height: 1.35; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px;">
            <li>Latest Electricity bill</li>
            <li>Photo copy of PAN Card – self attested</li>
            <li>Photo copy of Aadhar Card – self attested</li>
            <li>Photo copy of tax Receipt</li>
            <li>Photocopy of ownership document</li>
            <li>Mobile number & Email id</li>
          </ul>
        </div>
      </div>
      ${renderPageFooter(7)}
    </div>

    <!-- PAGE 8: TESTIMONIALS & CONTACT INFORMATION -->
    <div class="quotation-document-page" style="width: 210mm; height: 297mm; min-width: 210mm; min-height: 297mm; max-width: 210mm; max-height: 297mm; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; font-family: Arial, sans-serif; position: relative; overflow: hidden; flex-shrink: 0;">
      <div style="padding: 24px 36px 0 36px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <!-- Top Header with Logo Right & Title Left -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
            <div>
              <h1 style="font-size: 24px; font-weight: 900; color: #193047; margin: 0;">Testimonials</h1>
              <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">What our happy solar rooftop customers say about us</p>
            </div>
            <img src="${logo}" style="height: 60px; max-width: 210px; object-fit: contain;" />
          </div>

          <!-- Review 1 Card -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #193047; border-radius: 6px; padding: 14px; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; margin-bottom: 6px;">
              <span style="color: #f59e0b; font-size: 14px;">★★★★★</span>
              <span style="font-size: 11px; font-weight: 800; color: #193047; margin-left: 8px;">Customer Review</span>
            </div>
            <p style="font-size: 11px; color: #334155; line-height: 1.6; margin: 0 0 8px 0; font-style: italic;">
              "Extremely satisfied with rooftop solar power plant! The installation was smooth, professional, and on time. Great customer service and excellent quality."
            </p>
            <p style="font-size: 11.5px; font-weight: 900; color: #0f172a; margin: 0; text-align: right;">
              — Rajesh Deshmukh
            </p>
          </div>

          <!-- Review 2 Card -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #193047; border-radius: 6px; padding: 14px; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; margin-bottom: 6px;">
              <span style="color: #f59e0b; font-size: 14px;">★★★★★</span>
              <span style="font-size: 11px; font-weight: 800; color: #193047; margin-left: 8px;">Customer Review</span>
            </div>
            <p style="font-size: 11px; color: #334155; line-height: 1.6; margin: 0 0 8px 0; font-style: italic;">
              "When you have an empty roof then why pay for electricity bill? Thank you for end-to-end guidance. Your staff is very professional and friendly. Thanks for making my roof solarized! Superb work by the team."
            </p>
            <p style="font-size: 11.5px; font-weight: 900; color: #0f172a; margin: 0; text-align: right;">
              — Sunita Kulkarni
            </p>
          </div>

          <!-- Review 3 Card -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #193047; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; margin-bottom: 4px;">
              <span style="color: #f59e0b; font-size: 13px;">★★★★★</span>
              <span style="font-size: 10.5px; font-weight: 800; color: #193047; margin-left: 8px;">Customer Review</span>
            </div>
            <p style="font-size: 10.5px; color: #334155; line-height: 1.5; margin: 0 0 6px 0; font-style: italic;">
              "One of the best decisions of my life to go solar! I really appreciate your product quality and workmanship. In the last 6 months, my plant has generated more than 2000 units and counting. I strongly recommend everyone to go solar as soon as possible. Thank you."
            </p>
            <p style="font-size: 11px; font-weight: 900; color: #0f172a; margin: 0; text-align: right;">
              — Aniket Patil
            </p>
          </div>

          <!-- Premium Thank You & Sustainability Appreciation Card -->
          <div style="background: linear-gradient(135deg, #0f172a 0%, #193047 100%); border-radius: 8px; padding: 18px 24px; margin: 12px 0 14px 0; color: #ffffff; text-align: center; border-top: 3px solid #FFC000; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);">
            <div style="display: inline-block; background: rgba(255, 192, 0, 0.15); border: 1px solid #FFC000; color: #FFC000; padding: 3px 12px; border-radius: 20px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
              ☀ Powering A Sustainable Future
            </div>
            
            <h2 style="font-size: 20px; font-weight: 900; color: #ffffff; margin: 0 0 6px 0; letter-spacing: 0.5px;">
              THANK YOU FOR CHOOSING SOLAR ENERGY!
            </h2>
            
            <p style="font-size: 11px; color: #cbd5e1; margin: 0 0 12px 0; line-height: 1.5; font-style: italic;">
              "We appreciate your trust in Green Energy Solutions Pvt. Ltd. Together, we are turning your rooftop into a zero-emission clean power station."
            </p>

            <div style="display: flex; justify-content: space-around; gap: 10px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 10px; font-size: 10px;">
              <div style="flex: 1; text-align: center;">
                <span style="font-size: 14px;">🌱</span>
                <p style="font-weight: 800; margin: 2px 0 0 0; color: #4ade80;">Zero Carbon Impact</p>
              </div>
              <div style="flex: 1; text-align: center; border-left: 1px solid rgba(255,255,255,0.15); border-right: 1px solid rgba(255,255,255,0.15);">
                <span style="font-size: 14px;">⚡</span>
                <p style="font-weight: 800; margin: 2px 0 0 0; color: #FFC000;">Maximum Savings</p>
              </div>
              <div style="flex: 1; text-align: center;">
                <span style="font-size: 14px;">🛡️</span>
                <p style="font-weight: 800; margin: 2px 0 0 0; color: #60a5fa;">25-Year Reliability</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom Company Info Banner Card -->
        <div style="background: #193047; color: #ffffff; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h3 style="font-size: 15px; font-weight: 900; margin: 0 0 4px 0; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">Green Energy Solutions Pvt. Ltd.</h3>
            <p style="font-size: 11px; color: #cbd5e1; margin: 0;">Nagpur, Maharashtra, India</p>
            <p style="font-size: 11px; color: #FFC000; margin: 4px 0 0 0; font-weight: 700;">www.greenenergysolution.co.in</p>
          </div>
          <div style="text-align: right; font-size: 11px; line-height: 1.6; border-left: 1px solid #334155; padding-left: 20px;">
            <p style="margin: 0; color: #cbd5e1;"><strong style="color: #ffffff;">MOBILE:</strong> +91 8999365894 | +91 7057433822</p>
            <p style="margin: 2px 0 0 0; color: #cbd5e1;"><strong style="color: #ffffff;">EMAIL:</strong> greenergy.ngp@gmail.com</p>
          </div>
        </div>
      </div>
      ${renderPageFooter(8)}
    </div>
  `;
}

export function printQuotationHTML(htmlString: string, title: string = 'Quotation Proposal'): void {
  const printWindow = window.open('', '_blank', 'width=1100,height=900');
  if (!printWindow) {
    alert('⚠️ Popup blocked: Kripya browser settings me popups allow karein quotation print karne ke liye.');
    return;
  }

  const fullPrintHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }
          *, *:before, *:after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 210mm;
            font-family: 'Segoe UI', Arial, sans-serif;
          }
          .quotation-document-page {
            width: 210mm !important;
            height: 297mm !important;
            min-width: 210mm !important;
            min-height: 297mm !important;
            max-width: 210mm !important;
            max-height: 297mm !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
            position: relative !important;
            overflow: hidden !important;
            background-color: #ffffff !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          @media print {
            html, body {
              width: 210mm !important;
              height: 297mm !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .quotation-document-page {
              margin: 0 !important;
              border: none !important;
              box-shadow: none !important;
            }
          }
        </style>
      </head>
      <body>
        ${htmlString}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 600);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(fullPrintHtml);
  printWindow.document.close();
}

export const pdfService = {
  printQuotationHTML,

  async generateQuotationPDF(
    q: Quotation,
    lead: Lead,
    creatorName: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<Blob> {
    // Always render from a clean, un-transformed off-screen container for 1:1 pixel-perfect layout precision
    const tempDiv = document.createElement('div');
    tempDiv.className = 'quotation-pdf-export-container';
    tempDiv.style.position = 'fixed';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '-9999px';
    tempDiv.style.width = '210mm';
    tempDiv.style.zIndex = '-9999';
    tempDiv.style.opacity = '1';
    tempDiv.style.pointerEvents = 'none';
    tempDiv.style.backgroundColor = '#ffffff';
    tempDiv.style.transform = 'none';
    tempDiv.innerHTML = createNewQuotationProposalHtml(q, lead, creatorName);
    document.body.appendChild(tempDiv);

    // Pre-load all images (qoutation 1.png, logo, engineer, stamp) for sub-second ultra-fast PDF generation
    const images = Array.from(tempDiv.querySelectorAll('img'));
    await Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    );

    try {
      const blob = await generateQuotationDocumentPDF(tempDiv, `Solar_Quotation_${q.quotationNumber || 'EST'}.pdf`, onProgress);
      return blob;
    } finally {
      if (document.body.contains(tempDiv)) {
        document.body.removeChild(tempDiv);
      }
    }
  },

  async generateConfirmationPDF(
    oc: OrderConfirmation,
    lead: Lead,
    creatorName: string,
    signatureUrl: string
  ): Promise<Blob> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const logoData = await getLogoBase64();
    const emerald = [16, 185, 129];
    const slateDark = [15, 23, 42];

    doc.setFillColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.rect(0, 0, 210, 32, 'F');

    doc.setFillColor(emerald[0], emerald[1], emerald[2]);
    doc.rect(0, 32, 210, 2, 'F');

    if (logoData) {
      doc.addImage(logoData, 'PNG', 15, 5, 56, 16);
    } else {
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('GREEN ENERGY SOLUTION', 15, 18);
    }

    doc.setTextColor(226, 232, 240);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('ORDER CONFIRMATION & ADVANCE RECEIPT', 15, 27);

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('BOOKING RECEIPT', 195, 16, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Booking Date: ${dayjs(oc.createdAt || new Date()).format('DD MMM YYYY')}`, 195, 22, { align: 'right' });
    doc.text(`Payment Mode: ${oc.paymentMode.toUpperCase()}`, 195, 27, { align: 'right' });

    // Client Box
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15, 40, 88, 34, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(15, 40, 88, 34, 3, 3, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('CUSTOMER DETAILS', 20, 47);
    doc.setFontSize(9);
    doc.text(`Name: ${lead.name}`, 20, 53);
    doc.setFont('helvetica', 'normal');
    doc.text(`Phone: +91 ${lead.phoneNumber}`, 20, 59);
    doc.text(`Requirement: ${lead.requirement}`, 20, 65);

    // Payment Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(107, 40, 88, 34, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(107, 40, 88, 34, 3, 3, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('ADVANCE PAYMENT DETAILS', 112, 47);
    doc.setFontSize(9);
    doc.text(`Advance Amount: Rs. ${oc.advanceAmount.toLocaleString('en-IN')}`, 112, 53);
    doc.setFont('helvetica', 'normal');
    doc.text(`Mode: ${oc.paymentMode.replace('_', ' ').toUpperCase()}`, 112, 59);
    if (oc.paymentReference) doc.text(`Ref/UTR: ${oc.paymentReference}`, 112, 65);

    // Signature stamp section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.text('Client Signature & Confirmation Stamp:', 125, 195);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Authorized Signatory: ${creatorName}`, 125, 201);

    const sigDataUrl = await convertImageToBase64(signatureUrl || oc.clientSignatureBlob);
    if (sigDataUrl) {
      try {
        const fmt = (sigDataUrl.includes('image/jpeg') || sigDataUrl.includes('image/jpg')) ? 'JPEG' : 'PNG';
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(125, 204, 70, 26, 2, 2, 'FD');
        doc.addImage(sigDataUrl, fmt, 127, 206, 66, 22);
      } catch (e) {
        console.warn("PDF addImage signature note:", e);
      }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('(Digitally Verified & Confirmed)', 125, 208);
    }

    return doc.output('blob');
  },

  /**
   * Generates a clean, modern Materials Delivery Challan & Dispatch Note
   * featuring a crisp WHITE header with official logo, compact dynamic spacing, and signature seals.
   */
  async generateChallanPDF(ch: any): Promise<Blob> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const logoData = await getLogoBase64();
    const stampData = await convertImageToBase64(stampImg);

    // Theme palette (Crisp White Header, Dark Slate Typography, Emerald Accents)
    const slateDark = [15, 23, 42];
    const slateGray = [71, 85, 105];
    const emerald = [16, 185, 129];

    // ===================================
    // HEADER: CLEAN WHITE BACKGROUND & LOGO
    // ===================================
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 34, 'F');

    // Company Logo / Title Left Side
    if (logoData) {
      doc.addImage(logoData, 'PNG', 14, 6, 60, 17);
    } else {
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('GREEN ENERGY SOLUTION', 14, 18);
    }

    doc.setTextColor(emerald[0], emerald[1], emerald[2]);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('SOLAR POWER SYSTEMS • MATERIAL DISPATCH NOTE', 14, 28);

    // Document Header Right Side (Clean Box)
    const isB2B = ch.type === 'b2b';
    const headerTitle = isB2B ? 'B2B DELIVERY CHALLAN' : 'DELIVERY CHALLAN';
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(headerTitle, 196, 14, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129); // Emerald text
    doc.text(`CHALLAN NO: ${ch.challanNumber}`, 196, 20, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text(`Date: ${dayjs(ch.createdAt || new Date()).format('DD MMM YYYY, hh:mm A')}`, 196, 26, { align: 'right' });

    // Clean Subtle Header Divider Line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, 32, 196, 32);

    // ===================================
    // SECTION 1: CUSTOMER & TRANSPORT DETAILS (COMPACT SPACING)
    // ===================================
    const sec1Y = 36;

    // Box 1: Deliver To (Customer / Business)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, sec1Y, 90, 32, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, sec1Y, 90, 32, 2, 2, 'D');

    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    if (isB2B) {
      doc.text('DELIVER TO (BUSINESS DETAILS)', 18, sec1Y + 6);
      doc.setDrawColor(203, 213, 225);
      doc.line(18, sec1Y + 8, 98, sec1Y + 8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const bName = ch.businessName || ch.leadName || 'N/A';
      doc.text(`Business: ${bName.length > 28 ? bName.substring(0, 25) + '...' : bName}`, 18, sec1Y + 13.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
      if (ch.gstNumber) {
        doc.text(`GSTIN: ${ch.gstNumber}`, 18, sec1Y + 18);
      }
      const addr = ch.businessAddress || 'Client Site Address';
      const truncAddr = addr.length > 40 ? addr.substring(0, 37) + '...' : addr;
      doc.text(`Address: ${truncAddr}`, 18, sec1Y + 22);

      const contactStr = [ch.contactPerson, ch.mobileNumber].filter(Boolean).join(' | ');
      if (contactStr) {
        doc.text(`Contact: ${contactStr}`, 18, sec1Y + 26);
      }
    } else {
      doc.text('DELIVER TO (CUSTOMER DETAILS)', 18, sec1Y + 6);
      doc.setDrawColor(203, 213, 225);
      doc.line(18, sec1Y + 8, 98, sec1Y + 8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`Client Name: ${ch.leadName}`, 18, sec1Y + 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
      doc.text(`Project Ref ID: ${ch.leadId || 'N/A'}`, 18, sec1Y + 19.5);
      doc.text(`Destination: Client Site Address`, 18, sec1Y + 25);
    }

    // Box 2: Transport & Vehicle Info
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(106, sec1Y, 90, 32, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(106, sec1Y, 90, 32, 2, 2, 'D');

    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('TRANSPORT & CARRIER DETAILS', 110, sec1Y + 6);

    doc.setDrawColor(203, 213, 225);
    doc.line(110, sec1Y + 8, 190, sec1Y + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`Vehicle Number: ${ch.vehicleNumber}`, 110, sec1Y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text(`Driver Name: ${ch.driverName} (+91 ${ch.driverPhone})`, 110, sec1Y + 19.5);
    doc.text(`Dispatch Representative: ${ch.employeeName}`, 110, sec1Y + 25);

    // Dynamic Y calculation based on notes presence
    let currentY = sec1Y + 36;
    if (ch.notes) {
      doc.setFillColor(254, 243, 199); // Light amber banner
      doc.roundedRect(14, currentY, 182, 8, 2, 2, 'F');
      doc.setDrawColor(251, 191, 36);
      doc.roundedRect(14, currentY, 182, 8, 2, 2, 'D');

      doc.setTextColor(146, 64, 14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`DISPATCH NOTES: ${ch.notes}`, 18, currentY + 5.5);
      currentY += 12;
    }

    // ===================================
    // SECTION 2: DISPATCHED MATERIALS TABLE (DYNAMIC NATURAL SPACING)
    // ===================================
    doc.setFillColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.rect(14, currentY, 182, 7.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('S.NO', 18, currentY + 5);
    doc.text('ITEM / COMPONENT DESCRIPTION', 34, currentY + 5);
    doc.text('CATEGORY', 140, currentY + 5);
    doc.text('DISPATCHED QTY', 192, currentY + 5, { align: 'right' });

    currentY += 12;
    let totalItemsCount = 0;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    ch.items.forEach((item: any, idx: number) => {
      const qtyNum = Number(item.qty) || 0;
      totalItemsCount += qtyNum;

      const hasSerials = item.serialNumbers && item.serialNumbers.length > 0;
      let snLines: string[] = [];

      if (hasSerials) {
        doc.setFontSize(7);
        doc.setFont('courier', 'bold');
        const snText = `Serial Nos: ${item.serialNumbers.join(', ')}`;
        snLines = doc.splitTextToSize(snText, 100);
      }

      const rowHeight = hasSerials ? Math.max(9.5, 5.5 + (snLines.length * 3.8)) : 7.5;

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, currentY - 4.5, 182, rowHeight, 'F');
      }

      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`${idx + 1}`, 18, currentY);

      const prodName = item.productName.length > 55 ? item.productName.substring(0, 52) + '...' : item.productName;
      doc.text(prodName, 34, currentY);

      if (hasSerials && snLines.length > 0) {
        doc.setFontSize(7);
        doc.setFont('courier', 'bold');
        doc.setTextColor(5, 150, 105);
        snLines.forEach((line: string, lIdx: number) => {
          doc.text(line, 34, currentY + 4 + (lIdx * 3.6));
        });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
      }

      doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
      doc.text(item.category ? item.category.replace('_', ' ').toUpperCase() : 'SOLAR PART', 140, currentY);

      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.qty} UNITS`, 192, currentY, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      doc.setDrawColor(241, 245, 249);
      doc.line(14, currentY - 4.5 + rowHeight, 196, currentY - 4.5 + rowHeight);
      currentY += rowHeight;
    });

    // Summary Total Row
    doc.setFillColor(241, 245, 249);
    doc.rect(14, currentY - 1.5, 182, 7.5, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, currentY - 1.5, 182, 7.5, 'D');

    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('TOTAL DISPATCHED UNITS / QUANTITY:', 110, currentY + 3.5);
    doc.setTextColor(16, 185, 129);
    doc.text(`${totalItemsCount} UNITS`, 192, currentY + 3.5, { align: 'right' });

    // ===================================
    // SECTION 3: DECLARATION & SIGNATURE SEALS (FITS NATURAL SPACING WITHOUT EMPTY GAPS)
    // ===================================
    const footerY = currentY + 14;

    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('RECEIPT ACKNOWLEDGEMENT & UNDERTAKING:', 14, footerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text('We hereby acknowledge receipt of the above listed solar equipment and materials in sound condition & exact specified quantity.', 14, footerY + 4.5);

    // 3 Signature Columns (positioned right below acknowledgement with clear vertical space)
    const signY = footerY + 30;

    // Signature 1: Driver / Carrier
    doc.setDrawColor(203, 213, 225);
    doc.line(14, signY - 4, 64, signY - 4);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("DRIVER / CARRIER SIGNATURE", 14, signY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Driver: ${ch.driverName}`, 14, signY + 3.5);

    // Signature 2: Receiver / Customer
    doc.line(80, signY - 4, 130, signY - 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("CUSTOMER RECEIVER STAMP & SIGN", 80, signY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Customer: ${ch.leadName}`, 80, signY + 3.5);

    // Signature 3: Authorized Signatory
    if (stampData) {
      doc.addImage(stampData, 'PNG', 152, signY - 19, 34, 17);
    }
    doc.line(146, signY - 4, 196, signY - 4);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("FOR GREEN ENERGY SOLUTION", 146, signY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text("Authorized Dispatch Officer", 146, signY + 3.5);

    return doc.output('blob');
  },

  async generateExecutiveReportPDF(items: any[]): Promise<Blob> {
    const doc = new jsPDF('p', 'mm', 'a4');
    const logoData = await getLogoBase64();

    const slateDark = [15, 23, 42];
    const slateGray = [100, 116, 139];

    // Page 1 Header Banner
    doc.setFillColor(15, 23, 42); // Dark Navy Banner
    doc.rect(0, 0, 210, 28, 'F');

    if (logoData) {
      doc.addImage(logoData, 'PNG', 12, 4, 38, 19);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text("GREEN ENERGY SOLUTIONS", 54, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(16, 185, 129);
    doc.text("GO SOLAR, SAVE NATURE | EXECUTIVE ANALYTICS REPORT", 54, 17);
    doc.setTextColor(203, 213, 225);
    doc.text("Address: Nagpur, Maharashtra | Phone: +91 7057433822 | Email: info@greenenergysolutions.in", 54, 22);

    // Title & Date Header
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text("EXECUTIVE LEAD FINANCIAL & PIPELINE PROGRESS REPORT", 14, 38);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text(`Generated Date: ${dayjs().format('DD MMMM YYYY, hh:mm A [IST]')}`, 14, 43);

    // Calculate Summary Financial Metrics
    const totalLeads = items.length;
    const totalVal = items.reduce((s, i) => s + (i.totalValue || 0), 0);
    const totalPaid = items.reduce((s, i) => s + (i.paidAmount || 0), 0);
    const totalPending = items.reduce((s, i) => s + (i.pendingBalance || 0), 0);
    const totalClosed = items.filter(i => ['confirmed', 'registered', 'installed', 'closed'].includes(i.status)).length;
    const winRate = totalLeads > 0 ? Math.round((totalClosed / totalLeads) * 100) : 0;

    // KPI Summary Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 47, 182, 22, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 47, 182, 22, 2, 2, 'D');

    // KPI Columns inside Summary Box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text("TOTAL LEADS", 20, 54);
    doc.setFontSize(11);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.text(`${totalLeads} (${winRate}% Win)`, 20, 62);

    doc.setFontSize(7.5);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text("CONTRACT VALUE", 62, 54);
    doc.setFontSize(11);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.text(`Rs.${totalVal.toLocaleString('en-IN')}`, 62, 62);

    doc.setFontSize(7.5);
    doc.setTextColor(16, 185, 129);
    doc.text("COLLECTED AMOUNT", 112, 54);
    doc.setFontSize(11);
    doc.setTextColor(16, 185, 129);
    doc.text(`Rs.${totalPaid.toLocaleString('en-IN')}`, 112, 62);

    doc.setFontSize(7.5);
    doc.setTextColor(217, 119, 6);
    doc.text("PENDING BALANCE", 156, 54);
    doc.setFontSize(11);
    doc.setTextColor(217, 119, 6);
    doc.text(`Rs.${totalPending.toLocaleString('en-IN')}`, 156, 62);

    // Table Headers
    let startY = 76;
    doc.setFillColor(15, 23, 42);
    doc.rect(14, startY, 182, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text("SR", 16, startY + 5.5);
    doc.text("CLIENT NAME & CONTACT", 26, startY + 5.5);
    doc.text("REQUIREMENT", 74, startY + 5.5);
    doc.text("STAGE", 114, startY + 5.5);
    doc.text("VALUE (Rs)", 144, startY + 5.5, { align: 'right' });
    doc.text("PAID (Rs)", 168, startY + 5.5, { align: 'right' });
    doc.text("STATUS", 192, startY + 5.5, { align: 'right' });

    let currentY = startY + 8;
    const rowHeight = 9;

    items.forEach((item, idx) => {
      if (currentY > 270) {
        doc.addPage();
        currentY = 20;

        doc.setFillColor(15, 23, 42);
        doc.rect(14, currentY, 182, 8, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text("SR", 16, currentY + 5.5);
        doc.text("CLIENT NAME & CONTACT", 26, currentY + 5.5);
        doc.text("REQUIREMENT", 74, currentY + 5.5);
        doc.text("STAGE", 114, currentY + 5.5);
        doc.text("VALUE (Rs)", 144, currentY + 5.5, { align: 'right' });
        doc.text("PAID (Rs)", 168, currentY + 5.5, { align: 'right' });
        doc.text("STATUS", 192, currentY + 5.5, { align: 'right' });

        currentY += 8;
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, currentY, 182, rowHeight, 'F');
      }

      doc.setDrawColor(241, 245, 249);
      doc.line(14, currentY + rowHeight, 196, currentY + rowHeight);

      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(`${idx + 1}`, 16, currentY + 5.5);

      const clientText = (item.name || 'Unnamed').length > 24 ? (item.name || '').substring(0, 22) + '..' : (item.name || '');
      doc.text(clientText, 26, currentY + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
      doc.text(`Ph: +91 ${item.phone || 'N/A'}`, 26, currentY + 7.5);

      doc.setFontSize(7);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      const reqText = (item.requirement || 'Solar System').length > 22 ? (item.requirement || '').substring(0, 20) + '..' : (item.requirement || '');
      doc.text(reqText, 74, currentY + 5.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
      doc.text((item.status || 'NEW').toUpperCase().replace('_', ' '), 114, currentY + 5.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text(`Rs.${(item.totalValue || 0).toLocaleString('en-IN')}`, 144, currentY + 5.5, { align: 'right' });

      doc.setTextColor(16, 185, 129);
      doc.text(`Rs.${(item.paidAmount || 0).toLocaleString('en-IN')}`, 168, currentY + 5.5, { align: 'right' });

      doc.setFontSize(6.5);
      if (item.paymentStatus === 'Fully Paid') {
        doc.setTextColor(16, 185, 129);
      } else if (item.paymentStatus === 'Partially Paid') {
        doc.setTextColor(37, 99, 235);
      } else {
        doc.setTextColor(217, 119, 6);
      }
      doc.text((item.paymentStatus || 'Pending').toUpperCase(), 192, currentY + 5.5, { align: 'right' });

      currentY += rowHeight;
    });

    // Stamp & Signature block on last page
    if (currentY > 240) {
      doc.addPage();
      currentY = 30;
    } else {
      currentY += 12;
    }

    try {
      const stampData = await convertImageToBase64(stampImg);
      if (stampData) {
        doc.addImage(stampData, 'PNG', 148, currentY, 34, 17);
      }
    } catch (_) {}

    doc.line(142, currentY + 16, 194, currentY + 16);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("FOR GREEN ENERGY SOLUTION", 142, currentY + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text("Authorized Accounts & Operations Officer", 142, currentY + 23.5);

    return doc.output('blob');
  },

  async generateChallansReportPDF(challans: any[]): Promise<Blob> {
    const doc = new jsPDF('p', 'mm', 'a4');
    const logoData = await getLogoBase64();

    const slateDark = [15, 23, 42];
    const slateGray = [100, 116, 139];

    // Page Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 28, 'F');

    if (logoData) {
      doc.addImage(logoData, 'PNG', 12, 4, 38, 19);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text("GREEN ENERGY SOLUTIONS", 54, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(16, 185, 129);
    doc.text("DELIVERY CHALLANS & DISPATCH EXECUTIVE REPORT", 54, 17);
    doc.setTextColor(203, 213, 225);
    doc.text("Address: Nagpur, Maharashtra | Phone: +91 7057433822 | Email: info@greenenergysolutions.in", 54, 22);

    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text("DELIVERY CHALLANS SUMMARY REPORT", 14, 38);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text(`Generated Date: ${dayjs().format('DD MMMM YYYY, hh:mm A [IST]')}`, 14, 43);

    const totalChallans = challans.length;
    const totalItems = challans.reduce((s, c) => s + (c.items ? c.items.reduce((is: number, i: any) => is + (i.qty || 0), 0) : 0), 0);

    // KPI Summary Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 47, 182, 18, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 47, 182, 18, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text("TOTAL CHALLANS ISSUED", 20, 54);
    doc.setFontSize(11);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.text(`${totalChallans} Challans`, 20, 60);

    doc.setFontSize(8);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text("TOTAL UNITS DISPATCHED", 110, 54);
    doc.setFontSize(11);
    doc.setTextColor(16, 185, 129);
    doc.text(`${totalItems} Units`, 110, 60);

    // Table Header
    let startY = 72;
    doc.setFillColor(15, 23, 42);
    doc.rect(14, startY, 182, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text("SR", 16, startY + 5.5);
    doc.text("CHALLAN NO", 26, startY + 5.5);
    doc.text("CUSTOMER / LEAD NAME", 66, startY + 5.5);
    doc.text("DRIVER & VEHICLE", 120, startY + 5.5);
    doc.text("ITEMS", 165, startY + 5.5);
    doc.text("DATE", 192, startY + 5.5, { align: 'right' });

    let currentY = startY + 8;
    const rowHeight = 9;

    challans.forEach((ch, idx) => {
      if (currentY > 270) {
        doc.addPage();
        currentY = 20;

        doc.setFillColor(15, 23, 42);
        doc.rect(14, currentY, 182, 8, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text("SR", 16, currentY + 5.5);
        doc.text("CHALLAN NO", 26, currentY + 5.5);
        doc.text("CUSTOMER / LEAD NAME", 66, currentY + 5.5);
        doc.text("DRIVER & VEHICLE", 120, currentY + 5.5);
        doc.text("ITEMS", 165, currentY + 5.5);
        doc.text("DATE", 192, currentY + 5.5, { align: 'right' });

        currentY += 8;
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, currentY, 182, rowHeight, 'F');
      }

      doc.setDrawColor(241, 245, 249);
      doc.line(14, currentY + rowHeight, 196, currentY + rowHeight);

      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(`${idx + 1}`, 16, currentY + 5.5);
      doc.text(ch.challanNumber || `CH-${idx+1}`, 26, currentY + 5.5);

      const custName = (ch.leadName || 'Customer').length > 25 ? (ch.leadName || '').substring(0, 23) + '..' : (ch.leadName || 'Customer');
      doc.text(custName, 66, currentY + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
      doc.text(`${ch.driverName || 'N/A'} (${ch.vehicleNumber || 'N/A'})`, 120, currentY + 5.5);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129);
      const itemCount = ch.items ? ch.items.reduce((s: number, i: any) => s + (i.qty || 0), 0) : 0;
      doc.text(`${itemCount} items`, 165, currentY + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
      doc.text(ch.createdAt ? dayjs(ch.createdAt).format('DD-MMM-YYYY') : 'N/A', 192, currentY + 5.5, { align: 'right' });

      currentY += rowHeight;
    });

    if (currentY > 240) {
      doc.addPage();
      currentY = 30;
    } else {
      currentY += 12;
    }

    try {
      const stampData = await convertImageToBase64(stampImg);
      if (stampData) {
        doc.addImage(stampData, 'PNG', 148, currentY, 34, 17);
      }
    } catch (_) {}

    doc.setDrawColor(203, 213, 225);
    doc.line(142, currentY + 16, 194, currentY + 16);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("FOR GREEN ENERGY SOLUTION", 142, currentY + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text("Authorized Dispatch Officer", 142, currentY + 23.5);

    return doc.output('blob');
  },

  async generateVisitsReportPDF(visits: any[]): Promise<Blob> {
    const doc = new jsPDF('p', 'mm', 'a4');
    const logoData = await getLogoBase64();

    const slateDark = [15, 23, 42];
    const slateGray = [100, 116, 139];

    // Page Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 28, 'F');

    if (logoData) {
      doc.addImage(logoData, 'PNG', 12, 4, 38, 19);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text("GREEN ENERGY SOLUTIONS", 54, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(16, 185, 129);
    doc.text("FIELD SITE VISITS & SURVEY EXECUTIVE REPORT", 54, 17);
    doc.setTextColor(203, 213, 225);
    doc.text("Address: Nagpur, Maharashtra | Phone: +91 7057433822 | Email: info@greenenergysolutions.in", 54, 22);

    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text("FIELD SITE VISITS REPORT", 14, 38);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text(`Generated Date: ${dayjs().format('DD MMMM YYYY, hh:mm A [IST]')}`, 14, 43);

    const totalVisits = visits.length;
    const completedVisits = visits.filter(v => v.status === 'completed' || v.status === 'done').length;

    // KPI Summary Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 47, 182, 18, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 47, 182, 18, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text("TOTAL SITE VISITS", 20, 54);
    doc.setFontSize(11);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.text(`${totalVisits} Visits`, 20, 60);

    doc.setFontSize(8);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text("COMPLETED VISITS", 110, 54);
    doc.setFontSize(11);
    doc.setTextColor(16, 185, 129);
    doc.text(`${completedVisits} Completed`, 110, 60);

    // Table Header
    let startY = 72;
    doc.setFillColor(15, 23, 42);
    doc.rect(14, startY, 182, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text("SR", 16, startY + 5.5);
    doc.text("CLIENT & CONTACT", 24, startY + 5.5);
    doc.text("ENGINEER", 70, startY + 5.5);
    doc.text("IN TIME (CHECK-IN)", 105, startY + 5.5);
    doc.text("OUT TIME (CHECK-OUT)", 148, startY + 5.5);
    doc.text("DATE", 192, startY + 5.5, { align: 'right' });

    let currentY = startY + 8;
    const rowHeight = 9;

    visits.forEach((v, idx) => {
      if (currentY > 270) {
        doc.addPage();
        currentY = 20;

        doc.setFillColor(15, 23, 42);
        doc.rect(14, currentY, 182, 8, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text("SR", 16, currentY + 5.5);
        doc.text("CLIENT & CONTACT", 24, currentY + 5.5);
        doc.text("ENGINEER", 70, currentY + 5.5);
        doc.text("IN TIME (CHECK-IN)", 105, currentY + 5.5);
        doc.text("OUT TIME (CHECK-OUT)", 148, currentY + 5.5);
        doc.text("DATE", 192, currentY + 5.5, { align: 'right' });

        currentY += 8;
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, currentY, 182, rowHeight, 'F');
      }

      doc.setDrawColor(241, 245, 249);
      doc.line(14, currentY + rowHeight, 196, currentY + rowHeight);

      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(`${idx + 1}`, 16, currentY + 5.5);

      const clientName = (v.personMetName || v.leadName || v.clientName || 'Unnamed Client').length > 20 
        ? (v.personMetName || v.leadName || v.clientName || '').substring(0, 18) + '..' 
        : (v.personMetName || v.leadName || v.clientName || 'Unnamed Client');
      doc.text(clientName, 24, currentY + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
      doc.text(v.employeeName || v.engineerName || 'Field Officer', 70, currentY + 5.5);

      // Check-In Time
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(16, 185, 129);
      doc.text(v.checkInTime || 'Not Recorded', 105, currentY + 5.5);

      // Check-Out Time
      doc.setTextColor(225, 29, 72);
      doc.text(v.checkOutTime || 'Not Recorded', 148, currentY + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
      doc.text(v.visitedAt ? dayjs(v.visitedAt).format('DD-MMM-YYYY') : (v.createdAt ? dayjs(v.createdAt).format('DD-MMM-YYYY') : 'N/A'), 192, currentY + 5.5, { align: 'right' });

      currentY += rowHeight;
    });

    if (currentY > 240) {
      doc.addPage();
      currentY = 30;
    } else {
      currentY += 12;
    }

    try {
      const stampData = await convertImageToBase64(stampImg);
      if (stampData) {
        doc.addImage(stampData, 'PNG', 148, currentY, 34, 17);
      }
    } catch (_) {}

    doc.setDrawColor(203, 213, 225);
    doc.line(142, currentY + 16, 194, currentY + 16);
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("FOR GREEN ENERGY SOLUTION", 142, currentY + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text("Authorized Operations Officer", 142, currentY + 23.5);

    return doc.output('blob');
  }
};
