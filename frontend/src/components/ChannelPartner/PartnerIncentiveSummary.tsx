import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { Handshake, ChevronRight, Receipt } from 'lucide-react';
import { useIncentiveData, sumRows } from '../../views/ChannelPartner/useIncentiveData';
import { openPayoutReceipt } from '../../services/channelPartnerPayoutReceipt';

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

/** Channel partner's own incentive totals and latest payouts, for their dashboard. */
export const PartnerIncentiveSummary: React.FC<{ partnerId: string }> = ({ partnerId }) => {
  const { loading, rows } = useIncentiveData(partnerId);
  const t = useMemo(() => sumRows(rows), [rows]);
  const thisYear = useMemo(() => {
    const y = dayjs().year();
    return rows.filter(r => r.payout && dayjs(r.payout.paidAt).year() === y).reduce((s, r) => s + (r.payout?.amount || 0), 0);
  }, [rows]);
  const recent = useMemo(
    () => rows.filter(r => r.payout).sort((a, b) => (b.payout!.paidAt || '').localeCompare(a.payout!.paidAt || '')).slice(0, 3),
    [rows]
  );

  const cards = [
    { label: 'Total Incentive', value: inr(t.incentive), sub: `${t.rated} of ${t.leads} leads rated`, cls: 'text-purple-800' },
    { label: 'Received', value: inr(t.paid), sub: `${t.paidCount} payment(s) • ${inr(thisYear)} this year`, cls: 'text-emerald-700' },
    { label: 'Ready for Payout', value: inr(t.ready), sub: `${t.readyCount} closed lead(s)`, cls: 'text-sky-800' },
    { label: 'After Lead Closure', value: inr(t.locked), sub: `${t.lockedCount} lead(s) not closed yet`, cls: 'text-slate-700' }
  ];

  return (
    <div className="bg-white border border-purple-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Handshake className="w-5 h-5 text-purple-700" /> My Incentives
        </h3>
        <Link to="/channel-partner-incentives" className="text-[11px] font-bold text-purple-700 flex items-center gap-0.5 hover:underline">
          View all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{c.label}</p>
            <p className={`text-lg font-black mt-0.5 break-all ${c.cls}`}>{loading ? '…' : c.value}</p>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Latest payouts</p>
          {recent.map(r => (
            <div key={r.lead.id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-xl px-3 py-2 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-slate-800 truncate">{r.lead.name}</p>
                <p className="text-[10px] text-slate-400 font-semibold">{dayjs(r.payout!.paidAt).format('DD MMM YYYY')} • {r.payout!.receiptNo}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-black text-emerald-700">{inr(r.payout!.amount)}</span>
                <button type="button" onClick={() => openPayoutReceipt(r.payout!)} className="p-1.5 rounded-lg bg-slate-800 text-white cursor-pointer" title="Receipt">
                  <Receipt className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-slate-400 font-semibold">Incentive is paid after your lead is closed (release complete).</p>
    </div>
  );
};
