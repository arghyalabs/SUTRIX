import React, { useState } from 'react';
import { Loader2, AlertCircle, BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PanelProps { clientId: string; apiBase: string; }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0d1a2e] border border-white/[0.08] rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">bin: [{label}, {payload[0]?.payload?.bin_end?.toFixed(2)})</div>
      <div className="text-violet-300">count: {payload[0]?.value}</div>
      {payload[0]?.payload?.frequency !== undefined && (
        <div className="text-slate-500">frequency: {(payload[0].payload.frequency * 100).toFixed(1)}%</div>
      )}
    </div>
  );
};

export const DistributionPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [col, setCol] = useState('');
  const [bins, setBins] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useLog, setUseLog] = useState(false);

  const load = async () => {
    if (!col) { setError('Enter a column name'); return; }
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/distribution?col=${encodeURIComponent(col)}&bins=${bins}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const histogram = useLog ? (data?.log_histogram ?? []) : (data?.histogram ?? []);
  const chartData = histogram.map((b: any) => ({
    name: b.bin_start?.toFixed(2),
    count: b.count,
    bin_end: b.bin_end,
    frequency: b.frequency,
  }));

  const normality = data?.normality;
  const percentiles = data?.percentiles ?? {};

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Column Name</label>
          <input
            value={col}
            onChange={e => setCol(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="e.g. lc50_mg_l"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-violet-500/40"
          />
        </div>
        <div className="w-24">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Bins</label>
          <input
            type="number"
            min={5} max={100}
            value={bins}
            onChange={e => setBins(parseInt(e.target.value) || 30)}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-violet-500/40"
          />
        </div>
        <button onClick={load} disabled={loading || !col}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-sm font-bold hover:bg-violet-500/20 transition-all disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
          Analyse
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {data && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'N', value: data.count?.toLocaleString() },
              { label: 'Mean', value: data.mean?.toFixed(4) },
              { label: 'Std', value: data.std?.toFixed(4) },
              { label: 'Skewness', value: data.skewness?.toFixed(3), hi: Math.abs(data.skewness ?? 0) > 2 },
            ].map(s => (
              <div key={s.label} className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-center">
                <div className={`text-sm font-bold ${(s as any).hi ? 'text-amber-400' : 'text-slate-200'}`}>{s.value ?? '—'}</div>
                <div className="text-[10px] text-slate-600">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Normality badge */}
          {normality && (
            <div className={`flex items-center gap-3 p-3 rounded-xl border text-xs
              ${normality.is_normal ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300' : 'bg-amber-500/5 border-amber-500/20 text-amber-300'}`}>
              <span className="font-bold">{normality.is_normal ? '✓ Normally Distributed' : '⚠ Non-Normal Distribution'}</span>
              <span className="text-slate-500">Shapiro-Wilk: W = {normality.statistic}, p = {normality.p_value}</span>
              {!normality.is_normal && <span className="text-[10px] text-amber-400/70">Consider log-transformation for QSAR</span>}
            </div>
          )}

          {/* Histogram */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Distribution Histogram</div>
              <button onClick={() => setUseLog(v => !v)}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all
                  ${useLog ? 'bg-violet-500/20 border border-violet-500/30 text-violet-300' : 'bg-white/[0.04] border border-white/[0.06] text-slate-500'}`}>
                {useLog ? 'log₁₀(x) axis' : 'linear axis'}
              </button>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#475569' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[2, 2, 0, 0]} name="Count">
                  {chartData.map((_: any, i: number) => (
                    <Cell
                      key={i}
                      fill={`hsl(${265 - i * (60 / Math.max(chartData.length, 1))}, 70%, 60%)`}
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Percentile table */}
          {Object.keys(percentiles).length > 0 && (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Percentiles</div>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {Object.entries(percentiles).map(([p, v]: any) => (
                  <div key={p} className="text-center p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <div className="text-xs font-bold text-violet-300">{v !== null ? Number(v).toFixed(4) : '—'}</div>
                    <div className="text-[10px] text-slate-600">P{p}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
