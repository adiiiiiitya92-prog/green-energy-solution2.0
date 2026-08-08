import React, { useEffect, useState, useRef } from 'react';
import { leadService, filterLeadsForUser } from '../../services/leadService';
import { orderService } from '../../services/orderService';
import { useAuthStore } from '../../store/authStore';
import type { Lead } from '../../types';
import {
  FileText,
  Printer,
  RotateCcw,
  User,
  Building,
  Sun,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  CheckCircle2,
  Edit3,
  Save
} from 'lucide-react';
import dayjs from 'dayjs';
import { generateOptimizedPDF } from '../../services/pdfOptimizationService';

export const DcrDocument: React.FC<{
  defaultLeadId?: string;
  isEmbedded?: boolean;
  initialData?: any;
  onSaveSuccess?: () => void;
}> = ({ defaultLeadId, isEmbedded, initialData, onSaveSuccess }) => {
  const printContainerRef = useRef<HTMLDivElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');

  // Form Fields
  const [companyName, setCompanyName] = useState('Green Energy Solution');
  const [capacity, setCapacity] = useState('10');
  const [consumerName, setConsumerName] = useState('');
  const [address, setAddress] = useState('');
  const [appNumber, setAppNumber] = useState('');
  const [appDate, setAppDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [discomName, setDiscomName] = useState('Dakshin Haryana Bijli Vitran Nigam (DHBVN)');

  // Module specs
  const [pvCapacity, setPvCapacity] = useState('540');
  const [pvCount, setPvCount] = useState('18');
  const [pvSerialNumbers, setPvSerialNumbers] = useState('ASC/2026/001 to ASC/2026/018');
  const [pvMake, setPvMake] = useState('Waaree Energies Ltd');
  const [cellManufacturer, setCellManufacturer] = useState('Waaree Energies Ltd');
  const [cellGstInvoice, setCellGstInvoice] = useState('GST/WR/2026/9981');

  // Rep details
  const [repName, setRepName] = useState('Rajesh Sharma');
  const [repDesignation, setRepDesignation] = useState('Project Manager');
  const [repPhone, setRepPhone] = useState('9876543210');
  const [repEmail, setRepEmail] = useState('projects@greenenergysolution.com');

  // Signature state
  const [signatureDataUrl, setSignatureDataUrl] = useState('');

  // Sections collapse/expand state
  const [expandedSection, setExpandedSection] = useState<string>('lead');
  const [isEditable, setIsEditable] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mobileTab, setMobileTab] = useState<'form' | 'preview'>('form');

  // Canvas ref for signature pad
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

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
        setConsumerName(lead.name);
        const capMatch = lead.requirement.match(/(\d+(\.\d+)?)\s*(kw|kwp)/i);
        if (capMatch) {
          setCapacity(capMatch[1]);
          const capKw = parseFloat(capMatch[1]);
          if (!isNaN(capKw)) {
            const defaultCount = Math.ceil((capKw * 1000) / 540);
            setPvCount(String(defaultCount));
            setPvSerialNumbers(`ASC/${dayjs().format('YYYY')}/001 to ASC/${dayjs().format('YYYY')}/${String(defaultCount).padStart(3, '0')}`);
          }
        }
        setAddress(lead.description || 'Site address as per registration records');
        setAppNumber('APP-' + lead.id.replace('lead_', '').toUpperCase());
        setAppDate(dayjs(lead.createdAt).format('YYYY-MM-DD'));
      }
    }
  }, [leads, defaultLeadId]);

  useEffect(() => {
    if (initialData) {
      if (initialData.companyName) setCompanyName(initialData.companyName);
      if (initialData.capacity) setCapacity(initialData.capacity);
      if (initialData.consumerName) setConsumerName(initialData.consumerName);
      if (initialData.address) setAddress(initialData.address);
      if (initialData.appNumber) setAppNumber(initialData.appNumber);
      if (initialData.appDate) setAppDate(initialData.appDate);
      if (initialData.discomName) setDiscomName(initialData.discomName);
      if (initialData.pvCapacity) setPvCapacity(initialData.pvCapacity);
      if (initialData.pvCount) setPvCount(initialData.pvCount);
      if (initialData.pvSerialNumbers) setPvSerialNumbers(initialData.pvSerialNumbers);
      if (initialData.pvMake) setPvMake(initialData.pvMake);
      if (initialData.cellManufacturer) setCellManufacturer(initialData.cellManufacturer);
      if (initialData.cellGstInvoice) setCellGstInvoice(initialData.cellGstInvoice);
      if (initialData.repName) setRepName(initialData.repName);
      if (initialData.repDesignation) setRepDesignation(initialData.repDesignation);
      if (initialData.repPhone) setRepPhone(initialData.repPhone);
      if (initialData.repEmail) setRepEmail(initialData.repEmail);
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
        companyName,
        capacity,
        consumerName,
        address,
        appNumber,
        appDate,
        discomName,
        pvCapacity,
        pvCount,
        pvSerialNumbers,
        pvMake,
        cellManufacturer,
        cellGstInvoice,
        repName,
        repDesignation,
        repPhone,
        repEmail
      };

      let pdfUrl = '';
      if (printContainerRef.current) {
        const res = await generateOptimizedPDF(printContainerRef.current, {
          uploadToFirebase: true,
          firebasePath: `documents/${targetLeadId}/dcr_certificate_${Date.now()}.pdf`
        });
        if (res.pdfUrl) pdfUrl = res.pdfUrl;
      }

      if (!pdfUrl) {
        throw new Error('PDF upload to Backblaze B2 failed.');
      }

      await orderService.uploadClientDocument({
        leadId: targetLeadId,
        docType: 'dcr_certificate',
        fileBlob: pdfUrl,
        uploadedBy: 'Admin',
        formData
      });

      alert('✅ DCR Certificate PDF saved & uploaded to Backblaze B2!');
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      console.error('Error saving DCR document:', err);
      alert(`❌ Failed to upload DCR Certificate PDF to Backblaze B2: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Autofill form when lead changes
  const handleLeadChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const leadId = e.target.value;
    setSelectedLeadId(leadId);
    if (!leadId) return;

    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      setConsumerName(lead.name);
      
      // Auto-extract capacity from lead requirement if possible
      const capMatch = lead.requirement.match(/(\d+(\.\d+)?)\s*(kw|kwp)/i);
      if (capMatch) {
        setCapacity(capMatch[1]);
        // Also calculate a default PV module count based on 540Wp modules
        const capKw = parseFloat(capMatch[1]);
        if (!isNaN(capKw)) {
          const defaultCount = Math.ceil((capKw * 1000) / 540);
          setPvCount(String(defaultCount));
          setPvSerialNumbers(`ASC/${dayjs().format('YYYY')}/001 to ASC/${dayjs().format('YYYY')}/${String(defaultCount).padStart(3, '0')}`);
        }
      }
      
      // Try to construct address or clean descriptions
      setAddress(lead.description || 'Site address as per registration records');
      setAppNumber('APP-' + lead.id.replace('lead_', '').toUpperCase());
      setAppDate(dayjs(lead.createdAt).format('YYYY-MM-DD'));
    }
  };

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a'; // Slate-900 / dark blue
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
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

  // Touch handlers for mobile
  const startTouchDrawing = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl('');
  };

  const saveCanvasImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSignatureDataUrl(canvas.toDataURL('image/png'));
  };

  const handlePrint = () => {
    const dcrElement = document.querySelector('.dcr-page');
    if (!dcrElement) {
      window.print();
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const htmlContent = dcrElement.innerHTML;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>DCR Undertaking Certificate - ${consumerName || 'Solar Project'}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page {
              size: A4 portrait;
              margin: 0 !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #0f172a !important;
              font-family: Georgia, Cambria, "Times New Roman", Times, serif !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .dcr-print-container {
              width: 210mm;
              height: 297mm;
              max-height: 297mm;
              padding: 10mm 14mm;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden;
              page-break-after: avoid !important;
              page-break-inside: avoid !important;
            }
            .border-dotted {
              border-bottom-style: dotted !important;
            }
          </style>
        </head>
        <body>
          <div class="dcr-print-container">
            ${htmlContent}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 350);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const resetForm = () => {
    if (confirm('Are you sure you want to reset all DCR details to defaults?')) {
      setSelectedLeadId('');
      setCompanyName('Green Energy Solution');
      setCapacity('10');
      setConsumerName('');
      setAddress('');
      setAppNumber('');
      setAppDate(dayjs().format('YYYY-MM-DD'));
      setDiscomName('Dakshin Haryana Bijli Vitran Nigam (DHBVN)');
      setPvCapacity('540');
      setPvCount('18');
      setPvSerialNumbers('ASC/2026/001 to ASC/2026/018');
      setPvMake('Waaree Energies Ltd');
      setCellManufacturer('Waaree Energies Ltd');
      setCellGstInvoice('GST/WR/2026/9981');
      setRepName('Rajesh Sharma');
      setRepDesignation('Project Manager');
      setRepPhone('9876543210');
      setRepEmail('projects@greenenergysolution.com');
      clearSignature();
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? '' : section);
  };

  return (
    <div className={isEmbedded ? "h-[680px] max-h-[85vh] bg-slate-50 flex flex-col border border-slate-200 rounded-xl overflow-hidden shadow-xs relative" : "h-[calc(100vh-80px)] bg-slate-50 flex flex-col -mx-4 -my-6 md:-mx-8 md:-my-8 relative overflow-hidden"}>
      {/* Styles for print layout overrides */}
      <style dangerouslySetInnerHTML={{ __html: `
        .dcr-page {
          font-family: Georgia, Cambria, "Times New Roman", Times, serif !important;
          print-color-adjust: exact !important;
          -webkit-print-color-adjust: exact !important;
        }

        @page {
          size: A4 portrait;
          margin: 0 !important;
        }

        @media print {
          /* Style the A4 print container to print cleanly and match preview exactly */
          .dcr-page {
            width: 210mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 auto !important;
            padding: 10mm 14mm !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            box-sizing: border-box !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
            overflow: hidden !important;
          }

          .dcr-page:last-child {
            page-break-after: avoid !important;
          }

          /* Prevent signature panel from splitting across pages */
          .dcr-page .pt-4,
          .dcr-page .space-y-1,
          .dcr-page .max-w-sm {
            page-break-inside: avoid !important;
          }
        }

        @media screen and (max-width: 640px) {
          .dcr-page {
            transform: scale(0.44) !important;
            transform-origin: top center !important;
            margin-bottom: -155mm !important;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1) !important;
          }
        }
        @media screen and (min-width: 641px) and (max-width: 1024px) {
          .dcr-page {
            transform: scale(0.70) !important;
            transform-origin: top center !important;
            margin-bottom: -80mm !important;
          }
        }
      `}} />

      {/* Header bar */}
      {!isEmbedded && (
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 select-none dcr-header-bar shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="bg-emerald-100 text-emerald-800 p-2 rounded-lg">
              <FileText className="w-5 h-5 text-emerald-650" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-800 tracking-tight">DCR Undertaking Certificate Generator</h1>
              <p className="text-xs text-slate-400 font-medium">Generate domestic solar module content undertakings for MNRE/DISCOMs</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={resetForm}
              className="flex items-center space-x-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Fields</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>
      )}

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
                <Edit3 className="w-4 h-4 text-emerald-655" />
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Direct Page Editor</h4>
                  <p className="text-[9px] text-slate-400 font-medium">Click and type on preview to edit any text</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                {/* Collapse Sidebar Button */}
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(true)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Edit Mode Toggle Switch */}
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
            
            {isEmbedded && (
              <div className="flex items-center space-x-2 pt-2 border-t border-emerald-100/50">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 flex items-center justify-center space-x-1 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 text-[10px] font-bold transition-colors cursor-pointer bg-white"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveDocument}
                  className="flex-1 flex items-center justify-center space-x-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-[10px] font-black shadow-sm transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Saving PDF...' : 'Save Document'}</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex-1 flex items-center justify-center space-x-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-extrabold shadow-sm transition-colors cursor-pointer"
                >
                  <Printer className="w-3 h-3" />
                  <span>Print PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* Lead Selection and Autofill */}
          {!isEmbedded && (
            <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs">
              <button
                onClick={() => toggleSection('lead')}
                className="w-full bg-slate-50 px-4 py-3 flex items-center justify-between font-bold text-xs text-slate-700 hover:bg-slate-100/70 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Autofill from CRM Lead</span>
                </div>
                {expandedSection === 'lead' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expandedSection === 'lead' && (
                <div className="p-4 bg-white border-t border-slate-100 space-y-3">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Select Active Lead</label>
                  <select
                    value={selectedLeadId}
                    onChange={handleLeadChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="">-- Choose Lead (Autofill) --</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        👤 {l.name} ({l.requirement})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Selecting a lead automatically fills Consumer Name, Address, Capacity, App Number, and dates.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Section 2: Company / Installer Details */}
          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('company')}
              className="w-full bg-slate-50 px-4 py-3 flex items-center justify-between font-bold text-xs text-slate-700 hover:bg-slate-100/70 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Building className="w-4 h-4 text-emerald-600" />
                <span>Installer (M/S) Details</span>
              </div>
              {expandedSection === 'company' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'company' && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-3.5">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Company Name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="Enter company name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Representative Name</label>
                  <input
                    type="text"
                    value={repName}
                    onChange={(e) => setRepName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="Representative Name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Designation</label>
                  <input
                    type="text"
                    value={repDesignation}
                    onChange={(e) => setRepDesignation(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="Designation"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Phone</label>
                    <input
                      type="text"
                      value={repPhone}
                      onChange={(e) => setRepPhone(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder="Phone"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Email</label>
                    <input
                      type="text"
                      value={repEmail}
                      onChange={(e) => setRepEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder="Email"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Consumer & Project Details */}
          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('project')}
              className="w-full bg-slate-50 px-4 py-3 flex items-center justify-between font-bold text-xs text-slate-700 hover:bg-slate-100/70 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-emerald-600" />
                <span>Consumer & Project details</span>
              </div>
              {expandedSection === 'project' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'project' && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-3.5">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Consumer Name</label>
                  <input
                    type="text"
                    value={consumerName}
                    onChange={(e) => setConsumerName(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="e.g. Ramesh Chandra"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Plant Capacity (kW)</label>
                    <input
                      type="text"
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder="Capacity in kW"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">DISCOM Name</label>
                    <input
                      type="text"
                      value={discomName}
                      onChange={(e) => setDiscomName(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder="DISCOM Name"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Installation Site Address</label>
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                    placeholder="Installation Address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Application Number</label>
                    <input
                      type="text"
                      value={appNumber}
                      onChange={(e) => setAppNumber(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder="e.g. AP-99281-22"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Application Date</label>
                    <input
                      type="date"
                      value={appDate}
                      onChange={(e) => setAppDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Solar Module (PV) Specs */}
          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('pv')}
              className="w-full bg-slate-50 px-4 py-3 flex items-center justify-between font-bold text-xs text-slate-700 hover:bg-slate-100/70 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Sun className="w-4 h-4 text-emerald-600" />
                <span>PV Module & Cell Specs</span>
              </div>
              {expandedSection === 'pv' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'pv' && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-3.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Module Capacity (Wp)</label>
                    <input
                      type="text"
                      value={pvCapacity}
                      onChange={(e) => setPvCapacity(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder="e.g. 540"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase">Number of Modules</label>
                    <input
                      type="text"
                      value={pvCount}
                      onChange={(e) => setPvCount(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder="e.g. 18"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">PV Module Make / Brand</label>
                  <input
                    type="text"
                    value={pvMake}
                    onChange={(e) => setPvMake(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="e.g. Waaree, Adani"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">PV Module Serial Numbers</label>
                  <textarea
                    rows={2}
                    value={pvSerialNumbers}
                    onChange={(e) => setPvSerialNumbers(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                    placeholder="Serial Numbers list"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Solar Cell Manufacturer</label>
                  <input
                    type="text"
                    value={cellManufacturer}
                    onChange={(e) => setCellManufacturer(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="Cell Manufacturer"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Cell GST Invoice No.</label>
                  <input
                    type="text"
                    value={cellGstInvoice}
                    onChange={(e) => setCellGstInvoice(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="GST Invoice details"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Signature & Official Seal Pad */}
          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection('signature')}
              className="w-full bg-slate-50 px-4 py-3 flex items-center justify-between font-bold text-xs text-slate-700 hover:bg-slate-100/70 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <FileSignature className="w-4 h-4 text-emerald-600" />
                <span>Signature & Seal Stamp</span>
              </div>
              {expandedSection === 'signature' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSection === 'signature' && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-3">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Draw Signature Below</label>
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="text-[10px] text-rose-500 hover:text-rose-600 font-bold transition-colors cursor-pointer"
                  >
                    Clear Canvas
                  </button>
                </div>
                
                <div className="border border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-50 h-28 relative">
                  <canvas
                    ref={canvasRef}
                    width={320}
                    height={112}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startTouchDrawing}
                    onTouchMove={drawTouch}
                    onTouchEnd={stopDrawing}
                    className="w-full h-full cursor-crosshair bg-slate-50 touch-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Helper function to render fields conditionally without doubling dots */}
        {(() => {
          const renderUnderlinedField = (value: string | null | undefined, placeholder: string, minWidthClass: string = 'min-w-[150px]', textAlignment: string = 'text-center') => {
            const isFilled = !!value;
            return (
              <span className={`font-bold px-1.5 ${minWidthClass} inline-block ${textAlignment} ${isFilled ? 'border-b border-dotted border-black' : ''}`}>
                {value || placeholder}
              </span>
            );
          };

          return (
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
              
              {/* PAGE 1: Copy 1 (Complete) */}
              <div className="dcr-page bg-white shadow-xl w-[210mm] h-[297mm] p-[12mm_16mm] text-slate-800 flex flex-col justify-between font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[12.5px] leading-normal">
                <div className="space-y-3">
                  <div 
                    className="text-center font-bold text-base leading-snug underline uppercase font-serif"
                    contentEditable={isEditable}
                    suppressContentEditableWarning={true}
                  >
                    Undertaking/Self- Declaration for Domestic Content Requirement fulfillment
                  </div>
                  <div 
                    className="text-center font-semibold text-xs italic font-serif"
                    contentEditable={isEditable}
                    suppressContentEditableWarning={true}
                  >
                    (On a plain Paper)
                  </div>

                  {/* Numbered List Structure */}
                  <div 
                    className="space-y-2.5 pt-2 text-[12.5px] text-slate-900 font-serif"
                    contentEditable={isEditable}
                    suppressContentEditableWarning={true}
                  >
                    <div className="flex items-start">
                      <span className="mr-1.5 font-bold">1.</span>
                      <p className="text-justify leading-snug">
                        This is to certify that M/S {renderUnderlinedField(companyName, '....................................................', 'min-w-[200px]')} [Company Name] has
                        Installed {renderUnderlinedField(capacity, '..................', 'min-w-[80px]')}KW [Capacity] Grid Connected Rooftop Solar Plant
                        for {renderUnderlinedField(consumerName, '....................................................', 'min-w-[250px]')} [Consumer Name] at
                        {renderUnderlinedField(address, '................................................................................', 'min-w-[320px]', 'text-justify')} [Address] under application
                        number {renderUnderlinedField(appNumber, '..................', 'min-w-[150px]')} date {renderUnderlinedField(appDate ? dayjs(appDate).format('DD/MM/YYYY') : null, '..................', 'min-w-[100px]')} [date of application] under
                        {renderUnderlinedField(discomName, '....................................................', 'min-w-[220px]')} [DISCOM Name].
                      </p>
                    </div>

                    <div className="flex items-start">
                      <span className="mr-1.5 font-bold">2.</span>
                      <div className="space-y-1.5 flex-1">
                        <p className="text-justify leading-snug">
                          It is hereby undertaken that the PV modules installed for the above-mentioned project are domestically manufactured using domestic manufactured solar cells. The details of installed PV Modules are follows:
                        </p>
                        <div className="pl-6 space-y-1">
                          <div>
                            1. PV Module Capacity: {renderUnderlinedField(pvCapacity ? `${pvCapacity} Wp` : null, '..................', 'min-w-[120px]', 'text-left')}
                          </div>
                          <div>
                            2. Number of PV Modules: {renderUnderlinedField(pvCount ? `${pvCount} Nos` : null, '..................', 'min-w-[120px]', 'text-left')}
                          </div>
                          <div className="flex items-start">
                            <span className="mr-1.5">3.</span>
                            <div className="flex-1">
                              <span>Sr No of PV Module:</span>
                              {renderUnderlinedField(pvSerialNumbers, '................................................................................', 'min-w-[250px] ml-1', 'text-left')}
                            </div>
                          </div>
                          
                          <div>
                            4. PV Module Make: {renderUnderlinedField(pvMake, '....................................................', 'min-w-[200px]', 'text-left')}
                          </div>
                          <div>
                            5. Cell manufacturer’s name: {renderUnderlinedField(cellManufacturer, '....................................................', 'min-w-[200px]', 'text-left')}
                          </div>
                          <div>
                            6. Cell GST invoice No: {renderUnderlinedField(cellGstInvoice, '....................................................', 'min-w-[200px]', 'text-left')}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <span className="mr-1.5 font-bold">3.</span>
                      <p className="text-justify leading-snug">
                        The above undertaking is based on the certificate issued by PV Module manufacturer/supplier while supplying the above mentioned order.
                      </p>
                    </div>

                    <div className="flex items-start">
                      <span className="mr-1.5 font-bold">4.</span>
                      <p className="text-justify leading-snug">
                        I, {renderUnderlinedField(repName, '....................................................', 'min-w-[150px]')} on behalf of M/S {renderUnderlinedField(companyName, '....................................................', 'min-w-[200px]')} [Company Name] further declare that the information given above is true and correct and nothing has been concealed therein. If anything is found incorrect at any stage, then REC/ MNRE may take any appropriate action against my company for wrong declaration. Supporting documents and proof of the above information will be provided as and when requested by MNRE.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottom Footer Section */}
                <div className="pt-2 flex justify-between items-end">
                  {/* Spacer */}
                  <div className="w-20"></div>

                  {/* Signature Info Panel */}
                  <div 
                    className="space-y-0.5 text-[12.5px] max-w-sm text-slate-950 w-80 font-serif"
                    contentEditable={isEditable}
                    suppressContentEditableWarning={true}
                  >
                    <div className="flex flex-col items-center justify-end h-14 mb-1">
                      {signatureDataUrl ? (
                        <div className="w-36 h-12 select-none pointer-events-none">
                          <img
                            src={signatureDataUrl}
                            alt="Representative Signature"
                            className="w-full h-full object-contain mix-blend-multiply"
                          />
                        </div>
                      ) : (
                        <div className="h-6"></div>
                      )}
                    </div>

                    <div className="font-bold text-center mb-2 italic text-xs">
                      (Signature With official Seal)
                    </div>
                    <div className="font-bold">
                      For M/S {renderUnderlinedField(companyName, '....................................................', 'min-w-[180px]', 'text-left')}
                    </div>
                    <div>
                      Name: {renderUnderlinedField(repName, '....................................................', 'min-w-[180px]', 'text-left')}
                    </div>
                    <div>
                      Designation: {renderUnderlinedField(repDesignation, '....................................................', 'min-w-[180px]', 'text-left')}
                    </div>
                    <div>
                      Phone: {renderUnderlinedField(repPhone, '....................................................', 'min-w-[180px]', 'text-left')}
                    </div>
                    <div>
                      Email: {renderUnderlinedField(repEmail, '....................................................', 'min-w-[180px]', 'text-left')}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          );
        })()}

        </div>
      </div>
  );
};
