import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, Leaf, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props { clientId: string; apiBase: string; session: any; }

const buildHistogram = (values: number[], bins = 20) => {
  if (!values.length) return [];
  const min = Math.min(...values), max = Math.max(...values);
  const step = (max - min) / bins || 1;
  const buckets: { x: number; count: number }[] = Array.from({ length: bins }, (_, i) => ({ x: +(min + i * step).toFixed(2), count: 0 }));
  values.forEach(v => {
    const idx = Math.min(Math.floor((v - min) / step), bins - 1);
    buckets[idx].count++;
  });
  return buckets;
};

export const DiversityPanel: React.FC<Props> = ({ clientId, apiBase }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState('MW');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/intelligence/${clientId}/diversity`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [clientId]);

  const props = data?.properties ?? {};
  const availProps = Object.keys(props);
  const activeKey = availProps.includes(selected) ? selected : availProps[0];
  const activeData = props[activeKey];
  const histData = activeData ? buildHistogram(activeData.histogram?.values ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/20 transition-all disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}
      {loading && !data && <div className="flex items-center justify-center h-32 gap-2 text-cyan-400"><Loader2 className="w-5 h-5 animate-spin" /><span>Analysing diversity…</span></div>}

      {data && (
        <>
          {/* Lipinski card */}
          {data.lipinski && (
            <div className={`flex items-center gap-4 p-4 rounded-xl border
              ${data.lipinski.ro5_pct >= 70 ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-amber-500/5 border-amber-500/15'}`}>
              <Leaf className={`w-5 h-5 flex-shrink-0 ${data.lipinski.ro5_pct >= 70 ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div>
                <div className={`text-sm font-black ${data.lipinski.ro5_pct >= 70 ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {data.lipinski.ro5_pct}% pass Lipinski Ro5
                </div>
                <div className="text-[10px] text-slate-500">{data.lipinski.ro5_pass} pass · {data.lipinski.ro5_fail} fail (MW≤500 & logP≤5)</div>
              </div>
            </div>
          )}

          {/* Property tabs */}
          {availProps.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {availProps.map(p => (
                <button key={p} onClick={() => setSelected(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all
                    ${activeKey === p ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-300' : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'}`}>
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Property stats */}
          {activeData && (
            <>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { l: 'Mean', v: activeData.mean?.toFixed(2) },
                  { l: 'Std', v: activeData.std?.toFixed(2) },
                  { l: 'Min', v: activeData.min?.toFixed(2) },
                  { l: 'Max', v: activeData.max?.toFixed(2) },
                ].map(s => (
                  <div key={s.l} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                    <div className="text-sm font-bold text-cyan-300">{s.v ?? '—'}</div>
                    <div className="text-[10px] text-slate-600">{s.l}</div>
                  </div>
                ))}
              </div>

              {histData.length > 0 && (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">{activeKey} Distribution</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={histData} margin={{ top: 0, right: 10, bottom: 20, left: 0 }}>
                      <XAxis dataKey="x" tick={{ fontSize: 8, fill: '#475569' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 9, fill: '#475569' }} />
                      <Tooltip contentStyle={{ background: '#0d1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                        {histData.map((_: any, i: number) => (
                          <Cell key={i} fill={`hsl(${185 + i * 3}, 65%, 55%)`} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {availProps.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">No physicochemical property columns detected. Add MW, logP, TPSA, HBD, HBA columns.</div>
          )}
        </>
      )}
    </div>
  );
};
