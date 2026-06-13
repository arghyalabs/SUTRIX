import React from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useStudioNavigation } from '../studio/navigation/StudioNavigationProvider';
import { ChevronLeft, ChevronRight, Loader2, Info } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';

interface HeaderWorkflowNavigatorProps {
  studioId: string;
  isProcessing?: boolean;
}

const STUDIO_NAMES: Record<string, string> = {
  hierarchy: 'Hierarchy Studio',
  analytics: 'Scientific Analytics',
  compound: 'Compound Explorer',
  normalization: 'Intelligent Normalization',
  qsar: 'QSAR & AI Engineering',
  intelligence: 'Scientific Intelligence',
  oecd: 'OECD Validation',
};

export const HeaderWorkflowNavigator: React.FC<HeaderWorkflowNavigatorProps> = ({
  studioId,
  isProcessing = false,
}) => {
  const store = useWorkspaceStore();
  const nav = useStudioNavigation();
  const { filename, rowCount, datasetMode, harmonizationAudit, rawIngestionCount, segStats } = store;

  // Compute pruning info from harmonization audit or segmentation stats
  const rawCount = rawIngestionCount || (segStats as any)?.original_count || 0;
  const prunedCount = rawCount > 0 && rowCount > 0 ? rawCount - rowCount : 0;
  const hasPruning = prunedCount > 0;

  // Retrieve steps config and active step
  const steps = nav.steps || [];
  const activeTab = nav.activeTab || '';
  const currentIndex = steps.findIndex(s => s.id === activeTab);
  const totalSteps = steps.length;

  const currentStep = currentIndex !== -1 ? steps[currentIndex] : null;
  const prevStep = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const nextStep = currentIndex !== -1 && currentIndex < totalSteps - 1 ? steps[currentIndex + 1] : null;

  // Render visual progress percentage if active steps exist
  const completedCount = steps.filter(s => nav.getStepStatus(s.id) === 'completed' || s.id === activeTab).length;
  const pct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const chips: React.ReactNode[] = [];
  if (rowCount > 0) {
    chips.push(
      hasPruning ? (
        <Tooltip.Root key="rows">
          <Tooltip.Trigger asChild>
            <span
              id="header-row-count-chip"
              className="text-slate-400 font-semibold flex items-center gap-1 cursor-help border-b border-dashed border-slate-600"
            >
              {rowCount.toLocaleString()} rows
              <span className="text-rose-400 text-[9px] font-bold">({prunedCount.toLocaleString()} pruned)</span>
              <Info className="w-3 h-3 text-slate-500" />
            </span>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="bottom"
              sideOffset={8}
              className="z-50 bg-[#0c1322] border border-white/[0.08] rounded-xl shadow-2xl p-3 text-xs max-w-[240px]"
            >
              <div className="font-extrabold text-white mb-2 text-[10px] uppercase tracking-wider">Dataset Ingestion History</div>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">📥 Raw Ingested</span>
                  <span className="text-white font-bold">{rawCount.toLocaleString()} rows</span>
                </div>
                {(harmonizationAudit?.deduplication?.removed_rows || (segStats as any)?.dedup_stats?.duplicates_removed || 0) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-amber-400">🔁 Deduplication</span>
                    <span className="text-amber-300 font-bold">−{(harmonizationAudit?.deduplication?.removed_rows || (segStats as any)?.dedup_stats?.duplicates_removed || 0).toLocaleString()}</span>
                  </div>
                )}
                {(harmonizationAudit?.variance_pruning?.removed_rows ?? prunedCount) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-rose-400">📊 Variance Pruning</span>
                    <span className="text-rose-300 font-bold">−{(harmonizationAudit?.variance_pruning?.removed_rows ?? prunedCount).toLocaleString()}</span>
                  </div>
                )}
                <div className="border-t border-white/[0.06] pt-1.5 mt-0.5 flex justify-between items-center">
                  <span className="text-emerald-400 font-semibold">✅ Active Dataset</span>
                  <span className="text-emerald-300 font-bold">{rowCount.toLocaleString()} rows</span>
                </div>
              </div>
              <Tooltip.Arrow className="fill-[#0c1322]" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : (
        <span key="rows" id="header-row-count-chip" className="text-slate-400 font-semibold">{rowCount.toLocaleString()} rows</span>
      )
    );
  }
  if (filename) {
    chips.push(
      <span key="file" className="text-slate-400 font-semibold truncate max-w-[180px] md:max-w-[280px]" title={filename}>
        {filename}
      </span>
    );
  }
  if (datasetMode) {
    chips.push(<span key="mode" className="text-slate-400 font-bold uppercase tracking-wider">{datasetMode}</span>);
  }
  if (nav.autoSaveStatus) {
    chips.push(
      <span key="autosave" className="text-slate-500 font-semibold tracking-wide lowercase">
        {nav.autoSaveStatus === 'saving' ? 'saving...' : 'autosaved'}
      </span>
    );
  }

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="flex flex-col w-full text-left gap-1.5 select-none">
        
        {/* Row A: Breadcrumbs & Spinner */}
        <div className="flex items-center justify-between h-5 min-h-[20px] max-h-[24px]">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 truncate whitespace-nowrap">
            <span>{STUDIO_NAMES[studioId] || 'SUTRIX Studio'}</span>
            <span className="text-slate-600 font-semibold">/</span>
            <span className="text-white font-extrabold">{currentStep?.label || activeTab || 'Overview'}</span>
          </div>
          
          {isProcessing && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[9px] font-black uppercase tracking-wider animate-pulse">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Processing</span>
            </div>
          )}
        </div>

        {/* Row B: Previous / Step Indicator / Next */}
        <div className="grid grid-cols-3 items-center h-8 my-0.5">
          {/* Left: Previous Button */}
          <div className="flex justify-start">
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  disabled={!prevStep}
                  onClick={() => prevStep && nav.handlePrevious()}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all
                    ${prevStep
                      ? 'border-white/[0.08] bg-transparent text-slate-300 hover:text-white hover:border-cyan-500/30 hover:bg-cyan-500/5 active:bg-cyan-500/10'
                      : 'border-white/[0.03] bg-transparent text-slate-650 opacity-40 cursor-not-allowed'
                    }`}
                  aria-label={prevStep ? `Go to previous workflow step: ${prevStep.label}` : 'No previous step available'}
                >
                  <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                  {prevStep ? (
                    <>
                      <span className="hidden sm:inline truncate max-w-[120px] md:max-w-[180px] lg:max-w-[240px]">
                        {prevStep.label}
                      </span>
                      <span className="sm:hidden">Previous</span>
                    </>
                  ) : (
                    <span>Previous</span>
                  )}
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="bottom"
                  sideOffset={4}
                  className="bg-[#0c1322] border border-white/[0.08] px-2.5 py-1.5 rounded-md text-[10px] font-semibold text-white shadow-2xl z-50"
                >
                  {prevStep ? `Previous (Alt + ←)` : 'No previous step available.'}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>

          {/* Center: Step Indicator */}
          <div className="flex flex-col items-center justify-center text-center">
            {totalSteps > 0 ? (
              <span className="text-xs font-bold text-slate-400 tracking-wider">
                <span className="hidden sm:inline">Step {currentIndex + 1} of {totalSteps}</span>
                <span className="sm:hidden">Step {currentIndex + 1}/{totalSteps}</span>
                <span className="text-slate-500 font-normal ml-1.5 text-[10px] hidden md:inline">
                  • {pct}% Complete
                </span>
              </span>
            ) : (
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Interactive Dashboard
              </span>
            )}
          </div>

          {/* Right: Next Button */}
          <div className="flex justify-end">
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  disabled={!nextStep}
                  onClick={() => nextStep && nav.handleNext()}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all
                    ${nextStep
                      ? 'border-white/[0.08] bg-transparent text-slate-300 hover:text-white hover:border-cyan-500/30 hover:bg-cyan-500/5 active:bg-cyan-500/10'
                      : 'border-white/[0.03] bg-transparent text-slate-650 opacity-40 cursor-not-allowed'
                    }`}
                  aria-label={nextStep ? `Go to next workflow step: ${nextStep.label}` : 'No further steps'}
                >
                  {nextStep ? (
                    <>
                      <span className="hidden sm:inline truncate max-w-[120px] md:max-w-[180px] lg:max-w-[240px]">
                        {nextStep.label}
                      </span>
                      <span className="sm:hidden">Next</span>
                    </>
                  ) : (
                    <span>Next</span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="bottom"
                  sideOffset={4}
                  className="bg-[#0c1322] border border-white/[0.08] px-2.5 py-1.5 rounded-md text-[10px] font-semibold text-white shadow-2xl z-50"
                >
                  {nextStep ? `Next (Alt + →)` : 'No further steps.'}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        </div>

        {/* Row C: Metadata Chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium mt-0.5">
            {chips.map((chip, index) => (
              <React.Fragment key={index}>
                {index > 0 && <span className="text-slate-700 font-bold select-none">•</span>}
                {chip}
              </React.Fragment>
            ))}
          </div>
        )}

      </div>
    </Tooltip.Provider>
  );
};
