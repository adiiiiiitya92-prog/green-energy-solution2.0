import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { leaveService, calculateLeaveDays } from '../../services/leaveService';
import type { LeaveRequest, LeaveType, LeaveDurationType } from '../../types';
import { LeaveApprovalLetterModal } from '../../components/Leave/LeaveApprovalLetterModal';
import {
  CalendarDays,
  Send,
  FileCheck2,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Printer,
  AlertCircle,
  FileText,
  User,
  ShieldCheck,
  Calendar,
  Phone,
  Info,
  ChevronRight,
  Filter,
  Plus
} from 'lucide-react';

export const LeaveApplication: React.FC = () => {
  const { currentUser, currentRole } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'apply' | 'my_applications' | 'approved_letters'>('apply');
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Selected request for modal
  const [selectedLetterRequest, setSelectedLetterRequest] = useState<LeaveRequest | null>(null);

  // Form State
  const [leaveType, setLeaveType] = useState<LeaveType>('casual');
  const [durationType, setDurationType] = useState<LeaveDurationType>('full_day');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');

  // Reapply Context
  const [reapplyTarget, setReapplyTarget] = useState<LeaveRequest | null>(null);

  const loadRequests = async () => {
    if (!currentUser) return;
    await leaveService.purgeDemoLeaveRequests();
    const list = await leaveService.getLeaveRequestsByEmployee(currentUser.id);
    setMyRequests(list);
  };

  useEffect(() => {
    loadRequests();
    if (currentUser?.phone) {
      setContactNumber(currentUser.phone);
    }

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

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const calculatedDays = calculateLeaveDays(startDate, endDate, durationType);

  const handleStartReapply = (req: LeaveRequest) => {
    setReapplyTarget(req);
    setLeaveType(req.leaveType);
    setDurationType(req.durationType);
    setStartDate(req.startDate);
    setEndDate(req.endDate);
    setReason(req.reason);
    setContactNumber(req.contactNumberDuringLeave || currentUser?.phone || '');
    setHandoverNotes(req.handoverNotes || '');
    setActiveTab('apply');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelReapply = () => {
    setReapplyTarget(null);
    setReason('');
    setHandoverNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('You must be logged in to apply for leave.', 'error');
      return;
    }

    if (!startDate || !endDate) {
      showToast('Please select both start date and end date.', 'error');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      showToast('Start date cannot be after end date.', 'error');
      return;
    }

    if (!reason.trim()) {
      showToast('Please enter the reason for your leave request.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (reapplyTarget) {
        await leaveService.reapplyLeaveRequest({
          previousLeaveId: reapplyTarget.id,
          employee: currentUser,
          leaveType,
          durationType,
          startDate,
          endDate,
          reason,
          contactNumberDuringLeave: contactNumber,
          handoverNotes
        });
        showToast('Leave application re-submitted successfully to Super Admin!');
        setReapplyTarget(null);
      } else {
        await leaveService.createLeaveRequest({
          employee: currentUser,
          leaveType,
          durationType,
          startDate,
          endDate,
          reason,
          contactNumberDuringLeave: contactNumber,
          handoverNotes
        });
        showToast('Leave application submitted successfully to Super Admin!');
      }

      // Reset form
      setReason('');
      setHandoverNotes('');
      setStartDate('');
      setEndDate('');
      await loadRequests();
      setActiveTab('my_applications');
    } catch (err: any) {
      console.error('Error submitting leave:', err);
      showToast(err?.message || 'Failed to submit leave application', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredRequests = myRequests.filter(req => {
    if (statusFilter === 'all') return true;
    return req.status === statusFilter;
  });

  const approvedRequests = myRequests.filter(req => req.status === 'approved');
  const pendingRequests = myRequests.filter(req => req.status === 'pending');
  const rejectedRequests = myRequests.filter(req => req.status === 'rejected');

  const formatLeaveTypeLabel = (type: string) => {
    switch (type) {
      case 'casual': return 'Casual Leave';
      case 'sick': return 'Sick / Medical Leave';
      case 'earned': return 'Earned / Privilege Leave';
      case 'emergency': return 'Emergency Leave';
      case 'maternity_paternity': return 'Maternity / Paternity';
      case 'compensatory': return 'Compensatory Off';
      default: return 'Other Leave';
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

      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 bg-emerald-500/20 px-3 py-1 rounded-full text-emerald-200 text-xs font-bold border border-emerald-400/30">
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Employee Self-Service Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Leave Application System</h1>
            <p className="text-xs sm:text-sm text-emerald-100 max-w-2xl leading-relaxed">
              Submit your leave applications directly to Super Admin. Approved applications generate an official verifiable
              sanction letter, and rejected requests can be revised and reapplied with one click.
            </p>
          </div>

          {currentUser && (
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 text-xs space-y-1.5 shrink-0 min-w-[220px]">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-full bg-emerald-400/30 border border-emerald-300 flex items-center justify-center font-black text-emerald-200 text-xs">
                  {currentUser.fullName[0]}
                </div>
                <div>
                  <p className="font-extrabold text-white">{currentUser.fullName}</p>
                  <p className="text-[10px] text-emerald-200 uppercase tracking-wider">{currentRole.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="pt-1.5 border-t border-white/10 text-[11px] text-emerald-100 space-y-0.5">
                <p>Phone: {currentUser.phone || 'N/A'}</p>
                <p>ID: {currentUser.id.substring(0, 12)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-white/15">
          <button
            onClick={() => setActiveTab('apply')}
            type="button"
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'apply'
                ? 'bg-white text-emerald-800 shadow-md scale-102'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>{reapplyTarget ? 'Reapply for Leave' : 'Apply for Leave'}</span>
            {reapplyTarget && (
              <span className="bg-rose-500 text-white px-1.5 py-0.2 rounded-full text-[9px]">Reapply</span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('my_applications')}
            type="button"
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'my_applications'
                ? 'bg-white text-emerald-800 shadow-md scale-102'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>My Applications</span>
            <span className="bg-emerald-950/60 text-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {myRequests.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('approved_letters')}
            type="button"
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'approved_letters'
                ? 'bg-white text-emerald-800 shadow-md scale-102'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Approved Letters</span>
            {approvedRequests.length > 0 && (
              <span className="bg-emerald-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
                {approvedRequests.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Overview Stat Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-slate-100 rounded-lg text-slate-700">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Total Applied</p>
            <p className="text-xl font-black text-slate-800">{myRequests.length}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-amber-50 rounded-lg text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Pending Review</p>
            <p className="text-xl font-black text-amber-600">{pendingRequests.length}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Approved (Letter Issued)</p>
            <p className="text-xl font-black text-emerald-600">{approvedRequests.length}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 bg-rose-50 rounded-lg text-rose-600">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Rejected (Reapply Available)</p>
            <p className="text-xl font-black text-rose-600">{rejectedRequests.length}</p>
          </div>
        </div>
      </div>

      {/* TAB 1: APPLY FOR LEAVE / REAPPLY */}
      {activeTab === 'apply' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {reapplyTarget && (
            <div className="bg-amber-50 border-b border-amber-200 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start space-x-3">
                <RotateCcw className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                    Reapplying for Leave Application #{reapplyTarget.leaveNumber}
                  </h4>
                  <p className="text-xs text-amber-800 mt-0.5">
                    <strong>Previous Rejection Reason:</strong> {reapplyTarget.rejectionReason}
                  </p>
                  <p className="text-[11px] text-amber-700 mt-1">
                    You can update the dates, adjust duration, or provide an updated explanation before submitting to Super Admin.
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancelReapply}
                type="button"
                className="text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 px-3 py-1.5 rounded-lg shrink-0 cursor-pointer"
              >
                Cancel Reapply & Start Fresh
              </button>
            </div>
          )}

          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between pb-6 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-extrabold text-slate-800">
                  {reapplyTarget ? 'Submit Revised Leave Application' : 'New Leave Application Form'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Direct submission to Super Admin. Please ensure all details are accurate.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600">
                Approver: Super Admin
              </span>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              {/* Leave Type & Duration Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Leave Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="casual">Casual Leave (CL)</option>
                    <option value="sick">Sick / Medical Leave (SL)</option>
                    <option value="earned">Earned / Privilege Leave (PL)</option>
                    <option value="emergency">Emergency Leave</option>
                    <option value="compensatory">Compensatory Off (Comp-Off)</option>
                    <option value="maternity_paternity">Maternity / Paternity Leave</option>
                    <option value="other">Other Special Leave</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Duration Breakdown <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setDurationType('full_day')}
                      className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                        durationType === 'full_day'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Full Day
                    </button>
                    <button
                      type="button"
                      onClick={() => setDurationType('first_half')}
                      className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                        durationType === 'first_half'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      1st Half (0.5)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDurationType('second_half')}
                      className={`py-2 px-2 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                        durationType === 'second_half'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      2nd Half (0.5)
                    </button>
                  </div>
                </div>
              </div>

              {/* Start Date & End Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Commencing Date (From) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (!endDate || e.target.value > endDate) {
                        setEndDate(e.target.value);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Concluding Date (To) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={startDate}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Calculated Leave Days
                  </label>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2 text-xs flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-700 block">Total Days</span>
                      <span className="text-base font-black text-emerald-800">{calculatedDays} Day(s)</span>
                    </div>
                    <Calendar className="w-5 h-5 text-emerald-600" />
                  </div>
                </div>
              </div>

              {/* Reason For Leave */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Detailed Reason for Leave <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Clearly explain the reason for taking leave (e.g. personal family event, medical rest, emergency travel)..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
                ></textarea>
              </div>

              {/* Additional Contact and Handover Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Emergency Contact Number During Leave
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="tel"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Super Admin can reach you here if urgent site assistance is required.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Work Handover / Backup Colleague (Optional)
                  </label>
                  <input
                    type="text"
                    value={handoverNotes}
                    onChange={(e) => setHandoverNotes(e.target.value)}
                    placeholder="e.g. Handed over pending survey of Site 14 to Ramesh"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                {reapplyTarget && (
                  <button
                    type="button"
                    onClick={handleCancelReapply}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-md flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Submitting Request...</span>
                    </>
                  ) : reapplyTarget ? (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Submit Revised Leave Request</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Leave Application to Super Admin</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: MY APPLICATIONS LIST */}
      {activeTab === 'my_applications' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-700">Filter By Status:</span>
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'pending', 'approved', 'rejected'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    type="button"
                    className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st} {st === 'pending' && `(${pendingRequests.length})`}
                    {st === 'approved' && `(${approvedRequests.length})`}
                    {st === 'rejected' && `(${rejectedRequests.length})`}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setReapplyTarget(null);
                setActiveTab('apply');
              }}
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Leave Request</span>
            </button>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400 space-y-3">
              <CalendarDays className="w-12 h-12 mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-700">No Leave Applications Found</h3>
              <p className="text-xs max-w-sm mx-auto">
                {statusFilter === 'all'
                  ? 'You have not submitted any leave applications yet. Click "Apply for Leave" above to get started.'
                  : `No leave applications matching status "${statusFilter}".`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRequests.map(req => {
                const isApproved = req.status === 'approved';
                const isRejected = req.status === 'rejected';
                const isPending = req.status === 'pending';

                return (
                  <div
                    key={req.id}
                    className={`bg-white rounded-2xl border p-5 transition-all shadow-xs hover:shadow-md flex flex-col justify-between ${
                      isApproved
                        ? 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/20'
                        : isRejected
                        ? 'border-rose-200 bg-gradient-to-br from-white to-rose-50/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Top Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs font-black text-slate-800">{req.leaveNumber}</span>
                            {req.reapplicationCount && req.reapplicationCount > 0 ? (
                              <span className="bg-amber-100 text-amber-800 text-[9px] font-extrabold px-1.5 py-0.2 rounded">
                                Reapplied (v{req.reapplicationCount + 1})
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs font-bold text-slate-600 mt-0.5">{formatLeaveTypeLabel(req.leaveType)}</p>
                        </div>

                        {/* Status Badge */}
                        {isApproved && (
                          <span className="inline-flex items-center space-x-1 bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-xs font-extrabold border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Approved</span>
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center space-x-1 bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-xs font-extrabold border border-amber-200">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>Pending Super Admin</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center space-x-1 bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full text-xs font-extrabold border border-rose-200">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Rejected</span>
                          </span>
                        )}
                      </div>

                      {/* Dates and Duration */}
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Dates:</span>
                          <span className="font-bold text-slate-800">
                            {new Date(req.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - {new Date(req.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Duration:</span>
                          <span className="font-black text-emerald-700">
                            {req.totalDays} Day(s) ({req.durationType === 'full_day' ? 'Full Day' : 'Half Day'})
                          </span>
                        </div>
                      </div>

                      {/* Reason */}
                      <div className="text-xs text-slate-600">
                        <strong className="text-slate-700">Reason: </strong>
                        <span>{req.reason}</span>
                      </div>

                      {/* Rejected Alert Callout with Reapply CTA */}
                      {isRejected && (
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs space-y-1.5">
                          <div className="flex items-center space-x-1.5 text-rose-800 font-bold">
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>Super Admin Remarks:</span>
                          </div>
                          <p className="text-rose-700 text-xs pl-5.5 italic">
                            "{req.rejectionReason || 'No specific remarks provided by Super Admin.'}"
                          </p>
                          <div className="pt-2 pl-5.5">
                            <button
                              onClick={() => handleStartReapply(req)}
                              type="button"
                              className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reapply for Leave</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Approved Letter Callout */}
                      {isApproved && (
                        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5 text-emerald-800 font-bold">
                              <ShieldCheck className="w-4 h-4 text-emerald-600" />
                              <span>Approval Sanction Letter Generated</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-emerald-700">
                              {req.approvalReferenceNumber}
                            </span>
                          </div>
                          {req.approvalRemarks && (
                            <p className="text-[11px] text-emerald-700 italic">
                              "{req.approvalRemarks}"
                            </p>
                          )}
                          <div className="pt-1">
                            <button
                              onClick={() => setSelectedLetterRequest(req)}
                              type="button"
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 rounded-lg flex items-center justify-center space-x-1.5 shadow-xs transition-all cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>View & Print Official Approval Letter</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 mt-3">
                      <span>Applied: {new Date(req.appliedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      <span>Reviewer: Super Admin</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: APPROVED LETTERS DEDICATED PANEL */}
      {activeTab === 'approved_letters' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div>
              <h2 className="text-base font-extrabold text-slate-800 flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Official Approved Sanction Letters</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Official certified letters generated upon Super Admin approval. Valid for audits and travel passes.
              </p>
            </div>
            <div className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              Total Approved: {approvedRequests.length}
            </div>
          </div>

          {approvedRequests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400 space-y-3">
              <FileCheck2 className="w-12 h-12 mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-700">No Approved Letters Issued Yet</h3>
              <p className="text-xs max-w-sm mx-auto">
                Once Super Admin reviews and approves your submitted leave application, an official signed approval letter will be generated here automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {approvedRequests.map(req => (
                <div
                  key={req.id}
                  className="bg-white rounded-2xl border border-emerald-200 shadow-xs hover:shadow-md p-5 flex flex-col justify-between space-y-4 transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700">
                        <FileCheck2 className="w-6 h-6" />
                      </div>
                      <span className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                        {req.approvalReferenceNumber || 'GES-SANCTION'}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900">{formatLeaveTypeLabel(req.leaveType)}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Duration: <strong className="text-emerald-700">{req.totalDays} Day(s)</strong>
                      </p>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs space-y-1">
                      <p className="text-slate-600">
                        <span className="text-slate-400">Valid Period: </span>
                        <strong>{new Date(req.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</strong> to{' '}
                        <strong>{new Date(req.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Approved By: {req.reviewedByUserName || 'Super Admin'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedLetterRequest(req)}
                    type="button"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2.5 rounded-xl flex items-center justify-center space-x-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>View & Print Approval Letter</span>
                  </button>
                </div>
              ))}
            </div>
          )}
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
