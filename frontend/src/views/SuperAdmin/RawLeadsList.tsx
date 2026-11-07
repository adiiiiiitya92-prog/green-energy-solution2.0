import React, { useEffect, useState, useMemo } from 'react';
import { roleLabel } from '../../utils/roleLabel';
import { leadService } from '../../services/leadService';
import { employeeService } from '../../services/employeeService';
import { fieldVisitScheduleService } from '../../services/fieldVisitScheduleService';
import { useAuthStore } from '../../store/authStore';
import type { Lead, Profile, ScheduledFieldVisit } from '../../types';
import { ClipboardList, Clock, MapPin, CalendarPlus, UserCheck, RefreshCw, CalendarClock, History } from 'lucide-react';

export const RawLeadsList: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [scheduledVisits, setScheduledVisits] = useState<ScheduledFieldVisit[]>([]);
  const [loading, setLoading] = useState(false);

  // rescheduleOf set = moving an existing visit instead of creating a new one
  const [visitModal, setVisitModal] = useState<{ open: boolean; leadId: string; leadName: string; rescheduleOf?: ScheduledFieldVisit }>({ open: false, leadId: '', leadName: '' });
  const [visitForm, setVisitForm] = useState({ assignedToId: '', scheduledDate: '', scheduledTime: '', purpose: '', remarks: '' });
  const [visitError, setVisitError] = useState('');
  const [savingVisit, setSavingVisit] = useState(false);
  const closeVisitModal = () => { setVisitModal({ open: false, leadId: '', leadName: '' }); setVisitError(''); };
  const openReschedule = (l: Lead, v: ScheduledFieldVisit) => {
    setVisitModal({ open: true, leadId: l.id, leadName: l.name, rescheduleOf: v });
    setVisitForm({ assignedToId: v.assignedToId, scheduledDate: '', scheduledTime: v.scheduledTime || '', purpose: v.purpose || '', remarks: '' });
    setVisitError('');
  };
  const [targetModal, setTargetModal] = useState<{ open: boolean; leadId: string; leadName: string; current?: number }>({ open: false, leadId: '', leadName: '' });
  const [targetDaysInput, setTargetDaysInput] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [l, e, v] = await Promise.all([
        leadService.getLeads(),
        employeeService.getEmployees(),
        fieldVisitScheduleService.getAll()
      ]);
      setLeads(l || []);
      setEmployees(e || []);
      await fieldVisitScheduleService.autoMarkMissed();
      setScheduledVisits(v || []);
    } catch (err) {
      console.error('RawLeadsList load error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    let timer: any = null;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const col = detail.collectionName;
      if (!detail.source && col !== 'leads' && col !== 'profiles' && col !== 'scheduledFieldVisits') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(loadData, 1500);
    };
    window.addEventListener('app-realtime-update', handler);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('app-realtime-update', handler);
    };
  }, []);

  // Overdue leads (target deadline passed) first, most overdue on top; the rest keep their usual order.
  const rawLeads = useMemo(() => {
    const now = Date.now();
    const deadlineOf = (l: Lead) =>
      l.targetDays && l.targetSetAt ? new Date(l.targetSetAt).getTime() + l.targetDays * 86400000 : NaN;
    const isOverdue = (l: Lead) => deadlineOf(l) <= now;
    const list = leads.filter(l => l.status === 'new');
    const overdue = list.filter(isOverdue).sort((a, b) => deadlineOf(a) - deadlineOf(b));
    return [...overdue, ...list.filter(l => !isOverdue(l))];
  }, [leads]);
  const empsById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const today = new Date().toISOString().slice(0, 10);

  const leadVisitsMap = useMemo(() => {
    const m = new Map<string, ScheduledFieldVisit[]>();
    scheduledVisits.forEach(v => {
      const arr = m.get(v.leadId) || [];
      arr.push(v);
      m.set(v.leadId, arr);
    });
    return m;
  }, [scheduledVisits]);

  const getAssigneeName = (l: Lead) => {
    const id = l.assignedSalesPersonId || l.assignedAdminId || l.assignedEmployeeId;
    if (!id) return '—';
    return empsById.get(id)?.fullName || '—';
  };

  const getTargetInfo = (l: Lead) => {
    if (!l.targetDays || !l.targetSetAt) return null;
    const setDate = new Date(l.targetSetAt);
    const deadline = new Date(setDate.getTime() + l.targetDays * 86400000);
    const daysElapsed = Math.floor((Date.now() - setDate.getTime()) / 86400000);
    const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000));
    const progressPct = Math.min(100, Math.round((daysElapsed / l.targetDays) * 100));
    return { daysLeft, daysElapsed, progressPct, deadline: deadline.toISOString().slice(0, 10) };
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 text-white shadow-lg mb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2.5 rounded-lg">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Raw Leads List</h1>
                <p className="text-xs text-blue-50 opacity-90">
                  {rawLeads.length} raw leads • Target tracking & field visit scheduling
                </p>
              </div>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-2 text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {rawLeads.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <ClipboardList className="w-10 h-10 mx-auto opacity-30 mb-2" />
              <p className="text-sm font-semibold text-slate-500">No raw (new) leads right now.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-slate-400 font-bold uppercase border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Lead Name</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Assigned To</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3 text-center">Target Days</th>
                    <th className="px-4 py-3 text-center">Progress</th>
                    <th className="px-4 py-3 text-center">Field Visit</th>
                  </tr>
                </thead>
                <tbody>
                  {rawLeads.map((l, i) => {
                    const targetInfo = getTargetInfo(l);
                    const visits = leadVisitsMap.get(l.id) || [];
                    const upcomingVisit = visits.find(v => v.status === 'scheduled' && v.scheduledDate >= today);
                    // Latest visit that did not happen (missed, or past its date and not yet auto-marked)
                    const missedVisit = upcomingVisit ? undefined : visits
                      .filter(v => v.status === 'missed' || (v.status === 'scheduled' && v.scheduledDate < today))
                      .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate))[0];
                    const shownVisit = upcomingVisit || missedVisit;
                    const lastReschedule = shownVisit?.rescheduleHistory?.[shownVisit.rescheduleHistory.length - 1];
                    return (
                      <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 font-semibold">{i + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800">{l.name}</p>
                          <p className="text-[10px] text-slate-400">{l.requirement}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{l.phoneNumber}</td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                            {getAssigneeName(l)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded uppercase">
                            {l.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {targetInfo ? (
                            <div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${targetInfo.daysLeft > 3 ? 'bg-green-50 text-green-700' : targetInfo.daysLeft > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                                {targetInfo.daysLeft > 0 ? `${targetInfo.daysLeft}d left` : 'Overdue'}
                              </span>
                              <p className="text-[9px] text-slate-400 mt-0.5">{l.targetDays}d target</p>
                              <button
                                onClick={() => {
                                  setTargetModal({ open: true, leadId: l.id, leadName: l.name, current: l.targetDays });
                                  setTargetDaysInput(l.targetDays ? String(l.targetDays) : '');
                                }}
                                className="text-[9px] text-blue-500 hover:text-blue-700 mt-0.5"
                              >
                                Edit
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setTargetModal({ open: true, leadId: l.id, leadName: l.name, current: l.targetDays });
                                setTargetDaysInput(l.targetDays ? String(l.targetDays) : '');
                              }}
                              className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition"
                            >
                              <Clock className="w-3 h-3 inline mr-0.5" /> Set Target
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {targetInfo ? (
                            <div className="w-full max-w-[80px] mx-auto">
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${targetInfo.progressPct >= 90 ? 'bg-red-500' : targetInfo.progressPct >= 60 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                  style={{ width: `${targetInfo.progressPct}%` }}
                                />
                              </div>
                              <p className="text-[9px] text-slate-400 mt-0.5">{targetInfo.daysElapsed}/{l.targetDays}d used</p>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {shownVisit ? (
                            <div className="text-[10px] space-y-0.5">
                              <span className={`font-bold px-1.5 py-0.5 rounded inline-block ${upcomingVisit ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                                <MapPin className="w-3 h-3 inline mr-0.5" />
                                {upcomingVisit ? '' : 'Missed • '}{shownVisit.scheduledDate}{shownVisit.scheduledTime ? ` ${shownVisit.scheduledTime}` : ''}
                              </span>
                              <p className="text-[9px] text-slate-400">{shownVisit.assignedToName}</p>
                              {lastReschedule && (
                                <p className="text-[9px] text-amber-700 italic max-w-[160px] mx-auto truncate" title={`Moved from ${lastReschedule.fromDate}: ${lastReschedule.remarks}`}>
                                  <History className="w-2.5 h-2.5 inline mr-0.5" />
                                  {shownVisit.rescheduleHistory!.length}x rescheduled • {lastReschedule.remarks}
                                </p>
                              )}
                              <button
                                onClick={() => openReschedule(l, shownVisit)}
                                className="text-[10px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded transition"
                              >
                                <CalendarClock className="w-3 h-3 inline mr-0.5" /> Reschedule
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setVisitModal({ open: true, leadId: l.id, leadName: l.name });
                                setVisitForm({ assignedToId: '', scheduledDate: '', scheduledTime: '', purpose: '', remarks: '' });
                                setVisitError('');
                              }}
                              className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded transition"
                            >
                              <CalendarPlus className="w-3 h-3 inline mr-0.5" /> Schedule
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Target Days Modal */}
      {targetModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setTargetModal({ open: false, leadId: '', leadName: '' })}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-1">Set Target Days</h3>
            <p className="text-[11px] text-slate-500 mb-4">{targetModal.leadName}</p>
            <input
              type="number"
              min="1"
              max="365"
              placeholder="e.g. 7"
              value={targetDaysInput}
              onChange={e => setTargetDaysInput(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setTargetModal({ open: false, leadId: '', leadName: '' })}
                className="flex-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const days = parseInt(targetDaysInput);
                  if (!days || days < 1) return;
                  await leadService.updateLead(targetModal.leadId, { targetDays: days, targetSetAt: new Date().toISOString() });
                  setTargetModal({ open: false, leadId: '', leadName: '' });
                  loadData();
                }}
                className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-lg"
              >
                Save Target
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Field Visit Modal */}
      {visitModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeVisitModal}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800">{visitModal.rescheduleOf ? 'Reschedule Field Visit' : 'Schedule Field Visit'}</h3>
            <p className="text-[11px] text-slate-500">{visitModal.leadName}</p>
            {visitModal.rescheduleOf && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900 space-y-1">
                <p>
                  <span className="font-bold">Current:</span> {visitModal.rescheduleOf.scheduledDate}
                  {visitModal.rescheduleOf.scheduledTime ? ` ${visitModal.rescheduleOf.scheduledTime}` : ''} • {visitModal.rescheduleOf.assignedToName}
                  {visitModal.rescheduleOf.status === 'missed' || visitModal.rescheduleOf.scheduledDate < today ? ' (missed)' : ''}
                </p>
                {(visitModal.rescheduleOf.rescheduleHistory || []).slice().reverse().map((h, i) => (
                  <p key={i} className="text-[10px] text-amber-800">
                    <History className="w-3 h-3 inline mr-0.5" />
                    {h.fromDate} to {h.toDate} • "{h.remarks}"{h.byName ? ` (${h.byName})` : ''}
                  </p>
                ))}
              </div>
            )}

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Field Employee</label>
              <select
                value={visitForm.assignedToId}
                onChange={e => setVisitForm(f => ({ ...f, assignedToId: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Select Employee...</option>
                {employees.filter(e => e.isActive !== false).map(e => (
                  <option key={e.id} value={e.id}>{e.fullName} ({roleLabel(e.role, '')})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">{visitModal.rescheduleOf ? 'New Visit Date' : 'Visit Date'}</label>
              <input
                type="date"
                min={today}
                value={visitForm.scheduledDate}
                onChange={e => setVisitForm(f => ({ ...f, scheduledDate: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Time (Optional)</label>
              <input
                type="time"
                value={visitForm.scheduledTime}
                onChange={e => setVisitForm(f => ({ ...f, scheduledTime: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Purpose (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Site survey, Client meeting"
                value={visitForm.purpose}
                onChange={e => setVisitForm(f => ({ ...f, purpose: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {visitModal.rescheduleOf && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Reason / Remarks (Required)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Customer not available, asked to come on Monday"
                  value={visitForm.remarks}
                  onChange={e => setVisitForm(f => ({ ...f, remarks: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

            {visitError && <p className="text-[11px] font-bold text-red-600">{visitError}</p>}

            <div className="flex gap-2 pt-2">
              <button
                onClick={closeVisitModal}
                className="flex-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={savingVisit}
                onClick={async () => {
                  if (!visitForm.assignedToId || !visitForm.scheduledDate) { setVisitError('Select the employee and the visit date.'); return; }
                  if (visitForm.scheduledDate < today) { setVisitError('Visit date cannot be in the past.'); return; }
                  const emp = employees.find(e => e.id === visitForm.assignedToId);
                  const original = visitModal.rescheduleOf;
                  if (original) {
                    if (!visitForm.remarks.trim()) { setVisitError('Please write the reason for rescheduling.'); return; }
                    if (visitForm.scheduledDate === original.scheduledDate && (visitForm.scheduledTime || '') === (original.scheduledTime || '') && visitForm.assignedToId === original.assignedToId) {
                      setVisitError('Choose a different date, time or employee.');
                      return;
                    }
                    setSavingVisit(true);
                    try {
                      await fieldVisitScheduleService.reschedule(original.id, {
                        date: visitForm.scheduledDate,
                        time: visitForm.scheduledTime || undefined,
                        assignedToId: visitForm.assignedToId,
                        assignedToName: emp?.fullName || original.assignedToName,
                        remarks: visitForm.remarks,
                        byId: currentUser?.id,
                        byName: currentUser?.fullName
                      });
                      closeVisitModal();
                      loadData();
                    } catch (err: any) {
                      setVisitError(err?.message || 'Could not reschedule the visit.');
                    } finally {
                      setSavingVisit(false);
                    }
                    return;
                  }
                  await fieldVisitScheduleService.create({
                    leadId: visitModal.leadId,
                    leadName: visitModal.leadName,
                    assignedToId: visitForm.assignedToId,
                    assignedToName: emp?.fullName || '',
                    scheduledDate: visitForm.scheduledDate,
                    scheduledTime: visitForm.scheduledTime || undefined,
                    purpose: visitForm.purpose || undefined,
                    status: 'scheduled',
                    createdBy: currentUser?.id || '',
                    createdByName: currentUser?.fullName
                  });
                  setVisitModal({ open: false, leadId: '', leadName: '' });
                  loadData();
                }}
                className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-lg"
              >
                <UserCheck className="w-3.5 h-3.5 inline mr-1" />
                {visitModal.rescheduleOf ? (savingVisit ? 'Saving...' : 'Reschedule Visit') : 'Schedule Visit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
