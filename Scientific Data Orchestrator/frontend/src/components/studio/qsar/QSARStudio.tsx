import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  Upload, ShieldCheck, Cpu, Target, Layers
} from 'lucide-react';
import { StudioShell, SidebarNavItem, SidebarSection } from '../StudioShell';
import { QSARUploadPanel } from './QSARUploadPanel';
import { DescriptorGeneratorPanel } from './DescriptorGeneratorPanel';
import { QSARReadinessPanel } from './QSARReadinessPanel';
import { MLBenchmarkPanel } from './MLBenchmarkPanel';
import { ApplicabilityDomainPanel } from './ApplicabilityDomainPanel';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useStudioInit } from '../../../hooks/useStudioInit';
import { workspaceApi } from '../../../services/workspaceApi';

const API = 'http://127.0.0.1:8000';

const TABS = [
  { id: 'upload', label: 'Upload Dataset', icon: <Upload className="w-4 h-4" />, description: 'Upload CSV/ZIP datasets' },
  { id: 'generator', label: 'Descriptor Generator', icon: <Layers className="w-4 h-4" />, description: 'Generate molecular descriptors' },
  { id: 'readiness', label: 'Dataset Readiness', icon: <ShieldCheck className="w-4 h-4" />, description: 'Normality & OECD checklist' },
  { id: 'benchmark', label: 'ML Benchmark', icon: <Cpu className="w-4 h-4" />, description: 'Train & validate QSAR models' },
  { id: 'domain', label: 'Applicability Domain', icon: <Target className="w-4 h-4" />, description: 'Williams plot leverage analysis' },
];

interface QSARStudioProps {
  onGoHub: () => void;
}

export const QSARStudio: React.FC<QSARStudioProps> = ({ onGoHub }) => {
  const [activeTab, setActiveTab] = useState('upload');
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  useStudioInit('qsar');
  const { filename, rowCount, workspaceId, setWorkspaceId } = useWorkspaceStore();
  const clientId = workspaceId || 'qsar_temp';

  useEffect(() => {
    if (clientId) setWorkspaceId(clientId);
  }, [clientId, setWorkspaceId]);

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

  const handleExport = () => {
    window.open(`${API}/api/qsar-studio/${clientId}/export?format=csv`, '_blank');
  };

  const handleNext = () => {
    const idx = TABS.findIndex(t => t.id === activeTab);
    if (idx !== -1 && idx < TABS.length - 1) {
      const targetTab = TABS[idx + 1];
      const isDisabled = !filename && targetTab.id !== 'upload';
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
      <SidebarSection label="QSAR Panels" />
      {TABS.map((tab) => {
        const isDisabled = !filename && tab.id !== 'upload';
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
            accentClass="text-blue-400"
            activeBgClass="bg-blue-500/10"
            activeBorderClass="border-blue-400"
          />
        );
      })}
    </div>
  );

  const renderPanel = () => {
    const props = { clientId, apiBase: API };
    switch (activeTab) {
      case 'upload':
        return (
          <QSARUploadPanel
            {...props}
            sessionInfo={sessionInfo}
            onSessionLoaded={(info) => {
              setSessionInfo(info);
              const rows = info.rows ?? info.total_rows ?? 0;
              useWorkspaceStore.getState().setDataset(info.filename || 'qsar_dataset', '', rows, [], []);
            }}
            onSuccess={() => setActiveTab('generator')}
          />
        );
      case 'generator':
        return <DescriptorGeneratorPanel {...props} />;
      case 'readiness':
        return (
          <QSARReadinessPanel
            {...props}
            sessionInfo={sessionInfo}
            onSessionLoaded={setSessionInfo}
          />
        );
      case 'benchmark':
        return (
          <MLBenchmarkPanel
            {...props}
            sessionInfo={sessionInfo}
            onSessionLoaded={setSessionInfo}
          />
        );
      case 'domain':
        return (
          <ApplicabilityDomainPanel
            {...props}
            sessionInfo={sessionInfo}
            onSessionLoaded={setSessionInfo}
          />
        );
      default:
        return null;
    }
  };

  return (
    <StudioShell
      studioId="qsar"
      onPauseAndGoHub={onGoHub}
      sidebar={sidebar}
      onExport={filename ? handleExport : undefined}
      onReset={handleReset}
      datasetFilename={filename}
      rowCount={rowCount}
      activeStep={TABS.find(t => t.id === activeTab)?.label}
      onNext={handleNext}
      onPrevious={handlePrev}
      activeStepIndex={activeStepIndex}
      totalSteps={TABS.length}
    >
      <div className="h-full overflow-y-auto bg-[#030b18]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="p-6"
          >
            {renderPanel()}
          </motion.div>
        </AnimatePresence>
      </div>
    </StudioShell>
  );
};

