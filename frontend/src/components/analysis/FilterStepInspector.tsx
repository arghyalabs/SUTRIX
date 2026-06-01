import React from 'react';
import { motion } from 'framer-motion';
import { HelpCircle, BarChart3, Binary, Table2 } from 'lucide-react';
import type { SimpleFunnelStep } from '../../services/simpleAnalysisApi';

interface FilterStepInspectorProps {
  step: SimpleFunnelStep;
  index: number;
}

export const FilterStepInspector: React.FC<FilterStepInspectorProps> = ({
  step,
  index,
}) => {
  const missingPct = step.charts?.missing_pct ?? 0.0;
  const numCols = step.charts?.numeric_cols ?? 0;
  const catCols = step.charts?.categorical_cols ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl"
    >
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-cyan-400" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">
          Step Metadata Details
        </h4>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
          <span className="text-xs text-white/40 flex items-center gap-1.5">
            Active Filter
          </span>
          <span className="text-xs font-bold text-white">
            {index === 0 ? 'None (Root Dataset)' : `${step.filter_col} = ${step.filter_val}`}
          </span>
        </div>

        <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
          <span className="text-xs text-white/40">Total Row Sizing</span>
          <span className="text-xs font-bold text-white font-mono">
            {step.row_count.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
          <span className="text-xs text-white/40">Unique Compound Count</span>
          <span className="text-xs font-bold text-cyan-400 font-mono">
            {step.unique_compounds.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
          <span className="text-xs text-white/40 flex items-center gap-1">
            Data Quality Missing % 
          </span>
          <span className={`text-xs font-bold font-mono ${missingPct > 5.0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {missingPct}%
          </span>
        </div>

        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-white/40">Schema Dimensions</span>
          <span className="text-xs font-bold text-white flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] bg-cyan-500/10 text-cyan-300 px-1.5 py-0.5 rounded-md">
              <Binary className="w-2.5 h-2.5" /> Numeric: {numCols}
            </span>
            <span className="flex items-center gap-1 text-[10px] bg-violet-500/10 text-violet-300 px-1.5 py-0.5 rounded-md">
              <Table2 className="w-2.5 h-2.5" /> Categoric: {catCols}
            </span>
          </span>
        </div>
      </div>
    </motion.div>
  );
};
