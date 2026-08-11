import React, { useEffect, useState, useRef } from 'react';
import { leadService, filterLeadsForUser } from '../../services/leadService';
import { orderService } from '../../services/orderService';
import { useAuthStore } from '../../store/authStore';
import type { Lead } from '../../types';
import {
  FileText,
  Printer,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Sliders,
  Save
} from 'lucide-react';
import { generateOptimizedPDF } from '../../services/pdfOptimizationService';

export const CfaAgreementDocument: React.FC<{
  defaultLeadId?: string;
  isEmbedded?: boolean;
  initialData?: any;
  onSaveSuccess?: () => void;
}> = ({ defaultLeadId, isEmbedded, initialData, onSaveSuccess }) => {
  const printContainerRef = useRef<HTMLDivElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');

  // Page 1 Form Fields
  const [agreementDate, setAgreementDate] = useState('17-JUL-2026');
  const [executionPlace, setExecutionPlace] = useState('Nagpur');
  const [consumerName, setConsumerName] = useState('SUHAS VINAYAK GODBOLE');
  const [consumerNumber, setConsumerNumber] = useState('410018829103');
  const [discomName, setDiscomName] = useState('MSEDCL');
  const [consumerAddress, setConsumerAddress] = useState('PLOT NO 43 SANT GAJANAN VAIRAGADE LAYOUT NAGPUR (U) CIRCLE 440014');
  const [vendorName, setVendorName] = useState('Green Energy Solutions');
  const [vendorAddress, setVendorAddress] = useState('Plot no. 23, UJJAWAL SOCIETY,NARENDRA NAGAR,SHREE NAGAR Nagpur 440037');

  // Page 2 Technical & Financial Details
  const [systemCapacity, setSystemCapacity] = useState('3.6');
  const [moduleMake, setModuleMake] = useState('RAYZON');
  const [moduleModel, setModuleModel] = useState('DCR');
  const [moduleCapacity, setModuleCapacity] = useState('550 wp');
  const [moduleEfficiency, setModuleEfficiency] = useState('95 +%');
  const [inverterMake, setInverterMake] = useState('CATHODE');
  const [inverterModel, setInverterModel] = useState('5000');
  const [inverterCapacity, setInverterCapacity] = useState('3.6');
  const [totalRtsCost, setTotalRtsCost] = useState('_______');

  // Stamp Paper Space & Layout options
  const [stampHeaderHeightMm, setStampHeaderHeightMm] = useState(105);
  const [showStampGuide, setShowStampGuide] = useState(true);

  // Signatures (For Page 5)
  const [vendorSignatureUrl, setVendorSignatureUrl] = useState('');
  const [consumerSignatureUrl, setConsumerSignatureUrl] = useState('');
  const vendorCanvasRef = useRef<HTMLCanvasElement>(null);
  const consumerCanvasRef = useRef<HTMLCanvasElement>(null);
  const [activeCanvas, setActiveCanvas] = useState<'vendor' | 'consumer'>('vendor');
  const [isDrawing, setIsDrawing] = useState(false);

  // UI state
  const [expandedSection, setExpandedSection] = useState<string>('lead');
  const [isEditable, setIsEditable] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mobileTab, setMobileTab] = useState<'form' | 'preview'>('form');

  useEffect(() => {
    const fetchLeads = async () => {
      try {
        const { currentRole, currentUser } = useAuthStore.getState();
        const rawLeads = await leadService.getLeads();
        setLeads(filterLeadsForUser(rawLeads, currentUser, currentRole));
      } catch (err) {
        console.error('Error fetching leads:', err);
      }
    };
    fetchLeads();
  }, []);

  // Sync defaultLeadId when leads load
  useEffect(() => {
    if (leads.length > 0 && defaultLeadId) {
      setSelectedLeadId(defaultLeadId);
      const lead = leads.find((l) => l.id === defaultLeadId);
      if (lead) {
        setConsumerName(lead.name.toUpperCase());
        if (lead.phoneNumber) setConsumerNumber(lead.phoneNumber);
        if (lead.description) setConsumerAddress(lead.description);
        
        const capMatch = lead.requirement.match(/(\d+(\.\d+)?)\s*(kw|kwp)/i);
        if (capMatch) {
          setSystemCapacity(capMatch[1]);
          setInverterCapacity(capMatch[1]);
        }
      }
    }
  }, [leads, defaultLeadId]);

  useEffect(() => {
    if (initialData) {
      if (initialData.agreementDate) setAgreementDate(initialData.agreementDate);
      if (initialData.executionPlace) setExecutionPlace(initialData.executionPlace);
      if (initialData.consumerName) setConsumerName(initialData.consumerName);
      if (initialData.consumerNumber) setConsumerNumber(initialData.consumerNumber);
      if (initialData.discomName) setDiscomName(initialData.discomName);
      if (initialData.consumerAddress) setConsumerAddress(initialData.consumerAddress);
      if (initialData.vendorName) setVendorName(initialData.vendorName);
      if (initialData.vendorAddress) setVendorAddress(initialData.vendorAddress);
      if (initialData.systemCapacity) setSystemCapacity(initialData.systemCapacity);
      if (initialData.moduleMake) setModuleMake(initialData.moduleMake);
      if (initialData.moduleModel) setModuleModel(initialData.moduleModel);
      if (initialData.moduleCapacity) setModuleCapacity(initialData.moduleCapacity);
      if (initialData.moduleEfficiency) setModuleEfficiency(initialData.moduleEfficiency);
      if (initialData.inverterMake) setInverterMake(initialData.inverterMake);
      if (initialData.inverterModel) setInverterModel(initialData.inverterModel);
      if (initialData.inverterCapacity) setInverterCapacity(initialData.inverterCapacity);
      if (initialData.totalRtsCost) setTotalRtsCost(initialData.totalRtsCost);
      if (initialData.stampHeaderHeightMm) setStampHeaderHeightMm(initialData.stampHeaderHeightMm);
      if (initialData.vendorSignatureUrl) setVendorSignatureUrl(initialData.vendorSignatureUrl);
      if (initialData.consumerSignatureUrl) setConsumerSignatureUrl(initialData.consumerSignatureUrl);
    }
  }, [initialData]);

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveDocument = async () => {
    const targetLeadId = selectedLeadId || defaultLeadId;
    if (!targetLeadId) {
      alert('Please select a customer lead first.');
      return;
    }

    if (isSaving) return;
    setIsSaving(true);

    try {
      const formData = {
        agreementDate,
        executionPlace,
        consumerName,
        consumerNumber,
        discomName,
        consumerAddress,
        vendorName,
        vendorAddress,
        systemCapacity,
        moduleMake,
        moduleModel,
        moduleCapacity,
        moduleEfficiency,
        inverterMake,
        inverterModel,
        inverterCapacity,
        totalRtsCost,
        stampHeaderHeightMm,
        vendorSignatureUrl,
        consumerSignatureUrl
      };

      let pdfUrl = '';
      if (printContainerRef.current) {
        const res = await generateOptimizedPDF(printContainerRef.current, {
          uploadToFirebase: true,
          firebasePath: `documents/${targetLeadId}/cfa_agreement_${Date.now()}.pdf`
        });
        if (res.pdfUrl) pdfUrl = res.pdfUrl;
      }

      if (!pdfUrl) {
        throw new Error('PDF upload to Backblaze B2 Storage failed.');
      }

      await orderService.uploadClientDocument({
        leadId: targetLeadId,
        docType: 'cfa_agreement',
        fileBlob: pdfUrl,
        uploadedBy: 'Admin',
        formData
      });

      alert('✅ CFA Agreement PDF saved & uploaded to Backblaze B2 Storage!');
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      console.error('Error saving CFA Agreement:', err);
      alert(`❌ Failed to upload CFA Agreement PDF to Backblaze B2: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLeadChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const leadId = e.target.value;
    setSelectedLeadId(leadId);
    if (!leadId) return;

    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      setConsumerName(lead.name.toUpperCase());
      if (lead.phoneNumber) setConsumerNumber(lead.phoneNumber);
      if (lead.description) setConsumerAddress(lead.description);
      
      const capMatch = lead.requirement.match(/(\d+(\.\d+)?)\s*(kw|kwp)/i);
      if (capMatch) {
        setSystemCapacity(capMatch[1]);
        setInverterCapacity(capMatch[1]);
      }
    }
  };

  // Drawing signature logic (Mouse)
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  // Drawing signature logic (Touch)
  const startDrawingTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    setIsDrawing(true);
  };

  const drawTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (activeCanvas === 'vendor' && vendorCanvasRef.current) {
      setVendorSignatureUrl(vendorCanvasRef.current.toDataURL());
    } else if (activeCanvas === 'consumer' && consumerCanvasRef.current) {
      setConsumerSignatureUrl(consumerCanvasRef.current.toDataURL());
    }
  };

  const clearCanvas = (type: 'vendor' | 'consumer') => {
    if (type === 'vendor') {
      const canvas = vendorCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setVendorSignatureUrl('');
    } else {
      const canvas = consumerCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setConsumerSignatureUrl('');
    }
  };

  const handlePrint = () => {
    const container = printContainerRef.current;
    if (!container) return;

    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) return;

    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(el => el.outerHTML)
      .join('\n');

    const pagesHtml = container.innerHTML;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>CFA Agreement</title>
${stylesheets}
<style>
  @page {
    size: 210mm 297mm;
    margin: 0 !important;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body > .cfa-agreement-print-container {
    display: block !important;
    width: 210mm !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .cfa-agreement-page {
    font-family: "Times New Roman", Times, Georgia, serif !important;
    width: 210mm !important;
    height: 297mm !important;
    min-height: 297mm !important;
    max-height: 297mm !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
    background: white !important;
    page-break-after: always !important;
    break-after: page !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    box-shadow: none !important;
    border: none !important;
    margin: 0 !important;
  }

  .cfa-agreement-page:last-child {
    page-break-after: avoid !important;
    break-after: avoid !important;
  }

  .stamp-header-space {
    display: block !important;
    width: 100% !important;
    flex-shrink: 0 !important;
  }

  button, .print\\:hidden, canvas {
    display: none !important;
  }

  .cfa-agreement-print-container {
    gap: 0 !important;
  }
</style>
</head>
<body>
  <div class="cfa-agreement-print-container">${pagesHtml}</div>
</body>
</html>`);

    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    }, 800);
  };

  return (
    <div className={isEmbedded ? "h-[680px] max-h-[85vh] bg-slate-50 flex flex-col border border-slate-200 rounded-xl overflow-hidden shadow-xs relative" : "h-[calc(100vh-80px)] bg-slate-50 flex flex-col -mx-4 -my-6 md:-mx-8 md:-my-8 relative overflow-hidden"}>
      {/* Styles for CFA Agreement screen preview */}
      <style dangerouslySetInnerHTML={{ __html: `
        .cfa-agreement-page {
          font-family: "Times New Roman", Times, Georgia, serif !important;
          print-color-adjust: exact !important;
          -webkit-print-color-adjust: exact !important;
        }

        @media screen and (max-width: 640px) {
          .cfa-agreement-page {
            transform: scale(0.44) !important;
            transform-origin: top center !important;
            margin-bottom: -155mm !important;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1) !important;
          }
        }
        @media screen and (min-width: 641px) and (max-width: 1024px) {
          .cfa-agreement-page {
            transform: scale(0.70) !important;
            transform-origin: top center !important;
            margin-bottom: -80mm !important;
          }
        }
      `}} />

      {/* Top Header Bar with Print Button */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between shrink-0 select-none print:hidden shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm md:text-base font-black text-slate-800 tracking-tight">CFA Agreement Generator</h2>
            <p className="text-[10px] md:text-xs text-slate-500 font-medium">MNRE Rooftop Solar Programme Ph-II CFA Agreement (5 Pages)</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleSaveDocument}
            disabled={isSaving}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-xs font-black shadow-sm transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving PDF...' : 'Save Document'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print PDF</span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex border-b border-slate-200 bg-white text-xs font-bold print:hidden">
        <button
          type="button"
          onClick={() => setMobileTab('form')}
          className={`flex-1 py-2.5 text-center cursor-pointer border-b-2 ${
            mobileTab === 'form' ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-slate-500'
          }`}
        >
          Form Controls
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('preview')}
          className={`flex-1 py-2.5 text-center cursor-pointer border-b-2 ${
            mobileTab === 'preview' ? 'border-emerald-600 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-slate-500'
          }`}
        >
          A4 Preview
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Left Side: Form Controls */}
        <div className={`${
          isSidebarCollapsed ? 'w-0 hidden' : 'w-full lg:w-96'
        } ${
          mobileTab === 'form' ? 'block' : 'hidden lg:block'
        } bg-white border-r border-slate-200 overflow-y-auto flex flex-col shrink-0 transition-all duration-300 print:hidden z-20`}>

          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Document Settings</span>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                className="hidden lg:flex items-center text-slate-400 hover:text-slate-600 text-xs font-bold"
                title="Collapse Sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Hide</span>
              </button>
            </div>

            {/* Stamp Space Settings Card */}
            <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-rose-800 flex items-center space-x-1.5">
                  <Sliders className="w-3.5 h-3.5 text-rose-600" />
                  <span>Stamp Header Space (Page 1)</span>
                </span>
                <span className="text-xs font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                  {stampHeaderHeightMm} mm
                </span>
              </div>

              <div>
                <input
                  type="range"
                  min="50"
                  max="160"
                  step="5"
                  value={stampHeaderHeightMm}
                  onChange={(e) => setStampHeaderHeightMm(Number(e.target.value))}
                  className="w-full h-1.5 bg-rose-200 rounded-lg appearance-none cursor-pointer accent-rose-600"
                />
                <div className="flex justify-between text-[10px] font-bold text-rose-400 mt-1">
                  <span>Min (50mm)</span>
                  <span>Std (105mm)</span>
                  <span>Max (160mm)</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-rose-200/60">
                <label htmlFor="stampGuideToggle" className="text-[11px] font-bold text-rose-700 cursor-pointer select-none">
                  Show Stamp Outline Guide
                </label>
                <input
                  id="stampGuideToggle"
                  type="checkbox"
                  checked={showStampGuide}
                  onChange={(e) => setShowStampGuide(e.target.checked)}
                  className="w-4 h-4 text-rose-600 rounded border-rose-300 focus:ring-rose-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Section 1: Customer / Lead Selection */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'lead' ? '' : 'lead')}
                className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-xs font-black text-slate-800 border-b border-slate-200 cursor-pointer"
              >
                <span>1. Select Customer / Lead</span>
                {expandedSection === 'lead' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {expandedSection === 'lead' && (
                <div className="p-3.5 space-y-3 bg-white">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Select Lead to Auto-fill</label>
                    <select
                      value={selectedLeadId}
                      onChange={handleLeadChange}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    >
                      <option value="">-- Choose Existing Lead --</option>
                      {leads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.name} ({lead.phoneNumber || 'No phone'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Page 1 Particulars */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'agreement' ? '' : 'agreement')}
                className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-xs font-black text-slate-800 border-b border-slate-200 cursor-pointer"
              >
                <span>2. Page 1 Particulars</span>
                {expandedSection === 'agreement' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {expandedSection === 'agreement' && (
                <div className="p-3.5 space-y-3 bg-white">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Agreement Date</label>
                    <input
                      type="text"
                      value={agreementDate}
                      onChange={(e) => setAgreementDate(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      placeholder="e.g. 17-JUL-2026"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Execution Place</label>
                    <input
                      type="text"
                      value={executionPlace}
                      onChange={(e) => setExecutionPlace(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      placeholder="e.g. Nagpur"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Consumer / Applicant Name</label>
                    <input
                      type="text"
                      value={consumerName}
                      onChange={(e) => setConsumerName(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Consumer Number</label>
                    <input
                      type="text"
                      value={consumerNumber}
                      onChange={(e) => setConsumerNumber(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">DISCOM Name</label>
                    <input
                      type="text"
                      value={discomName}
                      onChange={(e) => setDiscomName(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Consumer Address</label>
                    <textarea
                      rows={2}
                      value={consumerAddress}
                      onChange={(e) => setConsumerAddress(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Vendor Name</label>
                    <input
                      type="text"
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Vendor Address</label>
                    <textarea
                      rows={2}
                      value={vendorAddress}
                      onChange={(e) => setVendorAddress(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: Page 2 Technical & Financial Details */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'tech' ? '' : 'tech')}
                className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-xs font-black text-slate-800 border-b border-slate-200 cursor-pointer"
              >
                <span>3. Page 2 Tech & Financial Details</span>
                {expandedSection === 'tech' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {expandedSection === 'tech' && (
                <div className="p-3.5 space-y-3 bg-white">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">System Capacity (kWp)</label>
                    <input
                      type="text"
                      value={systemCapacity}
                      onChange={(e) => setSystemCapacity(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      placeholder="e.g. 3.6"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Module Make</label>
                      <input
                        type="text"
                        value={moduleMake}
                        onChange={(e) => setModuleMake(e.target.value)}
                        className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                        placeholder="e.g. RAYZON"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Module Model</label>
                      <input
                        type="text"
                        value={moduleModel}
                        onChange={(e) => setModuleModel(e.target.value)}
                        className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                        placeholder="e.g. DCR"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Module Capacity</label>
                      <input
                        type="text"
                        value={moduleCapacity}
                        onChange={(e) => setModuleCapacity(e.target.value)}
                        className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                        placeholder="e.g. 550 wp"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Module Efficiency</label>
                      <input
                        type="text"
                        value={moduleEfficiency}
                        onChange={(e) => setModuleEfficiency(e.target.value)}
                        className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                        placeholder="e.g. 95 +%"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Inverter Make</label>
                      <input
                        type="text"
                        value={inverterMake}
                        onChange={(e) => setInverterMake(e.target.value)}
                        className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                        placeholder="e.g. CATHODE"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Inverter Model</label>
                      <input
                        type="text"
                        value={inverterModel}
                        onChange={(e) => setInverterModel(e.target.value)}
                        className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                        placeholder="e.g. 5000"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Inverter Output Capacity (kW)</label>
                    <input
                      type="text"
                      value={inverterCapacity}
                      onChange={(e) => setInverterCapacity(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      placeholder="e.g. 3.6"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Total RTS Cost (Rs.)</label>
                    <input
                      type="text"
                      value={totalRtsCost}
                      onChange={(e) => setTotalRtsCost(e.target.value)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      placeholder="e.g. _______"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Section 4: Signatures & On-screen Editing */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'sign' ? '' : 'sign')}
                className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-xs font-black text-slate-800 border-b border-slate-200 cursor-pointer"
              >
                <span>4. Signatures (Page 5) & On-screen Editing</span>
                {expandedSection === 'sign' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {expandedSection === 'sign' && (
                <div className="p-3.5 space-y-4 bg-white">
                  <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                      <Edit3 className="w-4 h-4 text-emerald-600" />
                      <span>Direct On-Screen Edit</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={isEditable}
                      onChange={(e) => setIsEditable(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                    />
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-700 block">Digital Signature Pad (Page 5)</span>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => setActiveCanvas('vendor')}
                        className={`flex-1 py-1.5 text-[11px] font-extrabold rounded-md cursor-pointer transition-colors ${
                          activeCanvas === 'vendor' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Vendor Sign {vendorSignatureUrl ? '✓' : ''}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCanvas('consumer')}
                        className={`flex-1 py-1.5 text-[11px] font-extrabold rounded-md cursor-pointer transition-colors ${
                          activeCanvas === 'consumer' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Applicant Sign {consumerSignatureUrl ? '✓' : ''}
                      </button>
                    </div>

                    <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50 p-1 relative">
                      {/* Separate Vendor Canvas Element */}
                      <div className={activeCanvas === 'vendor' ? 'block' : 'hidden'}>
                        <canvas
                          ref={vendorCanvasRef}
                          width={300}
                          height={100}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawingTouch}
                          onTouchMove={drawTouch}
                          onTouchEnd={stopDrawing}
                          className="w-full h-24 bg-white border border-dashed border-slate-300 rounded cursor-crosshair touch-none"
                        />
                      </div>

                      {/* Separate Applicant / Consumer Canvas Element */}
                      <div className={activeCanvas === 'consumer' ? 'block' : 'hidden'}>
                        <canvas
                          ref={consumerCanvasRef}
                          width={300}
                          height={100}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawingTouch}
                          onTouchMove={drawTouch}
                          onTouchEnd={stopDrawing}
                          className="w-full h-24 bg-white border border-dashed border-slate-300 rounded cursor-crosshair touch-none"
                        />
                      </div>

                      <div className="flex justify-between items-center mt-1 px-1">
                        <span className="text-[10px] text-slate-400 font-bold">
                          Draw {activeCanvas === 'vendor' ? 'Vendor' : 'Applicant'} signature above
                        </span>
                        <button
                          type="button"
                          onClick={() => clearCanvas(activeCanvas)}
                          className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Clear Canvas
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right Side: CFA Agreement A4 Preview */}
        <div ref={printContainerRef} className={`flex-1 overflow-y-auto overflow-x-auto bg-slate-100 p-2 sm:p-4 md:p-8 flex flex-col items-center space-y-6 main-content-wrapper select-none relative max-w-full ${
          mobileTab === 'preview' ? 'block w-full' : 'hidden lg:flex'
        }`}>
          {isSidebarCollapsed && (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              className="absolute left-0 top-6 z-40 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-4 rounded-r-xl shadow-md flex items-center space-x-1 print:hidden cursor-pointer hover:pl-3 transition-all duration-200"
              title="Expand Controls Sidebar"
            >
              <ChevronRight className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-wider [writing-mode:vertical-lr] select-none">Controls</span>
            </button>
          )}

          <div className="cfa-agreement-print-container flex flex-col items-center space-y-6 print:space-y-0 w-full">
            {/* PAGE 1: CFA Agreement with Stamp Paper Header Space */}
            <div className="cfa-agreement-page bg-white shadow-xl w-[210mm] h-[297mm] min-h-[297mm] max-h-[297mm] p-[8mm_14mm] text-slate-900 flex flex-col justify-between font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[10pt] leading-[1.35] text-justify overflow-hidden">
              <div>
                {/* Blank Stamp Paper Header Space */}
                <div 
                  style={{ 
                    height: `${stampHeaderHeightMm}mm`, 
                    minHeight: `${stampHeaderHeightMm}mm`,
                    '--stamp-height': `${stampHeaderHeightMm}mm` 
                  } as React.CSSProperties} 
                  className="stamp-header-space w-full shrink-0 transition-all relative block"
                >
                  {showStampGuide && (
                    <div className="w-full h-full border-2 border-dashed border-rose-300 bg-rose-50/20 flex items-center justify-center print:hidden">
                      <span className="text-[10px] font-sans font-bold text-rose-400 uppercase tracking-widest pointer-events-none select-none">
                        [ Reserved Space for Rs. 100 Non-Judicial Stamp Paper ({stampHeaderHeightMm}mm) ]
                      </span>
                    </div>
                  )}
                </div>

                {/* Document Header & Execution Clause */}
                <div className="space-y-3 pt-2 font-serif text-[10pt] leading-normal">
                  <h1 
                    className="text-center font-bold text-[11pt] font-serif leading-snug px-2"
                    contentEditable={isEditable}
                    suppressContentEditableWarning={true}
                  >
                    Agreement between CFA Applicant and the registered/empanelled Vendor for installation of rooftop solar system in residential house of the Applicant under simplified procedure of Rooftop Solar Programme Ph-II
                  </h1>

                  <p 
                    className="text-justify font-serif text-[10pt] leading-snug pt-1"
                    contentEditable={isEditable}
                    suppressContentEditableWarning={true}
                  >
                    This agreement is executed on {executionPlace} (Date) <span className="font-bold underline">{agreementDate}</span> for design, installation, commissioning and five years comprehensive maintenance of rooftop solar system to be installed under simplified procedure of Rooftop Solar programme Ph-II.
                  </p>

                  <div 
                    className="text-center font-bold text-[10.5pt] font-serif pt-1"
                    contentEditable={isEditable}
                    suppressContentEditableWarning={true}
                  >
                    Between
                  </div>

                  <p 
                    className="text-justify font-serif text-[10pt] leading-snug"
                    contentEditable={isEditable}
                    suppressContentEditableWarning={true}
                  >
                    <span className="font-bold underline">{consumerName}</span>, having residential electricity connection with consumer number <span className="font-bold underline">{consumerNumber}</span> from <span className="underline">{discomName}</span> at {executionPlace} (Consumer Add <span className="font-bold underline">{consumerAddress}</span> (herein referred to as Applicant).
                  </p>

                  <div 
                    className="text-left font-normal text-[10pt] font-serif"
                    contentEditable={isEditable}
                    suppressContentEditableWarning={true}
                  >
                    And
                  </div>

                  <p 
                    className="text-justify font-serif text-[10pt] leading-snug"
                    contentEditable={isEditable}
                    suppressContentEditableWarning={true}
                  >
                    <span className="font-bold">{vendorName}</span> (Name of Vendor) is registered/ empanelled with {discomName} (hereinafter referred as DISCOM) and is having registered/functional office at {executionPlace} (Vendor Add) <span className="font-bold underline">{vendorAddress}</span> (hereinafter referred as Vendor).Both Applicant and the Vendor are jointly referred as Parties.
                  </p>

                  {/* Whereas clauses */}
                  <div 
                    className="space-y-2 pt-1 text-[10pt] text-justify font-serif"
                    contentEditable={isEditable}
                    suppressContentEditableWarning={true}
                  >
                    <div className="font-bold text-[10pt]">Whereas</div>
                    <div className="flex items-start space-x-2 pl-4">
                      <span className="font-bold select-none">-</span>
                      <p className="flex-1 text-justify leading-snug">
                        The Applicant intends to install rooftop solar system under simplified procedure of Rooftop Solar Programe Ph-II of the MNRE.
                      </p>
                    </div>
                    <div className="flex items-start space-x-2 pl-4">
                      <span className="font-bold select-none">-</span>
                      <p className="flex-1 text-justify leading-snug">
                        The Vendor is registered/empanelled vendor with DISCOM for installation of rooftop solar under MNRE Schemes. The Vendor satisfies all the existing regulation pertaining to electrical safety and license in the respective state and it is not debarred or blacklisted from undertaking any such installations by any state/central Government agency.
                      </p>
                    </div>
                    <div className="flex items-start space-x-2 pl-4">
                      <span className="font-bold select-none">-</span>
                      <p className="flex-1 text-justify leading-snug">
                        Both the parties are mutually agreed and understand their roles and responsibilities and have no liability to any other agency/firm/stakeholder especially to DISCOM and MNRE.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PAGE 2: Exact Screenshot Content */}
            <div className="cfa-agreement-page bg-white shadow-xl w-[210mm] h-[297mm] min-h-[297mm] max-h-[297mm] p-[10mm_14mm] text-slate-900 flex flex-col justify-between font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[10pt] leading-[1.3] text-justify overflow-hidden">
              <div className="space-y-3 pt-1">
                
                {/* Section 1: GENERAL TERMS */}
                <div 
                  className="space-y-1.5 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">1. GENERAL TERMS:</div>
                  <p className="text-justify leading-snug pl-6">
                    The Applicant hereby represents and warrants that the Applicant has the sole legal capacity to enter into this Agreement and authorise the construction, installation and commissioning of the Rooftop Solar System (“<span className="font-bold">RTS System</span>”) which is inclusive of Balance of System (“<span className="font-bold">BoS</span>”) on the Applicant’s premises (“<span className="font-bold">Applicant Site</span>”). The Vendor reserves its right to verify ownership of the Applicant Site and Applicant covenants to co-operate and provide all information and documentation required by the Vendor for the same.
                  </p>
                  <p className="text-justify leading-snug pl-6">
                    Vendor may propose changes to the scope, nature and or schedule of the services being performed under this Agreement. All proposed changes must be mutually agreed between the Parties. If Parties fail to agree on the variation proposed, either Party may terminate this Agreement by serving notice as per Clause 13.
                  </p>
                  <p className="text-justify leading-snug pl-6">
                    The Applicant understands and agrees that future changes in load, electricity usage patterns and/or electricity tariffs may affect the economics of the RTS System and these factors have not been and cannot be considered in any analysis or quotation provided by Vendor or its Authorized Persons (<span className="italic">defined below</span>).
                  </p>
                </div>

                {/* Section 2: RTS System */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">2. RTS System</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p>
                      Total capacity of RTS System will be <span className="font-bold underline">{systemCapacity}</span> kWp.
                    </p>
                    <p>
                      The Solar modules, inverters and BoS will confirm to minimum specifications and DCR requirement of MNRE.
                    </p>
                    <p>
                      Solar modules of <span className="font-bold underline">{moduleMake}</span> make, <span className="underline">{moduleModel}</span> model, <span className="font-bold underline">{moduleCapacity}</span> capacity each and {moduleEfficiency} efficiency will be procured and installed by the Vendor
                    </p>
                    <p className="pt-1">
                      Solar inverter of <span className="font-bold underline">{inverterMake}</span> make, {inverterModel} model,<span className="font-bold underline">{inverterCapacity}</span> kW rated output capacitywill be procured and installed by the Vendor
                    </p>
                    <p>
                      Module mounting structure has to withstand minimum wind load pressure as specified by MNRE.
                    </p>
                    <p>
                      Other BoS installations shall be as per best industry practice with all safety and protection gears installed by the vendor.
                    </p>
                  </div>
                </div>

                {/* Section 3: PRICE AND PAYMENT TERMS */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">3. PRICE AND PAYMENT TERMS</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p>
                      The cost of RTS System will be Rs <span className="font-bold underline">{totalRtsCost}</span> /- (to be decided mutually). The Applicant shall paythe total cost to the Vendor as under:
                    </p>
                    <div className="pl-6 space-y-1 pt-0.5">
                      <p><span className="inline-block w-8">(i)</span> 20 % as an advance on confirmation of the order;</p>
                      <p><span className="inline-block w-8">(ii)</span> 75 % against Proforma Invoice (PI) before dispatch of solar panels, inverters and other BoS items to be delivered;</p>
                      <p><span className="inline-block w-8">(iii)</span> 5 % after installation and commissioning of the RTS System.</p>
                    </div>
                    <p className="pt-1">
                      The order value and payment terms are fixed and will not be subject to any adjustment except as approved in writing by Vendor. The payment shall be made only through bankers’ cheque / NEFT / RTGS / online payment portal as intimated by Vendor. No cash payments shall be accepted by Vendor or its Authorized Person.
                    </p>
                  </div>
                </div>

                {/* Section 4: REPRESENTATIONS MADE BY THE APPLICANT */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">4. REPRESENTATIONS MADE BY THE APPLICANT:</div>
                  <div className="pl-6 space-y-1 leading-snug">
                    <p>The Applicant acknowledges and agrees that:</p>
                    <div className="pl-6 space-y-1">
                      <p>any timeline or schedule shared by Vendor for the provision of services and delivery of the RTS System is only an estimate and Vendor will not be liable for any delay that is not attributable to Vendor;</p>
                      <p>all information disclosed by the Applicant to Vendor in connection with the supply of the RTS System (or any part thereof), services and generation estimation (including, without limitation, the load profile and power bill) are true and accurate, and acknowledges that Vendor has relied on the information produced by the Applicant to customize the RTS System layout and BoS design for the purposes of this Agreement;</p>
                      <p>all descriptive specifications, illustrations, drawings, data, dimensions, quotation, fact sheets, price lists and any advertising material circulated/published/provided by Vendor are approximate only;</p>
                      <p>any drawings, pre-feasibility report, specifications and plans composed by Vendor shall</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PAGE 3: Continuation of Section 4, 5. MAINTENANCE & 6. ACCESS AND RIGHT OF ENTRY */}
            <div className="cfa-agreement-page bg-white shadow-xl w-[210mm] h-[297mm] min-h-[297mm] max-h-[297mm] p-[10mm_14mm] text-slate-900 flex flex-col justify-between font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[10pt] leading-[1.3] text-justify overflow-hidden">
              <div className="space-y-3 pt-1">
                
                {/* Continuation of Section 4 bullets */}
                <div 
                  className="space-y-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <p className="text-justify leading-snug pl-12">
                    require the Applicant’s approval within 5 (five) days of its receipt by electronic mail to Vendor and if the Applicant does not respond within this period, the drawings, specifications or plans shall be final and deemed to have been approved by the Applicant;
                  </p>
                  <p className="text-justify leading-snug pl-12">
                    the Applicant shall not use the RTS System or any part thereof, other than in accordance with the product manufacturer’s specifications, and covenants that any risk arising from misuse or/and misappropriation use shall be to the account of the Applicant alone.
                  </p>
                  <p className="text-justify leading-snug pl-6 pt-1 font-normal">
                    The Applicant represents, warrants and covenants that:
                  </p>
                  <div className="pl-12 space-y-1 leading-snug">
                    <p><span className="inline-block w-8">(i)</span> all electrical and plumbing infrastructure at the Applicant Site are in conformity with applicable laws;</p>
                    <p><span className="inline-block w-8">(ii)</span> the Applicant has the legal capacity to permit unfettered access to Vendor and its Authorized Persons for the purposes of execution and performance of this Agreement;</p>
                    <p><span className="inline-block w-8">(iii)</span> the Applicant has and will provide requisite power, water and other requisite resources and storage facilities for construction, installation, operation and maintenance of the RTS System;</p>
                    <p><span className="inline-block w-8">(iv)</span> the Applicant will provide support for site fabrication of structure, assembly and fitting of module mounting structure at Applicant Site;</p>
                    <p><span className="inline-block w-8">(v)</span> the Applicant will ensure that the Applicant Site is shadow free and free of all encumbrances during the lifetime of the RTS System;</p>
                    <p><span className="inline-block w-8">(vi)</span> Applicant should ensure that the Applicant regularly cleans and ensures accessibility and safety to the RTS System, as required by Vendor and dusting frequency in the premises.</p>
                    <p><span className="inline-block w-8">(vii)</span> Vendor is entitled to permit geo-tagging of the Applicant Site as a Vendor installation site;</p>
                    <p><span className="inline-block w-8">(viii)</span> Unless otherwise intimated by the Applicant in writing, Vendor is entitled to take photographs, videos and testimonials of the Applicant and the Applicant Site, and to create content which will become the property of Vendor and the same can be freely used by Vendor as part of its promotional and marketing activities across all platforms as it deems fit;</p>
                    <p><span className="inline-block w-8">(ix)</span> the Applicant validates the stability of the Applicant Site for the installation of the RTS System.</p>
                  </div>
                </div>

                {/* Section 5: MAINTENANCE */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">5. MAINTENANCE:</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p>
                      Vendor shall provide five-year free workmanship maintenance. Vendor shall visit the Applicant’s premises at least once every quarter after commissioning of the RTS System for maintenance purposes.
                    </p>
                    <p>
                      During such maintenance visit, Vendor shall check all nuts and bolts, fuses, earth resistance and other consumables in respect of the RTS System to ensure that it is in good working condition.
                    </p>
                    <p>
                      Cleaning requirement/expectation from the Applicant side – Applicant responsibility, minimum expectation from Applicant that it will be cleaned regularly as per the dusting frequency.
                    </p>
                  </div>
                </div>

                {/* Section 6: ACCESS AND RIGHT OF ENTRY */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">6. ACCESS AND RIGHT OF ENTRY:</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p>
                      The Applicant hereby grants permission to Vendor and its authorized personnel, representatives, associates, officers, employees, financing agents, subcontractors (“<span className="font-bold">Authorized Persons</span>”) to enter the Applicant Site for the purposes of:
                    </p>
                    <div className="pl-6 space-y-0.5">
                      <p><span className="inline-block w-6">(a)</span> conducting feasibility study;</p>
                      <p><span className="inline-block w-6">(b)</span> storing the RTS System/any part thereof;</p>
                      <p><span className="inline-block w-6">(c)</span> installing the RTS System;</p>
                      <p><span className="inline-block w-6">(d)</span> inspecting the RTS System;</p>
                      <p><span className="inline-block w-6">(e)</span> conducting repairs and maintenance to the RTS System;</p>
                      <p><span className="inline-block w-6">(f)</span> removing the RTS System (or any part thereof), if necessary for any reason whatsoever;</p>
                      <p><span className="inline-block w-6">(g)</span> Such other matters as necessary to execute and perform its rights and obligations under this Agreement.</p>
                    </div>
                    <p className="pt-1">
                      The Applicant shall ensure that third-party consents necessary for the Authorized Persons to access the Applicant Site are obtained prior to commencement of services under this Agreement.
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* PAGE 4: 7. WARRANTIES, 8. PERFORMANCE GUARANTEE, 9. INSURANCE, 10. CANCELLATION */}
            <div className="cfa-agreement-page bg-white shadow-xl w-[210mm] h-[297mm] min-h-[297mm] max-h-[297mm] p-[10mm_14mm] text-slate-900 flex flex-col justify-between font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[10pt] leading-[1.3] text-justify overflow-hidden">
              <div className="space-y-3 pt-1">
                
                {/* Section 7: WARRANTIES */}
                <div 
                  className="space-y-1.5 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">7. WARRANTIES:</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p className="text-justify">
                      <span className="font-normal">Product Warranty:</span> The Applicant shall be entitled to manufacturers’ warranty. Any warranty in relation to RTS System supplied to the Applicant by Vendor under this Agreement is limited to the warranty given by the manufacturer of the RTS System (or any part thereof) to Vendor. <span className="font-normal">Installation Warranty:</span> Vendor warrants that all installations shall be free from workmanship defects or BOS defects for a period of five years from the date of installation of the RTS System. The warranty is limited to Vendor rectifying the workmanship or BOS defects at Vendor’s expense in respect of those defects reported by the Applicant, in writing. The Applicant is obliged and liable to report such defects within 15 (fifteen) days of occurrence of such defect.
                    </p>
                    <p className="text-justify">
                      Subject to manufacturer warranty, Vendor warrants that the solar modules supplied herein shall have tolerance within a five percentage range (+/-5%). The peak-power point voltage and the peak-power point current of any supplied solar module and/or any module string (series connected modules) shall not vary by more than 5% (five percent) from the respective arithmetic means for all modules and/or for all module strings, as the case may be, provided the RTS System is properly maintained and the Applicant Site is free from shadow at the time of operation of the RTS System.
                    </p>
                    <p className="font-normal">Exceptions for warranty:</p>
                    <div className="pl-6 space-y-1">
                      <p><span className="inline-block w-6">(a)</span> Any attempt by any person other than Vendor or its Authorised Persons to adjust, modify, repair or provide maintenance to the RTS System, shall disentitle the Applicant of the warranty provided by Vendor hereunder.</p>
                      <p><span className="inline-block w-6">(b)</span> Vendor shall not be liable for any degeneration or damage to the RTS System due to any action or inaction on the part of the Applicant.</p>
                      <p><span className="inline-block w-6">(c)</span> Vendor shall not be bound or liable to remedy any damage, fault, failure or malfunction of the RTS System owing to external causes, including but not limited to accidents, misuse, neglect, if usage and/or storage and/or installation are non-confirming toproduct instructions, modifications by the Applicant leading to shading or accessibilityissues, failure to perform required maintenance, normal wear and tear, Force Majeure Event, or negligence or default attributable to the Applicant.</p>
                      <p><span className="inline-block w-6">(d)</span> Vendor shall not be liable to repair or remedy any accessories or parts added to the RTS System that were not originally sourced by Vendor to the Applicant.</p>
                    </div>
                  </div>
                </div>

                {/* Section 8: PERFORMANCE GUARANTEE */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">8. PERFORMANCE GUARANTEE</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p>
                      Vendor guarantees minimum system performance ratio of 75% as per performance ratio test carried out in adherence to IEC 61724 or equivalent BIS for a period of five years.
                    </p>
                  </div>
                </div>

                {/* Section 9: INSURANCE */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">9. INSURANCE:</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p>
                      Vendor may, at its sole discretion, obtain insurance covering risks of loss/damage to the RTS System (any part thereof) during transit from Vendor’s warehouse until delivery to the Applicant Site and until installation and commissioning.
                    </p>
                    <p>
                      Thereafter, all risk shall pass on to the Applicant and the Applicant may accordingly procure relevant insurances.
                    </p>
                  </div>
                </div>

                {/* Section 10: CANCELLATION */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">10. CANCELLATION:</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p>
                      The Applicant may cancel the order placed on Vendor within 7 (seven) days from thedate of remittance of advance money or the date of order acceptance, whichever is earlier (“<span className="font-bold">Order Confirmation</span>”) by serving notice as per Clause 13.
                    </p>
                    <p>
                      If the Applicant cancels the order after the expiry of 7 (seven) days from the date of Order Form, the Applicant shall be liable to pay Vendor, a cancellation fee of XX% of the total order value <span className="italic">plus</span> costs and expenses incurred by Vendor, including, costs for labor, design, return of products, administrative costs, subvention costs.
                    </p>
                    <p className="pt-1">
                      Notwithstanding the aforesaid, the Applicant shall not be entitled to cancel the OrderForm after Vendor has dispatched the RTS System (or any part thereof, including BOS) to the
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* PAGE 5: 11. LIMITATION OF LIABILITY, 12. SUSPENSION, 13. NOTICES, 14. FORCE MAJEURE, 15. GOVERNING LAW & SIGNATURES */}
            <div className="cfa-agreement-page bg-white shadow-xl w-[210mm] h-[297mm] min-h-[297mm] max-h-[297mm] p-[10mm_14mm] text-slate-900 flex flex-col justify-between font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[10pt] leading-[1.3] text-justify overflow-hidden">
              <div className="space-y-3 pt-1">
                
                {/* Section 10 Continuation */}
                <div 
                  className="space-y-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <p className="text-justify leading-snug pl-6">
                    Applicant Site. If Applicant chooses to terminate the Order Form after dispatch, the entire amount paid by the Applicant till date, shall be forfeited by Vendor.
                  </p>
                </div>

                {/* Section 11: LIMITATION OF LIABILITY AND INDEMNITY */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">11. LIMITATION OF LIABILITY AND INDEMNITY:</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p className="text-justify">
                      To the extent that terms implied by law apply to the RTS System and the servicesrendered under this Agreement, Vendor’s liability for any breach of those terms is limited to:
                    </p>
                    <div className="pl-6 space-y-0.5">
                      <p><span className="inline-block w-6">(a)</span> repairing or replacing the RTS System/any part thereof, as applicable; or</p>
                      <p><span className="inline-block w-6">(b)</span> Refund of the moneys paid by the Applicant to Vendor, if Vendor cannot fulfil the order.</p>
                    </div>
                  </div>
                </div>

                {/* Section 12: SUSPENSION AND TERMINATION */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">12. SUSPENSION AND TERMINATION:</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p className="text-justify">
                      If the Applicant fails to pay any sum due under this Agreement on the due date, Vendormay, in addition to its other rights under this Agreement, suspend its obligations under this Agreement until all outstanding amounts (including interest due) are paid.
                    </p>
                  </div>
                </div>

                {/* Section 13: NOTICES */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">13. NOTICES: <span className="font-normal">Any notice or other communication under this Agreement to Vendor and or to the Applicant, shall be in writing, in English language and shall be delivered or sent: (a) by electronic mail and/or (b) by hand delivery or registered post/courier, at the registered address of Applicant/Vendor.</span></div>
                </div>

                {/* Section 14: FORCE MAJEURE EVENT */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">14. FORCE MAJEURE EVENT:</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p className="text-justify">
                      Neither Party shall be in default due to any delay or failure to perform its/his/her/their obligations under this Agreement which arises from or is a consequence of occurrence of an event which is beyond the reasonable control of such Party, and which makes performance of its/his/her/their obligations under this Agreement impossible or so impractical as reasonably to be considered impossible in the circumstances, and includes, but is not limited to, war, riot, civil disorder, earthquake, fire, explosion, storm, flood or other adverse weather conditions, pandemic, epidemic, embargo, strikes, lockouts, labour difficulties, other industrial action, acts of government, unavailability of equipment from vendor, changes requested by the Applicant (“<span className="font-bold">Force Majeure Event</span>”).
                    </p>
                  </div>
                </div>

                {/* Section 15: GOVERNING LAW AND DISPUTE RESOLUTION */}
                <div 
                  className="space-y-1.5 pt-1 text-[10pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[10pt]">15. GOVERNING LAW AND DISPUTE RESOLUTION:</div>
                  <div className="pl-6 space-y-1.5 leading-snug">
                    <p className="text-justify">
                      The interpretation and enforcement of this Agreement shall be governed by the laws of India In the event of any dispute, controversy or difference between the Parties arising out of, or relating to this Agreement (“<span className="font-bold">Dispute</span>”), both Parties shall make an effort to resolve theDispute in good faith, failing which, any Party to the Dispute shall be entitled to refer the Dispute to arbitration to resolve the Dispute in the manner set out in this Clause. The rights and obligations of the Parties under this Agreement shall remain in full force and effect pending the award in such arbitration proceeding.
                    </p>
                    <p className="text-justify">
                      The arbitration proceeding shall be governed by the provisions of the Arbitration and Conciliation Act, 1996 and shall be settled by a sole arbitrator mutually appointed by the Parties.
                    </p>
                  </div>
                </div>
              </div>

              {/* Page 5 Signature Section */}
              <div className="pt-6 pb-2 mt-4 font-serif text-[10pt] leading-normal">
                <div className="grid grid-cols-2 gap-12 items-start">
                  {/* Left: Applicant Signature & Witness */}
                  <div className="space-y-3">
                    <p className="text-center font-normal">(Applicant)</p>
                    <div className="text-center min-h-[40px] flex flex-col items-center justify-end">
                      {consumerSignatureUrl && (
                        <img src={consumerSignatureUrl} alt="Applicant Signature" className="h-10 object-contain mb-1" />
                      )}
                      <p className="font-bold underline uppercase">{consumerName}</p>
                    </div>

                    <div className="pt-4 space-y-4 text-left">
                      <p className="font-normal pl-4">Witness</p>
                      <p className="pl-4">1.</p>
                      <p className="pl-4">2.</p>
                    </div>
                  </div>

                  {/* Right: Vendor Signature */}
                  <div className="space-y-3">
                    <p className="text-center font-normal">(Vendor)</p>
                    <div className="text-center min-h-[40px] flex flex-col items-center justify-end">
                      {vendorSignatureUrl && (
                        <img src={vendorSignatureUrl} alt="Vendor Signature" className="h-10 object-contain mb-1" />
                      )}
                      <p className="font-normal">{vendorName}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
export default CfaAgreementDocument;
