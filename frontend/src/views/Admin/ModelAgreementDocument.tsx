import React, { useEffect, useState, useRef } from 'react';
import { leadService } from '../../services/leadService';
import { orderService } from '../../services/orderService';
import type { Lead } from '../../types';
import {
  FileText,
  Printer,
  FileSignature,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Sliders,
  Save
} from 'lucide-react';
import { generateOptimizedPDF } from '../../services/pdfOptimizationService';

export const ModelAgreementDocument: React.FC<{
  defaultLeadId?: string;
  isEmbedded?: boolean;
  initialData?: any;
  onSaveSuccess?: () => void;
}> = ({ defaultLeadId, isEmbedded, initialData, onSaveSuccess }) => {
  const printContainerRef = useRef<HTMLDivElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');

  // Form Fields for Model Agreement
  const [agreementDate, setAgreementDate] = useState('11th JUNE 2026');
  const [consumerName, setConsumerName] = useState('SHRI SANDIP RAMAJI LAHAMGE');
  const [consumerNumber, setConsumerNumber] = useState('396013606014');
  const [subDivision, setSubDivision] = useState('HINGANGHAT Sub division NAGPUR');
  const [companyName, setCompanyName] = useState('GREEN ENERGY SOLUTION');
  const [discomName, setDiscomName] = useState('MSEDCL');
  const [vendorAddress, setVendorAddress] = useState('SUYOG NAGAR NAGAPUR 440027');
  const [systemCapacity, setSystemCapacity] = useState('5.0');
  
  // Technical & Financial details for Page 2
  const [moduleMake, setModuleMake] = useState('WAAREE');
  const [moduleCapacity, setModuleCapacity] = useState('550Wp');
  const [moduleEfficiency, setModuleEfficiency] = useState('20%');
  const [inverterMake, setInverterMake] = useState('UTL 5KW');
  const [inverterCapacity, setInverterCapacity] = useState('5kW');
  const [totalRtsCost, setTotalRtsCost] = useState('Rs.3,50,000/-');
  
  // Stamp Paper Space & Layout options
  const [stampHeaderHeightMm, setStampHeaderHeightMm] = useState(105);
  const [showStampGuide, setShowStampGuide] = useState(true);

  // Signatures
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
        const lList = await leadService.getLeads();
        setLeads(lList);
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
        setConsumerNumber(lead.phoneNumber || 'ASC-' + lead.id.replace('lead_', '').toUpperCase());
        
        const capMatch = lead.requirement.match(/(\d+(\.\d+)?)\s*(kw|kwp)/i);
        if (capMatch) {
          setSystemCapacity(capMatch[1]);
        }
      }
    }
  }, [leads, defaultLeadId]);

  useEffect(() => {
    if (initialData) {
      if (initialData.agreementDate) setAgreementDate(initialData.agreementDate);
      if (initialData.consumerName) setConsumerName(initialData.consumerName);
      if (initialData.consumerNumber) setConsumerNumber(initialData.consumerNumber);
      if (initialData.subDivision) setSubDivision(initialData.subDivision);
      if (initialData.companyName) setCompanyName(initialData.companyName);
      if (initialData.discomName) setDiscomName(initialData.discomName);
      if (initialData.vendorAddress) setVendorAddress(initialData.vendorAddress);
      if (initialData.systemCapacity) setSystemCapacity(initialData.systemCapacity);
      if (initialData.moduleMake) setModuleMake(initialData.moduleMake);
      if (initialData.moduleCapacity) setModuleCapacity(initialData.moduleCapacity);
      if (initialData.moduleEfficiency) setModuleEfficiency(initialData.moduleEfficiency);
      if (initialData.inverterMake) setInverterMake(initialData.inverterMake);
      if (initialData.inverterCapacity) setInverterCapacity(initialData.inverterCapacity);
      if (initialData.totalRtsCost) setTotalRtsCost(initialData.totalRtsCost);
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
        consumerName,
        consumerNumber,
        subDivision,
        companyName,
        discomName,
        vendorAddress,
        systemCapacity,
        moduleMake,
        moduleCapacity,
        moduleEfficiency,
        inverterMake,
        inverterCapacity,
        totalRtsCost
      };

      let pdfUrl = '';
      if (printContainerRef.current) {
        const res = await generateOptimizedPDF(printContainerRef.current, {
          uploadToFirebase: true,
          firebasePath: `documents/${targetLeadId}/model_agreement_${Date.now()}.pdf`
        });
        if (res.pdfUrl) pdfUrl = res.pdfUrl;
      }

      if (!pdfUrl) {
        throw new Error('PDF upload to Backblaze B2 failed.');
      }

      await orderService.uploadClientDocument({
        leadId: targetLeadId,
        docType: 'model_agreement',
        fileBlob: pdfUrl,
        uploadedBy: 'Admin',
        formData
      });

      alert('✅ Model Agreement PDF saved & uploaded to Backblaze B2!');
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      console.error('Error saving Model Agreement:', err);
      alert(`❌ Failed to upload Model Agreement PDF to Backblaze B2: ${err.message || err}`);
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
      setConsumerNumber(lead.phoneNumber || 'ASC-' + lead.id.replace('lead_', '').toUpperCase());
      
      const capMatch = lead.requirement.match(/(\d+(\.\d+)?)\s*(kw|kwp)/i);
      if (capMatch) {
        setSystemCapacity(capMatch[1]);
      }
    }
  };

  // Drawing signature logic
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
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

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveCanvasImage();
  };

  const startTouchDrawing = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
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

  const saveCanvasImage = () => {
    const canvas = activeCanvas === 'vendor' ? vendorCanvasRef.current : consumerCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    if (activeCanvas === 'vendor') {
      setVendorSignatureUrl(dataUrl);
    } else {
      setConsumerSignatureUrl(dataUrl);
    }
  };

  const clearVendorSignature = () => {
    if (vendorCanvasRef.current) {
      const ctx = vendorCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, vendorCanvasRef.current.width, vendorCanvasRef.current.height);
    }
    setVendorSignatureUrl('');
  };

  const clearConsumerSignature = () => {
    if (consumerCanvasRef.current) {
      const ctx = consumerCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, consumerCanvasRef.current.width, consumerCanvasRef.current.height);
    }
    setConsumerSignatureUrl('');
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? '' : section);
  };

  const handlePrint = () => {
    const container = document.querySelector('.model-agreement-print-container');
    if (!container) return;

    const printWindow = window.open('', '_blank', 'width=794,height=1123');
    if (!printWindow) return;

    // Copy all stylesheets from the main app (Tailwind JIT, custom CSS, etc.)
    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(el => el.outerHTML)
      .join('\n');

    const pagesHtml = container.innerHTML;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Model Agreement</title>
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

  body > .model-agreement-print-container {
    display: block !important;
    width: 210mm !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .model-agreement-page {
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

  .model-agreement-page:last-child {
    page-break-after: avoid !important;
    break-after: avoid !important;
  }

  .stamp-header-space {
    display: block !important;
    width: 100% !important;
    flex-shrink: 0 !important;
  }

  /* Hide buttons, controls, non-print elements */
  button, .print\\:hidden, canvas {
    display: none !important;
  }

  /* Remove inter-page spacing in print */
  .model-agreement-print-container {
    gap: 0 !important;
  }
  .model-agreement-print-container > .space-y-6 > * + * {
    margin-top: 0 !important;
  }
</style>
</head>
<body>
  <div class="model-agreement-print-container">${pagesHtml}</div>
</body>
</html>`);

    printWindow.document.close();
    
    // Wait for stylesheets to load before printing
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    }, 800);
  };

  return (
    <div className={isEmbedded ? "h-[680px] max-h-[85vh] bg-slate-50 flex flex-col border border-slate-200 rounded-xl overflow-hidden shadow-xs relative" : "h-[calc(100vh-80px)] bg-slate-50 flex flex-col -mx-4 -my-6 md:-mx-8 md:-my-8 relative overflow-hidden"}>
      {/* Styles for Model Agreement screen preview */}
      <style dangerouslySetInnerHTML={{ __html: `
        .model-agreement-page {
          font-family: "Times New Roman", Times, Georgia, serif !important;
          print-color-adjust: exact !important;
          -webkit-print-color-adjust: exact !important;
        }

        @media screen and (max-width: 640px) {
          .model-agreement-page {
            transform: scale(0.44) !important;
            transform-origin: top center !important;
            margin-bottom: -155mm !important;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1) !important;
          }
        }
        @media screen and (min-width: 641px) and (max-width: 1024px) {
          .model-agreement-page {
            transform: scale(0.70) !important;
            transform-origin: top center !important;
            margin-bottom: -80mm !important;
          }
        }
      `}} />

      {/* Top Header Bar with Print Button */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between shrink-0 select-none dcr-header-bar print:hidden shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm md:text-base font-black text-slate-800 tracking-tight">Model Agreement Generator</h2>
            <p className="text-[10px] md:text-xs text-slate-500 font-medium">MNRE Rooftop Solar Programme Ph-II Stamp Paper Agreement</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleSaveDocument}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black shadow-sm transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Document</span>
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

      {/* Mobile Segmented Switch (Form Controls vs Document Preview) */}
      <div className="sticky top-0 z-30 flex lg:hidden bg-white/95 backdrop-blur-md p-1.5 border-b border-slate-200 justify-center gap-2 select-none shrink-0 print:hidden shadow-xs">
        <button
          type="button"
          onClick={() => setMobileTab('form')}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
            mobileTab === 'form' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>📝 Form Controls</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('preview')}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
            mobileTab === 'preview' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-650 hover:bg-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>📄 Document Preview</span>
        </button>
      </div>

      {/* Main split viewport */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* Left Side: Form Controls */}
        <div className={`bg-white border-r border-slate-200 overflow-y-auto space-y-4 action-sidebar shrink-0 select-none transition-all duration-300 lg:sticky lg:top-0 lg:max-h-[calc(100vh-60px)] ${
          mobileTab === 'form' ? 'w-full block' : 'hidden lg:block'
        } ${
          isSidebarCollapsed ? 'lg:w-0 lg:p-0 lg:border-r-0 lg:opacity-0 pointer-events-none' : 'w-full lg:w-96 p-4 opacity-100'
        }`}>
          
          {/* Custom Edit Toggle */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 flex flex-col space-y-3 shadow-xs select-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Edit3 className="w-4 h-4 text-emerald-600" />
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Direct Page Editor</h4>
                  <p className="text-[9px] text-slate-400 font-medium">Click and type on preview to edit any text</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(true)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsEditable(!isEditable)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isEditable ? 'bg-emerald-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      isEditable ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Stamp Paper Top Space Adjustment Slider */}
            <div className="pt-2 border-t border-emerald-100 space-y-1.5">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-700">
                <span className="flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-emerald-600" />
                  Stamp Header Blank Space:
                </span>
                <span className="text-emerald-700">{stampHeaderHeightMm} mm</span>
              </div>
              <input
                type="range"
                min="0"
                max="160"
                step="5"
                value={stampHeaderHeightMm}
                onChange={(e) => setStampHeaderHeightMm(Number(e.target.value))}
                className="w-full h-1.5 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
              <div className="flex justify-between items-center text-[9px] text-slate-500 pt-0.5">
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showStampGuide}
                    onChange={(e) => setShowStampGuide(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-550"
                  />
                  <span>Show Stamp Paper Box Guide</span>
                </label>
              </div>
            </div>
          </div>

          {/* Section 1: Lead Auto-Fill */}
          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('lead')}
              className="w-full bg-slate-50 px-4 py-3 flex items-center justify-between font-bold text-xs text-slate-700 hover:bg-slate-100/70 transition-colors"
            >
              <span>Select Customer / Lead</span>
              {expandedSection === 'lead' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'lead' && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-3">
                <select
                  value={selectedLeadId}
                  onChange={handleLeadChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Choose Lead to Auto-Fill --</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.requirement})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Section 2: Agreement Parameters */}
          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('agreement')}
              className="w-full bg-slate-50 px-4 py-3 flex items-center justify-between font-bold text-xs text-slate-700 hover:bg-slate-100/70 transition-colors"
            >
              <span>Agreement Details</span>
              {expandedSection === 'agreement' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'agreement' && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-3.5">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Agreement Executed Date</label>
                  <input
                    type="text"
                    value={agreementDate}
                    onChange={(e) => setAgreementDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Applicant / Consumer Name</label>
                  <input
                    type="text"
                    value={consumerName}
                    onChange={(e) => setConsumerName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Consumer Number</label>
                  <input
                    type="text"
                    value={consumerNumber}
                    onChange={(e) => setConsumerNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Sub Division / Circle</label>
                  <input
                    type="text"
                    value={subDivision}
                    onChange={(e) => setSubDivision(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Vendor & DISCOM Parameters */}
          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('vendor')}
              className="w-full bg-slate-50 px-4 py-3 flex items-center justify-between font-bold text-xs text-slate-700 hover:bg-slate-100/70 transition-colors"
            >
              <span>Vendor & DISCOM Details</span>
              {expandedSection === 'vendor' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'vendor' && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-3.5">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Vendor Company Name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">DISCOM Name</label>
                  <input
                    type="text"
                    value={discomName}
                    onChange={(e) => setDiscomName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Vendor Office Address</label>
                  <input
                    type="text"
                    value={vendorAddress}
                    onChange={(e) => setVendorAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">System Capacity (KWp)</label>
                  <input
                    type="text"
                    value={systemCapacity}
                    onChange={(e) => setSystemCapacity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Technical Specs & Payment Terms */}
          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('technical')}
              className="w-full bg-slate-50 px-4 py-3 flex items-center justify-between font-bold text-xs text-slate-700 hover:bg-slate-100/70 transition-colors"
            >
              <span>Page 2 Specs & Payment Terms</span>
              {expandedSection === 'technical' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'technical' && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Solar Module Make & Model</label>
                  <input
                    type="text"
                    value={moduleMake}
                    onChange={(e) => setModuleMake(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Module Wp</label>
                    <input
                      type="text"
                      value={moduleCapacity}
                      onChange={(e) => setModuleCapacity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Efficiency</label>
                    <input
                      type="text"
                      value={moduleEfficiency}
                      onChange={(e) => setModuleEfficiency(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Inverter Make</label>
                    <input
                      type="text"
                      value={inverterMake}
                      onChange={(e) => setInverterMake(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Inverter Capacity</label>
                    <input
                      type="text"
                      value={inverterCapacity}
                      onChange={(e) => setInverterCapacity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Total RTS System Cost</label>
                  <input
                    type="text"
                    value={totalRtsCost}
                    onChange={(e) => setTotalRtsCost(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Signature Pads */}
          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('signatures')}
              className="w-full bg-slate-50 px-4 py-3 flex items-center justify-between font-bold text-xs text-slate-700 hover:bg-slate-100/70 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <FileSignature className="w-4 h-4 text-emerald-600" />
                <span>Draw Signatures (Vendor & Applicant)</span>
              </div>
              {expandedSection === 'signatures' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'signatures' && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-3">
                <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200 gap-1 select-none">
                  <button
                    type="button"
                    onClick={() => setActiveCanvas('vendor')}
                    className={`flex-1 py-1.5 text-center font-bold text-[11px] rounded transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                      activeCanvas === 'vendor' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>Vendor Sign</span>
                    {vendorSignatureUrl && <span className="text-emerald-200 font-extrabold text-[10px]">✓</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCanvas('consumer')}
                    className={`flex-1 py-1.5 text-center font-bold text-[11px] rounded transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                      activeCanvas === 'consumer' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span>Applicant Sign</span>
                    {consumerSignatureUrl && <span className="text-emerald-200 font-extrabold text-[10px]">✓</span>}
                  </button>
                </div>

                <div className="flex justify-between items-center mb-1 pt-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">
                    Drawing: <span className="text-emerald-700 font-extrabold">{activeCanvas === 'vendor' ? 'Vendor Signature' : 'Applicant Signature'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={activeCanvas === 'vendor' ? clearVendorSignature : clearConsumerSignature}
                    className="text-[10px] text-rose-500 hover:text-rose-600 font-bold transition-colors cursor-pointer"
                  >
                    Clear {activeCanvas === 'vendor' ? 'Vendor' : 'Applicant'}
                  </button>
                </div>

                <div className="border border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-50 h-28 relative">
                  {/* Vendor Canvas */}
                  <canvas
                    ref={vendorCanvasRef}
                    width={320}
                    height={112}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startTouchDrawing}
                    onTouchMove={drawTouch}
                    onTouchEnd={stopDrawing}
                    className={`w-full h-full cursor-crosshair bg-slate-50 touch-none ${
                      activeCanvas === 'vendor' ? 'block' : 'hidden'
                    }`}
                  />

                  {/* Applicant / Consumer Canvas */}
                  <canvas
                    ref={consumerCanvasRef}
                    width={320}
                    height={112}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startTouchDrawing}
                    onTouchMove={drawTouch}
                    onTouchEnd={stopDrawing}
                    className={`w-full h-full cursor-crosshair bg-slate-50 touch-none ${
                      activeCanvas === 'consumer' ? 'block' : 'hidden'
                    }`}
                  />
                </div>

                {/* Status Badges */}
                <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100">
                  <span className={vendorSignatureUrl ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                    {vendorSignatureUrl ? '✓ Vendor Sign Saved' : '• Vendor Sign Pending'}
                  </span>
                  <span className={consumerSignatureUrl ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                    {consumerSignatureUrl ? '✓ Applicant Sign Saved' : '• Applicant Sign Pending'}
                  </span>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Model Agreement A4 Preview */}
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

          <div className="model-agreement-print-container flex flex-col items-center space-y-6 print:space-y-0 w-full">
            {/* PAGE 1: Model Agreement with Stamp Paper Header Space */}
          <div className="model-agreement-page bg-white shadow-xl w-[210mm] min-h-[297mm] p-[8mm_12mm] text-slate-900 flex flex-col justify-between font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[9.8pt] leading-[1.18] text-justify">
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
              <div className="space-y-1 pt-0.5 font-serif text-[9.8pt] leading-tight">
                <div 
                  className="text-center font-bold text-xs underline font-serif pb-0.5"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  Model Agreement
                </div>

                <div 
                  className="text-center font-bold text-[9pt] font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <span className="underline">Between</span>
                </div>

                <p 
                  className="text-center font-bold text-[9.5pt] leading-tight font-serif px-1"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  Applicant and the registered/empanelled Vendor for installation of rooftop solar system in residential house of the Applicant under simplified procedure of Rooftop Solar Programme Ph-II
                </p>

                <p 
                  className="text-justify font-serif text-[9.5pt] pt-0.5 leading-tight"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  This agreement is executed on <span className="font-bold underline">{agreementDate}</span> for design, installation, commissioning and five years comprehensive maintenance of rooftop solar system to be installed under simplified procedure of Rooftop Solar Programme Ph-II.
                </p>

                <div 
                  className="text-center font-bold text-[9pt] font-serif pt-0.5"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  Between
                </div>

                <p 
                  className="text-justify font-serif text-[9.5pt] leading-tight"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <span className="font-bold">{consumerName}</span> having residential Electricity Connection with consumer number <span className="font-bold">{consumerNumber}</span> from <span className="font-bold">{subDivision}</span>
                </p>

                <div 
                  className="text-center font-bold text-[9pt] font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  And
                </div>

                <p 
                  className="text-justify font-serif text-[9.5pt] leading-tight"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <span className="font-bold">{companyName}</span> is registered/empanelled with <span className="font-bold">{discomName}</span> and is having registered/functional office at <span className="font-bold">{vendorAddress}</span> Both Applicant and the Vendor are jointly referred as Parties.
                </p>

                {/* Whereas clauses */}
                <div 
                  className="space-y-0.5 pt-0.5 text-[9.5pt] text-justify font-serif"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[9.5pt]">Whereas</div>
                  <div className="flex items-start space-x-1.5 pl-2">
                    <span className="font-bold select-none">-</span>
                    <p className="flex-1 text-justify leading-tight">
                      The Applicant intends to install rooftop solar system under simplified procedure of Rooftop Solar Programme Ph-II of the MNRE.
                    </p>
                  </div>
                  <div className="flex items-start space-x-1.5 pl-2">
                    <span className="font-bold select-none">-</span>
                    <p className="flex-1 text-justify leading-tight">
                      The Vendor is registered/empanelled vendor with DISCOM for installation of rooftop solar under MNRE Schemes. The Vendor satisfies all the existing regulation pertaining to electrical safety and license in the respective state and it is not debarred or blacklisted from undertaking any such installations by any state/central Government agency.
                    </p>
                  </div>
                  <div className="flex items-start space-x-1.5 pl-2">
                    <span className="font-bold select-none">-</span>
                    <p className="flex-1 text-justify leading-tight">
                      Both the parties are mutually agreed and understand their roles and responsibilities and have no liability to any other agency/firm/stakeholder especially to DISCOM and MNRE.
                    </p>
                  </div>
                </div>

                {/* Section 1: General Terms */}
                <div 
                  className="pt-0.5 text-[9.5pt] text-justify font-serif space-y-0.5"
                  contentEditable={isEditable}
                  suppressContentEditableWarning={true}
                >
                  <div className="font-bold text-[9.5pt]">1. GENERAL TERMS:</div>
                  <p className="text-justify leading-tight pl-2">
                    The Applicant here by represents and warrants that the Applicant has the sole legal capacity to enter into this Agreement and Authorise the construction, installation and commissioning of the Rooftop Solar System (“RTS System”) which is inclusive of Balance of System (“BoS”) on the Applicant’s premises (“Applicant Site”). The Vendor reserves its right to verify ownership of the Applicant Site
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* PAGE 2: Exact Screenshot Text */}
          <div className="model-agreement-page bg-white shadow-xl w-[210mm] min-h-[297mm] p-[10mm_12mm] text-slate-900 flex flex-col justify-between font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[9.8pt] leading-[1.18] text-justify">
            <div className="space-y-2 pt-0.5">
              
              {/* Top Continuation Paragraph from General Terms */}
              <div 
                className="space-y-1 text-[9.8pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <p className="text-justify leading-tight">
                  and Applicant covenants to co-operate and provide all information and documentation required by the Vendor for the same.
                </p>
                <p className="text-justify leading-tight">
                  Vendor may propose changes to the scope, nature and or schedule of the services being performed under this Agreement. All proposed changes must be mutually agreed between the Parties. If Parties fail to agree on the variation proposed, either Party may terminate this Agreement by serving notice as per Clause13.
                </p>
                <p className="text-justify leading-tight">
                  The Applicant understands and agrees that future changes in load, electricity usage patterns and/or electricity tariffs may affect the economics of the RTS System and these factors have not been and cannot be considered in any analysis or quotation provided by Vendor or its Authorized Persons (defined below).
                </p>
              </div>

              {/* Section 2: 2.RTS */}
              <div 
                className="space-y-0.5 pt-0.5 text-[9.8pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.8pt]">2.RTS</div>
                <p className="pl-2 leading-tight">
                  <span className="font-bold">2.1 Total capacity of RTS System will be minimum <span className="underline">{systemCapacity}kWp</span>.</span><br />
                  The Solar modules, inverters and BoS will confirm to minimum specifications and DCR requirement of MNRE.<br />
                  Solar modules <span className="font-bold underline">{moduleMake}</span> make, DCR model,<span className="font-bold underline">{moduleCapacity}</span> capacity each and <span className="font-bold underline">{moduleEfficiency}</span> efficiency will be procured and installed by the Vendor<br />
                  Solar inverter of make <span className="font-bold underline">{inverterMake}</span><br />
                  Model <span className="font-bold underline">{inverterCapacity}</span> rated output capacity will be procured and installed by the Vendor<br />
                  Module mounting structure has to with stand minimum wind load pressure as specified by MNRE.<br />
                  Other BoS installations shall be as per best industry practice with all safety and protection gears /installed by the vendor.
                </p>
              </div>

              {/* Section 3: 3.PRICEANDPAYMENTTERMS */}
              <div 
                className="space-y-0.5 pt-0.5 text-[9.8pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.8pt]">3.PRICEANDPAYMENTTERMS</div>
                <p className="pl-2 leading-tight">
                  The cost of RTS System will be <span className="font-bold underline">{totalRtsCost}</span> (to be decided mutually).The Applicant shall pay the total cost to the Vendor as under<br />
                  50% as an advance on confirmation of the order;<br />
                  40% against Proforma Invoice(PI) before dispatch of solar panels ,inverters and other BoS items to be delivered;<br />
                  10% after installation and commissioning of the RTS System.<br />
                  The order value and payment terms are fixed and will not be subject to any adjustment except as approved in writing by Vendor. The payment shall be made only through bankers' cheque /NEFT/RTGS/online payment portal as intimated by Vendor. No cash payments shall be accepted by Vendor or its Authorised Person.
                </p>
              </div>

              {/* Section 4: 4.REPRESENTATIONSMADEBY THEAPPLICANT: */}
              <div 
                className="space-y-0.5 pt-0.5 text-[9.8pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.8pt]">4.REPRESENTATIONSMADEBY THEAPPLICANT:</div>
                <p className="pl-2 leading-tight font-bold">The Applicant acknowledge and agrees that:</p>
                <div className="pl-4 space-y-0.5 text-justify leading-tight">
                  <p>- any timeline or schedule shared by Vendor for the provision of services and delivery of the RTS System is only an estimate and Vendor will not be liable for any delay that is not attributable to Vendor;</p>
                  <p>- all information disclosed by the Applicant to Vendor in connection with the supply of the RTS System(or any part there of),services and generation estimation(including ,without limitation ,the load profile and power bill)are true and accurate ,and acknowledges that Vendor has relied on the information produced by the Applicant to Customise the RTS System layout and BoS design for the purposes of this Agreement; all descriptive specifications, illustrations, drawings, data, dimensions, quotation, fact sheets, price lists and any advertising material circulated/published/provided by Vendor are approximate only;</p>
                  <p>- any drawings, pre-feasibility report, specifications and plans composed by Vendor shall require the Applicant's approval within 5 (five) days of its receipt by electronic mail to Vendor and if the Applicant does not respond within this period, the drawings, specifications or plans shall be final and deemed to have been approved by the Applicant;</p>
                  <p>- the Applicant shall not use the RTS System or any part thereof, other than in accordance with the product manufacturer's specifications, and covenants that any risk arising from misuse or / and misappropriation use shall be to the account of the Applicant alone.</p>
                </div>

                <p className="pl-2 pt-0.5 leading-tight font-bold">The Applicant represents ,warrants and covenants that:</p>
                <div className="pl-4 space-y-0.5 text-justify leading-tight">
                  <p>- all electrical and plumbing infrastructure at the Applicant Site are in conformity with applicable laws;</p>
                  <p>- the Applicant has the legal capacity to permit unfettered access to Vendor and its Authorized Persons for the purposes of execution and performance of this Agreement;</p>
                  <p>- the Applicant has and will provide requisite power, water and other requisite resources and storage facilities for construction, installation, operation and maintenance of the RTS System;</p>
                  <p>- the Applicant will provide support for site fabrication of structure, assembly and fitting of module mounting</p>
                </div>
              </div>

            </div>
          </div>

          {/* PAGE 3: Exact Screenshot Text */}
          <div className="model-agreement-page bg-white shadow-xl w-[210mm] min-h-[297mm] p-[10mm_12mm] text-slate-900 flex flex-col justify-between font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[9.5pt] leading-[1.18] text-justify">
            <div className="space-y-2 pt-0.5">
              
              {/* Top Continuation Line from Page 2 */}
              <div 
                className="space-y-1 text-[9.5pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <p className="text-justify leading-tight">
                  structure at Applicant Site;
                </p>
                <p className="text-justify leading-tight font-bold">
                  the Applicant will ensure that the Applicant Site is shadow free and free of all encumbrances during the lifetime of the RTS System;
                </p>
                <div className="pl-4 space-y-1 text-justify leading-tight">
                  <p>- Applicant should ensure that the Applicant regularly cleans and ensures accessibility and safety to the RTS System, as required by Vendor and dusting frequency in the premises.</p>
                  <p>- Vendor is entitled to permit geo-tagging of the Applicant Site as a Vendor installation site;</p>
                  <p>- Unless otherwise intimated by the Applicant in writing, Vendor is entitled to take photographs, videos and testimonials of the Applicant and the Applicant Site, and to create content which will become the property of Vendor and the same can be freely used by Vendor as par to fits promotional and marketing activities across all platform sasitdeems fit;</p>
                </div>
                <p className="text-justify leading-tight pt-0.5">
                  The Applicant validates the stability of the Applicant Site for the installation of the RTS System.
                </p>
              </div>

              {/* Section 5: 5.MAINTENANCE: */}
              <div 
                className="space-y-1 pt-0.5 text-[9.5pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.5pt]">5.MAINTENANCE:</div>
                <div className="pl-4 space-y-1 text-justify leading-tight">
                  <p>- Vendor shall provide five-year free workmanship maintenance. Vendor shall visit the Applicant's premises at least once every quarter after commissioning of the RTS System for maintenance purposes.</p>
                  <p>- During such maintenance visit, Vendor shall check all nuts and bolts, fuses, earth resistance and other consumables in respect of the RTS System to ensure that it is in good working condition.</p>
                  <p>- Cleaning requirement/expectation from the Applicant side-Applicant responsibility, minimum expectation from Applicant that it will be cleaned regularly as per the dusting frequency.</p>
                </div>
              </div>

              {/* Section 6: 6.ACCESS AND RIGHT OF ENTRY: */}
              <div 
                className="space-y-1 pt-0.5 text-[9.5pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.5pt]">6.ACCESS AND RIGHT OF ENTRY:</div>
                <div className="pl-4 space-y-0.5 text-justify leading-tight">
                  <p>- The Applicant hereby grants permission to Vendor and its authorized personnel, representatives, associates, officers, employees, financing agents, subcontractors (“Authorized Persons”)to enter the Applicant Site for the purposes of:</p>
                  <div className="pl-4 space-y-0.5 text-justify leading-tight">
                    <p>- Conducting feasibility study;</p>
                    <p>- Storing the RTS System/any part thereof;</p>
                    <p>- Installing the RTS System;</p>
                    <p>- inspecting the RTS System;</p>
                    <p>- conducting repairs and maintenance to the RTS System;</p>
                    <p>- removing the RTS System (or any part thereof), if necessary for any reason whatsoever;</p>
                  </div>
                </div>
                <p className="pl-2 leading-tight">
                  Such other matters as necessary to execute and perform its rights and obligations under this Agreement
                </p>
                <div className="pl-4 pt-0.5 space-y-0.5 text-justify leading-tight">
                  <p>- The Applicant shall ensure that third-party consents necessary for the Authorized Persons to access the Applicant Site are obtained prior to commencement of services under this Agreement.</p>
                </div>
              </div>

              {/* Section 7: 7.WARRANTIES: */}
              <div 
                className="space-y-1 pt-0.5 text-[9.5pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.5pt]">7.WARRANTIES:</div>
                <p className="text-justify leading-tight">
                  <span className="font-bold">Product Warranty:</span> The Applicant shall be entitled to manufacturers' warranty. Any warranty in relation to RTS System supplied to the Applicant by Vendor under this Agreement is limited to the warranty given by the manufacturer of the RTS System (or any part thereof) to Vendor
                </p>
                <p className="text-justify leading-tight">
                  <span className="font-bold">Installation Warranty:</span> Vendor warrants that all installations shall be free from workmanship defects or BOS defects for a period of five years from the date of installation of the RTS System. The warranty is limited to Vendor rectifying the workmanship or BOS defects at Vendor's expense in respect of those defects reported by the Applicant, in writing. The Applicant is obliged and liable to report such defects within 15 (fifteen) days of occurrence of such defect.
                </p>
                <p className="text-justify leading-tight">
                  Subject to manufacturer warranty, Vendor warrants that the solar modules supplied herein shall have tolerance within a five percentage range (+/-5%). The peak-power point voltage and the peak-power point current of any supplied solar module and/or any module string (series connected modules) shall not vary by more than 5% (five percent) from the respective arithmetic means for all modules and/or for all module strings, as the case may be ,provided
                </p>
                <p className="pl-4 text-justify leading-tight">
                  The RTS System is properly maintained and the Applicant Site is free from shadow at the time of operation of the RTS System.
                </p>
                <p className="text-justify leading-tight">
                  The Applicant shall ensure that third-party consents necessary for the Authorized Persons to access the Applicant Site are obtained prior to commencement of services under this Agreement.
                </p>
              </div>

            </div>
          </div>

          {/* PAGE 4: Exact Screenshot Text */}
          <div className="model-agreement-page bg-white shadow-xl w-[210mm] h-[297mm] max-h-[297mm] p-[10mm_12mm] text-slate-900 flex flex-col justify-between font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[9.5pt] leading-[1.18] text-justify overflow-hidden">
            <div className="space-y-2 pt-0.5">
              
              {/* Exceptions for warranty */}
              <div 
                className="space-y-1 text-[9.5pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.5pt]">Exceptions for warranty:</div>
                <div className="pl-4 space-y-1 text-justify leading-tight">
                  <p>- Any attempt by any person other than Vendor or its Authorised Persons to adjust, modify, repair or provide maintenance to the RTS System, shall disentitle the Applicant of the warranty provided by Vendor hereunder.</p>
                  <p>- Vendor shall not be liable for any degeneration or damage to the RTS System due to any action or inaction on the part of the Applicant.</p>
                  <p>- Vendor shall not be bound or liable to remedy any damage, fault, failure or malfunction of the RTS System owing to external causes, including but not limited to accidents, misuse, neglect, if usage and / or storage and/or installation are non-confirming to product instructions, modifications by the Applicant leading to shading or accessibility issues, failure to perform required maintenance, normal wear and tear, Force Majeure Event, or negligence or default attributable to the Applicant.</p>
                  <p>- Vendor shall not be liable to repair or remedy any accessories or parts added to the RTS System that were not originally sourced by Vendor to the Applicant.</p>
                </div>
              </div>

              {/* Section 8: 8.PERFORMANCE GUARANTEE */}
              <div 
                className="space-y-1 pt-0.5 text-[9.5pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.5pt]">8.PERFORMANCE GUARANTEE</div>
                <div className="pl-4 text-justify leading-tight">
                  <p>- Vendor guarantees minimum system performance ratio of 75% as per performance ratio test carried out in adherence to IEC 61724 or equivalent BIS for a period of five years.</p>
                </div>
              </div>

              {/* Section 9: 9.INSURANCE: */}
              <div 
                className="space-y-1 pt-0.5 text-[9.5pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.5pt]">9.INSURANCE:</div>
                <div className="pl-4 space-y-1 text-justify leading-tight">
                  <p>- Vendor may, at its sole discretion, obtain insurance covering risks of loss/damage to the RTS System (any part thereof) during transit from Vendor’s warehouse until delivery to the Applicant Site and until installation and commissioning.</p>
                  <p>- Thereafter, all risk shall pass on to the Applicant and the Applicant may accordingly procure relevant insurances.</p>
                </div>
              </div>

              {/* Section 10: 10. CANCELLATION: */}
              <div 
                className="space-y-1 pt-0.5 text-[9.5pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.5pt]">10. CANCELLATION:</div>
                <div className="pl-4 space-y-1 text-justify leading-tight">
                  <p>- The Applicant may cancel the order placed on Vendor within 7 (seven) days from the date of remittance of advance money or the date of order acceptance, whichever is earlier (“Order Confirmation”) by serving notice as per Clause13.</p>
                  <p>- If the Applicant cancels the order after the expiry of 7 (seven) days from the date of Order Form, the Applicant shall be liable to pay Vendor, a cancellation fee of XX% of the total order value plus costs and expenses incurred by Vendor, including, costs for labour ,design ,return of products, administrative costs, subvention costs.</p>
                </div>
                <p className="pl-4 pt-0.5 text-justify leading-tight">
                  Not with standing the a fore said, the Applicant shall not be entitled to cancel the Order For matter Vendor has dispatched the RTS System (or any part thereof, including BOS) to the Applicant Site. If Applicant chooses to terminate the Order Form after dispatch, the entire amount paid by the Applicant till date, shall be forfeited by Vendor.
                </p>
              </div>

              {/* Section 11: 11. LIMITATION OF LIABILITY AND INDEMNITY: */}
              <div 
                className="space-y-1 pt-0.5 text-[9.5pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.5pt]">11. LIMITATION OF LIABILITY AND INDEMNITY:</div>
                <div className="pl-4 space-y-1 text-justify leading-tight">
                  <p>- To the extent that terms implied by law apply to the RTS System and the services rendered under this Agreement, Vendor’s liability for any breach of those terms is limited to:</p>
                  <p>- Repairing or replacing the RTS System/any part thereof, as applicable; or</p>
                </div>
                <p className="text-justify leading-tight">
                  Refund of the moneys paid by the Applicant to Vendor, if Vendor cannot fulfill the order.
                </p>
              </div>

              {/* Section 12: 12. SUSPENSION AND TERMINATION: */}
              <div 
                className="space-y-1 pt-0.5 text-[9.5pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[9.5pt]">12. SUSPENSION AND TERMINATION:</div>
                <div className="pl-4 text-justify leading-tight">
                  <p>- If the Applicant fails to pay any sum due under this Agreement on the due date, Vendor may, in addition to its other rights under this Agreement, suspend its obligations under this Agreement until all outstanding amounts (including interest due) are paid.</p>
                </div>
                <p className="text-justify leading-tight font-bold pt-0.5">
                  NOTICES: Any notice or other communication under this Agreement to Vendor and or to the Applicant, shall be in writing, in English language and shall be delivered or sent: (a) by electronic mail and/or (b) by hand delivery or registered post/courier, at the registered address of Applicant/Vendor.
                </p>
              </div>

            </div>
          </div>

          {/* PAGE 5: Exact Screenshot Text & Signatures */}
          <div className="model-agreement-page bg-white shadow-xl w-[210mm] h-[297mm] max-h-[297mm] p-[12mm_14mm] text-slate-900 flex flex-col justify-between font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[10pt] leading-[1.2] text-justify overflow-hidden">
            <div className="space-y-3.5 pt-1">
              
              {/* Section 13: 13. SUSPENSIONANDTERMINATION: */}
              <div 
                className="space-y-1 text-[10pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[10pt]">13. SUSPENSIONANDTERMINATION:</div>
                <div className="pl-4 space-y-1 text-justify leading-snug">
                  <p>- If the Applicant fails to pay any sum due under this Agreement on the due date, Vendor may, in addition to its other rights under this Agreement, suspend its obligations under this Agreement until all outstanding amounts (including interest due) are paid.</p>
                  <p>- <span className="font-bold">NOTICES:</span> Any notice or other communication under this Agreement to Vendor and or to the Applicant, shall be in writing, in English language and shall be delivered or sent: (a) by electronic mail and/or (b) by hand delivery or registered post/courier, at the registered address of Applicant/Vendor.</p>
                </div>
              </div>

              {/* Section 14: 14. FORCE MAJEURE EVENT: */}
              <div 
                className="space-y-1 text-[10pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[10pt]">14. FORCE MAJEURE EVENT:</div>
                <div className="pl-4 space-y-1 text-justify leading-snug">
                  <p>- Neither Party shall be in default due to any delay or failure to perform its/his/her/their obligations under this Agreement which arises from or is a consequence of occurrence of an event which is beyond the reasonable control of such Party, and which makes performance of its/ his/ her/ their obligations under this Agreement impossible or so impractical as reasonably to be considered impossible in the circumstances, and includes, but is not limited to, war, riot, civil disorder, earthquake, fire, explosion, storm, flood or other adverse weather conditions, pandemic, epidemic, embargo, strikes, lockouts, labour difficulties ,other industrial action, acts of government, unavailability of equipment from vendor, changes requested by the Applicant (“Force Majeure Event”).</p>
                  <p>- <span className="font-bold">NOTICES:</span> Any notice or other communication under this Agreement to Vendor and or to the Applicant, shall be in writing, in English language and shall be delivered or sent: (a) by electronic mail and/or (b) by hand delivery or registered post/courier, at the registered address of Applicant/Vendor.</p>
                </div>
              </div>

              {/* Section 15: 15. FORCEMAJEUREEVENT: */}
              <div 
                className="space-y-1 text-[10pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[10pt]">15. FORCEMAJEUREEVENT:</div>
                <div className="pl-4 text-justify leading-snug">
                  <p>- Neither Party shall be in default due to any delay or failure to perform its/his/her/their obligations under this Agreement which arises from or is a consequence of occurrence of an event which is beyond the reasonable control of such Party, and which makes performance of its/his/her/ their obligations under this Agreement impossible or so impractical as reasonably to be considered impossible in the circumstances, and includes, but is not limited to, war, riot, civil disorder, earthquake, fire, explosion, storm, flood or other adverse weather conditions, pandemic, epidemic, embargo, strikes, lockouts, labor difficulties, other industrial action, acts of government, unavailability of equipment from vendor, changes requested by the Applicant (“Force Majeure Event”).</p>
                </div>
              </div>

              {/* Section 16: 16. GOVERNING LAW AND DISPUTE RESOLUTION: */}
              <div 
                className="space-y-1 text-[10pt] text-justify font-serif"
                contentEditable={isEditable}
                suppressContentEditableWarning={true}
              >
                <div className="font-bold text-[10pt]">16. GOVERNING LAW AND DISPUTE RESOLUTION:</div>
                <div className="pl-4 space-y-1 text-justify leading-snug">
                  <p>- The interpretation and enforcement of this Agreement shall be governed by the laws of India</p>
                  <p>- In the event of any dispute, controversy or difference between the Parties arising out of, or relating to this Agreement (“Dispute”), both Parties shall make an effort to resolve the Dispute in good faith, failing which, any Party to the Dispute shall be entitled to refer the Dispute to arbitration to resolve the Dispute in the manner set out in this Clause. The rights and obligations of the Parties under this Agreement shall remain in full force and effect pending the award in such arbitration proceeding.</p>
                  <p>- The arbitration proceeding shall be governed by the provisions of the Arbitration and Conciliation Act, 1996 and shall be settled by a sole arbitrator mutually appointed by the Parties.</p>
                </div>
              </div>

              {/* Signatures & Witness Block at Bottom */}
              <div className="pt-8 space-y-8 text-[10.5pt] font-serif">
                
                <div className="flex justify-between items-end">
                  {/* Left: Applicant Signature */}
                  <div className="relative text-[10.5pt] font-bold text-left w-64 font-serif">
                    {consumerSignatureUrl ? (
                      <div className="absolute -top-14 left-2 w-32 h-14 select-none pointer-events-none">
                        <img
                          src={consumerSignatureUrl}
                          alt="Applicant Signature"
                          className="w-full h-full object-contain mix-blend-multiply"
                        />
                      </div>
                    ) : (
                      <div className="h-10"></div>
                    )}
                    <div className="pt-1 text-slate-900 font-bold">
                      {consumerName}
                    </div>
                    <div className="text-xs font-semibold text-slate-700 pt-0.5">
                      (Applicant)
                    </div>
                  </div>

                  {/* Right: Vendor Signature */}
                  <div className="relative text-[10.5pt] font-bold text-right w-64 font-serif flex flex-col items-end">
                    {vendorSignatureUrl ? (
                      <div className="absolute -top-14 right-2 w-32 h-14 select-none pointer-events-none">
                        <img
                          src={vendorSignatureUrl}
                          alt="Vendor Signature"
                          className="w-full h-full object-contain mix-blend-multiply"
                        />
                      </div>
                    ) : (
                      <div className="h-10"></div>
                    )}
                    <div className="pt-1 text-slate-900 font-bold text-right">
                      {companyName}
                    </div>
                    <div className="text-xs font-semibold text-slate-700 pt-0.5 text-right">
                      (Vendor)
                    </div>
                  </div>
                </div>

                {/* Witness Section */}
                <div className="pt-4 space-y-2 text-xs font-serif">
                  <div className="font-bold text-slate-900">Witness</div>
                  <div className="pl-2 space-y-2">
                    <p className="text-slate-800">1. ............................................................................................................................</p>
                    <p className="text-slate-800">2. ............................................................................................................................</p>
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
