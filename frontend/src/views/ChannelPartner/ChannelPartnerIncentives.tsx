import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Handshake, Loader2, Search, Download, IndianRupee, Users } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { leadService } from '../../services/leadService';
import { quotationService } from '../../services/quotationService';
import { orderService } from '../../services/orderService';
import { employeeService } from '../../services/employeeService';
import { buildContractValueMap, leadIncentive, resolveChannelPartner, type IncentiveBreakdown } from '../../services/channelPartnerIncentive';
import { ChannelPartnerRateModal } from '../../components/ChannelPartner/ChannelPartnerRateModal';
import type { Lead, OrderConfirmation, Profile } from '../../types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

interface Row {
  lead: Lead;
  partnerId: string;
  partnerName: string;
  date: string;
  customerPrice: number;
  inc: IncentiveBreakdown | null;
}

// Incentive month = booking month (confirmation / first payment), falling back to lead creation.
const bookingDate = (lead: Lead, oc?: OrderConfirmation) =>
  lead.confirmedAt || oc?.createdAt || oc?.payments?.[0]?.paidAt || lead.createdAt;

export const ChannelPartnerIncentives: React.FC = () => {
  const { currentUser, currentRole } = useAuthStore();
  const isPartner = currentRole === 'dealer';
  const canSetRate = currentRole === 'super_admin' || currentRole === 'admin' || currentRole === 'manager';

  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contractMap, setContractMap] = useState<Record<string, number>>({});
  const [ocMap, setOcMap] = useState<Record<string, OrderConfirmation>>({});
  const [partners, setPartners] = useState<Profile[]>([]);
  const [rateLead, setRateLead] = useState<Lead | null>(null);

  const [partnerFilter, setPartnerFilter] = useState('all');
  const [year, setYear] = useState<string>('all');
  const [month, setMonth] = useState<string>('all');
  const [rateFilter, setRateFilter] = useState<'all' | 'set' | 'pending'>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const [allLeads, quotes, ocs, emps] = await Promise.all([
        leadService.getLeads(),
        quotationService.getAllQuotations().catch(() => []),
        orderService.getAllOrderConfirmations().catch(() => []),
        employeeService.getEmployees().catch(() => [] as Profile[])
      ]);
      setLeads(allLeads);
      setContractMap(buildContractValueMap(quotes, ocs));
      const om: Record<string, OrderConfirmation> = {};
      ocs.forEach(oc => { if (oc.leadId) om[oc.leadId] = oc; });
      setOcMap(om);
      setPartners(emps.filter(e => e.role === 'dealer'));
    } finally {
      setLoading(false);
    }
  }, [isPartner, currentUser?.id]);

  useEffect(() => {
    load();
    let t: any;
    const onUpdate = (e: Event) => {
      const col = (e as CustomEvent).detail?.collectionName;
      if (col && !['leads', 'quotations', 'orderConfirmations'].includes(col)) return;
      clearTimeout(t);
      t = setTimeout(load, 800);
    };
    window.addEventListener('app-realtime-update', onUpdate);
    return () => { clearTimeout(t); window.removeEventListener('app-realtime-update', onUpdate); };
  }, [load]);

  const allRows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const lead of leads) {
      const partner = resolveChannelPartner(lead, partners);
      if (!partner || (isPartner && partner.id !== currentUser?.id)) continue;
      const customerPrice = contractMap[lead.id] || 0;
      out.push({
        lead,
        partnerId: partner.id,
        partnerName: partner.name,
        date: bookingDate(lead, ocMap[lead.id]),
        customerPrice,
        inc: leadIncentive(lead, customerPrice)
      });
    }
    return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [leads, partners, contractMap, ocMap, isPartner, currentUser?.id]);

  const years = useMemo(() => {
    const ys = new Set<string>([String(dayjs().year())]);
    allRows.forEach(r => r.date && ys.add(String(dayjs(r.date).year())));
    return [...ys].sort((a, b) => Number(b) - Number(a));
  }, [allRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(r => {
      const d = dayjs(r.date);
      if (year !== 'all' && String(d.year()) !== year) return false;
      if (month !== 'all' && d.month() !== Number(month)) return false;
      if (!isPartner && partnerFilter !== 'all' && r.partnerId !== partnerFilter) return false;
      if (rateFilter === 'set' && !r.inc) return false;
      if (rateFilter === 'pending' && r.inc) return false;
      if (q && !`${r.lead.name} ${r.lead.phoneNumber} ${r.partnerName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allRows, year, month, partnerFilter, rateFilter, search, isPartner]);

  const totals = useMemo(() => rows.reduce((t, r) => {
    t.customer += r.customerPrice;
    if (r.inc) {
      t.rate += r.inc.rate;
      t.margin += r.inc.margin;
      t.gst += r.inc.gst;
      t.incentive += r.inc.incentive;
      t.rated += 1;
    }
    return t;
  }, { customer: 0, rate: 0, margin: 0, gst: 0, incentive: 0, rated: 0 }), [rows]);

  const byPartner = useMemo(() => {
    const m = new Map<string, { id: string; name: string; leads: number; rated: number; customer: number; incentive: number }>();
    rows.forEach(r => {
      const p = m.get(r.partnerId) || { id: r.partnerId, name: r.partnerName, leads: 0, rated: 0, customer: 0, incentive: 0 };
      p.leads += 1;
      p.customer += r.customerPrice;
      if (r.inc) { p.rated += 1; p.incentive += r.inc.incentive; }
      m.set(r.partnerId, p);
    });
    return [...m.values()].sort((a, b) => b.incentive - a.incentive);
  }, [rows]);

  const exportCsv = () => {
    const header = ['Booking Date', 'Lead', 'Phone', 'Channel Partner', 'Status', 'Customer Quotation', 'Partner Rate', 'Margin', 'GST %', 'GST', 'Incentive'];
    const lines = rows.map(r => [
      r.date ? dayjs(r.date).format('DD-MM-YYYY') : '',
      r.lead.name, r.lead.phoneNumber, r.partnerName, r.lead.status,
      r.customerPrice, r.inc?.rate ?? '', r.inc?.margin ?? '', r.inc?.gstPct ?? '', r.inc?.gst ?? '', r.inc?.incentive ?? ''
    ]);
    const csv = [header, ...lines].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `Channel_Partner_Incentives_${month === 'all' ? '' : MONTHS[Number(month)] + '_'}${year}.csv`;
    a.click();
  };

  const selectCls = 'border border-slate-200 rounded-xl px-3 py-2 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer';

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Handshake className="w-6 h-6 text-purple-700" />
            {isPartner ? 'My Incentives' : 'Channel Partner Incentives'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Incentive = (Customer quotation − Rate given to partner) − GST on that margin
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

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 flex flex-wrap gap-2 items-center">
        {!isPartner && (
          <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)} className={selectCls}>
            <option value="all">All Channel Partners</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        )}
        <select value={month} onChange={e => setMonth(e.target.value)} className={selectCls}>
          <option value="all">All Months</option>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)} className={selectCls}>
          <option value="all">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={rateFilter} onChange={e => setRateFilter(e.target.value as any)} className={selectCls}>
          <option value="all">All Leads</option>
          <option value="set">Rate Set</option>
          <option value="pending">Rate Pending</option>
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search lead, phone or partner"
            className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Leads', value: `${rows.length}`, sub: `${totals.rated} with rate set`, cls: 'border-slate-300 text-slate-800' },
          { label: 'Customer Quotations', value: inr(totals.customer), cls: 'border-sky-300 text-sky-800' },
          { label: 'Partner Margin', value: inr(totals.margin), sub: `on partner rate ${inr(totals.rate)}`, cls: 'border-amber-300 text-amber-800' },
          { label: 'GST Deducted', value: inr(totals.gst), cls: 'border-rose-300 text-rose-700' },
          { label: 'Total Incentive', value: inr(totals.incentive), cls: 'border-emerald-400 text-emerald-700 bg-emerald-50/50' }
        ].map(c => (
          <div key={c.label} className={`bg-white border-l-4 border rounded-2xl p-4 ${c.cls}`}>
            <p className="text-[10px] font-black uppercase tracking-wider opacity-80">{c.label}</p>
            <p className="text-lg sm:text-xl font-black mt-1 break-all">{c.value}</p>
            {c.sub && <p className="text-[10px] font-semibold text-slate-500 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      {!isPartner && partnerFilter === 'all' && byPartner.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-purple-700" /> Partner-wise Summary
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase font-bold border-b border-slate-100 text-left">
                  <th className="pb-2">Channel Partner</th>
                  <th className="pb-2 text-center">Leads</th>
                  <th className="pb-2 text-center">Rate Set</th>
                  <th className="pb-2 text-right">Customer Value</th>
                  <th className="pb-2 text-right">Incentive</th>
                </tr>
              </thead>
              <tbody>
                {byPartner.map(p => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => setPartnerFilter(p.id)}>
                    <td className="py-2 font-bold text-slate-800">{p.name}</td>
                    <td className="py-2 text-center font-semibold">{p.leads}</td>
                    <td className="py-2 text-center font-semibold">{p.rated}</td>
                    <td className="py-2 text-right font-semibold">{inr(p.customer)}</td>
                    <td className="py-2 text-right font-black text-emerald-700">{inr(p.incentive)}</td>
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
          <IndianRupee className="w-4 h-4 text-purple-700" /> Lead-wise Incentive
        </h3>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-xs font-semibold text-slate-400">No channel partner leads for these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[860px]">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase font-bold border-b border-slate-100 text-left">
                  <th className="pb-2">Booking Date</th>
                  <th className="pb-2">Lead</th>
                  {!isPartner && <th className="pb-2">Partner</th>}
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Customer Quote</th>
                  <th className="pb-2 text-right">Partner Rate</th>
                  <th className="pb-2 text-right">Margin</th>
                  <th className="pb-2 text-right">GST</th>
                  <th className="pb-2 text-right">Incentive</th>
                  {canSetRate && <th className="pb-2 text-right"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.lead.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="py-2.5 font-semibold text-slate-500 whitespace-nowrap">{r.date ? dayjs(r.date).format('DD MMM YYYY') : '—'}</td>
                    <td className="py-2.5">
                      <p className="font-bold text-slate-800">{r.lead.name}</p>
                      <p className="text-[10px] text-slate-400">{r.lead.phoneNumber}</p>
                    </td>
                    {!isPartner && <td className="py-2.5 font-semibold text-purple-800">{r.partnerName}</td>}
                    <td className="py-2.5"><span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{r.lead.status.replace(/_/g, ' ')}</span></td>
                    <td className="py-2.5 text-right font-semibold">{r.customerPrice ? inr(r.customerPrice) : '—'}</td>
                    <td className="py-2.5 text-right font-semibold">{r.inc ? inr(r.inc.rate) : <span className="text-amber-600 italic">Pending</span>}</td>
                    <td className="py-2.5 text-right font-semibold">{r.inc ? inr(r.inc.margin) : '—'}</td>
                    <td className="py-2.5 text-right font-semibold text-rose-600">{r.inc ? `${inr(r.inc.gst)} (${r.inc.gstPct}%)` : '—'}</td>
                    <td className="py-2.5 text-right font-black text-emerald-700">{r.inc ? inr(r.inc.incentive) : '—'}</td>
                    {canSetRate && (
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setRateLead(r.lead)}
                          className="px-2 py-1 rounded-md bg-purple-700 hover:bg-purple-800 text-white text-[10px] font-bold cursor-pointer whitespace-nowrap"
                        >
                          {r.inc ? 'Edit Rate' : 'Set Rate'}
                        </button>
                      </td>
                    )}
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
                  {canSetRate && <td />}
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
    </div>
  );
};

export default ChannelPartnerIncentives;
