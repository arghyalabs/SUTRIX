import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw, AlertTriangle, XCircle, CheckCircle2, Info } from 'lucide-react';

interface PanelProps { clientId: string; apiBase: string; }

interface ColMissing {
  column: string;
  dtype: string;
  missing_count: number;
  missing_pct: number;
  present_count: number;
  unique_count: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

interface MissCorrItem {
  missing_col: string;
  correlated_with: string;
  correlation: number;
}

const SEV_STYLES: Record<string, string> = {
  CRITICAL: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  HIGH:     'text-orange-400 bg-orange-500/10 border-orange-500/20',
  MEDIUM:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
  LOW:      'text-blue-400 bg-blue-500/10 border-blue-500/20',
  NONE:     'text-emerald-400',
};

export const MissingnessPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/missing-analysis`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [clientId]);

  const cols: ColMissing[] = data?.columns ?? [];
  const filtered = filter === 'all' ? cols : cols.filter(c => c.severity === filter);
  const withMissing = cols.filter(c => c.severity !== 'NONE');

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Missing Cells', value: data.total_missing?.toLocaleString() ?? '0', color: data.total_missing > 0 ? 'text-rose-400' : 'text-emerald-400' },
            { label: 'Columns Affected', value: data.columns_with_missing ?? '0', color: data.columns_with_missing > 0 ? 'text-amber-400' : 'text-emerald-400' },
            { label: 'MCAR Correlations', value: data.missingness_correlations?.length ?? '0', color: data.missingness_correlations?.length > 0 ? 'text-violet-400' : 'text-slate-500' },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${filter === f ? 'bg-violet-500/20 border border-violet-500/30 text-violet-300' : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'}`}>
            {f === 'all' ? 'All Columns' : f}
          </button>
        ))}
        <button onClick={load} disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold hover:bg-violet-500/20 transition-all disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-32 gap-2 text-violet-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Analysing missingness…</span>
        </div>
      )}

      {/* Visual bar chart */}
      {withMissing.length > 0 && filter === 'all' && (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Missing % by Column</div>
          {withMissing.slice(0, 20).map(col => {
            const barColor = col.severity === 'CRITICAL' ? 'bg-rose-500' :
                             col.severity === 'HIGH' ? 'bg-orange-500' :
                             col.severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-blue-500';
            return (
              <div key={col.column} className="flex items-center gap-2">
                <div className="w-32 text-xs font-mono text-slate-400 truncate flex-shrink-0" title={col.column}>{col.column}</div>
                <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${col.missing_pct}%` }} />
                </div>
                <div className="w-16 text-right text-xs font-semibold text-slate-400">{col.missing_pct}%</div>
                <div className={`w-16 text-[10px] font-bold text-right ${SEV_STYLES[col.severity].split(' ')[0]}`}>{col.severity}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detailed table */}
      {filtered.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/[0.04] border-b border-white/[0.06]">
                {['Column', 'Type', 'Missing', 'Missing %', 'Present', 'Unique', 'Severity'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map(col => (
                <tr key={col.column} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2 font-mono text-white/80 max-w-[140px] truncate">{col.column}</td>
                  <td className="px-3 py-2 text-slate-500 text-[10px] font-mono">{col.dtype}</td>
                  <td className="px-3 py-2 text-slate-300">{col.missing_count.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-rose-500" style={{ width: `${col.missing_pct}%` }} />
                      </div>
                      <span className="text-slate-400">{col.missing_pct}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{col.present_count.toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-400">{col.unique_count.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {col.severity === 'NONE' ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
                        <CheckCircle2 className="w-3 h-3" /> None
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${SEV_STYLES[col.severity]}`}>{col.severity}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MCAR correlations */}
      {data?.missingness_correlations?.length > 0 && (
        <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10 space-y-2">
          <div className="flex items-center gap-2 text-violet-300 text-xs font-bold mb-2">
            <Info className="w-3.5 h-3.5" /> Missingness Correlations Detected (not MCAR)
          </div>
          {data.missingness_correlations.map((m: MissCorrItem, i: number) => (
            <div key={i} className="text-[10px] text-slate-400">
              Missing in <span className="text-violet-300 font-mono">{m.missing_col}</span> correlates with{' '}
              <span className="text-violet-300 font-mono">{m.correlated_with}</span>{' '}
              (r = <span className={Math.abs(m.correlation) > 0.5 ? 'text-amber-300' : 'text-slate-300'}>{m.correlation}</span>)
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
