import React, { useState } from 'react';
import dayjs from 'dayjs';
import { X, Loader2, BadgeIndianRupee } from 'lucide-react';
import { channelPartnerPayoutService, PAYOUT_MODE_LABEL, type ChannelPartnerPayout, type PayoutMode } from '../../services/channelPartnerPayoutService';
import type { IncentiveBreakdown } from '../../services/channelPartnerIncentive';
import type { Lead, Profile } from '../../types';

interface Props {
  lead: Lead;
  partnerId: string;
  partnerName: string;
  inc: IncentiveBreakdown;
  user: Profile;
  onClose: () => void;
  onPaid: (payout: ChannelPartnerPayout) => void;
}

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

export const ChannelPartnerPayoutModal: React.FC<Props> = ({ lead, partnerId, partnerName, inc, user, onClose, onPaid }) => {
  const [amount, setAmount] = useState(String(Math.round(inc.incentive)));
  const [paidOn, setPaidOn] = useState(dayjs().format('YYYY-MM-DD'));
  const [mode, setMode] = useState<PayoutMode>('bank');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const amt = Math.round(Number(amount) || 0);
  const differs = amt > 0 && amt !== Math.round(inc.incentive);

  const save = async () => {
    setError('');
    if (!(amt > 0)) { setError('Enter the amount paid.'); return; }
    if (!paidOn || dayjs(paidOn).isAfter(dayjs(), 'day')) { setError('Payment date cannot be in the future.'); return; }
    if (differs && !notes.trim()) { setError('Amount is different from the calculated incentive — please add a note explaining why.'); return; }
    setSaving(true);
    try {
      const payout = await channelPartnerPayoutService.markPaid({
        lead,
        leadId: lead.id,
        leadName: lead.name,
        leadPhone: lead.phoneNumber,
        partnerId,
        partnerName,
        amount: amt,
        incentive: inc.incentive,
        customerPrice: inc.customerPrice,
        partnerRate: inc.rate,
        margin: inc.margin,
        gst: inc.gst,
        gstPct: inc.gstPct,
        mode,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        // noon local time keeps the chosen day stable in every timezone
        paidAt: dayjs(`${paidOn}T12:00:00`).toISOString(),
        paidById: user.id,
        paidByName: user.fullName
      });
      onPaid(payout);
    } catch (err: any) {
      setError(err?.message || 'Could not save the payment.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-1.5">
              <BadgeIndianRupee className="w-5 h-5 text-emerald-600" /> Mark Incentive Paid
            </h2>
            <p className="text-[11px] text-slate-500 font-semibold truncate">{partnerName} • {lead.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 font-semibold text-slate-600">
            <div className="flex justify-between"><span>Customer quotation</span><span>{inr(inc.customerPrice)}</span></div>
            <div className="flex justify-between"><span>Partner rate</span><span>{inr(inc.rate)}</span></div>
            <div className="flex justify-between"><span>Margin</span><span>{inr(inc.margin)}</span></div>
            <div className="flex justify-between text-rose-600"><span>GST ({inc.gstPct}%)</span><span>− {inr(inc.gst)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-black text-emerald-700"><span>Incentive</span><span>{inr(inc.incentive)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="block text-[10px] font-bold text-slate-500 uppercase">Amount paid (₹)</span>
              <input type="number" min="1" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} className={field} />
            </label>
            <label className="space-y-1">
              <span className="block text-[10px] font-bold text-slate-500 uppercase">Payment date</span>
              <input type="date" value={paidOn} max={dayjs().format('YYYY-MM-DD')} onChange={e => setPaidOn(e.target.value)} className={field} />
            </label>
          </div>
          {differs && <p className="text-[11px] font-bold text-amber-700">Amount differs from the calculated incentive by {inr(amt - inc.incentive)}.</p>}

          <label className="block space-y-1">
            <span className="block text-[10px] font-bold text-slate-500 uppercase">Payment mode</span>
            <select value={mode} onChange={e => setMode(e.target.value as PayoutMode)} className={field}>
              {(Object.keys(PAYOUT_MODE_LABEL) as PayoutMode[]).map(m => <option key={m} value={m}>{PAYOUT_MODE_LABEL[m]}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="block text-[10px] font-bold text-slate-500 uppercase">Transaction / UTR / cheque no. (optional)</span>
            <input value={reference} onChange={e => setReference(e.target.value)} className={field} placeholder="e.g. UTR 4128XXXX" />
          </label>
          <label className="block space-y-1">
            <span className="block text-[10px] font-bold text-slate-500 uppercase">Notes {differs ? '(required)' : '(optional)'}</span>
            <input value={notes} onChange={e => setNotes(e.target.value)} className={field} placeholder="e.g. TDS deducted" />
          </label>

          {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeIndianRupee className="w-4 h-4" />}
            {saving ? 'Saving…' : `Confirm Paid ${amt > 0 ? inr(amt) : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};
