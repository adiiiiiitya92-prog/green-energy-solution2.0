import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { uploadPdfToFirebase } from './firebase';

export interface PDFGeneratorOptions {
  fileName?: string;
  quality?: number; // 0.1 to 1.0 (default 0.60 for ultra-low KB size)
  scale?: number;   // Canvas scale (default 1.3 for crisp text under 200 KB)
  uploadToFirebase?: boolean;
  firebasePath?: string;
}

/**
 * Completely purges modern unsupported CSS color functions (oklch, oklab, color-mix, lab, lch)
 * from cloned document style tags, stylesheets, and element inline styles before html2canvas runs.
 */
function sanitizeClonedDocumentForHtml2Canvas(clonedDoc: Document) {
  // 1. Sanitize all <style> blocks
  try {
    const styleTags = clonedDoc.querySelectorAll('style');
    styleTags.forEach((st) => {
      if (st.innerHTML && /(oklch|oklab|color-mix|lch|lab)/i.test(st.innerHTML)) {
        st.innerHTML = st.innerHTML.replace(/(oklch|oklab|color-mix|lch|lab)\([^)]+\)/gi, '#0f172a');
      }
    });
  } catch (_) {}

  // 2. Remove stylesheet rules containing oklch/oklab
  try {
    for (let i = 0; i < clonedDoc.styleSheets.length; i++) {
      const sheet = clonedDoc.styleSheets[i];
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (let j = rules.length - 1; j >= 0; j--) {
          const rule = rules[j];
          if (rule.cssText && /(oklch|oklab|color-mix|lch|lab)/i.test(rule.cssText)) {
            sheet.deleteRule(j);
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  // 3. Sanitize inline styles on elements
  try {
    const allEls = clonedDoc.querySelectorAll('*');
    allEls.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.style && htmlEl.style.cssText && /(oklch|oklab|color-mix|lch|lab)/i.test(htmlEl.style.cssText)) {
        htmlEl.style.cssText = htmlEl.style.cssText.replace(/(oklch|oklab|color-mix|lch|lab)\([^)]+\)/gi, '#0f172a');
      }
    });
  } catch (_) {}
}

/**
 * Generates an ultra-compact PDF from an HTML element or container,
 * with canvas compression to keep output file size under 150 KB - 250 KB.
 * Captures live A4 page targets (.dcr-page, .wcr-page, .annexure-proforma-page, .model-agreement-page)
 * and uploads directly to Backblaze B2 Storage.
 */
export async function generateOptimizedPDF(
  element: HTMLElement,
  options: PDFGeneratorOptions = {}
): Promise<{ pdfBlob: Blob; pdfUrl?: string; fileSizeKB: number }> {
  const quality = options.quality || 0.65;
  const scale = options.scale || 1.3;
  const fileName = options.fileName || `document_${Date.now()}.pdf`;

  // Find target pages in element or DOM
  let targets: HTMLElement[] = [];
  if (element) {
    const pagesInEl = Array.from(element.querySelectorAll('.dcr-page, .wcr-page, .annexure-proforma-page, .model-agreement-page')) as HTMLElement[];
    if (pagesInEl.length > 0) {
      targets = pagesInEl;
    } else if (
      element.classList.contains('dcr-page') ||
      element.classList.contains('wcr-page') ||
      element.classList.contains('annexure-proforma-page') ||
      element.classList.contains('model-agreement-page')
    ) {
      targets = [element];
    }
  }

  // Fallback if targets still empty: query document.body
  if (targets.length === 0) {
    const globalPages = Array.from(document.querySelectorAll('.dcr-page, .wcr-page, .annexure-proforma-page, .model-agreement-page')) as HTMLElement[];
    if (globalPages.length > 0) {
      targets = globalPages;
    } else if (element) {
      targets = [element];
    }
  }

  if (targets.length === 0) {
    throw new Error("No document page container found for PDF generation.");
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  for (let i = 0; i < targets.length; i++) {
    const targetEl = targets[i];
    
    // Ensure element is visible during canvas capture
    const originalDisplay = targetEl.style.display;
    const originalVisibility = targetEl.style.visibility;
    targetEl.style.display = 'flex';
    targetEl.style.visibility = 'visible';

    try {
      const canvas = await html2canvas(targetEl, {
        scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 8000,
        onclone: (clonedDoc) => {
          sanitizeClonedDocumentForHtml2Canvas(clonedDoc);

          // Ensure target page containers are 100% flex & visible in clone
          const pages = clonedDoc.querySelectorAll('.dcr-page, .wcr-page, .annexure-proforma-page, .model-agreement-page');
          pages.forEach((p) => {
            const pageEl = p as HTMLElement;
            pageEl.style.display = 'flex';
            pageEl.style.visibility = 'visible';
            pageEl.style.opacity = '1';
          });
        }
      });

      const imgData = canvas.toDataURL('image/jpeg', quality);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    } finally {
      targetEl.style.display = originalDisplay;
      targetEl.style.visibility = originalVisibility;
    }
  }

  const pdfBlob = pdf.output('blob');
  const fileSizeKB = parseFloat((pdfBlob.size / 1024).toFixed(1));
  console.log(`📄 PDF Generated Successfully: ${fileName} (${fileSizeKB} KB, ${targets.length} pages)`);

  let pdfUrl: string | undefined = undefined;
  if (options.uploadToFirebase && options.firebasePath) {
    pdfUrl = await uploadPdfToFirebase(pdfBlob, options.firebasePath);
    if (!pdfUrl) {
      throw new Error(`Failed to upload ${fileName} to Backblaze B2 Storage.`);
    }
  }

  return { pdfBlob, pdfUrl, fileSizeKB };
}

/**
 * Generates an exact 8-Page PDF from the live .quotation-print-container element.
 * Uses optimized canvas rendering and unblocks event loop for 0-lag ultra-fast generation.
 */
export async function generateQuotationDocumentPDF(
  container: HTMLElement,
  fileName: string = 'Solar_Quotation.pdf'
): Promise<Blob> {
  const pageElements = Array.from(container.querySelectorAll('.quotation-document-page')) as HTMLElement[];
  const targets = pageElements.length > 0 ? pageElements : [container];

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  for (let i = 0; i < targets.length; i++) {
    if (i > 0) await new Promise(resolve => setTimeout(resolve, 0));

    const pageEl = targets[i];
    pageEl.style.transform = 'none';

    const canvas = await html2canvas(pageEl, {
      scale: 1.35, // High resolution crisp text scale
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 3000,
      windowWidth: 794,   // Exact A4 width at 96 DPI for 1:1 pixel precision
      windowHeight: 1123, // Exact A4 height at 96 DPI for 1:1 pixel precision
      onclone: (clonedDoc) => {
        sanitizeClonedDocumentForHtml2Canvas(clonedDoc);
        const pages = clonedDoc.querySelectorAll('.quotation-document-page');
        pages.forEach((p) => {
          const pageHtml = p as HTMLElement;
          pageHtml.style.transform = 'none';
          pageHtml.style.margin = '0';
          pageHtml.style.padding = '0';
          pageHtml.style.boxShadow = 'none';
          pageHtml.style.border = 'none';
          pageHtml.style.position = 'relative';
          pageHtml.style.left = '0';
          pageHtml.style.top = '0';
        });
      }
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.82);
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }

  const pdfBlob = pdf.output('blob');
  console.log(`📄 High-Speed 8-Page Proposal PDF Generated: ${fileName} (${Math.round(pdfBlob.size / 1024)} KB)`);
  return pdfBlob;
}

/**
 * Direct print & save helper for browser isolated window print with low-KB optimization
 */
export function triggerOptimizedPrintWindow(htmlContent: string, title: string = 'SolarCRM Document') {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Please allow popups to open document print preview.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @media print {
            body { font-family: sans-serif; -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
            @page { margin: 10mm; size: A4; }
          }
        </style>
      </head>
      <body class="bg-white text-slate-800 p-4">
        ${htmlContent}
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
