import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRightLeft, TrendingDown, Target, Users,
  ShieldCheck, BarChart2, Upload, AlertTriangle
} from 'lucide-react';
import { StudioShell, SidebarNavItem, SidebarSection } from '../StudioShell';
import { IntelligentNormalizationPanel } from './IntelligentNormalizationPanel';
import { LogTransformPanel } from './LogTransformPanel';
import { EndpointStandardizationPanel } from './EndpointStandardizationPanel';
import { SpeciesNormalizationPanel } from './SpeciesNormalizationPanel';
import { OECDQualityChecksPanel } from './OECDQualityChecksPanel';
import { QualityScorePanel } from './QualityScorePanel';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useStudioInit } from '../../../hooks/useStudioInit';
import { workspaceApi } from '../../../services/workspaceApi';
import { toast } from 'react-hot-toast';

import { StudioNavigationProvider, useStudioNavigation } from '../navigation/StudioNavigationProvider';
import type { NavigationStep } from '../navigation/StudioNavigationProvider';

const API = 'http://127.0.0.1:8000';

const stepsConfig: NavigationStep[] = [
  {
    id: 'intelligent',
    label: 'Intelligent Normalization',
    icon: <ArrowRightLeft className="w-4 h-4" />,
    desc: 'Intelligent Compound-Aware Normalization Engine',
    nextLabel: 'Configure Log Transform',
    nextStep: 'log',
    alternativeSteps: [{ id: 'score', label: 'Skip to Reports & Score' }],
    validation: (store: any) => {
      if (!store.filename) return 'Please upload a dataset to begin normalization.';
      return true;
    }
  },
  {
    id: 'log',
    label: 'Log Transformation',
    icon: <TrendingDown className="w-4 h-4" />,
    desc: 'pLC50, pEC50, log10, ln transforms',
    nextLabel: 'Standardize Endpoints',
    nextStep: 'endpoint',
    prevLabel: 'Back to Normalization',
    previousStep: 'intelligent',
    isBlocked: (store: any) => {
      if (!store.filename) return 'Upload a dataset first.';
      return false;
    }
  },
  {
    id: 'endpoint',
    label: 'Endpoint Standardization',
    icon: <Target className="w-4 h-4" />,
    desc: 'Canonicalize endpoint variants',
    nextLabel: 'Normalize Species Names',
    nextStep: 'species',
    prevLabel: 'Back to Log Transform',
    previousStep: 'log',
    isBlocked: (store: any) => {
      if (!store.filename) return 'Upload a dataset first.';
      return false;
    }
  },
  {
    id: 'species',
    label: 'Species Normalization',
    icon: <Users className="w-4 h-4" />,
    desc: 'Common names → binomial nomenclature',
    nextLabel: 'Run OECD Quality Checks',
    nextStep: 'quality',
    prevLabel: 'Back to Endpoint Mapping',
    previousStep: 'endpoint',
    isBlocked: (store: any) => {
      if (!store.filename) return 'Upload a dataset first.';
      return false;
    }
  },
  {
    id: 'quality',
    label: 'OECD Quality Checks',
    icon: <ShieldCheck className="w-4 h-4" />,
    desc: 'Flag impossible values & duplicates',
    nextLabel: 'View Data Quality Score',
    nextStep: 'score',
    prevLabel: 'Back to Species Mapping',
    previousStep: 'species',
    isBlocked: (store: any) => {
      if (!store.filename) return 'Upload a dataset first.';
      return false;
    }
  },
  {
    id: 'score',
    label: 'Data Quality Score',
    icon: <BarChart2 className="w-4 h-4" />,
    desc: 'Composite 0–100 score with export',
    prevLabel: 'Back to OECD Checks',
    previousStep: 'quality',
    isBlocked: (store: any) => {
      if (!store.filename) return 'Upload a dataset first.';
      return false;
    }
  }
];

interface NormalizationStudioProps { onGoHub: () => void; }

const WarningBanner: React.FC = () => {
  const { getWarning, activeTab } = useStudioNavigation();
  const warning = getWarning(activeTab);
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

export const NormalizationStudioInner: React.FC<NormalizationStudioProps> = ({ onGoHub }) => {
  const { activeTab, handleJump, getStepStatus } = useStudioNavigation();
  
  const { filename, rowCount, workspaceId, setWorkspaceId, currentStudioId, resetWorkspace } = useWorkspaceStore();
  const clientId = workspaceId || 'NORM_demo';

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await fetch(`${API}/api/normalization/${clientId}/upload`, { method: 'POST', body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Upload failed');
      useWorkspaceStore.getState().setDataset(d.filename || file.name, '', d.rows ?? d.row_count ?? 0, d.columns ?? [], []);
      toast.success('Dataset uploaded successfully!');
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = async () => {
    try {
      await workspaceApi.resetWorkspace(clientId);
      toast.success('Workspace reset successful.');
    } catch (e: any) {
      console.error('Failed to reset backend workspace:', e);
      toast.error('Failed to clear backend workspace state.');
    }
    resetWorkspace();
  };

  const sidebar = (
    <div className="flex flex-col h-full space-y-2">
      <SidebarSection label="Harmonization Steps" />
      {stepsConfig.map((tab) => {
        const status = getStepStatus(tab.id);
        const isDisabled = status === 'blocked';
        return (
          <SidebarNavItem
            key={tab.id}
            icon={tab.icon}
            label={tab.label}
            description={tab.desc}
            isActive={activeTab === tab.id}
            isDisabled={isDisabled}
            onClick={() => handleJump(tab.id)}
            accentClass="text-amber-400"
            activeBgClass="bg-amber-500/10"
            activeBorderClass="border-amber-400"
          />
        );
      })}
    </div>
  );

  const renderActivePanel = () => {
    const props = { clientId, apiBase: API };
    switch (activeTab) {
      case 'intelligent': return <IntelligentNormalizationPanel {...props} />;
      case 'log':         return <LogTransformPanel {...props} />;
      case 'endpoint':    return <EndpointStandardizationPanel {...props} />;
      case 'species':     return <SpeciesNormalizationPanel {...props} />;
      case 'quality':     return <OECDQualityChecksPanel {...props} />;
      case 'score':       return <QualityScorePanel {...props} />;
      default:            return null;
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.parquet,.xlsx,.xls,.zip"
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
      />
      <StudioShell
        studioId="normalization"
        onPauseAndGoHub={onGoHub}
        sidebar={sidebar}
        onUpload={() => fileInputRef.current?.click()}
        onReset={handleReset}
        isProcessing={isUploading}
        datasetFilename={filename}
        rowCount={rowCount}
        activeStep={stepsConfig.find(t => t.id === activeTab)?.label}
      >
        <div className="h-full flex flex-col bg-[#030b18] overflow-y-auto relative pb-4 animate-fade-in">
          <WarningBanner />
          <div className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="p-6">
                {!filename ? <EmptyState onUploadClick={() => fileInputRef.current?.click()} /> : renderActivePanel()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </StudioShell>
    </>
  );
};

const EmptyState: React.FC<{ onUploadClick: () => void }> = ({ onUploadClick }) => (
  <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
    <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-400">
      <Upload className="w-8 h-8" />
    </div>
    <div>
      <div className="text-white font-bold text-base mb-1">No Dataset Loaded</div>
      <div className="text-slate-500 text-sm max-w-sm mb-4">
        Use the "Upload Dataset" button in the sidebar to load your file.
      </div>
      <button
        onClick={onUploadClick}
        className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/30 transition-all"
      >
        Upload Dataset
      </button>
    </div>
  </div>
);

export const NormalizationStudio: React.FC<NormalizationStudioProps> = (props) => {
  const handleResetStep = (stepId: string) => {
    // Custom resets for normalization steps if any, or just display message
    toast.success(`Cleared normalization inputs for ${stepId}`);
  };

  const handleResetWorkspaceWrapper = async () => {
    const store = useWorkspaceStore.getState();
    const clientId = store.workspaceId || 'NORM_temp';
    try {
      await workspaceApi.resetWorkspace(clientId);
      toast.success('Backend session workspace deleted.');
    } catch {
      toast.error('Failed to purge backend workspace.');
    }
    store.resetWorkspace();
    window.location.href = '/hub';
  };

  return (
    <StudioNavigationProvider
      steps={stepsConfig}
      studioId="normalization"
      onReset={handleResetWorkspaceWrapper}
      onResetStep={handleResetStep}
    >
      <NormalizationStudioInner {...props} />
    </StudioNavigationProvider>
  );
};
