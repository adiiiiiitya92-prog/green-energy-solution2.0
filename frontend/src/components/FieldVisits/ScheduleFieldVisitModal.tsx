import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { X, CalendarPlus, Loader2 } from 'lucide-react';
import { fieldVisitScheduleService } from '../../services/fieldVisitScheduleService';
import { useAuthStore } from '../../store/authStore';
import type { Lead, Profile } from '../../types';

interface Props {
  /** Fixed lead; when omitted the user picks one from `leadOptions`. */
  lead?: Pick<Lead, 'id' | 'name'>;
  leadOptions?: Pick<Lead, 'id' | 'name' | 'phoneNumber'>[];
  /** People the visit can be assigned to. With `selfOnly` the current user is always the assignee. */
  assignees?: Pick<Profile, 'id' | 'fullName'>[];
  defaultAssigneeId?: string;
  selfOnly?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500';
const labelCls = 'text-[10px] font-bold text-slate-500 uppercase mb-1 block';

/** Schedule a field visit for a lead (self-scheduling or by super admin / manager). */
export const ScheduleFieldVisitModal: React.FC<Props> = ({ lead, leadOptions, assignees = [], defaultAssigneeId, selfOnly, onClose, onSaved }) => {
  const { currentUser } = useAuthStore();
  const [leadId, setLeadId] = useState(lead?.id || '');
  const [leadQuery, setLeadQuery] = useState('');
  const [assigneeId, setAssigneeId] = useState(selfOnly ? currentUser?.id || '' : defaultAssigneeId || '');
  const [date, setDate] = useState(dayjs().add(1, 'day').format('YYYY-MM-DD'));
  const [time, setTime] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredLeads = useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    return (leadOptions || []).filter(l => !q || `${l.name} ${l.phoneNumber || ''}`.toLowerCase().includes(q)).slice(0, 200);
  }, [leadOptions, leadQuery]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenLead = lead || (leadOptions || []).find(l => l.id === leadId);
    const assigneeName = selfOnly ? currentUser?.fullName : assignees.find(a => a.id === assigneeId)?.fullName;
    if (!chosenLead) { setError('Select the lead / customer.'); return; }
    if (!assigneeId) { setError('Select who will do the visit.'); return; }
    if (!date) { setError('Select the visit date.'); return; }
    if (date < dayjs().format('YYYY-MM-DD')) { setError('Visit date cannot be in the past.'); return; }
    setSaving(true);
    setError('');
    try {
      await fieldVisitScheduleService.create({
        leadId: chosenLead.id,
        leadName: chosenLead.name,
        assignedToId: assigneeId,
        assignedToName: assigneeName || '',
        scheduledDate: date,
        scheduledTime: time || undefined,
        purpose: purpose.trim() || undefined,
        status: 'scheduled',
        createdBy: currentUser?.id || '',
        createdByName: currentUser?.fullName
      });
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Could not schedule the visit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <form onSubmit={save} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><CalendarPlus className="w-4 h-4 text-emerald-600" /> Schedule Field Visit</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        {lead ? (
          <p className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{lead.name}</p>
        ) : (
          <div>
            <label className={labelCls}>Lead / Customer *</label>
            <input className={`${inputCls} mb-1.5`} placeholder="Search name or phone…" value={leadQuery} onChange={e => setLeadQuery(e.target.value)} />
            <select className={inputCls} value={leadId} onChange={e => setLeadId(e.target.value)} size={Math.min(6, Math.max(2, filteredLeads.length + 1))}>
              <option value="">— Select lead —</option>
              {filteredLeads.map(l => <option key={l.id} value={l.id}>{l.name}{l.phoneNumber ? ` • ${l.phoneNumber}` : ''}</option>)}
            </select>
            {(leadOptions || []).length === 0 && <p className="text-[10px] text-amber-700 mt-1">No leads are assigned to you yet.</p>}
          </div>
        )}

        <div>
          <label className={labelCls}>Visit By *</label>
          {selfOnly ? (
            <p className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{currentUser?.fullName || 'Me'}</p>
          ) : (
            <select className={inputCls} value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
              <option value="">— Select person —</option>
              {assignees.map(a => <option key={a.id} value={a.id}>{a.fullName}</option>)}
            </select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Date *</label>
            <input type="date" className={inputCls} min={dayjs().format('YYYY-MM-DD')} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Time</label>
            <input type="time" className={inputCls} value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Purpose</label>
          <input className={inputCls} placeholder="e.g. Meter installation, MSEB office, document collection" value={purpose} onChange={e => setPurpose(e.target.value)} />
        </div>

        {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-2 rounded-lg flex items-center justify-center gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Schedule Visit
          </button>
        </div>
      </form>
    </div>
  );
};
