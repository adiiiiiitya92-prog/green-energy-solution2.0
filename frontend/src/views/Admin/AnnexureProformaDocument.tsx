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
  ChevronRight,
  Sliders,
  User,
  Zap,
  Sun,
  FileCheck,
  Save
} from 'lucide-react';
import dayjs from 'dayjs';
import { generateOptimizedPDF } from '../../services/pdfOptimizationService';

export const AnnexureProformaDocument: React.FC<{
  defaultLeadId?: string;
  isEmbedded?: boolean;
  initialData?: any;
  onSaveSuccess?: () => void;
}> = ({ defaultLeadId, isEmbedded, initialData, onSaveSuccess }) => {
  const printContainerRef = useRef<HTMLDivElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');

  // Particulars Fields
  const [consumerName, setConsumerName] = useState('SHRI SANDIP RAMAJI LAHAMGE');
  const [consumerNumber, setConsumerNumber] = useState('396013606014');
  const [mobileNumber, setMobileNumber] = useState('9876543210');
  const [email, setEmail] = useState('consumer@example.com');
  const [address, setAddress] = useState('SUYOG NAGAR NAGAPUR 440027');
  const [reArrangementType, setReArrangementType] = useState('Net Metering Arrangement');
  const [reSource, setReSource] = useState('Solar PV');
  const [sanctionedCapacity, setSanctionedCapacity] = useState('5.0');
  const [capacityType, setCapacityType] = useState('Rooftop');
  const [projectModel, setProjectModel] = useState('CAPEX');
  const [reCapacityRooftop, setReCapacityRooftop] = useState('5.0');
  const [reCapacityRooftopGround, setReCapacityRooftopGround] = useState('0.0');
  const [reCapacityGround, setReCapacityGround] = useState('0.0');
  const [installationDate, setInstallationDate] = useState(dayjs().format('DD/MM/YYYY'));

  // Solar PV Details
  const [inverterCapacity, setInverterCapacity] = useState('5.0');
  const [inverterMake, setInverterMake] = useState('UTL / WAAREE');
  const [noOfPvModules, setNoOfPvModules] = useState('10');
  const [moduleCapacity, setModuleCapacity] = useState('0.550');

  // Proforma-A & Page 2 Details
  const [district, setDistrict] = useState('NAGPUR');
  const [installedBy, setInstalledBy] = useState('M/S GREEN ENERGY SOLUTION');
  const [spvCapacityKwp, setSpvCapacityKwp] = useState('5.0');
  const [preCommissioningDate, setPreCommissioningDate] = useState(dayjs().format('DD/MM/YYYY'));

  // UI state
  const [expandedSection, setExpandedSection] = useState<string>('consumer');
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

  useEffect(() => {
    if (leads.length > 0 && defaultLeadId) {
      setSelectedLeadId(defaultLeadId);
      const lead = leads.find((l) => l.id === defaultLeadId);
      if (lead) {
        setConsumerName(lead.name);
        setMobileNumber(lead.phoneNumber || '9876543210');
        setEmail(lead.email || 'consumer@example.com');
        setAddress(lead.description || 'Nagpur, Maharashtra');

        const capMatch = lead.requirement.match(/(\d+(\.\d+)?)\s*(kw|kwp)/i);
        if (capMatch) {
          setSanctionedCapacity(capMatch[1]);
          setReCapacityRooftop(capMatch[1]);
          setInverterCapacity(capMatch[1]);
          setSpvCapacityKwp(capMatch[1]);
        }
      }
    }
  }, [leads, defaultLeadId]);

  useEffect(() => {
    if (initialData) {
      if (initialData.consumerName) setConsumerName(initialData.consumerName);
      if (initialData.consumerNumber) setConsumerNumber(initialData.consumerNumber);
      if (initialData.mobileNumber) setMobileNumber(initialData.mobileNumber);
      if (initialData.email) setEmail(initialData.email);
      if (initialData.address) setAddress(initialData.address);
      if (initialData.reArrangementType) setReArrangementType(initialData.reArrangementType);
      if (initialData.reSource) setReSource(initialData.reSource);
      if (initialData.sanctionedCapacity) setSanctionedCapacity(initialData.sanctionedCapacity);
      if (initialData.capacityType) setCapacityType(initialData.capacityType);
      if (initialData.projectModel) setProjectModel(initialData.projectModel);
      if (initialData.reCapacityRooftop) setReCapacityRooftop(initialData.reCapacityRooftop);
      if (initialData.reCapacityRooftopGround) setReCapacityRooftopGround(initialData.reCapacityRooftopGround);
      if (initialData.reCapacityGround) setReCapacityGround(initialData.reCapacityGround);
      if (initialData.installationDate) setInstallationDate(initialData.installationDate);
      if (initialData.inverterCapacity) setInverterCapacity(initialData.inverterCapacity);
      if (initialData.inverterMake) setInverterMake(initialData.inverterMake);
      if (initialData.noOfPvModules) setNoOfPvModules(initialData.noOfPvModules);
      if (initialData.moduleCapacity) setModuleCapacity(initialData.moduleCapacity);
      if (initialData.district) setDistrict(initialData.district);
      if (initialData.installedBy) setInstalledBy(initialData.installedBy);
      if (initialData.spvCapacityKwp) setSpvCapacityKwp(initialData.spvCapacityKwp);
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
        consumerName,
        consumerNumber,
        mobileNumber,
        email,
        address,
        reArrangementType,
        reSource,
        sanctionedCapacity,
        capacityType,
        projectModel,
        reCapacityRooftop,
        reCapacityRooftopGround,
        reCapacityGround,
        installationDate,
        inverterCapacity,
        inverterMake,
        noOfPvModules,
        moduleCapacity,
        district,
        installedBy,
        spvCapacityKwp
      };

      let pdfUrl = '';
      if (printContainerRef.current) {
        const res = await generateOptimizedPDF(printContainerRef.current, {
          uploadToFirebase: true,
          firebasePath: `documents/${targetLeadId}/annexure_proforma_${Date.now()}.pdf`
        });
        if (res.pdfUrl) pdfUrl = res.pdfUrl;
      }

      if (!pdfUrl) {
        throw new Error('PDF upload to Backblaze B2 failed.');
      }

      await orderService.uploadClientDocument({
        leadId: targetLeadId,
        docType: 'annexure_proforma',
        fileBlob: pdfUrl,
        uploadedBy: 'Admin',
        formData
      });

      alert('✅ Annexure Proforma PDF saved & uploaded to Backblaze B2!');
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      console.error('Error saving Annexure Proforma:', err);
      alert(`❌ Failed to upload Annexure Proforma PDF to Backblaze B2: ${err.message || err}`);
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
      setConsumerName(lead.name);
      setMobileNumber(lead.phoneNumber || '');
      setEmail(lead.email || '');
      setAddress(lead.description || '');

      const capMatch = lead.requirement.match(/(\d+(\.\d+)?)\s*(kw|kwp)/i);
      if (capMatch) {
        setSanctionedCapacity(capMatch[1]);
        setReCapacityRooftop(capMatch[1]);
        setInverterCapacity(capMatch[1]);
        setSpvCapacityKwp(capMatch[1]);
      }
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? '' : section);
  };

  const handlePrint = () => {
    const container = document.querySelector('.annexure-proforma-print-container');
    if (!container) return;

    const printWindow = window.open('', '_blank', 'width=794,height=1123');
    if (!printWindow) return;

    const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join('\n');

    const pagesHtml = container.innerHTML;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Annexure-I & Proforma-A</title>
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

  body > .annexure-proforma-print-container {
    display: block !important;
    width: 210mm !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .annexure-proforma-page {
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

  .annexure-proforma-page:last-child {
    page-break-after: avoid !important;
    break-after: avoid !important;
  }

  button, .print\\:hidden {
    display: none !important;
  }
</style>
</head>
<body>
  <div class="annexure-proforma-print-container">${pagesHtml}</div>
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
    <div
      className={
        isEmbedded
          ? 'h-[680px] max-h-[85vh] bg-slate-50 flex flex-col border border-slate-200 rounded-xl overflow-hidden shadow-xs relative'
          : 'h-[calc(100vh-80px)] bg-slate-50 flex flex-col -mx-4 -my-6 md:-mx-8 md:-my-8 relative overflow-hidden'
      }
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .annexure-proforma-page {
          font-family: "Times New Roman", Times, Georgia, serif !important;
          print-color-adjust: exact !important;
          -webkit-print-color-adjust: exact !important;
        }

        @media screen and (max-width: 640px) {
          .annexure-proforma-page {
            transform: scale(0.44) !important;
            transform-origin: top center !important;
            margin-bottom: -155mm !important;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1) !important;
          }
        }
        @media screen and (min-width: 641px) and (max-width: 1024px) {
          .annexure-proforma-page {
            transform: scale(0.70) !important;
            transform-origin: top center !important;
            margin-bottom: -80mm !important;
          }
        }
      `
        }}
      />

      {/* Header Bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 md:px-6 py-3 flex items-center justify-between shrink-0 select-none print:hidden shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-600">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
              Annexure-I & Proforma-A Commissioning Report (2 Pages)
            </h1>
            <p className="text-[11px] text-slate-500">
              Generate & print official RE System Commissioning Report & Provisional Certification
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Lead Selector */}
          <select
            value={selectedLeadId}
            onChange={handleLeadChange}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white font-medium text-slate-700 shadow-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
          >
            <option value="">-- Select Client Lead --</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.phoneNumber})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleSaveDocument}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Document</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
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
          <FileText className="w-3.5 h-3.5" />
          <span>📝 Form Controls</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('preview')}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
            mobileTab === 'preview' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-650 hover:bg-slate-200'
          }`}
        >
          <FileCheck className="w-3.5 h-3.5" />
          <span>📄 Document Preview</span>
        </button>
      </div>

      {/* Main Content Viewport */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Form Controls */}
        <div
          className={`bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-300 select-none print:hidden z-20 overflow-y-auto lg:sticky lg:top-0 lg:max-h-[calc(100vh-60px)] ${
            mobileTab === 'form' ? 'w-full block' : 'hidden lg:block'
          } ${
            isSidebarCollapsed ? 'lg:w-0 lg:overflow-hidden lg:border-r-0' : 'w-full lg:w-96'
          }`}
        >
          <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Document Form Controls
              </span>
            </div>
            <button
              onClick={() => setIsSidebarCollapsed(true)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors cursor-pointer"
              title="Collapse Sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* Section 1: Consumer & Installation */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <button
                onClick={() => toggleSection('consumer')}
                className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-slate-700 border-b border-slate-200 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  <span>1. Consumer Particulars</span>
                </div>
                {expandedSection === 'consumer' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {expandedSection === 'consumer' && (
                <div className="p-3 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      1. Name of the Consumer
                    </label>
                    <input
                      type="text"
                      value={consumerName}
                      onChange={(e) => setConsumerName(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      2. Consumer Number
                    </label>
                    <input
                      type="text"
                      value={consumerNumber}
                      onChange={(e) => setConsumerNumber(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      3. Mobile Number
                    </label>
                    <input
                      type="text"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      4. E-mail
                    </label>
                    <input
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      5. Address of Installation
                    </label>
                    <textarea
                      rows={2}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Technical Parameters */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <button
                onClick={() => toggleSection('technical')}
                className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-slate-700 border-b border-slate-200 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. RE System Parameters</span>
                </div>
                {expandedSection === 'technical' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {expandedSection === 'technical' && (
                <div className="p-3 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      6. RE Arrangement Type
                    </label>
                    <input
                      type="text"
                      value={reArrangementType}
                      onChange={(e) => setReArrangementType(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      7. RE Source
                    </label>
                    <input
                      type="text"
                      value={reSource}
                      onChange={(e) => setReSource(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        8. Sanctioned Cap(KW)
                      </label>
                      <input
                        type="text"
                        value={sanctionedCapacity}
                        onChange={(e) => setSanctionedCapacity(e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        9. Capacity Type
                      </label>
                      <input
                        type="text"
                        value={capacityType}
                        onChange={(e) => setCapacityType(e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      10. Project Model
                    </label>
                    <input
                      type="text"
                      value={projectModel}
                      onChange={(e) => setProjectModel(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      11. RE Cap(Rooftop)(KW)
                    </label>
                    <input
                      type="text"
                      value={reCapacityRooftop}
                      onChange={(e) => setReCapacityRooftop(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        12. Rooftop + Ground
                      </label>
                      <input
                        type="text"
                        value={reCapacityRooftopGround}
                        onChange={(e) => setReCapacityRooftopGround(e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        13. Ground Cap(KW)
                      </label>
                      <input
                        type="text"
                        value={reCapacityGround}
                        onChange={(e) => setReCapacityGround(e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      14. Installation date
                    </label>
                    <input
                      type="text"
                      value={installationDate}
                      onChange={(e) => setInstallationDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: Solar PV Details */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <button
                onClick={() => toggleSection('solar')}
                className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-slate-700 border-b border-slate-200 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <Sun className="w-3.5 h-3.5 text-emerald-600" />
                  <span>3. Solar PV Details</span>
                </div>
                {expandedSection === 'solar' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {expandedSection === 'solar' && (
                <div className="p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Inverter Capacity(KW)
                      </label>
                      <input
                        type="text"
                        value={inverterCapacity}
                        onChange={(e) => setInverterCapacity(e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Inverter Make
                      </label>
                      <input
                        type="text"
                        value={inverterMake}
                        onChange={(e) => setInverterMake(e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        No. of PV Modules
                      </label>
                      <input
                        type="text"
                        value={noOfPvModules}
                        onChange={(e) => setNoOfPvModules(e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Module Capacity (KW)
                      </label>
                      <input
                        type="text"
                        value={moduleCapacity}
                        onChange={(e) => setModuleCapacity(e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 4: Page 2 & Inspection Details */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <button
                onClick={() => toggleSection('inspection')}
                className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between font-bold text-slate-700 border-b border-slate-200 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>4. Page 2 Inspection Details</span>
                </div>
                {expandedSection === 'inspection' ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {expandedSection === 'inspection' && (
                <div className="p-3 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      District Name
                    </label>
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Installed By M/S
                    </label>
                    <input
                      type="text"
                      value={installedBy}
                      onChange={(e) => setInstalledBy(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Pre-Commissioning Test Date
                    </label>
                    <input
                      type="text"
                      value={preCommissioningDate}
                      onChange={(e) => setPreCommissioningDate(e.target.value)}
                      placeholder="e.g. 15/06/2026"
                      className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: A4 Document Preview */}
        <div ref={printContainerRef} className={`flex-1 overflow-y-auto overflow-x-auto bg-slate-100 p-2 sm:p-4 md:p-8 flex flex-col items-center space-y-6 select-none relative max-w-full ${
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
              <span className="text-[10px] font-black uppercase tracking-wider [writing-mode:vertical-lr] select-none">
                Controls
              </span>
            </button>
          )}

          <div className="annexure-proforma-print-container flex flex-col items-center space-y-6 print:space-y-0 w-full">
            {/* PAGE 1: Annexure-I & Proforma-A Body Text */}
            <div className="annexure-proforma-page bg-white shadow-xl w-[210mm] min-h-[297mm] p-[12mm_15mm] text-slate-900 flex flex-col justify-start font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[10pt] leading-[1.3] text-justify">
              <div className="space-y-4">
                {/* Header */}
                <div className="text-center space-y-1 pt-2">
                  <h2 className="text-[12pt] font-bold text-slate-700">
                    Renewable Energy Generating System
                  </h2>
                  <h1 className="text-[14pt] font-bold tracking-wide text-slate-900">
                    Annexure-I
                  </h1>
                  <p className="text-[10.5pt] font-bold text-slate-800">
                    (Commissioning Report for RE System)
                  </p>
                </div>

                {/* Main Particulars Table */}
                <div className="pt-2">
                  <table className="w-full border-collapse text-[9.5pt]">
                    <thead>
                      <tr className="border-b border-slate-900">
                        <th className="text-left font-bold py-1 w-12">SNo.</th>
                        <th className="text-left font-bold py-1 w-64">Particulars</th>
                        <th className="text-left font-bold py-1">As Commissioned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="py-1 font-medium">1</td>
                        <td className="py-1">Name of the Consumer</td>
                        <td className="py-1 font-semibold">{consumerName}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">2</td>
                        <td className="py-1">Consumer Number</td>
                        <td className="py-1 font-semibold">{consumerNumber}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">3</td>
                        <td className="py-1">Mobile Number</td>
                        <td className="py-1 font-semibold">{mobileNumber}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">4</td>
                        <td className="py-1">E-mail</td>
                        <td className="py-1 font-semibold">{email}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">5</td>
                        <td className="py-1">Address of Installation</td>
                        <td className="py-1 font-semibold">{address}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">6</td>
                        <td className="py-1">RE Arrangement Type</td>
                        <td className="py-1 font-semibold">{reArrangementType}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">7</td>
                        <td className="py-1">RE Source</td>
                        <td className="py-1 font-semibold">{reSource}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">8</td>
                        <td className="py-1">Sanctioned Capacity(KW)</td>
                        <td className="py-1 font-semibold">{sanctionedCapacity}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">9</td>
                        <td className="py-1">Capacity Type</td>
                        <td className="py-1 font-semibold">{capacityType}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">10</td>
                        <td className="py-1">Project Model</td>
                        <td className="py-1 font-semibold">{projectModel}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">11</td>
                        <td className="py-1">RE installed Capacity(Rooftop)(KW)</td>
                        <td className="py-1 font-semibold">{reCapacityRooftop}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">12</td>
                        <td className="py-1">RE installed Capacity(Rooftop + Ground)(KW)</td>
                        <td className="py-1 font-semibold">{reCapacityRooftopGround}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">13</td>
                        <td className="py-1">RE installed Capacity(Ground)(KW)</td>
                        <td className="py-1 font-semibold">{reCapacityGround}</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium">14</td>
                        <td className="py-1">Installation date</td>
                        <td className="py-1">
                          <span className="inline-block border border-slate-400 px-4 py-0.5 min-w-[180px] bg-white text-center font-semibold text-slate-800">
                            {installationDate}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 font-medium align-top">15</td>
                        <td className="py-1 font-bold align-top">SolarPV Details</td>
                        <td className="py-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9pt]">Inverter Capacity(KW)</span>
                            <span className="inline-block border border-slate-400 px-3 py-0.5 min-w-[140px] bg-white text-center font-semibold text-slate-800">
                              {inverterCapacity}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9pt]">Inverter Make</span>
                            <span className="inline-block border border-slate-400 px-3 py-0.5 min-w-[140px] bg-white text-center font-semibold text-slate-800">
                              {inverterMake}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9pt]">No .of PV Modules</span>
                            <span className="inline-block border border-slate-400 px-3 py-0.5 min-w-[140px] bg-white text-center font-semibold text-slate-800">
                              {noOfPvModules}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[9pt]">Module Capacity (KW)</span>
                            <span className="inline-block border border-slate-400 px-3 py-0.5 min-w-[140px] bg-white text-center font-semibold text-slate-800">
                              {moduleCapacity}
                            </span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Section 2: Proforma-A */}
                <div className="pt-4 space-y-2">
                  <div className="text-center space-y-0.5">
                    <h2 className="text-[13pt] font-bold text-slate-900 uppercase tracking-wide">
                      Proforma-A
                    </h2>
                    <h3 className="text-[9.5pt] font-bold text-slate-800 uppercase tracking-wide">
                      COMMISSIONING REPORT (PROVISIONAL) FOR GRID CONNECTED SOLAR PHOTOVOLTAIC POWER PLANT (with Net-metering facility)
                    </h3>
                  </div>

                  <p className="text-[10pt] leading-[1.6] text-justify pt-2 text-slate-900">
                    Certified that a Grid Connected SPV Power Plant of{' '}
                    <span className="font-semibold underline px-1">{spvCapacityKwp || '5.0'}</span> KWp capacity has been installed at the site{' '}
                    <span className="font-semibold underline px-1">{address || 'Applicant Site'}</span> District{' '}
                    <span className="font-semibold underline px-1">{district || 'NAGPUR'}</span> of MAHARASHTRA which has been installed by{' '}
                    <span className="font-semibold underline px-1">{installedBy || 'M/S GREEN ENERGY SOLUTION'}</span> on{' '}
                    <span className="font-semibold underline px-1">{installationDate}</span>. The system is as per BIS/MNRE specifications. The system has been checked for its performance and found in order for further commissioning.
                  </p>
                </div>
              </div>
            </div>

            {/* PAGE 2: Beneficiary & Agency Signatures + Inspection Report + MSEDCL Officer Block */}
            <div className="annexure-proforma-page bg-white shadow-xl w-[210mm] min-h-[297mm] p-[20mm_18mm] text-slate-900 flex flex-col justify-start font-serif relative box-border border border-slate-300 print:shadow-none print:border-none print:m-0 text-[10pt] leading-[1.4] text-justify">
              <div className="space-y-16 pt-10">
                {/* Top Signatures Row */}
                <div className="flex justify-between items-start text-[10.5pt]">
                  <div className="space-y-16">
                    <p className="font-bold text-slate-900">Signature of the beneficiary</p>
                    <div className="pt-2 border-b border-black w-60"></div>
                  </div>
                  <div className="space-y-16 text-right">
                    <p className="font-bold text-slate-900">Signature of the agency with name, seal and date</p>
                    <div className="pt-2 border-b border-black w-72 ml-auto"></div>
                  </div>
                </div>

                {/* Inspection Report Text */}
                <div className="pt-4">
                  <p className="text-[10.5pt] leading-[1.75] text-justify text-slate-900 font-normal">
                    The above RTS installation has been inspected by me for Pre-Commissioning Testing of Roof Top Solar Connection on dt.<span className="font-semibold underline px-2">{preCommissioningDate || '............................'}</span> as per guidelines issued by the office of The Chief Engineer vide letter no 21653 on dt. 18.08.2022 and found in order for commissioning.
                  </p>
                </div>

                {/* MSEDCL Officer Signature Block */}
                <div className="pt-12 space-y-2 text-[10.5pt]">
                  <p className="font-bold text-slate-900">Signature of the MSEDCL Officer</p>
                  <p className="font-bold text-slate-900">Name,</p>
                  <p className="font-bold text-slate-900">Designation</p>
                  <p className="font-bold text-slate-900">Date and seal</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
