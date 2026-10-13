import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Download } from 'lucide-react';
import type { PaymentRequest, Profile, SupervisorSummary } from '../../types';
import { paymentRequestService, receiptService } from '../../services/paymentService';
import { supervisorSummaryService } from '../../services/installationService';
import { employeeService } from '../../services/employeeService';
import { generateInstallationReceiptPdf, openPdfBlob } from '../../services/installationPdfService';
import { StatusPill } from '../InstallationSupervisor/InstallationPanel';

const HISTORY_PAGE = 10;

export const InstallationReport: React.FC = () => {
  const [supervisors, setSupervisors] = useState<Profile[]>([]);
  const [summaries, setSummaries] = useState<SupervisorSummary[]>([]);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);

  const [supFilter, setSupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const emps = await employeeService.getEmployees();
      setSupervisors(emps.filter(e => e.role === 'installation_supervisor'));
      setSummaries(await supervisorSummaryService.getAll());
      setRequests(await paymentRequestService.getAll(true));
    })();
  }, []);

  const rows = useMemo(() => {
    const sups = supFilter === 'all' ? supervisors : supervisors.filter(s => s.id === supFilter);
    return sups.map(sup => {
      const reqs = requests.filter(r => r.supervisorId === sup.id);
      const summary = summaries.find(s => s.supervisorId === sup.id);
      const approvedAmt = reqs.filter(r => r.status === 'approved').reduce((s, r) => s + (r.approvedAmount || 0), 0);
      const pendingAmt = reqs.filter(r => r.status === 'pending').reduce((s, r) => s + (r.requestedAmount || 0), 0);
      const rejected = reqs.filter(r => r.status === 'rejected').length;
      return {
        sup,
        installations: summary?.installationsCount || 0,
        totalPaid: summary?.totalPaid ?? approvedAmt,
        pendingAmt,
        rejected
      };
    });
  }, [supervisors, requests, summaries, supFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-indigo-600" /> Installation Supervisor Report</h1>
        <p className="text-xs text-slate-500 font-semibold">Installations & payment performance per supervisor</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <select value={supFilter} onChange={e => setSupFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50">
          <option value="all">All supervisors</option>
          {supervisors.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50" />
      </div>

      <div className="space-y-3">
        {rows.length === 0 && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs font-bold">No installation supervisors found.</div>}
        {rows.map(row => (
          <div key={row.sup.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <button onClick={() => setExpanded(expanded === row.sup.id ? null : row.sup.id)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer text-left">
              <div>
                <div className="font-black text-slate-900 text-sm">{row.sup.fullName}</div>
                <div className="text-[11px] text-slate-500 font-semibold">
                  {row.installations} installs · Paid ₹{row.totalPaid.toLocaleString('en-IN')} · Pending ₹{row.pendingAmt.toLocaleString('en-IN')} · {row.rejected} rejected
                </div>
              </div>
              {expanded === row.sup.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {expanded === row.sup.id && (
              <History supervisorId={row.sup.id} requests={requests} statusFilter={statusFilter} dateFrom={dateFrom} dateTo={dateTo} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const History: React.FC<{ supervisorId: string; requests: PaymentRequest[]; statusFilter: string; dateFrom: string; dateTo: string }> = ({ supervisorId, requests, statusFilter, dateFrom, dateTo }) => {
  const [page, setPage] = useState(1);

  const filtered = requests
    .filter(r => r.supervisorId === supervisorId)
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .filter(r => {
      const d = (r.createdAt || '').slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE));
  const items = filtered.slice((page - 1) * HISTORY_PAGE, page * HISTORY_PAGE);

  const openReceipt = async (receiptId?: string) => {
    if (!receiptId) return;
    const r = await receiptService.getById(receiptId);
    if (r) openPdfBlob(await generateInstallationReceiptPdf(r), `${r.receiptNo}.pdf`);
  };

  if (filtered.length === 0) return <div className="px-4 py-4 text-xs text-slate-400 border-t border-slate-100">No payment history for current filters.</div>;

  return (
    <div className="border-t border-slate-100 text-xs">
      <div className="grid grid-cols-12 bg-slate-50 font-extrabold text-slate-500 px-4 py-2">
        <span className="col-span-3">Date</span>
        <span className="col-span-3">Lead</span>
        <span className="col-span-2 text-right">Amount</span>
        <span className="col-span-2">Method / Txn</span>
        <span className="col-span-2 text-right">Status</span>
      </div>
      {items.map(r => (
        <div key={r.id} className="grid grid-cols-12 px-4 py-2 border-t border-slate-50 items-center">
          <span className="col-span-3 text-slate-500">{new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
          <span className="col-span-3 font-semibold text-slate-700 truncate">{r.leadName}</span>
          <span className="col-span-2 text-right font-bold">₹{(r.approvedAmount ?? r.requestedAmount).toLocaleString('en-IN')}</span>
          <span className="col-span-2 text-slate-500 truncate">{r.method || '—'}{r.transactionId ? ` · ${r.transactionId}` : ''}</span>
          <span className="col-span-2 flex items-center justify-end gap-1.5">
            <StatusPill status={r.status} />
            {r.receiptId && <button onClick={() => openReceipt(r.receiptId)} title={`Receipt ${r.receiptNo}`} className="text-emerald-600 hover:text-emerald-800 cursor-pointer"><Download className="w-3.5 h-3.5" /></button>}
          </span>
        </div>
      ))}
      <div className="px-4 py-2 flex items-center justify-between border-t border-slate-100">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 font-bold rounded-lg cursor-pointer">Prev</button>
        <span className="text-slate-400 font-bold">Page {page}/{totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 font-bold rounded-lg cursor-pointer">Next</button>
      </div>
    </div>
  );
};
