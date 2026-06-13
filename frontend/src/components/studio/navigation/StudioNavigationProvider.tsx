import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { workspaceManager } from '../../../services/workspaceManagerService';
import { toast } from 'react-hot-toast';
import { AlertTriangle, Clock } from 'lucide-react';

export interface NavigationStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  desc: string;
  nextLabel?: string;
  prevLabel?: string;
  nextStep?: string | ((storeState: any) => string | null);
  previousStep?: string | ((storeState: any) => string | null);
  alternativeSteps?: { id: string; label: string }[] | ((storeState: any) => { id: string; label: string }[]);
  validation?: (storeState: any) => boolean | string | Promise<boolean | string>;
  warning?: (storeState: any) => string | null;
  isBlocked?: (storeState: any) => boolean | string; // returns boolean or reason string
  shouldShow?: (storeState: any) => boolean; // dynamic visibility
}

export type AutoSaveStatus = 'saved' | 'saving' | 'error' | 'idle';

export interface NavigationContextType {
  steps: NavigationStep[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  nextStepId: string | null;
  prevStepId: string | null;
  alternativePaths: { id: string; label: string }[];
  getStepStatus: (stepId: string) => 'active' | 'completed' | 'available' | 'blocked';
  getBlockedReason: (stepId: string) => string | null;
  getWarning: (stepId: string) => string | null;
  isNavigating: boolean;
  autoSaveStatus: AutoSaveStatus;
  lastSavedTime: number | null;
  handleNext: () => Promise<void>;
  handlePrevious: () => Promise<void>;
  handleJump: (stepId: string) => Promise<void>;
  resetCurrentStep: () => void;
  resetStudioWorkspace: () => void;
  deleteSessionWorkspace: () => Promise<void>;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (val: boolean) => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

const fallbackContext: NavigationContextType = {
  steps: [],
  activeTab: '',
  setActiveTab: () => {},
  nextStepId: null,
  prevStepId: null,
  alternativePaths: [],
  getStepStatus: () => 'available',
  getBlockedReason: () => null,
  getWarning: () => null,
  isNavigating: false,
  autoSaveStatus: 'idle',
  lastSavedTime: null,
  handleNext: async () => {},
  handlePrevious: async () => {},
  handleJump: async () => {},
  resetCurrentStep: () => {},
  resetStudioWorkspace: () => {},
  deleteSessionWorkspace: async () => {},
  hasUnsavedChanges: false,
  setHasUnsavedChanges: () => {}
};

export const useStudioNavigation = (): NavigationContextType => {
  const ctx = useContext(NavigationContext);
  return ctx || fallbackContext;
};

interface ProviderProps {
  steps: NavigationStep[];
  studioId: 'hierarchy' | 'analytics' | 'compound' | 'normalization' | 'qsar' | 'intelligence' | 'oecd';
  onReset: () => Promise<void> | void;
  onResetStep?: (stepId: string) => void;
  children: React.ReactNode;
}

export const StudioNavigationProvider: React.FC<ProviderProps> = ({
  steps,
  studioId,
  onReset,
  onResetStep,
  children
}) => {
  const store = useWorkspaceStore();
  const { activeTab: storeTab, setActiveTab: storeSetActiveTab, workspaceId } = store;
  
  // Dynamic visible steps list
  const activeSteps = steps.filter(s => s.shouldShow ? s.shouldShow(store) : true);

  const activeTab = storeTab || activeSteps[0]?.id || 'ingest';
  const setActiveTab = (tab: string) => {
    storeSetActiveTab(tab);
    // Persist hash for browser refresh
    window.location.hash = tab;
  };

  const [isNavigating, setIsNavigating] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<number | null>(Date.now());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Modals / Warnings state (used inside subcomponents by rendering overlays in a portal or inline)
  const [showJobModal, setShowJobModal] = useState<{ nextTab: string; onResolve: () => void } | null>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState<{ nextTab: string; onResolve: () => void } | null>(null);

  // Resolve dynamic steps based on store state
  const getCurrentStepConfig = () => activeSteps.find(s => s.id === activeTab);

  const getNextStepId = () => {
    const current = getCurrentStepConfig();
    if (!current) return null;
    if (typeof current.nextStep === 'function') {
      return current.nextStep(store);
    }
    if (typeof current.nextStep === 'string') {
      return current.nextStep;
    }
    // Fallback: next index in array
    const idx = activeSteps.findIndex(s => s.id === activeTab);
    if (idx !== -1 && idx < activeSteps.length - 1) {
      // Find the next step that is not blocked / skipped
      for (let i = idx + 1; i < activeSteps.length; i++) {
        const status = getStepStatus(activeSteps[i].id);
        if (status !== 'blocked') return activeSteps[i].id;
      }
    }
    return null;
  };

  const getPrevStepId = () => {
    const current = getCurrentStepConfig();
    if (!current) return null;
    if (typeof current.previousStep === 'function') {
      return current.previousStep(store);
    }
    if (typeof current.previousStep === 'string') {
      return current.previousStep;
    }
    // Fallback: previous index in array
    const idx = activeSteps.findIndex(s => s.id === activeTab);
    if (idx > 0) {
      for (let i = idx - 1; i >= 0; i--) {
        const status = getStepStatus(activeSteps[i].id);
        if (status !== 'blocked') return activeSteps[i].id;
      }
    }
    return null;
  };

  const getAlternativePaths = () => {
    const current = getCurrentStepConfig();
    if (!current) return [];
    if (typeof current.alternativeSteps === 'function') {
      return current.alternativeSteps(store);
    }
    if (current.alternativeSteps) {
      return current.alternativeSteps;
    }
    return [];
  };

  // Determine step status
  const getStepStatus = (stepId: string): 'active' | 'completed' | 'available' | 'blocked' => {
    if (stepId === activeTab) return 'active';
    const stepConfig = activeSteps.find(s => s.id === stepId);
    if (!stepConfig) return 'blocked';

    // Check if blocked first
    if (stepConfig.isBlocked) {
      const blockedResult = stepConfig.isBlocked(store);
      if (blockedResult === true || typeof blockedResult === 'string') {
        return 'blocked';
      }
    }

    // Check if completed: a step is completed if it's before the activeTab index and valid
    const activeIdx = activeSteps.findIndex(s => s.id === activeTab);
    const targetIdx = activeSteps.findIndex(s => s.id === stepId);

    // If step is before active step, it is completed (assuming user passed it)
    if (targetIdx !== -1 && targetIdx < activeIdx) {
      return 'completed';
    }

    // Otherwise it is available
    return 'available';
  };

  const getBlockedReason = (stepId: string): string | null => {
    const stepConfig = activeSteps.find(s => s.id === stepId);
    if (!stepConfig || !stepConfig.isBlocked) return null;
    const res = stepConfig.isBlocked(store);
    return typeof res === 'string' ? res : null;
  };

  const getWarning = (stepId: string): string | null => {
    const stepConfig = activeSteps.find(s => s.id === stepId);
    if (!stepConfig || !stepConfig.warning) return null;
    return stepConfig.warning(store);
  };

  // ─── Workspace Manager Sync (Auto-Save) ───────────────────────────────────
  const saveSnapshot = () => {
    setAutoSaveStatus('saving');
    try {
      workspaceManager.saveWorkspaceState(studioId, {
        datasetFilename: store.filename,
        parquetPath: store.parquetPath,
        rowCount: store.rowCount,
        columns: store.columns,
        activeStep: activeTab,
        lastActivity: Date.now()
      });
      setAutoSaveStatus('saved');
      setLastSavedTime(Date.now());
    } catch {
      setAutoSaveStatus('error');
    }
  };

  // Setup 30s auto save
  useEffect(() => {
    const interval = setInterval(() => {
      saveSnapshot();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, store.filename, store.parquetPath, store.rowCount, store.columns]);

  // Save on tab close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      saveSnapshot();
      if (hasUnsavedChanges || store.activeJobId) {
        e.preventDefault();
        e.returnValue = 'Unsaved changes exist. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeTab, hasUnsavedChanges, store.activeJobId]);

  // ─── Transition Gatekeeper ───────────────────────────────────────────────
  const checkTransition = async (nextTab: string): Promise<boolean> => {
    const current = getCurrentStepConfig();
    
    // 1. Check validation on current step before leaving
    if (current && current.validation) {
      const res = await current.validation(store);
      if (res !== true) {
        toast.error(typeof res === 'string' ? res : 'Complete current step validation before continuing.');
        return false;
      }
    }

    // 2. Check if next step is scientifically blocked
    const targetStatus = getStepStatus(nextTab);
    if (targetStatus === 'blocked') {
      const reason = getBlockedReason(nextTab) || 'This step is currently blocked.';
      toast.error(reason);
      return false;
    }

    // 3. Background Job Check
    if (store.activeJobId && store.activeJobType) {
      return new Promise<boolean>((resolve) => {
        setShowJobModal({
          nextTab,
          onResolve: () => resolve(true)
        });
      });
    }

    // 4. Unsaved Changes Check
    if (hasUnsavedChanges) {
      return new Promise<boolean>((resolve) => {
        setShowUnsavedModal({
          nextTab,
          onResolve: () => resolve(true)
        });
      });
    }

    return true;
  };

  const handleNext = async () => {
    const nextId = getNextStepId();
    if (!nextId) return;
    setIsNavigating(true);
    const ok = await checkTransition(nextId);
    if (ok) {
      saveSnapshot();
      setActiveTab(nextId);
      setHasUnsavedChanges(false);
    }
    setIsNavigating(false);
  };

  const handlePrevious = async () => {
    const prevId = getPrevStepId();
    if (!prevId) return;
    setIsNavigating(true);
    // Previous is generally unblocked and preserves state
    saveSnapshot();
    setActiveTab(prevId);
    setHasUnsavedChanges(false);
    setIsNavigating(false);
  };

  const handleJump = async (stepId: string) => {
    if (stepId === activeTab) return;
    setIsNavigating(true);
    const ok = await checkTransition(stepId);
    if (ok) {
      saveSnapshot();
      setActiveTab(stepId);
      setHasUnsavedChanges(false);
      
      const warningMsg = getWarning(stepId);
      if (warningMsg) {
        toast(warningMsg, { icon: '⚠️', duration: 4000 });
      }
    }
    setIsNavigating(false);
  };

  // ─── Reset Levels ────────────────────────────────────────────────────────
  const resetCurrentStep = () => {
    if (onResetStep) {
      onResetStep(activeTab);
      toast.success('Step inputs reset.');
    } else {
      toast.error('Step reset not supported for this studio.');
    }
  };

  const resetStudioWorkspace = () => {
    workspaceManager.resetWorkspace(studioId);
    store.resetWorkspace();
    setActiveTab(activeSteps[0].id);
    toast.success('Workspace reset to defaults.');
  };

  const deleteSessionWorkspace = async () => {
    await onReset();
  };

  // ─── Keyboard Shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bypasses if focused on text input / textarea / contenteditable
      const el = document.activeElement;
      if (el) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || el.hasAttribute('contenteditable')) {
          return;
        }
        // Bypasses if inside dropdown listbox or modal dialog
        if (el.closest('[role="listbox"]') || el.closest('[role="dialog"]') || document.querySelector('[role="dialog"]') || document.querySelector('.modal')) {
          return;
        }
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isAlt = e.altKey;

      if (isAlt && e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (isAlt && e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, activeSteps, store.activeJobId]);

  return (
    <NavigationContext.Provider
      value={{
        steps: activeSteps,
        activeTab,
        setActiveTab,
        nextStepId: getNextStepId(),
        prevStepId: getPrevStepId(),
        alternativePaths: getAlternativePaths(),
        getStepStatus,
        getBlockedReason,
        getWarning,
        isNavigating,
        autoSaveStatus,
        lastSavedTime,
        handleNext,
        handlePrevious,
        handleJump,
        resetCurrentStep,
        resetStudioWorkspace,
        deleteSessionWorkspace,
        hasUnsavedChanges,
        setHasUnsavedChanges
      }}
    >
      {children}

      {/* Background Job Awareness Overlay */}
      {showJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md p-6 border rounded-3xl bg-slate-900 border-slate-800 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>
            <h3 className="text-lg font-bold text-white">Active Background Process</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              A scientific calculation job is currently running in the background. If you leave this step, the job will continue processing.
            </p>
            <div className="flex flex-col gap-2 w-full pt-2">
              <button
                onClick={() => {
                  const { nextTab, onResolve } = showJobModal;
                  setShowJobModal(null);
                  setActiveTab(nextTab);
                  setHasUnsavedChanges(false);
                  onResolve();
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-cyan-400 text-slate-950 font-black hover:bg-cyan-300 text-xs transition-colors"
              >
                Continue in Background
              </button>
              <button
                onClick={() => setShowJobModal(null)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs transition-colors"
              >
                Wait for Completion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Protection Overlay */}
      {showUnsavedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md p-6 border rounded-3xl bg-slate-900 border-slate-800 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Unsaved Changes Exist</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              You have modified configurations on this step that are not saved.
            </p>
            <div className="flex flex-col gap-2 w-full pt-2">
              <button
                onClick={() => {
                  const { nextTab, onResolve } = showUnsavedModal;
                  saveSnapshot();
                  setShowUnsavedModal(null);
                  setActiveTab(nextTab);
                  setHasUnsavedChanges(false);
                  onResolve();
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-cyan-400 text-slate-950 font-black hover:bg-cyan-300 text-xs transition-colors"
              >
                Save and Continue
              </button>
              <button
                onClick={() => {
                  const { nextTab, onResolve } = showUnsavedModal;
                  setShowUnsavedModal(null);
                  setActiveTab(nextTab);
                  setHasUnsavedChanges(false);
                  onResolve();
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs transition-colors"
              >
                Discard Changes and Navigate
              </button>
              <button
                onClick={() => {
                  setShowUnsavedModal(null);
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 text-slate-500 hover:text-white font-bold text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </NavigationContext.Provider>
  );
};
