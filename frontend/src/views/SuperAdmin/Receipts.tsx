import React, { useEffect, useState } from 'react';
import { Receipt as ReceiptIcon, Download, Search } from 'lucide-react';
import type { Receipt } from '../../types';
import { receiptService } from '../../services/paymentService';
import { useAuthStore } from '../../store/authStore';
import { generateInstallationReceiptPdf, openPdfBlob } from '../../services/installationPdfService';

const PAGE_SIZE = 20;

export const Receipts: React.FC = () => {
  const { currentRole, currentUser } = useAuthStore();
  const isSupervisor = currentRole === 'installation_supervisor';
  const [all, setAll] = useState<Receipt[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const load = async () => {
    // Supervisors only ever see their own receipts (enforced at query level)
    const list = isSupervisor
      ? await receiptService.getBySupervisor(currentUser?.id || '')
      : await receiptService.getAll(true);
    setAll(list);
  };

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('app-realtime-update', h);
    return () => window.removeEventListener('app-realtime-update', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRole, currentUser?.id]);

  const filtered = all.filter(r => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return (r.receiptNo || '').toLowerCase().includes(s)
      || (r.leadName || '').toLowerCase().includes(s)
      || (r.supervisorName || '').toLowerCase().includes(s);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><ReceiptIcon className="w-5 h-5 text-emerald-600" /> Payment Receipts</h1>
        <p className="text-xs text-slate-500 font-semibold">{isSupervisor ? 'Your approved payment receipts' : 'All installation payment receipts'}</p>
      </div>

      <div className="flex items-center border border-slate-200 rounded-xl px-3 bg-white max-w-sm">
        <Search className="w-4 h-4 text-slate-400" />
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search receipt / client / supervisor"
          className="w-full px-2 py-2.5 bg-transparent focus:outline-none text-xs" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {pageItems.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-bold">No receipts found.</div>
        ) : pageItems.map(r => (
          <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="font-black text-slate-900 text-sm">{r.receiptNo}</div>
              <div className="text-xs text-slate-500 font-semibold truncate">
                {r.leadName} · ₹{r.amount.toLocaleString('en-IN')} · {r.method}
                {!isSupervisor && ` · ${r.supervisorName}`}
              </div>
              <div className="text-[10px] text-slate-400">{new Date(r.createdAt).toLocaleString('en-IN')}</div>
            </div>
            <button onClick={async () => openPdfBlob(await generateInstallationReceiptPdf(r), `${r.receiptNo}.pdf`)}
              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[11px] rounded-lg flex items-center gap-1 cursor-pointer">
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        ))}
        <div className="px-4 py-3 flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 font-bold text-xs rounded-lg cursor-pointer">Prev</button>
          <span className="text-xs text-slate-400 font-bold">Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 font-bold text-xs rounded-lg cursor-pointer">Next</button>
        </div>
      </div>
    </div>
  );
};
