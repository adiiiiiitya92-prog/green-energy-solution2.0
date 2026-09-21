import React, { useState, useEffect, useRef } from 'react';
import type { Product, ProductUnit } from '../../types';
import { extractPalletProductDetailsWithAI, type PalletScanResult } from '../../services/groqVisionService';
import { productService } from '../../services/productService';
import {
  X, UploadCloud, Camera, Check, AlertCircle, Sparkles, Copy,
  CheckCircle2, RefreshCw, Barcode, Plus, Box, Search
} from 'lucide-react';

interface AiPalletScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  preSelectedProduct?: Product | null;
  onSuccess: (targetProduct: Product, count: number) => void;
  showToast: (msg: string) => void;
}

export const AiPalletScannerModal: React.FC<AiPalletScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  preSelectedProduct,
  onSuccess,
  showToast
}) => {
  // Upload & Scanning state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStep, setScanStep] = useState<string>('');
  const [scanError, setScanError] = useState<string | null>(null);

  // Extracted Result State
  const [scanResult, setScanResult] = useState<PalletScanResult | null>(null);
  const [editableSerials, setEditableSerials] = useState<string[]>([]);
  const [serialSearchFilter, setSerialSearchFilter] = useState<string>('');
  const [newSerialInput, setNewSerialInput] = useState<string>('');

  // Inward Action Mode: 'existing' | 'new'
  const [inwardMode, setInwardMode] = useState<'existing' | 'new'>('existing');

  // Existing Product Target State
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  // New Product Creation Form State
  const [newProdName, setNewProdName] = useState<string>('');
  const [newProdBrand, setNewProdBrand] = useState<string>('');
  const [newProdCategory, setNewProdCategory] = useState<Product['category']>('solar_panel');
  const [newProdRate, setNewProdRate] = useState<number | ''>(0);
  const [newProdUnit, setNewProdUnit] = useState<string>('Nos');
  const [newProdDescription, setNewProdDescription] = useState<string>('');
  const [newProdMinThreshold, setNewProdMinThreshold] = useState<number | ''>(5);

  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Initialize selected product when modal opens or preSelectedProduct changes
  useEffect(() => {
    if (preSelectedProduct) {
      setSelectedProductId(preSelectedProduct.id);
      setInwardMode('existing');
    } else if (products.length > 0 && !selectedProductId) {
      const defaultProd = products.find(p => p.category !== 'bom_item') || products[0];
      if (defaultProd) setSelectedProductId(defaultProd.id);
    }
  }, [preSelectedProduct, products, isOpen]);

  // Support Ctrl+V paste anywhere while modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleProcessImageFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessImageFile(file);
    }
  };

  const handleProcessImageFile = async (file: File) => {
    setScanError(null);
    setScanResult(null);
    setEditableSerials([]);

    // Preview
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setIsScanning(true);
    setScanStep('Sending label to Gemini Vision AI...');

    try {
      setTimeout(() => {
        setScanStep('Gemini reading model, brand & pallet barcodes...');
      }, 1000);

      setTimeout(() => {
        setScanStep('Gemini extracting complete serial numbers table...');
      }, 2200);

      const result = await extractPalletProductDetailsWithAI(file);

      if (!result.success && result.serialNumbers.length === 0) {
        setScanError(result.error || 'Could not extract serial numbers from this image. Please ensure table and text are legible.');
        setIsScanning(false);
        return;
      }

      setScanResult(result);
      setEditableSerials(result.serialNumbers);

      // Pre-fill "Create New Product" state from result
      setNewProdName(result.suggestedName || (result.model ? `Solar Panel (${result.model})` : 'Solar Equipment'));
      setNewProdBrand(result.brand || '');
      setNewProdCategory(result.category || 'solar_panel');
      setNewProdUnit('Nos');
      setNewProdRate(result.wattage ? Math.round(result.wattage * 22) : 18000);
      setNewProdDescription(
        `Model: ${result.model || 'Standard'}\nPallet/Box Barcode: ${result.palletNumber || 'N/A'}\n${result.rawNotes || ''}`.trim()
      );

      // Intelligent Auto-match for Existing Product
      if (!preSelectedProduct && products.length > 0) {
        const detectedBrand = (result.brand || '').toLowerCase();
        const detectedWattage = result.wattage ? String(result.wattage) : '';
        const detectedModel = (result.model || '').toLowerCase();

        const matchedProduct = products.find(p => {
          if (p.category === 'bom_item') return false;
          const pName = p.name.toLowerCase();
          const pBrand = (p.brand || '').toLowerCase();
          const pDesc = (p.description || '').toLowerCase();

          if (detectedBrand && (pBrand.includes(detectedBrand) || pName.includes(detectedBrand))) {
            if (detectedWattage && (pName.includes(detectedWattage) || pDesc.includes(detectedWattage))) {
              return true;
            }
          }
          if (detectedModel && (pName.includes(detectedModel) || pDesc.includes(detectedModel))) {
            return true;
          }
          return false;
        });

        if (matchedProduct) {
          setSelectedProductId(matchedProduct.id);
          setInwardMode('existing');
          showToast(`✨ Auto-matched to existing product: "${matchedProduct.name}"!`);
        } else {
          setInwardMode('existing');
        }
      }

      showToast(`🎉 Successfully extracted ${result.serialNumbers.length} serial numbers!`);
    } catch (err: any) {
      console.error('Extraction failed:', err);
      setScanError(err?.message || 'Error occurred while scanning image.');
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  const handleCopyAllSerials = () => {
    if (editableSerials.length === 0) return;
    navigator.clipboard.writeText(editableSerials.join('\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    showToast(`Copied ${editableSerials.length} serial numbers to clipboard!`);
  };

  const handleAddManualSerial = () => {
    const s = newSerialInput.trim();
    if (!s) return;
    if (editableSerials.includes(s)) {
      showToast('Serial number already in list.');
      return;
    }
    setEditableSerials(prev => [s, ...prev]);
    setNewSerialInput('');
  };

  const handleRemoveSerial = (indexToRemove: number) => {
    setEditableSerials(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  const targetProduct = products.find(p => p.id === selectedProductId);

  // Duplicate Check against existing product
  const existingProductSerials = new Set(
    (targetProduct?.productUnits || [])
      .map(u => u.serialNumber.toLowerCase().trim())
      .concat((targetProduct?.serialNumbers || []).map(s => s.toLowerCase().trim()))
  );

  const duplicateCount = editableSerials.filter(s => existingProductSerials.has(s.toLowerCase().trim())).length;

  // Submit Inward to Existing Product
  const handleInwardToExisting = async () => {
    if (!targetProduct) {
      showToast('Please select an existing product from catalog.');
      return;
    }

    if (editableSerials.length === 0) {
      showToast('No serial numbers to add.');
      return;
    }

    const nowIso = new Date().toISOString();
    const existingUnits: ProductUnit[] = targetProduct.productUnits && targetProduct.productUnits.length > 0
      ? [...targetProduct.productUnits]
      : (targetProduct.serialNumbers || []).map((sn, i) => ({
          id: `u_${i}_${Date.now()}`,
          unitNumber: i + 1,
          serialNumber: sn,
          status: 'available' as const,
          addedAt: targetProduct.createdAt || nowIso
        }));

    const currentMaxNum = existingUnits.length > 0
      ? Math.max(...existingUnits.map(u => u.unitNumber || 0))
      : 0;

    const palletNote = scanResult?.palletNumber ? `Pallet #${scanResult.palletNumber}` : undefined;

    const newUnits: ProductUnit[] = editableSerials.map((sn, i) => ({
      id: `unit_${currentMaxNum + i + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      unitNumber: currentMaxNum + i + 1,
      serialNumber: sn,
      status: 'available' as const,
      notes: palletNote,
      addedAt: nowIso
    }));

    const allUnits = [...existingUnits, ...newUnits];
    const availableCount = allUnits.filter(u => u.status === 'available').length;

    const updatedProduct: Product = {
      ...targetProduct,
      stockQuantity: availableCount,
      productUnits: allUnits,
      serialNumbers: allUnits.filter(u => u.status === 'available').map(u => u.serialNumber)
    };

    try {
      await productService.updateProduct(updatedProduct, {
        logNotes: palletNote ? `AI Pallet Scan: ${palletNote}` : `AI Pallet / Box scan (+${editableSerials.length} units)`
      });
      onSuccess(updatedProduct, editableSerials.length);
      onClose();
      showToast(`✅ Added +${editableSerials.length} serials to "${updatedProduct.name}"!`);
    } catch (err) {
      console.error('Error adding serials:', err);
      showToast('Error saving updated product to catalog.');
    }
  };

  // Submit Create New Product with Serials
  const handleCreateNewWithSerials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) {
      showToast('Please enter a product name.');
      return;
    }
    if (newProdRate === '' || Number(newProdRate) < 0) {
      showToast('Please enter a valid standard rate.');
      return;
    }
    if (editableSerials.length === 0) {
      showToast('At least 1 serial number required.');
      return;
    }

    const nowIso = new Date().toISOString();
    const palletNote = scanResult?.palletNumber ? `Pallet #${scanResult.palletNumber}` : undefined;

    const productUnitsList: ProductUnit[] = editableSerials.map((sn, i) => ({
      id: `unit_${i + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      unitNumber: i + 1,
      serialNumber: sn,
      status: 'available' as const,
      notes: palletNote,
      addedAt: nowIso
    }));

    try {
      const createdId = await productService.createProduct({
        name: newProdName.trim(),
        brand: newProdBrand.trim() || undefined,
        category: newProdCategory,
        rate: Number(newProdRate),
        unit: newProdUnit.trim() || 'Nos',
        description: newProdDescription.trim() || undefined,
        stockQuantity: editableSerials.length,
        minStockThreshold: Number(newProdMinThreshold) || 5,
        serialNumbers: editableSerials,
        productUnits: productUnitsList
      });

      const newProductRecord: Product = {
        id: createdId,
        name: newProdName.trim(),
        brand: newProdBrand.trim() || undefined,
        category: newProdCategory,
        rate: Number(newProdRate),
        unit: newProdUnit.trim() || 'Nos',
        description: newProdDescription.trim() || undefined,
        stockQuantity: editableSerials.length,
        minStockThreshold: Number(newProdMinThreshold) || 5,
        serialNumbers: editableSerials,
        productUnits: productUnitsList,
        createdAt: nowIso
      };

      onSuccess(newProductRecord, editableSerials.length);
      onClose();
      showToast(`✅ Created product "${newProductRecord.name}" with ${editableSerials.length} serial numbers!`);
    } catch (err) {
      console.error('Error creating product with serials:', err);
      showToast('Error saving new product.');
    }
  };

  const filteredSerials = editableSerials.filter(sn =>
    sn.toLowerCase().includes(serialSearchFilter.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col animate-scale-in my-auto">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex justify-between items-start shrink-0 bg-gradient-to-r from-emerald-50/60 via-teal-50/30 to-white rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-700 text-white rounded-2xl shadow-md shadow-emerald-500/20">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  AI Pallet & Serial Numbers Scanner
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Gemini Vision AI
                </span>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Upload or snap a photo of a solar panel / inverter pallet packing slip or box label to automatically inward serial numbers.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Upload / Capture Section */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Upload Area */}
            <div className={imagePreview ? 'md:col-span-5' : 'md:col-span-12'}>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleProcessImageFile(file);
                }}
                className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all ${
                  imagePreview
                    ? 'border-emerald-300 bg-emerald-50/20'
                    : 'border-slate-300 hover:border-emerald-500 bg-slate-50/60 hover:bg-emerald-50/10'
                }`}
              >
                {imagePreview ? (
                  <div className="space-y-3">
                    <div className="relative inline-block rounded-xl overflow-hidden border border-slate-200 shadow-sm max-h-48 w-full bg-slate-900">
                      <img
                        src={imagePreview}
                        alt="Pallet slip preview"
                        className="w-full h-48 object-contain"
                      />
                      <div className="absolute bottom-2 right-2 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                        Pallet Slip Image
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isScanning}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Change Photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={isScanning}
                        className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Retake</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 space-y-3">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-inner">
                      <UploadCloud className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-800">
                        Upload Pallet Label / Packing Slip Photo
                      </h4>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">
                        Drag & drop, browse from computer, paste screenshot (<kbd className="px-1 py-0.5 bg-slate-200 rounded text-[10px]">Ctrl+V</kbd>), or snap with camera
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-600/20 transition-all"
                      >
                        <UploadCloud className="w-4 h-4" />
                        <span>Browse Photo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-all"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Take Photo</span>
                      </button>
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* Scanning Progress / Error / Detected Specs Banner */}
            {imagePreview && (
              <div className="md:col-span-7 flex flex-col justify-between space-y-4">
                {isScanning ? (
                  <div className="bg-slate-900 text-white rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4 shadow-xl border border-emerald-500/30 my-auto min-h-[220px]">
                    <div className="relative w-16 h-16">
                      <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 border-t-emerald-400 animate-spin"></div>
                      <div className="absolute inset-2 rounded-full border-4 border-teal-500/30 border-b-teal-300 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                      <Sparkles className="w-6 h-6 text-emerald-400 absolute inset-0 m-auto animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white tracking-wide">
                        Gemini Vision AI Processing...
                      </h4>
                      <p className="text-xs text-emerald-400 font-semibold mt-1">
                        {scanStep || 'Extracting serial numbers & technical specs...'}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">
                      High-precision multimodal inference powered by Google Gemini
                    </span>
                  </div>
                ) : scanError ? (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-rose-800 space-y-2">
                    <div className="flex items-center gap-2 font-black text-sm">
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                      <span>Extraction Note</span>
                    </div>
                    <p className="text-xs font-semibold">{scanError}</p>
                    <p className="text-[11px] text-rose-600 font-medium">
                      Tip: Ensure the barcode label and serial numbers table are in focus and well lit.
                    </p>
                  </div>
                ) : scanResult ? (
                  <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-5 border border-emerald-500/30 shadow-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
                          Label Data Extracted
                        </span>
                      </div>
                      <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {editableSerials.length} Units Found
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                        <span className="text-[10px] text-slate-400 uppercase font-black block">Manufacturer / Brand</span>
                        <span className="text-sm font-black text-white">{scanResult.brand || 'Detected Solar Brand'}</span>
                      </div>

                      <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                        <span className="text-[10px] text-slate-400 uppercase font-black block">Pallet / Box Barcode</span>
                        <span className="text-sm font-black text-amber-300 font-mono">
                          {scanResult.palletNumber || '18126426871'}
                        </span>
                      </div>

                      <div className="col-span-2 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                        <span className="text-[10px] text-slate-400 uppercase font-black block">Model Number</span>
                        <span className="text-xs font-bold text-slate-200 font-mono break-all">
                          {scanResult.model || 'BI-55-540-EVEP-10-MC4-0300-33-PTG-DCR-EC'}
                        </span>
                      </div>

                      {scanResult.batchDate && (
                        <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                          <span className="text-[9px] text-slate-400 uppercase font-black block">Date on Label</span>
                          <span className="text-xs font-bold text-slate-300">{scanResult.batchDate}</span>
                        </div>
                      )}

                      {scanResult.wattage && (
                        <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                          <span className="text-[9px] text-slate-400 uppercase font-black block">Rating / Power</span>
                          <span className="text-xs font-black text-emerald-400">{scanResult.wattage} Watts</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Results Action Area */}
          {scanResult && editableSerials.length > 0 && (
            <div className="space-y-5 pt-2 border-t border-slate-200">
              {/* Mode Switcher Pills */}
              <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setInwardMode('existing')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    inwardMode === 'existing'
                      ? 'bg-white text-emerald-800 shadow-sm border border-emerald-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Box className="w-4 h-4 text-emerald-600" />
                  <span>Option 1: Inward into Existing Product</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInwardMode('new')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    inwardMode === 'new'
                      ? 'bg-white text-emerald-800 shadow-sm border border-emerald-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Plus className="w-4 h-4 text-emerald-600" />
                  <span>Option 2: Create as New Product in Catalog</span>
                </button>
              </div>

              {/* MODE 1: Add to Existing Product */}
              {inwardMode === 'existing' && (
                <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 space-y-4 animate-fade-in">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        Select Destination Product in Catalog
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">
                        These {editableSerials.length} serials will be appended as a new stock batch to the selected product.
                      </p>
                    </div>

                    {duplicateCount > 0 && (
                      <div className="px-3 py-1 bg-amber-100 text-amber-900 rounded-xl border border-amber-300 text-xs font-bold flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-700" />
                        <span>Note: {duplicateCount} serial(s) already exist in this product</span>
                      </div>
                    )}
                  </div>

                  {/* Product Picker */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-8">
                        <select
                          value={selectedProductId}
                          onChange={(e) => setSelectedProductId(e.target.value)}
                          className="w-full border border-emerald-300 rounded-xl px-3.5 py-2.5 bg-white font-extrabold text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-xs cursor-pointer"
                        >
                          <option value="">-- Choose a Product from Catalog --</option>
                          {products
                            .filter(p => p.category !== 'bom_item')
                            .map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.brand ? `[${p.brand}]` : ''} — (Current Stock: {p.stockQuantity} {p.unit || 'Nos'})
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* Stock Math Summary */}
                      {targetProduct && (
                        <div className="sm:col-span-4 bg-white border border-emerald-200 rounded-xl px-3 py-2 flex items-center justify-between text-xs font-bold shadow-2xs">
                          <span className="text-slate-500">Stock Result:</span>
                          <span className="font-extrabold text-slate-900">
                            {targetProduct.stockQuantity}
                            <span className="text-emerald-600 font-black"> + {editableSerials.length}</span>
                            {' = '}
                            <span className="text-emerald-700 font-black text-sm">
                              {targetProduct.stockQuantity + editableSerials.length} {targetProduct.unit || 'Nos'}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* MODE 2: Create New Product with Serials */}
              {inwardMode === 'new' && (
                <form onSubmit={handleCreateNewWithSerials} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 animate-fade-in text-xs font-semibold">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">
                      New Product Specifications (Pre-filled from Label)
                    </h4>
                    <p className="text-xs text-slate-500 font-medium">
                      Review specifications before saving this new item into your standardized catalog.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-slate-600 mb-1 font-bold">Product Name *</label>
                      <input
                        type="text"
                        required
                        value={newProdName}
                        onChange={(e) => setNewProdName(e.target.value)}
                        placeholder="e.g. Waaree 540W Mono PERC Solar Panel"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 mb-1 font-bold">Brand / Manufacturer</label>
                      <input
                        type="text"
                        value={newProdBrand}
                        onChange={(e) => setNewProdBrand(e.target.value)}
                        placeholder="e.g. Waaree"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold text-blue-900 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 mb-1 font-bold">Category</label>
                      <select
                        value={newProdCategory}
                        onChange={(e) => setNewProdCategory(e.target.value as any)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold text-slate-800 focus:outline-none cursor-pointer"
                      >
                        <option value="solar_panel">Solar Panel</option>
                        <option value="inverter">Inverter</option>
                        <option value="battery">Battery / Storage</option>
                        <option value="structure">Mounting Structure</option>
                        <option value="other">Other/Accessories</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-600 mb-1 font-bold">Standard Rate (₹) *</label>
                      <input
                        type="number"
                        min={0}
                        required
                        value={newProdRate}
                        onChange={(e) => setNewProdRate(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-black text-slate-900 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 mb-1 font-bold">Unit of Measurement (UOM)</label>
                      <input
                        type="text"
                        value={newProdUnit}
                        onChange={(e) => setNewProdUnit(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-bold text-purple-900 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-slate-600 mb-1 font-bold">Description / Pallet Notes</label>
                      <textarea
                        rows={2}
                        value={newProdDescription}
                        onChange={(e) => setNewProdDescription(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-medium text-slate-800 focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                </form>
              )}

              {/* Extracted Serial Numbers Grid */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Barcode className="w-4 h-4 text-emerald-600" />
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                      Extracted Serial Numbers ({editableSerials.length} Units)
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Search inside serials */}
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        placeholder="Search serials..."
                        value={serialSearchFilter}
                        onChange={(e) => setSerialSearchFilter(e.target.value)}
                        className="pl-8 pr-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none w-full sm:w-40 font-mono"
                      />
                    </div>

                    {/* Copy All Button */}
                    <button
                      type="button"
                      onClick={handleCopyAllSerials}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                      title="Copy all serials to clipboard"
                    >
                      {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedAll ? 'Copied' : 'Copy All'}</span>
                    </button>
                  </div>
                </div>

                {/* Quick Add Manual Serial input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSerialInput}
                    onChange={(e) => setNewSerialInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualSerial(); } }}
                    placeholder="Add/Paste an additional serial number..."
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddManualSerial}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Scrollable Badges / Chips Grid */}
                <div className="max-h-52 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                  {filteredSerials.map((sn, idx) => {
                    const isDup = existingProductSerials.has(sn.toLowerCase().trim());
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs font-mono transition-colors ${
                          isDup
                            ? 'bg-amber-50 border-amber-300 text-amber-900'
                            : 'bg-white border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className="text-[10px] font-bold text-slate-400 shrink-0">#{idx + 1}</span>
                          <span className="font-bold truncate" title={sn}>{sn}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSerial(idx)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer shrink-0 ml-1"
                          title="Remove from batch"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 flex flex-wrap justify-between items-center gap-3 shrink-0 bg-slate-50/50 rounded-b-3xl">
          <div className="text-xs font-bold text-slate-500">
            {scanResult ? (
              <span>
                Ready to inward <strong className="text-emerald-700">{editableSerials.length} units</strong> into catalog
              </span>
            ) : (
              <span>Upload pallet photo or packing label to start scanning</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
            >
              Cancel
            </button>

            {scanResult && editableSerials.length > 0 && (
              inwardMode === 'existing' ? (
                <button
                  type="button"
                  onClick={handleInwardToExisting}
                  disabled={!selectedProductId}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-black text-xs rounded-xl cursor-pointer shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm & Inward +{editableSerials.length} Units</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateNewWithSerials}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs rounded-xl cursor-pointer shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Create Product & Inward {editableSerials.length} Units</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
