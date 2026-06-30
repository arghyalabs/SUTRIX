import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Circle, Loader2, Clock, Zap, Database, GitBranch, Search, Package } from 'lucide-react';

export type StageItem = {
  stage: string;
  stage_label: string;
  description: string;
  status: 'pending' | 'active' | 'completed';
  duration_s?: number;
};

interface ProcessingTimelineProps {
  stages: StageItem[];
  activeStage: string;
  message?: string;
  etaSeconds?: number;
  itemsPerSec?: number;
  rowsPerSec?: number;
  progressPct?: number;
  activeNode?: string;
}

const STAGE_ICONS: Record<string, React.ReactNode> = {
  UPLOADING:          <Zap className="w-3.5 h-3.5" />,
  PARSING:            <Database className="w-3.5 h-3.5" />,
  SCHEMA_DETECTION:   <Search className="w-3.5 h-3.5" />,
  UNIT_STANDARDIZE:   <Clock className="w-3.5 h-3.5" />,
  DEDUPLICATION:      <Database className="w-3.5 h-3.5" />,
  SMILES_RESOLVE:     <Zap className="w-3.5 h-3.5" />,
  PREVIEW_CACHE:      <Database className="w-3.5 h-3.5" />,
  STATISTICS_BUILD:   <Zap className="w-3.5 h-3.5" />,
  WORKSPACE_READY:    <CheckCircle className="w-3.5 h-3.5" />,
  HIERARCHY_INIT:     <GitBranch className="w-3.5 h-3.5" />,
  HIERARCHY_BUILD:    <GitBranch className="w-3.5 h-3.5" />,
  NODE_STATISTICS:    <Zap className="w-3.5 h-3.5" />,
  CHART_PRECOMPUTE:   <Zap className="w-3.5 h-3.5" />,
  EXPORT_GENERATION:  <Package className="w-3.5 h-3.5" />,
  IDENTITY_RESOLVE:   <Search className="w-3.5 h-3.5" />,
  DESCRIPTOR_COMPUTE: <Zap className="w-3.5 h-3.5" />,
  COLUMNAR_COMPRESS:  <Database className="w-3.5 h-3.5" />,
};

function formatEta(sec: number): string {
  if (sec <= 0) return '—';
  if (sec < 60) return `${Math.ceil(sec)}s`;
  return `${Math.floor(sec / 60)}m ${Math.ceil(sec % 60)}s`;
}

export const ProcessingTimeline: React.FC<ProcessingTimelineProps> = ({
  stages,
  activeStage,
  message,
  etaSeconds = 0,
  itemsPerSec = 0,
  rowsPerSec = 0,
  progressPct = 0,
  activeNode,
}) => {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [message]);

  return (
    <div className="flex flex-col gap-6 w-full">

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-white/50">Pipeline Progress</span>
          <span className="text-cyan-400 font-bold">{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Live stat pills */}
      <div className="flex flex-wrap gap-2">
        {etaSeconds > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono">
            <Clock className="w-3 h-3" />
            ETA {formatEta(etaSeconds)}
          </div>
        )}
        {itemsPerSec > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-mono">
            <Zap className="w-3 h-3" />
            {itemsPerSec.toFixed(1)} items/s
          </div>
        )}
        {rowsPerSec > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
            <Database className="w-3 h-3" />
            {rowsPerSec.toFixed(0)} rows/s
          </div>
        )}
        {activeNode && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono">
            <GitBranch className="w-3 h-3" />
            {activeNode}
          </div>
        )}
      </div>

      {/* Stage timeline */}
      <div className="relative space-y-0">
        {stages.map((stage, idx) => {
          const isActive = stage.status === 'active';
          const isDone   = stage.status === 'completed';
          const icon = STAGE_ICONS[stage.stage] ?? <Circle className="w-3.5 h-3.5" />;

          return (
            <div key={stage.stage} className="flex gap-3 group">
              {/* Connector line */}
              <div className="flex flex-col items-center">
                <motion.div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 border transition-all duration-300
                    ${isDone  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' :
                      isActive ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.3)]' :
                                 'bg-white/[0.03] border-white/[0.08] text-white/20'}`}
                  animate={isActive ? { scale: [1, 1.08, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1.6 }}
                >
                  {isActive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isDone ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    icon
                  )}
                </motion.div>
                {idx < stages.length - 1 && (
                  <div className={`w-px flex-1 my-0.5 transition-colors duration-500
                    ${isDone ? 'bg-emerald-500/30' : 'bg-white/[0.06]'}`}
                    style={{ minHeight: '16px' }}
                  />
                )}
              </div>

              {/* Content */}
              <div className={`pb-4 flex-1 min-w-0 transition-opacity duration-300 ${(!isDone && !isActive) ? 'opacity-35' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${isActive ? 'text-white' : isDone ? 'text-emerald-400' : 'text-white/50'}`}>
                    {stage.stage_label}
                  </span>
                  {isDone && stage.duration_s !== undefined && (
                    <span className="text-[10px] font-mono text-white/30">
                      {stage.duration_s.toFixed(1)}s
                    </span>
                  )}
                </div>
                <AnimatePresence mode="wait">
                  {isActive && (
                    <motion.p
                      key="desc"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs text-cyan-300/70 mt-0.5 truncate"
                    >
                      {message || stage.description}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
