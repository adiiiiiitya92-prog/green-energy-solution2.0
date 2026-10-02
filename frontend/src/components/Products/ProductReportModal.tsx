import React, { useState, useMemo } from 'react';
import type { Product } from '../../types';
import { pdfService, exportProductCatalogToCSV } from '../../services/pdfService';
import dayjs from 'dayjs';
import {
  X, Download, FileSpreadsheet, FileText, Printer, CheckCircle2,
  AlertTriangle, Boxes, Package, Layers, Filter, Check, Eye
} from 'lucide-react';

interface ProductReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  currentTab: 'commercial' | 'bom' | 'packages' | 'history';
  searchTerm: string;
  selectedBomCategoryFilter: string;
  showToast: (msg: string) => void;
}

type ReportScope = 'all' | 'commercial' | 'bom' | 'low_stock' | 'current_view';

export const ProductReportModal: React.FC<ProductReportModalProps> = ({
  isOpen,
  onClose,
  products,
  currentTab,
  searchTerm,
  selectedBomCategoryFilter,
  showToast
}) => {
  const [reportScope, setReportScope] = useState<ReportScope>(() => {
    if (currentTab === 'bom') return 'bom';
    if (currentTab === 'commercial') return 'commercial';
    return 'all';
  });

  const [includeSerials, setIncludeSerials] = useState(true);
  const [includePrices, setIncludePrices] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Compute lists for each scope
  const commercialProducts = useMemo(() => products.filter(p => p.category !== 'bom_item'), [products]);
  const bomProducts = useMemo(() => products.filter(p => p.category === 'bom_item'), [products]);
  const lowStockProducts = useMemo(
    () => products.filter(p => (Number(p.stockQuantity) || 0) <= (Number(p.minStockThreshold) || 0)),
    [products]
  );

  const currentViewProducts = useMemo(() => {
    let base = products;
    if (currentTab === 'commercial') {
      base = commercialProducts;
    } else if (currentTab === 'bom') {
      base = selectedBomCategoryFilter === 'all'
        ? bomProducts
        : bomProducts.filter(p => p.bomCategory === selectedBomCategoryFilter);
    }
    if (!searchTerm.trim()) return base;
    const term = searchTerm.toLowerCase();
    return base.filter(p =>
      (p.name || '').toLowerCase().includes(term) ||
      (p.brand && p.brand.toLowerCase().includes(term)) ||
      (p.unit && p.unit.toLowerCase().includes(term)) ||
      (p.bomCategory && p.bomCategory.toLowerCase().includes(term)) ||
      (p.description && p.description.toLowerCase().includes(term)) ||
      (p.category || '').toLowerCase().includes(term)
    );
  }, [products, currentTab, selectedBomCategoryFilter, searchTerm, commercialProducts, bomProducts]);

  // Target products according to selected scope
  const targetProducts = useMemo(() => {
    switch (reportScope) {
      case 'commercial':
        return commercialProducts;
      case 'bom':
        return bomProducts;
      case 'low_stock':
        return lowStockProducts;
      case 'current_view':
        return currentViewProducts;
      case 'all':
      default:
        return products;
    }
  }, [reportScope, products, commercialProducts, bomProducts, lowStockProducts, currentViewProducts]);

  // Financial and stock calculations
  const totalStockUnits = useMemo(
    () => targetProducts.reduce((sum, p) => sum + (Number(p.stockQuantity) || 0), 0),
    [targetProducts]
  );

  const totalValuation = useMemo(
    () => targetProducts.reduce((sum, p) => sum + ((Number(p.rate) || 0) * (Number(p.stockQuantity) || 0)), 0),
    [targetProducts]
  );

  const lowStockCount = useMemo(
    () => targetProducts.filter(p => (Number(p.stockQuantity) || 0) <= (Number(p.minStockThreshold) || 0)).length,
    [targetProducts]
  );

  if (!isOpen) return null;

  const getScopeLabel = (scope: ReportScope): string => {
    switch (scope) {
      case 'commercial':
        return 'Commercial Products Catalog';
      case 'bom':
        return 'Bill of Materials (BOM) Catalog';
      case 'low_stock':
        return 'Low Stock Alert Inventory';
      case 'current_view':
        return `Current Active View (${currentTab.toUpperCase()})`;
      case 'all':
      default:
        return 'Complete Product & BOM Catalog';
    }
  };

  const handleDownloadPDF = async () => {
    if (targetProducts.length === 0) {
      alert('No products to export in selected scope.');
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const scopeLabel = getScopeLabel(reportScope);
      const title = `${scopeLabel.toUpperCase()} REPORT`;
      const blob = await pdfService.generateProductCatalogReportPDF(targetProducts, {
        title,
        scopeLabel,
        includeSerials,
        includePrices
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const sanitizedScope = reportScope.replace(/_/g, '-');
      a.download = `Green_Energy_Catalog_${sanitizedScope}_Report_${dayjs().format('YYYY_MM_DD')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      showToast(`PDF Report downloaded successfully (${targetProducts.length} items)!`);
      onClose();
    } catch (err) {
      console.error('Error generating PDF report:', err);
      alert('Failed to generate Product Catalog PDF Report.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadCSV = () => {
    if (targetProducts.length === 0) {
      alert('No products to export in selected scope.');
      return;
    }
    try {
      const prefix = `Green_Energy_Product_Catalog_${reportScope}`;
      exportProductCatalogToCSV(targetProducts, prefix, includeSerials, includePrices);
      showToast(`Excel/CSV Report exported successfully (${targetProducts.length} items)!`);
      onClose();
    } catch (err) {
      console.error('Error generating CSV report:', err);
      alert('Failed to export CSV report.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                Download Product Catalog Reports
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                  PDF & Excel
                </span>
              </h2>
              <p className="text-xs text-slate-300 font-medium">
                Official inventory valuation, stock audit, and serial number export
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-xl transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Step 1: Select Report Scope */}
          <div>
            <label className="text-xs font-black text-slate-800 uppercase tracking-wider block mb-2.5">
              1. Select Report Scope & Inventory Filter
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {/* Option: All */}
              <button
                type="button"
                onClick={() => setReportScope('all')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  reportScope === 'all'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Boxes className={`w-4 h-4 ${reportScope === 'all' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                    reportScope === 'all' ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {products.length}
                  </span>
                </div>
                <div className="font-extrabold text-xs">Complete Catalog</div>
                <div className="text-[10px] text-slate-400 font-medium">Commercial + BOM items</div>
              </button>

              {/* Option: Commercial Only */}
              <button
                type="button"
                onClick={() => setReportScope('commercial')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  reportScope === 'commercial'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Package className={`w-4 h-4 ${reportScope === 'commercial' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                    reportScope === 'commercial' ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {commercialProducts.length}
                  </span>
                </div>
                <div className="font-extrabold text-xs">Commercial Only</div>
                <div className="text-[10px] text-slate-400 font-medium">Panels, Inverters, etc.</div>
              </button>

              {/* Option: BOM Only */}
              <button
                type="button"
                onClick={() => setReportScope('bom')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  reportScope === 'bom'
                    ? 'border-purple-600 bg-purple-50/70 text-purple-900 ring-2 ring-purple-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Layers className={`w-4 h-4 ${reportScope === 'bom' ? 'text-purple-600' : 'text-slate-400'}`} />
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                    reportScope === 'bom' ? 'bg-purple-200 text-purple-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {bomProducts.length}
                  </span>
                </div>
                <div className="font-extrabold text-xs">BOM Catalog</div>
                <div className="text-[10px] text-slate-400 font-medium">Protection, Cables, HDGI</div>
              </button>

              {/* Option: Low Stock Alert */}
              <button
                type="button"
                onClick={() => setReportScope('low_stock')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  reportScope === 'low_stock'
                    ? 'border-rose-600 bg-rose-50/70 text-rose-900 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <AlertTriangle className={`w-4 h-4 ${reportScope === 'low_stock' ? 'text-rose-600' : 'text-amber-500'}`} />
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                    reportScope === 'low_stock' ? 'bg-rose-200 text-rose-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {lowStockProducts.length}
                  </span>
                </div>
                <div className="font-extrabold text-xs">Low Stock Alert</div>
                <div className="text-[10px] text-slate-400 font-medium">Items needing reorder</div>
              </button>

              {/* Option: Current View / Search */}
              <button
                type="button"
                onClick={() => setReportScope('current_view')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between col-span-2 sm:col-span-2 ${
                  reportScope === 'current_view'
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Filter className={`w-4 h-4 ${reportScope === 'current_view' ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="font-extrabold text-xs">Active Filtered View</span>
                  </div>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                    reportScope === 'current_view' ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {currentViewProducts.length} items
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-medium">
                  Matches current tab ({currentTab}) & search query {searchTerm ? `"${searchTerm}"` : '(None)'}
                </div>
              </button>
            </div>
          </div>

          {/* Live Valuation & Health Summary Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
              Scope Summary Metrics
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span className="text-[10px] text-slate-500 font-bold block">Selected Products</span>
                <span className="text-sm font-black text-slate-800">{targetProducts.length} Items</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold block">Total Stock Units</span>
                <span className="text-sm font-black text-slate-800">{totalStockUnits.toLocaleString('en-IN')} Units</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold block">Inventory Valuation</span>
                <span className="text-sm font-black text-emerald-600">₹{totalValuation.toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold block">Stock Health</span>
                {lowStockCount > 0 ? (
                  <span className="text-sm font-black text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    {lowStockCount} Low Stock
                  </span>
                ) : (
                  <span className="text-sm font-black text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    All In Stock
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Step 2: Content Customization Checkboxes */}
          <div>
            <label className="text-xs font-black text-slate-800 uppercase tracking-wider block mb-2">
              2. Report Content Options
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex items-center gap-2 cursor-pointer bg-white p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 flex-1">
                <input
                  type="checkbox"
                  checked={includeSerials}
                  onChange={(e) => setIncludeSerials(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-bold text-slate-800 block text-xs">Include Serial Numbers</span>
                  <span className="text-[10px] text-slate-400 block">Include serialized units & barcodes in report</span>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer bg-white p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 flex-1">
                <input
                  type="checkbox"
                  checked={includePrices}
                  onChange={(e) => setIncludePrices(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-bold text-slate-800 block text-xs">Include Rates & Valuation</span>
                  <span className="text-[10px] text-slate-400 block">Show unit price (₹) and stock total values</span>
                </div>
              </label>
            </div>
          </div>

          {/* Preview Snapshot of Products in this Scope */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <Eye className="w-3 h-3 text-slate-400" /> Preview Items ({targetProducts.length})
              </span>
              <span className="text-[10px] text-slate-400">First 5 shown</span>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
              {targetProducts.slice(0, 5).map((p, idx) => (
                <div key={p.id || idx} className="p-2 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 text-center text-slate-400 font-bold">{idx + 1}.</span>
                    <div className="truncate">
                      <span className="font-bold text-slate-800 truncate block">{p.name}</span>
                      <span className="text-[10px] text-slate-400">
                        {p.brand ? `${p.brand} • ` : ''}
                        {p.category === 'bom_item' ? (p.bomCategory || 'BOM') : (p.category || 'Standard')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-extrabold text-slate-700 block">
                      {p.stockQuantity || 0} {p.unit || 'Nos'}
                    </span>
                    {includePrices && (
                      <span className="text-[10px] text-emerald-600 font-bold">
                        ₹{((p.rate || 0) * (p.stockQuantity || 0)).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {targetProducts.length > 5 && (
                <div className="p-2 text-center text-[10px] text-slate-400 font-bold bg-slate-50">
                  + {targetProducts.length - 5} more products included in report export
                </div>
              )}
              {targetProducts.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400 font-semibold">
                  No products found matching the selected filter.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer / Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              title="Print Current Report View"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-slate-600 hover:text-slate-900 font-bold text-xs rounded-xl cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Export CSV Button */}
            <button
              type="button"
              onClick={handleDownloadCSV}
              disabled={targetProducts.length === 0}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export CSV / Excel</span>
            </button>

            {/* Download Official PDF Button */}
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPdf || targetProducts.length === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98] text-white rounded-xl font-black text-xs flex items-center gap-2 cursor-pointer transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingPdf ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 text-white" />
                  <span>Download PDF Report</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
