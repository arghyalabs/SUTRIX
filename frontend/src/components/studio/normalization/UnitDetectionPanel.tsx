import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, CheckCircle2, AlertTriangle, RefreshCw, Info } from 'lucide-react';

interface DetectionResult {
  column: string;
  detected_unit: string | null;
  confidence: number;
  method: string;
  mixed_units_detected: boolean;
  dtype: string;
  sample_values: any[];
}

interface PanelProps {
  clientId: string;
  apiBase: string;
}

export const UnitDetectionPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'detected' | 'undetected' | 'mixed'>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/detect-units`);
      if (!r.ok) throw new Error((await r.json()).detail);
      const data = await r.json();
      setResults(data.detections || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [clientId]);

  const filtered = results.filter(r => {
    if (filter === 'detected') return r.detected_unit !== null;
    if (filter === 'undetected') return r.detected_unit === null;
    if (filter === 'mixed') return r.mixed_units_detected;
    return true;
  });

  const detectedCount = results.filter(r => r.detected_unit !== null).length;
  const mixedCount = results.filter(r => r.mixed_units_detected).length;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Columns', value: results.length, color: 'text-slate-300' },
          { label: 'Units Detected', value: detectedCount, color: 'text-emerald-400' },
          { label: 'Mixed Units', value: mixedCount, color: 'text-rose-400' },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'detected', 'undetected', 'mixed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${filter === f
                ? 'bg-amber-500/20 border border-amber-500/30 text-amber-300'
                : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'
              }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold hover:bg-amber-500/20 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Re-detect
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-32 gap-2 text-amber-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Scanning columns...</span>
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white/[0.04] border-b border-white/[0.06]">
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Column</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Detected Unit</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Confidence</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Method</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Mixed?</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Sample Values</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map(r => (
                <tr key={r.column} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5 font-mono text-white/80 max-w-[140px] truncate" title={r.column}>
                    {r.column}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.detected_unit ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-semibold">
                        {r.detected_unit}
                      </span>
                    ) : (
                      <span className="text-slate-600 italic">not detected</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.detected_unit ? (
                      <ConfidenceBar value={r.confidence} />
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 capitalize">
                    {r.method.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.mixed_units_detected ? (
                      <span className="flex items-center gap-1 text-rose-400">
                        <AlertTriangle className="w-3 h-3" /> Mixed
                      </span>
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-[10px] max-w-[160px] truncate">
                    {r.sample_values.join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="text-center text-slate-600 py-8 text-sm">No columns match this filter.</div>
      )}
    </div>
  );
};

const ConfidenceBar: React.FC<{ value: number }> = ({ value }) => {
  const color = value >= 80 ? 'bg-emerald-400' : value >= 55 ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden min-w-[60px]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-slate-500 w-8 text-right">{value}%</span>
    </div>
  );
};
