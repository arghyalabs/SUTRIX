import React, { useState } from 'react';
import { Loader2, AlertCircle, Users, Info } from 'lucide-react';

interface Props { clientId: string; apiBase: string; session: any; }

export const ReadAcrossPanel: React.FC<Props> = ({ clientId, apiBase, session }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryIdx, setQueryIdx] = useState(0);
  const [k, setK] = useState(10);
  const [actCol, setActCol] = useState('');
  const maxIdx = (session?.rows ?? 1) - 1;

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ query_idx: queryIdx.toString(), k: k.toString() });
      if (actCol) p.set('activity_col', actCol);
      const r = await fetch(`${apiBase}/api/intelligence/${clientId}/read-across?${p}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const neighbours = data?.neighbours ?? [];
  const query = data?.query;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Query Compound (row index)</label>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={Math.min(maxIdx, 999)} value={queryIdx}
              onChange={e => setQueryIdx(parseInt(e.target.value))} className="w-32 accent-cyan-500" />
            <span className="text-xs text-cyan-300 font-bold w-10">#{queryIdx}</span>
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">k Neighbours</label>
          <input type="number" min={3} max={20} value={k} onChange={e => setK(parseInt(e.target.value) || 10)}
            className="w-16 px-2 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs text-center focus:outline-none" />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Activity Column</label>
          <input value={actCol} onChange={e => setActCol(e.target.value)} placeholder="auto-detect"
            className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono w-40 focus:outline-none focus:border-cyan-500/40" />
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm font-bold hover:bg-cyan-500/20 transition-all disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
          Find Neighbours
        </button>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10 text-xs text-cyan-300/80">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        Read-across uses Euclidean distance on normalised numeric descriptors. Predicted activity = mean activity of k nearest neighbours.
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}
      {loading && <div className="flex items-center justify-center h-32 gap-2 text-cyan-400"><Loader2 className="w-5 h-5 animate-spin" /><span>Finding neighbours…</span></div>}

      {query && (
        <>
          {/* Query card */}
          <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 space-y-2">
            <div className="text-xs font-bold text-cyan-300">Query Compound #{query.compound_idx}</div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {query.smiles && (
                <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                  <div className="text-[10px] text-slate-600 mb-0.5">SMILES</div>
                  <div className="text-slate-300 font-mono truncate" title={query.smiles}>{query.smiles}</div>
                </div>
              )}
              {query.activity !== undefined && (
                <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                  <div className="text-[10px] text-slate-600 mb-0.5">Actual Activity ({data.activity_col})</div>
                  <div className="text-cyan-300 font-bold font-mono">{query.activity?.toFixed(4)}</div>
                </div>
              )}
              {query.predicted_activity !== undefined && (
                <div className="p-2 rounded-lg bg-violet-500/5 border border-violet-500/20">
                  <div className="text-[10px] text-violet-400/70 mb-0.5">Read-Across Prediction (k={k} NN mean)</div>
                  <div className="text-violet-300 font-bold font-mono text-lg">{query.predicted_activity?.toFixed(4)}</div>
                  <div className="text-[10px] text-slate-600">± {query.neighbour_activity_std?.toFixed(4)} std</div>
                </div>
              )}
            </div>
          </div>

          {/* Neighbours table */}
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {k} Nearest Neighbours — {data.n_features_used} features used
            </div>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-white/[0.04]">
                {['Rank','Compound #','Distance','Activity','SMILES'].map(h =>
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {neighbours.map((nb: any) => (
                  <tr key={nb.rank} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-slate-500 font-bold">#{nb.rank}</td>
                    <td className="px-3 py-2 text-slate-300 font-mono">#{nb.compound_idx}</td>
                    <td className="px-3 py-2 font-mono text-cyan-400">{nb.distance}</td>
                    <td className="px-3 py-2 font-mono text-white">{nb.activity?.toFixed(4) ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-slate-500 truncate max-w-[180px]" title={nb.smiles ?? ''}>
                      {nb.smiles ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
