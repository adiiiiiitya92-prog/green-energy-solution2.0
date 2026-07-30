import React, { useEffect, useState, useRef } from 'react';
import { leadService } from '../../services/leadService';
import { quotationService, getCleanWhatsAppPhone } from '../../services/quotationService';
import { productService } from '../../services/productService';
import { pdfService, createNewQuotationProposalHtml } from '../../services/pdfService';
import { uploadImageToFirebase, uploadPdfToFirebase } from '../../services/firebase';
import type { Lead, Quotation, QuotationItem, Product, BomItem } from '../../types';
import {
  FileText,
  Plus,
  Minus,
  Trash2,
  Download,
  Eye,
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Save,
  Send,
  CheckCircle2,
  X,
  Percent,
  Calculator,
  Layers,
  CheckSquare,
  Square
} from 'lucide-react';
import dayjs from 'dayjs';

export const QuotationDocument: React.FC<{
  defaultLeadId?: string;
  isEmbedded?: boolean;
  readOnlyQuotation?: Quotation;
  onClosePreview?: () => void;
  onNavigateToOrderKyc?: () => void;
}> = ({ defaultLeadId, isEmbedded, readOnlyQuotation, onClosePreview, onNavigateToOrderKyc }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState(defaultLeadId || readOnlyQuotation?.leadId || '');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Proposal Meta
  const [proposalId, setProposalId] = useState(readOnlyQuotation?.proposalId || readOnlyQuotation?.quotationNumber || `GES/QTN/${dayjs().format('YYYY')}/${Math.floor(1000 + Math.random() * 9000)}`);
  const [proposalDate, setProposalDate] = useState(readOnlyQuotation?.proposalDate || dayjs().format('YYYY-MM-DD'));
  const [preparedBy, setPreparedBy] = useState(readOnlyQuotation?.preparedBy || readOnlyQuotation?.createdBy || 'Nitin Thakre');

  // Customer Details
  const [consumerName, setConsumerName] = useState(readOnlyQuotation?.consumerName || '');
  const [consumerMobile, setConsumerMobile] = useState(readOnlyQuotation?.consumerMobile || '');
  const [consumerEmail, setConsumerEmail] = useState(readOnlyQuotation?.consumerEmail || '');
  const [city, setCity] = useState(readOnlyQuotation?.city || 'Nagpur');
  const [statePin, setStatePin] = useState(readOnlyQuotation?.statePin || 'Maharashtra');

  // Specs
  const [systemCapacity, setSystemCapacity] = useState(readOnlyQuotation?.systemCapacity ? String(readOnlyQuotation.systemCapacity).replace(/[^0-9.]/g, '') : '5.0');
  const [subsidyAmount, setSubsidyAmount] = useState(readOnlyQuotation?.subsidyAmount || '');
  const [pvModuleMake, setPvModuleMake] = useState(readOnlyQuotation?.pvModuleMake || '');
  const [inverterMake, setInverterMake] = useState(readOnlyQuotation?.inverterMake || '');
  const [structureType, setStructureType] = useState(readOnlyQuotation?.structureType || '');
  const [consumerNo, setConsumerNo] = useState(readOnlyQuotation?.consumerNo || '');
  const [sanctionLoad, setSanctionLoad] = useState(readOnlyQuotation?.sanctionLoad || '5.0 kW');

  // Tax / GST Settings
  const initialGstRate = readOnlyQuotation?.gstRate !== undefined ? readOnlyQuotation.gstRate : 13.8;
  const [gstRate, setGstRate] = useState<number>(initialGstRate);
  const [gstPreset, setGstPreset] = useState<string>([13.8, 12, 18, 5, 0].includes(initialGstRate) ? String(initialGstRate) : 'custom');

  // UI / Preview Controls
  const [zoomScale, setZoomScale] = useState<number>(0.75); // Default 75% for ideal 8-page preview fit
  const [mobileTab, setMobileTab] = useState<'form' | 'preview'>('preview');
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);

  // Line Items & Multi-Select Modal
  const [items, setItems] = useState<QuotationItem[]>(
    readOnlyQuotation?.items && readOnlyQuotation.items.length > 0
      ? readOnlyQuotation.items
      : []
  );

  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemRate, setNewItemRate] = useState(0);
  const [selectedCatalogProdId, setSelectedCatalogProdId] = useState('');

  // Multi-Select Catalog Modal State
  const [isMultiModalOpen, setIsMultiModalOpen] = useState(false);
  const [multiSelectedMap, setMultiSelectedMap] = useState<Record<string, { selected: boolean; qty: number; rate: number }>>({});
  const [multiCategoryFilter, setMultiCategoryFilter] = useState<string>('all');

  // Bill of Materials (BOM) Customization State
  const [bomItems, setBomItems] = useState<BomItem[]>([]);
  const [isBomSectionOpen, setIsBomSectionOpen] = useState(false);

  const handleAddBomRow = () => {
    const nextSr = bomItems.length + 1;
    setBomItems([
      ...bomItems,
      { srNo: nextSr, itemName: '', qty: 1, unit: 'Nos', brand: '' }
    ]);
  };

  const handleUpdateBomRow = (index: number, field: keyof BomItem, value: any) => {
    const updated = [...bomItems];
    updated[index] = { ...updated[index], [field]: value };
    setBomItems(updated);
  };

  const handleRemoveBomRow = (index: number) => {
    setBomItems(bomItems.filter((_, i) => i !== index));
  };

  const handleSelectBomFromCatalog = (prodId: string) => {
    if (!prodId) return;
    const prod = products.find(p => p.id === prodId);
    if (prod) {
      setBomItems(prev => [
        ...prev,
        {
          srNo: prev.length + 1,
          itemName: prod.name,
          qty: 1,
          unit: prod.unit || 'Nos',
          brand: prod.brand || '',
          category: prod.bomCategory || 'Other Accessories',
          description: prod.description || ''
        }
      ]);
      setIsBomSectionOpen(true);
    }
  };

  const handleAddCategoryHeader = () => {
    const nextSr = String(bomItems.length + 1);
    setBomItems([
      ...bomItems,
      { srNo: nextSr, itemName: 'New Section Category Header', qty: '', unit: '', brand: '', isHeader: true }
    ]);
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const lastPdfBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    leadService.getLeads().then((list) => {
      setLeads(list);
      const targetId = defaultLeadId || readOnlyQuotation?.leadId;
      if (targetId) {
        const target = list.find(l => l.id === targetId);
        if (target) populateLeadData(target);
      }
    });

    productService.getProducts().then((pList) => {
      setProducts(pList);
    });
  }, [defaultLeadId, readOnlyQuotation]);

  useEffect(() => {
    if (readOnlyQuotation) {
      if (readOnlyQuotation.leadId) setSelectedLeadId(readOnlyQuotation.leadId);
      if (readOnlyQuotation.proposalId || readOnlyQuotation.quotationNumber) {
        setProposalId(readOnlyQuotation.proposalId || readOnlyQuotation.quotationNumber);
      }
      if (readOnlyQuotation.proposalDate) setProposalDate(readOnlyQuotation.proposalDate);
      if (readOnlyQuotation.preparedBy || readOnlyQuotation.createdBy) {
        setPreparedBy(readOnlyQuotation.preparedBy || readOnlyQuotation.createdBy || 'Nitin Thakre');
      }
      if (readOnlyQuotation.consumerName) setConsumerName(readOnlyQuotation.consumerName);
      if (readOnlyQuotation.consumerMobile) setConsumerMobile(readOnlyQuotation.consumerMobile);
      if (readOnlyQuotation.consumerEmail) setConsumerEmail(readOnlyQuotation.consumerEmail);
      if (readOnlyQuotation.city) setCity(readOnlyQuotation.city);
      if (readOnlyQuotation.statePin) setStatePin(readOnlyQuotation.statePin);
      if (readOnlyQuotation.consumerNo) setConsumerNo(readOnlyQuotation.consumerNo);
      if (readOnlyQuotation.sanctionLoad) setSanctionLoad(readOnlyQuotation.sanctionLoad);
      if (readOnlyQuotation.systemCapacity) {
        const cap = String(readOnlyQuotation.systemCapacity).replace(/[^0-9.]/g, '');
        if (cap) setSystemCapacity(cap);
      }
      if (readOnlyQuotation.subsidyAmount) setSubsidyAmount(readOnlyQuotation.subsidyAmount);
      if (readOnlyQuotation.pvModuleMake) setPvModuleMake(readOnlyQuotation.pvModuleMake);
      if (readOnlyQuotation.inverterMake) setInverterMake(readOnlyQuotation.inverterMake);
      if (readOnlyQuotation.structureType) setStructureType(readOnlyQuotation.structureType);
      if (readOnlyQuotation.gstRate !== undefined) {
        setGstRate(readOnlyQuotation.gstRate);
        setGstPreset([13.8, 12, 18, 5, 0].includes(readOnlyQuotation.gstRate) ? String(readOnlyQuotation.gstRate) : 'custom');
      }
      if (readOnlyQuotation.items && readOnlyQuotation.items.length > 0) {
        setItems(readOnlyQuotation.items);
      }
      if (readOnlyQuotation.bomItems && readOnlyQuotation.bomItems.length > 0) {
        setBomItems(readOnlyQuotation.bomItems);
      }
    }
  }, [readOnlyQuotation]);

  const populateLeadData = async (lead: Lead) => {
    setSelectedLeadId(lead.id);
    setSelectedLead(lead);
    if (!readOnlyQuotation) {
      setConsumerName(lead.name);
      setConsumerMobile(lead.phoneNumber);
      if (lead.email) setConsumerEmail(lead.email);
      if (lead.description) {
        const parts = lead.description.split(',');
        if (parts[0]) setCity(parts[0].trim());
      }

      try {
        const existingQuotes = await quotationService.getQuotationsByLeadId(lead.id);
        if (existingQuotes && existingQuotes.length > 0) {
          const q = existingQuotes[0];
          if (q.proposalId || q.quotationNumber) setProposalId(q.proposalId || q.quotationNumber);
          if (q.proposalDate) setProposalDate(q.proposalDate);
          if (q.preparedBy || q.createdBy) setPreparedBy(q.preparedBy || q.createdBy || 'Nitin Thakre');
          if (q.consumerName) setConsumerName(q.consumerName);
          if (q.consumerMobile) setConsumerMobile(q.consumerMobile);
          if (q.consumerEmail) setConsumerEmail(q.consumerEmail);
          if (q.city) setCity(q.city);
          if (q.statePin) setStatePin(q.statePin);
          if (q.consumerNo) setConsumerNo(q.consumerNo);
          if (q.sanctionLoad) setSanctionLoad(q.sanctionLoad);
          if (q.systemCapacity) {
            const cap = String(q.systemCapacity).replace(/[^0-9.]/g, '');
            if (cap) setSystemCapacity(cap);
          }
          if (q.subsidyAmount) setSubsidyAmount(q.subsidyAmount);
          if (q.pvModuleMake) setPvModuleMake(q.pvModuleMake);
          if (q.inverterMake) setInverterMake(q.inverterMake);
          if (q.structureType) setStructureType(q.structureType);
          if (q.gstRate !== undefined) {
            setGstRate(q.gstRate);
            setGstPreset([13.8, 12, 18, 5, 0].includes(q.gstRate) ? String(q.gstRate) : 'custom');
          }
          if (q.items && q.items.length > 0) setItems(q.items);
          if (q.bomItems && q.bomItems.length > 0) setBomItems(q.bomItems);
        }
      } catch (err) {
        console.warn("Existing quotation load note:", err);
      }
    }
  };

  const handleLeadSelect = (leadId: string) => {
    setSelectedLeadId(leadId);
    const target = leads.find(l => l.id === leadId);
    if (target) populateLeadData(target);
  };

  // Select Catalog Product helper for Line Items
  const handleCatalogProductSelect = (prodId: string) => {
    setSelectedCatalogProdId(prodId);
    if (!prodId) return;
    const prod = products.find(p => p.id === prodId);
    if (prod) {
      setNewItemName(prod.name);
      setNewItemRate(prod.rate);
    }
  };

  // Line Item actions
  const handleAddItem = () => {
    if (!newItemName || newItemRate <= 0) return;
    const amount = newItemQty * newItemRate;
    const matchedProd = products.find(p => p.id === selectedCatalogProdId || p.name.toLowerCase() === newItemName.toLowerCase());
    setItems([...items, {
      itemName: newItemName,
      brand: matchedProd?.brand || undefined,
      unit: matchedProd?.unit || 'Nos',
      description: matchedProd?.description || undefined,
      qty: newItemQty,
      rate: newItemRate,
      amount
    }]);
    setNewItemName('');
    setNewItemQty(1);
    setNewItemRate(0);
    setSelectedCatalogProdId('');
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleRemoveItemByName = (name: string) => {
    setItems(items.filter(it => it.itemName !== name));
  };

  const handleClearAllItems = () => {
    if (items.length === 0) return;
    if (window.confirm('Kya aap proposal se saare products hatana chahte hain?')) {
      setItems([]);
    }
  };

  const handleClearMultiSelections = () => {
    setMultiSelectedMap({});
  };

  // Inline Item Edit Handlers
  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      qty: newQty,
      amount: newQty * updated[index].rate
    };
    setItems(updated);
  };

  const handleUpdateItemRate = (index: number, newRate: number) => {
    if (newRate < 0) return;
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      rate: newRate,
      amount: updated[index].qty * newRate
    };
    setItems(updated);
  };

  const handleUpdateItemName = (index: number, newName: string) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      itemName: newName
    };
    setItems(updated);
  };

  const handleUpdateItemDescription = (index: number, newDesc: string) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      description: newDesc
    };
    setItems(updated);
  };

  // Multi-Select Catalog Handlers
  const handleToggleMultiProduct = (prodId: string, defaultRate: number) => {
    setMultiSelectedMap(prev => {
      const current = prev[prodId] || { selected: false, qty: 1, rate: defaultRate };
      return {
        ...prev,
        [prodId]: { ...current, selected: !current.selected, rate: current.rate || defaultRate }
      };
    });
  };

  const handleUpdateMultiProdQty = (prodId: string, delta: number, defaultRate: number) => {
    setMultiSelectedMap(prev => {
      const current = prev[prodId] || { selected: true, qty: 1, rate: defaultRate };
      const newQty = current.qty + delta;
      if (newQty <= 0) {
        return {
          ...prev,
          [prodId]: { ...current, qty: 0, selected: false, rate: current.rate || defaultRate }
        };
      }
      return {
        ...prev,
        [prodId]: { ...current, qty: newQty, selected: true, rate: current.rate || defaultRate }
      };
    });
  };

  const handleUpdateMultiProdRate = (prodId: string, rate: number, defaultRate: number) => {
    setMultiSelectedMap(prev => {
      const current = prev[prodId] || { selected: true, qty: 1, rate: defaultRate };
      return {
        ...prev,
        [prodId]: { ...current, rate, selected: true }
      };
    });
  };

  const handleAddAllSelectedProducts = () => {
    const newItemsToAdd: QuotationItem[] = [];
    products.forEach(p => {
      const sel = multiSelectedMap[p.id];
      if (sel && sel.selected && sel.qty > 0) {
        const itemRate = sel.rate !== undefined ? sel.rate : p.rate;
        newItemsToAdd.push({
          itemName: p.name,
          brand: p.brand,
          unit: p.unit || 'Nos',
          description: p.description,
          qty: sel.qty,
          rate: itemRate,
          amount: sel.qty * itemRate
        });
      }
    });

    if (newItemsToAdd.length > 0) {
      setItems(prev => [...prev, ...newItemsToAdd]);
      setMultiSelectedMap({});
      setIsMultiModalOpen(false);
    } else {
      alert('Kripya kam se kam ek product select karein.');
    }
  };

  // Financial calculations
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const taxRate = Number(gstRate) || 0;
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const cgstAmount = Math.round(taxAmount / 2);
  const sgstAmount = taxAmount - cgstAmount;
  const subsidyVal = Number(subsidyAmount) || 0;
  const grandTotal = Math.max(0, (subtotal + taxAmount) - subsidyVal);

  // Handle GST Preset change
  const handleGstPresetChange = (preset: string) => {
    setGstPreset(preset);
    if (preset !== 'custom') {
      setGstRate(parseFloat(preset));
    }
  };

  // Generate Proposal HTML for 8 Pages
  const proposalHtml = createNewQuotationProposalHtml(
    {
      consumerName: consumerName || selectedLead?.name || 'Valued Customer',
      consumerMobile: consumerMobile || selectedLead?.phoneNumber || '',
      consumerEmail: consumerEmail || selectedLead?.email || '',
      consumerNo,
      sanctionLoad,
      proposalId,
      proposalDate,
      createdBy: preparedBy,
      city,
      statePin,
      systemCapacity,
      pvModuleMake,
      inverterMake,
      structureType,
      items,
      bomItems,
      subtotal,
      grandTotal,
      subsidyAmount,
      gstRate
    },
    selectedLead,
    preparedBy
  );

  useEffect(() => {
    if (!contentRef.current) return;
    const updateHeight = () => {
      if (contentRef.current) {
        setContentHeight(contentRef.current.offsetHeight);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [proposalHtml]);

  // Save Quotation Record & Render 8-Page PDF Proposal to Backblaze B2 Storage
  const handleSaveQuotation = async (): Promise<string | null> => {
    const hasItems = items && items.length > 0;
    const hasBom = bomItems && bomItems.length > 0;

    if (!hasItems && !hasBom) {
      alert('⚠️ Quotation save nahi ho sakta: Kripya pehle kam se kam 1 product item ya BOM row add karein.');
      return null;
    }

    const targetLeadId = selectedLeadId || readOnlyQuotation?.leadId || defaultLeadId;
    if (!targetLeadId) {
      alert('Please select a customer lead first.');
      return null;
    }
    
    setIsGenerating(true);
    try {
      const quotationRecord: Omit<Quotation, 'id' | 'createdAt'> & { id?: string } = {
        id: readOnlyQuotation?.id,
        leadId: targetLeadId,
        quotationNumber: proposalId,
        items,
        bomItems,
        subtotal,
        grandTotal,
        followUpDate: dayjs().add(7, 'day').format('YYYY-MM-DD'),
        consumerName: consumerName || selectedLead?.name || 'Valued Customer',
        consumerMobile: consumerMobile || selectedLead?.phoneNumber || '',
        consumerEmail: consumerEmail || selectedLead?.email || '',
        consumerNo,
        sanctionLoad,
        city,
        statePin,
        proposalId,
        proposalDate,
        preparedBy,
        systemCapacity: `${systemCapacity} kW`,
        subsidyAmount,
        gstRate,
        pvModuleMake,
        inverterMake,
        structureType,
        createdBy: preparedBy,
        sentViaWhatsapp: readOnlyQuotation?.sentViaWhatsapp || false
      };

      const qId = await quotationService.createQuotation(quotationRecord);
      const fullQuotation = await quotationService.getQuotationById(qId);
      
      let b2Url = '';
      if (fullQuotation) {
        const sanitizedProposalId = proposalId.replace(/\//g, '_');
        const storagePath = `quotations/pdf_${sanitizedProposalId}.pdf`;

        const mockLead: Lead = selectedLead || {
          id: selectedLeadId || fullQuotation.leadId,
          name: consumerName || 'Valued Customer',
          phoneNumber: consumerMobile,
          email: consumerEmail,
          requirement: `${systemCapacity} kW Solar Rooftop`,
          description: city,
          createdBy: preparedBy,
          status: 'quotation_sent',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // Render 8-Page PDF Proposal & upload directly to Backblaze B2 Storage Bucket
        const pdfBlob = await pdfService.generateQuotationPDF(fullQuotation, mockLead, preparedBy);
        lastPdfBlobRef.current = pdfBlob;
        b2Url = await uploadPdfToFirebase(pdfBlob, storagePath);

        if (b2Url && (b2Url.startsWith('http://') || b2Url.startsWith('https://'))) {
          await quotationService.updateQuotation({ ...fullQuotation, pdfUrl: b2Url });
          console.log(`📦 Quotation 8-Page PDF saved & uploaded to Backblaze B2: ${b2Url}`);
        } else {
          throw new Error('Backblaze B2 upload returned an empty or invalid URL.');
        }
      }

      setSaveSuccessMsg('Quotation saved & PDF uploaded to Backblaze B2!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
      return qId;
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error saving quotation: ${err.message || err}`);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  // Share Quotation PDF via WhatsApp
  const handleShareQuotation = async () => {
    const rawPhone = consumerMobile || readOnlyQuotation?.consumerMobile || selectedLead?.phoneNumber || '';
    const targetPhone = getCleanWhatsAppPhone(rawPhone);
    const waUrl = targetPhone 
      ? `https://api.whatsapp.com/send?phone=${targetPhone}`
      : `https://api.whatsapp.com/send`;

    let pdfBlob = lastPdfBlobRef.current;
    const sanitizedProposalId = proposalId.replace(/\//g, '_');
    const pdfFileName = `Solar_Quotation_${sanitizedProposalId}.pdf`;

    // 1. Mobile Native Share API (Attaches PDF document file directly into WhatsApp)
    if (pdfBlob && typeof navigator !== 'undefined' && (navigator as any).canShare) {
      const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });
      if ((navigator as any).canShare({ files: [pdfFile] })) {
        try {
          await (navigator as any).share({ files: [pdfFile] });
          silentBackgroundSave();
          return;
        } catch (e: any) {
          if (e.name === 'AbortError') return;
        }
      }
    }

    // 2. Open WhatsApp Web directly in a new tab (bypasses blank pages & popup blockers)
    const win = window.open(waUrl, '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      window.location.href = waUrl;
    }

    // 3. Auto-download PDF locally & save in background
    if (pdfBlob) {
      const blobUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = pdfFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } else {
      // If PDF blob isn't generated yet, generate and save in background
      const targetLeadId = selectedLeadId || readOnlyQuotation?.leadId;
      const mockLead: Lead = selectedLead || {
        id: targetLeadId || '',
        name: consumerName || 'Valued Customer',
        phoneNumber: consumerMobile,
        email: consumerEmail,
        requirement: `${systemCapacity} kW Solar Rooftop`,
        description: city,
        createdBy: preparedBy,
        status: 'quotation_sent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const tempQ = {
        id: readOnlyQuotation?.id || 'temp',
        leadId: targetLeadId || '',
        quotationNumber: proposalId,
        items, bomItems, subtotal, grandTotal,
        consumerName: consumerName || selectedLead?.name || 'Valued Customer',
        consumerMobile: consumerMobile || selectedLead?.phoneNumber || '',
        consumerEmail: consumerEmail || selectedLead?.email || '',
        consumerNo, sanctionLoad, city, statePin, proposalId, proposalDate, preparedBy,
        systemCapacity: `${systemCapacity} kW`, subsidyAmount, gstRate,
        pvModuleMake, inverterMake, structureType,
        createdBy: preparedBy, createdAt: new Date().toISOString()
      };
      pdfService.generateQuotationPDF(tempQ as any, mockLead, preparedBy)
        .then(blob => {
          lastPdfBlobRef.current = blob;
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = pdfFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        })
        .catch(e => console.warn('Background PDF generation note:', e));
    }

    silentBackgroundSave();
  };

  // Silent save without loading spinner (used after WhatsApp share)
  const silentBackgroundSave = async () => {
    try {
      const targetLeadId = selectedLeadId || readOnlyQuotation?.leadId;
      if (!targetLeadId) return;

      const quotationRecord: Omit<Quotation, 'id' | 'createdAt'> & { id?: string } = {
        id: readOnlyQuotation?.id,
        leadId: targetLeadId,
        quotationNumber: proposalId,
        items,
        bomItems,
        subtotal,
        grandTotal,
        followUpDate: dayjs().add(7, 'day').format('YYYY-MM-DD'),
        consumerName: consumerName || selectedLead?.name || 'Valued Customer',
        consumerMobile: consumerMobile || selectedLead?.phoneNumber || '',
        consumerEmail: consumerEmail || selectedLead?.email || '',
        consumerNo,
        sanctionLoad,
        city,
        statePin,
        proposalId,
        proposalDate,
        preparedBy,
        systemCapacity: `${systemCapacity} kW`,
        subsidyAmount,
        gstRate,
        pvModuleMake,
        inverterMake,
        structureType,
        createdBy: preparedBy,
        sentViaWhatsapp: true
      };

      const qId = await quotationService.createQuotation(quotationRecord);
      if (qId) {
        await quotationService.markQuotationAsSent(qId);
        const pdfBlob = lastPdfBlobRef.current;
        if (pdfBlob) {
          const sanitizedProposalId = proposalId.replace(/\//g, '_');
          const storagePath = `quotations/pdf_${sanitizedProposalId}.pdf`;
          const b2Url = await uploadPdfToFirebase(pdfBlob, storagePath);
          if (b2Url && (b2Url.startsWith('http://') || b2Url.startsWith('https://'))) {
            const fullQ = await quotationService.getQuotationById(qId);
            if (fullQ) await quotationService.updateQuotation({ ...fullQ, pdfUrl: b2Url });
          }
        }
      }
    } catch (e) {
      console.warn('Silent background save note:', e);
    }
  };

  // Download PDF Document
  const handleSaveAndGeneratePDF = async () => {
    setIsGenerating(true);
    try {
      const qId = await handleSaveQuotation();
      if (!qId) return;

      const fullQuotation = await quotationService.getQuotationById(qId);
      if (fullQuotation) {
        const mockLead: Lead = selectedLead || {
          id: selectedLeadId || fullQuotation.leadId,
          name: consumerName || 'Valued Customer',
          phoneNumber: consumerMobile,
          email: consumerEmail,
          requirement: `${systemCapacity} kW Solar Rooftop`,
          description: city,
          createdBy: preparedBy,
          status: 'quotation_sent',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const blob = await pdfService.generateQuotationPDF(fullQuotation, mockLead, preparedBy);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Solar_Quotation_${proposalId.replace(/\//g, '_')}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setSaveSuccessMsg('8-Page Proposal saved & PDF downloaded!');
        setTimeout(() => setSaveSuccessMsg(null), 4000);
      }
    } catch (err) {
      console.error(err);
      alert('Error generating 8-Page quotation proposal.');
    } finally {
      setIsGenerating(false);
    }
  };

  const scrollToPage = (pageIndex: number) => {
    if (!previewScrollRef.current) return;
    const pages = previewScrollRef.current.querySelectorAll('.quotation-document-page');
    if (pages[pageIndex]) {
      pages[pageIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className={`space-y-6 ${isEmbedded ? 'p-2 sm:p-4' : 'p-4 sm:p-6'}`}>
      {/* Top Action Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-emerald-100 text-emerald-800 font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Official 8-Page Proposal Studio
            </span>
            {saveSuccessMsg && (
              <span className="bg-emerald-600 text-white font-bold text-[11px] px-3 py-0.5 rounded-full flex items-center gap-1 animate-fade-in">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{saveSuccessMsg}</span>
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2 mt-1">
            <FileText className="w-6 h-6 text-emerald-600" />
            <span>Solar Rooftop Custom Quotation Studio</span>
          </h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:block">
            Custom Edit, Save & Share 8-Page Proposal • Live Preview (Cover, BOM, Specs, Warranty, Financials)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-auto">
          {/* Mobile Tab Switcher */}
          <div className="flex lg:hidden bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setMobileTab('form')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                mobileTab === 'form' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              Form Controls
            </button>
            <button
              onClick={() => setMobileTab('preview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                mobileTab === 'preview' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500'
              }`}
            >
              8-Page Preview
            </button>
          </div>

          {/* 1. Save Button */}
          <button
            type="button"
            onClick={() => handleSaveQuotation()}
            disabled={isGenerating}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            title="Save Customized Quotation Record"
          >
            <Save className="w-4 h-4" />
            <span>Save Quotation</span>
          </button>

          {/* 2. Share WhatsApp Button */}
          <button
            type="button"
            onClick={handleShareQuotation}
            disabled={isGenerating}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            title="Save & Share Quotation Document via WhatsApp"
          >
            <Send className="w-4 h-4" />
            <span>Share WhatsApp</span>
          </button>

          {/* 3. Download PDF Button */}
          <button
            type="button"
            onClick={handleSaveAndGeneratePDF}
            disabled={isGenerating}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            title="Download PDF Document"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </button>

          {/* 4. Close Button if in modal */}
          {onClosePreview && (
            <button
              type="button"
              onClick={onClosePreview}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer ml-1"
              title="Close Editor"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Success Notification Banner */}
      {saveSuccessMsg && (
        <div className="bg-emerald-600 text-white border border-emerald-700 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold shadow-md animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-100 shrink-0" />
            <span className="text-sm font-black">{saveSuccessMsg}</span>
          </div>
          {onNavigateToOrderKyc && (
            <button
              type="button"
              onClick={onNavigateToOrderKyc}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs cursor-pointer shadow-md shrink-0 flex items-center gap-2 transition-all"
            >
              <span>💳 Record Payment / View Order & KYC →</span>
            </button>
          )}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form Controls (4 cols) */}
        <div className={`lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5 text-xs font-semibold ${
          mobileTab === 'form' ? 'block' : 'hidden lg:block'
        }`}>
          <h3 className="text-sm font-black text-slate-900 pb-2 border-b border-slate-100 uppercase tracking-wider text-emerald-700 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span>Proposal Configuration</span>
          </h3>

          {/* Lead Selector */}
          <div>
            <label className="block text-slate-500 mb-1">Select Customer Lead</label>
            <select
              value={selectedLeadId}
              onChange={(e) => handleLeadSelect(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 text-slate-800 font-bold focus:outline-none cursor-pointer"
            >
              <option value="">-- Choose Customer --</option>
              {leads.map(l => (
                <option key={l.id} value={l.id}>{l.name} ({l.phoneNumber})</option>
              ))}
            </select>
          </div>

          {/* Proposal Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 mb-1">Proposal ID</label>
              <input
                type="text"
                value={proposalId}
                onChange={(e) => setProposalId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Date</label>
              <input
                type="date"
                value={proposalDate}
                onChange={(e) => setProposalDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 cursor-pointer font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-500 mb-1">Prepared By (Engineer Name)</label>
            <input
              type="text"
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              placeholder="e.g. Nitin Thakre"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-bold"
            />
          </div>

          {/* Customer Details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 mb-1">Customer Name</label>
              <input
                type="text"
                value={consumerName}
                onChange={(e) => setConsumerName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Mobile Number</label>
              <input
                type="text"
                value={consumerMobile}
                onChange={(e) => setConsumerMobile(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">State</label>
              <input
                type="text"
                value={statePin}
                onChange={(e) => setStatePin(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 mb-1">Consumer No.</label>
              <input
                type="text"
                value={consumerNo}
                onChange={(e) => setConsumerNo(e.target.value)}
                placeholder="e.g. 396013606014"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Sanctioned Load</label>
              <input
                type="text"
                value={sanctionLoad}
                onChange={(e) => setSanctionLoad(e.target.value)}
                placeholder="e.g. 5.0 kW"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 mb-1">System Capacity (kW)</label>
              <input
                type="text"
                value={systemCapacity}
                onChange={(e) => setSystemCapacity(e.target.value)}
                placeholder="e.g. 5.0"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Govt Subsidy (₹)</label>
              <input
                type="text"
                value={subsidyAmount}
                onChange={(e) => setSubsidyAmount(e.target.value)}
                placeholder="e.g. 78000"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-bold text-emerald-700"
              />
            </div>
          </div>

          {/* GST Rate Settings */}
          <div className="space-y-3 p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
            <div className="flex justify-between items-center">
              <p className="text-[10px] uppercase font-bold text-blue-800 tracking-wider flex items-center gap-1">
                <Percent className="w-3.5 h-3.5" />
                <span>GST Taxation Configuration</span>
              </p>
              <span className="bg-blue-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-md">
                {gstRate}% GST
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-500 mb-1">GST Rate Preset</label>
                <select
                  value={gstPreset}
                  onChange={(e) => handleGstPresetChange(e.target.value)}
                  className="w-full border border-blue-200 rounded-xl px-2.5 py-2 bg-white text-slate-800 font-bold cursor-pointer text-[11px]"
                >
                  <option value="13.8">13.8% (Solar EPC Standard)</option>
                  <option value="12">12.0% (Solar Goods)</option>
                  <option value="18">18.0% (Services/EPC)</option>
                  <option value="5">5.0%</option>
                  <option value="0">0.0% (Exempt)</option>
                  <option value="custom">Custom %</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Custom GST %</label>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={gstRate}
                  onChange={(e) => {
                    setGstRate(parseFloat(e.target.value) || 0);
                    setGstPreset('custom');
                  }}
                  className="w-full border border-blue-200 rounded-xl px-3 py-2 bg-white font-black text-blue-900"
                />
              </div>
            </div>

            {/* Tax calculation summary box */}
            <div className="bg-white p-2.5 rounded-lg border border-blue-100 text-[11px] space-y-1 font-medium text-slate-700">
              <div className="flex justify-between">
                <span>Items Subtotal:</span>
                <span className="font-bold text-slate-900">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-blue-700">
                <span>CGST ({((gstRate || 0) / 2).toFixed(1)}%):</span>
                <span>₹{cgstAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-blue-700">
                <span>SGST ({((gstRate || 0) / 2).toFixed(1)}%):</span>
                <span>₹{sgstAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-100 font-black text-slate-900">
                <span>Invoice Total with Tax:</span>
                <span className="text-emerald-700">₹{(subtotal + taxAmount).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Custom Bill of Materials (BOM) Manager Section */}
          <div className="space-y-3 p-3 bg-purple-50/60 border border-purple-200 rounded-xl">
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setIsBomSectionOpen(!isBomSectionOpen)}
                className="flex items-center gap-1.5 text-xs font-black text-purple-900 cursor-pointer"
              >
                <Layers className="w-4 h-4 text-purple-600" />
                <span>📄 Custom Bill of Materials (BOM) ({bomItems.length} rows)</span>
                <span className="text-[10px] text-purple-600 font-bold ml-1">
                  {isBomSectionOpen ? '▲ Hide' : '▼ Edit BOM Table'}
                </span>
              </button>
            </div>

            {isBomSectionOpen && (
              <div className="space-y-3 pt-2 border-t border-purple-200">
                <p className="text-[10px] text-purple-700 font-semibold">
                  Customize the exact Page 6 Bill of Materials table for this quotation. Assign categories to group products under section headers.
                </p>

                {/* Quick Add from Saved BOM Catalog Dropdown */}
                {products.filter(p => p.category === 'bom_item').length > 0 && (
                  <div className="bg-white p-2 border border-purple-200 rounded-xl shadow-2xs">
                    <label className="block text-[10px] font-bold text-purple-900 mb-1">📖 Quick Pick from Saved BOM Catalog:</label>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleSelectBomFromCatalog(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="w-full border border-purple-200 rounded-lg px-2 py-1.5 bg-purple-50/50 text-slate-800 font-bold text-xs cursor-pointer focus:outline-none"
                    >
                      <option value="">-- Add Saved BOM Catalog Item... --</option>
                      {products.filter(p => p.category === 'bom_item').map(b => (
                        <option key={b.id} value={b.id}>
                          ➕ {b.name} {b.brand ? `(${b.brand})` : ''} [{b.unit || 'Nos'}] - ₹{b.rate}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {bomItems.length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {bomItems.map((bItem, bIdx) => (
                      <div
                        key={bIdx}
                        className={`p-2.5 rounded-xl shadow-2xs space-y-1.5 text-xs font-semibold ${
                          bItem.isHeader
                            ? 'bg-purple-100/80 border-2 border-purple-300'
                            : 'bg-white border border-purple-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={bItem.srNo || (bIdx + 1)}
                            onChange={(e) => handleUpdateBomRow(bIdx, 'srNo', e.target.value)}
                            className="w-10 border border-slate-200 rounded px-1 py-0.5 text-center font-bold bg-slate-50 text-[10px]"
                            placeholder="Sr#"
                          />
                          <input
                            type="text"
                            value={bItem.itemName}
                            onChange={(e) => handleUpdateBomRow(bIdx, 'itemName', e.target.value)}
                            placeholder={bItem.isHeader ? "Section Header Title (e.g. Protection Devices)" : "Item Name"}
                            className={`flex-1 border border-slate-200 rounded px-2 py-1 font-bold ${
                              bItem.isHeader ? 'bg-purple-50 text-purple-950 uppercase text-[11px]' : 'bg-white text-slate-900'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveBomRow(bIdx)}
                            className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {!bItem.isHeader && (
                          <div className="space-y-1.5 pl-2 border-l-2 border-purple-200">
                            <div>
                              <label className="block text-slate-400 text-[9px] font-bold">Group Category Header:</label>
                              <select
                                value={bItem.category || ''}
                                onChange={(e) => handleUpdateBomRow(bIdx, 'category', e.target.value)}
                                className="w-full border border-purple-200 rounded px-2 py-0.5 bg-purple-50/50 text-purple-950 font-bold text-[10px]"
                              >
                                <option value="">-- No Category (Standalone Item) --</option>
                                <option value="Solar Panels (PV Modules)">Solar Panels (PV Modules)</option>
                                <option value="Solar String Inverter">Solar String Inverter</option>
                                <option value="Solar Mounting Structure">Solar Mounting Structure</option>
                                <option value="Protection Devices">Protection Devices</option>
                                <option value="Cables">Cables</option>
                                <option value="Earthing / LA - lightning arrestor">Earthing / LA - lightning arrestor</option>
                                <option value="Data Logger">Data Logger</option>
                                <option value="Other Accessories">Other Accessories</option>
                              </select>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-[10px]">
                              <div>
                                <label className="block text-slate-400 font-bold">Qty</label>
                                <input
                                  type="text"
                                  value={bItem.qty}
                                  onChange={(e) => handleUpdateBomRow(bIdx, 'qty', e.target.value)}
                                  className="w-full border border-slate-200 rounded px-1.5 py-0.5 font-bold text-slate-900 bg-white"
                                />
                              </div>

                              <div>
                                <label className="block text-slate-400 font-bold">Unit</label>
                                <input
                                  type="text"
                                  value={bItem.unit}
                                  onChange={(e) => handleUpdateBomRow(bIdx, 'unit', e.target.value)}
                                  placeholder="e.g. Nos, Set, Mtr"
                                  className="w-full border border-slate-200 rounded px-1.5 py-0.5 font-bold text-slate-900 bg-white"
                                />
                              </div>

                              <div>
                                <label className="block text-slate-400 font-bold">Brand / Spec</label>
                                <input
                                  type="text"
                                  value={bItem.brand || ''}
                                  onChange={(e) => handleUpdateBomRow(bIdx, 'brand', e.target.value)}
                                  placeholder="e.g. Waaree, Polycab"
                                  className="w-full border border-slate-200 rounded px-1.5 py-0.5 font-bold text-slate-900 bg-white"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-white/80 border border-purple-100 rounded-xl text-center space-y-2">
                    <p className="text-xs text-purple-800 font-bold">No custom BOM rows configured.</p>
                    <p className="text-[10px] text-slate-500">Click "+ Add Item Row" or "🏷️ Add Header Row" below to add custom items.</p>
                  </div>
                )}

                <div className="flex flex-wrap justify-between items-center gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleAddBomRow}
                      className="px-2.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 font-black text-[11px] rounded-xl flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Plus className="w-3.5 h-3.5 text-purple-700" />
                      <span>➕ Add Item Row</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAddCategoryHeader}
                      className="px-2.5 py-1.5 bg-purple-200 hover:bg-purple-300 text-purple-950 font-black text-[11px] rounded-xl flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <span>🏷️ Add Header Row</span>
                    </button>
                  </div>

                  {bomItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBomItems([])}
                      className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                    >
                      Clear Custom BOM
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Line Items Builder with Multi-Select Product Catalog Picker */}
          <div className="border border-slate-200 p-4 rounded-xl bg-slate-50/60 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <p className="text-xs uppercase font-black text-slate-800 tracking-wider flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-emerald-600" />
                  <span>Proposal Line Items ({items.length})</span>
                </p>
                <p className="text-[10px] text-slate-400 font-semibold">
                  Add catalog items or custom hardware & installation components
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllItems}
                    className="px-2.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-[11px] rounded-xl border border-rose-200 flex items-center gap-1 transition-all cursor-pointer"
                    title="Clear All Items from Proposal"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All</span>
                  </button>
                )}

                {/* Multi-Select Products Button */}
                <button
                  type="button"
                  onClick={() => setIsMultiModalOpen(true)}
                  className="w-full sm:w-auto px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
                  <span>➕ Multi-Select Products</span>
                </button>
              </div>
            </div>

            {/* Product Catalog Quick Single Picker */}
            {products.length > 0 && (
              <div>
                <label className="block text-slate-500 mb-1 text-[11px] font-bold">Quick Single Add from Catalog</label>
                <select
                  value={selectedCatalogProdId}
                  onChange={(e) => handleCatalogProductSelect(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-2.5 py-2 bg-white text-slate-800 font-bold cursor-pointer text-[11px]"
                >
                  <option value="">-- Choose Product from Catalog --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      [{p.brand ? p.brand.toUpperCase() : p.category.toUpperCase().replace('_', ' ')}] {p.name} — ₹{p.rate.toLocaleString('en-IN')} / {p.unit || 'Nos'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Manual Single Item Input Row */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Component name..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-2.5 py-2 bg-white font-semibold"
                />
              </div>
              <div className="w-14">
                <input
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl px-2 py-2 bg-white text-center font-bold"
                />
              </div>
              <div className="w-24">
                <input
                  type="number"
                  min={0}
                  placeholder="Rate (₹)"
                  value={newItemRate || ''}
                  onChange={(e) => setNewItemRate(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl px-2 py-2 bg-white font-bold"
                />
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl h-[36px] cursor-pointer transition-colors"
                title="Add Item to Proposal"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Interactive Items List with Explicit Delete Button on Every Card */}
            {items.length > 0 ? (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {items.map((it, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all space-y-2"
                  >
                    {/* Header Row: Item Name + Brand Badge + Explicit Red Delete Button */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {it.brand && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 shrink-0">
                              🏷️ {it.brand}
                            </span>
                          )}
                          <input
                            type="text"
                            value={it.itemName}
                            onChange={(e) => handleUpdateItemName(idx, e.target.value)}
                            className="font-black text-slate-900 text-xs bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:bg-slate-50 px-1 py-0.5 rounded flex-1 min-w-0"
                            placeholder="Item name..."
                          />
                        </div>

                        {/* Explicit Red Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 rounded-lg border border-rose-200 flex items-center gap-1 text-[11px] font-extrabold shrink-0 transition-colors cursor-pointer"
                          title="Delete / Remove this product from proposal"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>Delete</span>
                        </button>
                      </div>

                      {/* Description Input / Display */}
                      <div>
                        <input
                          type="text"
                          value={it.description || ''}
                          onChange={(e) => handleUpdateItemDescription(idx, e.target.value)}
                          placeholder="+ Add item description..."
                          className="w-full text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-100 focus:border-slate-300 focus:bg-white rounded px-2 py-1 placeholder:italic"
                        />
                      </div>
                    </div>

                    {/* Bottom Row: Qty Controls, Rate Input & Item Total Amount */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                      {/* Qty Counter */}
                      <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-400 mr-1">Qty:</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateItemQty(idx, it.qty - 1)}
                          className="p-1 bg-white hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                          title="Reduce quantity (removes if 0)"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={it.qty}
                          onChange={(e) => handleUpdateItemQty(idx, parseInt(e.target.value) || 0)}
                          className="w-9 text-center font-black text-slate-900 bg-white border border-slate-200 rounded text-xs py-0.5"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateItemQty(idx, it.qty + 1)}
                          className="p-1 bg-white hover:bg-slate-200 rounded text-slate-700 cursor-pointer"
                          title="Increase quantity"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Rate Input */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-400">Rate: ₹</span>
                        <input
                          type="number"
                          min={0}
                          value={it.rate}
                          onChange={(e) => handleUpdateItemRate(idx, parseFloat(e.target.value) || 0)}
                          className="w-20 text-right font-extrabold text-slate-900 border border-slate-200 rounded px-1.5 py-0.5 bg-white text-xs"
                        />
                      </div>

                      {/* Total Amount */}
                      <div className="text-right">
                        <span className="font-black text-slate-900 text-xs">
                          ₹{it.amount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-slate-400 py-3 italic">
                No items added. Click "Multi-Select Products" or add items above.
              </p>
            )}

            {/* Comprehensive Dynamic Pricing Summary Badge */}
            <div className="bg-slate-900 text-white p-3 rounded-xl space-y-1.5 text-xs shadow-inner">
              <div className="flex justify-between text-slate-300">
                <span>Items Subtotal ({items.length} items):</span>
                <span className="font-bold text-white">₹{subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-blue-300">
                <span>GST Tax ({gstRate}%):</span>
                <span>+ ₹{taxAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Subtotal + Tax:</span>
                <span className="font-bold">₹{(subtotal + taxAmount).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-amber-300">
                <span>Govt Subsidy Credit:</span>
                <span>- ₹{subsidyVal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-800 text-sm font-black">
                <span className="text-emerald-400">Net Customer Payable:</span>
                <span className="text-emerald-400">₹{grandTotal > 0 ? grandTotal.toLocaleString('en-IN') : 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right 8-Page Live Document Viewer (8 cols) */}
        <div className={`lg:col-span-8 bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-800 shadow-2xl space-y-4 ${
          mobileTab === 'preview' ? 'block' : 'hidden lg:block'
        }`}>
          {/* Controls Bar: Zoom & Page Jump Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 text-white">
            <div className="flex items-center space-x-2">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-200">
                Live 8-Page Scrollable Preview
              </span>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center space-x-1.5 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setZoomScale(Math.max(0.4, zoomScale - 0.1))}
                className="p-1 hover:bg-slate-700 text-slate-300 rounded cursor-pointer transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-emerald-400 font-mono w-12 text-center select-none">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomScale(Math.min(1.2, zoomScale + 0.1))}
                className="p-1 hover:bg-slate-700 text-slate-300 rounded cursor-pointer transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-3.5 bg-slate-700 mx-1"></div>

              <button
                type="button"
                onClick={() => setZoomScale(0.75)}
                className="p-1 hover:bg-slate-700 text-slate-300 rounded cursor-pointer transition-colors"
                title="Reset Zoom to 75%"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Page Jump Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pb-2 text-[10px] font-extrabold text-slate-300 overflow-x-auto">
            <span className="text-slate-500 uppercase tracking-wider mr-1">Jump to Page:</span>
            {[
              '1. Cover',
              '2. About',
              '3. Vision',
              '4. 3D Renders',
              '5. Commercials',
              '6. BOM',
              '7. Warranty & Terms',
              '8. Testimonials & Contact'
            ].map((pLabel, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => scrollToPage(idx)}
                className="bg-slate-800 hover:bg-emerald-600 hover:text-white px-2 py-1 rounded-lg border border-slate-700/80 transition-colors cursor-pointer"
              >
                {pLabel}
              </button>
            ))}
          </div>

          {/* 8-Page Render Scroll Container */}
          <div
            ref={previewScrollRef}
            className="overflow-y-auto overflow-x-auto h-[75vh] p-4 bg-slate-950/90 rounded-xl border border-slate-800 flex flex-col items-center select-none"
          >
            <div
              ref={contentRef}
              style={{
                transform: `scale(${zoomScale})`,
                transformOrigin: 'top center',
                transition: 'transform 0.2s ease-out',
                marginBottom: contentHeight ? `-${contentHeight * (1 - zoomScale)}px` : undefined
              }}
              className="quotation-print-container"
              dangerouslySetInnerHTML={{ __html: proposalHtml }}
            />
          </div>
        </div>
      </div>

      {/* MULTI-SELECT PRODUCT CATALOG MODAL */}
      {isMultiModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    Product Catalog Batch Selector
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2 mt-1">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  <span>Multi-Select Products to Add to Quotation</span>
                </h2>
                <p className="text-xs text-slate-400 font-medium">
                  Check multiple items, adjust quantity and unit rates, then add all at once.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMultiModalOpen(false)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Filter Tabs */}
            <div className="px-6 pt-4 pb-2 border-b border-slate-100 flex gap-2 overflow-x-auto text-xs font-bold bg-slate-50">
              {[
                { id: 'all', label: 'All Products' },
                { id: 'solar_panel', label: '☀️ Solar Panels' },
                { id: 'inverter', label: '⚡ Inverters' },
                { id: 'battery', label: '🔋 Batteries' },
                { id: 'structure', label: '🏗️ Structures' },
                { id: 'accessories', label: '🔌 Cables & Protection' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMultiCategoryFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                    multiCategoryFilter === tab.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Product List */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3">
              {products
                .filter(p => multiCategoryFilter === 'all' || p.category === multiCategoryFilter)
                .map(prod => {
                  const selState = multiSelectedMap[prod.id] || { selected: false, qty: 1, rate: prod.rate };
                  const isChecked = selState.selected;
                  const isAlreadyInProposal = items.some(it => it.itemName === prod.name);
                  const itemTotal = (selState.qty || 1) * (selState.rate !== undefined ? selState.rate : prod.rate);

                  return (
                    <div
                      key={prod.id}
                      className={`p-3 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isChecked
                          ? 'border-emerald-500 bg-emerald-50/40 shadow-xs'
                          : isAlreadyInProposal
                          ? 'border-emerald-200 bg-slate-50/60'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {/* Left Checkbox & Name */}
                      <div className="flex items-center gap-3 flex-1">
                        <div
                          onClick={() => handleToggleMultiProduct(prod.id, prod.rate)}
                          className="text-emerald-600 cursor-pointer flex-shrink-0"
                          title={isChecked ? "Deselect Product" : "Select Product"}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-5 h-5 text-emerald-600 fill-emerald-100" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                        <div className="flex-1 cursor-pointer" onClick={() => handleToggleMultiProduct(prod.id, prod.rate)}>
                          <div className="flex items-center gap-2 flex-wrap">
                            {prod.brand && (
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                                🏷️ {prod.brand}
                              </span>
                            )}
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                              📐 {prod.unit || 'Nos'}
                            </span>
                            <span className="font-extrabold text-slate-900 text-xs">{prod.name}</span>
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {prod.category.replace('_', ' ')}
                            </span>
                            {isAlreadyInProposal && (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Added in Proposal
                              </span>
                            )}
                          </div>
                          {prod.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-1">{prod.description}</p>
                          )}
                        </div>
                      </div>

                      {/* Right Controls: Qty, Rate, Total & Remove Action */}
                      <div className="flex items-center gap-3 self-end sm:self-center">
                        {/* Qty Counter */}
                        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                          <button
                            type="button"
                            onClick={() => handleUpdateMultiProdQty(prod.id, -1, prod.rate)}
                            className="p-1 bg-white hover:bg-slate-200 rounded-lg text-slate-700 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-7 text-center font-black text-xs text-slate-900">
                            {selState.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateMultiProdQty(prod.id, 1, prod.rate)}
                            className="p-1 bg-white hover:bg-slate-200 rounded-lg text-slate-700 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Rate Input */}
                        <div className="w-24">
                          <label className="block text-[9px] font-bold text-slate-400 uppercase">Rate (₹)</label>
                          <input
                            type="number"
                            min={0}
                            value={selState.rate !== undefined ? selState.rate : prod.rate}
                            onChange={(e) => handleUpdateMultiProdRate(prod.id, parseFloat(e.target.value) || 0, prod.rate)}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1 font-bold text-xs bg-white text-slate-900"
                          />
                        </div>

                        {/* Item Total Preview */}
                        <div className="w-20 text-right">
                          <label className="block text-[9px] font-bold text-slate-400 uppercase">Total</label>
                          <span className="font-black text-xs text-slate-900">
                            ₹{itemTotal.toLocaleString('en-IN')}
                          </span>
                        </div>

                        {/* Direct Remove from Proposal Button if already added */}
                        {isAlreadyInProposal && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemByName(prod.name)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl border border-rose-200 transition-colors cursor-pointer"
                            title="Remove this product from proposal"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Modal Sticky Footer Bar */}
            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3">
              <div>
                <span className="text-xs font-bold text-slate-600">
                  Selected:{' '}
                  <strong className="text-emerald-700 font-black">
                    {Object.values(multiSelectedMap).filter(s => s.selected).length} Products
                  </strong>
                </span>
                <span className="text-xs font-bold text-slate-600 ml-4">
                  Subtotal Preview:{' '}
                  <strong className="text-slate-900 font-black">
                    ₹{Object.entries(multiSelectedMap)
                      .filter(([_, s]) => s.selected)
                      .reduce((sum, [pId, s]) => {
                        const p = products.find(prod => prod.id === pId);
                        const rate = s.rate !== undefined ? s.rate : (p?.rate || 0);
                        return sum + s.qty * rate;
                      }, 0)
                      .toLocaleString('en-IN')}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {Object.values(multiSelectedMap).some(s => s.selected) && (
                  <button
                    type="button"
                    onClick={handleClearMultiSelections}
                    className="px-3 py-2.5 border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Deselect All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMultiModalOpen(false)}
                  className="w-1/2 sm:w-auto px-4 py-2.5 border border-slate-300 text-slate-700 hover:bg-slate-200 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAddAllSelectedProducts}
                  className="w-1/2 sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Selected Products to Proposal</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuotationDocument;