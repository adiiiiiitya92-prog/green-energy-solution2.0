import React, { useEffect, useState } from 'react';
import type { Challan, Lead, Profile, Product, ChallanItem } from '../../types';
import { challanService } from '../../services/challanService';
import { leadService } from '../../services/leadService';
import { employeeService } from '../../services/employeeService';
import { productService } from '../../services/productService';
import { pdfService } from '../../services/pdfService';
import { Plus, Search, Truck, Trash2, ClipboardList, X } from 'lucide-react';
import dayjs from 'dayjs';
import logoImg from '../../assets/Green-Energy-Solution.png';

export const Challans: React.FC = () => {
  const [challans, setChallans] = useState<Challan[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [assignedEmployeeId, setAssignedEmployeeId] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [challanItems, setChallanItems] = useState<ChallanItem[]>([]);
  const [notes, setNotes] = useState('');

  // Row selection states
  const [currentProductId, setCurrentProductId] = useState('');
  const [currentQty, setCurrentQty] = useState(1);
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);

  // Edit Form States
  const [editingChallan, setEditingChallan] = useState<Challan | null>(null);
  const [editVehicleNumber, setEditVehicleNumber] = useState('');
  const [editDriverName, setEditDriverName] = useState('');
  const [editDriverPhone, setEditDriverPhone] = useState('');
  const [editChallanItems, setEditChallanItems] = useState<ChallanItem[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [currentEditProductId, setCurrentEditProductId] = useState('');
  const [currentEditQty, setCurrentEditQty] = useState(1);
  const [selectedEditSerials, setSelectedEditSerials] = useState<string[]>([]);

  // Date Filters & Collapsible card State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedChallanId, setExpandedChallanId] = useState<string | null>(null);

  const loadData = async () => {
    const cList = await challanService.getChallans();
    setChallans(cList);

    const lList = await leadService.getLeads();
    setLeads(lList);

    const eList = await employeeService.getEmployees();
    setEmployees(eList);

    const pList = await productService.getProducts();
    setProducts(pList);
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const handleAddItem = () => {
    if (!currentProductId || currentQty <= 0) {
      alert('Please select a product and enter a valid quantity.');
      return;
    }

    const targetProduct = products.find(p => p.id === currentProductId);
    if (!targetProduct) return;

    // Check if stock is sufficient
    if (targetProduct.stockQuantity < currentQty) {
      alert(`Warning: Insufficient stock available. Current stock: ${targetProduct.stockQuantity} units.`);
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
      serialNumbers: selectedSerials
    };

    setChallanItems([...challanItems, newItem]);
    setCurrentProductId('');
    setCurrentQty(1);
    setSelectedSerials([]);
  };

  const handleRemoveItem = (index: number) => {
    setChallanItems(challanItems.filter((_, i) => i !== index));
  };

  const handleCreateChallan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedLeadId || !assignedEmployeeId || !vehicleNumber || !driverName || !driverPhone) {
      alert('Please fill out all mandatory dispatch fields.');
      return;
    }

    if (challanItems.length === 0) {
      alert('Please add at least one product item to dispatch.');
      return;
    }

    const lead = leads.find(l => l.id === selectedLeadId);
    const emp = employees.find(e => e.id === assignedEmployeeId);

    if (!lead || !emp) {
      alert('Error finding selected lead or representative details.');
      return;
    }

    await challanService.createChallan({
      leadId: selectedLeadId,
      leadName: lead.name,
      assignedEmployeeId,
      employeeName: emp.fullName,
      vehicleNumber,
      driverName,
      driverPhone,
      items: challanItems,
      notes: notes || undefined
    });

    alert('Delivery Challan created successfully and inventory stock adjusted!');

    // Reset Form
    setSelectedLeadId('');
    setAssignedEmployeeId('');
    setVehicleNumber('');
    setDriverName('');
    setDriverPhone('');
    setChallanItems([]);
    setNotes('');
    setShowAddModal(false);

    loadData();
  };

  const handleDownloadPDF = async (ch: Challan) => {
    try {
      const blob = await pdfService.generateChallanPDF(ch);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Challan_${ch.challanNumber}.pdf`;
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

      // Try Web Share API (mobile/PWA native)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Delivery Challan ${ch.challanNumber}`,
            text: `Dear Driver, please find attached the Delivery Challan for vehicle ${ch.vehicleNumber}.`
          });
          return;
        } catch (shareErr) {
          console.log('Web share aborted, falling back to download + link.', shareErr);
        }
      }

      // Fallback: Download file locally and redirect to WhatsApp Web
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Challan_${ch.challanNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      const msg = `*GREEN ENERGY SOLUTION - DELIVERY CHALLAN DISPATCH*\n\n` +
        `Challan No: ${ch.challanNumber}\n` +
        `Vehicle No: ${ch.vehicleNumber}\n` +
        `Customer: ${ch.leadName}\n` +
        `Representative: ${ch.employeeName}\n` +
        `Driver: ${ch.driverName}\n` +
        `------------------------------------\n` +
        ch.items.map(item => `• ${item.productName} (x${item.qty})`).join('\n') +
        `\n------------------------------------\n` +
        `_Note: I have downloaded the official Challan PDF. Please attach it here and start delivery._`;

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
  };

  const handleDeleteChallan = async (ch: Challan) => {
    if (confirm(`⚠️ DELETE WARNING:\n\nAre you sure you want to delete Delivery Challan "${ch.challanNumber}" for ${ch.leadName}?\n\nDeleting this challan will also restore all dispatched item quantities back into product inventory stock.`)) {
      await challanService.deleteChallan(ch.id);
      loadData();
    }
  };

  const handleEditAddItem = () => {
    if (!currentEditProductId || currentEditQty <= 0) {
      alert('Please select a product and enter a valid quantity.');
      return;
    }

    const targetProduct = products.find(p => p.id === currentEditProductId);
    if (!targetProduct) return;

    // Check stock (include reversion buffer: old stock + old qty for this product)
    const oldItem = editingChallan?.items.find(item => item.productId === currentEditProductId);
    const originalQty = oldItem ? oldItem.qty : 0;
    const availableBuffer = targetProduct.stockQuantity + originalQty;

    if (availableBuffer < currentEditQty) {
      alert(`Warning: Insufficient stock available. Maximum dispatchable qty including current assignment: ${availableBuffer} units.`);
      return;
    }

    // Check duplicate
    if (editChallanItems.some(item => item.productId === currentEditProductId)) {
      alert('Product already added. Remove and re-add to modify quantity.');
      return;
    }

    const newItem: ChallanItem = {
      productId: currentEditProductId,
      productName: targetProduct.name,
      qty: currentEditQty,
      serialNumbers: selectedEditSerials
    };

    setEditChallanItems([...editChallanItems, newItem]);
    setCurrentEditProductId('');
    setCurrentEditQty(1);
    setSelectedEditSerials([]);
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
      await challanService.updateChallan(editingChallan.id, {
        ...editingChallan,
        vehicleNumber: editVehicleNumber,
        driverName: editDriverName,
        driverPhone: editDriverPhone,
        items: editChallanItems,
        notes: editNotes || undefined
      });

      alert('Delivery Challan updated successfully and inventory stock adjusted!');
      setEditingChallan(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error updating delivery challan.');
    }
  };

  const filteredChallans = challans.filter(ch => {
    // 1. Text Search (challan number, lead name, vehicle, driver)
    const matchesSearch = 
      ch.challanNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ch.leadName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ch.vehicleNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ch.driverName.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // 2. Start Date Filter
    if (startDate) {
      const chDate = dayjs(ch.createdAt);
      const start = dayjs(startDate).startOf('day');
      if (chDate.isBefore(start)) return false;
    }

    // 3. End Date Filter
    if (endDate) {
      const chDate = dayjs(ch.createdAt);
      const end = dayjs(endDate).endOf('day');
      if (chDate.isAfter(end)) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Delivery Challans</h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Record materials dispatch, vehicle assignments, and adjust stock counts.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Dispatch Challan</span>
        </button>
      </div>

      {/* Search Controls & Date Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-4">
        <div className="flex-1 flex items-center space-x-3 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/50">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by challan, client, vehicle, driver..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-xs font-semibold text-slate-800 focus:outline-none w-full bg-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
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
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="text-[10px] text-rose-500 hover:text-rose-700 font-bold ml-2 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Challan List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredChallans.map((ch) => {
          const isExpanded = expandedChallanId === ch.id;
          return (
            <div
              key={ch.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-sm transition-all relative flex flex-col justify-between"
            >
              {/* Card Header (clickable to toggle expansion) */}
              <div
                onClick={() => setExpandedChallanId(isExpanded ? null : ch.id)}
                className="flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer select-none gap-2"
              >
                <div className="flex items-center gap-2.5">
                  <span className={`p-2 rounded-xl transition-colors ${isExpanded ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                    <Truck className="w-5 h-5" />
                  </span>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">{ch.challanNumber}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{dayjs(ch.createdAt).format('DD MMM YYYY • hh:mm A')}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black bg-slate-50 text-slate-600 border border-slate-200/60 uppercase tracking-wider">
                    🚚 {ch.vehicleNumber}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black bg-emerald-50/55 text-emerald-800 border border-emerald-100 uppercase tracking-wider">
                    👤 Rep: {ch.employeeName}
                  </span>
                  <span className="text-[10px] text-indigo-600 hover:text-indigo-800 font-black uppercase tracking-wider ml-1">
                    {isExpanded ? 'Hide Details ▲' : 'Show Details ▼'}
                  </span>
                </div>
              </div>

              {/* Sub-summary (Always visible) */}
              <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 font-bold border-t border-slate-100/50 pt-2.5">
                <p>Client: <span className="text-slate-800 font-extrabold">{ch.leadName}</span></p>
                <p>Driver: <span className="text-slate-800 font-extrabold">{ch.driverName}</span></p>
                <p>Items: <span className="text-slate-800 font-extrabold">{ch.items.length} types</span></p>
              </div>

              {/* Expanded details section */}
              {isExpanded && (
                <div className="mt-5 space-y-4 border-t border-slate-100 pt-4 animate-slide-down">
                  {/* Company Logo & Official White Header Banner */}
                  <div className="bg-white text-slate-900 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-xs border border-slate-200">
                    <div className="flex items-center gap-3">
                      <img src={logoImg} alt="Green Energy Solution Logo" className="h-9 w-auto object-contain shrink-0" />
                      <div>
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Green Energy Solution</p>
                        <p className="text-xs font-bold text-slate-700">Materials Delivery Challan & Dispatch Note</p>
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
                      <p className="text-[10px] uppercase text-slate-400 tracking-wider mb-1">Customer / Project Details</p>
                      <p className="text-slate-800 font-bold text-sm mb-0.5">{ch.leadName}</p>
                      <p className="text-slate-500 font-medium">Lead Ref ID: {ch.leadId}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-slate-400 tracking-wider mb-1">Transport & Driver Info</p>
                      <p className="text-slate-800 font-bold mb-0.5">Driver: {ch.driverName}</p>
                      <p className="text-slate-500 font-medium">Phone: +91 {ch.driverPhone}</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-2">Dispatched Components List</p>
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-200 pb-1">
                          <th className="pb-1 font-bold">Item Description</th>
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
                            <td className="py-2 text-slate-900 font-extrabold text-right align-top">{item.qty} units</td>
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

                  {/* Actions (Download, WhatsApp, Edit, Delete) */}
                  <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadPDF(ch);
                      }}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold uppercase rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      Download PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWhatsappShare(ch);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase rounded-lg shadow-sm transition-colors cursor-pointer"
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
            <p className="text-xs text-slate-400 font-bold">No delivery challans recorded yet. Tap "New Dispatch Challan" to dispatch inventory.</p>
          </div>
        )}
      </div>

      {/* Add Challan Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-6 m-4 animate-scale-in my-8 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-600" />
              <span>Create Dispatch Challan</span>
            </h3>

            <form onSubmit={handleCreateChallan} className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Select Lead / Project</label>
                  <select
                    required
                    value={selectedLeadId}
                    onChange={(e) => setSelectedLeadId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Choose Customer --</option>
                    {leads.map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.requirement})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Assigned Dispatch Rep</label>
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
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-slate-500 mb-1">Vehicle No</label>
                  <input
                    type="text"
                    required
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. UP 32 AZ 1234"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-slate-500 mb-1">Driver Name</label>
                  <input
                    type="text"
                    required
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="e.g. Ram Kumar"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-slate-500 mb-1">Driver Phone</label>
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

              {/* Items Dispatch Section */}
              <div className="border border-slate-200 p-4 rounded-2xl bg-slate-50/50 space-y-3">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Dispatched Line Items</p>
                
                {/* Item Form Inputs */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-slate-500 mb-1">Select Product</label>
                    <select
                      value={currentProductId}
                      onChange={(e) => setCurrentProductId(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-2 bg-white cursor-pointer"
                    >
                      <option value="">-- Select Component --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (Stock: {p.stockQuantity})</option>
                      ))}
                    </select>
                  </div>

                  <div className="w-24">
                    <label className="block text-slate-500 mb-1">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      value={currentQty}
                      onChange={(e) => handleQtyChange(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl h-[34px] cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {/* Serial Numbers Picker UI */}
                {currentProductId && (
                  <div className="bg-slate-100/80 p-3 rounded-xl border border-slate-200/80">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        Available Serial Numbers ({selectedSerials.length} selected)
                      </span>
                      {getAvailableSerialsForProduct(currentProductId, null).length === 0 && (
                        <span className="text-[10px] text-amber-600 font-bold">No available unsold serial numbers</span>
                      )}
                    </div>
                    {getAvailableSerialsForProduct(currentProductId, null).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                        {getAvailableSerialsForProduct(currentProductId, null).map(sn => {
                          const isSelected = selectedSerials.includes(sn);
                          return (
                            <button
                              key={sn}
                              type="button"
                              onClick={() => toggleSerialSelection(sn)}
                              className={`px-2 py-1 rounded-md text-[10px] font-mono border font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs scale-[1.02]'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              {isSelected ? '✓ ' : ''}{sn}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 font-medium">Standard inventory item without pre-indexed serial numbers.</p>
                    )}
                  </div>
                )}

                {/* Items Added Table */}
                {challanItems.length > 0 && (
                  <div className="mt-3 bg-white rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 border-b border-slate-100">
                          <th className="px-3 py-2 font-bold">Item</th>
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
                            <td className="px-3 py-2.5 text-slate-900 text-right align-top">{item.qty} units</td>
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
                  onClick={() => {
                    setSelectedLeadId('');
                    setAssignedEmployeeId('');
                    setVehicleNumber('');
                    setDriverName('');
                    setDriverPhone('');
                    setChallanItems([]);
                    setNotes('');
                    setShowAddModal(false);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold cursor-pointer"
                >
                  Create Challan
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
                <span>Edit Dispatch Challan</span>
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
                <label className="block text-slate-500 mb-1">Customer / Project Details</label>
                <input
                  type="text"
                  disabled
                  value={editingChallan.leadName}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-100 text-slate-500 cursor-not-allowed font-bold"
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

              {/* Items Dispatch Section */}
              <div className="border border-slate-200 p-4 rounded-2xl bg-slate-50/50 space-y-3">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Dispatched Line Items</p>
                
                {/* Item Form Inputs */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-slate-500 mb-1">Select Product</label>
                    <select
                      value={currentEditProductId}
                      onChange={(e) => setCurrentEditProductId(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-2 bg-white cursor-pointer"
                    >
                      <option value="">-- Select Component --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} (Stock: {p.stockQuantity})</option>
                      ))}
                    </select>
                  </div>

                  <div className="w-24">
                    <label className="block text-slate-500 mb-1">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      value={currentEditQty}
                      onChange={(e) => handleEditQtyChange(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleEditAddItem}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl h-[34px] cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {/* Serial Numbers Picker UI */}
                {currentEditProductId && (
                  <div className="bg-slate-100/80 p-3 rounded-xl border border-slate-200/80">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        Available Serial Numbers ({selectedEditSerials.length} selected)
                      </span>
                      {getAvailableSerialsForProduct(currentEditProductId, editingChallan).length === 0 && (
                        <span className="text-[10px] text-amber-600 font-bold">No available unsold serial numbers</span>
                      )}
                    </div>
                    {getAvailableSerialsForProduct(currentEditProductId, editingChallan).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1">
                        {getAvailableSerialsForProduct(currentEditProductId, editingChallan).map(sn => {
                          const isSelected = selectedEditSerials.includes(sn);
                          return (
                            <button
                              key={sn}
                              type="button"
                              onClick={() => toggleEditSerialSelection(sn)}
                              className={`px-2 py-1 rounded-md text-[10px] font-mono border font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs scale-[1.02]'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              {isSelected ? '✓ ' : ''}{sn}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 font-medium">Standard inventory item without pre-indexed serial numbers.</p>
                    )}
                  </div>
                )}

                {/* Items Added Table */}
                {editChallanItems.length > 0 && (
                  <div className="mt-3 bg-white rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 border-b border-slate-100">
                          <th className="px-3 py-2 font-bold">Item</th>
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
                            <td className="px-3 py-2.5 text-slate-900 text-right align-top">{item.qty} units</td>
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
    </div>
  );
};
