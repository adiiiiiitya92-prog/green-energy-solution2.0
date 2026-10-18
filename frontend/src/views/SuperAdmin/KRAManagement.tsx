import React, { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { employeeService } from '../../services/employeeService';
import { kraService, DEFAULT_FIELD_KRA } from '../../services/kraService';
import type {
  Profile,
  KRATemplate,
  KRAScore,
  KRAScoreItem,
  KRAItem,
  UserRole
} from '../../types';
import {
  Target,
  Users,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Edit3,
  RefreshCw,
  Award,
  TrendingUp,
  FileText,
  X,
  Calendar,
  Printer
} from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const ROLE_OPTIONS: Array<{ value: UserRole | 'all'; label: string }> = [
  { value: 'all', label: 'All Roles (Default)' },
  { value: 'field_employee', label: 'Field Employee' },
  { value: 'installation_supervisor', label: 'Installation Supervisor' },
  { value: 'inventory_manager', label: 'Inventory Manager' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'sales_person', label: 'Sales Person' }
];

const gradeColor = (g: string) => {
  switch (g) {
    case 'A+': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    case 'A':  return 'bg-green-100 text-green-700 border-green-300';
    case 'B':  return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    case 'C':  return 'bg-orange-100 text-orange-700 border-orange-300';
    default:   return 'bg-red-100 text-red-700 border-red-300';
  }
};

export const KRAManagement: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [tab, setTab] = useState<'templates' | 'scores' | 'report'>('scores');

  const [templates, setTemplates] = useState<KRATemplate[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [scores, setScores] = useState<KRAScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [editingTpl, setEditingTpl] = useState<KRATemplate | null>(null);
  const [showTplModal, setShowTplModal] = useState(false);

  const [scoringEmp, setScoringEmp] = useState<Profile | null>(null);
  const [scoringMonth, setScoringMonth] = useState<number>(new Date().getMonth() + 1);
  const [scoringYear, setScoringYear] = useState<number>(new Date().getFullYear());
  const [sheetItems, setSheetItems] = useState<KRAScoreItem[]>([]);
  const [sheetTemplateId, setSheetTemplateId] = useState<string | undefined>(undefined);
  const [sheetRemarks, setSheetRemarks] = useState('');
  const [savingSheet, setSavingSheet] = useState(false);

  const [reportMonth, setReportMonth] = useState<number>(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());
  const [filterRole, setFilterRole] = useState<string>('all');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [tpls, emps, scs] = await Promise.all([
        kraService.getAllTemplates(),
        employeeService.getAllProfiles(),
        kraService.getAllScores()
      ]);
      setTemplates(tpls);
      setEmployees(emps.filter(e => e.isActive !== false && e.role !== 'super_admin'));
      setScores(scs);
    } catch (e) {
      console.error('KRA load error', e);
      showToast('Could not load KRA data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const handler = (e?: any) => {
      const col = e?.detail?.collectionName;
      if (col && col !== 'kraTemplates' && col !== 'kraScores' && col !== 'profiles') return;
      loadAll();
    };
    window.addEventListener('app-realtime-update', handler);
    return () => window.removeEventListener('app-realtime-update', handler);
  }, []);

  // ======================= Template handlers =======================
  const openNewTemplate = () => {
    setEditingTpl({
      id: '',
      role: 'field_employee',
      title: 'New KRA Template',
      kras: DEFAULT_FIELD_KRA.map(k => ({ ...k })),
      isDefault: false,
      createdAt: '',
      updatedAt: ''
    });
    setShowTplModal(true);
  };

  const openEditTemplate = (t: KRATemplate) => {
    setEditingTpl({ ...t, kras: t.kras.map(k => ({ ...k })) });
    setShowTplModal(true);
  };

  const updateTplKra = (idx: number, patch: Partial<KRAItem>) => {
    if (!editingTpl) return;
    const next = [...editingTpl.kras];
    next[idx] = { ...next[idx], ...patch };
    setEditingTpl({ ...editingTpl, kras: next });
  };

  const addTplKra = () => {
    if (!editingTpl) return;
    setEditingTpl({
      ...editingTpl,
      kras: [...editingTpl.kras, { name: 'New KRA', weight: 0, target: '' }]
    });
  };

  const removeTplKra = (idx: number) => {
    if (!editingTpl) return;
    setEditingTpl({ ...editingTpl, kras: editingTpl.kras.filter((_, i) => i !== idx) });
  };

  const saveTemplate = async () => {
    if (!editingTpl) return;
    try {
      if (!editingTpl.title.trim()) throw new Error('Please add a template title.');
      if (editingTpl.id) {
        await kraService.updateTemplate(editingTpl.id, {
          role: editingTpl.role,
          title: editingTpl.title.trim(),
          kras: editingTpl.kras,
          isDefault: editingTpl.isDefault
        });
      } else {
        await kraService.createTemplate({
          role: editingTpl.role,
          title: editingTpl.title.trim(),
          kras: editingTpl.kras,
          isDefault: editingTpl.isDefault,
          createdBy: currentUser?.id
        });
      }
      showToast('Template saved');
      setShowTplModal(false);
      setEditingTpl(null);
      await loadAll();
    } catch (e: any) {
      showToast(e?.message || 'Save failed', 'error');
    }
  };

  const deleteTemplate = async (t: KRATemplate) => {
    if (!confirm(`Delete template "${t.title}"?`)) return;
    try {
      await kraService.deleteTemplate(t.id);
      showToast('Template deleted');
      await loadAll();
    } catch (e: any) {
      showToast(e?.message || 'Delete failed', 'error');
    }
  };

  // ======================= Scoring handlers =======================
  const openScoring = async (emp: Profile) => {
    setScoringEmp(emp);
    const existing = await kraService.getScore(emp.id, scoringYear, scoringMonth);
    if (existing) {
      setSheetItems(existing.kras.map(k => ({ ...k })));
      setSheetTemplateId(existing.templateId);
      setSheetRemarks(existing.managerRemarks || '');
    } else {
      const { items, templateId } = await kraService.buildSheetFromTemplate(emp.role);
      setSheetItems(items);
      setSheetTemplateId(templateId);
      setSheetRemarks('');
    }
  };

  const refreshSheetForMonth = async (y: number, m: number) => {
    if (!scoringEmp) return;
    setScoringYear(y);
    setScoringMonth(m);
    const existing = await kraService.getScore(scoringEmp.id, y, m);
    if (existing) {
      setSheetItems(existing.kras.map(k => ({ ...k })));
      setSheetTemplateId(existing.templateId);
      setSheetRemarks(existing.managerRemarks || '');
    } else {
      const { items, templateId } = await kraService.buildSheetFromTemplate(scoringEmp.role);
      setSheetItems(items);
      setSheetTemplateId(templateId);
      setSheetRemarks('');
    }
  };

  const totalScore = useMemo(
    () => +sheetItems.reduce((s, k) => s + (k.weight * (k.achievementPct || 0)) / 100, 0).toFixed(2),
    [sheetItems]
  );

  const updateSheetItem = (idx: number, patch: Partial<KRAScoreItem>) => {
    const next = [...sheetItems];
    next[idx] = { ...next[idx], ...patch };
    if (patch.achievementPct !== undefined || patch.weight !== undefined) {
      const pct = Math.max(0, Math.min(100, Number(next[idx].achievementPct) || 0));
      next[idx].achievementPct = pct;
      next[idx].score = +((next[idx].weight * pct) / 100).toFixed(2);
    }
    setSheetItems(next);
  };

  const saveSheet = async (status: 'draft' | 'approved') => {
    if (!scoringEmp) return;
    setSavingSheet(true);
    try {
      await kraService.upsertScore({
        employeeId: scoringEmp.id,
        employeeName: scoringEmp.fullName,
        employeeRole: scoringEmp.role,
        designation: scoringEmp.designation,
        year: scoringYear,
        month: scoringMonth,
        templateId: sheetTemplateId,
        kras: sheetItems,
        managerRemarks: sheetRemarks,
        status,
        reviewerId: currentUser?.id,
        reviewerName: currentUser?.fullName
      });
      showToast(status === 'approved' ? 'KRA approved & finalized' : 'KRA draft saved');
      await loadAll();
      if (status === 'approved') setScoringEmp(null);
    } catch (e: any) {
      showToast(e?.message || 'Save failed', 'error');
    } finally {
      setSavingSheet(false);
    }
  };

  // ======================= Report =======================
  const reportScores = useMemo(() => {
    return scores
      .filter(s => s.month === reportMonth && s.year === reportYear)
      .filter(s => filterRole === 'all' || s.employeeRole === filterRole)
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [scores, reportMonth, reportYear, filterRole]);

  const avgScore = useMemo(
    () => reportScores.length
      ? +(reportScores.reduce((s, r) => s + r.totalScore, 0) / reportScores.length).toFixed(1)
      : 0,
    [reportScores]
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl p-5 text-white shadow-lg mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2.5 rounded-lg">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">KRA Management</h1>
                <p className="text-xs text-emerald-50 opacity-90">
                  Super Admin • HRMS Performance Module
                </p>
              </div>
            </div>
            <button
              onClick={loadAll}
              className="flex items-center gap-2 text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-slate-200">
          {([
            { k: 'scores',    l: 'Monthly Scoring', i: Edit3 },
            { k: 'report',    l: 'Reports',         i: TrendingUp },
            { k: 'templates', l: 'KRA Templates',   i: FileText }
          ] as const).map(t => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition ${
                tab === t.k
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.i className="w-3.5 h-3.5" />
              {t.l}
            </button>
          ))}
        </div>

        {/* --------------- SCORES TAB --------------- */}
        {tab === 'scores' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Employee list */}
            <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-700">Select Employee</h2>
              </div>
              <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
                {employees.length === 0 && (
                  <p className="text-xs text-slate-400 py-6 text-center">No employees found.</p>
                )}
                {employees.map(emp => {
                  const latest = scores.find(
                    s => s.employeeId === emp.id && s.year === scoringYear && s.month === scoringMonth
                  );
                  const isSel = scoringEmp?.id === emp.id;
                  return (
                    <button
                      key={emp.id}
                      onClick={() => openScoring(emp)}
                      className={`w-full text-left p-2.5 rounded-lg border transition ${
                        isSel
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{emp.fullName}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                            {emp.role.replace(/_/g, ' ')}
                          </p>
                        </div>
                        {latest && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${gradeColor(latest.grade)}`}>
                            {latest.totalScore}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scoring sheet */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              {!scoringEmp && (
                <div className="h-80 flex flex-col items-center justify-center text-slate-400">
                  <Target className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-xs">Select an employee on the left to begin scoring.</p>
                </div>
              )}
              {scoringEmp && (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{scoringEmp.fullName}</h3>
                      <p className="text-[11px] text-slate-500">
                        {scoringEmp.designation || scoringEmp.role.replace(/_/g, ' ').toUpperCase()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <select
                        value={scoringMonth}
                        onChange={e => refreshSheetForMonth(scoringYear, Number(e.target.value))}
                        className="text-xs border border-slate-300 rounded px-2 py-1"
                      >
                        {MONTHS.map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={scoringYear}
                        onChange={e => refreshSheetForMonth(Number(e.target.value), scoringMonth)}
                        className="text-xs border border-slate-300 rounded px-2 py-1"
                      >
                        {[0, 1, 2].map(d => {
                          const y = new Date().getFullYear() - d;
                          return <option key={y} value={y}>{y}</option>;
                        })}
                      </select>
                    </div>
                  </div>

                  {/* KRA table */}
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="text-left px-2 py-2 font-semibold text-slate-600">KRA</th>
                          <th className="text-center px-2 py-2 font-semibold text-slate-600 w-14">Wt%</th>
                          <th className="text-left px-2 py-2 font-semibold text-slate-600">Target / Standard</th>
                          <th className="text-left px-2 py-2 font-semibold text-slate-600">Actual</th>
                          <th className="text-center px-2 py-2 font-semibold text-slate-600 w-16">Ach %</th>
                          <th className="text-center px-2 py-2 font-semibold text-slate-600 w-14">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheetItems.map((k, i) => (
                          <tr key={i} className="border-t border-slate-100 align-top">
                            <td className="px-2 py-2 text-slate-800 font-medium">{k.name}</td>
                            <td className="px-2 py-2 text-center text-slate-600">{k.weight}</td>
                            <td className="px-2 py-2 text-slate-500 text-[11px]">{k.target}</td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                value={k.actual || ''}
                                onChange={e => updateSheetItem(i, { actual: e.target.value })}
                                className="w-full border border-slate-300 rounded px-1.5 py-1 text-[11px]"
                                placeholder="Actual achievement"
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={k.achievementPct}
                                onChange={e => updateSheetItem(i, { achievementPct: Number(e.target.value) })}
                                className="w-14 border border-slate-300 rounded px-1 py-1 text-[11px] text-center"
                              />
                            </td>
                            <td className="px-2 py-2 text-center font-bold text-emerald-700">{k.score}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t-2 border-slate-200">
                          <td colSpan={5} className="text-right px-2 py-2 text-xs font-bold text-slate-700">
                            TOTAL (out of 100)
                          </td>
                          <td className="text-center px-2 py-2 font-bold text-emerald-700 text-sm">
                            {totalScore}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Grade / Incentive */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${gradeColor(
                      totalScore >= 90 ? 'A+' : totalScore >= 80 ? 'A' : totalScore >= 70 ? 'B' : totalScore >= 60 ? 'C' : 'D'
                    )}`}>
                      Grade: {totalScore >= 90 ? 'A+' : totalScore >= 80 ? 'A' : totalScore >= 70 ? 'B' : totalScore >= 60 ? 'C' : 'D'}
                    </span>
                    <span className="text-xs text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                      Suggested Incentive: {totalScore >= 90 ? 10 : totalScore >= 80 ? 7 : totalScore >= 70 ? 5 : 0}%
                    </span>
                  </div>

                  {/* Remarks */}
                  <div className="mt-3">
                    <label className="text-[11px] font-semibold text-slate-600">Manager Remarks</label>
                    <textarea
                      value={sheetRemarks}
                      onChange={e => setSheetRemarks(e.target.value)}
                      rows={2}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs mt-1"
                      placeholder="Overall feedback / strengths / improvement areas…"
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      onClick={() => saveSheet('draft')}
                      disabled={savingSheet}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Draft
                    </button>
                    <button
                      onClick={() => saveSheet('approved')}
                      disabled={savingSheet}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve & Finalize
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* --------------- REPORT TAB --------------- */}
        {tab === 'report' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-700">Monthly Team Performance</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={reportMonth}
                  onChange={e => setReportMonth(Number(e.target.value))}
                  className="text-xs border border-slate-300 rounded px-2 py-1"
                >
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select
                  value={reportYear}
                  onChange={e => setReportYear(Number(e.target.value))}
                  className="text-xs border border-slate-300 rounded px-2 py-1"
                >
                  {[0, 1, 2].map(d => {
                    const y = new Date().getFullYear() - d;
                    return <option key={y} value={y}>{y}</option>;
                  })}
                </select>
                <select
                  value={filterRole}
                  onChange={e => setFilterRole(e.target.value)}
                  className="text-xs border border-slate-300 rounded px-2 py-1"
                >
                  <option value="all">All Roles</option>
                  {ROLE_OPTIONS.filter(r => r.value !== 'all').map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 text-xs font-semibold px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded"
                >
                  <Printer className="w-3 h-3" /> Print
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-[10px] text-emerald-700 uppercase font-bold">Employees Scored</p>
                <p className="text-xl font-bold text-emerald-800">{reportScores.length}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-[10px] text-blue-700 uppercase font-bold">Average Score</p>
                <p className="text-xl font-bold text-blue-800">{avgScore}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-[10px] text-amber-700 uppercase font-bold">Top Performer</p>
                <p className="text-xs font-bold text-amber-800 truncate">
                  {reportScores[0]?.employeeName || '—'}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">#</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Employee</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Role</th>
                    <th className="text-center px-3 py-2 font-semibold text-slate-600">Score</th>
                    <th className="text-center px-3 py-2 font-semibold text-slate-600">Grade</th>
                    <th className="text-center px-3 py-2 font-semibold text-slate-600">Incentive</th>
                    <th className="text-center px-3 py-2 font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportScores.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-slate-400 py-6 text-xs">
                        No scores recorded for this period.
                      </td>
                    </tr>
                  )}
                  {reportScores.map((s, i) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{s.employeeName}</td>
                      <td className="px-3 py-2 text-slate-500 uppercase text-[10px]">{s.employeeRole.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2 text-center font-bold text-emerald-700">{s.totalScore}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${gradeColor(s.grade)}`}>
                          {s.grade}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-700">{s.incentivePct || 0}%</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          s.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                            : s.status === 'submitted' ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {s.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --------------- TEMPLATES TAB --------------- */}
        {tab === 'templates' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-700">KRA Templates by Role</h2>
              </div>
              <button
                onClick={openNewTemplate}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> New Template
              </button>
            </div>

            <div className="space-y-3">
              {templates.length === 0 && (
                <p className="text-xs text-slate-400 py-6 text-center">No templates yet.</p>
              )}
              {templates.map(t => (
                <div key={t.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{t.title}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                        Role: {String(t.role).replace(/_/g, ' ')} {t.isDefault && '• Default'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditTemplate(t)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteTemplate(t)}
                        className="p-1.5 bg-red-50 hover:bg-red-100 rounded text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    {t.kras.map((k, i) => (
                      <div key={i} className="text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-700">{k.name}</span>
                          <span className="text-emerald-700 font-bold">{k.weight}%</span>
                        </div>
                        <p className="text-slate-500 mt-0.5">{k.target}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======= Template modal ======= */}
        {showTplModal && editingTpl && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white">
                <h3 className="text-sm font-bold text-slate-800">
                  {editingTpl.id ? 'Edit Template' : 'New Template'}
                </h3>
                <button
                  onClick={() => { setShowTplModal(false); setEditingTpl(null); }}
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">Title</label>
                    <input
                      value={editingTpl.title}
                      onChange={e => setEditingTpl({ ...editingTpl, title: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">Role</label>
                    <select
                      value={editingTpl.role}
                      onChange={e => setEditingTpl({ ...editingTpl, role: e.target.value as UserRole | 'all' })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs mt-1"
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!!editingTpl.isDefault}
                    onChange={e => setEditingTpl({ ...editingTpl, isDefault: e.target.checked })}
                  />
                  Mark as default template
                </label>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="text-left px-2 py-2 font-semibold text-slate-600">KRA Name</th>
                        <th className="text-center px-2 py-2 font-semibold text-slate-600 w-16">Weight %</th>
                        <th className="text-left px-2 py-2 font-semibold text-slate-600">Target / Standard</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingTpl.kras.map((k, i) => (
                        <tr key={i} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-1.5">
                            <input
                              value={k.name}
                              onChange={e => updateTplKra(i, { name: e.target.value })}
                              className="w-full border border-slate-300 rounded px-1.5 py-1 text-[11px]"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={k.weight}
                              onChange={e => updateTplKra(i, { weight: Number(e.target.value) })}
                              className="w-14 border border-slate-300 rounded px-1 py-1 text-[11px] text-center"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <textarea
                              value={k.target}
                              onChange={e => updateTplKra(i, { target: e.target.value })}
                              rows={2}
                              className="w-full border border-slate-300 rounded px-1.5 py-1 text-[11px]"
                            />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button
                              onClick={() => removeTplKra(i)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t">
                        <td colSpan={4} className="px-2 py-2 text-right text-[11px] font-bold text-slate-700">
                          Weight Total:&nbsp;
                          <span className={
                            editingTpl.kras.reduce((s, k) => s + (Number(k.weight) || 0), 0) === 100
                              ? 'text-emerald-700'
                              : 'text-red-600'
                          }>
                            {editingTpl.kras.reduce((s, k) => s + (Number(k.weight) || 0), 0)}%
                          </span>
                          &nbsp;(must equal 100%)
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <button
                  onClick={addTplKra}
                  className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="w-3.5 h-3.5" /> Add KRA Row
                </button>
              </div>

              <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50">
                <button
                  onClick={() => { setShowTplModal(false); setEditingTpl(null); }}
                  className="text-xs font-semibold px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTemplate}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                >
                  <Save className="w-3.5 h-3.5" /> Save Template
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-xs font-semibold ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}>
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Award className="w-4 h-4" />}
              {toast.text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
