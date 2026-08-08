import React, { useEffect, useState } from 'react';
import { db } from '../../services/db';
import { leadService, filterLeadsForUser } from '../../services/leadService';
import { quotationService, getQuotationTotalAmount } from '../../services/quotationService';
import { orderService } from '../../services/orderService';
import { visitService } from '../../services/visitService';
import { employeeService } from '../../services/employeeService';
import { productService } from '../../services/productService';
import { useAuthStore } from '../../store/authStore';
import { FollowUpReminders } from '../../components/Common/FollowUpReminders';
import type { Lead, Quotation, OrderConfirmation, Profile, Product, PaymentInstallment, DeletionRequest } from '../../types';
import { TrendingUp, DollarSign, Award, ClipboardList, PackageCheck, ShieldAlert, Boxes, Check, X } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { currentRole, currentUser } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [confirmations, setConfirmations] = useState<OrderConfirmation[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [visitsCount, setVisitsCount] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [pendingDeleteRequests, setPendingDeleteRequests] = useState<DeletionRequest[]>([]);

  const getPaymentsList = (c: OrderConfirmation): PaymentInstallment[] => {
    if (c.payments && c.payments.length > 0) return c.payments;
    return [{ id: 'p1', installmentNo: 1, label: '1st Advance', amount: c.advanceAmount || 0, paymentMode: c.paymentMode || 'utr', paidAt: c.createdAt }];
  };

  const loadData = async () => {
    try {
      const rawLeads = await leadService.getLeads();
      const lList = filterLeadsForUser(rawLeads, currentUser, currentRole);
      setLeads(lList);

      let qList: Quotation[] = [];
      try {
        qList = await quotationService.getAllQuotations();
      } catch (qErr) {
        console.warn("Quotations load in Dashboard warning:", qErr);
      }

      const activeLeadIds = new Set(lList.map(l => l.id));
      qList = qList.filter(q => !q.leadId || activeLeadIds.has(q.leadId));
      if (lList.length === 0) {
        qList = [];
      }
      setQuotations(qList);

      const allOc: OrderConfirmation[] = [];
      for (const lead of lList) {
        try {
          const oc = await orderService.getOrderConfirmationByLeadId(lead.id);
          if (oc) {
            allOc.push(oc);
          }
        } catch (_) {}
      }
      setConfirmations(lList.length === 0 ? [] : allOc);

      try {
        const empList = await employeeService.getEmployees();
        setEmployees(empList);
      } catch (_) {}

      try {
        const vReports = await visitService.getVisitReports();
        setVisitsCount(vReports ? vReports.length : 0);
      } catch (_) {}

      try {
        const pList = await productService.getProducts();
        setProducts(pList || []);
        const lowStock = (pList || []).filter(p => p.stockQuantity <= p.minStockThreshold);
        setLowStockProducts(lowStock);
      } catch (_) {}

      try {
        const { deletionRequestService } = await import('../../services/deletionRequestService');
        const pending = await deletionRequestService.getPendingRequests();
        setPendingDeleteRequests(pending);
      } catch (_) {}
    } catch (err) {
      console.error("Error loading Dashboard metrics:", err);
    }
  };

  useEffect(() => {
    loadData();
    const handleRealtimeUpdate = () => {
      loadData();
    };
    window.addEventListener('app-realtime-update', handleRealtimeUpdate);
    return () => {
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

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col space-y-1">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl font-sans">Executive Analytics</h1>
        <p className="text-sm text-slate-500 font-medium">Real-time installation pipeline metrics & revenue insights.</p>
      </div>

      {/* Super Admin Pending Delete Requests Alert Banner */}
      {isSuperAdmin && pendingDeleteRequests.length > 0 && (
        <div className="bg-gradient-to-br from-rose-950 via-slate-900 to-rose-950 text-white p-5 rounded-2xl border border-rose-500/40 shadow-xl space-y-3 animate-fade-in">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black text-rose-300 uppercase tracking-widest block">
                  ACTION REQUIRED • {pendingDeleteRequests.length} PENDING DELETE REQUEST(S)
                </span>
                <h3 className="text-base font-black text-white">Super Admin Deletion Approvals Needed</h3>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {pendingDeleteRequests.slice(0, 3).map(req => (
              <div key={req.id} className="bg-black/40 p-3 rounded-xl border border-rose-500/30 text-xs flex justify-between items-center gap-2">
                <div className="truncate">
                  <span className="text-[10px] uppercase font-bold text-rose-300 block truncate">{req.entityType}: {req.entityName}</span>
                  <span className="text-[10px] text-slate-300 font-medium block truncate">By {req.requestedByUserName} ({req.requestedByUserRole.replace('_', ' ')})</span>
                </div>
                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    onClick={async () => {
                      const { deletionRequestService } = await import('../../services/deletionRequestService');
                      await deletionRequestService.approveRequest(req.id);
                      loadData();
                    }}
                    className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer font-bold flex items-center text-[10px]"
                    title="Approve & Delete"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      const { deletionRequestService } = await import('../../services/deletionRequestService');
                      await deletionRequestService.rejectRequest(req.id);
                      loadData();
                    }}
                    className="p-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors cursor-pointer font-bold flex items-center text-[10px]"
                    title="Reject Request"
                  >
                    <X className="w-3.5 h-3.5 text-rose-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Low Stock Warning Alert */}
      {lowStockProducts.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl shadow-xs flex items-start space-x-3">
          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <h4 className="font-extrabold text-red-800 uppercase tracking-wider">CRITICAL INVENTORY ALERT: {lowStockProducts.length} Items Running Low!</h4>
            <p className="text-red-600 font-bold mt-1">The following items have fallen below their safety stock thresholds. Please restock immediately:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {lowStockProducts.map(p => (
                <span key={p.id} className="inline-block bg-white text-red-700 font-black border border-red-200/80 px-2 py-0.5 rounded-lg text-[10px]">
                  ⚠️ {p.name} ({p.stockQuantity} remaining, Min: {p.minStockThreshold})
                </span>
              ))}
            </div>
          </div>
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
    </div>
  );
};
