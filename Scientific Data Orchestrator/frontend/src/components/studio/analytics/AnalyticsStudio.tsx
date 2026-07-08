import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  BarChart2, AlertTriangle, Activity, GitBranch, TrendingUp,
  Layers, UploadCloud, Loader2, FileText
} from 'lucide-react';
import { StudioShell, SidebarNavItem, SidebarSection } from '../StudioShell';
import { ProfilePanel } from './ProfilePanel';
import { MissingnessPanel } from './MissingnessPanel';
import { EndpointDiagnosticsPanel } from './EndpointDiagnosticsPanel';
import { CorrelationPanel } from './CorrelationPanel';
import { OutlierPanel } from './OutlierPanel';
import { DistributionPanel } from './DistributionPanel';
import { StatisticalTestPanel } from './StatisticalTestPanel';
import { DimensionalityReductionPanel } from './DimensionalityReductionPanel';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useStudioInit } from '../../../hooks/useStudioInit';
import { workspaceApi } from '../../../services/workspaceApi';

const API = 'http://127.0.0.1:8000';

const TABS = [
  {
    id: 'profile',
    label: 'Dataset Profile',
    icon: <FileText className="w-4 h-4" />,
    description: 'Summary statistics, raw table preview, metadata audit',
  },
  {
    id: 'missingness',
    label: 'Missing Data',
    icon: <AlertTriangle className="w-4 h-4" />,
    description: 'Null value maps, patterns, column drop utility',
  },
  {
    id: 'diagnostics',
    label: 'Endpoint Diagnostics',
    icon: <Activity className="w-4 h-4" />,
    description: 'Outlier thresholds, leverage points, check flags',
  },
  {
    id: 'correlation',
    label: 'Correlation Matrix',
    icon: <GitBranch className="w-4 h-4" />,
    description: 'Linear/rank correlation, high correlation pruning',
  },
  {
    id: 'outliers',
    label: 'Outlier Detection',
    icon: <TrendingUp className="w-4 h-4" />,
    description: 'Z-score & Williams plot residual check',
  },
  {
    id: 'distribution',
    label: 'Data Distribution',
    icon: <Layers className="w-4 h-4" />,
    description: 'Shapiro-Wilk normality tests, histograms, Q-Q plots',
  },
  {
    id: 'stats_test',
    label: 'Statistical Testing',
    icon: <TrendingUp className="w-4 h-4" />,
    description: 'T-test, ANOVA, Mann-Whitney hypothesis checks',
  },
  {
    id: 'reduction',
    label: 'Dimensional Reduction',
    icon: <Layers className="w-4 h-4" />,
    description: 'PCA, t-SNE, and UMAP projections',
  },
];

interface EmptyStateProps {
  handleUpload: (file: File) => void;
  isUploading: boolean;
  onLoadDemo: () => void;
  isDemoLoading: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  handleUpload,
  isUploading,
  onLoadDemo,
  isDemoLoading,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const loading = isUploading || isDemoLoading;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="text-center mb-8">
        <h2 className="text-xl font-bold text-white mb-2">Initialize Analytics Studio</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Upload a dataset to generate profiling metrics, check normal distributions, perform statistical tests, and run dimensional reductions.
        </p>
      </div>

      <div className="space-y-4">
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-12 transition-all ${
            dragActive 
              ? 'border-cyan-400/50 bg-cyan-950/10' 
              : 'border-white/[0.06] bg-[#070d19]/40 hover:border-white/[0.12]'
          }`}
        >
          <input
            type="file"
            className="hidden"
            accept=".csv,.tsv,.parquet,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={loading}
          />
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-white/40 mb-4">
            <UploadCloud className="w-8 h-8" />
          </div>
          <p className="text-sm font-semibold text-white mb-1">Drag and drop file here</p>
          <p className="text-xs text-slate-500 mb-6">Supports .csv, .tsv, .parquet, .xlsx, .xls up to 200MB</p>

          <button
            onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-white text-[#040815] font-black text-xs hover:bg-[#e2e8f0] transition-all flex items-center gap-2"
          >
            {isUploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Browse Local Files
          </button>
        </div>

        <div className="flex items-center justify-between p-5 rounded-2xl bg-[#0c1322] border border-white/[0.06]">
          <div className="text-left">
            <p className="text-xs font-bold text-white mb-0.5">Explore with Demo Dataset</p>
            <p className="text-[10px] text-slate-500">Eco-toxicity pipeline profiling dataset</p>
          </div>
          <button
            onClick={onLoadDemo}
            disabled={loading}
            className="px-5 py-2 rounded-lg border border-white/[0.08] hover:bg-white/[0.04] text-white font-bold text-xs flex items-center gap-2 transition-all"
          >
            {isDemoLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Load Demo Data
          </button>
        </div>
      </div>
    </div>
  );
};

interface AnalyticsStudioProps {
  onGoHub: () => void;
}

export const AnalyticsStudio: React.FC<AnalyticsStudioProps> = ({ onGoHub }) => {
  const [activeTab, setActiveTab] = useState('profile');
  useStudioInit('analytics');
  const { filename, rowCount, workspaceId, setWorkspaceId } = useWorkspaceStore();
  const clientId = workspaceId || 'ANALYTICS_demo';

  useEffect(() => {
    if (clientId) setWorkspaceId(clientId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await fetch(`${API}/api/analytics/${clientId}/upload`, { method: 'POST', body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Upload failed');
      useWorkspaceStore.getState().setDataset(d.filename || file.name, '', d.row_count ?? 0, d.columns ?? [], []);
      toast.success('Dataset uploaded successfully!');
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleLoadDemo = async () => {
    setIsDemoLoading(true);
    try {
      const r = await fetch(`${API}/api/analytics/${clientId}/load-demo`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Failed to load demo dataset');
      useWorkspaceStore.getState().setDataset(d.filename || 'analytics_demo_dataset.csv', '', d.row_count ?? 0, d.columns ?? [], []);
      toast.success('Analytics demo dataset loaded successfully!');
    } catch (e: any) {
      toast.error(`Failed to load demo: ${e.message}`);
    } finally {
      setIsDemoLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      await workspaceApi.resetWorkspace(clientId);
      toast.success('Workspace reset successful.');
    } catch (e) {
      toast.error('Failed to clear backend workspace state.');
    }
    useWorkspaceStore.getState().resetWorkspace();
  };

  const handleExportReport = () => {
    window.open(`${API}/api/analytics/${clientId}/export?format=csv`, '_blank');
  };

  const handleNext = () => {
    const idx = TABS.findIndex(t => t.id === activeTab);
    if (idx !== -1 && idx < TABS.length - 1) {
      setActiveTab(TABS[idx + 1].id);
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
      <SidebarSection label="Scientific Profiling" />
      {TABS.map((tab) => (
        <SidebarNavItem
          key={tab.id}
          icon={tab.icon}
          label={tab.label}
          description={tab.description}
          isActive={activeTab === tab.id}
          isDisabled={!filename}
          onClick={() => setActiveTab(tab.id)}
          accentClass="text-cyan-400"
          activeBgClass="bg-cyan-500/10"
          activeBorderClass="border-cyan-400"
        />
      ))}
    </div>
  );

  const renderPanel = () => {
    const props = { clientId, apiBase: API };
    switch (activeTab) {
      case 'profile':      return <ProfilePanel {...props} />;
      case 'missingness':  return <MissingnessPanel {...props} />;
      case 'diagnostics':  return <EndpointDiagnosticsPanel {...props} />;
      case 'correlation':  return <CorrelationPanel {...props} />;
      case 'outliers':     return <OutlierPanel {...props} />;
      case 'distribution': return <DistributionPanel {...props} />;
      case 'stats_test':   return <StatisticalTestPanel {...props} />;
      case 'reduction':    return <DimensionalityReductionPanel {...props} />;
      default:             return null;
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".csv,.tsv,.parquet,.xlsx,.xls"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = '';
        }}
      />
      <StudioShell
        studioId="analytics"
        onPauseAndGoHub={onGoHub}
        sidebar={sidebar}
        onUpload={filename ? () => fileInputRef.current?.click() : undefined}
        onExport={filename ? handleExportReport : undefined}
        onReset={filename ? handleReset : undefined}
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
              {!filename ? (
                <EmptyState
                  handleUpload={handleUpload}
                  isUploading={isUploading}
                  onLoadDemo={handleLoadDemo}
                  isDemoLoading={isDemoLoading}
                />
              ) : (
                renderPanel()
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </StudioShell>
    </>
  );
};
