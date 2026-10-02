import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { expenseService, resolveExpenseReceiptUrl, normalizeReceiptUrl } from '../../services/expenseService';
import type { ExpenseClaim, ExpenseCategory } from '../../types';
import { BillProofPreviewModal } from '../../components/Expenses/BillProofPreviewModal';
import {
  Receipt,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Check,
  X,
  Filter,
  Trash2,
  Calendar,
  AlertCircle,
  ShieldCheck,
  Building2,
  DollarSign,
  FileText,
  User,
  RefreshCw,
  TrendingUp,
  Download
} from 'lucide-react';

export const Expenses: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals
  const [selectedProofClaim, setSelectedProofClaim] = useState<ExpenseClaim | null>(null);
  const [approvingClaim, setApprovingClaim] = useState<ExpenseClaim | null>(null);
  const [approvedAmount, setApprovedAmount] = useState('');
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [rejectingClaim, setRejectingClaim] = useState<ExpenseClaim | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionProcessing, setActionProcessing] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadClaims = async () => {
    setLoading(true);
    try {
      const list = await expenseService.getAllExpenses();
      setClaims(list);
    } catch (err) {
      console.error('Error loading expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClaims();
    const handleRealtime = () => loadClaims();
    window.addEventListener('app-realtime-update', handleRealtime);
    window.addEventListener('storage', handleRealtime);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('ges_crm_realtime');
      bc.onmessage = () => loadClaims();
    } catch (_) {}

    return () => {
      window.removeEventListener('app-realtime-update', handleRealtime);
      window.removeEventListener('storage', handleRealtime);
      if (bc) bc.close();
    };
  }, []);

  const handleOpenApproveModal = (claim: ExpenseClaim) => {
    setApprovingClaim(claim);
    setApprovedAmount(String(claim.amount));
    setApprovalRemarks('Expense receipt verified and approved for company reimbursement.');
  };

  const handleConfirmApprove = async () => {
    if (!approvingClaim || !currentUser) return;
    const num = parseFloat(approvedAmount);
    if (isNaN(num) || num <= 0) {
      showToast('Please enter a valid approved amount in ₹.', 'error');
      return;
    }

    setActionProcessing(true);
    try {
      await expenseService.approveExpenseClaim({
        expenseId: approvingClaim.id,
        reviewerId: currentUser.id,
        reviewerName: `${currentUser.fullName} (Super Admin)`,
        approvedAmount: num,
        remarks: approvalRemarks
      });
      showToast(`Expense claim #${approvingClaim.expenseNumber} approved successfully for ₹${num.toLocaleString('en-IN')}!`);
      setApprovingClaim(null);
      await loadClaims();
    } catch (err: any) {
      showToast(err?.message || 'Failed to approve expense claim', 'error');
    } finally {
      setActionProcessing(false);
    }
  };

  const handleOpenRejectModal = (claim: ExpenseClaim) => {
    setRejectingClaim(claim);
    setRejectionReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectingClaim || !currentUser) return;
    if (!rejectionReason.trim()) {
      showToast('Please provide specific remarks explaining why this expense is rejected.', 'error');
      return;
    }

    setActionProcessing(true);
    try {
      await expenseService.rejectExpenseClaim({
        expenseId: rejectingClaim.id,
        reviewerId: currentUser.id,
        reviewerName: `${currentUser.fullName} (Super Admin)`,
        rejectionReason: rejectionReason.trim()
      });
      showToast(`Expense #${rejectingClaim.expenseNumber} rejected. Employee has been notified with your remarks and given reapply option.`);
      setRejectingClaim(null);
      await loadClaims();
    } catch (err: any) {
      showToast(err?.message || 'Failed to reject expense claim', 'error');
    } finally {
      setActionProcessing(false);
    }
  };

  const handleDelete = async (claim: ExpenseClaim) => {
    if (confirm(`Are you sure you want to permanently delete expense record #${claim.expenseNumber} (${claim.title})?`)) {
      await expenseService.deleteExpenseClaim(claim.id);
      showToast('Expense record deleted.');
      await loadClaims();
    }
  };

  // Grand Super Admin calculations (across all employees)
  const totalCompanyAmount = claims.reduce((s, c) => s + c.amount, 0);
  const approvedTotalAmount = claims
    .filter(c => c.status === 'approved')
    .reduce((s, c) => s + (c.approvedAmount !== undefined ? c.approvedAmount : c.amount), 0);
  const pendingTotalAmount = claims
    .filter(c => c.status === 'pending')
    .reduce((s, c) => s + c.amount, 0);
  const rejectedTotalAmount = claims
    .filter(c => c.status === 'rejected')
    .reduce((s, c) => s + c.amount, 0);

  const pendingCount = claims.filter(c => c.status === 'pending').length;
  const approvedCount = claims.filter(c => c.status === 'approved').length;
  const rejectedCount = claims.filter(c => c.status === 'rejected').length;

  const filteredClaims = claims.filter(claim => {
    // Status filter
    if (statusFilter !== 'all' && claim.status !== statusFilter) return false;

    // Role filter
    if (roleFilter !== 'all' && claim.employeeRole !== roleFilter) return false;

    // Category filter
    if (categoryFilter !== 'all' && claim.category !== categoryFilter) return false;

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = claim.employeeName?.toLowerCase().includes(q) || false;
      const matchPhone = claim.employeePhone ? claim.employeePhone.includes(q) : false;
      const matchNum = claim.expenseNumber?.toLowerCase().includes(q) || false;
      const matchTitle = claim.title?.toLowerCase().includes(q) || false;
      const matchProj = claim.associatedProject?.toLowerCase().includes(q) || false;
      if (!matchName && !matchPhone && !matchNum && !matchTitle && !matchProj) return false;
    }

    return true;
  });

  const formatCategoryLabel = (cat: ExpenseCategory) => {
    switch (cat) {
      case 'travel': return 'Travel / Conveyance';
      case 'fuel': return 'Fuel / Petrol';
      case 'food': return 'Food & Refreshment';
      case 'tools_hardware': return 'Site Tools & Hardware';
      case 'stay_hotel': return 'Hotel / Lodging';
      case 'client_meeting': return 'Client Meeting';
      case 'courier_postage': return 'Courier & Postage';
      case 'printing_stationery': return 'Printing & Stationery';
      case 'emergency_repair': return 'Emergency Site Repair';
      default: return 'Other Expense';
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
              <span>Super Admin • Financial Audit & Approvals</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Company Expense Management</h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Complete company-wide expense oversight. Review receipt bill proofs uploaded by Field Engineers, Admins, and Staff,
              sanction reimbursements, and provide clear rejection guidance with reapply tracking.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={loadClaims}
              type="button"
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3.5 py-2 rounded-xl border border-white/20 flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Expenses</span>
            </button>
            <Link
              to="/expense-tracker"
              className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition-colors shadow-sm"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Submit Claim</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Grand Financial Stats Cards (Super Admin sees total for all staff) */}
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
            Total Company Claims
          </p>
          <p className="text-2xl font-black mt-1">₹{totalCompanyAmount.toLocaleString('en-IN')}</p>
          <p className={`text-[10px] mt-0.5 ${statusFilter === 'all' ? 'text-slate-300' : 'text-slate-400'}`}>
            {claims.length} Total Bills
          </p>
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
              Pending Approvals
            </p>
            {pendingCount > 0 && (
              <span className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping"></span>
            )}
          </div>
          <p className={`text-2xl font-black mt-1 ${statusFilter === 'pending' ? 'text-white' : 'text-amber-600'}`}>
            ₹{pendingTotalAmount.toLocaleString('en-IN')}
          </p>
          <p className={`text-[10px] mt-0.5 ${statusFilter === 'pending' ? 'text-amber-100' : 'text-amber-600/80'}`}>
            {pendingCount} Bills Awaiting Verification
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
            Approved Sanctions
          </p>
          <p className={`text-2xl font-black mt-1 ${statusFilter === 'approved' ? 'text-white' : 'text-emerald-600'}`}>
            ₹{approvedTotalAmount.toLocaleString('en-IN')}
          </p>
          <p className={`text-[10px] mt-0.5 ${statusFilter === 'approved' ? 'text-emerald-100' : 'text-emerald-600/80'}`}>
            {approvedCount} Claims Sanctioned
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
            Rejected Claims
          </p>
          <p className={`text-2xl font-black mt-1 ${statusFilter === 'rejected' ? 'text-white' : 'text-rose-600'}`}>
            ₹{rejectedTotalAmount.toLocaleString('en-IN')}
          </p>
          <p className={`text-[10px] mt-0.5 ${statusFilter === 'rejected' ? 'text-rose-100' : 'text-rose-600/80'}`}>
            {rejectedCount} Rejected
          </p>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search employee, phone, expense #, title..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Chips */}
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
            <option value="field_employee">Field Employees</option>
            <option value="admin">Admins</option>
            <option value="inventory_manager">Inventory Managers</option>
            <option value="dealer">Dealers</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="travel">Travel</option>
            <option value="fuel">Fuel / Petrol</option>
            <option value="food">Food</option>
            <option value="tools_hardware">Site Tools</option>
            <option value="stay_hotel">Hotel / Stay</option>
            <option value="emergency_repair">Emergency Spares</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Claims List */}
      {filteredClaims.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400 space-y-3">
          <Receipt className="w-12 h-12 mx-auto text-slate-300" />
          <h3 className="text-sm font-bold text-slate-700">No Expense Claims Found</h3>
          <p className="text-xs max-w-sm mx-auto">
            {searchTerm
              ? `No expense claims matching "${searchTerm}". Try resetting filters.`
              : 'No staff expense claims matching the selected status or role filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredClaims.map(claim => {
            const isApproved = claim.status === 'approved';
            const isPending = claim.status === 'pending';
            const isRejected = claim.status === 'rejected';
            const hasProof = Boolean(claim.billProofUrl || claim.billProofBlob);

            return (
              <div
                key={claim.id}
                className={`bg-white rounded-2xl border p-5 transition-all shadow-xs hover:shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 ${
                  isApproved
                    ? 'border-emerald-200 bg-emerald-50/10'
                    : isRejected
                    ? 'border-rose-200 bg-rose-50/10'
                    : 'border-amber-200 bg-amber-50/10'
                }`}
              >
                {/* Left: Employee info & expense details */}
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-md">
                      {claim.expenseNumber}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      {claim.employeeRole.replace('_', ' ')}
                    </span>
                    {claim.reapplicationCount && claim.reapplicationCount > 0 ? (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                        Revised (v{claim.reapplicationCount + 1})
                      </span>
                    ) : null}

                    {/* Status Badge */}
                    {isApproved && (
                      <span className="inline-flex items-center space-x-1 bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-xs font-extrabold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Approved</span>
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex items-center space-x-1 bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-xs font-extrabold animate-pulse">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Awaiting Verification</span>
                      </span>
                    )}
                    {isRejected && (
                      <span className="inline-flex items-center space-x-1 bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full text-xs font-extrabold">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Rejected</span>
                      </span>
                    )}
                  </div>

                  {/* Employee Name & Title */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-base font-extrabold text-slate-900">{claim.employeeName}</span>
                    <span className="text-xs text-slate-500 font-medium">Phone: {claim.employeePhone}</span>
                    <span className="text-xs text-slate-500 font-medium">
                      Date: {new Date(claim.expenseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>

                  {/* Title & Category Details */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="bg-white border border-slate-200 px-3 py-1 rounded-lg">
                      <span className="text-slate-400 font-medium">Purpose: </span>
                      <strong className="text-slate-900">{claim.title}</strong>
                    </div>
                    <div className="bg-white border border-slate-200 px-3 py-1 rounded-lg">
                      <span className="text-slate-400 font-medium">Category: </span>
                      <strong className="text-slate-700">{formatCategoryLabel(claim.category)}</strong>
                    </div>
                    {claim.associatedProject && (
                      <div className="bg-white border border-slate-200 px-3 py-1 rounded-lg">
                        <span className="text-slate-400 font-medium">Project: </span>
                        <strong className="text-slate-700">{claim.associatedProject}</strong>
                      </div>
                    )}
                  </div>

                  {/* Description / Notes */}
                  {claim.description && (
                    <div className="bg-white/80 border border-slate-200/80 rounded-xl p-2.5 text-xs text-slate-700 italic">
                      "{claim.description}"
                    </div>
                  )}

                  {/* Approved notes */}
                  {isApproved && (
                    <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between">
                      <div>
                        <strong>Sanction Remarks: </strong>
                        <span>{claim.approvalRemarks}</span>
                      </div>
                      <span className="font-mono text-[10px] font-bold shrink-0 ml-2">Voucher: {claim.voucherNumber}</span>
                    </div>
                  )}

                  {/* Rejected notes */}
                  {isRejected && (
                    <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                      <strong>Rejection Reason: </strong>
                      <span>{claim.rejectionReason}</span>
                    </div>
                  )}
                </div>

                {/* Right: Bill Proof & Action buttons */}
                <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 shrink-0 w-full lg:w-auto">
                  {/* Amount Badge */}
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Claim Amount</span>
                    <span className="text-xl font-black text-emerald-700">
                      ₹{claim.amount.toLocaleString('en-IN')}
                    </span>
                    {claim.approvedAmount !== undefined && claim.approvedAmount !== claim.amount && (
                      <span className="text-[10px] text-emerald-600 block">
                        Sanctioned: ₹{claim.approvedAmount.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>

                  {/* Bill Proof Thumbnail / Preview Button */}
                  {hasProof ? (
                    <div className="flex items-center space-x-2">
                      <div
                        onClick={() => setSelectedProofClaim(claim)}
                        className="w-10 h-10 rounded-lg overflow-hidden border border-slate-300 bg-slate-100 cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all shrink-0 flex items-center justify-center shadow-xs"
                        title="Click to zoom & inspect bill proof"
                      >
                        <img
                          src={resolveExpenseReceiptUrl(claim)}
                          alt="Receipt thumbnail"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (claim.billProofBlob && target.src !== claim.billProofBlob) {
                              target.src = normalizeReceiptUrl(claim.billProofBlob);
                            }
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedProofClaim(claim)}
                        className="bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg border border-slate-200 flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Inspect Bill</span>
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">No bill proof attached</span>
                  )}

                  {/* Super Admin Action Buttons */}
                  {isPending && (
                    <div className="flex items-center space-x-2 w-full lg:w-auto">
                      <button
                        type="button"
                        onClick={() => handleOpenApproveModal(claim)}
                        className="flex-1 lg:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>Approve Bill</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenRejectModal(claim)}
                        className="flex-1 lg:flex-none bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>Reject with Remarks</span>
                      </button>
                    </div>
                  )}

                  {isRejected && (
                    <button
                      type="button"
                      onClick={() => handleOpenApproveModal(claim)}
                      className="text-xs font-bold text-slate-600 hover:text-emerald-700 bg-slate-100 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Reconsider & Approve
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(claim)}
                    className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors self-end cursor-pointer"
                    title="Delete Expense Record"
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
      {approvingClaim && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-in">
            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
              <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Sanction Expense Reimbursement</h3>
                <p className="text-xs text-slate-500">
                  {approvingClaim.expenseNumber} • {approvingClaim.employeeName}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 text-xs space-y-1.5 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Claim Purpose:</span>
                <span className="font-extrabold text-slate-800">{approvingClaim.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Category:</span>
                <span className="font-bold text-slate-800">{formatCategoryLabel(approvingClaim.category)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Submitted Amount:</span>
                <span className="font-black text-emerald-700 text-sm">₹{approvingClaim.amount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Approved Amount Field */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Sanctioned Approved Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                min="1"
                required
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-black text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                You can adjust this amount in case of partial bill sanction according to company policy.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Approval Sanction Remarks
              </label>
              <textarea
                rows={2}
                value={approvalRemarks}
                onChange={(e) => setApprovalRemarks(e.target.value)}
                placeholder="Enter reimbursement voucher remarks (e.g. Approved with original GST bill)..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              ></textarea>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setApprovingClaim(null)}
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
                    <span>Confirm & Sanction Reimbursement</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectingClaim && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-scale-in">
            <div className="flex items-center space-x-3 pb-4 border-b border-slate-100">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Reject Expense Claim</h3>
                <p className="text-xs text-slate-500">
                  {rejectingClaim.expenseNumber} • {rejectingClaim.employeeName}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 text-xs space-y-1 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Purpose:</span>
                <span className="font-bold text-slate-800">{rejectingClaim.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Claim Amount:</span>
                <span className="font-black text-rose-700">₹{rejectingClaim.amount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Rejection Reason & Feedback Remarks <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this expense is rejected (e.g. Receipt image is blurry / GST invoice missing / unauthorized personal expense). The employee will receive this reason and can reapply with valid proof."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
              ></textarea>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900">
              <strong>Employee Reapply Enabled:</strong> Rejecting will provide this explanation to the employee and activate
              their <em>Reapply</em> button so they can upload a clearer bill or correct the amount.
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingClaim(null)}
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

      {/* Bill Proof Preview Modal */}
      <BillProofPreviewModal
        isOpen={Boolean(selectedProofClaim)}
        onClose={() => setSelectedProofClaim(null)}
        claim={selectedProofClaim}
      />
    </div>
  );
};
