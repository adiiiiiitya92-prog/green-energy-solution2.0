import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Handshake, Loader2, Search, Download, IndianRupee, Users, CalendarRange, Receipt, Lock, CheckCircle2, AlertTriangle, Wallet } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { resolveChannelPartner } from '../../services/channelPartnerIncentive';
import { channelPartnerPayoutService, PAYOUT_MODE_LABEL } from '../../services/channelPartnerPayoutService';
import { openPayoutReceipt } from '../../services/channelPartnerPayoutReceipt';
import { ChannelPartnerRateModal } from '../../components/ChannelPartner/ChannelPartnerRateModal';
import { ChannelPartnerPayoutModal } from '../../components/ChannelPartner/ChannelPartnerPayoutModal';
import { useIncentiveData, sumRows, type IncentiveRow, type PayoutState } from './useIncentiveData';
import type { Lead } from '../../types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const QUARTERS = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)'];
const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

type PeriodKind = 'month' | 'quarter' | 'year';

const periodKey = (iso: string, kind: PeriodKind) => {
  const d = dayjs(iso);
  if (!iso || !d.isValid()) return '';
  if (kind === 'year') return `${d.year()}`;
  if (kind === 'quarter') return `${d.year()}-Q${Math.floor(d.month() / 3) + 1}`;
  return d.format('YYYY-MM');
};
const periodLabel = (key: string, kind: PeriodKind) => {
  if (kind === 'year') return key;
  if (kind === 'quarter') { const [y, q] = key.split('-Q'); return `${QUARTERS[Number(q) - 1]} ${y}`; }
  return dayjs(`${key}-01`).format('MMMM YYYY');
};

const STATE_UI: Record<PayoutState, { label: string; cls: string }> = {
  paid: { label: 'Paid', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  ready: { label: 'Ready to pay', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  locked: { label: 'Lead not closed', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  no_rate: { label: 'Rate pending', cls: 'bg-amber-100 text-amber-800 border-amber-200' }
};

export const ChannelPartnerIncentives: React.FC = () => {
  const { currentUser, currentRole } = useAuthStore();
  const isPartner = currentRole === 'dealer';
  const canManage = currentRole === 'super_admin' || currentRole === 'admin' || currentRole === 'manager';
  const canCancelPayout = currentRole === 'super_admin';

  const { loading, rows: allRows, setLeads, contractMap, partners, setPayouts, payoutsError, loadPayouts } =
    useIncentiveData(isPartner ? currentUser?.id || '__none__' : undefined);

  const [rateLead, setRateLead] = useState<Lead | null>(null);
  const [payRow, setPayRow] = useState<IncentiveRow | null>(null);
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [year, setYear] = useState<string>('all');
  const [quarter, setQuarter] = useState<string>('all');
  const [month, setMonth] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<'all' | PayoutState>('all');
  const [search, setSearch] = useState('');
  const [periodKind, setPeriodKind] = useState<PeriodKind>('month');

  // Partner + search scope (used by the period records, which list every period)
  const scopeRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(r => {
      if (!isPartner && partnerFilter !== 'all' && r.partnerId !== partnerFilter) return false;
      if (q && !`${r.lead.name} ${r.lead.phoneNumber} ${r.partnerName} ${r.payout?.receiptNo || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allRows, partnerFilter, search, isPartner]);

  const inPeriod = (iso: string | undefined) => {
    if (year === 'all' && quarter === 'all' && month === 'all') return true;
    const d = dayjs(iso);
    if (!iso || !d.isValid()) return false;
    if (year !== 'all' && String(d.year()) !== year) return false;
    if (quarter !== 'all' && Math.floor(d.month() / 3) !== Number(quarter)) return false;
    if (month !== 'all' && d.month() !== Number(month)) return false;
    return true;
  };

  const rows = useMemo(
    () => scopeRows.filter(r => inPeriod(r.date) && (stateFilter === 'all' || r.payoutState === stateFilter)),
    [scopeRows, year, quarter, month, stateFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const totals = useMemo(() => sumRows(rows), [rows]);

  // Payouts actually made in the selected period (by payment date), for the same partner / search scope
  const paidInPeriod = useMemo(() => {
    const list = scopeRows.filter(r => r.payout && inPeriod(r.payout.paidAt)).map(r => r.payout!);
    return { count: list.length, amount: list.reduce((s, p) => s + (p.amount || 0), 0) };
  }, [scopeRows, year, quarter, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const years = useMemo(() => {
    const ys = new Set<string>([String(dayjs().year())]);
    allRows.forEach(r => {
      if (r.date) ys.add(String(dayjs(r.date).year()));
      if (r.payout?.paidAt) ys.add(String(dayjs(r.payout.paidAt).year()));
    });
    return [...ys].sort((a, b) => Number(b) - Number(a));
  }, [allRows]);

  const periods = useMemo(() => {
    type P = { key: string; leads: number; incentive: number; ready: number; locked: number; paidOut: number; paidCount: number };
    const m = new Map<string, P>();
    const get = (key: string) => {
      let p = m.get(key);
      if (!p) { p = { key, leads: 0, incentive: 0, ready: 0, locked: 0, paidOut: 0, paidCount: 0 }; m.set(key, p); }
      return p;
    };
    scopeRows.forEach(r => {
      const k = periodKey(r.date, periodKind);
      if (k) {
        const p = get(k);
        p.leads += 1;
        p.incentive += r.inc?.incentive || 0;
        if (r.payoutState === 'ready') p.ready += r.inc?.incentive || 0;
        if (r.payoutState === 'locked') p.locked += r.inc?.incentive || 0;
      }
      if (r.payout) {
        const pk = periodKey(r.payout.paidAt, periodKind);
        if (pk) { const p = get(pk); p.paidOut += r.payout.amount || 0; p.paidCount += 1; }
      }
    });
    return [...m.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [scopeRows, periodKind]);

  const byPartner = useMemo(() => {
    const m = new Map<string, { id: string; name: string; rows: IncentiveRow[] }>();
    rows.forEach(r => {
      const p = m.get(r.partnerId) || { id: r.partnerId, name: r.partnerName, rows: [] };
      p.rows.push(r);
      m.set(r.partnerId, p);
    });
    return [...m.values()].map(p => ({ ...p, t: sumRows(p.rows) })).sort((a, b) => b.t.incentive - a.t.incentive);
  }, [rows]);

  const selectPeriod = (key: string) => {
    if (periodKind === 'year') { setYear(key); setQuarter('all'); setMonth('all'); }
    else if (periodKind === 'quarter') { const [y, q] = key.split('-Q'); setYear(y); setQuarter(String(Number(q) - 1)); setMonth('all'); }
    else { const [y, mo] = key.split('-'); setYear(y); setQuarter('all'); setMonth(String(Number(mo) - 1)); }
  };

  const cancelPayout = async (r: IncentiveRow) => {
    if (!r.payout) return;
    if (!confirm(`Cancel payment ${r.payout.receiptNo} of ${inr(r.payout.amount)} to ${r.partnerName}?\nUse this only if it was marked paid by mistake.`)) return;
    try {
      await channelPartnerPayoutService.cancel(r.payout);
      setPayouts(prev => prev.filter(p => p.id !== r.payout!.id));
    } catch (err: any) {
      alert(err?.message || 'Could not cancel the payment.');
    }
  };

  const exportCsv = () => {
    const header = ['Booking Date', 'Lead', 'Phone', 'Channel Partner', 'Lead Status', 'Customer Quotation', 'Partner Rate', 'Margin', 'GST %', 'GST', 'Incentive', 'Payout Status', 'Paid Amount', 'Paid On', 'Receipt No', 'Mode', 'Reference'];
    const lines = rows.map(r => [
      r.date ? dayjs(r.date).format('DD-MM-YYYY') : '',
      r.lead.name, r.lead.phoneNumber, r.partnerName, r.lead.status,
      r.customerPrice, r.inc?.rate ?? '', r.inc?.margin ?? '', r.inc?.gstPct ?? '', r.inc?.gst ?? '', r.inc?.incentive ?? '',
      STATE_UI[r.payoutState].label,
      r.payout?.amount ?? '', r.payout ? dayjs(r.payout.paidAt).format('DD-MM-YYYY') : '', r.payout?.receiptNo ?? '',
      r.payout ? PAYOUT_MODE_LABEL[r.payout.mode] : '', r.payout?.reference ?? ''
    ]);
    const csv = [header, ...lines].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const period = [month !== 'all' ? MONTHS[Number(month)] : '', quarter !== 'all' ? `Q${Number(quarter) + 1}` : '', year !== 'all' ? year : ''].filter(Boolean).join('_');
    a.download = `Channel_Partner_Incentives${period ? '_' + period : ''}.csv`;
    a.click();
  };

  const selectCls = 'border border-slate-200 rounded-xl px-3 py-2 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer';
  const periodSelected = year !== 'all' || quarter !== 'all' || month !== 'all';

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Handshake className="w-6 h-6 text-purple-700" />
            {isPartner ? 'My Incentives' : 'Channel Partner Incentives'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Incentive = (Customer quotation − Rate given to partner) − GST on that margin. Payout is made after the lead is closed.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="self-start sm:self-auto px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {payoutsError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-bold text-rose-700 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Payment records could not be loaded, so paid status may be missing. Marking payments is disabled until they load.
          <button type="button" onClick={loadPayouts} className="underline cursor-pointer">Retry</button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 flex flex-wrap gap-2 items-center">
        {!isPartner && (
          <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)} className={selectCls}>
            <option value="all">All Channel Partners</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        )}
        <select value={year} onChange={e => setYear(e.target.value)} className={selectCls}>
          <option value="all">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={quarter} onChange={e => { setQuarter(e.target.value); setMonth('all'); }} className={selectCls}>
          <option value="all">All Quarters</option>
          {QUARTERS.map((q, i) => <option key={q} value={i}>{q}</option>)}
        </select>
        <select value={month} onChange={e => { setMonth(e.target.value); setQuarter('all'); }} className={selectCls}>
          <option value="all">All Months</option>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value as any)} className={selectCls}>
          <option value="all">All Payout Status</option>
          <option value="paid">Paid</option>
          <option value="ready">Ready to pay (lead closed)</option>
          <option value="locked">Waiting (lead not closed)</option>
          <option value="no_rate">Rate pending</option>
        </select>
        {periodSelected && (
          <button type="button" onClick={() => { setYear('all'); setQuarter('all'); setMonth('all'); }} className="text-[11px] font-bold text-purple-700 underline cursor-pointer">
            Clear period
          </button>
        )}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search lead, phone, partner or receipt no."
            className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Incentive', value: inr(totals.incentive), sub: `${totals.leads} leads • ${totals.rated} with rate set`, cls: 'border-purple-400 text-purple-800' },
          { label: 'Paid', value: inr(totals.paid), sub: `${totals.paidCount} lead(s)`, cls: 'border-emerald-400 text-emerald-700 bg-emerald-50/50' },
          { label: 'Ready to Pay', value: inr(totals.ready), sub: `${totals.readyCount} closed lead(s)`, cls: 'border-sky-400 text-sky-800' },
          { label: 'Waiting for Closure', value: inr(totals.locked), sub: `${totals.lockedCount} lead(s) not closed yet`, cls: 'border-slate-300 text-slate-700' },
          {
            label: periodSelected ? 'Paid Out in Period' : 'Total Paid Out',
            value: inr(paidInPeriod.amount),
            sub: `${paidInPeriod.count} payment(s) by payment date`,
            cls: 'border-teal-400 text-teal-800'
          }
        ].map(c => (
          <div key={c.label} className={`bg-white border-l-4 border rounded-2xl p-4 ${c.cls}`}>
            <p className="text-[10px] font-black uppercase tracking-wider opacity-80">{c.label}</p>
            <p className="text-lg sm:text-xl font-black mt-1 break-all">{c.value}</p>
            {c.sub && <p className="text-[10px] font-semibold text-slate-500 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Period records */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <CalendarRange className="w-4 h-4 text-purple-700" /> Incentive Records
          </h3>
          <div className="inline-flex rounded-xl border border-slate-200 overflow-hidden">
            {(['month', 'quarter', 'year'] as PeriodKind[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriodKind(k)}
                className={`px-3 py-1.5 text-[11px] font-bold cursor-pointer ${periodKind === k ? 'bg-purple-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {k === 'month' ? 'Monthly' : k === 'quarter' ? 'Quarterly' : 'Yearly'}
              </button>
            ))}
          </div>
        </div>
        {periods.length === 0 ? (
          <p className="py-6 text-center text-xs font-semibold text-slate-400">No records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[620px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase font-bold border-b border-slate-100 text-left">
                  <th className="pb-2">Period</th>
                  <th className="pb-2 text-center">Leads Booked</th>
                  <th className="pb-2 text-right">Incentive Earned</th>
                  <th className="pb-2 text-right">Paid Out</th>
                  <th className="pb-2 text-right">Ready to Pay</th>
                  <th className="pb-2 text-right">Waiting (not closed)</th>
                </tr>
              </thead>
              <tbody>
                {periods.map(p => (
                  <tr key={p.key} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => selectPeriod(p.key)} title="Show this period">
                    <td className="py-2 font-bold text-slate-800">{periodLabel(p.key, periodKind)}</td>
                    <td className="py-2 text-center font-semibold">{p.leads}</td>
                    <td className="py-2 text-right font-black text-purple-800">{inr(p.incentive)}</td>
                    <td className="py-2 text-right font-bold text-emerald-700">{inr(p.paidOut)}{p.paidCount ? <span className="text-[10px] text-slate-400 font-semibold"> ({p.paidCount})</span> : null}</td>
                    <td className="py-2 text-right font-semibold text-sky-800">{inr(p.ready)}</td>
                    <td className="py-2 text-right font-semibold text-slate-500">{inr(p.locked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-400 font-semibold mt-2">Earned / ready / waiting are counted by booking date; Paid Out by the date the payment was made. Click a row to see its leads.</p>
          </div>
        )}
      </div>

      {!isPartner && partnerFilter === 'all' && byPartner.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-purple-700" /> Partner-wise Summary
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[620px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase font-bold border-b border-slate-100 text-left">
                  <th className="pb-2">Channel Partner</th>
                  <th className="pb-2 text-center">Leads</th>
                  <th className="pb-2 text-right">Incentive</th>
                  <th className="pb-2 text-right">Paid</th>
                  <th className="pb-2 text-right">Ready to Pay</th>
                  <th className="pb-2 text-right">Waiting</th>
                </tr>
              </thead>
              <tbody>
                {byPartner.map(p => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => setPartnerFilter(p.id)}>
                    <td className="py-2 font-bold text-slate-800">{p.name}</td>
                    <td className="py-2 text-center font-semibold">{p.t.leads}</td>
                    <td className="py-2 text-right font-black text-purple-800">{inr(p.t.incentive)}</td>
                    <td className="py-2 text-right font-bold text-emerald-700">{inr(p.t.paid)}</td>
                    <td className="py-2 text-right font-semibold text-sky-800">{inr(p.t.ready)}</td>
                    <td className="py-2 text-right font-semibold text-slate-500">{inr(p.t.locked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lead-wise table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <IndianRupee className="w-4 h-4 text-purple-700" /> Lead-wise Incentive & Payout
        </h3>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-xs font-semibold text-slate-400">No channel partner leads for these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1000px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase font-bold border-b border-slate-100 text-left">
                  <th className="pb-2">Booking Date</th>
                  <th className="pb-2">Lead</th>
                  {!isPartner && <th className="pb-2">Partner</th>}
                  <th className="pb-2">Lead Status</th>
                  <th className="pb-2 text-right">Customer Quote</th>
                  <th className="pb-2 text-right">Partner Rate</th>
                  <th className="pb-2 text-right">Margin</th>
                  <th className="pb-2 text-right">GST</th>
                  <th className="pb-2 text-right">Incentive</th>
                  <th className="pb-2 pl-3">Payout</th>
                  <th className="pb-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.lead.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 align-top">
                    <td className="py-2.5 font-semibold text-slate-500 whitespace-nowrap">{r.date ? dayjs(r.date).format('DD MMM YYYY') : '—'}</td>
                    <td className="py-2.5">
                      <p className="font-bold text-slate-800">{r.lead.name}</p>
                      <p className="text-[10px] text-slate-400">{r.lead.phoneNumber}</p>
                    </td>
                    {!isPartner && <td className="py-2.5 font-semibold text-purple-800">{r.partnerName}</td>}
                    <td className="py-2.5"><span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded whitespace-nowrap">{r.lead.status.replace(/_/g, ' ')}</span></td>
                    <td className="py-2.5 text-right font-semibold">{r.customerPrice ? inr(r.customerPrice) : '—'}</td>
                    <td className="py-2.5 text-right font-semibold">{r.inc ? inr(r.inc.rate) : <span className="text-amber-600 italic">Pending</span>}</td>
                    <td className="py-2.5 text-right font-semibold">{r.inc ? inr(r.inc.margin) : '—'}</td>
                    <td className="py-2.5 text-right font-semibold text-rose-600 whitespace-nowrap">{r.inc ? `${inr(r.inc.gst)} (${r.inc.gstPct}%)` : '—'}</td>
                    <td className="py-2.5 text-right font-black text-emerald-700">{r.inc ? inr(r.inc.incentive) : '—'}</td>
                    <td className="py-2.5 pl-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded border whitespace-nowrap ${STATE_UI[r.payoutState].cls}`}>
                        {r.payoutState === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : r.payoutState === 'locked' ? <Lock className="w-3 h-3" /> : null}
                        {STATE_UI[r.payoutState].label}
                      </span>
                      {r.payout && (
                        <p className="text-[10px] text-slate-500 font-semibold mt-1 whitespace-nowrap">
                          {inr(r.payout.amount)} • {dayjs(r.payout.paidAt).format('DD MMM YYYY')}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        {r.payout && (
                          <button type="button" onClick={() => openPayoutReceipt(r.payout!)} className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold cursor-pointer whitespace-nowrap inline-flex items-center gap-1">
                            <Receipt className="w-3 h-3" /> Receipt
                          </button>
                        )}
                        {canManage && r.payoutState === 'ready' && (
                          <button
                            type="button"
                            disabled={!!payoutsError}
                            onClick={() => setPayRow(r)}
                            className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer whitespace-nowrap inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <Wallet className="w-3 h-3" /> Mark Paid
                          </button>
                        )}
                        {canManage && !r.payout && (
                          <button type="button" onClick={() => setRateLead(r.lead)} className="px-2 py-1 rounded-md bg-purple-700 hover:bg-purple-800 text-white text-[10px] font-bold cursor-pointer whitespace-nowrap">
                            {r.inc ? 'Edit Rate' : 'Set Rate'}
                          </button>
                        )}
                        {canCancelPayout && r.payout && (
                          <button type="button" onClick={() => cancelPayout(r)} className="px-2 py-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-bold cursor-pointer whitespace-nowrap">
                            Cancel Payment
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-black text-slate-800">
                  <td className="pt-2.5" colSpan={isPartner ? 3 : 4}>Total ({rows.length} leads)</td>
                  <td className="pt-2.5 text-right">{inr(totals.customer)}</td>
                  <td className="pt-2.5 text-right">{inr(totals.rate)}</td>
                  <td className="pt-2.5 text-right">{inr(totals.margin)}</td>
                  <td className="pt-2.5 text-right text-rose-600">{inr(totals.gst)}</td>
                  <td className="pt-2.5 text-right text-emerald-700">{inr(totals.incentive)}</td>
                  <td className="pt-2.5 pl-3 text-emerald-700 whitespace-nowrap">Paid {inr(totals.paid)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {rateLead && (
        <ChannelPartnerRateModal
          lead={rateLead}
          partnerName={resolveChannelPartner(rateLead, partners)?.name}
          customerPrice={contractMap[rateLead.id] || 0}
          updatedBy={currentUser?.fullName}
          onClose={() => setRateLead(null)}
          onSaved={updated => setLeads(prev => prev.map(l => (l.id === updated.id ? updated : l)))}
        />
      )}

      {payRow && payRow.inc && currentUser && (
        <ChannelPartnerPayoutModal
          lead={payRow.lead}
          partnerId={payRow.partnerId}
          partnerName={payRow.partnerName}
          inc={payRow.inc}
          user={currentUser}
          onClose={() => setPayRow(null)}
          onPaid={payout => {
            setPayouts(prev => [...prev.filter(p => p.id !== payout.id), payout]);
            setPayRow(null);
            alert(`✅ Payment saved. Receipt ${payout.receiptNo} created.\nUse the "Receipt" button on the lead to view or print it.`);
          }}
        />
      )}
    </div>
  );
};

export default ChannelPartnerIncentives;
