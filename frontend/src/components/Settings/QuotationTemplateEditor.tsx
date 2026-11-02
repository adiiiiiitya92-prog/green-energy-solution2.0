import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileEdit, Save, RotateCcw, Loader2, Undo2, CheckCircle2 } from 'lucide-react';
import { buildRawQuotationProposalHtml } from '../../services/pdfService';
import {
  loadQuotationTextOverrides,
  getQuotationTextOverrides,
  saveQuotationTextOverrides,
  normalizeTemplateText,
  type QuotationTextOverrides
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

export const QuotationTemplateEditor: React.FC = () => {
  const { currentUser } = useAuthStore();
  const canvasRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<QuotationTextOverrides>({});
  const savedRef = useRef<string>('{}');
  const [draft, setDraft] = useState<QuotationTextOverrides>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const commitDraft = (next: QuotationTextOverrides) => {
    draftRef.current = next;
    setDraft({ ...next });
  };

  const spansFor = (key: string) =>
    Array.from(canvasRef.current?.querySelectorAll<HTMLElement>('[data-qk]') || []).filter(s => s.dataset.qk === key);

  const renderCanvas = useCallback((overrides: QuotationTextOverrides) => {
    const root = canvasRef.current;
    if (!root) return;
    const staticKeys = collectTextKeys(buildRawQuotationProposalHtml(SAMPLE_B, null, SAMPLE_B.createdBy));
    root.innerHTML = buildRawQuotationProposalHtml(SAMPLE_A, null, SAMPLE_A.createdBy);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const t of nodes) {
      const raw = t.nodeValue || '';
      const key = normalizeTemplateText(raw);
      if (!key || !staticKeys.has(key) || t.parentElement?.closest('style,script')) continue;
      const span = document.createElement('span');
      span.dataset.qk = key;
      span.className = 'qt-edit' + (key in overrides ? ' qt-edited' : '');
      span.spellcheck = false;
      span.title = 'Click to edit';
      span.textContent = key in overrides ? overrides[key] : key;
      makeEditable(span);
      // keep surrounding whitespace outside the span so inline words don't run together
      t.replaceWith(raw.match(/^\s*/)?.[0] || '', span, raw.match(/\s*$/)?.[0] || '');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    loadQuotationTextOverrides()
      .catch(() => getQuotationTextOverrides())
      .then(loaded => {
        if (!alive) return;
        const current = { ...loaded };
        savedRef.current = JSON.stringify(current);
        commitDraft(current);
        setLoading(false);
        requestAnimationFrame(() => renderCanvas(current));
      });
    return () => {
      alive = false;
    };
  }, [renderCanvas]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const span = (e.target as HTMLElement).closest<HTMLElement>('[data-qk]');
    if (!span) return;
    const key = span.dataset.qk!;
    const value = normalizeTemplateText(span.textContent || '');
    const next = { ...draftRef.current };
    if (value === key) delete next[key];
    else next[key] = value;
    for (const s of spansFor(key)) {
      if (s !== span) s.textContent = value;
      s.classList.toggle('qt-edited', value !== key);
    }
    commitDraft(next);
    setSavedAt(null);
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

  const revertKey = (key: string) => {
    const next = { ...draftRef.current };
    delete next[key];
    for (const s of spansFor(key)) {
      s.textContent = key;
      s.classList.remove('qt-edited');
    }
    commitDraft(next);
    setSavedAt(null);
  };

  const resetAll = () => {
    if (!confirm('Reset ALL quotation text back to the original template? (Save to apply.)')) return;
    commitDraft({});
    renderCanvas({});
    setSavedAt(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const clean = { ...draftRef.current };
      await saveQuotationTextOverrides(clean, currentUser?.fullName);
      savedRef.current = JSON.stringify(clean);
      setSavedAt(Date.now());
    } catch (err) {
      console.error(err);
      alert('Could not save the quotation template. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const editedEntries = Object.entries(draft);
  const dirty = JSON.stringify(draft) !== savedRef.current;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
      <style>{`
        .qt-canvas { display: flex; flex-direction: column; align-items: center; gap: 18px; }
        .qt-canvas .quotation-document-page { box-shadow: 0 4px 18px rgba(15,23,42,.12); }
        .qt-canvas .qt-edit { cursor: text; border-radius: 2px; outline: 1px dashed transparent; outline-offset: 1px; }
        .qt-canvas .qt-edit:hover { outline-color: #10b981; background: rgba(16,185,129,.10); }
        .qt-canvas .qt-edit:focus { outline: 2px solid #10b981; background: rgba(16,185,129,.16); }
        .qt-canvas .qt-edit.qt-edited { background: rgba(250,204,21,.45); }
        .qt-canvas .qt-edit:empty::before { content: '[empty]'; opacity: .45; font-style: italic; }
      `}</style>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-1.5 text-emerald-700">
            <FileEdit className="w-5 h-5" />
            <span>Quotation Template Text</span>
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Click any text in the preview below and type to change it. Changes apply to every quotation created after you save.
            Customer details, prices and items come from each quotation and can't be edited here.
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
          <CheckCircle2 className="w-4 h-4" /> Template saved. New quotations will use the updated text.
        </div>
      )}

      {editedEntries.length > 0 && (
        <details className="bg-amber-50/60 border border-amber-200 rounded-xl px-3 py-2" open={editedEntries.length <= 5}>
          <summary className="text-xs font-black text-amber-800 cursor-pointer">
            {editedEntries.length} text change{editedEntries.length > 1 ? 's' : ''}{dirty ? ' (unsaved)' : ''}
          </summary>
          <ul className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
            {editedEntries.map(([from, to]) => (
              <li key={from} className="flex items-start justify-between gap-2 text-[11px] bg-white rounded-lg border border-amber-100 p-2">
                <div className="min-w-0">
                  <p className="text-slate-400 line-through break-words">{from}</p>
                  <p className="text-slate-800 font-semibold break-words">{to || <em className="text-slate-400">(removed)</em>}</p>
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

      <div className="bg-slate-100 rounded-xl p-3 sm:p-5 overflow-x-auto max-h-[80vh] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading template…
          </div>
        )}
        <div
          ref={canvasRef}
          className="qt-canvas"
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
      </div>
    </div>
  );
};
