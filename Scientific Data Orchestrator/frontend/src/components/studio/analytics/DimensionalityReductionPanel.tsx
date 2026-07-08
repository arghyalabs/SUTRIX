import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Layers, Info } from 'lucide-react';
import { useColumnIntelligence } from '../../../hooks/useColumnIntelligence';
import { toast } from 'react-hot-toast';
import { SciPanel, SciLegend } from '../../../components/charts/SciPanel';
import { SciScatter } from '../../../components/charts/SciScatter';
import type { ScatterSeries } from '../../../components/charts/SciScatter';
import { SciBar } from '../../../components/charts/SciBar';
import type { SciBarDatum } from '../../../components/charts/SciBar';
import { SCI_COLORS } from '../../../components/charts/chartTheme';

// Types

interface PanelProps {
  clientId: string;
  apiBase: string;
}

interface ProjectionPoint {
  x: number;
  y: number;
  label: string;
  cluster?: string | number;
}

interface Loading {
  feature: string;
  pc1: number;
  pc2: number;
}

interface ReductionResult {
  method: string;
  projection?: ProjectionPoint[];
  points?: Array<{ row_idx: number; x: number; y: number; label: string }>;
  explained_variance: number[];
  loadings: Loading[];
}

// Helpers

function getProjectionPoints(result: ReductionResult): ProjectionPoint[] {
  if (result.projection?.length) return result.projection;
  if (result.points?.length) {
    return result.points.map(p => ({ x: p.x, y: p.y, label: p.label }));
  }
  return [];
}

function buildScatterSeries(points: ProjectionPoint[]): ScatterSeries[] {
  const groups: Record<string, ProjectionPoint[]> = {};
  for (const pt of points) {
    const key = pt.cluster != null ? String(pt.cluster) : pt.label || 'unlabelled';
    if (!groups[key]) groups[key] = [];
    groups[key].push(pt);
  }
  return Object.entries(groups).map(([name, pts], idx) => ({
    name,
    color: SCI_COLORS[idx % SCI_COLORS.length],
    data: pts.map(p => ({ x: p.x, y: p.y, label: p.label })),
  }));
}

function buildVarianceData(ev: number[]): SciBarDatum[] {
  const scale = ev[0] > 1 ? 1 : 100;
  return ev.map((v, i) => ({ label: `PC${i + 1}`, value: parseFloat((v * scale).toFixed(2)) }));
}

function buildLoadingsData(loadings: Loading[]): SciBarDatum[] {
  return [...loadings]
    .sort((a, b) => Math.abs(b.pc1) - Math.abs(a.pc1))
    .slice(0, 10)
    .map(l => ({
      label: l.feature,
      value: parseFloat(l.pc1.toFixed(4)),
      color: l.pc1 >= 0 ? '#22D3EE' : '#F43F5E',
    }));
}

// Component

export const DimensionalityReductionPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const { columns } = useColumnIntelligence(clientId, apiBase);
  const [method, setMethod] = useState<'pca' | 'tsne' | 'umap'>('pca');
  const [targetCol, setTargetCol] = useState('');
  const [nClusters, setNClusters] = useState<number>(0);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ReductionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (columns.length > 0) {
      const numericNames = columns
        .filter(c => c.role === 'DESCRIPTOR' || c.role === 'ENDPOINT')
        .map(c => c.name);
      setSelectedFeatures(numericNames);
      const catCol = columns.find(c => c.role === 'CATEGORICAL');
      if (catCol) setTargetCol(catCol.name);
    }
  }, [columns]);

  const toggleFeature = (name: string) => {
    setSelectedFeatures(prev =>
      prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]
    );
  };

  const handleSelectAll = () => {
    setSelectedFeatures(
      columns.filter(c => c.role === 'DESCRIPTOR' || c.role === 'ENDPOINT').map(c => c.name)
    );
  };

  const handleClearAll = () => setSelectedFeatures([]);

  const runReduction = async () => {
    if (selectedFeatures.length < 2) {
      toast.error('Select at least 2 features for reduction');
      return;
    }
    setIsLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append('method', method);
    form.append('features', selectedFeatures.join(','));
    if (targetCol && nClusters === 0) form.append('target_col', targetCol);
    if (nClusters > 1) form.append('n_clusters', nClusters.toString());

    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/dimensionality-reduction`, {
        method: 'POST',
        body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Dimensionality reduction failed');
      setResult(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Derived data
  const projectionPoints = result ? getProjectionPoints(result) : [];
  const scatterSeries = buildScatterSeries(projectionPoints);
  const varianceData = result?.explained_variance?.length ? buildVarianceData(result.explained_variance) : [];
  const loadingsData = result?.loadings?.length ? buildLoadingsData(result.loadings) : [];
  const isPca = result?.method?.toLowerCase().includes('pca');
  const rawEv = result?.explained_variance ?? [];
  const scale = rawEv[0] > 1 ? 1 : 100;
  const cumulativeVariance = rawEv.reduce((a, b) => a + b, 0) * scale;
  const legendItems = scatterSeries.map((s, i) => ({
    label: s.name,
    color: s.color || SCI_COLORS[i % SCI_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Dimensionality Reduction Controls
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Algorithm</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value as 'pca' | 'tsne' | 'umap')}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs focus:outline-none focus:border-cyan-400/30"
            >
              <option value="pca">PCA (Principal Component Analysis)</option>
              <option value="tsne">t-SNE (t-Distributed Stochastic Neighbor Embedding)</option>
              <option value="umap">UMAP (Uniform Manifold Approximation)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Color By</label>
            <select
              value={targetCol}
              disabled={nClusters > 0}
              onChange={e => setTargetCol(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs focus:outline-none focus:border-cyan-400/30 disabled:opacity-40"
            >
              <option value="">-- No coloring --</option>
              {columns.map(c => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">K-Means Clusters</label>
            <select
              value={nClusters}
              onChange={e => setNClusters(parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs focus:outline-none focus:border-cyan-400/30"
            >
              <option value={0}>Disabled (Use color by)</option>
              {[2, 3, 4, 5, 6, 7, 8].map(k => (
                <option key={k} value={k}>Fit {k} Clusters</option>
              ))}
            </select>
          </div>
        </div>

        {/* Feature checkboxes */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              Select Descriptors to Project ({selectedFeatures.length} /{' '}
              {columns.filter(c => c.role === 'DESCRIPTOR' || c.role === 'ENDPOINT').length} selected)
            </span>
            <div className="flex gap-2">
              <button onClick={handleSelectAll} className="text-[9px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
                Select All
              </button>
              <span className="text-slate-700">|</span>
              <button onClick={handleClearAll} className="text-[9px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
                Clear All
              </button>
            </div>
          </div>
          <div className="max-h-24 overflow-y-auto p-2 rounded-lg bg-white/[0.03] border border-white/[0.05] grid grid-cols-4 gap-2">
            {columns
              .filter(c => c.role === 'DESCRIPTOR' || c.role === 'ENDPOINT')
              .map(c => (
                <label key={c.name} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedFeatures.includes(c.name)}
                    onChange={() => toggleFeature(c.name)}
                    className="rounded bg-white/[0.03] border-white/[0.05] text-cyan-400 focus:ring-cyan-400"
                  />
                  <span className="truncate" title={c.name}>{c.name}</span>
                </label>
              ))}
          </div>
        </div>

        <button
          onClick={runReduction}
          disabled={isLoading || selectedFeatures.length < 2}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-400/[0.07] border border-cyan-400/20 text-cyan-300 text-xs font-bold hover:bg-cyan-400/[0.12] transition-all disabled:opacity-40"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              Projecting space...
            </>
          ) : (
            <>
              <Layers className="w-3.5 h-3.5" />
              Project Space
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && !result && (
        <div className="flex items-center justify-center py-10 gap-2 text-cyan-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-semibold">Scaling data and computing projection mapping...</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Scatter projection */}
          <SciPanel
            title={`PROJECTION — ${result.method.toUpperCase()}`}
            height={320}
            stats={projectionPoints.length > 0 ? [{ label: 'points', value: projectionPoints.length }] : []}
          >
            {projectionPoints.length > 0 ? (
              <>
                <SciScatter
                  series={scatterSeries}
                  height={280}
                  xLabel="Dimension 1"
                  yLabel="Dimension 2"
                  dotRadius={3}
                />
                {legendItems.length > 0 && <SciLegend items={legendItems} />}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-600 text-xs">
                No projection data returned.
              </div>
            )}
          </SciPanel>

          {/* PCA: variance + loadings */}
          {isPca && (
            <div className="grid grid-cols-3 gap-4">
              {/* Scree */}
              <div className="col-span-1 space-y-3">
                <SciPanel
                  title="EXPLAINED VARIANCE"
                  height={200}
                  stats={cumulativeVariance > 0 ? [{ label: 'cumulative', value: `${cumulativeVariance.toFixed(1)}%` }] : []}
                >
                  {varianceData.length > 0 ? (
                    <SciBar
                      data={varianceData}
                      height={160}
                      color={SCI_COLORS[0]}
                      yLabel="%"
                      barAccentStroke
                      maxBarSize={28}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-600 text-xs">No variance data.</div>
                  )}
                </SciPanel>

                {cumulativeVariance > 0 && (
                  <div className="flex gap-1.5 p-2.5 rounded-lg bg-cyan-400/[0.04] border border-cyan-400/10 text-[10px] text-cyan-300 leading-normal">
                    <Info className="w-3.5 h-3.5 shrink-0 text-cyan-400 mt-px" />
                    <span>
                      Top {varianceData.length} PC{varianceData.length !== 1 ? 's' : ''} capture{' '}
                      <strong>{cumulativeVariance.toFixed(2)}%</strong> of total variance.
                    </span>
                  </div>
                )}
              </div>

              {/* PC1 Loadings */}
              <div className="col-span-2 space-y-2">
                <SciPanel
                  title="PC1 LOADING VECTORS"
                  subtitle="top 10 weights by magnitude"
                  height={200}
                >
                  {loadingsData.length > 0 ? (
                    <SciBar
                      data={loadingsData}
                      height={160}
                      horizontal
                      useSeriesColors
                      barAccentStroke
                      maxBarSize={14}
                      domain={[-1, 1]}
                      referenceLine={0}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-600 text-xs">No loadings data.</div>
                  )}
                </SciPanel>

                <div className="flex gap-4 px-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm" style={{ background: '#22D3EE' }} />
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Positive loading</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm" style={{ background: '#F43F5E' }} />
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Negative loading</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
