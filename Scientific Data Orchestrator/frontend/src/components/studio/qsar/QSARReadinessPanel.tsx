import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Play } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useColumnIntelligence } from '../../../hooks/useColumnIntelligence';

interface Props {
  clientId: string;
  apiBase: string;
  sessionInfo: any;
  onSessionLoaded: (i: any) => void;
}

interface Check {
  check: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
  points: number;
}

interface Readiness {
  grade: string;
  overall_score: number;
  endpoint_col: string;
  rows: number;
  cols: number;
  descriptor_count: number;
  smiles_col: string | null;
  checks: Check[];
  recommendations: string[];
  oecd_principles: Record<string, boolean>;
  endpoint_skewness: number | null;
  endpoint_kurtosis: number | null;
  bimodal_warning: boolean;
  kde_data: { x: number; y: number }[];
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

export const QSARReadinessPanel: React.FC<Props> = ({ clientId, apiBase, onSessionLoaded }) => {
  const { columns, refetch } = useColumnIntelligence(clientId, apiBase);
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epCol, setEpCol] = useState('');

  // Transform fields
  const [transform, setTransform] = useState<'log10' | 'neg_log10' | 'sqrt'>('neg_log10');
  const [newColName, setNewColName] = useState('');
  const [transforming, setTransforming] = useState(false);

  // Auto-detect endpoint column
  useEffect(() => {
    if (columns.length > 0) {
      const endpoint = columns.find(c => c.role === 'ENDPOINT');
      if (endpoint) {
        setEpCol(endpoint.name);
      }
    }
  }, [columns]);

  // Set default transformed column name
  useEffect(() => {
    if (epCol) {
      setNewColName(`${epCol}_${transform}`);
    }
  }, [epCol, transform]);

  const run = async (targetCol?: string) => {
    setLoading(true);
    setError(null);
    try {
      const activeCol = targetCol || epCol;
      const q = activeCol ? `?endpoint_col=${encodeURIComponent(activeCol)}` : '';
      const r = await fetch(`${apiBase}/api/qsar-studio/${clientId}/readiness${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Readiness evaluation failed');
      setData(d);
      if (onSessionLoaded) {
        onSessionLoaded(d);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTransform = async () => {
    if (!epCol) {
      toast.error('Please select an endpoint column first.');
      return;
    }
    setTransforming(true);
    try {
      const form = new FormData();
      form.append('endpoint_col', epCol);
      form.append('transform', transform);
      form.append('new_col_name', newColName);

      const r = await fetch(`${apiBase}/api/qsar-studio/${clientId}/endpoint-transform`, {
        method: 'POST',
        body: form,
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.detail || 'Transformation failed');
      }
      toast.success(`Transformation applied: Created ${d.new_col}`);
      // Refresh column intelligence and re-run readiness on the new transformed column
      await refetch();
      setEpCol(d.new_col);
      run(d.new_col);
    } catch (e: any) {
      toast.error(e.message || 'Transform failed');
    } finally {
      setTransforming(false);
    }
  };

  // Run assessment on mount if columns are loaded
  useEffect(() => {
    if (clientId) {
      run();
    }
  }, [clientId]);

  const g = data ? (GRADE_CONFIG[data.grade] ?? GRADE_CONFIG['F']) : null;
  const pass = data?.checks.filter(c => c.status === 'PASS').length ?? 0;
  const warn = data?.checks.filter(c => c.status === 'WARN').length ?? 0;
  const fail = data?.checks.filter(c => c.status === 'FAIL').length ?? 0;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
            Select Target Endpoint Column
          </label>
          <select
            value={epCol}
            onChange={e => setEpCol(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-blue-500/40"
          >
            <option value="">Auto-detect</option>
            {columns
              .filter(c => c.role === 'ENDPOINT' || c.role === 'DESCRIPTOR' || c.role === 'UNKNOWN')
              .map(c => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.role})
                </option>
              ))}
          </select>
        </div>
        <button
          onClick={() => run()}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-bold hover:bg-blue-500/20 transition-all disabled:opacity-40"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Assessing...
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5" />
              Assess Dataset
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
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
              <div>
                SMILES:{' '}
                <span className={data.smiles_col ? 'text-emerald-400' : 'text-slate-600'}>
                  {data.smiles_col || 'not found'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Left side: Checks & OECD */}
            <div className="col-span-2 space-y-4">
              {/* Check list */}
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                Readiness Checks
              </div>
              <div className="grid grid-cols-2 gap-2">
                {data.checks.map((c, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${STATUS_ROW[c.status]}`}>
                    {STATUS_ICON[c.status]}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white truncate mr-2">{c.check}</span>
                        <span className="text-[9px] text-slate-500 shrink-0">{c.points} pts</span>
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5 truncate">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* OECD Principles */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                  OECD 5 Principles
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(data.oecd_principles).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2.5">
                      {val ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      )}
                      <span className={`text-xs ${val ? 'text-slate-300' : 'text-slate-500'}`}>
                        {OECD_LABELS[key] ?? key}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right side: Distribution Chart & transformation */}
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Endpoint Distribution (KDE)
                </div>
                {data.kde_data && data.kde_data.length > 0 ? (
                  /* KDE rendered as a SciHistogram-style line via Recharts ComposedChart */
                  <ResponsiveContainer width="100%" height={140}>
                    <ComposedChart data={data.kde_data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <XAxis dataKey="x" hide />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(5,8,22,0.96)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 4,
                          fontSize: 10,
                          fontFamily: "'Geist Mono', monospace",
                        }}
                        formatter={(v: any) => [typeof v === 'number' ? v.toFixed(4) : v, 'density']}
                      />
                      <Line
                        type="monotone"
                        dataKey="y"
                        stroke="#22D3EE"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-28 flex items-center justify-center text-[10px] text-slate-600 font-mono">
                    KDE chart not available
                  </div>
                )}
                {data.endpoint_skewness !== null && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.04] text-[10px] font-mono text-slate-400">
                    <div>Skewness: <span className="text-white">{data.endpoint_skewness.toFixed(3)}</span></div>
                    <div>Kurtosis: <span className="text-white">{data.endpoint_kurtosis?.toFixed(3) ?? '-'}</span></div>
                  </div>
                )}
                {data.bimodal_warning && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 leading-normal flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong>Bimodal Hint</strong>: Distinct subgroups or target classes detected. Consider log-transform.
                    </div>
                  </div>
                )}
              </div>

              {/* Endpoint Transformation Workshop */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Normality & Transform Lab
                </div>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">
                      Choose Transform
                    </label>
                    <select
                      value={transform}
                      onChange={e => setTransform(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-blue-500/40"
                    >
                      <option value="log10">log₁₀ Transformation</option>
                      <option value="neg_log10">Negative log₁₀ (-log₁₀)</option>
                      <option value="sqrt">Square Root (√x)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">
                      New Column Name
                    </label>
                    <input
                      type="text"
                      value={newColName}
                      onChange={e => setNewColName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-blue-500/40"
                    />
                  </div>
                  <button
                    onClick={handleApplyTransform}
                    disabled={transforming || !epCol}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-bold hover:bg-blue-500/20 transition-all disabled:opacity-40"
                  >
                    {transforming ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" />
                        Apply Transformation
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70 mb-1">
                OECD Action Recommendations
              </div>
              {data.recommendations.map((r, i) => (
                <div key={i} className="text-xs text-amber-300/80 flex items-start gap-2 leading-relaxed">
                  <span className="flex-shrink-0 mt-0.5">•</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
