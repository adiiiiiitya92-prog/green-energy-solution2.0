import React, { useEffect, useState } from 'react';
import { leadService } from '../../services/leadService';
import { quotationService, getCleanWhatsAppPhone } from '../../services/quotationService';
import type { Lead } from '../../types';
import {
  Bell,
  Calendar,
  Clock,
  Phone,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  ChevronRight,
  RefreshCw,
  Search,
  X,
  CalendarCheck,
  Trash2
} from 'lucide-react';
import dayjs from 'dayjs';

export interface FollowUpItem {
  id: string;
  leadId: string;
  clientName: string;
  clientMobile: string;
  clientEmail?: string;
  city?: string;
  requirement?: string;
  status: string;
  followUpDate: string; // YYYY-MM-DD
  followUpSetAt?: string; // ISO string
  followUpSetBy?: string;
  notes?: string;
  completed?: boolean;
  quotationNumber?: string;
  systemCapacity?: string;
  grandTotal?: number;
  subsidyAmount?: string;
  assignedSalesPersonId?: string;
  assignedAdminId?: string;
  sourceType: 'quotation' | 'lead';
}

export const FollowUpReminders: React.FC<{
  onSelectLead?: (leadId: string) => void;
  compact?: boolean;
}> = ({ onSelectLead }) => {
  const [reminders, setReminders] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'today' | 'overdue' | 'upcoming' | 'completed'>('today');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Reschedule Modal State
  const [selectedItemForReschedule, setSelectedItemForReschedule] = useState<FollowUpItem | null>(null);
  const [newDate, setNewDate] = useState(dayjs().add(3, 'day').format('YYYY-MM-DD'));
  const [newNotes, setNewNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchFollowUps = async () => {
    setLoading(true);
    try {
      const [leads, quotations] = await Promise.all([
        leadService.getLeads(),
        quotationService.getQuotations()
      ]);

      const leadMap = new Map<string, Lead>();
      leads.forEach(l => leadMap.set(l.id, l));

      // Group by leadId / clientMobile to keep ONLY 1 latest follow-up card per client
      const latestItemPerClientMap = new Map<string, FollowUpItem>();

      // 1. Process Quotations (sorted newest first)
      const sortedQuotations = [...quotations].sort((a, b) => 
        dayjs(b.createdAt || b.proposalDate).valueOf() - dayjs(a.createdAt || a.proposalDate).valueOf()
      );

      sortedQuotations.forEach(q => {
        const lead = leadMap.get(q.leadId);
        const fDate = q.followUpDate ? dayjs(q.followUpDate).format('YYYY-MM-DD') : '';
        const cleanPhone = (q.consumerMobile || lead?.phoneNumber || '').replace(/\D/g, '');
        const clientKey = q.leadId || cleanPhone || q.id;

        if (fDate && !latestItemPerClientMap.has(clientKey)) {
          latestItemPerClientMap.set(clientKey, {
            id: `q_${q.id}`,
            leadId: q.leadId,
            clientName: q.consumerName || lead?.name || 'Valued Customer',
            clientMobile: q.consumerMobile || lead?.phoneNumber || '',
            clientEmail: q.consumerEmail || lead?.email,
            city: q.city || (lead?.description ? lead.description.split(',')[0] : 'Nagpur'),
            requirement: `${q.systemCapacity || '5.0'} kW Solar System`,
            status: lead?.status || 'quotation_sent',
            followUpDate: fDate,
            followUpSetAt: q.followUpSetAt || q.createdAt,
            followUpSetBy: q.createdBy || q.preparedBy || 'Admin',
            notes: q.followUpNotes || `Quotation ${q.quotationNumber} issued. Follow up for order finalization.`,
            completed: q.followUpCompleted || false,
            quotationNumber: q.quotationNumber,
            systemCapacity: q.systemCapacity,
            grandTotal: q.grandTotal,
            subsidyAmount: q.subsidyAmount,
            assignedSalesPersonId: lead?.assignedSalesPersonId,
            assignedAdminId: lead?.assignedAdminId,
            sourceType: 'quotation'
          });
        }
      });

      // 2. Process Leads without quotation follow-up
      leads.forEach(lead => {
        const fDate = lead.nextFollowUpDate ? dayjs(lead.nextFollowUpDate).format('YYYY-MM-DD') : '';
        const cleanPhone = (lead.phoneNumber || '').replace(/\D/g, '');
        const clientKey = lead.id || cleanPhone;

        if (fDate && !latestItemPerClientMap.has(clientKey)) {
          latestItemPerClientMap.set(clientKey, {
            id: `l_${lead.id}`,
            leadId: lead.id,
            clientName: lead.name,
            clientMobile: lead.phoneNumber,
            clientEmail: lead.email,
            city: lead.description ? lead.description.split(',')[0] : 'Nagpur',
            requirement: lead.requirement || 'Solar Power System',
            status: lead.status,
            followUpDate: fDate,
            followUpSetAt: lead.followUpSetAt || lead.createdAt,
            followUpSetBy: lead.followUpSetBy || lead.createdBy || 'Admin',
            notes: lead.followUpNotes || 'Scheduled lead follow-up call.',
            completed: lead.followUpCompleted || false,
            assignedSalesPersonId: lead.assignedSalesPersonId,
            assignedAdminId: lead.assignedAdminId,
            sourceType: 'lead'
          });
        }
      });

      const items = Array.from(latestItemPerClientMap.values());
      // Sort by followUpDate ascending
      items.sort((a, b) => dayjs(a.followUpDate).valueOf() - dayjs(b.followUpDate).valueOf());
      setReminders(items);
    } catch (err) {
      console.error('Error loading follow up reminders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowUps();
  }, []);

  const todayStr = dayjs().format('YYYY-MM-DD');

  // Filter categories
  const todayReminders = reminders.filter(r => !r.completed && r.followUpDate === todayStr);
  const overdueReminders = reminders.filter(r => !r.completed && r.followUpDate < todayStr);
  const upcomingReminders = reminders.filter(r => !r.completed && r.followUpDate > todayStr);
  const completedReminders = reminders.filter(r => r.completed);

  // Active view list
  let currentList = todayReminders;
  if (activeTab === 'overdue') currentList = overdueReminders;
  if (activeTab === 'upcoming') currentList = upcomingReminders;
  if (activeTab === 'completed') currentList = completedReminders;

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    currentList = currentList.filter(
      r =>
        r.clientName.toLowerCase().includes(q) ||
        r.clientMobile.includes(q) ||
        r.city?.toLowerCase().includes(q) ||
        r.quotationNumber?.toLowerCase().includes(q)
    );
  }

  // Handle Mark Completed
  const handleMarkCompleted = async (item: FollowUpItem) => {
    try {
      if (item.sourceType === 'quotation') {
        const qId = item.id.replace('q_', '');
        const q = await quotationService.getQuotationById(qId);
        if (q) {
          q.followUpCompleted = true;
          await quotationService.createQuotation(q);
        }
      } else {
        const lead = await leadService.getLeadById(item.leadId);
        if (lead) {
          lead.followUpCompleted = true;
          await leadService.updateLead(lead);
        }
      }
      setReminders(prev => prev.map(r => r.id === item.id ? { ...r, completed: true } : r));
    } catch (err) {
      console.error('Error marking completed:', err);
    }
  };

  // Handle Delete Reminder
  const handleDeleteReminder = async (item: FollowUpItem) => {
    const confirmed = window.confirm(`Are you sure you want to delete the follow-up reminder for "${item.clientName}"?\n\nThis will remove the follow-up schedule for this client.`);
    if (!confirmed) return;

    try {
      if (item.sourceType === 'quotation') {
        const qId = item.id.replace('q_', '');
        const q = await quotationService.getQuotationById(qId);
        if (q) {
          q.followUpDate = '';
          q.followUpNotes = '';
          await quotationService.createQuotation(q);
        }
      }

      const lead = await leadService.getLeadById(item.leadId);
      if (lead) {
        lead.nextFollowUpDate = '';
        lead.followUpNotes = '';
        await leadService.updateLead(lead);
      }

      setReminders(prev => prev.filter(r => r.id !== item.id));
    } catch (err) {
      console.error('Error deleting follow-up reminder:', err);
      alert('Error deleting follow-up reminder.');
    }
  };

  // Handle Reschedule submit
  const handleSaveReschedule = async () => {
    if (!selectedItemForReschedule || !newDate) return;
    setIsSubmitting(true);
    try {
      const item = selectedItemForReschedule;
      const setAtNow = new Date().toISOString();

      if (item.sourceType === 'quotation') {
        const qId = item.id.replace('q_', '');
        const q = await quotationService.getQuotationById(qId);
        if (q) {
          q.followUpDate = newDate;
          q.followUpNotes = newNotes || q.followUpNotes;
          q.followUpSetAt = setAtNow;
          q.followUpCompleted = false;
          await quotationService.createQuotation(q);
        }
      }

      const lead = await leadService.getLeadById(item.leadId);
      if (lead) {
        lead.nextFollowUpDate = newDate;
        lead.followUpNotes = newNotes || lead.followUpNotes;
        lead.followUpSetAt = setAtNow;
        lead.followUpCompleted = false;
        await leadService.updateLead(lead);
      }

      setSelectedItemForReschedule(null);
      await fetchFollowUps();
    } catch (err) {
      console.error('Error rescheduling follow-up:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openWhatsAppChat = (item: FollowUpItem) => {
    const rawPhone = item.clientMobile;
    const cleanPhone = getCleanWhatsAppPhone(rawPhone);
    const msg = `Hello ${item.clientName}, following up regarding your Solar Power Installation proposal (${item.quotationNumber || 'Green Energy Solution'}). Please let us know a suitable time to discuss. Thank you!`;
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-4">
      {/* TODAY DUE REMINDER HERO BANNER */}
      {todayReminders.length > 0 && (
        <div className="bg-amber-500 text-white rounded-2xl p-4 shadow-lg border border-amber-400 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
              <Bell className="w-6 h-6 text-white animate-bounce" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight flex items-center gap-2">
                <span>🔔 {todayReminders.length} Client Follow-up{todayReminders.length > 1 ? 's' : ''} Scheduled For Today!</span>
                <span className="text-[10px] bg-white text-amber-900 font-extrabold px-2 py-0.5 rounded-full uppercase">
                  {dayjs().format('DD MMM YYYY')}
                </span>
              </h3>
              <p className="text-amber-100 text-xs font-medium mt-0.5">
                Don't miss these scheduled client calls to move prospects forward in the solar sales pipeline.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className="bg-white hover:bg-amber-50 text-amber-950 font-black text-xs px-4 py-2 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5 shrink-0 select-none"
          >
            <span>View Today's List ({todayReminders.length})</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION CONTAINER CARD */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-4 space-y-4">
        {/* Top Header & Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100/70 text-emerald-800 rounded-xl">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>Client Follow-up Reminders</span>
                <span className="text-[11px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md border border-slate-200">
                  {reminders.length} Total
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Track scheduled callback dates, see when follow-ups were set, and contact clients via WhatsApp or Phone call.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchFollowUps}
            className="self-start sm:self-auto p-2 text-slate-500 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 rounded-xl border border-slate-200 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Refresh Reminders List"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* CATEGORY TAB PILLS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center gap-2 ${
              activeTab === 'today'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Today's Due</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              activeTab === 'today' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {todayReminders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('overdue')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center gap-2 ${
              activeTab === 'overdue'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Overdue</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              activeTab === 'overdue' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
            }`}>
              {overdueReminders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upcoming')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center gap-2 ${
              activeTab === 'upcoming'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Upcoming</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              activeTab === 'upcoming' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
            }`}>
              {upcomingReminders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center gap-2 ${
              activeTab === 'completed'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Completed</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              activeTab === 'completed' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {completedReminders.length}
            </span>
          </button>

          {/* Search bar */}
          <div className="ml-auto relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client name, mobile, city..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all"
            />
          </div>
        </div>

        {/* LIST OF REMINDER CARDS */}
        {loading ? (
          <div className="py-12 text-center space-y-2">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-slate-400 font-medium animate-pulse">Loading Client Follow-up Reminders...</p>
          </div>
        ) : currentList.length === 0 ? (
          <div className="py-12 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl space-y-2">
            <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">No {activeTab} follow-up reminders found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {activeTab === 'today'
                ? "Awesome! No follow-up calls are due for today."
                : `No client follow-up reminders in the "${activeTab}" category.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {currentList.map(item => {
              const isToday = item.followUpDate === todayStr;
              const isOverdue = !item.completed && item.followUpDate < todayStr;
              const daysDiff = dayjs(item.followUpDate).diff(dayjs(todayStr), 'day');

              let badgeText = '';
              let badgeColor = '';

              if (item.completed) {
                badgeText = '✅ Completed';
                badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
              } else if (isToday) {
                badgeText = '🔔 DUE TODAY';
                badgeColor = 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold animate-pulse';
              } else if (isOverdue) {
                const overDays = Math.abs(daysDiff);
                badgeText = `🚨 OVERDUE BY ${overDays} DAY${overDays > 1 ? 'S' : ''}`;
                badgeColor = 'bg-rose-100 text-rose-900 border-rose-300 font-extrabold';
              } else {
                badgeText = `📅 In ${daysDiff} Day${daysDiff > 1 ? 's' : ''} (${dayjs(item.followUpDate).format('DD MMM')})`;
                badgeColor = 'bg-blue-50 text-blue-800 border-blue-200';
              }

              return (
                <div
                  key={item.id}
                  className={`bg-white border rounded-2xl p-4 space-y-3 shadow-2xs hover:shadow-md transition-all relative ${
                    isOverdue ? 'border-rose-200 bg-rose-50/20' : isToday ? 'border-amber-300 bg-amber-50/20 ring-1 ring-amber-200' : 'border-slate-200'
                  }`}
                >
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeColor}`}>
                          {badgeText}
                        </span>
                        {item.quotationNumber && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md border border-slate-200">
                            {item.quotationNumber}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-black text-slate-900 mt-1 flex items-center gap-1.5">
                        <span>{item.clientName}</span>
                        {onSelectLead && (
                          <button
                            type="button"
                            onClick={() => onSelectLead(item.leadId)}
                            className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline font-bold cursor-pointer inline-flex items-center"
                            title="View Lead Pipeline"
                          >
                            <span>(View Details)</span>
                          </button>
                        )}
                      </h3>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={`tel:${item.clientMobile}`}
                        className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 cursor-pointer transition-colors"
                        title={`Call ${item.clientName} (${item.clientMobile})`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => openWhatsAppChat(item)}
                        className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-2xs cursor-pointer transition-colors"
                        title="Chat on WhatsApp"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteReminder(item)}
                        className="p-2 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white rounded-xl border border-rose-200 hover:border-rose-600 cursor-pointer transition-colors"
                        title="Delete Follow-up Reminder"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Info details */}
                  <div className="space-y-1.5 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-xs text-slate-700">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1 font-semibold text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.city || 'Nagpur'} • {item.requirement || 'Solar Rooftop'}</span>
                      </span>
                      <span className="font-bold text-slate-900">
                        📱 {item.clientMobile}
                      </span>
                    </div>

                    {item.grandTotal !== undefined && (
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60 font-semibold">
                        <span className="text-slate-600">Proposal Amount:</span>
                        <span className="font-extrabold text-emerald-700">
                          ₹{item.grandTotal.toLocaleString('en-IN')} {item.subsidyAmount ? `(Subsidy ₹${Number(item.subsidyAmount).toLocaleString('en-IN')})` : ''}
                        </span>
                      </div>
                    )}

                    {/* When Follow up was set */}
                    <div className="pt-1 border-t border-slate-200/60 text-[10.5px] text-slate-500 flex items-center justify-between">
                      <span>
                        🕒 <strong>Set on:</strong> {dayjs(item.followUpSetAt).format('DD MMM YYYY, hh:mm A')}
                      </span>
                      <span>By <strong>{item.followUpSetBy}</strong></span>
                    </div>
                  </div>

                  {/* Notes / Comment */}
                  {item.notes && (
                    <p className="text-xs text-slate-600 bg-amber-50/60 border border-amber-100 p-2 rounded-xl italic">
                      💬 "{item.notes}"
                    </p>
                  )}

                  {/* Card Bottom Controls */}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedItemForReschedule(item);
                        setNewDate(item.followUpDate || dayjs().add(3, 'day').format('YYYY-MM-DD'));
                        setNewNotes(item.notes || '');
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Reschedule Date</span>
                    </button>

                    {!item.completed ? (
                      <button
                        type="button"
                        onClick={() => handleMarkCompleted(item)}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold text-[11px] rounded-lg border border-emerald-200 cursor-pointer transition-colors flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Mark Followed Up</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Done</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RESCHEDULE MODAL */}
      {selectedItemForReschedule && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4 border border-slate-200">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Reschedule Follow-up Date</span>
              </h3>
              <button
                type="button"
                onClick={() => setSelectedItemForReschedule(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <p className="font-extrabold text-slate-900">{selectedItemForReschedule.clientName}</p>
                <p className="text-slate-500">{selectedItemForReschedule.clientMobile} • {selectedItemForReschedule.city}</p>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">New Follow-up Date:</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white font-extrabold text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Updated Notes / Remarks:</label>
                <textarea
                  rows={3}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. Customer requested callback after loan approval..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedItemForReschedule(null)}
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReschedule}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer transition-all flex items-center gap-1.5"
              >
                {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>Save New Date</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
