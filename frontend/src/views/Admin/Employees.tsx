import React, { useEffect, useState } from 'react';
import type { Profile } from '../../types';
import { employeeService } from '../../services/employeeService';
import { Plus, Search, UserCheck, UserX, User, Trash2, ShieldOff, ShieldCheck, Pencil, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';

export const Employees: React.FC = () => {
  const { currentRole, impersonateUser, originalUser } = useAuthStore();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Edit employee state
  const [editingEmployee, setEditingEmployee] = useState<Profile | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<'super_admin' | 'admin' | 'field_employee' | 'inventory_manager' | 'dealer'>('field_employee');
  const [editEmail, setEditEmail] = useState('');
  const [editAadhaarNumber, setEditAadhaarNumber] = useState('');
  const [editPanNumber, setEditPanNumber] = useState('');
  const [editJoiningDate, setEditJoiningDate] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleImpersonateClick = async (emp: Profile) => {
    if (confirm(`Do you want to log in as "${emp.fullName}" (${emp.role.replace('_', ' ')}) without a password?`)) {
      await impersonateUser(emp);
      const targetPath = emp.role === 'field_employee' ? '/leads' : '/dashboard';
      navigate(targetPath);
    }
  };

  // Add Form states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'admin' | 'field_employee' | 'inventory_manager' | 'dealer'>('field_employee');
  const [email, setEmail] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [designation, setDesignation] = useState('');
  const [initialPassword, setInitialPassword] = useState('');

  const loadEmployees = async () => {
    const list = await employeeService.getEmployees();
    setEmployees(list);
  };

  useEffect(() => {
    loadEmployees();
    const handleRealtimeUpdate = () => loadEmployees();
    window.addEventListener('app-realtime-update', handleRealtimeUpdate);
    window.addEventListener('storage', handleRealtimeUpdate);
    return () => {
      window.removeEventListener('app-realtime-update', handleRealtimeUpdate);
      window.removeEventListener('storage', handleRealtimeUpdate);
    };
  }, []);

  const handleToggleStatus = async (emp: Profile) => {
    const action = emp.isActive ? 'BLOCK / DEACTIVATE' : 'ACTIVATE / UNBLOCK';
    if (confirm(`Are you sure you want to ${action} access for employee "${emp.fullName}"?\n\nIf blocked, this user will NOT be able to log in to the application.`)) {
      await employeeService.toggleEmployeeStatus(emp.id);
      loadEmployees();
    }
  };

  const handleDeleteEmployee = async (emp: Profile) => {
    if (confirm(`⚠️ PERMANENT DELETE WARNING:\n\nAre you sure you want to PERMANENTLY DELETE employee account "${emp.fullName}" (${emp.email || emp.phone})?\n\nThis will completely remove their account from both Local Storage & Cloud Database.`)) {
      await employeeService.deleteEmployee(emp.id);
      loadEmployees();
    }
  };

  const handleOpenEdit = (emp: Profile) => {
    setEditingEmployee(emp);
    setEditFullName(emp.fullName || '');
    setEditPhone(emp.phone || '');
    setEditRole(emp.role || 'field_employee');
    setEditEmail(emp.email || '');
    setEditAadhaarNumber(emp.aadhaarNumber || '');
    setEditPanNumber(emp.panNumber || '');
    setEditJoiningDate(emp.joiningDate || '');
    setEditDesignation(emp.designation || '');
    setEditPassword('');
    setEditIsActive(emp.isActive !== false);
  };

  const handleCloseEdit = () => {
    setEditingEmployee(null);
    setEditPassword('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    if (!editFullName.trim() || !editPhone.trim() || !editEmail.trim()) {
      alert('Please fill out Full Name, Phone Number, and Official Email Address.');
      return;
    }

    setIsUpdating(true);
    try {
      const updates: Partial<Profile> = {
        fullName: editFullName.trim(),
        phone: editPhone.trim(),
        role: editRole,
        email: editEmail.trim(),
        aadhaarNumber: editAadhaarNumber.trim() || undefined,
        panNumber: editPanNumber.trim() || undefined,
        joiningDate: editJoiningDate.trim() || undefined,
        designation: editDesignation.trim() || undefined,
        isActive: editIsActive
      };

      if (editPassword.trim()) {
        updates.password = editPassword.trim();
        updates.isActivated = true;
      }

      await employeeService.updateEmployee(editingEmployee.id, updates);
      setEditingEmployee(null);
      setEditPassword('');
      await loadEmployees();
    } catch (err: any) {
      console.error('Error updating employee:', err);
      alert('Failed to update employee details: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !phone || !email) {
      alert('Please fill out Full Name, Phone Number, and Official Email Address.');
      return;
    }

    await employeeService.createEmployee({
      fullName,
      phone,
      role,
      email: email || undefined,
      aadhaarNumber: aadhaarNumber || undefined,
      panNumber: panNumber || undefined,
      joiningDate: joiningDate || undefined,
      designation: designation || undefined,
      password: initialPassword.trim() || undefined,
      isActivated: !!initialPassword.trim()
    } as any);

    // Reset states
    setFullName('');
    setPhone('');
    setRole('field_employee');
    setEmail('');
    setAadhaarNumber('');
    setPanNumber('');
    setJoiningDate('');
    setDesignation('');
    setInitialPassword('');
    setShowAddModal(false);
    loadEmployees();
  };

  const filteredEmployees = employees.filter(emp =>
    (emp.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (emp.phone || '').includes(searchTerm) ||
    (emp.email && emp.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Employee Directory & Access Control</h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Manage system users, edit information, control login access, or delete employee profiles.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Directory Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-3">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Search by name, phone number, or official email address..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="text-xs font-medium text-slate-800 focus:outline-none w-full bg-transparent"
        />
      </div>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEmployees.map((emp) => (
          <div key={emp.id} className={`bg-white border rounded-2xl p-5 hover:shadow-md transition-shadow relative ${!emp.isActive ? 'border-red-200 bg-red-50/20' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center space-x-3 truncate min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold shrink-0 ${
                  !emp.isActive ? 'bg-rose-100 text-rose-700' : emp.role === 'admin' ? 'bg-emerald-100 text-emerald-700' : emp.role === 'inventory_manager' ? 'bg-amber-100 text-amber-700' : emp.role === 'dealer' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'
                }`}>
                  {emp.fullName ? emp.fullName[0].toUpperCase() : 'U'}
                </div>
                <div className="truncate min-w-0">
                  <h4 className="text-sm font-bold text-slate-900 truncate">{emp.fullName}</h4>
                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                    <span className="text-[9px] text-slate-500 font-extrabold uppercase bg-slate-100 px-1.5 py-0.5 rounded">{emp.role.replace('_', ' ')}</span>
                    {emp.designation && (
                      <span className="text-[8px] text-emerald-700 bg-emerald-50 border border-emerald-100/60 font-black px-1 rounded uppercase tracking-wider truncate max-w-[110px]" title={emp.designation}>{emp.designation}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Edit Icon on card top-right */}
              <button
                onClick={() => handleOpenEdit(emp)}
                className="w-7 h-7 rounded-lg bg-slate-100/80 hover:bg-blue-50 text-slate-500 hover:text-blue-600 border border-slate-200/60 hover:border-blue-200 flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="Edit Employee Information"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col space-y-1.5 text-xs text-slate-500">
              <p>📞 Phone: <span className="font-bold text-slate-700">{emp.phone}</span></p>
              {emp.email && <p className="truncate">✉️ Email: <span className="font-bold text-slate-700">{emp.email}</span></p>}
              {emp.aadhaarNumber && <p>💳 Aadhaar: <span className="font-bold text-slate-700">{emp.aadhaarNumber}</span></p>}
              {emp.panNumber && <p>📁 PAN Card: <span className="font-bold text-slate-700">{emp.panNumber}</span></p>}
              {emp.joiningDate && <p>📅 Joined: <span className="font-bold text-slate-700">{emp.joiningDate}</span></p>}
              <p className="flex items-center gap-1 mt-1">
                <span>Status:</span>
                {emp.isActive ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                    <ShieldCheck className="w-3 h-3" /> Active (Login Allowed)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                    <ShieldOff className="w-3 h-3" /> BLOCKED (Login Denied)
                  </span>
                )}
              </p>
            </div>

            {/* Impersonate Option - Super Admin Only */}
            {(currentRole === 'super_admin' || originalUser?.role === 'super_admin') && emp.id !== useAuthStore.getState().currentUser?.id && (
              <button
                onClick={() => handleImpersonateClick(emp)}
                className="mt-3 w-full py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-extrabold text-[10px] uppercase rounded-lg border border-amber-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>👤 Impersonate Account</span>
              </button>
            )}

            {/* Access Control Action Buttons (Edit, Block/Unblock & Delete) */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5">
              <button
                onClick={() => handleOpenEdit(emp)}
                className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-700 border border-blue-200 rounded-lg font-extrabold text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer"
                title="Edit Employee Information"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>

              <button
                onClick={() => handleToggleStatus(emp)}
                className={`flex-1 py-1.5 px-2 rounded-lg font-extrabold text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  emp.isActive
                    ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                }`}
                title={emp.isActive ? 'Block this account from logging in' : 'Unblock login access'}
              >
                {emp.isActive ? (
                  <>
                    <UserX className="w-3.5 h-3.5" />
                    <span>Block</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Unblock</span>
                  </>
                )}
              </button>

              <button
                onClick={() => handleDeleteEmployee(emp)}
                className="py-1.5 px-2.5 bg-slate-100 hover:bg-rose-600 hover:text-white text-slate-600 rounded-lg font-bold text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1 border border-slate-200"
                title="Permanently delete employee profile"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        ))}

        {filteredEmployees.length === 0 && (
          <div className="col-span-full bg-slate-50 border-2 border-dashed border-slate-200 p-8 text-center rounded-xl">
            <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-bold">No employees found. Click "Add Employee" to create one.</p>
          </div>
        )}
      </div>

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 max-h-[92vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">Edit Employee Information</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Update profile details, permissions, or reset password for {editingEmployee.fullName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseEdit}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-600 mb-1">Full Name <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="e.g. Ramesh Patel"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">Phone Number <span className="text-rose-500">*</span></label>
                  <input
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 mb-1">Company Role <span className="text-rose-500">*</span></label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as any)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 cursor-pointer"
                  >
                    <option value="field_employee">Field Employee</option>
                    <option value="dealer">Dealer Partner / Franchise</option>
                    <option value="inventory_manager">Inventory Manager (Store & Stock Only)</option>
                    <option value="admin">Administrator</option>
                    {(currentRole === 'super_admin' || originalUser?.role === 'super_admin' || editingEmployee.role === 'super_admin') && (
                      <option value="super_admin">Super Admin (System Managing Director)</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Official Email Address <span className="text-rose-500">*</span></label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. employee@greenenergysolution.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Designation / Post (Optional)</label>
                <input
                  type="text"
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                  placeholder="e.g. Sales Manager, Site Engineer, Technician..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">Aadhaar Card (Optional)</label>
                  <input
                    type="text"
                    maxLength={12}
                    value={editAadhaarNumber}
                    onChange={(e) => setEditAadhaarNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="12-digit Aadhaar"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">PAN Card (Optional)</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={editPanNumber}
                    onChange={(e) => setEditPanNumber(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1">Date of Joining (Optional)</label>
                <input
                  type="date"
                  value={editJoiningDate}
                  onChange={(e) => setEditJoiningDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 cursor-pointer"
                />
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1.5">
                <label className="block text-amber-900 font-bold">Account Password / Reset (Optional)</label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password (leave blank to keep current password)"
                  className="w-full border border-amber-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 font-mono text-xs"
                />
                <p className="text-[10px] text-amber-700 font-medium">Leave this blank if you do not wish to change or reset the user's password.</p>
              </div>

              <div>
                <label className="block text-slate-600 mb-1.5">Login Access Status</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditIsActive(true)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      editIsActive
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Active (Allowed)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditIsActive(false)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      !editIsActive
                        ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    <span>Blocked (Denied)</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold cursor-pointer transition-all shadow-md flex items-center gap-1.5"
                >
                  {isUpdating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 max-h-[92vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900">Add New Employee</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddEmployee} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-500 mb-1">Full Name <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ramesh Patel"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Phone Number <span className="text-rose-500">*</span></label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Company Role <span className="text-rose-500">*</span></label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="field_employee">Field Employee</option>
                  <option value="dealer">Dealer Partner / Franchise</option>
                  <option value="inventory_manager">Inventory Manager (Store & Stock Only)</option>
                  <option value="admin">Administrator</option>
                  {(currentRole === 'super_admin' || originalUser?.role === 'super_admin') && (
                    <option value="super_admin">Super Admin (System Managing Director)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Designation / Post (Optional)</label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Accountant, Sales Manager, Installer..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Official Email Address <span className="text-rose-500">*</span></label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. employee@greenenergysolution.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Initial Account Password (Optional)</label>
                <input
                  type="text"
                  value={initialPassword}
                  onChange={(e) => setInitialPassword(e.target.value)}
                  placeholder="e.g. Pass@1234 (Leave blank if user will activate password)"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Aadhaar Card (Optional)</label>
                  <input
                    type="text"
                    maxLength={12}
                    value={aadhaarNumber}
                    onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="12-digit number"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">PAN Card (Optional)</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Date of Joining (Optional)</label>
                <input
                  type="date"
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
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
                  Add Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
