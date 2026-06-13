import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw, TrendingUp } from 'lucide-react';

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

const SEV_COLORS: Record<string, string> = {
  HIGH:   'text-rose-400 bg-rose-500/10 border-rose-500/20',
  MEDIUM: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  LOW:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

export const OutlierPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<'iqr' | 'zscore' | 'both'>('iqr');
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

  return (
    <div className="space-y-4">
      {/* Method + run */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs text-slate-500">Detection method:</div>
        {(['iqr', 'zscore', 'both'] as const).map(m => (
          <button key={m} onClick={() => setMethod(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-all
              ${method === m ? 'bg-violet-500/20 border border-violet-500/30 text-violet-300' : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'}`}>
            {m === 'iqr' ? 'IQR Fence' : m === 'zscore' ? 'Z-Score (±3σ)' : 'Both'}
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
        {method === 'iqr' && '📐 IQR Fence: values below Q1 − 1.5×IQR or above Q3 + 1.5×IQR are flagged.'}
        {method === 'zscore' && '📊 Z-Score: values more than ±3 standard deviations from the column mean are flagged.'}
        {method === 'both' && '🔍 Union of IQR fence and Z-score outliers are flagged.'}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-32 gap-2 text-violet-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Scanning for outliers…</span>
        </div>
      )}

      {/* Summary */}
      {data && !loading && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
            <div className="text-2xl font-black text-slate-300">{data.total_columns_checked}</div>
            <div className="text-[10px] text-slate-600">Columns Checked</div>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
            <div className={`text-2xl font-black ${data.columns_with_outliers > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {data.columns_with_outliers}
            </div>
            <div className="text-[10px] text-slate-600">Columns with Outliers</div>
          </div>
        </div>
      )}

      {/* Results list */}
      {results.length === 0 && data && !loading && (
        <div className="text-center py-10 text-slate-500 text-sm">No outliers detected with selected method.</div>
      )}

      <div className="space-y-2">
        {results.map(r => (
          <div key={r.column} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              onClick={() => setExpanded(expanded === r.column ? null : r.column)}
            >
              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${SEV_COLORS[r.severity]}`}>{r.severity}</span>
              <span className="font-mono text-sm text-white flex-1">{r.column}</span>
              <span className="text-rose-300 font-bold text-sm mr-2">{r.outlier_count} outliers</span>
              <span className="text-slate-500 text-xs">({r.outlier_pct}%)</span>
              <span className="text-slate-600 text-xs ml-1">{expanded === r.column ? '▲' : '▼'}</span>
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
                    {r.outlier_rows.length > 20 ? '…' : ''}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
