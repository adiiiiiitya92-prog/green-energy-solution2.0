import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileEdit, Save, RotateCcw, Loader2, Undo2, CheckCircle2, Bold, Italic, Underline,
  Highlighter, Type, Eraser, ImagePlus, Image as ImageIcon, Palette
} from 'lucide-react';
import { buildRawQuotationProposalHtml, getDefaultQuotationImages } from '../../services/pdfService';
import {
  loadQuotationTemplate,
  getQuotationTextOverrides,
  getQuotationImageOverrides,
  saveQuotationTemplate,
  normalizeTemplateText,
  templateStyleToCss,
  compressTemplateImage,
  overrideText,
  overrideStyle,
  QUOTATION_IMAGE_SLOTS,
  TEMPLATE_FONTS,
  type QuotationTextOverrides,
  type QuotationImageOverrides,
  type QuotationImageSlot,
  type TemplateTextStyle
} from '../../services/quotationTemplateService';
import { useAuthStore } from '../../store/authStore';

const SAMPLE_A = {
  consumerName: 'Rahul Sharma',
  consumerMobile: '+91 9876543210',
  consumerEmail: 'rahul.sharma@example.com',
  proposalId: 'EST-1001',
  proposalDate: '01 Nov, 2026',
  createdBy: 'Sales Executive',
  city: 'Nagpur',
  statePin: 'Maharashtra 440001',
  systemCapacity: '5',
  pvModuleMake: 'Waaree',
  inverterMake: 'Growatt',
  items: [{ itemName: '5 kW Residential Solar Rooftop Plant', brand: 'Waaree / Growatt', description: 'On-grid system with net metering', qty: 1, rate: 250000, amount: 250000, unit: 'Nos' }],
  bomItems: [
    { itemName: 'Solar PV Module 540Wp', qty: 10, unit: 'Nos', brand: 'Waaree', category: 'Solar Panels' },
    { itemName: 'On-Grid Inverter 5 kW', qty: 1, unit: 'Nos', brand: 'Growatt', category: 'Inverter' },
    { itemName: 'GI Mounting Structure', qty: 1, unit: 'Set', brand: 'As specified', category: 'Structure' }
  ],
  subtotal: 250000,
  subsidyAmount: 78000,
  gstRate: 13.8
};

// A second, fully different dataset: any text that differs between the two renders is customer data, not template text.
const SAMPLE_B = {
  consumerName: 'Priya Verma Kulkarni',
  consumerMobile: '+91 9123456780',
  consumerEmail: 'other@example.org',
  proposalId: 'QT-7777',
  proposalDate: '15 Mar, 2025',
  createdBy: 'Another Person',
  city: 'Pune',
  statePin: 'Goa 403001',
  systemCapacity: '9',
  pvModuleMake: 'Adani',
  inverterMake: 'Sungrow',
  items: [{ itemName: 'Commercial Plant XYZ', brand: 'Brand Q', description: 'Different description', qty: 3, rate: 111111, amount: 333333, unit: 'Kw' }],
  bomItems: [],
  subtotal: 333333,
  subsidyAmount: 30000,
  gstRate: 8.9
};

const HIGHLIGHTS = ['#fde047', '#86efac', '#f9a8d4', '#93c5fd', '#fdba74'];
const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48];

interface Entry {
  text: string;
  style?: TemplateTextStyle;
}
type Draft = Record<string, Entry>;

const toDraft = (o: QuotationTextOverrides): Draft =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { text: overrideText(v), style: overrideStyle(v) }]));

const hasStyle = (s?: TemplateTextStyle) => !!s && Object.values(s).some(v => v !== undefined && v !== false && v !== '');

const toOverrides = (d: Draft): QuotationTextOverrides => {
  const out: QuotationTextOverrides = {};
  for (const [k, e] of Object.entries(d)) {
    if (hasStyle(e.style)) out[k] = { text: e.text, style: e.style };
    else if (e.text !== k) out[k] = e.text;
  }
  return out;
};

const collectTextKeys = (html: string) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const keys = new Set<string>();
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const k = normalizeTemplateText(walker.currentNode.nodeValue || '');
    if (k) keys.add(k);
  }
  return keys;
};

const makeEditable = (el: HTMLElement) => {
  try {
    el.contentEditable = 'plaintext-only';
  } catch {
    el.contentEditable = 'true';
  }
};

const ToolBtn: React.FC<{ active?: boolean; disabled?: boolean; title: string; onClick: () => void; children: React.ReactNode }> = ({ active, disabled, title, onClick, children }) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    onMouseDown={e => e.preventDefault()}
    onClick={onClick}
    className={`h-8 min-w-8 px-2 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      active ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
    }`}
  >
    {children}
  </button>
);

export const QuotationTemplateEditor: React.FC = () => {
  const { currentUser } = useAuthStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef<QuotationImageSlot | null>(null);
  const staticKeysRef = useRef<Set<string> | null>(null);
  const draftRef = useRef<Draft>({});
  const imagesRef = useRef<QuotationImageOverrides>({});
  const savedRef = useRef<string>('');
  const [draft, setDraft] = useState<Draft>({});
  const [images, setImages] = useState<QuotationImageOverrides>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<QuotationImageSlot | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const defaults = React.useMemo(() => getDefaultQuotationImages(), []);

  const snapshot = (d: Draft, imgs: QuotationImageOverrides) => JSON.stringify({ t: toOverrides(d), i: imgs });

  const commitDraft = (next: Draft) => {
    draftRef.current = next;
    setDraft({ ...next });
    setSavedAt(null);
  };

  const spansFor = (key: string) =>
    Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('[data-qk]') || []).filter(s => s.dataset.qk === key);

  const paintSpan = (span: HTMLElement, key: string, entry?: Entry) => {
    span.setAttribute('style', templateStyleToCss(entry?.style));
    span.classList.toggle('qt-edited', !!entry && (entry.text !== key || hasStyle(entry.style)));
  };

  const renderCanvas = useCallback((d: Draft, imgs: QuotationImageOverrides) => {
    const root = canvasRef.current;
    if (!root) return;
    if (!staticKeysRef.current) {
      staticKeysRef.current = collectTextKeys(buildRawQuotationProposalHtml(SAMPLE_B, null, SAMPLE_B.createdBy, {}));
    }
    const staticKeys = staticKeysRef.current;
    root.innerHTML = buildRawQuotationProposalHtml(SAMPLE_A, null, SAMPLE_A.createdBy, imgs);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const t of nodes) {
      const raw = t.nodeValue || '';
      const key = normalizeTemplateText(raw);
      if (!key || !staticKeys.has(key) || t.parentElement?.closest('style,script')) continue;
      const span = document.createElement('span');
      span.dataset.qk = key;
      span.className = 'qt-edit';
      span.spellcheck = false;
      span.textContent = d[key]?.text ?? key;
      paintSpan(span, key, d[key]);
      makeEditable(span);
      // keep surrounding whitespace outside the span so inline words don't run together
      t.replaceWith(raw.match(/^\s*/)?.[0] || '', span, raw.match(/\s*$/)?.[0] || '');
    }

    const current = { ...getDefaultQuotationImages(), ...imgs };
    const bySrc = new Map(Object.entries(current).map(([slot, src]) => [src, slot]));
    root.querySelectorAll('img').forEach(img => {
      const slot = bySrc.get(img.getAttribute('src') || '');
      if (slot) {
        img.dataset.slot = slot;
        img.title = 'Click to replace this image';
      }
    });
    const cover = root.querySelector<HTMLElement>('.quotation-document-page');
    if (cover) {
      cover.dataset.slot = 'cover';
      cover.title = 'Click an empty area to replace the cover background';
    }
  }, []);

  useEffect(() => {
    let alive = true;
    loadQuotationTemplate()
      .catch(() => ({ texts: getQuotationTextOverrides(), images: getQuotationImageOverrides() }))
      .then(({ texts, images: imgs }) => {
        if (!alive) return;
        const d = toDraft(texts);
        draftRef.current = d;
        imagesRef.current = { ...imgs };
        setDraft(d);
        setImages({ ...imgs });
        savedRef.current = snapshot(d, imgs);
        setLoading(false);
        requestAnimationFrame(() => renderCanvas(d, imgs));
      });
    return () => {
      alive = false;
    };
  }, [renderCanvas]);

  const updateEntry = (key: string, patch: (e: Entry) => Entry, skip?: HTMLElement) => {
    const prev = draftRef.current[key] || { text: key };
    const nextEntry = patch(prev);
    const next = { ...draftRef.current };
    if (nextEntry.text === key && !hasStyle(nextEntry.style)) delete next[key];
    else next[key] = nextEntry;
    for (const s of spansFor(key)) {
      if (s !== skip && s.textContent !== nextEntry.text) s.textContent = nextEntry.text;
      paintSpan(s, key, next[key]);
    }
    commitDraft(next);
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const span = (e.target as HTMLElement).closest<HTMLElement>('[data-qk]');
    if (!span) return;
    updateEntry(span.dataset.qk!, en => ({ ...en, text: normalizeTemplateText(span.textContent || '') }), span);
  };

  const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const span = (e.target as HTMLElement).closest<HTMLElement>('[data-qk]');
    if (span) setActiveKey(span.dataset.qk!);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).closest('[data-qk]')) {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest('[data-qk]')) return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-qk]')) return;
    const slot = el.tagName === 'IMG' ? el.dataset.slot : el.dataset.slot === 'cover' ? 'cover' : undefined;
    if (slot) pickImage(slot as QuotationImageSlot);
  };

  // ---------- styling ----------
  const activeStyle: TemplateTextStyle = (activeKey && draft[activeKey]?.style) || {};
  const computed = (() => {
    const span = activeKey ? spansFor(activeKey)[0] : null;
    if (!span) return null;
    const cs = getComputedStyle(span);
    return { bold: parseInt(cs.fontWeight, 10) >= 600, italic: cs.fontStyle === 'italic', size: parseFloat(cs.fontSize) };
  })();

  const setStyle = (patch: Partial<TemplateTextStyle> | null) => {
    if (!activeKey) return;
    updateEntry(activeKey, en => {
      if (patch === null) return { text: en.text };
      const style = { ...(en.style || {}), ...patch };
      (Object.keys(style) as (keyof TemplateTextStyle)[]).forEach(k => style[k] === undefined && delete style[k]);
      return { ...en, style };
    });
  };

  // ---------- images ----------
  const pickImage = (slot: QuotationImageSlot) => {
    pendingSlot.current = slot;
    fileRef.current?.click();
  };

  const applyImages = (next: QuotationImageOverrides) => {
    imagesRef.current = next;
    setImages({ ...next });
    setSavedAt(null);
    renderCanvas(draftRef.current, next);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const slot = pendingSlot.current;
    if (!file || !slot) return;
    const cfg = QUOTATION_IMAGE_SLOTS.find(s => s.slot === slot)!;
    setUploadingSlot(slot);
    try {
      const dataUrl = await compressTemplateImage(file, cfg.maxDim, cfg.keepPng);
      if (dataUrl.length > 4 * 1024 * 1024) {
        alert('This image is too large even after compression. Please use a smaller image.');
        return;
      }
      applyImages({ ...imagesRef.current, [slot]: dataUrl });
    } catch (err: any) {
      alert(err?.message || 'Could not read this image.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const resetImage = (slot: QuotationImageSlot) => {
    const next = { ...imagesRef.current };
    delete next[slot];
    applyImages(next);
  };

  // ---------- save / reset ----------
  const revertKey = (key: string) => updateEntry(key, () => ({ text: key }));

  const resetAll = () => {
    if (!confirm('Reset ALL quotation text, formatting and images back to the original template? (Save to apply.)')) return;
    draftRef.current = {};
    setDraft({});
    setActiveKey(null);
    applyImages({});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveQuotationTemplate(toOverrides(draftRef.current), imagesRef.current, currentUser?.fullName);
      savedRef.current = snapshot(draftRef.current, imagesRef.current);
      setSavedAt(Date.now());
    } catch (err) {
      console.error(err);
      alert('Could not save the quotation template. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const editedEntries = Object.entries(draft);
  const dirty = !loading && snapshot(draft, images) !== savedRef.current;
  const off = !activeKey;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
      <style>{`
        .qt-canvas { display: flex; flex-direction: column; align-items: center; gap: 18px; }
        .qt-canvas .quotation-document-page { box-shadow: 0 4px 18px rgba(15,23,42,.12); }
        .qt-canvas .qt-edit { cursor: text; border-radius: 2px; outline: 1px dashed transparent; outline-offset: 1px; }
        .qt-canvas .qt-edit:hover { outline-color: #10b981; }
        .qt-canvas .qt-edit:focus { outline: 2px solid #10b981; }
        .qt-canvas .qt-edit.qt-edited { box-shadow: inset 0 -2px 0 #f59e0b; }
        .qt-canvas .qt-edit:empty::before { content: '[empty]'; opacity: .45; font-style: italic; }
        .qt-canvas img[data-slot] { cursor: pointer; transition: outline-color .15s; outline: 2px dashed transparent; outline-offset: 2px; }
        .qt-canvas img[data-slot]:hover { outline-color: #0ea5e9; }
      `}</style>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-1.5 text-emerald-700">
            <FileEdit className="w-5 h-5" />
            <span>Quotation Template Editor</span>
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Click any text in the preview to change it, then use the toolbar for bold, size, font, colour or highlight.
            Click an image (or the images below) to replace it. Everything applies to new quotations after you save.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={resetAll}
            disabled={loading || saving}
            className="px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" /> Reset All
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || saving || !dirty}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {dirty ? 'Save Template' : 'Saved'}
          </button>
        </div>
      </div>

      {savedAt && !dirty && (
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          <CheckCircle2 className="w-4 h-4" /> Template saved. New quotations will use the updated text and images.
        </div>
      )}

      {/* Images */}
      <div>
        <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <ImageIcon className="w-4 h-4" /> Images
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {QUOTATION_IMAGE_SLOTS.map(cfg => {
            const custom = !!images[cfg.slot];
            return (
              <div key={cfg.slot} className={`rounded-xl border p-2 space-y-1.5 ${custom ? 'border-sky-300 bg-sky-50/50' : 'border-slate-200 bg-slate-50/50'}`}>
                <div className="h-20 rounded-lg bg-white border border-slate-100 flex items-center justify-center overflow-hidden">
                  {uploadingSlot === cfg.slot ? (
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  ) : (
                    <img src={images[cfg.slot] || defaults[cfg.slot]} alt={cfg.label} className="max-h-full max-w-full object-contain" />
                  )}
                </div>
                <p className="text-[11px] font-black text-slate-800 leading-tight">{cfg.label}</p>
                <p className="text-[10px] text-slate-400 leading-tight">{cfg.hint}{custom ? ' • custom' : ''}</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => pickImage(cfg.slot)}
                    disabled={loading || !!uploadingSlot}
                    className="flex-1 px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <ImagePlus className="w-3 h-3" /> Change
                  </button>
                  {custom && (
                    <button
                      type="button"
                      onClick={() => resetImage(cfg.slot)}
                      title="Use the original image"
                      className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[10px] font-bold cursor-pointer"
                    >
                      <Undo2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editedEntries.length > 0 && (
        <details className="bg-amber-50/60 border border-amber-200 rounded-xl px-3 py-2">
          <summary className="text-xs font-black text-amber-800 cursor-pointer">
            {editedEntries.length} text change{editedEntries.length > 1 ? 's' : ''}{dirty ? ' (unsaved)' : ''}
          </summary>
          <ul className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
            {editedEntries.map(([from, e]) => (
              <li key={from} className="flex items-start justify-between gap-2 text-[11px] bg-white rounded-lg border border-amber-100 p-2">
                <div className="min-w-0">
                  {e.text !== from && <p className="text-slate-400 line-through break-words">{from}</p>}
                  <p className="text-slate-800 font-semibold break-words">
                    <span style={hasStyle(e.style) ? (Object.fromEntries(templateStyleToCss(e.style).split(';').filter(Boolean).map(p => {
                      const [k, v] = p.split(':');
                      return [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v];
                    })) as React.CSSProperties) : undefined}>
                      {e.text || <em className="text-slate-400">(removed)</em>}
                    </span>
                    {hasStyle(e.style) && <span className="ml-1.5 text-[9px] font-black text-sky-700 bg-sky-100 px-1 rounded">formatted</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revertKey(from)}
                  className="shrink-0 px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Undo2 className="w-3 h-3" /> Undo
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="bg-slate-100 rounded-xl overflow-auto max-h-[85vh] relative">
        {/* Formatting toolbar */}
        <div className="sticky top-0 left-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-3 py-2 space-y-1.5">
          <p className="text-[10px] font-bold text-slate-500 truncate">
            {activeKey ? (
              <>Formatting: <span className="text-slate-800">“{(draft[activeKey]?.text ?? activeKey).slice(0, 70)}”</span></>
            ) : (
              'Click any text in the preview to edit and format it'
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <ToolBtn title="Bold" disabled={off} active={activeStyle.bold ?? computed?.bold} onClick={() => setStyle({ bold: !(activeStyle.bold ?? computed?.bold) })}>
              <Bold className="w-3.5 h-3.5" />
            </ToolBtn>
            <ToolBtn title="Italic" disabled={off} active={activeStyle.italic ?? computed?.italic} onClick={() => setStyle({ italic: !(activeStyle.italic ?? computed?.italic) })}>
              <Italic className="w-3.5 h-3.5" />
            </ToolBtn>
            <ToolBtn title="Underline" disabled={off} active={!!activeStyle.underline} onClick={() => setStyle({ underline: !activeStyle.underline || undefined })}>
              <Underline className="w-3.5 h-3.5" />
            </ToolBtn>

            <span className="w-px h-6 bg-slate-200 mx-0.5" />

            <label className={`h-8 inline-flex items-center gap-1 px-1.5 rounded-lg border border-slate-200 bg-white ${off ? 'opacity-40' : ''}`} title="Font size">
              <Type className="w-3.5 h-3.5 text-slate-500" />
              <select
                disabled={off}
                value={activeStyle.fontSize ?? ''}
                onChange={e => setStyle({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
                className="text-xs font-bold bg-transparent outline-none cursor-pointer"
              >
                <option value="">{computed ? `${Math.round(computed.size * 10) / 10}px` : 'Size'}</option>
                {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
              </select>
            </label>
            <select
              disabled={off}
              value={activeStyle.fontFamily ?? ''}
              onChange={e => setStyle({ fontFamily: e.target.value || undefined })}
              className="h-8 px-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold outline-none cursor-pointer disabled:opacity-40"
              title="Font"
            >
              <option value="">Default font</option>
              {TEMPLATE_FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>

            <span className="w-px h-6 bg-slate-200 mx-0.5" />

            <label className={`h-8 inline-flex items-center gap-1 px-1.5 rounded-lg border border-slate-200 bg-white cursor-pointer ${off ? 'opacity-40 pointer-events-none' : ''}`} title="Text colour">
              <Palette className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="color"
                disabled={off}
                value={activeStyle.color || '#0f172a'}
                onChange={e => setStyle({ color: e.target.value })}
                className="w-6 h-5 p-0 border-0 bg-transparent cursor-pointer"
              />
            </label>

            <span className="inline-flex items-center gap-1 h-8 px-1.5 rounded-lg border border-slate-200 bg-white" title="Highlight">
              <Highlighter className={`w-3.5 h-3.5 text-slate-500 ${off ? 'opacity-40' : ''}`} />
              {HIGHLIGHTS.map(c => (
                <button
                  key={c}
                  type="button"
                  disabled={off}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setStyle({ highlight: activeStyle.highlight === c ? undefined : c })}
                  className={`w-5 h-5 rounded border cursor-pointer disabled:opacity-40 ${activeStyle.highlight === c ? 'ring-2 ring-emerald-600 border-white' : 'border-slate-300'}`}
                  style={{ background: c }}
                  title={`Highlight ${c}`}
                />
              ))}
              <input
                type="color"
                disabled={off}
                value={activeStyle.highlight || '#fde047'}
                onChange={e => setStyle({ highlight: e.target.value })}
                className="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer disabled:opacity-40"
                title="Custom highlight colour"
              />
            </span>

            <ToolBtn title="Remove formatting" disabled={off || !hasStyle(activeStyle)} onClick={() => setStyle(null)}>
              <Eraser className="w-3.5 h-3.5" /> Clear
            </ToolBtn>
            {activeKey && draft[activeKey] && (
              <ToolBtn title="Undo all changes to this text" onClick={() => revertKey(activeKey)}>
                <Undo2 className="w-3.5 h-3.5" /> Original
              </ToolBtn>
            )}
          </div>
        </div>

        <div className="p-3 sm:p-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-10">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading template…
            </div>
          )}
          <div
            ref={canvasRef}
            className="qt-canvas"
            onInput={handleInput}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onClick={handleCanvasClick}
          />
        </div>
      </div>
    </div>
  );
};
