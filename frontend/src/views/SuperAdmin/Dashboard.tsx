import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, getDeletedRecordIdsSet } from '../../services/db';
import { leadService, filterLeadsForUser } from '../../services/leadService';
import { quotationService, getQuotationTotalAmount } from '../../services/quotationService';
import { orderService } from '../../services/orderService';
import { visitService } from '../../services/visitService';
import { employeeService } from '../../services/employeeService';
import { productService } from '../../services/productService';
import { challanService } from '../../services/challanService';
import { complaintService } from '../../services/complaintService';
import { kraService } from '../../services/kraService';
import { useAuthStore } from '../../store/authStore';
import { FollowUpReminders } from '../../components/Common/FollowUpReminders';
import { DeletionApprovalsModal } from '../../components/Common/DeletionApprovalsModal';
import type { Lead, Quotation, OrderConfirmation, Profile, Product, PaymentInstallment, DeletionRequest, KRAScore } from '../../types';
import dayjs from 'dayjs';
import { Award, ShieldAlert, Check, X, AlertCircle, ChevronRight, Wallet, ChevronDown, ChevronUp, Eye, MessageSquareWarning, Target, Users, Filter, Clock } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { currentRole, currentUser } = useAuthStore();
  const roleStr = (currentRole || currentUser?.role || '').toLowerCase();
  const desigStr = (currentUser?.designation || '').toLowerCase();
  const isSuperAdmin = roleStr === 'super_admin';
  const hasFullAccess = isSuperAdmin || roleStr === 'operations_admin' || desigStr.includes('operations admin') || desigStr.includes('ops admin');

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
  const [pendingComplaintsCount, setPendingComplaintsCount] = useState<number>(0);
  const [kraScores, setKraScores] = useState<KRAScore[]>([]);
  const [showApprovalsModal, setShowApprovalsModal] = useState<boolean>(false);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [pendingExpenseCount, setPendingExpenseCount] = useState(0);
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

  // Fast Instant Hydration from local IndexedDB (0ms latency)
  useEffect(() => {
    let isMounted = true;
    const hydrateLocal = async () => {
      try {
        const deletedIds = await getDeletedRecordIdsSet();
        const [localLeads, localQuotes, localOcs, localProds, localEmps] = await Promise.all([
          db.leads.toArray().catch(() => []),
          db.quotations.toArray().catch(() => []),
          db.orderConfirmations.toArray().catch(() => []),
          db.products.toArray().catch(() => []),
          db.profiles.toArray().catch(() => [])
        ]);

        if (!isMounted) return;

        const validLeads = (localLeads || []).filter(l => !deletedIds.has(l.id));
        if (validLeads.length > 0) {
          setAllCompanyLeads(validLeads);
          setLeads(filterLeadsForUser(validLeads, currentUser, currentRole));
        }

        const validQuotes = (localQuotes || []).filter(q => !deletedIds.has(q.id) && q.items && q.items.length > 0);
        if (validQuotes.length > 0) {
          setAllCompanyQuotations(validQuotes);
          const allLeadIds = new Set(validLeads.map(l => l.id));
          const activeList = filterLeadsForUser(validLeads, currentUser, currentRole);
          const activeLeadIds = new Set(activeList.map(l => l.id));
          if (!hasFullAccess) {
            setQuotations(validQuotes.filter(q => !!q.leadId && activeLeadIds.has(q.leadId)));
          } else {
            setQuotations(validQuotes.filter(q => !q.leadId || allLeadIds.size === 0 || allLeadIds.has(q.leadId)));
          }
        }

        const validOcs = (localOcs || []).filter(o => !deletedIds.has(o.id) && !deletedIds.has(o.leadId));
        if (validOcs.length > 0) {
          setAllCompanyConfirmations(validOcs);
          const allLeadIds = new Set(validLeads.map(l => l.id));
          const activeList = filterLeadsForUser(validLeads, currentUser, currentRole);
          const activeLeadIds = new Set(activeList.map(l => l.id));
          const matchedOcs = hasFullAccess
            ? validOcs.filter(oc => !oc.leadId || allLeadIds.size === 0 || allLeadIds.has(oc.leadId))
            : validOcs.filter(oc => !!oc.leadId && activeLeadIds.has(oc.leadId));
          setConfirmations(matchedOcs);
        }

        const validProds = (localProds || []).filter(p => !deletedIds.has(p.id));
        if (validProds.length > 0) {
          setProducts(validProds);
          setLowStockProducts(validProds.filter(p => p.stockQuantity <= p.minStockThreshold));
        }

        if (localEmps && localEmps.length > 0) {
          setEmployees(localEmps);
        }

        // Instant local counts for Needs Attention (no remote wait)
        if (isSuperAdmin || hasFullAccess) {
          const [localComplaints, localLeaves, localExpenses] = await Promise.all([
            db.complaints.toArray().catch(() => []),
            db.leaveRequests.toArray().catch(() => []),
            db.expenses.toArray().catch(() => [])
          ]);
          if (isMounted) {
            const pc = (localComplaints || []).filter((c: any) => c.status !== 'Resolved' && c.status !== 'Closed').length;
            if (pc > 0) setPendingComplaintsCount(pc);
            setPendingLeaveCount((localLeaves || []).filter((l: any) => l.status === 'pending').length);
            setPendingExpenseCount((localExpenses || []).filter((e: any) => e.status === 'pending').length);
          }
        }

        if (validLeads.length > 0 || validQuotes.length > 0 || validOcs.length > 0) {
          setIsLoading(false);
        }
      } catch (err) {
        console.warn("Hydrate local error note:", err);
      }
    };

    hydrateLocal();
    return () => { isMounted = false; };
  }, [currentUser, currentRole, hasFullAccess]);

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
        challanService.getChallans(false),
        orderService.getAllInstallationEvidenceLeadIds(false)
      ]);

      if (leadsRes.status === 'fulfilled' && Array.isArray(leadsRes.value)) {
        const rawLeads = leadsRes.value;
        setAllCompanyLeads(rawLeads);
        const lList = filterLeadsForUser(rawLeads, currentUser, currentRole);
        setLeads(lList);
      }

      if (quotesRes.status === 'fulfilled' && Array.isArray(quotesRes.value)) {
        let qList: Quotation[] = quotesRes.value;
        setAllCompanyQuotations(qList);
        const currentLeads = leadsRes.status === 'fulfilled' && Array.isArray(leadsRes.value) ? leadsRes.value : allCompanyLeads;
        const allValidLeadIds = new Set(currentLeads.map(l => l.id));
        const activeList = filterLeadsForUser(currentLeads, currentUser, currentRole);
        const activeLeadIds = new Set(activeList.map(l => l.id));

        if (!hasFullAccess) {
          setQuotations(qList.filter(q => !!q.leadId && activeLeadIds.has(q.leadId)));
        } else {
          setQuotations(qList.filter(q => !q.leadId || allValidLeadIds.size === 0 || allValidLeadIds.has(q.leadId)));
        }
      }

      if (ocsRes.status === 'fulfilled' && Array.isArray(ocsRes.value)) {
        const allOcs = ocsRes.value;
        setAllCompanyConfirmations(allOcs);
        const currentLeads = leadsRes.status === 'fulfilled' && Array.isArray(leadsRes.value) ? leadsRes.value : allCompanyLeads;
        const allValidLeadIds = new Set(currentLeads.map(l => l.id));
        const activeList = filterLeadsForUser(currentLeads, currentUser, currentRole);
        const activeLeadIds = new Set(activeList.map(l => l.id));

        const matchedOcs = hasFullAccess
          ? allOcs.filter(oc => !oc.leadId || allValidLeadIds.size === 0 || allValidLeadIds.has(oc.leadId))
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
      setInstallationEvidenceLeadIds(evidenceSet);

      if (empsRes.status === 'fulfilled') setEmployees(empsRes.value || []);
      if (visitsRes.status === 'fulfilled') setVisitsCount((visitsRes.value || []).length);
      if (prodsRes.status === 'fulfilled') {
        const pList = prodsRes.value || [];
        setProducts(pList);
        const lowStock = pList.filter(p => p.stockQuantity <= p.minStockThreshold);
        setLowStockProducts(lowStock);
      }
      if (deleteReqsRes.status === 'fulfilled') setPendingDeleteRequests(deleteReqsRes.value || []);

      // Pending complaints — background sync then update count (non-blocking)
      if (isSuperAdmin) {
        complaintService.getComplaints()
          .then(() => complaintService.getPendingComplaints(1))
          .then(({ count }) => setPendingComplaintsCount(count))
          .catch(() => {});
      }

      // KRA scores for leaderboard replacement
      try {
        const scores = await kraService.getAllScores();
        setKraScores(scores);
      } catch (_) {}

      // Pending leave & expense counts
      if (isSuperAdmin || hasFullAccess) {
        try {
          const { leaveService } = await import('../../services/leaveService');
          const allLeaves = await leaveService.getAllLeaveRequests();
          setPendingLeaveCount(allLeaves.filter(l => l.status === 'pending').length);
        } catch (_) {}
        try {
          const { expenseService } = await import('../../services/expenseService');
          const allExpenses = await expenseService.getAllExpenses();
          setPendingExpenseCount(allExpenses.filter(e => e.status === 'pending').length);
        } catch (_) {}
      }

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

  // 1b. Ordered funnel stages (exact company-wide CRM numbers)
  const funnelSource = allCompanyLeads.length > 0 ? allCompanyLeads : leads;
  const funnelCount = (status: Lead['status']) => funnelSource.filter(l => l.status === status).length;
  const funnelStages = [
    { label: 'New Leads', count: funnelCount('new') },
    { label: 'Quotation Sent', count: funnelCount('quotation_sent') },
    { label: 'Booking Confirmed', count: funnelCount('confirmed') },
    { label: 'Registered', count: funnelCount('registered') },
    { label: 'Installed', count: funnelCount('installed') },
    { label: 'Completed (Closed)', count: funnelCount('closed') },
  ];
  const funnelTotal = funnelSource.length;
  const funnelMax = Math.max(1, ...funnelStages.map(s => s.count));

  // 1c. Sales Representative Leaderboard (company-wide) — assigned vs converted
  const salesLeaderboard = (() => {
    const sourceLeads = allCompanyLeads.length > 0 ? allCompanyLeads : leads;
    const empsById = new Map(employees.map(e => [e.id, e]));
    const bookedStatuses = new Set(['confirmed', 'registered', 'installed', 'closed']);
    const agg = new Map<string, { id: string; name: string; assigned: number; converted: number }>();
    sourceLeads.forEach(l => {
      const repId = l.assignedSalesPersonId || l.assignedEmployeeId;
      if (!repId) return;
      if (!agg.has(repId)) {
        const emp = empsById.get(repId);
        agg.set(repId, { id: repId, name: emp?.fullName || 'Unknown', assigned: 0, converted: 0 });
      }
      const row = agg.get(repId)!;
      row.assigned += 1;
      if (bookedStatuses.has(l.status)) row.converted += 1;
    });
    return Array.from(agg.values())
      .map(r => ({ ...r, rate: r.assigned > 0 ? Math.round((r.converted / r.assigned) * 100) : 0 }))
      .sort((a, b) => b.converted - a.converted || b.rate - a.rate);
  })();

  // 2. Revenue calculation with multi-installment support
  const getQVal = (q: Quotation) => getQuotationTotalAmount(q);
  const totalQuotedValue = quotations.reduce((sum, q) => sum + getQVal(q), 0);
  const totalConfirmedValue = confirmations.reduce((sum, c) => sum + (c.subtotal || 0), 0);
  const totalPaymentsCollected = confirmations.reduce((sum, c) => {
    const pList = getPaymentsList(c);
    return sum + pList.reduce((s, p) => s + (p.amount || 0), 0);
  }, 0);
  const outstandingBalance = Math.max(0, totalConfirmedValue - totalPaymentsCollected);

  // 3. Inventory valuation calculation (Unit Price x Available Stock Quantity)
  const grandTotalInventoryValue = products.reduce((sum, p) => sum + ((p.rate || p.bomRate || 0) * (p.stockQuantity || 0)), 0);
  const totalStockUnitsCount = products.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);

  // 4. KRA report rows (current month) — replaces the old Sales Leaderboard
  const kraReportRows = (() => {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    const empsById = new Map(employees.map(e => [e.id, e]));
    return kraScores
      .filter(s => s.year === curYear && s.month === curMonth)
      .map(s => {
        const emp = empsById.get(s.employeeId);
        return {
          id: s.id,
          name: s.employeeName || emp?.fullName || 'Unknown',
          role: (s.employeeRole || emp?.role || '').replace(/_/g, ' '),
          total: s.totalScore,
          grade: s.grade,
          incentive: s.incentivePct || 0,
          status: s.status
        };
      })
      .sort((a, b) => b.total - a.total);
  })();

  // 5. Process Done (Payment Due) financial totals sum calculation
  // Super Admin / Ops Admin: company-wide calculations across all leads
  // Admin / other roles: calculations scoped ONLY to leads assigned to them
  const processDoneStats = (() => {
    let count = 0;
    let totalContract = 0;
    let totalPaid = 0;
    let totalRemaining = 0;

    const sourceLeads = hasFullAccess
      ? (allCompanyLeads.length > 0 ? allCompanyLeads : leads)
      : leads;
    const sourceQuotes = allCompanyQuotations.length > 0 ? allCompanyQuotations : quotations;
    const sourceOcs = allCompanyConfirmations.length > 0 ? allCompanyConfirmations : confirmations;

    const ocByLeadId = new Map<string, OrderConfirmation>();
    sourceOcs.forEach(c => {
      if (c.leadId) ocByLeadId.set(c.leadId, c);
    });

    const quoteByLeadId = new Map<string, Quotation>();
    sourceQuotes.forEach(q => {
      if (q.leadId && (!quoteByLeadId.has(q.leadId) || (q.items && q.items.length > 0))) {
        quoteByLeadId.set(q.leadId, q);
      }
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

  // 6. Needs Attention aggregation
  const now = dayjs();
  const overdueFollowUps = leads.filter(l => l.nextFollowUpDate && !l.followUpCompleted && dayjs(l.nextFollowUpDate).isBefore(now, 'day')).length;
  const leadsWithoutNextStep = leads.filter(l => l.status === 'new' && !l.nextFollowUpDate && !l.assignedSalesPersonId && !l.assignedEmployeeId).length;

  // 7. Payment Overdue: confirmed leads with no payment update in 15+ days
  const paymentOverdueLeads = (() => {
    const sourceLeads = hasFullAccess ? (allCompanyLeads.length > 0 ? allCompanyLeads : leads) : leads;
    const sourceOcs = allCompanyConfirmations.length > 0 ? allCompanyConfirmations : confirmations;
    const sourceQuotes = allCompanyQuotations.length > 0 ? allCompanyQuotations : quotations;
    const ocByLeadId = new Map<string, OrderConfirmation>();
    sourceOcs.forEach(c => { if (c.leadId) ocByLeadId.set(c.leadId, c); });
    const quoteByLeadId = new Map<string, Quotation>();
    sourceQuotes.forEach(q => { if (q.leadId) quoteByLeadId.set(q.leadId, q); });

    return sourceLeads
      .filter(l => {
        if (!['confirmed', 'registered', 'installed'].includes(l.status)) return false;
        const oc = ocByLeadId.get(l.id);
        const pList = oc ? getPaymentsList(oc) : [];
        const totalPaid = pList.reduce((s, p) => s + (p.amount || 0), 0);
        const q = quoteByLeadId.get(l.id);
        const contractVal = q ? getQuotationTotalAmount(q) : (oc?.subtotal || 0);
        if (contractVal > 0 && totalPaid >= contractVal) return false;
        const lastPaymentDate = pList.length > 0 ? pList.reduce((latest, p) => {
          const d = dayjs(p.paidAt);
          return d.isAfter(latest) ? d : latest;
        }, dayjs(pList[0].paidAt)) : null;
        const refDate = lastPaymentDate || dayjs(oc?.createdAt || l.updatedAt || l.createdAt);
        return now.diff(refDate, 'day') >= 15;
      })
      .map(l => {
        const oc = ocByLeadId.get(l.id);
        const pList = oc ? getPaymentsList(oc) : [];
        const totalPaid = pList.reduce((s, p) => s + (p.amount || 0), 0);
        const q = quoteByLeadId.get(l.id);
        const contractVal = q ? getQuotationTotalAmount(q) : (oc?.subtotal || 0);
        const lastPaymentDate = pList.length > 0 ? pList.reduce((latest, p) => {
          const d = dayjs(p.paidAt);
          return d.isAfter(latest) ? d : latest;
        }, dayjs(pList[0].paidAt)) : dayjs(oc?.createdAt || l.updatedAt || l.createdAt);
        const daysSince = now.diff(lastPaymentDate, 'day');
        return { id: l.id, name: l.name, phone: l.phoneNumber, status: l.status, pending: Math.max(0, contractVal - totalPaid), daysSince };
      })
      .sort((a, b) => b.daysSince - a.daysSince);
  })();

  const overduePaymentTotal = paymentOverdueLeads.reduce((s, l) => s + l.pending, 0);

  const attentionItems = [
    { label: 'Overdue follow-ups', count: overdueFollowUps, color: 'text-red-600', bg: 'bg-red-50', link: '/leads' },
    { label: 'Leads without a next step', count: leadsWithoutNextStep, color: 'text-orange-600', bg: 'bg-orange-50', link: '/leads' },
    { label: 'Overdue customer payments (₹)', count: overduePaymentTotal, color: 'text-red-700', bg: 'bg-red-50', isAmount: true },
    { label: 'Leave requests to approve', count: pendingLeaveCount, color: 'text-blue-600', bg: 'bg-blue-50', link: '/leave-requests' },
    { label: 'Expense claims to approve', count: pendingExpenseCount, color: 'text-indigo-600', bg: 'bg-indigo-50', link: '/expenses' },
    { label: 'Products low on stock', count: lowStockProducts.length, color: 'text-rose-600', bg: 'bg-rose-50', link: '/products' },
  ].filter(i => i.count > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">Executive Analytics</h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">Real-time pipeline metrics & revenue insights</p>
        </div>
        <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl hidden sm:block">
          {dayjs().format('DD MMM YYYY')}
        </div>
      </div>

      {/* Pending Complaints widget (Super Admin) */}
      {isSuperAdmin && pendingComplaintsCount > 0 && (
        <Link to="/complaints?filter=pending" className="block bg-white border border-slate-200 rounded-2xl px-5 py-3.5 shadow-xs hover:shadow-md hover:border-amber-200 transition-all cursor-pointer">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 shrink-0">
                <MessageSquareWarning className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                Pending Complaints
                <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{pendingComplaintsCount}</span>
              </h3>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </Link>
      )}

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
                        <span className="uppercase text-rose-300 font-bold">{(req.requestedByUserRole || 'user').replace(/_/g, ' ')}</span>
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

      {/* Low Stock Warning Alert (Super Admin Exclusive) */}
      {isSuperAdmin && lowStockProducts.length > 0 && (
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

      {/* Financial Metrics Cards */}
      <div className={`grid grid-cols-2 gap-3 ${isSuperAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        <div className="bg-slate-50/70 p-4 rounded-2xl border-l-4 border-slate-400 border-y border-r border-slate-200 shadow-xs hover:shadow-md transition-shadow">
          <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider">Proposals Value</p>
          <h3 className="text-lg sm:text-xl font-extrabold text-slate-700 mt-1">₹{totalQuotedValue.toLocaleString('en-IN')}</h3>
        </div>

        <div className="bg-emerald-50/40 p-4 rounded-2xl border-l-4 border-emerald-500 border-y border-r border-emerald-100 shadow-xs hover:shadow-md transition-shadow">
          <p className="text-[10px] sm:text-xs text-emerald-600/80 font-bold uppercase tracking-wider">Booked Value</p>
          <h3 className="text-lg sm:text-xl font-extrabold text-emerald-700 mt-1">₹{totalConfirmedValue.toLocaleString('en-IN')}</h3>
        </div>

        <div className="bg-orange-50/40 p-4 rounded-2xl border-l-4 border-orange-500 border-y border-r border-orange-100 shadow-xs hover:shadow-md transition-shadow">
          <p className="text-[10px] sm:text-xs text-orange-600/80 font-bold uppercase tracking-wider">Total Payments</p>
          <h3 className="text-lg sm:text-xl font-extrabold text-orange-700 mt-1">₹{totalPaymentsCollected.toLocaleString('en-IN')}</h3>
        </div>

        <div className="bg-amber-50/40 p-4 rounded-2xl border-l-4 border-amber-400 border-y border-r border-amber-100 shadow-xs hover:shadow-md transition-shadow">
          <p className="text-[10px] sm:text-xs text-amber-600/80 font-bold uppercase tracking-wider">Outstanding</p>
          <h3 className="text-lg sm:text-xl font-extrabold text-amber-700 mt-1">₹{outstandingBalance.toLocaleString('en-IN')}</h3>
        </div>

        {isSuperAdmin && (
          <div className="col-span-2 lg:col-span-1 bg-purple-50/60 p-4 rounded-2xl border-l-4 border-purple-600 border-y border-r border-purple-200 shadow-xs hover:shadow-md transition-shadow">
            <p className="text-[10px] sm:text-xs text-purple-700 font-bold uppercase tracking-wider">Inventory Value</p>
            <h3 className="text-lg sm:text-xl font-black text-purple-950 mt-1">₹{grandTotalInventoryValue.toLocaleString('en-IN')}</h3>
            <p className="text-[10px] font-bold text-purple-600 mt-0.5">{totalStockUnitsCount.toLocaleString('en-IN')} Units</p>
          </div>
        )}
      </div>

      {/* Process Done (Payment Due) Summary */}
      <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white p-5 rounded-2xl border border-purple-500/30 shadow-xl space-y-3 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white">Process Done — Payment Due</h2>
              <p className="text-[10px] text-purple-300">{processDoneStats.count} leads with pending balance</p>
            </div>
          </div>
          <Link
            to="/leads?filter=process_done_payment_pending"
            onClick={() => {
              sessionStorage.removeItem('leads_selectedLeadId');
              sessionStorage.setItem('leads_rawFilter', 'process_done_payment_pending');
            }}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/5 p-3 rounded-xl border border-white/10">
            <span className="text-[10px] font-bold text-slate-300 uppercase block">Contract</span>
            <h3 className="text-lg sm:text-xl font-black text-white mt-0.5">₹{processDoneStats.totalContract.toLocaleString('en-IN')}</h3>
          </div>
          <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
            <span className="text-[10px] font-bold text-emerald-400 uppercase block">Paid</span>
            <h3 className="text-lg sm:text-xl font-black text-emerald-400 mt-0.5">₹{processDoneStats.totalPaid.toLocaleString('en-IN')}</h3>
          </div>
          <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
            <span className="text-[10px] font-bold text-amber-400 uppercase block flex items-center gap-1">
              <Wallet className="w-3 h-3" /> Pending
            </span>
            <h3 className="text-lg sm:text-xl font-black text-amber-400 mt-0.5">₹{processDoneStats.totalRemaining.toLocaleString('en-IN')}</h3>
          </div>
        </div>
      </div>

      {/* Needs Attention + Payment Overdue */}
      {(attentionItems.length > 0 || paymentOverdueLeads.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Needs Attention Card */}
          {attentionItems.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-black text-slate-900">Needs Attention</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {attentionItems.map((item, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <span className="text-amber-500 text-sm">⚠</span>
                      {item.link ? (
                        <Link to={item.link} className="text-sm font-semibold text-slate-700 hover:text-emerald-700 transition-colors">
                          {item.label}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                      )}
                    </div>
                    <span className={`text-sm font-black px-2.5 py-0.5 rounded-lg ${item.bg} ${item.color}`}>
                      {item.isAmount ? `₹${item.count.toLocaleString('en-IN')}` : item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Overdue Table */}
          {paymentOverdueLeads.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-red-500" />
                  <h3 className="text-sm font-black text-slate-900">Payment Overdue (15+ days)</h3>
                  <span className="text-[10px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{paymentOverdueLeads.length}</span>
                </div>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-slate-400 font-bold uppercase text-[10px]">
                      <th className="px-4 py-2.5">Lead Name</th>
                      <th className="px-4 py-2.5 text-center">Stage</th>
                      <th className="px-4 py-2.5 text-right">Pending (₹)</th>
                      <th className="px-4 py-2.5 text-right">Days Since</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paymentOverdueLeads.slice(0, 15).map(l => (
                      <tr key={l.id} className="hover:bg-red-50/30 transition-colors">
                        <td className="px-4 py-2">
                          <Link to={`/leads`} onClick={() => sessionStorage.setItem('leads_selectedLeadId', l.id)} className="font-bold text-slate-800 hover:text-emerald-700">{l.name}</Link>
                          {l.phone && <p className="text-[10px] text-slate-400">{l.phone}</p>}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                            l.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                            l.status === 'registered' ? 'bg-blue-100 text-blue-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>{l.status}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-black text-red-600">₹{l.pending.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-black ${l.daysSince >= 30 ? 'text-red-600' : 'text-amber-600'}`}>{l.daysSince}d</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {paymentOverdueLeads.length > 15 && (
                <div className="px-5 py-2 border-t border-slate-100 text-center">
                  <span className="text-[11px] font-bold text-slate-400">+ {paymentOverdueLeads.length - 15} more overdue leads</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lead Pipeline Funnel (compact, exact CRM numbers) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 shrink-0">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-[13px] font-black text-slate-900 leading-tight">Lead Pipeline Funnel</h3>
              <p className="text-[10px] text-slate-500 font-semibold">Leads that reached each stage</p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-slate-400 shrink-0">{funnelTotal} Total</span>
        </div>
        <div className="space-y-1.5">
          {funnelStages.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="w-28 sm:w-32 text-[11px] font-bold text-slate-600 truncate shrink-0">{s.label}</span>
              <div className="flex-1 bg-slate-100 h-4 rounded-md overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-full rounded-md transition-all"
                  style={{ width: `${Math.max(s.count > 0 ? 5 : 0, (s.count / funnelMax) * 100)}%` }}
                ></div>
              </div>
              <span className="w-8 text-right text-[13px] font-black text-slate-800 shrink-0">{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid: Sales Leaderboard + Field Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              Sales Leaderboard
            </h3>
            <Link to="/leads" className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
              View Leads <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-white">
                <tr className="text-slate-400 font-bold uppercase text-[10px] border-b border-slate-100">
                  <th className="pb-2">Employee</th>
                  <th className="pb-2 text-center">Assigned</th>
                  <th className="pb-2 text-center">Converted</th>
                  <th className="pb-2 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {salesLeaderboard.map(r => {
                  const rateCls = r.rate >= 60 ? 'text-emerald-700' : r.rate >= 30 ? 'text-amber-600' : 'text-slate-500';
                  return (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="py-2 font-bold text-slate-800">{r.name}</td>
                      <td className="py-2 text-center font-semibold text-slate-600">{r.assigned}</td>
                      <td className="py-2 text-center font-extrabold text-emerald-700">{r.converted}</td>
                      <td className={`py-2 text-right font-black ${rateCls}`}>{r.rate}%</td>
                    </tr>
                  );
                })}
                {salesLeaderboard.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400 font-medium">No leads assigned yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="font-bold text-slate-800 text-xs sm:text-sm uppercase tracking-wider border-b border-slate-100 pb-3">
              Field Operations
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Visits</p>
                <h4 className="text-xl font-extrabold text-slate-800 mt-1">{visitsCount}</h4>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Lost</p>
                <h4 className="text-xl font-extrabold text-rose-600 mt-1">{pipelineStats.lost}</h4>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <div className="inline-flex items-center space-x-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full font-bold">
              <Award className="w-3.5 h-3.5" />
              <span>Pipeline Synced</span>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Performance Rankings */}
      <FollowUpReminders />

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-600" />
            KRA Performance Report
            <span className="ml-2 text-[10px] font-semibold text-slate-500 normal-case tracking-normal">
              ({new Date().toLocaleString('default', { month: 'long' })} {new Date().getFullYear()})
            </span>
          </h3>
          <Link
            to="/hrms/kra"
            className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
          >
            Manage KRAs <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-slate-400 font-bold uppercase border-b border-slate-100">
                <th className="pb-3">#</th>
                <th className="pb-3">Employee</th>
                <th className="pb-3">Role</th>
                <th className="pb-3 text-center">Score / 100</th>
                <th className="pb-3 text-center">Grade</th>
                <th className="pb-3 text-center">Incentive</th>
                <th className="pb-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {kraReportRows.map((r, i) => {
                const gradeCls =
                  r.grade === 'A+' ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                  : r.grade === 'A' ? 'bg-green-100 text-green-700 border-green-300'
                  : r.grade === 'B' ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                  : r.grade === 'C' ? 'bg-orange-100 text-orange-700 border-orange-300'
                  : 'bg-red-100 text-red-700 border-red-300';
                const statusCls =
                  r.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                  : r.status === 'submitted' ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-600';
                return (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 text-slate-500 font-semibold">{i + 1}</td>
                    <td className="py-3 font-bold text-slate-800">{r.name}</td>
                    <td className="py-3 text-slate-500 uppercase text-[10px] tracking-wide">{r.role}</td>
                    <td className="py-3 text-center font-extrabold text-emerald-700">{r.total}</td>
                    <td className="py-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${gradeCls}`}>
                        {r.grade}
                      </span>
                    </td>
                    <td className="py-3 text-center font-semibold text-amber-700">{r.incentive}%</td>
                    <td className="py-3 text-right">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusCls}`}>
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {kraReportRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400 font-medium">
                    No KRA scores recorded for this month yet. Visit <Link to="/hrms/kra" className="text-emerald-600 font-bold underline">KRA Management</Link> to add.
                  </td>
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
