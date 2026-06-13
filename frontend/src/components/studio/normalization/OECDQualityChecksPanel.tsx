import React, { useState } from 'react';
import { Loader2, AlertCircle, AlertTriangle, XCircle, ShieldCheck, RefreshCw } from 'lucide-react';

interface PanelProps { clientId: string; apiBase: string; }

interface Issue {
  severity: 'ERROR' | 'WARNING';
  type: string;
  column: string;
  description: string;
  affected_rows: number[];
  count: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  ERROR: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  WARNING: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
};

export const OECDQualityChecksPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);
  const [filter, setFilter] = useState<'all' | 'ERROR' | 'WARNING'>('all');

  const run = async () => {
    setLoading(true); setError(null); setRan(false);
    try {
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/quality-checks`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      setIssues(data.issues || []);
      setRan(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = issues.filter(i => filter === 'all' || i.severity === filter);
  const errorCount = issues.filter(i => i.severity === 'ERROR').length;
  const warnCount = issues.filter(i => i.severity === 'WARNING').length;

  return (
    <div className="space-y-4">
      {/* OECD context */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-slate-500">
        Checks dataset for <strong className="text-white">OECD QSARToolbox–aligned</strong> issues:
        impossible values (negative concentrations), mixed units, pH out-of-range, and statistical outliers (±3 SD).
      </div>

      {/* Run button + stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm font-bold hover:bg-amber-500/20 transition-all disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          Run OECD Quality Checks
        </button>
        {ran && (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold">
              <XCircle className="w-3.5 h-3.5" /> {errorCount} Errors
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> {warnCount} Warnings
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Passed all checks */}
      {ran && issues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-400">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div className="text-white font-bold">All checks passed</div>
          <div className="text-slate-500 text-sm">No OECD quality issues detected in this dataset.</div>
        </div>
      )}

      {/* Filter + table */}
      {ran && issues.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            {(['all', 'ERROR', 'WARNING'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                  ${filter === f
                    ? 'bg-amber-500/20 border border-amber-500/30 text-amber-300'
                    : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-slate-300'
                  }`}
              >
                {f === 'all' ? 'All Issues' : f}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filtered.map((issue, i) => (
              <div key={i} className={`p-3 rounded-xl border ${SEVERITY_COLORS[issue.severity]} flex items-start gap-3`}>
                <div className="flex-shrink-0 mt-0.5">
                  {issue.severity === 'ERROR'
                    ? <XCircle className="w-4 h-4" />
                    : <AlertTriangle className="w-4 h-4" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold">{issue.severity}</span>
                    <span className="text-[10px] opacity-60">·</span>
                    <span className="text-[10px] opacity-70 uppercase tracking-wider">{issue.type.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] opacity-60">·</span>
                    <span className="font-mono text-[10px] opacity-70">{issue.column}</span>
                  </div>
                  <div className="text-xs">{issue.description}</div>
                  <div className="text-[10px] opacity-60 mt-1">
                    {issue.count} row{issue.count !== 1 ? 's' : ''} affected
                    {issue.affected_rows.length > 0 && (
                      <> — rows: {issue.affected_rows.slice(0, 5).join(', ')}{issue.affected_rows.length > 5 ? '...' : ''}</>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
