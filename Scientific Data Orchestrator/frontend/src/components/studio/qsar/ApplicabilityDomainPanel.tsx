import React, { useState } from 'react';
import { Loader2, AlertCircle, Crosshair, Info } from 'lucide-react';
import { SciPanel } from '../../../components/charts/SciPanel';
import { SciScatter } from '../../../components/charts/SciScatter';
import type { ScatterSeries } from '../../../components/charts/SciScatter';

interface Props { clientId: string; apiBase: string; sessionInfo: any; onSessionLoaded: (i: any) => void; }

interface ADPoint {
  idx: number; leverage: number; std_residual: number;
  endpoint: number; predicted: number; in_ad: boolean;
}

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

  // SciScatter series
  const scatterSeries: ScatterSeries[] = [
    {
      name: 'Inside AD',
      color: '#34D399',
      data: inAD.map(p => ({
        x: p.leverage,
        y: p.std_residual,
        label: `Row #${p.idx}`,
        opacity: 0.8,
      })),
    },
    {
      name: 'Outside AD',
      color: '#F43F5E',
      data: outAD.map(p => ({
        x: p.leverage,
        y: p.std_residual,
        label: `Row #${p.idx}`,
        opacity: 0.9,
      })),
    },
  ];

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
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs font-mono focus:outline-none focus:border-cyan-400/30" />
        </div>
        {subgroups.length > 1 && (
          <div className="w-40">
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Subgroup</label>
            <select value={subgroup} onChange={e => setSubgroup(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0b1224] border border-white/[0.05] text-slate-300 text-xs focus:outline-none focus:border-cyan-400/30">
              <option value="" className="bg-[#0b1224] text-[#CBD5E1]">All</option>
              {subgroups.map(s => <option key={s} value={s} className="bg-[#0b1224] text-[#CBD5E1]">{s}</option>)}
            </select>
          </div>
        )}
        <button onClick={run} disabled={loading}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-bold hover:bg-cyan-500/20 transition-all disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> : <Crosshair className="w-4 h-4" />}
          Compute AD
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {data && (
        <>
          {/* Inline mono stat strip */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '4px 0', fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>
            {[
              { label: 'N', value: data.n },
              { label: 'k', value: data.k },
              { label: 'h*', value: typeof data.h_star === 'number' ? data.h_star.toFixed(4) : data.h_star, accent: '#FACC15' },
              { label: 'In-AD', value: `${inAD.length} (${data.in_ad_pct}%)`, accent: '#34D399' },
              { label: 'Out-AD', value: outAD.length, accent: '#F43F5E' },
              data.r2 !== null && { label: 'R²', value: data.r2?.toFixed(4) },
            ].filter(Boolean).map((s: any) => (
              <span key={s.label}>
                <span style={{ color: '#64748B' }}>{s.label} </span>
                <span style={{ color: s.accent || '#22D3EE', fontWeight: 600 }}>{s.value}</span>
              </span>
            ))}
          </div>

          {/* Williams plot via SciScatter */}
          <SciPanel
            title="WILLIAMS PLOT"
            subtitle="Standardized residuals vs leverage (hat value)"
            height={330}
          >
            <SciScatter
              series={scatterSeries}
              height={290}
              xLabel="Leverage (h)"
              yLabel="Standardized Residual"
              hLines={[
                { y: 3, dashed: true, color: '#F43F5E', label: '+3σ' },
                { y: -3, dashed: true, color: '#F43F5E', label: '-3σ' },
                { y: 0, dashed: false, color: 'rgba(255,255,255,0.1)' },
              ]}
              vLines={data.h_star ? [{ x: data.h_star, dashed: true, color: '#FACC15', label: `h*=${data.h_star}` }] : []}
              tooltipFormatter={(point, seriesName) => (
                <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: '#F1F5F9' }}>
                  <div style={{ color: '#64748B', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", marginBottom: 4 }}>
                    {point.label}
                  </div>
                  <div>
                    <span style={{ color: '#94A3B8' }}>leverage </span>
                    <span style={{ color: '#22D3EE', fontWeight: 600 }}>{point.x?.toFixed(4)}</span>
                  </div>
                  <div>
                    <span style={{ color: '#94A3B8' }}>std residual </span>
                    <span style={{ color: seriesName === 'Outside AD' ? '#F43F5E' : '#34D399', fontWeight: 600 }}>{point.y?.toFixed(3)}</span>
                  </div>
                  <div style={{ color: seriesName === 'Outside AD' ? '#F43F5E' : '#34D399', fontWeight: 600, marginTop: 2 }}>
                    {seriesName === 'Outside AD' ? '✗ Outside AD' : '✓ Inside AD'}
                  </div>
                </div>
              )}
            />
          </SciPanel>

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
