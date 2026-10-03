import React, { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../store/authStore';
import { db } from '../../services/db';
import { complaintService, DEFAULT_COMPLAINT_CATEGORIES, DEFAULT_COMPLAINT_STATUSES } from '../../services/complaintService';
import { productService } from '../../services/productService';
import type {
  Complaint,
  CustomerType,
  ComplaintPriority,
  ComplaintStatus,
  Lead,
  Profile,
  Product,
  ComplaintConfigCategory,
  CashProofLocation
} from '../../types';
import {
  CheckCircle2,
  Plus,
  Search,
  UserCheck,
  MapPin,
  Package as PackageIcon,
  Star,
  RefreshCw,
  UserPlus,
  Building2,
  ShieldAlert,
  Send,
  X,
  SlidersHorizontal,
  BarChart3,
  Check,
  AlertTriangle,
  Edit3,
  Trash2,
  Camera,
  Download,
  Eye,
  Loader2
} from 'lucide-react';
import { uploadImageToFirebase } from '../../services/firebase';
import { acquireCurrentGpsLocation, applyGpsWatermark, type GpsWatermarkData } from '../../services/watermarkService';
import dayjs from 'dayjs';

export const Complaints: React.FC = () => {
  const { currentUser, currentRole } = useAuthStore();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ComplaintConfigCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Active View Tab: 'list' | 'analytics'
  const [activeTab, setActiveTab] = useState<'list' | 'analytics'>('list');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [cList, lList, eList, pList, catList] = await Promise.all([
        complaintService.getComplaints(),
        db.leads.toArray(),
        db.profiles.toArray(),
        productService.getProducts(),
        complaintService.getCategories()
      ]);
      setComplaints(cList);
      setLeads(lList);
      setEmployees(eList);
      setProducts(pList);
      setCategories(catList);

      // Keep selected complaint refreshed if open
      if (selectedComplaint) {
        const refreshed = cList.find(c => c.id === selectedComplaint.id);
        if (refreshed) setSelectedComplaint(refreshed);
      }
    } catch (err) {
      console.error("Error loading complaints data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleRealtimeUpdate = () => loadData();
    window.addEventListener('app-realtime-update', handleRealtimeUpdate);
    return () => window.removeEventListener('app-realtime-update', handleRealtimeUpdate);
  }, []);

  const isAdmin = currentRole === 'super_admin' || currentRole === 'admin' || currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  // Base pool of complaints accessible to the current logged-in user:
  // - Admins/Super Admins see all complaints across the company.
  // - Employees strictly see only complaints assigned to them.
  // - Inventory managers see complaints with inventory requests or inventory categories.
  const accessibleComplaints = useMemo(() => {
    if (isAdmin) {
      return complaints;
    }

    const currentUserId = currentUser?.id || '';
    const currentUserName = (currentUser?.fullName || '').trim().toLowerCase();

    return complaints.filter(c => {
      // 1. Check if assigned directly to this employee (by ID or name)
      const isAssignedDirectly = Boolean(
        (currentUserId && c.assignedToId === currentUserId) ||
        (currentUserName && c.assignedToName?.trim().toLowerCase() === currentUserName)
      );

      // 2. Check if assigned as field employee or sales employee
      const isAssignedField = Boolean(
        (currentUserId && c.assignedFieldEmployeeId === currentUserId) ||
        (currentUserName && c.assignedFieldEmployeeName?.trim().toLowerCase() === currentUserName)
      );

      const isAssignedSales = Boolean(
        (currentUserId && c.assignedSalesEmployeeId === currentUserId) ||
        (currentUserName && c.assignedSalesEmployeeName?.trim().toLowerCase() === currentUserName)
      );

      const isRelatedEmployee = Boolean(
        currentUserId && c.relatedEmployeeId === currentUserId
      );

      // 3. Check if any field visit task in this complaint is assigned to this employee
      const hasAssignedVisit = Boolean(
        c.fieldVisits && c.fieldVisits.some(v =>
          (currentUserId && v.assignedFieldEmployeeId === currentUserId) ||
          (currentUserName && v.assignedFieldEmployeeName?.trim().toLowerCase() === currentUserName)
        )
      );

      // 4. Check if created by this employee
      const isCreator = Boolean(currentUserId && c.createdByUserId === currentUserId);

      // 5. Inventory manager role check
      const isInvManager = currentRole === 'inventory_manager' || currentUser?.role === 'inventory_manager';
      if (isInvManager) {
        const hasInvReq = Boolean(c.inventoryRequests && c.inventoryRequests.length > 0);
        const isInvCategory = c.category === 'Inventory Issue' || c.category === 'Product Defect' || c.category === 'Product Damage';
        if (hasInvReq || isInvCategory) return true;
      }

      // Complaint will only go to this employee's panel if assigned to them or created by them
      return isAssignedDirectly || isAssignedField || isAssignedSales || isRelatedEmployee || hasAssignedVisit || isCreator;
    });
  }, [complaints, isAdmin, currentRole, currentUser]);

  // Filter Complaints from accessibleComplaints
  const filteredComplaints = accessibleComplaints.filter(c => {
    // Overdue Filter
    if (overdueOnly && !c.isOverdue) return false;

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const match =
        (c.complaintNumber || '').toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.customerName || '').toLowerCase().includes(q) ||
        (c.mobileNumber || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q) ||
        (c.installedCapacityKw ? c.installedCapacityKw.toLowerCase().includes(q) : false);
      if (!match) return false;
    }

    // Status Filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active' && (c.status === 'Resolved' || c.status === 'Closed')) return false;
      if (statusFilter !== 'active' && c.status !== statusFilter) return false;
    }

    // Priority Filter
    if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;

    // Category Filter
    if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;

    // Customer Type Filter
    if (customerTypeFilter !== 'all' && c.customerType !== customerTypeFilter) return false;

    // Assigned Employee Filter (Admins only)
    if (isAdmin && assignedFilter !== 'all') {
      if (assignedFilter === 'unassigned' && (c.assignedToId || c.assignedFieldEmployeeId)) return false;
      if (assignedFilter !== 'unassigned' && c.assignedToId !== assignedFilter && c.assignedFieldEmployeeId !== assignedFilter) return false;
    }

    return true;
  });

  // Calculate Metrics strictly from accessibleComplaints
  const totalCount = accessibleComplaints.length;
  const newCount = accessibleComplaints.filter(c => c.status === 'New' || c.status === 'Complaint Registered').length;
  const inProcessCount = accessibleComplaints.filter(c => c.status === 'In Process' || c.status === 'Under Review' || c.status === 'Assigned').length;
  const siteVisitCount = accessibleComplaints.filter(c => c.status === 'Site Visit Required' || c.status === 'Field Work in Progress').length;
  const waitingInventoryCount = accessibleComplaints.filter(c => c.status === 'Waiting for Product / Inventory').length;
  const overdueCount = accessibleComplaints.filter(c => c.isOverdue && c.status !== 'Resolved' && c.status !== 'Closed').length;
  const urgentCount = accessibleComplaints.filter(c => (c.priority === 'Urgent' || c.priority === 'High') && c.status !== 'Closed').length;
  const resolvedTodayCount = accessibleComplaints.filter(c => c.status === 'Resolved' && c.resolvedAt && dayjs(c.resolvedAt).isSame(dayjs(), 'day')).length;

  // Priority Badge Color Helper
  const getPriorityBadge = (priority: ComplaintPriority) => {
    switch (priority) {
      case 'Urgent':
        return 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse font-black';
      case 'High':
        return 'bg-orange-100 text-orange-800 border-orange-300 font-extrabold';
      case 'Medium':
        return 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
      case 'Low':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300 font-semibold';
    }
  };

  // Status Badge Color Helper
  const getStatusBadge = (status: ComplaintStatus) => {
    switch (status) {
      case 'New':
      case 'Complaint Registered':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Under Review':
      case 'Observation':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Assigned':
      case 'In Process':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Site Visit Required':
      case 'Field Work in Progress':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Waiting for Product / Inventory':
      case 'Waiting for Customer':
      case 'Waiting for Approval':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Resolved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-300';
      case 'Closed':
        return 'bg-slate-100 text-slate-600 border-slate-300';
      case 'Reopened':
        return 'bg-rose-50 text-rose-700 border-rose-300';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header Toolbar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                {isAdmin ? 'Complaint & Service Box' : 'My Assigned Complaints'}
                <span className="text-xs bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
                  {totalCount} {isAdmin ? 'Total' : 'Assigned to You'}
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                {isAdmin
                  ? 'Track customer complaints, solar defects, field visits, inventory replacements & service requests'
                  : `Showing complaints assigned to ${currentUser?.fullName || 'you'}. Complete service visits and mark resolutions.`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Super Admin Analytics Switcher */}
          {(currentRole === 'super_admin' || currentRole === 'admin') && (
            <button
              onClick={() => setActiveTab(activeTab === 'list' ? 'analytics' : 'list')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'analytics'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>{activeTab === 'analytics' ? 'Show Complaints List' : 'Analytics & Reports'}</span>
            </button>
          )}

          {/* Super Admin Custom Category Manager */}
          {currentRole === 'super_admin' && (
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1 border border-slate-200"
              title="Manage Complaint Categories"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Categories</span>
            </button>
          )}

          {/* + Create Complaint Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm hover:shadow-md cursor-pointer flex items-center space-x-2 border border-emerald-700 active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Create Complaint</span>
          </button>
        </div>
      </div>

      {/* ── Stat KPI Cards Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <button
          onClick={() => { setStatusFilter('all'); setOverdueOnly(false); setPriorityFilter('all'); }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'all' && !overdueOnly ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-102' : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider block opacity-75">All Complaints</span>
          <span className="text-xl font-black">{totalCount}</span>
        </button>

        <button
          onClick={() => { setStatusFilter('New'); setOverdueOnly(false); }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'New' ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-102' : 'bg-white text-slate-800 border-blue-100 hover:border-blue-300'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider block text-blue-600 opacity-90">New</span>
          <span className="text-xl font-black text-blue-700">{newCount}</span>
        </button>

        <button
          onClick={() => { setStatusFilter('In Process'); setOverdueOnly(false); }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'In Process' ? 'bg-amber-600 text-white border-amber-600 shadow-md scale-102' : 'bg-white text-slate-800 border-amber-100 hover:border-amber-300'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider block text-amber-600 opacity-90">In Process</span>
          <span className="text-xl font-black text-amber-700">{inProcessCount}</span>
        </button>

        <button
          onClick={() => { setStatusFilter('Site Visit Required'); setOverdueOnly(false); }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'Site Visit Required' ? 'bg-purple-600 text-white border-purple-600 shadow-md scale-102' : 'bg-white text-slate-800 border-purple-100 hover:border-purple-300'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider block text-purple-600 opacity-90">Field Visit</span>
          <span className="text-xl font-black text-purple-700">{siteVisitCount}</span>
        </button>

        <button
          onClick={() => { setStatusFilter('Waiting for Product / Inventory'); setOverdueOnly(false); }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'Waiting for Product / Inventory' ? 'bg-orange-600 text-white border-orange-600 shadow-md scale-102' : 'bg-white text-slate-800 border-orange-100 hover:border-orange-300'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider block text-orange-600 opacity-90">Inventory Req</span>
          <span className="text-xl font-black text-orange-700">{waitingInventoryCount}</span>
        </button>

        <button
          onClick={() => { setOverdueOnly(true); setStatusFilter('all'); }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            overdueOnly ? 'bg-rose-600 text-white border-rose-600 shadow-md scale-102' : 'bg-rose-50 text-slate-800 border-rose-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider block text-rose-700">Overdue</span>
            {overdueCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping"></span>}
          </div>
          <span className="text-xl font-black text-rose-800">{overdueCount}</span>
        </button>

        <button
          onClick={() => { setPriorityFilter('Urgent'); setOverdueOnly(false); }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            priorityFilter === 'Urgent' ? 'bg-rose-900 text-white border-rose-900 shadow-md scale-102' : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider block text-rose-600">Urgent/High</span>
          <span className="text-xl font-black text-rose-700">{urgentCount}</span>
        </button>

        <button
          onClick={() => { setStatusFilter('Resolved'); setOverdueOnly(false); }}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'Resolved' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md scale-102' : 'bg-white text-slate-800 border-emerald-100 hover:border-emerald-300'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider block text-emerald-600 opacity-90">Resolved Today</span>
          <span className="text-xl font-black text-emerald-700">{resolvedTodayCount}</span>
        </button>
      </div>

      {activeTab === 'list' ? (
        <>
          {/* ── Filters & Search Toolbar ── */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Search Bar */}
              <div className="lg:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search Complaint ID, Customer, Mobile, Address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs">
                    ✕
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="active">All Active Complaints</option>
                {DEFAULT_COMPLAINT_STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {/* Priority Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Priorities</option>
                <option value="Urgent">Urgent / Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Categories</option>
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>

              {/* Customer Type Filter */}
              <select
                value={customerTypeFilter}
                onChange={(e) => setCustomerTypeFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Customer Types</option>
                <option value="existing">Existing Customer</option>
                <option value="new_lead">New Lead / Customer</option>
                <option value="internal">Internal Complaint</option>
              </select>

              {/* Assigned Employee Filter - Admins see dropdown, Employees see assigned badge */}
              {isAdmin ? (
                <select
                  value={assignedFilter}
                  onChange={(e) => setAssignedFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Assigned Staff</option>
                  <option value="unassigned">Unassigned</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                  ))}
                </select>
              ) : (
                <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-1.5 shrink-0">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Assigned to: {currentUser?.fullName || 'Me'}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Complaints Table / Cards List ── */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <div className="w-6 h-6 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs font-semibold">Loading Complaints & Service Records...</p>
              </div>
            ) : filteredComplaints.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <ShieldAlert className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No Complaints Found</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  No complaint records match your active search filters or assigned permissions.
                </p>
                <button
                  onClick={() => { setSearchQuery(''); setStatusFilter('all'); setPriorityFilter('all'); setCategoryFilter('all'); setOverdueOnly(false); }}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Complaint ID</th>
                      <th className="py-3 px-4">Customer / Related</th>
                      <th className="py-3 px-4">Title & Category</th>
                      <th className="py-3 px-4 text-center">Priority</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4">Assigned To</th>
                      <th className="py-3 px-4">Target Date</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredComplaints.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedComplaint(c)}
                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                          c.isOverdue && c.status !== 'Closed' && c.status !== 'Resolved' ? 'bg-rose-50/30' : ''
                        }`}
                      >
                        {/* ID */}
                        <td className="py-3.5 px-4 font-black text-slate-900 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-emerald-700 font-mono">{c.complaintNumber}</span>
                            {c.isOverdue && c.status !== 'Closed' && c.status !== 'Resolved' && (
                              <span className="px-1.5 py-0.5 bg-rose-600 text-white font-black text-[9px] rounded uppercase animate-pulse">
                                Overdue
                              </span>
                            )}
                            {c.reopenCount && c.reopenCount > 0 ? (
                              <span className="px-1 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-extrabold rounded">
                                Reopened ({c.reopenCount})
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Customer Info */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{c.customerName}</div>
                          <div className="text-[11px] text-slate-500 flex items-center space-x-2">
                            <span>📞 {c.mobileNumber}</span>
                            {c.installedCapacityKw && (
                              <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                                ⚡ {c.installedCapacityKw} kW
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Title & Category */}
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="font-bold text-slate-800 truncate" title={c.title}>{c.title}</div>
                          <div className="text-[10px] font-medium text-slate-500">{c.category}</div>
                        </td>

                        {/* Priority */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] border ${getPriorityBadge(c.priority)}`}>
                            {c.priority}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStatusBadge(c.status)}`}>
                              {c.status}
                            </span>
                            {c.resolutionProofImageUrl && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300" title="Geotagged Resolution Proof Photo Attached">
                                <Camera className="w-2.5 h-2.5 text-emerald-700" />
                                <span>GPS Proof</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Assigned To */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-700">
                          {c.assignedToName ? (
                            <div className="flex items-center space-x-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="font-semibold text-slate-800">{c.assignedToName}</span>
                            </div>
                          ) : c.assignedDepartment ? (
                            <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded">
                              🏢 {c.assignedDepartment}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium italic text-[11px]">Unassigned</span>
                          )}
                        </td>

                        {/* Due Date */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                          {c.dueDate ? (
                            <span className={`text-[11px] font-medium ${c.isOverdue && c.status !== 'Closed' ? 'text-rose-600 font-bold' : ''}`}>
                              {dayjs(c.dueDate).format('DD MMM YYYY')}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedComplaint(c); }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            View Details →
                          </button>
                          {(currentRole === 'super_admin' || currentRole === 'admin' || c.createdByUserId === currentUser?.id) && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm(`Are you sure you want to delete complaint ${c.complaintNumber} permanently?`)) {
                                  await complaintService.deleteComplaint(c.id);
                                  loadData();
                                }
                              }}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs transition-colors cursor-pointer border border-rose-200"
                              title="Delete Complaint"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── Super Admin Analytics View ── */
        <ComplaintAnalyticsView complaints={accessibleComplaints} />
      )}

      {/* ── Create Complaint Modal ── */}
      {showCreateModal && (
        <CreateComplaintModal
          leads={leads}
          employees={employees}
          categories={categories}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadData();
          }}
        />
      )}

      {/* ── Complaint Detail Drawer Modal ── */}
      {selectedComplaint && (
        <ComplaintDetailModal
          complaint={selectedComplaint}
          employees={employees}
          products={products}
          categories={categories}
          onClose={() => setSelectedComplaint(null)}
          onUpdate={() => loadData()}
        />
      )}

      {/* ── Custom Category Manager Modal ── */}
      {showCategoryModal && (
        <CategoryConfigModal
          categories={categories}
          onClose={() => setShowCategoryModal(false)}
          onUpdate={() => loadData()}
        />
      )}
    </div>
  );
};

// ==========================================
// CREATE COMPLAINT MODAL COMPONENT
// ==========================================
interface CreateComplaintModalProps {
  leads: Lead[];
  employees: Profile[];
  categories: ComplaintConfigCategory[];
  onClose: () => void;
  onSuccess: () => void;
}

const CreateComplaintModal: React.FC<CreateComplaintModalProps> = ({
  leads,
  employees,
  categories,
  onClose,
  onSuccess
}) => {
  const { currentUser } = useAuthStore();
  const [customerType, setCustomerType] = useState<CustomerType>('existing');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(DEFAULT_COMPLAINT_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ComplaintPriority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [assignedDepartment, setAssignedDepartment] = useState('');

  // Customer Fields
  const [customerName, setCustomerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [alternateNumber, setAlternateNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Nagpur');
  const [pincode, setPincode] = useState('');
  const [companyName, setCompanyName] = useState('');

  // Solar Specs
  const [installedCapacityKw, setInstalledCapacityKw] = useState('');
  const [panelDetails, setPanelDetails] = useState('');
  const [inverterDetails, setInverterDetails] = useState('');
  const [batteryDetails, setBatteryDetails] = useState('');

  // Internal Complaint Details
  const [complaintAgainstDepartment, setComplaintAgainstDepartment] = useState('Inventory');
  const [relatedEmployeeId, setRelatedEmployeeId] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // When Existing Customer is selected from dropdown, auto-fill details
  const handleSelectExistingCustomer = (leadId: string) => {
    setSelectedLeadId(leadId);
    const found = leads.find(l => l.id === leadId);
    if (found) {
      setCustomerName(found.name);
      setMobileNumber(found.phoneNumber);
      setEmail(found.email || '');
      setAddress(found.description || '');
      if (found.requirement) setInstalledCapacityKw(found.requirement);
    }
  };

  // Duplicate Check on Mobile Number change for New Customer
  const handleMobileChange = async (val: string) => {
    setMobileNumber(val);
    if (customerType === 'new_lead' && val.trim().length >= 10) {
      const match = await complaintService.checkDuplicateCustomer(val.trim(), email, customerName);
      if (match) {
        setDuplicateWarning(`Warning: Customer with mobile ${val} already exists as "${match.name}". Consider selecting "Existing Customer".`);
      } else {
        setDuplicateWarning(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !customerName.trim() || !mobileNumber.trim()) {
      alert("Please fill in Title, Customer Name, and Mobile Number.");
      return;
    }

    setSubmitting(true);
    try {
      const assignedEmp = employees.find(e => e.id === assignedToId);
      const relatedEmp = employees.find(e => e.id === relatedEmployeeId);

      await complaintService.createComplaint(
        {
          title,
          category,
          description,
          customerType,
          leadId: customerType === 'existing' ? selectedLeadId : undefined,
          customerName,
          mobileNumber,
          alternateNumber,
          email,
          address,
          city,
          pincode,
          companyName,

          installedCapacityKw,
          panelDetails,
          inverterDetails,
          batteryDetails,

          complaintAgainstDepartment: customerType === 'internal' ? complaintAgainstDepartment : undefined,
          relatedEmployeeId: customerType === 'internal' ? relatedEmployeeId : undefined,
          relatedEmployeeName: relatedEmp?.fullName,

          priority,
          dueDate: dueDate || undefined,
          assignedToId: assignedToId || undefined,
          assignedToName: assignedEmp?.fullName,
          assignedToRole: assignedEmp?.role,
          assignedDepartment: assignedDepartment || undefined
        },
        {
          id: currentUser?.id || 'admin',
          fullName: currentUser?.fullName || 'Admin',
          role: currentUser?.role || 'admin'
        }
      );

      alert("✅ Complaint created successfully!");
      onSuccess();
    } catch (err: any) {
      console.error("Complaint creation error:", err);
      alert("Error creating complaint: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 animate-scale-in">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 p-5 flex justify-between items-center z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
              <Plus className="w-5 h-5 stroke-[3]" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Create New Complaint / Service Request</h2>
              <p className="text-xs text-slate-500 font-medium">Register customer issue, solar defect or internal complaint</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Step 1: Customer Type Selector */}
          <div>
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
              1. Select Customer Type
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => { setCustomerType('existing'); setDuplicateWarning(null); }}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  customerType === 'existing'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-900 shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <UserCheck className={`w-5 h-5 mb-1 ${customerType === 'existing' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div>
                  <div className="text-xs font-black">Existing Customer</div>
                  <div className="text-[10px] opacity-75">Search lead / installation database</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setCustomerType('new_lead'); setSelectedLeadId(''); }}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  customerType === 'new_lead'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-900 shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <UserPlus className={`w-5 h-5 mb-1 ${customerType === 'new_lead' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div>
                  <div className="text-xs font-black">New Lead / Customer</div>
                  <div className="text-[10px] opacity-75">Direct complaint (Kept in Complaints only)</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setCustomerType('internal'); setSelectedLeadId(''); setDuplicateWarning(null); }}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  customerType === 'internal'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-900 shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <Building2 className={`w-5 h-5 mb-1 ${customerType === 'internal' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div>
                  <div className="text-xs font-black">Internal Complaint</div>
                  <div className="text-[10px] opacity-75">Department / Stock / Employee issue</div>
                </div>
              </button>
            </div>
          </div>

          {/* Existing Customer Dropdown Search */}
          {customerType === 'existing' && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <label className="block text-xs font-extrabold text-slate-800">
                Search & Select Existing Customer / Lead:
              </label>
              <select
                value={selectedLeadId}
                onChange={(e) => handleSelectExistingCustomer(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
              >
                <option value="">-- Choose Existing Customer --</option>
                {leads.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name} — {l.phoneNumber} ({l.requirement || 'Solar Customer'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Duplicate Warning Alert */}
          {duplicateWarning && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs font-bold text-amber-800 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{duplicateWarning}</span>
            </div>
          )}

          {/* Customer / Department Information Fields */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              {customerType === 'internal' ? 'Internal Department Details' : 'Customer Contact Details'}
            </h3>

            {customerType === 'internal' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Complaint Against Department</label>
                  <select
                    value={complaintAgainstDepartment}
                    onChange={(e) => setComplaintAgainstDepartment(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                  >
                    <option value="Inventory">Inventory / Store Department</option>
                    <option value="Field">Field / Installation Department</option>
                    <option value="Sales">Sales Department</option>
                    <option value="Service">Service Department</option>
                    <option value="Technical">Technical Department</option>
                    <option value="Accounts">Accounts & Finance</option>
                    <option value="Other">Other Department</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Related Employee (Optional)</label>
                  <select
                    value={relatedEmployeeId}
                    onChange={(e) => setRelatedEmployeeId(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                  >
                    <option value="">-- None / General Department --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.role})</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Customer / Contact Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Full Name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Mobile Number *</label>
                <input
                  type="text"
                  required
                  placeholder="10-digit mobile"
                  value={mobileNumber}
                  onChange={(e) => handleMobileChange(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="email@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Alternate Phone Number</label>
                <input
                  type="text"
                  placeholder="Alternate phone"
                  value={alternateNumber}
                  onChange={(e) => setAlternateNumber(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">City / Region</label>
                <input
                  type="text"
                  placeholder="Nagpur"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Pincode</label>
                <input
                  type="text"
                  placeholder="e.g. 440027"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Company / Firm Name (Optional)</label>
                <input
                  type="text"
                  placeholder="Company Name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Complete Address *</label>
                <input
                  type="text"
                  required
                  placeholder="Full address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>
            </div>

            {/* Optional Solar Specs */}
            {customerType !== 'internal' && (
              <div className="pt-2 border-t border-slate-200">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                  System Specifications (Optional)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block">Capacity (kW)</span>
                    <input
                      type="text"
                      placeholder="e.g. 5kW"
                      value={installedCapacityKw}
                      onChange={(e) => setInstalledCapacityKw(e.target.value)}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block">Panel Make/Model</span>
                    <input
                      type="text"
                      placeholder="e.g. Adani 540W"
                      value={panelDetails}
                      onChange={(e) => setPanelDetails(e.target.value)}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block">Inverter Make/Model</span>
                    <input
                      type="text"
                      placeholder="e.g. UTL 5kVA"
                      value={inverterDetails}
                      onChange={(e) => setInverterDetails(e.target.value)}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block">Battery Make</span>
                    <input
                      type="text"
                      placeholder="e.g. Tubular 150Ah"
                      value={batteryDetails}
                      onChange={(e) => setBatteryDetails(e.target.value)}
                      className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Complaint Core Information */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              2. Complaint Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Complaint Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inverter Error Code E04 / Solar Generation Low"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Priority Level *</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ComplaintPriority)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="Low">Low — Routine Inquiry</option>
                  <option value="Medium">Medium — Standard Attention</option>
                  <option value="High">High — Urgent Service Needed</option>
                  <option value="Urgent">Urgent / Critical — Immediate Action Needed</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Full Description / Issues Observed *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe the complaint in detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Target Resolution Date (SLA Due Date)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Assign To Employee</label>
                <select
                  value={assignedToId}
                  onChange={(e) => setAssignedToId(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="">-- Leave Unassigned --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.role.replace('_', ' ')})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Assign To Department</label>
                <select
                  value={assignedDepartment}
                  onChange={(e) => setAssignedDepartment(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="">-- Select Department --</option>
                  <option value="Service Department">Service Department</option>
                  <option value="Installation Department">Installation Department</option>
                  <option value="Inventory / Store">Inventory / Store</option>
                  <option value="Technical Department">Technical Department</option>
                  <option value="Sales Department">Sales Department</option>
                </select>
              </div>
            </div>
          </div>

          {/* Footer Submit Buttons */}
          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-md cursor-pointer flex items-center space-x-2 border border-emerald-700 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating Complaint...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Register & Save Complaint</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// COMPLAINT DETAIL & MANAGEMENT DRAWER MODAL
// ==========================================
interface ComplaintDetailModalProps {
  complaint: Complaint;
  employees: Profile[];
  products: Product[];
  categories: ComplaintConfigCategory[];
  onClose: () => void;
  onUpdate: () => void;
}

const ComplaintDetailModal: React.FC<ComplaintDetailModalProps> = ({
  complaint,
  employees,
  products,
  categories,
  onClose,
  onUpdate
}) => {
  const { currentUser, currentRole } = useAuthStore();
  const isModalAdmin = currentRole === 'super_admin' || currentRole === 'admin' || currentUser?.role === 'super_admin' || currentUser?.role === 'admin';
  const [activeSubTab, setActiveSubTab] = useState<
    'overview' | 'customer' | 'visits' | 'inventory' | 'notes' | 'timeline' | 'attachments' | 'resolution'
  >('overview');

  // Sub-modal states inside drawer
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showFieldVisitModal, setShowFieldVisitModal] = useState(false);
  const [showInventoryReqModal, setShowInventoryReqModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Action form inputs
  const [newStatus, setNewStatus] = useState<string>(complaint.status);
  const [assigneeId, setAssigneeId] = useState(complaint.assignedToId || '');
  const [assignReason, setAssignReason] = useState('');

  // Field Visit Inputs
  const [fvEmployeeId, setFvEmployeeId] = useState(complaint.assignedFieldEmployeeId || '');
  const [fvDate, setFvDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [fvTime, setFvTime] = useState('10:00 AM');
  const [fvInstructions, setFvInstructions] = useState('');

  // Inventory Request Inputs
  const [invProductId, setInvProductId] = useState('');
  const [invQty, setInvQty] = useState(1);
  const [invNotes, setInvNotes] = useState('');

  // Communication Note Inputs
  const [noteType, setNoteType] = useState<'internal_note' | 'Call' | 'WhatsApp' | 'Email' | 'SMS' | 'Site Visit'>('Call');
  const [noteSummary, setNoteSummary] = useState('');
  const [noteFollowUpDate, setNoteFollowUpDate] = useState('');
  const [noteInternalOnly, setNoteInternalOnly] = useState(false);

  // Resolution Inputs & Mandatory Geotagged Proof States
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [resolutionImageBlob, setResolutionImageBlob] = useState<Blob | null>(null);
  const [resolutionImageDataUrl, setResolutionImageDataUrl] = useState<string | null>(null);
  const [resolutionGps, setResolutionGps] = useState<GpsWatermarkData | null>(null);
  const [isProcessingResolutionGps, setIsProcessingResolutionGps] = useState(false);
  const [resolutionGpsError, setResolutionGpsError] = useState<string | null>(null);
  const [viewingProofImage, setViewingProofImage] = useState<{ url: string; title: string; location?: CashProofLocation } | null>(null);

  // Reopen Input
  const [reopenReason, setReopenReason] = useState('');

  const [saving, setSaving] = useState(false);

  // Process resolution image with device GPS coordinates and canvas watermark
  const handleProcessResolutionImage = async (file: File) => {
    setIsProcessingResolutionGps(true);
    setResolutionGpsError(null);
    try {
      let gps: GpsWatermarkData | null = null;
      try {
        gps = await acquireCurrentGpsLocation();
      } catch (gpsErr: any) {
        console.warn("GPS acquisition note:", gpsErr);
        setResolutionGpsError(gpsErr.message || 'GPS location unavailable');
      }

      const detailLine = `👤 CUSTOMER: ${complaint.customerName} • TICKET: #${complaint.complaintNumber}${workPerformed ? ` • RESOLVED: ${workPerformed}` : ''}`;

      const result = await applyGpsWatermark(file, {
        gps,
        title: '✓ COMPLAINT RESOLUTION VERIFIED PROOF',
        subtitle: 'GREEN ENERGY SOLUTION • VERIFIED AUDIT',
        customDetailLine: detailLine,
        customerName: complaint.customerName,
        locationFallback: 'On-Site Resolution Proof'
      });

      setResolutionImageBlob(result.watermarkedBlob);
      setResolutionImageDataUrl(result.watermarkedDataUrl);
      setResolutionGps(result.gps);
    } catch (err: any) {
      alert("Error processing resolution proof image: " + err.message);
    } finally {
      setIsProcessingResolutionGps(false);
    }
  };

  // Quick Status Update
  const handleQuickStatusChange = async (val: string) => {
    if (val === 'Closed') {
      return;
    }
    if (val === 'Resolved') {
      // Must not bypass mandatory GPS resolution proof photo
      setShowResolveModal(true);
      setNewStatus(complaint.status);
      return;
    }
    setNewStatus(val);
    try {
      await complaintService.updateComplaint(
        complaint.id,
        { status: val },
        { id: currentUser?.id || 'admin', fullName: currentUser?.fullName || 'Admin', role: currentUser?.role || 'admin' }
      );
      onUpdate();
    } catch (err: any) {
      alert("Error updating status: " + err.message);
    }
  };

  // Assign Handler
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigneeId) return;
    setSaving(true);
    try {
      const emp = employees.find(e => e.id === assigneeId);
      await complaintService.assignComplaint(
        complaint.id,
        assigneeId,
        emp?.fullName || 'Employee',
        emp?.role,
        emp?.designation || emp?.role,
        assignReason,
        { id: currentUser?.id || 'admin', fullName: currentUser?.fullName || 'Admin', role: currentUser?.role || 'admin' }
      );
      setShowAssignModal(false);
      onUpdate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Field Visit Schedule Handler
  const handleScheduleVisitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fvEmployeeId || !fvDate) return;
    setSaving(true);
    try {
      const emp = employees.find(e => e.id === fvEmployeeId);
      await complaintService.createFieldVisit(
        complaint.id,
        {
          assignedFieldEmployeeId: fvEmployeeId,
          assignedFieldEmployeeName: emp?.fullName || 'Field Employee',
          visitDate: fvDate,
          visitTime: fvTime,
          instructions: fvInstructions
        },
        { id: currentUser?.id || 'admin', fullName: currentUser?.fullName || 'Admin', role: currentUser?.role || 'admin' }
      );
      setShowFieldVisitModal(false);
      onUpdate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Inventory Request Handler
  const handleInventoryReqSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invProductId) return;
    setSaving(true);
    try {
      const prod = products.find(p => p.id === invProductId);
      await complaintService.requestInventory(
        complaint.id,
        {
          productId: invProductId,
          productName: prod?.name || 'Product',
          requestedQty: Number(invQty) || 1,
          notes: invNotes
        },
        { id: currentUser?.id || 'admin', fullName: currentUser?.fullName || 'Admin', role: currentUser?.role || 'admin' }
      );
      setShowInventoryReqModal(false);
      onUpdate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Communication Note Handler
  const handleAddNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteSummary.trim()) return;
    setSaving(true);
    try {
      await complaintService.addCommunicationNote(
        complaint.id,
        {
          type: noteType,
          summary: noteSummary.trim(),
          nextFollowUpDate: noteFollowUpDate || undefined,
          isInternalOnly: noteInternalOnly
        },
        { id: currentUser?.id || 'admin', fullName: currentUser?.fullName || 'Admin', role: currentUser?.role || 'admin' }
      );
      setNoteSummary('');
      onUpdate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Resolve Handler (Requires mandatory GPS watermarked proof photo)
  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionSummary.trim()) {
      alert("Please enter a resolution summary.");
      return;
    }
    if (!resolutionImageBlob) {
      alert("Mandatory GPS Resolution Proof Photo is required to mark this complaint as resolved. Please upload or capture a photo of the completed work.");
      return;
    }

    setSaving(true);
    try {
      // Upload to Backblaze B2 bucket
      const proofUrl = await uploadImageToFirebase(
        resolutionImageBlob,
        `complaints/${complaint.id}/resolution_proof_${Date.now()}.jpg`
      );

      await complaintService.resolveComplaint(
        complaint.id,
        {
          resolutionSummary,
          workPerformed,
          resolutionProofImageUrl: proofUrl,
          resolutionProofLocation: resolutionGps ? {
            latitude: resolutionGps.latitude,
            longitude: resolutionGps.longitude,
            address: resolutionGps.address,
            timestamp: resolutionGps.timestamp,
            accuracy: resolutionGps.accuracy
          } : undefined
        },
        { id: currentUser?.id || 'admin', fullName: currentUser?.fullName || 'Admin', role: currentUser?.role || 'admin' }
      );
      setShowResolveModal(false);
      setResolutionImageBlob(null);
      setResolutionImageDataUrl(null);
      setResolutionGps(null);
      setResolutionGpsError(null);
      onUpdate();
    } catch (err: any) {
      alert("Failed to resolve complaint: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Reopen Handler
  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) return;
    setSaving(true);
    try {
      await complaintService.reopenComplaint(
        complaint.id,
        reopenReason,
        { id: currentUser?.id || 'admin', fullName: currentUser?.fullName || 'Admin', role: currentUser?.role || 'admin' }
      );
      setShowReopenModal(false);
      onUpdate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-4xl h-full flex flex-col shadow-2xl border-l border-slate-200 overflow-hidden animate-slide-left">
        {/* Drawer Header */}
        <div className="bg-slate-900 text-white p-5 flex justify-between items-start shrink-0">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-emerald-400 font-black text-sm">{complaint.complaintNumber}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-white/10 text-white border border-white/20">
                {(complaint.customerType || 'customer').replace(/_/g, ' ')}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${complaint.priority === 'Urgent' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>
                {complaint.priority} Priority
              </span>
            </div>
            <h2 className="text-lg font-black tracking-tight">{complaint.title}</h2>
            <div className="text-xs text-slate-300 flex items-center space-x-3">
              <span>👤 {complaint.customerName} ({complaint.mobileNumber})</span>
              <span>•</span>
              <span>📅 {dayjs(complaint.createdAt).format('DD MMM YYYY, hh:mm A')}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Quick Action Toolbar */}
        <div className="bg-slate-100 p-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs shrink-0">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-600 text-[11px] uppercase">Status:</span>
            <select
              value={newStatus}
              onChange={(e) => handleQuickStatusChange(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 text-xs focus:outline-none"
            >
              {DEFAULT_COMPLAINT_STATUSES.filter(s => s !== 'Closed').map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            {/* Edit Info Button */}
            <button
              onClick={() => setShowEditModal(true)}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
            >
              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
              <span>Edit Info</span>
            </button>

            {complaint.status !== 'Resolved' && complaint.status !== 'Closed' && (
              <>
                {(isModalAdmin || complaint.createdByUserId === currentUser?.id) && (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Assign</span>
                  </button>
                )}

                <button
                  onClick={() => setShowFieldVisitModal(true)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <MapPin className="w-3.5 h-3.5 text-purple-600" />
                  <span>Field Visit</span>
                </button>

                <button
                  onClick={() => setShowInventoryReqModal(true)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <PackageIcon className="w-3.5 h-3.5 text-orange-600" />
                  <span>Request Inventory</span>
                </button>

                <button
                  onClick={() => setShowResolveModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1 shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Resolve</span>
                </button>
              </>
            )}

            {(complaint.status === 'Resolved' || complaint.status === 'Closed') && (
              <button
                onClick={() => setShowReopenModal(true)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reopen Complaint</span>
              </button>
            )}

            {/* Delete Button */}
            {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin' || complaint.createdByUserId === currentUser?.id) && (
              <button
                onClick={async () => {
                  if (confirm(`Are you sure you want to delete complaint ${complaint.complaintNumber} permanently?`)) {
                    await complaintService.deleteComplaint(complaint.id);
                    onClose();
                    onUpdate();
                  }
                }}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="bg-white border-b border-slate-200 px-4 flex space-x-1 overflow-x-auto text-xs font-bold text-slate-500 shrink-0">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeSubTab === 'overview' ? 'border-emerald-600 text-emerald-700 font-black' : 'border-transparent hover:text-slate-800'
            }`}
          >
            Overview
          </button>

          <button
            onClick={() => setActiveSubTab('customer')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeSubTab === 'customer' ? 'border-emerald-600 text-emerald-700 font-black' : 'border-transparent hover:text-slate-800'
            }`}
          >
            Customer & System Details
          </button>

          <button
            onClick={() => setActiveSubTab('visits')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
              activeSubTab === 'visits' ? 'border-emerald-600 text-emerald-700 font-black' : 'border-transparent hover:text-slate-800'
            }`}
          >
            <span>Field Visits</span>
            {complaint.fieldVisits && complaint.fieldVisits.length > 0 && (
              <span className="bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded-full text-[10px]">
                {complaint.fieldVisits.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('inventory')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
              activeSubTab === 'inventory' ? 'border-emerald-600 text-emerald-700 font-black' : 'border-transparent hover:text-slate-800'
            }`}
          >
            <span>Inventory & Parts</span>
            {complaint.inventoryRequests && complaint.inventoryRequests.length > 0 && (
              <span className="bg-orange-100 text-orange-800 px-1.5 py-0.2 rounded-full text-[10px]">
                {complaint.inventoryRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('notes')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
              activeSubTab === 'notes' ? 'border-emerald-600 text-emerald-700 font-black' : 'border-transparent hover:text-slate-800'
            }`}
          >
            <span>Communication & Notes</span>
            {complaint.communications && complaint.communications.length > 0 && (
              <span className="bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full text-[10px]">
                {complaint.communications.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('timeline')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeSubTab === 'timeline' ? 'border-emerald-600 text-emerald-700 font-black' : 'border-transparent hover:text-slate-800'
            }`}
          >
            Audit Timeline
          </button>

          <button
            onClick={() => setActiveSubTab('resolution')}
            className={`py-3 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeSubTab === 'resolution' ? 'border-emerald-600 text-emerald-700 font-black' : 'border-transparent hover:text-slate-800'
            }`}
          >
            Resolution & Feedback
          </button>
        </div>

        {/* Drawer Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {/* TAB 1: OVERVIEW */}
          {activeSubTab === 'overview' && (
            <div className="space-y-6">
              {/* Description Card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Complaint Overview</h3>
                <p className="text-sm font-semibold text-slate-800 leading-relaxed whitespace-pre-line bg-slate-50 p-4 rounded-xl border border-slate-100">
                  {complaint.description}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Category</span>
                    <span className="font-bold text-slate-800">{complaint.category}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Target Due Date</span>
                    <span className={`font-bold ${complaint.isOverdue ? 'text-rose-600' : 'text-slate-800'}`}>
                      {complaint.dueDate ? dayjs(complaint.dueDate).format('DD MMM YYYY') : 'Not Set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Assigned Staff</span>
                    <span className="font-bold text-slate-800">{complaint.assignedToName || 'Unassigned'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Registered By</span>
                    <span className="font-bold text-slate-800">{complaint.createdByUserName} ({complaint.createdByUserRole})</span>
                  </div>
                </div>
              </div>

              {/* Assignment History Card */}
              {complaint.assignmentHistory && complaint.assignmentHistory.length > 0 && (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Assignment History</h3>
                  <div className="space-y-2">
                    {complaint.assignmentHistory.map(ah => (
                      <div key={ah.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800">Assigned to: {ah.assignedToName}</span>
                          {ah.department && <span className="text-slate-500"> ({ah.department})</span>}
                          <div className="text-[11px] text-slate-500">By {ah.assignedByName} • Reason: {ah.reason}</div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-semibold">{dayjs(ah.assignedAt).format('DD MMM, hh:mm A')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CUSTOMER & SYSTEM DETAILS */}
          {activeSubTab === 'customer' && (
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Customer Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Customer Name</span>
                    <span className="font-bold text-slate-900 text-sm">{complaint.customerName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Mobile Number</span>
                    <span className="font-bold text-slate-900">📞 {complaint.mobileNumber}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Email Address</span>
                    <span className="font-bold text-slate-800">{complaint.email || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">City / Pincode</span>
                    <span className="font-bold text-slate-800">{complaint.city || 'Nagpur'} {complaint.pincode ? `(${complaint.pincode})` : ''}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Complete Address</span>
                    <span className="font-semibold text-slate-800">{complaint.address}</span>
                  </div>
                </div>
              </div>

              {/* Solar System Specs */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Solar Installation Specifications</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-bold block">Capacity (kW)</span>
                    <span className="font-black text-emerald-700 text-sm">{complaint.installedCapacityKw || 'N/A'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-bold block">Panel Details</span>
                    <span className="font-bold text-slate-800">{complaint.panelDetails || 'N/A'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-bold block">Inverter Details</span>
                    <span className="font-bold text-slate-800">{complaint.inverterDetails || 'N/A'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-bold block">Battery Details</span>
                    <span className="font-bold text-slate-800">{complaint.batteryDetails || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FIELD VISITS */}
          {activeSubTab === 'visits' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Scheduled & Completed Site Visits</h3>
                <button
                  onClick={() => setShowFieldVisitModal(true)}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Schedule Site Visit</span>
                </button>
              </div>

              {!complaint.fieldVisits || complaint.fieldVisits.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 space-y-2">
                  <MapPin className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">No Field Visits Scheduled</p>
                  <p className="text-[11px] text-slate-400">Schedule a site visit to send a field employee to inspect or fix issues.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {complaint.fieldVisits.map(v => (
                    <div key={v.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">Assigned: {v.assignedFieldEmployeeName}</div>
                          <div className="text-xs text-slate-500">📅 Date: {v.visitDate} {v.visitTime ? `at ${v.visitTime}` : ''}</div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          v.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                          {v.status}
                        </span>
                      </div>

                      {v.instructions && (
                        <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <strong>Instructions:</strong> {v.instructions}
                        </p>
                      )}

                      {v.workNotes && (
                        <p className="text-xs text-emerald-900 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                          <strong>Work Notes:</strong> {v.workNotes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: INVENTORY & REPLACEMENTS */}
          {activeSubTab === 'inventory' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Requested Replacement Parts & Stock</h3>
                <button
                  onClick={() => setShowInventoryReqModal(true)}
                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Request Product / Part</span>
                </button>
              </div>

              {!complaint.inventoryRequests || complaint.inventoryRequests.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 space-y-2">
                  <PackageIcon className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">No Inventory Material Requested</p>
                  <p className="text-[11px] text-slate-400">Request replacement solar panels, inverters, cables or spare parts.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {complaint.inventoryRequests.map(r => (
                    <div key={r.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex justify-between items-center text-xs">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{r.productName}</div>
                        <div className="text-slate-500">Qty Requested: <strong>{r.requestedQty}</strong> • Requested by {r.requestedBy}</div>
                        {r.serialNumber && <div className="text-emerald-700 font-mono font-bold">Serial Number: {r.serialNumber}</div>}
                      </div>

                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        r.status === 'Issued' ? 'bg-emerald-100 text-emerald-800' :
                        r.status === 'Approved' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: COMMUNICATION & NOTES */}
          {activeSubTab === 'notes' && (
            <div className="space-y-6">
              {/* Add Communication Note Form */}
              <form onSubmit={handleAddNoteSubmit} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Log Communication / Note</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Communication Type</label>
                    <select
                      value={noteType}
                      onChange={(e) => setNoteType(e.target.value as any)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    >
                      <option value="Call">📞 Call with Customer</option>
                      <option value="WhatsApp">💬 WhatsApp Message</option>
                      <option value="Email">✉️ Email Communication</option>
                      <option value="SMS">📱 SMS Message</option>
                      <option value="Site Visit">🚗 Site Visit Discussion</option>
                      <option value="internal_note">🔒 Internal Note (Staff Only)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Next Follow-up Date (Optional)</label>
                    <input
                      type="date"
                      value={noteFollowUpDate}
                      onChange={(e) => setNoteFollowUpDate(e.target.value)}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-5">
                    <input
                      type="checkbox"
                      id="internalOnly"
                      checked={noteInternalOnly}
                      onChange={(e) => setNoteInternalOnly(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="internalOnly" className="text-xs font-bold text-slate-700 cursor-pointer">
                      Internal Note Only (Hide from customer view)
                    </label>
                  </div>
                </div>

                <div>
                  <textarea
                    rows={2}
                    required
                    placeholder="Enter call notes or discussion summary..."
                    value={noteSummary}
                    onChange={(e) => setNoteSummary(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center space-x-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Save Log Note</span>
                  </button>
                </div>
              </form>

              {/* Logs List */}
              <div className="space-y-3">
                {(!complaint.communications || complaint.communications.length === 0) ? (
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs">
                    No communication logs added yet.
                  </div>
                ) : (
                  complaint.communications.map(c => (
                    <div key={c.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900">{c.communicatedByName} ({c.communicatedByRole})</span>
                          <span className="px-2 py-0.5 bg-slate-100 font-extrabold text-[10px] rounded text-slate-700">
                            {c.type}
                          </span>
                          {c.isInternalOnly && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 font-bold text-[9px] rounded">
                              Internal Only
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">{dayjs(c.createdAt).format('DD MMM YYYY, hh:mm A')}</span>
                      </div>
                      <p className="text-slate-800 font-medium whitespace-pre-line bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        {c.summary}
                      </p>
                      {c.nextFollowUpDate && (
                        <div className="text-[11px] font-bold text-emerald-700">
                          📌 Next Follow-up scheduled for: {dayjs(c.nextFollowUpDate).format('DD MMM YYYY')}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 6: AUDIT TIMELINE */}
          {activeSubTab === 'timeline' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Complete Complaint Lifecycle Timeline</h3>
              <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {complaint.timeline?.map((t, i) => (
                  <div key={t.id || i} className="relative pl-8 space-y-1 text-xs">
                    <div className="absolute left-1.5 top-1 w-3 h-3 rounded-full bg-emerald-600 border-2 border-white"></div>
                    <div className="font-bold text-slate-900 flex items-center space-x-2">
                      <span>{t.action}</span>
                      <span className="text-[10px] font-semibold text-slate-400">({dayjs(t.timestamp).format('DD MMM YYYY, hh:mm A')})</span>
                    </div>
                    <div className="text-slate-600">{t.details}</div>
                    <div className="text-[10px] font-semibold text-slate-400">By {t.userName} ({t.userRole})</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: RESOLUTION & FEEDBACK */}
          {activeSubTab === 'resolution' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 text-xs">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Resolution Summary & Verified Proof</h3>

              {complaint.resolvedAt ? (
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-emerald-200/60 pb-2.5">
                    <div>
                      <div className="font-extrabold text-emerald-900 text-sm flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Resolved by {complaint.resolvedByUserName}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Date: {dayjs(complaint.resolvedAt).format('DD MMM YYYY, hh:mm A')}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider">Resolution Summary</div>
                    <div className="text-emerald-900 font-semibold mt-0.5">{complaint.resolutionSummary}</div>
                  </div>

                  {complaint.workPerformed && (
                    <div>
                      <div className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider">Work Performed (What Was Resolved)</div>
                      <div className="text-slate-700 mt-0.5">{complaint.workPerformed}</div>
                    </div>
                  )}

                  {/* Geotagged Resolution Proof Photo Card */}
                  {complaint.resolutionProofImageUrl && (
                    <div className="bg-white rounded-xl p-3.5 border border-emerald-300 shadow-2xs space-y-2.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                          <Camera className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Geotagged Resolution Proof Photo</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          ☁️ Stored in Backblaze B2
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <div
                          onClick={() => setViewingProofImage({
                            url: complaint.resolutionProofImageUrl!,
                            title: `Complaint #${complaint.complaintNumber} - Resolution Proof`,
                            location: complaint.resolutionProofLocation
                          })}
                          className="relative group cursor-pointer shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-900 w-32 h-24 flex items-center justify-center shadow-xs"
                        >
                          <img
                            src={complaint.resolutionProofImageUrl}
                            alt="Resolution Proof"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Eye className="w-5 h-5" />
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          {complaint.resolutionProofLocation && typeof complaint.resolutionProofLocation.latitude === 'number' && (
                            <div className="font-mono text-[11px] font-bold text-slate-800 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span>
                                {Math.abs(complaint.resolutionProofLocation.latitude).toFixed(6)}° {complaint.resolutionProofLocation.latitude >= 0 ? 'N' : 'S'}, {Math.abs(complaint.resolutionProofLocation.longitude).toFixed(6)}° {complaint.resolutionProofLocation.longitude >= 0 ? 'E' : 'W'}
                              </span>
                            </div>
                          )}
                          {complaint.resolutionProofLocation?.address && (
                            <p className="text-[11px] text-slate-600 font-medium">
                              📍 {complaint.resolutionProofLocation.address}
                            </p>
                          )}
                          <div className="pt-0.5">
                            <button
                              type="button"
                              onClick={() => setViewingProofImage({
                                url: complaint.resolutionProofImageUrl!,
                                title: `Complaint #${complaint.complaintNumber} - Resolution Proof`,
                                location: complaint.resolutionProofLocation
                              })}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Inspect Proof Photo</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 font-bold">
                  Complaint is currently active and not yet marked as resolved.
                </div>
              )}

              {complaint.customerFeedback && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-800">Customer Rating:</span>
                    <div className="flex text-amber-400">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star key={star} className={`w-4 h-4 ${star <= (complaint.customerRating || 5) ? 'fill-amber-400' : 'text-slate-300'}`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-slate-700 font-medium">{complaint.customerFeedback}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sub Modals inside Drawer */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <form onSubmit={handleAssignSubmit} className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 border border-slate-200 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900">Assign Complaint</h3>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Select Employee</label>
              <select
                required
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
              >
                <option value="">-- Choose Employee --</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Reason / Instructions</label>
              <input
                type="text"
                placeholder="Reason for assignment"
                value={assignReason}
                onChange={(e) => setAssignReason(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowAssignModal(false)} className="px-3 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs">Assign</button>
            </div>
          </form>
        </div>
      )}

      {showFieldVisitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <form onSubmit={handleScheduleVisitSubmit} className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 border border-slate-200 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900">Schedule Field Visit</h3>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Assign Field Employee *</label>
              <select
                required
                value={fvEmployeeId}
                onChange={(e) => setFvEmployeeId(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
              >
                <option value="">-- Select Field Employee --</option>
                {employees.filter(e => e.role === 'field_employee' || e.role === 'admin').map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Visit Date *</label>
                <input
                  type="date"
                  required
                  value={fvDate}
                  onChange={(e) => setFvDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Visit Time</label>
                <input
                  type="text"
                  placeholder="e.g. 10:00 AM"
                  value={fvTime}
                  onChange={(e) => setFvTime(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Instructions for Field Employee</label>
              <textarea
                rows={2}
                placeholder="What to check or fix..."
                value={fvInstructions}
                onChange={(e) => setFvInstructions(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowFieldVisitModal(false)} className="px-3 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl text-xs">Schedule Visit</button>
            </div>
          </form>
        </div>
      )}

      {showInventoryReqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <form onSubmit={handleInventoryReqSubmit} className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 border border-slate-200 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900">Request Replacement Inventory</h3>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Select Product / Component *</label>
              <select
                required
                value={invProductId}
                onChange={(e) => setInvProductId(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
              >
                <option value="">-- Choose Catalog Product --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Quantity *</label>
              <input
                type="number"
                min={1}
                required
                value={invQty}
                onChange={(e) => setInvQty(Number(e.target.value))}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Notes / Replacement Reason</label>
              <input
                type="text"
                placeholder="Reason for replacement"
                value={invNotes}
                onChange={(e) => setInvNotes(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowInventoryReqModal(false)} className="px-3 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-600 text-white font-bold rounded-xl text-xs">Request Material</button>
            </div>
          </form>
        </div>
      )}

      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <form onSubmit={handleResolveSubmit} className="bg-white rounded-2xl p-5 sm:p-6 max-w-lg w-full space-y-4 border border-slate-200 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Resolve Complaint #{complaint.complaintNumber}</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Capture or upload GPS-watermarked resolution proof</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowResolveModal(false);
                  setResolutionImageBlob(null);
                  setResolutionImageDataUrl(null);
                  setResolutionGps(null);
                  setResolutionGpsError(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Mandatory Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-900 leading-relaxed font-medium">
                  <strong className="font-bold">Mandatory Verification:</strong> A photo of what was resolved must be provided with verified real-time GPS coordinates. The photo will be permanently stamped and securely stored in Backblaze B2.
                </div>
              </div>

              {/* Resolution Summary */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Resolution Summary *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Describe how the complaint was resolved..."
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Work Performed */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Work Performed (What was resolved) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Replaced MC4 connector and rebooted solar inverter"
                  value={workPerformed}
                  onChange={(e) => setWorkPerformed(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Mandatory Geotagged Resolution Photo Section */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1 rounded-md bg-emerald-600 text-white shadow-2xs">
                      <Camera className="w-3.5 h-3.5" />
                    </span>
                    <label className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Resolution Proof Photo *
                    </label>
                  </div>
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    Required for Resolution
                  </span>
                </div>

                {isProcessingResolutionGps ? (
                  <div className="py-6 flex flex-col items-center justify-center space-y-2 bg-white rounded-xl border border-dashed border-emerald-300">
                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                    <span className="text-xs font-bold text-emerald-800">Acquiring GPS coordinates & stamping watermark...</span>
                    <span className="text-[10px] text-slate-500">Please allow location access if prompted by your browser.</span>
                  </div>
                ) : !resolutionImageDataUrl ? (
                  <label className="flex flex-col items-center justify-center py-6 px-4 bg-white hover:bg-emerald-50/50 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl cursor-pointer transition-all group">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform mb-2">
                      <Camera className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-emerald-800">
                      Take Photo or Upload Proof
                    </span>
                    <span className="text-[10px] text-slate-500 text-center mt-1">
                      Camera capture supported on mobile. GPS coordinates (Lat/Lng) will be automatically fetched & stamped.
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleProcessResolutionImage(file);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="bg-white rounded-xl p-3 border border-emerald-300 shadow-2xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>GPS Watermark Stamped</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          ☁️ Backblaze B2 Ready
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingProofImage({
                            url: resolutionImageDataUrl,
                            title: `Resolution Proof - Complaint #${complaint.complaintNumber}`,
                            location: resolutionGps || undefined
                          })}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border border-slate-200"
                        >
                          <Eye className="w-3 h-3 text-slate-600" />
                          <span>Inspect</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResolutionImageBlob(null);
                            setResolutionImageDataUrl(null);
                            setResolutionGps(null);
                            setResolutionGpsError(null);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Remove photo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <img
                        src={resolutionImageDataUrl}
                        alt="Watermarked Resolution Preview"
                        onClick={() => setViewingProofImage({
                          url: resolutionImageDataUrl,
                          title: `Resolution Proof - Complaint #${complaint.complaintNumber}`,
                          location: resolutionGps || undefined
                        })}
                        className="w-24 h-16 object-cover rounded-lg border border-slate-200 cursor-pointer shadow-2xs hover:opacity-95"
                      />
                      <div className="space-y-1 text-xs">
                        {resolutionGps && typeof resolutionGps.latitude === 'number' && resolutionGps.latitude !== 0 && (
                          <div className="font-mono text-[11px] font-bold text-slate-800 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>
                              {Math.abs(resolutionGps.latitude).toFixed(6)}° {resolutionGps.latitude >= 0 ? 'N' : 'S'}, {Math.abs(resolutionGps.longitude).toFixed(6)}° {resolutionGps.longitude >= 0 ? 'E' : 'W'}
                            </span>
                          </div>
                        )}
                        {resolutionGps?.address && (
                          <p className="text-[10px] text-slate-500 font-medium line-clamp-1 max-w-xs">
                            📍 {resolutionGps.address}
                          </p>
                        )}
                        <label className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer underline inline-block">
                          Retake photo
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleProcessResolutionImage(file);
                                e.target.value = '';
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {resolutionGpsError && (
                  <p className="text-[10px] text-amber-700 font-medium">
                    ⚠️ {resolutionGpsError} (Timestamp stamp applied)
                  </p>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowResolveModal(false);
                  setResolutionImageBlob(null);
                  setResolutionImageDataUrl(null);
                  setResolutionGps(null);
                  setResolutionGpsError(null);
                }}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving || isProcessingResolutionGps || !resolutionImageBlob || !resolutionSummary.trim() || !workPerformed.trim()}
                title={!resolutionImageBlob ? 'Please take or upload a resolution photo first' : 'Confirm and resolve complaint'}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Uploading & Resolving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm & Mark as Resolved</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <form onSubmit={handleReopenSubmit} className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 border border-slate-200 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900">Reopen Complaint</h3>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Reason for Reopening *</label>
              <textarea
                rows={3}
                required
                placeholder="Why is this complaint being reopened..."
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowReopenModal(false)} className="px-3 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-amber-600 text-white font-bold rounded-xl text-xs">Reopen Complaint</button>
            </div>
          </form>
        </div>
      )}

      {/* Geotagged Resolution Proof Fullscreen Modal */}
      {viewingProofImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{viewingProofImage.title}</h3>
                  <p className="text-[10px] text-slate-400">Geotagged Resolution Proof (Stored in Backblaze B2)</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={viewingProofImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={`complaint_resolution_proof_${Date.now()}.jpg`}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="Download Geotagged Photo"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setViewingProofImage(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Photo Viewer */}
            <div className="flex-1 bg-slate-950 p-2 sm:p-4 overflow-auto flex items-center justify-center min-h-[360px]">
              <img
                src={viewingProofImage.url}
                alt="Geotagged Resolution Proof"
                className="max-w-full max-h-[64vh] object-contain rounded-xl border border-slate-800 shadow-2xl"
              />
            </div>

            {/* Location Footer */}
            {viewingProofImage.location && (
              <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-mono font-bold">
                    {Math.abs(viewingProofImage.location.latitude).toFixed(6)}° {viewingProofImage.location.latitude >= 0 ? 'N' : 'S'}, {Math.abs(viewingProofImage.location.longitude).toFixed(6)}° {viewingProofImage.location.longitude >= 0 ? 'E' : 'W'}
                  </span>
                  {viewingProofImage.location.address && (
                    <span className="text-slate-500 font-medium truncate max-w-sm">
                      • {viewingProofImage.location.address}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 font-medium">
                  Recorded: {viewingProofImage.location.timestamp}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {showEditModal && (
        <EditComplaintModal
          complaint={complaint}
          employees={employees}
          categories={categories}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            onUpdate();
          }}
        />
      )}
    </div>
  );
};

// ==========================================
// EDIT COMPLAINT MODAL COMPONENT
// ==========================================
interface EditComplaintModalProps {
  complaint: Complaint;
  employees: Profile[];
  categories: ComplaintConfigCategory[];
  onClose: () => void;
  onSuccess: () => void;
}

const EditComplaintModal: React.FC<EditComplaintModalProps> = ({
  complaint,
  employees,
  categories,
  onClose,
  onSuccess
}) => {
  const { currentUser } = useAuthStore();
  const [title, setTitle] = useState(complaint.title || '');
  const [category, setCategory] = useState(complaint.category || categories[0]?.name || '');
  const [description, setDescription] = useState(complaint.description || '');
  const [priority, setPriority] = useState<ComplaintPriority>(complaint.priority || 'Medium');
  const [dueDate, setDueDate] = useState(complaint.dueDate || '');
  const [assignedToId, setAssignedToId] = useState(complaint.assignedToId || '');
  const [assignedDepartment, setAssignedDepartment] = useState(complaint.assignedDepartment || '');

  // Customer Fields
  const [customerName, setCustomerName] = useState(complaint.customerName || '');
  const [mobileNumber, setMobileNumber] = useState(complaint.mobileNumber || '');
  const [alternateNumber, setAlternateNumber] = useState(complaint.alternateNumber || '');
  const [email, setEmail] = useState(complaint.email || '');
  const [address, setAddress] = useState(complaint.address || '');
  const [city, setCity] = useState(complaint.city || 'Nagpur');
  const [pincode, setPincode] = useState(complaint.pincode || '');
  const [companyName, setCompanyName] = useState(complaint.companyName || '');

  // Solar Specs
  const [installedCapacityKw, setInstalledCapacityKw] = useState(complaint.installedCapacityKw || '');
  const [panelDetails, setPanelDetails] = useState(complaint.panelDetails || '');
  const [inverterDetails, setInverterDetails] = useState(complaint.inverterDetails || '');
  const [batteryDetails, setBatteryDetails] = useState(complaint.batteryDetails || '');

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !customerName.trim() || !mobileNumber.trim()) {
      alert("Please fill in Title, Customer Name, and Mobile Number.");
      return;
    }

    setSubmitting(true);
    try {
      const assignedEmp = employees.find(e => e.id === assignedToId);

      await complaintService.updateComplaint(
        complaint.id,
        {
          title: title.trim(),
          category,
          description: description.trim(),
          priority,
          dueDate: dueDate || undefined,
          customerName: customerName.trim(),
          mobileNumber: mobileNumber.trim(),
          alternateNumber: alternateNumber.trim(),
          email: email.trim(),
          address: address.trim(),
          city: city.trim(),
          pincode: pincode.trim(),
          companyName: companyName.trim(),

          installedCapacityKw: installedCapacityKw.trim(),
          panelDetails: panelDetails.trim(),
          inverterDetails: inverterDetails.trim(),
          batteryDetails: batteryDetails.trim(),

          assignedToId: assignedToId || undefined,
          assignedToName: assignedEmp?.fullName,
          assignedToRole: assignedEmp?.role,
          assignedDepartment: assignedDepartment || undefined
        },
        {
          id: currentUser?.id || 'admin',
          fullName: currentUser?.fullName || 'Admin',
          role: currentUser?.role || 'admin'
        },
        `Complaint details updated by ${currentUser?.fullName || 'Admin'}`
      );

      alert("✅ Complaint information updated successfully!");
      onSuccess();
    } catch (err: any) {
      console.error("Complaint update error:", err);
      alert("Error updating complaint: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 animate-scale-in">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 p-5 flex justify-between items-center z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
              <Edit3 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Edit Complaint Details ({complaint.complaintNumber})</h2>
              <p className="text-xs text-slate-500 font-medium">Update complaint description, customer details, SLA date, or staff assignments</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Customer Details */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Customer Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Customer / Contact Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Mobile Number *</label>
                <input
                  type="text"
                  required
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Alternate Phone Number</label>
                <input
                  type="text"
                  value={alternateNumber}
                  onChange={(e) => setAlternateNumber(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">City / Region</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Pincode</label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Complete Address *</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                />
              </div>
            </div>

            {/* System Specs */}
            <div className="pt-2 border-t border-slate-200">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                System Specifications
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold block">Capacity (kW)</span>
                  <input
                    type="text"
                    value={installedCapacityKw}
                    onChange={(e) => setInstalledCapacityKw(e.target.value)}
                    className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold block">Panel Specs</span>
                  <input
                    type="text"
                    value={panelDetails}
                    onChange={(e) => setPanelDetails(e.target.value)}
                    className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold block">Inverter Specs</span>
                  <input
                    type="text"
                    value={inverterDetails}
                    onChange={(e) => setInverterDetails(e.target.value)}
                    className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold block">Battery Specs</span>
                  <input
                    type="text"
                    value={batteryDetails}
                    onChange={(e) => setBatteryDetails(e.target.value)}
                    className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Complaint Core Details */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Complaint Core Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Complaint Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Priority Level *</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ComplaintPriority)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="Low">Low — Routine Inquiry</option>
                  <option value="Medium">Medium — Standard Attention</option>
                  <option value="High">High — Urgent Service Needed</option>
                  <option value="Urgent">Urgent / Critical — Immediate Action Needed</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Full Description *</label>
                <textarea
                  rows={3}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Target Resolution Date (SLA Due Date)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Assign To Employee</label>
                <select
                  value={assignedToId}
                  onChange={(e) => setAssignedToId(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="">-- Leave Unassigned --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.role.replace('_', ' ')})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Assign To Department</label>
                <select
                  value={assignedDepartment}
                  onChange={(e) => setAssignedDepartment(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="">-- Select Department --</option>
                  <option value="Service Department">Service Department</option>
                  <option value="Installation Department">Installation Department</option>
                  <option value="Inventory / Store">Inventory / Store</option>
                  <option value="Technical Department">Technical Department</option>
                  <option value="Sales Department">Sales Department</option>
                </select>
              </div>
            </div>
          </div>

          {/* Footer Submit Buttons */}
          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-md cursor-pointer flex items-center space-x-2 border border-blue-700 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Update & Save Complaint</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// CATEGORY CONFIG MODAL COMPONENT (Super Admin)
// ==========================================
interface CategoryConfigModalProps {
  categories: ComplaintConfigCategory[];
  onClose: () => void;
  onUpdate: () => void;
}

const CategoryConfigModal: React.FC<CategoryConfigModalProps> = ({
  categories,
  onClose,
  onUpdate
}) => {
  const [newCatName, setNewCatName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setAdding(true);
    try {
      await complaintService.addCategory(newCatName.trim());
      setNewCatName('');
      onUpdate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 border border-slate-200 shadow-2xl">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h3 className="text-sm font-black text-slate-900">Manage Complaint Categories</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleAdd} className="flex space-x-2">
          <input
            type="text"
            placeholder="Add new custom category..."
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            className="flex-1 p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold"
          />
          <button type="submit" disabled={adding} className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs">
            Add
          </button>
        </form>

        <div className="max-h-60 overflow-y-auto space-y-1.5 pt-2">
          {categories.map(c => (
            <div key={c.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-800 flex justify-between">
              <span>{c.name}</span>
              {c.isCustom && <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-black">Custom</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// COMPLAINT ANALYTICS VIEW COMPONENT
// ==========================================
const ComplaintAnalyticsView: React.FC<{ complaints: Complaint[] }> = ({ complaints }) => {
  const total = complaints.length;

  // Breakdown by Category
  const categoryCounts: { [key: string]: number } = {};
  complaints.forEach(c => {
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  });

  // Breakdown by Priority
  const priorityCounts = {
    Urgent: complaints.filter(c => c.priority === 'Urgent').length,
    High: complaints.filter(c => c.priority === 'High').length,
    Medium: complaints.filter(c => c.priority === 'Medium').length,
    Low: complaints.filter(c => c.priority === 'Low').length
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Category Breakdown Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-black text-slate-900">Complaints by Category</h3>
          <div className="space-y-2">
            {Object.entries(categoryCounts).map(([cat, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-800">{cat}</span>
                    <span className="text-slate-500">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Priority Breakdown Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-black text-slate-900">Complaints by Priority Level</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-center">
              <span className="text-xs font-bold text-rose-800 block">Urgent</span>
              <span className="text-2xl font-black text-rose-900">{priorityCounts.Urgent}</span>
            </div>
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl text-center">
              <span className="text-xs font-bold text-orange-800 block">High</span>
              <span className="text-2xl font-black text-orange-900">{priorityCounts.High}</span>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center">
              <span className="text-xs font-bold text-amber-800 block">Medium</span>
              <span className="text-2xl font-black text-amber-900">{priorityCounts.Medium}</span>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
              <span className="text-xs font-bold text-slate-700 block">Low</span>
              <span className="text-2xl font-black text-slate-900">{priorityCounts.Low}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
