import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { leadService, filterLeadsForUser } from '../../services/leadService';
import { employeeService } from '../../services/employeeService';
import { useAuthStore } from '../../store/authStore';
import { FollowUpReminders } from '../../components/Common/FollowUpReminders';
import type { Lead, Profile } from '../../types';
import {
  PhoneCall, Plus, Search, UserPlus, CalendarClock, FileText, X, RefreshCw, Users, Bell, UserX, ClipboardCheck
} from 'lucide-react';

const QuotationDocument = lazy(() =>
  import('../Admin/QuotationDocument').then(m => ({ default: m.QuotationDocument }))
);

const STATUS_LABEL: Record<Lead['status'], string> = {
  new: 'New',
  quotation_sent: 'Quotation Sent',
  confirmed: 'Confirmed',
  registered: 'Registered',
  installed: 'Installed',
  closed: 'Closed',
  lost: 'Lost'
};

const STATUS_CLS: Record<Lead['status'], string> = {
  new: 'bg-slate-100 text-slate-600',
  quotation_sent: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  registered: 'bg-indigo-100 text-indigo-700',
  installed: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-emerald-200 text-emerald-800',
  lost: 'bg-rose-100 text-rose-700'
};

const EMPTY_FORM = {
  name: '', phone: '', email: '', requirement: '', description: '',
  salesId: '', adminId: '', followUpDate: '', followUpNotes: '', isHot: false, isLoan: false
};

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500';
const labelCls = 'text-[10px] font-bold text-slate-500 uppercase mb-1 block';

export const TelecallerPanel: React.FC = () => {
  const { currentUser, currentRole } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'leads' | 'followups'>('leads');
  const [search, setSearch] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [assignLead, setAssignLead] = useState<Lead | null>(null);
  const [assignForm, setAssignForm] = useState({ salesId: '', adminId: '' });

  const [followLead, setFollowLead] = useState<Lead | null>(null);
  const [followForm, setFollowForm] = useState({ date: '', notes: '' });

  const [quoteLeadId, setQuoteLeadId] = useState<string | null>(null);
  const quoteOpenRef = useRef(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [l, e] = await Promise.all([leadService.getLeads(), employeeService.getEmployees()]);
      setLeads(filterLeadsForUser(l || [], currentUser, currentRole || ''));
      setEmployees(e || []);
    } catch (err) {
      console.error('Telecaller panel load error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    quoteOpenRef.current = !!quoteLeadId;
  }, [quoteLeadId]);

  useEffect(() => {
    loadData();
    let timer: any = null;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const relevant = detail.source || detail.collectionName === 'leads' || detail.collectionName === 'profiles';
      // Reloading re-renders the heavy quotation preview, so hold off while it's open
      if (!relevant || quoteOpenRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(loadData, 1500);
    };
    window.addEventListener('app-realtime-update', handler);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('app-realtime-update', handler);
    };
  }, []);

  const activeEmps = employees.filter(e => e.isActive !== false);
  const fieldEmployees = activeEmps.filter(e => e.role === 'field_employee' || e.role === 'sales_person');
  const admins = activeEmps.filter(e => e.role === 'admin');
  const empsById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const empName = (id?: string) => (id ? empsById.get(id)?.fullName || '—' : '—');

  const today = dayjs().format('YYYY-MM-DD');

  const sortedLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
      .filter(l => !q || l.name.toLowerCase().includes(q) || (l.phoneNumber || '').includes(q))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [leads, search]);

  const stats = useMemo(() => ({
    total: leads.length,
    unassigned: leads.filter(l => !l.assignedSalesPersonId && !l.assignedAdminId).length,
    dueFollowUps: leads.filter(l => l.nextFollowUpDate && !l.followUpCompleted && l.nextFollowUpDate <= today).length,
    quoted: leads.filter(l => l.status === 'quotation_sent').length
  }), [leads, today]);

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.requirement.trim()) {
      alert('Please fill Name, Phone and Requirement.');
      return;
    }
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const fDate = form.followUpDate ? dayjs(form.followUpDate).format('YYYY-MM-DD') : undefined;
      const by = currentUser?.fullName || currentUser?.id || 'Telecaller';
      await leadService.createLead({
        name: form.name.trim(),
        phoneNumber: form.phone.trim(),
        email: form.email.trim() || undefined,
        requirement: form.requirement.trim(),
        description: form.description.trim(),
        assignedSalesPersonId: form.salesId || undefined,
        assignedAdminId: form.adminId || undefined,
        assignedEmployeeId: form.salesId || form.adminId || undefined,
        createdBy: by,
        status: 'new',
        isHot: form.isHot,
        clientRating: form.isHot ? 5 : 3,
        isLoan: form.isLoan,
        nextFollowUpDate: fDate,
        followUpNotes: form.followUpNotes.trim() || undefined,
        followUpSetAt: fDate ? nowIso : undefined,
        followUpSetBy: fDate ? by : undefined,
        followUpCompleted: false
      });
      setForm(EMPTY_FORM);
      setAddOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Could not add lead.');
    } finally {
      setSaving(false);
    }
  };

  const saveAssign = async () => {
    if (!assignLead) return;
    await leadService.assignLead(assignLead.id, assignForm.salesId || undefined, assignForm.adminId || undefined);
    setAssignLead(null);
    await loadData();
  };

  const saveFollowUp = async () => {
    if (!followLead || !followForm.date) return;
    await leadService.updateLead(followLead.id, {
      nextFollowUpDate: dayjs(followForm.date).format('YYYY-MM-DD'),
      followUpNotes: followForm.notes.trim() || undefined,
      followUpSetAt: new Date().toISOString(),
      followUpSetBy: currentUser?.fullName || 'Telecaller',
      followUpCompleted: false
    });
    setFollowLead(null);
    await loadData();
  };

  const openFollowUp = (l: Lead) => {
    setFollowLead(l);
    setFollowForm({ date: l.nextFollowUpDate || dayjs().add(1, 'day').format('YYYY-MM-DD'), notes: l.followUpNotes || '' });
  };

  const followUpBadge = (l: Lead) => {
    if (!l.nextFollowUpDate) return <span className="text-[10px] text-slate-300">—</span>;
    if (l.followUpCompleted) return <span className="text-[10px] font-bold text-emerald-600">Done</span>;
    const cls = l.nextFollowUpDate < today
      ? 'bg-rose-50 text-rose-700'
      : l.nextFollowUpDate === today ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600';
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cls}`}>
        {l.nextFollowUpDate < today ? 'Overdue · ' : l.nextFollowUpDate === today ? 'Today · ' : ''}
        {dayjs(l.nextFollowUpDate).format('DD MMM')}
      </span>
    );
  };

  const statCards = [
    { label: 'My Leads', value: stats.total, icon: Users, cls: 'text-slate-700 bg-slate-100' },
    { label: 'Unassigned', value: stats.unassigned, icon: UserX, cls: 'text-rose-700 bg-rose-50' },
    { label: 'Follow-ups Due', value: stats.dueFollowUps, icon: Bell, cls: 'text-amber-700 bg-amber-50' },
    { label: 'Quotation Sent', value: stats.quoted, icon: ClipboardCheck, cls: 'text-emerald-700 bg-emerald-50' }
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">Telecaller Panel</h1>
            <p className="text-xs text-slate-500 font-medium">Add leads, schedule follow-ups, assign and send quotations.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-xl"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Lead
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
              <p className="text-2xl font-black text-slate-900 mt-0.5">{s.value}</p>
            </div>
            <div className={`p-2.5 rounded-xl ${s.cls}`}><s.icon className="w-5 h-5" /></div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {([['leads', 'My Leads'], ['followups', 'Follow-up Reminders']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${tab === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'followups' ? (
        <FollowUpReminders
          onSelectLead={id => {
            const l = leads.find(x => x.id === id);
            if (l) openFollowUp(l);
          }}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <div className="relative max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or phone…"
                className={`${inputCls} pl-8`}
              />
            </div>
          </div>
          {sortedLeads.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto opacity-30 mb-2" />
              <p className="text-sm font-semibold text-slate-500">
                {leads.length === 0 ? 'No leads yet. Click "Add Lead" to create your first one.' : 'No leads match your search.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-slate-400 font-bold uppercase border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Field Employee</th>
                    <th className="px-4 py-3">Admin</th>
                    <th className="px-4 py-3">Next Follow-up</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLeads.map(l => (
                    <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-800 flex items-center gap-1.5">
                          {l.name}
                          {l.isHot && <span className="text-[9px] font-black bg-rose-100 text-rose-600 px-1.5 rounded">HOT</span>}
                        </p>
                        <a href={`tel:${l.phoneNumber}`} className="text-[11px] text-emerald-700 font-semibold hover:underline">{l.phoneNumber}</a>
                        <p className="text-[10px] text-slate-400 truncate max-w-[220px]">{l.requirement}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_CLS[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-semibold">{empName(l.assignedSalesPersonId)}</td>
                      <td className="px-4 py-3 text-slate-600 font-semibold">{empName(l.assignedAdminId)}</td>
                      <td className="px-4 py-3">{followUpBadge(l)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setAssignLead(l);
                              setAssignForm({ salesId: l.assignedSalesPersonId || '', adminId: l.assignedAdminId || '' });
                            }}
                            className="flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg"
                          >
                            <UserPlus className="w-3 h-3" /> Assign
                          </button>
                          <button
                            onClick={() => openFollowUp(l)}
                            className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg"
                          >
                            <CalendarClock className="w-3 h-3" /> Follow-up
                          </button>
                          <button
                            onClick={() => setQuoteLeadId(l.id)}
                            className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg"
                          >
                            <FileText className="w-3 h-3" /> Quotation
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Lead Modal */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !saving && setAddOpen(false)}>
          <form
            onSubmit={handleAddLead}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">Add New Lead</h3>
              <button type="button" onClick={() => setAddOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Customer Name *</label>
                <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Phone *</label>
                <input className={inputCls} inputMode="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input className={inputCls} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Requirement *</label>
                <input className={inputCls} placeholder="e.g. 3 kW rooftop" value={form.requirement} onChange={e => setForm(f => ({ ...f, requirement: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Address / Notes</label>
              <textarea rows={2} className={inputCls} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Assign Field Employee</label>
                <select className={inputCls} value={form.salesId} onChange={e => setForm(f => ({ ...f, salesId: e.target.value }))}>
                  <option value="">— Not assigned —</option>
                  {fieldEmployees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Assign Admin</label>
                <select className={inputCls} value={form.adminId} onChange={e => setForm(f => ({ ...f, adminId: e.target.value }))}>
                  <option value="">— Not assigned —</option>
                  {admins.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Follow-up Date</label>
                <input type="date" className={inputCls} value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Follow-up Notes</label>
                <input className={inputCls} value={form.followUpNotes} onChange={e => setForm(f => ({ ...f, followUpNotes: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.isHot} onChange={e => setForm(f => ({ ...f, isHot: e.target.checked }))} /> Hot lead
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.isLoan} onChange={e => setForm(f => ({ ...f, isLoan: e.target.checked }))} /> Loan case
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setAddOpen(false)} className="flex-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-2 rounded-lg">
                {saving ? 'Saving…' : 'Save Lead'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Assign Modal */}
      {assignLead && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAssignLead(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black text-slate-900">Assign Lead</h3>
            <p className="text-[11px] text-slate-500 -mt-2">{assignLead.name}</p>
            <div>
              <label className={labelCls}>Field Employee</label>
              <select className={inputCls} value={assignForm.salesId} onChange={e => setAssignForm(f => ({ ...f, salesId: e.target.value }))}>
                <option value="">— Not assigned —</option>
                {fieldEmployees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Admin</label>
              <select className={inputCls} value={assignForm.adminId} onChange={e => setAssignForm(f => ({ ...f, adminId: e.target.value }))}>
                <option value="">— Not assigned —</option>
                {admins.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setAssignLead(null)} className="flex-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg">Cancel</button>
              <button onClick={saveAssign} className="flex-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg">Save Assignment</button>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up Modal */}
      {followLead && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setFollowLead(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black text-slate-900">Set Follow-up Reminder</h3>
            <p className="text-[11px] text-slate-500 -mt-2">{followLead.name} · {followLead.phoneNumber}</p>
            <div>
              <label className={labelCls}>Follow-up Date *</label>
              <input type="date" className={inputCls} value={followForm.date} onChange={e => setFollowForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea rows={3} className={inputCls} placeholder="What was discussed / what to ask next" value={followForm.notes} onChange={e => setFollowForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setFollowLead(null)} className="flex-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg">Cancel</button>
              <button onClick={saveFollowUp} disabled={!followForm.date} className="flex-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 px-3 py-2 rounded-lg">Save Reminder</button>
            </div>
          </div>
        </div>
      )}

      {/* Quotation Builder */}
      {quoteLeadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-2 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-7xl h-[95vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 shrink-0">
              <h3 className="text-sm font-black text-slate-900">Create Quotation</h3>
              <button onClick={() => { setQuoteLeadId(null); loadData(); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <Suspense fallback={<div className="py-16 text-center text-xs text-slate-400">Loading quotation builder…</div>}>
                <QuotationDocument defaultLeadId={quoteLeadId} isEmbedded={true} />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
