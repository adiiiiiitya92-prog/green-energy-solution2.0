import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Sun, Receipt, TrendingUp, CalendarDays, Loader2, Info, ChevronDown, ChevronUp, Download, AlertTriangle } from 'lucide-react';
import { leadService } from '../../services/leadService';
import { quotationService } from '../../services/quotationService';
import { orderService } from '../../services/orderService';
import { expenseService } from '../../services/expenseService';
import { paymentRequestService } from '../../services/paymentService';
import { employeeService } from '../../services/employeeService';
import { challanService } from '../../services/challanService';
import { productService } from '../../services/productService';
import { fetchCollectionFromFirestore } from '../../services/firebase';
import { db, getDeletedRecordIdsSet } from '../../services/db';
import { computeBusinessMetrics, yearMetrics, type MonthMetrics, type BusinessInput } from '../../services/businessMetrics';
import { BusinessDetailModal, LeadBreakdown, downloadLeadCsv, type DetailView } from './BusinessDetailModal';

const inr = (n: number) => `${n < 0 ? '−' : ''}₹${Math.round(Math.abs(n || 0)).toLocaleString('en-IN')}`;
const kwFmt = (n: number) => `${(Math.round((n || 0) * 10) / 10).toLocaleString('en-IN')} kW`;
const monthName = (key: string) => dayjs(`${key}-01`).format('MMMM YYYY');
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

async function loadCollection<T extends { id: string }>(name: 'productChallans' | 'installations', fresh: boolean): Promise<T[]> {
  if (fresh) {
    try {
      const remote = await fetchCollectionFromFirestore<any>(name);
      if (Array.isArray(remote) && remote.length > 0) await (db as any)[name].bulkPut(remote).catch(() => {});
    } catch (_) {}
  }
  const deleted = await getDeletedRecordIdsSet();
  const local: T[] = await (db as any)[name].toArray().catch(() => []);
  return local.filter(r => !deleted.has(r.id));
}

/** Super admin: profit & loss of completed ("Process Done") systems, from quoted / collected money and actual costs. */
export const BusinessOverview: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BusinessInput | null>(null);
  const [selMonth, setSelMonth] = useState(dayjs().format('YYYY-MM'));
  const [showTable, setShowTable] = useState(false);
  const [showLeads, setShowLeads] = useState(false);
  const [showLogic, setShowLogic] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailView | null>(null);

  const load = useCallback(async (fresh = false) => {
    try {
      const [leads, quotations, orderConfirmations, expenses, paymentRequests, emps, challans, products, productChallans, installations, evidenceLeadIds] = await Promise.all([
        leadService.getLeads(fresh),
        quotationService.getAllQuotations(fresh).catch(() => []),
        orderService.getAllOrderConfirmations(fresh).catch(() => []),
        expenseService.getAllExpenses().catch(() => []),
        paymentRequestService.getAll(fresh).catch(() => []),
        employeeService.getEmployees(fresh).catch(() => []),
        challanService.getChallans(fresh).catch(() => []),
        productService.getProducts().catch(() => []),
        loadCollection<any>('productChallans', fresh),
        loadCollection<any>('installations', fresh),
        orderService.getAllInstallationEvidenceLeadIds(fresh).catch(() => new Set<string>())
      ]);
      setData({
        leads, quotations, orderConfirmations, expenses, paymentRequests,
        partners: emps.filter(e => e.role === 'dealer'),
        challans, products, productChallans, installations, evidenceLeadIds
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().then(() => load(true));
    let t: any;
    const watched = ['leads', 'quotations', 'orderConfirmations', 'expenses', 'paymentRequests', 'challans', 'productChallans', 'products', 'installations'];
    const onUpdate = (e: Event) => {
      const col = (e as CustomEvent).detail?.collectionName;
      if (col && !watched.includes(col)) return;
      clearTimeout(t);
      t = setTimeout(() => load(), 1500);
    };
    window.addEventListener('app-realtime-update', onUpdate);
    return () => { clearTimeout(t); window.removeEventListener('app-realtime-update', onUpdate); };
  }, [load]);

  const metrics = useMemo(() => data && computeBusinessMetrics(data), [data]);
  const selYear = Number(selMonth.slice(0, 4));
  const year = useMemo(() => metrics && yearMetrics(metrics.months, selYear), [metrics, selYear]);
  const m: MonthMetrics | undefined = year?.months.find(x => x.key === selMonth);
  const y = year?.total;

  const card = 'bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col text-left cursor-pointer hover:shadow-md hover:border-slate-300 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40';
  const openHint = <span className="mt-auto pt-3 text-[10px] font-bold text-slate-400">Click to open full list with filters →</span>;
  const label = 'text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5';
  const line = 'flex justify-between gap-2 text-[11px] font-semibold text-slate-500';
  const monthShort = dayjs(`${selMonth}-01`).format('MMM YYYY');
  const profitCls = (v: number) => (v >= 0 ? 'text-emerald-700' : 'text-red-600');

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Business Overview</h2>
        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
          Month
          <input
            type="month"
            value={selMonth}
            max={dayjs().format('YYYY-MM')}
            onChange={e => e.target.value && setSelMonth(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 bg-white"
          />
        </label>
      </div>

      {loading || !metrics || !year || !y ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Calculating…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* 1. Completed installations */}
            <button type="button" onClick={() => setDetail('installations')} className={`${card} border-l-4 border-l-amber-400`}>
              <p className={label}><Sun className="w-3.5 h-3.5 text-amber-500" /> Completed Installations</p>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{m?.systems || 0} <span className="text-base font-bold text-slate-500">systems</span></p>
              <p className="text-[11px] font-bold text-slate-500">{monthShort} • {kwFmt(m?.kw || 0)}</p>
              <div className="mt-3 space-y-1">
                <div className={line}><span>Payment done</span><span className="text-emerald-700">{m?.doneCount || 0}</span></div>
                <div className={line}><span>Payment due</span><span className="text-amber-700">{m?.dueCount || 0}</span></div>
                <div className={line}><span>All time completed</span><span className="text-slate-800">{metrics.capacity.systems} • {kwFmt(metrics.capacity.kw)}</span></div>
              </div>
              {openHint}
            </button>

            {/* 2. System cost */}
            <button type="button" onClick={() => setDetail('cost')} className={`${card} border-l-4 border-l-rose-400`}>
              <p className={label}><Receipt className="w-3.5 h-3.5 text-rose-500" /> System Cost • {monthShort}</p>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{inr(m?.systemCost || 0)}</p>
              <p className="text-[11px] font-bold text-slate-500">{m?.systems || 0} completed systems</p>
              <div className="mt-3 space-y-1">
                <div className={line}><span>Material dispatched</span><span>{inr(m?.material || 0)}</span></div>
                <div className={line}><span>Installation payments</span><span>{inr(m?.installation || 0)}</span></div>
                <div className={line}><span>Expenses on these leads</span><span>{inr(m?.leadExpenses || 0)}</span></div>
                <div className={line}><span>Channel partner incentive</span><span>{inr(m?.partnerIncentive || 0)}</span></div>
              </div>
              {(m?.unpricedItems || 0) > 0 && (
                <p className="mt-2 text-[10px] font-bold text-amber-700 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  {m!.unpricedItems} dispatched item line(s) have no purchase price in the catalog, so their cost is not counted.
                </p>
              )}
              {openHint}
            </button>

            {/* 3. Monthly profit */}
            <button type="button" onClick={() => setDetail('profit')} className={`${card} border-l-4 ${(m?.profit || 0) >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
              <p className={label}><TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Profit • {monthShort}</p>
              <p className={`text-2xl sm:text-3xl font-black mt-1 ${profitCls(m?.profit || 0)}`}>{inr(m?.profit || 0)}</p>
              <p className="text-[11px] font-bold text-slate-500">Margin {pct(m?.profit || 0, m?.quoted || 0)} on quoted amount</p>
              <div className="mt-3 space-y-1">
                <div className={line}><span>Quoted (without GST)</span><span className="text-slate-800">{inr(m?.quoted || 0)}</span></div>
                <div className={line}><span>Collected (without GST)</span><span className="text-slate-800">{inr(m?.collected || 0)}</span></div>
                <div className={line}><span>Cash profit</span><span className={profitCls(m?.cashProfit || 0)}>{inr(m?.cashProfit || 0)}</span></div>
                <div className={line}><span>Still to collect (with GST)</span><span className="text-amber-700">{inr(m?.pendingWithGst || 0)}</span></div>
                <div className={line}><span>− General expenses</span><span>{inr(m?.generalExpenses || 0)}</span></div>
                <div className={`${line} font-black`}><span>Net profit</span><span className={profitCls(m?.netProfit || 0)}>{inr(m?.netProfit || 0)}</span></div>
              </div>
              {openHint}
            </button>

            {/* 4. Yearly profit */}
            <button type="button" onClick={() => setDetail('yearly')} className={`${card} border-l-4 border-l-indigo-500`}>
              <p className={label}><CalendarDays className="w-3.5 h-3.5 text-indigo-600" /> Yearly Profit • {selYear}</p>
              <p className={`text-2xl sm:text-3xl font-black mt-1 ${y.profit >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>{inr(y.profit)}</p>
              <p className="text-[11px] font-bold text-slate-500">
                {year.monthsElapsed === 12 ? 'Full year' : year.monthsElapsed ? `Jan – ${dayjs(`${selYear}-${String(year.monthsElapsed).padStart(2, '0')}-01`).format('MMM')} (so far)` : '—'}
                {' '}• {y.systems} systems
              </p>
              <div className="mt-3 space-y-1">
                <div className={line}><span>Quoted (without GST)</span><span className="text-slate-800">{inr(y.quoted)}</span></div>
                <div className={line}><span>Collected (without GST)</span><span className="text-slate-800">{inr(y.collected)}</span></div>
                <div className={line}><span>System cost</span><span>{inr(y.systemCost)}</span></div>
                <div className={line}><span>Cash profit</span><span className={profitCls(y.cashProfit)}>{inr(y.cashProfit)}</span></div>
                <div className={`${line} font-black`}><span>Net profit</span><span className={profitCls(y.netProfit)}>{inr(y.netProfit)}</span></div>
              </div>
              {openHint}
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setShowTable(s => !s)} className="text-[11px] font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer">
              {showTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Month-wise {selYear}
            </button>
            <button type="button" onClick={() => setShowLeads(s => !s)} className="text-[11px] font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer">
              {showLeads ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Lead-wise {monthShort} ({m?.systems || 0})
            </button>
            <button type="button" onClick={() => setShowLogic(s => !s)} className="text-[11px] font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer">
              <Info className="w-3.5 h-3.5" /> How is this calculated?
            </button>
          </div>

          {showTable && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 overflow-x-auto">
              <div className="flex justify-end mb-2">
                <button type="button" onClick={() => downloadLeadCsv(y.leads, `profit-loss-${selYear}.csv`)} className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 cursor-pointer">
                  <Download className="w-3.5 h-3.5" /> Download {selYear} (lead-wise CSV)
                </button>
              </div>
              <table className="w-full text-xs min-w-[980px]">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase font-bold border-b border-slate-100 text-left">
                    <th className="pb-2">Month</th>
                    <th className="pb-2 text-right">Systems</th>
                    <th className="pb-2 text-right">Quoted</th>
                    <th className="pb-2 text-right">Collected</th>
                    <th className="pb-2 text-right">Material</th>
                    <th className="pb-2 text-right">Installation</th>
                    <th className="pb-2 text-right">Lead Exp.</th>
                    <th className="pb-2 text-right">Partner Inc.</th>
                    <th className="pb-2 text-right">System Cost</th>
                    <th className="pb-2 text-right">Profit</th>
                    <th className="pb-2 text-right">Cash Profit</th>
                    <th className="pb-2 text-right">General Exp.</th>
                    <th className="pb-2 text-right">Net Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {year.months.filter(x => x.systems || x.generalExpenses).map(x => (
                    <tr key={x.key} className={`border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 ${x.key === selMonth ? 'bg-amber-50/60' : ''}`} onClick={() => { setSelMonth(x.key); setShowLeads(true); }}>
                      <td className="py-2 font-bold text-slate-800">{monthName(x.key)}</td>
                      <td className="py-2 text-right">{x.systems} <span className="text-[10px] text-slate-400">({x.doneCount} paid / {x.dueCount} due)</span></td>
                      <td className="py-2 text-right font-semibold">{inr(x.quoted)}</td>
                      <td className="py-2 text-right">{inr(x.collected)}</td>
                      <td className="py-2 text-right">{inr(x.material)}</td>
                      <td className="py-2 text-right">{inr(x.installation)}</td>
                      <td className="py-2 text-right">{inr(x.leadExpenses)}</td>
                      <td className="py-2 text-right">{inr(x.partnerIncentive)}</td>
                      <td className="py-2 text-right font-semibold">{inr(x.systemCost)}</td>
                      <td className={`py-2 text-right font-black ${profitCls(x.profit)}`}>{inr(x.profit)}</td>
                      <td className={`py-2 text-right ${profitCls(x.cashProfit)}`}>{inr(x.cashProfit)}</td>
                      <td className="py-2 text-right">{inr(x.generalExpenses)}</td>
                      <td className={`py-2 text-right font-black ${profitCls(x.netProfit)}`}>{inr(x.netProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showLeads && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-xs font-black text-slate-800">Completed systems • {monthName(selMonth)}</p>
                {m && m.leads.length > 0 && (
                  <button type="button" onClick={() => downloadLeadCsv(m.leads, `profit-loss-${selMonth}.csv`)} className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 cursor-pointer">
                    <Download className="w-3.5 h-3.5" /> Download CSV
                  </button>
                )}
              </div>
              {!m || m.leads.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No completed systems in this month.</p>
              ) : (
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="text-slate-400 text-[10px] uppercase font-bold border-b border-slate-100 text-left">
                      <th className="pb-2">Customer</th>
                      <th className="pb-2">Completed</th>
                      <th className="pb-2">Payment</th>
                      <th className="pb-2 text-right">Quoted</th>
                      <th className="pb-2 text-right">Collected</th>
                      <th className="pb-2 text-right">Material</th>
                      <th className="pb-2 text-right">Install + Exp. + Inc.</th>
                      <th className="pb-2 text-right">System Cost</th>
                      <th className="pb-2 text-right">Profit</th>
                      <th className="pb-2 text-right">Cash Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.leads.map(r => (
                      <React.Fragment key={r.leadId}>
                        <tr className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setOpenLead(o => (o === r.leadId ? null : r.leadId))}>
                          <td className="py-2">
                            <p className="font-bold text-slate-800">{r.name}</p>
                            <p className="text-[10px] text-slate-400">{r.phone}{r.kw ? ` • ${kwFmt(r.kw)}` : ''}</p>
                          </td>
                          <td className="py-2 text-slate-600">
                            {dayjs(r.completedAt).format('DD MMM')}
                            <span className="block text-[9px] text-slate-400">{r.completedFrom === 'installation' ? 'installation done' : r.completedFrom === 'dispatch' ? 'last dispatch' : 'lead date'}</span>
                          </td>
                          <td className="py-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${r.paymentStatus === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {r.paymentStatus === 'done' ? 'Paid' : `Due ${inr(r.pendingWithGst)}`}
                            </span>
                          </td>
                          <td className="py-2 text-right font-semibold">{inr(r.quoted)}</td>
                          <td className="py-2 text-right">{inr(r.collected)}</td>
                          <td className="py-2 text-right">
                            {inr(r.material)}
                            {r.unpricedItems > 0 && <span className="block text-[9px] font-bold text-amber-700">{r.unpricedItems} item(s) unpriced</span>}
                          </td>
                          <td className="py-2 text-right">{inr(r.installation + r.leadExpenses + r.partnerIncentive)}</td>
                          <td className="py-2 text-right font-semibold">{inr(r.systemCost)}</td>
                          <td className={`py-2 text-right font-black ${profitCls(r.profit)}`}>{inr(r.profit)}</td>
                          <td className={`py-2 text-right ${profitCls(r.cashProfit)}`}>{inr(r.cashProfit)}</td>
                        </tr>
                        {openLead === r.leadId && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={10} className="p-3">
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
          )}

          {showLogic && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-[11px] text-slate-600 font-medium space-y-1.5">
              <p><b>Which leads:</b> only "Process Done" leads, the same ones as the Lead Pipeline filters "Process Done – Payment Due" and "Process &amp; Payment Done". A lead is process done when it is Installed or Closed, material has been dispatched, or installation photos / release documents are uploaded.</p>
              <p><b>Month:</b> the month the work was completed. That is the installation completed date, else the last delivery challan date.</p>
              <p><b>Quoted:</b> the client's contract value (latest quotation, else order value) without GST. <b>Collected:</b> payments recorded on the order, without GST.</p>
              <p><b>System cost</b> = material dispatched to the lead (delivery &amp; product challans: quantity × catalog purchase price) + approved installation payments of the lead + approved expenses linked to the lead + channel partner incentive.</p>
              <p><b>Profit</b> = Quoted − System cost. <b>Cash profit</b> = Collected − System cost. <b>Net profit</b> = Profit − general expenses (approved expenses not linked to any lead, by expense date).</p>
              <p><b>Expense → lead:</b> the lead picked in the expense form. For older expenses, the customer name written in "Project / Site" is matched to a lead.</p>
            </div>
          )}
        </>
      )}

      {detail && metrics && (
        <BusinessDetailModal
          view={detail}
          leads={metrics.leads}
          generalExpenses={metrics.generalExpenses}
          selMonth={selMonth}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  );
};
