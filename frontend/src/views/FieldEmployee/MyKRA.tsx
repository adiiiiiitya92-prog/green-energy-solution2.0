import React, { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { kraService } from '../../services/kraService';
import type { KRAScore } from '../../types';
import { Target, Award, TrendingUp, Calendar, RefreshCw, CheckCircle2 } from 'lucide-react';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
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

export const MyKRA: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [scores, setScores] = useState<KRAScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const list = await kraService.getScoresByEmployee(currentUser.id);
      const visible = list.filter(s => s.status !== 'draft');
      setScores(visible);
      if (!selectedId && visible.length > 0) setSelectedId(visible[0].id);
    } catch (e) {
      console.error('MyKRA load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const handler = (e?: any) => {
      const col = e?.detail?.collectionName;
      if (col && col !== 'kraScores') return;
      load();
    };
    window.addEventListener('app-realtime-update', handler);
    return () => window.removeEventListener('app-realtime-update', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const selected = useMemo(
    () => scores.find(s => s.id === selectedId) || scores[0],
    [scores, selectedId]
  );

  const avg = useMemo(() => {
    if (scores.length === 0) return 0;
    return +(scores.reduce((s, r) => s + r.totalScore, 0) / scores.length).toFixed(1);
  }, [scores]);

  const trend = useMemo(() => scores.slice(0, 6).reverse(), [scores]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl p-5 text-white shadow-lg mb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2.5 rounded-lg">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold">My KRA Scorecard</h1>
                <p className="text-xs text-emerald-50 opacity-90">
                  Monthly performance review • {currentUser?.fullName}
                </p>
              </div>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-2 text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {scores.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400">
            <Target className="w-10 h-10 mx-auto opacity-30 mb-2" />
            <p className="text-sm font-semibold text-slate-500">No KRA scores published yet.</p>
            <p className="text-xs mt-1">
              Your manager will publish your monthly KRA scorecard here once reviewed.
            </p>
          </div>
        )}

        {scores.length > 0 && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase font-bold text-slate-500">Latest Score</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{scores[0]?.totalScore ?? 0}</p>
                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border mt-1 ${gradeColor(scores[0]?.grade || 'D')}`}>
                  Grade {scores[0]?.grade}
                </span>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase font-bold text-slate-500">6-Month Average</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{avg}</p>
                <p className="text-[10px] text-slate-500 mt-1">Across {scores.length} months</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-[10px] uppercase font-bold text-slate-500">Incentive</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{scores[0]?.incentivePct || 0}%</p>
                <p className="text-[10px] text-slate-500 mt-1">Based on latest score</p>
              </div>
            </div>

            {/* Trend bar */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-700">Last 6 Months Trend</h2>
              </div>
              <div className="flex items-end gap-3 h-32">
                {trend.map(s => (
                  <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-t"
                      style={{ height: `${Math.max(5, s.totalScore)}%` }}
                      title={`${s.totalScore}`}
                    />
                    <span className="text-[10px] text-slate-500">
                      {MONTHS[s.month - 1]} {String(s.year).slice(-2)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-700">{s.totalScore}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* History + detail */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <h2 className="text-sm font-bold text-slate-700">History</h2>
                </div>
                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                  {scores.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition flex items-center justify-between ${
                        selected?.id === s.id
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div>
                        <p className="text-xs font-semibold text-slate-800">
                          {MONTHS[s.month - 1]} {s.year}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {s.status === 'approved' ? 'Finalized' : 'Submitted'}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${gradeColor(s.grade)}`}>
                        {s.totalScore}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
                {selected && (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">
                          {MONTHS[selected.month - 1]} {selected.year} Scorecard
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Reviewed by {selected.reviewedByUserName || '—'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${gradeColor(selected.grade)}`}>
                          Grade {selected.grade} • {selected.totalScore}/100
                        </span>
                        {selected.incentivePct ? (
                          <span className="text-[10px] text-amber-700 mt-1">
                            Incentive: {selected.incentivePct}%
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="text-left px-2 py-2 font-semibold text-slate-600">KRA</th>
                            <th className="text-center px-2 py-2 font-semibold text-slate-600 w-14">Wt</th>
                            <th className="text-left px-2 py-2 font-semibold text-slate-600">Achievement</th>
                            <th className="text-center px-2 py-2 font-semibold text-slate-600 w-14">Ach%</th>
                            <th className="text-center px-2 py-2 font-semibold text-slate-600 w-14">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.kras.map((k, i) => (
                            <tr key={i} className="border-t border-slate-100 align-top">
                              <td className="px-2 py-2 font-semibold text-slate-700">{k.name}</td>
                              <td className="px-2 py-2 text-center text-slate-600">{k.weight}</td>
                              <td className="px-2 py-2 text-slate-500 text-[11px]">
                                {k.actual || <span className="italic text-slate-400">—</span>}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  k.achievementPct >= 90
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : k.achievementPct >= 70
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {k.achievementPct}%
                                </span>
                              </td>
                              <td className="px-2 py-2 text-center font-bold text-emerald-700">{k.score}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {selected.managerRemarks && (
                      <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Manager Remarks
                        </p>
                        <p className="text-xs text-slate-700">{selected.managerRemarks}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
