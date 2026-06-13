import React, { useState } from 'react';
import { Loader2, AlertCircle, BarChart2, Download } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PanelProps { clientId: string; apiBase: string; }

interface QualityScore {
  total: number;
  grade: string;
  total_issues: number;
  error_count: number;
  warning_count: number;
  dimensions: {
    completeness:        { score: number; max: number; detail: string };
    unit_integrity:      { score: number; max: number; detail: string };
    endpoint_integrity:  { score: number; max: number; detail: string };
    consistency:         { score: number; max: number; detail: string };
  };
}

const GRADE_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  A: { color: 'text-emerald-400', label: 'Excellent', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  B: { color: 'text-blue-400',   label: 'Good',      bg: 'bg-blue-500/10 border-blue-500/30'    },
  C: { color: 'text-amber-400',  label: 'Fair',      bg: 'bg-amber-500/10 border-amber-500/30'  },
  D: { color: 'text-orange-400', label: 'Poor',      bg: 'bg-orange-500/10 border-orange-500/30'},
  F: { color: 'text-rose-400',   label: 'Critical',  bg: 'bg-rose-500/10 border-rose-500/30'    },
};

const DIM_LABELS: Record<string, string> = {
  completeness:       'Completeness',
  unit_integrity:     'Unit Integrity',
  endpoint_integrity: 'Endpoint Integrity',
  consistency:        'Value Consistency',
};

const DIM_ICONS: Record<string, string> = {
  completeness:       '📊',
  unit_integrity:     '🔬',
  endpoint_integrity: '🎯',
  consistency:        '✅',
};

export const QualityScorePanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [score, setScore] = useState<QualityScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compute = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/quality-score`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      setScore(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveNormalized = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/apply-and-save`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      toast.success(`Normalized dataset saved (${data.rows.toLocaleString()} rows)`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const gradeConfig = score ? (GRADE_CONFIG[score.grade] ?? GRADE_CONFIG['F']) : null;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <button
          onClick={compute}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm font-bold hover:bg-amber-500/20 transition-all disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
          Compute Quality Score
        </button>
        {score && (
          <button
            onClick={saveNormalized}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-sm font-bold hover:bg-white/[0.08] transition-all disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Save Normalized Dataset
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {score && gradeConfig && (
        <div className="space-y-4">
          {/* Grade card */}
          <div className={`flex items-center gap-6 p-6 rounded-2xl border ${gradeConfig.bg}`}>
            <div className={`text-7xl font-black ${gradeConfig.color}`}>{score.grade}</div>
            <div>
              <div className={`text-2xl font-black ${gradeConfig.color}`}>{score.total} / 100</div>
              <div className="text-sm text-slate-400 mt-0.5">{gradeConfig.label} Data Quality</div>
              <div className="flex gap-3 mt-2 text-xs text-slate-500">
                <span className="text-rose-400">{score.error_count} errors</span>
                <span>·</span>
                <span className="text-amber-400">{score.warning_count} warnings</span>
                <span>·</span>
                <span>{score.total_issues} total issues</span>
              </div>
            </div>

            {/* Radial progress */}
            <div className="ml-auto relative w-20 h-20">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9155" fill="none"
                  stroke={score.total >= 90 ? '#34d399' : score.total >= 75 ? '#60a5fa' : score.total >= 60 ? '#fbbf24' : '#f87171'}
                  strokeWidth="3"
                  strokeDasharray={`${score.total} ${100 - score.total}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-sm font-black ${gradeConfig.color}`}>{score.total}</span>
              </div>
            </div>
          </div>

          {/* Dimension breakdown */}
          <div className="space-y-3">
            {Object.entries(score.dimensions).map(([key, dim]) => {
              const pct = dim.score / dim.max * 100;
              const barColor = pct >= 80 ? 'bg-emerald-400' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400';
              return (
                <div key={key} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{DIM_ICONS[key]}</span>
                      <span className="text-xs font-semibold text-white">{DIM_LABELS[key]}</span>
                    </div>
                    <div className="text-xs font-bold text-white">
                      {dim.score.toFixed(1)} <span className="text-slate-600">/ {dim.max}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-1.5">
                    <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-600">{dim.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
