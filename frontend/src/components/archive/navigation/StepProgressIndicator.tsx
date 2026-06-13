/**
 * @deprecated Deprecated in SUTRIX V5 Workspace-First Refactor.
 * Retained in archive/ for rollback compatibility and design reference.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useStudioNavigation } from '../../studio/navigation/StudioNavigationProvider';
import type { NavigationStep } from '../../studio/navigation/StudioNavigationProvider';
import { Check, Lock, ChevronDown, Compass, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const StepProgressIndicator: React.FC = () => {
  const {
    steps,
    activeTab,
    getStepStatus,
    getBlockedReason,
    handleJump
  } = useStudioNavigation();

  const [isJumpOpen, setIsJumpOpen] = useState(false);
  const jumpMenuRef = useRef<HTMLDivElement>(null);

  // Close jump menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (jumpMenuRef.current && !jumpMenuRef.current.contains(e.target as Node)) {
        setIsJumpOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeIdx = steps.findIndex((s: NavigationStep) => s.id === activeTab);

  // Render connector line classes
  const getConnectorClass = (index: number) => {
    const nextStep = steps[index + 1];
    if (!nextStep) return 'bg-white/[0.04]';
    const status = getStepStatus(nextStep.id);
    if (status === 'completed' || index < activeIdx) {
      return 'bg-gradient-to-r from-cyan-500 to-blue-500';
    }
    return 'bg-white/[0.04]';
  };

  return (
    <div className="w-full flex items-center justify-between gap-6 px-6 py-4 bg-[#040d1c]/90 border-b border-white/[0.05] shrink-0 select-none">
      
      {/* Steps horizontal bar */}
      <div className="flex-1 flex items-center overflow-x-auto scrollbar-none gap-2 py-1">
        {steps.map((step: NavigationStep, idx: number) => {
          const status = getStepStatus(step.id);
          const isActive = status === 'active';
          const isCompleted = status === 'completed';
          const isBlocked = status === 'blocked';

          // Color tokens
          const badgeBg = isActive ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' :
                          isCompleted ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' :
                          isBlocked ? 'bg-rose-500/5 border-rose-500/10 text-rose-500/40' :
                          'bg-white/[0.02] border-white/[0.06] text-slate-500';

          return (
            <React.Fragment key={step.id}>
              {/* Step item */}
              <div
                onClick={() => {
                  if (!isBlocked) {
                    handleJump(step.id);
                  }
                }}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-left cursor-pointer transition-all shrink-0 group
                  ${isActive ? 'bg-blue-500/5 border-blue-500/20' : 
                    isBlocked ? 'opacity-40 cursor-not-allowed border-transparent' : 
                    'hover:bg-white/[0.02] hover:border-white/10'}`}
              >
                {/* Step Circle Indicator */}
                <div className={`w-6 h-6 rounded-lg border flex items-center justify-center text-[10px] font-bold ${badgeBg} transition-all`}>
                  {isCompleted ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : isBlocked ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                <div className="flex flex-col">
                  <span className={`text-xs font-bold transition-colors
                    ${isActive ? 'text-blue-400 font-extrabold' : 
                      isCompleted ? 'text-emerald-400/90' : 
                      isBlocked ? 'text-slate-600' : 'text-slate-400 group-hover:text-slate-200'}`}>
                    {step.label}
                  </span>
                  <span className="text-[9px] text-slate-600 truncate max-w-[120px] hidden sm:block">
                    {step.desc}
                  </span>
                </div>
              </div>

              {/* Connector line between steps */}
              {idx < steps.length - 1 && (
                <div className={`h-0.5 w-6 sm:w-10 rounded-full shrink-0 ${getConnectorClass(idx)}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* "Jump to..." dropdown */}
      <div className="relative shrink-0" ref={jumpMenuRef}>
        <button
          onClick={() => setIsJumpOpen(!isJumpOpen)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.01] hover:bg-white/[0.05] text-slate-400 hover:text-white transition-all text-xs font-bold shadow-lg"
        >
          <Compass className="w-4 h-4 text-cyan-400" />
          <span>Jump to...</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isJumpOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isJumpOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="absolute right-0 mt-2 w-64 bg-slate-950 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden py-1.5 z-50 text-left"
            >
              <div className="px-4 py-1.5 text-[9px] font-black uppercase text-slate-500 tracking-wider">
                Select step to jump
              </div>
              
              {steps.map((step: NavigationStep, idx: number) => {
                const status = getStepStatus(step.id);
                const isBlocked = status === 'blocked';
                const isCurrent = step.id === activeTab;
                const blockedReason = isBlocked ? (getBlockedReason(step.id) || 'Step is locked') : null;

                return (
                  <button
                    key={step.id}
                    disabled={isCurrent}
                    onClick={() => {
                      if (isBlocked) {
                        // Triggers the blocking error toast
                        handleJump(step.id);
                      } else {
                        handleJump(step.id);
                        setIsJumpOpen(false);
                      }
                    }}
                    className={`w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors hover:bg-white/[0.03]
                      ${isCurrent ? 'bg-blue-500/5 text-blue-400 font-bold cursor-default' : 
                        isBlocked ? 'opacity-40 hover:bg-transparent' : 'text-slate-300'}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`text-[10px] font-mono font-bold
                        ${isCurrent ? 'text-blue-400' : 'text-slate-500'}`}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-xs truncate">{step.label}</span>
                    </div>

                    {isBlocked ? (
                      <span title={blockedReason || ''} className="shrink-0">
                        <Lock className="w-3.5 h-3.5 text-rose-500" />
                      </span>
                    ) : isCurrent ? (
                      <Play className="w-3 h-3 text-blue-400 shrink-0" />
                    ) : status === 'completed' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
};
