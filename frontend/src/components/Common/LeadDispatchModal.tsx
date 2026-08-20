import React from 'react';
import type { Lead, Challan, Quotation } from '../../types';
import type { LeadDispatchSummary } from '../../services/dispatchHelper';
import { pdfService } from '../../services/pdfService';
import {
  X,
  Truck,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Share2,
  Plus,
  Phone,
  User,
  Package,
  Layers,
  Zap,
  Sun,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import dayjs from 'dayjs';

interface LeadDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
  summary: LeadDispatchSummary;
  quotation?: Quotation | null;
  onCreateChallanClick?: (lead: Lead) => void;
}

export const LeadDispatchModal: React.FC<LeadDispatchModalProps> = ({
  isOpen,
  onClose,
  lead,
  summary,
  quotation,
  onCreateChallanClick
}) => {
  if (!isOpen) return null;

  const handleDownloadPDF = async (ch: Challan) => {
    try {
      const blob = await pdfService.generateChallanPDF(ch);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Delivery_Challan_${ch.challanNumber}_${lead.name.replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error generating Challan PDF.');
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
            title: `Delivery Challan ${ch.challanNumber}`,
            text: `Delivery Challan for ${lead.name} (Vehicle: ${ch.vehicleNumber}).`
          });
          return;
        } catch (shareErr) {
          console.log('Web share cancelled, falling back to download + link.', shareErr);
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Challan_${ch.challanNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      const msg = `*GREEN ENERGY SOLUTION - DELIVERY CHALLAN DISPATCH*\n\n` +
        `Challan No: ${ch.challanNumber}\n` +
        `Customer: ${lead.name}\n` +
        `Phone: ${lead.phoneNumber}\n` +
        `Vehicle No: ${ch.vehicleNumber}\n` +
        `Driver: ${ch.driverName} (${ch.driverPhone})\n` +
        `Dispatched Date: ${dayjs(ch.createdAt).format('DD MMM YYYY, hh:mm A')}\n` +
        `------------------------------------\n` +
        ch.items.map(item => `• ${item.productName} (x${item.qty} ${item.unit || 'Nos'})`).join('\n') +
        `\n------------------------------------\n` +
        `_Official Challan generated successfully._`;

      const encodedMsg = encodeURIComponent(msg);
      window.open(`https://wa.me/91${lead.phoneNumber}?text=${encodedMsg}`, '_blank');
    } catch (err) {
      console.error(err);
      alert('Error sharing to WhatsApp.');
    }
  };

  const challans = summary.challans || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl my-auto max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-5 sm:p-6 flex justify-between items-start shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="p-2 bg-emerald-500/20 border border-emerald-400/30 rounded-xl text-emerald-400">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight">{lead.name}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-300 font-semibold flex-wrap">
                  <span>📞 +91 {lead.phoneNumber}</span>
                  {lead.requirement && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-400 font-bold">⚡ {lead.requirement}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Status & Category Progress Overview */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Dispatch Completion Status</span>
                <div className="flex items-center gap-2 mt-0.5">
                  {summary.isOverallDispatched ? (
                    <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5 shadow-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                      <span>OVERALL DISPATCHED</span>
                    </span>
                  ) : challans.length > 0 ? (
                    <span className="px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-black flex items-center gap-1.5 shadow-xs">
                      <Clock className="w-4 h-4 text-amber-100" />
                      <span>PARTIALLY DISPATCHED ({challans.length} Challan{challans.length === 1 ? '' : 's'})</span>
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-black flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-slate-500" />
                      <span>PENDING DISPATCH</span>
                    </span>
                  )}
                  {summary.overallFormattedDate && (
                    <span className="text-slate-500 font-semibold text-[11px]">
                      Latest: {summary.overallFormattedDate}
                    </span>
                  )}
                </div>
              </div>

              {onCreateChallanClick && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onCreateChallanClick(lead);
                  }}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Delivery Challan</span>
                </button>
              )}
            </div>

            {/* 4 Category Badges Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {/* 1. Structure */}
              <div className={`p-3 rounded-xl border transition-all ${
                summary.hasStructure 
                  ? 'bg-amber-50/80 border-amber-200 text-amber-950' 
                  : 'bg-white border-slate-200 text-slate-400'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1 font-extrabold text-[11px]">
                    <Layers className={`w-3.5 h-3.5 ${summary.hasStructure ? 'text-amber-600' : 'text-slate-400'}`} />
                    <span>Structure</span>
                  </div>
                  {summary.hasStructure ? (
                    <span className="text-[9px] font-black uppercase bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded">
                      ✓ Done
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-400">Pending</span>
                  )}
                </div>
                <div className="text-[10px] font-semibold">
                  {summary.hasStructure ? (
                    <>
                      <div className="text-amber-800 font-bold">📅 {summary.structureFormattedDate}</div>
                      <div className="text-amber-700/80 text-[9.5px] mt-0.5">
                        {summary.structureItems.reduce((s, i) => s + i.qty, 0)} items dispatched
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400 italic">Not dispatched yet</span>
                  )}
                </div>
              </div>

              {/* 2. Inverter */}
              <div className={`p-3 rounded-xl border transition-all ${
                summary.hasInverter 
                  ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950' 
                  : 'bg-white border-slate-200 text-slate-400'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1 font-extrabold text-[11px]">
                    <Zap className={`w-3.5 h-3.5 ${summary.hasInverter ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span>Inverter</span>
                  </div>
                  {summary.hasInverter ? (
                    <span className="text-[9px] font-black uppercase bg-indigo-200/80 text-indigo-900 px-1.5 py-0.5 rounded">
                      ✓ Done
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-400">Pending</span>
                  )}
                </div>
                <div className="text-[10px] font-semibold">
                  {summary.hasInverter ? (
                    <>
                      <div className="text-indigo-800 font-bold">📅 {summary.inverterFormattedDate}</div>
                      <div className="text-indigo-700/80 text-[9.5px] mt-0.5">
                        {summary.inverterItems.reduce((s, i) => s + i.qty, 0)} unit(s) dispatched
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400 italic">Not dispatched yet</span>
                  )}
                </div>
              </div>

              {/* 3. Solar Panels / System */}
              <div className={`p-3 rounded-xl border transition-all ${
                summary.hasSystem 
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' 
                  : 'bg-white border-slate-200 text-slate-400'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1 font-extrabold text-[11px]">
                    <Sun className={`w-3.5 h-3.5 ${summary.hasSystem ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span>Solar Panels</span>
                  </div>
                  {summary.hasSystem ? (
                    <span className="text-[9px] font-black uppercase bg-emerald-200/80 text-emerald-900 px-1.5 py-0.5 rounded">
                      ✓ Done
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-400">Pending</span>
                  )}
                </div>
                <div className="text-[10px] font-semibold">
                  {summary.hasSystem ? (
                    <>
                      <div className="text-emerald-800 font-bold">📅 {summary.systemFormattedDate}</div>
                      <div className="text-emerald-700/80 text-[9.5px] mt-0.5">
                        {summary.systemItems.reduce((s, i) => s + i.qty, 0)} panels dispatched
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400 italic">Not dispatched yet</span>
                  )}
                </div>
              </div>

              {/* 4. Protection & BOS */}
              <div className={`p-3 rounded-xl border transition-all ${
                summary.hasBos 
                  ? 'bg-slate-100/90 border-slate-300 text-slate-900' 
                  : 'bg-white border-slate-200 text-slate-400'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1 font-extrabold text-[11px]">
                    <ShieldCheck className={`w-3.5 h-3.5 ${summary.hasBos ? 'text-slate-700' : 'text-slate-400'}`} />
                    <span>BOS & Cabling</span>
                  </div>
                  {summary.hasBos ? (
                    <span className="text-[9px] font-black uppercase bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded">
                      ✓ Done
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-400">Pending</span>
                  )}
                </div>
                <div className="text-[10px] font-semibold">
                  {summary.hasBos ? (
                    <>
                      <div className="text-slate-800 font-bold">📅 {summary.bosFormattedDate}</div>
                      <div className="text-slate-600 text-[9.5px] mt-0.5">
                        {summary.bosItems.reduce((s, i) => s + i.qty, 0)} items dispatched
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400 italic">Not dispatched yet</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Date-wise Dispatched Delivery Challans Timeline */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>Date-wise Dispatch History ({challans.length} Challan{challans.length === 1 ? '' : 's'})</span>
              </h4>
            </div>

            {challans.length === 0 ? (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-8 text-center rounded-2xl space-y-3">
                <Truck className="w-10 h-10 text-slate-300 mx-auto" />
                <div>
                  <h5 className="font-extrabold text-slate-700 text-sm">No Delivery Challans Generated Yet</h5>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    When you generate a Delivery Challan for this customer, the date-wise dispatch logs, vehicle, and dispatched component lists will appear here.
                  </p>
                </div>
                {onCreateChallanClick && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onCreateChallanClick(lead);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs inline-flex items-center gap-2 cursor-pointer transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Delivery Challan</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {challans.map((ch, idx) => (
                  <div
                    key={ch.id || idx}
                    className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-xs hover:shadow-md transition-shadow space-y-3 relative overflow-hidden"
                  >
                    {/* Top Row: Challan Number, Date, Vehicle & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-black text-xs font-mono">
                          {ch.challanNumber}
                        </span>
                        <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                          📅 {dayjs(ch.createdAt).format('DD MMM YYYY, hh:mm A')}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                          🚚 {ch.vehicleNumber}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDownloadPDF(ch)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          title="Download Challan Slip PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF Slip</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWhatsappShare(ch)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                          title="Share Challan on WhatsApp"
                        >
                          <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>WhatsApp</span>
                        </button>
                      </div>
                    </div>

                    {/* Driver & Rep Info Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-1.5 text-slate-600 font-semibold truncate">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Driver: <strong>{ch.driverName}</strong> (📞 +91 {ch.driverPhone})</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600 font-semibold truncate">
                        <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Representative: <strong>{ch.employeeName}</strong></span>
                      </div>
                    </div>

                    {/* Dispatched Line Items Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-100/70 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                            <th className="px-3 py-1.5 rounded-l-lg">Item Name</th>
                            <th className="px-3 py-1.5 text-center">Category</th>
                            <th className="px-3 py-1.5 text-right rounded-r-lg">Dispatched Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold">
                          {ch.items.map((item, iIdx) => {
                            const nameLower = item.productName.toLowerCase();
                            const isStruct = nameLower.includes('structure') || nameLower.includes('hdgi') || nameLower.includes('ladder') || nameLower.includes('mounting') || nameLower.includes('walkway');
                            const isInv = nameLower.includes('inverter');
                            const isSys = nameLower.includes('panel') || nameLower.includes('module') || nameLower.includes('system');

                            return (
                              <tr key={iIdx} className="hover:bg-slate-50/50">
                                <td className="px-3 py-2 text-slate-800">
                                  <div>{item.productName}</div>
                                  {item.serialNumbers && item.serialNumbers.length > 0 && (
                                    <div className="text-[9.5px] font-mono text-emerald-700 font-semibold mt-0.5 flex flex-wrap gap-1">
                                      {item.serialNumbers.map(sn => (
                                        <span key={sn} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded">
                                          {sn}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {isStruct ? (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-black uppercase">
                                      Structure
                                    </span>
                                  ) : isInv ? (
                                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[9px] font-black uppercase">
                                      Inverter
                                    </span>
                                  ) : isSys ? (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase">
                                      Solar System
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[9px] font-black uppercase">
                                      BOS / Accessories
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right font-black text-slate-900">
                                  {item.qty} {item.unit || 'Nos'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {ch.notes && (
                      <p className="text-[11px] text-slate-500 italic bg-amber-50/40 p-2 rounded-lg border border-amber-100/60">
                        <strong>Dispatch Note:</strong> {ch.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex justify-between items-center shrink-0">
          <div className="text-[11px] text-slate-500 font-semibold">
            Total Dispatched Items: <strong>{summary.allItems.reduce((s, i) => s + i.qty, 0)}</strong> across <strong>{challans.length}</strong> challan(s)
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
