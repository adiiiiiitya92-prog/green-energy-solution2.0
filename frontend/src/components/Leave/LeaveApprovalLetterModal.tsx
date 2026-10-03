import React, { useRef } from 'react';
import type { LeaveRequest } from '../../types';
import logoImg from '../../assets/Green-Energy-Solution.png';
import stampImg from '../../assets/stamp.png';
import { Printer, X, Download, CheckCircle2, ShieldCheck, Calendar, User, FileText } from 'lucide-react';

interface LeaveApprovalLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaveRequest: LeaveRequest | null;
}

export const LeaveApprovalLetterModal: React.FC<LeaveApprovalLetterModalProps> = ({
  isOpen,
  onClose,
  leaveRequest
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !leaveRequest) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const formatLeaveType = (type: string) => {
    switch (type) {
      case 'casual': return 'Casual Leave (CL)';
      case 'sick': return 'Sick / Medical Leave (SL)';
      case 'earned': return 'Earned / Privilege Leave (PL)';
      case 'emergency': return 'Emergency Leave';
      case 'maternity_paternity': return 'Maternity / Paternity Leave';
      case 'compensatory': return 'Compensatory Off (Comp-Off)';
      default: return 'Special Leave';
    }
  };

  const getResumptionDate = (endDateStr: string) => {
    try {
      const d = new Date(endDateStr);
      d.setDate(d.getDate() + 1);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return 'Next Business Day';
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white print:static">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:w-full">
        {/* Modal Top Bar - hidden during print */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-emerald-800 to-slate-900 text-white select-none print:hidden shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-emerald-500/20 rounded-lg border border-emerald-400/30">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Official Leave Approval Sanction Letter</h3>
              <p className="text-[10px] text-emerald-200/80">Ref: {leaveRequest.approvalReferenceNumber || leaveRequest.leaveNumber}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              type="button"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
              title="Print or Save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Document Container */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 text-slate-800 print:p-0 print:overflow-visible">
          <div
            ref={printAreaRef}
            id="official-leave-approval-letter"
            className="bg-white mx-auto space-y-6 text-sm leading-relaxed border border-slate-200/80 rounded-xl p-8 sm:p-12 shadow-sm print:border-none print:shadow-none print:p-4 print:space-y-4"
          >
            {/* Corporate Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b-2 border-emerald-700/80 gap-4">
              <div className="flex items-center space-x-3.5">
                <img
                  src={logoImg}
                  alt="Green Energy Solution"
                  className="h-14 sm:h-16 w-auto object-contain"
                />
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                    GREEN ENERGY SOLUTION
                  </h1>
                  <p className="text-[11px] font-semibold text-emerald-700 tracking-wide mt-1">
                    Solar EPC, Rooftop Installations & Clean Energy Solutions
                  </p>
                  <p className="text-[9.5px] text-slate-500 mt-0.5">
                    Corporate ID: GES/CORP/HRMS/2026 • ISO 9001:2015 Certified
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right text-[10px] text-slate-500 space-y-0.5 sm:border-l sm:border-slate-200 sm:pl-4">
                <p className="font-bold text-slate-800">Corporate Head Office</p>
                <p>Solar Commercial Complex, Sector 12</p>
                <p>Maharashtra, India - 400705</p>
                <p>CIN: U40106MH2021PTC368942</p>
                <p className="text-emerald-700 font-medium">hr@greenenergysolution.co.in</p>
              </div>
            </div>

            {/* Reference & Date metadata bar */}
            <div className="flex flex-wrap justify-between items-center text-xs bg-slate-50 px-4 py-2.5 rounded-lg border border-slate-200/60 font-mono text-slate-700">
              <div>
                <span className="text-slate-400 font-sans text-[11px]">Letter Ref No: </span>
                <span className="font-bold text-emerald-800">
                  {leaveRequest.approvalReferenceNumber || `GES/HR/LA-2026-${leaveRequest.id.substring(3, 7).toUpperCase()}`}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-sans text-[11px]">Issue Date: </span>
                <span className="font-bold">
                  {formatDate(leaveRequest.approvalLetterGeneratedAt || leaveRequest.reviewedAt || new Date().toISOString())}
                </span>
              </div>
            </div>

            {/* Recipient Details */}
            <div className="space-y-1 text-xs">
              <p className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider">To,</p>
              <h2 className="text-base font-extrabold text-slate-900">{leaveRequest.employeeName}</h2>
              <div className="text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11.5px] pt-1">
                <p><strong className="text-slate-700">Designation:</strong> {leaveRequest.designation || 'Solar Operations Executive'}</p>
                <p><strong className="text-slate-700">Role / Department:</strong> {(leaveRequest.employeeRole || 'employee').replace(/_/g, ' ').toUpperCase()}</p>
                <p><strong className="text-slate-700">Employee ID:</strong> {leaveRequest.employeeId}</p>
                <p><strong className="text-slate-700">Contact:</strong> {leaveRequest.employeePhone}</p>
              </div>
            </div>

            {/* Subject Line */}
            <div className="bg-emerald-50/70 border-l-4 border-emerald-600 p-3 rounded-r-lg text-emerald-950 font-bold text-xs uppercase tracking-wide">
              Subject: FORMAL APPROVAL & SANCTION OF LEAVE APPLICATION
            </div>

            {/* Body Text */}
            <div className="text-xs sm:text-[13px] text-slate-700 space-y-3 leading-relaxed">
              <p>Dear <strong>{leaveRequest.employeeName}</strong>,</p>
              <p>
                With reference to your formal leave application (Application ID: <strong>{leaveRequest.leaveNumber}</strong>) submitted on <strong>{formatDate(leaveRequest.appliedAt)}</strong>, we are pleased to inform you that your request for leave has been officially reviewed and <strong className="text-emerald-700">APPROVED</strong> by the Management / Super Admin of Green Energy Solution.
              </p>

              {/* Sanction Details Summary Table */}
              <div className="my-4 border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-slate-100 px-3.5 py-2 font-bold text-[11px] text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Sanctioned Leave Details</span>
                </div>
                <div className="divide-y divide-slate-200/70 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 p-2.5 bg-white">
                    <span className="text-slate-500 font-medium">Leave Category:</span>
                    <span className="font-bold text-slate-800">{formatLeaveType(leaveRequest.leaveType)}</span>
                    <span className="text-slate-500 font-medium">Duration Type:</span>
                    <span className="font-bold text-slate-800">
                      {leaveRequest.durationType === 'full_day' ? 'Full Day' : leaveRequest.durationType === 'first_half' ? 'First Half (0.5 Day)' : 'Second Half (0.5 Day)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 p-2.5 bg-slate-50/50">
                    <span className="text-slate-500 font-medium">Commencing Date:</span>
                    <span className="font-bold text-emerald-700">{formatDate(leaveRequest.startDate)}</span>
                    <span className="text-slate-500 font-medium">Concluding Date:</span>
                    <span className="font-bold text-emerald-700">{formatDate(leaveRequest.endDate)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 p-2.5 bg-white">
                    <span className="text-slate-500 font-medium">Total Sanctioned:</span>
                    <span className="font-black text-emerald-800 text-sm">{leaveRequest.totalDays} Day(s)</span>
                    <span className="text-slate-500 font-medium">Reporting / Resume Date:</span>
                    <span className="font-bold text-slate-900">{getResumptionDate(leaveRequest.endDate)}</span>
                  </div>
                </div>
              </div>

              {/* Stated Reason & Remarks */}
              <div className="space-y-2 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200/60">
                <p>
                  <strong className="text-slate-800">Purpose / Reason on Record:</strong>{' '}
                  <span className="italic text-slate-700">{leaveRequest.reason}</span>
                </p>
                {leaveRequest.approvalRemarks && (
                  <p>
                    <strong className="text-emerald-800">Management Sanction Remarks:</strong>{' '}
                    <span className="text-slate-700">{leaveRequest.approvalRemarks}</span>
                  </p>
                )}
                {leaveRequest.handoverNotes && (
                  <p>
                    <strong className="text-slate-800">Work Handover / Backup:</strong>{' '}
                    <span className="text-slate-700">{leaveRequest.handoverNotes}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-600 pt-1">
                <p className="font-semibold text-slate-700">Official Terms & Guidelines:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>You are advised to resume your official duties on the scheduled resumption date mentioned above.</li>
                  <li>In case of an unforeseen emergency requiring leave extension, prior written intimation to Super Admin / HR is mandatory.</li>
                  <li>Emergency contact during leave is recorded as: <strong>{leaveRequest.contactNumberDuringLeave || leaveRequest.employeePhone}</strong>.</li>
                </ul>
              </div>

              <p className="pt-2">We wish you a pleasant and restful leave period.</p>
            </div>

            {/* Corporate Signatures & Official Stamp */}
            <div className="pt-8 border-t border-slate-200 flex justify-between items-end">
              <div className="space-y-2">
                <div className="inline-block p-2 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <p className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">Digital Verification</p>
                  <p className="text-[10px] font-black text-emerald-700 font-mono">
                    GES-SEC-AUTH#{leaveRequest.id.substring(3, 10).toUpperCase()}
                  </p>
                  <p className="text-[8px] text-slate-400">Green Energy Solution HRMS Cloud</p>
                </div>
              </div>

              <div className="text-right flex flex-col items-end relative">
                {/* Stamp & Seal */}
                <div className="relative mb-2">
                  <img
                    src={stampImg}
                    alt="Official Company Seal"
                    className="h-20 w-auto object-contain opacity-85 pointer-events-none"
                  />
                </div>
                <div className="border-t border-slate-400 pt-1 min-w-[200px] text-center">
                  <p className="text-xs font-black text-slate-900 uppercase">
                    {leaveRequest.reviewedByUserName || 'Super Admin / Management'}
                  </p>
                  <p className="text-[10px] font-semibold text-emerald-800">Authorized Signatory</p>
                  <p className="text-[9px] text-slate-500">Green Energy Solution Corporate HQ</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 select-none print:hidden shrink-0">
          <span>Official Document generated via GES-HRMS</span>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Letter</span>
            </button>
            <button
              onClick={onClose}
              type="button"
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold px-4 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
