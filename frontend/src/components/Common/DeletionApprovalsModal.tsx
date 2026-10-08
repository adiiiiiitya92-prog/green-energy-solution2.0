import React, { useEffect, useState } from 'react';
import type { DeletionRequest } from '../../types';
import { deletionRequestService } from '../../services/deletionRequestService';
import {
  ShieldAlert, Check, X, Trash2, Clock, User, AlertCircle, Search,
  Filter, Phone, Mail, Building, Briefcase, Eye, ChevronDown, ChevronUp,
  FileEdit, Layers, ExternalLink, MessageSquare, CheckCircle2, XCircle
} from 'lucide-react';

interface DeletionApprovalsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeletionApprovalsModal: React.FC<DeletionApprovalsModalProps> = ({ isOpen, onClose }) => {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'delete' | 'edit'>('all');
  const [panelFilter, setPanelFilter] = useState<'all' | 'inventory_panel' | 'field_employee_panel' | 'admin_panel'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);

  const loadRequests = async () => {
    try {
      const allReqs = await deletionRequestService.getDeletionRequests();
      setRequests(allReqs);
    } catch (err) {
      console.warn("Error loading deletion/approval requests:", err);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadRequests();
    let debounceTimer: any = null;
    const handleRealtimeUpdate = (e?: any) => {
      const col = e?.detail?.collectionName;
      if (col && col !== 'deletionRequests') return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadRequests();
      }, 1000);
    };
    window.addEventListener('app-realtime-update', handleRealtimeUpdate);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('app-realtime-update', handleRealtimeUpdate);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApprove = async (id: string) => {
    const adminRemarks = prompt('Enter optional approval remarks / note for logs (or click OK to proceed):', 'Approved by Super Admin');
    if (adminRemarks === null) return; // User pressed Cancel

    setLoadingId(id);
    try {
      await deletionRequestService.approveRequest(id, adminRemarks || undefined);
      await loadRequests();
    } catch (err) {
      console.error("Error approving request:", err);
      alert('Error processing approval.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (id: string) => {
    const rejectRemarks = prompt('Enter rejection reason (visible in audit log):', 'Rejected by Super Admin: action not permitted');
    if (rejectRemarks === null) return; // User pressed Cancel

    setLoadingId(id);
    try {
      await deletionRequestService.rejectRequest(id, rejectRemarks || undefined);
      await loadRequests();
    } catch (err) {
      console.error("Error rejecting request:", err);
      alert('Error rejecting request.');
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
      case 'employee':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'complaint':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'inventory_manager':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'field_employee':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'admin':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'dealer':
        return 'bg-violet-100 text-violet-800 border-violet-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const getPanelLabel = (panel?: string) => {
    switch (panel) {
      case 'inventory_panel':
        return 'Inventory & Delivery Panel';
      case 'field_employee_panel':
        return 'Field Employee Visits Panel';
      case 'admin_panel':
        return 'Main Admin CRM Panel';
      case 'dealer_panel':
        return 'Dealer Network Panel';
      default:
        return 'CRM Panel';
    }
  };

  // Filtered requests
  const filteredRequests = requests.filter(req => {
    // Tab filter
    if (activeTab === 'pending' && req.status !== 'pending') return false;
    if (activeTab === 'history' && req.status === 'pending') return false;

    // Request Type filter
    if (typeFilter === 'delete' && req.requestType === 'edit') return false;
    if (typeFilter === 'edit' && req.requestType !== 'edit') return false;

    // Panel filter
    if (panelFilter !== 'all' && req.requestedFromPanel !== panelFilter) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = req.entityName?.toLowerCase().includes(q);
      const matchRequester = req.requestedByUserName?.toLowerCase().includes(q);
      const matchEmail = req.requestedByUserEmail?.toLowerCase().includes(q);
      const matchPhone = req.requestedByUserPhone?.includes(q);
      const matchReason = req.reason?.toLowerCase().includes(q);
      const matchType = req.entityType?.toLowerCase().includes(q);
      if (!matchName && !matchRequester && !matchEmail && !matchPhone && !matchReason && !matchType) {
        return false;
      }
    }

    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-rose-950 text-white p-5 flex justify-between items-center shrink-0 border-b border-slate-800">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 shadow-inner">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-rose-300 uppercase tracking-widest block">
                  SUPER ADMIN GATEKEEPER & AUDIT CONTROL
                </span>
                {pendingCount > 0 && (
                  <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
                    {pendingCount} PENDING
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                Detailed Approval & Deletion Requests
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            title="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Navigation Bar */}
        <div className="bg-slate-50 border-b border-slate-200/80 p-3 sm:p-4 space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            {/* Status Tabs */}
            <div className="flex bg-slate-200/70 p-1 rounded-xl w-full sm:w-auto">
              <button
                onClick={() => setActiveTab('pending')}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'pending'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Pending Approvals ({pendingCount})</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Audit History ({requests.length - pendingCount})</span>
              </button>
            </div>

            {/* Type Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Action:</span>
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 ${
                  typeFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                All Actions
              </button>
              <button
                onClick={() => setTypeFilter('delete')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                  typeFilter === 'delete'
                    ? 'bg-rose-600 text-white'
                    : 'bg-white border border-slate-200 text-rose-700 hover:bg-rose-50'
                }`}
              >
                <Trash2 className="w-3 h-3" />
                <span>Deletions</span>
              </button>
              <button
                onClick={() => setTypeFilter('edit')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                  typeFilter === 'edit'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-slate-200 text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                <FileEdit className="w-3 h-3" />
                <span>Edits</span>
              </button>
            </div>
          </div>

          {/* Search and Panel Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by employee name, role, email, phone, or target item name..."
                className="w-full text-xs font-medium pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={panelFilter}
                onChange={(e) => setPanelFilter(e.target.value as any)}
                className="text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-2.5 py-2 focus:outline-hidden cursor-pointer"
              >
                <option value="all">All Origin Panels</option>
                <option value="inventory_panel">Inventory & Delivery Panel</option>
                <option value="field_employee_panel">Field Employee Panel</option>
                <option value="admin_panel">Main Admin Panel</option>
              </select>
            </div>
          </div>
        </div>

        {/* Requests Scrollable List Container */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 bg-slate-100/50">
          {filteredRequests.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 p-10 text-center rounded-3xl space-y-2 my-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h4 className="text-base font-black text-slate-800">
                {activeTab === 'pending' ? 'No Pending Approval Requests!' : 'No Audit History Matching Filters'}
              </h4>
              <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
                {activeTab === 'pending'
                  ? 'All item deletion and edit requests from Admin, Inventory, and Field Employee teams have been reviewed.'
                  : 'Try changing your search query or filter settings to view previous logs.'}
              </p>
            </div>
          ) : (
            filteredRequests.map(req => {
              const isEdit = req.requestType === 'edit';
              const isPending = req.status === 'pending';
              const isApproved = req.status === 'approved';
              const isRejected = req.status === 'rejected';
              const isExpanded = expandedSnapshotId === req.id;
              const hasSnapshot = req.itemSnapshot && Object.keys(req.itemSnapshot).length > 0;
              const hasDiff = req.changedFields && req.changedFields.length > 0;

              return (
                <div
                  key={req.id}
                  className={`bg-white border rounded-2xl shadow-xs overflow-hidden transition-all ${
                    isPending
                      ? 'border-slate-200 hover:border-slate-300'
                      : isApproved
                      ? 'border-emerald-200 bg-emerald-50/10'
                      : 'border-rose-200 bg-rose-50/10'
                  }`}
                >
                  {/* Card Top Banner Bar */}
                  <div className={`px-4 py-2 text-xs flex flex-wrap justify-between items-center gap-2 border-b ${
                    isPending
                      ? isEdit ? 'bg-indigo-50/80 border-indigo-100 text-indigo-900' : 'bg-rose-50/80 border-rose-100 text-rose-900'
                      : isApproved
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                      : 'bg-rose-50 border-rose-100 text-rose-900'
                  }`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                        isEdit
                          ? 'bg-indigo-600 text-white border-indigo-700'
                          : 'bg-rose-600 text-white border-rose-700'
                      }`}>
                        {isEdit ? 'EDIT REQUEST' : 'DELETE REQUEST'}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${getTypeBadgeStyle(req.entityType)}`}>
                        {req.entityType}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">
                        Origin: <strong className="text-slate-700">{getPanelLabel(req.requestedFromPanel)}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                        <Clock className="w-3 h-3" />
                        {new Date(req.requestedAt).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </span>
                      {/* Status Tag */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        isPending
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : isApproved
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}>
                        {req.status}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3.5">
                    {/* Target Item Name & Identity */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        Target Record Identifier
                      </div>
                      <h3 className="text-base sm:text-lg font-black text-slate-900">
                        {req.entityName}
                      </h3>
                      <div className="text-[11px] font-mono text-slate-400">
                        ID: #{req.entityId}
                      </div>
                    </div>

                    {/* Requester Complete Details Grid */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          Requested By Employee Information
                        </span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${getRoleBadgeStyle(req.requestedByUserRole)}`}>
                          {(req.requestedByUserRole || 'user').replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                        {/* Employee Name */}
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Employee Name:</span>
                          <span className="font-black text-slate-900">{req.requestedByUserName}</span>
                          {req.requestedByUserDesignation && (
                            <span className="text-[11px] text-slate-500 block font-medium">({req.requestedByUserDesignation})</span>
                          )}
                        </div>

                        {/* Phone */}
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Contact Phone:</span>
                          {req.requestedByUserPhone ? (
                            <a
                              href={`tel:${req.requestedByUserPhone}`}
                              className="font-bold text-emerald-700 hover:underline flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3" />
                              <span>+91 {req.requestedByUserPhone}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">Not available</span>
                          )}
                        </div>

                        {/* Email */}
                        <div>
                          <span className="text-[10px] text-slate-400 block font-semibold">Official Email:</span>
                          {req.requestedByUserEmail ? (
                            <a
                              href={`mailto:${req.requestedByUserEmail}`}
                              className="font-bold text-blue-700 hover:underline flex items-center gap-1 truncate"
                            >
                              <Mail className="w-3 h-3 shrink-0" />
                              <span className="truncate">{req.requestedByUserEmail}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">Not available</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Justification / Reason Quote Box */}
                    {req.reason && (
                      <div className="bg-amber-50/50 border border-amber-200/80 rounded-xl p-3 text-xs space-y-1">
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          Employee's Stated Reason / Justification:
                        </span>
                        <p className="text-slate-800 font-semibold italic text-xs leading-relaxed">
                          "{req.reason}"
                        </p>
                      </div>
                    )}

                    {/* Edit Requests: Visual Diff Comparison Table */}
                    {isEdit && hasDiff && (
                      <div className="border border-indigo-200/80 rounded-2xl overflow-hidden text-xs">
                        <div className="bg-indigo-50 px-3 py-2 font-black text-indigo-950 flex items-center justify-between text-[11px] uppercase tracking-wider">
                          <span className="flex items-center gap-1.5">
                            <FileEdit className="w-3.5 h-3.5 text-indigo-600" />
                            Field-by-Field Modification Diff ({req.changedFields?.length} Changes)
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100 overflow-x-auto">
                          <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase">
                              <tr>
                                <th className="py-2 px-3">Field</th>
                                <th className="py-2 px-3">Previous Value (Before)</th>
                                <th className="py-2 px-3">Requested Update (After)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {req.changedFields?.map((diff, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50">
                                  <td className="py-2 px-3 font-bold text-slate-800">{diff.label}</td>
                                  <td className="py-2 px-3 text-rose-700 line-through bg-rose-50/40">
                                    {typeof diff.oldValue === 'object' ? JSON.stringify(diff.oldValue) : String(diff.oldValue)}
                                  </td>
                                  <td className="py-2 px-3 text-emerald-800 font-bold bg-emerald-50/40">
                                    {typeof diff.newValue === 'object' ? JSON.stringify(diff.newValue) : String(diff.newValue)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Inspect Complete Record Toggle Button & Expanded View */}
                    {hasSnapshot && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedSnapshotId(isExpanded ? null : req.id)}
                          className="w-full bg-slate-50 hover:bg-slate-100 p-2.5 text-xs font-black text-slate-700 flex justify-between items-center transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-slate-500" />
                            <span>{isExpanded ? 'Hide' : 'Inspect'} Complete Record Snapshot ({Object.keys(req.itemSnapshot || {}).length} Attributes)</span>
                          </span>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {isExpanded && req.itemSnapshot && (
                          <div className="p-3 bg-white border-t border-slate-200 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-[11px]">
                              {Object.entries(req.itemSnapshot).map(([key, val]) => {
                                if (key === 'fileBlob' || key === 'pdfBlob' || key === 'photoBlob') return null;
                                const isComplex = typeof val === 'object' && val !== null;
                                return (
                                  <div key={key} className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block truncate">
                                      {key.replace(/([A-Z])/g, ' $1')}
                                    </span>
                                    <div className="font-semibold text-slate-800 break-words mt-0.5">
                                      {isComplex ? JSON.stringify(val, null, 1) : String(val ?? '(none)')}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Review History Details (if reviewed) */}
                    {!isPending && (
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs flex flex-wrap justify-between items-center gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Reviewed By:</span>
                          <span className="font-bold text-slate-800">{req.reviewedByUserName || 'Super Admin'}</span>
                          {req.reviewedAt && (
                            <span className="text-[10px] text-slate-400 block">
                              on {new Date(req.reviewedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          )}
                        </div>
                        {req.reviewRemarks && (
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-semibold block">Remarks:</span>
                            <span className="font-bold text-slate-700 italic">"{req.reviewRemarks}"</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Controls for Super Admin */}
                    {isPending && (
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={loadingId === req.id}
                          className="px-4 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 border border-slate-200"
                        >
                          <X className="w-4 h-4 text-rose-500" />
                          <span>Reject Request</span>
                        </button>
                        <button
                          onClick={() => handleApprove(req.id)}
                          disabled={loadingId === req.id}
                          className={`px-5 py-2 text-white font-black text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
                            isEdit
                              ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
                              : 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                          }`}
                        >
                          {isEdit ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Approve & Apply Edits</span>
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4" />
                              <span>Approve & Permanently Delete</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="bg-white p-4 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center shrink-0">
          <span className="font-bold">
            Showing {filteredRequests.length} of {requests.length} total request(s) • {pendingCount} Pending Action
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

