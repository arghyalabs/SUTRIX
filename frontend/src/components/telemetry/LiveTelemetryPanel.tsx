import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Cpu, Database, GitBranch, Zap, Clock, X, RotateCcw } from 'lucide-react';

interface LiveTelemetryPanelProps {
  jobId?: string;
  stage?: string;
  stageLabel?: string;
  stageDescription?: string;
  progressPct?: number;
  etaSeconds?: number;
  itemsPerSec?: number;
  rowsPerSec?: number;
  activeNode?: string;
  nodesComplete?: number;
  nodesTotal?: number;
  cacheHits?: number;
  cacheHitRatePct?: number;
  memoryMb?: number;
  logs?: string[];
  onCancel?: () => void;
}

function formatEta(sec: number): string {
  if (sec <= 0 || !sec) return '—';
  if (sec < 60) return `${Math.ceil(sec)}s`;
  return `${Math.floor(sec / 60)}m ${Math.ceil(sec % 60)}s`;
}

const Counter: React.FC<{ value: number; decimals?: number; suffix?: string; className?: string }> = ({
  value, decimals = 0, suffix = '', className = ''
}) => (
  <motion.span
    key={value.toFixed(decimals)}
    initial={{ opacity: 0, y: -6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2 }}
    className={className}
  >
    {value.toFixed(decimals)}{suffix}
  </motion.span>
);

export const LiveTelemetryPanel: React.FC<LiveTelemetryPanelProps> = ({
  jobId,
  stage,
  stageLabel,
  stageDescription,
  progressPct = 0,
  etaSeconds = 0,
  itemsPerSec = 0,
  rowsPerSec = 0,
  activeNode,
  nodesComplete = 0,
  nodesTotal = 0,
  cacheHits = 0,
  cacheHitRatePct = 0,
  memoryMb = 0,
  logs = [],
  onCancel,
}) => {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="glass rounded-2xl border border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2.5">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
            className="w-2 h-2 rounded-full bg-cyan-400"
          />
          <span className="text-sm font-semibold text-white">
            {stageLabel || 'Processing...'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {jobId && onCancel && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-white/[0.08] text-white/40 hover:text-rose-400 hover:border-rose-500/30 text-xs transition-all"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-white/[0.05]">
        <motion.div
          className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.04]">
        {[
          { icon: <Clock className="w-3.5 h-3.5 text-cyan-400" />, label: 'ETA', value: formatEta(etaSeconds), raw: false },
          { icon: <Zap className="w-3.5 h-3.5 text-violet-400" />, label: 'Items/s', value: itemsPerSec.toFixed(1), raw: false },
          { icon: <Activity className="w-3.5 h-3.5 text-emerald-400" />, label: 'Rows/s', value: rowsPerSec > 0 ? rowsPerSec.toFixed(0) : '—', raw: false },
          { icon: <Database className="w-3.5 h-3.5 text-amber-400" />, label: 'Cache Hit', value: `${cacheHitRatePct.toFixed(0)}%`, raw: false },
        ].map((stat) => (
          <div key={stat.label} className="bg-black/20 px-4 py-3 flex items-center gap-2.5">
            {stat.icon}
            <div>
              <div className="text-[10px] font-mono text-white/30 uppercase tracking-wider">{stat.label}</div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={stat.value}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm font-bold text-white font-mono"
                >
                  {stat.value}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      {/* Active node + hierarchy progress */}
      {(activeNode || nodesTotal > 0) && (
        <div className="px-5 py-3 border-t border-white/[0.04] flex items-center justify-between gap-4">
          {activeNode && (
            <div className="flex items-center gap-2 min-w-0">
              <GitBranch className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-xs text-amber-300 font-mono truncate">{activeNode}</span>
            </div>
          )}
          {nodesTotal > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-24 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-amber-400/60 rounded-full"
                  animate={{ width: `${(nodesComplete / nodesTotal) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <span className="text-xs font-mono text-white/30">{nodesComplete}/{nodesTotal}</span>
            </div>
          )}
        </div>
      )}

      {/* Secondary row: memory + stage description */}
      <div className="px-5 py-2.5 border-t border-white/[0.04] flex items-center justify-between gap-4">
        <AnimatePresence mode="wait">
          <motion.p
            key={stageDescription}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-white/40 truncate"
          >
            {stageDescription || 'Initializing pipeline...'}
          </motion.p>
        </AnimatePresence>
        {memoryMb > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Cpu className="w-3 h-3 text-white/20" />
            <span className="text-[10px] font-mono text-white/25">{memoryMb.toFixed(0)} MB</span>
          </div>
        )}
      </div>

      {/* Live log console */}
      {logs.length > 0 && (
        <div
          ref={logRef}
          className="max-h-32 overflow-y-auto px-4 py-3 border-t border-white/[0.04] bg-black/30 space-y-0.5 font-mono"
        >
          {logs.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className={`text-[10px] leading-relaxed ${
                line.includes('✓') || line.includes('✔') ? 'text-emerald-400/80' :
                line.includes('⚠') ? 'text-amber-400/80' :
                line.includes('⚗') ? 'text-violet-400/80' :
                line.includes('🧬') ? 'text-cyan-400/80' :
                'text-white/30'
              }`}
            >
              {line}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
