import React, { useEffect, useState } from 'react';
import type { Profile } from '../../types';
import { employeeService } from '../../services/employeeService';
import { Plus, Search, UserCheck, UserX, User, Trash2, ShieldOff, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';

export const Employees: React.FC = () => {
  const { currentRole, impersonateUser, originalUser } = useAuthStore();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const handleImpersonateClick = async (emp: Profile) => {
    if (confirm(`Do you want to log in as "${emp.fullName}" (${emp.role.replace('_', ' ')}) without a password?`)) {
      await impersonateUser(emp);
      const targetPath = emp.role === 'field_employee' ? '/leads' : '/dashboard';
      navigate(targetPath);
    }
  };

  // Form states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'admin' | 'field_employee' | 'inventory_manager'>('field_employee');
  const [email, setEmail] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [designation, setDesignation] = useState('');

  const loadEmployees = async () => {
    const list = await employeeService.getEmployees();
    setEmployees(list);
  };

  useEffect(() => {
    loadEmployees();
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

  const [initialPassword, setInitialPassword] = useState('');

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
    emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.phone.includes(searchTerm) ||
    (emp.email && emp.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Employee Directory & Access Control</h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Manage system users, block/unblock login access, or delete employee profiles.</p>
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
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold ${
                !emp.isActive ? 'bg-rose-100 text-rose-700' : emp.role === 'admin' ? 'bg-emerald-100 text-emerald-700' : emp.role === 'inventory_manager' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
              }`}>
                {emp.fullName ? emp.fullName[0].toUpperCase() : 'U'}
              </div>
              <div className="truncate max-w-[65%]">
                <h4 className="text-sm font-bold text-slate-900 truncate">{emp.fullName}</h4>
                <div className="flex items-center gap-1 flex-wrap mt-0.5">
                  <span className="text-[9px] text-slate-500 font-extrabold uppercase bg-slate-100 px-1.5 py-0.5 rounded">{emp.role.replace('_', ' ')}</span>
                  {emp.designation && (
                    <span className="text-[8px] text-emerald-700 bg-emerald-50 border border-emerald-100/60 font-black px-1 rounded uppercase tracking-wider truncate max-w-[80px]">{emp.designation}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col space-y-1.5 text-xs text-slate-500">
              <p>📞 Phone: <span className="font-bold text-slate-700">{emp.phone}</span></p>
              {emp.email && <p>✉️ Email: <span className="font-bold text-slate-700">{emp.email}</span></p>}
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

            {/* Access Control Action Buttons (Block/Unblock & Delete) */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
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
                    <span>Block Account</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Unblock Access</span>
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

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 m-4 animate-scale-in">
            <h3 className="text-lg font-black text-slate-900 mb-4">Add Mock Employee</h3>
            <form onSubmit={handleAddEmployee} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-500 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Ramesh Patel"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Company Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="field_employee">Field Employee</option>
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
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Official Email Address (Required for Pre-Approved Sign In)</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. employee@greenenergysolution.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Initial Account Password (Optional - Or let user set via Create Account)</label>
                <input
                  type="text"
                  value={initialPassword}
                  onChange={(e) => setInitialPassword(e.target.value)}
                  placeholder="e.g. Pass@1234 (Leave blank if user will activate password)"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-mono"
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
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Date of Joining (Optional)</label>
                <input
                  type="date"
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
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
