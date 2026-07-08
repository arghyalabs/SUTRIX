import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useColumnIntelligence } from '../../../hooks/useColumnIntelligence';
import { SciHeatmap } from '../../../components/charts/SciHeatmap';
import { SciBar } from '../../../components/charts/SciBar';
import { SciPanel } from '../../../components/charts/SciPanel';

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

function getSigStar(p?: number | null): string {
  if (p === null || p === undefined) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

const TAB_STYLE = (active: boolean) =>
  `px-3 py-2 text-xs font-semibold border-b-2 transition-all -mb-px ${
    active
      ? 'border-cyan-400/60 text-cyan-300'
      : 'border-transparent text-slate-500 hover:text-slate-300'
  }`;

const METHOD_STYLE = (active: boolean) =>
  `px-2 py-1 rounded text-[10px] font-bold uppercase transition-all border ${
    active
      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
      : 'bg-white/[0.02] border-white/[0.05] text-slate-500 hover:text-slate-300'
  }`;

export const CorrelationPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const { columns } = useColumnIntelligence(clientId, apiBase);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<'pearson' | 'spearman' | 'kendall'>('pearson');
  const [activeSubTab, setActiveSubTab] = useState<'heatmap' | 'endpoint' | 'vif'>('heatmap');
  const [overlayMode, setOverlayMode] = useState<'r' | 'p' | 'stars'>('r');
  const [sigFilter, setSigFilter] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/correlation?method=${method}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Correlation calculation failed');
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) load();
  }, [clientId, method]);

  const cols: string[] = data?.columns || [];
  const matrix: MatrixCell[] = data?.matrix || [];
  const strong: StrongCorr[] = data?.strong_correlations || [];
  const vifList: VifItem[] = data?.vif || [];

  // Build cell map
  const cellMap = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    matrix.forEach(c => m.set(`${c.i}-${c.j}`, c));
    return m;
  }, [matrix]);

  // Build SciHeatmap cells
  const heatmapCells = useMemo(() =>
    cols.flatMap((_, ri) =>
      cols.map((_, ci) => {
        const cell = cellMap.get(`${ri}-${ci}`);
        const value = cell?.value ?? 0;
        const p = cell?.p_value;
        const muted = sigFilter && p !== null && p !== undefined && p > 0.05;
        const displayVal = muted ? 0 : value;
        let label = '';
        if (overlayMode === 'r') label = value.toFixed(1);
        else if (overlayMode === 'p') label = p != null ? (p < 0.01 ? '<.01' : p.toFixed(2)) : '';
        else if (overlayMode === 'stars') label = getSigStar(p);
        return { row: ri, col: ci, value: displayVal, label };
      })
    )
  , [cols, cellMap, sigFilter, overlayMode]);

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

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex border-b border-white/[0.05] flex-wrap gap-1">
        <button onClick={() => setActiveSubTab('heatmap')} className={TAB_STYLE(activeSubTab === 'heatmap')}>
          Correlation Heatmap
        </button>
        {endpointCol && (
          <button onClick={() => setActiveSubTab('endpoint')} className={TAB_STYLE(activeSubTab === 'endpoint')}>
            vs Endpoint ({endpointCol})
          </button>
        )}
        <button onClick={() => setActiveSubTab('vif')} className={TAB_STYLE(activeSubTab === 'vif')}>
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
      {error && (
        <div className="flex items-center gap-2 p-3 rounded bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-32 gap-2 text-cyan-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11 }}>
            Computing {method} correlation matrix…
          </span>
        </div>
      )}

      {/* ── Heatmap tab ── */}
      {activeSubTab === 'heatmap' && cols.length > 0 && !loading && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Overlay:
            </span>
            {([{ id: 'r', label: 'r Value' }, { id: 'p', label: 'p-Value' }, { id: 'stars', label: 'Stars' }] as const).map(opt => (
              <button
                key={opt.id}
                onClick={() => setOverlayMode(opt.id as any)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 3,
                  border: `1px solid ${overlayMode === opt.id ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  background: overlayMode === opt.id ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.02)',
                  color: overlayMode === opt.id ? '#22D3EE' : '#64748B',
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 10,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Geist Mono, monospace', fontSize: 10, color: '#64748B', cursor: 'pointer', marginLeft: 8 }}>
              <input
                type="checkbox"
                checked={sigFilter}
                onChange={e => setSigFilter(e.target.checked)}
                style={{ accentColor: '#22D3EE' }}
              />
              Mute non-significant (p &gt; 0.05)
            </label>
          </div>

          {/* Heatmap */}
          <SciPanel
            title={`${method.toUpperCase()} CORRELATION MATRIX`}
            stats={[
              { label: 'features', value: cols.length },
              { label: 'strong pairs', value: strong.length },
            ]}
            height="auto"
          >
            <div style={{ padding: '4px 8px' }}>
              <SciHeatmap
                rowLabels={cols}
                colLabels={cols}
                cells={heatmapCells}
                mode="diverging"
                tooltipFormatter={(row, col, value) => {
                  const ri = cols.indexOf(row);
                  const ci = cols.indexOf(col);
                  const cell = cellMap.get(`${ri}-${ci}`);
                  return (
                    <div>
                      <div style={{ color: '#64748B', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", marginBottom: 4 }}>
                        {col} × {row}
                      </div>
                      <div>
                        <span style={{ color: '#94A3B8' }}>r </span>
                        <span style={{ color: value >= 0 ? '#22D3EE' : '#F43F5E', fontWeight: 600 }}>
                          {value.toFixed(4)}
                        </span>
                        {getSigStar(cell?.p_value) && (
                          <span style={{ color: '#FACC15', marginLeft: 6 }}>{getSigStar(cell?.p_value)}</span>
                        )}
                      </div>
                      {cell?.p_value != null && (
                        <div>
                          <span style={{ color: '#94A3B8' }}>p </span>
                          <span style={{ color: '#FACC15', fontWeight: 600 }}>
                            {cell.p_value < 0.0001 ? '< 0.0001' : cell.p_value.toFixed(4)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
            </div>
          </SciPanel>

          {/* Significance legend */}
          <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9, color: '#64748B', display: 'flex', gap: 16 }}>
            <span>Stars: <span style={{ color: '#FACC15' }}>*** p&lt;0.001  ** p&lt;0.01  * p&lt;0.05</span></span>
          </div>

          {/* Strong correlations table */}
          {strong.length > 0 && (
            <div style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#F1F5F9' }}>
                Strong Correlations (|r| &gt; 0.7) — {strong.length} pairs
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Geist Mono, monospace', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {['Column A', 'Column B', 'r', 'Strength', 'Dir.'].map(h => (
                      <th key={h} style={{ padding: '5px 10px', textAlign: 'left', fontSize: 9, color: '#64748B', fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {strong.map((s, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.025)', background: idx % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                      <td style={{ padding: '5px 10px', color: '#94A3B8', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.col_a}</td>
                      <td style={{ padding: '5px 10px', color: '#94A3B8', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.col_b}</td>
                      <td style={{ padding: '5px 10px', color: s.correlation >= 0 ? '#22D3EE' : '#F43F5E', fontWeight: 600 }}>{s.correlation.toFixed(3)}</td>
                      <td style={{ padding: '5px 10px', color: '#64748B', fontSize: 10 }}>{s.strength.replace('_', ' ')}</td>
                      <td style={{ padding: '5px 10px', color: s.direction === 'positive' ? '#34D399' : '#F43F5E', fontSize: 10 }}>
                        {s.direction === 'positive' ? '↑' : '↓'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── vs Endpoint tab ── */}
      {activeSubTab === 'endpoint' && endpointCol && !loading && (
        <SciPanel
          title={`DESCRIPTOR CORRELATIONS vs ${endpointCol.toUpperCase()}`}
          subtitle="Absolute r values sorted descending"
          height={300}
        >
          <SciBar
            data={endpointCorrs}
            useSeriesColors={true}
            height={260}
            yLabel="r value"
            referenceLine={0}
            domain={[-1, 1]}
          />
        </SciPanel>
      )}

      {/* ── VIF tab ── */}
      {activeSubTab === 'vif' && !loading && (
        vifList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 rounded-xl bg-slate-500/5 border border-white/[0.05] text-center gap-3">
            <AlertCircle className="w-8 h-8 text-cyan-400" />
            <div className="text-white font-bold text-sm">VIF Analysis Unavailable</div>
            <p className="text-xs text-slate-500 max-w-md leading-relaxed">
              Variance Inflation Factor (VIF) calculation requires an over-determined system where the number of numeric samples (rows) exceeds the number of descriptors (columns) + 2.
            </p>
            <div className="text-[10px] text-slate-400 bg-white/[0.02] border border-white/[0.04] rounded px-3 py-1.5 font-mono">
              Rows: {data?.row_count ?? 0} | Descriptors: {cols.length} (Needed: &gt; {cols.length + 2} rows)
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
