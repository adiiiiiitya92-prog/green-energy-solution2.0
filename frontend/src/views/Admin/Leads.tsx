import React, { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { leadService, filterLeadsForUser } from '../../services/leadService';
import { challanService } from '../../services/challanService';
import { quotationService, getCleanWhatsAppPhone, getQuotationTotalAmount } from '../../services/quotationService';
import { shareQuotationViaWhatsapp } from '../../services/quotationShareService';
import { orderService } from '../../services/orderService';
import { employeeService } from '../../services/employeeService';
import { mapService } from '../../services/mapService';
import { pdfService } from '../../services/pdfService';
import { productService } from '../../services/productService';
import type { Lead, Quotation, OrderConfirmation, Profile, ClientDocument, ClientRegistration, InstallationPhoto, ReleaseDocument, QuotationItem, PaymentInstallment, Product } from '../../types';
import { Timeline } from '../../components/Pipeline/Timeline';
import { SignatureCapture } from '../../components/Signature/SignatureCapture';
import { compressImage } from '../../services/imageCompressionService';
import { uploadImageToFirebase, uploadPdfToFirebase } from '../../services/firebase';
import { DcrDocument } from './DcrDocument';
import { WcrDocument } from './WcrDocument';
import { ModelAgreementDocument } from './ModelAgreementDocument';
import { CfaAgreementDocument } from './CfaAgreementDocument';
import { AnnexureProformaDocument } from './AnnexureProformaDocument';
import { QuotationDocument } from './QuotationDocument';
import { getCachedPdfBlob, ensurePdfBlobForQuotation } from '../../services/pdfCacheService';
import { FollowUpReminders } from '../../components/Common/FollowUpReminders';
import {
  Search, Plus, Camera, CheckSquare, UploadCloud,
  ChevronLeft, Trash2, Send, Star, FileCheck, CheckCircle, Compass, X, Eye, Download,
  CreditCard, Wallet, Edit3, MessageSquare, Bell, Flame, FileText,
  BarChart3, FileSpreadsheet, Printer, Calendar, RotateCcw, Sparkles, Truck, AlertCircle
} from 'lucide-react';
import dayjs from 'dayjs';

export interface LeadReportItem {
  leadId: string;
  name: string;
  phone: string;
  requirement: string;
  status: Lead['status'];
  assignedSalesName: string;
  assignedAdminName: string;
  createdAt: string;
  totalValue: number;
  paidAmount: number;
  pendingBalance: number;
  paymentStatus: 'Fully Paid' | 'Partially Paid' | 'Pending' | 'No Quote';
  installmentCount: number;
}

export const formatCleanLeadRequirement = (req?: string): string => {
  if (!req) return 'Solar Installation';
  return req.replace(/^New Complaint Lead:\s*/i, '').trim() || 'Solar Installation';
};

export const formatCleanLeadDescription = (desc?: string): string => {
  if (!desc) return '';
  return desc
    .replace(/^Created automatically via Complaint Box\s*\[.*?\]\.?\s*/gi, '')
    .trim();
};

export const Leads: React.FC = () => {
  const { currentRole, currentUser } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  
  // In-memory PDF blob cache for instant download/share (keyed by quotation ID)
  const pdfBlobCache = useRef<Map<string, Blob>>(new Map());

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [hotFilter, setHotFilter] = useState<'all' | 'hot' | 'normal'>('all');
  const [dispatchFilter, setDispatchFilter] = useState<'all' | 'dispatched' | 'not_dispatched'>('all');
  const [rawFilter, setRawFilter] = useState<'all' | 'raw' | 'process_done_payment_pending' | 'advanced'>('all');
  const [dispatchedLeadIds, setDispatchedLeadIds] = useState<Set<string>>(new Set());

  // Selected Lead (Details View) — restore from sessionStorage on refresh
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [mainTab, setMainTab] = useState<'pipeline' | 'reminders' | 'reports'>('pipeline');
  const [activeTab, setActiveTab] = useState<'timeline' | 'quotation' | 'order' | 'installation' | 'registration' | 'documentation'>(
    () => (sessionStorage.getItem('leads_activeTab') as any) || 'timeline'
  );
  const [docSubTab, setDocSubTab] = useState<'dcr' | 'wcr' | 'model_agreement' | 'cfa_agreement' | 'annexure_proforma'>('dcr');

  // Wrapper to persist active tab to sessionStorage
  const switchTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    sessionStorage.setItem('leads_activeTab', tab);
  };

  // Form: Create Lead
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadRequirement, setLeadRequirement] = useState('');
  const [leadDescription, setLeadDescription] = useState('');
  const [leadAssignedSalesPersonId, setLeadAssignedSalesPersonId] = useState('');
  const [leadAssignedAdminId, setLeadAssignedAdminId] = useState('');
  const [leadIsHot, setLeadIsHot] = useState(false);
  const [leadFollowUpDate, setLeadFollowUpDate] = useState('');
  const [leadFollowUpNotes, setLeadFollowUpNotes] = useState('');

  // Form: Edit Lead
  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRequirement, setEditRequirement] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<Lead['status']>('new');
  const [editIsHot, setEditIsHot] = useState(false);
  const [editAssignedSalesPersonId, setEditAssignedSalesPersonId] = useState('');
  const [editAssignedAdminId, setEditAssignedAdminId] = useState('');
  const [editFollowUpDate, setEditFollowUpDate] = useState('');
  const [editFollowUpNotes, setEditFollowUpNotes] = useState('');
  const [editInstallationRemark, setEditInstallationRemark] = useState('');
  const [isSavingEditLead, setIsSavingEditLead] = useState(false);

  useEffect(() => {
    if (leadToEdit) {
      setEditName(leadToEdit.name || '');
      setEditPhone(leadToEdit.phoneNumber || '');
      setEditEmail(leadToEdit.email || '');
      setEditRequirement(leadToEdit.requirement || '');
      setEditDescription(leadToEdit.description || '');
      setEditStatus(leadToEdit.status || 'new');
      setEditIsHot(Boolean(leadToEdit.isHot || (leadToEdit.clientRating && leadToEdit.clientRating >= 4)));
      setEditAssignedSalesPersonId(leadToEdit.assignedSalesPersonId || leadToEdit.assignedEmployeeId || '');
      setEditAssignedAdminId(leadToEdit.assignedAdminId || '');
      setEditFollowUpDate(leadToEdit.nextFollowUpDate || '');
      setEditFollowUpNotes(leadToEdit.followUpNotes || '');
      setEditInstallationRemark(leadToEdit.installationRemark || '');
    }
  }, [leadToEdit]);

  // Quotation Creator States
  const [quoteFollowUp, setQuoteFollowUp] = useState('');
  const [followUpSavedToast, setFollowUpSavedToast] = useState(false);
  const [hasAdminQuotation, setHasAdminQuotation] = useState<boolean>(false);

  // PDF Preview Modal State
  const [selectedQuotationForPreview, setSelectedQuotationForPreview] = useState<Quotation | null>(null);
  const [isQuotationViewOnly, setIsQuotationViewOnly] = useState<boolean>(true);

  /** Try to get a PDF Blob from saved data, otherwise regenerate it on-the-fly.
   *  Uses persistent CacheStorage for instant 0ms repeat access across screens and refreshes. */
  const [pdfLoadingMsg, setPdfLoadingMsg] = useState<string | null>(null);

  const resolvePdfBlob = async (q: Quotation): Promise<Blob> => {
    setPdfLoadingMsg('Preparing HD 8-Page Solar Proposal PDF... (Page 1/8)');
    try {
      const leadMatch = leads.find(l => l.id === q.leadId) || selectedLead;
      const blob = await ensurePdfBlobForQuotation(
        q,
        leadMatch,
        q.createdBy || 'Admin',
        (cur, total) => setPdfLoadingMsg(`Preparing HD 8-Page Solar Proposal PDF... (Page ${cur}/${total})`)
      );
      if (blob) pdfBlobCache.current.set(q.id, blob);
      return blob;
    } finally {
      setPdfLoadingMsg(null);
    }
  };

  const handleViewPdf = async (q: Quotation) => {
    setSelectedQuotationForPreview(q);
    setIsQuotationViewOnly(true);
  };

  const handleEditQuotation = async (q: Quotation) => {
    setSelectedQuotationForPreview(q);
    setIsQuotationViewOnly(false);
  };

  const handleDownloadPdf = async (q: Quotation) => {
    try {
      const blob = await resolvePdfBlob(q);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Solar_Quotation_${q.quotationNumber || (q as any).proposalId || 'EST'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error("Error downloading PDF:", err);
      alert('Error downloading PDF proposal.');
    }
  };

  const handleDeleteQuotation = async (q: Quotation) => {
    const confirmed = window.confirm(`Are you sure you want to delete quotation ${q.quotationNumber}?\n\nThis action cannot be undone.`);
    if (!confirmed) return;
    try {
      await quotationService.deleteQuotation(q.id);
      localStorage.removeItem(`quotation_${q.leadId}`);
      alert(`✅ Quotation ${q.quotationNumber} deleted successfully.`);
    } catch (err) {
      console.error('Error deleting quotation:', err);
      alert('Error deleting quotation.');
    }
  };

  // Order Booking & Payment Installments States
  const [existingOc, setExistingOc] = useState<OrderConfirmation | null>(null);
  const [bookingItems, setBookingItems] = useState<QuotationItem[]>([]);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState<OrderConfirmation['paymentMode']>('utr');
  const [paymentReference, setPaymentReference] = useState('');
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [isBookingOrder, setIsBookingOrder] = useState(false);

  // Subsequent Installments (2nd, 3rd, 4th payment) States
  const [subsequentAmount, setSubsequentAmount] = useState<number>(0);
  const [subsequentPaymentMode, setSubsequentPaymentMode] = useState<OrderConfirmation['paymentMode']>('utr');
  const [subsequentReference, setSubsequentReference] = useState<string>('');
  const [subsequentNotes, setSubsequentNotes] = useState<string>('');
  const [isRecordingPayment, setIsRecordingPayment] = useState<boolean>(false);

  // KYC Document Slots States
  const [kycDocs, setKycDocs] = useState<ClientDocument[]>([]);
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

  // Client Registration Checklist States
  const [regChecklist, setRegChecklist] = useState<ClientRegistration | null>(null);

  // Installation Quality & Remark States
  const [installPhotos, setInstallPhotos] = useState<InstallationPhoto[]>([]);
  const [isCapturingInstall, setIsCapturingInstall] = useState(false);
  const [installPhotoType, setInstallPhotoType] = useState<InstallationPhoto['photoType']>('earthing');
  const [isLocatingInstall, setIsLocatingInstall] = useState(false);
  const [installRemarkText, setInstallRemarkText] = useState('');
  const [isSavingInstallRemark, setIsSavingInstallRemark] = useState(false);
  const [saveRemarkSuccess, setSaveRemarkSuccess] = useState(false);

  const handleSaveInstallRemark = async () => {
    if (!selectedLead) return;
    setIsSavingInstallRemark(true);
    try {
      const updatedRemark = installRemarkText.trim();
      await leadService.updateLead(selectedLead.id, { installationRemark: updatedRemark });
      setSelectedLead((prev) => (prev ? { ...prev, installationRemark: updatedRemark } : null));
      setSaveRemarkSuccess(true);
      setTimeout(() => setSaveRemarkSuccess(false), 2500);
    } catch (err) {
      console.error('Error saving installation remark:', err);
      alert('Failed to save installation remark.');
    } finally {
      setIsSavingInstallRemark(false);
    }
  };

  // Release Dept states
  const [releaseNotes, setReleaseNotes] = useState('');
  const [releaseDocs, setReleaseDocs] = useState<ReleaseDocument[]>([]);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string; type: string } | null>(null);
  const [editingDocData, setEditingDocData] = useState<any>(null);

  // Analytics & Financial Summary Reports States
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportItems, setReportItems] = useState<LeadReportItem[]>([]);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [reportStageFilter, setReportStageFilter] = useState('');
  const [reportPaymentFilter, setReportPaymentFilter] = useState('');
  const [reportTimeFilter, setReportTimeFilter] = useState<'all' | 'today' | 'week' | 'month' | 'year' | 'custom'>('all');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'pending' | 'partially_paid' | 'fully_paid' | 'no_quote'>('all');

  const leadFinancialMap = React.useMemo(() => {
    const map: Record<string, LeadReportItem> = {};
    reportItems.forEach(item => {
      map[item.leadId] = item;
    });
    return map;
  }, [reportItems]);

  // Auto-save & restore draft for New Lead modal
  const [hasLeadDraftRestored, setHasLeadDraftRestored] = useState(false);

  useEffect(() => {
    const savedDraft = localStorage.getItem('draft_lead_form');
    if (savedDraft) {
      try {
        const d = JSON.parse(savedDraft);
        if (d.leadName) setLeadName(d.leadName);
        if (d.leadPhone) setLeadPhone(d.leadPhone);
        if (d.leadEmail) setLeadEmail(d.leadEmail);
        if (d.leadRequirement) setLeadRequirement(d.leadRequirement);
        if (d.leadDescription) setLeadDescription(d.leadDescription);
        if (d.leadAssignedSalesPersonId) setLeadAssignedSalesPersonId(d.leadAssignedSalesPersonId);
        if (d.leadAssignedAdminId) setLeadAssignedAdminId(d.leadAssignedAdminId);
        if (d.leadIsHot !== undefined) setLeadIsHot(d.leadIsHot);
        setHasLeadDraftRestored(true);
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    if (leadName || leadPhone || leadEmail || leadRequirement || leadDescription) {
      localStorage.setItem('draft_lead_form', JSON.stringify({
        leadName,
        leadPhone,
        leadEmail,
        leadRequirement,
        leadDescription,
        leadAssignedSalesPersonId,
        leadAssignedAdminId,
        leadIsHot
      }));
    }
  }, [leadName, leadPhone, leadEmail, leadRequirement, leadDescription, leadAssignedSalesPersonId, leadAssignedAdminId, leadIsHot]);

  const handleClearLeadFormData = () => {
    if (confirm('🧹 Clear all lead form fields and reset to blank?')) {
      localStorage.removeItem('draft_lead_form');
      setLeadName('');
      setLeadPhone('');
      setLeadEmail('');
      setLeadRequirement('');
      setLeadDescription('');
      setLeadAssignedSalesPersonId('');
      setLeadAssignedAdminId('');
      setLeadIsHot(false);
      setHasLeadDraftRestored(false);
    }
  };

  const renderStatusBadge = (status: Lead['status']) => {
    switch (status) {
      case 'new':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-300">🆕 NEW LEAD</span>;
      case 'quotation_sent':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">📄 QUOTATION SENT</span>;
      case 'confirmed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-violet-100 text-violet-800 border border-violet-200">⚡ ORDER CONFIRMED</span>;
      case 'registered':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">📋 REGISTERED</span>;
      case 'installed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-100 text-teal-800 border border-teal-200">🔧 INSTALLED</span>;
      case 'closed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">🏆 CLOSED / RELEASED</span>;
      case 'lost':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">❌ LOST</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600">PENDING</span>;
    }
  };

  const compileReportItems = async () => {
    try {
      const items: LeadReportItem[] = [];
      const finMap: Record<string, { totalValue: number; paidAmount: number; pendingBalance: number; paymentStatus: string; installmentCount: number }> = {};
      const validLeads = Array.isArray(leads) ? leads : [];
      for (const l of validLeads) {
        if (!l || !l.id) continue;
        let totalValue = 0;
        let paidAmount = 0;
        let installmentCount = 0;

        const oc = await orderService.getOrderConfirmationByLeadId(l.id);
        const quotes = await quotationService.getQuotationsByLeadId(l.id);
        const mainQuote = Array.isArray(quotes) && quotes.length > 0 ? quotes[0] : undefined;

        const quoteTotal = mainQuote ? getQuotationTotalAmount(mainQuote) : 0;
        const ocSubtotal = oc ? (oc.subtotal || (Array.isArray(oc.itemsConfirmed) ? oc.itemsConfirmed.reduce((s, i) => s + (i.amount || 0), 0) : 0) || oc.advanceAmount || 0) : 0;

        totalValue = quoteTotal > 0 ? quoteTotal : ocSubtotal;

        if (oc) {
          const pList: { amount?: number }[] = (Array.isArray(oc.payments) && oc.payments.length > 0)
            ? oc.payments
            : (oc.advanceAmount && oc.advanceAmount > 0)
            ? [{ amount: oc.advanceAmount }]
            : [];
          paidAmount = pList.reduce((s, p) => s + (p?.amount || 0), 0);
          installmentCount = pList.length;

          if (totalValue <= 0 && paidAmount > 0) {
            totalValue = paidAmount;
          }
        }

        const pendingBalance = Math.max(0, totalValue - paidAmount);
        let paymentStatus: LeadReportItem['paymentStatus'] = 'No Quote';
        if (totalValue > 0) {
          if (paidAmount >= totalValue) paymentStatus = 'Fully Paid';
          else if (paidAmount > 0) paymentStatus = 'Partially Paid';
          else paymentStatus = 'Pending';
        }

        const empNames = employeeNames || {};
        const itemData = {
          leadId: l.id,
          name: l.name || 'Unnamed Client',
          phone: l.phoneNumber || '',
          requirement: formatCleanLeadRequirement(l.requirement),
          status: l.status,
          assignedSalesName: empNames[l.assignedSalesPersonId || l.assignedEmployeeId || ''] || 'Unassigned',
          assignedAdminName: empNames[l.assignedAdminId || ''] || 'Unassigned',
          createdAt: l.createdAt || new Date().toISOString(),
          totalValue,
          paidAmount,
          pendingBalance,
          paymentStatus,
          installmentCount
        };

        items.push(itemData);
        finMap[l.id] = {
          totalValue,
          paidAmount,
          pendingBalance,
          paymentStatus,
          installmentCount
        };
      }
      setReportItems(items);
    } catch (err) {
      console.error("Error generating lead report items:", err);
    }
  };

  const handleOpenReportsModal = async () => {
    if (currentRole === 'field_employee') return;
    setShowReportModal(true);
    setIsGeneratingReport(true);
    await compileReportItems();
    setIsGeneratingReport(false);
  };

  const handleDownloadReportPDF = async (itemsToReport: LeadReportItem[]) => {
    try {
      const blob = await pdfService.generateExecutiveReportPDF(itemsToReport);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Green_Energy_Executive_Financial_Report_${dayjs().format('YYYY_MM_DD')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error("Error downloading PDF report:", err);
      alert('Failed to generate PDF Report.');
    }
  };

  const exportReportToCSV = (items: LeadReportItem[]) => {
    const headers = [
      'Client Name',
      'Phone Number',
      'Requirement',
      'Pipeline Status',
      'Total Proposal Value (INR)',
      'Paid Amount (INR)',
      'Pending Balance (INR)',
      'Payment Status',
      'Installments Paid',
      'Assigned Sales',
      'Assigned Admin',
      'Created Date'
    ];

    const rows = items.map(item => {
      const formattedDate = item.createdAt && dayjs(item.createdAt).isValid() 
        ? dayjs(item.createdAt).format('DD-MMM-YYYY') 
        : 'N/A';

      return [
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${item.phone || ''}"`,
        `"${(item.requirement || '').replace(/"/g, '""')}"`,
        `"${(item.status || '').toUpperCase()}"`,
        item.totalValue || 0,
        item.paidAmount || 0,
        item.pendingBalance || 0,
        `"${item.paymentStatus || ''}"`,
        item.installmentCount || 0,
        `"${(item.assignedSalesName || '').replace(/"/g, '""')}"`,
        `"${(item.assignedAdminName || '').replace(/"/g, '""')}"`,
        formattedDate
      ];
    });

    // Add UTF-8 BOM (\uFEFF) so Excel opens CSV in UTF-8 mode without column glitching or ##### errors
    const csvString = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Green_Energy_Leads_Financial_Report_${dayjs().format('YYYY_MM_DD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handlePrintReport = () => {
    window.print();
  };

  const loadData = async () => {
    const list = await leadService.getLeads();
    const filteredList = filterLeadsForUser(list, currentUser, currentRole);
    setLeads(filteredList);

    try {
      const challans = await challanService.getChallans();
      const dispatchedIds = new Set<string>();
      challans.forEach(c => {
        if (c.leadId) dispatchedIds.add(c.leadId);
      });
      setDispatchedLeadIds(dispatchedIds);
    } catch (e) {
      console.warn("Challans load error in Leads view:", e);
    }

    const empList = await employeeService.getEmployees();
    setEmployees(empList);

    const profiles = await employeeService.getAllProfiles();
    const names: Record<string, string> = {};
    profiles.forEach(p => {
      names[p.id] = p.fullName;
    });
    setEmployeeNames(names);

    productService.getProducts().then(setCatalogProducts).catch(e => console.warn("Load products error:", e));
  };

  useEffect(() => {
    loadData().then(async () => {
      // Restore selected lead from sessionStorage on refresh
      const savedLeadId = sessionStorage.getItem('leads_selectedLeadId');
      if (savedLeadId && !selectedLead) {
        try {
          const lead = await leadService.getLeadById(savedLeadId);
          if (lead) {
            handleSelectLead(lead, true);
          }
        } catch (_) {}
      }
    });

    let realtimeDebounceTimer: any = null;
    const handleRealtimeUpdate = () => {
      if (realtimeDebounceTimer) clearTimeout(realtimeDebounceTimer);
      realtimeDebounceTimer = setTimeout(() => {
        loadData();
      }, 300);
    };
    window.addEventListener('app-realtime-update', handleRealtimeUpdate);
    return () => {
      if (realtimeDebounceTimer) clearTimeout(realtimeDebounceTimer);
      window.removeEventListener('app-realtime-update', handleRealtimeUpdate);
    };
  }, [currentRole, currentUser]);

  useEffect(() => {
    if (leads.length > 0) {
      compileReportItems();
    }
  }, [leads]);

  // Helper to normalize payments list for backward compatibility
  const getPaymentsList = (oc: OrderConfirmation | null): PaymentInstallment[] => {
    if (!oc) return [];
    if (oc.payments && oc.payments.length > 0) return oc.payments;
    if (oc.advanceAmount && oc.advanceAmount > 0) {
      return [
        {
          id: 'pay_1',
          installmentNo: 1,
          label: '1st Advance Payment',
          amount: oc.advanceAmount,
          paymentMode: oc.paymentMode || 'utr',
          paymentReference: oc.paymentReference,
          paidAt: oc.createdAt
        }
      ];
    }
    return [];
  };

  // Load contextual data for details panel
  const handleSelectLead = async (lead: Lead, preserveTab?: boolean) => {
    if (!lead || !lead.id) return;
    const shouldPreserveTab = preserveTab !== undefined ? preserveTab : (selectedLead?.id === lead.id);
    setSelectedLead(lead);
    setInstallRemarkText(lead.installationRemark || '');
    // Persist to sessionStorage so refresh restores same lead + tab
    sessionStorage.setItem('leads_selectedLeadId', lead.id);
    if (!shouldPreserveTab) {
      setActiveTab('timeline');
      sessionStorage.setItem('leads_activeTab', 'timeline');
    }

    // Sync Follow-up inspection date state
    if (lead.nextFollowUpDate) {
      setQuoteFollowUp(dayjs(lead.nextFollowUpDate).format('YYYY-MM-DD'));
    } else {
      const existingQuotes = await quotationService.getQuotationsByLeadId(lead.id);
      if (existingQuotes.length > 0 && existingQuotes[0].followUpDate) {
        setQuoteFollowUp(dayjs(existingQuotes[0].followUpDate).format('YYYY-MM-DD'));
      } else {
        setQuoteFollowUp('');
      }
    }
    
    // Load Order Confirmation & Payment History
    let oc = await orderService.getOrderConfirmationByLeadId(lead.id);

    // Auto load quote items if quotation exists
    const quotations = await quotationService.getQuotationsByLeadId(lead.id);
    setHasAdminQuotation(quotations.length > 0);
    if (quotations.length > 0) {
      const q = quotations[0];
      setBookingItems(q.items || []);
      const latestQuoteTotal = getQuotationTotalAmount(q);

      if (oc && latestQuoteTotal > 0 && oc.subtotal !== latestQuoteTotal) {
        oc.subtotal = latestQuoteTotal;
        oc.itemsConfirmed = q.items || oc.itemsConfirmed || [];
        try {
          await orderService.updateOrderConfirmation(oc);
        } catch (e) {
          console.warn("OC sync note:", e);
        }
      } else if (!oc) {
        const ocId = 'oc_' + Math.random().toString(36).substring(2, 11);
        const newOc: OrderConfirmation = {
          id: ocId,
          leadId: lead.id,
          quotationId: q.id,
          itemsConfirmed: q.items || [],
          subtotal: latestQuoteTotal,
          advanceAmount: 0,
          paymentMode: 'transaction_id',
          clientSignatureBlob: '',
          payments: [],
          createdBy: q.createdBy || 'Admin',
          createdAt: new Date().toISOString()
        };
        try {
          await orderService.createOrderConfirmation(newOc);
          oc = newOc;
        } catch (e) {
          console.warn("Auto OC init note:", e);
        }
      }
    } else {
      setBookingItems([]);
    }

    setExistingOc(oc || null);

    // Load KYC Docs
    const docs = await orderService.getClientDocumentsByLeadId(lead.id);
    setKycDocs(docs);

    // Load Registration Checklist
    const reg = await orderService.getClientRegistrationByLeadId(lead.id);
    setRegChecklist(reg || null);

    // Load Installation Photos
    const photos = await orderService.getInstallationPhotosByLeadId(lead.id);
    setInstallPhotos(photos);

    // Load Release Docs & auto-correct premature closed status if NOC file is missing
    const rels = await orderService.getReleaseDocumentsByLeadId(lead.id);
    setReleaseDocs(rels);
    if (rels.length === 0 && lead.status === 'closed') {
      await leadService.updateLeadStatus(lead.id, 'confirmed');
      lead.status = 'confirmed';
      setSelectedLead({ ...lead, status: 'confirmed' });
    }
  };

  const handleUpdateFollowUpDate = async (newDateStr: string) => {
    setQuoteFollowUp(newDateStr);
    if (!selectedLead) return;

    const formattedDate = newDateStr ? dayjs(newDateStr).format('YYYY-MM-DD') : undefined;
    const updatedLead: Lead = {
      ...selectedLead,
      nextFollowUpDate: formattedDate,
      followUpCompleted: false,
      followUpSetAt: new Date().toISOString()
    };

    setSelectedLead(updatedLead);
    setLeads(prev => prev.map(l => l.id === selectedLead.id ? updatedLead : l));

    try {
      await leadService.updateLead(selectedLead.id, {
        nextFollowUpDate: formattedDate,
        followUpCompleted: false,
        followUpSetAt: new Date().toISOString()
      });

      const quotes = await quotationService.getQuotationsByLeadId(selectedLead.id);
      if (quotes && quotes.length > 0) {
        for (const q of quotes) {
          q.followUpDate = formattedDate || '';
          q.followUpCompleted = false;
          q.followUpSetAt = new Date().toISOString();
          await quotationService.updateQuotation(q);
        }
      }

      setFollowUpSavedToast(true);
      setTimeout(() => setFollowUpSavedToast(false), 2500);

      window.dispatchEvent(new CustomEvent('app-realtime-update'));
    } catch (err) {
      console.error("Error updating follow-up date:", err);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName || !leadPhone || !leadRequirement) {
      alert('Please fill out Name, Phone and Requirement.');
      return;
    }

    const isDealer = currentRole === 'dealer' || currentUser?.role === 'dealer';
    const salesId = leadAssignedSalesPersonId || (currentRole === 'field_employee' ? currentUser?.id : undefined);
    const adminId = leadAssignedAdminId || (currentRole === 'admin' ? currentUser?.id : undefined);
    const nowIso = new Date().toISOString();
    const formattedFollowUpDate = leadFollowUpDate ? dayjs(leadFollowUpDate).format('YYYY-MM-DD') : undefined;

    await leadService.createLead({
      name: leadName,
      phoneNumber: leadPhone,
      email: leadEmail || undefined,
      requirement: leadRequirement,
      description: leadDescription,
      assignedSalesPersonId: salesId,
      assignedAdminId: adminId,
      assignedEmployeeId: salesId || adminId,
      createdBy: currentUser?.fullName || currentUser?.id || 'Admin',
      createdByDealer: isDealer || undefined,
      dealerId: isDealer ? currentUser?.id : undefined,
      dealerName: isDealer ? (currentUser?.fullName || 'Authorized Dealer') : undefined,
      status: 'new',
      isHot: leadIsHot,
      clientRating: leadIsHot ? 5 : 3,
      nextFollowUpDate: formattedFollowUpDate,
      followUpNotes: leadFollowUpNotes.trim() || undefined,
      followUpSetAt: formattedFollowUpDate ? nowIso : undefined,
      followUpSetBy: formattedFollowUpDate ? (currentUser?.fullName || 'Admin') : undefined,
      followUpCompleted: false
    });

    // Reset
    localStorage.removeItem('draft_lead_form');
    setLeadName('');
    setLeadPhone('');
    setLeadEmail('');
    setLeadRequirement('');
    setLeadDescription('');
    setLeadAssignedSalesPersonId('');
    setLeadAssignedAdminId('');
    setLeadIsHot(false);
    setLeadFollowUpDate('');
    setLeadFollowUpNotes('');
    setShowCreateModal(false);
    loadData();
    window.dispatchEvent(new CustomEvent('app-realtime-update'));
  };

  const handleSaveEditLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadToEdit || !leadToEdit.id) return;
    if (!editName.trim() || !editPhone.trim() || !editRequirement.trim()) {
      alert('Please fill out Name, Phone Number, and Requirement.');
      return;
    }

    setIsSavingEditLead(true);
    try {
      const formattedEditFollowUpDate = editFollowUpDate ? dayjs(editFollowUpDate).format('YYYY-MM-DD') : undefined;
      const updatedPatch: Partial<Lead> = {
        name: editName.trim(),
        phoneNumber: editPhone.trim(),
        email: editEmail.trim() || undefined,
        requirement: editRequirement.trim(),
        description: editDescription.trim(),
        status: editStatus,
        isHot: editIsHot,
        clientRating: editIsHot ? 5 : (leadToEdit.clientRating || 3),
        assignedSalesPersonId: editAssignedSalesPersonId || undefined,
        assignedAdminId: editAssignedAdminId || undefined,
        assignedEmployeeId: editAssignedSalesPersonId || editAssignedAdminId || leadToEdit.assignedEmployeeId,
        nextFollowUpDate: formattedEditFollowUpDate,
        followUpNotes: editFollowUpNotes.trim() || undefined,
        followUpSetAt: formattedEditFollowUpDate ? new Date().toISOString() : leadToEdit.followUpSetAt,
        followUpCompleted: false,
        installationRemark: editInstallationRemark.trim() || undefined
      };

      await leadService.updateLead(leadToEdit.id, updatedPatch);

      if (selectedLead && selectedLead.id === leadToEdit.id) {
        const refreshed = await leadService.getLeadById(leadToEdit.id);
        if (refreshed) {
          setSelectedLead(refreshed);
        } else {
          setSelectedLead({ ...selectedLead, ...updatedPatch, updatedAt: new Date().toISOString() });
        }
      }

      setLeadToEdit(null);
      alert('✅ Lead details updated successfully!');
      loadData();
      window.dispatchEvent(new CustomEvent('app-realtime-update'));
    } catch (err: any) {
      console.error('Error saving lead edits:', err);
      alert('Failed to save lead edits: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingEditLead(false);
    }
  };

  const handleToggleHotLead = async (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIsHot = lead.isHot || (lead.clientRating && lead.clientRating >= 4);
    const nextIsHot = !currentIsHot;
    const newRating = nextIsHot ? 5 : 3;
    const updatedLead: Lead = {
      ...lead,
      isHot: nextIsHot,
      clientRating: newRating as any
    };
    await leadService.updateLead(updatedLead);
    if (selectedLead?.id === lead.id) {
      setSelectedLead(updatedLead);
    }
    loadData();
  };

  const handleRatingChange = async (lead: Lead, rating: 1 | 2 | 3 | 4 | 5, e: React.MouseEvent) => {
    e.stopPropagation();
    const isHot = rating >= 4;
    const updatedLead: Lead = {
      ...lead,
      clientRating: rating,
      isHot
    };
    await leadService.updateLead(updatedLead);
    if (selectedLead?.id === lead.id) {
      setSelectedLead(updatedLead);
    }
    loadData();
  };

  const handleDeleteLead = async (id: string) => {
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';
    const confirmMsg = isSuperAdmin
      ? 'WARNING: Are you sure you want to permanently delete this lead?'
      : 'Submit deletion request to Super Admin for approval?';

    if (confirm(confirmMsg)) {
      const res = await leadService.deleteLead(id);
      if (res?.requiresApproval) {
        alert('🔒 Deletion request submitted successfully! This item will be deleted once approved by Super Admin.');
      } else {
        alert('Lead permanently deleted.');
        setSelectedLead(null);
      }
      loadData();
    }
  };

  const handleAssignSalesPerson = async (salesId: string) => {
    if (selectedLead) {
      await leadService.assignLead(selectedLead.id, salesId || undefined, selectedLead.assignedAdminId);
      const updated = await leadService.getLeadById(selectedLead.id);
      if (updated) setSelectedLead(updated);
      loadData();
    }
  };

  const handleAssignAdmin = async (adminId: string) => {
    if (selectedLead) {
      await leadService.assignLead(selectedLead.id, selectedLead.assignedSalesPersonId || selectedLead.assignedEmployeeId, adminId || undefined);
      const updated = await leadService.getLeadById(selectedLead.id);
      if (updated) setSelectedLead(updated);
      loadData();
    }
  };

  // WhatsApp share PDF document via dual-strategy
  const handleWhatsappShare = async (q: Quotation) => {
    const leadMatch = leads.find(l => l.id === q.leadId) || selectedLead;
    let pdfBlob: Blob | undefined;
    try {
      pdfBlob = await resolvePdfBlob(q);
    } catch (err) {
      console.warn('Could not resolve PDF blob for share:', err);
    }

    await shareQuotationViaWhatsapp({
      quotation: q,
      pdfBlob,
      lead: leadMatch
    });

    if (selectedLead) handleSelectLead(selectedLead);
  };

  // 2. Booking order confirmation
  const handleConfirmOrder = async () => {
    if (!selectedLead) return;
    if (advanceAmount <= 0) {
      alert('Please input a valid advance payment amount.');
      return;
    }

    setIsBookingOrder(true);
    try {
      const itemsToConfirm = bookingItems.length > 0
        ? bookingItems
        : [{ id: 'item_1', name: selectedLead.requirement || 'Solar Rooftop System', quantity: 1, rate: advanceAmount, amount: advanceAmount, isHeader: false }];

      const subtotal = itemsToConfirm.reduce((sum, item) => sum + (item.amount || 0), 0) || advanceAmount;

      const initialPayment: PaymentInstallment = {
        id: `pay_${Date.now()}`,
        installmentNo: 1,
        label: '1st Advance Payment',
        amount: advanceAmount,
        paymentMode,
        paymentReference: paymentReference || undefined,
        paidAt: new Date().toISOString()
      };

      const ocDraft: Omit<OrderConfirmation, 'id' | 'createdAt'> = {
        leadId: selectedLead.id,
        quotationId: 'q_link', // mockup link
        itemsConfirmed: bookingItems,
        subtotal,
        advanceAmount,
        paymentMode,
        paymentReference: paymentReference || undefined,
        clientSignatureBlob: signatureBlob || '',
        payments: [initialPayment],
        createdBy: currentUser?.id || 'mock_emp'
      };

      let sigUrl = signatureUrl || '';
      if (signatureBlob) {
        sigUrl = await uploadImageToFirebase(signatureBlob, `signatures/${selectedLead.id}_${Date.now()}.png`);
      }

      // Fast synchronous receipt PDF generation (~20ms)
      const pdfBlob = await pdfService.generateConfirmationPDF(
        ocDraft as any,
        selectedLead,
        currentUser?.fullName || 'Booking Manager',
        signatureUrl || sigUrl || (typeof signatureBlob === 'string' ? signatureBlob : '')
      );

      const localPdfUrl = URL.createObjectURL(pdfBlob);

      if (existingOc) {
        const updatedOc: OrderConfirmation = {
          ...existingOc,
          advanceAmount,
          paymentMode,
          paymentReference: paymentReference || undefined,
          clientSignatureBlob: sigUrl || signatureUrl || existingOc.clientSignatureBlob || '',
          confirmationPdfBlob: localPdfUrl,
          payments: [initialPayment]
        };
        await orderService.updateOrderConfirmation(updatedOc);
        setExistingOc(updatedOc);

        // Background non-blocking upload to Firebase Storage
        uploadImageToFirebase(pdfBlob, `orders/${selectedLead.id}/receipt_${Date.now()}.pdf`).then(async (remotePdfUrl) => {
          if (remotePdfUrl) {
            updatedOc.confirmationPdfBlob = remotePdfUrl;
            await orderService.updateOrderConfirmation(updatedOc);
          }
        }).catch(err => console.warn('Background receipt upload note:', err));
      } else {
        await orderService.createOrderConfirmation({
          ...ocDraft,
          clientSignatureBlob: (sigUrl || signatureUrl) as any,
          confirmationPdfBlob: localPdfUrl as any
        });
        const createdOc = await orderService.getOrderConfirmationByLeadId(selectedLead.id);
        if (createdOc) {
          setExistingOc(createdOc);
          uploadImageToFirebase(pdfBlob, `orders/${selectedLead.id}/receipt_${Date.now()}.pdf`).then(async (remotePdfUrl) => {
            if (remotePdfUrl) {
              createdOc.confirmationPdfBlob = remotePdfUrl;
              await orderService.updateOrderConfirmation(createdOc);
            }
          }).catch(err => console.warn('Background receipt upload note:', err));
        }
      }

      await leadService.updateLeadStatus(selectedLead.id, 'confirmed');

      alert('Order booking confirmed! Booking receipt generated and saved.');
      
      const updated = await leadService.getLeadById(selectedLead.id);
      if (updated) setSelectedLead(updated);
      handleSelectLead(updated || selectedLead);
    } catch (err) {
      console.error(err);
      alert('Error confirming order.');
    } finally {
      setIsBookingOrder(false);
    }
  };

  // 2b. Handle subsequent payments (2nd, 3rd, 4th payment installments)
  const handleRecordSubsequentPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !existingOc) return;

    const currentPayments = getPaymentsList(existingOc);
    const subtotal = existingOc.subtotal || bookingItems.reduce((sum, item) => sum + item.amount, 0);
    const totalPaidSoFar = currentPayments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, subtotal - totalPaidSoFar);

    if (remaining <= 0) {
      alert('Order is already fully paid! No additional payments can be added.');
      return;
    }

    if (subsequentAmount <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }

    if (subsequentAmount > remaining) {
      alert(`Entered amount (₹${subsequentAmount.toLocaleString('en-IN')}) exceeds the remaining balance (₹${remaining.toLocaleString('en-IN')}). Please enter an amount up to ₹${remaining.toLocaleString('en-IN')}.`);
      return;
    }

    setIsRecordingPayment(true);
    try {
      const nextNo = currentPayments.length + 1;
      const getOrdinalLabel = (n: number) => {
        if (n === 1) return '1st Advance Payment';
        if (n === 2) return '2nd Installment Payment';
        if (n === 3) return '3rd Installment Payment';
        if (n === 4) return '4th Installment Payment';
        return `${n}th Installment Payment`;
      };
      const label = getOrdinalLabel(nextNo);

      const totalPaidAfterThis = totalPaidSoFar + subsequentAmount;
      const isFullyPaidNow = totalPaidAfterThis >= subtotal;

      const newPayment: PaymentInstallment = {
        id: `pay_${Date.now()}`,
        installmentNo: nextNo,
        label,
        amount: subsequentAmount,
        paymentMode: subsequentPaymentMode,
        paymentReference: subsequentReference || undefined,
        paidAt: new Date().toISOString(),
        notes: subsequentNotes || undefined
      };

      const updatedPayments = [...currentPayments, newPayment];
      const updatedOc: OrderConfirmation = {
        ...existingOc,
        advanceAmount: nextNo === 1 ? subsequentAmount : (existingOc.advanceAmount || subsequentAmount),
        paymentMode: nextNo === 1 ? subsequentPaymentMode : (existingOc.paymentMode || subsequentPaymentMode),
        paymentReference: nextNo === 1 ? (subsequentReference || undefined) : (existingOc.paymentReference || subsequentReference || undefined),
        payments: updatedPayments
      };

      // Fast synchronous receipt PDF generation (~20ms)
      try {
        const sigUrl = signatureUrl || (typeof existingOc.clientSignatureBlob === 'string' ? existingOc.clientSignatureBlob : '');
        const pdfBlob = await pdfService.generateConfirmationPDF(
          updatedOc,
          selectedLead,
          currentUser?.fullName || 'Booking Manager',
          sigUrl
        );
        const localPdfUrl = URL.createObjectURL(pdfBlob);
        updatedOc.confirmationPdfBlob = localPdfUrl;

        // Non-blocking background upload to Firebase Storage
        uploadImageToFirebase(pdfBlob, `orders/${selectedLead.id}/receipt_${Date.now()}.pdf`).then(async (remotePdfUrl) => {
          if (remotePdfUrl) {
            updatedOc.confirmationPdfBlob = remotePdfUrl;
            await orderService.updateOrderConfirmation(updatedOc);
          }
        }).catch(pdfErr => console.warn('Background receipt upload note:', pdfErr));
      } catch (pdfErr) {
        console.warn('PDF generation note:', pdfErr);
      }

      await orderService.updateOrderConfirmation(updatedOc);
      setExistingOc(updatedOc);

      // Maintain confirmed status on payment recording
      const targetStatus = selectedLead.status === 'closed' ? 'closed' : 'confirmed';
      await leadService.updateLeadStatus(selectedLead.id, targetStatus);
      selectedLead.status = targetStatus;

      // Reset form
      setSubsequentAmount(0);
      setSubsequentReference('');
      setSubsequentNotes('');

      alert(`✅ ${label} of ₹${subsequentAmount.toLocaleString('en-IN')} recorded successfully! ${isFullyPaidNow ? '🎉 Full Payment Completed! All dues for this order have been settled.' : ''}`);

      const refreshedLead = await leadService.getLeadById(selectedLead.id);
      if (refreshedLead) setSelectedLead(refreshedLead);
    } catch (err) {
      console.error('Error recording installment:', err);
      alert('Error recording payment installment.');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // 3. File KYC upload
  const handleDocUpload = async (docType: ClientDocument['docType'], file: File) => {
    if (!selectedLead) return;
    setUploadingDocType(docType);

    try {
      let fileUrl = '';
      if (file.type.startsWith('image/')) {
        const compressedBlob = await compressImage(file, { isDocument: true, maxSizeKB: 75 });
        const storagePath = `documents/${selectedLead.id}/${docType}_${Date.now()}.webp`;
        fileUrl = await uploadImageToFirebase(compressedBlob, storagePath);
      } else {
        const storagePath = `documents/${selectedLead.id}/${docType}_${Date.now()}.pdf`;
        fileUrl = await uploadPdfToFirebase(file, storagePath);
      }

      if (!fileUrl) {
        throw new Error("Storage service did not return a valid download URL.");
      }

      await orderService.uploadClientDocument({
        leadId: selectedLead.id,
        docType,
        fileBlob: fileUrl as any,
        uploadedBy: currentUser?.id || 'mock_admin'
      });

      // Update lead timestamp so Timeline detects document upload immediately
      await leadService.updateLead({
        ...selectedLead,
        updatedAt: new Date().toISOString()
      });

      const refreshedLead = await leadService.getLeadById(selectedLead.id);
      if (refreshedLead) setSelectedLead(refreshedLead);

      const updatedDocs = await orderService.getClientDocumentsByLeadId(selectedLead.id);
      setKycDocs(updatedDocs);

      const reg = await orderService.getClientRegistrationByLeadId(selectedLead.id);
      setRegChecklist(reg || null);

      alert(`✅ ${docType.toUpperCase().replace('_', ' ')} uploaded to Backblaze B2 storage successfully.`);
    } catch (err: any) {
      console.error("Doc upload error:", err);
      alert(`⚠️ Document Upload Failed: ${err?.message || 'Network error while uploading to cloud bucket. Please check connection and try again.'}`);
    } finally {
      setUploadingDocType(null);
    }
  };

  const handleDocDelete = async (docId: string) => {
    if (!selectedLead) return;
    if (confirm('Delete this KYC document?')) {
      await orderService.deleteClientDocument(docId);
      
      await leadService.updateLead({
        ...selectedLead,
        updatedAt: new Date().toISOString()
      });

      const refreshedLead = await leadService.getLeadById(selectedLead.id);
      if (refreshedLead) setSelectedLead(refreshedLead);

      const updatedDocs = await orderService.getClientDocumentsByLeadId(selectedLead.id);
      setKycDocs(updatedDocs);

      const reg = await orderService.getClientRegistrationByLeadId(selectedLead.id);
      setRegChecklist(reg || null);
    }
  };

  // 4. Registration checklists
  const handleChecklistToggle = async (field: keyof ClientRegistration, val: any) => {
    if (!selectedLead || !regChecklist) return;

    const updated = {
      ...regChecklist,
      [field]: val
    };

    await orderService.saveClientRegistration(updated);
    
    await leadService.updateLead({
      ...selectedLead,
      updatedAt: new Date().toISOString()
    });

    const updatedLead = await leadService.getLeadById(selectedLead.id);
    if (updatedLead) setSelectedLead(updatedLead);
    const reg = await orderService.getClientRegistrationByLeadId(selectedLead.id);
    setRegChecklist(reg || null);
  };

  const handleBankFileUpload = async (file: File) => {
    if (!selectedLead || !regChecklist) return;

    try {
      let fileUrl = '';
      if (file.type.startsWith('image/')) {
        const compressedBlob = await compressImage(file, { isDocument: true, maxSizeKB: 75 });
        const storagePath = `documents/${selectedLead.id}/bank_${Date.now()}.webp`;
        fileUrl = await uploadImageToFirebase(compressedBlob, storagePath);
      } else {
        const storagePath = `documents/${selectedLead.id}/bank_${Date.now()}.pdf`;
        fileUrl = await uploadImageToFirebase(file, storagePath);
      }

      const updated = {
        ...regChecklist,
        bankDocumentBlob: fileUrl as any,
        bankFileUploaded: true
      };

      await orderService.saveClientRegistration(updated);
      
      await leadService.updateLead({
        ...selectedLead,
        updatedAt: new Date().toISOString()
      });

      const updatedLead = await leadService.getLeadById(selectedLead.id);
      if (updatedLead) setSelectedLead(updatedLead);
      const reg = await orderService.getClientRegistrationByLeadId(selectedLead.id);
      setRegChecklist(reg || null);

      alert('Bank document uploaded successfully.');
    } catch (err) {
      console.error("Bank upload error:", err);
      alert('Error uploading bank document.');
    }
  };

  // 5. Image Compression & Watermarked Geo-Tagging canvas
  const handleCaptureInstallPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedLead || !e.target.files?.[0]) return;
    const file = e.target.files[0];

    setIsCapturingInstall(true);

    try {
      setIsLocatingInstall(true);
      const coords = await mapService.getCurrentCoordinates();
      const address = await mapService.reverseGeocode(coords.latitude, coords.longitude);
      setIsLocatingInstall(false);

      const compressed = await compressImage(file, { maxSizeKB: 55 });

      const img = new Image();
      img.src = URL.createObjectURL(compressed);
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);

          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillRect(0, img.height - 70, img.width, 70);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 15px Arial';
          ctx.fillText(`GPS: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`, 20, img.height - 45);
          ctx.fillText(`Address: ${address.substring(0, 75)}...`, 20, img.height - 25);
          ctx.fillText(`Timestamp: ${dayjs().format('DD MMM YYYY, hh:mm A [IST]')}`, 20, img.height - 8);

          canvas.toBlob(async (blob) => {
            if (blob) {
              const compBlob = await compressImage(blob, { maxSizeKB: 55 });
              const storagePath = `installations/${selectedLead.id}/${installPhotoType}_${Date.now()}.webp`;
              const firebaseUrl = await uploadImageToFirebase(compBlob, storagePath);

              await orderService.uploadInstallationPhoto({
                leadId: selectedLead.id,
                photoType: installPhotoType,
                photoBlob: firebaseUrl as any,
                location: {
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  placeName: address,
                  capturedAt: new Date().toISOString()
                },
                uploadedBy: currentUser?.id || 'mock_emp'
              });

              // Touch lead timestamp so Timeline detects change
              await leadService.updateLead({
                ...selectedLead,
                updatedAt: new Date().toISOString()
              });

              const refreshed = await leadService.getLeadById(selectedLead.id);
              if (refreshed) setSelectedLead(refreshed);

              const photos = await orderService.getInstallationPhotosByLeadId(selectedLead.id);
              setInstallPhotos(photos);

              alert(`Watermarked Installation photo (${installPhotoType.toUpperCase()}) uploaded successfully!`);
            }
          }, 'image/jpeg', 0.95);
        }
      };
    } catch (err) {
      console.error(err);
      alert('Error capturing installation photo.');
    } finally {
      setIsCapturingInstall(false);
      setIsLocatingInstall(false);
    }
  };

  // 6. Release Upload
  const handleReleaseUpload = async (file: File) => {
    if (!selectedLead) return;

    try {
      let fileUrl = '';
      if (file.type.startsWith('image/')) {
        const compressedBlob = await compressImage(file, { isDocument: true, maxSizeKB: 75 });
        const storagePath = `release/${selectedLead.id}/release_${Date.now()}.webp`;
        fileUrl = await uploadImageToFirebase(compressedBlob, storagePath);
      } else {
        const storagePath = `release/${selectedLead.id}/release_${Date.now()}.pdf`;
        fileUrl = await uploadImageToFirebase(file, storagePath);
      }

      await orderService.uploadReleaseDocument({
        leadId: selectedLead.id,
        fileBlob: fileUrl as any,
        uploadedBy: currentUser?.id || 'mock_admin',
        notes: releaseNotes || undefined
      });

      // Explicitly set lead status to CLOSED in database
      await leadService.updateLeadStatus(selectedLead.id, 'closed');
      setReleaseNotes('');

      const updated = await leadService.getLeadById(selectedLead.id);
      if (updated) setSelectedLead(updated);

      const rels = await orderService.getReleaseDocumentsByLeadId(selectedLead.id);
      setReleaseDocs(rels);

      loadData();

      alert('✅ Handover NOC / Release Document uploaded! Lead status is now CLOSED (Release Complete).');
    } catch (err) {
      console.error(err);
      alert('Error uploading release document.');
    }
  };

  const handleReleaseDelete = async (relId: string) => {
    if (!selectedLead) return;
    if (confirm('Delete this Handover NOC document? This will re-open the pipeline status.')) {
      await orderService.deleteReleaseDocument(relId);
      const rels = await orderService.getReleaseDocumentsByLeadId(selectedLead.id);
      setReleaseDocs(rels);
      if (rels.length === 0) {
        await leadService.updateLeadStatus(selectedLead.id, 'confirmed');
        const updated = await leadService.getLeadById(selectedLead.id);
        if (updated) setSelectedLead(updated);
        loadData();
      }
    }
  };

  const hotLeadsCount = leads.filter(l => l.isHot || (l.clientRating && l.clientRating >= 4)).length;
  const dispatchedLeadsCount = leads.filter(l => dispatchedLeadIds.has(l.id)).length;

  const getStatusBadge = (status: Lead['status']) => {
    const classes: Record<string, string> = {
      new: 'bg-slate-100 text-slate-800 border-slate-200',
      quotation_sent: 'bg-amber-100 text-amber-800 border-amber-200',
      confirmed: 'bg-violet-100 text-violet-800 border-violet-200',
      registered: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      installed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      closed: 'bg-emerald-800 text-white border-emerald-900',
      lost: 'bg-rose-100 text-rose-800 border-rose-200'
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border capitalize ${classes[status] || 'bg-gray-100'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Detail Panel Trigger */}
      {selectedLead ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
          {/* Header Action Row */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-4 print:hidden">
            <button
              onClick={() => { setSelectedLead(null); sessionStorage.removeItem('leads_selectedLeadId'); sessionStorage.removeItem('leads_activeTab'); }}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Leads</span>
            </button>

            <div className="flex items-center gap-2">
              {getStatusBadge(selectedLead.status)}
              {(selectedLead.createdByDealer || selectedLead.dealerName) && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300 shadow-2xs">
                  🏪 CREATED BY DEALER: {selectedLead.dealerName || selectedLead.createdBy}
                </span>
              )}
              <button
                type="button"
                onClick={() => setLeadToEdit(selectedLead)}
                className="px-3 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer flex items-center space-x-1.5 text-xs font-bold shadow-2xs"
                title="Edit Lead Information"
              >
                <Edit3 className="w-4 h-4 text-blue-600" />
                <span>Edit Lead Details</span>
              </button>
              {currentRole !== 'field_employee' && (
                <button
                  type="button"
                  onClick={() => handleDeleteLead(selectedLead.id)}
                  className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 border border-rose-200 rounded-xl transition-colors cursor-pointer flex items-center space-x-1.5 text-xs font-bold shadow-2xs"
                  title="Delete Lead and all associated documents"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Lead</span>
                </button>
              )}
            </div>
          </div>

          {/* Client Bio & Assign Dropdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start print:hidden">
            <div className="space-y-1">
              <h2 className="text-lg font-black text-slate-900">{selectedLead.name}</h2>
              <p className="text-xs text-slate-500 font-semibold">📞 +91 {selectedLead.phoneNumber} | ✉️ {selectedLead.email || 'No email provided'}</p>
              <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <strong>Project:</strong> {formatCleanLeadRequirement(selectedLead.requirement)}
                {formatCleanLeadDescription(selectedLead.description) ? (
                  <span className="block mt-1 text-slate-500 font-normal">{formatCleanLeadDescription(selectedLead.description)}</span>
                ) : null}
                {selectedLead.installationRemark && (
                  <span className="block mt-2 text-amber-900 font-semibold bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-md text-[11px]">
                    <strong className="text-amber-700">🛠️ Installation Remark:</strong> {selectedLead.installationRemark}
                  </span>
                )}
              </p>
            </div>

            {/* Admin & Sales representative assigner dropdowns */}
            {currentRole !== 'field_employee' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full md:w-auto">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">💼 Sales Person</label>
                  <select
                    value={selectedLead.assignedSalesPersonId || selectedLead.assignedEmployeeId || ''}
                    onChange={(e) => handleAssignSalesPerson(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2 bg-slate-50 text-xs font-bold focus:outline-none cursor-pointer text-slate-700"
                  >
                    <option value="">-- Select Sales Person --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">🏢 Administration Person</label>
                  <select
                    value={selectedLead.assignedAdminId || ''}
                    onChange={(e) => handleAssignAdmin(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2 bg-slate-50 text-xs font-bold focus:outline-none cursor-pointer text-slate-700"
                  >
                    <option value="">-- Select Administration --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Tab Menu Options */}
          <div className="flex border-b border-slate-200 overflow-x-auto text-xs font-bold text-slate-400 select-none shrink-0 print:hidden">
            <button
              onClick={() => switchTab('timeline')}
              className={`py-3 px-4 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                activeTab === 'timeline' ? 'border-emerald-600 text-emerald-600 font-extrabold' : 'border-transparent hover:text-slate-800'
              }`}
            >
              Timeline Stepper
            </button>
            
            {/* Quotations builder available for Admin & Super Admin */}
            {['super_admin', 'admin'].includes(currentRole) && (
              <button
                onClick={() => switchTab('quotation')}
                className={`py-3 px-4 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                  activeTab === 'quotation' ? 'border-emerald-600 text-emerald-600 font-extrabold' : 'border-transparent hover:text-slate-800'
                }`}
              >
                Create Quotation
              </button>
            )}

            {/* Confirm booking receipt */}
            {['super_admin', 'admin', 'field_employee', 'dealer'].includes(currentRole) && (
              <button
                onClick={() => switchTab('order')}
                className={`py-3 px-4 border-b-2 cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'order' ? 'border-emerald-600 text-emerald-600 font-extrabold' : 'border-transparent hover:text-slate-800'
                }`}
              >
                <span>Order & KYC Docs</span>
                {existingOc && (
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-wider">
                    Payments Active
                  </span>
                )}
              </button>
            )}

            {/* Geo photos */}
            {currentRole !== 'dealer' && currentUser?.role !== 'dealer' && (
              <button
                onClick={() => switchTab('installation')}
                className={`py-3 px-4 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                  activeTab === 'installation' ? 'border-emerald-600 text-emerald-600 font-extrabold' : 'border-transparent hover:text-slate-800'
                }`}
              >
                Installation Photos
              </button>
            )}

            {/* Documentation tab containing DCR Certificate generator */}
            {currentRole !== 'dealer' && currentUser?.role !== 'dealer' && (
              <button
                onClick={() => switchTab('documentation')}
                className={`py-3 px-4 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                  activeTab === 'documentation' ? 'border-emerald-600 text-emerald-600 font-extrabold' : 'border-transparent hover:text-slate-800'
                }`}
              >
                Documentation
              </button>
            )}

            {/* Registration checklists & Release (Admin only) */}
            {currentRole !== 'field_employee' && currentRole !== 'dealer' && currentUser?.role !== 'dealer' && (
              <button
                onClick={() => switchTab('registration')}
                className={`py-3 px-4 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                  activeTab === 'registration' ? 'border-emerald-600 text-emerald-600 font-extrabold' : 'border-transparent hover:text-slate-800'
                }`}
              >
                Registration & Release
              </button>
            )}
          </div>

          {/* TAB CONTENTS */}
          <div className="pt-2">
            {/* Tab 1: Timeline */}
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3 uppercase tracking-wider">Project Timeline History</h3>
                <Timeline lead={selectedLead} />
              </div>
            )}

            {/* Tab 2: Quotation Builder & Proposal Generator */}
            {activeTab === 'quotation' && (
              <div className="space-y-6 text-xs font-semibold">
                {/* Top Control Bar: Follow-up Inspection Date */}
                <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-xs">
                  <div className="space-y-1 w-full sm:w-auto min-w-[280px]">
                    <label className="text-slate-800 font-extrabold block flex items-center gap-1.5 text-xs">
                      <span>📅 Follow-up Inspection Date (Lead Reminder)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={quoteFollowUp}
                        onChange={(e) => handleUpdateFollowUpDate(e.target.value)}
                        className="w-full border border-emerald-300 rounded-lg p-2 focus:outline-none bg-white font-bold text-slate-800 shadow-2xs"
                      />
                      {followUpSavedToast && (
                        <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg animate-fade-in whitespace-nowrap shadow-2xs">
                          ✓ Saved to Reminders!
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    Setting this date automatically schedules this lead under <strong className="text-slate-700 font-bold">Today</strong> or <strong className="text-slate-700 font-bold">Upcoming</strong> in Lead Reminders.
                  </div>
                </div>

                {/* 9-Page Full Turnkey Solar Quotation Document Generator */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-md bg-slate-900/5">
                  <QuotationDocument
                    defaultLeadId={selectedLead?.id}
                    isEmbedded={true}
                    onNavigateToOrderKyc={() => switchTab('order')}
                    onQuotationSaved={() => {
                      loadData();
                      if (selectedLead) handleSelectLead(selectedLead);
                    }}
                  />
                </div>

                {/* Generated Quotations History */}
                {selectedLead && (
                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Generated Quotations History</h4>
                    <LeadQuotationsTimeline leadId={selectedLead.id} onShare={handleWhatsappShare} onViewPdf={handleViewPdf} onEditQuotation={handleEditQuotation} onDownloadPdf={handleDownloadPdf} onDeleteQuotation={handleDeleteQuotation} />
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Order Booking & KYC */}
            {activeTab === 'order' && (() => {
              const paymentsList = getPaymentsList(existingOc);
              const itemsSubtotal = bookingItems.reduce((s, i) => s + (i.amount || 0), 0);
              const orderSubtotal = existingOc?.subtotal || (itemsSubtotal > 0 ? itemsSubtotal : 0);
              const totalPaid = paymentsList.reduce((s, p) => s + p.amount, 0);
              const remainingBalance = Math.max(0, orderSubtotal - totalPaid);
              const nextInstallmentNo = paymentsList.length + 1;
              const getOrdinalLabel = (n: number) => {
                if (n === 2) return '2nd Installment';
                if (n === 3) return '3rd Installment';
                if (n === 4) return '4th Installment';
                return `${n}th Installment`;
              };
              const nextLabel = getOrdinalLabel(nextInstallmentNo);

              const hasPaymentsRecorded = paymentsList.length > 0;
              const isQuotationCreated = hasAdminQuotation || (bookingItems && bookingItems.length > 0) || (existingOc && existingOc.subtotal > 0);

              return (
                <div className="space-y-8 text-xs font-semibold">
                  {/* Order Booking & Payment Management Block */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-6 shadow-xs">
                    <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-violet-600" />
                          <span>Book Order & Installment Payment Management</span>
                        </h3>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">Track 1st advance deposits, 2nd & 3rd installments, remaining balances, and receipts.</p>
                      </div>

                      {hasPaymentsRecorded && isQuotationCreated && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                            remainingBalance <= 0
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : totalPaid > 0
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {remainingBalance <= 0 ? '✓ Order Fully Paid' : `Partial Paid (${Math.round((totalPaid / (orderSubtotal || 1)) * 100)}%)`}
                          </span>

                          {remainingBalance > 0 && selectedLead && (
                            <a
                              href={`https://api.whatsapp.com/send?phone=${getCleanWhatsAppPhone(selectedLead.phoneNumber)}&text=${encodeURIComponent(
                                `Dear ${selectedLead.name},\n\nGreetings from *Green Energy Solution*! ☀️\n\nThis is a polite payment reminder regarding your Solar Rooftop Order details:\n\n📌 *Total Contract Amount:* ₹${orderSubtotal.toLocaleString('en-IN')}\n✅ *Total Amount Paid:* ₹${totalPaid.toLocaleString('en-IN')}\n⚠️ *Remaining Balance Due:* ₹${remainingBalance.toLocaleString('en-IN')}\n\nKindly clear the remaining payment of *₹${remainingBalance.toLocaleString('en-IN')}* at your earliest convenience to avoid installation delays.\n\nThank you!\n*Green Energy Solution*`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                              title="Send Payment Reminder on WhatsApp"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>WhatsApp Payment Reminder</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {/* LOCK PAYMENT COLLECTION IF QUOTATION NOT CREATED BY ADMIN YET */}
                    {!isQuotationCreated ? (
                      <div className="bg-amber-50/80 border-2 border-amber-300 rounded-2xl p-6 text-center space-y-3 shadow-xs">
                        <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center font-bold mx-auto text-xl">
                          ⚠️
                        </div>
                        <h3 className="text-sm font-black text-amber-900 uppercase tracking-wider">Quotation Pending From Admin</h3>
                        <p className="text-xs text-amber-800 font-semibold max-w-md mx-auto leading-relaxed">
                          Payment collection for this lead is currently <strong>LOCKED</strong> because Admin has not created a quotation yet.
                          Once Admin prepares and saves the official quotation for this lead, payment collection will automatically unlock.
                        </p>
                        {currentRole === 'dealer' && (
                          <p className="text-[11px] text-purple-800 font-bold bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-lg inline-block mt-2">
                            🏪 Dealer Note: Please request Admin to prepare the quotation so you can collect payments.
                          </p>
                        )}
                      </div>
                    ) : hasPaymentsRecorded ? (
                      <div className="space-y-6">
                        {/* 3 Metric Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Contract Value</span>
                            <span className="text-lg font-black text-slate-900 mt-1">₹{orderSubtotal.toLocaleString('en-IN')}</span>
                            <span className="text-[10px] text-slate-400 mt-1">From quotation line items</span>
                          </div>

                          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex flex-col justify-between">
                            <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Total Amount Collected</span>
                            <span className="text-lg font-black text-emerald-700 mt-1">₹{totalPaid.toLocaleString('en-IN')}</span>
                            <div className="w-full bg-emerald-200 rounded-full h-1.5 mt-2 overflow-hidden">
                              <div
                                className="bg-emerald-600 h-full rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.round((totalPaid / (orderSubtotal || 1)) * 100))}%` }}
                              />
                            </div>
                          </div>

                          <div className={`border rounded-xl p-4 flex flex-col justify-between ${
                            remainingBalance > 0 ? 'bg-amber-50/80 border-amber-300 shadow-xs' : 'bg-slate-50 border-slate-200'
                          }`}>
                            <div>
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${remainingBalance > 0 ? 'text-amber-800' : 'text-slate-500'}`}>
                                Remaining Balance
                              </span>
                              <span className={`text-lg font-black mt-1 block ${remainingBalance > 0 ? 'text-amber-900' : 'text-slate-700'}`}>
                                ₹{remainingBalance.toLocaleString('en-IN')}
                              </span>
                            </div>
                            {remainingBalance > 0 && selectedLead ? (
                              <a
                                href={`https://api.whatsapp.com/send?phone=${getCleanWhatsAppPhone(selectedLead.phoneNumber)}&text=${encodeURIComponent(
                                  `Dear ${selectedLead.name},\n\nGreetings from *Green Energy Solution*! ☀️\n\nThis is a polite payment reminder regarding your Solar Rooftop Order details:\n\n📌 *Total Contract Amount:* ₹${orderSubtotal.toLocaleString('en-IN')}\n✅ *Total Amount Paid:* ₹${totalPaid.toLocaleString('en-IN')}\n⚠️ *Remaining Balance Due:* ₹${remainingBalance.toLocaleString('en-IN')}\n\nKindly clear the remaining payment of *₹${remainingBalance.toLocaleString('en-IN')}* at your earliest convenience to avoid installation delays.\n\nThank you!\n*Green Energy Solution*`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                                title="Send WhatsApp Reminder"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Remind on WhatsApp</span>
                              </a>
                            ) : (
                              <span className="text-[10px] mt-1 font-semibold text-slate-400">No dues remaining</span>
                            )}
                          </div>
                        </div>

                        {/* Payments Breakdown History List */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                            <span>Payment Installment History ({paymentsList.length})</span>
                            {existingOc && typeof existingOc.confirmationPdfBlob === 'string' && (
                              <a
                                href={existingOc.confirmationPdfBlob}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-violet-600 hover:text-violet-800 font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Download className="w-3 h-3" /> Latest Receipt PDF
                              </a>
                            )}
                          </h4>

                          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                            {paymentsList.map((pay, idx) => {
                              const paidTillThis = paymentsList.slice(0, idx + 1).reduce((s, p) => s + p.amount, 0);
                              const balAfter = Math.max(0, orderSubtotal - paidTillThis);

                              return (
                                <div key={pay.id || idx} className="p-3.5 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 text-emerald-800 flex items-center justify-center font-black text-xs shrink-0">
                                      #{pay.installmentNo || idx + 1}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-900 text-xs">{pay.label || `${idx === 0 ? '1st Advance' : `${idx + 1}nd`} Payment`}</span>
                                        <span className="px-2 py-0.5 rounded bg-slate-200/60 text-[9px] font-bold text-slate-700 uppercase">
                                          {pay.paymentMode?.replace('_', ' ')}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                                        Paid on {dayjs(pay.paidAt).format('DD MMM YYYY, hh:mm A')}
                                        {pay.paymentReference ? ` • Ref: ${pay.paymentReference}` : ''}
                                      </p>
                                      {pay.notes && <p className="text-[10px] text-slate-600 italic mt-0.5">"{pay.notes}"</p>}
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <span className="text-sm font-black text-emerald-700 block">₹{pay.amount.toLocaleString('en-IN')}</span>
                                    <span className="text-[10px] text-slate-400 font-semibold block">
                                      Remaining: ₹{balAfter.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Add Subsequent Payment Form (Only when remaining balance > 0) */}
                        {remainingBalance > 0 ? (
                          <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                                  <CreditCard className="w-4 h-4 text-amber-600" />
                                  <span>Record {nextLabel} Payment</span>
                                </h4>
                                <p className="text-[10px] text-amber-700 font-medium mt-0.5">
                                  Client currently has a remaining balance of <strong className="text-amber-900">₹{remainingBalance.toLocaleString('en-IN')}</strong>.
                                </p>
                              </div>

                              {selectedLead && (
                                <a
                                  href={`https://api.whatsapp.com/send?phone=${getCleanWhatsAppPhone(selectedLead.phoneNumber)}&text=${encodeURIComponent(
                                    `Dear ${selectedLead.name},\n\nGreetings from *Green Energy Solution*! ☀️\n\nThis is a polite payment reminder regarding your Solar Rooftop Order details:\n\n📌 *Total Contract Amount:* ₹${orderSubtotal.toLocaleString('en-IN')}\n✅ *Total Amount Paid:* ₹${totalPaid.toLocaleString('en-IN')}\n⚠️ *Remaining Balance Due:* ₹${remainingBalance.toLocaleString('en-IN')}\n\nKindly clear the remaining payment of *₹${remainingBalance.toLocaleString('en-IN')}* at your earliest convenience to avoid installation delays.\n\nThank you!\n*Green Energy Solution*`
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>Remind Customer on WhatsApp</span>
                                </a>
                              )}
                            </div>

                            <form onSubmit={handleRecordSubsequentPayment} className="space-y-3 pt-1">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[11px] font-bold text-amber-900 mb-1">
                                    {nextLabel} Amount (₹)
                                  </label>
                                  <input
                                    type="number"
                                    required
                                    min={1}
                                    max={remainingBalance}
                                    value={subsequentAmount || ''}
                                    onChange={(e) => setSubsequentAmount(Number(e.target.value))}
                                    placeholder={`Max ₹${remainingBalance.toLocaleString('en-IN')}`}
                                    className="w-full border border-amber-300 rounded-lg px-3 py-2 bg-white text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[11px] font-bold text-amber-900 mb-1">Payment Mode</label>
                                  <select
                                    value={subsequentPaymentMode}
                                    onChange={(e) => setSubsequentPaymentMode(e.target.value as any)}
                                    className="w-full border border-amber-300 rounded-lg px-3 py-2 bg-white text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                                  >
                                    <option value="utr">Bank UTR</option>
                                    <option value="transaction_id">Online Transaction ID</option>
                                    <option value="cheque">Cheque Number</option>
                                    <option value="cash">Cash Receipt</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[11px] font-bold text-amber-900 mb-1">Transaction Ref / Cheque No</label>
                                  <input
                                    type="text"
                                    value={subsequentReference}
                                    onChange={(e) => setSubsequentReference(e.target.value)}
                                    placeholder="e.g. UTR87654321"
                                    className="w-full border border-amber-300 rounded-lg px-3 py-2 bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  />
                                </div>
                              </div>

                              <div>
                                <input
                                  type="text"
                                  value={subsequentNotes}
                                  onChange={(e) => setSubsequentNotes(e.target.value)}
                                  placeholder="Optional Payment Remarks (e.g., Received on delivery of solar panels)"
                                  className="w-full border border-amber-200 rounded-lg px-3 py-1.5 bg-white/80 text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                              </div>

                              <button
                                type="submit"
                                disabled={isRecordingPayment}
                                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-all shadow-xs cursor-pointer flex items-center gap-2"
                              >
                                <CheckCircle className="w-4 h-4" />
                                <span>
                                  {isRecordingPayment
                                    ? `Recording ${nextLabel}...`
                                    : `Save ${nextLabel} (₹${(subsequentAmount || 0).toLocaleString('en-IN')}) & Update Receipt`}
                                </span>
                              </button>
                            </form>
                          </div>
                        ) : (
                          /* Full Payment Cleared Banner */
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                                <CheckCircle className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wider">🎉 Full Contract Amount Paid</h4>
                                <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                                  All dues for this order have been fully settled (Total Paid: <strong className="text-emerald-900">₹{totalPaid.toLocaleString('en-IN')}</strong>). No further payments can be added.
                                </p>
                              </div>
                            </div>
                            <span className="px-3 py-1.5 rounded-full bg-emerald-600 text-white font-extrabold text-[11px] uppercase tracking-wider shrink-0 shadow-xs">
                              100% Cleared
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* First Time Initial Advance Booking Form */
                      <div className="space-y-4">
                        <div className="bg-violet-50/60 border border-violet-200 rounded-xl p-3 text-[11px] text-violet-800 font-medium">
                          <strong>Order Initial Booking & Payment Entry:</strong> Enter the 1st Advance Payment deposit amount to initiate order confirmation and unlock installment tracking.
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-slate-600 font-bold mb-1">1st Advance Amount Collected (₹)</label>
                            <input
                              type="number"
                              required
                              value={advanceAmount || ''}
                              onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                              placeholder="e.g. 50000"
                              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50 font-bold text-slate-800 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-slate-600 font-bold mb-1">Payment Mode</label>
                            <select
                              value={paymentMode}
                              onChange={(e) => setPaymentMode(e.target.value as any)}
                              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50 font-bold focus:outline-none cursor-pointer text-slate-700"
                            >
                              <option value="utr">Bank UTR</option>
                              <option value="transaction_id">Online Transaction ID</option>
                              <option value="cheque">Cheque Number</option>
                              <option value="cash">Cash Receipt</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-slate-600 font-bold mb-1">Transaction Ref / Cheque No</label>
                            <input
                              type="text"
                              value={paymentReference}
                              onChange={(e) => setPaymentReference(e.target.value)}
                              placeholder="e.g. UTR12345678"
                              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50 font-medium focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Signature Capture component */}
                        <div className="max-w-md">
                          <SignatureCapture onSave={(blob, dataUrl) => {
                            setSignatureBlob(blob);
                            setSignatureUrl(dataUrl);
                          }} />

                          {signatureBlob && (
                            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded w-fit">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Signature Canvas Captured</span>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={handleConfirmOrder}
                          disabled={isBookingOrder}
                          className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer flex justify-center items-center gap-2"
                        >
                          <FileCheck className="w-4 h-4" />
                          <span>{isBookingOrder ? 'Booking Order & Receipt...' : 'Book Order & Lock Contract (1st Advance)'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* KYC Document uploads slots (Restricted / Removed for Dealer) */}
                  {currentRole !== 'dealer' && currentUser?.role !== 'dealer' && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                      <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Utility & KYC Document Uploads (5 Slots)</h3>
                          <p className="text-[10px] text-slate-400 font-medium">Verify identity and billing accounts. Target size compressed automatically &lt; 1MB.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {(['pan_card', 'aadhar_card', 'electricity_bill', 'tax_paper', 'account_details'] as const).map((docType) => {
                          const doc = kycDocs.find(d => d.docType === docType);
                          return (
                            <div key={docType} className="border border-slate-200 rounded-xl p-4 bg-slate-50 relative flex flex-col justify-between h-36">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                                  {docType.replace('_', ' ')}
                                </span>
                                {doc ? (
                                  <div className="space-y-1.5">
                                    <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                                      <CheckCircle className="w-4 h-4" /> Completed
                                    </span>
                                    <p className="text-[9px] text-slate-400 font-medium">Uploaded: {dayjs(doc.uploadedAt).format('DD MMM YYYY')}</p>
                                  </div>
                                ) : (
                                  <span className="text-xs font-bold text-slate-400 italic">Document Missing</span>
                                )}
                              </div>

                              <div className="mt-3 pt-3 border-t border-slate-200/50 flex justify-between items-center">
                                {doc ? (
                                  <>
                                    <div className="flex gap-2.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const url = typeof doc.fileBlob === 'string' ? doc.fileBlob : URL.createObjectURL(doc.fileBlob);
                                          setPreviewDoc({
                                            name: doc.docType.replace('_', ' ').toUpperCase(),
                                            url,
                                            type: (doc.fileBlob as any)?.type || (url.includes('.pdf') ? 'application/pdf' : 'image/webp')
                                          });
                                        }}
                                        className="text-[10px] text-emerald-600 hover:text-emerald-800 font-black cursor-pointer"
                                      >
                                        View
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const url = typeof doc.fileBlob === 'string' ? doc.fileBlob : URL.createObjectURL(doc.fileBlob);
                                          const a = document.createElement('a');
                                          a.href = url;
                                          a.target = '_blank';
                                          a.download = `${doc.docType}_${selectedLead.name.replace(/\s+/g, '_')}`;
                                          document.body.appendChild(a);
                                          a.click();
                                          document.body.removeChild(a);
                                        }}
                                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                                      >
                                        Download
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleDocDelete(doc.id)}
                                      className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <div className="relative overflow-hidden w-full">
                                    <input
                                      type="file"
                                      accept="image/*,application/pdf"
                                      disabled={uploadingDocType === docType}
                                      onChange={(e) => e.target.files?.[0] && handleDocUpload(docType, e.target.files[0])}
                                      className="absolute inset-0 opacity-0 cursor-pointer w-full disabled:cursor-not-allowed"
                                    />
                                    <button
                                      type="button"
                                      className={`w-full py-1.5 ${uploadingDocType === docType ? 'bg-amber-600 animate-pulse' : 'bg-slate-800 hover:bg-slate-700'} text-white rounded-lg text-[10px] font-bold transition-all text-center flex items-center justify-center gap-1 pointer-events-none`}
                                    >
                                      <UploadCloud className={`w-3.5 h-3.5 ${uploadingDocType === docType ? 'animate-spin' : ''}`} />
                                      <span>{uploadingDocType === docType ? 'Uploading to B2...' : 'Choose File'}</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Tab 4: Installation Photos & Quality Checks */}
            {activeTab === 'installation' && (
              <div className="space-y-6 text-xs font-semibold">
                <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Installation & Quality Assurance</h3>
                    <p className="text-[10px] text-slate-400 font-medium">Manage installation remarks and capture geotagged inspection photos.</p>
                  </div>
                </div>

                {/* Quick Installation Remark Form */}
                <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 space-y-2.5 max-w-xl shadow-2xs">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                      <span>Installation Quick Remark / Note</span>
                      <span className="text-[10px] text-amber-600 font-normal lowercase">(visible on lead card)</span>
                    </label>
                    {saveRemarkSuccess && (
                      <span className="text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-600" /> Saved
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      maxLength={120}
                      value={installRemarkText}
                      onChange={(e) => setInstallRemarkText(e.target.value)}
                      placeholder="e.g. Structure done, Wiring completed, Meter pending..."
                      className="flex-1 border border-amber-300 focus:border-amber-500 rounded-xl px-3 py-2 bg-white text-xs font-medium text-slate-800 focus:outline-none shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={handleSaveInstallRemark}
                      disabled={isSavingInstallRemark}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-all shrink-0 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isSavingInstallRemark ? 'Saving...' : 'Save Remark'}</span>
                    </button>
                  </div>
                </div>

                {/* Capture photo input form */}
                {['super_admin', 'admin', 'field_employee'].includes(currentRole) && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 max-w-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-500 mb-1">Target Photo Category</label>
                        <select
                          value={installPhotoType}
                          onChange={(e) => setInstallPhotoType(e.target.value as any)}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white cursor-pointer"
                        >
                          <option value="earthing">Earthing System</option>
                          <option value="meter">Bi-directional Meter</option>
                          <option value="grouting">Structure Grouting</option>
                          <option value="other">Other Components</option>
                        </select>
                      </div>
                      <div className="flex flex-col justify-end">
                        <div className="relative overflow-hidden w-full">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            disabled={isCapturingInstall}
                            onChange={handleCaptureInstallPhoto}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full disabled:cursor-not-allowed"
                          />
                          <button
                            type="button"
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 pointer-events-none"
                          >
                            <Camera className="w-4 h-4" />
                            <span>{isCapturingInstall ? 'Processing & Geotagging...' : 'Capture Photo'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {isLocatingInstall && (
                      <p className="text-[10px] text-emerald-600 font-bold animate-pulse">🛰️ Acquiring precision GPS satellite location coordinates...</p>
                    )}
                  </div>
                )}

                {/* Uploaded Gallery Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {installPhotos.map((photo) => {
                    const objectUrl = typeof photo.photoBlob === 'string' ? photo.photoBlob : URL.createObjectURL(photo.photoBlob);
                    return (
                      <div key={photo.id} className="border border-slate-200 rounded-xl p-3 bg-white space-y-3 shadow-xs">
                        <div className="flex justify-between items-start">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-slate-900 text-white uppercase tracking-wider">
                            {photo.photoType}
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              if (confirm('Delete this installation photo?')) {
                                await orderService.deleteInstallationPhoto(photo.id);
                                handleSelectLead(selectedLead);
                              }
                            }}
                            className="text-rose-500 hover:text-rose-700 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <a href={objectUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-100 bg-slate-50 aspect-video">
                          <img src={objectUrl} alt="Inspection tag" className="w-full h-full object-cover hover:scale-105 transition-transform" />
                        </a>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 min-w-0 text-slate-500 text-[10px] font-medium">
                            <Compass className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate">{photo.location.placeName || `${photo.location.latitude.toFixed(4)}, ${photo.location.longitude.toFixed(4)}`}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              window.open(`https://www.google.com/maps/search/?api=1&query=${photo.location.latitude},${photo.location.longitude}`, '_blank');
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-xs shrink-0 flex items-center gap-1 cursor-pointer"
                          >
                            <Compass className="w-3 h-3" />
                            <span>Check Map Location</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {installPhotos.length === 0 && (
                    <p className="col-span-full text-slate-400 font-medium italic py-6 text-center">No quality assurance photographs captured yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Documentation containing DCR & WCR Certificate generator */}
            {activeTab === 'documentation' && (
              <div className="space-y-4">
                <div className="border-b border-slate-200 pb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 print:hidden">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Client Documentation Portal</h3>
                    <p className="text-[11px] text-slate-450 font-semibold mt-0.5">Manage and print Domestic Content Requirement (DCR) and Work Completion Reports (WCR) for this lead.</p>
                  </div>
                  
                  {/* Nested Tab Selection Buttons - Admin / Super Admin gets all document forms; Field Employee gets WCR only */}
                  {currentRole !== 'field_employee' ? (
                    <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg border border-slate-200 self-start select-none gap-1">
                      <button
                        onClick={() => { setDocSubTab('dcr'); setEditingDocData(null); }}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                          docSubTab === 'dcr' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-650 hover:bg-slate-200'
                        }`}
                      >
                        DCR Certificate
                      </button>
                      <button
                        onClick={() => { setDocSubTab('wcr'); setEditingDocData(null); }}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                          docSubTab === 'wcr' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-650 hover:bg-slate-200'
                        }`}
                      >
                        WCR Report
                      </button>
                      <button
                        onClick={() => { setDocSubTab('model_agreement'); setEditingDocData(null); }}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                          docSubTab === 'model_agreement' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-650 hover:bg-slate-200'
                        }`}
                      >
                        Model Agreement
                      </button>
                      <button
                        onClick={() => { setDocSubTab('cfa_agreement'); setEditingDocData(null); }}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                          docSubTab === 'cfa_agreement' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-650 hover:bg-slate-200'
                        }`}
                      >
                        CFA Agreement
                      </button>
                      <button
                        onClick={() => { setDocSubTab('annexure_proforma'); setEditingDocData(null); }}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                          docSubTab === 'annexure_proforma' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-650 hover:bg-slate-200'
                        }`}
                      >
                        Annexure Proforma
                      </button>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-lg text-xs font-bold">
                      <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>WCR Report Portal</span>
                    </div>
                  )}
                </div>

                {/* Saved Generated Documentation Files Section */}
                {kycDocs.filter(d => ['dcr_certificate', 'wcr_report', 'model_agreement', 'cfa_agreement', 'annexure_proforma'].includes(d.docType)).length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-emerald-600" />
                        <span>Saved Documentation Files ({kycDocs.filter(d => ['dcr_certificate', 'wcr_report', 'model_agreement', 'cfa_agreement', 'annexure_proforma'].includes(d.docType)).length})</span>
                      </h4>
                      <span className="text-[10px] text-slate-400 font-bold">Saved for {selectedLead.name}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {kycDocs.filter(d => ['dcr_certificate', 'wcr_report', 'model_agreement', 'cfa_agreement', 'annexure_proforma'].includes(d.docType)).map((doc) => {
                        const getDocTitle = (type: string) => {
                          if (type === 'dcr_certificate') return 'DCR Certificate';
                          if (type === 'wcr_report') return 'WCR Work Completion Report';
                          if (type === 'model_agreement') return 'Model Agreement';
                          if (type === 'cfa_agreement') return 'CFA Agreement';
                          if (type === 'annexure_proforma') return 'Annexure Proforma';
                          return type.replace('_', ' ').toUpperCase();
                        };

                        const getSubTab = (type: string) => {
                          if (type === 'dcr_certificate') return 'dcr';
                          if (type === 'wcr_report') return 'wcr';
                          if (type === 'model_agreement') return 'model_agreement';
                          if (type === 'cfa_agreement') return 'cfa_agreement';
                          return 'annexure_proforma';
                        };

                        return (
                          <div key={doc.id} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 shadow-2xs flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-extrabold text-slate-900 block truncate">{getDocTitle(doc.docType)}</span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase">Saved</span>
                              </div>
                              <p className="text-[9px] text-slate-400 font-bold mt-0.5">Saved At: {dayjs(doc.uploadedAt).format('DD MMM YYYY, hh:mm A')}</p>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                              <div className="flex items-center gap-1.5">
                                {/* View Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const url = typeof doc.fileBlob === 'string' ? doc.fileBlob : (doc.fileBlob instanceof Blob ? URL.createObjectURL(doc.fileBlob) : '');
                                    if (url && (url.startsWith('http') || url.startsWith('blob:'))) {
                                      window.open(url, '_blank');
                                    } else if (doc.formData) {
                                      setEditingDocData(doc.formData);
                                      setDocSubTab(getSubTab(doc.docType) as any);
                                      alert(`Loading saved ${getDocTitle(doc.docType)} form data into editor...`);
                                    } else {
                                      setPreviewDoc({
                                        name: getDocTitle(doc.docType),
                                        url: url || '',
                                        type: 'application/pdf'
                                      });
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-black rounded flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Eye className="w-3 h-3 text-emerald-600" />
                                  <span>View</span>
                                </button>

                                {/* Edit Button */}
                                {doc.formData && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDocData(doc.formData);
                                      setDocSubTab(getSubTab(doc.docType) as any);
                                      alert(`Loading saved ${getDocTitle(doc.docType)} form data into editor...`);
                                    }}
                                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-black rounded flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Load saved form fields for editing"
                                  >
                                    <Edit3 className="w-3 h-3 text-blue-600" />
                                    <span>Edit</span>
                                  </button>
                                )}
                              </div>

                              {/* Delete Button */}
                              <button
                                type="button"
                                onClick={() => handleDocDelete(doc.id)}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer transition-colors"
                                title="Delete saved document"
                              >
                                <Trash2 className="w-3 h-3 text-rose-500" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Render Selected Document inside a styled viewport container */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  {currentRole === 'field_employee' ? (
                    <WcrDocument defaultLeadId={selectedLead?.id} isEmbedded={true} initialData={editingDocData} onSaveSuccess={() => handleSelectLead(selectedLead)} />
                  ) : docSubTab === 'dcr' ? (
                    <DcrDocument defaultLeadId={selectedLead?.id} isEmbedded={true} initialData={editingDocData} onSaveSuccess={() => handleSelectLead(selectedLead)} />
                  ) : docSubTab === 'wcr' ? (
                    <WcrDocument defaultLeadId={selectedLead?.id} isEmbedded={true} initialData={editingDocData} onSaveSuccess={() => handleSelectLead(selectedLead)} />
                  ) : docSubTab === 'model_agreement' ? (
                    <ModelAgreementDocument defaultLeadId={selectedLead?.id} isEmbedded={true} initialData={editingDocData} onSaveSuccess={() => handleSelectLead(selectedLead)} />
                  ) : docSubTab === 'cfa_agreement' ? (
                    <CfaAgreementDocument defaultLeadId={selectedLead?.id} isEmbedded={true} initialData={editingDocData} onSaveSuccess={() => handleSelectLead(selectedLead)} />
                  ) : (
                    <AnnexureProformaDocument defaultLeadId={selectedLead?.id} isEmbedded={true} initialData={editingDocData} onSaveSuccess={() => handleSelectLead(selectedLead)} />
                  )}
                </div>
              </div>
            )}

            {/* Tab 5: Registration Checklist & Release (Admin/Super Admin only) */}
            {activeTab === 'registration' && currentRole !== 'field_employee' && (
              <div className="space-y-6 text-xs font-semibold max-w-2xl">
                {/* checklist card */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="border-b border-slate-200/60 pb-3">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Office Checklist & Approvals</h3>
                  </div>

                  {regChecklist ? (
                    <div className="space-y-4">
                      {/* Checkboxes */}
                      <div className="space-y-3">
                        <label className="flex items-center space-x-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={regChecklist.registrationDone}
                            onChange={(e) => handleChecklistToggle('registrationDone', e.target.checked)}
                            className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-slate-700">1. DISCOM Registration Done</span>
                        </label>

                        <label className="flex items-center space-x-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={regChecklist.fileMade}
                            onChange={(e) => handleChecklistToggle('fileMade', e.target.checked)}
                            className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-slate-700">2. Customer Physical File Compiled</span>
                        </label>

                        <label className="flex items-center space-x-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={regChecklist.bankFileUploaded}
                            onChange={(e) => handleChecklistToggle('bankFileUploaded', e.target.checked)}
                            className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-slate-700">3. Bank File Uploaded Checklist</span>
                        </label>
                      </div>

                      {/* Bank file uploader field if bank file checked */}
                      {regChecklist.bankFileUploaded && (
                        <div className="bg-white p-3 border border-slate-200 rounded-xl space-y-2">
                          <label className="block text-[10px] text-slate-500 uppercase font-bold">Bank File / Loan Document Upload</label>
                          <div className="flex items-center justify-between gap-4">
                            {regChecklist.bankDocumentBlob ? (
                              <>
                                <span className="text-[10px] text-emerald-600 font-extrabold flex items-center gap-1">
                                  <CheckSquare className="w-3.5 h-3.5" /> File Saved
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const url = typeof regChecklist.bankDocumentBlob === 'string' ? regChecklist.bankDocumentBlob : URL.createObjectURL(regChecklist.bankDocumentBlob as Blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.target = '_blank';
                                    a.download = `Bank_File_${selectedLead.name.replace(/\s+/g, '_')}`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                  }}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                                >
                                  Download File
                                </button>
                              </>
                            ) : (
                              <div className="relative overflow-hidden w-full max-w-xs">
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  onChange={(e) => e.target.files?.[0] && handleBankFileUpload(e.target.files[0])}
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full z-10"
                                />
                                <button
                                  type="button"
                                  className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                                >
                                  <UploadCloud className="w-4 h-4 text-white" />
                                  <span>📁 Choose File / Upload Bank Document</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Loan status dropdown */}
                      <div className="space-y-1">
                        <label className="block text-slate-500">Loan Approval Status</label>
                        <select
                          value={regChecklist.loanStatus}
                          onChange={(e) => handleChecklistToggle('loanStatus', e.target.value)}
                          className="w-full sm:w-64 border border-slate-200 rounded-xl p-2.5 bg-white cursor-pointer"
                        >
                          <option value="pending">Pending Review</option>
                          <option value="approved">Approved & Disbursed</option>
                          <option value="rejected">Rejected / Cancelled</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 font-medium italic">Please confirm the client order booking to initialize office registrations.</p>
                  )}
                </div>

                {/* Release Dept documents */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                  <div className="border-b border-slate-100 pb-3 flex justify-between items-start gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <span>Release Department (Final Phase)</span>
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">Upload physical completion handover sheet / NOC (Only 1 file allowed per lead).</p>
                    </div>
                    {selectedLead?.status === 'closed' && (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-800 text-white font-extrabold text-[10px] uppercase tracking-wider shrink-0 shadow-xs">
                        ✓ Pipeline Closed
                      </span>
                    )}
                  </div>

                  {/* Uploaded Single Release Doc Slot */}
                  {releaseDocs.length > 0 ? (
                    <div className="bg-emerald-50/80 p-4 rounded-xl border border-emerald-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-extrabold text-emerald-800 flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <span>1 Handover NOC File Saved (Pipeline Closed)</span>
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold">{dayjs(releaseDocs[0].uploadedAt).format('DD MMM YYYY, hh:mm A')}</span>
                      </div>

                      {releaseDocs[0].notes && (
                        <p className="text-xs text-slate-600 bg-white p-2 rounded border border-emerald-100 italic">
                          <strong>Inspector Notes:</strong> {releaseDocs[0].notes}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-emerald-200/60">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const rel = releaseDocs[0];
                              const url = typeof rel.fileBlob === 'string' ? rel.fileBlob : URL.createObjectURL(rel.fileBlob);
                              setPreviewDoc({
                                name: 'Release Handover Document',
                                url,
                                type: (rel.fileBlob as any)?.type || (url.includes('.pdf') ? 'application/pdf' : 'image/webp')
                              });
                            }}
                            className="text-xs text-emerald-700 hover:text-emerald-900 font-black cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-emerald-200 shadow-2xs flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View File</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const rel = releaseDocs[0];
                              const url = typeof rel.fileBlob === 'string' ? rel.fileBlob : URL.createObjectURL(rel.fileBlob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.target = '_blank';
                              a.download = `Release_NOC_${selectedLead.name.replace(/\s+/g, '_')}`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                            }}
                            className="text-xs text-indigo-700 hover:text-indigo-900 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 shadow-2xs cursor-pointer flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download File</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReleaseDelete(releaseDocs[0].id)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-bold bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-200 shadow-2xs cursor-pointer flex items-center gap-1"
                            title="Delete File"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>

                        {/* Re-upload / Replace Single File Button */}
                        <div className="relative overflow-hidden shrink-0">
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => e.target.files?.[0] && handleReleaseUpload(e.target.files[0])}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full z-10"
                          />
                          <button
                            type="button"
                            className="py-1.5 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-all text-center flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <UploadCloud className="w-3.5 h-3.5 text-white" />
                            <span>🔄 Replace / Upload New NOC File</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-slate-600 font-bold mb-1">Release Comments / Inspector Notes</label>
                        <input
                          type="text"
                          value={releaseNotes}
                          onChange={(e) => setReleaseNotes(e.target.value)}
                          placeholder="e.g. Net metering tests passed, system is live."
                          className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-medium text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 font-bold mb-1.5">Handover Document Upload (NOC / Completion)</label>
                        <div className="relative overflow-hidden w-full max-w-md">
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => e.target.files?.[0] && handleReleaseUpload(e.target.files[0])}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full z-10"
                          />
                          <button
                            type="button"
                            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-black transition-all text-center flex items-center justify-center gap-2 shadow-md hover:shadow-lg cursor-pointer"
                          >
                            <UploadCloud className="w-4 h-4 text-white" />
                            <span>📁 Choose File / Upload Single Handover NOC Document</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Leads List View */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Lead Management</h1>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Monitor leads, assign staff, and track progress.</p>
            </div>
            
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="flex p-1 bg-slate-200/70 rounded-xl">
                <button
                  type="button"
                  onClick={() => setMainTab('pipeline')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    mainTab === 'pipeline'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Lead Pipeline</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMainTab('reminders')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    mainTab === 'reminders'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>🔔 Follow-up Reminders</span>
                </button>

                {currentRole !== 'field_employee' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMainTab('reports');
                      handleOpenReportsModal();
                    }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      mainTab === 'reports'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>📊 Reports</span>
                  </button>
                )}
              </div>

              {['super_admin', 'admin', 'field_employee'].includes(currentRole) && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Lead</span>
                </button>
              )}
            </div>
          </div>

          {mainTab === 'reminders' ? (
            <FollowUpReminders
              onSelectLead={(id) => {
                setMainTab('pipeline');
                const target = leads.find(l => l.id === id);
                if (target) handleSelectLead(target);
              }}
            />
          ) : mainTab === 'reports' ? (
            /* In-Page Reports Summary View (No popup, No disk saves) */
            <div className="space-y-6 animate-fade-in">
              {/* Header & KPI Summary */}
              <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black tracking-tight">Executive Lead Financial & Progress Summary</h2>
                    <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                      LIVE DATA
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-1">Real-time breakdown of proposal values, collections, pending balances, and pipeline progress per client.</p>
                </div>
                
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleDownloadReportPDF(reportItems)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all shrink-0 flex items-center gap-1.5"
                    title="Download Official PDF Report with Letterhead"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportReportToCSV(reportItems)}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all shrink-0 flex items-center gap-1.5"
                    title="Export Data Table to Excel CSV File"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Export Excel</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintReport}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 cursor-pointer transition-all shrink-0 flex items-center gap-1.5"
                    title="Print Sheet with Header Page"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Sheet</span>
                  </button>
                </div>
              </div>

              {/* KPI Summary Cards & Time Period Toolbar */}
              {(() => {
                const filteredItems = reportItems.filter(item => {
                  const searchStr = (reportSearchTerm || '').toLowerCase().trim();
                  const matchesSearch = !searchStr || 
                    (item.name || '').toLowerCase().includes(searchStr) ||
                    (item.phone || '').includes(searchStr) ||
                    (item.requirement || '').toLowerCase().includes(searchStr);
                  
                  const matchesStage = !reportStageFilter || item.status === reportStageFilter;
                  const matchesPayment = !reportPaymentFilter || item.paymentStatus === reportPaymentFilter;

                  let matchesTime = true;
                  if (item.createdAt && dayjs(item.createdAt).isValid()) {
                    const itemDate = dayjs(item.createdAt);
                    const now = dayjs();

                    if (reportTimeFilter === 'today') {
                      matchesTime = itemDate.isSame(now, 'day');
                    } else if (reportTimeFilter === 'week') {
                      matchesTime = itemDate.isSame(now, 'week') || itemDate.isAfter(now.subtract(7, 'day'));
                    } else if (reportTimeFilter === 'month') {
                      matchesTime = itemDate.isSame(now, 'month');
                    } else if (reportTimeFilter === 'year') {
                      matchesTime = itemDate.isSame(now, 'year');
                    } else if (reportTimeFilter === 'custom') {
                      if (reportStartDate) {
                        matchesTime = matchesTime && (itemDate.isSame(dayjs(reportStartDate), 'day') || itemDate.isAfter(dayjs(reportStartDate).startOf('day')));
                      }
                      if (reportEndDate) {
                        matchesTime = matchesTime && (itemDate.isSame(dayjs(reportEndDate), 'day') || itemDate.isBefore(dayjs(reportEndDate).endOf('day')));
                      }
                    }
                  }

                  return matchesSearch && matchesStage && matchesPayment && matchesTime;
                });

                const totalActiveLeads = filteredItems.length;
                const totalPipelineValue = filteredItems.reduce((s, i) => s + i.totalValue, 0);
                const totalCollectedValue = filteredItems.reduce((s, i) => s + i.paidAmount, 0);
                const totalPendingValue = filteredItems.reduce((s, i) => s + i.pendingBalance, 0);
                const totalClosed = filteredItems.filter(i => ['confirmed', 'registered', 'installed', 'closed'].includes(i.status)).length;
                const conversionRate = totalActiveLeads > 0 ? Math.round((totalClosed / totalActiveLeads) * 100) : 0;

                const stageCounts = {
                  new: filteredItems.filter(i => i.status === 'new').length,
                  quotation_sent: filteredItems.filter(i => i.status === 'quotation_sent').length,
                  confirmed: filteredItems.filter(i => i.status === 'confirmed').length,
                  registered: filteredItems.filter(i => i.status === 'registered').length,
                  installed: filteredItems.filter(i => i.status === 'installed').length,
                  closed: filteredItems.filter(i => i.status === 'closed').length,
                  lost: filteredItems.filter(i => i.status === 'lost').length,
                };

                return (
                  <div className="space-y-6">
                    {/* Date-Range & Period Analytics Toolbar */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Calendar className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider">Date-Range Report Filter</h3>
                            <p className="text-[11px] text-slate-400 font-medium">Select any two dates to analyze reports between that custom date range.</p>
                          </div>
                        </div>

                        {/* Quick Preset Buttons */}
                        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl text-xs font-bold shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setReportTimeFilter('all');
                              setReportStartDate('');
                              setReportEndDate('');
                            }}
                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                              reportTimeFilter === 'all' && !reportStartDate && !reportEndDate
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            ⚡ All Time
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const todayStr = dayjs().format('YYYY-MM-DD');
                              setReportTimeFilter('today');
                              setReportStartDate(todayStr);
                              setReportEndDate(todayStr);
                            }}
                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                              reportTimeFilter === 'today'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            📅 Today
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setReportTimeFilter('week');
                              setReportStartDate(dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
                              setReportEndDate(dayjs().format('YYYY-MM-DD'));
                            }}
                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                              reportTimeFilter === 'week'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            🗓️ Last 7 Days
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setReportTimeFilter('month');
                              setReportStartDate(dayjs().startOf('month').format('YYYY-MM-DD'));
                              setReportEndDate(dayjs().format('YYYY-MM-DD'));
                            }}
                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                              reportTimeFilter === 'month'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            📆 This Month
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setReportTimeFilter('year');
                              setReportStartDate(dayjs().startOf('year').format('YYYY-MM-DD'));
                              setReportEndDate(dayjs().format('YYYY-MM-DD'));
                            }}
                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                              reportTimeFilter === 'year'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            🏆 This Year
                          </button>
                        </div>
                      </div>

                      {/* Direct Two-Date Selectors (From Date & To Date) */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-bold bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                            <span className="text-slate-500 uppercase text-[10px] font-extrabold tracking-wider">From Date:</span>
                            <input
                              type="date"
                              value={reportStartDate}
                              onChange={(e) => {
                                setReportStartDate(e.target.value);
                                setReportTimeFilter('custom');
                              }}
                              className="font-bold text-slate-800 focus:outline-none cursor-pointer"
                            />
                          </div>

                          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                            <span className="text-slate-500 uppercase text-[10px] font-extrabold tracking-wider">To Date:</span>
                            <input
                              type="date"
                              value={reportEndDate}
                              onChange={(e) => {
                                setReportEndDate(e.target.value);
                                setReportTimeFilter('custom');
                              }}
                              className="font-bold text-slate-800 focus:outline-none cursor-pointer"
                            />
                          </div>

                          {(reportStartDate || reportEndDate) && (
                            <button
                              type="button"
                              onClick={() => {
                                setReportTimeFilter('all');
                                setReportStartDate('');
                                setReportEndDate('');
                              }}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-extrabold transition-colors cursor-pointer border border-rose-200"
                            >
                              Reset Dates
                            </button>
                          )}
                        </div>

                        {/* Active Date Range Banner */}
                        <div className="text-right">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {(reportStartDate || reportEndDate) 
                              ? `📅 Filtered: ${reportStartDate ? dayjs(reportStartDate).format('DD-MMM-YYYY') : 'Start'} to ${reportEndDate ? dayjs(reportEndDate).format('DD-MMM-YYYY') : 'Today'}`
                              : '⚡ Report Range: All Time History'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                        <span className="text-[11px] uppercase font-bold text-slate-400 block tracking-wider">Total Active Leads</span>
                        <div className="flex items-baseline justify-between mt-1">
                          <h3 className="text-2xl font-black text-slate-900">{totalActiveLeads}</h3>
                          <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                            {conversionRate}% Success Rate
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                        <span className="text-[11px] uppercase font-bold text-slate-400 block tracking-wider">Total Proposals Value</span>
                        <h3 className="text-2xl font-black text-slate-800 mt-1">₹{totalPipelineValue.toLocaleString('en-IN')}</h3>
                      </div>

                      <div className="bg-white p-5 rounded-2xl border-l-4 border-l-emerald-500 border-y border-r border-slate-200 shadow-xs">
                        <span className="text-[11px] uppercase font-bold text-emerald-700 block tracking-wider">Payments Collected</span>
                        <h3 className="text-2xl font-black text-emerald-600 mt-1">₹{totalCollectedValue.toLocaleString('en-IN')}</h3>
                      </div>

                      <div className="bg-white p-5 rounded-2xl border-l-4 border-l-amber-500 border-y border-r border-slate-200 shadow-xs">
                        <span className="text-[11px] uppercase font-bold text-amber-700 block tracking-wider">Outstanding Pending Balance</span>
                        <h3 className="text-2xl font-black text-amber-600 mt-1">₹{totalPendingValue.toLocaleString('en-IN')}</h3>
                      </div>
                    </div>

                    {/* Pipeline Stage Counts Bar */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <h4 className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">Pipeline Stage Milestones Breakdown</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 text-center text-xs">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">New Leads</span>
                          <span className="text-lg font-black text-slate-800 mt-0.5 block">{stageCounts.new}</span>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                          <span className="block text-[10px] font-bold text-blue-500 uppercase">Quotations</span>
                          <span className="text-lg font-black text-blue-700 mt-0.5 block">{stageCounts.quotation_sent}</span>
                        </div>
                        <div className="bg-violet-50 p-3 rounded-xl border border-violet-200">
                          <span className="block text-[10px] font-bold text-violet-500 uppercase">Confirmed</span>
                          <span className="text-lg font-black text-violet-700 mt-0.5 block">{stageCounts.confirmed}</span>
                        </div>
                        <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                          <span className="block text-[10px] font-bold text-indigo-500 uppercase">Registered</span>
                          <span className="text-lg font-black text-indigo-700 mt-0.5 block">{stageCounts.registered}</span>
                        </div>
                        <div className="bg-teal-50 p-3 rounded-xl border border-teal-200">
                          <span className="block text-[10px] font-bold text-teal-500 uppercase">Installed</span>
                          <span className="text-lg font-black text-teal-700 mt-0.5 block">{stageCounts.installed}</span>
                        </div>
                        <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                          <span className="block text-[10px] font-bold text-emerald-500 uppercase">Closed / Released</span>
                          <span className="text-lg font-black text-emerald-700 mt-0.5 block">{stageCounts.closed}</span>
                        </div>
                        <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
                          <span className="block text-[10px] font-bold text-rose-500 uppercase">Lost</span>
                          <span className="text-lg font-black text-rose-700 mt-0.5 block">{stageCounts.lost}</span>
                        </div>
                      </div>
                    </div>

                    {/* Filter & Search Controls */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-bold">
                      <div className="relative w-full md:w-80">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          placeholder="Search client by name or phone..."
                          value={reportSearchTerm}
                          onChange={(e) => setReportSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <select
                          value={reportStageFilter}
                          onChange={(e) => setReportStageFilter(e.target.value)}
                          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none cursor-pointer"
                        >
                          <option value="">All Pipeline Stages</option>
                          <option value="new">New Lead</option>
                          <option value="quotation_sent">Quotation Sent</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="registered">Registered</option>
                          <option value="installed">Installed</option>
                          <option value="closed">Closed</option>
                          <option value="lost">Lost</option>
                        </select>

                        <select
                          value={reportPaymentFilter}
                          onChange={(e) => setReportPaymentFilter(e.target.value)}
                          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none cursor-pointer"
                        >
                          <option value="">All Payment Statuses</option>
                          <option value="Fully Paid">Fully Paid</option>
                          <option value="Partially Paid">Partially Paid</option>
                          <option value="Pending">Pending Payment</option>
                          <option value="No Quote">No Quotation</option>
                        </select>
                      </div>
                    </div>

                    {/* Financial Summary Client List Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 text-white font-extrabold uppercase text-[10px] tracking-wider">
                            <tr>
                              <th className="py-3.5 px-4">Client Name & Phone</th>
                              <th className="py-3.5 px-4">Requirement</th>
                              <th className="py-3.5 px-4">Pipeline Status</th>
                              <th className="py-3.5 px-4 text-right">Contract Value (₹)</th>
                              <th className="py-3.5 px-4 text-right">Amount Paid (₹)</th>
                              <th className="py-3.5 px-4 text-right">Pending Balance (₹)</th>
                              <th className="py-3.5 px-4 text-center">Payment Status</th>
                              <th className="py-3.5 px-4">Assigned Staff</th>
                              <th className="py-3.5 px-4 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                            {filteredItems.map((item) => (
                              <tr key={item.leadId} className="hover:bg-slate-50 transition-colors">
                                <td className="py-3.5 px-4">
                                  <span className="font-extrabold text-slate-900 block">{item.name}</span>
                                  <span className="text-[10px] text-slate-400 font-medium">📞 +91 {item.phone}</span>
                                </td>
                                <td className="py-3.5 px-4 max-w-[180px] truncate text-slate-600" title={item.requirement}>
                                  {item.requirement}
                                </td>
                                <td className="py-3.5 px-4">
                                  {renderStatusBadge(item.status)}
                                </td>
                                <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                                  ₹{item.totalValue.toLocaleString('en-IN')}
                                </td>
                                <td className="py-3.5 px-4 text-right font-black text-emerald-600">
                                  ₹{item.paidAmount.toLocaleString('en-IN')}
                                  {item.installmentCount > 0 && (
                                    <span className="text-[9px] font-bold text-slate-400 block">
                                      ({item.installmentCount} payment{item.installmentCount > 1 ? 's' : ''})
                                    </span>
                                  )}
                                </td>
                                <td className={`py-3.5 px-4 text-right font-black ${item.pendingBalance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                  ₹{item.pendingBalance.toLocaleString('en-IN')}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                    item.paymentStatus === 'Fully Paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                    item.paymentStatus === 'Partially Paid' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                    item.paymentStatus === 'Pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {item.paymentStatus}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-[10px] text-slate-500 space-y-0.5">
                                  <div>👤 Sales: <span className="font-bold text-slate-700">{item.assignedSalesName}</span></div>
                                  <div>🏢 Admin: <span className="font-bold text-slate-700">{item.assignedAdminName}</span></div>
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const target = leads.find(l => l.id === item.leadId);
                                      if (target) {
                                        setMainTab('pipeline');
                                        handleSelectLead(target);
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 rounded-lg text-[10px] font-extrabold cursor-pointer transition-colors"
                                  >
                                    👁️ Stepper
                                  </button>
                                </td>
                              </tr>
                            ))}

                            {filteredItems.length === 0 && (
                              <tr>
                                <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                                  No client entries matching the current search and filters.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (() => {
            const pendingBalanceLeadsCount = leads.filter(l => {
              const fin = leadFinancialMap[l.id];
              return fin && fin.pendingBalance > 0;
            }).length;

            const rawLeadsCount = leads.filter(l => 
              (l.status === 'new' || l.status === 'quotation_sent') && !dispatchedLeadIds.has(l.id)
            ).length;

            const processDonePaymentDueCount = leads.filter(l => {
              const isProcessDone = (l.status === 'closed' || l.status === 'installed');
              const fin = leadFinancialMap[l.id];
              return isProcessDone && fin && fin.pendingBalance > 0;
            }).length;

            const filteredLeads = leads.filter(lead => {
              const searchStr = (searchTerm || '').toLowerCase().trim();
              const fin = leadFinancialMap[lead.id];
              const matchesSearch = !searchStr || 
                lead.name.toLowerCase().includes(searchStr) || 
                lead.phoneNumber.includes(searchStr) ||
                (lead.requirement || '').toLowerCase().includes(searchStr) ||
                (fin && (
                  fin.pendingBalance.toString().includes(searchStr) ||
                  fin.totalValue.toString().includes(searchStr) ||
                  fin.paidAmount.toString().includes(searchStr) ||
                  fin.paymentStatus.toLowerCase().includes(searchStr)
                ));

              const matchesStatus = !statusFilter || lead.status === statusFilter;
              const matchesEmployee = !employeeFilter || 
                lead.assignedSalesPersonId === employeeFilter || 
                lead.assignedAdminId === employeeFilter ||
                lead.assignedEmployeeId === employeeFilter;

              const isHot = lead.isHot || (lead.clientRating && lead.clientRating >= 4);
              const matchesHot = hotFilter === 'all' || 
                (hotFilter === 'hot' && isHot) || 
                (hotFilter === 'normal' && !isHot);

              const isDispatched = dispatchedLeadIds.has(lead.id);
              let matchesDispatch = true;
              if (dispatchFilter === 'dispatched') {
                matchesDispatch = isDispatched;
              } else if (dispatchFilter === 'not_dispatched') {
                matchesDispatch = !isDispatched;
              }

              const isRaw = (lead.status === 'new' || lead.status === 'quotation_sent') && !isDispatched;
              const isProcessDone = (lead.status === 'closed' || lead.status === 'installed');
              const isProcessDonePaymentPending = isProcessDone && !!fin && fin.pendingBalance > 0;

              let matchesRaw = true;
              if (rawFilter === 'raw') {
                matchesRaw = isRaw;
              } else if (rawFilter === 'process_done_payment_pending') {
                matchesRaw = isProcessDonePaymentPending;
              } else if (rawFilter === 'advanced') {
                matchesRaw = !isRaw;
              }

              let matchesBalance = true;
              if (balanceFilter === 'pending') {
                matchesBalance = !!fin && fin.pendingBalance > 0;
              } else if (balanceFilter === 'partially_paid') {
                matchesBalance = !!fin && fin.paidAmount > 0 && fin.pendingBalance > 0;
              } else if (balanceFilter === 'fully_paid') {
                matchesBalance = !!fin && fin.paymentStatus === 'Fully Paid';
              } else if (balanceFilter === 'no_quote') {
                matchesBalance = !fin || fin.paymentStatus === 'No Quote';
              }

              return matchesSearch && matchesStatus && matchesEmployee && matchesHot && matchesBalance && matchesDispatch && matchesRaw;
            });

            return (
              <>
                {/* Filters Bar */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs font-bold">
                  <div className="flex-1 flex items-center space-x-3 bg-slate-50 rounded-lg p-2.5 border border-slate-100 min-w-[200px]">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search leads by name or phone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="bg-transparent focus:outline-none w-full text-slate-800 font-medium"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Quick Raw Lead Filter Toggle Pill */}
                    <button
                      type="button"
                      onClick={() => setRawFilter(prev => prev === 'raw' ? 'all' : 'raw')}
                      className={`px-3 py-2 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer ${
                        rawFilter === 'raw'
                          ? 'bg-blue-600 text-white border-blue-700 shadow-xs font-black'
                          : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 font-bold'
                      }`}
                      title="Filter Raw Leads (Follow-up & Proposal Stage Only)"
                    >
                      <Compass className={`w-4 h-4 ${rawFilter === 'raw' ? 'text-white' : 'text-blue-600'}`} />
                      <span>🌱 Raw Leads</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        rawFilter === 'raw' ? 'bg-white text-blue-700 font-black' : 'bg-blue-200/80 text-blue-900 font-black'
                      }`}>
                        {rawLeadsCount}
                      </span>
                    </button>

                    {/* Quick Process Done & Payment Due Filter Toggle Pill */}
                    <button
                      type="button"
                      onClick={() => setRawFilter(prev => prev === 'process_done_payment_pending' ? 'all' : 'process_done_payment_pending')}
                      className={`px-3 py-2 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer ${
                        rawFilter === 'process_done_payment_pending'
                          ? 'bg-purple-700 text-white border-purple-800 shadow-xs font-black'
                          : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100 font-bold'
                      }`}
                      title="Filter Leads with Process Completed but Payment Pending"
                    >
                      <AlertCircle className={`w-4 h-4 ${rawFilter === 'process_done_payment_pending' ? 'text-white' : 'text-purple-700'}`} />
                      <span>⚠️ Process Done (Payment Due)</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        rawFilter === 'process_done_payment_pending' ? 'bg-white text-purple-800 font-black' : 'bg-purple-200/80 text-purple-900 font-black'
                      }`}>
                        {processDonePaymentDueCount}
                      </span>
                    </button>

                    {/* Quick Hot Lead Filter Toggle Pill */}
                    <button
                      type="button"
                      onClick={() => setHotFilter(prev => prev === 'hot' ? 'all' : 'hot')}
                      className={`px-3 py-2 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer ${
                        hotFilter === 'hot'
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs font-black'
                          : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 font-bold'
                      }`}
                      title="Filter Hot Leads Only"
                    >
                      <Flame className={`w-4 h-4 ${hotFilter === 'hot' ? 'text-white fill-white' : 'text-amber-500 fill-amber-500'}`} />
                      <span>🔥 Hot Leads</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        hotFilter === 'hot' ? 'bg-white text-amber-700 font-black' : 'bg-amber-200/80 text-amber-900 font-black'
                      }`}>
                        {hotLeadsCount}
                      </span>
                    </button>

                    {/* Quick Remaining Balance Filter Toggle Pill */}
                    <button
                      type="button"
                      onClick={() => setBalanceFilter(prev => prev === 'pending' ? 'all' : 'pending')}
                      className={`px-3 py-2 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer ${
                        balanceFilter === 'pending'
                          ? 'bg-rose-600 text-white border-rose-700 shadow-xs font-black'
                          : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100 font-bold'
                      }`}
                      title="Filter Clients with Remaining Pending Balance"
                    >
                      <Wallet className={`w-4 h-4 ${balanceFilter === 'pending' ? 'text-white' : 'text-rose-600'}`} />
                      <span>⏳ Pending Balance</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        balanceFilter === 'pending' ? 'bg-white text-rose-700 font-black' : 'bg-rose-200/80 text-rose-900 font-black'
                      }`}>
                        {pendingBalanceLeadsCount}
                      </span>
                    </button>

                    {/* Quick Dispatched Filter Toggle Pill */}
                    <button
                      type="button"
                      onClick={() => setDispatchFilter(prev => prev === 'dispatched' ? 'all' : 'dispatched')}
                      className={`px-3 py-2 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer ${
                        dispatchFilter === 'dispatched'
                          ? 'bg-emerald-700 text-white border-emerald-800 shadow-xs font-black'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-bold'
                      }`}
                      title="Filter Dispatched Leads Only"
                    >
                      <Truck className={`w-4 h-4 ${dispatchFilter === 'dispatched' ? 'text-white' : 'text-emerald-700'}`} />
                      <span>🚚 Dispatched</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        dispatchFilter === 'dispatched' ? 'bg-white text-emerald-800 font-black' : 'bg-emerald-200/80 text-emerald-900 font-black'
                      }`}>
                        {dispatchedLeadsCount}
                      </span>
                    </button>

                    {/* Raw Lead Filter Select */}
                    <select
                      value={rawFilter}
                      onChange={(e) => setRawFilter(e.target.value as any)}
                      className="border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:outline-none cursor-pointer text-slate-700 font-bold"
                    >
                      <option value="all">All Lead Pipeline Types</option>
                      <option value="raw">🌱 Raw Leads ({rawLeadsCount})</option>
                      <option value="process_done_payment_pending">⚠️ Process Done - Payment Due ({processDonePaymentDueCount})</option>
                      <option value="advanced">⚡ Advanced / Confirmed Leads</option>
                    </select>

                    {/* Dispatch Filter Select */}
                    <select
                      value={dispatchFilter}
                      onChange={(e) => setDispatchFilter(e.target.value as any)}
                      className="border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:outline-none cursor-pointer text-slate-700 font-bold"
                    >
                      <option value="all">All Dispatch Statuses</option>
                      <option value="dispatched">🚚 Dispatched ({dispatchedLeadsCount})</option>
                      <option value="not_dispatched">📦 Not Dispatched</option>
                    </select>

                    {/* Remaining Balance Filter Select */}
                    <select
                      value={balanceFilter}
                      onChange={(e) => setBalanceFilter(e.target.value as any)}
                      className="border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:outline-none cursor-pointer text-slate-700 font-bold"
                    >
                      <option value="all">All Payment Statuses</option>
                      <option value="pending">⏳ Pending Balance (&gt; ₹0) ({pendingBalanceLeadsCount})</option>
                      <option value="partially_paid">💳 Partially Paid</option>
                      <option value="fully_paid">✅ Fully Paid</option>
                      <option value="no_quote">📄 No Quotation Yet</option>
                    </select>

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:outline-none cursor-pointer text-slate-700"
                    >
                      <option value="">All Stages</option>
                      <option value="new">New Lead</option>
                      <option value="quotation_sent">Quotation Sent</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="registered">Registered</option>
                      <option value="installed">Installed</option>
                      <option value="closed">Release Complete (Closed)</option>
                      <option value="lost">Lost</option>
                    </select>

                    {currentRole !== 'field_employee' && (
                      <select
                        value={employeeFilter}
                        onChange={(e) => setEmployeeFilter(e.target.value)}
                        className="border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:outline-none cursor-pointer text-slate-700"
                      >
                        <option value="">All Assigned Staff</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Leads Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredLeads.map((lead) => {
                    const isHot = lead.isHot || (lead.clientRating && lead.clientRating >= 4);
                    const rating = lead.clientRating || (lead.isHot ? 5 : 0);
                    const fin = leadFinancialMap[lead.id];

                    return (
                      <div
                        key={lead.id}
                        onClick={() => handleSelectLead(lead)}
                        className={`bg-white border ${
                          isHot
                            ? 'border-amber-400/90 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/20 ring-1 ring-amber-300/50 shadow-xs'
                            : 'border-slate-200'
                        } rounded-2xl p-5 hover:shadow-md transition-all cursor-pointer relative flex flex-col justify-between min-h-52 group`}
                      >
                        <div>
                          {/* Header Row: Lead Name, Hot Lead Toggle/Badge, Status & Delete */}
                          <div className="flex justify-between items-start gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">{lead.name}</h3>

                                {/* Hot Lead Badge / Toggle Button */}
                                <button
                                  type="button"
                                  onClick={(e) => handleToggleHotLead(lead, e)}
                                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 transition-all cursor-pointer border ${
                                    isHot
                                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-600 shadow-2xs hover:brightness-105'
                                      : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-amber-100 hover:text-amber-700 hover:border-amber-300'
                                  }`}
                                  title={isHot ? "Hot Lead! Click to remove Hot status" : "Click to mark as Hot Lead"}
                                >
                                  <Flame className={`w-3.5 h-3.5 ${isHot ? 'fill-white text-white' : 'text-slate-400'}`} />
                                  <span>{isHot ? 'HOT LEAD' : 'Mark Hot'}</span>
                                </button>

                                 {/* DISPATCHED Badge */}
                                {dispatchedLeadIds.has(lead.id) && (
                                  <span
                                    className="px-2.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 bg-emerald-700 text-white border border-emerald-800 shadow-2xs"
                                    title="Delivery Challan generated & Goods Dispatched for this lead"
                                  >
                                    <Truck className="w-3.5 h-3.5 text-white" />
                                    <span>DISPATCHED</span>
                                  </span>
                                )}

                                {/* RAW LEAD Badge */}
                                {(lead.status === 'new' || lead.status === 'quotation_sent') && !dispatchedLeadIds.has(lead.id) && (
                                  <span
                                    className="px-2.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs"
                                    title="Raw Lead (Initial Follow-up & Quotation Stage)"
                                  >
                                    <Compass className="w-3.5 h-3.5 text-blue-600" />
                                    <span>RAW LEAD</span>
                                  </span>
                                )}

                                {/* CREATED BY DEALER Badge */}
                                {(lead.createdByDealer || lead.dealerName) && (
                                  <span
                                    className="px-2.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 bg-purple-100 text-purple-800 border border-purple-300 shadow-2xs"
                                    title={`Lead created by Dealer Partner: ${lead.dealerName || lead.createdBy}`}
                                  >
                                    <span>🏪 CREATED BY DEALER: {lead.dealerName || lead.createdBy}</span>
                                  </span>
                                )}

                                {/* PROCESS DONE - PAYMENT DUE Badge */}
                                {(lead.status === 'closed' || lead.status === 'installed') && fin && fin.pendingBalance > 0 && (
                                  <span
                                    className="px-2.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs"
                                    title={`Process completed (Closed/Installed), but remaining balance of ₹${fin.pendingBalance.toLocaleString('en-IN')} is due`}
                                  >
                                    <AlertCircle className="w-3.5 h-3.5 text-purple-700" />
                                    <span>PROCESS DONE (PAYMENT DUE)</span>
                                  </span>
                                )}
                              </div>

                              <p className="text-[10px] text-slate-400 font-semibold uppercase">📞 +91 {lead.phoneNumber}</p>
                            </div>

                            <div className="flex items-center space-x-1.5 shrink-0">
                              {getStatusBadge(lead.status)}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLeadToEdit(lead);
                                }}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Lead Details"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {currentRole !== 'field_employee' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteLead(lead.id);
                                  }}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Lead"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Interactive Star Rating Row right inside Lead Card */}
                          <div className="mt-2.5 flex items-center justify-between bg-slate-50/90 px-3 py-1.5 rounded-xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              <span>Lead Rating:</span>
                            </span>

                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((starNum) => (
                                <button
                                  key={starNum}
                                  type="button"
                                  onClick={(e) => handleRatingChange(lead, starNum as any, e)}
                                  className="p-0.5 hover:scale-125 transition-transform cursor-pointer focus:outline-none"
                                  title={`Set rating ${starNum} star${starNum > 1 ? 's' : ''}${starNum >= 4 ? ' (Marks as Hot Lead)' : ''}`}
                                >
                                  <Star
                                    className={`w-4 h-4 ${
                                      starNum <= rating
                                        ? 'text-amber-400 fill-amber-400 drop-shadow-2xs'
                                        : 'text-slate-300 hover:text-amber-300'
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="mt-3 p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs font-semibold text-slate-700">
                            {formatCleanLeadRequirement(lead.requirement)}
                          </div>
                          {formatCleanLeadDescription(lead.description) ? (
                            <p className="text-xs text-slate-400 mt-2 line-clamp-2">{formatCleanLeadDescription(lead.description)}</p>
                          ) : null}

                          {/* Compact Installation Remark tag inside Lead Card */}
                          {lead.installationRemark ? (
                            <div className="mt-2 px-2.5 py-1 bg-amber-50/90 border border-amber-200/80 rounded-lg text-[11px] font-medium text-amber-950 flex items-center gap-1.5 min-w-0 shadow-2xs">
                              <span className="font-extrabold text-amber-700 shrink-0 text-[10px] uppercase tracking-wider flex items-center gap-1">
                                🛠️ Remark:
                              </span>
                              <span className="truncate text-slate-700 font-semibold" title={lead.installationRemark}>
                                {lead.installationRemark}
                              </span>
                            </div>
                          ) : null}

                          {/* Prominent Financial & Remaining Pending Balance Box inside Card */}
                          {fin && (fin.totalValue > 0 || fin.paidAmount > 0) ? (
                            <div className="mt-3 p-3 bg-slate-900 text-white rounded-xl border border-slate-800 space-y-1.5 shadow-2xs">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400 font-bold">Total Contract:</span>
                                <span className="font-black text-white">₹{fin.totalValue.toLocaleString('en-IN')}</span>
                              </div>

                              <div className="flex items-center justify-between text-xs">
                                <span className="text-emerald-400 font-bold">Amount Paid:</span>
                                <span className="font-black text-emerald-400">
                                  ₹{fin.paidAmount.toLocaleString('en-IN')}
                                  {fin.installmentCount > 0 && (
                                    <span className="text-[9px] font-medium text-slate-400 ml-1">({fin.installmentCount} pay)</span>
                                  )}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800">
                                <span className="text-amber-400 font-black uppercase text-[10px] tracking-wider flex items-center gap-1">
                                  <Wallet className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Remaining Pending Balance:</span>
                                </span>
                                <span className={`font-black text-sm ${fin.pendingBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  ₹{fin.pendingBalance.toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-3 p-2 px-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-[11px] font-semibold text-slate-400">
                              <span>💰 Payment Status:</span>
                              <span className="italic font-bold text-slate-500">
                                {lead.status === 'quotation_sent' || lead.status === 'confirmed' ? 'Quotation Sent (Pending Order Booking)' : 'No Quotation Created Yet'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap justify-between items-center text-[10px] text-slate-500 font-bold gap-2">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              💼 Sales: {employeeNames[lead.assignedSalesPersonId || lead.assignedEmployeeId || ''] || 'Unassigned'}
                            </span>
                            <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                              🏢 Admin: {employeeNames[lead.assignedAdminId || ''] || 'Unassigned'}
                            </span>
                          </div>
                          <span className="shrink-0 text-slate-400">{dayjs(lead.createdAt).format('DD MMM YYYY')}</span>
                        </div>
                      </div>
                    );
                  })}

                  {filteredLeads.length === 0 && (
                    <div className="col-span-1 md:col-span-2 py-16 text-center text-slate-400 italic bg-white rounded-2xl border border-slate-200">
                      No lead records found matching the current search, stage, and remaining balance filters.
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* New Lead Modal popup */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 m-4 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-900">Create Lead Entry</h3>
              {hasLeadDraftRestored && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-extrabold flex items-center gap-1 shadow-2xs">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  <span>Draft Auto-Restored</span>
                </span>
              )}
            </div>
            <form onSubmit={handleCreateLead} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-500 mb-1">Lead Name</label>
                <input
                  type="text"
                  required
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="e.g. Ramesh Chenoy"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    placeholder="e.g. 9123456780"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="e.g. name@example.com"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-slate-500 font-bold">Primary Requirement</label>
                  <span className="text-[10px] text-slate-400 font-semibold">Select Catalog or Type Custom</span>
                </div>
                <input
                  type="text"
                  list="create-lead-catalog-products"
                  required
                  value={leadRequirement}
                  onChange={(e) => setLeadRequirement(e.target.value)}
                  placeholder="Select from Product Catalog or type custom requirement..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:border-emerald-500 font-semibold text-slate-800"
                />
                <datalist id="create-lead-catalog-products">
                  {catalogProducts
                    .filter(p => p.category !== 'bom_item')
                    .map(p => (
                      <option key={p.id} value={p.brand ? `${p.name} (${p.brand})` : p.name} />
                    ))}
                  <option value="3 kW Solar Rooftop System" />
                  <option value="5 kW Solar Rooftop System" />
                  <option value="10 kW Commercial Solar System" />
                  <option value="15 kW Commercial Solar System" />
                  <option value="20 kW Commercial Solar System" />
                  <option value="3.3 kW On-Grid System" />
                  <option value="5 kW Hybrid System with Battery Backup" />
                  <option value="Off-Grid Solar System" />
                </datalist>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">
                  💡 Select any product from the catalog dropdown or type custom text freely.
                </p>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Additional Project Details</label>
                <textarea
                  rows={2}
                  value={leadDescription}
                  onChange={(e) => setLeadDescription(e.target.value)}
                  placeholder="e.g. Shading from neighboring trees, concrete slab terrace structure..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none resize-none"
                />
              </div>

              {/* Hot Lead Checkbox */}
              <div className="flex items-center space-x-2 pt-1 bg-amber-50/60 border border-amber-200 rounded-xl p-3">
                <input
                  type="checkbox"
                  id="createIsHotLead"
                  checked={leadIsHot}
                  onChange={(e) => setLeadIsHot(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 cursor-pointer"
                />
                <label htmlFor="createIsHotLead" className="text-xs font-extrabold text-amber-900 cursor-pointer flex items-center gap-1.5 select-none">
                  <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>Mark as High Priority Hot Lead 🔥</span>
                </label>
              </div>

              {/* Follow-up Reminder Schedule Block */}
              <div className="bg-emerald-50/70 border border-emerald-200/90 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>📅 Schedule Follow-up Reminder (Optional)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Follow-up Date</label>
                    <input
                      type="date"
                      value={leadFollowUpDate}
                      onChange={(e) => setLeadFollowUpDate(e.target.value)}
                      className="w-full border border-emerald-300 rounded-xl px-3 py-2 bg-white text-slate-800 font-bold focus:outline-none focus:border-emerald-600 shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Remarks / Notes</label>
                    <input
                      type="text"
                      value={leadFollowUpNotes}
                      onChange={(e) => setLeadFollowUpNotes(e.target.value)}
                      placeholder="e.g. Initial callback / Site inspection"
                      className="w-full border border-emerald-300 rounded-xl px-3 py-2 bg-white text-slate-800 font-medium focus:outline-none focus:border-emerald-600 shadow-2xs"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-emerald-700 font-semibold">
                  💡 Setting a date automatically adds this lead under <strong>Follow-up Reminders</strong> (Today / Upcoming / Overdue).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">💼 Assign Sales Person</label>
                  <select
                    value={leadAssignedSalesPersonId}
                    onChange={(e) => setLeadAssignedSalesPersonId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none cursor-pointer text-slate-700 font-bold text-xs"
                  >
                    <option value="">-- Unassigned (Sales) --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">🏢 Assign Administration</label>
                  <select
                    value={leadAssignedAdminId}
                    onChange={(e) => setLeadAssignedAdminId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none cursor-pointer text-slate-700 font-bold text-xs"
                  >
                    <option value="">-- Unassigned (Admin) --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClearLeadFormData}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-extrabold text-[11px] cursor-pointer flex items-center gap-1.5 transition-colors"
                  title="Clear all entered fields and wipe saved draft"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Form Data</span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold cursor-pointer shadow-xs"
                  >
                    Save Lead
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Lead Modal popup */}
      {leadToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 m-4 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-blue-600" />
                  <span>Edit Lead Details</span>
                </h3>
                <p className="text-[11px] text-slate-400 font-medium">Update client info, requirement, assignment & stage without losing history.</p>
              </div>
              <button
                type="button"
                onClick={() => setLeadToEdit(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditLead} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-500 mb-1">Lead Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Client Full Name"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:border-blue-500 font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="10 digit phone number"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:border-blue-500 font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:border-blue-500 font-medium text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-bold">Primary Requirement *</label>
                <input
                  type="text"
                  list="edit-lead-catalog-products"
                  required
                  value={editRequirement}
                  onChange={(e) => setEditRequirement(e.target.value)}
                  placeholder="Solar Rooftop System / System capacity..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:border-blue-500 font-semibold text-slate-800"
                />
                <datalist id="edit-lead-catalog-products">
                  {catalogProducts
                    .filter(p => p.category !== 'bom_item')
                    .map(p => (
                      <option key={p.id} value={p.brand ? `${p.name} (${p.brand})` : p.name} />
                    ))}
                  <option value="3 kW Solar Rooftop System" />
                  <option value="5 kW Solar Rooftop System" />
                  <option value="10 kW Commercial Solar System" />
                  <option value="15 kW Commercial Solar System" />
                  <option value="20 kW Commercial Solar System" />
                  <option value="3.3 kW On-Grid System" />
                  <option value="5 kW Hybrid System with Battery Backup" />
                  <option value="Off-Grid Solar System" />
                </datalist>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Additional Project Details / Notes</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Address, roof type, shading details, special requests..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none resize-none font-medium text-slate-800"
                />
              </div>

              {/* Status Select */}
              <div>
                <label className="block text-slate-500 mb-1 font-bold">Pipeline Stage</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none cursor-pointer text-slate-800 font-bold text-xs"
                >
                  <option value="new">🆕 NEW LEAD</option>
                  <option value="quotation_sent">📄 QUOTATION SENT</option>
                  <option value="confirmed">⚡ ORDER CONFIRMED</option>
                  <option value="registered">📋 REGISTERED</option>
                  <option value="installed">🔧 INSTALLED</option>
                  <option value="closed">🏆 CLOSED / RELEASED</option>
                  <option value="lost">❌ LOST</option>
                </select>
              </div>

              {/* Hot Lead Checkbox */}
              <div className="flex items-center space-x-2 pt-1 bg-amber-50/80 border border-amber-200 rounded-xl p-3">
                <input
                  type="checkbox"
                  id="editIsHotLead"
                  checked={editIsHot}
                  onChange={(e) => setEditIsHot(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 cursor-pointer"
                />
                <label htmlFor="editIsHotLead" className="text-xs font-extrabold text-amber-900 cursor-pointer flex items-center gap-1.5 select-none">
                  <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>Mark as High Priority Hot Lead 🔥</span>
                </label>
              </div>

              {/* Follow-up Reminder Schedule Block */}
              <div className="bg-blue-50/70 border border-blue-200/90 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-blue-900">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>📅 Schedule / Reschedule Follow-up Reminder</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Follow-up Date</label>
                    <input
                      type="date"
                      value={editFollowUpDate}
                      onChange={(e) => setEditFollowUpDate(e.target.value)}
                      className="w-full border border-blue-300 rounded-xl px-3 py-2 bg-white text-slate-800 font-bold focus:outline-none focus:border-blue-600 shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Remarks / Notes</label>
                    <input
                      type="text"
                      value={editFollowUpNotes}
                      onChange={(e) => setEditFollowUpNotes(e.target.value)}
                      placeholder="e.g. Call client regarding proposal..."
                      className="w-full border border-blue-300 rounded-xl px-3 py-2 bg-white text-slate-800 font-medium focus:outline-none focus:border-blue-600 shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* Installation Remark Field in Edit Modal */}
              <div className="bg-amber-50/60 border border-amber-200/90 rounded-xl p-3.5 space-y-1.5">
                <label className="block text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                  🛠️ Quick Installation Remark / Note
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={editInstallationRemark}
                  onChange={(e) => setEditInstallationRemark(e.target.value)}
                  placeholder="e.g. Structure complete, Inverter mounted..."
                  className="w-full border border-amber-300 rounded-xl px-3 py-2 bg-white text-slate-800 text-xs font-medium focus:outline-none focus:border-amber-600 shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">💼 Assign Sales Person</label>
                  <select
                    value={editAssignedSalesPersonId}
                    onChange={(e) => setEditAssignedSalesPersonId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none cursor-pointer text-slate-700 font-bold text-xs"
                  >
                    <option value="">-- Unassigned (Sales) --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">🏢 Assign Administration</label>
                  <select
                    value={editAssignedAdminId}
                    onChange={(e) => setEditAssignedAdminId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none cursor-pointer text-slate-700 font-bold text-xs"
                  >
                    <option value="">-- Unassigned (Admin) --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLeadToEdit(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditLead}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold cursor-pointer shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {isSavingEditLead ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Save Lead Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl p-6 m-4 animate-scale-in flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-black text-slate-900">{previewDoc.name} PREVIEW</h3>
              <button
                onClick={() => {
                  URL.revokeObjectURL(previewDoc.url);
                  setPreviewDoc(null);
                }}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto bg-slate-50 rounded-xl p-4 flex justify-center items-center min-h-[400px]">
              {previewDoc.type.startsWith('image/') ? (
                <img
                  src={previewDoc.url}
                  alt="Document Preview"
                  className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-sm"
                />
              ) : (
                <iframe
                  src={previewDoc.url}
                  title="Document PDF Preview"
                  className="w-full h-[60vh] rounded-lg border border-slate-200 bg-white"
                />
              )}
            </div>
            
            <div className="flex justify-end pt-4 mt-2">
              <button
                onClick={() => {
                  URL.revokeObjectURL(previewDoc.url);
                  setPreviewDoc(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Quotation Preview Modal — Pure 8-Page PDF View Mode or Custom Edit Mode */}
      {selectedQuotationForPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-7xl h-[95vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <QuotationDocument
              readOnlyQuotation={selectedQuotationForPreview}
              viewOnly={isQuotationViewOnly}
              isEmbedded={true}
              onClosePreview={() => setSelectedQuotationForPreview(null)}
              onSwitchToEdit={() => setIsQuotationViewOnly(false)}
            />
          </div>
        </div>
      )}

      {/* Executive Financial & Pipeline Analytics Report Modal */}
      {currentRole !== 'field_employee' && showReportModal && (() => {
        const filteredReportItems = reportItems.filter(item => {
          const searchStr = (reportSearchTerm || '').toLowerCase().trim();
          const matchesSearch = !searchStr || 
            (item.name || '').toLowerCase().includes(searchStr) ||
            (item.phone || '').includes(searchStr) ||
            (item.requirement || '').toLowerCase().includes(searchStr);
          
          const matchesStage = !reportStageFilter || item.status === reportStageFilter;
          const matchesPayment = !reportPaymentFilter || item.paymentStatus === reportPaymentFilter;

          let matchesTime = true;
          if (item.createdAt && dayjs(item.createdAt).isValid()) {
            const itemDate = dayjs(item.createdAt);
            const now = dayjs();

            if (reportTimeFilter === 'today') {
              matchesTime = itemDate.isSame(now, 'day');
            } else if (reportTimeFilter === 'week') {
              matchesTime = itemDate.isSame(now, 'week') || itemDate.isAfter(now.subtract(7, 'day'));
            } else if (reportTimeFilter === 'month') {
              matchesTime = itemDate.isSame(now, 'month');
            } else if (reportTimeFilter === 'year') {
              matchesTime = itemDate.isSame(now, 'year');
            } else if (reportTimeFilter === 'custom') {
              if (reportStartDate) {
                matchesTime = matchesTime && (itemDate.isSame(dayjs(reportStartDate), 'day') || itemDate.isAfter(dayjs(reportStartDate).startOf('day')));
              }
              if (reportEndDate) {
                matchesTime = matchesTime && (itemDate.isSame(dayjs(reportEndDate), 'day') || itemDate.isBefore(dayjs(reportEndDate).endOf('day')));
              }
            }
          }

          return matchesSearch && matchesStage && matchesPayment && matchesTime;
        });

        const totalActiveLeads = reportItems.length;
        const totalPipelineValue = reportItems.reduce((s, i) => s + i.totalValue, 0);
        const totalCollectedValue = reportItems.reduce((s, i) => s + i.paidAmount, 0);
        const totalPendingValue = reportItems.reduce((s, i) => s + i.pendingBalance, 0);
        const totalClosed = reportItems.filter(i => ['confirmed', 'registered', 'installed', 'closed'].includes(i.status)).length;
        const conversionRate = totalActiveLeads > 0 ? Math.round((totalClosed / totalActiveLeads) * 100) : 0;

        const stageCounts = {
          new: reportItems.filter(i => i.status === 'new').length,
          quotation_sent: reportItems.filter(i => i.status === 'quotation_sent').length,
          confirmed: reportItems.filter(i => i.status === 'confirmed').length,
          registered: reportItems.filter(i => i.status === 'registered').length,
          installed: reportItems.filter(i => i.status === 'installed').length,
          closed: reportItems.filter(i => i.status === 'closed').length,
          lost: reportItems.filter(i => i.status === 'lost').length,
        };

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white rounded-2xl w-full max-w-7xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-700">
              
              {/* Modal Header */}
              <div className="bg-slate-900 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-600/30 p-2 rounded-xl border border-indigo-500/40 text-indigo-400">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black tracking-tight text-white">Lead Financial & Pipeline Analytics Report</h2>
                      <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-500/30">
                        LIVE REPORT
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-medium">Real-time payment tracking, contract values, and stage milestone report.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleDownloadReportPDF(filteredReportItems)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    title="Download Official PDF Report with Letterhead"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportReportToCSV(filteredReportItems)}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    title="Export Data Table to Excel CSV File"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Export Excel</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintReport}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700"
                    title="Print Report Summary"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Sheet</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer ml-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Content Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
                {isGeneratingReport ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Compiling Financial & Payment History Reports...</p>
                  </div>
                ) : (
                  <>
                    {/* Top KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      {/* Active Leads */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Active Leads</span>
                        <div className="flex items-baseline justify-between mt-1">
                          <h3 className="text-2xl font-black text-slate-900">{totalActiveLeads}</h3>
                          <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                            {conversionRate}% Won Rate
                          </span>
                        </div>
                      </div>

                      {/* Total Proposal Value */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Proposals Value</span>
                        <h3 className="text-2xl font-black text-slate-800 mt-1">₹{totalPipelineValue.toLocaleString('en-IN')}</h3>
                      </div>

                      {/* Total Payments Received */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs border-l-4 border-l-emerald-500">
                        <span className="text-[10px] uppercase font-bold text-emerald-700 block tracking-wider">Payments Collected</span>
                        <h3 className="text-2xl font-black text-emerald-600 mt-1">₹{totalCollectedValue.toLocaleString('en-IN')}</h3>
                      </div>

                      {/* Pending Balance */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs border-l-4 border-l-amber-500">
                        <span className="text-[10px] uppercase font-bold text-amber-700 block tracking-wider">Outstanding Balance</span>
                        <h3 className="text-2xl font-black text-amber-600 mt-1">₹{totalPendingValue.toLocaleString('en-IN')}</h3>
                      </div>

                      {/* Pipeline Milestone Breakdown */}
                      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xs flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pipeline Progress</span>
                        <div className="flex items-center justify-between text-xs font-bold mt-1">
                          <span className="text-emerald-400">🏆 {stageCounts.closed} Closed</span>
                          <span className="text-blue-400">⚡ {stageCounts.confirmed + stageCounts.registered + stageCounts.installed} Active</span>
                        </div>
                      </div>
                    </div>

                    {/* Pipeline Stage Bar */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 shadow-2xs">
                      <h4 className="text-xs font-extrabold uppercase text-slate-500 tracking-wider">Stage Breakdown Meter</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-center text-xs">
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase">New</span>
                          <span className="text-sm font-black text-slate-700">{stageCounts.new}</span>
                        </div>
                        <div className="bg-blue-50 p-2 rounded-lg border border-blue-200">
                          <span className="block text-[10px] font-bold text-blue-500 uppercase">Quotation</span>
                          <span className="text-sm font-black text-blue-700">{stageCounts.quotation_sent}</span>
                        </div>
                        <div className="bg-violet-50 p-2 rounded-lg border border-violet-200">
                          <span className="block text-[10px] font-bold text-violet-500 uppercase">Confirmed</span>
                          <span className="text-sm font-black text-violet-700">{stageCounts.confirmed}</span>
                        </div>
                        <div className="bg-indigo-50 p-2 rounded-lg border border-indigo-200">
                          <span className="block text-[10px] font-bold text-indigo-500 uppercase">Registered</span>
                          <span className="text-sm font-black text-indigo-700">{stageCounts.registered}</span>
                        </div>
                        <div className="bg-teal-50 p-2 rounded-lg border border-teal-200">
                          <span className="block text-[10px] font-bold text-teal-500 uppercase">Installed</span>
                          <span className="text-sm font-black text-teal-700">{stageCounts.installed}</span>
                        </div>
                        <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                          <span className="block text-[10px] font-bold text-emerald-500 uppercase">Closed</span>
                          <span className="text-sm font-black text-emerald-700">{stageCounts.closed}</span>
                        </div>
                        <div className="bg-rose-50 p-2 rounded-lg border border-rose-200">
                          <span className="block text-[10px] font-bold text-rose-500 uppercase">Lost</span>
                          <span className="text-sm font-black text-rose-700">{stageCounts.lost}</span>
                        </div>
                      </div>
                    </div>

                    {/* Filter & Search Bar inside Report */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 shadow-2xs">
                      <div className="relative w-full md:w-80">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          placeholder="Search client by name or phone..."
                          value={reportSearchTerm}
                          onChange={(e) => setReportSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto text-xs">
                        <select
                          value={reportStageFilter}
                          onChange={(e) => setReportStageFilter(e.target.value)}
                          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 focus:outline-none cursor-pointer"
                        >
                          <option value="">All Pipeline Stages</option>
                          <option value="new">New Lead</option>
                          <option value="quotation_sent">Quotation Sent</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="registered">Registered</option>
                          <option value="installed">Installed</option>
                          <option value="closed">Closed</option>
                          <option value="lost">Lost</option>
                        </select>

                        <select
                          value={reportPaymentFilter}
                          onChange={(e) => setReportPaymentFilter(e.target.value)}
                          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 focus:outline-none cursor-pointer"
                        >
                          <option value="">All Payment Statuses</option>
                          <option value="Fully Paid">Fully Paid</option>
                          <option value="Partially Paid">Partially Paid</option>
                          <option value="Pending">Pending Payment</option>
                          <option value="No Quote">No Quotation</option>
                        </select>
                      </div>
                    </div>

                    {/* Interactive Report Data Table */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                            <tr>
                              <th className="py-3 px-4">Client Name & Phone</th>
                              <th className="py-3 px-4">Project Requirement</th>
                              <th className="py-3 px-4">Pipeline Progress</th>
                              <th className="py-3 px-4 text-right">Total Value (₹)</th>
                              <th className="py-3 px-4 text-right">Amount Paid (₹)</th>
                              <th className="py-3 px-4 text-right">Pending Balance (₹)</th>
                              <th className="py-3 px-4 text-center">Payment Status</th>
                              <th className="py-3 px-4">Assigned Team</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                            {filteredReportItems.map((item) => (
                              <tr key={item.leadId} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-4">
                                  <span className="font-extrabold text-slate-900 block">{item.name}</span>
                                  <span className="text-[10px] text-slate-400 font-medium">📞 +91 {item.phone}</span>
                                </td>
                                <td className="py-3 px-4 max-w-[200px] truncate text-slate-600" title={item.requirement}>
                                  {item.requirement}
                                </td>
                                <td className="py-3 px-4">
                                  {renderStatusBadge(item.status)}
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-slate-800">
                                  ₹{item.totalValue.toLocaleString('en-IN')}
                                </td>
                                <td className="py-3 px-4 text-right font-black text-emerald-600">
                                  ₹{item.paidAmount.toLocaleString('en-IN')}
                                  {item.installmentCount > 0 && (
                                    <span className="text-[9px] font-bold text-slate-400 block">
                                      ({item.installmentCount} payment{item.installmentCount > 1 ? 's' : ''})
                                    </span>
                                  )}
                                </td>
                                <td className={`py-3 px-4 text-right font-black ${item.pendingBalance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                  ₹{item.pendingBalance.toLocaleString('en-IN')}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                    item.paymentStatus === 'Fully Paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                    item.paymentStatus === 'Partially Paid' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                    item.paymentStatus === 'Pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {item.paymentStatus}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-[10px] text-slate-500 space-y-0.5">
                                  <div>👤 Sales: <span className="font-bold text-slate-700">{item.assignedSalesName}</span></div>
                                  <div>🏢 Admin: <span className="font-bold text-slate-700">{item.assignedAdminName}</span></div>
                                </td>
                              </tr>
                            ))}

                            {filteredReportItems.length === 0 && (
                              <tr>
                                <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                                  No matching client leads found for the current search and filter selection.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 font-bold shrink-0">
                <span>Showing {filteredReportItems.length} of {reportItems.length} active entries</span>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-extrabold cursor-pointer"
                >
                  Close Report
                </button>
              </div>

            </div>
          </div>
        );
      })()}
      {pdfLoadingMsg && (
        <div className="fixed bottom-6 right-6 z-[9999] bg-slate-900/95 text-white backdrop-blur-md px-5 py-3.5 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center gap-3 animate-fade-in text-xs font-bold">
          <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <span>{pdfLoadingMsg}</span>
        </div>
      )}
    </div>
  );
};

// Isolated Sub-component to prevent parent rerender lists
const LeadQuotationsTimeline: React.FC<{
  leadId: string;
  onShare: (q: Quotation) => void;
  onViewPdf: (q: Quotation) => void;
  onEditQuotation: (q: Quotation) => void;
  onDownloadPdf: (q: Quotation) => void;
  onDeleteQuotation: (q: Quotation) => Promise<void>;
}> = ({ leadId, onShare, onViewPdf, onEditQuotation, onDownloadPdf, onDeleteQuotation }) => {
  const [quotes, setQuotes] = useState<Quotation[]>([]);

  const loadQuotes = () => {
    quotationService.getQuotationsByLeadId(leadId).then(qList => {
      setQuotes(qList);
      // Pre-cache PDF Blobs in background for instant 0ms sharing
      qList.forEach(q => {
        ensurePdfBlobForQuotation(q, undefined, q.createdBy || 'Admin').catch(() => {});
      });
    });
  };

  useEffect(() => {
    loadQuotes();
    const handleRealtimeUpdate = () => {
      loadQuotes();
    };
    window.addEventListener('app-realtime-update', handleRealtimeUpdate);
    return () => {
      window.removeEventListener('app-realtime-update', handleRealtimeUpdate);
    };
  }, [leadId]);

  return (
    <div className="space-y-3">
      {quotes.map((q) => (
        <div key={q.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-800">{q.quotationNumber}</span>
              <span className="text-[10px] text-slate-600 font-bold bg-slate-200/70 px-2 py-0.5 rounded border border-slate-300">
                🕒 Created: {dayjs(q.createdAt || q.proposalDate).format('DD MMM YYYY, hh:mm A')}
              </span>
            </div>
            <p className="text-slate-600 font-medium">Grand Total: <span className="font-bold">₹{q.grandTotal.toLocaleString('en-IN')}</span></p>
            {q.sentViaWhatsapp && q.whatsappSentAt && (
              <p className="text-[9px] text-emerald-600 font-semibold">✓ Shared via WhatsApp on {dayjs(q.whatsappSentAt).format('DD MMM, hh:mm A')}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onEditQuotation(q)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              title="Custom Edit & Customize Proposal"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Custom Edit</span>
            </button>

            <button
              type="button"
              onClick={() => onViewPdf(q)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              title="View Quotation PDF Proposal"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>View PDF</span>
            </button>

            <button
              type="button"
              onClick={() => onDownloadPdf(q)}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              title="Download Proposal PDF Document"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>

            <button
              type="button"
              onClick={() => onShare(q)}
              onMouseEnter={() => ensurePdfBlobForQuotation(q, undefined, q.createdBy || 'Admin')}
              onTouchStart={() => ensurePdfBlobForQuotation(q, undefined, q.createdBy || 'Admin')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Send className="w-3 h-3" />
              <span>Share</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                await onDeleteQuotation(q);
                loadQuotes();
              }}
              className="px-3 py-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 hover:border-red-600 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
              title="Delete Quotation"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      ))}

      {quotes.length === 0 && (
        <p className="text-slate-400 font-medium italic">No proposals generated yet.</p>
      )}
    </div>
  );
};
