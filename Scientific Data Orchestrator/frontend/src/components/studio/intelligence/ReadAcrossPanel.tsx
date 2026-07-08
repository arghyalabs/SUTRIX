import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Users, Info, Play, CheckCircle2, XCircle } from 'lucide-react';
import { useColumnIntelligence } from '../../../hooks/useColumnIntelligence';
import { MoleculeCard } from './MoleculeCard';
import { toast } from 'react-hot-toast';

interface Props {
  clientId: string;
  apiBase: string;
  session: any;
}

interface PredictResult {
  query_smiles: string;
  predicted_activity: number | null;
  max_similarity: number;
  in_applicability_domain: boolean;
  neighbors: {
    compound_idx: number;
    smiles: string;
    activity: number;
    similarity: number;
  }[];
  k: number;
}

export const ReadAcrossPanel: React.FC<Props> = ({ clientId, apiBase, session }) => {
  const { columns } = useColumnIntelligence(clientId, apiBase);
  const [activeTab, setActiveTab] = useState<'dataset' | 'predict'>('dataset');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Dataset query controls
  const [queryIdx, setQueryIdx] = useState(0);
  const [k, setK] = useState(5);
  const [actCol, setActCol] = useState('');
  const maxIdx = (session?.rows ?? 1) - 1;

  // External predict controls
  const [querySmiles, setQuerySmiles] = useState('');
  const [predResult, setPredResult] = useState<PredictResult | null>(null);
  const [predLoading, setPredLoading] = useState(false);

  // Auto-detect activity column
  useEffect(() => {
    if (columns.length > 0) {
      const act = columns.find(c => c.role === 'ENDPOINT');
      if (act) setActCol(act.name);
    }
  }, [columns]);

  const loadDatasetAcross = async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({
        query_idx: queryIdx.toString(),
        k: k.toString(),
      });
      if (actCol) p.set('activity_col', actCol);
      const r = await fetch(`${apiBase}/api/intelligence/${clientId}/read-across?${p}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Read-across computation failed');
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePredictExternal = async () => {
    if (!querySmiles) {
      toast.error('Please enter a query SMILES string');
      return;
    }
    setPredLoading(true);
    setError(null);
    setPredResult(null);

    const form = new FormData();
    form.append('query_smiles', querySmiles);
    form.append('k', k.toString());
    if (actCol) form.append('activity_col', actCol);

    try {
      const r = await fetch(`${apiBase}/api/intelligence/${clientId}/read-across/predict`, {
        method: 'POST',
        body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Read-across prediction failed');
      setPredResult(d);
      toast.success('Read-Across prediction calculated!');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPredLoading(false);
    }
  };

  const neighbours = data?.neighbours ?? [];
  const query = data?.query;

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex border-b border-white/[0.06] pb-px flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('dataset')}
          className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all -mb-px ${
            activeTab === 'dataset'
              ? 'border-rose-500 text-rose-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Dataset Read-Across
        </button>
        <button
          onClick={() => setActiveTab('predict')}
          className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all -mb-px ${
            activeTab === 'predict'
              ? 'border-rose-500 text-rose-400'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Predict External Compound (KNN)
        </button>
      </div>

      {/* Shared Info Banner */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/10 text-xs text-rose-300 leading-normal">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
        <div>
          <strong>Tanimoto Read-Across (KNN)</strong>: Implements similarity-based activity predictions.
          Accepts target SMILES, generates Morgan fingerprints, identifies the top K nearest neighbors, and predicts activity based on similarity-weighted potency averages. Local Applicability Domain (AD) is verified safe if the nearest neighbor similarity &ge; 0.60.
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Dataset Tab */}
      {activeTab === 'dataset' && (
        <div className="space-y-6">
          {/* Controls */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
                Query Compound (Row Index)
              </label>
              <div className="flex items-center gap-2 pt-1.5">
                <input
                  type="range"
                  min={0}
                  max={Math.min(maxIdx, 999)}
                  value={queryIdx}
                  onChange={e => setQueryIdx(parseInt(e.target.value))}
                  className="flex-1 accent-rose-500"
                />
                <span className="text-xs text-rose-300 font-bold w-12 font-mono">#{queryIdx}</span>
              </div>
            </div>
            <div className="w-20">
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
                k Neighbors
              </label>
              <input
                type="number"
                min={3}
                max={20}
                value={k}
                onChange={e => setK(parseInt(e.target.value) || 5)}
                className="w-full px-2 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs text-center focus:outline-none"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
                Endpoint Column
              </label>
              <select
                value={actCol}
                onChange={e => setActCol(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs focus:outline-none"
              >
                <option value="">-- Auto Detect --</option>
                {columns.filter(c => c.role === 'ENDPOINT' || c.role === 'UNKNOWN').map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={loadDatasetAcross}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-bold hover:bg-rose-500/20 transition-all disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Finding...
                </>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5" />
                  Find Neighbors
                </>
              )}
            </button>
          </div>

          {loading && !data && (
            <div className="flex items-center justify-center py-10 gap-2 text-rose-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-semibold">Running read-across algorithms...</span>
            </div>
          )}

          {query && (
            <div className="space-y-6">
              {/* Query card */}
              <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-3">
                <div className="text-xs font-bold text-rose-300">
                  Query Compound #{query.compound_idx}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {query.smiles && (
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] col-span-2">
                      <div className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wider font-semibold">
                        SMILES
                      </div>
                      <div className="text-slate-300 font-mono truncate text-xs" title={query.smiles}>
                        {query.smiles}
                      </div>
                    </div>
                  )}
                  {query.activity !== undefined && (
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <div className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wider font-semibold">
                        Actual Potency ({data.activity_col})
                      </div>
                      <div className="text-rose-300 font-bold font-mono text-sm">
                        {query.activity?.toFixed(4)}
                      </div>
                    </div>
                  )}
                </div>

                {query.predicted_activity !== undefined && (
                  <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 grid grid-cols-2 gap-4 items-center">
                    <div>
                      <div className="text-[10px] text-violet-400 mb-0.5 uppercase tracking-wider font-semibold">
                        Read-Across Prediction (k={k} NN mean)
                      </div>
                      <div className="text-violet-300 font-black font-mono text-xl">
                        {query.predicted_activity?.toFixed(4)}
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-slate-500 font-mono">
                      StDev of neighbors: {query.neighbour_activity_std?.toFixed(4)}
                    </div>
                  </div>
                )}
              </div>

              {/* Neighbors table */}
              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {k} Nearest Structural Neighbors ({data.n_features_used} descriptor dimensions)
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.04] bg-white/[0.02]">
                      {['Rank', 'Compound #', 'Distance', 'Potency Value', 'SMILES'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {neighbours.map((nb: any) => (
                      <tr key={nb.rank} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-3 py-2 text-slate-500 font-bold font-mono">#{nb.rank}</td>
                        <td className="px-3 py-2 text-slate-300 font-mono">#{nb.compound_idx}</td>
                        <td className="px-3 py-2 font-mono text-rose-300">{nb.distance.toFixed(4)}</td>
                        <td className="px-3 py-2 font-mono text-white">
                          {nb.activity?.toFixed(4) ?? '—'}
                        </td>
                        <td
                          className="px-3 py-2 font-mono text-slate-500 truncate max-w-[280px]"
                          title={nb.smiles ?? ''}
                        >
                          {nb.smiles ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* External Predict Tab */}
      {activeTab === 'predict' && (
        <div className="space-y-6">
          {/* Form */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Query Compound Formulation
            </div>
            <div className="grid grid-cols-3 gap-4 items-end">
              <div className="col-span-2">
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
                  Enter SMILES String *
                </label>
                <input
                  value={querySmiles}
                  onChange={e => setQuerySmiles(e.target.value)}
                  placeholder="e.g. Cc1ccccc1, NC(=O)c1ccccc1"
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-rose-500/40"
                />
              </div>
              <button
                onClick={handlePredictExternal}
                disabled={predLoading || !querySmiles}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-bold hover:bg-rose-500/20 transition-all disabled:opacity-40"
              >
                {predLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Predict Potency
                  </>
                )}
              </button>
            </div>
          </div>

          {predLoading && !predResult && (
            <div className="flex items-center justify-center py-10 gap-2 text-rose-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-semibold">Running Tanimoto similarity searches...</span>
            </div>
          )}

          {predResult && (
            <div className="space-y-6 animate-all duration-300">
              {/* Prediction Result Overview Card */}
              <div className="grid grid-cols-3 gap-4">
                {/* 2D Structure Drawing Card */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between items-center text-center">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">
                    Query 2D Structure
                  </span>
                  <img
                    src={`${apiBase}/api/render/structure?smiles=${encodeURIComponent(predResult.query_smiles)}`}
                    alt="Query SMILES structure"
                    className="w-40 h-40 object-contain rounded-lg bg-white/[0.02] p-2 border border-white/[0.04]"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '';
                    }}
                  />
                  <span className="text-[9px] text-slate-600 font-mono truncate max-w-xs mt-2">
                    {predResult.query_smiles}
                  </span>
                </div>

                {/* Score and AD confidence */}
                <div className="col-span-2 space-y-4">
                  <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/20 space-y-3">
                    <div className="text-[10px] text-violet-400 uppercase tracking-wider font-semibold">
                      Read-Across Potency Prediction
                    </div>
                    <div className="text-violet-300 font-black font-mono text-3xl">
                      {predResult.predicted_activity !== null
                        ? predResult.predicted_activity.toFixed(4)
                        : 'N/A'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Weighted average of top {predResult.k} nearest structural neighbors.
                    </div>
                  </div>

                  {/* AD Safety Badge */}
                  <div className={`p-4 rounded-xl border text-xs leading-normal flex gap-3 ${
                    predResult.in_applicability_domain
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  }`}>
                    {predResult.in_applicability_domain ? (
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4.5 h-4.5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <strong>
                        {predResult.in_applicability_domain
                          ? 'Inside Applicability Domain (Confident)'
                          : 'Outside Applicability Domain (Low Confidence)'}
                      </strong>
                      <div className="text-[10px] text-slate-500 mt-1">
                        Nearest structural similarity detected: {(predResult.max_similarity * 100).toFixed(1)}% (Threshold: 60.0%).
                        {!predResult.in_applicability_domain && (
                          <span className="block text-rose-400/80 mt-0.5">
                            Warning: Structural descriptors differ significantly from training data. Use with caution.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Neighbors list */}
              <div className="space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Top Structural Neighbors (Morgan Fingerprint Tanimoto)
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {predResult.neighbors.map((nb, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between items-center text-center space-y-2 hover:bg-white/[0.04] transition-all"
                    >
                      <span className="text-[9px] text-slate-500 font-bold font-mono">
                        #{idx + 1} (Tan: {(nb.similarity * 100).toFixed(0)}%)
                      </span>
                      <img
                        src={`${apiBase}/api/render/structure?smiles=${encodeURIComponent(nb.smiles)}`}
                        alt="Neighbor SMILES structure"
                        className="w-24 h-24 object-contain rounded bg-white/[0.02] p-1 border border-white/[0.04]"
                      />
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-slate-600 font-mono block">Idx #{nb.compound_idx}</span>
                        <span className="text-xs font-bold text-rose-300 font-mono block">
                          Act: {nb.activity.toFixed(3)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
