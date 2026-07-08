import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileCheck } from 'lucide-react';
import { StudioShell, SidebarNavItem, SidebarSection } from '../StudioShell';
import { OECDUploadPanel } from './OECDUploadPanel';
import { OECDPrincipleView } from './OECDPrincipleView';
import { OECDFullReport } from './OECDFullReport';
import { useStudioInit } from '../../../hooks/useStudioInit';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { workspaceApi } from '../../../services/workspaceApi';
import { toast } from 'react-hot-toast';

const API = 'http://127.0.0.1:8000';

const TABS = [
  { id: 'upload',  label: 'Upload Dataset',          icon: <Upload className="w-4 h-4" />,    description: 'Load dataset for OECD assessment' },
  { id: 'report',  label: 'Full OECD Report',         icon: <FileCheck className="w-4 h-4" />, description: 'Aggregate 5-principle compliance report' },
  { id: 'p1',      label: 'P1 — Defined Endpoint',    icon: <span className="font-black text-xs">P1</span>, description: 'Clear endpoint definition' },
  { id: 'p2',      label: 'P2 — Unambiguous Algorithm', icon: <span className="font-black text-xs">P2</span>, description: 'Statistical method transparency' },
  { id: 'p3',      label: 'P3 — Applicability Domain', icon: <span className="font-black text-xs">P3</span>, description: 'Chemical space coverage' },
  { id: 'p4',      label: 'P4 — Goodness-of-Fit',     icon: <span className="font-black text-xs">P4</span>, description: 'R², RMSE, Q² metrics' },
  { id: 'p5',      label: 'P5 — Mechanistic Interp.', icon: <span className="font-black text-xs">P5</span>, description: 'Biological plausibility' },
];

interface OECDStudioProps { onGoHub: () => void; }

export const OECDValidationStudio: React.FC<OECDStudioProps> = ({ onGoHub }) => {
  const [activeTab, setActiveTab] = useState('upload');
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  useStudioInit('oecd');
  const { workspaceId, setWorkspaceId } = useWorkspaceStore();
  const [clientId] = useState(() => workspaceId || `OECD_${Math.random().toString(36).slice(2, 7)}`);

  React.useEffect(() => {
    if (clientId) setWorkspaceId(clientId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleReset = async () => {
    try {
      await workspaceApi.resetWorkspace(clientId);
      toast.success('Workspace reset successful.');
    } catch (e: any) {
      console.error('Failed to reset backend workspace:', e);
      toast.error('Failed to clear backend workspace state.');
    }
    useWorkspaceStore.getState().resetWorkspace();
    setSessionInfo(null);
    setActiveTab('upload');
  };

  const handleNext = () => {
    const idx = TABS.findIndex(t => t.id === activeTab);
    if (idx !== -1 && idx < TABS.length - 1) {
      const targetTab = TABS[idx + 1];
      const isDisabled = !sessionInfo && targetTab.id !== 'upload';
      if (isDisabled) {
        toast.error('Please upload a dataset first.');
        return;
      }
      setActiveTab(targetTab.id);
    }
  };

  const handlePrev = () => {
    const idx = TABS.findIndex(t => t.id === activeTab);
    if (idx !== -1 && idx > 0) {
      setActiveTab(TABS[idx - 1].id);
    }
  };

  const activeStepIndex = TABS.findIndex(t => t.id === activeTab);

  const sidebar = (
    <div className="flex flex-col h-full space-y-2">
      <SidebarSection label="OECD Principles" />
      {TABS.map((tab) => {
        const isDisabled = !sessionInfo && tab.id !== 'upload';
        return (
          <SidebarNavItem
            key={tab.id}
            icon={tab.icon}
            label={tab.label}
            description={tab.description}
            isActive={activeTab === tab.id}
            onClick={() => {
              if (isDisabled) {
                toast.error('Please upload a dataset first.');
                return;
              }
              setActiveTab(tab.id);
            }}
            accentClass="text-emerald-450"
            activeBgClass="bg-emerald-500/10"
            activeBorderClass="border-emerald-450"
          />
        );
      })}
    </div>
  );

  const principleNum = activeTab.startsWith('p') ? parseInt(activeTab.slice(1)) : null;

  return (
    <StudioShell
      studioId="oecd"
      onPauseAndGoHub={onGoHub}
      sidebar={sidebar}
      onExport={sessionInfo ? () => window.open(`${API}/api/oecd-validation/${clientId}/export?format=csv`, '_blank') : undefined}
      onReset={handleReset}
      datasetFilename={sessionInfo?.filename}
      rowCount={sessionInfo?.rows ?? 0}
      activeStep={TABS.find(t => t.id === activeTab)?.label}
      onNext={handleNext}
      onPrevious={handlePrev}
      activeStepIndex={activeStepIndex}
      totalSteps={TABS.length}
    >
      <div className="h-full overflow-y-auto bg-[#030b18]">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="p-6">
            {activeTab === 'upload' && (
              <OECDUploadPanel clientId={clientId} apiBase={API}
                onSessionLoaded={info => { setSessionInfo(info); setActiveTab('report'); }} />
            )}
            {activeTab === 'report' && sessionInfo && (
              <OECDFullReport clientId={clientId} apiBase={API} onSelectPrinciple={n => setActiveTab(`p${n}`)} />
            )}
            {principleNum && sessionInfo && (
              <OECDPrincipleView clientId={clientId} apiBase={API} principleNum={principleNum} />
            )}
            {activeTab !== 'upload' && !sessionInfo && (
              <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
                <div className="p-4 rounded-2xl bg-slate-500/10 text-slate-400">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-white font-bold text-base mb-1">Upload a dataset first</div>
                  <div className="text-slate-500 text-sm">Switch to the "Upload Dataset" step to begin OECD assessment.</div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </StudioShell>
  );
};
