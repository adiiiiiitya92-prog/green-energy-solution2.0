import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { leadService } from '../../services/leadService';
import { visitService } from '../../services/visitService';
import { Award, Compass, FileText, Phone, User } from 'lucide-react';

export const ProfileView: React.FC = () => {
  const { currentUser, currentRole } = useAuthStore();
  const [assignedCount, setAssignedCount] = useState(0);
  const [visitsCount, setVisitsCount] = useState(0);

  useEffect(() => {
    if (currentUser) {
      // Load their metrics
      leadService.getLeads().then(leads => {
        const assigned = leads.filter(l => l.assignedSalesPersonId === currentUser.id || l.assignedAdminId === currentUser.id || l.assignedEmployeeId === currentUser.id);
        setAssignedCount(assigned.length);
      });

      visitService.getVisitReportsByEmployee(currentUser.id).then(visits => {
        setVisitsCount(visits.length);
      });
    }
  }, [currentUser]);

  if (!currentUser) return null;

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">My Profile</h1>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Representative Portal Identity.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
        {/* User Banner */}
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center font-black text-emerald-700 text-lg">
            {(currentUser.fullName || 'U')[0].toUpperCase()}
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">{currentUser.fullName || 'User'}</h3>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{(currentRole || 'user').replace(/_/g, ' ')}</span>
          </div>
        </div>

        {/* Contact details */}
        <div className="border-t border-b border-slate-100 py-4 space-y-2 text-xs font-semibold text-slate-600">
          <div className="flex items-center space-x-2.5">
            <Phone className="w-4 h-4 text-slate-400" />
            <span>+91 {currentUser.phone}</span>
          </div>
          <div className="flex items-center space-x-2.5">
            <User className="w-4 h-4 text-slate-400" />
            <span>ID: <span className="font-mono font-bold text-slate-700">{currentUser.id}</span></span>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
            <Compass className="w-5 h-5 text-indigo-500 mx-auto mb-1.5" />
            <span className="text-[9px] text-slate-400 font-bold uppercase block">My Leads</span>
            <span className="text-lg font-extrabold text-slate-800">{assignedCount}</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
            <FileText className="w-5 h-5 text-sky-500 mx-auto mb-1.5" />
            <span className="text-[9px] text-slate-400 font-bold uppercase block">Visits Logged</span>
            <span className="text-lg font-extrabold text-slate-800">{visitsCount}</span>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center justify-center space-x-2 bg-emerald-50 text-emerald-700 p-3.5 rounded-xl border border-emerald-100">
          <Award className="w-5 h-5" />
          <span className="text-xs font-bold">Authorized Pipeline Agent</span>
        </div>
      </div>
    </div>
  );
};
