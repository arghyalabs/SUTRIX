import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw, Download } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  clientId: string; apiBase: string;
  onSelectPrinciple: (n: number) => void;
}

const TL_STYLES: Record<string, { dot: string; text: string; badge: string }> = {
  GREEN: { dot: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' },
  AMBER: { dot: 'bg-amber-500',   text: 'text-amber-400',   badge: 'bg-amber-500/10 border-amber-500/20 text-amber-300'   },
  RED:   { dot: 'bg-rose-500',    text: 'text-rose-400',    badge: 'bg-rose-500/10 border-rose-500/20 text-rose-300'       },
};

const GRADE_CFG: Record<string, { color: string; ring: string }> = {
  A: { color: 'text-emerald-400', ring: 'ring-emerald-500/30' },
  B: { color: 'text-blue-400',    ring: 'ring-blue-500/30'    },
  C: { color: 'text-amber-400',   ring: 'ring-amber-500/30'   },
  D: { color: 'text-orange-400',  ring: 'ring-orange-500/30'  },
  F: { color: 'text-rose-400',    ring: 'ring-rose-500/30'    },
};

export const OECDFullReport: React.FC<Props> = ({ clientId, apiBase, onSelectPrinciple }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/oecd/${clientId}/full-report`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [clientId]);

  const principles = data?.principles ?? [];
  const radarData = principles.map((p: any) => ({
    principle: `P${p.principle}`,
    score: p.score,
  }));

  const gc = data ? (GRADE_CFG[data.overall_grade] ?? GRADE_CFG['F']) : null;

  return (
    <div className="space-y-5">
      {/* Refresh */}
      <div className="flex items-center gap-2">
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-300 text-xs font-semibold hover:bg-slate-500/20 transition-all disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Re-run Assessment
        </button>
        {data && (
          <button onClick={() => window.open(`${apiBase}/api/oecd/${clientId}/export-report`, '_blank')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-slate-400 text-xs font-semibold hover:bg-white/[0.05] transition-all">
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Running 5-principle OECD assessment…</span>
        </div>
      )}

      {data && gc && (
        <>
          {/* Overall score + grade */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Grade card */}
            <div className={`flex items-center gap-6 p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] ring-1 ${gc.ring}`}>
              <div className={`text-8xl font-black ${gc.color}`}>{data.overall_grade}</div>
              <div>
                <div className={`text-3xl font-black ${gc.color}`}>{data.overall_score}<span className="text-lg text-slate-600">/100</span></div>
                <div className="text-sm text-slate-400 mt-1">Overall OECD Compliance</div>
                <div className="flex gap-3 mt-2 text-xs">
                  <span className="text-emerald-400 font-bold">{data.green} ✓ GREEN</span>
                  <span className="text-amber-400 font-bold">{data.amber} ⚠ AMBER</span>
                  <span className="text-rose-400 font-bold">{data.red} ✗ RED</span>
                </div>
                <div className={`mt-2 px-2 py-0.5 rounded-md border text-[10px] font-bold inline-block
                  ${data.overall_status === 'GREEN' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : data.overall_status === 'AMBER' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}>
                  {data.overall_status}
                </div>
              </div>
            </div>

            {/* Radar chart */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex flex-col">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Compliance Radar</div>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.06)" />
                    <PolarAngleAxis dataKey="principle" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Radar name="Score" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
                    <Tooltip formatter={(v: any) => `${v}/100`}
                      contentStyle={{ background: '#0d1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Principle cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {principles.map((p: any) => {
              const tl = TL_STYLES[p.status] ?? TL_STYLES['RED'];
              const greenN = p.checks.filter((c: any) => c.status === 'GREEN').length;
              const amberN = p.checks.filter((c: any) => c.status === 'AMBER').length;
              const redN   = p.checks.filter((c: any) => c.status === 'FAIL' || c.status === 'RED').length;
              return (
                <button key={p.principle} onClick={() => onSelectPrinciple(p.principle)}
                  className="group p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-slate-500/30 hover:bg-white/[0.04] text-left transition-all space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${tl.dot}`} />
                    <span className="text-xs font-black text-slate-300">P{p.principle}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 leading-snug">{p.title}</div>
                  {/* Score bar */}
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${p.score >= 70 ? 'bg-emerald-500' : p.score >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${p.score}%` }} />
                  </div>
                  <div className={`text-lg font-black ${tl.text}`}>{p.score}<span className="text-xs text-slate-600">/100</span></div>
                  <div className="flex gap-1.5 text-[9px]">
                    <span className="text-emerald-500">{greenN}✓</span>
                    <span className="text-amber-500">{amberN}⚠</span>
                    {redN > 0 && <span className="text-rose-500">{redN}✗</span>}
                  </div>
                  <div className="text-[10px] text-slate-700 group-hover:text-slate-500 transition-colors">View details →</div>
                </button>
              );
            })}
          </div>

          {/* Checks breakdown table */}
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-slate-500">
              All Compliance Checks ({data.total_checks})
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  {['Principle', 'Criterion', 'Status', 'Detail', 'Score'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {principles.flatMap((p: any) =>
                  p.checks.map((c: any, i: number) => {
                    const tl = TL_STYLES[c.status] ?? TL_STYLES['RED'];
                    return (
                      <tr key={`${p.principle}-${i}`} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2">
                          <span className="text-[10px] font-black text-slate-400">P{p.principle}</span>
                        </td>
                        <td className="px-3 py-2 text-white max-w-[180px]">
                          <div className="truncate" title={c.criterion}>{c.criterion}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`flex items-center gap-1.5`}>
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tl.dot}`} />
                            <span className={`font-bold ${tl.text} text-[10px]`}>{c.status}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 text-[10px] max-w-[280px]">
                          <div className="line-clamp-2">{c.detail}</div>
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-400">{c.score}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
