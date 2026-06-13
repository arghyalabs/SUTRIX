import React, { useState } from 'react';
import { Loader2, AlertCircle, GitBranch } from 'lucide-react';

interface PanelProps { clientId: string; apiBase: string; }

interface MatrixCell { col_a: string; col_b: string; i: number; j: number; value: number | null; }
interface StrongCorr { col_a: string; col_b: string; correlation: number; strength: string; direction: string; }

function corrColor(v: number | null): string {
  if (v === null) return 'bg-slate-800';
  const abs = Math.abs(v);
  if (v > 0) {
    if (abs > 0.9) return 'bg-violet-500';
    if (abs > 0.7) return 'bg-violet-400/70';
    if (abs > 0.4) return 'bg-violet-300/40';
    return 'bg-violet-200/15';
  } else {
    if (abs > 0.9) return 'bg-rose-500';
    if (abs > 0.7) return 'bg-rose-400/70';
    if (abs > 0.4) return 'bg-rose-300/40';
    return 'bg-rose-200/15';
  }
}

export const CorrelationPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<'pearson' | 'spearman' | 'kendall'>('pearson');
  const [hover, setHover] = useState<MatrixCell | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/correlation?method=${method}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const cols: string[] = data?.columns ?? [];
  const n = cols.length;
  const matrix: MatrixCell[] = data?.matrix ?? [];
  const strong: StrongCorr[] = data?.strong_correlations ?? [];

  // Build lookup
  const cellMap = new Map<string, number | null>();
  matrix.forEach(c => cellMap.set(`${c.i}-${c.j}`, c.value));

  return (
    <div className="space-y-4">
      {/* Method selector */}
      <div className="flex items-center gap-2">
        {(['pearson', 'spearman', 'kendall'] as const).map(m => (
          <button key={m} onClick={() => setMethod(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all
              ${method === m ? 'bg-violet-500/20 border border-violet-500/30 text-violet-300' : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'}`}>
            {m}
          </button>
        ))}
        <button onClick={load} disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold hover:bg-violet-500/20 transition-all disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
          Compute Matrix
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-32 gap-2 text-violet-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Computing {method} correlation matrix…</span>
        </div>
      )}

      {/* Hover tooltip */}
      {hover && hover.value !== null && (
        <div className="text-xs text-slate-400 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <span className="font-mono text-violet-300">{hover.col_a}</span>
          <span className="text-slate-600 mx-1.5">vs</span>
          <span className="font-mono text-violet-300">{hover.col_b}</span>
          <span className="ml-3 font-bold text-white">{hover.value?.toFixed(3)}</span>
        </div>
      )}

      {/* Heatmap grid */}
      {n > 0 && !loading && (
        <div className="overflow-auto">
          <div className="inline-block">
            {/* Col headers */}
            <div className="flex pl-16 mb-0.5">
              {cols.map(c => (
                <div key={c} className="text-[8px] text-slate-600 font-mono truncate"
                  style={{ width: 22, minWidth: 22, textAlign: 'center', transform: 'rotate(-45deg)', transformOrigin: 'left bottom', height: 40 }}>
                  {c.slice(0, 8)}
                </div>
              ))}
            </div>
            {/* Rows */}
            {cols.map((colA, i) => (
              <div key={colA} className="flex items-center mb-0.5">
                <div className="w-16 text-[9px] text-slate-500 font-mono truncate pr-2 text-right flex-shrink-0">{colA.slice(0, 10)}</div>
                <div className="flex gap-0.5">
                  {cols.map((colB, j) => {
                    const val = cellMap.get(`${i}-${j}`) ?? null;
                    return (
                      <div
                        key={colB}
                        className={`rounded-sm cursor-pointer ${corrColor(val)} transition-all hover:ring-1 hover:ring-white/20`}
                        style={{ width: 20, height: 20 }}
                        onMouseEnter={() => setHover({ col_a: colA, col_b: colB, i, j, value: val })}
                        onMouseLeave={() => setHover(null)}
                        title={val !== null ? `${colA} vs ${colB}: ${val.toFixed(3)}` : ''}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      {n > 0 && !loading && (
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-rose-500" /> −1.0</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-slate-800" /> 0.0</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-violet-500" /> +1.0</div>
        </div>
      )}

      {/* Strong correlations table */}
      {strong.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Strong Correlations (|r| &gt; 0.7) — {strong.length} pairs
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.04]">
                {['Column A', 'Column B', 'r', 'Strength', 'Direction'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {strong.map((s, idx) => (
                <tr key={idx} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2 font-mono text-violet-300 max-w-[140px] truncate">{s.col_a}</td>
                  <td className="px-3 py-2 font-mono text-violet-300 max-w-[140px] truncate">{s.col_b}</td>
                  <td className="px-3 py-2 font-bold text-white">{s.correlation}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold
                      ${s.strength === 'very_strong' ? 'bg-violet-500/20 text-violet-300' : 'bg-blue-500/20 text-blue-300'}`}>
                      {s.strength.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={s.direction === 'positive' ? 'text-emerald-400' : 'text-rose-400'}>
                      {s.direction === 'positive' ? '▲ positive' : '▼ negative'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
