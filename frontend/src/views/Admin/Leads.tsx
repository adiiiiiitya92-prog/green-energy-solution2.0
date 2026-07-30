import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { leadService } from '../../services/leadService';
import { quotationService, getCleanWhatsAppPhone } from '../../services/quotationService';
import { orderService } from '../../services/orderService';
import { employeeService } from '../../services/employeeService';
import { mapService } from '../../services/mapService';
import { pdfService } from '../../services/pdfService';
import type { Lead, Quotation, OrderConfirmation, Profile, ClientDocument, ClientRegistration, InstallationPhoto, ReleaseDocument, QuotationItem, PaymentInstallment } from '../../types';
import { Timeline } from '../../components/Pipeline/Timeline';
import { SignatureCapture } from '../../components/Signature/SignatureCapture';
import { compressImage } from '../../services/imageCompressionService';
import { uploadImageToFirebase, uploadPdfToFirebase } from '../../services/firebase';
import { DcrDocument } from './DcrDocument';
import { WcrDocument } from './WcrDocument';
import { ModelAgreementDocument } from './ModelAgreementDocument';
import { AnnexureProformaDocument } from './AnnexureProformaDocument';
import { QuotationDocument } from './QuotationDocument';
import { FollowUpReminders } from '../../components/Common/FollowUpReminders';
import {
  Search, Plus, Camera, CheckSquare, UploadCloud,
  ChevronLeft, Trash2, Send, Star, FileCheck, CheckCircle, Compass, X, Eye, Download,
  CreditCard, Wallet, Edit3, MessageSquare, Bell, Flame, FileText
} from 'lucide-react';
import dayjs from 'dayjs';

export const Leads: React.FC = () => {
  const { currentRole, currentUser } = useAuthStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});
  
  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [hotFilter, setHotFilter] = useState<'all' | 'hot' | 'normal'>('all');

  // Selected Lead (Details View)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [mainTab, setMainTab] = useState<'pipeline' | 'reminders'>('pipeline');
  const [activeTab, setActiveTab] = useState<'timeline' | 'quotation' | 'order' | 'installation' | 'registration' | 'documentation'>('timeline');
  const [docSubTab, setDocSubTab] = useState<'dcr' | 'wcr' | 'model_agreement' | 'annexure_proforma'>('dcr');

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

  // Quotation Creator States
  const [quoteFollowUp, setQuoteFollowUp] = useState('');
  const [quoteRating, setQuoteRating] = useState<1 | 2 | 3 | 4 | 5>(3);

  // PDF Preview Modal State
  const [selectedQuotationForPreview, setSelectedQuotationForPreview] = useState<Quotation | null>(null);

  const dataUrlToBlob = (dataUrl: string): Blob => {
    try {
      const parts = dataUrl.split(';base64,');
      const contentType = parts[0].replace('data:', '') || 'application/pdf';
      const raw = window.atob(parts[1] || parts[0]);
      const uInt8Array = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
      }
      return new Blob([uInt8Array], { type: contentType });
    } catch (err) {
      console.warn("Base64 decode note:", err);
      return new Blob([], { type: 'application/pdf' });
    }
  };

  /** Try to get a PDF Blob from saved data, otherwise regenerate it on-the-fly */
  const resolvePdfBlob = async (q: Quotation): Promise<Blob> => {
    // 1. Try pdfDataUrl (base64 stored in IndexedDB)
    if (q.pdfDataUrl && typeof q.pdfDataUrl === 'string' && q.pdfDataUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(q.pdfDataUrl);
      if (blob.size > 100) return blob;
    }
    // 2. Try pdfBlob (raw Blob in memory)
    if (q.pdfBlob && ((q.pdfBlob as any) instanceof Blob || (q.pdfBlob as any) instanceof File)) {
      return q.pdfBlob;
    }
    // 3. Try fetching from Firebase Storage URL
    if (q.pdfUrl && typeof q.pdfUrl === 'string' && q.pdfUrl.startsWith('http')) {
      try {
        const res = await fetch(q.pdfUrl);
        if (res.ok) {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('pdf') || ct.includes('octet')) {
            return await res.blob();
          }
        }
      } catch (_) { /* network error, will regenerate */ }
    }
    // 4. Try localStorage backup
    try {
      const lsKey = `quotation_${q.leadId}`;
      const lsData = localStorage.getItem(lsKey);
      if (lsData) {
        const parsed = JSON.parse(lsData);
        if (parsed.pdfDataUrl && typeof parsed.pdfDataUrl === 'string' && parsed.pdfDataUrl.startsWith('data:')) {
          const blob = dataUrlToBlob(parsed.pdfDataUrl);
          if (blob.size > 100) return blob;
        }
      }
    } catch (_) {}
    // 5. Final fallback: regenerate PDF from quotation data
    console.log('⚡ Regenerating PDF on-the-fly for', q.quotationNumber);
    const mockLead: Lead = {
      id: q.leadId || 'lead_default',
      name: (q as any).consumerName || selectedLead?.name || 'Customer',
      phoneNumber: (q as any).consumerMobile?.replace(/\D/g, '') || selectedLead?.phoneNumber || '',
      email: (q as any).consumerEmail || selectedLead?.email || '',
      requirement: `${(q as any).systemCapacity || '5.0'} kW Solar Rooftop`,
      description: `${(q as any).city || 'Nagpur'}, ${(q as any).statePin || 'Maharashtra'}`,
      createdBy: q.createdBy || 'Admin',
      status: 'quotation_sent',
      createdAt: q.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return pdfService.generateQuotationPDF(q, mockLead, q.createdBy || 'Admin');
  };

  const handleViewPdf = async (q: Quotation) => {
    setSelectedQuotationForPreview(q);
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

  // Client Registration Checklist States
  const [regChecklist, setRegChecklist] = useState<ClientRegistration | null>(null);

  // Installation Quality States
  const [installPhotos, setInstallPhotos] = useState<InstallationPhoto[]>([]);
  const [isCapturingInstall, setIsCapturingInstall] = useState(false);
  const [installPhotoType, setInstallPhotoType] = useState<InstallationPhoto['photoType']>('earthing');
  const [isLocatingInstall, setIsLocatingInstall] = useState(false);

  // Release Dept states
  const [releaseNotes, setReleaseNotes] = useState('');
  const [releaseDocs, setReleaseDocs] = useState<ReleaseDocument[]>([]);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string; type: string } | null>(null);
  const [editingDocData, setEditingDocData] = useState<any>(null);

  const loadData = async () => {
    let list = await leadService.getLeads();
    if (currentRole === 'field_employee' && currentUser) {
      list = list.filter(l => l.assignedSalesPersonId === currentUser.id || l.assignedAdminId === currentUser.id || l.assignedEmployeeId === currentUser.id);
    }
    setLeads(list);

    const empList = await employeeService.getEmployees();
    setEmployees(empList);

    const profiles = await employeeService.getAllProfiles();
    const names: Record<string, string> = {};
    profiles.forEach(p => {
      names[p.id] = p.fullName;
    });
    setEmployeeNames(names);
  };

  useEffect(() => {
    loadData();
  }, [currentRole, currentUser]);

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
    const shouldPreserveTab = preserveTab !== undefined ? preserveTab : (selectedLead?.id === lead.id);
    setSelectedLead(lead);
    if (!shouldPreserveTab) {
      setActiveTab('timeline');
    }
    
    // Load Order Confirmation & Payment History
    let oc = await orderService.getOrderConfirmationByLeadId(lead.id);

    // Auto load quote items if quotation exists
    const quotations = await quotationService.getQuotationsByLeadId(lead.id);
    if (quotations.length > 0) {
      const q = quotations[0];
      setBookingItems(q.items || []);
      if (!oc) {
        const ocId = 'oc_' + Math.random().toString(36).substring(2, 11);
        const newOc: OrderConfirmation = {
          id: ocId,
          leadId: lead.id,
          quotationId: q.id,
          itemsConfirmed: q.items || [],
          subtotal: q.grandTotal || q.subtotal || 0,
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

    // Load Release Docs
    const rels = await orderService.getReleaseDocumentsByLeadId(lead.id);
    setReleaseDocs(rels);
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName || !leadPhone || !leadRequirement) {
      alert('Please fill out Name, Phone and Requirement.');
      return;
    }

    await leadService.createLead({
      name: leadName,
      phoneNumber: leadPhone,
      email: leadEmail || undefined,
      requirement: leadRequirement,
      description: leadDescription,
      assignedSalesPersonId: leadAssignedSalesPersonId || undefined,
      assignedAdminId: leadAssignedAdminId || undefined,
      assignedEmployeeId: leadAssignedSalesPersonId || leadAssignedAdminId || undefined,
      createdBy: currentUser?.id || 'mock_admin',
      status: 'new',
      isHot: leadIsHot,
      clientRating: leadIsHot ? 5 : 3
    });

    // Reset
    setLeadName('');
    setLeadPhone('');
    setLeadEmail('');
    setLeadRequirement('');
    setLeadDescription('');
    setLeadAssignedSalesPersonId('');
    setLeadAssignedAdminId('');
    setLeadIsHot(false);
    setShowCreateModal(false);
    loadData();
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
    if (confirm('WARNING: Are you sure you want to delete this lead? All associated quotations, contracts, photos, and files will be permanently erased.')) {
      await leadService.deleteLead(id);
      setSelectedLead(null);
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

  // WhatsApp share PDF document
  const handleWhatsappShare = (q: Quotation) => {
    const leadMatch = leads.find(l => l.id === q.leadId);
    const rawPhone = (q as any).consumerMobile || (q as any).consumerNo || (q as any).mobile || (q as any).phone || selectedLead?.phoneNumber || leadMatch?.phoneNumber || '';
    const targetPhone = getCleanWhatsAppPhone(rawPhone);
    const waUrl = targetPhone 
      ? `https://api.whatsapp.com/send?phone=${targetPhone}`
      : `https://api.whatsapp.com/send`;

    const propNo = q.quotationNumber || (q as any).proposalId || 'EST-001';
    const sanitizedPropNo = (propNo || q.id).replace(/\//g, '_');
    const pdfFileName = `Solar_Quotation_${sanitizedPropNo}.pdf`;

    // 1. Open WhatsApp Web directly in a new tab (no blank page!)
    const win = window.open(waUrl, '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      window.location.href = waUrl;
    }

    // 2. Background PDF generation & local auto-download
    quotationService.markQuotationAsSent(q.id);
    if (selectedLead) handleSelectLead(selectedLead);

    resolvePdfBlob(q)
      .then(pdfBlob => {
        if (pdfBlob) {
          const blobUrl = URL.createObjectURL(pdfBlob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = pdfFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

          if (!q.pdfUrl) {
            uploadPdfToFirebase(pdfBlob, `quotations/pdf_${sanitizedPropNo}.pdf`)
              .then(url => {
                if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                  quotationService.updateQuotation({ ...q, pdfUrl: url });
                }
              })
              .catch(e => console.warn('Background upload note:', e));
          }
        }
      })
      .catch(e => console.warn('Background PDF resolve note:', e));
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

      // Compile receipt PDF
      const pdf = await pdfService.generateConfirmationPDF(
        ocDraft as any,
        selectedLead,
        currentUser?.fullName || 'Booking Manager',
        sigUrl
      );

      const pdfUrl = await uploadImageToFirebase(pdf, `orders/${selectedLead.id}/receipt_${Date.now()}.pdf`);

      if (existingOc) {
        const updatedOc: OrderConfirmation = {
          ...existingOc,
          advanceAmount,
          paymentMode,
          paymentReference: paymentReference || undefined,
          clientSignatureBlob: sigUrl || existingOc.clientSignatureBlob || '',
          confirmationPdfBlob: pdfUrl || existingOc.confirmationPdfBlob || '',
          payments: [initialPayment]
        };
        await orderService.updateOrderConfirmation(updatedOc);
        setExistingOc(updatedOc);
      } else {
        await orderService.createOrderConfirmation({
          ...ocDraft,
          clientSignatureBlob: sigUrl as any,
          confirmationPdfBlob: pdfUrl as any
        });
        const createdOc = await orderService.getOrderConfirmationByLeadId(selectedLead.id);
        if (createdOc) setExistingOc(createdOc);
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

      // Regenerate updated receipt PDF
      try {
        const sigUrl = typeof existingOc.clientSignatureBlob === 'string' ? existingOc.clientSignatureBlob : '';
        const pdf = await pdfService.generateConfirmationPDF(
          updatedOc,
          selectedLead,
          currentUser?.fullName || 'Booking Manager',
          sigUrl
        );
        const pdfUrl = await uploadImageToFirebase(pdf, `orders/${selectedLead.id}/receipt_${Date.now()}.pdf`);
        updatedOc.confirmationPdfBlob = pdfUrl;
      } catch (pdfErr) {
        console.warn('PDF regeneration error:', pdfErr);
      }

      await orderService.updateOrderConfirmation(updatedOc);
      setExistingOc(updatedOc);

      // Auto update lead status to confirmed / closed
      const newTotalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
      const isFullyPaidNow = newTotalPaid >= subtotal;
      const targetStatus = isFullyPaidNow ? 'closed' : 'confirmed';
      await leadService.updateLeadStatus(selectedLead.id, targetStatus);
      selectedLead.status = targetStatus;

      // Reset form
      setSubsequentAmount(0);
      setSubsequentReference('');
      setSubsequentNotes('');

      alert(`✅ ${label} of ₹${subsequentAmount.toLocaleString('en-IN')} recorded successfully! ${isFullyPaidNow ? '🎉 Full Payment Completed! Lead status updated to Release Complete (Closed).' : ''}`);

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

    try {
      let fileUrl = '';
      if (file.type.startsWith('image/')) {
        const compressedBlob = await compressImage(file, { isDocument: true, maxSizeKB: 75 });
        const storagePath = `documents/${selectedLead.id}/${docType}_${Date.now()}.webp`;
        fileUrl = await uploadImageToFirebase(compressedBlob, storagePath);
      } else {
        const storagePath = `documents/${selectedLead.id}/${docType}_${Date.now()}.pdf`;
        fileUrl = await uploadImageToFirebase(file, storagePath);
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

      alert(`${docType.toUpperCase().replace('_', ' ')} uploaded successfully.`);
    } catch (err) {
      console.error("Doc upload error:", err);
      alert('File upload error.');
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
    if (confirm('Delete this Handover NOC document?')) {
      await orderService.deleteReleaseDocument(relId);
      const rels = await orderService.getReleaseDocumentsByLeadId(selectedLead.id);
      setReleaseDocs(rels);
    }
  };

  // Filtered Leads
  const filteredLeads = leads.filter(lead => {
    if (searchTerm && !lead.name.toLowerCase().includes(searchTerm.toLowerCase()) && !lead.phoneNumber.includes(searchTerm)) return false;
    if (statusFilter && lead.status !== statusFilter) return false;
    if (employeeFilter && lead.assignedSalesPersonId !== employeeFilter && lead.assignedAdminId !== employeeFilter && lead.assignedEmployeeId !== employeeFilter) return false;

    const isHotLead = lead.isHot || (lead.clientRating && lead.clientRating >= 4);
    if (hotFilter === 'hot' && !isHotLead) return false;
    if (hotFilter === 'normal' && isHotLead) return false;

    return true;
  });

  const hotLeadsCount = leads.filter(l => l.isHot || (l.clientRating && l.clientRating >= 4)).length;

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
              onClick={() => setSelectedLead(null)}
              className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Leads</span>
            </button>

            <div className="flex items-center gap-2">
              {getStatusBadge(selectedLead.status)}
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
                <strong>Project:</strong> {selectedLead.requirement}
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
              onClick={() => setActiveTab('timeline')}
              className={`py-3 px-4 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                activeTab === 'timeline' ? 'border-emerald-600 text-emerald-600 font-extrabold' : 'border-transparent hover:text-slate-800'
              }`}
            >
              Timeline Stepper
            </button>
            
            {/* Quotations builder available for Employee, Admin & Super Admin */}
            {['super_admin', 'admin', 'field_employee'].includes(currentRole) && (
              <button
                onClick={() => setActiveTab('quotation')}
                className={`py-3 px-4 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                  activeTab === 'quotation' ? 'border-emerald-600 text-emerald-600 font-extrabold' : 'border-transparent hover:text-slate-800'
                }`}
              >
                Create Quotation
              </button>
            )}

            {/* Confirm booking receipt */}
            {['super_admin', 'admin', 'field_employee'].includes(currentRole) && (
              <button
                onClick={() => setActiveTab('order')}
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
            <button
              onClick={() => setActiveTab('installation')}
              className={`py-3 px-4 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                activeTab === 'installation' ? 'border-emerald-600 text-emerald-600 font-extrabold' : 'border-transparent hover:text-slate-800'
              }`}
            >
              Installation Photos
            </button>

            {/* Documentation tab containing DCR Certificate generator */}
            <button
              onClick={() => setActiveTab('documentation')}
              className={`py-3 px-4 border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                activeTab === 'documentation' ? 'border-emerald-600 text-emerald-600 font-extrabold' : 'border-transparent hover:text-slate-800'
              }`}
            >
              Documentation
            </button>

            {/* Registration checklists & Release (Admin only) */}
            {currentRole !== 'field_employee' && (
              <button
                onClick={() => setActiveTab('registration')}
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
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-xs">
                  <div className="space-y-1 w-full sm:w-auto min-w-[240px]">
                    <label className="text-slate-700 font-extrabold block">Follow-up Inspection Date</label>
                    <input
                      type="date"
                      value={quoteFollowUp}
                      onChange={(e) => setQuoteFollowUp(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:outline-none bg-white font-bold text-slate-800 shadow-xs"
                    />
                  </div>
                </div>

                {/* 9-Page Full Turnkey Solar Quotation Document Generator */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-md bg-slate-900/5">
                  <QuotationDocument defaultLeadId={selectedLead?.id} isEmbedded={true} onNavigateToOrderKyc={() => setActiveTab('order')} />
                </div>

                {/* Generated Quotations History */}
                {selectedLead && (
                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Generated Quotations History</h4>
                    <LeadQuotationsTimeline leadId={selectedLead.id} onShare={handleWhatsappShare} onViewPdf={handleViewPdf} onDownloadPdf={handleDownloadPdf} onDeleteQuotation={handleDeleteQuotation} />
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Order Booking & KYC */}
            {activeTab === 'order' && (() => {
              const paymentsList = getPaymentsList(existingOc);
              const orderSubtotal = existingOc?.subtotal || bookingItems.reduce((s, i) => s + i.amount, 0);
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

                      {hasPaymentsRecorded && (
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

                    {/* If payments exist: Show Payment Summary Stats Cards, History & 2nd/3rd Installment Form */}
                    {hasPaymentsRecorded ? (
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
                            alert('Client signature saved successfully!');
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

                  {/* KYC Document uploads slots */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Utility & KYC Document Uploads (5 Slots)</h3>
                      <p className="text-[10px] text-slate-400 font-medium">Verify identity and billing accounts. Target size compressed automatically &lt; 1MB.</p>
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
                                    onChange={(e) => e.target.files?.[0] && handleDocUpload(docType, e.target.files[0])}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full"
                                  />
                                  <button
                                    type="button"
                                    className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold transition-all text-center flex items-center justify-center gap-1 pointer-events-none"
                                  >
                                    <UploadCloud className="w-3.5 h-3.5" />
                                    <span>Choose File</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Tab 4: Installation Photos & Quality Checks */}
            {activeTab === 'installation' && (
              <div className="space-y-6 text-xs font-semibold">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Quality Assurance Installation Photos</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Capture coordinates and watermarked metadata stamped visibly on image uploads.</p>
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
                {kycDocs.filter(d => ['dcr_certificate', 'wcr_report', 'model_agreement', 'annexure_proforma'].includes(d.docType)).length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-emerald-600" />
                        <span>Saved Documentation Files ({kycDocs.filter(d => ['dcr_certificate', 'wcr_report', 'model_agreement', 'annexure_proforma'].includes(d.docType)).length})</span>
                      </h4>
                      <span className="text-[10px] text-slate-400 font-bold">Saved for {selectedLead.name}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {kycDocs.filter(d => ['dcr_certificate', 'wcr_report', 'model_agreement', 'annexure_proforma'].includes(d.docType)).map((doc) => {
                        const getDocTitle = (type: string) => {
                          if (type === 'dcr_certificate') return 'DCR Certificate';
                          if (type === 'wcr_report') return 'WCR Work Completion Report';
                          if (type === 'model_agreement') return 'Model Agreement';
                          if (type === 'annexure_proforma') return 'Annexure Proforma';
                          return type.replace('_', ' ').toUpperCase();
                        };

                        const getSubTab = (type: string) => {
                          if (type === 'dcr_certificate') return 'dcr';
                          if (type === 'wcr_report') return 'wcr';
                          if (type === 'model_agreement') return 'model_agreement';
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
          ) : (
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

              {/* Hot Lead Filter Select */}
              <select
                value={hotFilter}
                onChange={(e) => setHotFilter(e.target.value as any)}
                className="border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:outline-none cursor-pointer text-slate-700 font-bold"
              >
                <option value="all">All Lead Types</option>
                <option value="hot">🔥 Hot Leads Only ({hotLeadsCount})</option>
                <option value="normal">❄️ Normal Leads</option>
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
                        </div>

                        <p className="text-[10px] text-slate-400 font-semibold uppercase">📞 +91 {lead.phoneNumber}</p>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        {getStatusBadge(lead.status)}
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
                      {lead.requirement}
                    </div>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2">{lead.description}</p>
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
              <div className="col-span-full bg-white border border-slate-200 text-center py-12 rounded-2xl">
                <Compass className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-bold">No leads found matching details.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )}

      {/* New Lead Modal popup */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 m-4 animate-scale-in">
            <h3 className="text-lg font-black text-slate-900 mb-4">Create Lead Entry</h3>
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
                <label className="block text-slate-500 mb-1">Primary Requirement</label>
                <input
                  type="text"
                  required
                  value={leadRequirement}
                  onChange={(e) => setLeadRequirement(e.target.value)}
                  placeholder="e.g. 5kW On-Grid System"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                />
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

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold cursor-pointer"
                >
                  Save Lead
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
      {/* Quotation Preview Modal — Live QuotationDocument Component (100% Identical to Editor) */}
      {selectedQuotationForPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-7xl h-[95vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <QuotationDocument
              readOnlyQuotation={selectedQuotationForPreview}
              isEmbedded={true}
              onClosePreview={() => setSelectedQuotationForPreview(null)}
            />
          </div>
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
  onDownloadPdf: (q: Quotation) => void;
  onDeleteQuotation: (q: Quotation) => Promise<void>;
}> = ({ leadId, onShare, onViewPdf, onDownloadPdf, onDeleteQuotation }) => {
  const [quotes, setQuotes] = useState<Quotation[]>([]);

  const loadQuotes = () => {
    quotationService.getQuotationsByLeadId(leadId).then(setQuotes);
  };

  useEffect(() => {
    loadQuotes();
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
              onClick={() => onViewPdf(q)}
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
