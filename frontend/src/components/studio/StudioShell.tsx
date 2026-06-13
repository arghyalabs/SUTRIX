import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Download, RotateCcw, PauseCircle, Activity,
  ChevronLeft, ChevronRight, Database, Layers, CheckCircle2, AlertCircle, Loader2,
  X, RefreshCw, Pin, PinOff, Check, Lock, Compass
} from 'lucide-react';
import { useStudioNavigation } from './navigation/StudioNavigationProvider';
import type { NavigationStep } from './navigation/StudioNavigationProvider';
import { CommandPalette } from './navigation/CommandPalette';
import { HeaderWorkflowNavigator } from '../navigation/HeaderWorkflowNavigator';
import * as Tooltip from '@radix-ui/react-tooltip';
import { SUTRIXLogo } from '../ui/SUTRIXLogo';
import type { StudioId } from '../../services/workspaceManagerService';
import { workspaceManager } from '../../services/workspaceManagerService';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

interface StudioMeta {
  id: StudioId;
  letter: string;
  name: string;
  shortName: string;
  tagline: string;
  color: string;         // tailwind color name
  accentHex: string;     // hex for inline styles
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeBg: string;
}

const STUDIO_META: Record<StudioId, StudioMeta> = {
  hierarchy:     {
    id: 'hierarchy',     letter: '1', name: 'Hierarchy Builder & Segregation Studio',
    shortName: 'Hierarchy Studio', tagline: 'Build hierarchical subgroup structures',
    color: 'cyan',    accentHex: '#22d3ee',
    bgClass: 'bg-cyan-500/10',    borderClass: 'border-cyan-500/30',
    textClass: 'text-cyan-400',   badgeBg: 'bg-cyan-500/15',
  },
  analytics:     {
    id: 'analytics',     letter: '2', name: 'Scientific Data Analysis Studio',
    shortName: 'Analytics Studio', tagline: 'Dataset profiling & diagnostics',
    color: 'violet',  accentHex: '#8b5cf6',
    bgClass: 'bg-violet-500/10',  borderClass: 'border-violet-500/30',
    textClass: 'text-violet-400', badgeBg: 'bg-violet-500/15',
  },
  compound:      {
    id: 'compound',      letter: '3', name: 'Compound Explorer Studio',
    shortName: 'Compound Studio', tagline: 'Visual chemical structure browsing',
    color: 'emerald', accentHex: '#10b981',
    bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/30',
    textClass: 'text-emerald-400',badgeBg: 'bg-emerald-500/15',
  },
  normalization: {
    id: 'normalization', letter: '4', name: 'Unit Harmonization & Normalization Studio',
    shortName: 'Normalization Studio', tagline: 'Scientific data standardization',
    color: 'amber',   accentHex: '#f59e0b',
    bgClass: 'bg-amber-500/10',   borderClass: 'border-amber-500/30',
    textClass: 'text-amber-400',  badgeBg: 'bg-amber-500/15',
  },
  qsar:          {
    id: 'qsar',          letter: '5', name: 'QSAR / AI Dataset Engineering Studio',
    shortName: 'QSAR Studio', tagline: 'AI-ready predictive modeling',
    color: 'blue',    accentHex: '#3b82f6',
    bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/30',
    textClass: 'text-blue-400',   badgeBg: 'bg-blue-500/15',
  },
  intelligence:  {
    id: 'intelligence',  letter: '6', name: 'Scientific Intelligence Studio',
    shortName: 'Intelligence Studio', tagline: 'Chemical diversity & analysis',
    color: 'rose',    accentHex: '#f43f5e',
    bgClass: 'bg-rose-500/10',    borderClass: 'border-rose-500/30',
    textClass: 'text-rose-400',   badgeBg: 'bg-rose-500/15',
  },
  oecd:          {
    id: 'oecd',          letter: '7', name: 'OECD Validation Studio',
    shortName: 'OECD Studio', tagline: 'Regulatory QSAR compliance',
    color: 'slate',   accentHex: '#94a3b8',
    bgClass: 'bg-slate-500/10',   borderClass: 'border-slate-400/30',
    textClass: 'text-slate-300',  badgeBg: 'bg-slate-500/15',
  },
};

export interface StudioShellProps {
  studioId: StudioId;
  onPauseAndGoHub: () => void;
  sidebar: React.ReactNode;
  children: React.ReactNode;
  // Toolbar handlers
  onUpload?: () => void;
  onExport?: () => void;
  onReset?: () => void;
  isProcessing?: boolean;
  datasetFilename?: string;
  rowCount?: number;
  activeStep?: string;
}

export const StudioShellContext = createContext({ collapsed: true });

export const StudioShell: React.FC<StudioShellProps> = ({
  studioId,
  onPauseAndGoHub,
  sidebar,
  children,
  onUpload,
  onExport,
  onReset,
  isProcessing = false,
  datasetFilename = '',
  rowCount = 0,
  activeStep = '',
}) => {
  const meta = STUDIO_META[studioId];
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const store = useWorkspaceStore();
  const { sidebarPinned, setSidebarPinned } = store;
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = sidebarPinned || isHovered;

  const nav = useStudioNavigation();
  const completedCount = nav && nav.steps
    ? nav.steps.filter(s => nav.getStepStatus(s.id) === 'completed' || s.id === nav.activeTab).length
    : 0;
  const pct = nav && nav.steps && nav.steps.length > 0
    ? Math.round((completedCount / nav.steps.length) * 100)
    : 0;

  const renderProgressBar = (percentage: number) => {
    const totalBars = 10;
    const filledBars = Math.round((percentage / 100) * totalBars);
    const emptyBars = totalBars - filledBars;
    return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  };

  // Auto-save to workspace manager every 30s
  useEffect(() => {
    workspaceManager.startAutoSave(studioId, () => {
      const storeState = useWorkspaceStore.getState();
      const serializableState: Record<string, any> = {};
      Object.keys(storeState).forEach((key) => {
        const value = (storeState as any)[key];
        if (typeof value !== 'function' && key !== 'currentStudioId' && key !== 'inWorkspace' && key !== 'activeTab') {
          serializableState[key] = value;
        }
      });

      return {
        datasetFilename,
        rowCount,
        activeStep,
        processingStatus: isProcessing ? 'running' : 'idle',
        studioState: serializableState,
      };
    });
    return () => workspaceManager.stopAutoSave(studioId);
  }, [studioId, datasetFilename, rowCount, activeStep, isProcessing]);

  const handlePause = useCallback(() => {
    workspaceManager.pauseWorkspace(studioId);
    onPauseAndGoHub();
  }, [studioId, onPauseAndGoHub]);

  const handleReset = useCallback(() => {
    setShowResetConfirm(false);
    onReset?.();
    workspaceManager.resetWorkspace(studioId);
  }, [studioId, onReset]);

  return (
    <StudioShellContext.Provider value={{ collapsed: !isExpanded }}>
      <Tooltip.Provider delayDuration={200}>
        <div className="flex h-screen bg-[#030b18] text-white overflow-hidden selection:bg-cyan-500/30">

          {/* Floating Sidebar */}
          <motion.aside
            initial={false}
            animate={{ width: isExpanded ? 280 : 80 }}
            className="relative flex flex-col glass-elevated my-4 ml-4 mr-4 rounded-2xl shrink-0 z-20 overflow-hidden bg-[#050d1a]/90 backdrop-blur-xl border border-white/[0.08]"
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
          >
            {/* Header */}
            <div className={`flex flex-col border-b border-white/[0.06] shrink-0 py-4 ${!isExpanded ? 'items-center' : 'px-4'} gap-2`}>
              <div className={`flex items-center h-16 ${!isExpanded ? 'justify-center' : 'gap-3'}`}>
                <div className="shrink-0 flex items-center justify-center w-12 h-12">
                  <SUTRIXLogo className="w-10 h-10" />
                </div>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                      className="whitespace-nowrap min-w-0"
                    >
                      <div className="text-xl font-extrabold tracking-[0.2em] leading-none text-white">SUTRIX</div>
                      <div className="text-[10px] text-slate-500 font-medium tracking-wider uppercase mt-1">SDO Platform</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Badges */}
              <AnimatePresence>
                {!isExpanded && (
                  <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-bold">
                    {meta.letter}
                  </div>
                )}
                {isExpanded && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2 mt-2">
                    <div className={`inline-flex self-start items-center gap-1.5 px-2.5 py-1 rounded-lg ${meta.bgClass} border ${meta.borderClass}`}>
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.textClass}`}>
                        Studio {meta.letter}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white/90 leading-snug">{meta.shortName}</div>
                    
                    {/* Dataset Pill */}
                    {datasetFilename ? (
                      <div className="mt-1 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        <span className="text-[10px] text-emerald-300 truncate font-medium">{datasetFilename}</span>
                      </div>
                    ) : (
                      <div className="mt-1 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                        <AlertCircle className="w-3 h-3 text-slate-600 flex-shrink-0" />
                        <span className="text-[10px] text-slate-600 font-medium">No Dataset Loaded</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Nav Items */}
            <div className={`flex-1 overflow-y-auto py-4 ${isExpanded ? 'px-3' : 'px-2'} space-y-2 scrollbar-none`}>
              {/* Studio Overview Drawer */}
              {isExpanded && nav && nav.steps && nav.steps.length > 0 && (
                <div className="mb-4 flex flex-col gap-1.5 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <div className="text-xs font-extrabold text-white/90 leading-tight">{meta.shortName}</div>
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 font-bold mt-1">
                    <span>{renderProgressBar(pct)}</span>
                    <span className="text-cyan-400">{pct}%</span>
                  </div>
                  {rowCount > 0 && (
                    <div className="text-[9px] text-slate-500 font-semibold mt-0.5">
                      {rowCount.toLocaleString()} rows loaded
                    </div>
                  )}
                </div>
              )}

              {nav && nav.steps && nav.steps.length > 0 ? (
                <div className="space-y-1">
                  {nav.steps.map((step: NavigationStep) => {
                    const status = nav.getStepStatus(step.id);
                    const isActive = status === 'active';
                    const isCompleted = status === 'completed';
                    const isBlocked = status === 'blocked';

                    // Optional check (for recovery)
                    const isOptional = (step.id === 'structure-recovery' && 
                      ((store.structureState as string) === 'CAS_ONLY' || (store.structureState as string) === 'FORMULA_ONLY'));

                    const ButtonContent = (
                      <button
                        onClick={() => !isBlocked && nav.handleJump(step.id)}
                        disabled={isBlocked}
                        className={`w-full flex items-center h-11 rounded-xl transition-all duration-200 group relative text-left
                          ${isExpanded ? 'px-3 gap-3' : 'justify-center'}
                          ${isActive 
                            ? 'bg-cyan-500/10 text-white border border-cyan-500/20' 
                            : isBlocked 
                              ? 'opacity-40 cursor-not-allowed text-slate-600 hover:bg-transparent' 
                              : 'text-slate-400 hover:bg-white/[0.03] hover:text-white border border-transparent'
                          }
                        `}
                      >
                        {isActive && (
                          <motion.div 
                            layoutId="activeTabIndicator" 
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-cyan-400 rounded-r-full"
                          />
                        )}
                        
                        {/* Step Icon */}
                        <div className={`w-8 h-8 flex items-center justify-center shrink-0 rounded-lg bg-white/[0.02] border border-white/[0.04]
                          ${isActive ? 'text-cyan-400 border-cyan-500/20' : 'text-slate-500 group-hover:text-slate-300'}`}>
                          {step.icon}
                        </div>

                        {isExpanded && (
                          <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                            <span className="font-semibold text-xs truncate">{step.label}</span>
                            
                            {/* Status Indicator */}
                            {isBlocked ? (
                              <Lock className="w-3.5 h-3.5 text-rose-500/80 shrink-0" />
                            ) : isCompleted ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 font-bold" />
                            ) : isOptional ? (
                              <span className="text-[8px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Opt</span>
                            ) : isActive ? (
                              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full shrink-0 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                            ) : (
                              <span className="w-1.5 h-1.5 border border-slate-600 rounded-full shrink-0" />
                            )}
                          </div>
                        )}
                      </button>
                    );

                    return !isExpanded ? (
                      <Tooltip.Root key={step.id}>
                        <Tooltip.Trigger asChild>{ButtonContent}</Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content side="right" sideOffset={16} className="bg-[#050d1a] border border-white/[0.08] px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-2xl z-50">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold text-white">{step.label}</span>
                              <span className="text-[10px] text-slate-400">{step.desc}</span>
                            </div>
                            <Tooltip.Arrow className="fill-[#050d1a]" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    ) : (
                      <div key={step.id}>{ButtonContent}</div>
                    );
                  })}
                </div>
              ) : (
                sidebar
              )}
            </div>

            {/* Utility Buttons */}
            <div className={`py-3 border-t border-white/[0.06] space-y-2 shrink-0 ${isExpanded ? 'px-3' : 'px-2'}`}>
              {onUpload && <SidebarUtilButton icon={<Upload className="w-5 h-5" />} label="Upload Dataset" onClick={onUpload} disabled={isProcessing} color={meta.textClass} />}
              {onExport && <SidebarUtilButton icon={<Download className="w-5 h-5" />} label="Export Results" onClick={onExport} disabled={isProcessing} />}
              <SidebarUtilButton icon={<RotateCcw className="w-5 h-5" />} label="Reset Workspace" onClick={() => setShowResetConfirm(true)} variant="danger" />
              <SidebarUtilButton icon={<ChevronLeft className="w-5 h-5" />} label="Return to Tool Hub" onClick={handlePause} variant="hub" />
              <SidebarUtilButton 
                icon={sidebarPinned ? <ChevronLeft className="w-5 h-5 text-slate-500" /> : <ChevronRight className="w-5 h-5 text-slate-500" />} 
                label={sidebarPinned ? "Collapse Sidebar" : "Pin Sidebar"} 
                onClick={() => setSidebarPinned(!sidebarPinned)} 
              />
            </div>
          </motion.aside>

      {/* ── Main Content Area ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full overflow-hidden">
        {/* Top toolbar bar */}
        <header className="flex-shrink-0 flex flex-col justify-center px-6 py-3 bg-[#050d1a]/80 backdrop-blur-md border-b border-white/[0.04] z-10 min-h-[72px]">
          <HeaderWorkflowNavigator studioId={studioId} isProcessing={isProcessing} />
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>

      {/* ── Reset Confirmation Modal ──────────────────────────────── */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm p-6 rounded-2xl bg-[#0d1a2e] border border-white/[0.08] shadow-2xl"
            >
              <h3 className="font-bold text-white text-base mb-1">Reset this Studio?</h3>
              <p className="text-sm text-slate-400 mb-5">
                All uploaded files, generated artifacts, and processing state for{' '}
                <strong className="text-white">{meta.name}</strong> will be permanently cleared.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-slate-400 text-sm font-bold hover:bg-white/[0.04] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/20 text-rose-300 text-sm font-bold hover:bg-rose-500/30 transition-colors"
                >
                  Reset Studio
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </div>
      </Tooltip.Provider>
      <CommandPalette />
    </StudioShellContext.Provider>
  );
};

// ── Sidebar Nav Item (exported so studios can use it) ─────────────────────────
export interface SidebarNavItemProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  isActive: boolean;
  isDisabled?: boolean;
  badge?: string | number;
  onClick: () => void;
  accentClass: string;   // e.g. 'text-violet-400'
  activeBgClass: string; // e.g. 'bg-violet-500/10'
  activeBorderClass: string; // e.g. 'border-violet-400'
}

export const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  icon, label, description, isActive, isDisabled = false,
  badge, onClick, accentClass, activeBgClass, activeBorderClass,
}) => {
  const { collapsed } = useContext(StudioShellContext);

  const ButtonContent = (
    <button
      onClick={() => !isDisabled && onClick()}
      disabled={isDisabled}
      className={`
        w-full flex items-center h-12 rounded-xl transition-all duration-200 group relative
        ${collapsed ? 'justify-center' : 'justify-start px-3 gap-3'}
        ${isActive
          ? `${activeBgClass} text-white`
          : isDisabled
            ? 'opacity-50 cursor-not-allowed text-slate-500 hover:bg-transparent'
            : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
        }
      `}
    >
      {isActive && (
        <motion.div layoutId="activeTabIndicator" className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full ${activeBgClass.replace('/10', '')}`} style={{ backgroundColor: 'currentColor', color: 'inherit' }} />
      )}
      <div className={`w-10 h-10 flex items-center justify-center shrink-0 ${isActive ? accentClass : 'group-hover:text-white transition-colors'}`}>
        {icon}
      </div>
      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col text-left justify-center overflow-hidden min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm truncate">{label}</span>
              {badge !== undefined && (
                <span className={`text-[10px] ${activeBgClass} ${accentClass} px-2 py-0.5 rounded-full font-mono`}>{badge}</span>
              )}
            </div>
            {description && <div className={`text-[10px] truncate mt-0.5 ${isActive ? 'text-white/60' : 'text-slate-500'}`}>{description}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );

  return collapsed ? (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{ButtonContent}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={16} className="bg-[#050d1a] border border-white/[0.08] px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-xl animate-in fade-in z-50">
           {label}
           <Tooltip.Arrow className="fill-[#050d1a]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  ) : (
    <div key={label}>{ButtonContent}</div>
  );
};

// ── Sidebar Section Divider ───────────────────────────────────────────────────
export const SidebarSection: React.FC<{ label: string }> = ({ label }) => {
  const { collapsed } = useContext(StudioShellContext);
  if (collapsed) return <div className="h-4" />; // spacer when collapsed
  
  return (
    <div className={`pt-4 pb-1 ${collapsed ? 'text-center' : 'px-4'}`}>
      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{label}</span>
    </div>
  );
};

// ── Bottom utility button ─────────────────────────────────────────────────────
const SidebarUtilButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger' | 'hub';
  color?: string;
}> = ({ icon, label, onClick, disabled, variant = 'default', color }) => {
  const { collapsed } = useContext(StudioShellContext);

  const cls = variant === 'danger'
    ? 'text-rose-500/80 hover:text-rose-500 hover:bg-rose-500/10'
    : variant === 'hub'
      ? 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
      : `${color || 'text-slate-400'} hover:bg-white/[0.05] hover:text-white`;

  const ButtonContent = (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center h-12 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${cls} ${collapsed ? 'justify-center' : 'justify-start px-3 gap-3'}`}
    >
      <div className="w-10 h-10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <AnimatePresence>
        {!collapsed && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-semibold text-sm truncate whitespace-nowrap">
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );

  return collapsed ? (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{ButtonContent}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={16} className="bg-[#050d1a] border border-white/[0.08] px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-xl animate-in fade-in z-50">
           {label}
           <Tooltip.Arrow className="fill-[#050d1a]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  ) : (
    <div key={label}>{ButtonContent}</div>
  );
};
