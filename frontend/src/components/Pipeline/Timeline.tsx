import React, { useEffect, useState } from 'react';
import type { Lead, Quotation, OrderConfirmation, ClientDocument, ClientRegistration, InstallationPhoto, ReleaseDocument, FieldVisitReport, Challan } from '../../types';
import { quotationService } from '../../services/quotationService';
import { orderService } from '../../services/orderService';
import { visitService } from '../../services/visitService';
import { challanService } from '../../services/challanService';
import { employeeService } from '../../services/employeeService';
import { pdfService } from '../../services/pdfService';
import { getFreshB2SignedUrl, getQuickB2Url } from '../../services/firebase';
import dayjs from 'dayjs';
import { Eye, Download, X, Trash2, Compass, Truck, Camera } from 'lucide-react';

interface TimelineProps {
  lead: Lead;
}

export const Timeline: React.FC<TimelineProps> = ({ lead }) => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [registration, setRegistration] = useState<ClientRegistration | null>(null);
  const [photos, setPhotos] = useState<InstallationPhoto[]>([]);
  const [release, setRelease] = useState<ReleaseDocument[]>([]);
  const [visits, setVisits] = useState<FieldVisitReport[]>([]);
  const [challans, setChallans] = useState<Challan[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [previewItem, setPreviewItem] = useState<{ url: string; title: string } | null>(null);

  const loadData = async () => {
    const qList = await quotationService.getQuotationsByLeadId(lead.id);
    setQuotations(qList);

    const conf = await orderService.getOrderConfirmationByLeadId(lead.id);
    setConfirmation(conf || null);

    const docs = await orderService.getClientDocumentsByLeadId(lead.id);
    setDocuments(docs);

    const reg = await orderService.getClientRegistrationByLeadId(lead.id);
    setRegistration(reg || null);

    const photoList = await orderService.getInstallationPhotosByLeadId(lead.id);
    setPhotos(photoList);

    const relList = await orderService.getReleaseDocumentsByLeadId(lead.id);
    setRelease(relList);

    const visitList = await visitService.getVisitReportsByLead(lead.id);
    setVisits(visitList);

    const chList = await challanService.getChallansByLeadId(lead.id);
    setChallans(chList);
    setVisits(visitList);

    const users = await employeeService.getAllProfiles();
    const userMap: Record<string, string> = {};
    users.forEach(u => {
      userMap[u.id] = u.fullName;
    });
    setProfiles(userMap);
  };

  useEffect(() => {
    loadData();
  }, [lead.id, lead.updatedAt]);

  const formatDate = (isoStr: string) => {
    return dayjs(isoStr).format('DD MMM YYYY, hh:mm A [IST]');
  };

  // Safe helper to convert any Blob, Data URL, or Backblaze / Firebase HTTPS string into a fast renderable URL
  const renderBlobImage = (fileOrBlobOrUrl: any): string => {
    if (!fileOrBlobOrUrl) return '';
    if (typeof fileOrBlobOrUrl === 'string') {
      const trimmed = fileOrBlobOrUrl.trim();
      return getQuickB2Url(trimmed);
    }
    if (fileOrBlobOrUrl instanceof Blob || fileOrBlobOrUrl instanceof File) {
      try {
        return URL.createObjectURL(fileOrBlobOrUrl);
      } catch (e) {
        return '';
      }
    }
    if (typeof fileOrBlobOrUrl === 'object') {
      if (fileOrBlobOrUrl.url && typeof fileOrBlobOrUrl.url === 'string') return getQuickB2Url(fileOrBlobOrUrl.url.trim());
      if (fileOrBlobOrUrl.data && typeof fileOrBlobOrUrl.data === 'string') return fileOrBlobOrUrl.data;
    }
    return '';
  };

  // Safe helper to trigger browser download for any document format with fresh signed URL
  const handleDownloadFile = async (fileOrBlobOrUrl: any, defaultFileName: string) => {
    const rawUrl = renderBlobImage(fileOrBlobOrUrl);
    if (!rawUrl) {
      alert('The file URL is missing or not available for this document.');
      return;
    }

    try {
      const freshUrl = await getFreshB2SignedUrl(rawUrl);
      if (freshUrl.startsWith('http')) {
        const response = await fetch(freshUrl);
        const blob = await response.blob();
        const localUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = localUrl;
        a.download = defaultFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
        return;
      }

      const a = document.createElement('a');
      a.href = freshUrl;
      a.download = defaultFileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.warn("Direct download fallback:", err);
      window.open(rawUrl, '_blank');
    }
  };

  const handleViewPreview = async (fileOrBlobOrUrl: any, title: string) => {
    const rawUrl = renderBlobImage(fileOrBlobOrUrl);
    if (!rawUrl) {
      alert(`The document preview for "${title}" is not available.`);
      return;
    }
    try {
      const freshUrl = await getFreshB2SignedUrl(rawUrl);
      setPreviewItem({ url: freshUrl, title });
    } catch (err) {
      console.warn("Preview error:", err);
      setPreviewItem({ url: rawUrl, title });
    }
  };

  const handleDeleteQuotation = async (quotation: Quotation) => {
    if (!window.confirm(`Are you sure you want to delete Quotation "${quotation.quotationNumber}"?`)) return;
    try {
      await quotationService.deleteQuotation(quotation.id);
      alert(`Quotation ${quotation.quotationNumber} deleted successfully.`);
      await loadData();
    } catch (err) {
      console.error('Error deleting quotation:', err);
      alert('Failed to delete quotation.');
    }
  };

  return (
    <div className="relative pl-6 border-l-2 border-slate-200 ml-4 space-y-8 py-2">
      {/* 1. Lead Entry */}
      <div className="relative">
        <div className="absolute -left-[31px] top-1 bg-emerald-500 text-white rounded-full p-1.5 shadow-sm border border-white">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 mb-2">
            Lead Created
          </span>
          <h4 className="text-sm font-bold text-slate-800">{lead.name}</h4>
          <p className="text-xs text-slate-600 mt-1">{lead.requirement}</p>
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
            <span>Created By: {profiles[lead.createdBy] || lead.createdBy}</span>
            <span>{formatDate(lead.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* 2. Site Visit Reports */}
      {visits.length > 0 && (
        <div className="relative">
          <div className="absolute -left-[31px] top-1 bg-amber-500 text-white rounded-full p-1.5 shadow-sm border border-white">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 mb-2">
              Field Site Inspection Reports ({visits.length})
            </span>
            <div className="space-y-4 mt-2">
              {visits.map((v) => (
                <div key={v.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50 text-xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-slate-700">Met: {v.personMetName} ({v.personMetContact})</p>
                      <p className="text-slate-600 mt-1">{v.description}</p>
                    </div>
                    <span className="text-[10px] text-slate-400">{formatDate(v.visitedAt)}</span>
                  </div>
                  {v.photoBlobs && v.photoBlobs.length > 0 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                      {v.photoBlobs.map((blob, idx) => {
                        const imgUrl = renderBlobImage(blob);
                        return (
                          <div key={idx} className="relative group">
                            <img
                              src={imgUrl}
                              alt="Site visit upload"
                              className="h-14 w-14 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-90"
                              onClick={() => setPreviewItem({ url: imgUrl, title: `Site Visit Photo (${v.personMetName})` })}
                            />
                            <button
                              type="button"
                              onClick={() => setPreviewItem({ url: imgUrl, title: `Site Visit Photo (${v.personMetName})` })}
                              className="absolute bottom-1 right-1 bg-slate-900/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Eye className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Quotations Sent */}
      {quotations.map((q) => (
        <div key={q.id} className="relative">
          <div className="absolute -left-[31px] top-1 bg-blue-500 text-white rounded-full p-1.5 shadow-sm border border-white">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
            <div className="flex justify-between items-start">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mb-2">
                Quotation Generated: {q.quotationNumber}
              </span>
              {q.sentViaWhatsapp && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  ✓ Sent on WhatsApp
                </span>
              )}
            </div>
            <h4 className="text-sm font-bold text-slate-800">Total: ₹{q.grandTotal.toLocaleString('en-IN')}</h4>
            <div className="mt-2 text-xs space-y-1 text-slate-600">
              {q.items.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{item.itemName} (x{item.qty})</span>
                  <span>₹{item.amount.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
            {(q.pdfBlob || q.pdfUrl || q.pdfDataUrl) && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleViewPreview(q.pdfBlob || q.pdfUrl || q.pdfDataUrl, `Quotation ${q.quotationNumber}`)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadFile(q.pdfBlob || q.pdfUrl || q.pdfDataUrl, `${q.quotationNumber}_${lead.name.replace(/\s+/g, '_')}.pdf`)}
                  className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteQuotation(q)}
                  className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Delete Quotation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            )}
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
              <span>Created By: {profiles[q.createdBy] || q.createdBy}</span>
              <span>{formatDate(q.createdAt)}</span>
            </div>
          </div>
        </div>
      ))}

      {/* 4. Booking Order Confirmation & Installments Stepper */}
      {confirmation && (() => {
        const paymentsList = (confirmation.payments && confirmation.payments.length > 0)
          ? (confirmation.cashProofImageUrl && !confirmation.payments[0].cashProofImageUrl
              ? confirmation.payments.map((p, idx) => idx === 0 ? { ...p, cashProofImageUrl: confirmation.cashProofImageUrl, cashProofLocation: confirmation.cashProofLocation } : p)
              : confirmation.payments)
          : (confirmation.advanceAmount && confirmation.advanceAmount > 0)
          ? [{
              id: 'pay_1',
              installmentNo: 1,
              label: '1st Advance Payment',
              amount: confirmation.advanceAmount,
              paymentMode: confirmation.paymentMode || 'utr',
              paymentReference: confirmation.paymentReference,
              paidAt: confirmation.createdAt,
              cashProofImageUrl: confirmation.cashProofImageUrl,
              cashProofLocation: confirmation.cashProofLocation
            }]
          : [];

        const totalCollected = paymentsList.reduce((s, p) => s + p.amount, 0);

        return (
          <div className="relative">
            <div className="absolute -left-[31px] top-1 bg-violet-600 text-white rounded-full p-1.5 shadow-sm border border-white">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-extrabold bg-violet-100 text-violet-800 w-fit">
                  Order Confirmed & Payments Recorded
                </span>
                <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 w-fit">
                  Total Collected: ₹{totalCollected.toLocaleString('en-IN')}
                </span>
              </div>

              {/* Installment History Stepper List */}
              {paymentsList.length > 0 ? (
                <div className="space-y-2 mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    Recorded Payment Installments ({paymentsList.length})
                  </span>
                  {paymentsList.map((p, idx) => (
                    <div key={p.id || idx} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs py-2 border-b border-slate-200/60 last:border-0 gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800">✓ {p.label || `${idx + 1}st Payment`}</span>
                          <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold uppercase">
                            {p.paymentMode?.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          {dayjs(p.paidAt).format('DD MMM YYYY, hh:mm A')} {p.paymentReference ? `• Ref: ${p.paymentReference}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-2.5">
                        <span className="font-black text-emerald-700 block">₹{p.amount.toLocaleString('en-IN')}</span>
                        <div className="flex items-center gap-1">
                          {p.cashProofImageUrl && (
                            <a
                              href={p.cashProofImageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              title="View Geotagged Cash Handover Photo (Stored in Backblaze B2)"
                            >
                              <Camera className="w-3 h-3 text-amber-600" />
                              <span>Cash Proof</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const blob = await pdfService.generatePaymentReceiptPDF(
                                  confirmation,
                                  p,
                                  lead,
                                  profiles[confirmation.createdBy] || 'Green Energy Solution'
                                );
                                handleViewPreview(blob, `Payment Receipt - ${p.label || `Payment #${idx + 1}`} - ${lead.name}`);
                              } catch (e) {
                                alert('Error generating receipt preview.');
                              }
                            }}
                            className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            title="Preview Receipt"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>Receipt</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const blob = await pdfService.generatePaymentReceiptPDF(
                                  confirmation,
                                  p,
                                  lead,
                                  profiles[confirmation.createdBy] || 'Green Energy Solution'
                                );
                                handleDownloadFile(blob, `Payment_Receipt_${(p.label || `Payment_${idx + 1}`).replace(/\s+/g, '_')}_${lead.name.replace(/\s+/g, '_')}.pdf`);
                              } catch (e) {
                                alert('Error downloading receipt.');
                              }
                            }}
                            className="p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            title="Download Receipt"
                          >
                            <Download className="w-3 h-3 text-emerald-700" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 font-medium mt-2">
                  ⏳ 1st Advance Payment pending deposit recording.
                </p>
              )}

              {(confirmation.clientSignatureBlob || (confirmation as any).clientSignatureUrl) && (
                <div className="mt-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Signed Signature:</span>
                  <img
                    src={renderBlobImage(confirmation.clientSignatureBlob || (confirmation as any).clientSignatureUrl)}
                    alt="Client Signature preview"
                    className="h-12 border border-slate-200 rounded p-1 bg-slate-50 cursor-pointer hover:border-slate-400"
                    onClick={() => handleViewPreview(confirmation.clientSignatureBlob || (confirmation as any).clientSignatureUrl, `Signature - ${lead.name}`)}
                  />
                </div>
              )}

              {(confirmation.confirmationPdfBlob || (confirmation as any).confirmationPdfUrl) && (
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => handleViewPreview(confirmation.confirmationPdfBlob || (confirmation as any).confirmationPdfUrl, `Order Confirmation Receipt - ${lead.name}`)}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Receipt</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadFile(confirmation.confirmationPdfBlob || (confirmation as any).confirmationPdfUrl, `Order_Confirmation_${lead.name.replace(/\s+/g, '_')}.pdf`)}
                    className="text-xs bg-violet-50 hover:bg-violet-100 text-violet-700 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Receipt</span>
                  </button>
                </div>
              )}

              <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
                <span>Confirmed By: {profiles[confirmation.createdBy] || confirmation.createdBy}</span>
                <span>{formatDate(confirmation.createdAt)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5. Client Registration & Checklist */}
      {registration && (
        <div className="relative">
          <div className="absolute -left-[31px] top-1 bg-indigo-500 text-white rounded-full p-1.5 shadow-sm border border-white">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800 mb-2">
              Client Registration Pipeline
            </span>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 mt-1 text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${registration.registrationDone ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                <span className={registration.registrationDone ? 'text-slate-700 font-semibold' : 'text-slate-400'}>Registration Done</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${registration.fileMade ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                <span className={registration.fileMade ? 'text-slate-700 font-semibold' : 'text-slate-400'}>File Made</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${registration.bankFileUploaded ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                <span className={registration.bankFileUploaded ? 'text-slate-700 font-semibold' : 'text-slate-400'}>Bank File Uploaded</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  registration.loanStatus === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                  registration.loanStatus === 'rejected' ? 'bg-rose-100 text-rose-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  Loan: {registration.loanStatus.toUpperCase()}
                </span>
              </div>
            </div>

            {(registration.bankDocumentBlob || (registration as any).bankDocumentUrl) && (
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => handleViewPreview(registration.bankDocumentBlob || (registration as any).bankDocumentUrl, `Bank Document - ${lead.name}`)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadFile(registration.bankDocumentBlob || (registration as any).bankDocumentUrl, `Bank_Document_${lead.name.replace(/\s+/g, '_')}`)}
                  className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Bank File</span>
                </button>
              </div>
            )}

            <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
              <span>Updated At:</span>
              <span>{formatDate(registration.updatedAt)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. Uploaded Documents */}
      {documents.length > 0 && (
        <div className="relative">
          <div className="absolute -left-[31px] top-1 bg-slate-600 text-white rounded-full p-1.5 shadow-sm border border-white">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 mb-2">
              KYC & Utility Documents Uploaded ({documents.length})
            </span>
            <div className="space-y-2 mt-2">
              {documents.map((doc) => {
                const docFile = doc.fileBlob || (doc as any).fileUrl;
                return (
                  <div key={doc.id} className="flex justify-between items-center text-xs p-2 bg-slate-50 border border-slate-100 rounded-lg hover:bg-slate-100 transition-colors">
                    <span className="font-semibold text-slate-700 uppercase">{doc.docType.replace('_', ' ')}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleViewPreview(docFile, `${doc.docType.toUpperCase().replace('_', ' ')} - ${lead.name}`)}
                        className="text-slate-600 hover:text-slate-800 font-bold cursor-pointer flex items-center gap-1 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-xs"
                      >
                        <Eye className="w-3 h-3 text-slate-500" />
                        <span>View</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadFile(docFile, `${doc.docType}_${lead.name.replace(/\s+/g, '_')}`)}
                        className="text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded shadow-xs"
                      >
                        <Download className="w-3 h-3 text-indigo-500" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Delivery Challans / Dispatched Goods Stage */}
      {challans.length > 0 && (
        <div className="relative">
          <div className="absolute -left-[31px] top-1 bg-emerald-700 text-white rounded-full p-1.5 shadow-sm border border-white">
            <Truck className="w-3.5 h-3.5" />
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                🚚 Delivery Challans & Goods Dispatched ({challans.length})
              </span>
              <span className="text-[10px] text-slate-400 font-bold">
                Latest: {dayjs(challans[challans.length - 1].createdAt).format('DD MMM YYYY')}
              </span>
            </div>

            <div className="space-y-2.5">
              {challans.map((ch) => (
                <div key={ch.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-1 border-b border-slate-200/60 pb-1.5">
                    <span className="font-extrabold text-slate-900">Challan #{ch.challanNumber}</span>
                    <span className="text-[10px] text-slate-500 font-semibold">{formatDate(ch.createdAt)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-medium">
                    <div>🚛 <strong>Vehicle:</strong> {ch.vehicleNumber}</div>
                    <div>👤 <strong>Driver:</strong> {ch.driverName} ({ch.driverPhone})</div>
                  </div>

                  {ch.items && ch.items.length > 0 && (
                    <div className="bg-white p-2 rounded-lg border border-slate-200/60">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Dispatched Items ({ch.items.length}):</span>
                      <ul className="divide-y divide-slate-100 text-[11px]">
                        {ch.items.map((it, idx) => (
                          <li key={idx} className="py-1 flex justify-between items-center">
                            <span className="font-semibold text-slate-800">{it.productName}</span>
                            <span className="font-bold text-emerald-700">{it.qty} {it.unit || 'Nos'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. Installation Photos Stage */}
      {photos.length > 0 && (
        <div className="relative">
          <div className="absolute -left-[31px] top-1 bg-emerald-600 text-white rounded-full p-1.5 shadow-sm border border-white">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 mb-2">
              Installation Quality Assurance
            </span>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {photos.map((ph) => {
                const photoFile = ph.photoBlob || (ph as any).photoUrl;
                const imgUrl = renderBlobImage(photoFile);
                return (
                  <div key={ph.id} className="border border-slate-200 rounded-lg p-2 bg-slate-50 relative group">
                    <span className="absolute top-3 left-3 bg-slate-900/70 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10">
                      {ph.photoType}
                    </span>
                    <div className="relative overflow-hidden rounded-lg bg-slate-200 aspect-video cursor-pointer" onClick={() => handleViewPreview(photoFile, `Installation Photo - ${ph.photoType.toUpperCase()}`)}>
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={`${ph.photoType} photo`}
                          className="w-full h-full object-cover hover:scale-110 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">Photo Unavailable</div>
                      )}
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white">
                        <button type="button" onClick={() => handleViewPreview(photoFile, `Installation Photo - ${ph.photoType.toUpperCase()}`)} className="p-1.5 bg-slate-800/80 rounded-full hover:bg-slate-700">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => handleDownloadFile(photoFile, `Installation_${ph.photoType}_${lead.name.replace(/\s+/g, '_')}`)} className="p-1.5 bg-slate-800/80 rounded-full hover:bg-slate-700">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 min-w-0 text-slate-500 text-[10px]">
                        <Compass className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">{ph.location.placeName || `${ph.location.latitude.toFixed(4)}, ${ph.location.longitude.toFixed(4)}`}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          window.open(`https://www.google.com/maps/search/?api=1&query=${ph.location.latitude},${ph.location.longitude}`, '_blank');
                        }}
                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[9px] font-bold transition-all shadow-xs shrink-0 flex items-center gap-1 cursor-pointer"
                      >
                        <Compass className="w-3 h-3" />
                        <span>Check Map</span>
                      </button>
                    </div>
                    <div className="mt-1.5 flex justify-between items-center text-[9px] text-slate-400">
                      <span>Uploaded: {profiles[ph.uploadedBy] || ph.uploadedBy}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 8. Release Department Stage */}
      {release.map((rel) => {
        const relFile = rel.fileBlob || (rel as any).fileUrl;
        return (
          <div key={rel.id} className="relative">
            <div className="absolute -left-[31px] top-1 bg-red-500 text-white rounded-full p-1.5 shadow-sm border border-white">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-sm transition-shadow">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 mb-2">
                Release Document Received
              </span>
              {rel.notes && (
                <p className="text-xs text-slate-600 mt-1 italic">"{rel.notes}"</p>
              )}

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => handleViewPreview(relFile, `Release Document - ${lead.name}`)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Release Doc</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadFile(relFile, `Release_Doc_${lead.name.replace(/\s+/g, '_')}`)}
                  className="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-2 py-1 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Document</span>
                </button>
              </div>

              <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
                <span>Uploaded By: {profiles[rel.uploadedBy] || rel.uploadedBy}</span>
                <span>{formatDate(rel.uploadedAt)}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* DOCUMENT & IMAGE FULLSCREEN PREVIEW MODAL OVERLAY */}
      {previewItem && previewItem.url && previewItem.url.trim().length > 0 && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center border-b border-slate-800">
              <h3 className="font-bold text-sm truncate">{previewItem.title}</h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleDownloadFile(previewItem.url, `${previewItem.title.replace(/\s+/g, '_')}`)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 bg-slate-900 flex items-center justify-center overflow-auto flex-1 min-h-[300px]">
              {previewItem.url.startsWith('data:application/pdf') || previewItem.url.includes('.pdf') ? (
                <iframe src={previewItem.url} className="w-full h-[650px] border-0 rounded-xl bg-white" title={previewItem.title} />
              ) : (
                <img
                  src={previewItem.url || undefined}
                  alt={previewItem.title}
                  className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-lg border border-slate-800 bg-black/50"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
