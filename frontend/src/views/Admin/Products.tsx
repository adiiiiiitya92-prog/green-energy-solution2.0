import React, { useEffect, useState } from 'react';
import type { Product } from '../../types';
import { productService } from '../../services/productService';
import { Plus, Search, Trash2, Tag, Layers, Package, Filter, Pencil, Check, X } from 'lucide-react';

export const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'commercial' | 'bom'>('commercial');
  const [selectedBomCategoryFilter, setSelectedBomCategoryFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddBomModal, setShowAddBomModal] = useState(false);

  // Form states (Commercial Product Add)
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState('Nos');
  const [category, setCategory] = useState<Product['category']>('solar_panel');
  const [rate, setRate] = useState(0);
  const [description, setDescription] = useState('');
  const [stockQuantity, setStockQuantity] = useState<number | ''>('');
  const [minStockThreshold, setMinStockThreshold] = useState<number | ''>('');

  // Form states (BOM Item Add)
  const [bomItemName, setBomItemName] = useState('');
  const [bomBrand, setBomBrand] = useState('');
  const [bomCategory, setBomCategory] = useState('Protection Devices');
  const [bomUnit, setBomUnit] = useState('Nos');
  const [bomRate, setBomRate] = useState(0);
  const [bomDescription, setBomDescription] = useState('');

  // Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editUnit, setEditUnit] = useState('Nos');
  const [editCategory, setEditCategory] = useState<Product['category']>('solar_panel');
  const [editBomCategory, setEditBomCategory] = useState('');
  const [editRate, setEditRate] = useState(0);
  const [editDescription, setEditDescription] = useState('');
  const [editStockQuantity, setEditStockQuantity] = useState<number | ''>('');
  const [editMinStockThreshold, setEditMinStockThreshold] = useState<number | ''>('');

  const loadProducts = async () => {
    const list = await productService.getProducts();
    setProducts(list);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || rate <= 0) {
      alert('Please fill out Product Name and a valid price Rate.');
      return;
    }

    try {
      await productService.createProduct({
        name,
        brand: brand.trim() || undefined,
        unit: unit.trim() || 'Nos',
        category,
        rate: Number(rate),
        description: description || undefined,
        stockQuantity: Number(stockQuantity) || 0,
        minStockThreshold: Number(minStockThreshold) || 0
      });

      alert(`Product "${name}" (${brand ? `Brand: ${brand}` : 'No Brand'}) successfully saved!`);

      // Reset Form
      setName('');
      setBrand('');
      setUnit('Nos');
      setCategory('solar_panel');
      setRate(0);
      setDescription('');
      setStockQuantity('');
      setMinStockThreshold('');
      setShowAddModal(false);
      await loadProducts();
    } catch (err) {
      console.error("Error creating product:", err);
      alert('Error saving product. Please try again.');
    }
  };

  const handleAddBomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bomItemName || bomRate < 0) {
      alert('Please enter Item Name and Price / Rate.');
      return;
    }

    try {
      await productService.createProduct({
        name: bomItemName,
        brand: bomBrand.trim() || undefined,
        unit: bomUnit.trim() || 'Nos',
        category: 'bom_item',
        bomCategory: bomCategory.trim() || 'General',
        rate: Number(bomRate),
        description: bomDescription || undefined,
        stockQuantity: 100,
        minStockThreshold: 10
      });

      alert(`Bill of Materials item "${bomItemName}" [Category: ${bomCategory}] saved to BOM Catalog!`);

      // Reset Form
      setBomItemName('');
      setBomBrand('');
      setBomCategory('Cables & Wiring');
      setBomUnit('Nos');
      setBomRate(0);
      setBomDescription('');
      setShowAddBomModal(false);
      setActiveTab('bom');
      await loadProducts();
    } catch (err) {
      console.error("Error creating BOM item:", err);
      alert('Error saving BOM item. Please try again.');
    }
  };

  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    setEditName(p.name);
    setEditBrand(p.brand || '');
    setEditUnit(p.unit || 'Nos');
    setEditCategory(p.category);
    setEditBomCategory(p.bomCategory || 'Cables & Wiring');
    setEditRate(p.rate);
    setEditDescription(p.description || '');
    setEditStockQuantity(p.stockQuantity !== undefined ? p.stockQuantity : '');
    setEditMinStockThreshold(p.minStockThreshold !== undefined ? p.minStockThreshold : '');
  };

  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editName || editRate < 0) {
      alert('Please provide product name and valid rate.');
      return;
    }

    try {
      const updated: Product = {
        ...editingProduct,
        name: editName.trim(),
        brand: editBrand.trim() || undefined,
        unit: editUnit.trim() || 'Nos',
        category: editCategory,
        bomCategory: editCategory === 'bom_item' ? (editBomCategory.trim() || 'General') : undefined,
        rate: Number(editRate),
        description: editDescription.trim() || undefined,
        stockQuantity: Number(editStockQuantity) || 0,
        minStockThreshold: Number(editMinStockThreshold) || 0
      };

      await productService.updateProduct(updated);
      alert(`Product "${updated.name}" details and specifications updated successfully!`);
      setEditingProduct(null);
      await loadProducts();
    } catch (err) {
      console.error("Error updating product:", err);
      alert('Error updating product specifications. Please try again.');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Delete this item from catalog? This will not affect existing generated quotations.')) {
      await productService.deleteProduct(id);
      loadProducts();
    }
  };

  const commercialProducts = products.filter(p => p.category !== 'bom_item');
  const bomProducts = products.filter(p => p.category === 'bom_item');

  const currentTabProducts = activeTab === 'commercial'
    ? commercialProducts
    : (selectedBomCategoryFilter === 'all'
        ? bomProducts
        : bomProducts.filter(p => p.bomCategory === selectedBomCategoryFilter));

  const filteredProducts = currentTabProducts.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.brand && p.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.unit && p.unit.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.bomCategory && p.bomCategory.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockItems = commercialProducts.filter(p => p.stockQuantity <= p.minStockThreshold);

  const getCategoryLabel = (cat: Product['category'], bCat?: string) => {
    if (cat === 'bom_item') {
      return bCat || 'Bill of Materials';
    }
    const labels: Record<string, string> = {
      solar_panel: 'Solar Panel',
      inverter: 'Inverter',
      battery: 'Battery / Storage',
      structure: 'Mounting Structure',
      other: 'Other/Accessories'
    };
    return labels[cat] || cat;
  };

  const bomCategoriesList = [
    'Protection Devices',
    'Cables',
    'Earthing / LA - lightning arrestor',
    'Data Logger',
    'Other Accessories'
  ];

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Product & BOM Catalog</h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Manage standardized inventory pricing, specifications, units, and Bill of Materials components.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Main Add Commercial Product Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>➕ Add Product</span>
          </button>

          {/* Dedicated Add BOM Item Button */}
          <button
            onClick={() => setShowAddBomModal(true)}
            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all"
          >
            <Layers className="w-4 h-4" />
            <span>📄 Add Bill of Materials (BOM)</span>
          </button>
        </div>
      </div>

      {/* Catalog Tabs Switcher (Commercial vs BOM Catalog) */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('commercial')}
          className={`pb-3 px-4 text-xs font-black flex items-center gap-2 transition-all cursor-pointer border-b-2 ${
            activeTab === 'commercial'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>📦 Commercial Products ({commercialProducts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('bom')}
          className={`pb-3 px-4 text-xs font-black flex items-center gap-2 transition-all cursor-pointer border-b-2 ${
            activeTab === 'bom'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>📄 Bill of Materials (BOM) Catalog ({bomProducts.length})</span>
        </button>
      </div>

      {/* BOM Category Filter Sub-Bar (Visible in BOM tab) */}
      {activeTab === 'bom' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-bold flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Filter Category:
          </span>
          <button
            onClick={() => setSelectedBomCategoryFilter('all')}
            className={`px-3 py-1 rounded-full font-bold text-[11px] transition-all cursor-pointer shrink-0 ${
              selectedBomCategoryFilter === 'all'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All BOM Categories ({bomProducts.length})
          </button>
          {bomCategoriesList.map(cat => {
            const count = bomProducts.filter(p => p.bomCategory === cat).length;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setSelectedBomCategoryFilter(cat)}
                className={`px-3 py-1 rounded-full font-bold text-[11px] transition-all cursor-pointer shrink-0 ${
                  selectedBomCategoryFilter === cat
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Search Input */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder={
            activeTab === 'commercial'
              ? "Search commercial products by name, brand, description, unit or category..."
              : "Search BOM components by item name, brand, description, category or unit..."
          }
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="text-xs font-medium text-slate-800 focus:outline-none w-full bg-transparent"
        />
      </div>

      {/* Low Stock Alert Banner (Commercial Products only) */}
      {activeTab === 'commercial' && lowStockItems.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-3">
            <span className="text-lg">⚠️</span>
            <div className="text-xs">
              <p className="font-extrabold text-amber-800">Inventory Alert: {lowStockItems.length} items are running low in stock!</p>
              <p className="text-amber-600 font-bold mt-0.5">Some components have fallen to or below their configured minimum alert threshold.</p>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map((p) => (
          <div
            key={p.id}
            className={`bg-white border rounded-2xl p-5 hover:shadow-md transition-shadow relative flex flex-col justify-between min-h-[190px] ${
              p.category === 'bom_item' ? 'border-purple-200/90 shadow-2xs' : 'border-slate-200'
            }`}
          >
            <div>
              <div className="flex justify-between items-start gap-2">
                <div className="flex flex-wrap gap-1 items-center">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border ${
                      p.category === 'bom_item'
                        ? 'bg-purple-100 text-purple-900 border-purple-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                    }`}
                  >
                    {getCategoryLabel(p.category, p.bomCategory)}
                  </span>

                  {p.brand && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black bg-blue-50 text-blue-800 border border-blue-100 uppercase tracking-wider">
                      🏷️ {p.brand}
                    </span>
                  )}

                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-900 border border-amber-200 uppercase tracking-wider">
                    📐 {p.unit || 'Nos'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* EDIT BUTTON */}
                  <button
                    onClick={() => handleOpenEditModal(p)}
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                    title="Edit Description & Specifications"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {/* DELETE BUTTON */}
                  <button
                    onClick={() => handleDeleteProduct(p.id)}
                    className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Remove from Catalog"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h4 className="text-sm font-bold text-slate-900 mt-2.5">{p.name}</h4>

              {/* Description & Technical Specifications Box */}
              {p.description ? (
                <div className="mt-2 bg-slate-50 border border-slate-100 p-2 rounded-xl text-xs text-slate-600 font-medium leading-relaxed">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Description & Specs:</span>
                  <p className="whitespace-pre-line line-clamp-3">{p.description}</p>
                </div>
              ) : (
                <button
                  onClick={() => handleOpenEditModal(p)}
                  className="mt-2 text-[11px] text-blue-600 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Pencil className="w-3 h-3" /> + Add description & specifications...
                </button>
              )}
            </div>

            {/* Stock Level Details (Commercial Only) */}
            {p.category !== 'bom_item' && (
              <div className="mt-3 flex items-center justify-between text-[11px] font-bold border-t border-slate-50 pt-2">
                <span className="text-slate-400">Stock Available:</span>
                <span className={`px-2 py-0.5 rounded-full font-black text-[9px] ${p.stockQuantity <= p.minStockThreshold ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>
                  {p.stockQuantity} {p.unit || 'units'}
                </span>
              </div>
            )}

            {/* Price Row */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-semibold">Standard Rate:</span>
              <span className="text-sm font-extrabold text-slate-950">
                ₹{p.rate.toLocaleString('en-IN')}{' '}
                <span className="text-[10px] font-medium text-slate-400">/ {p.unit || 'Nos'}</span>
              </span>
            </div>
          </div>
        ))}

        {filteredProducts.length === 0 && (
          <div className="col-span-full bg-slate-50 border-2 border-dashed border-slate-200 p-8 text-center rounded-xl">
            <Tag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-bold">
              {activeTab === 'commercial'
                ? 'No commercial products found. Click "➕ Add Product" to create new ones.'
                : 'No Bill of Materials (BOM) items found. Click "📄 Add Bill of Materials (BOM)" to add components like cables, earthing kits, or switches.'}
            </p>
          </div>
        )}
      </div>

      {/* MODAL 1: Add Commercial Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 m-4 animate-scale-in">
            <h3 className="text-lg font-black text-slate-900 mb-4">Add Commercial Product Template</h3>
            <form onSubmit={handleAddProduct} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-500 mb-1">Product/Item Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 540W Mono PERC Half-Cut Panel"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-bold text-slate-900"
                />
              </div>

              {/* Brand & Category Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Brand / Manufacturer</label>
                  <input
                    type="text"
                    list="brand-suggestions"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="e.g. Waaree, Growatt, Vikram"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-bold text-blue-900"
                  />
                  <datalist id="brand-suggestions">
                    <option value="Waaree" />
                    <option value="Vikram Solar" />
                    <option value="Adani Solar" />
                    <option value="Goldi Solar" />
                    <option value="Tata Power Solar" />
                    <option value="Growatt" />
                    <option value="Havells" />
                    <option value="Polycab" />
                    <option value="Microtek" />
                    <option value="Sungrow" />
                    <option value="Solis" />
                    <option value="Luminous" />
                  </datalist>
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none cursor-pointer text-slate-700 font-bold"
                  >
                    <option value="solar_panel">Solar Panel</option>
                    <option value="inverter">Inverter</option>
                    <option value="battery">Battery / Storage</option>
                    <option value="structure">Mounting Structure</option>
                    <option value="other">Other/Accessories</option>
                  </select>
                </div>
              </div>

              {/* Rate & Unit of Measurement Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Standard Rate (₹) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={rate || ''}
                    onChange={(e) => setRate(Number(e.target.value))}
                    placeholder="e.g. 45000"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-extrabold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Unit of Measurement (UOM) *</label>
                  <input
                    type="text"
                    list="uom-suggestions"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="e.g. Nos, Watt, kW, Meters"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-bold text-purple-900"
                  />
                  <datalist id="uom-suggestions">
                    <option value="Nos" />
                    <option value="Pcs" />
                    <option value="Watt" />
                    <option value="kW" />
                    <option value="Meters" />
                    <option value="Sets" />
                    <option value="Kg" />
                    <option value="Feet" />
                    <option value="Box" />
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Description & Specifications (Optional)</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 540W Mono PERC Half-Cut module, IP68 junction box, 1500V DC max voltage"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none resize-none font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Stock Quantity (In Hand)</label>
                  <input
                    type="number"
                    min={0}
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 15"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Minimum Alert Threshold</label>
                  <input
                    type="number"
                    min={0}
                    value={minStockThreshold}
                    onChange={(e) => setMinStockThreshold(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 5"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold cursor-pointer"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Dedicated Add Bill of Materials (BOM) Item Modal with Category */}
      {showAddBomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-purple-200 shadow-xl w-full max-w-md p-6 m-4 animate-scale-in">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-purple-600" />
              <div>
                <h3 className="text-lg font-black text-slate-900">Add Bill of Materials (BOM) Item</h3>
                <p className="text-[11px] text-slate-400 font-semibold">Separate BOM Catalog component for quotations.</p>
              </div>
            </div>

            <form onSubmit={handleAddBomItem} className="space-y-4 text-xs font-semibold">
              {/* Item Name */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">Item / Component Name *</label>
                <input
                  type="text"
                  required
                  value={bomItemName}
                  onChange={(e) => setBomItemName(e.target.value)}
                  placeholder="e.g. 4 SQ MM DC Solar Copper Cable"
                  className="w-full border border-purple-200 rounded-xl px-3 py-2.5 bg-purple-50/40 focus:outline-none font-bold text-slate-900"
                />
              </div>

              {/* Category Field */}
              <div>
                <label className="block text-purple-900 font-black mb-1">BOM Category / Group *</label>
                <input
                  type="text"
                  list="bom-category-list"
                  required
                  value={bomCategory}
                  onChange={(e) => setBomCategory(e.target.value)}
                  placeholder="e.g. Cables & Wiring, Protection Devices, Earthing & LA"
                  className="w-full border border-purple-300 rounded-xl px-3 py-2.5 bg-purple-50 focus:outline-none font-extrabold text-purple-900"
                />
                <datalist id="bom-category-list">
                  {bomCategoriesList.map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              {/* Brand & Unit Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Brand / Manufacturer</label>
                  <input
                    type="text"
                    list="bom-brand-list"
                    value={bomBrand}
                    onChange={(e) => setBomBrand(e.target.value)}
                    placeholder="e.g. Polycab, RR, Schneider"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-bold text-blue-900"
                  />
                  <datalist id="bom-brand-list">
                    <option value="Polycab" />
                    <option value="RR Kabel" />
                    <option value="Havells" />
                    <option value="Schneider" />
                    <option value="Finolex" />
                    <option value="Legrand" />
                    <option value="L&T" />
                    <option value="Waaree" />
                    <option value="Standard" />
                  </datalist>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Unit of Measurement (UOM) *</label>
                  <input
                    type="text"
                    list="bom-uom-list"
                    required
                    value={bomUnit}
                    onChange={(e) => setBomUnit(e.target.value)}
                    placeholder="e.g. Mtr, Set, Nos, Kg"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-bold text-purple-900"
                  />
                  <datalist id="bom-uom-list">
                    <option value="Nos" />
                    <option value="Set" />
                    <option value="Mtr" />
                    <option value="Kg" />
                    <option value="Pkt" />
                    <option value="Bundle" />
                    <option value="Feet" />
                    <option value="Lot" />
                  </datalist>
                </div>
              </div>

              {/* Price / Rate Field */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">Price / Rate (₹) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={bomRate || ''}
                  onChange={(e) => setBomRate(Number(e.target.value))}
                  placeholder="e.g. 120 (per meter or set)"
                  className="w-full border border-purple-200 rounded-xl px-3 py-2.5 bg-purple-50/30 focus:outline-none font-black text-slate-900 text-sm"
                />
              </div>

              {/* Description & Specifications */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">Description & Specifications (Optional)</label>
                <textarea
                  rows={3}
                  value={bomDescription}
                  onChange={(e) => setBomDescription(e.target.value)}
                  placeholder="e.g. XLS-R UV resistant 1100V grade double insulated copper cable"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none resize-none font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddBomModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl font-black cursor-pointer shadow-sm"
                >
                  Save BOM Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Edit Product & Specifications Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-blue-200 shadow-xl w-full max-w-lg p-6 m-4 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-lg font-black text-slate-900">Edit Product Specifications</h3>
                  <p className="text-[11px] text-slate-400 font-semibold">Update product name, brand, description, rates, and parameters.</p>
                </div>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditProduct} className="space-y-4 text-xs font-semibold">
              {/* Name */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">Item / Product Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-blue-200 rounded-xl px-3 py-2.5 bg-blue-50/30 focus:outline-none font-bold text-slate-900 text-sm"
                />
              </div>

              {/* Brand & Category Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Brand / Manufacturer</label>
                  <input
                    type="text"
                    value={editBrand}
                    onChange={(e) => setEditBrand(e.target.value)}
                    placeholder="e.g. Waaree, Polycab, Growatt"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-bold text-blue-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Catalog Type / Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as any)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none cursor-pointer text-slate-800 font-bold"
                  >
                    <option value="solar_panel">Solar Panel</option>
                    <option value="inverter">Inverter</option>
                    <option value="battery">Battery / Storage</option>
                    <option value="structure">Mounting Structure</option>
                    <option value="bom_item">Bill of Materials (BOM)</option>
                    <option value="other">Other/Accessories</option>
                  </select>
                </div>
              </div>

              {/* Sub Category if BOM */}
              {editCategory === 'bom_item' && (
                <div>
                  <label className="block text-purple-900 font-black mb-1">BOM Category / Group</label>
                  <input
                    type="text"
                    list="edit-bom-cat-list"
                    value={editBomCategory}
                    onChange={(e) => setEditBomCategory(e.target.value)}
                    className="w-full border border-purple-200 rounded-xl px-3 py-2 bg-purple-50 focus:outline-none font-bold text-purple-900"
                  />
                  <datalist id="edit-bom-cat-list">
                    {bomCategoriesList.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
              )}

              {/* Rate & Unit Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Standard Rate (₹) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={editRate}
                    onChange={(e) => setEditRate(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-black text-slate-900 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Unit of Measurement (UOM) *</label>
                  <input
                    type="text"
                    required
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-bold text-purple-900"
                  />
                </div>
              </div>

              {/* Description & Specifications Text Area */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Description & Specifications</label>
                <textarea
                  rows={4}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Enter detailed technical specs, model numbers, dimensions, warranty period or performance details..."
                  className="w-full border border-blue-200 rounded-xl p-3 bg-blue-50/20 focus:outline-none resize-y text-slate-800 font-medium leading-relaxed"
                />
              </div>

              {/* Stock Fields if Commercial */}
              {editCategory !== 'bom_item' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-500 mb-1">Stock Quantity (In Hand)</label>
                    <input
                      type="number"
                      min={0}
                      value={editStockQuantity}
                      onChange={(e) => setEditStockQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 mb-1">Minimum Alert Threshold</label>
                    <input
                      type="number"
                      min={0}
                      value={editMinStockThreshold}
                      onChange={(e) => setEditMinStockThreshold(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none font-bold"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-black cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Update Specifications</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
