import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { SciPanel } from '../../../components/charts/SciPanel';
import { SciHistogram } from '../../../components/charts/SciHistogram';
import type { HistogramBin } from '../../../components/charts/SciHistogram';


interface PanelProps { clientId: string; apiBase: string; }

export const EndpointDiagnosticsPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colInput, setColInput] = useState('');
  const [useLog, setUseLog] = useState(false);

  const load = async (col?: string) => {
    setLoading(true); setError(null);
    try {
      const url = col
        ? `${apiBase}/api/analytics/${clientId}/endpoint-analysis?col=${encodeURIComponent(col)}`
        : `${apiBase}/api/analytics/${clientId}/endpoint-analysis`;
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [clientId]);

  const stats = data?.stats;

  // Map API bins { bin_start, bin_end, count, frequency } → HistogramBin { x0, x1, count, density }
  const rawHistogram = useLog ? (data?.log_histogram ?? []) : (data?.histogram ?? []);
  const bins: HistogramBin[] = rawHistogram.map((b: any) => ({
    x0: b.bin_start,
    x1: b.bin_end,
    count: b.count,
    density: b.frequency,
  }));

  // Normal KDE overlay: API shape [{ x, y }] — passed directly
  const normalKDE: Array<{ x: number; y: number }> | undefined =
    data?.normal_kde?.length ? data.normal_kde : undefined;

  const groupStats: any[] = data?.group_stats ?? [];

  return (
    <div className="space-y-5">
      {/* Column selector */}
      <div className="flex items-center gap-2">
        <input
          value={colInput}
          onChange={e => setColInput(e.target.value)}
          placeholder="Column name (leave blank for auto-detect)"
          className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-violet-500/40"
        />
        <button onClick={() => load(colInput || undefined)} disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold hover:bg-violet-500/20 transition-all disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Analyse
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-32 gap-2 text-cyan-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Analysing endpoint distribution…</span>
        </div>
      )}

      {stats && (
        <>
          {/* Column name + log-normality badge */}
          <div className="flex items-center gap-3">
            <div className="text-sm font-bold text-white">
              Column: <span className="text-violet-300 font-mono">{stats.column}</span>
            </div>
            {stats.log_normal_score !== undefined && (
              <div className={`px-2 py-0.5 rounded-md border text-[10px] font-bold
                ${stats.log_normal_score > 70 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : stats.log_normal_score > 40 ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}>
                Log-Normal Score: {stats.log_normal_score}%
              </div>
            )}
            {stats.recommended_transform && (
              <div className="text-[10px] text-slate-500">
                Recommended transform: <span className="text-violet-300 font-semibold">{stats.recommended_transform}</span>
              </div>
            )}
          </div>

          {/* Inline mono stat strip */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 py-1">
            {[
              { label: 'N', value: stats.count?.toLocaleString(), accent: '#22D3EE' },
              { label: 'mean', value: stats.mean?.toFixed(4), accent: '#22D3EE' },
              { label: 'median', value: stats.median?.toFixed(4), accent: '#22D3EE' },
              { label: 'std', value: stats.std?.toFixed(4), accent: '#22D3EE' },
              { label: 'min', value: stats.min?.toFixed(4), accent: '#94A3B8' },
              { label: 'max', value: stats.max?.toFixed(4), accent: '#94A3B8' },
              {
                label: 'skew',
                value: stats.skewness?.toFixed(3),
                accent: stats.skewness && Math.abs(stats.skewness) > 2 ? '#F59E0B' : '#22D3EE',
              },
              { label: 'log₁₀ range', value: stats.range_orders_of_magnitude?.toFixed(2) ?? '—', accent: '#94A3B8' },
            ].map(s => (
              <span key={s.label} style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>
                <span style={{ color: '#64748B' }}>{s.label} </span>
                <span style={{ color: s.accent, fontWeight: 600 }}>{s.value ?? '—'}</span>
              </span>
            ))}
          </div>

          {/* Histogram via SciHistogram inside SciPanel */}
          <SciPanel title="ENDPOINT DISTRIBUTION" height={280}>
            <div className="flex items-center justify-end px-3 pb-1">
              <button
                onClick={() => setUseLog(v => !v)}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all
                  ${useLog ? 'bg-white/[0.03] border border-white/[0.05] text-cyan-300' : 'bg-white/[0.03] border border-white/[0.05] text-slate-500'}`}
              >
                {useLog ? 'log₁₀ scale' : 'linear scale'}
              </button>
            </div>
            {bins.length > 0 && (
              <SciHistogram
                bins={bins}
                mode="count"
                mean={stats?.mean}
                std={stats?.std}
                normalKDE={normalKDE}
                height={220}
                xLabel={stats?.column}
                yLabel="count"
              />
            )}
          </SciPanel>

          {/* Group stats */}
          {groupStats.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Statistics by {data?.group_by_col}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    {['Group', 'N', 'Mean', 'Median', 'Std', 'Min', 'Max'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {groupStats.slice(0, 15).map((g: any) => (
                    <tr key={g.group} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-violet-300 font-mono max-w-[160px] truncate">{g.group}</td>
                      <td className="px-3 py-2 text-slate-400">{g.count}</td>
                      <td className="px-3 py-2 text-slate-300 font-mono">{g.mean?.toFixed(3)}</td>
                      <td className="px-3 py-2 text-slate-300 font-mono">{g.median?.toFixed(3)}</td>
                      <td className="px-3 py-2 text-slate-400 font-mono">{g.std?.toFixed(3)}</td>
                      <td className="px-3 py-2 text-slate-400 font-mono">{g.min?.toFixed(3)}</td>
                      <td className="px-3 py-2 text-slate-400 font-mono">{g.max?.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};
