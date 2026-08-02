import React, { useEffect, useState } from 'react';
import type { DeletionRequest } from '../../types';
import { deletionRequestService } from '../../services/deletionRequestService';
import { ShieldAlert, Check, X, Trash2, Clock, User, AlertCircle } from 'lucide-react';

interface DeletionApprovalsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeletionApprovalsModal: React.FC<DeletionApprovalsModalProps> = ({ isOpen, onClose }) => {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const loadPendingRequests = async () => {
    try {
      const pending = await deletionRequestService.getPendingRequests();
      setRequests(pending);
    } catch (err) {
      console.warn("Error loading pending deletion requests:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPendingRequests();
    }
    const handleRealtimeUpdate = () => {
      loadPendingRequests();
    };
    window.addEventListener('app-realtime-update', handleRealtimeUpdate);
    return () => {
      window.removeEventListener('app-realtime-update', handleRealtimeUpdate);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApprove = async (id: string) => {
    setLoadingId(id);
    try {
      await deletionRequestService.approveRequest(id);
      await loadPendingRequests();
    } catch (err) {
      console.error("Error approving deletion request:", err);
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setLoadingId(id);
    try {
      await deletionRequestService.rejectRequest(id);
      await loadPendingRequests();
    } catch (err) {
      console.error("Error rejecting deletion request:", err);
    } finally {
      setLoadingId(null);
    }
  };

  const getTypeBadgeStyle = (type: DeletionRequest['entityType']) => {
    switch (type) {
      case 'lead':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'quotation':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'challan':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'product':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white p-5 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black text-rose-300 uppercase tracking-widest block">SUPER ADMIN GATEKEEPER</span>
              <h2 className="text-lg font-black tracking-tight text-white">Pending Deletion Approval Requests</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Requests List Container */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {requests.length === 0 ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-8 text-center rounded-2xl space-y-2">
              <Check className="w-10 h-10 text-emerald-500 mx-auto" />
              <h4 className="text-sm font-extrabold text-slate-800">No Pending Deletion Requests!</h4>
              <p className="text-xs text-slate-400 font-medium">All item deletion requests have been reviewed and processed.</p>
            </div>
          ) : (
            requests.map(req => (
              <div
                key={req.id}
                className="bg-white border border-slate-200 hover:border-slate-300 p-4 rounded-2xl shadow-xs space-y-3 transition-all"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${getTypeBadgeStyle(req.entityType)}`}>
                        {req.entityType}
                      </span>
                      <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(req.requestedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                    <h3 className="text-base font-black text-slate-900">{req.entityName}</h3>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center text-xs gap-2">
                  <div className="flex items-center space-x-2 text-slate-700 font-bold">
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Requested by: <strong className="text-slate-900">{req.requestedByUserName}</strong> ({req.requestedByUserRole.replace('_', ' ')})</span>
                  </div>
                  {req.reason && (
                    <span className="text-[11px] font-medium text-slate-500 italic bg-white px-2 py-1 rounded border border-slate-200">
                      "{req.reason}"
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end space-x-2 pt-1">
                  <button
                    onClick={() => handleReject(req.id)}
                    disabled={loadingId === req.id}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-4 h-4 text-rose-500" />
                    <span>Reject / Keep Item</span>
                  </button>
                  <button
                    onClick={() => handleApprove(req.id)}
                    disabled={loadingId === req.id}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Approve & Permanently Delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-100 text-xs text-slate-500 flex justify-between items-center shrink-0">
          <span className="font-semibold">{requests.length} Pending Deletion Request(s)</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
