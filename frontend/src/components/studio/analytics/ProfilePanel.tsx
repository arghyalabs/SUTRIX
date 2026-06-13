import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw, Database, Hash, Type, Clock } from 'lucide-react';

interface PanelProps { clientId: string; apiBase: string; }

interface ColumnInfo {
  name: string;
  dtype: string;
  missing_count: number;
  missing_pct: number;
  unique_count: number;
  mean?: number;
  std?: number;
  min?: number;
  median?: number;
  max?: number;
  skewness?: number;
  zeros?: number;
  top_values?: Record<string, number>;
}

interface ProfileData {
  total_rows: number;
  total_cols: number;
  total_cells: number;
  missing_cells: number;
  completeness_pct: number;
  numeric_cols: number;
  categorical_cols: number;
  datetime_cols: number;
  duplicate_rows: number;
  memory_mb: number;
  columns: ColumnInfo[];
}

const DTYPE_ICON: Record<string, React.ReactNode> = {
  numeric: <Hash className="w-3 h-3 text-blue-400" />,
  object:  <Type className="w-3 h-3 text-amber-400" />,
  datetime:<Clock className="w-3 h-3 text-emerald-400" />,
};

function dtypeIcon(dtype: string) {
  if (/int|float|num/i.test(dtype)) return DTYPE_ICON.numeric;
  if (/date|time/i.test(dtype)) return DTYPE_ICON.datetime;
  return DTYPE_ICON.object;
}

function fmt(v?: number | null, dec = 3): string {
  if (v === null || v === undefined) return '—';
  return Number.isInteger(v) ? v.toString() : v.toFixed(dec);
}

export const ProfilePanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'numeric' | 'categorical'>('all');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/profile`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [clientId]);

  const filtered = (data?.columns ?? []).filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter === 'numeric' && !/int|float/i.test(c.dtype)) return false;
    if (typeFilter === 'categorical' && /int|float/i.test(c.dtype)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Rows', value: data.total_rows.toLocaleString(), color: 'text-violet-300' },
            { label: 'Columns', value: data.total_cols.toLocaleString(), color: 'text-violet-300' },
            { label: 'Completeness', value: `${data.completeness_pct}%`, color: data.completeness_pct >= 90 ? 'text-emerald-400' : data.completeness_pct >= 70 ? 'text-amber-400' : 'text-rose-400' },
            { label: 'Duplicates', value: data.duplicate_rows.toLocaleString(), color: data.duplicate_rows > 0 ? 'text-amber-400' : 'text-emerald-400' },
            { label: 'Numeric Cols', value: data.numeric_cols, color: 'text-blue-400' },
            { label: 'Text Cols', value: data.categorical_cols, color: 'text-amber-400' },
            { label: 'Missing Cells', value: data.missing_cells.toLocaleString(), color: data.missing_cells > 0 ? 'text-rose-400' : 'text-emerald-400' },
            { label: 'Memory (MB)', value: data.memory_mb, color: 'text-slate-300' },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
              <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search columns…"
          className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-violet-500/40 w-44"
        />
        {(['all', 'numeric', 'categorical'] as const).map(f => (
          <button key={f} onClick={() => setTypeFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${typeFilter === f ? 'bg-violet-500/20 border border-violet-500/30 text-violet-300' : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
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
          <span className="text-sm">Profiling dataset…</span>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="bg-white/[0.04] border-b border-white/[0.06]">
                {['Column', 'Type', 'Missing', 'Unique', 'Mean', 'Std', 'Min', 'Median', 'Max', 'Skew'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map(col => (
                <tr key={col.name} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2 font-mono text-white/80 max-w-[140px] truncate" title={col.name}>
                    <div className="flex items-center gap-1.5">
                      {dtypeIcon(col.dtype)}
                      <span>{col.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-[10px] font-mono">{col.dtype}</td>
                  <td className="px-3 py-2">
                    {col.missing_count > 0 ? (
                      <span className={`font-semibold ${col.missing_pct > 20 ? 'text-rose-400' : col.missing_pct > 5 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {col.missing_count} ({col.missing_pct}%)
                      </span>
                    ) : <span className="text-emerald-500/60 text-[10px]">✓ none</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{col.unique_count.toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{fmt(col.mean)}</td>
                  <td className="px-3 py-2 font-mono text-slate-400">{fmt(col.std)}</td>
                  <td className="px-3 py-2 font-mono text-slate-400">{fmt(col.min)}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{fmt(col.median)}</td>
                  <td className="px-3 py-2 font-mono text-slate-400">{fmt(col.max)}</td>
                  <td className="px-3 py-2 font-mono">
                    {col.skewness !== undefined ? (
                      <span className={Math.abs(col.skewness) > 2 ? 'text-amber-400' : 'text-slate-400'}>
                        {fmt(col.skewness, 2)}
                      </span>
                    ) : <span className="text-slate-700">—</span>}
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
