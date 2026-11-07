import React, { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { IndianRupee, Truck, Phone, Loader2, CheckCircle2, BellRing } from 'lucide-react';
import { leadService } from '../../services/leadService';
import { quotationService } from '../../services/quotationService';
import { orderService } from '../../services/orderService';
import { challanService } from '../../services/challanService';
import { dispatchRequestService } from '../../services/dispatchRequestService';
import { findDispatchReadyLeads, DISPATCH_READY_PAYMENT_SHARE, type DispatchReadyLead } from '../../services/dispatchReadiness';
import type { Challan, DispatchRequest, OrderConfirmation, Quotation } from '../../types';

dayjs.extend(relativeTime);

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

/** Inventory panel: confirmed leads that have paid at least half but have no delivery challan yet. */
export const PaymentReadyDispatchBoard: React.FC<{ onCreateChallan: (leadId: string) => void }> = ({ onCreateChallan }) => {
  const [rows, setRows] = useState<DispatchReadyLead[]>([]);
  const [loading, setLoading] = useState(true);

  // fresh = pull from the server; otherwise read the local cache (shown first, then replaced)
  const load = useCallback(async (fresh = false) => {
    try {
      const [leads, quotations, ocs, challans, requests] = await Promise.all([
        leadService.getLeads(fresh),
        quotationService.getAllQuotations(fresh).catch(() => [] as Quotation[]),
        orderService.getAllOrderConfirmations(fresh).catch(() => [] as OrderConfirmation[]),
        challanService.getChallans(fresh).catch(() => [] as Challan[]),
        dispatchRequestService.getAll(fresh).catch(() => [] as DispatchRequest[])
      ]);
      setRows(findDispatchReadyLeads({ leads, quotations, orderConfirmations: ocs, challans, dispatchRequests: requests }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().then(() => load(true));
    let t: any;
    const onUpdate = (e: Event) => {
      const col = (e as CustomEvent).detail?.collectionName;
      if (col && !['leads', 'orderConfirmations', 'quotations', 'challans', 'dispatchRequests'].includes(col)) return;
      clearTimeout(t);
      t = setTimeout(() => load(), 800);
    };
    window.addEventListener('app-realtime-update', onUpdate);
    return () => { clearTimeout(t); window.removeEventListener('app-realtime-update', onUpdate); };
  }, [load]);

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
      <div className="flex items-center gap-3">
        <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${rows.length ? 'bg-amber-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
          <IndianRupee className="w-5 h-5" />
          {rows.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-white text-amber-700 border border-amber-300 text-[10px] font-black rounded-full px-1.5">{rows.length}</span>
          )}
        </div>
        <div>
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Payment Received — Challan Pending</h2>
          <p className="text-[11px] text-slate-500 font-medium">
            Confirmed leads with {Math.round(DISPATCH_READY_PAYMENT_SHARE * 100)}% or more payment received and no delivery challan yet.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking payments…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs font-bold text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> No paid lead is waiting for a challan.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map(r => (
            <div key={r.lead.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-slate-900 truncate">{r.lead.name}</h3>
                  {r.lead.phoneNumber && (
                    <a href={`tel:${r.lead.phoneNumber}`} className="text-[11px] text-slate-500 font-semibold inline-flex items-center gap-1 hover:text-sky-700">
                      <Phone className="w-3 h-3" /> {r.lead.phoneNumber}
                    </a>
                  )}
                  {r.lead.requirement && <p className="text-[11px] text-emerald-700 font-bold truncate">⚡ {r.lead.requirement}</p>}
                </div>
                <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${r.paidPct >= 100 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                  {r.paidPct}% paid
                </span>
              </div>

              <div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div className={`h-full ${r.paidPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${r.paidPct}%` }} />
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 mt-1 text-[10px] font-semibold text-slate-500">
                  <span>Paid {inr(r.paid)} of {inr(r.orderTotal)}</span>
                  {r.lastPaymentAt && <span title={dayjs(r.lastPaymentAt).format('DD MMM YYYY, hh:mm A')}>Last payment {dayjs(r.lastPaymentAt).fromNow()}</span>}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                {r.hasOpenRequest ? (
                  <span className="text-[10px] font-bold text-sky-700 inline-flex items-center gap-1"><BellRing className="w-3 h-3" /> Admin also sent a dispatch request</span>
                ) : <span />}
                <button
                  type="button"
                  onClick={() => onCreateChallan(r.lead.id)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Truck className="w-3.5 h-3.5" /> Create Delivery Challan
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
