import React, { useState } from 'react';
import { Loader2, AlertCircle, Crosshair, RefreshCw, Info } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

interface Props { clientId: string; apiBase: string; sessionInfo: any; onSessionLoaded: (i: any) => void; }

interface ADPoint {
  idx: number; leverage: number; std_residual: number;
  endpoint: number; predicted: number; in_ad: boolean;
}

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  const color = payload.in_ad ? '#3b82f6' : '#f43f5e';
  return <circle cx={cx} cy={cy} r={4} fill={color} fillOpacity={0.75} stroke="none" />;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d: ADPoint = payload[0]?.payload;
  return (
    <div className="bg-[#0d1a2e] border border-white/[0.08] rounded-lg px-3 py-2 text-xs shadow-xl space-y-0.5">
      <div className="text-slate-400">Row #{d.idx}</div>
      <div className="text-white">Leverage: <span className="font-mono text-blue-300">{d.leverage?.toFixed(4)}</span></div>
      <div className="text-white">Std Residual: <span className="font-mono text-blue-300">{d.std_residual?.toFixed(3)}</span></div>
      <div className="text-white">Actual: <span className="font-mono">{d.endpoint?.toFixed(3)}</span></div>
      <div className="text-white">Predicted: <span className="font-mono">{d.predicted?.toFixed(3)}</span></div>
      <div className={d.in_ad ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
        {d.in_ad ? '✓ Inside AD' : '✗ Outside AD'}
      </div>
    </div>
  );
};

export const ApplicabilityDomainPanel: React.FC<Props> = ({ clientId, apiBase, sessionInfo }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epCol, setEpCol] = useState('');
  const [subgroup, setSubgroup] = useState('');

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (epCol) params.set('endpoint_col', epCol);
      if (subgroup) params.set('subgroup', subgroup);
      const r = await fetch(`${apiBase}/api/qsar-studio/${clientId}/applicability-domain?${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const points: ADPoint[] = data?.points ?? [];
  const inAD = points.filter(p => p.in_ad);
  const outAD = points.filter(p => !p.in_ad);

  const subgroups: string[] = Array.isArray(sessionInfo?.subgroups) ? sessionInfo.subgroups : [];

  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-xs text-blue-300/80">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <strong>Williams Plot</strong> — standardized residuals vs leverage (hat value).
          Warning leverage threshold <strong>h* = 3(k+1)/n</strong>. Points with |residual| &lt; 3 and h &lt; h* are inside the applicability domain (AD).
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Endpoint Column</label>
          <input value={epCol} onChange={e => setEpCol(e.target.value)}
            placeholder="leave blank for auto-detect"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-blue-500/40" />
        </div>
        {subgroups.length > 1 && (
          <div className="w-40">
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Subgroup</label>
            <select value={subgroup} onChange={e => setSubgroup(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-blue-500/40">
              <option value="">All</option>
              {subgroups.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        <button onClick={run} disabled={loading}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm font-bold hover:bg-blue-500/20 transition-all disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
          Compute AD
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
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Compounds', value: data.n },
              { label: 'Descriptors', value: data.k },
              { label: 'Inside AD', value: `${inAD.length} (${data.in_ad_pct}%)`, color: 'text-blue-400' },
              { label: 'h* threshold', value: data.h_star, color: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <div className={`text-xl font-black ${(s as any).color || 'text-slate-300'}`}>{s.value}</div>
                <div className="text-[10px] text-slate-600">{s.label}</div>
              </div>
            ))}
          </div>

          {/* R² */}
          {data.r2 !== null && (
            <div className="text-xs text-slate-500">
              Linear regression R²: <span className="text-blue-300 font-bold">{data.r2?.toFixed(4)}</span>
              <span className="text-slate-600 ml-2">(used for residual calculation)</span>
            </div>
          )}

          {/* Williams plot */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Williams Plot</div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Inside AD ({inAD.length})</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Outside AD ({outAD.length})</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                <XAxis type="number" dataKey="leverage" name="Leverage (h)"
                  label={{ value: 'Leverage (h)', position: 'insideBottom', offset: -10, fontSize: 10, fill: '#475569' }}
                  tick={{ fontSize: 9, fill: '#475569' }} />
                <YAxis type="number" dataKey="std_residual" name="Std Residual"
                  label={{ value: 'Standardized Residual', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#475569' }}
                  tick={{ fontSize: 9, fill: '#475569' }} />
                <Tooltip content={<CustomTooltip />} />
                {/* h* vertical line */}
                <ReferenceLine x={data.h_star} stroke="#f59e0b" strokeDasharray="4 2"
                  label={{ value: `h*=${data.h_star}`, fill: '#f59e0b', fontSize: 9, position: 'top' }} />
                {/* ±3 SD horizontal lines */}
                <ReferenceLine y={3} stroke="#f43f5e" strokeDasharray="4 2"
                  label={{ value: '+3σ', fill: '#f43f5e', fontSize: 9 }} />
                <ReferenceLine y={-3} stroke="#f43f5e" strokeDasharray="4 2"
                  label={{ value: '-3σ', fill: '#f43f5e', fontSize: 9 }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                <Scatter data={points} shape={<CustomDot />} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Outside AD table */}
          {outAD.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-rose-400/70">
                Outside AD — {outAD.length} compounds
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    {['Row', 'Leverage', 'Std Residual', 'Actual', 'Predicted'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {outAD.slice(0, 20).map(p => (
                    <tr key={p.idx} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-rose-400 font-mono">#{p.idx}</td>
                      <td className="px-3 py-2 font-mono text-slate-400">{p.leverage?.toFixed(4)}</td>
                      <td className="px-3 py-2 font-mono text-slate-400">{p.std_residual?.toFixed(3)}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{p.endpoint?.toFixed(4)}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{p.predicted?.toFixed(4)}</td>
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
