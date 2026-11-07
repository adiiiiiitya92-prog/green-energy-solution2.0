import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check, X } from 'lucide-react';

/**
 * Gives every native <select> in the app a searchable dropdown, without touching each component.
 * Opening a select shows this list instead of the browser's; picking an option sets the select's value
 * and fires a real "change" event, so existing React onChange handlers keep working unchanged.
 * Opt out on a single select with data-no-search.
 */

interface Entry {
  kind: 'option' | 'group';
  label: string;
  value: string;
  disabled: boolean;
  group?: string;
}

const MOBILE_BREAKPOINT = 640;
const TAP_SLOP_PX = 10;

const isEnhanceable = (el: Element | null): el is HTMLSelectElement =>
  !!el &&
  el instanceof HTMLSelectElement &&
  !el.multiple &&
  !el.disabled &&
  el.size <= 1 &&
  !el.hasAttribute('data-no-search');

const readEntries = (select: HTMLSelectElement): Entry[] => {
  const out: Entry[] = [];
  Array.from(select.children).forEach(child => {
    if (child instanceof HTMLOptGroupElement) {
      out.push({ kind: 'group', label: child.label, value: '', disabled: true });
      Array.from(child.children).forEach(o => {
        if (o instanceof HTMLOptionElement && !o.hidden) {
          out.push({ kind: 'option', label: o.text, value: o.value, disabled: o.disabled || child.disabled, group: child.label });
        }
      });
    } else if (child instanceof HTMLOptionElement && !child.hidden) {
      out.push({ kind: 'option', label: child.text, value: child.value, disabled: child.disabled });
    }
  });
  return out;
};

const setNativeValue = (select: HTMLSelectElement, value: string) => {
  // The prototype setter bypasses React's value tracker, so React sees the change event as a real change.
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

export const SearchableSelectEnhancer: React.FC = () => {
  const [target, setTarget] = useState<HTMLSelectElement | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ el: HTMLSelectElement; x: number; y: number } | null>(null);
  const openRef = useRef<HTMLSelectElement | null>(null);
  openRef.current = target;

  const open = useCallback((select: HTMLSelectElement) => {
    setEntries(readEntries(select));
    setQuery('');
    setRect(select.getBoundingClientRect());
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    setTarget(select);
  }, []);

  const close = useCallback((refocus = true) => {
    setTarget(prev => {
      if (prev && refocus) {
        try { prev.focus({ preventScroll: true }); } catch { /* element may be gone */ }
      }
      return null;
    });
  }, []);

  // Intercept the browser's own dropdown.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const el = (e.target as Element)?.closest?.('select') ?? null;
      if (!isEnhanceable(el)) return;
      e.preventDefault();
      if (openRef.current === el) { close(false); return; } // second click on the same select closes it
      open(el);
    };
    const onTouchStart = (e: TouchEvent) => {
      const el = (e.target as Element)?.closest?.('select') ?? null;
      const t = e.touches[0];
      touchRef.current = isEnhanceable(el) && t ? { el, x: t.clientX, y: t.clientY } : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const start = touchRef.current;
      touchRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t || Math.abs(t.clientX - start.x) > TAP_SLOP_PX || Math.abs(t.clientY - start.y) > TAP_SLOP_PX) return; // was a scroll
      e.preventDefault(); // stops the native picker and the follow-up mouse events
      open(start.el);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as Element;
      if (!isEnhanceable(el)) return;
      if (e.key === 'Enter' || e.key === ' ' || (e.altKey && e.key === 'ArrowDown') || e.key === 'F4') {
        e.preventDefault();
        open(el);
      }
    };
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, close]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    const words = q.split(/\s+/);
    const matches = (e: Entry) => {
      const label = e.label.toLowerCase();
      return words.every(w => label.includes(w));
    };
    const out: Entry[] = [];
    let pendingGroup: Entry | null = null;
    for (const e of entries) {
      if (e.kind === 'group') { pendingGroup = e; continue; }
      if (!matches(e)) continue;
      if (pendingGroup && e.group === pendingGroup.label) { out.push(pendingGroup); pendingGroup = null; }
      out.push(e);
    }
    // Labels starting with the typed text come first.
    const starts = (e: Entry) => e.kind === 'option' && e.label.toLowerCase().startsWith(q);
    if (!out.some(e => e.kind === 'group')) out.sort((a, b) => Number(starts(b)) - Number(starts(a)));
    return out;
  }, [entries, query]);

  const selectable = useMemo(() => visible.map((e, i) => (e.kind === 'option' && !e.disabled ? i : -1)).filter(i => i >= 0), [visible]);

  // Start on the current value, or the first match while searching.
  useEffect(() => {
    if (!target) return;
    const current = query ? -1 : visible.findIndex(e => e.kind === 'option' && e.value === target.value);
    setActive(current >= 0 ? current : (selectable[0] ?? -1));
  }, [visible, target]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!target) return;
    if (!isMobile) setTimeout(() => inputRef.current?.focus(), 0);
  }, [target, isMobile]);

  useLayoutEffect(() => {
    if (active < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, target]);

  // Close when clicking elsewhere, when the select disappears, or when the page scrolls / resizes on desktop.
  useEffect(() => {
    if (!target) return;
    const onDown = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (e.target === target) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (!isMobile) close(false);
    };
    const onResize = () => { if (!isMobile) close(false); };
    const watcher = setInterval(() => { if (!target.isConnected || target.disabled) close(false); }, 400);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      clearInterval(watcher);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [target, isMobile, close]);

  const choose = (entry: Entry) => {
    if (!target || entry.kind !== 'option' || entry.disabled) return;
    const select = target;
    close(true);
    if (select.value !== entry.value) setNativeValue(select, entry.value);
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key === 'Tab') { close(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!selectable.length) return;
      const pos = selectable.indexOf(active);
      const next = e.key === 'ArrowDown'
        ? selectable[Math.min(selectable.length - 1, pos + 1)]
        : selectable[Math.max(0, pos < 0 ? 0 : pos - 1)];
      setActive(next);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const entry = visible[active];
      if (entry) choose(entry);
    }
  };

  if (!target || !rect) return null;

  const current = target.value;
  const list = (
    <div ref={listRef} className="overflow-y-auto overscroll-contain py-1" style={{ maxHeight: isMobile ? '55vh' : 280 }}>
      {visible.length === 0 && <p className="px-3 py-4 text-center text-xs font-semibold text-slate-400">No match found</p>}
      {visible.map((e, i) =>
        e.kind === 'group' ? (
          <p key={`g-${i}`} className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{e.label}</p>
        ) : (
          <button
            key={`o-${i}`}
            type="button"
            data-idx={i}
            disabled={e.disabled}
            onMouseDown={ev => ev.preventDefault()}
            onClick={() => choose(e)}
            onMouseEnter={() => !e.disabled && setActive(i)}
            className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 ${
              e.disabled ? 'text-slate-300 cursor-not-allowed' : i === active ? 'bg-emerald-50 text-emerald-900 cursor-pointer' : 'text-slate-700 cursor-pointer'
            } ${e.group ? 'pl-5' : ''}`}
          >
            <span className="flex-1 min-w-0 break-words">{e.label || ' '}</span>
            {e.value === current && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
          </button>
        )
      )}
    </div>
  );

  const searchBox = (
    <div className="p-2 border-b border-slate-100">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder="Type to search..."
          className="w-full border border-slate-200 rounded-lg pl-8 pr-2 py-2 text-xs font-semibold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-[10000] bg-slate-900/40 flex items-end" onPointerDown={e => { if (e.target === e.currentTarget) close(false); }}>
        <div ref={panelRef} className="w-full bg-white rounded-t-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-xs font-black text-slate-700">Select an option</span>
            <button type="button" onClick={() => close(false)} className="p-1 rounded-md hover:bg-slate-100 cursor-pointer">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          {searchBox}
          {list}
        </div>
      </div>,
      document.body
    );
  }

  const width = Math.max(rect.width, 240);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < 340 && rect.top > spaceBelow;
  const style: React.CSSProperties = openUp
    ? { left, width, bottom: window.innerHeight - rect.top + 4 }
    : { left, width, top: rect.bottom + 4 };

  return createPortal(
    <div ref={panelRef} style={style} className="fixed z-[10000] bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
      {searchBox}
      {list}
    </div>,
    document.body
  );
};
