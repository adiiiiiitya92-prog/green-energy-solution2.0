import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../services/db';
import { leadService, filterLeadsForUser } from '../../services/leadService';
import { quotationService, getQuotationTotalAmount } from '../../services/quotationService';
import { orderService } from '../../services/orderService';
import { visitService } from '../../services/visitService';
import { employeeService } from '../../services/employeeService';
import { productService } from '../../services/productService';
import { challanService } from '../../services/challanService';
import { useAuthStore } from '../../store/authStore';
import { FollowUpReminders } from '../../components/Common/FollowUpReminders';
import { DeletionApprovalsModal } from '../../components/Common/DeletionApprovalsModal';
import type { Lead, Quotation, OrderConfirmation, Profile, Product, PaymentInstallment, DeletionRequest } from '../../types';
import { TrendingUp, DollarSign, Award, ClipboardList, PackageCheck, ShieldAlert, Boxes, Check, X, AlertCircle, ChevronRight, Wallet, ChevronDown, ChevronUp, FileEdit, Phone, Mail, Eye } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { currentRole, currentUser } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allCompanyLeads, setAllCompanyLeads] = useState<Lead[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [allCompanyQuotations, setAllCompanyQuotations] = useState<Quotation[]>([]);
  const [confirmations, setConfirmations] = useState<OrderConfirmation[]>([]);
  const [allCompanyConfirmations, setAllCompanyConfirmations] = useState<OrderConfirmation[]>([]);
  const [installationEvidenceLeadIds, setInstallationEvidenceLeadIds] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [visitsCount, setVisitsCount] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [pendingDeleteRequests, setPendingDeleteRequests] = useState<DeletionRequest[]>([]);
  const [showApprovalsModal, setShowApprovalsModal] = useState<boolean>(false);
  const [isLowStockMinimized, setIsLowStockMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem('minimized_inventory_alert') === 'true';
    } catch {
      return false;
    }
  });

  const getPaymentsList = (c: OrderConfirmation): PaymentInstallment[] => {
    if (c.payments && c.payments.length > 0) return c.payments;
    return [{ id: 'p1', installmentNo: 1, label: '1st Advance', amount: c.advanceAmount || 0, paymentMode: c.paymentMode || 'utr', paidAt: c.createdAt }];
  };

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = async () => {
    try {
      const [leadsRes, quotesRes, ocsRes, empsRes, visitsRes, prodsRes, deleteReqsRes, challansRes, evidenceLeadIdsRes] = await Promise.allSettled([
        leadService.getLeads(),
        quotationService.getAllQuotations(),
        orderService.getAllOrderConfirmations(),
        employeeService.getEmployees(),
        visitService.getVisitReports(),
        productService.getProducts(),
        import('../../services/deletionRequestService').then(m => m.deletionRequestService.getPendingRequests()).catch(() => []),
        challanService.getChallans(true),
        orderService.getAllInstallationEvidenceLeadIds(true)
      ]);

      const roleStr = (currentRole || currentUser?.role || '').toLowerCase();
      const desigStr = (currentUser?.designation || '').toLowerCase();
      const hasFullAccess = roleStr === 'super_admin' || roleStr === 'operations_admin' || desigStr.includes('operations admin');

      if (leadsRes.status === 'fulfilled' && Array.isArray(leadsRes.value) && leadsRes.value.length > 0) {
        const rawLeads = leadsRes.value;
        setAllCompanyLeads(rawLeads);
        const lList = filterLeadsForUser(rawLeads, currentUser, currentRole);
        setLeads(lList);
      }

      if (quotesRes.status === 'fulfilled' && Array.isArray(quotesRes.value) && quotesRes.value.length > 0) {
        let qList: Quotation[] = quotesRes.value;
        setAllCompanyQuotations(qList);
        const currentLeads = leadsRes.status === 'fulfilled' && Array.isArray(leadsRes.value) && leadsRes.value.length > 0 ? leadsRes.value : allCompanyLeads;
        const allValidLeadIds = new Set(currentLeads.map(l => l.id));
        const activeList = filterLeadsForUser(currentLeads, currentUser, currentRole);
        const activeLeadIds = new Set(activeList.map(l => l.id));

        if (!hasFullAccess) {
          setQuotations(qList.filter(q => !!q.leadId && activeLeadIds.has(q.leadId)));
        } else {
          setQuotations(qList.filter(q => !!q.leadId && allValidLeadIds.has(q.leadId)));
        }
      }

      if (ocsRes.status === 'fulfilled' && Array.isArray(ocsRes.value) && ocsRes.value.length > 0) {
        const allOcs = ocsRes.value;
        setAllCompanyConfirmations(allOcs);
        const currentLeads = leadsRes.status === 'fulfilled' && Array.isArray(leadsRes.value) && leadsRes.value.length > 0 ? leadsRes.value : allCompanyLeads;
        const allValidLeadIds = new Set(currentLeads.map(l => l.id));
        const activeList = filterLeadsForUser(currentLeads, currentUser, currentRole);
        const activeLeadIds = new Set(activeList.map(l => l.id));

        const matchedOcs = hasFullAccess
          ? allOcs.filter(oc => !!oc.leadId && allValidLeadIds.has(oc.leadId))
          : allOcs.filter(oc => !!oc.leadId && activeLeadIds.has(oc.leadId));
        setConfirmations(matchedOcs);
      }

      const evidenceSet = new Set<string>();
      if (challansRes.status === 'fulfilled' && Array.isArray(challansRes.value)) {
        challansRes.value.forEach(c => { if (c.leadId) evidenceSet.add(c.leadId); });
      }
      if (evidenceLeadIdsRes.status === 'fulfilled' && evidenceLeadIdsRes.value instanceof Set) {
        evidenceLeadIdsRes.value.forEach(id => evidenceSet.add(id));
      }
      if (evidenceSet.size > 0) {
        setInstallationEvidenceLeadIds(prev => {
          const union = new Set(prev);
          evidenceSet.forEach(id => union.add(id));
          return union;
        });
      }

      if (empsRes.status === 'fulfilled') setEmployees(empsRes.value || []);
      if (visitsRes.status === 'fulfilled') setVisitsCount((visitsRes.value || []).length);
      if (prodsRes.status === 'fulfilled') {
        const pList = prodsRes.value || [];
        setProducts(pList);
        const lowStock = pList.filter(p => p.stockQuantity <= p.minStockThreshold);
        setLowStockProducts(lowStock);
      }
      if (deleteReqsRes.status === 'fulfilled') setPendingDeleteRequests(deleteReqsRes.value || []);
    } catch (err) {
      console.error("Error loading Dashboard metrics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let debounceTimer: any = null;
    let isFetching = false;

    const executeLoad = async () => {
      if (isFetching) return;
      isFetching = true;
      try {
        await loadData();
      } finally {
        isFetching = false;
      }
    };

    executeLoad();

    const handleRealtimeUpdate = () => {
      if (!isMounted) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isMounted) executeLoad();
      }, 1000);
    };

    window.addEventListener('app-realtime-update', handleRealtimeUpdate);
    return () => {
      isMounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('app-realtime-update', handleRealtimeUpdate);
    };
  }, []);

  // 1. Pipeline stages calculation
  const pipelineStats = {
    new: leads.filter(l => l.status === 'new').length,
    quotation: leads.filter(l => l.status === 'quotation_sent').length,
    confirmed: leads.filter(l => l.status === 'confirmed').length,
    registered: leads.filter(l => l.status === 'registered').length,
    installed: leads.filter(l => l.status === 'installed').length,
    closed: leads.filter(l => l.status === 'closed').length,
    lost: leads.filter(l => l.status === 'lost').length,
  };

  // 2. Revenue calculation with multi-installment support
  const getQVal = (q: Quotation) => getQuotationTotalAmount(q);
  const totalQuotedValue = quotations.reduce((sum, q) => sum + getQVal(q), 0);
  const totalConfirmedValue = confirmations.reduce((sum, c) => sum + (c.subtotal || 0), 0);
  const totalPaymentsCollected = confirmations.reduce((sum, c) => {
    const pList = getPaymentsList(c);
    return sum + pList.reduce((s, p) => s + (p.amount || 0), 0);
  }, 0);
  const outstandingBalance = Math.max(0, totalConfirmedValue - totalPaymentsCollected);

  const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

  // 3. Inventory valuation calculation (Unit Price x Available Stock Quantity)
  const grandTotalInventoryValue = products.reduce((sum, p) => sum + ((p.rate || p.bomRate || 0) * (p.stockQuantity || 0)), 0);
  const totalStockUnitsCount = products.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);

  // 4. Employee performance metrics
  const employeePerformance = employees.map(emp => {
    const assignedLeads = leads.filter(l => l.assignedSalesPersonId === emp.id || l.assignedAdminId === emp.id || l.assignedEmployeeId === emp.id);
    const convertedLeads = assignedLeads.filter(l => ['confirmed', 'registered', 'installed', 'closed'].includes(l.status));
    const rate = assignedLeads.length > 0 ? (convertedLeads.length / assignedLeads.length) * 100 : 0;
    
    return {
      name: emp.fullName,
      leadsCount: assignedLeads.length,
      convertedCount: convertedLeads.length,
      conversionRate: rate.toFixed(0) + '%'
    };
  });

  // 5. Process Done (Payment Due) financial totals sum calculation (Executive Company-Wide)
  const processDoneStats = (() => {
    let count = 0;
    let totalContract = 0;
    let totalPaid = 0;
    let totalRemaining = 0;

    const sourceLeads = allCompanyLeads.length > 0 ? allCompanyLeads : leads;
    const sourceQuotes = allCompanyQuotations.length > 0 ? allCompanyQuotations : quotations;
    const sourceOcs = allCompanyConfirmations.length > 0 ? allCompanyConfirmations : confirmations;

    const ocByLeadId = new Map<string, OrderConfirmation>();
    sourceOcs.forEach(c => {
      if (c.leadId) ocByLeadId.set(c.leadId, c);
    });

    const quoteByLeadId = new Map<string, Quotation>();
    sourceQuotes.forEach(q => {
      if (q.leadId && !quoteByLeadId.has(q.leadId)) quoteByLeadId.set(q.leadId, q);
    });

    sourceLeads.forEach(l => {
      if (!l || !l.id) return;
      const hasEvidence = installationEvidenceLeadIds.has(l.id);
      const isProcessDone = (l.status === 'closed' || l.status === 'installed' || hasEvidence);
      if (!isProcessDone) return;

      const mainQuote = quoteByLeadId.get(l.id);
      const oc = ocByLeadId.get(l.id);

      const quoteTotal = mainQuote ? getQuotationTotalAmount(mainQuote) : 0;
      const ocSubtotal = oc ? (oc.subtotal || (Array.isArray(oc.itemsConfirmed) ? oc.itemsConfirmed.reduce((s, i) => s + (i.amount || 0), 0) : 0) || oc.advanceAmount || 0) : 0;
      let contractVal = quoteTotal > 0 ? quoteTotal : ocSubtotal;

      const pList = oc ? getPaymentsList(oc) : [];
      const paidVal = pList.reduce((sum, p) => sum + (p?.amount || 0), 0);

      if (contractVal <= 0 && paidVal > 0) {
        contractVal = paidVal;
      }

      const pendingVal = Math.max(0, contractVal - paidVal);

      if (pendingVal > 0) {
        count += 1;
        totalContract += contractVal;
        totalPaid += paidVal;
        totalRemaining += pendingVal;
      }
    });

    return {
      count,
      totalContract,
      totalPaid,
      totalRemaining
    };
  })();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col space-y-1">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl font-sans">Executive Analytics</h1>
        <p className="text-sm text-slate-500 font-medium">Real-time installation pipeline metrics & revenue insights.</p>
      </div>

      {/* Super Admin Pending Delete & Edit Requests Alert Banner */}
      {isSuperAdmin && pendingDeleteRequests.length > 0 && (
        <div className="bg-gradient-to-br from-slate-950 via-rose-950 to-slate-900 text-white p-5 rounded-3xl border border-rose-500/40 shadow-2xl space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-rose-500/20 pb-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black text-rose-300 uppercase tracking-widest block">
                  ACTION REQUIRED • {pendingDeleteRequests.length} PENDING GATEKEEPER APPROVAL(S)
                </span>
                <h3 className="text-lg font-black text-white">Action Requests From Staff (Admin, Inventory, Field Teams)</h3>
              </div>
            </div>
            <button
              onClick={() => setShowApprovalsModal(true)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-black text-xs rounded-xl border border-white/20 transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Eye className="w-4 h-4 text-rose-300" />
              <span>Review All ({pendingDeleteRequests.length}) in Detail</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingDeleteRequests.slice(0, 3).map(req => {
              const isEdit = req.requestType === 'edit';
              return (
                <div key={req.id} className="bg-black/50 p-3.5 rounded-2xl border border-rose-500/30 text-xs flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                        isEdit ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-rose-600 text-white border-rose-500'
                      }`}>
                        {isEdit ? 'EDIT' : 'DELETE'}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-500/30">
                        {req.entityType}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-black text-sm text-white truncate" title={req.entityName}>
                        {req.entityName}
                      </h4>
                    </div>

                    {/* Requester Employee Info */}
                    <div className="bg-white/5 p-2 rounded-xl border border-white/10 space-y-1 text-[11px]">
                      <div className="font-bold text-slate-200">
                        By: <span className="text-white font-black">{req.requestedByUserName}</span>
                        {req.requestedByUserDesignation && (
                          <span className="text-slate-400 font-normal"> ({req.requestedByUserDesignation})</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2 flex-wrap">
                        <span className="uppercase text-rose-300 font-bold">{req.requestedByUserRole.replace('_', ' ')}</span>
                        {req.requestedByUserPhone && <span>• 📞 +91 {req.requestedByUserPhone}</span>}
                      </div>
                    </div>

                    {req.reason && (
                      <div className="text-[11px] text-slate-300 italic line-clamp-2 bg-black/40 p-2 rounded-lg border border-white/5">
                        "{req.reason}"
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/10 gap-2">
                    <button
                      onClick={() => setShowApprovalsModal(true)}
                      className="text-[11px] text-rose-300 hover:text-white font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </button>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button
                        onClick={async () => {
                          const rem = prompt('Rejection reason (optional):', 'Rejected by Super Admin');
                          if (rem === null) return;
                          const { deletionRequestService } = await import('../../services/deletionRequestService');
                          await deletionRequestService.rejectRequest(req.id, rem || undefined);
                          loadData();
                        }}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer font-bold flex items-center text-[10px] gap-1 border border-slate-700"
                        title="Reject Request"
                      >
                        <X className="w-3.5 h-3.5 text-rose-400" />
                        <span>Reject</span>
                      </button>
                      <button
                        onClick={async () => {
                          const rem = prompt('Approval remarks (optional):', 'Approved by Super Admin');
                          if (rem === null) return;
                          const { deletionRequestService } = await import('../../services/deletionRequestService');
                          await deletionRequestService.approveRequest(req.id, rem || undefined);
                          loadData();
                        }}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer font-bold flex items-center text-[10px] gap-1 shadow-md"
                        title="Approve & Execute"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Low Stock Warning Alert */}
      {lowStockProducts.length > 0 && (
        <div className="bg-red-50/95 border-l-4 border-red-500 rounded-xl shadow-xs transition-all duration-200 overflow-hidden">
          <div className="p-3 sm:p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5 min-w-0">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h4 className="font-extrabold text-red-800 uppercase tracking-wider text-xs sm:text-sm">
                  CRITICAL INVENTORY ALERT: {lowStockProducts.length} Items Running Low!
                </h4>
                <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-md border border-red-200">
                  Restock Needed
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !isLowStockMinimized;
                setIsLowStockMinimized(next);
                try {
                  localStorage.setItem('minimized_inventory_alert', String(next));
                } catch {
                  // ignore
                }
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-red-700 hover:text-red-900 bg-red-100/90 hover:bg-red-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
              title={isLowStockMinimized ? "Expand alert details" : "Minimize alert"}
            >
              <span>{isLowStockMinimized ? "Show Items" : "Minimize"}</span>
              {isLowStockMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>

          {!isLowStockMinimized && (
            <div className="px-3 sm:px-4 pb-3.5 pt-0 text-xs border-t border-red-100/80">
              <p className="text-red-600 font-bold mt-2 mb-2">
                The following items have fallen below their safety stock thresholds. Please restock immediately:
              </p>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                {lowStockProducts.map(p => (
                  <span key={p.id} className="inline-flex items-center bg-white text-red-700 font-extrabold border border-red-200/90 px-2.5 py-1 rounded-lg text-[10.5px] shadow-2xs">
                    ⚠️ {p.name} <span className="ml-1 text-red-500 font-medium">({p.stockQuantity} remaining, Min: {p.minStockThreshold})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Financial Metrics & Inventory Valuation Cards */}
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${isSuperAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {/* Total Proposals Value - Grey */}
        <div className="bg-slate-50/70 p-5 rounded-2xl border-l-4 border-slate-400 border-y border-r border-slate-200 shadow-xs flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Proposals Value</p>
            <h3 className="text-xl font-extrabold text-slate-700 mt-1">₹{totalQuotedValue.toLocaleString('en-IN')}</h3>
          </div>
          <div className="bg-slate-200/80 text-slate-600 rounded-xl p-3">
            <ClipboardList className="w-6 h-6" />
          </div>
        </div>

        {/* Booked Order Value - Green */}
        <div className="bg-emerald-50/40 p-5 rounded-2xl border-l-4 border-emerald-500 border-y border-r border-emerald-100 shadow-xs flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs text-emerald-600/80 font-bold uppercase tracking-wider">Booked Order Value</p>
            <h3 className="text-xl font-extrabold text-emerald-700 mt-1">₹{totalConfirmedValue.toLocaleString('en-IN')}</h3>
          </div>
          <div className="bg-emerald-100 text-emerald-700 rounded-xl p-3">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Advance & Payments Collected - Orange */}
        <div className="bg-orange-50/40 p-5 rounded-2xl border-l-4 border-orange-500 border-y border-r border-orange-100 shadow-xs flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs text-orange-600/80 font-bold uppercase tracking-wider">Total Payments</p>
            <h3 className="text-xl font-extrabold text-orange-700 mt-1">₹{totalPaymentsCollected.toLocaleString('en-IN')}</h3>
          </div>
          <div className="bg-orange-100 text-orange-700 rounded-xl p-3">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Outstanding Balance - Yellow */}
        <div className="bg-amber-50/40 p-5 rounded-2xl border-l-4 border-amber-400 border-y border-r border-amber-100 shadow-xs flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <p className="text-xs text-amber-600/80 font-bold uppercase tracking-wider">Outstanding Balance</p>
            <h3 className="text-xl font-extrabold text-amber-700 mt-1">₹{outstandingBalance.toLocaleString('en-IN')}</h3>
          </div>
          <div className="bg-amber-100 text-amber-700 rounded-xl p-3">
            <PackageCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Grand Total Inventory Value - Purple (Super Admin Exclusive) */}
        {isSuperAdmin && (
          <div className="bg-purple-50/60 p-5 rounded-2xl border-l-4 border-purple-600 border-y border-r border-purple-200 shadow-xs flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
              <p className="text-xs text-purple-700 font-bold uppercase tracking-wider">Total Inventory Value</p>
              <h3 className="text-xl font-black text-purple-950 mt-1">₹{grandTotalInventoryValue.toLocaleString('en-IN')}</h3>
              <p className="text-[10px] font-bold text-purple-600 mt-0.5">{totalStockUnitsCount.toLocaleString('en-IN')} Total Units</p>
            </div>
            <div className="bg-purple-100 text-purple-700 rounded-xl p-3">
              <Boxes className="w-6 h-6" />
            </div>
          </div>
        )}
      </div>

      {/* Process Done (Payment Due) Financial Summary Card */}
      <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white p-6 rounded-2xl border border-purple-500/30 shadow-xl space-y-4 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-2xl bg-purple-500/20 border border-purple-500/30 text-purple-300 shrink-0">
              <AlertCircle className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-purple-300 uppercase tracking-widest bg-purple-500/20 px-2.5 py-0.5 rounded-full border border-purple-400/30">
                  ⚠️ PROCESS DONE (PAYMENT DUE) SUMMARY
                </span>
                <span className="text-[10px] font-bold text-purple-200">
                  ({processDoneStats.count} Lead{processDoneStats.count === 1 ? '' : 's'})
                </span>
              </div>
              <h2 className="text-lg font-black text-white mt-1">Completed Installations Pending Payment Dues</h2>
            </div>
          </div>

          <Link
            to="/leads?filter=process_done_payment_pending"
            onClick={() => {
              sessionStorage.removeItem('leads_selectedLeadId');
              sessionStorage.setItem('leads_rawFilter', 'process_done_payment_pending');
            }}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <span>View All ({processDoneStats.count}) Leads</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* 3 Main Financial Totals Summed Together */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* 1. Total Combined Contract Value */}
          <div className="bg-white/5 backdrop-blur-md p-4 rounded-xl border border-white/10 space-y-1">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Total Contract Value
            </span>
            <h3 className="text-2xl font-black text-white">
              ₹{processDoneStats.totalContract.toLocaleString('en-IN')}
            </h3>
            <p className="text-[10px] text-slate-400">Sum of contract value for all process done leads</p>
          </div>

          {/* 2. Total Combined Amount Paid */}
          <div className="bg-emerald-500/10 backdrop-blur-md p-4 rounded-xl border border-emerald-500/20 space-y-1">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
              Total Amount Paid
            </span>
            <h3 className="text-2xl font-black text-emerald-400">
              ₹{processDoneStats.totalPaid.toLocaleString('en-IN')}
            </h3>
            <p className="text-[10px] text-emerald-400/80">Sum of payments collected</p>
          </div>

          {/* 3. Total Combined Remaining Pending Dues */}
          <div className="bg-amber-500/10 backdrop-blur-md p-4 rounded-xl border border-amber-500/20 space-y-1">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-amber-400" />
              <span>Total Remaining Pending Dues</span>
            </span>
            <h3 className="text-2xl font-black text-amber-400">
              ₹{processDoneStats.totalRemaining.toLocaleString('en-IN')}
            </h3>
            <p className="text-[10px] text-amber-400/80">Net collectable pending balance</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Pipeline Funnel + Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Funnel */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Solar Installation Funnel</h3>
            <span className="text-xs text-slate-400 font-bold">{leads.length} Total Leads</span>
          </div>

          <div className="space-y-4">
            {/* New Leads - Grey */}
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                <span>1. New Leads Entry</span>
                <span>{pipelineStats.new}</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div className="bg-slate-400 h-full rounded-full" style={{ width: `${leads.length ? (pipelineStats.new / leads.length) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Quotation Sent - Yellow */}
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                <span>2. Proposal Sent</span>
                <span>{pipelineStats.quotation}</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div className="bg-amber-400 h-full rounded-full" style={{ width: `${leads.length ? (pipelineStats.quotation / leads.length) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Confirmed Orders - Orange */}
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                <span>3. Booking Confirmed</span>
                <span>{pipelineStats.confirmed}</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div className="bg-orange-500 h-full rounded-full" style={{ width: `${leads.length ? (pipelineStats.confirmed / leads.length) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Registered Checklists - Grey Yellow */}
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                <span>4. Registered & Bank Ready</span>
                <span>{pipelineStats.registered}</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div className="bg-yellow-500 h-full rounded-full" style={{ width: `${leads.length ? (pipelineStats.registered / leads.length) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Installed - Green */}
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                <span>5. Solar Array Installed</span>
                <span>{pipelineStats.installed}</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${leads.length ? (pipelineStats.installed / leads.length) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Closed - Dark Green */}
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                <span>6. Release Complete (Closed)</span>
                <span>{pipelineStats.closed}</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div className="bg-emerald-700 h-full rounded-full" style={{ width: `${leads.length ? (pipelineStats.closed / leads.length) * 100 : 0}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Performance Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider border-b border-slate-100 pb-4">
              Field Operations
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Visits Logged</p>
                <h4 className="text-2xl font-extrabold text-slate-800 mt-1">{visitsCount}</h4>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Lost / Dropped</p>
                <h4 className="text-2xl font-extrabold text-rose-600 mt-1">{pipelineStats.lost}</h4>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <div className="inline-flex items-center space-x-2 text-xs text-emerald-600 bg-emerald-50 px-3.5 py-1.5 rounded-full font-bold">
              <Award className="w-4 h-4" />
              <span>Offline Pipeline Synchronized</span>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Performance Rankings */}
      <FollowUpReminders />

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-4 border-b border-slate-100 pb-4">
          Sales Representative Leaderboard
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-slate-400 font-bold uppercase border-b border-slate-100">
                <th className="pb-3">Employee Name</th>
                <th className="pb-3 text-center">Leads Assigned</th>
                <th className="pb-3 text-center">Bookings Converted</th>
                <th className="pb-3 text-right">Conversion Rate</th>
              </tr>
            </thead>
            <tbody>
              {employeePerformance.map((perf, index) => (
                <tr key={index} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 font-bold text-slate-800">{perf.name}</td>
                  <td className="py-3 text-center font-semibold text-slate-600">{perf.leadsCount}</td>
                  <td className="py-3 text-center font-semibold text-emerald-600">{perf.convertedCount}</td>
                  <td className="py-3 text-right font-extrabold text-slate-900">{perf.conversionRate}</td>
                </tr>
              ))}
              {employeePerformance.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400 font-medium">No performance data recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deletion & Action Approvals Modal */}
      <DeletionApprovalsModal
        isOpen={showApprovalsModal}
        onClose={() => {
          setShowApprovalsModal(false);
          loadData();
        }}
      />
    </div>
  );
};
