import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { X, Search, Download, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { GeneralExpenseRow, LeadPL } from '../../services/businessMetrics';

export type DetailView = 'installations' | 'cost' | 'profit' | 'yearly';

const inr = (n: number) => `${n < 0 ? '−' : ''}₹${Math.round(Math.abs(n || 0)).toLocaleString('en-IN')}`;
const kwFmt = (n: number) => `${(Math.round((n || 0) * 10) / 10).toLocaleString('en-IN')} kW`;
const monthOf = (iso: string) => dayjs(iso).format('YYYY-MM');
const profitCls = (v: number) => (v >= 0 ? 'text-emerald-700' : 'text-red-600');

const STAGES: Array<{ value: LeadPL['status']; label: string }> = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'registered', label: 'Registered' },
  { value: 'installed', label: 'Installed' },
  { value: 'closed', label: 'Closed' },
  { value: 'quotation_sent', label: 'Quotation Sent' },
  { value: 'new', label: 'New' },
  { value: 'lost', label: 'Lost' }
];

const TITLES: Record<DetailView, string> = {
  installations: 'Completed Installations',
  cost: 'System Cost',
  profit: 'Profit',
  yearly: 'Yearly Profit'
};

type SortKey = 'completedAt' | 'name' | 'kw' | 'quoted' | 'collected' | 'pendingWithGst' | 'material' | 'systemCost' | 'profit' | 'cashProfit';

export function downloadLeadCsv(rows: LeadPL[], fileName: string) {
  const head = ['Completed', 'Customer', 'Phone', 'Stage', 'Payment', 'kW', 'Contract (with GST)', 'Quoted (ex GST)', 'Collected (ex GST)', 'Pending (with GST)',
    'Material', 'Installation', 'Lead expenses', 'Partner incentive', 'System cost', 'Profit on quote', 'Cash profit', 'Items without purchase price'];
  const lines = rows.map(r => [
    dayjs(r.completedAt).format('DD-MM-YYYY'), r.name, r.phone, r.status, r.paymentStatus === 'due' ? 'Payment due' : 'Payment done', r.kw,
    Math.round(r.contractWithGst), Math.round(r.quoted), Math.round(r.collected), Math.round(r.pendingWithGst),
    Math.round(r.material), Math.round(r.installation), Math.round(r.leadExpenses), Math.round(r.partnerIncentive),
    Math.round(r.systemCost), Math.round(r.profit), Math.round(r.cashProfit), r.unpricedItems
  ]);
  saveCsv([head, ...lines], fileName);
}

function saveCsv(rows: any[][], fileName: string) {
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  view: DetailView;
  leads: LeadPL[];
  generalExpenses: GeneralExpenseRow[];
  selMonth: string; // YYYY-MM
  onClose: () => void;
}

/** Full list behind a Business Overview card, with filters, totals and CSV export. */
export const BusinessDetailModal: React.FC<Props> = ({ view, leads, generalExpenses, selMonth, onClose }) => {
  const selYear = selMonth.slice(0, 4);
  const [tab, setTab] = useState<'leads' | 'general'>('leads');
  const [period, setPeriod] = useState<'month' | 'year' | 'all' | 'range'>(view === 'yearly' ? 'year' : 'month');
  const [fromMonth, setFromMonth] = useState(`${selYear}-01`);
  const [toMonth, setToMonth] = useState(selMonth);
  const [search, setSearch] = useState('');
  const [payment, setPayment] = useState<'all' | 'due' | 'done'>('all');
  const [stage, setStage] = useState<'all' | LeadPL['status']>('all');
  const [result, setResult] = useState<'all' | 'profit' | 'loss'>('all');
  const [completedFrom, setCompletedFrom] = useState<'all' | LeadPL['completedFrom']>('all');
  const [costFlag, setCostFlag] = useState<'all' | 'unpriced' | 'noMaterial' | 'installation' | 'expenses' | 'partner'>('all');
  const [sortKey, setSortKey] = useState<SortKey>(view === 'cost' ? 'systemCost' : view === 'installations' ? 'completedAt' : 'profit');
  const [sortDesc, setSortDesc] = useState(view !== 'installations');
  const [openLead, setOpenLead] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const inPeriod = (iso: string) => {
    const mk = monthOf(iso);
    if (period === 'month') return mk === selMonth;
    if (period === 'year') return mk.startsWith(selYear);
    if (period === 'range') return mk >= (fromMonth || '0000-00') && mk <= (toMonth || '9999-99');
    return true;
  };

  const periodLabel = period === 'month' ? dayjs(`${selMonth}-01`).format('MMMM YYYY')
    : period === 'year' ? selYear
    : period === 'range' ? `${dayjs(`${fromMonth}-01`).format('MMM YYYY')} – ${dayjs(`${toMonth}-01`).format('MMM YYYY')}`
    : 'All time';

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = leads.filter(r => {
      if (!inPeriod(r.completedAt)) return false;
      if (q && !`${r.name} ${r.phone}`.toLowerCase().includes(q)) return false;
      if (payment !== 'all' && r.paymentStatus !== payment) return false;
      if (stage !== 'all' && r.status !== stage) return false;
      if (result === 'profit' && r.profit < 0) return false;
      if (result === 'loss' && r.profit >= 0) return false;
      if (completedFrom !== 'all' && r.completedFrom !== completedFrom) return false;
      if (costFlag === 'unpriced' && r.unpricedItems === 0) return false;
      if (costFlag === 'noMaterial' && r.materialLines.length > 0) return false;
      if (costFlag === 'installation' && r.installation <= 0) return false;
      if (costFlag === 'expenses' && r.leadExpenses <= 0) return false;
      if (costFlag === 'partner' && r.partnerIncentive <= 0) return false;
      return true;
    });
    const dir = sortDesc ? -1 : 1;
    return list.sort((a, b) => {
      const av = a[sortKey] as any, bv = b[sortKey] as any;
      return (typeof av === 'string' ? String(av).localeCompare(String(bv)) : (av || 0) - (bv || 0)) * dir;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, search, payment, stage, result, completedFrom, costFlag, sortKey, sortDesc, period, fromMonth, toMonth, selMonth]);

  const genRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return generalExpenses
      .filter(e => inPeriod(e.date))
      .filter(e => !q || `${e.expenseNumber} ${e.title} ${e.employeeName} ${e.project} ${e.category}`.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generalExpenses, search, period, fromMonth, toMonth, selMonth]);

  const t = useMemo(() => {
    const sum = (k: keyof LeadPL) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const general = genRows.reduce((s, e) => s + e.amount, 0);
    const profit = sum('profit');
    return {
      count: rows.length, due: rows.filter(r => r.paymentStatus === 'due').length, kw: sum('kw'),
      quoted: sum('quoted'), collected: sum('collected'), pending: sum('pendingWithGst'),
      material: sum('material'), installation: sum('installation'), leadExpenses: sum('leadExpenses'), partner: sum('partnerIncentive'),
      systemCost: sum('systemCost'), profit, cashProfit: sum('cashProfit'), general, net: profit - general,
      unpriced: sum('unpricedItems')
    };
  }, [rows, genRows]);

  const resetFilters = () => {
    setSearch(''); setPayment('all'); setStage('all'); setResult('all'); setCompletedFrom('all'); setCostFlag('all');
  };

  const sortBy = (k: SortKey) => {
    if (sortKey === k) setSortDesc(d => !d);
    else { setSortKey(k); setSortDesc(k !== 'name' && k !== 'completedAt'); }
  };
  const Th: React.FC<{ k: SortKey; children: React.ReactNode; right?: boolean }> = ({ k, children, right }) => (
    <th className={`pb-2 px-2 cursor-pointer select-none hover:text-slate-700 whitespace-nowrap ${right ? 'text-right' : ''}`} onClick={() => sortBy(k)}>
      {children}{sortKey === k && (sortDesc ? ' ↓' : ' ↑')}
    </th>
  );

  const select = 'border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700 bg-white';
  const showCost = view === 'cost' || view === 'profit' || view === 'yearly';
  const showMoney = view !== 'installations';

  const summary: Array<[string, string, string?]> = view === 'installations'
    ? [['Systems', String(t.count)], ['Payment due', String(t.due)], ['Payment done', String(t.count - t.due)], ['Capacity', kwFmt(t.kw)], ['Still to collect', inr(t.pending), 'text-amber-700']]
    : view === 'cost'
    ? [['System cost', inr(t.systemCost)], ['Material', inr(t.material)], ['Installation', inr(t.installation)], ['Lead expenses', inr(t.leadExpenses)], ['Partner incentive', inr(t.partner)], ['Unpriced lines', String(t.unpriced), t.unpriced ? 'text-amber-700' : '']]
    : [['Quoted', inr(t.quoted)], ['Collected', inr(t.collected)], ['System cost', inr(t.systemCost)], ['Profit', inr(t.profit), profitCls(t.profit)], ['Cash profit', inr(t.cashProfit), profitCls(t.cashProfit)], ['General exp.', inr(t.general)], ['Net profit', inr(t.net), profitCls(t.net)]];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-7xl sm:rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[92vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900">{TITLES[view]} • {periodLabel}</h3>
            <p className="text-[11px] font-semibold text-slate-500">Process Done leads only. Click a row to see material and money details.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => tab === 'leads'
                ? downloadLeadCsv(rows, `${view}-${periodLabel.replace(/\s+/g, '-')}.csv`)
                : saveCsv([['Date', 'Expense No', 'Title', 'Category', 'Employee', 'Project', 'Amount'], ...genRows.map(e => [dayjs(e.date).format('DD-MM-YYYY'), e.expenseNumber, e.title, e.category, e.employeeName, e.project, Math.round(e.amount)])], `general-expenses-${periodLabel.replace(/\s+/g, '-')}.csv`)}
              className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg inline-flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-slate-100 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={tab === 'leads' ? 'Search customer or phone…' : 'Search expense, employee, project…'}
                className="w-full pl-8 pr-2 py-1.5 text-[11px] font-semibold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <select className={select} value={period} onChange={e => setPeriod(e.target.value as any)}>
              <option value="month">{dayjs(`${selMonth}-01`).format('MMMM YYYY')}</option>
              <option value="year">Year {selYear}</option>
              <option value="range">Custom months</option>
              <option value="all">All time</option>
            </select>
            {period === 'range' && (
              <>
                <input type="month" className={select} value={fromMonth} onChange={e => setFromMonth(e.target.value)} />
                <span className="text-[11px] text-slate-400">to</span>
                <input type="month" className={select} value={toMonth} onChange={e => setToMonth(e.target.value)} />
              </>
            )}
          </div>
          {tab === 'leads' && (
            <div className="flex flex-wrap items-center gap-2">
              <select className={select} value={payment} onChange={e => setPayment(e.target.value as any)}>
                <option value="all">All payments</option>
                <option value="due">Payment due</option>
                <option value="done">Payment done</option>
              </select>
              <select className={select} value={stage} onChange={e => setStage(e.target.value as any)}>
                <option value="all">All stages</option>
                {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              {showMoney && (
                <select className={select} value={result} onChange={e => setResult(e.target.value as any)}>
                  <option value="all">Profit & loss</option>
                  <option value="profit">Only profit</option>
                  <option value="loss">Only loss</option>
                </select>
              )}
              <select className={select} value={costFlag} onChange={e => setCostFlag(e.target.value as any)}>
                <option value="all">All cost types</option>
                <option value="unpriced">Has unpriced material</option>
                <option value="noMaterial">No challan / material</option>
                <option value="installation">Has installation payment</option>
                <option value="expenses">Has lead expenses</option>
                <option value="partner">Channel partner lead</option>
              </select>
              <select className={select} value={completedFrom} onChange={e => setCompletedFrom(e.target.value as any)}>
                <option value="all">Any completion date</option>
                <option value="installation">Installation completed</option>
                <option value="dispatch">Last dispatch date</option>
                <option value="lead">Lead date (no installation / dispatch)</option>
              </select>
              <button type="button" onClick={resetFilters} className="text-[11px] font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer">
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
          )}
          {showMoney && (
            <div className="flex gap-1 pt-1">
              {(['leads', 'general'] as const).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`text-[11px] font-bold px-3 py-1 rounded-lg cursor-pointer ${tab === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {k === 'leads' ? `Leads (${rows.length})` : `General expenses (${genRows.length})`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Totals of what is shown */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-x-5 gap-y-1">
          {(tab === 'general' ? [['General expenses', inr(t.general)], ['Entries', String(genRows.length)]] as Array<[string, string, string?]> : summary).map(([k, v, cls]) => (
            <div key={k} className="text-[11px]">
              <span className="font-semibold text-slate-500">{k}: </span>
              <span className={`font-black ${cls || 'text-slate-800'}`}>{v}</span>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto p-4">
          {tab === 'general' ? (
            genRows.length === 0 ? <p className="text-xs text-slate-400 text-center py-8">No general expenses in this period.</p> : (
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase font-bold border-b border-slate-100 text-left">
                    <th className="pb-2 px-2">Date</th><th className="pb-2 px-2">Expense</th><th className="pb-2 px-2">Category</th>
                    <th className="pb-2 px-2">Employee</th><th className="pb-2 px-2">Project / Site</th><th className="pb-2 px-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {genRows.map(e => (
                    <tr key={e.id} className="border-b border-slate-50">
                      <td className="py-2 px-2 text-slate-600">{dayjs(e.date).format('DD MMM YYYY')}</td>
                      <td className="py-2 px-2"><p className="font-bold text-slate-800">{e.title}</p><p className="text-[10px] text-slate-400">{e.expenseNumber}</p></td>
                      <td className="py-2 px-2 capitalize">{e.category.replace(/_/g, ' ')}</td>
                      <td className="py-2 px-2">{e.employeeName}</td>
                      <td className="py-2 px-2 text-slate-500">{e.project || '—'}</td>
                      <td className="py-2 px-2 text-right font-bold">{inr(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : rows.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No leads match these filters.</p>
          ) : (
            <table className="w-full text-xs min-w-[960px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase font-bold border-b border-slate-100 text-left">
                  <Th k="name">Customer</Th>
                  <Th k="completedAt">Completed</Th>
                  <th className="pb-2 px-2">Stage / Payment</th>
                  <Th k="kw" right>kW</Th>
                  {showMoney && <Th k="quoted" right>Quoted</Th>}
                  {showMoney && <Th k="collected" right>Collected</Th>}
                  <Th k="pendingWithGst" right>Pending</Th>
                  {showCost && <Th k="material" right>Material</Th>}
                  {showCost && <th className="pb-2 px-2 text-right whitespace-nowrap">Install + Exp. + Inc.</th>}
                  {showCost && <Th k="systemCost" right>System Cost</Th>}
                  {showMoney && <Th k="profit" right>Profit</Th>}
                  {showMoney && <Th k="cashProfit" right>Cash Profit</Th>}
                  <th className="pb-2 w-4" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <React.Fragment key={r.leadId}>
                    <tr className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setOpenLead(o => (o === r.leadId ? null : r.leadId))}>
                      <td className="py-2 px-2"><p className="font-bold text-slate-800">{r.name}</p><p className="text-[10px] text-slate-400">{r.phone}</p></td>
                      <td className="py-2 px-2 text-slate-600 whitespace-nowrap">
                        {dayjs(r.completedAt).format('DD MMM YYYY')}
                        <span className="block text-[9px] text-slate-400">{r.completedFrom === 'installation' ? 'installation done' : r.completedFrom === 'dispatch' ? 'last dispatch' : 'lead date'}</span>
                      </td>
                      <td className="py-2 px-2">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block">{r.status.replace(/_/g, ' ')}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.paymentStatus === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {r.paymentStatus === 'done' ? 'Paid' : 'Payment due'}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">{r.kw ? kwFmt(r.kw) : '—'}</td>
                      {showMoney && <td className="py-2 px-2 text-right font-semibold">{inr(r.quoted)}</td>}
                      {showMoney && <td className="py-2 px-2 text-right">{inr(r.collected)}</td>}
                      <td className={`py-2 px-2 text-right ${r.pendingWithGst > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'}`}>{inr(r.pendingWithGst)}</td>
                      {showCost && (
                        <td className="py-2 px-2 text-right">
                          {inr(r.material)}
                          {r.unpricedItems > 0 && <span className="block text-[9px] font-bold text-amber-700">{r.unpricedItems} unpriced</span>}
                        </td>
                      )}
                      {showCost && <td className="py-2 px-2 text-right">{inr(r.installation + r.leadExpenses + r.partnerIncentive)}</td>}
                      {showCost && <td className="py-2 px-2 text-right font-semibold">{inr(r.systemCost)}</td>}
                      {showMoney && <td className={`py-2 px-2 text-right font-black ${profitCls(r.profit)}`}>{inr(r.profit)}</td>}
                      {showMoney && <td className={`py-2 px-2 text-right ${profitCls(r.cashProfit)}`}>{inr(r.cashProfit)}</td>}
                      <td className="py-2 text-slate-400">{openLead === r.leadId ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</td>
                    </tr>
                    {openLead === r.leadId && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={13} className="p-3">
                          <LeadBreakdown r={r} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export const LeadBreakdown: React.FC<{ r: LeadPL }> = ({ r }) => {
  const line = 'flex justify-between gap-2 text-[11px] font-semibold text-slate-500';
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
      <div>
        <p className="font-black text-slate-700 mb-1">Material dispatched</p>
        {r.materialLines.length === 0 ? (
          <p className="text-slate-400">No delivery challan found for this lead.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {r.materialLines.map((l, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-1 text-slate-500">{l.source}</td>
                  <td className="py-1 text-slate-700">{l.productName}</td>
                  <td className="py-1 text-right">{l.qty} × {l.rate > 0 ? inr(l.rate) : <span className="text-amber-700 font-bold">no price</span>}</td>
                  <td className="py-1 text-right font-semibold">{inr(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="space-y-1">
        <p className="font-black text-slate-700 mb-1">Money</p>
        <div className={line}><span>Contract value (with GST {r.gstPct}%)</span><span>{inr(r.contractWithGst)}</span></div>
        <div className={line}><span>Quoted (without GST)</span><span>{inr(r.quoted)}</span></div>
        <div className={line}><span>Collected (without GST)</span><span>{inr(r.collected)}</span></div>
        <div className={line}><span>Still to collect (with GST)</span><span>{inr(r.pendingWithGst)}</span></div>
        <div className={line}><span>Material</span><span>{inr(r.material)}</span></div>
        <div className={line}><span>Installation payments</span><span>{inr(r.installation)}</span></div>
        <div className={line}><span>Expenses on this lead</span><span>{inr(r.leadExpenses)}</span></div>
        {r.expenseTitles.length > 0 && <p className="text-[10px] text-slate-400">{r.expenseTitles.join(', ')}</p>}
        <div className={line}><span>Channel partner incentive</span><span>{inr(r.partnerIncentive)}</span></div>
        <div className={`${line} font-black`}><span>System cost</span><span className="text-slate-800">{inr(r.systemCost)}</span></div>
        <div className={`${line} font-black`}><span>Profit / Cash profit</span><span><span className={profitCls(r.profit)}>{inr(r.profit)}</span> / <span className={profitCls(r.cashProfit)}>{inr(r.cashProfit)}</span></span></div>
      </div>
    </div>
  );
};
