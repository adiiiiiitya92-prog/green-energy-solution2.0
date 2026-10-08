import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { expenseService, resolveExpenseReceiptUrl, normalizeReceiptUrl } from '../../services/expenseService';
import type { ExpenseClaim, ExpenseCategory, ExpensePaymentMode } from '../../types';
import { BillProofPreviewModal } from '../../components/Expenses/BillProofPreviewModal';
import {
  Receipt,
  Plus,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  UploadCloud,
  FileText,
  DollarSign,
  AlertCircle,
  Camera,
  Image as ImageIcon,
  Trash2,
  Calendar,
  Filter,
  Eye,
  Info,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

export const ExpenseTracker: React.FC = () => {
  const { currentUser, currentRole } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'submit' | 'my_claims'>('submit');
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Selected for Bill Preview Modal
  const [selectedClaimForPreview, setSelectedClaimForPreview] = useState<ExpenseClaim | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('travel');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<ExpensePaymentMode>('upi_online');
  const [associatedProject, setAssociatedProject] = useState('');
  const [description, setDescription] = useState('');
  const [billProofUrl, setBillProofUrl] = useState('');
  const [billProofBlob, setBillProofBlob] = useState('');

  // Reapply Context
  const [reapplyTarget, setReapplyTarget] = useState<ExpenseClaim | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadClaims = async () => {
    if (!currentUser) return;
    const list = await expenseService.getExpensesByEmployee(currentUser.id);
    setClaims(list);
  };

  useEffect(() => {
    loadClaims();
    let debounceTimer: any = null;
    const triggerDebouncedLoad = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadClaims();
      }, 1500);
    };

    const handleRealtime = (e?: any) => {
      const col = e?.detail?.collectionName;
      if (col && col !== 'expenses') return;
      triggerDebouncedLoad();
    };

    window.addEventListener('app-realtime-update', handleRealtime);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('ges_crm_realtime');
      bc.onmessage = () => triggerDebouncedLoad();
    } catch (_) {}

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('app-realtime-update', handleRealtime);
      if (bc) bc.close();
    };
  }, [currentUser]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (JPG, PNG, WebP) of your receipt.', 'error');
      return;
    }

    // Instant local preview so user sees the bill immediately
    const instantPreviewUrl = URL.createObjectURL(file);
    setBillProofBlob(instantPreviewUrl);

    setIsUploadingImage(true);
    try {
      const uploadRes = await expenseService.uploadReceiptImage(file);
      setBillProofUrl(uploadRes.url);
      setBillProofBlob(uploadRes.base64);
      showToast('Receipt bill uploaded successfully!');
    } catch (err: any) {
      console.error('Receipt upload error:', err);
      showToast('Failed to process receipt image. Please try again.', 'error');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleStartReapply = (claim: ExpenseClaim) => {
    setReapplyTarget(claim);
    setTitle(claim.title);
    setCategory(claim.category);
    setAmount(String(claim.amount));
    setExpenseDate(claim.expenseDate);
    setPaymentMode(claim.paymentMode);
    setAssociatedProject(claim.associatedProject || '');
    setDescription(claim.description || '');
    setBillProofUrl(claim.billProofUrl || '');
    setBillProofBlob(claim.billProofBlob || '');
    setActiveTab('submit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelReapply = () => {
    setReapplyTarget(null);
    setTitle('');
    setAmount('');
    setDescription('');
    setAssociatedProject('');
    setBillProofUrl('');
    setBillProofBlob('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('You must be logged in to submit an expense claim.', 'error');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Please enter a valid expense amount in ₹.', 'error');
      return;
    }

    if (!title.trim()) {
      showToast('Please enter an expense title / purpose.', 'error');
      return;
    }

    if (!expenseDate) {
      showToast('Please select the date the expense was incurred.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (reapplyTarget) {
        await expenseService.reapplyExpenseClaim({
          previousExpenseId: reapplyTarget.id,
          employee: currentUser,
          title,
          category,
          amount: numAmount,
          expenseDate,
          paymentMode,
          associatedProject,
          description,
          billProofUrl,
          billProofBlob
        });
        showToast('Expense claim revised and resubmitted to Super Admin!');
        setReapplyTarget(null);
      } else {
        await expenseService.createExpenseClaim({
          employee: currentUser,
          title,
          category,
          amount: numAmount,
          expenseDate,
          paymentMode,
          associatedProject,
          description,
          billProofUrl,
          billProofBlob
        });
        showToast('Expense claim submitted successfully to Super Admin!');
      }

      // Reset form
      setTitle('');
      setAmount('');
      setDescription('');
      setAssociatedProject('');
      setBillProofUrl('');
      setBillProofBlob('');
      await loadClaims();
      setActiveTab('my_claims');
    } catch (err: any) {
      console.error('Error submitting expense claim:', err);
      showToast(err?.message || 'Failed to submit expense claim', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculations for THIS employee only
  const totalClaimedAmount = claims.reduce((s, c) => s + c.amount, 0);
  const totalApprovedAmount = claims
    .filter(c => c.status === 'approved')
    .reduce((s, c) => s + (c.approvedAmount !== undefined ? c.approvedAmount : c.amount), 0);
  const totalPendingAmount = claims
    .filter(c => c.status === 'pending')
    .reduce((s, c) => s + c.amount, 0);
  const totalRejectedAmount = claims
    .filter(c => c.status === 'rejected')
    .reduce((s, c) => s + c.amount, 0);

  const filteredClaims = claims.filter(c => {
    if (statusFilter === 'all') return true;
    return c.status === statusFilter;
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

  const formatPaymentMode = (mode: ExpensePaymentMode) => {
    switch (mode) {
      case 'upi_online': return 'UPI / Online';
      case 'cash': return 'Cash';
      case 'bank_transfer': return 'Bank Transfer';
      case 'credit_debit_card': return 'Card';
      default: return mode;
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
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 bg-emerald-500/20 px-3 py-1 rounded-full text-emerald-200 text-xs font-bold border border-emerald-400/30">
              <Receipt className="w-3.5 h-3.5" />
              <span>Staff Expense & Reimbursement Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Expense Tracker</h1>
            <p className="text-xs sm:text-sm text-emerald-100 max-w-2xl leading-relaxed">
              Upload and claim your official expenses with bill proof. All claims are securely reviewed by Super Admin.
              Track your claim status in real-time and easily reapply if any bill clarification is requested.
            </p>
          </div>

          {currentUser && (
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 text-xs space-y-1.5 shrink-0 min-w-[220px]">
              <p className="text-[10px] text-emerald-300 font-extrabold uppercase tracking-wider">Employee Profile</p>
              <p className="text-sm font-extrabold text-white">{currentUser.fullName}</p>
              <div className="pt-1.5 border-t border-white/10 text-[11px] text-emerald-100 flex items-center justify-between">
                <span>Role: <strong>{(currentRole || 'user').replace(/_/g, ' ').toUpperCase()}</strong></span>
                <span>Phone: {currentUser.phone || 'N/A'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-white/15">
          <button
            onClick={() => setActiveTab('submit')}
            type="button"
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'submit'
                ? 'bg-white text-emerald-800 shadow-md scale-102'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{reapplyTarget ? 'Reapply Expense Claim' : 'Submit New Expense'}</span>
            {reapplyTarget && (
              <span className="bg-rose-500 text-white px-1.5 py-0.2 rounded-full text-[9px]">Reapply</span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('my_claims')}
            type="button"
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'my_claims'
                ? 'bg-white text-emerald-800 shadow-md scale-102'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>My Claims & History</span>
            <span className="bg-emerald-950/60 text-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {claims.length}
            </span>
          </button>
        </div>
      </div>

      {/* Personal Summary Stat Cards (Employee's Own Total Only) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-medium text-slate-400">Total Claimed</p>
          <p className="text-xl font-black text-slate-900 mt-1">₹{totalClaimedAmount.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{claims.length} Claim(s)</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-medium text-amber-500">Pending Review</p>
          <p className="text-xl font-black text-amber-600 mt-1">₹{totalPendingAmount.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-amber-600/80 mt-0.5">
            {claims.filter(c => c.status === 'pending').length} Under Review
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-medium text-emerald-600">Approved Amount</p>
          <p className="text-xl font-black text-emerald-700 mt-1">₹{totalApprovedAmount.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-emerald-600/80 mt-0.5">
            {claims.filter(c => c.status === 'approved').length} Approved
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-[11px] font-medium text-rose-500">Rejected (Reapply)</p>
          <p className="text-xl font-black text-rose-600 mt-1">₹{totalRejectedAmount.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-rose-600/80 mt-0.5">
            {claims.filter(c => c.status === 'rejected').length} Needs Revision
          </p>
        </div>
      </div>

      {/* TAB 1: SUBMIT NEW EXPENSE / REAPPLY */}
      {activeTab === 'submit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {reapplyTarget && (
            <div className="bg-amber-50 border-b border-amber-200 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start space-x-3">
                <RotateCcw className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                    Reapplying for Expense Claim #{reapplyTarget.expenseNumber}
                  </h4>
                  <p className="text-xs text-amber-800 mt-0.5">
                    <strong>Super Admin Rejection Reason:</strong> {reapplyTarget.rejectionReason}
                  </p>
                  <p className="text-[11px] text-amber-700 mt-1">
                    You can replace the bill proof image, adjust the claim amount, or provide additional details before re-submitting to Super Admin.
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
                  {reapplyTarget ? 'Submit Revised Expense Claim' : 'Record Official Expense'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Attach receipt or invoice bill image for fast Super Admin sanction and reimbursement.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600">
                Approver: Super Admin
              </span>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              {/* Title & Category */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Expense Title / Purpose <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Travel to Satara Solar Site, Tool purchase for installation"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Expense Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="travel">Travel / Conveyance (Bus, Train, Auto, Taxi)</option>
                    <option value="fuel">Fuel / Petrol / Diesel for Site Vehicle</option>
                    <option value="food">Food & Daily Refreshment Allowance</option>
                    <option value="tools_hardware">Site Tools & Hardware Materials</option>
                    <option value="stay_hotel">Hotel / Lodging During Outstation Visit</option>
                    <option value="client_meeting">Client Meeting & Hospitality</option>
                    <option value="courier_postage">Courier, Speedpost & Document Dispatch</option>
                    <option value="printing_stationery">Printing, Photocopy & Stationery</option>
                    <option value="emergency_repair">Emergency Site Repair Spares</option>
                    <option value="other">Other Miscellaneous Official Expense</option>
                  </select>
                </div>
              </div>

              {/* Amount, Expense Date, Payment Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Expense Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs font-extrabold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3.5 py-2.5 text-xs font-black text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Expense Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Payment Mode Used <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as ExpensePaymentMode)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="upi_online">UPI / GPay / PhonePe / Paytm</option>
                    <option value="cash">Cash (Out of Pocket)</option>
                    <option value="bank_transfer">Net Banking / NEFT / IMPS</option>
                    <option value="credit_debit_card">Debit / Credit Card</option>
                  </select>
                </div>
              </div>

              {/* Associated Project / Lead */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Associated Client / Project / Lead (Optional)
                </label>
                <input
                  type="text"
                  value={associatedProject}
                  onChange={(e) => setAssociatedProject(e.target.value)}
                  placeholder="e.g. Ramesh Patil 10kW Rooftop Site, or General Head Office"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Bill Proof Image Upload Area */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Bill / Receipt Proof Image <span className="text-slate-400 font-normal">(Receipt, Invoice, GST Bill or Payment Screenshot)</span>
                </label>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                />

                {billProofUrl || billProofBlob ? (
                  <div className="relative inline-block border-2 border-emerald-500 rounded-2xl overflow-hidden bg-slate-50 shadow-sm p-2">
                    <img
                      src={normalizeReceiptUrl(billProofBlob || billProofUrl)}
                      alt="Bill Proof Preview"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (billProofBlob && target.src !== billProofBlob) {
                          target.src = normalizeReceiptUrl(billProofBlob);
                        }
                      }}
                      className="h-44 w-auto object-contain rounded-xl max-w-full"
                    />
                    <div className="absolute top-3 right-3 flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-slate-900/80 hover:bg-slate-900 text-white p-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        title="Change Image"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBillProofUrl('');
                          setBillProofBlob('');
                        }}
                        className="bg-rose-600/90 hover:bg-rose-600 text-white p-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        title="Remove Image"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/20 rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all space-y-2"
                  >
                    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                      {isUploadingImage ? (
                        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Camera className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {isUploadingImage ? 'Compressing & uploading bill image...' : 'Click to take a photo or upload receipt image'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Supports camera capture on mobile, JPG, PNG or WebP (Auto-compressed)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Description / Additional Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Detailed Notes / Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide any additional context for Super Admin (e.g. why emergency tool was bought on site, client discussion details)..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
                ></textarea>
              </div>

              {/* Actions */}
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
                  disabled={isSubmitting || isUploadingImage}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-md flex items-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Submitting Claim...</span>
                    </>
                  ) : reapplyTarget ? (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Submit Revised Expense Claim</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Expense to Super Admin</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: MY CLAIMS LIST */}
      {activeTab === 'my_claims' && (
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
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setReapplyTarget(null);
                setActiveTab('submit');
              }}
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Expense Claim</span>
            </button>
          </div>

          {filteredClaims.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400 space-y-3">
              <Receipt className="w-12 h-12 mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-700">No Expense Claims Found</h3>
              <p className="text-xs max-w-sm mx-auto">
                {statusFilter === 'all'
                  ? 'You have not submitted any expense claims yet. Click "Submit New Expense" above to record an expense.'
                  : `No claims matching status "${statusFilter}".`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredClaims.map(claim => {
                const isApproved = claim.status === 'approved';
                const isPending = claim.status === 'pending';
                const isRejected = claim.status === 'rejected';
                const hasProof = Boolean(claim.billProofUrl || claim.billProofBlob);

                return (
                  <div
                    key={claim.id}
                    className={`bg-white rounded-2xl border p-5 transition-all shadow-xs hover:shadow-md flex flex-col justify-between ${
                      isApproved
                        ? 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/20'
                        : isRejected
                        ? 'border-rose-200 bg-gradient-to-br from-white to-rose-50/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Top Bar */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs font-black text-slate-800">{claim.expenseNumber}</span>
                            {claim.reapplicationCount && claim.reapplicationCount > 0 ? (
                              <span className="bg-amber-100 text-amber-800 text-[9px] font-extrabold px-1.5 py-0.2 rounded">
                                Revised (v{claim.reapplicationCount + 1})
                              </span>
                            ) : null}
                          </div>
                          <h4 className="text-sm font-extrabold text-slate-900 mt-1">{claim.title}</h4>
                          <p className="text-xs text-slate-500 font-medium">{formatCategoryLabel(claim.category)}</p>
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
                            <span>Under Review</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center space-x-1 bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full text-xs font-extrabold border border-rose-200">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>Rejected</span>
                          </span>
                        )}
                      </div>

                      {/* Amount and Details Grid */}
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Claimed Amount:</span>
                          <span className="text-base font-black text-emerald-700">₹{claim.amount.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block">Expense Date:</span>
                          <span className="font-bold text-slate-800">
                            {new Date(claim.expenseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      </div>

                      {/* Associated Project / Notes */}
                      {claim.associatedProject && (
                        <p className="text-xs text-slate-600">
                          <strong className="text-slate-700">Project / Site:</strong> {claim.associatedProject}
                        </p>
                      )}

                      {claim.description && (
                        <p className="text-xs text-slate-600 italic">
                          "{claim.description}"
                        </p>
                      )}

                      {/* Bill Proof Quick Action */}
                      {hasProof && (
                        <div className="flex items-center space-x-2 pt-1">
                          <div
                            onClick={() => setSelectedClaimForPreview(claim)}
                            className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all shrink-0 flex items-center justify-center"
                            title="Click to view bill proof"
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
                            onClick={() => setSelectedClaimForPreview(claim)}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span>View Uploaded Bill Proof</span>
                          </button>
                        </div>
                      )}

                      {/* Super Admin Rejection Alert & Reapply CTA */}
                      {isRejected && (
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs space-y-1.5">
                          <div className="flex items-center space-x-1.5 text-rose-800 font-bold">
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>Super Admin Remarks:</span>
                          </div>
                          <p className="text-rose-700 text-xs pl-5.5 italic">
                            "{claim.rejectionReason || 'No specific explanation provided by Super Admin.'}"
                          </p>
                          <div className="pt-2 pl-5.5">
                            <button
                              onClick={() => handleStartReapply(claim)}
                              type="button"
                              className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reapply / Resubmit Expense</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Approved Voucher Note */}
                      {isApproved && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-emerald-800 font-bold flex items-center space-x-1">
                              <ShieldCheck className="w-4 h-4 text-emerald-600" />
                              <span>Sanctioned for Reimbursement</span>
                            </span>
                            <span className="font-mono text-[10px] font-bold text-emerald-800">
                              {claim.voucherNumber || 'VOUCHER-OK'}
                            </span>
                          </div>
                          {claim.approvalRemarks && (
                            <p className="text-[11px] text-emerald-700 italic">
                              "{claim.approvalRemarks}"
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 mt-3">
                      <span>Submitted: {new Date(claim.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      <span>Payment: {formatPaymentMode(claim.paymentMode)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bill Proof Preview Modal */}
      <BillProofPreviewModal
        isOpen={Boolean(selectedClaimForPreview)}
        onClose={() => setSelectedClaimForPreview(null)}
        claim={selectedClaimForPreview}
      />
    </div>
  );
};
