import { fetchDocumentFromFirestore, saveRecordToFirestore } from './firebase';

export type QuotationTextOverrides = Record<string, string>;

interface QuotationTemplateDoc {
  id: string;
  overrides: QuotationTextOverrides;
  updatedAt: string;
  updatedBy?: string;
}

const COLLECTION = 'systemSettings';
const DOC_ID = 'quotationTemplate';
const LS_KEY = 'quotationTextOverrides';
export const QUOTATION_TEMPLATE_EVENT = 'quotation-template-updated';

export const normalizeTemplateText = (s: string) => s.replace(/\s+/g, ' ').trim();

let cache: QuotationTextOverrides = (() => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
  } catch {
    return {};
  }
})();

const setCache = (overrides: QuotationTextOverrides) => {
  cache = overrides || {};
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cache));
  } catch {}
  window.dispatchEvent(new CustomEvent(QUOTATION_TEMPLATE_EVENT));
};

export const getQuotationTextOverrides = (): QuotationTextOverrides => cache;

export async function loadQuotationTextOverrides(): Promise<QuotationTextOverrides> {
  const doc = await fetchDocumentFromFirestore<QuotationTemplateDoc>(COLLECTION, DOC_ID);
  if (doc) setCache(doc.overrides || {});
  return cache;
}

export async function saveQuotationTextOverrides(overrides: QuotationTextOverrides, updatedBy?: string) {
  const doc: QuotationTemplateDoc = { id: DOC_ID, overrides, updatedAt: new Date().toISOString(), updatedBy };
  await saveRecordToFirestore(COLLECTION, DOC_ID, doc);
  setCache(overrides);
}

// Text nodes are matched by their whitespace-normalised content, so an edit applies wherever that exact text appears.
export function applyQuotationTextOverrides(html: string, overrides: QuotationTextOverrides = cache): string {
  if (!overrides || Object.keys(overrides).length === 0 || typeof document === 'undefined') return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const raw = node.nodeValue || '';
    const key = normalizeTemplateText(raw);
    if (!key || !(key in overrides)) continue;
    const lead = raw.match(/^\s*/)?.[0] || '';
    const trail = raw.match(/\s*$/)?.[0] || '';
    node.nodeValue = lead + overrides[key] + trail;
  }
  return tpl.innerHTML;
}
