import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Grid, BarChart2, Zap, Activity, Download,
  LogOut, HelpCircle, FileDigit, Scale, Network, CheckSquare, Settings,
  Brain, Search, RefreshCw, GitBranch, Filter, Sliders, ChevronRight, ChevronLeft, 
  Lock, AlertTriangle, Check, Database, AlertCircle, Loader2
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { SUTRIXLogo, LogoLoader } from '../ui/SUTRIXLogo';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { DatasetModeBadge } from '../ui/DatasetModeBadge';
import ActiveSubgroupBanner from '../ui/ActiveSubgroupBanner';

// Navigation Imports
import { useStudioNavigation } from '../studio/navigation/StudioNavigationProvider';
import { CommandPalette } from '../studio/navigation/CommandPalette';
import { HeaderWorkflowNavigator } from '../navigation/HeaderWorkflowNavigator';

// Tabs that need true fullscreen (no scroll wrapper, no padding, no page-level scroll)
const TRUE_FULLSCREEN_TABS = new Set([
  'hierarchy', 'advanced-tree', 'analysis', 'feature-selection', 'reports'
]);

// Full-width tabs that are scrollable (no horizontal padding limit, but scroll naturally)
const SCROLLABLE_FULL_WIDTH_TABS = new Set([
  'enrichment', 'readiness', 'verification', 'sci-intelligence', 'sci-explorer', 
  'subgroup-selection', 'compound-explorer', 'feature-selection', 'structure', 'recovery', 'reports'
]);

interface SidebarItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  stepNum: number;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onExit: () => void;
  onGoHome: () => void;
  onOpenLicense: () => void;
  onOpenSystem?: () => void;
  onSwitchWorkspace?: () => void;
  telemetryData?: {
    ram_usage_pct: number;
    fps: number;
    active_jobs_count: number;
  };
}

const WarningBanner: React.FC = () => {
  const nav = useStudioNavigation();
  if (!nav) return null;
  const warning = nav.getWarning(nav.activeTab);
  if (!warning) return null;
  return (
    <div className="mx-6 mt-4 p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex flex-col">
        <span className="text-xs font-bold text-amber-300">Prerequisite Warning</span>
        <span className="text-[11px] text-amber-400/80 mt-0.5 leading-relaxed">{warning}</span>
      </div>
    </div>
  );
};

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  onExit,
  onGoHome,
  onOpenLicense,
  onOpenSystem,
  onSwitchWorkspace,
  telemetryData = { ram_usage_pct: 42, fps: 60, active_jobs_count: 0 }
}) => {
  const { 
    sidebarPinned, 
    setSidebarPinned, 
    datasetMode, 
    detectedDomain, 
    structureState,
    filename,
    rowCount
  } = useWorkspaceStore();

  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = sidebarPinned || isHovered;

  const nav = useStudioNavigation();

  const SUTRIX_TABS: SidebarItem[] = [
    { id: 'ingest',             name: 'Dataset Assessment',              icon: <Upload className="w-5 h-5" />,       stepNum: 1 },
    { id: 'structure-recovery',   name: 'Structure Recovery',              icon: <Search className="w-5 h-5" />,       stepNum: 2 },
    { id: 'enrichment',         name: 'Descriptor Engineering',          icon: <Zap className="w-5 h-5" />,          stepNum: 3 },
    { id: 'readiness',          name: 'Applicability Domain',            icon: <CheckSquare className="w-5 h-5" />,  stepNum: 4 },
    { id: 'reports',            name: 'OECD Audit',                      icon: <Download className="w-5 h-5" />,     stepNum: 5 },
  ];

  const isTabLocked = (tabId: string): boolean => {
    if (nav) {
      return nav.getStepStatus(tabId) === 'blocked';
    }
    return false;
  };

  // Dynamically map navigation items from the provider context or fallback
  const sidebarItems = nav
    ? nav.steps.map((step, idx) => ({
        id: step.id,
        name: step.label,
        icon: step.icon,
        stepNum: idx + 1
      }))
    : SUTRIX_TABS.filter(item => {
        if (item.id === 'structure-recovery') {
          return structureState !== 'MOLECULAR';
        }
        return true;
      }).map((item, idx) => ({
        ...item,
        stepNum: idx + 1
      }));

  const currentStep = sidebarItems.find(i => i.id === activeTab) || {
    stepNum: 1,
    name: activeTab
  };

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

  return (
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
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
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
                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                  5
                </div>
              )}
              {isExpanded && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2 mt-2">
                  <div className="inline-flex self-start items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                      Studio 5
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white/90 leading-snug">QSAR Studio</div>
                  
                  {filename ? (
                    <div className="mt-1 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span className="text-[10px] text-emerald-300 truncate font-medium">{filename}</span>
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
                <div className="text-xs font-extrabold text-white/90 leading-tight">QSAR Studio</div>
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

            {sidebarItems.map((item) => {
              const isActive = activeTab === item.id;
              const locked = isTabLocked(item.id);
              
              const status = nav ? nav.getStepStatus(item.id) : (locked ? 'blocked' : (isActive ? 'active' : 'completed'));
              const isCompleted = status === 'completed';
              const isBlocked = status === 'blocked';
              const isActiveStep = status === 'active';

              // Optional structure recovery badge
              const isOptional = (item.id === 'structure-recovery' && 
                ((structureState as string) === 'CAS_ONLY' || (structureState as string) === 'FORMULA_ONLY'));

              const ButtonContent = (
                <button
                  id={`sidebar-tab-${item.id}`}
                  onClick={() => {
                    if (nav) {
                      nav.handleJump(item.id);
                    } else if (!locked) {
                      setActiveTab(item.id);
                    }
                  }}
                  disabled={isBlocked}
                  className={`w-full flex items-center h-11 rounded-xl transition-all duration-200 group relative text-left
                    ${isExpanded ? 'px-3 gap-3' : 'justify-center'}
                    ${isActiveStep 
                      ? 'bg-cyan-500/10 text-white border border-cyan-500/20' 
                      : isBlocked 
                        ? 'opacity-40 cursor-not-allowed text-slate-600 hover:bg-transparent' 
                        : 'text-slate-400 hover:bg-white/[0.03] hover:text-white border border-transparent'
                    }
                  `}
                >
                  {isActiveStep && (
                    <motion.div 
                      layoutId="activeTabIndicator" 
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-cyan-400 rounded-r-full"
                    />
                  )}
                  
                  {/* Step Icon */}
                  <div className={`w-8 h-8 flex items-center justify-center shrink-0 rounded-lg bg-white/[0.02] border border-white/[0.04]
                    ${isActiveStep ? 'text-cyan-400 border-cyan-500/20' : 'text-slate-500 group-hover:text-slate-300'}`}>
                    {item.icon}
                  </div>

                  {isExpanded && (
                    <div className="flex-1 flex items-center justify-between min-w-0 pr-1">
                      <span className="font-semibold text-xs truncate">{item.name}</span>
                      
                      {/* Status Indicator */}
                      {isBlocked ? (
                        <Lock className="w-3.5 h-3.5 text-rose-500/80 shrink-0" />
                      ) : isCompleted ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 font-bold" />
                      ) : isOptional ? (
                        <span className="text-[8px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Opt</span>
                      ) : isActiveStep ? (
                        <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full shrink-0 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                      ) : (
                        <span className="w-1.5 h-1.5 border border-slate-600 rounded-full shrink-0" />
                      )}
                    </div>
                  )}
                </button>
              );

              return !isExpanded ? (
                <Tooltip.Root key={item.id}>
                  <Tooltip.Trigger asChild>{ButtonContent}</Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content side="right" sideOffset={16} className="bg-[#050d1a] border border-white/[0.08] px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-2xl z-50">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-white">{item.name}</span>
                      </div>
                      <Tooltip.Arrow className="fill-[#050d1a]" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              ) : (
                <div key={item.id}>{ButtonContent}</div>
              );
            })}
          </div>

          {/* Footer Utilities */}
          <div className={`py-3 border-t border-white/[0.06] space-y-2 shrink-0 ${isExpanded ? 'px-3' : 'px-2'}`}>
            {onSwitchWorkspace && (
              <SidebarUtilButton
                icon={<RefreshCw className="w-5 h-5 text-cyan-400" />}
                label="Switch Workspace"
                onClick={onSwitchWorkspace}
                isExpanded={isExpanded}
              />
            )}
            <SidebarUtilButton
              icon={<Activity className="w-5 h-5" />}
              label="System Monitor"
              onClick={() => onOpenSystem ? onOpenSystem() : setActiveTab('benchmark')}
              isActive={activeTab === 'benchmark'}
              isExpanded={isExpanded}
            />
            <SidebarUtilButton
              icon={<Scale className="w-5 h-5 text-cyan-400" />}
              label="AGPL-3.0 License"
              onClick={onOpenLicense}
              isExpanded={isExpanded}
            />
            <SidebarUtilButton
              icon={<LogOut className="w-5 h-5" />}
              label="Exit Workspace"
              onClick={onExit}
              variant="danger"
              isExpanded={isExpanded}
            />
            <SidebarUtilButton
              icon={sidebarPinned ? <ChevronLeft className="w-5 h-5 text-slate-500" /> : <ChevronRight className="w-5 h-5 text-slate-500" />}
              label={sidebarPinned ? "Collapse Sidebar" : "Pin Sidebar"}
              onClick={() => setSidebarPinned(!sidebarPinned)}
              isExpanded={isExpanded}
            />
          </div>
        </motion.aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 relative h-full overflow-hidden">
          {/* Topbar with Crumbs and Chips */}
          <header className="flex-shrink-0 flex flex-col justify-center px-6 py-3 bg-[#050d1a]/80 backdrop-blur-md border-b border-white/[0.04] z-10 min-h-[72px]">
            <HeaderWorkflowNavigator studioId="qsar" isProcessing={telemetryData.active_jobs_count > 0} />
          </header>

          {nav && <WarningBanner />}

          {/* Content Area */}
          {TRUE_FULLSCREEN_TABS.has(activeTab) ? (
            <div className="flex-1 overflow-hidden flex flex-col justify-between relative">
              <div className="flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="h-full"
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          ) : SCROLLABLE_FULL_WIDTH_TABS.has(activeTab) ? (
            <div className="flex-1 overflow-y-auto flex flex-col justify-between relative">
              <div className="flex-1 flex flex-col">
                {['structure', 'recovery', 'enrichment', 'readiness', 'sci-intelligence', 'compound-explorer', 'feature-selection', 'reports'].includes(activeTab) && (
                  <div className="px-6 pt-4 shrink-0">
                    <ActiveSubgroupBanner onChangeSubgroup={() => setActiveTab('subgroup-selection')} />
                  </div>
                )}
                <div className="flex-1">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      {children}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto flex flex-col justify-between relative">
              <div className="px-8 py-8 pb-16 max-w-6xl mx-auto flex-1 w-full">
                {['structure', 'recovery', 'enrichment', 'readiness', 'sci-intelligence', 'compound-explorer', 'feature-selection', 'reports'].includes(activeTab) && (
                  <ActiveSubgroupBanner onChangeSubgroup={() => setActiveTab('subgroup-selection')} />
                )}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          )}
        </main>

      </div>
      <CommandPalette />
    </Tooltip.Provider>
  );
};

const SidebarUtilButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger' | 'hub';
  isExpanded: boolean;
  isActive?: boolean;
}> = ({ icon, label, onClick, disabled, variant = 'default', isExpanded, isActive }) => {
  const cls = variant === 'danger'
    ? 'text-rose-500/80 hover:text-rose-500 hover:bg-rose-500/10'
    : isActive
      ? 'bg-white/[0.08] text-white'
      : 'text-slate-400 hover:bg-white/[0.05] hover:text-white';

  const ButtonContent = (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center h-12 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${cls} ${isExpanded ? 'justify-start px-3 gap-3' : 'justify-center'}`}
    >
      <div className="w-10 h-10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-semibold text-sm truncate whitespace-nowrap">
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );

  return !isExpanded ? (
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
