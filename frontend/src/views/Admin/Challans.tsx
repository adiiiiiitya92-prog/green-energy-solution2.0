import React, { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { db, getDeletedRecordIdsSet } from '../../services/db';
import type { Challan, Lead, Profile, Product, ChallanItem, B2BBusiness, StockTransaction, Quotation, OrderConfirmation, Package } from '../../types';
import { challanService } from '../../services/challanService';
import { leadService } from '../../services/leadService';
import { employeeService } from '../../services/employeeService';
import { productService } from '../../services/productService';
import { b2bBusinessService } from '../../services/b2bBusinessService';
import { stockTransactionService } from '../../services/stockTransactionService';
import { quotationService } from '../../services/quotationService';
import { orderService } from '../../services/orderService';
import { packageService } from '../../services/packageService';
import { pdfService } from '../../services/pdfService';
import { getItemDispatchCategory } from '../../services/dispatchHelper';
import { useAuthStore } from '../../store/authStore';
import { SearchableProductSelect } from '../../components/Common/SearchableProductSelect';
import {
  Plus,
  Search,
  Truck,
  Trash2,
  ClipboardList,
  X,
  Building2,
  History,
  Zap,
  Sparkles,
  FileText,
  Check,
  Layers,
  Sun,
  ShieldCheck,
  CheckSquare,
  Package as PackageIcon,
  Camera,
  MapPin,
  Eye,
  CheckCircle2,
  Image as ImageIcon,
  Loader2
} from 'lucide-react';
import { uploadImageToFirebase } from '../../services/firebase';
import { acquireCurrentGpsLocation, applyGpsWatermark, type GpsWatermarkData } from '../../services/watermarkService';
import dayjs from 'dayjs';
import logoImg from '../../assets/Green-Energy-Solution.png';

export interface BomSelectableItem {
  id: string;
  name: string;
  category: 'structure' | 'inverter' | 'system' | 'bos' | 'other';
  categoryLabel: string;
  unit: string;
  stockAvailable: number;
  bomQty: number;
  dispatchQty: number;
  rate: number;
  selected: boolean;
  matchedProductId?: string;
}

export const Challans: React.FC = () => {
  const { currentRole, currentUser } = useAuthStore();
  const location = useLocation();

  const [challans, setChallans] = useState<Challan[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Mode Selection: Standard Lead Challan vs B2B Challan
  const [isB2BMode, setIsB2BMode] = useState(false);

  // Lead Mode Form states & Searchable Picker
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedLeadData, setSelectedLeadData] = useState<Lead | null>(null);
  const [leadQuotation, setLeadQuotation] = useState<Quotation | null>(null);
  const [leadOrder, setLeadOrder] = useState<OrderConfirmation | null>(null);
  const [isLoadingLeadInfo, setIsLoadingLeadInfo] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [isLeadDropdownOpen, setIsLeadDropdownOpen] = useState(false);

  // B2B Mode Form states & Autocomplete
  const [b2bBusinessId, setB2bBusinessId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');

  const [b2bSuggestions, setB2bSuggestions] = useState<B2BBusiness[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Shared Form states
  const [assignedEmployeeId, setAssignedEmployeeId] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [challanItems, setChallanItems] = useState<ChallanItem[]>([]);
  const [notes, setNotes] = useState('');

  // Row selection states
  const [currentProductId, setCurrentProductId] = useState('');
  const [currentQty, setCurrentQty] = useState(1);
  const [currentUnit, setCurrentUnit] = useState('Nos');
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [serialSearchTerm, setSerialSearchTerm] = useState('');
  const [showPasteSerialsDrawer, setShowPasteSerialsDrawer] = useState(false);
  const [pasteSerialsInput, setPasteSerialsInput] = useState('');

  // Edit Form States
  const [editingChallan, setEditingChallan] = useState<Challan | null>(null);
  const [editVehicleNumber, setEditVehicleNumber] = useState('');
  const [editDriverName, setEditDriverName] = useState('');
  const [editDriverPhone, setEditDriverPhone] = useState('');
  const [editChallanItems, setEditChallanItems] = useState<ChallanItem[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [currentEditProductId, setCurrentEditProductId] = useState('');
  const [currentEditQty, setCurrentEditQty] = useState(1);
  const [currentEditUnit, setCurrentEditUnit] = useState('Nos');
  const [selectedEditSerials, setSelectedEditSerials] = useState<string[]>([]);
  const [editSerialSearchTerm, setEditSerialSearchTerm] = useState('');
  const [showEditPasteSerialsDrawer, setShowEditPasteSerialsDrawer] = useState(false);
  const [editPasteSerialsInput, setEditPasteSerialsInput] = useState('');

  // Vehicle Photo with GPS states for New Challan
  const [vehiclePhotoBlob, setVehiclePhotoBlob] = useState<Blob | null>(null);
  const [vehiclePhotoDataUrl, setVehiclePhotoDataUrl] = useState<string | null>(null);
  const [vehiclePhotoGps, setVehiclePhotoGps] = useState<GpsWatermarkData | null>(null);
  const [isProcessingVehicleGps, setIsProcessingVehicleGps] = useState(false);
  const [vehicleGpsError, setVehicleGpsError] = useState<string | null>(null);

  // Vehicle Photo with GPS states for Edit Challan
  const [editVehiclePhoto, setEditVehiclePhoto] = useState<string | null>(null);
  const [editVehiclePhotoBlob, setEditVehiclePhotoBlob] = useState<Blob | null>(null);
  const [editVehiclePhotoDataUrl, setEditVehiclePhotoDataUrl] = useState<string | null>(null);
  const [editVehiclePhotoGps, setEditVehiclePhotoGps] = useState<GpsWatermarkData | null>(null);
  const [isProcessingEditVehicleGps, setIsProcessingEditVehicleGps] = useState(false);

  // Lightbox preview state
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const handleVehiclePhotoCapture = async (file: File, isEditMode = false) => {
    if (isEditMode) {
      setIsProcessingEditVehicleGps(true);
    } else {
      setIsProcessingVehicleGps(true);
      setVehicleGpsError(null);
    }

    try {
      let gps: GpsWatermarkData | null = null;
      try {
        gps = await acquireCurrentGpsLocation();
      } catch (gpsErr: any) {
        console.warn("Challan vehicle photo GPS note:", gpsErr);
        if (!isEditMode) {
          setVehicleGpsError(gpsErr.message || 'GPS location unavailable');
        }
      }

      const currentVehNo = (isEditMode ? editVehicleNumber : vehicleNumber).trim() || 'VEHICLE';
      const currentDriver = (isEditMode ? editDriverName : driverName).trim() || 'Driver';
      const clientName = isB2BMode ? (businessName || 'B2B Client') : (selectedLeadData?.name || 'Customer');

      const detailLine = `VEHICLE: ${currentVehNo} • DRIVER: ${currentDriver} • CLIENT: ${clientName}`;

      const result = await applyGpsWatermark(file, {
        gps,
        title: '🚚 DELIVERY CHALLAN • VEHICLE DISPATCH PROOF',
        subtitle: 'GREEN ENERGY SOLUTION • MATERIAL DISPATCH AUDIT',
        customDetailLine: detailLine,
        customerName: clientName,
        locationFallback: 'Dispatch Yard / Warehouse Site'
      });

      if (isEditMode) {
        setEditVehiclePhotoBlob(result.watermarkedBlob);
        setEditVehiclePhotoDataUrl(result.watermarkedDataUrl);
        setEditVehiclePhotoGps(result.gps);
      } else {
        setVehiclePhotoBlob(result.watermarkedBlob);
        setVehiclePhotoDataUrl(result.watermarkedDataUrl);
        setVehiclePhotoGps(result.gps);
      }
    } catch (err: any) {
      alert("Error processing vehicle photo: " + (err?.message || err));
    } finally {
      if (isEditMode) {
        setIsProcessingEditVehicleGps(false);
      } else {
        setIsProcessingVehicleGps(false);
      }
    }
  };

  // Date & Type Filters & Collapsible card State
  const [typeFilter, setTypeFilter] = useState<'all' | 'lead' | 'b2b'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedChallanId, setExpandedChallanId] = useState<string | null>(null);

  // Stock History Modal State
  const [showStockHistoryModal, setShowStockHistoryModal] = useState(false);
  const [stockTxns, setStockTxns] = useState<StockTransaction[]>([]);
  const [stockTxnSearch, setStockTxnSearch] = useState('');

  // BOM Selector Modal States
  const [showBomModal, setShowBomModal] = useState(false);
  const [availablePackages, setAvailablePackages] = useState<Package[]>([]);
  const [selectedBomSourceType, setSelectedBomSourceType] = useState<'quotation' | 'package' | 'catalog_kit'>('quotation');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [selectedKitCategory, setSelectedKitCategory] = useState<'all' | 'structure' | 'inverter' | 'system' | 'bos'>('all');
  const [bomItemsToSelect, setBomItemsToSelect] = useState<BomSelectableItem[]>([]);
  const [bomCategoryFilter, setBomCategoryFilter] = useState<'all' | 'structure' | 'inverter' | 'system' | 'bos'>('all');
  const [bomSearchTerm, setBomSearchTerm] = useState('');
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);

  // Fast Instant Local Hydration on Mount (0ms)
  useEffect(() => {
    let isMounted = true;
    const hydrateLocal = async () => {
      try {
        const deletedIds = await getDeletedRecordIdsSet();
        const [localChallans, localLeads, localEmps, localProds] = await Promise.all([
          db.challans.orderBy('createdAt').reverse().toArray().catch(() => []),
          db.leads.toArray().catch(() => []),
          db.profiles.filter(p => p.role === 'sales_person' || p.role === 'admin' || p.role === 'field_employee').toArray().catch(() => []),
          db.products.toArray().catch(() => [])
        ]);

        if (!isMounted) return;

        const validChallans = (localChallans || []).filter(c => !deletedIds.has(c.id) && (!c.leadId || !deletedIds.has(c.leadId)));
        const validLeads = (localLeads || []).filter(l => !deletedIds.has(l.id));
        const sortedLeads = [...validLeads].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const validProds = (localProds || []).filter(p => !deletedIds.has(p.id));

        setChallans(validChallans);
        setLeads(sortedLeads);
        setEmployees(localEmps || []);
        setProducts(validProds);
      } catch (err) {
        console.warn("Challans local hydration note:", err);
      }
    };

    hydrateLocal();
    return () => { isMounted = false; };
  }, []);

  const isLoadingDataRef = useRef(false);
  const pendingReloadRef = useRef(false);

  const loadData = async () => {
    if (isLoadingDataRef.current) {
      pendingReloadRef.current = true;
      return;
    }
    isLoadingDataRef.current = true;
    try {
      const [cList, rawLeads, eList, pList] = await Promise.all([
        challanService.getChallans(false),
        leadService.getLeads(false),
        employeeService.getEmployees().catch(() => []),
        productService.getProducts().catch(() => [])
      ]);

      const sortedLeads = [...(rawLeads || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      // Batched update
      setChallans(cList || []);
      setLeads(sortedLeads);
      if (eList && eList.length > 0) setEmployees(eList);
      if (pList && pList.length > 0) setProducts(pList);
    } catch (e) {
      console.warn("Challans loadData error note:", e);
    } finally {
      isLoadingDataRef.current = false;
      if (pendingReloadRef.current) {
        pendingReloadRef.current = false;
        setTimeout(() => loadData(), 300);
      }
    }
  };

  useEffect(() => {
    loadData();
    let realtimeDebounceTimer: any = null;
    const handleRealtimeUpdate = (e?: any) => {
      const col = e?.detail?.collectionName;
      if (col && !['challans', 'leads', 'products', 'profiles'].includes(col)) {
        return;
      }
      if (realtimeDebounceTimer) clearTimeout(realtimeDebounceTimer);
      realtimeDebounceTimer = setTimeout(() => {
        loadData();
      }, 3000);
    };
    window.addEventListener('app-realtime-update', handleRealtimeUpdate);
    return () => {
      if (realtimeDebounceTimer) clearTimeout(realtimeDebounceTimer);
      window.removeEventListener('app-realtime-update', handleRealtimeUpdate);
    };
  }, []);

  // Handle location state navigation triggers (e.g. from B2B Businesses page or Lead Card dispatch actions)
  useEffect(() => {
    if (location.state?.isB2BMode || location.state?.prefillBusiness) {
      setIsB2BMode(true);
      if (location.state?.prefillBusiness) {
        const b: B2BBusiness = location.state.prefillBusiness;
        setB2bBusinessId(b.id);
        setBusinessName(b.businessName);
        setGstNumber(b.gstNumber || '');
        setBusinessAddress(b.businessAddress || '');
        setContactPerson(b.contactPerson || '');
        setMobileNumber(b.mobileNumber || '');
        setEmail(b.email || '');
      }
      setShowAddModal(true);
    } else if (location.state?.prefillLeadId || location.state?.prefillLead) {
      setIsB2BMode(false);
      const leadId = location.state.prefillLeadId || location.state.prefillLead?.id;
      leadService.getLeadById(leadId).then(targetLead => {
        if (targetLead) {
          handleSelectLead(targetLead);
          setShowAddModal(true);
        }
      }).catch(err => console.warn("Prefill lead error:", err));
    }
  }, [location.state]);

  const handleOpenAddModal = (b2bMode = false) => {
    setIsB2BMode(b2bMode);
    setSelectedLeadId('');
    setSelectedLeadData(null);
    setLeadQuotation(null);
    setLeadOrder(null);
    setIsLoadingLeadInfo(false);
    setLeadSearchQuery('');
    setIsLeadDropdownOpen(false);

    setB2bBusinessId('');
    setBusinessName('');
    setGstNumber('');
    setBusinessAddress('');
    setContactPerson('');
    setMobileNumber('');
    setEmail('');
    setB2bSuggestions([]);
    setShowSuggestions(false);

    setAssignedEmployeeId('');
    setVehicleNumber('');
    setDriverName('');
    setDriverPhone('');
    setChallanItems([]);
    setNotes('');
    setCurrentProductId('');
    setCurrentQty(1);
    setCurrentUnit('Nos');
    setSelectedSerials([]);
    setVehiclePhotoBlob(null);
    setVehiclePhotoDataUrl(null);
    setVehiclePhotoGps(null);
    setIsProcessingVehicleGps(false);
    setVehicleGpsError(null);
    setShowAddModal(true);
  };

  const handleSelectLead = async (lead: Lead) => {
    setSelectedLeadId(lead.id);
    setSelectedLeadData(lead);
    setIsLeadDropdownOpen(false);
    setLeadSearchQuery('');

    // Auto-assign employee if assigned in lead
    const targetEmpId = lead.assignedEmployeeId || lead.assignedSalesPersonId || lead.assignedAdminId;
    if (targetEmpId) {
      const foundEmp = employees.find(e => e.id === targetEmpId);
      if (foundEmp) {
        setAssignedEmployeeId(foundEmp.id);
      }
    }

    setIsLoadingLeadInfo(true);
    try {
      const [quotes, oc] = await Promise.all([
        quotationService.getQuotationsByLeadId(lead.id),
        orderService.getOrderConfirmationByLeadId(lead.id)
      ]);
      const validQuote = quotes.find(q => q.items && q.items.length > 0) || quotes[0] || null;
      setLeadQuotation(validQuote || null);
      setLeadOrder(oc || null);
    } catch (err) {
      console.warn("Lead info fetch note:", err);
    } finally {
      setIsLoadingLeadInfo(false);
    }
  };

  const buildSelectableItemsFromQuotation = (q: Quotation): BomSelectableItem[] => {
    const rawList: { name: string; qty: number; unit?: string; rate?: number; category?: string }[] = [];
    
    // Combine quotation items and bomItems if present
    if (q.bomItems && q.bomItems.length > 0) {
      q.bomItems.forEach(b => {
        if (b.itemName && !b.isHeader) {
          rawList.push({
            name: b.itemName,
            qty: Number(b.qty) || 1,
            unit: b.unit || 'Nos',
            rate: 0,
            category: b.category
          });
        }
      });
    }
    
    if (q.items && q.items.length > 0) {
      q.items.forEach(item => {
        if (item.itemName && !rawList.some(r => (r.name || '').toLowerCase().trim() === item.itemName.toLowerCase().trim())) {
          rawList.push({
            name: item.itemName,
            qty: Number(item.qty) || 1,
            unit: item.unit || 'Nos',
            rate: Number(item.rate) || 0
          });
        }
      });
    }

    return rawList.map((item, idx) => {
      const cleanName = (item.name || '').toLowerCase().trim();
      const matchedProd = products.find(p => {
        const pName = (p.name || '').toLowerCase().trim();
        return pName === cleanName || pName.includes(cleanName) || cleanName.includes(pName);
      });

      const { category, categoryLabel } = getItemDispatchCategory({
        productName: item.name,
        category: matchedProd?.category || item.category
      });

      return {
        id: `bom_q_${idx}_${Date.now()}`,
        name: item.name,
        category,
        categoryLabel,
        unit: item.unit || matchedProd?.unit || 'Nos',
        stockAvailable: matchedProd ? matchedProd.stockQuantity : 0,
        bomQty: item.qty,
        dispatchQty: item.qty,
        rate: matchedProd?.rate || item.rate || 0,
        selected: true,
        matchedProductId: matchedProd?.id
      };
    });
  };

  const buildSelectableItemsFromPackage = (pkg: Package): BomSelectableItem[] => {
    const rawList: { name: string; qty: number; unit?: string; rate?: number; category?: string }[] = [];

    if (pkg.bomItems && pkg.bomItems.length > 0) {
      pkg.bomItems.forEach(b => {
        rawList.push({
          name: b.name,
          qty: Number(b.qty) || 1,
          unit: b.unit || 'Nos',
          rate: Number(b.rate) || 0,
          category: b.category || b.bomCategory
        });
      });
    }

    if (pkg.commercialItems && pkg.commercialItems.length > 0) {
      pkg.commercialItems.forEach(c => {
        if (!rawList.some(r => (r.name || '').toLowerCase().trim() === (c.name || '').toLowerCase().trim())) {
          rawList.push({
            name: c.name,
            qty: Number(c.qty) || 1,
            unit: c.unit || 'Nos',
            rate: Number(c.rate) || 0,
            category: c.category
          });
        }
      });
    }

    return rawList.map((item, idx) => {
      const cleanName = (item.name || '').toLowerCase().trim();
      const matchedProd = products.find(p => {
        const pName = (p.name || '').toLowerCase().trim();
        return pName === cleanName || pName.includes(cleanName) || cleanName.includes(pName);
      });

      const { category, categoryLabel } = getItemDispatchCategory({
        productName: item.name,
        category: matchedProd?.category || item.category
      });

      return {
        id: `bom_pkg_${idx}_${Date.now()}`,
        name: item.name,
        category,
        categoryLabel,
        unit: item.unit || matchedProd?.unit || 'Nos',
        stockAvailable: matchedProd ? matchedProd.stockQuantity : 0,
        bomQty: item.qty,
        dispatchQty: item.qty,
        rate: matchedProd?.rate || item.rate || 0,
        selected: true,
        matchedProductId: matchedProd?.id
      };
    });
  };

  const buildSelectableItemsFromCatalogKit = (kitCat: 'all' | 'structure' | 'inverter' | 'system' | 'bos'): BomSelectableItem[] => {
    let prods = products;
    if (kitCat !== 'all') {
      prods = products.filter(p => {
        const { category } = getItemDispatchCategory({ productName: p.name, category: p.category });
        return category === kitCat;
      });
    }

    return prods.map((p, idx) => {
      const { category, categoryLabel } = getItemDispatchCategory({ productName: p.name, category: p.category });
      return {
        id: `bom_cat_${p.id}_${idx}`,
        name: p.name,
        category,
        categoryLabel,
        unit: p.unit || 'Nos',
        stockAvailable: p.stockQuantity,
        bomQty: 1,
        dispatchQty: 1,
        rate: p.rate || 0,
        selected: true,
        matchedProductId: p.id
      };
    });
  };

  const handleOpenBomSelectorModal = async () => {
    setIsLoadingPackages(true);
    try {
      const pkgs = await packageService.getPackages();
      const activePkgs = pkgs.filter(p => p.status === 'active' || !p.status);
      setAvailablePackages(activePkgs);

      if (leadQuotation && ((leadQuotation.items && leadQuotation.items.length > 0) || (leadQuotation.bomItems && leadQuotation.bomItems.length > 0))) {
        setSelectedBomSourceType('quotation');
        setBomItemsToSelect(buildSelectableItemsFromQuotation(leadQuotation));
      } else if (activePkgs.length > 0) {
        setSelectedBomSourceType('package');
        setSelectedPackageId(activePkgs[0].id);
        setBomItemsToSelect(buildSelectableItemsFromPackage(activePkgs[0]));
      } else {
        setSelectedBomSourceType('catalog_kit');
        setSelectedKitCategory('all');
        setBomItemsToSelect(buildSelectableItemsFromCatalogKit('all'));
      }
    } catch (err) {
      console.warn("Packages load note:", err);
    } finally {
      setIsLoadingPackages(false);
    }

    setBomCategoryFilter('all');
    setBomSearchTerm('');
    setShowBomModal(true);
  };

  const handleSourceTypeChange = (source: 'quotation' | 'package' | 'catalog_kit') => {
    setSelectedBomSourceType(source);
    if (source === 'quotation') {
      if (leadQuotation) {
        setBomItemsToSelect(buildSelectableItemsFromQuotation(leadQuotation));
      } else {
        setBomItemsToSelect([]);
      }
    } else if (source === 'package') {
      if (availablePackages.length > 0) {
        const targetPkg = availablePackages.find(p => p.id === selectedPackageId) || availablePackages[0];
        setSelectedPackageId(targetPkg.id);
        setBomItemsToSelect(buildSelectableItemsFromPackage(targetPkg));
      } else {
        setBomItemsToSelect([]);
      }
    } else if (source === 'catalog_kit') {
      setBomItemsToSelect(buildSelectableItemsFromCatalogKit(selectedKitCategory));
    }
  };

  const handleSelectPackageForBom = (pkgId: string) => {
    setSelectedPackageId(pkgId);
    const targetPkg = availablePackages.find(p => p.id === pkgId);
    if (targetPkg) {
      setBomItemsToSelect(buildSelectableItemsFromPackage(targetPkg));
    }
  };

  const handleSelectKitCategoryForBom = (cat: 'all' | 'structure' | 'inverter' | 'system' | 'bos') => {
    setSelectedKitCategory(cat);
    setBomItemsToSelect(buildSelectableItemsFromCatalogKit(cat));
  };

  const handleToggleBomItemSelect = (id: string) => {
    setBomItemsToSelect(prev =>
      prev.map(item => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleSetAllBomItemsSelect = (select: boolean) => {
    setBomItemsToSelect(prev =>
      prev.map(item => {
        if (bomCategoryFilter === 'all' || item.category === bomCategoryFilter) {
          return { ...item, selected: select };
        }
        return item;
      })
    );
  };

  const handleSelectOnlyCategory = (cat: 'structure' | 'inverter' | 'system' | 'bos') => {
    setBomCategoryFilter(cat);
    setBomItemsToSelect(prev =>
      prev.map(item => ({
        ...item,
        selected: item.category === cat
      }))
    );
  };

  const handleBomItemQtyChange = (id: string, newQty: number) => {
    const qty = Math.max(1, newQty);
    setBomItemsToSelect(prev =>
      prev.map(item => (item.id === id ? { ...item, dispatchQty: qty, selected: true } : item))
    );
  };

  const handleImportBomToChallan = () => {
    const selectedItems = bomItemsToSelect.filter(item => item.selected && item.dispatchQty > 0);
    if (selectedItems.length === 0) {
      alert('Please select at least one BOM item with quantity greater than 0.');
      return;
    }

    const importedChallanItems: ChallanItem[] = [];

    for (const item of selectedItems) {
      let prodId = item.matchedProductId;
      let targetProduct = products.find(p => p.id === prodId);

      if (!targetProduct) {
        const cleanName = (item.name || '').toLowerCase().trim();
        targetProduct = products.find(p => {
          const pName = (p.name || '').toLowerCase().trim();
          return pName === cleanName || pName.includes(cleanName) || cleanName.includes(pName);
        });
        if (targetProduct) {
          prodId = targetProduct.id;
        }
      }

      const qty = item.dispatchQty;
      const unit = item.unit || targetProduct?.unit || 'Nos';

      if (targetProduct) {
        const availSerials = getAvailableSerialsForProduct(targetProduct.id, null);
        importedChallanItems.push({
          productId: targetProduct.id,
          productName: targetProduct.name,
          qty: qty,
          unit: unit,
          rate: targetProduct.rate || item.rate || 0,
          serialNumbers: availSerials.slice(0, qty)
        });
      } else {
        importedChallanItems.push({
          productId: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          productName: item.name,
          qty: qty,
          unit: unit,
          rate: item.rate || 0,
          serialNumbers: []
        });
      }
    }

    // Merge with existing items (avoid duplicate productIds by overriding or appending)
    setChallanItems(prev => {
      const existingFiltered = prev.filter(p => !importedChallanItems.some(i => i.productId === p.productId));
      return [...existingFiltered, ...importedChallanItems];
    });

    setShowBomModal(false);
    alert(`✅ Successfully added ${importedChallanItems.length} BOM item(s) to Delivery Challan!`);
  };

  const handleProductSelect = (prodId: string) => {
    setCurrentProductId(prodId);
    setSerialSearchTerm('');
    setShowPasteSerialsDrawer(false);
    setPasteSerialsInput('');
    const p = products.find(prod => prod.id === prodId);
    if (p && p.unit) {
      setCurrentUnit(p.unit);
    } else {
      setCurrentUnit('Nos');
    }
  };

  const handleEditProductSelect = (prodId: string) => {
    setCurrentEditProductId(prodId);
    setEditSerialSearchTerm('');
    setShowEditPasteSerialsDrawer(false);
    setEditPasteSerialsInput('');
    const p = products.find(prod => prod.id === prodId);
    if (p && p.unit) {
      setCurrentEditUnit(p.unit);
    } else {
      setCurrentEditUnit('Nos');
    }
  };

  // Autocomplete Business Search
  const handleBusinessNameChange = async (val: string) => {
    setBusinessName(val);
    setB2bBusinessId('');
    if (val.trim().length > 0) {
      const suggestions = await b2bBusinessService.searchBusinesses(val);
      setB2bSuggestions(suggestions);
      setShowSuggestions(true);
    } else {
      setB2bSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (b: B2BBusiness) => {
    setB2bBusinessId(b.id);
    setBusinessName(b.businessName);
    setGstNumber(b.gstNumber || '');
    setBusinessAddress(b.businessAddress || '');
    setContactPerson(b.contactPerson || '');
    setMobileNumber(b.mobileNumber || '');
    setEmail(b.email || '');
    setShowSuggestions(false);
  };

  const loadStockHistory = async () => {
    const list = await stockTransactionService.getTransactions();
    setStockTxns(list);
    setShowStockHistoryModal(true);
  };

  const getAvailableSerialsForProduct = (prodId: string, currentChallan?: Challan | null) => {
    const p = products.find(prod => prod.id === prodId);
    if (!p) return [];

    const existingInChallan = currentChallan?.items.find(i => i.productId === prodId)?.serialNumbers || [];

    const units = (p.productUnits || []).filter(u =>
      u.status === 'available' || !u.status || existingInChallan.includes(u.serialNumber)
    ).map(u => u.serialNumber);

    const fallback = (p.serialNumbers || []).filter(sn => {
      const matchUnit = p.productUnits?.find(u => u.serialNumber === sn);
      return !matchUnit || matchUnit.status === 'available' || !matchUnit.status || existingInChallan.includes(sn);
    });

    return Array.from(new Set([...units, ...fallback]));
  };

  useEffect(() => {
    if (!currentProductId) {
      setSelectedSerials([]);
      return;
    }
    const avail = getAvailableSerialsForProduct(currentProductId, null);
    setSelectedSerials(avail.slice(0, currentQty));
  }, [currentProductId, products]);

  useEffect(() => {
    if (!currentEditProductId) {
      setSelectedEditSerials([]);
      return;
    }
    const avail = getAvailableSerialsForProduct(currentEditProductId, editingChallan);
    setSelectedEditSerials(avail.slice(0, currentEditQty));
  }, [currentEditProductId, products, editingChallan]);

  const handleQtyChange = (newQty: number) => {
    const qty = Math.max(1, newQty);
    setCurrentQty(qty);
    if (currentProductId) {
      const avail = getAvailableSerialsForProduct(currentProductId, null);
      setSelectedSerials(avail.slice(0, qty));
    }
  };

  const handleEditQtyChange = (newQty: number) => {
    const qty = Math.max(1, newQty);
    setCurrentEditQty(qty);
    if (currentEditProductId) {
      const avail = getAvailableSerialsForProduct(currentEditProductId, editingChallan);
      setSelectedEditSerials(avail.slice(0, qty));
    }
  };

  const toggleSerialSelection = (sn: string) => {
    setSelectedSerials(prev => {
      const next = prev.includes(sn) ? prev.filter(s => s !== sn) : [...prev, sn];
      setCurrentQty(next.length > 0 ? next.length : 1);
      return next;
    });
  };

  const toggleEditSerialSelection = (sn: string) => {
    setSelectedEditSerials(prev => {
      const next = prev.includes(sn) ? prev.filter(s => s !== sn) : [...prev, sn];
      setCurrentEditQty(next.length > 0 ? next.length : 1);
      return next;
    });
  };

  // Serial number quick search & scan handler (Barcode / Enter key support)
  const handleSerialSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, isEdit: boolean = false) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const term = (isEdit ? editSerialSearchTerm : serialSearchTerm).trim().toLowerCase();
      if (!term) return;

      const avail = isEdit
        ? getAvailableSerialsForProduct(currentEditProductId, editingChallan)
        : getAvailableSerialsForProduct(currentProductId, null);

      const match = avail.find(sn => sn.toLowerCase() === term) ||
                    avail.find(sn => sn.toLowerCase().startsWith(term)) ||
                    avail.find(sn => sn.toLowerCase().includes(term));

      if (match) {
        if (isEdit) {
          setSelectedEditSerials(prev => {
            const next = prev.includes(match) ? prev : [...prev, match];
            setCurrentEditQty(next.length > 0 ? next.length : 1);
            return next;
          });
          setEditSerialSearchTerm('');
        } else {
          setSelectedSerials(prev => {
            const next = prev.includes(match) ? prev : [...prev, match];
            setCurrentQty(next.length > 0 ? next.length : 1);
            return next;
          });
          setSerialSearchTerm('');
        }
      } else {
        alert(`Serial number "${term}" is either sold out or not in available stock.`);
      }
    }
  };

  const handleSelectFirstNSerials = (isEdit: boolean = false) => {
    if (isEdit) {
      const avail = getAvailableSerialsForProduct(currentEditProductId, editingChallan);
      const toPick = avail.slice(0, currentEditQty);
      setSelectedEditSerials(toPick);
    } else {
      const avail = getAvailableSerialsForProduct(currentProductId, null);
      const toPick = avail.slice(0, currentQty);
      setSelectedSerials(toPick);
    }
  };

  const handleSelectAllFilteredSerials = (filteredSerials: string[], isEdit: boolean = false) => {
    if (isEdit) {
      setSelectedEditSerials(prev => {
        const set = new Set([...prev, ...filteredSerials]);
        const next = Array.from(set);
        setCurrentEditQty(next.length > 0 ? next.length : 1);
        return next;
      });
    } else {
      setSelectedSerials(prev => {
        const set = new Set([...prev, ...filteredSerials]);
        const next = Array.from(set);
        setCurrentQty(next.length > 0 ? next.length : 1);
        return next;
      });
    }
  };

  const handleClearAllSerials = (isEdit: boolean = false) => {
    if (isEdit) {
      setSelectedEditSerials([]);
      setCurrentEditQty(1);
    } else {
      setSelectedSerials([]);
      setCurrentQty(1);
    }
  };

  const handleApplyPastedSerials = (isEdit: boolean = false) => {
    const rawInput = isEdit ? editPasteSerialsInput : pasteSerialsInput;
    const tokens = rawInput
      .split(/[\r\n,;\t\s]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      alert('Please paste at least one serial number.');
      return;
    }

    const avail = isEdit
      ? getAvailableSerialsForProduct(currentEditProductId, editingChallan)
      : getAvailableSerialsForProduct(currentProductId, null);

    const matchedSerials: string[] = [];
    const notFoundTokens: string[] = [];

    tokens.forEach(tok => {
      const tokLower = tok.toLowerCase();
      const match = avail.find(s => s.toLowerCase() === tokLower);
      if (match) {
        if (!matchedSerials.includes(match)) {
          matchedSerials.push(match);
        }
      } else {
        notFoundTokens.push(tok);
      }
    });

    if (matchedSerials.length === 0) {
      alert(`None of the pasted serial numbers were found in available stock.\nCheck entered values:\n${tokens.slice(0, 5).join(', ')}...`);
      return;
    }

    if (isEdit) {
      setSelectedEditSerials(prev => {
        const set = new Set([...prev, ...matchedSerials]);
        const next = Array.from(set);
        setCurrentEditQty(next.length > 0 ? next.length : 1);
        return next;
      });
      setEditPasteSerialsInput('');
      setShowEditPasteSerialsDrawer(false);
    } else {
      setSelectedSerials(prev => {
        const set = new Set([...prev, ...matchedSerials]);
        const next = Array.from(set);
        setCurrentQty(next.length > 0 ? next.length : 1);
        return next;
      });
      setPasteSerialsInput('');
      setShowPasteSerialsDrawer(false);
    }

    if (notFoundTokens.length > 0) {
      alert(`✅ Selected ${matchedSerials.length} serial numbers.\n⚠️ ${notFoundTokens.length} serials not found or already sold:\n${notFoundTokens.slice(0, 5).join(', ')}${notFoundTokens.length > 5 ? '...' : ''}`);
    } else {
      alert(`✅ Successfully selected all ${matchedSerials.length} serial numbers!`);
    }
  };

  const handleAddItem = () => {
    if (!currentProductId || currentQty <= 0) {
      alert('Please select a product and enter a valid quantity.');
      return;
    }

    const targetProduct = products.find(p => p.id === currentProductId);
    if (!targetProduct) return;

    // Check if stock is sufficient
    if (targetProduct.stockQuantity < currentQty) {
      alert('Insufficient stock available.');
      return;
    }

    // Check duplicate
    if (challanItems.some(item => item.productId === currentProductId)) {
      alert('Product already added. Update quantity or delete to recreate.');
      return;
    }

    const newItem: ChallanItem = {
      productId: currentProductId,
      productName: targetProduct.name,
      qty: currentQty,
      unit: currentUnit.trim() || targetProduct.unit || 'Nos',
      rate: targetProduct.rate || 0,
      serialNumbers: selectedSerials
    };

    setChallanItems([...challanItems, newItem]);
    setCurrentProductId('');
    setCurrentQty(1);
    setCurrentUnit('Nos');
    setSelectedSerials([]);
    setSerialSearchTerm('');
    setShowPasteSerialsDrawer(false);
    setPasteSerialsInput('');
  };

  const handleRemoveItem = (index: number) => {
    setChallanItems(challanItems.filter((_, i) => i !== index));
  };

  const handleCreateChallan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (challanItems.length === 0) {
      alert('Please add at least one product item to dispatch.');
      return;
    }

    const emp = employees.find(e => e.id === assignedEmployeeId);
    if (!emp) {
      alert('Please select an assigned dispatch representative.');
      return;
    }

    // Upload vehicle photo if captured
    let uploadedVehiclePhotoUrl: string | undefined = undefined;
    if (vehiclePhotoBlob) {
      try {
        uploadedVehiclePhotoUrl = await uploadImageToFirebase(
          vehiclePhotoBlob,
          `challans/vehicle_photos/vehicle_${Date.now()}.jpg`
        );
      } catch (uploadErr) {
        console.warn("Vehicle photo upload note, using data URL fallback:", uploadErr);
        uploadedVehiclePhotoUrl = vehiclePhotoDataUrl || undefined;
      }
    }

    if (isB2BMode) {
      // B2B Challan Validation
      if (!businessName.trim() || !businessAddress.trim() || !vehicleNumber || !driverName || !driverPhone) {
        alert('Please fill out all required B2B business and dispatch details.');
        return;
      }

      try {
        await challanService.createChallan({
          type: 'b2b',
          b2bBusinessId: b2bBusinessId || undefined,
          businessName: businessName.trim(),
          gstNumber: gstNumber.trim() || undefined,
          businessAddress: businessAddress.trim(),
          contactPerson: contactPerson.trim() || undefined,
          mobileNumber: mobileNumber.trim() || undefined,
          email: email.trim() || undefined,
          assignedEmployeeId,
          employeeName: emp.fullName,
          vehicleNumber,
          driverName,
          driverPhone,
          vehiclePhoto: uploadedVehiclePhotoUrl,
          vehiclePhotoGps: vehiclePhotoGps || undefined,
          items: challanItems,
          notes: notes || undefined
        });

        alert('B2B Delivery Challan created successfully and inventory stock adjusted!');
      } catch (err: any) {
        console.error(err);
        alert(err.message || 'Error creating B2B Delivery Challan');
        return;
      }
    } else {
      // Standard Lead Delivery Challan Validation
      if (!selectedLeadId || !vehicleNumber || !driverName || !driverPhone) {
        alert('Please fill out all mandatory dispatch fields.');
        return;
      }

      const lead = leads.find(l => l.id === selectedLeadId);
      if (!lead) {
        alert('Error finding selected lead details.');
        return;
      }

      try {
        await challanService.createChallan({
          type: 'lead',
          leadId: selectedLeadId,
          leadName: lead.name,
          assignedEmployeeId,
          employeeName: emp.fullName,
          vehicleNumber,
          driverName,
          driverPhone,
          vehiclePhoto: uploadedVehiclePhotoUrl,
          vehiclePhotoGps: vehiclePhotoGps || undefined,
          items: challanItems,
          notes: notes || undefined
        });

        alert('Delivery Challan created successfully and inventory stock adjusted!');
      } catch (err: any) {
        console.error(err);
        alert(err.message || 'Error creating Delivery Challan');
        return;
      }
    }

    // Reset Form & Close
    setSelectedLeadId('');
    setSelectedLeadData(null);
    setLeadQuotation(null);
    setLeadOrder(null);
    setIsLoadingLeadInfo(false);
    setLeadSearchQuery('');
    setIsLeadDropdownOpen(false);
    setB2bBusinessId('');
    setBusinessName('');
    setGstNumber('');
    setBusinessAddress('');
    setContactPerson('');
    setMobileNumber('');
    setEmail('');
    setAssignedEmployeeId('');
    setVehicleNumber('');
    setDriverName('');
    setDriverPhone('');
    setChallanItems([]);
    setNotes('');
    setVehiclePhotoBlob(null);
    setVehiclePhotoDataUrl(null);
    setVehiclePhotoGps(null);
    setIsProcessingVehicleGps(false);
    setVehicleGpsError(null);
    setShowAddModal(false);

    loadData();
  };

  const handleDownloadPDF = async (ch: Challan) => {
    try {
      const blob = await pdfService.generateChallanPDF(ch);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const titlePrefix = ch.type === 'b2b' ? 'B2B_Challan' : 'Challan';
      a.download = `${titlePrefix}_${ch.challanNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error generating PDF.');
    }
  };

  const handleWhatsappShare = async (ch: Challan) => {
    try {
      const blob = await pdfService.generateChallanPDF(ch);
      const file = new File([blob], `Challan_${ch.challanNumber}.pdf`, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${ch.type === 'b2b' ? 'B2B Delivery Challan' : 'Delivery Challan'} ${ch.challanNumber}`,
            text: `Dear Driver, please find attached the Delivery Challan for vehicle ${ch.vehicleNumber}.`
          });
          return;
        } catch (shareErr) {
          console.log('Web share aborted, falling back to download + link.', shareErr);
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Challan_${ch.challanNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      const custName = ch.type === 'b2b' ? ch.businessName : ch.leadName;
      const msg = `*GREEN ENERGY SOLUTION - ${ch.type === 'b2b' ? 'B2B DELIVERY CHALLAN' : 'DELIVERY CHALLAN'} DISPATCH*\n\n` +
        `Challan No: ${ch.challanNumber}\n` +
        `Vehicle No: ${ch.vehicleNumber}\n` +
        `Client / Business: ${custName}\n` +
        `Representative: ${ch.employeeName}\n` +
        `Driver: ${ch.driverName}\n` +
        `------------------------------------\n` +
        ch.items.map(item => `• ${item.productName} (x${item.qty})`).join('\n') +
        `\n------------------------------------\n` +
        `_Note: Official Challan PDF generated. Please deliver items as specified._`;

      const encodedMsg = encodeURIComponent(msg);
      window.open(`https://wa.me/91${ch.driverPhone}?text=${encodedMsg}`, '_blank');
    } catch (err) {
      console.error(err);
      alert('Error sharing to WhatsApp.');
    }
  };

  const handleEditClick = (ch: Challan) => {
    setEditingChallan(ch);
    setEditVehicleNumber(ch.vehicleNumber);
    setEditDriverName(ch.driverName);
    setEditDriverPhone(ch.driverPhone);
    setEditChallanItems(ch.items);
    setEditNotes(ch.notes || '');
    setCurrentEditProductId('');
    setCurrentEditQty(1);
    setCurrentEditUnit('Nos');
    setEditVehiclePhoto(ch.vehiclePhoto || null);
    setEditVehiclePhotoBlob(null);
    setEditVehiclePhotoDataUrl(null);
    setEditVehiclePhotoGps(ch.vehiclePhotoGps || null);
    setIsProcessingEditVehicleGps(false);
  };

  const handleDeleteChallan = async (ch: Challan) => {
    const isSuperAdmin = currentRole === 'super_admin' || currentUser?.role === 'super_admin';
    const targetName = ch.type === 'b2b' ? ch.businessName : ch.leadName;

    if (isSuperAdmin) {
      const confirmMsg = `⚠️ DELETE CONFIRMATION:\n\nAre you sure you want to PERMANENTLY delete Delivery Challan "${ch.challanNumber}" for ${targetName}?\n\n(This will also restore all stock quantities and serial numbers to available inventory).`;
      if (confirm(confirmMsg)) {
        try {
          await challanService.deleteChallan(ch.id, true);
          alert('✅ Delivery Challan permanently deleted and product stock restored!');
          await loadData();
        } catch (err) {
          console.error("Error deleting challan:", err);
          alert('Error processing deletion.');
        }
      }
      return;
    }

    const reason = prompt(`Submit Delivery Challan "${ch.challanNumber}" deletion request to Super Admin for approval?\n\nPlease enter the reason:`, 'Wrong dispatch / Cancelled order');
    if (reason === null) return;

    try {
      const res = await challanService.deleteChallan(ch.id, false, reason.trim() || 'Delivery challan deletion requested via Inventory panel');
      if (res?.requiresApproval) {
        alert('🔒 Deletion request submitted successfully to Super Admin with your employee details and full dispatch information!');
      }
      await loadData();
    } catch (err) {
      console.error("Error deleting challan:", err);
      alert('Error processing deletion request. Please try again.');
    }
  };

  const handleEditAddItem = () => {
    if (!currentEditProductId || currentEditQty <= 0) {
      alert('Please select a product and enter a valid quantity.');
      return;
    }

    const targetProduct = products.find(p => p.id === currentEditProductId);
    if (!targetProduct) return;

    const oldItem = editingChallan?.items.find(item => item.productId === currentEditProductId);
    const originalQty = oldItem ? oldItem.qty : 0;
    const availableBuffer = targetProduct.stockQuantity + originalQty;

    if (availableBuffer < currentEditQty) {
      alert('Insufficient stock available.');
      return;
    }

    if (editChallanItems.some(item => item.productId === currentEditProductId)) {
      alert('Product already added. Remove and re-add to modify quantity.');
      return;
    }

    const newItem: ChallanItem = {
      productId: currentEditProductId,
      productName: targetProduct.name,
      qty: currentEditQty,
      unit: currentEditUnit.trim() || targetProduct.unit || 'Nos',
      rate: targetProduct.rate || 0,
      serialNumbers: selectedEditSerials
    };

    setEditChallanItems([...editChallanItems, newItem]);
    setCurrentEditProductId('');
    setCurrentEditQty(1);
    setCurrentEditUnit('Nos');
    setSelectedEditSerials([]);
    setEditSerialSearchTerm('');
    setShowEditPasteSerialsDrawer(false);
    setEditPasteSerialsInput('');
  };

  const handleEditRemoveItem = (index: number) => {
    setEditChallanItems(editChallanItems.filter((_, i) => i !== index));
  };

  const handleUpdateChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChallan) return;

    if (!editVehicleNumber || !editDriverName || !editDriverPhone) {
      alert('Please fill out all mandatory dispatch fields.');
      return;
    }

    if (editChallanItems.length === 0) {
      alert('Please add at least one product item to dispatch.');
      return;
    }

    try {
      let uploadedVehiclePhotoUrl = editingChallan.vehiclePhoto;
      let finalGps = editingChallan.vehiclePhotoGps;
      if (editVehiclePhotoBlob) {
        try {
          uploadedVehiclePhotoUrl = await uploadImageToFirebase(
            editVehiclePhotoBlob,
            `challans/vehicle_photos/vehicle_${Date.now()}.jpg`
          );
          finalGps = editVehiclePhotoGps || undefined;
        } catch (uploadErr) {
          console.warn("Edit vehicle photo upload note:", uploadErr);
          if (editVehiclePhotoDataUrl) uploadedVehiclePhotoUrl = editVehiclePhotoDataUrl;
        }
      } else if (editVehiclePhoto === null && editingChallan.vehiclePhoto) {
        uploadedVehiclePhotoUrl = undefined;
        finalGps = undefined;
      }

      await challanService.updateChallan(editingChallan.id, {
        ...editingChallan,
        vehicleNumber: editVehicleNumber,
        driverName: editDriverName,
        driverPhone: editDriverPhone,
        vehiclePhoto: uploadedVehiclePhotoUrl,
        vehiclePhotoGps: finalGps,
        items: editChallanItems,
        notes: editNotes || undefined
      });

      alert('Delivery Challan updated successfully and inventory stock adjusted!');
      setEditingChallan(null);
      loadData();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error updating delivery challan.');
    }
  };

  const filteredChallans = challans.filter(ch => {
    // Type Filter
    if (typeFilter === 'b2b' && ch.type !== 'b2b') return false;
    if (typeFilter === 'lead' && ch.type === 'b2b') return false;

    const q = (searchTerm || '').toLowerCase();
    const custName = (ch.type === 'b2b' ? ch.businessName : ch.leadName) || '';
    const matchesSearch =
      (ch.challanNumber || '').toLowerCase().includes(q) ||
      custName.toLowerCase().includes(q) ||
      (ch.vehicleNumber || '').toLowerCase().includes(q) ||
      (ch.driverName || '').toLowerCase().includes(q) ||
      (ch.gstNumber ? ch.gstNumber.toLowerCase().includes(q) : false);

    if (!matchesSearch) return false;

    if (startDate) {
      const chDate = dayjs(ch.createdAt);
      const start = dayjs(startDate).startOf('day');
      if (chDate.isBefore(start)) return false;
    }

    if (endDate) {
      const chDate = dayjs(ch.createdAt);
      const end = dayjs(endDate).endOf('day');
      if (chDate.isAfter(end)) return false;
    }

    return true;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 30;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, startDate, endDate]);

  const totalPages = Math.ceil(filteredChallans.length / ITEMS_PER_PAGE) || 1;
  const paginatedChallans = filteredChallans.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const filteredStockTxns = stockTxns.filter(st => {
    const q = (stockTxnSearch || '').toLowerCase();
    return (
      (st.challanNumber ? st.challanNumber.toLowerCase().includes(q) : false) ||
      (st.productName ? st.productName.toLowerCase().includes(q) : false) ||
      (st.challanType ? st.challanType.toLowerCase().includes(q) : false)
    );
  });

  const filteredLeads = leads.filter(l => {
    const q = leadSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (l.name && l.name.toLowerCase().includes(q)) ||
      (l.phoneNumber && l.phoneNumber.toLowerCase().includes(q)) ||
      (l.requirement && l.requirement.toLowerCase().includes(q)) ||
      (l.email && l.email.toLowerCase().includes(q)) ||
      (l.description && l.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Delivery Challans</h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Dispatch materials for CRM leads or B2B clients, track inventory deduction history, and print challans.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadStockHistory}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all border border-slate-300/70"
            title="View Stock Transaction History Logs"
          >
            <History className="w-4 h-4 text-slate-600" />
            <span>Stock History</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenAddModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
            title="Create B2B Delivery Challan for corporate / commercial clients"
          >
            <Building2 className="w-4 h-4" />
            <span>B2B Challan</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenAddModal(false)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Lead Challan</span>
          </button>
        </div>
      </div>

      {/* Search Controls & Date/Type Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
        <div className="flex-1 flex items-center space-x-3 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/50">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by challan, client/business name, vehicle, driver..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-xs font-semibold text-slate-800 focus:outline-none w-full bg-transparent"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Challan Type Filter */}
          <div className="flex items-center space-x-2">
            <span className="text-[10px] uppercase font-bold text-slate-400">Type</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'lead' | 'b2b')}
              className="text-xs font-bold border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 focus:outline-none text-slate-800 cursor-pointer"
            >
              <option value="all">All Challans</option>
              <option value="lead">Normal Lead Challan</option>
              <option value="b2b">B2B Challan</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[10px] uppercase font-bold text-slate-400">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs font-semibold border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 focus:outline-none text-slate-700 cursor-pointer"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] uppercase font-bold text-slate-400">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs font-semibold border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 focus:outline-none text-slate-700 cursor-pointer"
            />
          </div>
          {(startDate || endDate || typeFilter !== 'all') && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setTypeFilter('all');
              }}
              className="text-[10px] text-rose-500 hover:text-rose-700 font-bold ml-1 cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Challan List */}
      <div className="grid grid-cols-1 gap-4">
        {paginatedChallans.map((ch) => {
          const isExpanded = expandedChallanId === ch.id;
          const isB2B = ch.type === 'b2b';
          const clientTitle = isB2B ? (ch.businessName || 'B2B Client') : ch.leadName;

          return (
            <div
              key={ch.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-sm transition-all relative flex flex-col justify-between"
            >
              {/* Card Header */}
              <div
                onClick={() => setExpandedChallanId(isExpanded ? null : ch.id)}
                className="flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer select-none gap-2"
              >
                <div className="flex items-center gap-2.5">
                  <span className={`p-2 rounded-xl transition-colors ${isB2B ? 'bg-indigo-100 text-indigo-800' : isExpanded ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                    {isB2B ? <Building2 className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
                  </span>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-black text-slate-900">{ch.challanNumber}</h4>
                      {isB2B ? (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200/80 font-black text-[9px] rounded-md tracking-wider">
                          🏢 B2B
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-black text-[9px] rounded-md tracking-wider">
                          👤 LEAD
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{dayjs(ch.createdAt).format('DD MMM YYYY • hh:mm A')}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black bg-slate-50 text-slate-600 border border-slate-200/60 uppercase tracking-wider">
                    🚚 {ch.vehicleNumber}
                  </span>
                  {ch.vehiclePhoto && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wider">
                      <Camera className="w-2.5 h-2.5" /> GPS Photo
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black bg-emerald-50/55 text-emerald-800 border border-emerald-100 uppercase tracking-wider">
                    👤 Rep: {ch.employeeName}
                  </span>
                  <span className="text-[10px] text-indigo-600 hover:text-indigo-800 font-black uppercase tracking-wider ml-1">
                    {isExpanded ? 'Hide Details ▲' : 'Show Details ▼'}
                  </span>
                </div>
              </div>

              {/* Sub-summary */}
              <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 font-bold border-t border-slate-100/50 pt-2.5">
                <p>{isB2B ? 'Business:' : 'Client:'} <span className="text-slate-800 font-extrabold">{clientTitle}</span></p>
                {isB2B && ch.gstNumber && <p>GSTIN: <span className="text-indigo-700 font-extrabold">{ch.gstNumber}</span></p>}
                <p>Driver: <span className="text-slate-800 font-extrabold">{ch.driverName}</span></p>
                <p>Items: <span className="text-slate-800 font-extrabold">{ch.items.length} types</span></p>
              </div>

              {/* Expanded details section */}
              {isExpanded && (
                <div className="mt-5 space-y-4 border-t border-slate-100 pt-4 animate-slide-down">
                  {/* Banner */}
                  <div className="bg-white text-slate-900 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-xs border border-slate-200">
                    <div className="flex items-center gap-3">
                      <img src={logoImg} alt="Green Energy Solution Logo" className="h-9 w-auto object-contain shrink-0" />
                      <div>
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Green Energy Solution</p>
                        <p className="text-xs font-bold text-slate-700">
                          {isB2B ? 'B2B Delivery Challan & Material Dispatch Note' : 'Materials Delivery Challan & Dispatch Note'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right sm:text-right self-end sm:self-auto">
                      <span className="inline-block px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-mono font-black text-xs border border-emerald-200">
                        {ch.challanNumber}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600 font-semibold">
                    <div>
                      <p className="text-[10px] uppercase text-slate-400 tracking-wider mb-1">
                        {isB2B ? 'B2B Client / Business Information' : 'Customer / Project Details'}
                      </p>
                      <p className="text-slate-800 font-bold text-sm mb-0.5">{clientTitle}</p>
                      {isB2B ? (
                        <>
                          {ch.gstNumber && <p className="text-slate-600 font-medium">GSTIN: {ch.gstNumber}</p>}
                          {ch.businessAddress && <p className="text-slate-500 font-medium">Address: {ch.businessAddress}</p>}
                          {ch.contactPerson && <p className="text-slate-500 font-medium">Contact: {ch.contactPerson} ({ch.mobileNumber || ''})</p>}
                        </>
                      ) : (
                        <p className="text-slate-500 font-medium">Lead Ref ID: {ch.leadId}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400 tracking-wider mb-1">Transport & Driver Info</p>
                      <p className="text-slate-800 font-bold mb-0.5">Vehicle: {ch.vehicleNumber}</p>
                      <p className="text-slate-800 font-bold mb-0.5">Driver: {ch.driverName}</p>
                      <p className="text-slate-500 font-medium">Phone: +91 {ch.driverPhone}</p>
                      {ch.vehiclePhoto && (
                        <div className="mt-3 pt-2.5 border-t border-slate-200/60">
                          <p className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider mb-1.5 flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5" />
                            <span>Geotagged Vehicle Photo</span>
                          </p>
                          <div className="flex items-start gap-3">
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewPhotoUrl(ch.vehiclePhoto!);
                              }}
                              className="relative w-20 h-16 rounded-xl overflow-hidden border border-emerald-300 shadow-xs cursor-pointer group shrink-0"
                            >
                              <img
                                src={ch.vehiclePhoto}
                                alt="Vehicle Dispatch Photo"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Eye className="w-4 h-4" />
                              </div>
                            </div>
                            <div className="text-[11px] text-slate-500 space-y-0.5">
                              {ch.vehiclePhotoGps && (
                                <>
                                  <p className="font-mono text-[10px] text-slate-700 font-bold flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-emerald-600" />
                                    <span>{ch.vehiclePhotoGps.latitude.toFixed(5)}°, {ch.vehiclePhotoGps.longitude.toFixed(5)}°</span>
                                  </p>
                                  {ch.vehiclePhotoGps.address && (
                                    <p className="text-[10px] text-slate-600 truncate max-w-[200px]" title={ch.vehiclePhotoGps.address}>
                                      📍 {ch.vehiclePhotoGps.address}
                                    </p>
                                  )}
                                  <p className="text-[9.5px] text-slate-400">
                                    🕒 {ch.vehiclePhotoGps.timestamp}
                                  </p>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewPhotoUrl(ch.vehiclePhoto!);
                                }}
                                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer inline-flex items-center gap-1 mt-1"
                              >
                                View Full Photo
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-2">Dispatched Components List</p>
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-200 pb-1">
                          <th className="pb-1 font-bold">Item Description</th>
                          <th className="pb-1 text-center font-bold">Unit / Rate</th>
                          <th className="pb-1 text-right font-bold">Qty Dispatched</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ch.items.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-100 last:border-0">
                            <td className="py-2 text-slate-800 font-bold">
                              <div>{item.productName}</div>
                              {item.serialNumbers && item.serialNumbers.length > 0 && (
                                <div className="text-[10px] text-emerald-700 font-semibold mt-1 flex flex-wrap items-center gap-1">
                                  <span className="text-slate-400 font-sans">Serial Nos:</span>
                                  {item.serialNumbers.map(sn => (
                                    <span key={sn} className="bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-1.5 py-0.5 rounded font-mono text-[9.5px]">
                                      {sn}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-2 text-slate-600 text-center font-medium">
                              {item.unit || 'Nos'} {item.rate ? `(@ ₹${item.rate})` : ''}
                            </td>
                            <td className="py-2 text-slate-900 font-extrabold text-right align-top">{item.qty} {item.unit || 'units'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {ch.notes && (
                    <div className="text-xs bg-amber-50/50 text-amber-800 px-3 py-2 rounded-lg border border-amber-100 font-semibold">
                      <span className="font-bold">Dispatch Notes:</span> {ch.notes}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadPDF(ch);
                      }}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold uppercase rounded-lg shadow-xs transition-colors cursor-pointer"
                    >
                      Download PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWhatsappShare(ch);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase rounded-lg shadow-xs transition-colors cursor-pointer"
                    >
                      Share (Driver WA)
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditClick(ch);
                      }}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold uppercase rounded-lg border border-amber-200/80 transition-colors cursor-pointer"
                    >
                      Edit Challan
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChallan(ch);
                      }}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700 text-[10px] font-bold uppercase rounded-lg border border-rose-200/80 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Challan</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredChallans.length === 0 && (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 text-center rounded-xl">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-bold">No delivery challans recorded yet. Tap "B2B Challan" or "New Lead Challan" to dispatch inventory.</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 mt-2">
            <div className="text-xs font-bold text-slate-500">
              Showing <span className="text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
              <span className="text-slate-800">{Math.min(currentPage * ITEMS_PER_PAGE, filteredChallans.length)}</span> of{' '}
              <span className="text-emerald-700 font-extrabold">{filteredChallans.length}</span> Challans
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-xs font-black text-slate-700 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Challan Modal (B2B or Standard Lead) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl sm:max-w-3xl p-6 m-4 animate-scale-in my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                {isB2BMode ? (
                  <>
                    <Building2 className="w-5 h-5 text-indigo-600" />
                    <span>Create B2B Delivery Challan</span>
                  </>
                ) : (
                  <>
                    <Truck className="w-5 h-5 text-emerald-600" />
                    <span>Create Lead Delivery Challan</span>
                  </>
                )}
              </h3>
              <div className="flex items-center space-x-2">
                {/* Switcher Mode Tabs */}
                <button
                  type="button"
                  onClick={() => setIsB2BMode(!isB2BMode)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-all"
                >
                  Switch to {isB2BMode ? 'Standard Lead' : 'B2B Mode'}
                </button>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateChallan} className="space-y-4 text-xs font-semibold">
              {/* Mode-specific Fields */}
              {isB2BMode ? (
                <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>B2B Business Information</span>
                    </span>
                    <span className="text-[10px] text-indigo-500">Auto-saves to B2B Businesses Directory</span>
                  </div>

                  {/* Business Name with Autocomplete */}
                  <div className="relative">
                    <label className="block text-slate-700 mb-1">Business Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Type or search saved business..."
                      value={businessName}
                      onChange={e => handleBusinessNameChange(e.target.value)}
                      onFocus={() => businessName && handleBusinessNameChange(businessName)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-indigo-500 font-bold"
                    />

                    {/* Autocomplete Dropdown List */}
                    {showSuggestions && b2bSuggestions.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {b2bSuggestions.map(s => (
                          <div
                            key={s.id}
                            onClick={() => handleSelectSuggestion(s)}
                            className="p-3 hover:bg-indigo-50 cursor-pointer transition-colors"
                          >
                            <div className="font-bold text-slate-800">{s.businessName}</div>
                            <div className="text-[10px] text-slate-500 flex flex-wrap gap-2 mt-0.5">
                              {s.gstNumber && <span>GST: {s.gstNumber}</span>}
                              {s.contactPerson && <span>Contact: {s.contactPerson}</span>}
                              {s.mobileNumber && <span>Phone: {s.mobileNumber}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">GST Number (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. 27AAACA0000A1Z5"
                        value={gstNumber}
                        onChange={e => setGstNumber(e.target.value.toUpperCase())}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">Contact Person</label>
                      <input
                        type="text"
                        placeholder="e.g. Inspector / Manager"
                        value={contactPerson}
                        onChange={e => setContactPerson(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">Mobile Number</label>
                      <input
                        type="tel"
                        placeholder="e.g. 9876543210"
                        value={mobileNumber}
                        onChange={e => setMobileNumber(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">Email Address (Optional)</label>
                      <input
                        type="email"
                        placeholder="e.g. dispatch@business.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1">Business Address *</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Complete business site or store location..."
                      value={businessAddress}
                      onChange={e => setBusinessAddress(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 bg-white focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                /* Standard Lead Searchable Picker & Information Display */
                <div className="space-y-3">
                  {!selectedLeadData ? (
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-slate-700 font-bold text-xs">
                          Select Customer / Lead *
                        </label>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {filteredLeads.length} of {leads.length} Leads
                        </span>
                      </div>
                      
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          value={leadSearchQuery}
                          onChange={(e) => {
                            setLeadSearchQuery(e.target.value);
                            setIsLeadDropdownOpen(true);
                          }}
                          onFocus={() => setIsLeadDropdownOpen(true)}
                          placeholder="Search lead by customer name, phone number, requirement..."
                          className="w-full pl-9 pr-8 py-2.5 border border-slate-300 focus:border-emerald-500 rounded-xl bg-white text-slate-800 font-bold text-xs focus:outline-none shadow-xs"
                        />
                        {leadSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setLeadSearchQuery('')}
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Dropdown Options List */}
                      {isLeadDropdownOpen && (
                        <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-100 animate-fade-in">
                          {filteredLeads.length === 0 ? (
                            <div className="p-4 text-center text-slate-400 text-xs font-semibold">
                              No matching leads found for "{leadSearchQuery}"
                            </div>
                          ) : (
                            <>
                              {filteredLeads.slice(0, 30).map(l => (
                                <div
                                  key={l.id}
                                  onClick={() => handleSelectLead(l)}
                                  className={`p-3 hover:bg-emerald-50/80 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                                    selectedLeadId === l.id ? 'bg-emerald-50 border-l-4 border-emerald-600' : ''
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-slate-900 text-xs truncate">{l.name}</span>
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                        l.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' :
                                        l.status === 'installed' ? 'bg-indigo-100 text-indigo-800' :
                                        l.status === 'quotation_sent' ? 'bg-amber-100 text-amber-800' :
                                        'bg-slate-100 text-slate-600'
                                      }`}>
                                        {l.status?.replace('_', ' ')}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                                      <span className="flex items-center gap-1 font-semibold text-slate-700">
                                        📞 {l.phoneNumber}
                                      </span>
                                      {l.requirement && (
                                        <span className="text-emerald-700 font-bold truncate">
                                          ⚡ {l.requirement}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shrink-0 shadow-xs cursor-pointer"
                                  >
                                    Select
                                  </button>
                                </div>
                              ))}
                              {filteredLeads.length > 30 && (
                                <div className="p-2.5 text-center text-[10px] font-bold text-slate-500 bg-slate-50 border-t border-slate-100">
                                  Showing top 30 of {filteredLeads.length} leads. Type name or phone to narrow down search.
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Selected Lead Details Card */
                    <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 space-y-3 shadow-xs animate-fade-in">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                            ✓
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-slate-900 text-sm">{selectedLeadData.name}</h4>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 text-[9px] font-black uppercase tracking-wider">
                                {selectedLeadData.status?.replace('_', ' ')}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 font-semibold flex items-center gap-2 mt-0.5">
                              <span>📞 +91 {selectedLeadData.phoneNumber}</span>
                              {selectedLeadData.email && <span>• ✉️ {selectedLeadData.email}</span>}
                              {leadOrder && <span className="text-emerald-700 font-bold">• ⚡ Order Confirmed</span>}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLeadId('');
                            setSelectedLeadData(null);
                            setLeadQuotation(null);
                            setLeadOrder(null);
                            setIsLeadDropdownOpen(true);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-bold rounded-lg transition-all cursor-pointer shrink-0 shadow-2xs"
                        >
                          Change Lead
                        </button>
                      </div>

                      {/* Project & Quotation Specs Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] border-t border-emerald-200/60">
                        <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Requirement / Capacity</span>
                          <span className="font-extrabold text-emerald-800 text-xs">{selectedLeadData.requirement || 'Solar Rooftop System'}</span>
                          {selectedLeadData.description && (
                            <p className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">{selectedLeadData.description}</p>
                          )}
                        </div>

                        <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Quotation / Order Info</span>
                          {isLoadingLeadInfo ? (
                            <span className="text-[10px] text-slate-400 font-bold">Fetching quotation details...</span>
                          ) : leadQuotation ? (
                            <div className="flex items-center justify-between gap-1 mt-0.5">
                              <span className="font-extrabold text-slate-800 truncate">
                                #{leadQuotation.quotationNumber} ({leadQuotation.items?.length || 0} items)
                              </span>
                              <span className="font-black text-emerald-700 text-xs shrink-0">
                                ₹{((leadQuotation as any).grandTotal || leadQuotation.subtotal || 0).toLocaleString('en-IN')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-amber-700 font-bold">No saved quotation found</span>
                          )}
                        </div>
                      </div>

                      {/* Auto Populate Line Items Button from Quotation & BOM Picker */}
                      {leadQuotation && (
                        <div className="pt-1 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-emerald-100/70 p-2.5 rounded-xl border border-emerald-200">
                          <div className="text-[11px] text-emerald-950 font-bold">
                            💡 Quotation #{leadQuotation.quotationNumber} is available with BOM specifications.
                          </div>
                          <button
                            type="button"
                            onClick={handleOpenBomSelectorModal}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-black transition-all cursor-pointer shadow-xs shrink-0 flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>Select BOM & Set Quantities</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Representative & Vehicle Assignment */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-slate-500 mb-1">Assigned Dispatch Rep *</label>
                  <select
                    required
                    value={assignedEmployeeId}
                    onChange={(e) => setAssignedEmployeeId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Choose Representative --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-slate-500 mb-1">Vehicle No *</label>
                  <input
                    type="text"
                    required
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. UP 32 AZ 1234"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Driver Name *</label>
                  <input
                    type="text"
                    required
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="e.g. Ram Kumar"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Driver Phone *</label>
                  <input
                    type="tel"
                    required
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Vehicle Photo with GPS Verification Section */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                      <Camera className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800">Vehicle Photo with GPS Verification (Optional)</h4>
                      <p className="text-[10px] text-slate-400 font-semibold">Take photo of loaded vehicle. Real-time GPS location and timestamp will be watermarked.</p>
                    </div>
                  </div>
                  {vehiclePhotoDataUrl && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Photo Attached
                    </span>
                  )}
                </div>

                {isProcessingVehicleGps && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-900 text-xs font-bold animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
                    <span>Acquiring GPS location & stamping watermark...</span>
                  </div>
                )}

                {vehicleGpsError && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] font-semibold flex items-center justify-between">
                    <span>⚠️ {vehicleGpsError}</span>
                    <button
                      type="button"
                      onClick={() => setVehicleGpsError(null)}
                      className="text-amber-600 hover:text-amber-900 font-bold ml-2 text-xs"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {vehiclePhotoDataUrl ? (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          onClick={() => setPreviewPhotoUrl(vehiclePhotoDataUrl)}
                          className="relative w-24 h-20 rounded-xl overflow-hidden border border-slate-200 shadow-xs cursor-pointer group shrink-0"
                        >
                          <img
                            src={vehiclePhotoDataUrl}
                            alt="Vehicle Preview Watermarked"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Eye className="w-4 h-4" />
                          </div>
                        </div>

                        <div className="text-xs space-y-1">
                          <p className="font-extrabold text-slate-800 flex items-center gap-1 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>GPS Watermarked Photo Ready</span>
                          </p>
                          {vehiclePhotoGps ? (
                            <>
                              <p className="text-[11px] font-mono text-slate-600 font-bold flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>{vehiclePhotoGps.latitude.toFixed(6)}°, {vehiclePhotoGps.longitude.toFixed(6)}°</span>
                              </p>
                              {vehiclePhotoGps.address && (
                                <p className="text-[10px] text-slate-500 line-clamp-1" title={vehiclePhotoGps.address}>
                                  📍 {vehiclePhotoGps.address}
                                </p>
                              )}
                              <p className="text-[10px] text-slate-400">
                                🕒 {vehiclePhotoGps.timestamp}
                              </p>
                            </>
                          ) : (
                            <p className="text-[10px] text-amber-600 font-bold">Standard photo without GPS</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          type="button"
                          onClick={() => setPreviewPhotoUrl(vehiclePhotoDataUrl)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVehiclePhotoBlob(null);
                            setVehiclePhotoDataUrl(null);
                            setVehiclePhotoGps(null);
                          }}
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-rose-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Camera Button */}
                    <label className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs">
                      <Camera className="w-4 h-4" />
                      <span>Take Vehicle Photo (Camera)</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleVehiclePhotoCapture(file, false);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    {/* Upload from Gallery Button */}
                    <label className="flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs">
                      <ImageIcon className="w-4 h-4 text-slate-500" />
                      <span>Upload from Device</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleVehiclePhotoCapture(file, false);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Items Dispatch Section */}
              <div className="border border-slate-200 p-4 rounded-2xl bg-slate-50/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Dispatched Line Items ({challanItems.length})
                    </p>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      Add individual items or select from BOM templates with custom quantities.
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenBomSelectorModal}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>⚡ Select BOM / Package</span>
                  </button>
                </div>

                {/* Item Form Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-5">
                    <label className="block text-slate-500 mb-1 font-semibold text-xs">Select / Search Product</label>
                    <SearchableProductSelect
                      products={products}
                      selectedProductId={currentProductId}
                      onSelectProduct={handleProductSelect}
                      placeholder="Type name, brand or choose component..."
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-500 mb-1">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      value={currentQty}
                      onChange={(e) => handleQtyChange(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-slate-500 mb-1">Unit (UOM)</label>
                    <input
                      type="text"
                      list="uom-challan-suggestions"
                      value={currentUnit}
                      onChange={(e) => setCurrentUnit(e.target.value)}
                      placeholder="e.g. Nos, Pcs"
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white focus:outline-none text-slate-900 font-semibold"
                    />
                    <datalist id="uom-challan-suggestions">
                      <option value="Nos" />
                      <option value="Pcs" />
                      <option value="Sets" />
                      <option value="Watt" />
                      <option value="kW" />
                      <option value="Meters" />
                      <option value="Kg" />
                      <option value="Feet" />
                      <option value="Box" />
                      <option value="Lot" />
                      <option value="Sq.Ft." />
                    </datalist>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl h-[34px] cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Serial Numbers Picker UI with Search & Fast Selection */}
                {currentProductId && (() => {
                  const allAvailable = getAvailableSerialsForProduct(currentProductId, null);
                  const isTracked = allAvailable.length > 0;
                  const query = serialSearchTerm.trim().toLowerCase();
                  const filtered = query
                    ? allAvailable.filter(sn => sn.toLowerCase().includes(query))
                    : allAvailable;

                  return (
                    <div className="bg-gradient-to-b from-slate-50 to-slate-100/90 p-3.5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2.5">
                      {/* Section Title & Counters Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                            Available Serial Numbers
                          </span>
                          {isTracked ? (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              selectedSerials.length === currentQty
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : selectedSerials.length > 0
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-slate-200 text-slate-700'
                            }`}>
                              {selectedSerials.length} Selected (Target: {currentQty})
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-bold">No available unsold serial numbers</span>
                          )}
                        </div>

                        {/* Fast Selection Actions */}
                        {isTracked && (
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() => handleSelectFirstNSerials(false)}
                              title={`Auto-pick first ${currentQty} serial numbers`}
                              className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              Auto-Pick ({currentQty})
                            </button>

                            {query && filtered.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleSelectAllFilteredSerials(filtered, false)}
                                className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <CheckSquare className="w-3 h-3 text-blue-600" />
                                Select Filtered ({filtered.length})
                              </button>
                            )}

                            {selectedSerials.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleClearAllSerials(false)}
                                className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold transition-colors cursor-pointer"
                              >
                                Clear
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setShowPasteSerialsDrawer(prev => !prev)}
                              className={`px-2 py-1 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 border ${
                                showPasteSerialsDrawer
                                  ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                                  : 'bg-white text-purple-700 hover:bg-purple-50 border-purple-200'
                              }`}
                              title="Paste serial numbers from Excel or WhatsApp"
                            >
                              <ClipboardList className="w-3 h-3" />
                              Paste List
                            </button>
                          </div>
                        )}
                      </div>

                      {isTracked ? (
                        <>
                          {/* Search Input Bar */}
                          <div className="relative flex items-center">
                            <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
                              <Search className="w-3.5 h-3.5" />
                            </div>
                            <input
                              type="text"
                              value={serialSearchTerm}
                              onChange={e => setSerialSearchTerm(e.target.value)}
                              onKeyDown={e => handleSerialSearchKeyDown(e, false)}
                              placeholder="Search serial no. or scan barcode... (Press Enter to pick)"
                              className="w-full bg-white border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs font-mono font-medium rounded-xl pl-8.5 pr-20 py-1.5 text-slate-800 placeholder:font-sans placeholder:text-slate-400 focus:outline-none transition-all"
                            />
                            <div className="absolute right-2 flex items-center gap-1">
                              {serialSearchTerm && (
                                <button
                                  type="button"
                                  onClick={() => setSerialSearchTerm('')}
                                  className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                                  title="Clear search"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {filtered.length}/{allAvailable.length}
                              </span>
                            </div>
                          </div>

                          {/* Collapsible Multi-Paste Drawer */}
                          {showPasteSerialsDrawer && (
                            <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                              <div className="flex justify-between items-center">
                                <span className="text-[11px] font-extrabold text-purple-900 flex items-center gap-1.5">
                                  <ClipboardList className="w-3.5 h-3.5 text-purple-600" />
                                  Paste Multiple Serial Numbers
                                </span>
                                <span className="text-[10px] text-purple-600 font-medium">
                                  Comma, newline, or space separated
                                </span>
                              </div>
                              <textarea
                                value={pasteSerialsInput}
                                onChange={e => setPasteSerialsInput(e.target.value)}
                                rows={3}
                                placeholder="Paste list e.g.:&#10;LA-2026-052&#10;LA-2026-053&#10;LA-2026-054..."
                                className="w-full text-xs font-mono p-2 bg-white border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400/30 text-slate-800 placeholder:text-slate-400"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setShowPasteSerialsDrawer(false)}
                                  className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApplyPastedSerials(false)}
                                  className="px-3 py-1 text-xs font-black text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs cursor-pointer flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" />
                                  Apply Pasted Serials
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Serial Numbers Badges Grid */}
                          {filtered.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-white/80 rounded-xl border border-slate-200/80">
                              {filtered.map(sn => {
                                const isSelected = selectedSerials.includes(sn);
                                return (
                                  <button
                                    key={sn}
                                    type="button"
                                    onClick={() => toggleSerialSelection(sn)}
                                    className={`px-2.5 py-1 rounded-lg text-[10.5px] font-mono border font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                      isSelected
                                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs scale-[1.02]'
                                        : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-900'
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                    <span>{sn}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="py-4 px-3 text-center bg-white/80 rounded-xl border border-dashed border-slate-300">
                              <p className="text-xs font-bold text-slate-700">No serial numbers found</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                No available serial numbers match "{serialSearchTerm}".
                              </p>
                              <button
                                type="button"
                                onClick={() => setSerialSearchTerm('')}
                                className="mt-1 text-xs text-emerald-600 font-bold hover:underline cursor-pointer"
                              >
                                Clear search filter
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-[11px] text-slate-400 font-medium">Standard inventory item without pre-indexed serial numbers.</p>
                      )}
                    </div>
                  );
                })()}

                {/* Items Added Table */}
                {challanItems.length > 0 && (
                  <div className="mt-3 bg-white rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 border-b border-slate-100">
                          <th className="px-3 py-2 font-bold">Item</th>
                          <th className="px-3 py-2 text-center font-bold">UOM</th>
                          <th className="px-3 py-2 text-right font-bold">Qty</th>
                          <th className="px-3 py-2 text-center font-bold">Remove</th>
                        </tr>
                      </thead>
                      <tbody>
                        {challanItems.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-100 last:border-0 font-bold">
                            <td className="px-3 py-2.5 text-slate-800">
                              <div>{item.productName}</div>
                              {item.serialNumbers && item.serialNumbers.length > 0 && (
                                <div className="text-[9.5px] font-mono text-emerald-700 font-semibold mt-1 flex flex-wrap gap-1">
                                  {item.serialNumbers.map(sn => (
                                    <span key={sn} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded">
                                      {sn}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 text-center font-bold">{item.unit || 'Nos'}</td>
                            <td className="px-3 py-2.5 text-slate-900 text-right align-top">{item.qty}</td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
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

              <div>
                <label className="block text-slate-500 mb-1">Dispatch Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Delivery terms, packaging description, helper name..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none resize-none"
                />
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
                  className={`px-5 py-2.5 text-white rounded-xl font-bold cursor-pointer shadow-md transition-all ${
                    isB2BMode ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isB2BMode ? 'Create B2B Challan' : 'Create Challan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Challan Modal */}
      {editingChallan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-6 m-4 animate-scale-in my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-600" />
                <span>Edit Dispatch Challan ({editingChallan.challanNumber})</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingChallan(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateChallan} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-500 mb-1">Customer / Business</label>
                <input
                  type="text"
                  disabled
                  value={editingChallan.type === 'b2b' ? (editingChallan.businessName || 'B2B Client') : editingChallan.leadName}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-100 text-slate-600 cursor-not-allowed font-bold"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-slate-500 mb-1">Vehicle No</label>
                  <input
                    type="text"
                    required
                    value={editVehicleNumber}
                    onChange={(e) => setEditVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. UP 32 AZ 1234"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-slate-500 mb-1">Driver Name</label>
                  <input
                    type="text"
                    required
                    value={editDriverName}
                    onChange={(e) => setEditDriverName(e.target.value)}
                    placeholder="e.g. Ram Kumar"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-slate-500 mb-1">Driver Phone</label>
                  <input
                    type="tel"
                    required
                    value={editDriverPhone}
                    onChange={(e) => setEditDriverPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Vehicle Photo with GPS (Edit Mode) */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                      <Camera className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800">Geotagged Vehicle Photo</h4>
                      <p className="text-[10px] text-slate-400 font-semibold">View or replace the vehicle photo with real-time GPS coordinates & timestamp.</p>
                    </div>
                  </div>
                  {(editVehiclePhotoDataUrl || editVehiclePhoto) && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Attached
                    </span>
                  )}
                </div>

                {isProcessingEditVehicleGps && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-900 text-xs font-bold animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
                    <span>Acquiring GPS location & stamping watermark...</span>
                  </div>
                )}

                {(editVehiclePhotoDataUrl || editVehiclePhoto) ? (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          onClick={() => setPreviewPhotoUrl(editVehiclePhotoDataUrl || editVehiclePhoto)}
                          className="relative w-24 h-20 rounded-xl overflow-hidden border border-slate-200 shadow-xs cursor-pointer group shrink-0"
                        >
                          <img
                            src={editVehiclePhotoDataUrl || editVehiclePhoto!}
                            alt="Vehicle Preview"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Eye className="w-4 h-4" />
                          </div>
                        </div>

                        <div className="text-xs space-y-1">
                          <p className="font-extrabold text-slate-800 flex items-center gap-1 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{editVehiclePhotoDataUrl ? 'New GPS Photo Selected' : 'Existing Vehicle Photo'}</span>
                          </p>
                          {editVehiclePhotoGps ? (
                            <>
                              <p className="text-[11px] font-mono text-slate-600 font-bold flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>{editVehiclePhotoGps.latitude.toFixed(6)}°, {editVehiclePhotoGps.longitude.toFixed(6)}°</span>
                              </p>
                              {editVehiclePhotoGps.address && (
                                <p className="text-[10px] text-slate-500 line-clamp-1" title={editVehiclePhotoGps.address}>
                                  📍 {editVehiclePhotoGps.address}
                                </p>
                              )}
                              <p className="text-[10px] text-slate-400">
                                🕒 {editVehiclePhotoGps.timestamp}
                              </p>
                            </>
                          ) : (
                            <p className="text-[10px] text-slate-400">Standard photo</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                        <label className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-emerald-200">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Replace</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleVehiclePhotoCapture(file, true);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setPreviewPhotoUrl(editVehiclePhotoDataUrl || editVehiclePhoto)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditVehiclePhoto(null);
                            setEditVehiclePhotoBlob(null);
                            setEditVehiclePhotoDataUrl(null);
                            setEditVehiclePhotoGps(null);
                          }}
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-rose-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs">
                      <Camera className="w-4 h-4" />
                      <span>Take Vehicle Photo (Camera)</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleVehiclePhotoCapture(file, true);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <label className="flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs">
                      <ImageIcon className="w-4 h-4 text-slate-500" />
                      <span>Upload from Device</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleVehiclePhotoCapture(file, true);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Items Dispatch Section */}
              <div className="border border-slate-200 p-4 rounded-2xl bg-slate-50/50 space-y-3">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Dispatched Line Items</p>

                {/* Item Form Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-5">
                    <label className="block text-slate-500 mb-1 font-semibold text-xs">Select / Search Product</label>
                    <SearchableProductSelect
                      products={products}
                      selectedProductId={currentEditProductId}
                      onSelectProduct={handleEditProductSelect}
                      placeholder="Type name, brand or choose component..."
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-500 mb-1">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      value={currentEditQty}
                      onChange={(e) => handleEditQtyChange(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-slate-500 mb-1">Unit (UOM)</label>
                    <input
                      type="text"
                      list="uom-challan-suggestions"
                      value={currentEditUnit}
                      onChange={(e) => setCurrentEditUnit(e.target.value)}
                      placeholder="e.g. Nos, Pcs"
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white focus:outline-none text-slate-900 font-semibold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleEditAddItem}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl h-[34px] cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Serial Numbers Picker UI with Search & Fast Selection */}
                {currentEditProductId && (() => {
                  const allAvailable = getAvailableSerialsForProduct(currentEditProductId, editingChallan);
                  const isTracked = allAvailable.length > 0;
                  const query = editSerialSearchTerm.trim().toLowerCase();
                  const filtered = query
                    ? allAvailable.filter(sn => sn.toLowerCase().includes(query))
                    : allAvailable;

                  return (
                    <div className="bg-gradient-to-b from-slate-50 to-slate-100/90 p-3.5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2.5">
                      {/* Section Title & Counters Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                            Available Serial Numbers
                          </span>
                          {isTracked ? (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              selectedEditSerials.length === currentEditQty
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : selectedEditSerials.length > 0
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-slate-200 text-slate-700'
                            }`}>
                              {selectedEditSerials.length} Selected (Target: {currentEditQty})
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-600 font-bold">No available unsold serial numbers</span>
                          )}
                        </div>

                        {/* Fast Selection Actions */}
                        {isTracked && (
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() => handleSelectFirstNSerials(true)}
                              title={`Auto-pick first ${currentEditQty} serial numbers`}
                              className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              Auto-Pick ({currentEditQty})
                            </button>

                            {query && filtered.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleSelectAllFilteredSerials(filtered, true)}
                                className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <CheckSquare className="w-3 h-3 text-blue-600" />
                                Select Filtered ({filtered.length})
                              </button>
                            )}

                            {selectedEditSerials.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleClearAllSerials(true)}
                                className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold transition-colors cursor-pointer"
                              >
                                Clear
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setShowEditPasteSerialsDrawer(prev => !prev)}
                              className={`px-2 py-1 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 border ${
                                showEditPasteSerialsDrawer
                                  ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                                  : 'bg-white text-purple-700 hover:bg-purple-50 border-purple-200'
                              }`}
                              title="Paste serial numbers from Excel or WhatsApp"
                            >
                              <ClipboardList className="w-3 h-3" />
                              Paste List
                            </button>
                          </div>
                        )}
                      </div>

                      {isTracked ? (
                        <>
                          {/* Search Input Bar */}
                          <div className="relative flex items-center">
                            <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
                              <Search className="w-3.5 h-3.5" />
                            </div>
                            <input
                              type="text"
                              value={editSerialSearchTerm}
                              onChange={e => setEditSerialSearchTerm(e.target.value)}
                              onKeyDown={e => handleSerialSearchKeyDown(e, true)}
                              placeholder="Search serial no. or scan barcode... (Press Enter to pick)"
                              className="w-full bg-white border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-xs font-mono font-medium rounded-xl pl-8.5 pr-20 py-1.5 text-slate-800 placeholder:font-sans placeholder:text-slate-400 focus:outline-none transition-all"
                            />
                            <div className="absolute right-2 flex items-center gap-1">
                              {editSerialSearchTerm && (
                                <button
                                  type="button"
                                  onClick={() => setEditSerialSearchTerm('')}
                                  className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                                  title="Clear search"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {filtered.length}/{allAvailable.length}
                              </span>
                            </div>
                          </div>

                          {/* Collapsible Multi-Paste Drawer */}
                          {showEditPasteSerialsDrawer && (
                            <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                              <div className="flex justify-between items-center">
                                <span className="text-[11px] font-extrabold text-purple-900 flex items-center gap-1.5">
                                  <ClipboardList className="w-3.5 h-3.5 text-purple-600" />
                                  Paste Multiple Serial Numbers
                                </span>
                                <span className="text-[10px] text-purple-600 font-medium">
                                  Comma, newline, or space separated
                                </span>
                              </div>
                              <textarea
                                value={editPasteSerialsInput}
                                onChange={e => setEditPasteSerialsInput(e.target.value)}
                                rows={3}
                                placeholder="Paste list e.g.:&#10;LA-2026-052&#10;LA-2026-053&#10;LA-2026-054..."
                                className="w-full text-xs font-mono p-2 bg-white border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400/30 text-slate-800 placeholder:text-slate-400"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setShowEditPasteSerialsDrawer(false)}
                                  className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleApplyPastedSerials(true)}
                                  className="px-3 py-1 text-xs font-black text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs cursor-pointer flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" />
                                  Apply Pasted Serials
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Serial Numbers Badges Grid */}
                          {filtered.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-white/80 rounded-xl border border-slate-200/80">
                              {filtered.map(sn => {
                                const isSelected = selectedEditSerials.includes(sn);
                                return (
                                  <button
                                    key={sn}
                                    type="button"
                                    onClick={() => toggleEditSerialSelection(sn)}
                                    className={`px-2.5 py-1 rounded-lg text-[10.5px] font-mono border font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                      isSelected
                                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs scale-[1.02]'
                                        : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-900'
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                    <span>{sn}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="py-4 px-3 text-center bg-white/80 rounded-xl border border-dashed border-slate-300">
                              <p className="text-xs font-bold text-slate-700">No serial numbers found</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                No available serial numbers match "{editSerialSearchTerm}".
                              </p>
                              <button
                                type="button"
                                onClick={() => setEditSerialSearchTerm('')}
                                className="mt-1 text-xs text-emerald-600 font-bold hover:underline cursor-pointer"
                              >
                                Clear search filter
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-[11px] text-slate-400 font-medium">Standard inventory item without pre-indexed serial numbers.</p>
                      )}
                    </div>
                  );
                })()}

                {/* Items Added Table */}
                {editChallanItems.length > 0 && (
                  <div className="mt-3 bg-white rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 border-b border-slate-100">
                          <th className="px-3 py-2 font-bold">Item</th>
                          <th className="px-3 py-2 text-center font-bold">UOM</th>
                          <th className="px-3 py-2 text-right font-bold">Qty</th>
                          <th className="px-3 py-2 text-center font-bold">Remove</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editChallanItems.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-100 last:border-0 font-bold">
                            <td className="px-3 py-2.5 text-slate-800">
                              <div>{item.productName}</div>
                              {item.serialNumbers && item.serialNumbers.length > 0 && (
                                <div className="text-[9.5px] font-mono text-emerald-700 font-semibold mt-1 flex flex-wrap gap-1">
                                  {item.serialNumbers.map(sn => (
                                    <span key={sn} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded">
                                      {sn}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 text-center font-bold">{item.unit || 'Nos'}</td>
                            <td className="px-3 py-2.5 text-slate-900 text-right align-top">{item.qty}</td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleEditRemoveItem(idx)}
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

              <div>
                <label className="block text-slate-500 mb-1">Dispatch Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Delivery terms, packaging description, helper name..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingChallan(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold cursor-pointer"
                >
                  Update Challan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock History Modal */}
      {showStockHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-base">Stock Transaction History Logs</h3>
              </div>
              <button onClick={() => setShowStockHistoryModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 flex items-center space-x-3">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search stock history by challan number, product, or type..."
                value={stockTxnSearch}
                onChange={e => setStockTxnSearch(e.target.value)}
                className="w-full text-xs font-semibold outline-none text-slate-800 bg-transparent"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-100 text-slate-500 border-b border-slate-200 uppercase text-[10px] tracking-wider">
                    <th className="px-3 py-2.5 font-bold">Challan No</th>
                    <th className="px-3 py-2.5 font-bold">Type</th>
                    <th className="px-3 py-2.5 font-bold">Product Name</th>
                    <th className="px-3 py-2.5 text-right font-bold">Qty Deducted</th>
                    <th className="px-3 py-2.5 text-right font-bold">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStockTxns.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-semibold">
                        No stock transaction logs found.
                      </td>
                    </tr>
                  ) : (
                    filteredStockTxns.map((st, idx) => (
                      <tr key={st.id || idx} className="hover:bg-slate-50 font-medium text-slate-700">
                        <td className="px-3 py-2.5 font-bold text-slate-900">{st.challanNumber}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold uppercase ${
                            st.challanType === 'B2B' || st.challanType === 'b2b'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {st.challanType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-800">{st.productName}</td>
                        <td className="px-3 py-2.5 text-right font-extrabold text-rose-600">-{st.quantityDeducted} units</td>
                        <td className="px-3 py-2.5 text-right text-slate-500 text-[11px]">
                          {dayjs(st.timestamp).format('DD MMM YYYY, hh:mm A')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowStockHistoryModal(false)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive BOM & Package Selector Modal */}
      {showBomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl my-auto max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-5 sm:p-6 flex justify-between items-start shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500/20 border border-emerald-400/30 rounded-xl text-emerald-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black tracking-tight">Select BOM & Set Dispatch Quantities</h3>
                      {isLoadingPackages && <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />}
                    </div>
                    <p className="text-xs text-slate-300 font-semibold mt-0.5">
                      Select components from quotation or package templates and specify the exact quantities to dispatch.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowBomModal(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs font-semibold">
              {/* Source Tabs */}
              <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/80">
                {leadQuotation && (
                  <button
                    type="button"
                    onClick={() => handleSourceTypeChange('quotation')}
                    className={`flex-1 min-w-[160px] py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      selectedBomSourceType === 'quotation'
                        ? 'bg-white text-emerald-800 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span>Lead's Quotation BOM (#{leadQuotation.quotationNumber})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleSourceTypeChange('package')}
                  className={`flex-1 min-w-[160px] py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    selectedBomSourceType === 'package'
                      ? 'bg-white text-indigo-800 shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <PackageIcon className="w-4 h-4 text-indigo-600" />
                  <span>System Package Templates ({availablePackages.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSourceTypeChange('catalog_kit')}
                  className={`flex-1 min-w-[160px] py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    selectedBomSourceType === 'catalog_kit'
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  <Layers className="w-4 h-4 text-amber-600" />
                  <span>Catalog Component Kits</span>
                </button>
              </div>

              {/* Sub-selectors for Package or Catalog Kit */}
              {selectedBomSourceType === 'package' && (
                <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-900 mb-1">Choose System Package Template:</label>
                    <select
                      value={selectedPackageId}
                      onChange={(e) => handleSelectPackageForBom(e.target.value)}
                      className="border border-indigo-200 rounded-xl px-3 py-2 bg-white text-slate-800 font-bold text-xs focus:outline-none cursor-pointer w-full sm:w-auto min-w-[280px]"
                    >
                      {availablePackages.map(pkg => (
                        <option key={pkg.id} value={pkg.id}>
                          📦 {pkg.name} ({pkg.bomItems?.length || 0} BOM + {pkg.commercialItems?.length || 0} items)
                        </option>
                      ))}
                    </select>
                  </div>
                  {availablePackages.find(p => p.id === selectedPackageId)?.description && (
                    <p className="text-[11px] text-indigo-700 italic max-w-xs">
                      {availablePackages.find(p => p.id === selectedPackageId)?.description}
                    </p>
                  )}
                </div>
              )}

              {selectedBomSourceType === 'catalog_kit' && (
                <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">Select Component Category Kit:</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'all', label: 'All Catalog Items', icon: Layers },
                        { id: 'structure', label: '🏗️ Structure Kit', icon: Layers },
                        { id: 'inverter', label: '⚡ Inverter Kit', icon: Zap },
                        { id: 'system', label: '☀️ Solar Panels Kit', icon: Sun },
                        { id: 'bos', label: '🔌 BOS & Protection', icon: ShieldCheck }
                      ].map(kit => (
                        <button
                          key={kit.id}
                          type="button"
                          onClick={() => handleSelectKitCategoryForBom(kit.id as any)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            selectedKitCategory === kit.id
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {kit.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Filter & Quick Selection Controls */}
              <div className="space-y-3 pt-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Category Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'all', label: 'All Items' },
                      { id: 'structure', label: '🏗️ Structure' },
                      { id: 'inverter', label: '⚡ Inverter' },
                      { id: 'system', label: '☀️ Panels' },
                      { id: 'bos', label: '🔌 BOS / Cables' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setBomCategoryFilter(tab.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                          bomCategoryFilter === tab.id
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Search */}
                  <div className="relative min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filter items..."
                      value={bomSearchTerm}
                      onChange={(e) => setBomSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Quick Selection Shortcuts */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 text-[11px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-500 font-bold uppercase text-[10px]">Quick Select:</span>
                    <button
                      type="button"
                      onClick={() => handleSetAllBomItemsSelect(true)}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 text-emerald-700 font-bold rounded border border-emerald-200 cursor-pointer"
                    >
                      ✓ Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetAllBomItemsSelect(false)}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 text-rose-600 font-bold rounded border border-rose-200 cursor-pointer"
                    >
                      ✗ Deselect All
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectOnlyCategory('structure')}
                      className="px-2 py-0.5 bg-white hover:bg-amber-50 text-amber-800 font-bold rounded border border-amber-200 cursor-pointer"
                    >
                      🏗️ Structure Only
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectOnlyCategory('inverter')}
                      className="px-2 py-0.5 bg-white hover:bg-indigo-50 text-indigo-800 font-bold rounded border border-indigo-200 cursor-pointer"
                    >
                      ⚡ Inverter Only
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectOnlyCategory('system')}
                      className="px-2 py-0.5 bg-white hover:bg-emerald-50 text-emerald-800 font-bold rounded border border-emerald-200 cursor-pointer"
                    >
                      ☀️ Panels Only
                    </button>
                  </div>

                  <span className="text-slate-500 font-extrabold">
                    {bomItemsToSelect.filter(i => i.selected).length} of {bomItemsToSelect.length} items checked
                  </span>
                </div>
              </div>

              {/* Items Selection & Quantity Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-slate-500 uppercase text-[10px] tracking-wider font-bold z-10 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={bomItemsToSelect.length > 0 && bomItemsToSelect.every(i => i.selected)}
                            onChange={(e) => handleSetAllBomItemsSelect(e.target.checked)}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer"
                          />
                        </th>
                        <th className="px-3 py-2.5">Component / Item Name</th>
                        <th className="px-3 py-2.5 text-center">Category</th>
                        <th className="px-3 py-2.5 text-center">Available Stock</th>
                        <th className="px-3 py-2.5 text-right w-36">Dispatch Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bomItemsToSelect.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-semibold">
                            No BOM items found for the selected template.
                          </td>
                        </tr>
                      ) : (
                        bomItemsToSelect
                          .filter(item => {
                            const matchesCat = bomCategoryFilter === 'all' || item.category === bomCategoryFilter;
                            const matchesSearch = !bomSearchTerm || (item.name || '').toLowerCase().includes(bomSearchTerm.toLowerCase());
                            return matchesCat && matchesSearch;
                          })
                          .map((item) => (
                            <tr
                              key={item.id}
                              className={`hover:bg-slate-50 transition-colors ${
                                item.selected ? 'bg-emerald-50/30' : 'opacity-60 bg-white'
                              }`}
                            >
                              <td className="px-3 py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={item.selected}
                                  onChange={() => handleToggleBomItemSelect(item.id)}
                                  className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer"
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="font-bold text-slate-800">{item.name}</div>
                                <div className="text-[10px] text-slate-400">
                                  Default BOM Qty: <strong>{item.bomQty} {item.unit}</strong>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                  item.category === 'structure' ? 'bg-amber-100 text-amber-800' :
                                  item.category === 'inverter' ? 'bg-indigo-100 text-indigo-800' :
                                  item.category === 'system' ? 'bg-emerald-100 text-emerald-800' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {item.categoryLabel}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`font-extrabold text-[11px] ${
                                  item.stockAvailable >= item.dispatchQty
                                    ? 'text-emerald-700'
                                    : item.stockAvailable > 0
                                    ? 'text-amber-600'
                                    : 'text-rose-600'
                                }`}>
                                  {item.stockAvailable} {item.unit}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleBomItemQtyChange(item.id, item.dispatchQty - 1)}
                                    className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    value={item.dispatchQty}
                                    onChange={(e) => handleBomItemQtyChange(item.id, Number(e.target.value))}
                                    className="w-14 text-center py-1 px-1 border border-slate-300 rounded-lg font-black text-slate-900 bg-white focus:outline-none focus:border-emerald-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleBomItemQtyChange(item.id, item.dispatchQty + 1)}
                                    className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-black flex items-center justify-center cursor-pointer"
                                  >
                                    +
                                  </button>
                                  <span className="text-[10px] text-slate-400 font-bold ml-1 w-6">{item.unit}</span>
                                </div>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-600 font-semibold">
                Selected: <strong>{bomItemsToSelect.filter(i => i.selected).length}</strong> component(s) • Total Quantity: <strong>{bomItemsToSelect.filter(i => i.selected).reduce((s, i) => s + i.dispatchQty, 0)} units</strong>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowBomModal(false)}
                  className="flex-1 sm:flex-none px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportBomToChallan}
                  className="flex-1 sm:flex-none px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Add Selected to Challan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {previewPhotoUrl && (
        <div
          onClick={() => setPreviewPhotoUrl(null)}
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700"
          >
            <div className="flex items-center justify-between p-3 bg-slate-800/90 text-white">
              <span className="text-xs font-bold flex items-center gap-1.5 text-emerald-400">
                <Camera className="w-4 h-4" /> Geotagged Vehicle Photo Preview
              </span>
              <button
                type="button"
                onClick={() => setPreviewPhotoUrl(null)}
                className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center bg-black/40">
              <img
                src={previewPhotoUrl}
                alt="Vehicle Photo Full View"
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
