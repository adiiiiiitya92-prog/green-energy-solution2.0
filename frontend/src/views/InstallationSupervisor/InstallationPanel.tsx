import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Package, CheckCircle2, Upload, X, IndianRupee, Wrench, ClipboardList, Image as ImageIcon, Loader2
} from 'lucide-react';
import type { Lead, InstallationRecord, PaymentRequest } from '../../types';
import { leadService } from '../../services/leadService';
import { installationService, supervisorSummaryService, type DispatchedMaterialRow } from '../../services/installationService';
import { paymentRequestService } from '../../services/paymentService';
import { useAuthStore } from '../../store/authStore';
import { uploadImageToFirebase } from '../../services/firebase';

// Assumption: supervisor works leads at installation stage or beyond.
const ELIGIBLE_STATUSES: Lead['status'][] = ['confirmed', 'registered', 'installed', 'closed'];
const MAX_IMAGES = 5;

export const InstallationSupervisorPanel: React.FC = () => {
  const { currentUser } = useAuthStore();
  const supId = currentUser?.id || '';
  const supName = currentUser?.fullName || '';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [installationsCount, setInstallationsCount] = useState(0);
  const [myRequests, setMyRequests] = useState<PaymentRequest[]>([]);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const debRef = useRef<any>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const refreshSummary = async () => {
    const s = await supervisorSummaryService.getSummary(supId);
    setInstallationsCount(s.installationsCount || 0);
    setMyRequests(await paymentRequestService.getBySupervisor(supId));
  };

  useEffect(() => {
    leadService.getLeads().then(all => setLeads(all.filter(l => ELIGIBLE_STATUSES.includes(l.status)))).catch(() => {});
    refreshSummary();
    const h = () => refreshSummary();
    window.addEventListener('app-realtime-update', h);
    return () => window.removeEventListener('app-realtime-update', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supId]);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(debRef.current);
  }, [search]);

  const matches = useMemo(() => {
    if (debounced.length < 2) return [];
    const q = debounced.toLowerCase();
    return leads.filter(l => (l.name || '').toLowerCase().includes(q)).slice(0, 10);
  }, [debounced, leads]);

  const paySummary = useMemo(() => {
    const requested = myRequests.filter(r => r.status === 'pending').reduce((s, r) => s + (r.requestedAmount || 0), 0);
    const approved = myRequests.filter(r => r.status === 'approved').reduce((s, r) => s + (r.approvedAmount || 0), 0);
    const rejected = myRequests.filter(r => r.status === 'rejected').length;
    return { requested, approved, rejected };
  }, [myRequests]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><Wrench className="w-5 h-5 text-emerald-600" /> Installation Panel</h1>
        <p className="text-xs text-slate-500 font-semibold">Welcome, {supName}</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Installations Done" value={String(installationsCount)} color="emerald" icon={<CheckCircle2 className="w-4 h-4" />} />
        <StatCard label="Payment Requested (Pending)" value={`₹${paySummary.requested.toLocaleString('en-IN')}`} color="amber" icon={<IndianRupee className="w-4 h-4" />} />
        <StatCard label="Payment Approved" value={`₹${paySummary.approved.toLocaleString('en-IN')}`} color="blue" icon={<IndianRupee className="w-4 h-4" />} />
        <StatCard label="Rejected Requests" value={String(paySummary.rejected)} color="rose" icon={<X className="w-4 h-4" />} />
      </div>

      {/* Lead search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 relative">
        <label className="block text-xs font-extrabold text-slate-500 mb-1.5">Search Client / Lead (min 2 chars)</label>
        <div className="flex items-center border border-slate-200 rounded-xl px-3 bg-slate-50">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); }}
            placeholder="Type client name..." className="w-full px-2 py-2.5 bg-transparent focus:outline-none text-sm" />
        </div>
        {matches.length > 0 && (!selectedLead || selectedLead.name !== search) && (
          <div className="absolute z-10 left-4 right-4 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {matches.map(l => (
              <button key={l.id} onClick={() => { setSelectedLead(l); setSearch(l.name); }}
                className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-slate-50 last:border-0 cursor-pointer">
                <div className="font-bold text-slate-800 text-sm">{l.name}</div>
                <div className="text-[10px] text-slate-400">{l.phoneNumber} · {l.status}</div>
              </button>
            ))}
          </div>
        )}
        {debounced.length >= 2 && matches.length === 0 && (
          <p className="text-[11px] text-slate-400 mt-2">No eligible leads (installation stage or beyond) match.</p>
        )}
      </div>

      {selectedLead && (
        <InstallationSection
          lead={selectedLead}
          supId={supId}
          supName={supName}
          onChanged={refreshSummary}
        />
      )}
    </div>
  );
};

const STAT_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-blue-600',
  rose: 'bg-rose-50 text-rose-600'
};
const StatCard: React.FC<{ label: string; value: string; color: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-3.5">
    <div className={`inline-flex items-center justify-center w-7 h-7 rounded-lg mb-2 ${STAT_COLORS[color] || STAT_COLORS.emerald}`}>{icon}</div>
    <div className="text-lg font-black text-slate-900">{value}</div>
    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide leading-tight">{label}</div>
  </div>
);

const InstallationSection: React.FC<{
  lead: Lead;
  supId: string;
  supName: string;
  onChanged: () => void;
}> = ({ lead, supId, supName, onChanged }) => {
  const [record, setRecord] = useState<InstallationRecord | null>(null);
  const [dispatched, setDispatched] = useState<DispatchedMaterialRow[]>([]);
  const [loading, setLoading] = useState(true);

  // remaining material form
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  // payment request form
  const [amount, setAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  const load = async () => {
    setLoading(true);
    const rec = await installationService.getOrCreateForLead(lead.id, lead.name, supId, supName);
    setRecord(rec);
    setDispatched(await installationService.getDispatchedMaterialForLead(lead.id));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [lead.id]);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...picked].slice(0, MAX_IMAGES));
    e.target.value = '';
  };

  const submitRemaining = async () => {
    if (!record) return;
    if (files.length === 0 && !desc.trim()) { alert('Add at least one image or a description.'); return; }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const url = await uploadImageToFirebase(files[i], `installations/${lead.id}/remaining_${Date.now()}_${i}`, { maxSizeKB: 300, maxWidthOrHeight: 1200 });
        urls.push(url);
      }
      const updated = await installationService.addRemainingMaterial(record, urls, desc.trim(), supId);
      setRecord(updated);
      setFiles([]);
      setDesc('');
    } catch (e) {
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const markComplete = async () => {
    if (!record) return;
    if (record.status === 'completed') return;
    if (!confirm('Mark this installation as COMPLETE? This increases your installation count.')) return;
    const updated = await installationService.markComplete(record);
    setRecord(updated);
    onChanged();
  };

  const submitPayment = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { alert('Enter a valid amount.'); return; }
    setSubmittingPay(true);
    try {
      await paymentRequestService.createRequest({
        leadId: lead.id,
        leadName: lead.name,
        supervisorId: supId,
        supervisorName: supName,
        installationId: record?.id,
        requestedAmount: amt,
        note: payNote.trim() || undefined
      });
      setAmount('');
      setPayNote('');
      alert('Payment request sent to Super Admin.');
      onChanged();
    } catch (e) {
      alert('Failed to send payment request.');
    } finally {
      setSubmittingPay(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-slate-400 text-xs"><Loader2 className="w-5 h-5 animate-spin inline" /> Loading…</div>;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-black text-slate-900 text-lg">{lead.name}</h2>
          <p className="text-xs text-slate-500 font-semibold">{lead.phoneNumber} · {lead.status}</p>
        </div>
        {record?.status === 'completed'
          ? <span className="text-xs bg-emerald-100 text-emerald-700 font-black px-3 py-1.5 rounded-full flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Installation Completed</span>
          : <button onClick={markComplete} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"><CheckCircle2 className="w-4 h-4" /> Mark Installation Complete</button>}
      </div>

      {/* a) Dispatched material (read-only) */}
      <section>
        <h3 className="text-xs font-black text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Package className="w-4 h-4 text-indigo-500" /> Dispatched Material</h3>
        {dispatched.length === 0 ? (
          <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">No dispatch records found for this client.</p>
        ) : (
          <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
            <div className="grid grid-cols-12 bg-slate-50 font-extrabold text-slate-500 px-3 py-2">
              <span className="col-span-6">Item</span><span className="col-span-2 text-right">Qty</span><span className="col-span-4 text-right">Dispatched</span>
            </div>
            {dispatched.map((d, i) => (
              <div key={i} className="grid grid-cols-12 px-3 py-2 border-t border-slate-50">
                <span className="col-span-6 font-semibold text-slate-700 truncate">{d.productName}</span>
                <span className="col-span-2 text-right font-bold">{d.qty} {d.unit || ''}</span>
                <span className="col-span-4 text-right text-slate-400">{new Date(d.date).toLocaleDateString('en-IN')} · {d.source}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* b) Remaining material */}
      <section>
        <h3 className="text-xs font-black text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><ImageIcon className="w-4 h-4 text-amber-500" /> Remaining Material (after installation)</h3>
        {(record?.remainingMaterial || []).length > 0 && (
          <div className="space-y-2 mb-3">
            {record!.remainingMaterial.map(entry => (
              <div key={entry.id} className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-700 font-semibold">{entry.description || '(no description)'}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {entry.imageUrls.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                      <img src={u} alt="remaining" className="w-14 h-14 object-cover rounded-lg border border-slate-200" />
                    </a>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{new Date(entry.createdAt).toLocaleString('en-IN')}</p>
              </div>
            ))}
          </div>
        )}
        <div className="border border-dashed border-slate-300 rounded-xl p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative">
                <img src={URL.createObjectURL(f)} alt="preview" className="w-14 h-14 object-cover rounded-lg border border-slate-200" />
                <button onClick={() => setFiles(fs => fs.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              </div>
            ))}
            {files.length < MAX_IMAGES && (
              <label className="w-14 h-14 flex items-center justify-center border border-slate-200 rounded-lg bg-slate-50 cursor-pointer hover:bg-slate-100">
                <Upload className="w-4 h-4 text-slate-400" />
                <input type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} />
              </label>
            )}
          </div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Describe remaining material…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-xs" />
          <button onClick={submitRemaining} disabled={uploading}
            className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer">
            {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</> : <><Upload className="w-3.5 h-3.5" /> Save Remaining Material</>}
          </button>
          <p className="text-[10px] text-slate-400">Max {MAX_IMAGES} images, auto-compressed (~1200px / 300KB).</p>
        </div>
      </section>

      {/* d) Payment request */}
      <section>
        <h3 className="text-xs font-black text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><IndianRupee className="w-4 h-4 text-emerald-500" /> Request Payment</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹)"
            className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-xs" />
          <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Note (optional)"
            className="sm:col-span-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-xs" />
        </div>
        <button onClick={submitPayment} disabled={submittingPay}
          className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer">
          <IndianRupee className="w-3.5 h-3.5" /> Send Payment Request
        </button>
      </section>

      {/* Payment requests for this lead */}
      <section>
        <h3 className="text-xs font-black text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5"><ClipboardList className="w-4 h-4 text-slate-400" /> My Requests (this client)</h3>
        <LeadRequests leadId={lead.id} supId={supId} onChanged={onChanged} />
      </section>
    </div>
  );
};

const LeadRequests: React.FC<{ leadId: string; supId: string; onChanged: () => void }> = ({ leadId, supId, onChanged }) => {
  const [reqs, setReqs] = useState<PaymentRequest[]>([]);
  const load = async () => {
    const all = await paymentRequestService.getBySupervisor(supId);
    setReqs(all.filter(r => r.leadId === leadId));
  };
  useEffect(() => { load(); const h = () => load(); window.addEventListener('app-realtime-update', h); return () => window.removeEventListener('app-realtime-update', h); /* eslint-disable-next-line */ }, [leadId, supId]);

  const reapply = async (r: PaymentRequest) => {
    const amtStr = prompt('Reapply — enter amount (₹):', String(r.requestedAmount));
    if (amtStr === null) return;
    const amt = parseFloat(amtStr);
    if (!amt || amt <= 0) { alert('Invalid amount.'); return; }
    const note = prompt('Note (optional):', r.note || '') || undefined;
    await paymentRequestService.reapply(r, { requestedAmount: amt, note });
    await load();
    onChanged();
  };

  if (reqs.length === 0) return <p className="text-xs text-slate-400">No payment requests yet.</p>;
  return (
    <div className="space-y-2">
      {reqs.map(r => (
        <div key={r.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-3 py-2 text-xs">
          <div>
            <span className="font-black text-slate-800">{r.requestNumber}</span>
            <span className="text-slate-500"> · ₹{(r.approvedAmount ?? r.requestedAmount).toLocaleString('en-IN')}</span>
            {r.rejectReason && <span className="text-rose-500"> · {r.rejectReason}</span>}
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={r.status} />
            {r.status === 'rejected' && (
              <button onClick={() => reapply(r)} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer">Reapply</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-rose-100 text-rose-700'
  };
  return <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${map[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
};
