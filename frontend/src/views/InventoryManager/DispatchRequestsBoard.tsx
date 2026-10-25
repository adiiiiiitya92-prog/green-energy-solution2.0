import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { BellRing, Truck, Eye, Phone, Loader2, Inbox, User } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { dispatchRequestService } from '../../services/dispatchRequestService';
import { DispatchStatusBadge } from '../../components/Common/DispatchNotifyCard';
import type { DispatchRequest } from '../../types';

dayjs.extend(relativeTime);

type Filter = 'open' | 'dispatched' | 'all';

export const DispatchRequestsBoard: React.FC<{ onCreateChallan: (leadId: string) => void }> = ({ onCreateChallan }) => {
  const { currentUser } = useAuthStore();
  const location = useLocation();
  const boardRef = useRef<HTMLDivElement>(null);
  const [requests, setRequests] = useState<DispatchRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('open');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (fresh = true) => {
    try {
      setRequests(await dispatchRequestService.getAll(fresh));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    let timer: any = null;
    const onUpdate = (e: Event) => {
      const col = (e as CustomEvent).detail?.collectionName;
      if (col && col !== 'dispatchRequests' && col !== 'challans') return;
      clearTimeout(timer);
      // SSE already wrote the change into Dexie, so a local read is enough
      timer = setTimeout(() => load(col !== 'dispatchRequests'), 400);
    };
    window.addEventListener('app-realtime-update', onUpdate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('app-realtime-update', onUpdate);
    };
  }, [load]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('dispatch') === '1') {
      boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.search]);

  const counts = useMemo(() => ({
    open: requests.filter(dispatchRequestService.isActive).length,
    pending: requests.filter(r => r.status === 'pending').length,
    dispatched: requests.filter(r => r.status === 'dispatched').length
  }), [requests]);

  const visible = useMemo(() => {
    if (filter === 'open') return requests.filter(dispatchRequestService.isActive);
    if (filter === 'dispatched') return requests.filter(r => r.status === 'dispatched');
    return requests;
  }, [requests, filter]);

  const handleSeen = async (r: DispatchRequest) => {
    if (!currentUser) return;
    setBusyId(r.id);
    try {
      const next = await dispatchRequestService.acknowledge(r, currentUser);
      setRequests(prev => prev.map(x => (x.id === next.id ? next : x)));
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateChallan = async (r: DispatchRequest) => {
    if (r.status === 'pending' && currentUser) {
      dispatchRequestService.acknowledge(r, currentUser).then(next =>
        setRequests(prev => prev.map(x => (x.id === next.id ? next : x)))
      ).catch(() => {});
    }
    onCreateChallan(r.leadId);
  };

  const tabs: { key: Filter; label: string; count?: number }[] = [
    { key: 'open', label: 'To Dispatch', count: counts.open },
    { key: 'dispatched', label: 'Dispatched', count: counts.dispatched },
    { key: 'all', label: 'All' }
  ];

  return (
    <div ref={boardRef} className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-4 scroll-mt-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${counts.pending > 0 ? 'bg-rose-600 text-white' : 'bg-sky-100 text-sky-700'}`}>
            <BellRing className={`w-5 h-5 ${counts.pending > 0 ? 'animate-pulse' : ''}`} />
            {counts.pending > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-white text-rose-700 border border-rose-300 text-[10px] font-black rounded-full px-1.5">
                {counts.pending}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Dispatch Requests</h2>
            <p className="text-[11px] text-slate-500 font-medium">
              {counts.pending > 0
                ? `${counts.pending} new request${counts.pending > 1 ? 's' : ''} from Admin — payment received, ready to dispatch.`
                : 'Leads sent by Admin / Super Admin for material dispatch appear here.'}
            </p>
          </div>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl text-[11px] font-black self-start sm:self-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${filter === t.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {t.label}
              {t.count !== undefined && <span className="ml-1 text-slate-400">({t.count})</span>}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading dispatch requests…
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
          <Inbox className="w-8 h-8" />
          <span className="text-xs font-bold">{filter === 'open' ? 'No leads waiting for dispatch 🎉' : 'Nothing here yet'}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visible.map(r => {
            const isNew = r.status === 'pending';
            const open = dispatchRequestService.isActive(r);
            return (
              <div
                key={r.id}
                className={`rounded-2xl border p-4 space-y-3 transition-all ${
                  isNew ? 'border-rose-300 bg-rose-50/40 ring-1 ring-rose-200' : open ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isNew && <span className="text-[9px] font-black bg-rose-600 text-white px-1.5 py-0.5 rounded">NEW</span>}
                      <h3 className="text-sm font-black text-slate-900 truncate">{r.leadName}</h3>
                    </div>
                    {r.leadPhone && (
                      <a href={`tel:${r.leadPhone}`} className="text-[11px] text-slate-500 font-semibold inline-flex items-center gap-1 hover:text-sky-700">
                        <Phone className="w-3 h-3" /> {r.leadPhone}
                      </a>
                    )}
                  </div>
                  <DispatchStatusBadge status={r.status} />
                </div>

                <p className="text-xs text-slate-800 font-semibold whitespace-pre-wrap bg-white rounded-lg p-2.5 border border-slate-100">
                  “{r.remark}”
                </p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3 h-3" /> {r.requestedByName} ({(r.requestedByRole || '').replace(/_/g, ' ')})
                  </span>
                  <span title={dayjs(r.createdAt).format('DD MMM YYYY, hh:mm A')}>{dayjs(r.createdAt).fromNow()}</span>
                  <span>Paid ₹{(r.totalPaid || 0).toLocaleString('en-IN')} / ₹{(r.orderTotal || 0).toLocaleString('en-IN')}</span>
                  {r.challanNumber && <span className="text-emerald-700">Challan {r.challanNumber}</span>}
                </div>

                {open && (
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    {isNew && (
                      <button
                        type="button"
                        onClick={() => handleSeen(r)}
                        disabled={busyId === r.id}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-black border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        <Eye className="w-3.5 h-3.5" /> Mark as Seen
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCreateChallan(r)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      <Truck className="w-3.5 h-3.5" /> Create Dispatch Challan
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
