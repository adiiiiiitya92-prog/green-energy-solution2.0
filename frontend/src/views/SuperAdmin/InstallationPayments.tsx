import React, { useEffect, useState } from 'react';
import {
  IndianRupee, Check, X, Receipt as ReceiptIcon, Download, Clock, Camera, Eye, MapPin,
  ChevronDown, ChevronUp, ImageIcon, Package, Trash2
} from 'lucide-react';
import type { PaymentRequest, PaymentMethod, Receipt, InstallationPhoto, InstallationRecord } from '../../types';
import { paymentRequestService, receiptService } from '../../services/paymentService';
import { useAuthStore } from '../../store/authStore';
import { StatusPill } from '../InstallationSupervisor/InstallationPanel';
import { generateInstallationReceiptPdf, openPdfBlob } from '../../services/installationPdfService';
import { orderService } from '../../services/orderService';
import { installationService } from '../../services/installationService';
import { getSafeBlobUrl } from '../../services/firebase';

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
  const [previewModal, setPreviewModal] = useState<{ url: string; title: string } | null>(null);

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

  const doDelete = async (r: PaymentRequest) => {
    const label = r.requestNumber || (r.requestedAmount ? `₹${r.requestedAmount}` : 'this request');
    if (!confirm(`Are you sure you want to delete payment request (${label})? This cannot be undone.`)) {
      return;
    }
    if (r.id) {
      await paymentRequestService.deleteRequest(r.id);
    } else {
      const { db } = await import('../../services/db');
      const all = await db.paymentRequests.toArray();
      for (const item of all) {
        if (!item.id || item === r || !item.createdAt) {
          if (item.id) await db.paymentRequests.delete(item.id);
        }
      }
    }
    await load();
  };

  const openReceipt = async (receiptId?: string, paymentRequestId?: string) => {
    let r: Receipt | undefined;
    if (receiptId) {
      r = await receiptService.getById(receiptId);
    }
    if (!r && paymentRequestId) {
      const { db } = await import('../../services/db');
      r = await db.receipts.where({ paymentRequestId }).first();
      if (!r) {
        await receiptService.getAll(true);
        r = await db.receipts.where({ paymentRequestId }).first();
      }
    }
    if (r) {
      openPdfBlob(await generateInstallationReceiptPdf(r), `${r.receiptNo}.pdf`);
    } else {
      alert('Receipt record not found or not synced yet.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <IndianRupee className="w-5 h-5 text-emerald-600" /> Installation Payment Requests
        </h1>
        <p className="text-xs text-slate-500 font-semibold">{pending.length} pending request(s)</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('pending')}
          className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${tab === 'pending' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Pending ({pending.length})
        </button>
        <button
          onClick={() => setTab('all')}
          className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${tab === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          All ({requests.length})
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-xs">
        {shown.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-bold">No requests found.</div>
        ) : shown.map(r => (
          <PaymentRequestCard
            key={r.id || `ghost_${Math.random()}`}
            request={r}
            onApprove={() => setApproving(r)}
            onReject={() => doReject(r)}
            onDelete={() => doDelete(r)}
            onOpenReceipt={() => openReceipt(r.receiptId, r.id)}
            onPreviewImage={(img) => setPreviewModal(img)}
          />
        ))}
      </div>

      {approving && (
        <ApproveModal
          request={approving}
          approverId={currentUser?.id || ''}
          approverName={currentUser?.fullName || ''}
          onClose={() => setApproving(null)}
          onPreviewImage={(img) => setPreviewModal(img)}
          onApproved={async (receipt) => {
            setApproving(null);
            await load();
            if (receipt && confirm(`Approved. Open receipt ${receipt.receiptNo} PDF?`)) {
              openPdfBlob(await generateInstallationReceiptPdf(receipt), `${receipt.receiptNo}.pdf`);
            }
          }}
        />
      )}

      {/* Lightbox Photo Preview Modal */}
      {previewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4" onClick={() => setPreviewModal(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3 relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-extrabold text-sm text-slate-800 truncate">{previewModal.title}</span>
              <button onClick={() => setPreviewModal(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="max-h-[70vh] flex items-center justify-center overflow-auto rounded-xl bg-slate-50 p-2">
              <img src={previewModal.url} alt={previewModal.title} className="max-h-[65vh] object-contain rounded-lg" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <a href={previewModal.url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-slate-900 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer">
                <Eye className="w-3.5 h-3.5" /> View Original
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PaymentRequestCard: React.FC<{
  request: PaymentRequest;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  onOpenReceipt: () => void;
  onPreviewImage: (photo: { url: string; title: string }) => void;
}> = ({ request: r, onApprove, onReject, onDelete, onOpenReceipt, onPreviewImage }) => {
  const [sitePhotos, setSitePhotos] = useState<InstallationPhoto[]>([]);
  const [instRecord, setInstRecord] = useState<InstallationRecord | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingPhotos(true);
        const [photos, inst] = await Promise.all([
          orderService.getInstallationPhotosByLeadId(r.leadId, true),
          installationService.getByLead(r.leadId, true)
        ]);
        if (mounted) {
          setSitePhotos(photos || []);
          setInstRecord(inst || null);
        }
      } catch (_) {
      } finally {
        if (mounted) setLoadingPhotos(false);
      }
    })();
    return () => { mounted = false; };
  }, [r.leadId]);

  const remainingEntries = instRecord?.remainingMaterial || [];
  const allRemainingImages = remainingEntries.flatMap(rm => rm.imageUrls.map(u => ({ url: u, desc: rm.description })));
  const totalPhotosCount = sitePhotos.length + allRemainingImages.length;

  return (
    <div className="px-4 py-3.5 space-y-2.5 hover:bg-slate-50/50 transition-colors">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-slate-900 text-sm">{r.requestNumber}</span>
            <StatusPill status={r.status} />
            {r.reappliedFrom && <span className="text-[9px] bg-indigo-100 text-indigo-700 font-black px-1.5 py-0.5 rounded uppercase">Reapplied</span>}
          </div>
          <div className="text-xs text-slate-600 font-semibold truncate mt-0.5">
            <span className="font-extrabold text-slate-900">{r.supervisorName || 'Supervisor'}</span> · {r.leadName} · <span className="text-emerald-700 font-extrabold">₹{(r.approvedAmount ?? r.requestedAmount).toLocaleString('en-IN')}</span>
            {r.note ? ` · "${r.note}"` : ''}
          </div>
          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" /> {r.createdAt && !isNaN(new Date(r.createdAt).getTime()) ? new Date(r.createdAt).toLocaleString('en-IN') : 'Date unavailable'}
          </div>
          {r.rejectReason && <div className="text-[11px] text-rose-500 font-semibold mt-0.5">Rejected: {r.rejectReason}</div>}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {r.status === 'pending' && (
            <>
              <button onClick={onApprove} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1 cursor-pointer shadow-xs">
                <Check className="w-3.5 h-3.5" /> Approve
              </button>
              <button onClick={onReject} className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-xs rounded-xl flex items-center gap-1 cursor-pointer">
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </>
          )}
          {r.status === 'approved' && (
            <button onClick={onOpenReceipt} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl flex items-center gap-1 cursor-pointer border border-slate-200">
              <Download className="w-3.5 h-3.5 text-emerald-600" /> Receipt {r.receiptNo || 'PDF'}
            </button>
          )}
          <button
            onClick={onDelete}
            title="Delete Request"
            className="p-1.5 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-xl font-bold text-xs flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Photos Strip / Inspection Section */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
            <Camera className="w-3.5 h-3.5 text-indigo-600" />
            <span>Supervisor Uploaded Photos:</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${totalPhotosCount > 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-600'}`}>
              {loadingPhotos ? '...' : totalPhotosCount}
            </span>
          </div>

          {/* Quick thumbnails preview */}
          {sitePhotos.slice(0, 3).map(p => {
            const safe = getSafeBlobUrl(p.photoBlob);
            return (
              <div
                key={p.id}
                onClick={() => onPreviewImage({ url: safe, title: `${r.leadName} - ${p.photoType.toUpperCase()}` })}
                className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 bg-white cursor-pointer hover:scale-105 transition-transform"
                title={`${p.photoType.toUpperCase()} - click to view`}
              >
                <img src={safe} alt={p.photoType} className="w-full h-full object-cover" />
              </div>
            );
          })}
          {allRemainingImages.slice(0, 2).map((img, i) => {
            const safe = getSafeBlobUrl(img.url);
            return (
              <div
                key={i}
                onClick={() => onPreviewImage({ url: safe, title: `Remaining Material - ${img.desc || r.leadName}` })}
                className="w-8 h-8 rounded-lg overflow-hidden border border-amber-300 bg-amber-50 cursor-pointer hover:scale-105 transition-transform"
                title="Remaining Material - click to view"
              >
                <img src={safe} alt="remaining" className="w-full h-full object-cover" />
              </div>
            );
          })}
        </div>

        {totalPhotosCount > 0 ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-extrabold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
          >
            {expanded ? <>Hide Photos <ChevronUp className="w-3 h-3" /></> : <>Inspect All Photos ({totalPhotosCount}) <ChevronDown className="w-3 h-3" /></>}
          </button>
        ) : (
          <span className="text-[10px] text-slate-400 font-semibold italic">No photos attached to this lead</span>
        )}
      </div>

      {/* Expanded Photos Gallery */}
      {expanded && totalPhotosCount > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
          {sitePhotos.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase text-slate-500 mb-2 flex items-center gap-1">
                <Camera className="w-3 h-3 text-emerald-600" /> Site Installation Photos ({sitePhotos.length})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {sitePhotos.map(p => {
                  const safe = getSafeBlobUrl(p.photoBlob);
                  return (
                    <div
                      key={p.id}
                      onClick={() => onPreviewImage({ url: safe, title: `${r.leadName} - ${p.photoType.toUpperCase()}` })}
                      className="group relative border border-slate-200 rounded-lg overflow-hidden bg-slate-50 aspect-square cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <img src={safe} alt={p.photoType} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <span className="absolute bottom-1 left-1 bg-slate-900/80 text-white text-[8px] font-black px-1 py-0.5 rounded uppercase">
                        {p.photoType}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {allRemainingImages.length > 0 && (
            <div>
              <div className="text-[11px] font-black uppercase text-slate-500 mb-2 flex items-center gap-1">
                <ImageIcon className="w-3 h-3 text-amber-500" /> Remaining Material Photos ({allRemainingImages.length})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {allRemainingImages.map((img, i) => {
                  const safe = getSafeBlobUrl(img.url);
                  return (
                    <div
                      key={i}
                      onClick={() => onPreviewImage({ url: safe, title: `Remaining Material - ${img.desc || r.leadName}` })}
                      className="group relative border border-amber-200 rounded-lg overflow-hidden bg-amber-50/50 aspect-square cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <img src={safe} alt="remaining" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <span className="absolute bottom-1 left-1 bg-amber-700/80 text-white text-[8px] font-black px-1 py-0.5 rounded uppercase">
                        Remaining
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
  onPreviewImage: (photo: { url: string; title: string }) => void;
}> = ({ request, approverId, approverName, onClose, onApproved, onPreviewImage }) => {
  const [approvedAmount, setApprovedAmount] = useState(String(request.requestedAmount));
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [txnId, setTxnId] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [sitePhotos, setSitePhotos] = useState<InstallationPhoto[]>([]);

  useEffect(() => {
    orderService.getInstallationPhotosByLeadId(request.leadId, true).then(p => setSitePhotos(p || [])).catch(() => {});
  }, [request.leadId]);

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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <ReceiptIcon className="w-5 h-5 text-emerald-600" /> Approve Payment
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3 text-xs font-semibold">
          <div className="bg-slate-50 rounded-xl p-3 text-slate-600 space-y-1">
            <div className="font-black text-slate-800">{request.requestNumber} · {request.supervisorName}</div>
            <div>{request.leadName} · Requested <span className="font-extrabold text-emerald-600">₹{request.requestedAmount.toLocaleString('en-IN')}</span></div>
            {request.note && <div className="text-[11px] text-slate-500 italic">Note: "{request.note}"</div>}
          </div>

          {/* Supervisor Photos Proof in Modal */}
          {sitePhotos.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 space-y-1.5">
              <div className="text-[11px] font-extrabold text-slate-700 flex items-center gap-1">
                <Camera className="w-3.5 h-3.5 text-emerald-600" />
                <span>Installation Photos Proof ({sitePhotos.length}):</span>
              </div>
              <div className="flex gap-2 overflow-x-auto py-1">
                {sitePhotos.map(p => {
                  const safe = getSafeBlobUrl(p.photoBlob);
                  return (
                    <div
                      key={p.id}
                      onClick={() => onPreviewImage({ url: safe, title: `${request.leadName} - ${p.photoType.toUpperCase()}` })}
                      className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-white cursor-pointer hover:scale-105 transition-transform relative"
                      title={`${p.photoType.toUpperCase()} - click to view`}
                    >
                      <img src={safe} alt={p.photoType} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-[7px] text-white text-center font-black truncate">
                        {p.photoType}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-slate-500 mb-1">Approved Amount *</label>
            <input
              type="number"
              min={1}
              value={approvedAmount}
              onChange={e => setApprovedAmount(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-slate-500 mb-1">Payment Method *</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value as PaymentMethod)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold"
            >
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-slate-500 mb-1">
              Transaction ID / Reference {method === 'cash' && <span className="text-slate-400 font-normal">(optional)</span>}
            </label>
            <input
              value={txnId}
              onChange={e => setTxnId(e.target.value)}
              placeholder="e.g. UPI Ref / Bank UTR..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-500 mb-1">Description / Remark</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              placeholder="Remark / payment note..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={submit}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Check className="w-4 h-4" /> {saving ? 'Approving…' : 'Approve & Generate Receipt'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
