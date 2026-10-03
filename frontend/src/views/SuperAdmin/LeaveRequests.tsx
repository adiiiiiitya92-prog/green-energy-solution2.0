import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { leaveService } from '../../services/leaveService';
import type { LeaveRequest } from '../../types';
import { LeaveApprovalLetterModal } from '../../components/Leave/LeaveApprovalLetterModal';
import {
  Users,
  CalendarDays,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  ShieldCheck,
  AlertCircle,
  FileCheck2,
  Phone,
  User,
  Check,
  X,
  Filter,
  Trash2,
  Calendar,
  Building2,
  RefreshCw
} from 'lucide-react';

export const LeaveRequests: React.FC = () => {
  const { currentUser, currentRole } = useAuthStore();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [selectedLetterRequest, setSelectedLetterRequest] = useState<LeaveRequest | null>(null);
  const [approvingRequest, setApprovingRequest] = useState<LeaveRequest | null>(null);
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [rejectingRequest, setRejectingRequest] = useState<LeaveRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionProcessing, setActionProcessing] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      await leaveService.purgeDemoLeaveRequests();
      const list = await leaveService.getAllLeaveRequests();
      setRequests(list);
    } catch (err) {
      console.error('Error loading leave requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    const handleRealtime = () => loadRequests();
    window.addEventListener('app-realtime-update', handleRealtime);
    window.addEventListener('storage', handleRealtime);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('ges_crm_realtime');
      bc.onmessage = () => loadRequests();
    } catch (_) {}

    return () => {
      window.removeEventListener('app-realtime-update', handleRealtime);
      window.removeEventListener('storage', handleRealtime);
      if (bc) bc.close();
    };
  }, [currentUser]);

  const handleOpenApproveModal = (req: LeaveRequest) => {
    setApprovingRequest(req);
    setApprovalRemarks('Leave application approved in accordance with company policy.');
  };

  const handleConfirmApprove = async () => {
    if (!approvingRequest || !currentUser) return;
    setActionProcessing(true);
    try {
      await leaveService.approveLeaveRequest({
        leaveId: approvingRequest.id,
        reviewerId: currentUser.id,
        reviewerName: `${currentUser.fullName} (Super Admin)`,
        remarks: approvalRemarks
      });
      showToast(`Leave application #${approvingRequest.leaveNumber} approved successfully. Official sanction letter generated!`);
      setApprovingRequest(null);
      await loadRequests();
    } catch (err: any) {
      showToast(err?.message || 'Failed to approve leave request', 'error');
    } finally {
      setActionProcessing(false);
    }
  };

  const handleOpenRejectModal = (req: LeaveRequest) => {
    setRejectingRequest(req);
    setRejectionReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectingRequest || !currentUser) return;
    if (!rejectionReason.trim()) {
      showToast('Please provide a reason for rejection so the employee can review or reapply.', 'error');
      return;
    }
    setActionProcessing(true);
    try {
      await leaveService.rejectLeaveRequest({
        leaveId: rejectingRequest.id,
        reviewerId: currentUser.id,
        reviewerName: `${currentUser.fullName} (Super Admin)`,
        rejectionReason: rejectionReason.trim()
      });
      showToast(`Leave application #${rejectingRequest.leaveNumber} rejected. Employee has been given reapply option.`);
      setRejectingRequest(null);
      await loadRequests();
    } catch (err: any) {
      showToast(err?.message || 'Failed to reject leave request', 'error');
    } finally {
      setActionProcessing(false);
    }
  };

  const handleDelete = async (req: LeaveRequest) => {
    if (confirm(`Are you sure you want to delete leave request #${req.leaveNumber} of ${req.employeeName}?`)) {
      await leaveService.deleteLeaveRequest(req.id);
      showToast('Leave request record deleted.');
      await loadRequests();
    }
  };

  const filteredRequests = requests.filter(req => {
    // Status filter
    if (statusFilter !== 'all' && req.status !== statusFilter) return false;

    // Role filter
    if (roleFilter !== 'all' && req.employeeRole !== roleFilter) return false;

    // Search query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = req.employeeName?.toLowerCase().includes(q) || false;
      const matchPhone = req.employeePhone ? req.employeePhone.includes(q) : false;
      const matchNum = req.leaveNumber?.toLowerCase().includes(q) || false;
      const matchReason = req.reason?.toLowerCase().includes(q) || false;
      if (!matchName && !matchPhone && !matchNum && !matchReason) return false;
    }

    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  const formatLeaveTypeLabel = (type: string) => {
    switch (type) {
      case 'casual': return 'Casual Leave (CL)';
      case 'sick': return 'Sick / Medical Leave (SL)';
      case 'earned': return 'Earned Leave (PL)';
      case 'emergency': return 'Emergency Leave';
      case 'maternity_paternity': return 'Maternity / Paternity';
      case 'compensatory': return 'Compensatory Off';
      default: return 'Special Leave';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center space-x-2 text-xs font-bold transition-all animate-bounce ${
          toastMessage.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toastMessage.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-2xl p-6 sm:p-8 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 bg-emerald-500/20 px-3 py-1 rounded-full text-emerald-300 text-xs font-bold border border-emerald-400/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Super Admin • HRMS Leave Management</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Staff Leave Requests & Sanctions</h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Review and act on leave applications submitted by Admins, Field Engineers, Inventory Managers, and Dealers.
              Approvals generate official signed letters, and rejections provide structured feedback allowing employees to reapply.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={loadRequests}
              type="button"
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3.5 py-2 rounded-xl border border-white/20 flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Data</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`p-4 rounded-xl border transition-all text-left cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-md'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 shadow-xs'
          }`}
        >
          <p className={`text-[11px] font-semibold ${statusFilter === 'all' ? 'text-slate-300' : 'text-slate-400'}`}>
            Total Applications
          </p>
          <p className="text-2xl font-black mt-1">{requests.length}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('pending')}
          className={`p-4 rounded-xl border transition-all text-left cursor-pointer ${
            statusFilter === 'pending'
              ? 'bg-amber-500 text-white border-amber-500 shadow-md'
              : 'bg-white text-slate-800 border-slate-200 hover:border-amber-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`text-[11px] font-semibold ${statusFilter === 'pending' ? 'text-amber-100' : 'text-slate-400'}`}>
              Pending Review
            </p>
            {pendingCount > 0 && (
              <span className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping"></span>
            )}
          </div>
          <p className={`text-2xl font-black mt-1 ${statusFilter === 'pending' ? 'text-white' : 'text-amber-600'}`}>
            {pendingCount}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('approved')}
          className={`p-4 rounded-xl border transition-all text-left cursor-pointer ${
            statusFilter === 'approved'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
              : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-300 shadow-xs'
          }`}
        >
          <p className={`text-[11px] font-semibold ${statusFilter === 'approved' ? 'text-emerald-100' : 'text-slate-400'}`}>
            Approved & Sanctioned
          </p>
          <p className={`text-2xl font-black mt-1 ${statusFilter === 'approved' ? 'text-white' : 'text-emerald-600'}`}>
            {approvedCount}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('rejected')}
          className={`p-4 rounded-xl border transition-all text-left cursor-pointer ${
            statusFilter === 'rejected'
              ? 'bg-rose-600 text-white border-rose-600 shadow-md'
              : 'bg-white text-slate-800 border-slate-200 hover:border-rose-300 shadow-xs'
          }`}
        >
          <p className={`text-[11px] font-semibold ${statusFilter === 'rejected' ? 'text-rose-100' : 'text-slate-400'}`}>
            Rejected
          </p>
          <p className={`text-2xl font-black mt-1 ${statusFilter === 'rejected' ? 'text-white' : 'text-rose-600'}`}>
            {rejectedCount}
          </p>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search employee, phone, leave #, reason..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs">
            {(['all', 'pending', 'approved', 'rejected'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                type="button"
                className={`px-3 py-1 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admins</option>
            <option value="field_employee">Field Employees</option>
            <option value="inventory_manager">Inventory Managers</option>
            <option value="dealer">Dealers</option>
          </select>
        </div>
      </div>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400 space-y-3">
          <CalendarDays className="w-12 h-12 mx-auto text-slate-300" />
          <h3 className="text-sm font-bold text-slate-700">No Leave Applications Found</h3>
          <p className="text-xs max-w-sm mx-auto">
            {searchTerm
              ? `No requests matching "${searchTerm}". Try clearing your search.`
              : 'No leave applications matching the selected filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map(req => {
            const isApproved = req.status === 'approved';
            const isPending = req.status === 'pending';
            const isRejected = req.status === 'rejected';

            return (
              <div
                key={req.id}
                className={`bg-white rounded-2xl border p-5 transition-all shadow-xs hover:shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 ${
                  isApproved
                    ? 'border-emerald-200 bg-emerald-50/10'
                    : isRejected
                    ? 'border-rose-200 bg-rose-50/10'
                    : 'border-amber-200 bg-amber-50/10'
                }`}
              >
                {/* Left: Employee info & dates */}
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-md">
                      {req.leaveNumber}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      {(req.employeeRole || 'employee').replace(/_/g, ' ')}
                    </span>
                    {req.reapplicationCount && req.reapplicationCount > 0 ? (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                        Revised (v{req.reapplicationCount + 1})
                      </span>
                    ) : null}

                    {/* Status Pill */}
                    {isApproved && (
                      <span className="inline-flex items-center space-x-1 bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-xs font-extrabold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Approved</span>
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex items-center space-x-1 bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-xs font-extrabold animate-pulse">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Awaiting Approval</span>
                      </span>
                    )}
                    {isRejected && (
                      <span className="inline-flex items-center space-x-1 bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full text-xs font-extrabold">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Rejected</span>
                      </span>
                    )}
                  </div>

                  {/* Name and Contact */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="text-base font-extrabold text-slate-900">{req.employeeName}</span>
                    <span className="text-slate-500 font-medium">Phone: {req.employeePhone}</span>
                    {req.contactNumberDuringLeave && req.contactNumberDuringLeave !== req.employeePhone && (
                      <span className="text-slate-500 font-medium">Leave Contact: {req.contactNumberDuringLeave}</span>
                    )}
                  </div>

                  {/* Leave Details Bar */}
                  <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                    <div className="bg-white border border-slate-200 px-3 py-1 rounded-lg">
                      <span className="text-slate-400 font-medium">Type: </span>
                      <strong className="text-slate-800">{formatLeaveTypeLabel(req.leaveType)}</strong>
                    </div>
                    <div className="bg-white border border-slate-200 px-3 py-1 rounded-lg">
                      <span className="text-slate-400 font-medium">Period: </span>
                      <strong className="text-emerald-700">
                        {new Date(req.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </strong>
                      <span className="text-slate-400"> to </span>
                      <strong className="text-emerald-700">
                        {new Date(req.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </strong>
                      <span className="text-slate-500 font-bold ml-1.5">({req.totalDays} Days - {req.durationType === 'full_day' ? 'Full Day' : 'Half Day'})</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Applied: {new Date(req.appliedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>

                  {/* Reason */}
                  <div className="bg-white/80 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-700">
                    <strong className="text-slate-800 block text-[11px] mb-0.5">Stated Purpose / Reason:</strong>
                    <p className="italic">{req.reason}</p>
                    {req.handoverNotes && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        <strong>Handover:</strong> {req.handoverNotes}
                      </p>
                    )}
                  </div>

                  {/* Review Notes */}
                  {isApproved && (
                    <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between">
                      <div>
                        <strong>Sanction Remarks: </strong>
                        <span>{req.approvalRemarks}</span>
                      </div>
                      <span className="font-mono text-[10px] font-bold shrink-0 ml-2">Ref: {req.approvalReferenceNumber}</span>
                    </div>
                  )}

                  {isRejected && (
                    <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                      <strong>Rejection Note: </strong>
                      <span>{req.rejectionReason}</span>
                    </div>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2 shrink-0 w-full lg:w-auto">
                  {isPending && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenApproveModal(req)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>Approve & Generate Letter</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenRejectModal(req)}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>Reject with Reason</span>
                      </button>
                    </>
                  )}

                  {isApproved && (
                    <button
                      type="button"
                      onClick={() => setSelectedLetterRequest(req)}
                      className="bg-slate-900 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>View Sanction Letter</span>
                    </button>
                  )}

                  {isRejected && (
                    <button
                      type="button"
                      onClick={() => handleOpenApproveModal(req)}
                      className="text-xs font-bold text-slate-600 hover:text-emerald-700 bg-slate-100 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Reconsider & Approve
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(req)}
                    className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors self-end cursor-pointer"
                    title="Delete Record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* APPROVE MODAL */}
      {approvingRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-in">
            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
              <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Approve Leave Application</h3>
                <p className="text-xs text-slate-500">
                  {approvingRequest.leaveNumber} • {approvingRequest.employeeName}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 text-xs space-y-1.5 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Leave Duration:</span>
                <span className="font-extrabold text-slate-800">
                  {approvingRequest.totalDays} Day(s) ({approvingRequest.startDate} to {approvingRequest.endDate})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Category:</span>
                <span className="font-bold text-slate-800">{formatLeaveTypeLabel(approvingRequest.leaveType)}</span>
              </div>
              <p className="text-slate-600 pt-1 border-t border-slate-200/60">
                <strong>Reason:</strong> {approvingRequest.reason}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Official Sanction Remarks / Conditions
              </label>
              <textarea
                rows={3}
                value={approvalRemarks}
                onChange={(e) => setApprovalRemarks(e.target.value)}
                placeholder="Add any specific conditions, reporting instructions, or remarks to be printed on the official sanction letter..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              ></textarea>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-800">
              <strong>Certificate Notice:</strong> Upon confirming approval, an official Leave Sanction Letter will be
              automatically generated with an authorized reference number, corporate seal, and verifiable timestamp.
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setApprovingRequest(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionProcessing}
                onClick={handleConfirmApprove}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {actionProcessing ? (
                  <span>Sanctioning...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm & Sanction Leave</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-in">
            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Reject Leave Application</h3>
                <p className="text-xs text-slate-500">
                  {rejectingRequest.leaveNumber} • {rejectingRequest.employeeName}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 text-xs space-y-1 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Requested Dates:</span>
                <span className="font-bold text-slate-800">
                  {rejectingRequest.startDate} to {rejectingRequest.endDate} ({rejectingRequest.totalDays} Days)
                </span>
              </div>
              <p className="text-slate-600 pt-1">
                <strong>Reason given:</strong> {rejectingRequest.reason}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Rejection Reason & Guidance <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain clearly why this request cannot be approved (e.g. critical site installation scheduled, manpower shortage). The employee will receive this reason and can reapply."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
              ></textarea>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900">
              <strong>Reapply Workflow:</strong> Rejecting will not lock out the employee. A <em>Reapply</em> option will be
              enabled on their panel with this explanation pre-filled so they can reschedule.
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingRequest(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionProcessing}
                onClick={handleConfirmReject}
                className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {actionProcessing ? (
                  <span>Processing...</span>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    <span>Confirm Rejection</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Leave Approval Letter Modal */}
      <LeaveApprovalLetterModal
        isOpen={Boolean(selectedLetterRequest)}
        onClose={() => setSelectedLetterRequest(null)}
        leaveRequest={selectedLetterRequest}
      />
    </div>
  );
};
