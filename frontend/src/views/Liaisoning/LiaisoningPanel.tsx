import React, { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { db, getDeletedRecordIdsSet } from '../../services/db';
import { leadService } from '../../services/leadService';
import { challanService } from '../../services/challanService';
import { orderService } from '../../services/orderService';
import { compressImage } from '../../services/imageCompressionService';
import {
  uploadImageToFirebase, uploadPdfToFirebase, getFreshB2SignedUrl, getSafeBlobUrl, getQuickB2Url, fetchCollectionFromFirestore
} from '../../services/firebase';
import { useAuthStore } from '../../store/authStore';
import type { Lead, ClientRegistration, ReleaseDocument } from '../../types';
import {
  Landmark, Search, RefreshCw, X, Truck, Phone, CheckCircle, UploadCloud, Eye, Download, Trash2, Loader2, FileCheck2, Clock, Camera
} from 'lucide-react';

type Stage = 'reg_pending' | 'release_pending' | 'released';
type TabKey = 'all' | Stage;

interface DispatchInfo { count: number; lastAt: string }

const STAGE_META: Record<Stage, { label: string; cls: string }> = {
  reg_pending: { label: 'Registration Pending', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  release_pending: { label: 'Release Pending', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  released: { label: 'Released / Closed', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
};

const emptyRegistration = (leadId: string): ClientRegistration => ({
  leadId,
  registrationDone: false,
  fileMade: false,
  bankFileUploaded: false,
  loanStatus: 'pending',
  updatedAt: new Date().toISOString()
});

const resolveFileUrl = (blob: any, rec: any): string =>
  typeof blob === 'string' && blob ? blob : getSafeBlobUrl(blob) || rec?.fileUrl || rec?.url || rec?.bankDocumentUrl || '';

const openUrl = async (rawUrl: string, downloadName?: string) => {
  const url = await getFreshB2SignedUrl(rawUrl);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  if (downloadName) a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export const LiaisoningPanel: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [dispatchMap, setDispatchMap] = useState<Record<string, DispatchInfo>>({});
  const [regMap, setRegMap] = useState<Record<string, ClientRegistration>>({});
  const [releasedIds, setReleasedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');

  const [selected, setSelected] = useState<Lead | null>(null);
  const [reg, setReg] = useState<ClientRegistration | null>(null);
  const [releaseDocs, setReleaseDocs] = useState<ReleaseDocument[]>([]);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const selectedRef = useRef<Lead | null>(null);

  const refreshStatusMaps = async () => {
    const deleted = await getDeletedRecordIdsSet();
    const [regs, rels] = await Promise.all([
      db.clientRegistrations.toArray().catch(() => [] as ClientRegistration[]),
      db.releaseDocuments.toArray().catch(() => [] as ReleaseDocument[])
    ]);
    const rMap: Record<string, ClientRegistration> = {};
    regs.forEach(r => { if (r.leadId && !deleted.has(r.leadId)) rMap[r.leadId] = r; });
    setRegMap(rMap);
    setReleasedIds(new Set(rels.filter(r => !deleted.has(r.id)).map(r => String(r.leadId))));
  };

  const syncStatusFromRemote = async () => {
    try {
      const [remoteRegs, remoteRels] = await Promise.all([
        fetchCollectionFromFirestore<ClientRegistration & { id?: string }>('clientRegistrations', 15000).catch(() => []),
        fetchCollectionFromFirestore<ReleaseDocument>('releaseDocuments', 15000).catch(() => [])
      ]);
      const deleted = await getDeletedRecordIdsSet(true);
      const validRegs = (remoteRegs || []).filter(r => r.leadId && !deleted.has(r.leadId));
      if (validRegs.length) {
        // List responses omit bankDocumentBlob, so keep any locally stored one
        const existing = await db.clientRegistrations.bulkGet(validRegs.map(r => r.leadId));
        await db.clientRegistrations.bulkPut(validRegs.map((r, i) => {
          const cur = existing[i];
          if (cur && (cur.updatedAt || '') > (r.updatedAt || '')) return cur;
          return { ...cur, ...r, bankDocumentBlob: r.bankDocumentBlob || cur?.bankDocumentBlob };
        }));
      }
      for (const vr of (remoteRels || []).filter(r => r.id && !deleted.has(r.id) && !deleted.has(r.leadId))) {
        const existing = await db.releaseDocuments.get(vr.id);
        const blob = vr.fileBlob || (vr as any).fileUrl || (vr as any).url || existing?.fileBlob;
        await db.releaseDocuments.put({ ...existing, ...vr, ...(blob ? { fileBlob: blob } : {}) });
      }
      await refreshStatusMaps();
    } catch (err) {
      console.warn('Liaisoning status sync note:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [allLeads, challans] = await Promise.all([
        leadService.getLeads().catch(() => [] as Lead[]),
        challanService.getChallans().catch(() => [])
      ]);
      const dMap: Record<string, DispatchInfo> = {};
      challans.forEach(c => {
        if (!c.leadId) return;
        const cur = dMap[c.leadId];
        if (!cur) dMap[c.leadId] = { count: 1, lastAt: c.createdAt };
        else {
          cur.count++;
          if ((c.createdAt || '') > (cur.lastAt || '')) cur.lastAt = c.createdAt;
        }
      });
      setDispatchMap(dMap);
      setLeads((allLeads || []).filter(l => l && dMap[l.id]));
      await refreshStatusMaps();
    } catch (err) {
      console.error('Liaisoning panel load error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    syncStatusFromRemote();
    let timer: any = null;
    const handler = (e: Event) => {
      const col = (e as CustomEvent).detail?.collectionName;
      if (col && !['leads', 'challans', 'clientRegistrations', 'releaseDocuments'].includes(col)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(loadData, 1500);
    };
    window.addEventListener('app-realtime-update', handler);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('app-realtime-update', handler);
    };
  }, []);

  const stageOf = (l: Lead): Stage => {
    if (l.status === 'closed' || releasedIds.has(l.id)) return 'released';
    if (regMap[l.id]?.registrationDone || l.status === 'registered' || l.status === 'installed') return 'release_pending';
    return 'reg_pending';
  };

  const counts = useMemo(() => {
    const c = { all: leads.length, reg_pending: 0, release_pending: 0, released: 0 };
    leads.forEach(l => { c[stageOf(l)]++; });
    return c;
  }, [leads, regMap, releasedIds]);

  const visibleLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
      .filter(l => tab === 'all' || stageOf(l) === tab)
      .filter(l => !q || (l.name || '').toLowerCase().includes(q) || (l.phoneNumber || '').includes(q) || (l.requirement || '').toLowerCase().includes(q))
      .sort((a, b) => (dispatchMap[b.id]?.lastAt || '').localeCompare(dispatchMap[a.id]?.lastAt || ''));
  }, [leads, tab, search, dispatchMap, regMap, releasedIds]);

  const openLead = async (lead: Lead) => {
    setSelected(lead);
    selectedRef.current = lead;
    setReg(regMap[lead.id] || null);
    setReleaseDocs([]);
    setReleaseNotes('');
    setDetailLoading(true);
    try {
      const [r, rels] = await Promise.all([
        orderService.getClientRegistrationByLeadId(lead.id),
        orderService.getReleaseDocumentsByLeadId(lead.id)
      ]);
      if (selectedRef.current?.id !== lead.id) return;
      setReg(r || null);
      setReleaseDocs(rels);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeLead = () => {
    setSelected(null);
    selectedRef.current = null;
    setReg(null);
    setReleaseDocs([]);
  };

  const refreshSelected = async (leadId: string) => {
    const [l, r, rels] = await Promise.all([
      leadService.getLeadById(leadId),
      orderService.getClientRegistrationByLeadId(leadId),
      orderService.getReleaseDocumentsByLeadId(leadId)
    ]);
    if (l) {
      setSelected(l);
      setLeads(prev => prev.map(p => (p.id === l.id ? l : p)));
    }
    setReg(r || null);
    setReleaseDocs(rels);
    await refreshStatusMaps();
  };

  const saveRegistration = async (patch: Partial<ClientRegistration>) => {
    if (!selected) return;
    const updated: ClientRegistration = { ...(reg || emptyRegistration(selected.id)), ...patch };
    setReg(updated);
    await orderService.saveClientRegistration(updated);
    await leadService.updateLead({ ...selected, updatedAt: new Date().toISOString() });
    await refreshSelected(selected.id);
  };

  const uploadFile = async (file: File, folder: string, prefix: string) => {
    if (file.type.startsWith('image/')) {
      const compressed = await compressImage(file, { isDocument: true, maxSizeKB: 75 });
      return uploadImageToFirebase(compressed, `${folder}/${selected!.id}/${prefix}_${Date.now()}.webp`);
    }
    return uploadPdfToFirebase(file, `${folder}/${selected!.id}/${prefix}_${Date.now()}.pdf`);
  };

  const handleBankFileUpload = async (file: File) => {
    if (!selected) return;
    setBusy('bank');
    try {
      const url = await uploadFile(file, 'documents', 'bank');
      await saveRegistration({ bankDocumentBlob: url as any, bankFileUploaded: true });
      alert('Bank document uploaded successfully.');
    } catch (err) {
      console.error('Bank upload error:', err);
      alert('Error uploading bank document.');
    } finally {
      setBusy(null);
    }
  };

  const handleMeterUpload = async (files: FileList) => {
    if (!selected) return;
    const leadId = selected.id;
    setBusy('meter');
    let failed = 0;
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) { failed++; continue; }
        try {
          const updated = await orderService.uploadMeterPhoto(leadId, file, currentUser?.fullName || currentUser?.id || 'liaisoning');
          if (selectedRef.current?.id === leadId) setReg(updated);
        } catch (err) {
          console.error('Meter photo upload error:', err);
          failed++;
        }
      }
      await refreshStatusMaps();
      if (failed) alert(`⚠️ ${failed} meter photo(s) could not be uploaded to Backblaze. Please try again.`);
    } finally {
      setBusy(null);
    }
  };

  const handleMeterDelete = async (photoId: string) => {
    if (!selected || !confirm('Delete this meter photo?')) return;
    const updated = await orderService.deleteMeterPhoto(selected.id, photoId);
    setReg(updated);
    await refreshStatusMaps();
  };

  const handleReleaseUpload = async (file: File) => {
    if (!selected) return;
    setBusy('release');
    try {
      const url = await uploadFile(file, 'release', 'release');
      await orderService.uploadReleaseDocument({
        leadId: selected.id,
        fileBlob: url as any,
        uploadedBy: currentUser?.id || 'liaisoning',
        notes: releaseNotes || undefined
      });
      await leadService.updateLeadStatus(selected.id, 'closed');
      setReleaseNotes('');
      await refreshSelected(selected.id);
      alert('✅ Handover NOC / Release Document uploaded! Lead status is now CLOSED (Release Complete).');
    } catch (err) {
      console.error(err);
      alert('Error uploading release document.');
    } finally {
      setBusy(null);
    }
  };

  const handleCompleteWithoutDoc = async () => {
    if (!selected) return;
    setBusy('release');
    try {
      if (releaseNotes.trim()) {
        await orderService.uploadReleaseDocument({
          leadId: selected.id,
          fileBlob: '' as any,
          uploadedBy: currentUser?.id || 'liaisoning',
          notes: releaseNotes.trim()
        });
      }
      await leadService.updateLeadStatus(selected.id, 'closed');
      setReleaseNotes('');
      await refreshSelected(selected.id);
      alert('🏆 Lead status is now CLOSED (Release Complete)!');
    } catch (err) {
      console.error(err);
      alert('Error updating lead status.');
    } finally {
      setBusy(null);
    }
  };

  const handleReleaseDelete = async (relId: string) => {
    if (!selected) return;
    if (!confirm('Delete this Handover NOC document? This will re-open the pipeline status.')) return;
    await orderService.deleteReleaseDocument(relId);
    const rels = await orderService.getReleaseDocumentsByLeadId(selected.id);
    if (rels.length === 0) {
      const photos = await orderService.getInstallationPhotosByLeadId(selected.id);
      const prevStatus = photos.length >= 3 ? 'installed' : (reg?.registrationDone ? 'registered' : 'confirmed');
      await leadService.updateLeadStatus(selected.id, prevStatus);
    }
    await refreshSelected(selected.id);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'All Dispatched' },
    { key: 'reg_pending', label: 'Registration Pending' },
    { key: 'release_pending', label: 'Release Pending' },
    { key: 'released', label: 'Released' }
  ];

  const checklist: { field: 'registrationDone' | 'fileMade' | 'bankFileUploaded'; label: string }[] = [
    { field: 'registrationDone', label: '1. DISCOM Registration Done' },
    { field: 'fileMade', label: '2. Customer Physical File Compiled' },
    { field: 'bankFileUploaded', label: '3. Bank File Uploaded' }
  ];

  const releaseDoc = releaseDocs[0];
  const releaseFileUrl = releaseDoc ? resolveFileUrl(releaseDoc.fileBlob, releaseDoc) : '';
  const bankFileUrl = reg?.bankDocumentBlob ? resolveFileUrl(reg.bankDocumentBlob, reg) : '';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">Liaisoning Panel</h1>
            <p className="text-xs text-slate-500 font-medium">Registration & Release for dispatched leads</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { loadData(); syncStatusFromRemote(); }}
          className="self-start sm:self-auto px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              tab === t.key ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
            <span className={`px-1.5 rounded-full text-[10px] font-black ${tab === t.key ? 'bg-white text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, phone or requirement..."
          className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {loading && leads.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-slate-400 text-xs font-bold gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          Loading dispatched leads...
        </div>
      ) : visibleLeads.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-xs font-bold bg-white rounded-2xl border border-dashed border-slate-200">
          No dispatched leads found.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {visibleLeads.map(l => {
            const stage = stageOf(l);
            const r = regMap[l.id];
            const done = r ? [r.registrationDone, r.fileMade, r.bankFileUploaded].filter(Boolean).length : 0;
            const d = dispatchMap[l.id];
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => openLead(l)}
                className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate">{l.name}</p>
                    <p className="text-[11px] text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" /> {l.phoneNumber || '—'}
                    </p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${STAGE_META[stage].cls}`}>
                    {STAGE_META[stage].label}
                  </span>
                </div>
                {l.requirement && <p className="text-[11px] text-slate-600 font-medium line-clamp-2">{l.requirement}</p>}
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 flex items-center gap-1">
                    <Truck className="w-3 h-3" /> {d?.count || 0} challan{d?.count === 1 ? '' : 's'} · {d?.lastAt ? dayjs(d.lastAt).format('DD MMM YYYY') : '—'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 flex items-center gap-1">
                    <FileCheck2 className="w-3 h-3" /> Checklist {done}/3
                  </span>
                  {l.isLoan && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">🏦 Loan</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center sm:p-4" onClick={closeLead}>
          <div
            className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3 z-10">
              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-900 truncate">{selected.name}</h2>
                <p className="text-[11px] text-slate-500 font-semibold">
                  {selected.phoneNumber} · Dispatched {dispatchMap[selected.id]?.lastAt ? dayjs(dispatchMap[selected.id].lastAt).format('DD MMM YYYY') : '—'}
                </p>
              </div>
              <button type="button" onClick={closeLead} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-5 text-xs font-semibold">
              {detailLoading && (
                <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing latest records...
                </p>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200/60 pb-3">
                  Registration Department
                </h3>

                <div className="space-y-3">
                  {checklist.map(item => (
                    <label key={item.field} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(reg?.[item.field])}
                        onChange={e => saveRegistration({ [item.field]: e.target.checked })}
                        className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-700">{item.label}</span>
                    </label>
                  ))}
                </div>

                {reg?.bankFileUploaded && (
                  <div className="bg-white p-3 border border-slate-200 rounded-xl space-y-2">
                    <label className="block text-[10px] text-slate-500 uppercase font-bold">Bank File / Loan Document</label>
                    {bankFileUrl ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] text-emerald-600 font-extrabold flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> File Saved
                        </span>
                        <button
                          type="button"
                          onClick={() => openUrl(bankFileUrl, `Bank_File_${selected.name.replace(/\s+/g, '_')}`)}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                        >
                          Download File
                        </button>
                      </div>
                    ) : (
                      <div className="relative overflow-hidden">
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          disabled={busy === 'bank'}
                          onChange={e => e.target.files?.[0] && handleBankFileUpload(e.target.files[0])}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full z-10"
                        />
                        <div className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold text-center flex items-center justify-center gap-1.5">
                          {busy === 'bank' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                          {busy === 'bank' ? 'Uploading...' : 'Upload Bank Document'}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-slate-500">Loan Approval Status</label>
                  <select
                    value={reg?.loanStatus || 'pending'}
                    onChange={e => saveRegistration({ loanStatus: e.target.value as ClientRegistration['loanStatus'] })}
                    className="w-full sm:w-64 border border-slate-200 rounded-xl p-2.5 bg-white cursor-pointer"
                  >
                    <option value="pending">Pending Review</option>
                    <option value="approved">Approved & Disbursed</option>
                    <option value="rejected">Rejected / Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="border-b border-slate-100 pb-3 flex justify-between items-start gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Meter Photos</h3>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">Net / solar meter images (saved to Backblaze).</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black shrink-0">
                    {reg?.meterPhotos?.length || 0}
                  </span>
                </div>
                {(reg?.meterPhotos?.length || 0) > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {reg!.meterPhotos!.map(p => (
                      <div key={p.id} className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
                        <img
                          src={getQuickB2Url(p.url)}
                          alt="Meter"
                          loading="lazy"
                          onClick={() => openUrl(p.url)}
                          className="w-full h-full object-cover cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => handleMeterDelete(p.id)}
                          className="absolute top-1 right-1 p-1 rounded-md bg-white/90 text-rose-600 shadow cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 truncate">
                          {dayjs(p.uploadedAt).format('DD MMM, hh:mm A')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="relative overflow-hidden">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={busy === 'meter'}
                    onChange={e => { if (e.target.files?.length) handleMeterUpload(e.target.files); e.target.value = ''; }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full z-10"
                  />
                  <div className="w-full py-2.5 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1.5">
                    {busy === 'meter' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    {busy === 'meter' ? 'Uploading to Backblaze...' : 'Upload Meter Photo'}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="border-b border-slate-100 pb-3 flex justify-between items-start gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Release Department</h3>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">Upload completion handover sheet / NOC (1 file per lead).</p>
                  </div>
                  {selected.status === 'closed' && (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-800 text-white font-extrabold text-[10px] uppercase shrink-0">✓ Closed</span>
                  )}
                </div>

                {releaseDoc ? (
                  <div className="bg-emerald-50/80 p-4 rounded-xl border border-emerald-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs uppercase font-extrabold text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600" /> Release Recorded
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {dayjs(releaseDoc.uploadedAt).format('DD MMM YYYY, hh:mm A')}
                      </span>
                    </div>
                    {releaseDoc.notes && (
                      <p className="text-xs text-slate-600 bg-white p-2 rounded border border-emerald-100 italic">
                        <strong>Notes:</strong> {releaseDoc.notes}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-200/60">
                      {releaseFileUrl && (
                        <>
                          <button
                            type="button"
                            onClick={() => openUrl(releaseFileUrl)}
                            className="text-xs text-emerald-700 font-black bg-white px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </button>
                          <button
                            type="button"
                            onClick={() => openUrl(releaseFileUrl, `Release_NOC_${selected.name.replace(/\s+/g, '_')}`)}
                            className="text-xs text-indigo-700 font-black bg-white px-3 py-1.5 rounded-lg border border-indigo-200 flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" /> Download
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleReleaseDelete(releaseDoc.id)}
                        className="text-xs text-rose-600 font-bold bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">Release Comments / Inspector Notes</label>
                      <input
                        type="text"
                        value={releaseNotes}
                        onChange={e => setReleaseNotes(e.target.value)}
                        placeholder="e.g. Net metering tests passed, system is live."
                        className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-medium text-slate-800"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative overflow-hidden flex-1">
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          disabled={busy === 'release'}
                          onChange={e => e.target.files?.[0] && handleReleaseUpload(e.target.files[0])}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full z-10"
                        />
                        <div className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black text-center flex items-center justify-center gap-2 shadow-md">
                          {busy === 'release' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                          {busy === 'release' ? 'Saving...' : 'Upload Handover NOC'}
                        </div>
                      </div>
                      {selected.status !== 'closed' && (
                        <button
                          type="button"
                          disabled={busy === 'release'}
                          onClick={handleCompleteWithoutDoc}
                          className="py-3 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-60"
                        >
                          <CheckCircle className="w-4 h-4 text-emerald-400" /> Mark Closed (Without File)
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
