import React, { useEffect, useState } from 'react';
import type { Product, ProductUnit } from '../../types';
import { productService } from '../../services/productService';
import {
  Plus, Search, Trash2, Tag, Layers, Package, Filter, Pencil, Check, X,
  Barcode, RefreshCw, Clipboard, CheckCircle2, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';

const normalizeProductUnits = (p: Product): ProductUnit[] => {
  const stock = Math.max(0, Number(p.stockQuantity) || 0);
  let units: ProductUnit[] = [];

  if (p.productUnits && Array.isArray(p.productUnits) && p.productUnits.length > 0) {
    units = p.productUnits.map((u, i) => ({
      id: u.id || `unit_${i + 1}`,
      unitNumber: u.unitNumber || (i + 1),
      serialNumber: u.serialNumber || '',
      status: u.status || 'available',
      notes: u.notes || ''
    }));
  } else if (p.serialNumbers && Array.isArray(p.serialNumbers) && p.serialNumbers.length > 0) {
    units = p.serialNumbers.map((sn, i) => ({
      id: `unit_${i + 1}`,
      unitNumber: i + 1,
      serialNumber: sn || '',
      status: 'available'
    }));
  }

  // Adjust unit array length to match stock quantity
  if (units.length < stock) {
    const brandPrefix = (p.brand || p.name || 'GES').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'GES';
    const year = new Date().getFullYear();
    for (let i = units.length; i < stock; i++) {
      const numStr = String(i + 1).padStart(3, '0');
      units.push({
        id: `unit_${i + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        unitNumber: i + 1,
        serialNumber: `${brandPrefix}-${year}-${numStr}`,
        status: 'available'
      });
    }
  } else if (units.length > stock) {
    units = units.slice(0, stock);
  }

  return units;
};

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

  // Serial Numbers state in Add Commercial Product Modal
  const [addUnitSerials, setAddUnitSerials] = useState<string[]>([]);
  const [showAddSerialsSection, setShowAddSerialsSection] = useState(false);
  const [addSerialPrefix, setAddSerialPrefix] = useState('');
  const [addBulkPasteText, setAddBulkPasteText] = useState('');
  const [showAddBulkPaste, setShowAddBulkPaste] = useState(false);

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

  // Dedicated Serial Numbers Management Modal State
  const [managingSerialsProduct, setManagingSerialsProduct] = useState<Product | null>(null);
  const [managingUnits, setManagingUnits] = useState<ProductUnit[]>([]);
  const [managingStockQty, setManagingStockQty] = useState<number>(0);
  const [manageSerialPrefix, setManageSerialPrefix] = useState<string>('');
  const [manageBulkText, setManageBulkText] = useState<string>('');
  const [showManageBulkPaste, setShowManageBulkPaste] = useState<boolean>(false);
  const [serialSearchTerm, setSerialSearchTerm] = useState<string>('');

  // Smooth Toast Notification State
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 3000);
  };

  const loadProducts = async () => {
    const list = await productService.getProducts();
    setProducts(list);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleStockQuantityChangeInAdd = (val: number | '') => {
    setStockQuantity(val);
    const count = Math.max(0, Number(val) || 0);
    setAddUnitSerials(prev => {
      const next = [...prev];
      if (count > next.length) {
        const prefix = addSerialPrefix.trim() || ((brand || name || 'GES').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') + '-');
        const year = new Date().getFullYear();
        for (let i = next.length; i < count; i++) {
          next.push(`${prefix}${year}-${String(i + 1).padStart(3, '0')}`);
        }
      } else if (count < next.length) {
        return next.slice(0, count);
      }
      return next;
    });
  };

  const handleAutoGenerateAddSerials = () => {
    const qty = Number(stockQuantity) || 0;
    if (qty <= 0) {
      alert('Please enter a valid Stock Quantity first.');
      return;
    }
    const prefix = addSerialPrefix.trim() || ((brand || name || 'GES').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') + '-');
    const year = new Date().getFullYear();
    const list: string[] = [];
    for (let i = 1; i <= qty; i++) {
      list.push(`${prefix}${year}-${String(i).padStart(3, '0')}`);
    }
    setAddUnitSerials(list);
  };

  const handleApplyAddBulkPaste = () => {
    const lines = addBulkPasteText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const qty = Math.max(Number(stockQuantity) || 0, lines.length);
    setStockQuantity(qty);
    const newList: string[] = [];
    for (let i = 0; i < qty; i++) {
      if (i < lines.length) {
        newList.push(lines[i]);
      } else {
        newList.push(addUnitSerials[i] || `UNIT-${i+1}`);
      }
    }
    setAddUnitSerials(newList);
    setAddBulkPasteText('');
    setShowAddBulkPaste(false);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || rate <= 0) {
      showToast('Please fill out Product Name and a valid price Rate.');
      return;
    }

    const tempName = name;
    const finalStock = Number(stockQuantity) || 0;
    const productUnitsList: ProductUnit[] = [];
    const defaultPrefix = (brand || name || 'GES').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') + '-';
    const year = new Date().getFullYear();

    for (let i = 0; i < finalStock; i++) {
      const sn = addUnitSerials[i] && addUnitSerials[i].trim()
        ? addUnitSerials[i].trim()
        : `${defaultPrefix}${year}-${String(i + 1).padStart(3, '0')}`;
      productUnitsList.push({
        id: `unit_${i + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        unitNumber: i + 1,
        serialNumber: sn,
        status: 'available'
      });
    }

    // Immediately close modal & reset fields for instant feedback
    setShowAddModal(false);
    setName('');
    setBrand('');
    setUnit('Nos');
    setCategory('solar_panel');
    setRate(0);
    setDescription('');
    setStockQuantity('');
    setMinStockThreshold('');
    setAddUnitSerials([]);
    setAddSerialPrefix('');
    setAddBulkPasteText('');
    setShowAddSerialsSection(false);

    try {
      const createdId = await productService.createProduct({
        name: tempName,
        brand: brand.trim() || undefined,
        unit: unit.trim() || 'Nos',
        category,
        rate: Number(rate),
        description: description || undefined,
        stockQuantity: finalStock,
        minStockThreshold: Number(minStockThreshold) || 0,
        serialNumbers: productUnitsList.map(u => u.serialNumber),
        productUnits: productUnitsList
      });

      // Optimistically update memory state
      setProducts(prev => [
        {
          id: createdId,
          name: tempName,
          brand: brand.trim() || undefined,
          unit: unit.trim() || 'Nos',
          category,
          rate: Number(rate),
          description: description || undefined,
          stockQuantity: finalStock,
          minStockThreshold: Number(minStockThreshold) || 0,
          serialNumbers: productUnitsList.map(u => u.serialNumber),
          productUnits: productUnitsList,
          createdAt: new Date().toISOString()
        },
        ...prev
      ]);

      showToast(`Product "${tempName}" saved successfully!`);
    } catch (err) {
      console.error("Error creating product:", err);
      showToast('Error saving product.');
    }
  };

  const handleAddBomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bomItemName.trim()) {
      showToast('Please enter Item / Component Name.');
      return;
    }

    const tempName = bomItemName.trim();
    const tempCat = bomCategory.trim() || 'Protection Devices';

    // Immediately close modal & reset fields for zero-lag UX
    setShowAddBomModal(false);
    setBomItemName('');
    setBomBrand('');
    setBomCategory('Protection Devices');
    setBomUnit('Nos');
    setBomRate(0);
    setBomDescription('');
    setActiveTab('bom');

    try {
      const createdId = await productService.createProduct({
        name: tempName,
        brand: bomBrand.trim() || undefined,
        unit: bomUnit.trim() || 'Nos',
        category: 'bom_item',
        bomCategory: tempCat,
        rate: 0,
        description: bomDescription.trim() || undefined,
        stockQuantity: 100,
        minStockThreshold: 10
      });

      // Optimistically update memory state
      setProducts(prev => [
        {
          id: createdId,
          name: tempName,
          brand: bomBrand.trim() || undefined,
          unit: bomUnit.trim() || 'Nos',
          category: 'bom_item',
          bomCategory: tempCat,
          rate: 0,
          description: bomDescription.trim() || undefined,
          stockQuantity: 100,
          minStockThreshold: 10,
          createdAt: new Date().toISOString()
        },
        ...prev
      ]);

      showToast(`BOM Item "${tempName}" added successfully!`);
    } catch (err) {
      console.error("Error creating BOM item:", err);
      showToast('Error saving BOM item.');
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
    if (!editingProduct || !editName.trim()) {
      showToast('Please provide product name.');
      return;
    }

    if (editCategory !== 'bom_item' && editRate <= 0) {
      showToast('Please provide a valid price rate.');
      return;
    }

    const isBom = editCategory === 'bom_item';
    const newStock = isBom ? 100 : (Number(editStockQuantity) || 0);
    let existingUnits = isBom ? [] : normalizeProductUnits({ ...editingProduct, stockQuantity: newStock });

    const updated: Product = {
      ...editingProduct,
      name: editName.trim(),
      brand: editBrand.trim() || undefined,
      unit: editUnit.trim() || 'Nos',
      category: editCategory,
      bomCategory: isBom ? (editBomCategory.trim() || 'General') : undefined,
      rate: isBom ? 0 : Number(editRate),
      description: editDescription.trim() || undefined,
      stockQuantity: newStock,
      minStockThreshold: isBom ? 10 : (Number(editMinStockThreshold) || 0),
      productUnits: existingUnits,
      serialNumbers: existingUnits.map(u => u.serialNumber)
    };

    // Immediately close edit modal for 0ms lag
    setEditingProduct(null);

    // Optimistically update memory state
    setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
    showToast(`"${updated.name}" updated successfully!`);

    try {
      await productService.updateProduct(updated);
    } catch (err) {
      console.error("Error updating product:", err);
      showToast('Error saving changes to database.');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Delete this item from catalog? This will not affect existing generated quotations.')) {
      setProducts(prev => prev.filter(p => p.id !== id));
      showToast('Item deleted from catalog.');
      try {
        await productService.deleteProduct(id);
      } catch (err) {
        console.error("Error deleting product:", err);
      }
    }
  };

  // Dedicated Serial Numbers Management Modal Handlers
  const handleOpenManageSerialsModal = (p: Product) => {
    const units = normalizeProductUnits(p);
    setManagingSerialsProduct(p);
    setManagingUnits(units);
    setManagingStockQty(p.stockQuantity || units.length);
    const defaultPrefix = (p.brand || p.name || 'GES').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') + '-';
    setManageSerialPrefix(defaultPrefix);
    setSerialSearchTerm('');
    setManageBulkText('');
    setShowManageBulkPaste(false);
  };

  const handleManageStockQtyChange = (newQty: number) => {
    const count = Math.max(0, newQty);
    setManagingStockQty(count);
    setManagingUnits(prev => {
      const next = [...prev];
      if (count > next.length) {
        const prefix = manageSerialPrefix.trim() || ((managingSerialsProduct?.brand || managingSerialsProduct?.name || 'GES').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') + '-');
        const year = new Date().getFullYear();
        for (let i = next.length; i < count; i++) {
          next.push({
            id: `unit_${i + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            unitNumber: i + 1,
            serialNumber: `${prefix}${year}-${String(i + 1).padStart(3, '0')}`,
            status: 'available'
          });
        }
      } else if (count < next.length) {
        return next.slice(0, count);
      }
      return next;
    });
  };

  const handleAutoGenerateManageSerials = () => {
    if (managingUnits.length === 0) return;
    const prefix = manageSerialPrefix.trim() || ((managingSerialsProduct?.brand || managingSerialsProduct?.name || 'GES').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') + '-');
    const year = new Date().getFullYear();
    setManagingUnits(prev =>
      prev.map((u, idx) => ({
        ...u,
        serialNumber: `${prefix}${year}-${String(idx + 1).padStart(3, '0')}`
      }))
    );
  };

  const handleApplyManageBulkPaste = () => {
    const lines = manageBulkText.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const newQty = Math.max(managingStockQty, lines.length);
    setManagingStockQty(newQty);
    setManagingUnits(prev => {
      const newList: ProductUnit[] = [];
      for (let i = 0; i < newQty; i++) {
        const existing = prev[i];
        const sn = i < lines.length ? lines[i] : (existing?.serialNumber || `UNIT-${i+1}`);
        newList.push({
          id: existing?.id || `unit_${i + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          unitNumber: i + 1,
          serialNumber: sn,
          status: existing?.status || 'available',
          notes: existing?.notes || ''
        });
      }
      return newList;
    });
    setManageBulkText('');
    setShowManageBulkPaste(false);
  };

  const handleSaveManagedSerials = async () => {
    if (!managingSerialsProduct) return;
    const targetProduct = managingSerialsProduct;
    const updatedProduct: Product = {
      ...targetProduct,
      stockQuantity: managingStockQty,
      productUnits: managingUnits,
      serialNumbers: managingUnits.map(u => u.serialNumber)
    };

    setManagingSerialsProduct(null);
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    showToast(`Serial numbers updated for "${updatedProduct.name}"!`);

    try {
      await productService.updateProduct(updatedProduct);
    } catch (err) {
      console.error("Error saving managed serial numbers:", err);
      showToast('Error updating serial numbers.');
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
    'Solar Panels (PV Modules)',
    'Solar String Inverter',
    'Solar 80 micron HDGI Structure*',
    'Protection Devices',
    'Cables',
    'Earthing / LA - lightning arrestor',
    'Data Logger',
    'Other Accessories'
  ];

  return (
    <div className="space-y-6 relative">
      {/* Non-blocking Toast Notification Banner */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white border border-emerald-500/50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold animate-bounce-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="ml-2 text-slate-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Product & BOM Catalog</h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Manage standardized inventory pricing, specifications, unit serial numbers, and Bill of Materials components.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Main Add Commercial Product Button */}
          <button
            onClick={() => {
              setAddUnitSerials([]);
              setShowAddSerialsSection(false);
              setShowAddModal(true);
            }}
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
        {filteredProducts.map((p) => {
          const unitCount = p.productUnits?.length || p.serialNumbers?.length || p.stockQuantity || 0;
          return (
            <div
              key={p.id}
              className={`bg-white border rounded-2xl p-5 hover:shadow-md transition-shadow relative flex flex-col justify-between min-h-[210px] ${
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

              {/* Stock Level & Serial Numbers Control (Commercial Only) */}
              {p.category !== 'bom_item' && (
                <div className="mt-3 flex items-center justify-between text-[11px] font-bold border-t border-slate-100 pt-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-semibold">Stock:</span>
                    <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${p.stockQuantity <= p.minStockThreshold ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-slate-100 text-slate-700'}`}>
                      {p.stockQuantity} {p.unit || 'units'}
                    </span>
                  </div>

                  <button
                    onClick={() => handleOpenManageSerialsModal(p)}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-extrabold text-[10px] rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    title="View, Search & Edit Individual Unit Serial Numbers"
                  >
                    <Barcode className="w-3.5 h-3.5 text-emerald-600" />
                    <span>🔢 Serial Numbers ({unitCount})</span>
                  </button>
                </div>
              )}

              {/* Price Row */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-semibold">Standard Rate:</span>
                <span className="text-sm font-extrabold text-slate-950">
                  ₹{p.rate.toLocaleString('en-IN')}{' '}
                  <span className="text-[10px] font-medium text-slate-400">/ {p.unit || 'Nos'}</span>
                </span>
              </div>
            </div>
          );
        })}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-6 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900">Add Commercial Product & Stock Units</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

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
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 540W Mono PERC Half-Cut module, IP68 junction box, 1500V DC max voltage"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none resize-none font-medium"
                />
              </div>

              {/* Stock Quantity & Threshold */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Initial Stock Quantity (In Hand)</label>
                  <input
                    type="number"
                    min={0}
                    value={stockQuantity}
                    onChange={(e) => handleStockQuantityChangeInAdd(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 50"
                    className="w-full border border-emerald-300 rounded-xl px-3 py-2.5 bg-emerald-50/40 focus:outline-none font-black text-slate-900"
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

              {/* Serial Numbers Configuration Section */}
              {Number(stockQuantity) > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Barcode className="w-4 h-4 text-emerald-600" />
                      <span className="font-extrabold text-slate-800 text-xs">
                        Individual Serial Numbers ({addUnitSerials.length} Units)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAddSerialsSection(!showAddSerialsSection)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                    >
                      {showAddSerialsSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      <span>{showAddSerialsSection ? 'Collapse' : 'Configure / Edit'}</span>
                    </button>
                  </div>

                  {showAddSerialsSection && (
                    <div className="space-y-3 pt-2 border-t border-slate-200">
                      {/* Auto Prefix Bar & Bulk Paste Toggle */}
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={addSerialPrefix}
                          onChange={(e) => setAddSerialPrefix(e.target.value)}
                          placeholder={`Prefix (e.g. ${(brand || 'WAR').substring(0,3).toUpperCase()}-)`}
                          className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs bg-white focus:outline-none font-bold text-slate-800 flex-1 min-w-[120px]"
                        />

                        <button
                          type="button"
                          onClick={handleAutoGenerateAddSerials}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          title="Auto Generate prefix-001, prefix-002, etc."
                        >
                          <RefreshCw className="w-3 h-3" /> Auto Fill All
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowAddBulkPaste(!showAddBulkPaste)}
                          className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Clipboard className="w-3 h-3" /> Bulk Paste
                        </button>
                      </div>

                      {/* Bulk Paste Box */}
                      {showAddBulkPaste && (
                        <div className="bg-white p-2.5 rounded-lg border border-purple-200 space-y-2">
                          <p className="text-[10px] text-slate-500 font-medium">Paste serial numbers separated by newlines or commas:</p>
                          <textarea
                            rows={3}
                            value={addBulkPasteText}
                            onChange={(e) => setAddBulkPasteText(e.target.value)}
                            placeholder={`WAR-2026-001\nWAR-2026-002\nWAR-2026-003...`}
                            className="w-full border border-purple-100 rounded-md p-2 text-xs font-mono bg-slate-50 focus:outline-none resize-none"
                          />
                          <button
                            type="button"
                            onClick={handleApplyAddBulkPaste}
                            className="px-3 py-1 bg-purple-600 text-white text-[11px] font-extrabold rounded-md cursor-pointer"
                          >
                            Apply Pasted Serials
                          </button>
                        </div>
                      )}

                      {/* Grid of Serial Numbers Fields */}
                      <div className="max-h-48 overflow-y-auto pr-1 grid grid-cols-2 gap-2 border border-slate-200 rounded-lg p-2 bg-white">
                        {addUnitSerials.map((sn, idx) => (
                          <div key={idx} className="flex items-center space-x-1.5">
                            <span className="text-[10px] font-bold text-slate-400 w-7 shrink-0 text-right">#{idx + 1}:</span>
                            <input
                              type="text"
                              value={sn}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAddUnitSerials(prev => {
                                  const copy = [...prev];
                                  copy[idx] = val;
                                  return copy;
                                });
                              }}
                              placeholder={`Serial #${idx + 1}`}
                              className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-mono bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                  Save Product & Units
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Dedicated Add Bill of Materials (BOM) Item Modal with Category */}
      {showAddBomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-purple-200 shadow-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-purple-100">
              <Layers className="w-5 h-5 text-purple-600" />
              <div>
                <h3 className="text-lg font-black text-slate-900">Add Bill of Materials (BOM) Item</h3>
                <p className="text-[11px] text-slate-400 font-semibold">Separate BOM Catalog component for quotations.</p>
              </div>
            </div>

            <form onSubmit={handleAddBomItem} className="space-y-4 text-xs font-semibold">
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

      {/* MODAL 3: Edit Product Specifications Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-blue-200 shadow-xl w-full max-w-lg p-6 animate-scale-in max-h-[90vh] overflow-y-auto">
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

              {editCategory !== 'bom_item' ? (
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
              ) : (
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
              )}

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

      {/* MODAL 4: Dedicated Product Units & Serial Numbers Management Modal */}
      {managingSerialsProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl p-6 sm:p-7 animate-scale-in max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-100 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                    <Barcode className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                      Unit Serial Numbers Management
                    </h3>
                    <p className="text-xs font-semibold text-slate-500">
                      Product: <strong className="text-emerald-700">{managingSerialsProduct.name}</strong> {managingSerialsProduct.brand ? `• Brand: ${managingSerialsProduct.brand}` : ''}
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setManagingSerialsProduct(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5.5 h-5.5" />
              </button>
            </div>

            {/* Toolbar: Stock Count, Prefix Generator, Bulk Paste */}
            <div className="py-4 space-y-3 shrink-0 border-b border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Total Stock Qty Modifier */}
                <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                  <span className="text-xs font-extrabold text-slate-600">Total Stock Quantity:</span>
                  <input
                    type="number"
                    min={0}
                    value={managingStockQty}
                    onChange={(e) => handleManageStockQtyChange(Number(e.target.value))}
                    className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-xs font-black text-slate-900 bg-white text-center focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-400">{managingSerialsProduct.unit || 'units'}</span>
                </div>

                {/* Auto Generate & Bulk Paste Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center space-x-1 border border-slate-200 rounded-xl px-2 py-1 bg-white">
                    <input
                      type="text"
                      value={manageSerialPrefix}
                      onChange={(e) => setManageSerialPrefix(e.target.value)}
                      placeholder="Prefix e.g. WAR-2026-"
                      className="text-xs font-bold text-slate-800 focus:outline-none w-28 bg-transparent"
                    />
                    <button
                      type="button"
                      onClick={handleAutoGenerateManageSerials}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                      title="Auto generate serial numbers sequentially for all units"
                    >
                      <RefreshCw className="w-3 h-3" /> Auto Fill All
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowManageBulkPaste(!showManageBulkPaste)}
                    className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Clipboard className="w-3.5 h-3.5" /> Bulk Paste
                  </button>
                </div>
              </div>

              {/* Bulk Paste Dropdown Box */}
              {showManageBulkPaste && (
                <div className="bg-purple-50/60 p-3 rounded-2xl border border-purple-200 space-y-2 animate-fade-in">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-extrabold text-purple-900">Paste Serial Numbers (Line or Comma separated)</span>
                    <button
                      type="button"
                      onClick={() => setShowManageBulkPaste(false)}
                      className="text-[10px] font-bold text-purple-700 hover:underline cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={manageBulkText}
                    onChange={(e) => setManageBulkText(e.target.value)}
                    placeholder={`Paste 50 serial numbers here:\nSN-2026-001\nSN-2026-002\nSN-2026-003...`}
                    className="w-full border border-purple-200 rounded-xl p-2.5 text-xs font-mono bg-white focus:outline-none resize-y"
                  />
                  <button
                    type="button"
                    onClick={handleApplyManageBulkPaste}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-xl cursor-pointer shadow-xs"
                  >
                    Apply Serial Numbers to Units
                  </button>
                </div>
              )}

              {/* Search Filter for Units */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={serialSearchTerm}
                  onChange={(e) => setSerialSearchTerm(e.target.value)}
                  placeholder="Filter unit by Serial Number or Unit #..."
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs font-medium bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Scrollable Units Grid / Table */}
            <div className="flex-1 overflow-y-auto py-3 pr-1 space-y-2 min-h-[220px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {managingUnits
                  .map((unit, actualIndex) => ({ unit, actualIndex }))
                  .filter(({ unit }) =>
                    !serialSearchTerm ||
                    unit.serialNumber.toLowerCase().includes(serialSearchTerm.toLowerCase()) ||
                    String(unit.unitNumber).includes(serialSearchTerm)
                  )
                  .map(({ unit, actualIndex }) => (
                    <div
                      key={unit.id}
                      className="bg-slate-50 border border-slate-200 hover:border-emerald-300 rounded-xl p-2.5 flex items-center justify-between gap-2 transition-colors"
                    >
                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center">
                          #{unit.unitNumber}
                        </span>
                      </div>

                      <input
                        type="text"
                        value={unit.serialNumber}
                        onChange={(e) => {
                          const val = e.target.value;
                          setManagingUnits(prev => {
                            const copy = [...prev];
                            copy[actualIndex] = { ...copy[actualIndex], serialNumber: val };
                            return copy;
                          });
                        }}
                        placeholder={`Enter Serial Number for Unit #${unit.unitNumber}`}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                      />

                      <select
                        value={unit.status || 'available'}
                        onChange={(e) => {
                          const st = e.target.value as any;
                          setManagingUnits(prev => {
                            const copy = [...prev];
                            copy[actualIndex] = { ...copy[actualIndex], status: st };
                            return copy;
                          });
                        }}
                        className={`text-[10px] font-extrabold px-1.5 py-1 rounded-lg border cursor-pointer focus:outline-none shrink-0 ${
                          unit.status === 'sold'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : unit.status === 'dispatched'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : unit.status === 'installed'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        <option value="available">Available</option>
                        <option value="sold">Sold (Dispatched)</option>
                        <option value="dispatched">Dispatched</option>
                        <option value="installed">Installed</option>
                        <option value="allocated">Allocated</option>
                      </select>
                    </div>
                  ))}
              </div>

              {managingUnits.length === 0 && (
                <div className="text-center py-8 text-slate-400 font-bold text-xs bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                  No units available in stock. Increase total stock quantity above to add unit serial numbers.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-100 flex justify-between items-center shrink-0">
              <div className="text-xs font-extrabold text-slate-500">
                Total Stock Units: <strong className="text-slate-900">{managingUnits.length}</strong>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setManagingSerialsProduct(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveManagedSerials}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-black text-xs cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Serial Numbers & Stock</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
