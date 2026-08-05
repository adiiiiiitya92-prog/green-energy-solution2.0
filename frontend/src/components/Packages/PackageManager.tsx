import React, { useEffect, useState } from 'react';
import type { Product, Package, PackageItem } from '../../types';
import { packageService } from '../../services/packageService';
import {
  Boxes,
  Plus,
  Search,
  Pencil,
  Trash2,
  Copy,
  Layers,
  Package as PackageIcon,
  CheckCircle2,
  X,
  Check,
  AlertCircle,
  ArrowUpDown,
  Filter,
  DollarSign,
  Tag
} from 'lucide-react';

interface PackageManagerProps {
  products: Product[];
  showToast: (msg: string) => void;
}

export const PackageManager: React.FC<PackageManagerProps> = ({ products, showToast }) => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const [commercialItems, setCommercialItems] = useState<PackageItem[]>([]);
  const [bomItems, setBomItems] = useState<PackageItem[]>([]);
  const [finalPriceInput, setFinalPriceInput] = useState<string>('');

  // Item Picker State
  const [selCommercialId, setSelCommercialId] = useState('');
  const [selCommercialQty, setSelCommercialQty] = useState(1);
  const [selCommercialRate, setSelCommercialRate] = useState(0);

  const [selBomId, setSelBomId] = useState('');
  const [selBomCategory, setSelBomCategory] = useState('Protection Devices');
  const [selBomQty, setSelBomQty] = useState(1);
  const [selBomRate, setSelBomRate] = useState(0);

  const commercialProducts = products.filter(p => p.category !== 'bom_item');
  const bomProducts = products.filter(p => p.category === 'bom_item');

  const loadPackages = async () => {
    setLoading(true);
    try {
      const list = await packageService.getPackages();
      setPackages(list);
    } catch (err) {
      console.error("Error loading packages:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingPackageId(null);
    setName('');
    setCode('');
    setDescription('');
    setStatus('active');
    setCommercialItems([]);
    setBomItems([]);
    setFinalPriceInput('');
    setSelCommercialId('');
    setSelCommercialQty(1);
    setSelCommercialRate(0);
    setSelBomId('');
    setSelBomCategory('Protection Devices');
    setSelBomQty(1);
    setSelBomRate(0);
    setShowModal(true);
  };

  const handleOpenEditModal = (pkg: Package) => {
    setEditingPackageId(pkg.id);
    setName(pkg.name);
    setCode(pkg.code || '');
    setDescription(pkg.description || '');
    setStatus(pkg.status);
    setCommercialItems(pkg.commercialItems || []);
    setBomItems(pkg.bomItems || []);
    setFinalPriceInput(String(pkg.finalPrice));
    setSelCommercialId('');
    setSelCommercialQty(1);
    setSelCommercialRate(0);
    setSelBomId('');
    setSelBomCategory('Protection Devices');
    setSelBomQty(1);
    setSelBomRate(0);
    setShowModal(true);
  };

  const handleCommercialSelect = (prodId: string) => {
    setSelCommercialId(prodId);
    const p = commercialProducts.find(prod => prod.id === prodId);
    if (p) {
      setSelCommercialRate(p.rate || 0);
    }
  };

  const handleBomSelect = (prodId: string) => {
    setSelBomId(prodId);
    const p = bomProducts.find(prod => prod.id === prodId);
    if (p) {
      setSelBomCategory(p.bomCategory || 'Protection Devices');
      setSelBomRate(p.rate || p.bomRate || 0);
    }
  };

  const handleAddCommercialItem = () => {
    if (!selCommercialId || selCommercialQty <= 0) {
      showToast('Please select a commercial product and enter a valid quantity.');
      return;
    }

    const p = commercialProducts.find(prod => prod.id === selCommercialId);
    if (!p) return;

    if (commercialItems.some(i => i.productId === selCommercialId)) {
      showToast('Product already added. You can adjust quantity directly in the list.');
      return;
    }

    const newItem: PackageItem = {
      productId: p.id,
      name: p.name,
      category: p.category,
      unit: p.unit || 'Nos',
      brand: p.brand || '',
      rate: selCommercialRate >= 0 ? selCommercialRate : p.rate,
      qty: selCommercialQty,
      description: p.description
    };

    setCommercialItems(prev => [...prev, newItem]);
    setSelCommercialId('');
    setSelCommercialQty(1);
    setSelCommercialRate(0);
  };

  const handleAddBomItem = () => {
    if (!selBomId || selBomQty <= 0) {
      showToast('Please select a BOM catalog item and enter a valid quantity.');
      return;
    }

    const p = bomProducts.find(prod => prod.id === selBomId);
    if (!p) return;

    if (bomItems.some(i => i.productId === selBomId)) {
      showToast('BOM item already added. Adjust quantity in the table.');
      return;
    }

    const newItem: PackageItem = {
      productId: p.id,
      name: p.name,
      category: 'bom_item',
      bomCategory: selBomCategory || p.bomCategory || 'Other Accessories',
      unit: p.unit || 'Nos',
      brand: p.brand || '',
      rate: selBomRate >= 0 ? selBomRate : (p.rate || 0),
      qty: selBomQty,
      description: p.description
    };

    setBomItems(prev => [...prev, newItem]);
    setSelBomId('');
    setSelBomQty(1);
    setSelBomRate(0);
  };

  const handleRemoveCommercialItem = (idx: number) => {
    setCommercialItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleRemoveBomItem = (idx: number) => {
    setBomItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateCommercialQty = (idx: number, newQty: number) => {
    const qty = Math.max(1, newQty);
    setCommercialItems(prev => prev.map((item, i) => i === idx ? { ...item, qty } : item));
  };

  const handleUpdateCommercialRate = (idx: number, newRate: number) => {
    const rate = Math.max(0, newRate);
    setCommercialItems(prev => prev.map((item, i) => i === idx ? { ...item, rate } : item));
  };

  const handleUpdateBomQty = (idx: number, newQty: number) => {
    const qty = Math.max(1, newQty);
    setBomItems(prev => prev.map((item, i) => i === idx ? { ...item, qty } : item));
  };

  const handleUpdateBomRate = (idx: number, newRate: number) => {
    const rate = Math.max(0, newRate);
    setBomItems(prev => prev.map((item, i) => i === idx ? { ...item, rate } : item));
  };

  const handleUpdateBomCategory = (idx: number, newCategory: string) => {
    setBomItems(prev => prev.map((item, i) => i === idx ? { ...item, bomCategory: newCategory } : item));
  };

  // Pricing calculations
  const calculatedCommercialTotal = commercialItems.reduce((sum, i) => sum + (i.qty * i.rate), 0);
  const calculatedBomTotal = bomItems.reduce((sum, i) => sum + (i.qty * i.rate), 0);
  const calculatedCombinedTotal = calculatedCommercialTotal + calculatedBomTotal;

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Please enter a Package Name.');
      return;
    }

    if (commercialItems.length === 0 && bomItems.length === 0) {
      showToast('Please add at least one Commercial Product or BOM item to the package.');
      return;
    }

    const finalPrice = finalPriceInput !== '' ? Number(finalPriceInput) : calculatedCombinedTotal;

    try {
      const saved = await packageService.savePackage({
        id: editingPackageId || undefined,
        name: name.trim(),
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        status,
        commercialItems,
        bomItems,
        calculatedCommercialTotal,
        calculatedBomTotal,
        calculatedCombinedTotal,
        finalPrice
      });

      showToast(`Package "${saved.name}" saved successfully!`);
      setShowModal(false);
      loadPackages();
    } catch (err) {
      console.error("Error saving package:", err);
      showToast('Error saving package.');
    }
  };

  const handleDuplicate = async (pkg: Package) => {
    try {
      const cloned = await packageService.duplicatePackage(pkg.id);
      showToast(`Package duplicated as "${cloned.name}"!`);
      loadPackages();
    } catch (err) {
      console.error(err);
      showToast('Error duplicating package.');
    }
  };

  const handleDelete = async (pkg: Package) => {
    if (confirm(`Are you sure you want to delete package "${pkg.name}"?`)) {
      try {
        await packageService.deletePackage(pkg.id);
        showToast(`Package "${pkg.name}" deleted successfully.`);
        loadPackages();
      } catch (err) {
        console.error(err);
        showToast('Error deleting package.');
      }
    }
  };

  const handleToggleStatus = async (pkg: Package) => {
    const newStatus = pkg.status === 'active' ? 'inactive' : 'active';
    try {
      await packageService.savePackage({
        ...pkg,
        status: newStatus
      });
      showToast(`Package "${pkg.name}" marked as ${newStatus}.`);
      loadPackages();
    } catch (err) {
      console.error(err);
      showToast('Error toggling status.');
    }
  };

  const filteredPackages = packages.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.code && p.code.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm">Reusable Packages Catalog</h3>
            <p className="text-xs text-slate-400">
              Bundle commercial components and BOM items into pre-priced system packages.
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create Package</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3">
        <div className="flex-1 flex items-center space-x-3 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/50">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search packages by name, code, or description..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="text-xs font-semibold text-slate-800 focus:outline-none w-full bg-transparent"
          />
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-[10px] uppercase font-bold text-slate-400">Status</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="all">All Statuses ({packages.length})</option>
            <option value="active">Active Only ({packages.filter(p => p.status === 'active').length})</option>
            <option value="inactive">Inactive ({packages.filter(p => p.status === 'inactive').length})</option>
          </select>
        </div>
      </div>

      {/* Package Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 animate-pulse text-xs font-semibold">
          Loading Package Directory...
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 p-10 text-center rounded-2xl space-y-3">
          <Boxes className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-700">No Packages Found</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchTerm ? `No package matches "${searchTerm}".` : 'Create reusable bundles of commercial products and BOM items for fast quotation population.'}
          </p>
          {!searchTerm && (
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs"
            >
              Create First Package
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.map(pkg => {
            const commCount = pkg.commercialItems?.length || 0;
            const bomCount = pkg.bomItems?.length || 0;

            return (
              <div
                key={pkg.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all p-5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-extrabold text-slate-800 text-sm">{pkg.name}</h4>
                        {pkg.status === 'active' ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black rounded-md uppercase">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 text-[9px] font-black rounded-md uppercase">
                            Inactive
                          </span>
                        )}
                      </div>
                      {pkg.code && (
                        <span className="inline-block text-[10px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-bold mt-1">
                          Code: {pkg.code}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => handleOpenEditModal(pkg)}
                        title="Edit Package"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(pkg)}
                        title="Duplicate Package"
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(pkg)}
                        title="Delete Package"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {pkg.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">{pkg.description}</p>
                  )}

                  {/* Included Items Summary */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5 text-xs font-semibold">
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <PackageIcon className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Commercial Products:</span>
                      </span>
                      <span className="font-extrabold text-slate-800">{commCount} items</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-purple-600" />
                        <span>BOM Catalog Items:</span>
                      </span>
                      <span className="font-extrabold text-slate-800">{bomCount} items</span>
                    </div>
                  </div>
                </div>

                {/* Price Breakdown Footer */}
                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Calculated Value</span>
                    <span className="text-xs font-bold text-slate-500">₹{pkg.calculatedCombinedTotal.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-extrabold text-indigo-600 block">Package Selling Price</span>
                    <span className="text-base font-black text-emerald-700">₹{pkg.finalPrice.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Package Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Boxes className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-800 text-base">
                  {editingPackageId ? 'Edit Package Builder' : 'Create New System Package'}
                </h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePackage} className="space-y-5 text-xs font-semibold">
              {/* Package Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 mb-1">Package Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 5kW Residential On-Grid Solar Package"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-indigo-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1">Package Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. PKG-5KW-ONGRID"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 mb-1">Package Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Includes 540W Mono PERC panels, 5kW Grid Tie Inverter & complete BOM accessories."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none cursor-pointer font-bold"
                  >
                    <option value="active">Active (Available in Quotations)</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Section 1: Commercial Products Picker */}
              <div className="border border-emerald-200 p-4 rounded-2xl bg-emerald-50/30 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <PackageIcon className="w-4 h-4 text-emerald-600" />
                    <span>Commercial Products Section ({commercialItems.length})</span>
                  </span>
                  <span className="text-xs font-black text-emerald-700">
                    Subtotal: ₹{calculatedCommercialTotal.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-slate-600 mb-1">Select Commercial Product</label>
                    <select
                      value={selCommercialId}
                      onChange={e => handleCommercialSelect(e.target.value)}
                      className="w-full border border-emerald-300 rounded-xl px-2.5 py-2 bg-white text-slate-800 font-bold cursor-pointer"
                    >
                      <option value="">-- Choose Commercial Product --</option>
                      {commercialProducts.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (₹{p.rate || 0})</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="block text-slate-600 mb-1">Unit Rate (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={selCommercialRate}
                      onChange={e => setSelCommercialRate(Number(e.target.value))}
                      className="w-full border border-emerald-300 rounded-xl px-2.5 py-1.5 bg-white font-bold"
                    />
                  </div>
                  <div className="w-20">
                    <label className="block text-slate-600 mb-1">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={selCommercialQty}
                      onChange={e => setSelCommercialQty(Number(e.target.value))}
                      className="w-full border border-emerald-300 rounded-xl px-2.5 py-1.5 bg-white font-bold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCommercialItem}
                    className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl h-[34px] cursor-pointer shrink-0"
                  >
                    + Add
                  </button>
                </div>

                {/* Table of added commercial items */}
                {commercialItems.length > 0 && (
                  <div className="bg-white rounded-xl border border-emerald-200/80 overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-emerald-100/50 text-emerald-900 border-b border-emerald-200">
                          <th className="px-3 py-2 font-bold">Product Name</th>
                          <th className="px-3 py-2 text-center font-bold">Rate (₹)</th>
                          <th className="px-3 py-2 text-center font-bold">Qty</th>
                          <th className="px-3 py-2 text-right font-bold">Line Total</th>
                          <th className="px-3 py-2 text-center font-bold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commercialItems.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-100 last:border-0 font-medium">
                            <td className="px-3 py-2 text-slate-900 font-bold">{item.name}</td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                value={item.rate}
                                onChange={e => handleUpdateCommercialRate(idx, Number(e.target.value))}
                                className="w-20 border border-slate-200 rounded px-1.5 py-0.5 text-center font-bold text-slate-800"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="number"
                                min={1}
                                value={item.qty}
                                onChange={e => handleUpdateCommercialQty(idx, Number(e.target.value))}
                                className="w-14 border border-slate-200 rounded px-1.5 py-0.5 text-center font-bold text-slate-800"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-extrabold text-emerald-700">
                              ₹{(item.qty * item.rate).toLocaleString('en-IN')}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveCommercialItem(idx)}
                                className="text-rose-500 hover:text-rose-700 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5 mx-auto" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section 2: BOM Items Picker */}
              <div className="border border-purple-200 p-4 rounded-2xl bg-purple-50/30 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-extrabold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-purple-600" />
                    <span>Bill of Materials (BOM) Section ({bomItems.length})</span>
                  </span>
                  <span className="text-xs font-black text-purple-800">
                    Subtotal: ₹{calculatedBomTotal.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap gap-2 items-end">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-slate-600 mb-1">Select BOM Item</label>
                    <select
                      value={selBomId}
                      onChange={e => handleBomSelect(e.target.value)}
                      className="w-full border border-purple-300 rounded-xl px-2.5 py-2 bg-white text-slate-800 font-bold cursor-pointer"
                    >
                      <option value="">-- Choose BOM Component --</option>
                      {bomProducts.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.bomCategory || 'Accessories'})</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-36">
                    <label className="block text-slate-600 mb-1">BOM Category Header</label>
                    <select
                      value={selBomCategory}
                      onChange={e => setSelBomCategory(e.target.value)}
                      className="w-full border border-purple-300 rounded-xl px-2 py-2 bg-white text-slate-800 text-[10px] font-bold cursor-pointer"
                    >
                      <option value="Solar Panels (PV Modules)">Solar Panels</option>
                      <option value="Solar String Inverter">Solar Inverter</option>
                      <option value="Solar Mounting Structure">Mounting Structure</option>
                      <option value="Protection Devices">Protection Devices</option>
                      <option value="Cables">Cables</option>
                      <option value="Earthing / LA - lightning arrestor">Earthing / LA</option>
                      <option value="Data Logger">Data Logger</option>
                      <option value="Other Accessories">Other Accessories</option>
                    </select>
                  </div>
                  <div className="w-20">
                    <label className="block text-slate-600 mb-1">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={selBomQty}
                      onChange={e => setSelBomQty(Number(e.target.value))}
                      className="w-full border border-purple-300 rounded-xl px-2 py-1.5 bg-white font-bold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBomItem}
                    className="px-3.5 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl h-[34px] cursor-pointer shrink-0"
                  >
                    + Add
                  </button>
                </div>

                {/* Table of added BOM items */}
                {bomItems.length > 0 && (
                  <div className="bg-white rounded-xl border border-purple-200/80 overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-purple-100/50 text-purple-950 border-b border-purple-200">
                          <th className="px-3 py-2 font-bold">BOM Item</th>
                          <th className="px-3 py-2 font-bold">Category Header</th>
                          <th className="px-3 py-2 text-center font-bold">Qty</th>
                          <th className="px-3 py-2 text-center font-bold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bomItems.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-100 last:border-0 font-medium">
                            <td className="px-3 py-2 text-slate-900 font-bold">{item.name}</td>
                            <td className="px-3 py-2">
                              <select
                                value={item.bomCategory || 'Other Accessories'}
                                onChange={e => handleUpdateBomCategory(idx, e.target.value)}
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-bold text-purple-900 bg-purple-50/40"
                              >
                                <option value="Solar Panels (PV Modules)">Solar Panels</option>
                                <option value="Solar String Inverter">Solar Inverter</option>
                                <option value="Solar Mounting Structure">Mounting Structure</option>
                                <option value="Protection Devices">Protection Devices</option>
                                <option value="Cables">Cables</option>
                                <option value="Earthing / LA - lightning arrestor">Earthing / LA</option>
                                <option value="Data Logger">Data Logger</option>
                                <option value="Other Accessories">Other Accessories</option>
                              </select>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="number"
                                min={1}
                                value={item.qty}
                                onChange={e => handleUpdateBomQty(idx, Number(e.target.value))}
                                className="w-14 border border-slate-200 rounded px-1.5 py-0.5 text-center font-bold text-slate-800"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveBomItem(idx)}
                                className="text-rose-500 hover:text-rose-700 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5 mx-auto" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section 3: Package Pricing Box */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-3 border border-indigo-500/30">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">
                    Package Price Calculation Summary
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Commercial Subtotal</span>
                    <span className="font-extrabold text-white">₹{calculatedCommercialTotal.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">BOM Subtotal</span>
                    <span className="font-extrabold text-white">₹{calculatedBomTotal.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-indigo-300 block">Calculated Combined</span>
                    <span className="font-extrabold text-emerald-400">₹{calculatedCombinedTotal.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <label className="block text-xs font-extrabold text-white mb-0.5">Final Package Selling Price (₹) *</label>
                    <p className="text-[10px] text-slate-400">Independent selling price for quotations (default is sum total).</p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    placeholder={`Defaults to ₹${calculatedCombinedTotal}`}
                    value={finalPriceInput}
                    onChange={e => setFinalPriceInput(e.target.value)}
                    className="w-full sm:w-48 bg-slate-800 border border-emerald-500/50 rounded-xl px-3 py-2 font-black text-emerald-400 text-base focus:outline-none"
                  />
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-xl font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md cursor-pointer"
                >
                  Save Package
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
