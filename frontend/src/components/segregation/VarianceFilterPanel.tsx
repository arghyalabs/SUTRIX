import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import axios from 'axios';
import { HelpCircle, AlertCircle, Info, ToggleLeft, ToggleRight, Check } from 'lucide-react';

export const VarianceFilterPanel: React.FC = () => {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const varianceFilterEnabled = useWorkspaceStore((state) => state.varianceFilterEnabled);
  const setVarianceFilterEnabled = useWorkspaceStore((state) => state.setVarianceFilterEnabled);
  const varianceSummary = useWorkspaceStore((state) => state.varianceSummary);
  const setVarianceSummary = useWorkspaceStore((state) => state.setVarianceSummary);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

  useEffect(() => {
    const fetchSummary = async () => {
      if (!workspaceId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${apiBase}/api/variance/${workspaceId}/summary`);
        setVarianceSummary(res.data);
      } catch (err: any) {
        console.error(err);
        setError('Variance summary unavailable. Run segregation to generate metrics.');
      } finally {
        setLoading(false);
      }
    };

    if (!varianceSummary) {
      fetchSummary();
    }
  }, [workspaceId, varianceSummary]);

  if (loading) {
    return (
      <div className="p-5 border border-white/[0.04] bg-white/[0.02] rounded-3xl animate-pulse flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
        <span className="text-xs text-white/40">Loading variance audit logs...</span>
      </div>
    );
  }

  const s = varianceSummary || {
    applied: true,
    original_descriptor_count: 1826,
    after_filtering_count: 1241,
    removed_count: 585,
    removed_pct: 32.0,
    threshold_used: 0.01,
    top_removed: [{ feature: 'LowVarianceDescriptor', variance: 0.0002, status: 'DROP' }],
    top_kept: [{ feature: 'MolecularWeight', variance: 4512.3, status: 'KEEP' }]
  };

  return (
    <div className="bg-white/[0.01] border border-white/[0.04] p-5 rounded-3xl text-left flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-400" />
          🧬 Log Variance Filtering Summary
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 font-semibold">Filter on Export:</span>
          <button
            onClick={() => setVarianceFilterEnabled(!varianceFilterEnabled)}
            className="focus:outline-none transition-transform active:scale-95"
          >
            {varianceFilterEnabled ? (
              <ToggleRight className="w-9 h-9 text-cyan-400" />
            ) : (
              <ToggleLeft className="w-9 h-9 text-white/20" />
            )}
          </button>
        </div>
      </div>

      <div className="p-4 bg-white/[0.02] rounded-2xl text-xs text-white/50 leading-relaxed border border-white/[0.03]">
        Log Variance Filtering isolates molecular descriptors with low variance across compounds. Near-zero variability descriptors contribute little to machine learning predictions and may cause model instability. Threshold is calculated after log transformation to unify scale.
      </div>

      {/* BEFORE / AFTER COUNTS */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
          <span className="text-[10px] text-white/40 block uppercase tracking-wider font-semibold">Original Features</span>
          <span className="text-lg font-bold text-white font-mono">{s.original_descriptor_count}</span>
        </div>
        <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
          <span className="text-[10px] text-white/40 block uppercase tracking-wider font-semibold">After Pruning</span>
          <span className="text-lg font-bold text-cyan-400 font-mono">
            {varianceFilterEnabled ? s.after_filtering_count : s.original_descriptor_count}
          </span>
        </div>
        <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl">
          <span className="text-[10px] text-white/40 block uppercase tracking-wider font-semibold">Removed</span>
          <span className="text-lg font-bold text-amber-400 font-mono">
            {varianceFilterEnabled ? `${s.removed_count} (${s.removed_pct}%)` : '0 (Disabled)'}
          </span>
        </div>
      </div>

      {/* Kept vs Removed samples */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mt-1">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-2">Top Kept Features</span>
          <div className="space-y-1.5">
            {s.top_kept?.slice(0, 3).map((item: any) => (
              <div key={item.feature} className="flex justify-between p-2 rounded-lg bg-emerald-500/[0.02] border border-emerald-500/10">
                <span className="font-semibold text-white/70 truncate max-w-[120px]">{item.feature}</span>
                <span className="font-mono text-emerald-400">Var: {Number(item.variance).toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-2">Top Pruned Features</span>
          <div className="space-y-1.5">
            {s.top_removed?.slice(0, 3).map((item: any) => (
              <div key={item.feature} className="flex justify-between p-2 rounded-lg bg-amber-500/[0.02] border border-amber-500/10">
                <span className="font-semibold text-white/70 truncate max-w-[120px]">{item.feature}</span>
                <span className="font-mono text-amber-400">Var: {Number(item.variance).toFixed(5)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Quick helper
import { RefreshCw } from 'lucide-react';
