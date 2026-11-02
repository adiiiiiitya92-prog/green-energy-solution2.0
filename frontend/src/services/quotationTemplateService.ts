import { fetchDocumentFromFirestore, saveRecordToFirestore } from './firebase';

export interface TemplateTextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  highlight?: string;
  fontSize?: number;
  fontFamily?: string;
}

export type TemplateTextOverride = string | { text: string; style?: TemplateTextStyle };
export type QuotationTextOverrides = Record<string, TemplateTextOverride>;

export type QuotationImageSlot = 'logo' | 'cover' | 'engineer' | 'layout' | 'stamp' | 'paymentQr';
export type QuotationImageOverrides = Partial<Record<QuotationImageSlot, string>>;

export const QUOTATION_IMAGE_SLOTS: { slot: QuotationImageSlot; label: string; hint: string; maxDim: number; keepPng: boolean }[] = [
  { slot: 'logo', label: 'Company Logo', hint: 'Top of every page', maxDim: 900, keepPng: true },
  { slot: 'cover', label: 'Cover Page Background', hint: 'Page 1 (A4 portrait)', maxDim: 1800, keepPng: false },
  { slot: 'engineer', label: 'Company Profile Photo', hint: 'Page 2 banner', maxDim: 1600, keepPng: false },
  { slot: 'layout', label: 'System Design Image', hint: 'Page 4 layout', maxDim: 1800, keepPng: false },
  { slot: 'stamp', label: 'Stamp / Signature', hint: 'Page 5', maxDim: 700, keepPng: true },
  { slot: 'paymentQr', label: 'Payment QR Code', hint: 'Page 5', maxDim: 700, keepPng: true }
];

export const TEMPLATE_FONTS = ['Arial', 'Segoe UI', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New'];

interface QuotationTemplateDoc {
  id: string;
  overrides: QuotationTextOverrides;
  imagesVersion?: string;
  updatedAt: string;
  updatedBy?: string;
}

interface QuotationImagesDoc {
  id: string;
  images: QuotationImageOverrides;
  version: string;
}

const COLLECTION = 'systemSettings';
const TEXT_DOC_ID = 'quotationTemplate';
const IMAGES_DOC_ID = 'quotationTemplateImages';
const LS_TEXT = 'quotationTextOverrides';
const LS_IMAGES = 'quotationImageOverrides';
export const QUOTATION_TEMPLATE_EVENT = 'quotation-template-updated';

export const normalizeTemplateText = (s: string) => s.replace(/\s+/g, ' ').trim();

const readLS = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
};

const writeLS = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // images can exceed the storage quota; the in-memory copy still works for this session
  }
};

// Image values are interpolated into the template HTML, so only plain base64 image data URLs are accepted.
const SAFE_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const cleanImages = (imgs: any): QuotationImageOverrides => {
  const out: QuotationImageOverrides = {};
  for (const { slot } of QUOTATION_IMAGE_SLOTS) {
    if (typeof imgs?.[slot] === 'string' && SAFE_IMAGE.test(imgs[slot])) out[slot] = imgs[slot];
  }
  return out;
};

let textCache: QuotationTextOverrides = readLS(LS_TEXT, {});
let imageCache: { version: string; images: QuotationImageOverrides } = (() => {
  const c = readLS<{ version?: string; images?: unknown }>(LS_IMAGES, {});
  return { version: c.version || '', images: cleanImages(c.images) };
})();

const notify = () => window.dispatchEvent(new CustomEvent(QUOTATION_TEMPLATE_EVENT));

export const getQuotationTextOverrides = (): QuotationTextOverrides => textCache;
export const getQuotationImageOverrides = (): QuotationImageOverrides => imageCache.images;

export async function loadQuotationTemplate(): Promise<{ texts: QuotationTextOverrides; images: QuotationImageOverrides }> {
  const doc = await fetchDocumentFromFirestore<QuotationTemplateDoc>(COLLECTION, TEXT_DOC_ID);
  if (doc) {
    textCache = doc.overrides || {};
    writeLS(LS_TEXT, textCache);
    const wanted = doc.imagesVersion || '';
    if (wanted !== imageCache.version) {
      const imgDoc = wanted ? await fetchDocumentFromFirestore<QuotationImagesDoc>(COLLECTION, IMAGES_DOC_ID, 30000) : null;
      imageCache = { version: wanted, images: cleanImages(imgDoc?.images) };
      writeLS(LS_IMAGES, imageCache);
    }
    notify();
  }
  return { texts: textCache, images: imageCache.images };
}

export async function saveQuotationTemplate(texts: QuotationTextOverrides, images: QuotationImageOverrides, updatedBy?: string) {
  let imagesVersion = imageCache.version;
  if (JSON.stringify(images) !== JSON.stringify(imageCache.images)) {
    imagesVersion = Object.keys(images).length ? String(Date.now()) : '';
    await saveRecordToFirestore(COLLECTION, IMAGES_DOC_ID, { id: IMAGES_DOC_ID, images, version: imagesVersion } as QuotationImagesDoc);
    imageCache = { version: imagesVersion, images };
    writeLS(LS_IMAGES, imageCache);
  }
  const doc: QuotationTemplateDoc = { id: TEXT_DOC_ID, overrides: texts, imagesVersion, updatedAt: new Date().toISOString(), updatedBy };
  await saveRecordToFirestore(COLLECTION, TEXT_DOC_ID, doc);
  textCache = texts;
  writeLS(LS_TEXT, textCache);
  notify();
}

export const overrideText = (o: TemplateTextOverride) => (typeof o === 'string' ? o : o.text);
export const overrideStyle = (o: TemplateTextOverride | undefined) => (o && typeof o !== 'string' ? o.style : undefined);

const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;

export function templateStyleToCss(s?: TemplateTextStyle): string {
  if (!s) return '';
  const css: string[] = [];
  if (s.bold !== undefined) css.push(`font-weight:${s.bold ? 800 : 400}`);
  if (s.italic !== undefined) css.push(`font-style:${s.italic ? 'italic' : 'normal'}`);
  if (s.underline) css.push('text-decoration:underline');
  if (s.color && SAFE_COLOR.test(s.color)) css.push(`color:${s.color}`);
  if (s.highlight && SAFE_COLOR.test(s.highlight)) css.push(`background-color:${s.highlight};padding:0 2px;border-radius:2px`);
  if (s.fontSize && s.fontSize >= 6 && s.fontSize <= 96) css.push(`font-size:${Math.round(s.fontSize * 10) / 10}px`);
  if (s.fontFamily && TEMPLATE_FONTS.includes(s.fontFamily)) css.push(`font-family:'${s.fontFamily}',sans-serif`);
  return css.join(';');
}

// Text nodes are matched by their whitespace-normalised content, so an edit applies wherever that exact text appears.
export function applyQuotationTextOverrides(html: string, overrides: QuotationTextOverrides = textCache): string {
  if (!overrides || Object.keys(overrides).length === 0 || typeof document === 'undefined') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  while (walker.nextNode()) {
    const key = normalizeTemplateText(walker.currentNode.nodeValue || '');
    if (key && key in overrides) hits.push(walker.currentNode as Text);
  }
  for (const node of hits) {
    const raw = node.nodeValue || '';
    const o = overrides[normalizeTemplateText(raw)];
    const lead = raw.match(/^\s*/)?.[0] || '';
    const trail = raw.match(/\s*$/)?.[0] || '';
    const css = templateStyleToCss(overrideStyle(o));
    if (!css) {
      node.nodeValue = lead + overrideText(o) + trail;
      continue;
    }
    const span = document.createElement('span');
    span.setAttribute('style', css);
    span.textContent = overrideText(o);
    node.replaceWith(lead, span, trail);
  }
  return tpl.innerHTML;
}

export function compressTemplateImage(file: File, maxDim: number, keepPng: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      const png = keepPng && file.type === 'image/png';
      if (!png) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file is not a readable image'));
    };
    img.src = url;
  });
}
