import React, { useEffect, useState } from 'react';
import type { B2BBusiness, Challan } from '../../types';
import { b2bBusinessService } from '../../services/b2bBusinessService';
import { challanService } from '../../services/challanService';
import { pdfService } from '../../services/pdfService';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Search,
  Plus,
  Edit2,
  Trash2,
  FileText,
  Phone,
  Mail,
  MapPin,
  X,
  ExternalLink,
  Download,
  Calendar,
  UserCheck,
  ShieldCheck
} from 'lucide-react';
import dayjs from 'dayjs';

export const B2BBusinesses: React.FC = () => {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<B2BBusiness[]>([]);
  const [allChallans, setAllChallans] = useState<Challan[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Selected Business Profile Drawer/Modal
  const [selectedBusiness, setSelectedBusiness] = useState<B2BBusiness | null>(null);
  const [businessChallans, setBusinessChallans] = useState<Challan[]>([]);

  // Edit Modal State
  const [editingBusiness, setEditingBusiness] = useState<B2BBusiness | null>(null);
  const [editName, setEditName] = useState('');
  const [editGst, setEditGst] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editEmail, setEditEmail] = useState('');

  // Add Business Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGst, setNewGst] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const bList = await b2bBusinessService.getBusinesses();
      setBusinesses(bList);

      const cList = await challanService.getChallans();
      setAllChallans(cList);
    } catch (err) {
      console.error("Error loading B2B Businesses data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleRealtimeUpdate = () => loadData();
    window.addEventListener('app-realtime-update', handleRealtimeUpdate);
    window.addEventListener('storage', handleRealtimeUpdate);
    return () => {
      window.removeEventListener('app-realtime-update', handleRealtimeUpdate);
      window.removeEventListener('storage', handleRealtimeUpdate);
    };
  }, []);

  useEffect(() => {
    if (selectedBusiness) {
      const related = allChallans.filter(
        c => c.b2bBusinessId === selectedBusiness.id ||
             (c.businessName && c.businessName.toLowerCase() === selectedBusiness.businessName.toLowerCase())
      );
      setBusinessChallans(related);
    }
  }, [selectedBusiness, allChallans]);

  const filteredBusinesses = businesses.filter(b => {
    const q = searchTerm.toLowerCase();
    return (
      b.businessName.toLowerCase().includes(q) ||
      (b.gstNumber && b.gstNumber.toLowerCase().includes(q)) ||
      (b.mobileNumber && b.mobileNumber.toLowerCase().includes(q)) ||
      (b.contactPerson && b.contactPerson.toLowerCase().includes(q)) ||
      (b.businessAddress && b.businessAddress.toLowerCase().includes(q))
    );
  });

  const handleOpenEdit = (b: B2BBusiness, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingBusiness(b);
    setEditName(b.businessName);
    setEditGst(b.gstNumber || '');
    setEditAddress(b.businessAddress || '');
    setEditContact(b.contactPerson || '');
    setEditMobile(b.mobileNumber || '');
    setEditEmail(b.email || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBusiness) return;
    if (!editName.trim() || !editAddress.trim()) {
      alert('Business Name and Address are required.');
      return;
    }

    try {
      await b2bBusinessService.updateBusiness(editingBusiness.id, {
        businessName: editName.trim(),
        gstNumber: editGst.trim(),
        businessAddress: editAddress.trim(),
        contactPerson: editContact.trim(),
        mobileNumber: editMobile.trim(),
        email: editEmail.trim()
      });

      alert('B2B Business details updated successfully!');
      setEditingBusiness(null);
      await loadData();

      // If drawer is open for this business, update active business state
      if (selectedBusiness && selectedBusiness.id === editingBusiness.id) {
        const refreshed = await b2bBusinessService.getBusinessById(editingBusiness.id);
        if (refreshed) setSelectedBusiness(refreshed);
      }
    } catch (err) {
      console.error(err);
      alert('Error updating business details.');
    }
  };

  const handleSaveNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newAddress.trim()) {
      alert('Business Name and Business Address are required.');
      return;
    }

    try {
      await b2bBusinessService.saveOrUpdateBusiness({
        businessName: newName.trim(),
        gstNumber: newGst.trim(),
        businessAddress: newAddress.trim(),
        contactPerson: newContact.trim(),
        mobileNumber: newMobile.trim(),
        email: newEmail.trim()
      });

      alert('New B2B Business created successfully!');
      setShowAddModal(false);
      setNewName('');
      setNewGst('');
      setNewAddress('');
      setNewContact('');
      setNewMobile('');
      setNewEmail('');
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error creating B2B Business.');
    }
  };

  const handleDeleteBusiness = async (b: B2BBusiness, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const confirmMsg =
      `⚠️ DELETE CONFIRMATION:\n\n` +
      `Are you sure you want to delete "${b.businessName}" from the B2B Businesses directory?\n\n` +
      `Note: Existing past challans for this business will remain intact in accounting history.`;

    if (confirm(confirmMsg)) {
      try {
        await b2bBusinessService.deleteBusiness(b.id);
        alert('B2B Business removed from directory successfully.');
        if (selectedBusiness?.id === b.id) {
          setSelectedBusiness(null);
        }
        loadData();
      } catch (err) {
        console.error(err);
        alert('Error deleting B2B Business.');
      }
    }
  };

  const handleCreateChallanForBusiness = (b: B2BBusiness, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Navigate to /challans with b2b Business details passed in location state
    navigate('/challans', {
      state: {
        isB2BMode: true,
        prefillBusiness: b
      }
    });
  };

  const handleDownloadPDF = async (ch: Challan) => {
    try {
      const blob = await pdfService.generateChallanPDF(ch);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `B2B_Challan_${ch.challanNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error generating PDF.');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">B2B Businesses Directory</h1>
            <p className="text-xs text-slate-500">
              Manage corporate clients, search reusable business profiles, and generate B2B Delivery Challans.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm transition-all flex items-center justify-center space-x-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Business</span>
        </button>
      </div>

      {/* Stats Quick Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Saved Businesses</p>
            <p className="text-xl font-bold text-slate-800">{businesses.length}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total B2B Challans</p>
            <p className="text-xl font-bold text-slate-800">
              {allChallans.filter(c => c.type === 'b2b').length}
            </p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">GST Registered Clients</p>
            <p className="text-xl font-bold text-slate-800">
              {businesses.filter(b => b.gstNumber && b.gstNumber.trim().length > 0).length}
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
        <Search className="w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Search businesses by name, mobile, GST number, or contact person..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full text-sm outline-none text-slate-700 bg-transparent"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Business Cards Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 animate-pulse text-sm">
          Loading B2B Businesses Directory...
        </div>
      ) : filteredBusinesses.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 p-8 space-y-3">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-base font-semibold text-slate-700">No B2B Businesses Found</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchTerm
              ? `No business matches "${searchTerm}". Try a different keyword.`
              : 'Whenever you create a B2B Delivery Challan, business details will automatically save here.'}
          </p>
          {!searchTerm && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              Add First Business
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredBusinesses.map(b => {
            const challanCount = allChallans.filter(
              c => c.b2bBusinessId === b.id || (c.businessName && c.businessName.toLowerCase() === b.businessName.toLowerCase())
            ).length;

            return (
              <div
                key={b.id}
                onClick={() => setSelectedBusiness(b)}
                className="bg-white rounded-2xl border border-slate-200 hover:border-emerald-500 hover:shadow-md transition-all p-5 flex flex-col justify-between cursor-pointer group"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-base group-hover:text-emerald-600 transition-colors">
                        {b.businessName}
                      </h3>
                      {b.gstNumber ? (
                        <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-md uppercase tracking-wider mt-1">
                          GST: {b.gstNumber}
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-medium rounded-md mt-1">
                          Non-GST Client
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={e => handleOpenEdit(b, e)}
                        title="Edit Details"
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => handleDeleteBusiness(b, e)}
                        title="Delete Business"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                    <p className="flex items-start space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{b.businessAddress}</span>
                    </p>
                    {b.contactPerson && (
                      <p className="flex items-center space-x-2">
                        <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{b.contactPerson}</span>
                      </p>
                    )}
                    {b.mobileNumber && (
                      <p className="flex items-center space-x-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{b.mobileNumber}</span>
                      </p>
                    )}
                    {b.email && (
                      <p className="flex items-center space-x-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{b.email}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">{challanCount}</span> {challanCount === 1 ? 'Challan' : 'Challans'} Created
                  </div>
                  <button
                    onClick={e => handleCreateChallanForBusiness(b, e)}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 font-semibold text-xs rounded-xl transition-all flex items-center space-x-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Challan</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Business Profile Modal / Drawer */}
      {selectedBusiness && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl overflow-y-auto flex flex-col justify-between animate-in slide-in-from-right duration-300">
            <div>
              {/* Drawer Header */}
              <div className="p-5 bg-slate-900 text-white flex justify-between items-start">
                <div className="space-y-1">
                  <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full uppercase tracking-wider">
                    B2B Business Profile
                  </span>
                  <h2 className="text-xl font-bold">{selectedBusiness.businessName}</h2>
                  <p className="text-xs text-slate-400 flex items-center space-x-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Saved on {dayjs(selectedBusiness.createdAt).format('DD MMM YYYY')}</span>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedBusiness(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="p-6 space-y-6">
                {/* Details Card */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Business Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-slate-400 font-medium">GST Number</p>
                      <p className="font-semibold text-slate-800">{selectedBusiness.gstNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Contact Person</p>
                      <p className="font-semibold text-slate-800">{selectedBusiness.contactPerson || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Mobile Number</p>
                      <p className="font-semibold text-slate-800">{selectedBusiness.mobileNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-medium">Email Address</p>
                      <p className="font-semibold text-slate-800">{selectedBusiness.email || 'N/A'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-slate-400 font-medium">Business Address</p>
                      <p className="font-semibold text-slate-800 leading-relaxed">{selectedBusiness.businessAddress}</p>
                    </div>
                  </div>
                </div>

                {/* Past Challans Section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-bold text-slate-800">
                      Previous Delivery Challans ({businessChallans.length})
                    </h4>
                    <button
                      onClick={() => handleCreateChallanForBusiness(selectedBusiness)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg flex items-center space-x-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Challan</span>
                    </button>
                  </div>

                  {businessChallans.length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
                      No delivery challans created for this business yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {businessChallans.map(ch => (
                        <div
                          key={ch.id}
                          className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:border-emerald-300 transition-all"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-emerald-600 text-sm">{ch.challanNumber}</span>
                              <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-md">
                                B2B
                              </span>
                            </div>
                            <p className="text-xs text-slate-500">
                              Vehicle: {ch.vehicleNumber} | Driver: {ch.driverName}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Date: {dayjs(ch.createdAt).format('DD MMM YYYY, hh:mm A')} | {ch.items.length} Products
                            </p>
                          </div>
                          <button
                            onClick={() => handleDownloadPDF(ch)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-lg flex items-center space-x-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <button
                onClick={() => handleOpenEdit(selectedBusiness)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium text-xs rounded-xl flex items-center space-x-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Business Info</span>
              </button>
              <button
                onClick={() => handleCreateChallanForBusiness(selectedBusiness)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl flex items-center space-x-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create New B2B Challan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Business Modal */}
      {editingBusiness && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">Edit B2B Business Details</h3>
              <button onClick={() => setEditingBusiness(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Business Name *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">GST Number</label>
                  <input
                    type="text"
                    value={editGst}
                    onChange={e => setEditGst(e.target.value.toUpperCase())}
                    placeholder="e.g. 27AAACA0000A1Z5"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800 uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={editContact}
                    onChange={e => setEditContact(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mobile Number</label>
                  <input
                    type="text"
                    value={editMobile}
                    onChange={e => setEditMobile(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Business Address *</label>
                <textarea
                  required
                  rows={3}
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingBusiness(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Business Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">Add New B2B Business Profile</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNew} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Business Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Solar Solutions Pvt Ltd"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">GST Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 27AAACA0000A1Z5"
                    value={newGst}
                    onChange={e => setNewGst(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800 uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={newContact}
                    onChange={e => setNewContact(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mobile Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543210"
                    value={newMobile}
                    onChange={e => setNewMobile(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. info@acmesolar.com"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Business Address *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Complete business site or office address..."
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-emerald-500 text-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm"
                >
                  Save Business
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
