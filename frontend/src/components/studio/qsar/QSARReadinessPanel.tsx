import React, { useState } from 'react';
import { Loader2, AlertCircle, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { clientId: string; apiBase: string; sessionInfo: any; onSessionLoaded: (i: any) => void; }

interface Check { check: string; status: 'PASS' | 'WARN' | 'FAIL'; detail: string; points: number; }
interface Readiness {
  grade: string; overall_score: number; endpoint_col: string; rows: number; cols: number;
  descriptor_count: number; smiles_col: string | null;
  checks: Check[]; recommendations: string[]; oecd_principles: Record<string, boolean>;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  PASS: <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
  WARN: <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />,
  FAIL: <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />,
};
const STATUS_ROW: Record<string, string> = {
  PASS: 'border-emerald-500/20 bg-emerald-500/5',
  WARN: 'border-amber-500/20 bg-amber-500/5',
  FAIL: 'border-rose-500/20 bg-rose-500/5',
};
const GRADE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  A: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'Excellent' },
  B: { color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/30',       label: 'Good' },
  C: { color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',     label: 'Fair' },
  D: { color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/30',   label: 'Poor' },
  F: { color: 'text-rose-400',    bg: 'bg-rose-500/10 border-rose-500/30',       label: 'Not Ready' },
};
const OECD_LABELS: Record<string, string> = {
  P1_defined_endpoint: 'P1 — Defined Endpoint',
  P2_unambiguous_algorithm: 'P2 — Unambiguous Algorithm',
  P3_applicability_domain: 'P3 — Applicability Domain (AD)',
  P4_appropriate_measures: 'P4 — Goodness-of-Fit / Robustness',
  P5_mechanistic_interpretation: 'P5 — Mechanistic Interpretation',
};

export const QSARReadinessPanel: React.FC<Props> = ({ clientId, apiBase, sessionInfo }) => {
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epCol, setEpCol] = useState('');

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const q = epCol ? `?endpoint_col=${encodeURIComponent(epCol)}` : '';
      const r = await fetch(`${apiBase}/api/qsar-studio/${clientId}/readiness${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const g = data ? (GRADE_CONFIG[data.grade] ?? GRADE_CONFIG['F']) : null;
  const pass = data?.checks.filter(c => c.status === 'PASS').length ?? 0;
  const warn = data?.checks.filter(c => c.status === 'WARN').length ?? 0;
  const fail = data?.checks.filter(c => c.status === 'FAIL').length ?? 0;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
            Endpoint Column (leave blank for auto-detect)
          </label>
          <input value={epCol} onChange={e => setEpCol(e.target.value)}
            placeholder="e.g. lc50_mg_l, ec50, activity"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-blue-500/40" />
        </div>
        <button onClick={run} disabled={loading}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm font-bold hover:bg-blue-500/20 transition-all disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          Run Assessment
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {data && g && (
        <>
          {/* Grade card */}
          <div className={`flex items-center gap-6 p-6 rounded-2xl border ${g.bg}`}>
            <div className={`text-7xl font-black ${g.color}`}>{data.grade}</div>
            <div>
              <div className={`text-2xl font-black ${g.color}`}>{data.overall_score} / 100</div>
              <div className="text-sm text-slate-400 mt-0.5">{g.label} QSAR Readiness</div>
              <div className="flex gap-3 mt-2 text-xs">
                <span className="text-emerald-400">{pass} passed</span>
                <span className="text-amber-400">{warn} warnings</span>
                <span className="text-rose-400">{fail} failed</span>
              </div>
            </div>
            <div className="ml-auto text-right text-xs text-slate-500 space-y-1">
              <div>Endpoint: <span className="text-blue-300 font-mono">{data.endpoint_col || '—'}</span></div>
              <div>Descriptors: <span className="text-blue-300 font-bold">{data.descriptor_count}</span></div>
              <div>SMILES: <span className={data.smiles_col ? 'text-emerald-400' : 'text-slate-600'}>
                {data.smiles_col || 'not found'}
              </span></div>
            </div>
          </div>

          {/* Check list */}
          <div className="space-y-2">
            {data.checks.map((c, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${STATUS_ROW[c.status]}`}>
                {STATUS_ICON[c.status]}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{c.check}</span>
                    <span className="text-[10px] text-slate-500">{c.points} pts</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>

          {/* OECD Principles */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">OECD 5 Principles</div>
            <div className="space-y-1.5">
              {Object.entries(data.oecd_principles).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2.5">
                  {val
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />}
                  <span className={`text-xs ${val ? 'text-slate-300' : 'text-slate-500'}`}>
                    {OECD_LABELS[key] ?? key}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70 mb-2">Recommendations</div>
              {data.recommendations.map((r, i) => (
                <div key={i} className="text-xs text-amber-300/80 flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">→</span> {r}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
