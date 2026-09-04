import React, { useEffect, useState } from 'react';
import type { Product, ProductUnit } from '../../types';
import { productService } from '../../services/productService';
import { useAuthStore } from '../../store/authStore';
import { PackageManager } from '../../components/Packages/PackageManager';
import { AiPalletScannerModal } from '../../components/Products/AiPalletScannerModal';
import {
  Plus, Search, Trash2, Tag, Layers, Package, Filter, Pencil, Check, X,
  Barcode, RefreshCw, Clipboard, CheckCircle2, ChevronDown, ChevronUp, AlertCircle, Boxes, Calendar,
  List, LayoutGrid, Sparkles
} from 'lucide-react';

const formatBatchDateDisplay = (isoStr?: string): string => {
  if (!isoStr) return 'Initial Stock Entry';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 'Stock Entry';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return 'Stock Entry';
  }
};

interface DateGroup {
  dateKey: string;
  displayDate: string;
  items: { unit: ProductUnit; actualIndex: number }[];
}

const groupUnitsByDate = (
  indexedList: { unit: ProductUnit; actualIndex: number }[]
): DateGroup[] => {
  const groups: Record<string, DateGroup> = {};

  indexedList.forEach(item => {
    const rawDate = item.unit.addedAt ? item.unit.addedAt.substring(0, 10) : 'initial';
    const displayDate = formatBatchDateDisplay(item.unit.addedAt);

    if (!groups[rawDate]) {
      groups[rawDate] = {
        dateKey: rawDate,
        displayDate,
        items: []
      };
    }
    groups[rawDate].items.push(item);
  });

  return Object.values(groups).sort((a, b) => {
    if (a.dateKey === 'initial') return 1;
    if (b.dateKey === 'initial') return -1;
    return b.dateKey.localeCompare(a.dateKey); // Newest stock entry batch first
  });
};

const normalizeProductUnits = (p: Product): ProductUnit[] => {
  const targetAvailableStock = Math.max(0, Number(p.stockQuantity) || 0);
  const defaultDate = p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString();
  let units: ProductUnit[] = [];

  if (p.productUnits && Array.isArray(p.productUnits) && p.productUnits.length > 0) {
    units = p.productUnits.map((u, i) => ({
      id: u.id || `unit_${i + 1}_${Date.now()}_${i}`,
      unitNumber: u.unitNumber || (i + 1),
      serialNumber: u.serialNumber || '',
      status: u.status || 'available',
      notes: u.notes || '',
      addedAt: u.addedAt || defaultDate,
      dispatchedAt: u.dispatchedAt
    }));
  } else if (p.serialNumbers && Array.isArray(p.serialNumbers) && p.serialNumbers.length > 0) {
    units = p.serialNumbers.map((sn, i) => ({
      id: `unit_${i + 1}_${Date.now()}_${i}`,
      unitNumber: i + 1,
      serialNumber: sn || '',
      status: 'available',
      addedAt: defaultDate
    }));
  }

  // Separate available vs non-available units
  const availableUnits = units.filter(u => u.status === 'available');
  const nonAvailableUnits = units.filter(u => u.status !== 'available');

  if (availableUnits.length < targetAvailableStock) {
    // We need to add new available units for the stock addition!
    const brandPrefix = (p.brand || p.name || 'GES').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'GES';
    const year = new Date().getFullYear();
    const needed = targetAvailableStock - availableUnits.length;
    const currentMaxNum = units.length > 0 ? Math.max(...units.map(u => u.unitNumber || 0)) : 0;
    const nowIso = new Date().toISOString();

    for (let i = 0; i < needed; i++) {
      const uNum = currentMaxNum + i + 1;
      const numStr = String(uNum).padStart(3, '0');
      availableUnits.push({
        id: `unit_${uNum}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        unitNumber: uNum,
        serialNumber: `${brandPrefix}-${year}-${numStr}`,
        status: 'available',
        addedAt: nowIso
      });
    }
  } else if (availableUnits.length > targetAvailableStock) {
    availableUnits.splice(targetAvailableStock);
  }

  return [...availableUnits, ...nonAvailableUnits].sort((a, b) => (a.unitNumber || 0) - (b.unitNumber || 0));
};

export const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'commercial' | 'bom' | 'packages'>('commercial');
  const [selectedBomCategoryFilter, setSelectedBomCategoryFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    try {
      return (localStorage.getItem('products_view_mode') as 'list' | 'grid') || 'list';
    } catch {
      return 'list';
    }
  });
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
  const [serialModalTab, setSerialModalTab] = useState<'available' | 'sold' | 'all'>('available');
  const [addBatchQty, setAddBatchQty] = useState<number | ''>('');

  // AI Pallet / Serial Scanner Modal State
  const [showAiPalletModal, setShowAiPalletModal] = useState(false);
  const [aiScanTargetProduct, setAiScanTargetProduct] = useState<Product | null>(null);

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
    const handleRealtimeUpdate = () => {
      loadProducts();
    };
    window.addEventListener('app-realtime-update', handleRealtimeUpdate);
    return () => {
      window.removeEventListener('app-realtime-update', handleRealtimeUpdate);
    };
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
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';
    const confirmMsg = isSuperAdmin
      ? 'Delete this item from catalog? This will not affect existing generated quotations.'
      : 'Submit product deletion request to Super Admin for approval?';

    if (confirm(confirmMsg)) {
      const res = await productService.deleteProduct(id);
      if (res?.requiresApproval) {
        showToast('🔒 Deletion request submitted for Super Admin approval.');
      } else {
        setProducts(prev => prev.filter(p => p.id !== id));
        showToast('Item deleted from catalog.');
      }
    }
  };

  // Dedicated Serial Numbers Management Modal Handlers
  const handleOpenManageSerialsModal = (p: Product) => {
    const units = normalizeProductUnits(p);
    const availCount = units.filter(u => u.status === 'available').length;
    setManagingSerialsProduct(p);
    setManagingUnits(units);
    setManagingStockQty(availCount);
    setAddBatchQty('');
    setSerialModalTab('available');
    const defaultPrefix = (p.brand || p.name || 'GES').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') + '-';
    setManageSerialPrefix(defaultPrefix);
    setSerialSearchTerm('');
    setManageBulkText('');
    setShowManageBulkPaste(false);
  };

  const handleAddStockBatch = () => {
    const qtyToAdd = Number(addBatchQty);
    if (!qtyToAdd || qtyToAdd <= 0) {
      showToast('Please enter a valid batch quantity to add (e.g. 50).');
      return;
    }

    const nowIso = new Date().toISOString();
    const prefix = manageSerialPrefix.trim() || ((managingSerialsProduct?.brand || managingSerialsProduct?.name || 'GES').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') + '-');
    const year = new Date().getFullYear();

    setManagingUnits(prev => {
      const currentMaxNum = prev.length > 0 ? Math.max(...prev.map(u => u.unitNumber || 0)) : 0;
      const newUnits: ProductUnit[] = [];

      for (let i = 0; i < qtyToAdd; i++) {
        const uNum = currentMaxNum + i + 1;
        const numStr = String(uNum).padStart(3, '0');
        newUnits.push({
          id: `unit_${uNum}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          unitNumber: uNum,
          serialNumber: `${prefix}${year}-${numStr}`,
          status: 'available',
          addedAt: nowIso
        });
      }

      const updated = [...prev, ...newUnits];
      const availCount = updated.filter(u => u.status === 'available').length;
      setManagingStockQty(availCount);
      return updated;
    });

    showToast(`Added +${qtyToAdd} units as a new Stock Batch dated ${formatBatchDateDisplay(nowIso)}!`);
    setAddBatchQty('');
    setSerialModalTab('available');
  };

  const handleManageStockQtyChange = (newQty: number) => {
    const targetCount = Math.max(0, newQty);
    setManagingStockQty(targetCount);
    setManagingUnits(prev => {
      const availableUnits = prev.filter(u => u.status === 'available');
      const nonAvailableUnits = prev.filter(u => u.status !== 'available');
      const nowIso = new Date().toISOString();

      if (targetCount > availableUnits.length) {
        const prefix = manageSerialPrefix.trim() || ((managingSerialsProduct?.brand || managingSerialsProduct?.name || 'GES').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') + '-');
        const year = new Date().getFullYear();
        const needed = targetCount - availableUnits.length;
        const currentMaxNum = prev.length > 0 ? Math.max(...prev.map(u => u.unitNumber || 0)) : 0;

        for (let i = 0; i < needed; i++) {
          const uNum = currentMaxNum + i + 1;
          const numStr = String(uNum).padStart(3, '0');
          availableUnits.push({
            id: `unit_${uNum}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            unitNumber: uNum,
            serialNumber: `${prefix}${year}-${numStr}`,
            status: 'available',
            addedAt: nowIso
          });
        }
      } else if (targetCount < availableUnits.length) {
        availableUnits.splice(targetCount);
      }

      return [...availableUnits, ...nonAvailableUnits].sort((a, b) => (a.unitNumber || 0) - (b.unitNumber || 0));
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
    const nowIso = new Date().toISOString();

    setManagingUnits(prev => {
      const currentMaxNum = prev.length > 0 ? Math.max(...prev.map(u => u.unitNumber || 0)) : 0;
      const newBatchUnits: ProductUnit[] = lines.map((sn, i) => {
        const uNum = currentMaxNum + i + 1;
        return {
          id: `unit_${uNum}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          unitNumber: uNum,
          serialNumber: sn,
          status: 'available' as const,
          addedAt: nowIso
        };
      });

      const updated = [...prev, ...newBatchUnits];
      const availCount = updated.filter(u => u.status === 'available').length;
      setManagingStockQty(availCount);
      return updated;
    });

    showToast(`Pasted +${lines.length} serial numbers as a new Stock Batch for today!`);
    setManageBulkText('');
    setShowManageBulkPaste(false);
    setSerialModalTab('available');
  };

  const handleSaveManagedSerials = async () => {
    if (!managingSerialsProduct) return;
    const targetProduct = managingSerialsProduct;
    const availCount = managingUnits.filter(u => u.status === 'available').length;

    const updatedProduct: Product = {
      ...targetProduct,
      stockQuantity: availCount,
      productUnits: managingUnits,
      serialNumbers: managingUnits.filter(u => u.status === 'available').map(u => u.serialNumber)
    };

    setManagingSerialsProduct(null);
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    showToast(`Serial numbers & stock updated for "${updatedProduct.name}"!`);

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

  const { currentRole, currentUser } = useAuthStore();
  const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';

  const grandTotalInventoryValue = products.reduce((sum, p) => sum + ((p.rate || p.bomRate || 0) * (p.stockQuantity || 0)), 0);
  const commercialStockValue = commercialProducts.reduce((sum, p) => sum + ((p.rate || 0) * (p.stockQuantity || 0)), 0);
  const bomStockValue = bomProducts.reduce((sum, p) => sum + ((p.rate || p.bomRate || 0) * (p.stockQuantity || 0)), 0);
  const totalStockQuantity = products.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);

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
          {/* AI Pallet / Label Scanner Button */}
          <button
            onClick={() => {
              setAiScanTargetProduct(null);
              setShowAiPalletModal(true);
            }}
            className="px-3.5 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98] text-white font-black text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all border border-emerald-400/30"
            title="Scan Pallet packing slip or box label with Groq Vision AI to inward serial numbers"
          >
            <Sparkles className="w-4 h-4 text-emerald-200 animate-pulse" />
            <span>📸 AI Scan Pallet / Label</span>
          </button>

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

      {/* Super Admin Executive Inventory Valuation Banner */}
      {isSuperAdmin && (
        <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white p-5 rounded-2xl border border-purple-500/30 shadow-lg space-y-3 animate-fade-in">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-purple-500/20 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <Boxes className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <span className="text-[10px] font-black text-purple-300 uppercase tracking-widest block">
                  SUPER ADMIN EXECUTIVE INVENTORY OVERVIEW
                </span>
                <h2 className="text-sm font-extrabold text-white">Real-Time Inventory Valuation</h2>
              </div>
            </div>

            <div className="bg-purple-950/80 px-3.5 py-1.5 rounded-xl border border-purple-500/40 text-right">
              <span className="text-[10px] text-purple-300 font-bold uppercase tracking-wider block">Grand Total Inventory Value</span>
              <span className="text-xl font-black text-emerald-400">
                ₹{grandTotalInventoryValue.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-purple-500/20">
              <span className="text-[10px] text-purple-200/70 font-bold block">Commercial Stock Value</span>
              <span className="text-sm font-extrabold text-white">₹{commercialStockValue.toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-purple-500/20">
              <span className="text-[10px] text-purple-200/70 font-bold block">BOM Stock Value</span>
              <span className="text-sm font-extrabold text-white">₹{bomStockValue.toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-purple-500/20">
              <span className="text-[10px] text-purple-200/70 font-bold block">Total Stock Units</span>
              <span className="text-sm font-extrabold text-white">{totalStockQuantity.toLocaleString('en-IN')} Units</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-purple-500/20">
              <span className="text-[10px] text-purple-200/70 font-bold block">Cataloged Products</span>
              <span className="text-sm font-extrabold text-white">{products.length} Products</span>
            </div>
          </div>
        </div>
      )}

      {/* Catalog Tabs Switcher (Commercial vs BOM Catalog vs Packages) */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('commercial')}
          className={`pb-3 px-4 text-xs font-black flex items-center gap-2 transition-all cursor-pointer border-b-2 shrink-0 ${
            activeTab === 'commercial'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Commercial Products ({commercialProducts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('bom')}
          className={`pb-3 px-4 text-xs font-black flex items-center gap-2 transition-all cursor-pointer border-b-2 shrink-0 ${
            activeTab === 'bom'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Bill of Materials (BOM) Catalog ({bomProducts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('packages')}
          className={`pb-3 px-4 text-xs font-black flex items-center gap-2 transition-all cursor-pointer border-b-2 shrink-0 ${
            activeTab === 'packages'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Packages Builder</span>
        </button>
      </div>

      {/* Packages Tab Content */}
      {activeTab === 'packages' ? (
        <PackageManager products={products} showToast={showToast} />
      ) : (
        <>
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

          {/* Search Input & View Mode Switcher */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center space-x-3 flex-1">
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

            {/* View Mode Switcher (List vs Grid) */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  setViewMode('list');
                  try { localStorage.setItem('products_view_mode', 'list'); } catch {}
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
                <span>List View</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('grid');
                  try { localStorage.setItem('products_view_mode', 'grid'); } catch {}
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Grid Cards View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
            </div>
          </div>

          {/* Low Stock Alert Banner (Commercial Products only) */}
          {activeTab === 'commercial' && lowStockItems.length > 0 && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-3 sm:p-4 rounded-xl flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-3">
                <span className="text-lg">⚠️</span>
                <div className="text-xs">
                  <p className="font-extrabold text-amber-900">Inventory Alert: {lowStockItems.length} items are running low in stock!</p>
                  <p className="text-amber-700 font-medium mt-0.5">Some components have fallen to or below their configured minimum alert threshold.</p>
                </div>
              </div>
            </div>
          )}

          {/* PRODUCTS LIST / TABLE VIEW */}
          {viewMode === 'list' ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200 text-[10.5px] font-black text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4 w-12 text-center">#</th>
                      <th className="py-3 px-4">Product / Item</th>
                      <th className="py-3 px-4">Category & Details</th>
                      <th className="py-3 px-4 text-right">Standard Rate</th>
                      <th className="py-3 px-4 text-center">In-Hand Stock</th>
                      {activeTab === 'commercial' && (
                        <th className="py-3 px-4 text-center">Serials</th>
                      )}
                      <th className="py-3 px-4 text-right">Total Valuation</th>
                      <th className="py-3 px-4 text-center w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredProducts.map((p, idx) => {
                      const unitsList = p.productUnits && p.productUnits.length > 0
                        ? p.productUnits
                        : (p.serialNumbers || []).map((sn, i) => ({ id: `u_${i}`, unitNumber: i + 1, serialNumber: sn, status: 'available' as const }));

                      const availableCount = unitsList.filter(u => u.status === 'available' || !u.status).length;
                      const soldCount = unitsList.filter(u => u.status && u.status !== 'available').length;
                      const totalUnits = unitsList.length || p.stockQuantity || 0;
                      const isLowStock = activeTab === 'commercial' && p.minStockThreshold !== undefined && availableCount <= p.minStockThreshold;
                      const isOutOfStock = availableCount === 0;

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isOutOfStock ? 'bg-rose-50/20' : isLowStock ? 'bg-amber-50/20' : ''
                          }`}
                        >
                          {/* # Index */}
                          <td className="py-3.5 px-4 text-center text-[11px] font-bold text-slate-400">
                            {idx + 1}
                          </td>

                          {/* Product Name & Description */}
                          <td className="py-3.5 px-4 min-w-[220px]">
                            <div className="font-extrabold text-slate-900 text-xs sm:text-[13px] leading-snug">
                              {p.name}
                            </div>
                            {p.description && (
                              <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                                {p.description}
                              </div>
                            )}
                          </td>

                          {/* Category, Brand, Unit */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1 items-center">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[9.5px] font-extrabold uppercase tracking-wider border ${
                                  p.category === 'bom_item'
                                    ? 'bg-purple-100 text-purple-900 border-purple-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                                }`}
                              >
                                {getCategoryLabel(p.category, p.bomCategory)}
                              </span>

                              {p.brand && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9.5px] font-black bg-blue-50 text-blue-800 border border-blue-100 uppercase tracking-wider">
                                  🏷️ {p.brand}
                                </span>
                              )}

                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[9.5px] font-black bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
                                📐 {p.unit || 'Nos'}
                              </span>
                            </div>
                          </td>

                          {/* Standard Rate */}
                          <td className="py-3.5 px-4 text-right font-black text-slate-900 whitespace-nowrap">
                            {p.category !== 'bom_item' ? (
                              <span>₹{(p.rate || 0).toLocaleString('en-IN')}</span>
                            ) : (
                              <span className="text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 text-[11px]">
                                {p.bomCategory || 'General'}
                              </span>
                            )}
                          </td>

                          {/* Stock Status */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                                  isOutOfStock
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : isLowStock
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isOutOfStock ? 'bg-rose-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                />
                                <span>{availableCount} Available</span>
                              </span>
                              {soldCount > 0 && (
                                <span className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                  {soldCount} Dispatched
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Serials Button */}
                          {activeTab === 'commercial' && (
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleOpenManageSerialsModal(p)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-[11px] rounded-lg border border-blue-200 transition-colors cursor-pointer"
                              >
                                <Barcode className="w-3.5 h-3.5" />
                                <span>Serials ({totalUnits})</span>
                              </button>
                            </td>
                          )}

                          {/* Total Valuation */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <span className="inline-block text-xs font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200/80">
                              ₹{((p.rate || p.bomRate || 0) * availableCount).toLocaleString('en-IN')}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(p)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Product"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteProduct(p.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredProducts.length === 0 && (
                <div className="bg-slate-50 border-t border-slate-200 p-8 text-center">
                  <Tag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-bold">
                    {activeTab === 'commercial'
                      ? 'No commercial products found. Click "➕ Add Product" to create new ones.'
                      : 'No Bill of Materials (BOM) items found. Click "📄 Add Bill of Materials (BOM)" to add components like cables, earthing kits, or switches.'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* GRID VIEW (CARDS) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((p) => {
                const unitsList = p.productUnits && p.productUnits.length > 0
                  ? p.productUnits
                  : (p.serialNumbers || []).map((sn, i) => ({ id: `u_${i}`, unitNumber: i + 1, serialNumber: sn, status: 'available' as const }));

                const availableCount = unitsList.filter(u => u.status === 'available' || !u.status).length;
                const soldCount = unitsList.filter(u => u.status && u.status !== 'available').length;
                const totalUnits = unitsList.length || p.stockQuantity || 0;

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

                      <h3 className="font-black text-slate-900 text-sm mt-3">{p.name}</h3>

                      {p.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                      {p.category !== 'bom_item' ? (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500 font-bold">Standard Price Rate:</span>
                          <span className="font-extrabold text-slate-900 text-sm">₹{(p.rate || 0).toLocaleString('en-IN')}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-purple-700 font-bold">Category Component:</span>
                          <span className="font-extrabold text-purple-900 text-xs bg-purple-50 px-2 py-0.5 rounded">
                            {p.bomCategory || 'General'}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-400 font-extrabold block uppercase tracking-wider">
                            {p.category === 'bom_item' ? 'Standard Stock' : 'Inventory Units'}
                          </span>
                          <span className="font-black text-slate-800 text-xs">
                            {availableCount} Available {soldCount > 0 ? `(${soldCount} Dispatched)` : ''}
                          </span>
                        </div>

                        {p.category !== 'bom_item' && (
                          <button
                            onClick={() => handleOpenManageSerialsModal(p)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-[10px] rounded-lg border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Barcode className="w-3.5 h-3.5" />
                            <span>Serials ({totalUnits})</span>
                          </button>
                        )}
                      </div>

                      <div className="flex justify-between items-center text-xs pt-1">
                        <span className="text-slate-500 font-bold text-[11px]">Total Stock Value:</span>
                        <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200/80 shadow-2xs">
                          ₹{((p.rate || p.bomRate || 0) * availableCount).toLocaleString('en-IN')}
                        </span>
                      </div>
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
          )}
        </>
      )}

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

                        <button
                          type="button"
                          onClick={() => {
                            setShowAddModal(false);
                            setShowAiPalletModal(true);
                          }}
                          className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          title="Scan label with AI to autofill product details and serials"
                        >
                          <Sparkles className="w-3 h-3 text-emerald-600" /> AI Scan
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
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                    <Barcode className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                      Unit Serial Numbers & Stock Partition
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

            {/* Inner Section Tabs: Available vs Sold vs All */}
            <div className="pt-3 pb-2 flex items-center gap-2 border-b border-slate-100 shrink-0 overflow-x-auto">
              <button
                type="button"
                onClick={() => setSerialModalTab('available')}
                className={`px-3.5 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer border ${
                  serialModalTab === 'available'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Available In-Stock ({managingUnits.filter(u => u.status === 'available').length})</span>
              </button>

              <button
                type="button"
                onClick={() => setSerialModalTab('sold')}
                className={`px-3.5 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer border ${
                  serialModalTab === 'sold'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Sold / Dispatched ({managingUnits.filter(u => u.status !== 'available').length})</span>
              </button>

              <button
                type="button"
                onClick={() => setSerialModalTab('all')}
                className={`px-3.5 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer border ${
                  serialModalTab === 'all'
                    ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>All Units ({managingUnits.length})</span>
              </button>
            </div>

            {/* Toolbar: Add New Stock Batch, Prefix Generator, Bulk Paste, Search */}
            <div className="py-3 space-y-3 shrink-0 border-b border-slate-100">
              {/* Add New Stock Entry / Batch Bar */}
              <div className="bg-emerald-50/80 border border-emerald-200 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-600 text-white rounded-lg">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-emerald-950 block">Add New Stock Entry / Batch</span>
                    <span className="text-[10px] text-emerald-700 font-semibold">Enter quantity to add as a new date partition (e.g. 50)</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center space-x-1.5 bg-white border border-emerald-300 px-2.5 py-1 rounded-xl shadow-2xs">
                    <span className="text-xs font-extrabold text-slate-600">+ Add:</span>
                    <input
                      type="number"
                      min={1}
                      value={addBatchQty}
                      onChange={(e) => setAddBatchQty(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                      placeholder="Qty (e.g. 50)"
                      className="w-20 text-xs font-black text-slate-900 focus:outline-none bg-transparent text-center"
                    />
                    <span className="text-xs font-bold text-slate-400">{managingSerialsProduct.unit || 'units'}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddStockBatch}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Stock Batch</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {/* Available Stock Indicator */}
                <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                  <span className="text-xs font-extrabold text-slate-600">Total Available Stock:</span>
                  <span className="text-xs font-black text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-200">
                    {managingStockQty} {managingSerialsProduct.unit || 'units'}
                  </span>
                </div>

                {/* Auto Generate & Bulk Paste Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center space-x-1 border border-slate-200 rounded-xl px-2 py-1 bg-white">
                    <input
                      type="text"
                      value={manageSerialPrefix}
                      onChange={(e) => setManageSerialPrefix(e.target.value)}
                      placeholder="Prefix e.g. CRO-"
                      className="text-xs font-bold text-slate-800 focus:outline-none w-24 bg-transparent"
                    />
                    <button
                      type="button"
                      onClick={handleAutoGenerateManageSerials}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                      title="Auto generate serial numbers sequentially for all units"
                    >
                      <RefreshCw className="w-3 h-3" /> Auto Fill
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowManageBulkPaste(!showManageBulkPaste)}
                    className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Clipboard className="w-3.5 h-3.5" /> Bulk Paste New Batch
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAiScanTargetProduct(managingSerialsProduct);
                      setShowAiPalletModal(true);
                    }}
                    className="px-3 py-1.5 bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 border border-emerald-300 text-emerald-800 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    title="Scan pallet packing slip photo to add serials directly to this product"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>AI Scan Pallet</span>
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
                    placeholder={`Paste serial numbers here:\nSN-2026-001\nSN-2026-002\nSN-2026-003...`}
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
                  placeholder="Filter by Serial Number, Unit #, or Entry Date..."
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs font-medium bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Scrollable Date-Partitioned Units View */}
            <div className="flex-1 overflow-y-auto py-3 pr-1 space-y-4 min-h-[240px]">
              {(() => {
                const indexedUnits = managingUnits.map((unit, actualIndex) => ({ unit, actualIndex }));
                const filteredByTab = indexedUnits.filter(({ unit }) => {
                  if (serialModalTab === 'available') return unit.status === 'available';
                  if (serialModalTab === 'sold') return unit.status !== 'available';
                  return true;
                });

                const filteredBySearch = filteredByTab.filter(({ unit }) => {
                  if (!serialSearchTerm) return true;
                  const term = serialSearchTerm.toLowerCase();
                  const dateStr = formatBatchDateDisplay(unit.addedAt).toLowerCase();
                  return (
                    unit.serialNumber.toLowerCase().includes(term) ||
                    String(unit.unitNumber).includes(term) ||
                    dateStr.includes(term)
                  );
                });

                const groupedByDate = groupUnitsByDate(filteredBySearch);

                if (groupedByDate.length === 0) {
                  return (
                    <div className="text-center py-10 text-slate-400 font-bold text-xs bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                      {serialModalTab === 'sold'
                        ? 'No sold or dispatched units recorded yet.'
                        : serialModalTab === 'available'
                        ? 'No available units in stock. Increase available stock quantity above to add unit serial numbers.'
                        : 'No serial numbers found matching search filter.'}
                    </div>
                  );
                }

                return groupedByDate.map((group) => (
                  <div key={group.dateKey} className="space-y-2">
                    {/* Stock Entry Date Partition Bar */}
                    <div className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-xs border-l-4 border-emerald-600 px-3.5 py-2 rounded-xl flex justify-between items-center shadow-2xs border border-slate-200/80">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-emerald-700" />
                        <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                          Stock Entry Date: {group.displayDate}
                        </span>
                        <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                          Batch ({group.items.length} Units)
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 hidden sm:inline">
                        Units #{group.items[0].unit.unitNumber} - #{group.items[group.items.length - 1].unit.unitNumber}
                      </span>
                    </div>

                    {/* Unit Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-1">
                      {group.items.map(({ unit, actualIndex }) => (
                        <div
                          key={unit.id}
                          className={`border rounded-xl p-2.5 flex items-center justify-between gap-2 transition-colors ${
                            unit.status === 'sold' || unit.status === 'dispatched'
                              ? 'bg-rose-50/50 border-rose-200'
                              : 'bg-slate-50 border-slate-200 hover:border-emerald-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2 shrink-0">
                            <span className={`w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center ${
                              unit.status === 'sold' || unit.status === 'dispatched'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              #{unit.unitNumber}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
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
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-slate-900 bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                            />
                            <div className="text-[9px] text-slate-400 font-semibold mt-0.5 flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5 text-slate-400" />
                              <span>Added: {formatBatchDateDisplay(unit.addedAt)}</span>
                            </div>
                          </div>

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
                                ? 'bg-rose-100 text-rose-700 border-rose-300'
                                : unit.status === 'dispatched'
                                ? 'bg-purple-100 text-purple-700 border-purple-300'
                                : unit.status === 'installed'
                                ? 'bg-blue-100 text-blue-700 border-blue-300'
                                : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                            }`}
                          >
                            <option value="available">Available</option>
                            <option value="sold">Sold (Out of Stock)</option>
                            <option value="dispatched">Dispatched</option>
                            <option value="installed">Installed</option>
                            <option value="allocated">Allocated</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-100 flex justify-between items-center shrink-0">
              <div className="text-xs font-extrabold text-slate-500 flex items-center gap-3">
                <span>Available: <strong className="text-emerald-700">{managingUnits.filter(u => u.status === 'available').length}</strong></span>
                <span>Sold/Dispatched: <strong className="text-rose-700">{managingUnits.filter(u => u.status !== 'available').length}</strong></span>
                <span>Total: <strong className="text-slate-900">{managingUnits.length}</strong></span>
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
      {/* MODAL 5: AI Pallet & Serial Numbers Scanner Modal */}
      {showAiPalletModal && (
        <AiPalletScannerModal
          isOpen={showAiPalletModal}
          onClose={() => {
            setShowAiPalletModal(false);
            setAiScanTargetProduct(null);
          }}
          products={products}
          preSelectedProduct={aiScanTargetProduct}
          onSuccess={(updatedOrNew, count) => {
            setProducts(prev => {
              const exists = prev.some(p => p.id === updatedOrNew.id);
              if (exists) {
                return prev.map(p => p.id === updatedOrNew.id ? updatedOrNew : p);
              } else {
                return [updatedOrNew, ...prev];
              }
            });

            // If user was viewing serials modal for this product, refresh its units
            if (managingSerialsProduct && managingSerialsProduct.id === updatedOrNew.id) {
              const norm = normalizeProductUnits(updatedOrNew);
              setManagingSerialsProduct(updatedOrNew);
              setManagingUnits(norm);
              setManagingStockQty(norm.filter(u => u.status === 'available').length);
            }
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
};

export default Products;
