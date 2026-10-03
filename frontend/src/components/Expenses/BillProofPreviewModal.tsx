import React, { useState, useEffect } from 'react';
import type { ExpenseClaim } from '../../types';
import { resolveExpenseReceiptUrl, normalizeReceiptUrl } from '../../services/expenseService';
import { getFreshB2SignedUrl } from '../../services/firebase';
import {
  X,
  ExternalLink,
  Download,
  Receipt,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface BillProofPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  claim: ExpenseClaim | null;
}

export const BillProofPreviewModal: React.FC<BillProofPreviewModalProps> = ({
  isOpen,
  onClose,
  claim
}) => {
  if (!isOpen || !claim) return null;

  const [activeSrc, setActiveSrc] = useState<string>(() => resolveExpenseReceiptUrl(claim));
  const [imageLoading, setImageLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [rotationDeg, setRotationDeg] = useState(0);

  useEffect(() => {
    setImageLoading(true);
    setLoadError(false);
    setZoomScale(1);
    setRotationDeg(0);

    const initial = resolveExpenseReceiptUrl(claim);
    setActiveSrc(initial);

    // If it's a remote Backblaze URL, fetch a guaranteed fresh 7-day signed token asynchronously
    const rawUrl = claim.billProofUrl || '';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      getFreshB2SignedUrl(rawUrl).then(fresh => {
        if (fresh && fresh !== initial) {
          setActiveSrc(fresh);
        }
      }).catch(() => {});
    }
  }, [claim]);

  const handleImageError = () => {
    // If remote URL failed, try fallback to billProofBlob
    if (claim.billProofBlob && activeSrc !== claim.billProofBlob) {
      const fallback = normalizeReceiptUrl(claim.billProofBlob);
      if (fallback && fallback !== activeSrc) {
        setActiveSrc(fallback);
        setImageLoading(false);
        return;
      }
    }

    setImageLoading(false);
    setLoadError(true);
  };

  const handleZoomIn = () => setZoomScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomScale(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotationDeg(prev => (prev + 90) % 360);
  const handleResetView = () => {
    setZoomScale(1);
    setRotationDeg(0);
  };

  const handleDownload = () => {
    if (!activeSrc) return;
    const a = document.createElement('a');
    a.href = activeSrc;
    a.download = `bill_proof_${claim.expenseNumber || 'claim'}.webp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white select-none shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400 border border-emerald-400/30">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Bill / Receipt Proof Verification</h3>
              <p className="text-[10px] text-slate-300">
                {claim.expenseNumber} • {claim.employeeName} ({(claim.employeeRole || 'employee').replace(/_/g, ' ').toUpperCase()})
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {activeSrc && !loadError && (
              <>
                <button
                  onClick={handleDownload}
                  type="button"
                  className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
                  title="Download receipt image"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </button>
                <a
                  href={activeSrc}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
                  title="Open in new window"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Fullscreen</span>
                </a>
              </>
            )}
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar Controls */}
        {activeSrc && !loadError && (
          <div className="px-5 py-2 bg-slate-800 border-b border-slate-700/60 flex items-center justify-between text-xs text-slate-300 select-none">
            <div className="flex items-center space-x-2">
              <button
                onClick={handleZoomIn}
                type="button"
                className="p-1.5 hover:bg-slate-700 rounded-md transition-colors text-white"
                title="Zoom In (+25%)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleZoomOut}
                type="button"
                className="p-1.5 hover:bg-slate-700 rounded-md transition-colors text-white"
                title="Zoom Out (-25%)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono text-slate-400 w-12 text-center">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                onClick={handleRotate}
                type="button"
                className="p-1.5 hover:bg-slate-700 rounded-md transition-colors text-white"
                title="Rotate 90° Clockwise"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              {(zoomScale !== 1 || rotationDeg !== 0) && (
                <button
                  onClick={handleResetView}
                  type="button"
                  className="p-1.5 hover:bg-slate-700 rounded-md transition-colors text-emerald-400 flex items-center space-x-1"
                  title="Reset Zoom & Rotation"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold">Reset</span>
                </button>
              )}
            </div>
            <span className="text-[10px] text-slate-400 hidden sm:inline">
              Tip: Use zoom & rotate to inspect blurry stamps, date or invoice amounts
            </span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4 bg-slate-100 flex flex-col items-center justify-center min-h-[350px]">
          {activeSrc && !loadError ? (
            <div className="relative max-w-full max-h-[60vh] overflow-auto rounded-xl shadow-md border border-slate-300 bg-white p-2 flex items-center justify-center">
              {imageLoading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center z-10 space-y-2">
                  <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
                  <span className="text-xs font-bold text-slate-600">Loading bill receipt...</span>
                </div>
              )}
              <img
                src={activeSrc}
                alt={`Bill Proof for ${claim.title}`}
                onLoad={() => setImageLoading(false)}
                onError={handleImageError}
                style={{
                  transform: `scale(${zoomScale}) rotate(${rotationDeg}deg)`,
                  transition: 'transform 0.15s ease-out'
                }}
                className="max-h-[55vh] max-w-full object-contain mx-auto rounded-lg select-none"
              />
            </div>
          ) : loadError ? (
            <div className="p-8 text-center text-slate-500 space-y-3 bg-white rounded-xl border border-rose-200 shadow-sm max-w-md w-full">
              <AlertCircle className="w-12 h-12 mx-auto text-rose-500" />
              <h4 className="text-sm font-bold text-slate-800">Unable to Render Image Proof</h4>
              <p className="text-xs text-slate-500">
                The attached bill image could not be loaded or was corrupted during transfer. The employee can reapply with a fresh receipt photo.
              </p>
              {claim.billProofUrl && (
                <a
                  href={claim.billProofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-100"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Try Opening Cloud Link Directly</span>
                </a>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 space-y-2 bg-white rounded-xl border border-dashed border-slate-300 w-full">
              <FileText className="w-12 h-12 mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">No Receipt Image Attached</p>
              <p className="text-xs text-slate-400">The employee did not attach an image proof with this claim.</p>
            </div>
          )}

          {/* Quick claim summary footer bar */}
          <div className="w-full bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Expense Title & Category</span>
              <p className="font-extrabold text-slate-900">{claim.title} <span className="text-slate-500 font-normal">({(claim.category || 'general').replace(/_/g, ' ')})</span></p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Claimed Amount</span>
              <p className="text-base font-black text-emerald-700">₹{claim.amount.toLocaleString('en-IN')}</p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Expense Date</span>
              <p className="font-bold text-slate-800">
                {new Date(claim.expenseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                claim.status === 'approved'
                  ? 'bg-emerald-100 text-emerald-800'
                  : claim.status === 'rejected'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {claim.status}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-white border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
