import React, { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../../store/authStore';
import { fieldVisitScheduleService } from '../../services/fieldVisitScheduleService';
import type { ScheduledFieldVisit } from '../../types';
import { MapPin, CheckCircle2, AlertTriangle, CalendarDays, RefreshCw, Clock, Check } from 'lucide-react';

export const MyFieldVisits: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [visits, setVisits] = useState<ScheduledFieldVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [doneNotes, setDoneNotes] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      await fieldVisitScheduleService.autoMarkMissed();
      const list = await fieldVisitScheduleService.getByEmployee(currentUser.id);
      setVisits(list);
    } catch (e) {
      console.error('MyFieldVisits load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const handler = (e?: any) => {
      const col = e?.detail?.collectionName;
      if (col && col !== 'scheduledFieldVisits') return;
      load();
    };
    window.addEventListener('app-realtime-update', handler);
    return () => window.removeEventListener('app-realtime-update', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const today = new Date().toISOString().slice(0, 10);

  const todayVisits = useMemo(
    () => visits.filter(v => v.scheduledDate === today && v.status !== 'done'),
    [visits, today]
  );
  const missedVisits = useMemo(
    () => visits.filter(v => v.status === 'missed'),
    [visits]
  );
  const upcomingVisits = useMemo(
    () => visits.filter(v => v.status === 'scheduled' && v.scheduledDate > today),
    [visits, today]
  );
  const completedVisits = useMemo(
    () => visits.filter(v => v.status === 'done'),
    [visits]
  );

  const handleMarkDone = async (id: string) => {
    await fieldVisitScheduleService.markDone(id, doneNotes || undefined);
    setMarkingId(null);
    setDoneNotes('');
    load();
  };

  const statusColor = (s: ScheduledFieldVisit['status']) => {
    switch (s) {
      case 'scheduled': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'done': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
      case 'missed': return 'bg-red-100 text-red-700 border-red-300';
    }
  };

  const VisitCard = ({ v }: { v: ScheduledFieldVisit }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-800">{v.leadName}</p>
          {v.purpose && <p className="text-[11px] text-slate-500">{v.purpose}</p>}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusColor(v.status)}`}>
          {v.status.toUpperCase()}
        </span>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <CalendarDays className="w-3 h-3" /> {v.scheduledDate}
        </span>
        {v.scheduledTime && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {v.scheduledTime}
          </span>
        )}
      </div>

      {v.createdByName && (
        <p className="text-[10px] text-slate-400">Scheduled by: {v.createdByName}</p>
      )}

      {v.status === 'scheduled' && (
        <>
          {markingId === v.id ? (
            <div className="space-y-2 pt-1">
              <textarea
                placeholder="Completion notes (optional)"
                value={doneNotes}
                onChange={e => setDoneNotes(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setMarkingId(null); setDoneNotes(''); }}
                  className="flex-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleMarkDone(v.id)}
                  className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg flex items-center justify-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Mark Done
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setMarkingId(v.id)}
              className="w-full text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-2 rounded-lg transition flex items-center justify-center gap-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Done
            </button>
          )}
        </>
      )}

      {v.status === 'done' && v.completedAt && (
        <p className="text-[10px] text-emerald-600">
          Completed: {new Date(v.completedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          {v.completionNotes ? ` — ${v.completionNotes}` : ''}
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 text-white shadow-lg mb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2.5 rounded-lg">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">My Field Visits</h1>
                <p className="text-xs text-blue-50 opacity-90">
                  Scheduled visits & tasks
                </p>
              </div>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-2 text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <p className="text-[10px] uppercase font-bold text-slate-500">Today</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{todayVisits.length}</p>
            <p className="text-[10px] text-slate-400">visits pending</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <p className="text-[10px] uppercase font-bold text-slate-500">Missed</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{missedVisits.length}</p>
            <p className="text-[10px] text-slate-400">overdue visits</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <p className="text-[10px] uppercase font-bold text-slate-500">Upcoming</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{upcomingVisits.length}</p>
            <p className="text-[10px] text-slate-400">scheduled</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <p className="text-[10px] uppercase font-bold text-slate-500">Completed</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{completedVisits.length}</p>
            <p className="text-[10px] text-slate-400">done</p>
          </div>
        </div>

        {visits.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400">
            <MapPin className="w-10 h-10 mx-auto opacity-30 mb-2" />
            <p className="text-sm font-semibold text-slate-500">No field visits scheduled yet.</p>
            <p className="text-xs mt-1">
              Your manager will schedule field visits for you from the Dashboard.
            </p>
          </div>
        )}

        {/* Today's Visits */}
        {todayVisits.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-blue-600" />
              Today's Visits ({todayVisits.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {todayVisits.map(v => <VisitCard key={v.id} v={v} />)}
            </div>
          </div>
        )}

        {/* Missed Visits */}
        {missedVisits.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-bold text-red-700 flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4" />
              Missed Visits ({missedVisits.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {missedVisits.map(v => <VisitCard key={v.id} v={v} />)}
            </div>
          </div>
        )}

        {/* Upcoming Visits */}
        {upcomingVisits.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-amber-600" />
              Upcoming Visits ({upcomingVisits.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {upcomingVisits.map(v => <VisitCard key={v.id} v={v} />)}
            </div>
          </div>
        )}

        {/* Completed Visits */}
        {completedVisits.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-bold text-emerald-700 flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4" />
              Completed Visits ({completedVisits.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {completedVisits.slice(0, 20).map(v => <VisitCard key={v.id} v={v} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
