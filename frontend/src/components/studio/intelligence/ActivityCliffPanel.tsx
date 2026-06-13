import React, { useState } from 'react';
import { Loader2, AlertCircle, Activity, RefreshCw, Info } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

interface Props { clientId: string; apiBase: string; session: any; }

const CliffTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-[#0d1a2e] border border-white/[0.08] rounded-lg px-3 py-2 text-xs shadow-xl space-y-0.5">
      <div className="text-slate-400">Compounds #{d.i} ↔ #{d.j}</div>
      <div className="text-white">Similarity: <span className="text-cyan-300 font-mono">{d.similarity}</span></div>
      <div className="text-white">Δ Activity: <span className="text-rose-300 font-mono">{d.act_diff}</span></div>
      <div className="text-amber-400 font-bold">Cliff Score: {d.cliff_score}</div>
    </div>
  );
};

export const ActivityCliffPanel: React.FC<Props> = ({ clientId, apiBase, session }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(2.0);
  const [actCol, setActCol] = useState('');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ threshold: threshold.toString() });
      if (actCol) p.set('activity_col', actCol);
      const r = await fetch(`${apiBase}/api/intelligence/${clientId}/activity-cliffs?${p}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const cliffs = data?.cliffs ?? [];
  const chartData = cliffs.map((c: any) => ({
    similarity: c.similarity, act_diff: c.activity_diff, cliff_score: c.cliff_score,
    i: c.compound_i, j: c.compound_j,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Activity Column</label>
          <input value={actCol} onChange={e => setActCol(e.target.value)} placeholder="auto-detect"
            className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono w-40 focus:outline-none focus:border-cyan-500/40" />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Activity Threshold (Δ)</label>
          <div className="flex items-center gap-2">
            <input type="range" min={0.5} max={5} step={0.5} value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-28 accent-cyan-500" />
            <span className="text-xs text-cyan-300 font-bold w-8">{threshold}</span>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm font-bold hover:bg-cyan-500/20 transition-all disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          Detect Cliffs
        </button>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10 text-xs text-cyan-300/80">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        Activity cliff = pair with structural similarity ≥ 0.7 AND |Δactivity| ≥ {threshold}. High cliff score means structurally similar compounds with dramatically different potency.
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}
      {loading && <div className="flex items-center justify-center h-32 gap-2 text-cyan-400"><Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Scanning cliff pairs…</span></div>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Compounds Checked', v: data.n_compounds },
              { l: 'Cliff Pairs Found', v: data.n_cliffs, hi: data.n_cliffs > 0 },
              { l: 'Detection Mode', v: data.mode === 'tanimoto_morgan' ? 'Tanimoto' : 'Descriptor Dist.' },
            ].map(s => (
              <div key={s.l} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <div className={`text-xl font-black ${(s as any).hi ? 'text-rose-400' : 'text-slate-300'}`}>{s.v}</div>
                <div className="text-[10px] text-slate-600">{s.l}</div>
              </div>
            ))}
          </div>

          {chartData.length > 0 && (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Activity Cliff Scatter (Similarity vs Δ Activity)</div>
              <ResponsiveContainer width="100%" height={240}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                  <XAxis type="number" dataKey="similarity" domain={[0.6, 1]} name="Similarity"
                    label={{ value: 'Tanimoto Similarity', position: 'insideBottom', offset: -10, fontSize: 10, fill: '#475569' }}
                    tick={{ fontSize: 9, fill: '#475569' }} />
                  <YAxis type="number" dataKey="act_diff" name="Δ Activity"
                    label={{ value: 'Δ Activity', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#475569' }}
                    tick={{ fontSize: 9, fill: '#475569' }} />
                  <ReferenceLine x={0.7} stroke="#f59e0b" strokeDasharray="3 3" />
                  <ReferenceLine y={threshold} stroke="#f43f5e" strokeDasharray="3 3" />
                  <Tooltip content={<CliffTooltip />} />
                  <Scatter data={chartData} name="Cliff Pairs">
                    {chartData.map((_: any, i: number) => (
                      <Cell key={i} fill={`hsl(${180 + i * 5}, 70%, 55%)`} fillOpacity={0.8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}

          {cliffs.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">No activity cliffs found with current threshold. Try lowering the Δ value.</div>
          )}

          {cliffs.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full text-xs">
                <thead><tr className="bg-white/[0.04] border-b border-white/[0.06]">
                  {['Rank','Pair','Similarity','Activity i','Activity j','Δ Activity','Cliff Score'].map(h =>
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {cliffs.slice(0, 25).map((c: any, i: number) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-slate-500">#{i+1}</td>
                      <td className="px-3 py-2 font-mono text-slate-400">#{c.compound_i}↔#{c.compound_j}</td>
                      <td className="px-3 py-2 font-bold text-cyan-300 font-mono">{c.similarity}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{c.activity_i?.toFixed(3)}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{c.activity_j?.toFixed(3)}</td>
                      <td className="px-3 py-2 font-bold text-rose-400 font-mono">{c.activity_diff}</td>
                      <td className="px-3 py-2 font-bold text-amber-400 font-mono">{c.cliff_score}</td>
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
