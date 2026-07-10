import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, Search, ArrowRightLeft, BarChart3, Database, SlidersHorizontal } from 'lucide-react';
import { useColumnIntelligence } from '../../../hooks/useColumnIntelligence';
import { SciScatter } from '../../../components/charts/SciScatter';
import { SciPanel } from '../../../components/charts/SciPanel';
import { SciBar } from '../../../components/charts/SciBar';

interface PanelProps {
  clientId: string;
  apiBase: string;
}

interface MatrixCell {
  col_a: string;
  col_b: string;
  i: number;
  j: number;
  value: number | null;
  p_value?: number | null;
}

interface StrongCorr {
  col_a: string;
  col_b: string;
  correlation: number;
  strength: string;
  direction: string;
}

interface VifItem {
  feature: string;
  vif: number | null;
}

interface ScatterPoint {
  x: number;
  y: number;
  label: string;
  smiles?: string;
}

interface ScatterData {
  col_x: string;
  col_y: string;
  r: number;
  p_value: number;
  r2: number;
  spearman_rho: number;
  slope: number;
  intercept: number;
  verdict: string;
  points: ScatterPoint[];
}

function getSigStar(p?: number | null): string {
  if (p === null || p === undefined) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

const TAB_STYLE = (active: boolean) =>
  `px-4 py-2.5 text-xs font-bold border-b-2 transition-all -mb-px flex items-center gap-2 ${
    active
      ? 'border-cyan-400 text-cyan-400 bg-cyan-950/10'
      : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.01]'
  }`;

const METHOD_STYLE = (active: boolean) =>
  `px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase transition-all border ${
    active
      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
      : 'bg-white/[0.02] border-white/[0.05] text-slate-500 hover:text-slate-300'
  }`;

export const CorrelationPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const { columns } = useColumnIntelligence(clientId, apiBase);
  const [matrixData, setMatrixData] = useState<any>(null);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [method, setMethod] = useState<'pearson' | 'spearman' | 'kendall'>('pearson');
  const [activeSubTab, setActiveSubTab] = useState<'explorer' | 'endpoint' | 'vif'>('explorer');

  // Interactive explorer states
  const [colX, setColX] = useState<string>('');
  const [colY, setColY] = useState<string>('');
  const [scatterData, setScatterData] = useState<ScatterData | null>(null);
  const [loadingScatter, setLoadingScatter] = useState(false);
  const [scatterError, setScatterError] = useState<string | null>(null);
  const [explorerTab, setExplorerTab] = useState<'CHART' | 'TABLE'>('CHART');

  // Search & Filter Index states
  const [searchQuery, setSearchQuery] = useState('');
  const [minAbsR, setMinAbsR] = useState(0.3);

  // Filter numeric columns
  const numericColumns = useMemo(() => {
    return columns.filter(c => /int|float|num/i.test(c.dtype) || c.role === 'ENDPOINT');
  }, [columns]);

  // Load matrix & strong correlations
  const loadMatrix = async () => {
    setLoadingMatrix(true);
    setMatrixError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/correlation?method=${method}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Correlation calculation failed');
      setMatrixData(d);

      // Auto-set default variables for scatter plot if not set
      if (d.columns && d.columns.length >= 2) {
        if (!colX || !d.columns.includes(colX)) setColX(d.columns[0]);
        if (!colY || !d.columns.includes(colY)) {
          // Try to select endpoint or second column
          const endpointCol = columns.find(c => c.role === 'ENDPOINT')?.name;
          if (endpointCol && d.columns.includes(endpointCol) && endpointCol !== d.columns[0]) {
            setColY(endpointCol);
          } else {
            setColY(d.columns[1]);
          }
        }
      }
    } catch (e: any) {
      setMatrixError(e.message);
    } finally {
      setLoadingMatrix(false);
    }
  };

  useEffect(() => {
    if (clientId) loadMatrix();
  }, [clientId, method, columns]);

  // Fetch scatter plot data on variable selection change
  const loadScatterData = async () => {
    if (!colX || !colY) return;
    setLoadingScatter(true);
    setScatterError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/scatter-data?col_x=${encodeURIComponent(colX)}&col_y=${encodeURIComponent(colY)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Failed to fetch scatter details');
      setScatterData(d);
    } catch (e: any) {
      setScatterError(e.message);
      setScatterData(null);
    } finally {
      setLoadingScatter(false);
    }
  };

  useEffect(() => {
    loadScatterData();
  }, [colX, colY, clientId]);

  const cols: string[] = matrixData?.columns || [];
  const matrix: MatrixCell[] = matrixData?.matrix || [];
  const strong: StrongCorr[] = matrixData?.strong_correlations || [];
  const vifList: VifItem[] = matrixData?.vif || [];

  // Filter pairs for search index
  const filteredPairs = useMemo(() => {
    const list: Array<{ col_a: string; col_b: string; r: number; p: number; stars: string }> = [];
    // Only add upper triangle of correlation matrix to avoid duplicate pairs
    const seen = new Set<string>();
    matrix.forEach(cell => {
      if (cell.col_a === cell.col_b || cell.value === null) return;
      const key = [cell.col_a, cell.col_b].sort().join('::');
      if (seen.has(key)) return;
      seen.add(key);

      const val = cell.value;
      const p = cell.p_value ?? 1.0;
      if (Math.abs(val) < minAbsR) return;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        if (!cell.col_a.toLowerCase().includes(q) && !cell.col_b.toLowerCase().includes(q)) {
          return;
        }
      }

      list.push({
        col_a: cell.col_a,
        col_b: cell.col_b,
        r: val,
        p,
        stars: getSigStar(p)
      });
    });

    return list.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  }, [matrix, searchQuery, minAbsR]);

  // Endpoint correlations
  const endpointCol = columns.find(c => c.role === 'ENDPOINT')?.name || '';
  const endpointCorrs = useMemo(() =>
    matrix
      .filter(c => c.col_a === endpointCol && c.col_b !== endpointCol)
      .map(c => ({
        label: c.col_b,
        value: c.value ?? 0,
        color: (c.value ?? 0) >= 0 ? '#22D3EE' : '#F43F5E',
      }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  , [matrix, endpointCol]);

  // VIF chart data
  const vifChartData = useMemo(() =>
    vifList.map(v => ({
      label: v.feature,
      value: v.vif ?? 0,
      color: v.vif === null ? '#94A3B8'
        : v.vif > 10 ? '#F43F5E'
        : v.vif > 5 ? '#FACC15'
        : '#34D399',
    }))
  , [vifList]);

  // Render scatter series & regression line
  const scatterSeries = useMemo(() => {
    if (!scatterData) return [];
    return [{
      name: `${scatterData.col_x} vs ${scatterData.col_y}`,
      data: scatterData.points
    }];
  }, [scatterData]);

  const regressionLine = useMemo(() => {
    if (!scatterData || scatterData.points.length === 0) return undefined;
    const xs = scatterData.points.map(p => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    return {
      start: { x: minX, y: scatterData.slope * minX + scatterData.intercept },
      end: { x: maxX, y: scatterData.slope * maxX + scatterData.intercept },
      color: '#FB7185' // soft rose line
    };
  }, [scatterData]);

  const handleDownloadPairCSV = () => {
    if (!scatterData) return;
    const headers = ['Label', scatterData.col_x, scatterData.col_y, 'SMILES'];
    const rows = scatterData.points.map(p => [
      p.label,
      p.x,
      p.y,
      p.smiles || ''
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `correlation_${scatterData.col_x}_vs_${scatterData.col_y}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex border-b border-white/[0.05] flex-wrap gap-1">
        <button onClick={() => setActiveSubTab('explorer')} className={TAB_STYLE(activeSubTab === 'explorer')}>
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Interactive Pair Explorer
        </button>
        {endpointCol && (
          <button onClick={() => setActiveSubTab('endpoint')} className={TAB_STYLE(activeSubTab === 'endpoint')}>
            <BarChart3 className="w-3.5 h-3.5" />
            vs Endpoint ({endpointCol})
          </button>
        )}
        <button onClick={() => setActiveSubTab('vif')} className={TAB_STYLE(activeSubTab === 'vif')}>
          <Database className="w-3.5 h-3.5" />
          VIF Analysis
        </button>

        <div className="ml-auto flex items-center gap-1 pb-px">
          {(['pearson', 'spearman', 'kendall'] as const).map(m => (
            <button key={m} onClick={() => setMethod(m)} className={METHOD_STYLE(method === m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {matrixError && (
        <div className="flex items-center gap-2 p-3 rounded bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {matrixError}
        </div>
      )}

      {/* Loading */}
      {loadingMatrix && (
        <div className="flex items-center justify-center h-48 gap-2 text-cyan-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11 }}>
            Computing {method} correlation matrix…
          </span>
        </div>
      )}

      {/* ── INTERACTIVE PAIR EXPLORER TAB ── */}
      {activeSubTab === 'explorer' && cols.length > 0 && !loadingMatrix && (
        <div className="space-y-6">
          
          {/* selectors */}
          <div className="flex items-center gap-4 flex-wrap bg-[#070d1a] border border-white/[0.04] p-4 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-mono text-slate-500">Variable X:</span>
              <select
                value={colX}
                onChange={e => setColX(e.target.value)}
                className="bg-[#0b1224] border border-white/[0.08] text-white rounded-lg px-3 py-1.5 text-xs font-mono focus:border-cyan-400 outline-none"
              >
                {numericColumns.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-mono text-slate-500">Variable Y:</span>
              <select
                value={colY}
                onChange={e => setColY(e.target.value)}
                className="bg-[#0b1224] border border-white/[0.08] text-white rounded-lg px-3 py-1.5 text-xs font-mono focus:border-cyan-400 outline-none"
              >
                {numericColumns.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            {loadingScatter && (
              <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Updating fit...
              </div>
            )}
          </div>

          {scatterError && (
            <div className="flex items-center gap-2 p-3 rounded bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              {scatterError}
            </div>
          )}

          {/* Interactive Scatter with Right Sidebar Stats */}
          {scatterData && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              
              {/* Plot Card (75% width) */}
              <div className="lg:col-span-3">
                <SciPanel
                  title={`${colX.toUpperCase()} vs ${colY.toUpperCase()}`}
                  subtitle="Scatter plot with linear regression fit line"
                  stats={[
                    { label: 'Sample size', value: scatterData.points.length },
                    { label: 'Pearson r', value: scatterData.r.toFixed(4) },
                  ]}
                  height={320}
                  rawData={scatterData.points}
                >
                  {explorerTab === 'CHART' ? (
                    <SciScatter
                      series={scatterSeries}
                      xLabel={colX}
                      yLabel={colY}
                      regressionLine={regressionLine}
                      height={280}
                      tooltipFormatter={(pt) => (
                        <div className="space-y-1 text-slate-300 font-mono text-xs">
                          <div className="text-[10px] uppercase font-bold text-cyan-400">{pt.label}</div>
                          <div>X ({colX}): <span className="text-white font-semibold">{pt.x.toFixed(4)}</span></div>
                          <div>Y ({colY}): <span className="text-white font-semibold">{pt.y.toFixed(4)}</span></div>
                          {pt.smiles && <div className="text-[9px] text-slate-500 break-all max-w-[200px] mt-1">{pt.smiles}</div>}
                        </div>
                      )}
                    />
                  ) : (
                    <div style={{ height: 285, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 6 }}>
                      <table className="w-full text-left font-mono text-[11px] border-collapse">
                        <thead className="bg-[#0b1224] sticky top-0 text-slate-400 border-b border-white/[0.06]">
                          <tr>
                            <th className="p-2 border-r border-white/[0.04]">LABEL</th>
                            <th className="p-2 border-r border-white/[0.04]">{colX}</th>
                            <th className="p-2 border-r border-white/[0.04]">{colY}</th>
                            <th className="p-2">SMILES</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Cap table rows to 500 to prevent DOM bloat — full stats computed server-side */}
                          {scatterData.points.slice(0, 500).map((pt, i) => (
                            <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.01]">
                              <td className="p-2 border-r border-white/[0.04] text-slate-400">{pt.label}</td>
                              <td className="p-2 border-r border-white/[0.04] text-cyan-300 font-semibold">{pt.x.toFixed(4)}</td>
                              <td className="p-2 border-r border-white/[0.04] text-cyan-300 font-semibold">{pt.y.toFixed(4)}</td>
                              <td className="p-2 text-slate-500 truncate max-w-[200px]" title={pt.smiles}>{pt.smiles || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SciPanel>
              </div>

              {/* Sidebar Stats Panel (25% width) */}
              <div className="bg-[#070d19] border border-white/[0.05] rounded-2xl p-4 flex flex-col justify-between">
                
                {/* Stats cards list */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-white/[0.05] pb-2 mb-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Analysis Workbench</span>
                    {/* chart vs table toggle */}
                    <div className="flex rounded-md overflow-hidden bg-slate-900 border border-white/[0.05]">
                      <button
                        onClick={() => setExplorerTab('CHART')}
                        className={`px-2 py-1 text-[9px] font-bold uppercase transition-all ${explorerTab === 'CHART' ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-500'}`}
                      >
                        Chart
                      </button>
                      <button
                        onClick={() => setExplorerTab('TABLE')}
                        className={`px-2 py-1 text-[9px] font-bold uppercase transition-all ${explorerTab === 'TABLE' ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-500'}`}
                      >
                        Data
                      </button>
                    </div>
                  </div>

                  {/* Pearson card */}
                  <div className="bg-[#0a1122] border border-white/[0.03] p-3 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-[9px] font-mono uppercase text-slate-500">Pearson r</div>
                      <div className="text-lg font-mono font-bold text-cyan-300">
                        {scatterData.r.toFixed(4)}
                        <span className="text-yellow-400 text-xs ml-1">{getSigStar(scatterData.p_value)}</span>
                      </div>
                    </div>
                    <div className="text-[9px] font-mono text-slate-500 text-right">
                      p={scatterData.p_value < 0.001 ? '<.001' : scatterData.p_value.toFixed(4)}
                    </div>
                  </div>

                  {/* Spearman card */}
                  <div className="bg-[#0a1122] border border-white/[0.03] p-3 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-[9px] font-mono uppercase text-slate-500">Spearman &rho;</div>
                      <div className="text-lg font-mono font-bold text-cyan-300">{scatterData.spearman_rho.toFixed(4)}</div>
                    </div>
                    <div className="text-[9px] text-slate-500">Rank-Order</div>
                  </div>

                  {/* R-squared card */}
                  <div className="bg-[#0a1122] border border-white/[0.03] p-3 rounded-xl">
                    <div className="text-[9px] font-mono uppercase text-slate-500">Determination R&sup2;</div>
                    <div className="text-lg font-mono font-bold text-emerald-400">{(scatterData.r2 * 100).toFixed(1)}%</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Explained variance fraction</div>
                  </div>

                  {/* Verdict and equation */}
                  <div className="p-3 bg-white/[0.01] rounded-xl border border-white/[0.03]">
                    <div className="text-[9px] uppercase font-mono text-slate-500 mb-1">Regression Fit Equation</div>
                    <div className="text-xs font-mono font-semibold text-slate-300">
                      Y = {scatterData.slope.toFixed(4)}*X + {scatterData.intercept.toFixed(4)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-2 font-mono leading-relaxed bg-[#0a1122] p-2 rounded-lg border border-white/[0.02]">
                      {scatterData.verdict}
                    </div>
                  </div>

                </div>

                {/* Export & Action buttons */}
                <div className="space-y-2 mt-4">
                  <button
                    onClick={handleDownloadPairCSV}
                    className="w-full py-2 bg-slate-900 border border-white/[0.08] hover:bg-slate-800 transition-all rounded-xl text-slate-300 font-bold text-xs"
                  >
                    Export Pair CSV Data
                  </button>
                </div>

              </div>

            </div>
          )}

          {/* ── SIGNIFICANT CORRELATION SEARCH INDEX ── */}
          <div className="space-y-3 bg-[#070d19] border border-white/[0.05] p-5 rounded-3xl">
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-white/[0.04] pb-3 mb-2">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Significant Correlation Index</h3>
                <p className="text-[10px] text-slate-500">Search and filter descriptor correlation pairs directly</p>
              </div>
              
              {/* Filters */}
              <div className="flex items-center gap-4 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search variables..."
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-[#0b1224] border border-white/[0.08] text-white text-xs font-mono focus:border-cyan-400 outline-none w-48"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                </div>

                {/* min r slider */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">Min |r|:</span>
                  <input
                    type="range"
                    min="0.0"
                    max="0.95"
                    step="0.05"
                    value={minAbsR}
                    onChange={e => setMinAbsR(parseFloat(e.target.value))}
                    className="w-24 accent-cyan-400"
                  />
                  <span className="text-xs font-mono font-bold text-cyan-300 min-w-[28px]">{minAbsR.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* List Table */}
            {filteredPairs.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500 font-mono">
                No correlation pairs matching criteria found.
              </div>
            ) : (
              <div style={{ maxHeight: 250, overflowY: 'auto' }} className="border border-white/[0.04] rounded-lg">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead className="bg-[#0b1224] text-slate-400 sticky top-0 border-b border-white/[0.06] z-10">
                    <tr>
                      <th className="p-2.5">Variable A</th>
                      <th className="p-2.5">Variable B</th>
                      <th className="p-2.5">r Value</th>
                      <th className="p-2.5">p-Value</th>
                      <th className="p-2.5">Significance</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPairs.map((p, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-white/[0.02] hover:bg-cyan-500/[0.03] transition-all cursor-pointer"
                        onClick={() => {
                          setColX(p.col_a);
                          setColY(p.col_b);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        <td className="p-2.5 text-slate-300 font-semibold">{p.col_a}</td>
                        <td className="p-2.5 text-slate-300 font-semibold">{p.col_b}</td>
                        <td className={`p-2.5 font-bold ${p.r >= 0 ? 'text-cyan-300' : 'text-rose-400'}`}>
                          {p.r.toFixed(4)}
                        </td>
                        <td className="p-2.5 text-slate-400">
                          {p.p < 0.0001 ? '< 0.0001' : p.p.toFixed(4)}
                        </td>
                        <td className="p-2.5 text-yellow-400">{p.stars || 'n.s.'}</td>
                        <td className="p-2.5 text-right">
                          <button
                            className="px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 rounded hover:bg-cyan-500/20 text-[10px] font-bold uppercase transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              setColX(p.col_a);
                              setColY(p.col_b);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            Explore Fit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="text-[10px] text-slate-500 font-mono flex gap-4">
              <span>Significance Stars: <span className="text-yellow-400">*** p&lt;0.001  ** p&lt;0.01  * p&lt;0.05</span></span>
              <span>Showing {filteredPairs.length} correlation pairs.</span>
            </div>

          </div>

        </div>
      )}

      {/* ── vs Endpoint tab ── */}
      {activeSubTab === 'endpoint' && endpointCol && !loadingMatrix && (
        <SciPanel
          title={`DESCRIPTOR CORRELATIONS vs ${endpointCol.toUpperCase()}`}
          subtitle="Absolute r values sorted descending"
          height={320}
        >
          <SciBar
            data={endpointCorrs}
            useSeriesColors={true}
            height={280}
            yLabel="r value"
            referenceLine={0}
            domain={[-1, 1]}
          />
        </SciPanel>
      )}

      {/* ── VIF tab ── */}
      {activeSubTab === 'vif' && !loadingMatrix && (
        vifList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 rounded-xl bg-slate-500/5 border border-white/[0.05] text-center gap-3">
            <AlertCircle className="w-8 h-8 text-cyan-400" />
            <div className="text-white font-bold text-sm">VIF Analysis Unavailable</div>
            <p className="text-xs text-slate-500 max-w-md leading-relaxed">
              Variance Inflation Factor (VIF) calculation requires an over-determined system where the number of numeric samples (rows) exceeds the number of descriptors (columns) + 2.
            </p>
            <div className="text-[10px] text-slate-400 bg-white/[0.02] border border-white/[0.04] rounded px-3 py-1.5 font-mono">
              Rows: {matrixData?.row_count ?? 0} | Descriptors: {cols.length} (Needed: &gt; {cols.length + 2} rows)
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <SciPanel title="VARIANCE INFLATION FACTOR" height={280}>
                <SciBar
                  data={vifChartData}
                  useSeriesColors={true}
                  height={240}
                  yLabel="VIF"
                  referenceLine={5}
                  referenceLabel="VIF=5"
                />
              </SciPanel>
            </div>
            <div style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: '12px 14px', fontSize: 11, fontFamily: 'Geist Mono, monospace', lineHeight: 1.9 }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                VIF Guide
              </div>
              {[
                { range: '< 5', label: 'Acceptable', color: '#34D399' },
                { range: '5–10', label: 'Moderate', color: '#FACC15' },
                { range: '> 10', label: 'High', color: '#F43F5E' },
              ].map(row => (
                <div key={row.range} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ color: row.color, fontWeight: 600, minWidth: 32 }}>{row.range}</span>
                  <span style={{ color: '#94A3B8', fontSize: 10 }}>{row.label}</span>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
};
