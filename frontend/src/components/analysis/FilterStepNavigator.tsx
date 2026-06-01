import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Database, Filter, CheckCircle2 } from 'lucide-react';
import type { SimpleFunnelStep } from '../../services/simpleAnalysisApi';

interface FilterStepNavigatorProps {
  steps: SimpleFunnelStep[];
  selectedStepId: string;
  onSelectStep: (id: string) => void;
}

export const FilterStepNavigator: React.FC<FilterStepNavigatorProps> = ({
  steps,
  selectedStepId,
  onSelectStep,
}) => {
  const levelColors = ['border-emerald-500/20 text-emerald-400', 'border-cyan-500/20 text-cyan-400', 'border-violet-500/20 text-violet-400', 'border-amber-500/20 text-amber-400'];

  return (
    <div className="flex flex-col gap-2">
      {steps.map((step, idx) => {
        const isSelected = step.id === selectedStepId;
        const colorClass = levelColors[Math.min(idx, levelColors.length - 1)];

        return (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => onSelectStep(step.id)}
            className={`group flex items-start gap-3 p-3.5 rounded-2xl cursor-pointer border text-left transition-all duration-300
              ${isSelected
                ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_20px_rgba(34,211,238,0.1)]'
                : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08]'
              }`}
          >
            {/* Step Status Indicator */}
            <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 border
              ${isSelected ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-white/[0.02] border-white/10 text-white/20'}`}
            >
              {idx === 0 ? (
                <Database className="w-3 h-3" />
              ) : (
                <CheckCircle2 className="w-3 h-3 text-cyan-400" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold tracking-wider text-white/40 uppercase">
                  Step {idx + 1}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-white/40'}`}>
                  {step.row_count.toLocaleString()} rows
                </span>
              </div>

              {idx === 0 ? (
                <h4 className="text-sm font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis">
                  Root Dataset
                </h4>
              ) : (
                <div className="text-sm font-semibold whitespace-nowrap overflow-hidden text-ellipsis text-white/80">
                  <span className="text-white/40 font-normal mr-1">{step.filter_col}</span>
                  <span className="text-white/20 mr-1">=</span>
                  <span className="text-cyan-400">{step.filter_val}</span>
                </div>
              )}

              {idx > 0 && (
                <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-semibold text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/10">
                  Retained: {step.pct_retained}%
                </span>
              )}
            </div>

            <ChevronRight className={`w-4 h-4 mt-3 shrink-0 transition-transform duration-300
              ${isSelected ? 'translate-x-1 text-cyan-400' : 'text-white/20 group-hover:text-white/40'}`}
            />
          </motion.div>
        );
      })}
    </div>
  );
};
