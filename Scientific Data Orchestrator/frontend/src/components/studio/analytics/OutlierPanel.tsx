import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, TrendingUp } from 'lucide-react';
import { SciPanel } from '../../../components/charts/SciPanel';
import { SciScatter } from '../../../components/charts/SciScatter';

interface PanelProps { clientId: string; apiBase: string; }

interface OutlierResult {
  column: string;
  method: string;
  outlier_count: number;
  outlier_pct: number;
  iqr_lower?: number;
  iqr_upper?: number;
  outlier_rows: number[];
  sample_values: (number | null)[];
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

/** hex colour per severity — used for text and badge border */
const SEV_HEX: Record<string, string> = {
  HIGH:   '#F43F5E',
  MEDIUM: '#FB923C',
  LOW:    '#22D3EE',
};

export const OutlierPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [method, setMethod]     = useState<'iqr' | 'zscore' | 'both'>('iqr');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/outliers?method=${method}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [clientId]);

  const results: OutlierResult[] = data?.results ?? [];

  /* ── Williams plot data ── */
  // API may supply data.williams: { in_ad: [{leverage, std_residual}], outliers: [...], h_star: number }
  const williams      = data?.williams;
  const inAdPoints    = (williams?.in_ad   ?? []).map((p: any) => ({ x: p.leverage, y: p.std_residual }));
  const outlierPoints = (williams?.outliers ?? []).map((p: any) => ({ x: p.leverage, y: p.std_residual }));
  const hStar: number | null = williams?.h_star ?? null;
  const hasWilliams   = inAdPoints.length > 0 || outlierPoints.length > 0;

  return (
    <div className="space-y-4">
      {/* Method selector + run */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs text-slate-500">Detection method:</div>
        {(['iqr', 'zscore', 'both'] as const).map(m => (
          <button key={m} onClick={() => setMethod(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-all
              ${method === m
                ? 'bg-violet-500/20 border border-violet-500/30 text-violet-300'
                : 'bg-white/[0.03] border border-white/[0.05] text-slate-500 hover:text-slate-300'}`}>
            {m === 'iqr' ? 'IQR Fence' : m === 'zscore' ? 'Z-Score (\u00b13\u03c3)' : 'Both'}
          </button>
        ))}
        <button onClick={load} disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold hover:bg-violet-500/20 transition-all disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
          Detect Outliers
        </button>
      </div>

      {/* Method description */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[10px] text-slate-500">
        {method === 'iqr'    && '\ud83d\udcd0 IQR Fence: values below Q1 \u2212 1.5\u00d7IQR or above Q3 + 1.5\u00d7IQR are flagged.'}
        {method === 'zscore' && '\ud83d\udcca Z-Score: values more than \u00b13 standard deviations from the column mean are flagged.'}
        {method === 'both'   && '\ud83d\udd0d Union of IQR fence and Z-score outliers are flagged.'}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-32 gap-2 text-cyan-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Scanning for outliers\u2026</span>
        </div>
      )}

      {/* Summary stat chips */}
      {data && !loading && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-center">
            <div className="text-2xl font-black text-slate-300">{data.total_columns_checked}</div>
            <div className="text-[10px] text-slate-600">Columns Checked</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-center">
            <div className={`text-2xl font-black ${data.columns_with_outliers > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {data.columns_with_outliers}
            </div>
            <div className="text-[10px] text-slate-600">Columns with Outliers</div>
          </div>
        </div>
      )}

      {/* Williams Plot */}
      {data && !loading && hasWilliams && (
        <SciPanel title="WILLIAMS PLOT" height={280}>
          <SciScatter
            series={[
              { name: 'In-AD',   data: inAdPoints,    color: '#34D399' },
              { name: 'Outlier', data: outlierPoints, color: '#F43F5E' },
            ]}
            hLines={[
              { y:  3, dashed: true },
              { y: -3, dashed: true },
            ]}
            vLines={hStar !== null ? [{ x: hStar, dashed: true }] : []}
            xLabel="Leverage (h)"
            yLabel="Std. Residual"
            height={248}
          />
        </SciPanel>
      )}

      {/* Empty state */}
      {results.length === 0 && data && !loading && (
        <div className="text-center py-10 text-slate-500 text-sm">No outliers detected with selected method.</div>
      )}

      {/* Collapsible outlier rows */}
      <div className="space-y-2">
        {results.map(r => {
          const sevColor = SEV_HEX[r.severity] ?? '#94A3B8';
          return (
            <div key={r.column} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded(expanded === r.column ? null : r.column)}
              >
                {/* Severity badge — border only, no background */}
                <span
                  style={{ color: sevColor, borderColor: `${sevColor}4D` }}
                  className="border text-[9px] font-mono px-1.5 py-0.5 rounded-sm"
                >
                  {r.severity}
                </span>

                {/* Column name — plain text coloured by severity */}
                <span className="font-mono text-sm flex-1" style={{ color: sevColor }}>
                  {r.column}
                </span>

                <span className="text-rose-300 font-bold text-sm mr-2">{r.outlier_count} outliers</span>
                <span className="text-slate-500 text-xs">({r.outlier_pct}%)</span>
                <span className="text-slate-600 text-xs ml-1">{expanded === r.column ? '\u25b2' : '\u25bc'}</span>
              </button>

              {expanded === r.column && (
                <div className="px-4 pb-4 border-t border-white/[0.05] pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {r.iqr_lower !== undefined && r.iqr_lower !== null && (
                      <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                        <div className="text-slate-600 text-[10px] mb-0.5">IQR Lower Fence</div>
                        <div className="text-slate-300 font-mono">{r.iqr_lower?.toFixed(4)}</div>
                      </div>
                    )}
                    {r.iqr_upper !== undefined && r.iqr_upper !== null && (
                      <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                        <div className="text-slate-600 text-[10px] mb-0.5">IQR Upper Fence</div>
                        <div className="text-slate-300 font-mono">{r.iqr_upper?.toFixed(4)}</div>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-600 mb-1.5">Sample Outlier Values</div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.sample_values.map((v, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono">
                          {v !== null ? v.toFixed(4) : 'null'}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-600 mb-1">Affected Row Indices (first 20)</div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {r.outlier_rows.slice(0, 20).join(', ')}
                      {r.outlier_rows.length > 20 ? '\u2026' : ''}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
