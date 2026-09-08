import React, { useState } from 'react';
import { ShieldAlert, Send, X, User, AlertCircle, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface RequestReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  actionType: 'delete' | 'edit';
  entityType: string;
  entityName: string;
  loading?: boolean;
}

export const RequestReasonModal: React.FC<RequestReasonModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  actionType,
  entityType,
  entityName,
  loading = false,
}) => {
  const { currentUser, currentRole } = useAuthStore();
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const quickReasons = actionType === 'delete' ? [
    'Duplicate entry created by mistake',
    'Customer cancelled requirement / deal',
    'Physical inventory audit mismatch',
    'Incorrect client or product specifications',
    'Testing / demo data cleanup'
  ] : [
    'Updated stock quantity after physical count',
    'Revised product pricing as per new vendor rate',
    'Updated customer contact / address details',
    'Corrected dispatch vehicle / driver details'
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = reason.trim() || (actionType === 'delete' ? 'Deletion requested via CRM panel' : 'Edit updates requested via CRM panel');
    onSubmit(finalReason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`p-5 text-white flex justify-between items-center ${
          actionType === 'delete'
            ? 'bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900'
            : 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-2xl border ${
              actionType === 'delete'
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
            }`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className={`text-[10px] font-black uppercase tracking-widest block ${
                actionType === 'delete' ? 'text-rose-300' : 'text-indigo-300'
              }`}>
                SUPER ADMIN APPROVAL REQUIRED
              </span>
              <h2 className="text-base font-black tracking-tight text-white">
                Submit {actionType === 'delete' ? 'Deletion' : 'Edit'} Request
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Target Item Overview Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Target Entity ({entityType})
              </span>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                actionType === 'delete'
                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                  : 'bg-indigo-100 text-indigo-800 border-indigo-200'
              }`}>
                {actionType === 'delete' ? 'Delete Target' : 'Edit Target'}
              </span>
            </div>
            <div className="text-sm font-black text-slate-900 break-words">
              {entityName}
            </div>
          </div>

          {/* Requester Identity Info */}
          <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl p-3 text-xs flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-xs shrink-0">
              {currentUser?.fullName?.[0] || 'U'}
            </div>
            <div className="truncate">
              <div className="font-bold text-slate-900 truncate">
                Submitting as: <strong className="text-emerald-800">{currentUser?.fullName || 'Employee'}</strong>
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                Role: <span className="font-semibold uppercase text-emerald-700">{currentRole.replace('_', ' ')}</span>
                {currentUser?.designation && ` • ${currentUser.designation}`}
                {currentUser?.email && ` • ${currentUser.email}`}
              </div>
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Reason / Justification for Super Admin: <span className="text-slate-400 font-normal">(Mandatory)</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`Please state the reason why this ${entityType} should be ${actionType === 'delete' ? 'deleted' : 'updated'}...`}
              className="w-full text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              required
            />
          </div>

          {/* Quick Reason Suggestions */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              Quick Suggestions:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {quickReasons.map((qr, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setReason(qr)}
                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-650 px-2 py-1 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  {qr}
                </button>
              ))}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2 text-white font-black text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 ${
                actionType === 'delete'
                  ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Submitting...' : 'Submit to Super Admin'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
