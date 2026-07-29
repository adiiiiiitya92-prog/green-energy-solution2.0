import jsPDF from 'jspdf';
import type { Lead, Quotation, OrderConfirmation } from '../types';
import dayjs from 'dayjs';
import logoImg from '../assets/Green-Energy-Solution.png';
import solarCoverImg from '../assets/solar_rooftop_cover.png';
import solarEngineerImg from '../assets/solar_engineer_installing.png';
import customPage4Img from '../assets/image.png';
import { generateQuotationDocumentPDF } from './pdfOptimizationService';

let cachedLogoDataUrl: string | null = null;

async function getLogoBase64(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const img = new Image();
    img.src = logoImg;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      cachedLogoDataUrl = canvas.toDataURL('image/png');
      return cachedLogoDataUrl;
    }
  } catch (err) {
    console.warn("Logo load error:", err);
  }
  return null;
}

async function convertImageToBase64(srcUrlOrBlob: any): Promise<string | null> {
  if (!srcUrlOrBlob) return null;
  if (typeof srcUrlOrBlob === 'string' && srcUrlOrBlob.startsWith('data:image')) {
    return srcUrlOrBlob;
  }

  let src = '';
  if (typeof srcUrlOrBlob === 'string') {
    src = srcUrlOrBlob;
  } else if (srcUrlOrBlob instanceof Blob || srcUrlOrBlob instanceof File) {
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
    <div style="background: #FFC000; padding: 10px 24px; display: flex; justify-content: space-between; align-items: center; font-weight: 900; font-size: 12px; color: #0f172a; flex-shrink: 0; box-sizing: border-box; width: 100%;">
      <span style="font-weight: 900; font-size: 12px; color: #0f172a; font-family: Arial, sans-serif;">Green Energy Solutions Pvt. Ltd.</span>
      
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

      <span style="font-weight: 900; font-size: 12px; color: #0f172a; font-family: Arial, sans-serif;">${pageNum}/8</span>
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
  const cover = getAbsUrl(solarCoverImg);
  const engineer = getAbsUrl(solarEngineerImg);
  const page4Img = getAbsUrl(customPage4Img);

  const cName = q.consumerName || lead?.name || 'Valued Customer';
  const cMobile = q.consumerMobile || (lead?.phoneNumber ? `+91 ${lead.phoneNumber}` : '');
  const cEmail = q.consumerEmail || lead?.email || '';
  const cNo = q.consumerNo || 'N/A';
  const sLoad = q.sanctionLoad || '5.0 kW';
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
  const subsidy = q.subsidyAmount !== undefined && q.subsidyAmount !== null ? q.subsidyAmount : '0';
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

  // Dynamic Bill of Materials (BOM) Rows with Categorized Group Headers
  let bomTableRowsHtml = '';

  if (q.bomItems && q.bomItems.length > 0) {
    let currentCategory = '';
    bomTableRowsHtml = q.bomItems.map((bItem: any, bIdx: number) => {
      if (bItem.isHeader) {
        return `
          <tr style="background: #f1f5f9; font-weight: bold;">
            <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center;">${bItem.srNo || ''}</td>
            <td style="padding: 4px 8px; border: 1px solid #cbd5e1; color: #0f172a;" colspan="4"><strong>${bItem.itemName}</strong></td>
          </tr>
        `;
      }

      let categoryHeaderHtml = '';
      if (bItem.category && bItem.category !== currentCategory) {
        currentCategory = bItem.category;
        categoryHeaderHtml = `
          <tr style="background: #f1f5f9; font-weight: bold;">
            <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center;">•</td>
            <td style="padding: 4px 8px; border: 1px solid #cbd5e1; color: #0f172a;" colspan="4"><strong>${currentCategory}</strong></td>
          </tr>
        `;
      }

      return `
        ${categoryHeaderHtml}
        <tr>
          <td style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${bItem.srNo || (bIdx + 1)}</td>
          <td style="padding: 5px 8px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">
            ${bItem.itemName}
            ${bItem.description ? `<br/><span style="font-size: 9px; font-weight: normal; color: #475569;">${bItem.description}</span>` : ''}
          </td>
          <td style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${bItem.qty}</td>
          <td style="padding: 5px 6px; border: 1px solid #cbd5e1; text-align: center;">${bItem.unit || 'Nos'}</td>
          <td style="padding: 5px 8px; border: 1px solid #cbd5e1; font-weight: 600;">${bItem.brand || 'As specified'}</td>
        </tr>
      `;
    }).join('');
  } else if (items && items.length > 0) {
    bomTableRowsHtml = items.map((item: any, idx: number) => `
      <tr>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${idx + 1}</td>
        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${item.itemName || item.name}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${item.qty}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${item.unit || 'Nos'}</td>
        <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${item.brand || 'As specified'}</td>
      </tr>
    `).join('');
  } else {
    bomTableRowsHtml = `
      <tr>
        <td colspan="5" style="padding: 16px; text-align: center; color: #64748b; font-style: italic; font-weight: 500;">
          No Bill of Materials (BOM) items added yet. Click "+ Add Item Row" in proposal builder to add custom items.
        </td>
      </tr>
    `;
  }

  return `
    <!-- PAGE 1: COVER PAGE -->
    <div class="quotation-document-page" style="width: 210mm; height: 297mm; min-width: 210mm; min-height: 297mm; max-width: 210mm; max-height: 297mm; background: #ffffff; display: flex; position: relative; box-sizing: border-box; font-family: Arial, sans-serif; overflow: hidden; flex-shrink: 0;">
      <div style="width: 47%; height: 100%; position: relative; background: #0f172a url('${cover}') center center / cover no-repeat;">
      </div>
      <div style="width: 53%; height: 100%; background: #FFC000; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box;">
        <div style="height: 31%; background: #FFC000; padding: 32px 24px; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-end; text-align: right; box-sizing: border-box;">
          <h1 style="font-size: 32px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin: 0; line-height: 1.1;">Roof Top Solar</h1>
          <h2 style="font-size: 40px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin: 4px 0 0 0; line-height: 1.1;">Proposal</h2>
          <span style="font-size: 14px; font-weight: 800; color: #0f172a; background: #ffffff; padding: 4px 12px; border-radius: 4px; margin-top: 8px;">${capacity} kWp Grid-Tie System</span>
        </div>
        <div style="height: 31%; background: #193047; padding: 24px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; color: #ffffff; box-sizing: border-box;">
          <h2 style="font-size: 22px; font-weight: 900; text-transform: uppercase; margin: 0 0 8px 0; color: #ffffff;">${cName}</h2>
          <p style="font-size: 13px; font-weight: 600; color: #e2e8f0; margin: 0;">${cMobile}${cEmail ? ' | ' + cEmail : ''}</p>
          <p style="font-size: 13px; font-weight: 600; color: #cbd5e1; margin: 4px 0 0 0;">${city}, ${statePin}</p>
          ${cNo !== 'N/A' ? `<p style="font-size: 11px; font-weight: 700; color: #fbbf24; margin: 6px 0 0 0;">Consumer No: ${cNo} | Sanction: ${sLoad}</p>` : ''}
        </div>
        <div style="height: 38%; background: #FFC000; padding: 28px 24px; display: flex; flex-direction: column; justify-content: space-between; color: #0f172a; box-sizing: border-box;">
          <div style="text-align: center;">
            <img src="${logo}" style="max-height: 52px; max-width: 180px; width: auto; height: auto; display: inline-block; object-fit: contain; margin-bottom: 8px;" />
            <h3 style="font-size: 20px; font-weight: 900; margin: 0; color: #0f172a;">Green Energy Solutions</h3>
            <p style="font-size: 12px; font-weight: 600; margin: 4px 0 0 0;">Maharashtra, India</p>
            <div style="width: 120px; height: 3px; background: #193047; margin: 12px auto; border-radius: 2px;"></div>
          </div>
          <div style="text-align: right; font-size: 13px; font-weight: 800; color: #0f172a; line-height: 1.6;">
            <div><span style="font-weight: 900;">Proposal ID :</span> ${propId}</div>
            <div><span style="font-weight: 900;">Date :</span> ${propDate}</div>
            <div><span style="font-weight: 900;">Prepared By :</span> ${byName}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- PAGE 2: ABOUT GREEN ENERGY SOLUTIONS -->
    <div class="quotation-document-page" style="width: 210mm; height: 297mm; min-width: 210mm; min-height: 297mm; max-width: 210mm; max-height: 297mm; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; font-family: Arial, sans-serif; position: relative; overflow: hidden; flex-shrink: 0; padding: 0;">
      <div style="padding: 36px 48px 0 48px; flex: 1;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; height: 48px;">
          <h3 style="font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase;">Company Profile</h3>
          <img src="${logo}" style="max-height: 44px; max-width: 160px; width: auto; height: auto; display: inline-block; object-fit: contain;" />
        </div>
        <div style="width: 100%; height: 250px; background: #f1f5f9 url('${engineer}') center center / cover no-repeat; border-radius: 6px 6px 0 0; border: 1px solid #cbd5e1; overflow: hidden; position: relative;">
        </div>
        <div style="background: #FFC000; padding: 12px 20px; text-align: right; margin-top: 0px; font-weight: 900; font-size: 14px; color: #0f172a; border-radius: 0 0 6px 6px;">
          GREEN ENERGY SOLUTIONS PVT. LTD
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
          <img src="${logo}" style="height: 48px; object-fit: contain;" />
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
      <div style="padding: 30px 40px 0 40px; flex: 1; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin: 0;">Technical System Design & Layout</h3>
          <img src="${logo}" style="height: 48px; object-fit: contain;" />
        </div>
        
        <!-- Large Centered High-Resolution 70% Area Design Layout Image -->
        <div style="flex: 1; display: flex; justify-content: center; align-items: center; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; padding: 16px; margin-bottom: 16px; max-height: 200mm;">
          <img src="${page4Img}" style="width: 100%; height: 100%; max-height: 190mm; object-fit: contain; border-radius: 6px;" />
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
          <div style="width: 120px; text-align: right;">
            <img src="${logo}" style="height: 44px; object-fit: contain;" />
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
          <!-- Notes & Bank Info 1 -->
          <div style="width: 34%; color: #334155; padding-right: 10px;">
            <p style="font-weight: 900; color: #0f172a; margin: 0 0 4px 0;">Notes: Bank Detail :</p>
            <p style="margin: 0;">Please Refer Detailed Terms & LTD</p>
            <p style="margin: 0;">for payment & Warranty Account</p>
            <p style="font-weight: 900; color: #0f172a; margin: 4px 0 0 0;">PRIVATE LIMITED</p>
            <p style="margin: 1px 0 0 0;">Account No.:- 18XXXX2858</p>
            <p style="margin: 1px 0 0 0;">IFSC :- ICIC0001836</p>
          </div>

          <!-- Bank Info 2 -->
          <div style="width: 36%; border-left: 1px solid #cbd5e1; padding: 0 10px; color: #334155;">
            <p style="margin: 22px 0 2px 0;">Condition Bank Name:- ICICI BANK</p>
            <p style="margin: 2px 0 0 0;">Name.:- XXXXXX XXXXXX</p>
            <p style="margin: 10px 0 0 0; font-weight: 800; color: #0f172a;">Branch:- KATARGAM - SURAT</p>
          </div>

          <!-- Signature Box -->
          <div style="width: 26%; border-left: 1px solid #cbd5e1; padding-left: 10px; text-align: center; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; min-height: 70px;">
            <p style="font-weight: 800; color: #0f172a; margin: 0; border-top: 1.5px solid #0f172a; padding-top: 4px; width: 100%; font-size: 10px;">Authorized Signature</p>
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
          <div style="width: 100px; text-align: right;">
            <img src="${logo}" style="height: 44px; object-fit: contain;" />
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
          <img src="${logo}" style="height: 38px; object-fit: contain;" />
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
            <img src="${logo}" style="height: 44px; object-fit: contain;" />
          </div>

          <!-- Review 1 Card -->
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #193047; border-radius: 6px; padding: 14px; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; margin-bottom: 6px;">
              <span style="color: #f59e0b; font-size: 14px;">★★★★★</span>
              <span style="font-size: 11px; font-weight: 800; color: #193047; margin-left: 8px;">Customer Review</span>
            </div>
            <p style="font-size: 11px; color: #334155; line-height: 1.6; margin: 0; font-style: italic;">
              "Extremely satisfied with rooftop solar power plant! The installation was smooth, professional, and on time. Great customer service and excellent quality."
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
              — Payalben hirpara
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
              — Kiranbhai prajapati
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

export const pdfService = {
  async generateQuotationPDF(q: Quotation, lead: Lead, creatorName: string): Promise<Blob> {
    const existingContainer = document.querySelector('.quotation-print-container') as HTMLElement;
    if (existingContainer) {
      try {
        return await generateQuotationDocumentPDF(existingContainer, `Solar_Quotation_${q.quotationNumber || 'EST'}.pdf`);
      } catch (err) {
        console.warn("DOM container capture note:", err);
      }
    }

    const tempDiv = document.createElement('div');
    tempDiv.className = 'quotation-print-container';
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '0';
    tempDiv.style.top = '0';
    tempDiv.style.width = '210mm';
    tempDiv.style.zIndex = '-9999';
    tempDiv.style.opacity = '0';
    tempDiv.style.pointerEvents = 'none';
    tempDiv.style.backgroundColor = '#ffffff';
    tempDiv.innerHTML = createNewQuotationProposalHtml(q, lead, creatorName);
    document.body.appendChild(tempDiv);

    try {
      const blob = await generateQuotationDocumentPDF(tempDiv, `Solar_Quotation_${q.quotationNumber || 'EST'}.pdf`);
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
      format: 'a4'
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
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(125, 204, 70, 26, 2, 2, 'FD');
        doc.addImage(sigDataUrl, 'PNG', 127, 206, 66, 22);
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
      format: 'a4'
    });

    const logoData = await getLogoBase64();

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
    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('DELIVERY CHALLAN', 196, 14, { align: 'right' });

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

    // Box 1: Deliver To (Customer)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, sec1Y, 90, 32, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, sec1Y, 90, 32, 2, 2, 'D');

    doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('DELIVER TO (CUSTOMER DETAILS)', 18, sec1Y + 6);

    doc.setDrawColor(203, 213, 225);
    doc.line(18, sec1Y + 8, 98, sec1Y + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`Client Name: ${ch.leadName}`, 18, sec1Y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
    doc.text(`Project Ref ID: ${ch.leadId}`, 18, sec1Y + 19.5);
    doc.text(`Destination: Client Site Address`, 18, sec1Y + 25);

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

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, currentY - 4.5, 182, 7.5, 'F');
      }

      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.text(`${idx + 1}`, 18, currentY);

      const prodName = item.productName.length > 55 ? item.productName.substring(0, 52) + '...' : item.productName;
      doc.text(prodName, 34, currentY);

      doc.setTextColor(slateGray[0], slateGray[1], slateGray[2]);
      doc.text(item.category ? item.category.replace('_', ' ').toUpperCase() : 'SOLAR PART', 140, currentY);

      doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(`${item.qty} UNITS`, 192, currentY, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      doc.setDrawColor(241, 245, 249);
      doc.line(14, currentY + 2.5, 196, currentY + 2.5);
      currentY += 7.5;
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

    // 3 Signature Columns (positioned right below acknowledgement)
    const signY = footerY + 22;

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
    doc.line(146, signY - 4, 196, signY - 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("FOR GREEN ENERGY SOLUTION", 146, signY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text("Authorized Dispatch Officer", 146, signY + 3.5);

    return doc.output('blob');
  }
};
