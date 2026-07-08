import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SciPanel } from '../../../components/charts/SciPanel';
import { SciHeatmap } from '../../../components/charts/SciHeatmap';
import { SciBar } from '../../../components/charts/SciBar';
import type { SciBarDatum } from '../../../components/charts/SciBar';

interface PanelProps {
  clientId: string;
  apiBase: string;
}

interface ColMissing {
  column: string;
  dtype: string;
  missing_count: number;
  missing_pct: number;
  present_count: number;
  unique_count: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

interface Classification {
  type: 'MAR' | 'MCAR';
  reason: string;
  correlations: { corr_col: string; r: number; p: number }[];
}

interface PatternRow {
  row: number;
  pattern: number[];
}

/** Severity → left-border hex colour */
const SEV_BORDER_COLOR: Record<string, string> = {
  CRITICAL: '#F43F5E',
  HIGH:     '#FB923C',
  MEDIUM:   '#FACC15',
  LOW:      '#38BDF8',
  NONE:     '#34D399',
};

/** Bar colour per missingness % threshold */
const barColor = (pct: number): string => {
  if (pct < 5)  return '#34D399';
  if (pct < 20) return '#FACC15';
  return '#F43F5E';
};

/** Top-N for the missingness bar chart */
const TOP_N = 15;

export const MissingnessPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [filter, setFilter]     = useState<string>('all');
  const [activeView, setActiveView] = useState<'table' | 'heatmap' | 'classifications'>('table');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/missing-analysis`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Failed to analyze missingness');
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) load();
  }, [clientId]);

  const cols: ColMissing[]                          = data?.columns ?? [];
  const filtered                                    = filter === 'all' ? cols : cols.filter(c => c.severity === filter);
  const withMissing                                 = cols.filter(c => c.severity !== 'NONE');
  const classifications: Record<string, Classification> = data?.column_classification || {};
  const matrixCols: string[]                        = data?.pattern_matrix_cols || [];
  const matrixRows: PatternRow[]                    = data?.pattern_matrix || [];

  /* ── SciHeatmap props ── */
  // rowLabels = ['Compound'] (one synthetic row representing the dataset pattern)
  // Actually we map each pattern row to the heatmap: rowLabels = row indices, colLabels = matrixCols
  const heatmapRowLabels = matrixRows.map(r => String(r.row));
  const heatmapCells = matrixRows.flatMap((rowItem, ri) =>
    rowItem.pattern.map((present, ci) => ({
      row: ri,
      col: ci,
      // API: present=1 means data is there, 0 means missing
      // binary mode: value=1 => cyan (present), 0 => dark (missing)
      // spec says: value=0 present, 1 missing — so we invert
      value: present === 1 ? 0 : 1,
    }))
  );

  /* ── Missingness % bar chart data ── */
  const barData: SciBarDatum[] = cols
    .filter(c => c.missing_pct > 0)
    .sort((a, b) => b.missing_pct - a.missing_pct)
    .slice(0, TOP_N)
    .map(c => ({
      label: c.column.length > 14 ? c.column.slice(0, 13) + '\u2026' : c.column,
      value: c.missing_pct,
      color: barColor(c.missing_pct),
    }));

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: 'Total Missing Cells',
              value: data.total_missing?.toLocaleString() ?? '0',
              color: data.total_missing > 0 ? 'text-rose-400' : 'text-emerald-400',
            },
            {
              label: 'Columns Affected',
              value: data.columns_with_missing ?? '0',
              color: data.columns_with_missing > 0 ? 'text-amber-400' : 'text-emerald-400',
            },
            {
              label: 'Non-MCAR Columns (MAR patterns)',
              value: data.mar_column_count ?? '0',
              color: data.mar_column_count > 0 ? 'text-violet-400' : 'text-slate-500',
            },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Nav tabs + refresh */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-px flex-wrap gap-3">
        <div className="flex gap-2">
          {(['table', 'heatmap', 'classifications'] as const).map(v => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-all -mb-px ${
                activeView === v
                  ? 'border-cyan-400/60 text-cyan-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {v === 'table'           && 'Detailed Summary Table'}
              {v === 'heatmap'         && 'Missingness Pattern Heatmap'}
              {v === 'classifications' && 'Imputation Diagnostician'}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs font-semibold hover:bg-white/[0.06] transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center h-32 gap-2 text-cyan-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Analyzing missingness patterns...</span>
        </div>
      )}

      {data && (
        <>
          {/* ── TABLE VIEW ── */}
          {activeView === 'table' && (
            <div className="space-y-4">
              {/* Filter pills */}
              <div className="flex items-center gap-2 flex-wrap">
                {['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      filter === f
                        ? 'bg-violet-500/20 border border-violet-500/30 text-violet-300'
                        : 'bg-white/[0.03] border border-white/[0.05] text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {f === 'all' ? 'All Columns' : f}
                  </button>
                ))}
              </div>

              {filtered.length > 0 && (
                <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/[0.04] border-b border-white/[0.06]">
                        {['Column', 'Type', 'Missing Count', 'Missing %', 'Present', 'Unique', 'Severity'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {filtered.map(col => {
                        const borderColor = SEV_BORDER_COLOR[col.severity] ?? '#64748B';
                        return (
                          <tr
                            key={col.column}
                            className="hover:bg-white/[0.02] transition-colors"
                            style={{ borderLeft: `2px solid ${borderColor}` }}
                          >
                            <td className="px-3 py-2 font-mono text-white/80 max-w-[160px] truncate">
                              {col.column}
                            </td>
                            <td className="px-3 py-2 text-slate-500 text-[10px] font-mono">{col.dtype}</td>
                            <td className="px-3 py-2 text-slate-300">{col.missing_count.toLocaleString()}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-violet-500"
                                    style={{ width: `${col.missing_pct}%` }}
                                  />
                                </div>
                                <span className="text-slate-400 font-mono">{col.missing_pct}%</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-400">{col.present_count.toLocaleString()}</td>
                            <td className="px-3 py-2 text-slate-400">{col.unique_count.toLocaleString()}</td>
                            <td className="px-3 py-2">
                              {col.severity === 'NONE' ? (
                                <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
                                  <CheckCircle2 className="w-3 h-3" /> None
                                </span>
                              ) : (
                                <span
                                  className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm border"
                                  style={{
                                    color: borderColor,
                                    borderColor: `${borderColor}4D`,
                                  }}
                                >
                                  {col.severity}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── HEATMAP VIEW ── */}
          {activeView === 'heatmap' && (
            <div className="space-y-4">
              {/* Missingness % bar chart */}
              {barData.length > 0 && (
                <SciPanel title="MISSINGNESS %" height={200}>
                  <SciBar
                    data={barData}
                    horizontal
                    useSeriesColors
                    height={168}
                    showLabels
                    xLabel="Missing %"
                    domain={[0, 100]}
                    tooltipFormatter={(_name, v) => `${Number(v).toFixed(1)}%`}
                  />
                </SciPanel>
              )}

              {/* Binary presence heatmap */}
              {matrixCols.length > 0 ? (
                <SciPanel title="MISSINGNESS PATTERN HEATMAP" subtitle="sampled 100 rows · cyan = missing · dark = present" height={Math.min(600, 80 + matrixRows.length * 10 + 20)}>
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 560 }}>
                    <SciHeatmap
                      rowLabels={heatmapRowLabels}
                      colLabels={matrixCols}
                      cells={heatmapCells}
                      mode="binary"
                      maxCellSize={14}
                      tooltipFormatter={(row, col, val) => (
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#F1F5F9' }}>
                          <span style={{ color: '#64748B', fontSize: 9, display: 'block', marginBottom: 3 }}>
                            Row {row} &times; {col}
                          </span>
                          {val === 1
                            ? <span style={{ color: '#22D3EE' }}>MISSING</span>
                            : <span style={{ color: '#34D399' }}>Present</span>
                          }
                        </span>
                      )}
                    />
                  </div>
                </SciPanel>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 border border-dashed border-white/[0.06] rounded-xl text-slate-500 text-xs">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 mb-2" />
                  No missing values detected in dataset. Heatmap is empty.
                </div>
              )}
            </div>
          )}

          {/* ── CLASSIFICATIONS VIEW ── */}
          {activeView === 'classifications' && (
            <div className="space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Imputation Strategy &amp; MCAR/MAR Classifications
              </div>

              {withMissing.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {/* Left: classification list */}
                  <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 divide-y divide-white/[0.04]">
                    {withMissing.map(colItem => {
                      const item = classifications[colItem.column];
                      if (!item) return null;
                      return (
                        <div key={colItem.column} className="pt-3 first:pt-0 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-white text-xs">{colItem.column}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                item.type === 'MAR'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {item.type}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 leading-normal font-mono">{item.reason}</div>
                          {item.type === 'MAR' && (
                            <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10 text-[10px] text-amber-300 leading-normal flex gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" />
                              <div>
                                <strong>Systematic Missingness</strong>: Simple row deletion will introduce sampling bias. Standardize via KNN or MICE imputation.
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Right: guidance */}
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4 h-fit">
                    <div className="text-xs font-bold text-violet-300 border-b border-white/[0.06] pb-2">
                      Reference Imputation Strategy Matrix
                    </div>
                    <div className="space-y-3 text-xs leading-normal">
                      <div>
                        <span className="font-bold text-white block">MCAR (Missing Completely at Random)</span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Missingness occurs by pure chance. Listwise deletion is statistically valid if missingness is &lt; 5%. Otherwise, use simple mean/median or random forest imputations.
                        </p>
                      </div>
                      <div>
                        <span className="font-bold text-white block">MAR (Missing at Random)</span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Missingness depends systematically on other measured descriptors (e.g. larger molecules tend to lack specific values). Use <strong>K-Nearest Neighbors (KNN)</strong> or <strong>MICE (Multiple Imputation)</strong> to protect model generalizability.
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-[10px] text-blue-300/80 leading-normal">
                        <strong>Regulatory Note</strong>: OECD principle compliance requires documentable imputation methods. MICE is highly recommended for regulatory validation dossiers.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 border border-dashed border-white/[0.06] rounded-xl text-slate-500 text-xs">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 mb-2" />
                  No missing values to classify!
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
