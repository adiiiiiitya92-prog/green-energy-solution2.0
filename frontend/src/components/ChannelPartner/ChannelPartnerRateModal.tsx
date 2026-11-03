import React, { useState } from 'react';
import { X, Handshake, Save, Loader2 } from 'lucide-react';
import type { Lead } from '../../types';
import { computeIncentive, DEFAULT_CP_GST_PCT } from '../../services/channelPartnerIncentive';
import { leadService } from '../../services/leadService';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const ChannelPartnerRateModal: React.FC<{
  lead: Lead;
  customerPrice: number;
  partnerName?: string;
  updatedBy?: string;
  onClose: () => void;
  onSaved: (lead: Lead) => void;
}> = ({ lead, customerPrice, partnerName, updatedBy, onClose, onSaved }) => {
  const [rate, setRate] = useState<string>(lead.channelPartnerRate ? String(lead.channelPartnerRate) : '');
  const [gstPct, setGstPct] = useState<string>(String(lead.channelPartnerGstPct ?? DEFAULT_CP_GST_PCT));
  const [saving, setSaving] = useState(false);

  const rateNum = Number(rate) || 0;
  const gstNum = Math.min(100, Math.max(0, Number(gstPct) || 0));
  const b = computeIncentive(customerPrice, rateNum, gstNum);
  const overPrice = rateNum > 0 && customerPrice > 0 && rateNum > customerPrice;

  const save = async () => {
    setSaving(true);
    try {
      const updated = await leadService.setChannelPartnerRate(lead.id, rateNum || undefined, gstNum, updatedBy);
      if (updated) onSaved(updated);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Could not save the channel partner rate.');
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ label, value, cls = '' }: { label: string; value: string; cls?: string }) => (
    <div className={`flex items-center justify-between text-xs ${cls}`}>
      <span className="font-semibold">{label}</span>
      <span className="font-black">{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 bg-gradient-to-r from-purple-700 to-indigo-700 text-white flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black flex items-center gap-2"><Handshake className="w-4 h-4" /> Channel Partner Rate</h3>
            <p className="text-[11px] text-purple-100 mt-0.5">{lead.name} • {partnerName || lead.dealerName || 'Channel Partner'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/15 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 space-y-1">
              <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Rate given to partner (₹)</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                autoFocus
                value={rate}
                onChange={e => setRate(e.target.value)}
                placeholder="e.g. 175000"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">GST %</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={gstPct}
                onChange={e => setGstPct(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </label>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-slate-700">
            <Row label="Customer quotation (Total Contract)" value={inr(b.customerPrice)} />
            <Row label="− Rate given to partner" value={inr(b.rate)} />
            <Row label="= Partner margin" value={inr(b.margin)} cls="pt-1.5 border-t border-slate-200" />
            <Row label={`− GST (${b.gstPct}%)`} value={inr(b.gst)} cls="text-rose-600" />
            <Row label="Channel partner incentive" value={inr(b.incentive)} cls="pt-1.5 border-t border-slate-200 text-emerald-700 text-sm" />
          </div>

          {customerPrice <= 0 && (
            <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              No quotation total yet — the incentive will calculate once a quotation is created for this lead.
            </p>
          )}
          {overPrice && (
            <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              The partner rate is higher than the customer quotation, so the incentive is ₹0.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Rate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
