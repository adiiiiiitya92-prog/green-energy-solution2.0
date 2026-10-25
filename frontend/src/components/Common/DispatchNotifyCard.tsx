import React, { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Truck, Send, CheckCircle, Clock, Eye, XCircle, Loader2, BellRing } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { dispatchRequestService } from '../../services/dispatchRequestService';
import type { DispatchRequest, Lead } from '../../types';

interface Props {
  lead: Lead;
  totalPaid: number;
  orderTotal: number;
}

const STATUS_UI: Record<DispatchRequest['status'], { label: string; cls: string; Icon: React.FC<any> }> = {
  pending: { label: 'Sent • Waiting for Inventory', cls: 'bg-amber-100 text-amber-800 border-amber-300', Icon: Clock },
  acknowledged: { label: 'Seen by Inventory • Preparing', cls: 'bg-blue-100 text-blue-800 border-blue-300', Icon: Eye },
  dispatched: { label: 'Dispatched', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', Icon: CheckCircle },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-300', Icon: XCircle }
};

export const DispatchStatusBadge: React.FC<{ status: DispatchRequest['status'] }> = ({ status }) => {
  const { label, cls, Icon } = STATUS_UI[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${cls}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};

export const DispatchNotifyCard: React.FC<Props> = ({ lead, totalPaid, orderTotal }) => {
  const { currentUser, currentRole } = useAuthStore();
  const [requests, setRequests] = useState<DispatchRequest[]>([]);
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [justSent, setJustSent] = useState(false);

  const load = useCallback(async () => {
    try {
      setRequests(await dispatchRequestService.getForLead(lead.id));
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    setLoading(true);
    setRemark('');
    setError('');
    load();
    const onUpdate = (e: Event) => {
      const col = (e as CustomEvent).detail?.collectionName;
      if (!col || col === 'dispatchRequests' || col === 'challans') load();
    };
    window.addEventListener('app-realtime-update', onUpdate);
    return () => window.removeEventListener('app-realtime-update', onUpdate);
  }, [load]);

  const active = requests.find(dispatchRequestService.isActive);
  const history = requests.filter(r => r !== active);

  const handleSend = async () => {
    if (!currentUser) return;
    if (!remark.trim()) {
      setError('Please write a remark for the inventory team (e.g. material list, delivery date, site notes).');
      return;
    }
    setSending(true);
    setError('');
    try {
      const rec = await dispatchRequestService.create({ lead, remark, totalPaid, orderTotal, user: currentUser, role: currentRole });
      setRequests(prev => [rec, ...prev]);
      setRemark('');
      setJustSent(true);
      setTimeout(() => setJustSent(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Could not send dispatch notification.');
      load();
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    if (!active || !currentUser) return;
    if (!confirm('Cancel this dispatch request? The inventory team will no longer see it as pending.')) return;
    const next = await dispatchRequestService.cancel(active, currentUser);
    setRequests(prev => prev.map(r => (r.id === next.id ? next : r)));
  };

  return (
    <div className="bg-gradient-to-r from-sky-50 via-white to-emerald-50/40 border border-sky-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Notify Inventory for Dispatch</h4>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Payment received? Send this lead to the Inventory Panel so material dispatch can start. They also get a push notification.
            </p>
          </div>
        </div>
        {active && <DispatchStatusBadge status={active.status} />}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading dispatch status…
        </div>
      ) : active ? (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span>
              Sent by <strong className="text-slate-800">{active.requestedByName}</strong>
            </span>
            <span>{dayjs(active.createdAt).format('DD MMM YYYY, hh:mm A')}</span>
            {active.acknowledgedAt && (
              <span className="text-blue-700">
                Seen by {active.acknowledgedByName} • {dayjs(active.acknowledgedAt).format('DD MMM, hh:mm A')}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-800 font-semibold whitespace-pre-wrap bg-slate-50 rounded-lg p-2.5 border border-slate-100">
            “{active.remark}”
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 cursor-pointer"
            >
              Cancel Request
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={remark}
            onChange={e => {
              setRemark(e.target.value);
              if (error) setError('');
            }}
            rows={3}
            maxLength={1000}
            placeholder="Remark for inventory team — e.g. Dispatch 3kW kit by Monday, customer wants delivery after 11 AM, panels: 6 x 550W…"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          {error && <p className="text-[11px] text-rose-600 font-bold">{error}</p>}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 font-semibold">
              Paid ₹{totalPaid.toLocaleString('en-IN')} of ₹{orderTotal.toLocaleString('en-IN')}
            </span>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className={`px-4 py-2 rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all ${
                justSent ? 'bg-emerald-600' : 'bg-sky-600 hover:bg-sky-700 disabled:opacity-60'
              }`}
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : justSent ? <BellRing className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              <span>{sending ? 'Sending…' : justSent ? 'Inventory Notified!' : 'Notify Inventory'}</span>
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-slate-500 font-bold select-none">Previous dispatch requests ({history.length})</summary>
          <div className="mt-2 space-y-1.5">
            {history.map(r => (
              <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-white border border-slate-100 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <span className="text-slate-700 font-semibold block truncate">“{r.remark}”</span>
                  <span className="text-slate-400">
                    {r.requestedByName} • {dayjs(r.createdAt).format('DD MMM YYYY, hh:mm A')}
                    {r.challanNumber ? ` • Challan ${r.challanNumber}` : ''}
                  </span>
                </div>
                <DispatchStatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
