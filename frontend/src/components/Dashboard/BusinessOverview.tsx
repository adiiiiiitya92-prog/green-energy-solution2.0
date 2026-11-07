import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Sun, Receipt, TrendingUp, CalendarDays, Pencil, Check, X, Loader2, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { leadService } from '../../services/leadService';
import { quotationService } from '../../services/quotationService';
import { orderService } from '../../services/orderService';
import { expenseService } from '../../services/expenseService';
import { paymentRequestService } from '../../services/paymentService';
import { employeeService } from '../../services/employeeService';
import { buildApiUrl, fetchDocumentFromFirestore } from '../../services/firebase';
import { computeBusinessMetrics, yearMetrics, type MonthMetrics } from '../../services/businessMetrics';
import { useAuthStore } from '../../store/authStore';
import type { ExpenseClaim, Lead, OrderConfirmation, PaymentRequest, Profile, Quotation } from '../../types';

const SETTINGS_PATH = '/api/firestore/systemSettings/businessMetrics';
const inr = (n: number) => `${n < 0 ? '−' : ''}₹${Math.round(Math.abs(n || 0)).toLocaleString('en-IN')}`;
const kwFmt = (n: number) => `${(Math.round((n || 0) * 10) / 10).toLocaleString('en-IN')} kW`;
const monthName = (key: string) => dayjs(`${key}-01`).format('MMMM YYYY');

/** Super admin: installed capacity, system cost, monthly profit and yearly profit. */
export const BusinessOverview: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ leads: Lead[]; quotations: Quotation[]; ocs: OrderConfirmation[]; expenses: ExpenseClaim[]; payReqs: PaymentRequest[]; partners: Profile[] } | null>(null);
  const [costPerKw, setCostPerKw] = useState<number>(0);
  const [editingCost, setEditingCost] = useState(false);
  const [costInput, setCostInput] = useState('');
  const [savingCost, setSavingCost] = useState(false);
  const [selMonth, setSelMonth] = useState(dayjs().format('YYYY-MM'));
  const [showTable, setShowTable] = useState(false);
  const [showLogic, setShowLogic] = useState(false);

  const load = useCallback(async (fresh = false) => {
    try {
      const [leads, quotations, ocs, expenses, payReqs, emps] = await Promise.all([
        leadService.getLeads(fresh),
        quotationService.getAllQuotations(fresh).catch(() => [] as Quotation[]),
        orderService.getAllOrderConfirmations(fresh).catch(() => [] as OrderConfirmation[]),
        expenseService.getAllExpenses().catch(() => [] as ExpenseClaim[]),
        paymentRequestService.getAll(fresh).catch(() => [] as PaymentRequest[]),
        employeeService.getEmployees(fresh).catch(() => [] as Profile[])
      ]);
      setData({ leads, quotations, ocs, expenses, payReqs, partners: emps.filter(e => e.role === 'dealer') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().then(() => load(true));
    fetchDocumentFromFirestore<{ id: string; costPerKw?: number }>('systemSettings', 'businessMetrics')
      .then(doc => setCostPerKw(Number(doc?.costPerKw) || 0))
      .catch(() => {});
    let t: any;
    const onUpdate = (e: Event) => {
      const col = (e as CustomEvent).detail?.collectionName;
      if (col && !['leads', 'quotations', 'orderConfirmations', 'expenses', 'paymentRequests'].includes(col)) return;
      clearTimeout(t);
      t = setTimeout(() => load(), 1500);
    };
    window.addEventListener('app-realtime-update', onUpdate);
    return () => { clearTimeout(t); window.removeEventListener('app-realtime-update', onUpdate); };
  }, [load]);

  const metrics = useMemo(() => data && computeBusinessMetrics({
    leads: data.leads, quotations: data.quotations, orderConfirmations: data.ocs,
    expenses: data.expenses, paymentRequests: data.payReqs, partners: data.partners, costPerKw
  }), [data, costPerKw]);

  const selYear = Number(selMonth.slice(0, 4));
  const year = useMemo(() => metrics && yearMetrics(metrics.months, selYear), [metrics, selYear]);
  const m: MonthMetrics | undefined = year?.months.find(x => x.key === selMonth);
  const thisMonthKw = metrics?.months.get(dayjs().format('YYYY-MM'))?.kw || 0;

  const saveCost = async () => {
    const v = Math.round(Number(costInput));
    if (!(v > 0)) { alert('Enter cost per kW in ₹ (e.g. 38000).'); return; }
    setSavingCost(true);
    try {
      const res = await fetch(buildApiUrl(SETTINGS_PATH), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'businessMetrics', costPerKw: v, updatedAt: new Date().toISOString(), updatedBy: currentUser?.fullName || '' })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCostPerKw(v);
      setEditingCost(false);
    } catch (err: any) {
      alert(`Could not save cost per kW (${err?.message || 'network error'}). Please try again.`);
    } finally {
      setSavingCost(false);
    }
  };

  const costEditor = editingCost ? (
    <div className="flex items-center gap-1.5 mt-2">
      <span className="text-[11px] font-bold text-slate-500">₹</span>
      <input
        autoFocus
        type="number"
        min="1"
        inputMode="numeric"
        value={costInput}
        onChange={e => setCostInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') saveCost(); if (e.key === 'Escape') setEditingCost(false); }}
        placeholder="e.g. 38000"
        className="w-28 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
      <span className="text-[11px] font-bold text-slate-500">/ kW</span>
      <button type="button" onClick={saveCost} disabled={savingCost} className="p-1 rounded-md bg-emerald-600 text-white cursor-pointer disabled:opacity-60">
        {savingCost ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
      <button type="button" onClick={() => setEditingCost(false)} className="p-1 rounded-md bg-slate-100 text-slate-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => { setCostInput(costPerKw ? String(costPerKw) : ''); setEditingCost(true); }}
      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
    >
      <Pencil className="w-3 h-3" /> {costPerKw ? `Material + installation: ${inr(costPerKw)} / kW` : 'Set system cost per kW'}
    </button>
  );

  const needsCost = !costPerKw;
  const card = 'bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col';
  const label = 'text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5';
  const line = 'flex justify-between gap-2 text-[11px] font-semibold text-slate-500';

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

      {loading || !metrics || !year ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Calculating…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* 1. Installed capacity */}
            <div className={`${card} border-l-4 border-l-amber-400`}>
              <p className={label}><Sun className="w-3.5 h-3.5 text-amber-500" /> Total Installation</p>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{kwFmt(metrics.capacity.totalKw)}</p>
              <p className="text-[11px] font-bold text-slate-500">{metrics.capacity.systems} systems • confirmed & after</p>
              <div className="mt-3 space-y-1">
                <div className={line}><span>Installed / closed</span><span className="text-emerald-700">{kwFmt(metrics.capacity.doneKw)} ({metrics.capacity.doneSystems})</span></div>
                <div className={line}><span>Confirmed, in progress</span><span className="text-sky-700">{kwFmt(metrics.capacity.inProgressKw)} ({metrics.capacity.inProgressSystems})</span></div>
                <div className={line}><span>Booked this month</span><span className="text-slate-800">+{kwFmt(thisMonthKw)}</span></div>
              </div>
              {metrics.capacity.unknownKwSystems > 0 && (
                <p className="text-[10px] text-slate-400 mt-2">{metrics.capacity.unknownKwSystems} booked lead(s) have no kW in quotation/requirement and are not counted.</p>
              )}
            </div>

            {/* 2. System cost */}
            <div className={`${card} border-l-4 border-l-rose-400`}>
              <p className={label}><Receipt className="w-3.5 h-3.5 text-rose-500" /> System Cost • {dayjs(`${selMonth}-01`).format('MMM YYYY')}</p>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">{inr(m?.cost || 0)}</p>
              <p className="text-[11px] font-bold text-slate-500">{m?.systems || 0} systems • {kwFmt(m?.kw || 0)}</p>
              <div className="mt-3 space-y-1">
                <div className={line}><span>Material + installation</span><span>{needsCost ? '—' : inr(m?.materialCost || 0)}</span></div>
                <div className={line}><span>Expenses (approved)</span><span>{inr(m?.expenses || 0)}</span></div>
                <div className={line}><span>Installation payments</span><span>{inr(m?.installationPayments || 0)}</span></div>
                <div className={line}><span>Channel partner incentive</span><span>{inr(m?.partnerIncentive || 0)}</span></div>
              </div>
              {costEditor}
            </div>

            {/* 3. Monthly profit */}
            <div className={`${card} border-l-4 ${(m?.profit || 0) >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
              <p className={label}><TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Profit • {dayjs(`${selMonth}-01`).format('MMM YYYY')}</p>
              {needsCost ? (
                <p className="text-sm font-bold text-amber-700 mt-2">Set system cost per kW to see profit.</p>
              ) : (
                <>
                  <p className={`text-2xl sm:text-3xl font-black mt-1 ${(m?.profit || 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{inr(m?.profit || 0)}</p>
                  <p className="text-[11px] font-bold text-slate-500">
                    Margin {m?.revenue ? Math.round(((m.profit) / m.revenue) * 100) : 0}%
                  </p>
                </>
              )}
              <div className="mt-3 space-y-1">
                <div className={line}><span>Sales (without GST)</span><span className="text-slate-800">{inr(m?.revenue || 0)}</span></div>
                <div className={line}><span>− System cost</span><span>{needsCost ? '—' : inr(m?.cost || 0)}</span></div>
              </div>
            </div>

            {/* 4. Yearly profit */}
            <div className={`${card} border-l-4 border-l-indigo-500`}>
              <p className={label}><CalendarDays className="w-3.5 h-3.5 text-indigo-600" /> Yearly Profit • {selYear}</p>
              {needsCost ? (
                <p className="text-sm font-bold text-amber-700 mt-2">Set system cost per kW to see profit.</p>
              ) : (
                <>
                  <p className={`text-2xl sm:text-3xl font-black mt-1 ${year.profitSoFar >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>{inr(year.profitSoFar)}</p>
                  <p className="text-[11px] font-bold text-slate-500">
                    {year.monthsElapsed === 12 ? 'Full year' : `Jan – ${dayjs(`${selYear}-${String(year.monthsElapsed).padStart(2, '0')}-01`).format('MMM')} (so far)`}
                  </p>
                </>
              )}
              <div className="mt-3 space-y-1">
                <div className={line}><span>Sales (without GST)</span><span className="text-slate-800">{inr(year.revenue)}</span></div>
                <div className={line}><span>Installed in year</span><span>{kwFmt(year.kw)}</span></div>
                {!needsCost && year.monthsElapsed < 12 && (
                  <div className={line}><span>Projected full year</span><span className="text-indigo-700">{inr(year.projectedProfit)}</span></div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setShowTable(s => !s)} className="text-[11px] font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer">
              {showTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Month-wise {selYear}
            </button>
            <button type="button" onClick={() => setShowLogic(s => !s)} className="text-[11px] font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer">
              <Info className="w-3.5 h-3.5" /> How is this calculated?
            </button>
          </div>

          {showTable && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 overflow-x-auto">
              <table className="w-full text-xs min-w-[760px]">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase font-bold border-b border-slate-100 text-left">
                    <th className="pb-2">Month</th>
                    <th className="pb-2 text-right">Systems</th>
                    <th className="pb-2 text-right">kW</th>
                    <th className="pb-2 text-right">Sales (ex GST)</th>
                    <th className="pb-2 text-right">Material + Install</th>
                    <th className="pb-2 text-right">Expenses</th>
                    <th className="pb-2 text-right">Inst. Payments</th>
                    <th className="pb-2 text-right">Partner Inc.</th>
                    <th className="pb-2 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {year.months.filter(x => x.systems || x.cost).map(x => (
                    <tr key={x.key} className={`border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 ${x.key === selMonth ? 'bg-amber-50/60' : ''}`} onClick={() => setSelMonth(x.key)}>
                      <td className="py-2 font-bold text-slate-800">{monthName(x.key)}</td>
                      <td className="py-2 text-right">{x.systems}</td>
                      <td className="py-2 text-right">{kwFmt(x.kw)}</td>
                      <td className="py-2 text-right font-semibold">{inr(x.revenue)}</td>
                      <td className="py-2 text-right">{needsCost ? '—' : inr(x.materialCost)}</td>
                      <td className="py-2 text-right">{inr(x.expenses)}</td>
                      <td className="py-2 text-right">{inr(x.installationPayments)}</td>
                      <td className="py-2 text-right">{inr(x.partnerIncentive)}</td>
                      <td className={`py-2 text-right font-black ${x.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{needsCost ? '—' : inr(x.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showLogic && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-[11px] text-slate-600 font-medium space-y-1.5">
              <p><b>Total installation:</b> kW of every lead that is Confirmed, Registered, Installed or Closed. kW is read from the quotation's System Capacity, else from the lead requirement (e.g. "3 Kw Solar Rooftop System").</p>
              <p><b>Month of a sale:</b> the lead's confirmation date (else order confirmation / first payment date).</p>
              <p><b>Sales:</b> latest quotation total of those leads, without GST.</p>
              <p><b>System cost:</b> kW sold × cost per kW (material + installation, set above) + approved expenses (by expense date) + approved installation payments (by approval date) + channel partner incentive on partner leads.</p>
              <p><b>Profit</b> = Sales − System cost. <b>Yearly profit</b> = sum of monthly profit from January to now; <b>projected</b> = average monthly profit × 12.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
};
