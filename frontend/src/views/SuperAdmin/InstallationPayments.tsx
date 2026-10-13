import React, { useEffect, useState } from 'react';
import { IndianRupee, Check, X, Receipt as ReceiptIcon, Download, Clock } from 'lucide-react';
import type { PaymentRequest, PaymentMethod, Receipt } from '../../types';
import { paymentRequestService, receiptService } from '../../services/paymentService';
import { useAuthStore } from '../../store/authStore';
import { StatusPill } from '../InstallationSupervisor/InstallationPanel';
import { generateInstallationReceiptPdf, openPdfBlob } from '../../services/installationPdfService';

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' }
];

export const InstallationPayments: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [approving, setApproving] = useState<PaymentRequest | null>(null);

  const load = async () => setRequests(await paymentRequestService.getAll(true));
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('app-realtime-update', h);
    return () => window.removeEventListener('app-realtime-update', h);
  }, []);

  const pending = requests.filter(r => r.status === 'pending');
  const shown = tab === 'pending' ? pending : requests;

  const doReject = async (r: PaymentRequest) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    const res = await paymentRequestService.reject(r.id, {
      rejectReason: reason,
      decidedBy: currentUser?.id || '',
      decidedByName: currentUser?.fullName
    });
    if (!res.success) alert(res.message || 'Could not reject.');
    load();
  };

  const openReceipt = async (receiptId?: string) => {
    if (!receiptId) return;
    const r = await receiptService.getById(receiptId);
    if (r) openPdfBlob(await generateInstallationReceiptPdf(r), `${r.receiptNo}.pdf`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2"><IndianRupee className="w-5 h-5 text-emerald-600" /> Installation Payment Requests</h1>
        <p className="text-xs text-slate-500 font-semibold">{pending.length} pending request(s)</p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('pending')} className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${tab === 'pending' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>Pending ({pending.length})</button>
        <button onClick={() => setTab('all')} className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${tab === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>All ({requests.length})</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {shown.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-bold">No requests.</div>
        ) : shown.map(r => (
          <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-900 text-sm">{r.requestNumber}</span>
                <StatusPill status={r.status} />
                {r.reappliedFrom && <span className="text-[9px] bg-indigo-100 text-indigo-700 font-black px-1.5 py-0.5 rounded uppercase">Reapplied</span>}
              </div>
              <div className="text-xs text-slate-500 font-semibold truncate">
                {r.supervisorName} · {r.leadName} · ₹{(r.approvedAmount ?? r.requestedAmount).toLocaleString('en-IN')}
                {r.note ? ` · ${r.note}` : ''}
              </div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(r.createdAt).toLocaleString('en-IN')}</div>
              {r.rejectReason && <div className="text-[11px] text-rose-500 font-semibold">Rejected: {r.rejectReason}</div>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {r.status === 'pending' && (
                <>
                  <button onClick={() => setApproving(r)} className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded-lg flex items-center gap-1 cursor-pointer"><Check className="w-3.5 h-3.5" /> Approve</button>
                  <button onClick={() => doReject(r)} className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] rounded-lg flex items-center gap-1 cursor-pointer"><X className="w-3.5 h-3.5" /> Reject</button>
                </>
              )}
              {r.status === 'approved' && r.receiptId && (
                <button onClick={() => openReceipt(r.receiptId)} className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg flex items-center gap-1 cursor-pointer"><Download className="w-3.5 h-3.5" /> Receipt {r.receiptNo}</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {approving && (
        <ApproveModal
          request={approving}
          approverId={currentUser?.id || ''}
          approverName={currentUser?.fullName || ''}
          onClose={() => setApproving(null)}
          onApproved={async (receipt) => {
            setApproving(null);
            await load();
            if (receipt && confirm(`Approved. Open receipt ${receipt.receiptNo} PDF?`)) {
              openPdfBlob(await generateInstallationReceiptPdf(receipt), `${receipt.receiptNo}.pdf`);
            }
          }}
        />
      )}
    </div>
  );
};

const ApproveModal: React.FC<{
  request: PaymentRequest;
  approverId: string;
  approverName: string;
  onClose: () => void;
  onApproved: (receipt?: Receipt) => void;
}> = ({ request, approverId, approverName, onClose, onApproved }) => {
  const [approvedAmount, setApprovedAmount] = useState(String(request.requestedAmount));
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [txnId, setTxnId] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const amt = parseFloat(approvedAmount);
    if (!amt || amt <= 0) { alert('Enter a valid approved amount.'); return; }
    if (method !== 'cash' && !txnId.trim()) {
      if (!confirm('No transaction ID entered. Continue anyway?')) return;
    }
    setSaving(true);
    const res = await paymentRequestService.approve(request.id, {
      approvedAmount: amt,
      method,
      transactionId: txnId.trim() || undefined,
      description: desc.trim() || undefined,
      approvedBy: approverId,
      approvedByName: approverName
    });
    setSaving(false);
    if (!res.success) { alert(res.message || 'Could not approve.'); onApproved(); return; }
    onApproved(res.receipt);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ReceiptIcon className="w-5 h-5 text-emerald-600" /> Approve Payment</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3 text-xs font-semibold">
          <div className="bg-slate-50 rounded-xl p-3 text-slate-600">
            <div className="font-black text-slate-800">{request.requestNumber} · {request.supervisorName}</div>
            <div>{request.leadName} · Requested ₹{request.requestedAmount.toLocaleString('en-IN')}</div>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">Approved Amount *</label>
            <input type="number" min={1} value={approvedAmount} onChange={e => setApprovedAmount(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50" />
          </div>
          <div>
            <label className="block text-slate-500 mb-1">Payment Method *</label>
            <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 cursor-pointer">
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">Transaction ID / Reference {method === 'cash' && <span className="text-slate-400">(optional)</span>}</label>
            <input value={txnId} onChange={e => setTxnId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50" />
          </div>
          <div>
            <label className="block text-slate-500 mb-1">Description / Remark</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={submit} disabled={saving}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer">
              <Check className="w-4 h-4" /> {saving ? 'Approving…' : 'Approve & Generate Receipt'}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl cursor-pointer">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};
