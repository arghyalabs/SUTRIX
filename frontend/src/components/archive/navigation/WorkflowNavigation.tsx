/**
 * @deprecated Deprecated in SUTRIX V5 Workspace-First Refactor.
 * Retained in archive/ for rollback compatibility and design reference.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useStudioNavigation } from '../../studio/navigation/StudioNavigationProvider';
import type { NavigationStep } from '../../studio/navigation/StudioNavigationProvider';
import { ChevronRight, ChevronLeft, RefreshCw, Trash2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

export const WorkflowNavigation: React.FC = () => {
  const {
    steps,
    activeTab,
    nextStepId,
    prevStepId,
    getStepStatus,
    autoSaveStatus,
    lastSavedTime,
    handleNext,
    handlePrevious,
    resetCurrentStep,
    resetStudioWorkspace,
    deleteSessionWorkspace
  } = useStudioNavigation();

  // Scroll Reveal state
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Reset dropdown state
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const resetMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const isCloseToBottom = currentScrollY + clientHeight >= scrollHeight - 90;

      if (isCloseToBottom) {
        // Auto-hide when user reaches footer
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY.current) {
        // Reappear on upward scroll
        setIsVisible(true);
      } else if (currentScrollY > 100 && currentScrollY > lastScrollY.current) {
        // Hide on downward scroll
        setIsVisible(false);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Click outside to close reset menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (resetMenuRef.current && !resetMenuRef.current.contains(e.target as Node)) {
        setIsResetOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeIdx = steps.findIndex((s: NavigationStep) => s.id === activeTab);
  const currentStep = steps[activeIdx];
  const nextStep = nextStepId ? steps.find((s: NavigationStep) => s.id === nextStepId) : null;
  const prevStep = prevStepId ? steps.find((s: NavigationStep) => s.id === prevStepId) : null;

  // Completion percentage
  const validSteps = steps.filter((s: NavigationStep) => getStepStatus(s.id) !== 'blocked');
  const completedCount = steps.filter((s: NavigationStep) => getStepStatus(s.id) === 'completed' || s.id === activeTab).length;
  const pct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  // Format last saved time
  const [savedText, setSavedText] = useState('✓ Saved');
  useEffect(() => {
    if (autoSaveStatus === 'saving') {
      setSavedText('Saving...');
      return;
    }
    if (autoSaveStatus === 'error') {
      setSavedText('⚠️ Save error');
      return;
    }
    if (!lastSavedTime) {
      setSavedText('✓ Saved');
      return;
    }

    const updateText = () => {
      const diffSec = Math.floor((Date.now() - lastSavedTime) / 1000);
      if (diffSec < 5) setSavedText('✓ Saved just now');
      else if (diffSec < 60) setSavedText(`✓ Saved ${diffSec}s ago`);
      else {
        const diffMin = Math.floor(diffSec / 60);
        setSavedText(`✓ Saved ${diffMin}m ago`);
      }
    };

    updateText();
    const interval = setInterval(updateText, 5000);
    return () => clearInterval(interval);
  }, [lastSavedTime, autoSaveStatus]);

  // Dynamic semantic labels
  const nextLabel = currentStep?.nextLabel || (nextStep ? `Continue to ${nextStep.label}` : 'Finish Workflow');
  const prevLabel = currentStep?.prevLabel || (prevStep ? `Back to ${prevStep.label}` : 'Back');

  // Animated progress bar character representation
  const renderProgressBar = () => {
    const totalBars = 16;
    const filledBars = Math.round((pct / 100) * totalBars);
    const emptyBars = totalBars - filledBars;
    return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="sticky bottom-6 z-40 mx-auto w-full max-w-5xl px-4 pointer-events-none"
        >
          <div className="w-full pointer-events-auto backdrop-blur-xl bg-slate-950/65 border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
            
            {/* Left: Previous Button (contextual label, outline) */}
            <div className="w-full md:w-auto flex justify-start shrink-0">
              {prevStepId ? (
                <button
                  onClick={handlePrevious}
                  aria-label={`Go to previous step: ${prevStep?.label || ''}`}
                  className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/10 bg-white/[0.02] text-slate-300 hover:text-white hover:bg-white/[0.06] hover:border-white/20 active:scale-[0.98] transition-all text-xs font-semibold min-h-[48px] md:min-h-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {prevLabel}
                </button>
              ) : (
                <div className="hidden md:block w-[120px]" />
              )}
            </div>

            {/* Center: Step stats and progress bar */}
            <div className="flex flex-col items-center text-center gap-1.5 flex-1">
              <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
                <span>Step {activeIdx + 1} of {steps.length}</span>
                <span className="text-slate-600">·</span>
                <span className="text-cyan-400">{pct}% Complete</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-500 font-mono text-[9px]">{savedText}</span>
              </div>
              
              <div className="flex items-center gap-3 w-full max-w-md justify-center">
                {/* Visual Progress Bar Track */}
                <div className="h-1.5 w-32 bg-white/[0.03] border border-white/[0.06] rounded-full overflow-hidden relative hidden sm:block">
                  <motion.div
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="font-mono text-[10px] text-slate-500 tracking-tighter leading-none hidden sm:inline">
                  {renderProgressBar()}
                </span>
              </div>
            </div>

            {/* Right Side: Reset Options & Next Button */}
            <div className="w-full md:w-auto flex flex-row items-center justify-between md:justify-end gap-3 shrink-0">
              
              {/* Reset Menu Dropdown */}
              <div className="relative" ref={resetMenuRef}>
                <button
                  onClick={() => setIsResetOpen(!isResetOpen)}
                  className="flex items-center justify-center gap-1.5 px-3 py-3 md:py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.05] text-slate-400 hover:text-white transition-all text-xs font-bold min-h-[48px] md:min-h-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Options</span>
                </button>
                
                <AnimatePresence>
                  {isResetOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute bottom-full right-0 mb-2 w-56 bg-slate-950 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden py-1.5 z-50 text-left"
                    >
                      <button
                        onClick={() => { resetCurrentStep(); setIsResetOpen(false); }}
                        className="w-full px-4 py-2 hover:bg-white/[0.04] text-slate-300 hover:text-white text-xs font-medium transition-colors"
                      >
                        Reset Current Step
                      </button>
                      <button
                        onClick={() => { resetStudioWorkspace(); setIsResetOpen(false); }}
                        className="w-full px-4 py-2 hover:bg-white/[0.04] text-slate-300 hover:text-white text-xs font-medium transition-colors"
                      >
                        Reset Studio Workspace
                      </button>
                      <div className="h-px bg-white/[0.05] my-1" />
                      <button
                        onClick={() => { setShowDeleteConfirm(true); setIsResetOpen(false); }}
                        className="w-full px-4 py-2 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 text-xs font-medium transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Workspace Session
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Next Button (semantic label, gradient emphasis) */}
              <button
                onClick={handleNext}
                aria-label={`Proceed to next step: ${nextStep?.label || ''}`}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black hover:from-cyan-400 hover:to-blue-500 transition-all text-xs shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 active:scale-[0.98] min-h-[48px] md:min-h-0"
              >
                <span>{nextLabel}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        </motion.div>
      )}

      {/* Delete Workspace Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400">
              <ShieldAlert className="w-8 h-8 animate-pulse" />
            </div>
            <h3 className="text-lg font-bold text-white">Delete Workspace?</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              This will completely delete all uploaded files, intermediate parquets, and serialized state logs on the server. This cannot be undone.
            </p>
            <div className="flex gap-2 w-full pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowDeleteConfirm(false);
                  const t = toast.loading('Deleting workspace session on server...');
                  try {
                    await deleteSessionWorkspace();
                    toast.success('Workspace deleted successfully.', { id: t });
                  } catch {
                    toast.error('Failed to delete workspace session.', { id: t });
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-500/20 text-rose-300 text-xs font-bold hover:bg-rose-500/30 transition-colors"
              >
                Delete Session
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
