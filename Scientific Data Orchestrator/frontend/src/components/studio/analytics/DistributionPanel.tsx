import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, BarChart2, Grid, Sliders, ArrowRight } from 'lucide-react';
import { useColumnIntelligence } from '../../../hooks/useColumnIntelligence';
import { SciPanel } from '../../../components/charts/SciPanel';
import { SciHistogram } from '../../../components/charts/SciHistogram';
import { SciScatter } from '../../../components/charts/SciScatter';

interface PanelProps {
  clientId: string;
  apiBase: string;
}

interface NormalityResult {
  column: string;
  n: number;
  skewness: number;
  kurtosis: number;
  is_normal: boolean;
  shapiro_w: number;
  shapiro_p: number;
  log_is_normal: boolean;
  recommended_transform: string;
}

// ─── Compact mono stat strip ───────────────────────────────────────────────
const MONO: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 11,
};

interface StatItem {
  label: string;
  value: string | number | undefined | null;
  accent?: string;
}

const KpiStrip: React.FC<{ stats: StatItem[] }> = ({ stats }) => (
  <div style={{ display: 'flex', gap: 24, padding: '8px 0', flexWrap: 'wrap', ...MONO }}>
    {stats.map((s) => (
      <span key={s.label}>
        <span style={{ color: '#64748B' }}>{s.label} </span>
        <span style={{ color: s.accent ?? '#22D3EE', fontWeight: 600 }}>
          {s.value ?? '—'}
        </span>
      </span>
    ))}
  </div>
);

// ─── Severity dot ──────────────────────────────────────────────────────────
const SeverityDot: React.FC<{ isNormal: boolean }> = ({ isNormal }) => (
  <span
    style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: isNormal ? '#10B981' : '#F59E0B',
      flexShrink: 0,
    }}
  />
);

// ─── Main component ────────────────────────────────────────────────────────
export const DistributionPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const { columns } = useColumnIntelligence(clientId, apiBase);
  const [col, setCol] = useState('');
  const [bins, setBins] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useLog, setUseLog] = useState(false);
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');

  // Batch states
  const [batchData, setBatchData] = useState<NormalityResult[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  // Auto-detect numeric column
  useEffect(() => {
    if (columns.length > 0) {
      const numericCol = columns.find(c => c.role === 'ENDPOINT' || c.role === 'DESCRIPTOR');
      if (numericCol) {
        setCol(numericCol.name);
      }
    }
  }, [columns]);

  const loadSingle = async (targetCol?: string) => {
    const activeCol = targetCol || col;
    if (!activeCol) {
      setError('Please select a column name');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/distribution?col=${encodeURIComponent(activeCol)}&bins=${bins}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Failed to evaluate distribution');
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadBatch = async () => {
    setBatchLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/distribution-batch`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Failed to run batch analysis');
      setBatchData(d.columns);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBatchLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'batch') {
      loadBatch();
    }
  }, [activeTab]);

  // ── Map API histogram data → SciHistogram bins ──────────────────────────
  const rawHistogram = useLog ? (data?.log_histogram ?? []) : (data?.histogram ?? []);
  const histogramBins = rawHistogram.map((b: any) => ({
    x0: b.bin_start ?? 0,
    x1: b.bin_end ?? 0,
    count: b.count ?? 0,
    density: b.frequency ?? 0,
    kde: b.kde_value ?? 0,
  }));

  // ── Map API QQ data → SciScatter series ─────────────────────────────────
  const qqData = data?.qq_data || [];
  const scatterSeries = [
    {
      name: 'QQ',
      data: qqData.map((d: any) => ({ x: d.theoretical, y: d.empirical })),
    },
  ];

  // ── Tab class helper ──────────────────────────────────────────────────────
  const tabCls = (tab: 'single' | 'batch') =>
    `flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all -mb-px ${
      activeTab === tab
        ? 'border-cyan-400/60 text-cyan-300'
        : 'border-transparent text-slate-500 hover:text-slate-300'
    }`;

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex border-b border-white/[0.06]">
        <button onClick={() => setActiveTab('single')} className={tabCls('single')}>
          <Sliders className="w-3.5 h-3.5" />
          Normality Lab
        </button>
        <button onClick={() => setActiveTab('batch')} className={tabCls('batch')}>
          <Grid className="w-3.5 h-3.5" />
          Batch Normality Assessment
        </button>
      </div>

      {/* ── Single Column Tab ─────────────────────────────────────────────── */}
      {activeTab === 'single' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
                Select Numeric Column
              </label>
              <select
                value={col}
                onChange={e => setCol(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs focus:outline-none focus:border-cyan-400/30"
              >
                <option value="">-- Choose Column --</option>
                {columns
                  .filter(c => c.role === 'ENDPOINT' || c.role === 'DESCRIPTOR' || c.role === 'UNKNOWN')
                  .map(c => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.role})
                    </option>
                  ))}
              </select>
            </div>

            <div className="w-24">
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
                Bins
              </label>
              <input
                type="number"
                min={5}
                max={100}
                value={bins}
                onChange={e => setBins(parseInt(e.target.value) || 30)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs focus:outline-none focus:border-cyan-400/30"
              />
            </div>

            <button
              onClick={() => loadSingle()}
              disabled={loading || !col}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-bold hover:bg-cyan-500/20 transition-all disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  Analyzing...
                </>
              ) : (
                <>
                  <BarChart2 className="w-3.5 h-3.5" />
                  Analyze Distribution
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {data && (
            <div className="space-y-4">
              {/* ── Compact KPI strip ─────────────────────────────────────── */}
              <KpiStrip
                stats={[
                  { label: 'N', value: data.count?.toLocaleString() },
                  { label: 'mean', value: data.mean?.toFixed(4) },
                  { label: 'std', value: data.std?.toFixed(4) },
                  {
                    label: 'skew',
                    value: data.skewness?.toFixed(3),
                    accent: Math.abs(data.skewness ?? 0) > 2 ? '#F59E0B' : '#22D3EE',
                  },
                  { label: 'kurt', value: data.kurtosis?.toFixed(3) },
                ]}
              />

              {/* ── Compact normality strip ──────────────────────────────── */}
              {data.normality && (
                <div
                  style={{
                    ...MONO,
                    padding: '6px 10px',
                    borderRadius: 4,
                    border: '1px solid rgba(255,255,255,0.05)',
                    background: 'rgba(255,255,255,0.012)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ color: '#64748B' }}>
                    SW W=
                    <span style={{ color: '#F1F5F9' }}>
                      {data.normality.statistic?.toFixed(4) ?? '—'}
                    </span>
                    {'  '}p=
                    <span style={{ color: '#F1F5F9' }}>
                      {data.normality.p_value?.toFixed(4) ?? '—'}
                    </span>
                    {'  '}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: data.normality.is_normal ? '#10B981' : '#F59E0B',
                    }}
                  >
                    [{data.normality.is_normal ? 'Normal' : 'Non-Normal'}]
                  </span>
                </div>
              )}

              {/* ── Charts: Histogram + QQ-Plot side by side ─────────────── */}
              <div className="grid grid-cols-2 gap-4">
                {/* Histogram */}
                <div className="space-y-1">
                  <div className="flex items-center justify-end px-1">
                    <button
                      onClick={() => setUseLog(v => !v)}
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border transition-all ${
                        useLog
                          ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300'
                          : 'bg-white/[0.03] border-white/[0.05] text-slate-400'
                      }`}
                    >
                      {useLog ? 'log\u2081\u2080 scale' : 'linear scale'}
                    </button>
                  </div>
                  <SciPanel title="DISTRIBUTION" height={290}>
                    <SciHistogram
                      bins={histogramBins}
                      mode="count"
                      showKDE={true}
                      mean={data.mean}
                      std={data.std}
                      height={260}
                    />
                  </SciPanel>
                </div>

                {/* QQ-Plot */}
                <SciPanel title="Q\u2013Q PLOT" height={290}>
                  {qqData.length > 0 ? (
                    <SciScatter
                      series={scatterSeries}
                      identityLine={true}
                      xLabel="Theoretical Quantiles"
                      yLabel="Sample Quantiles"
                      height={260}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-[10px] text-slate-600 font-mono">
                      QQ-plot not available
                    </div>
                  )}
                </SciPanel>
              </div>

              {/* ── Box-Cox Suggestion ──────────────────────────────────── */}
              {data.boxcox_lambda !== null && data.boxcox_lambda !== undefined && (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-300">
                      Box-Cox Power Transformation
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Optimal parameter \u03bb (lambda) estimated: {data.boxcox_lambda.toFixed(4)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">Recommendation:</span>
                    <span className="px-2 py-1 rounded bg-white/[0.04] border border-white/[0.05] text-cyan-300 text-[10px] font-mono font-bold uppercase">
                      {Math.abs(data.boxcox_lambda) < 0.25
                        ? 'log\u2081\u2080 transform'
                        : Math.abs(data.boxcox_lambda - 0.5) < 0.25
                        ? 'square root (\u221ax)'
                        : 'no transformation'}
                    </span>
                  </div>
                </div>
              )}

              {/* ── Percentiles ─────────────────────────────────────────── */}
              {data.percentiles && Object.keys(data.percentiles).length > 0 && (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
                    Percentiles
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {Object.entries(data.percentiles).map(([p, v]: any) => (
                      <div
                        key={p}
                        className="text-center p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                      >
                        <div className="text-xs font-bold text-cyan-300">
                          {v !== null ? Number(v).toFixed(3) : '\u2014'}
                        </div>
                        <div className="text-[9px] text-slate-600 uppercase">P{p}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Batch Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'batch' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Normality test across all columns
            </div>
            <button
              onClick={loadBatch}
              disabled={batchLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-xs font-bold text-slate-400 hover:text-slate-200 transition-all disabled:opacity-40"
            >
              {batchLoading && <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />}
              Reload Batch Analysis
            </button>
          </div>

          {batchLoading ? (
            <div className="flex items-center justify-center gap-2 text-cyan-400 py-10">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs font-semibold">Running normality audit...</span>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Column Name</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">N</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Skewness</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">W (SW)</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">p-value</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Normality</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Transform?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {batchData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2 font-mono text-slate-300">{row.column}</td>
                      <td className="px-3 py-2 text-slate-400">{row.n}</td>
                      <td className="px-3 py-2 text-slate-400">{row.skewness.toFixed(3)}</td>
                      <td className="px-3 py-2 text-slate-400 font-mono">{row.shapiro_w.toFixed(4)}</td>
                      <td className="px-3 py-2 text-slate-400 font-mono">{row.shapiro_p.toFixed(4)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <SeverityDot isNormal={row.is_normal} />
                          <span
                            style={{
                              ...MONO,
                              color: row.is_normal ? '#10B981' : '#F59E0B',
                              fontWeight: 600,
                            }}
                          >
                            {row.is_normal ? 'Normal' : 'Skewed'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {row.recommended_transform !== 'none' ? (
                          <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                            <span style={MONO}>{row.recommended_transform}</span>
                            <ArrowRight className="w-3 h-3 text-slate-500" />
                          </div>
                        ) : (
                          <span className="text-slate-500" style={MONO}>None required</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
