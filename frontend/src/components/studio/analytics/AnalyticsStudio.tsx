import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  BarChart2, AlertTriangle, Activity, GitBranch, TrendingUp,
  Layers, Download, Upload, FileText
} from 'lucide-react';
import { StudioShell, SidebarNavItem, SidebarSection } from '../StudioShell';
import { ProfilePanel } from './ProfilePanel';
import { MissingnessPanel } from './MissingnessPanel';
import { EndpointDiagnosticsPanel } from './EndpointDiagnosticsPanel';
import { CorrelationPanel } from './CorrelationPanel';
import { OutlierPanel } from './OutlierPanel';
import { DistributionPanel } from './DistributionPanel';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useRef } from 'react';
import { useStudioInit } from '../../../hooks/useStudioInit';
import { workspaceApi } from '../../../services/workspaceApi';

const API = 'http://127.0.0.1:8000';

const TABS = [
  {
    id: 'profile',
    label: 'Dataset Profile',
    icon: <Layers className="w-4 h-4" />,
    description: 'Shape, dtypes & numeric summaries',
  },
  {
    id: 'missing',
    label: 'Missing Value Analysis',
    icon: <AlertTriangle className="w-4 h-4" />,
    description: 'Per-column missingness & patterns',
  },
  {
    id: 'endpoint',
    label: 'Endpoint Diagnostics',
    icon: <Activity className="w-4 h-4" />,
    description: 'Distribution & log-normality tests',
  },
  {
    id: 'correlation',
    label: 'Correlation Matrix',
    icon: <GitBranch className="w-4 h-4" />,
    description: 'Pearson / Spearman / Kendall heatmap',
  },
  {
    id: 'outliers',
    label: 'Outlier Detection',
    icon: <TrendingUp className="w-4 h-4" />,
    description: 'IQR fence & Z-score flagging',
  },
  {
    id: 'distribution',
    label: 'Distribution Analysis',
    icon: <BarChart2 className="w-4 h-4" />,
    description: 'Histogram, Shapiro-Wilk normality',
  },
];

const EmptyState: React.FC<{ onLoadDemo: () => void, isDemoLoading: boolean }> = ({ onLoadDemo, isDemoLoading }) => (
  <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
    <div className="p-4 rounded-2xl bg-violet-500/10 text-violet-400">
      <Upload className="w-8 h-8 animate-pulse" />
    </div>
    <div>
      <div className="text-white font-bold text-base mb-1">No Dataset Loaded</div>
      <div className="text-slate-500 text-sm max-w-sm mb-4">
        Use the "Upload Dataset" button in the sidebar to upload a file, or load the demo dataset to begin analysis.
      </div>
      <button
        onClick={onLoadDemo}
        disabled={isDemoLoading}
        className="px-4 py-2 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-bold hover:bg-violet-500/30 transition-all disabled:opacity-50"
      >
        {isDemoLoading ? 'Loading Demo...' : 'Load Demo Dataset'}
      </button>
    </div>
  </div>
);

interface AnalyticsStudioProps {
  onGoHub: () => void;
}

export const AnalyticsStudio: React.FC<AnalyticsStudioProps> = ({ onGoHub }) => {
  const [activeTab, setActiveTab] = useState('profile');
  useStudioInit('analytics');
  const { filename, rowCount, workspaceId, setWorkspaceId, currentStudioId } = useWorkspaceStore();
  const clientId = workspaceId || 'ANALYTICS_demo';

  if (currentStudioId !== 'analytics') {
    return null;
  }

  useEffect(() => {
    if (clientId) setWorkspaceId(clientId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const handleLoadDemo = useCallback(async () => {
    setIsDemoLoading(true);
    try {
      const r = await fetch(`${API}/api/analytics/${clientId}/load-demo`, {
        method: 'POST',
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      useWorkspaceStore.getState().setDataset(d.filename, '', d.rows, [], []);
      toast.success('Demo dataset loaded successfully!');
    } catch (e: any) {
      toast.error(`Failed to load demo: ${e.message}`);
    } finally {
      setIsDemoLoading(false);
    }
  }, [clientId]);

  // V5: Auto-load demo dataset if ?demo=true parameter is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'true') {
      window.history.replaceState({}, document.title, window.location.pathname);
      handleLoadDemo();
    }
  }, [handleLoadDemo]);

  const handleExportReport = () => {
    window.open(`${API}/api/analytics/${clientId}/export-report`, '_blank');
  };

  const handleReset = async () => {
    try {
      await workspaceApi.resetWorkspace(clientId);
      toast.success('Workspace reset successful.');
    } catch (e: any) {
      console.error('Failed to reset backend workspace:', e);
      toast.error('Failed to clear backend workspace state.');
    }
    useWorkspaceStore.getState().resetWorkspace();
    setActiveTab('profile');
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await fetch(`${API}/api/analytics/${clientId}/upload`, {
        method: 'POST',
        body: form
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      useWorkspaceStore.getState().setDataset(d.filename, '', d.rows, [], []);
    } catch (e: any) {
      alert(`Upload failed: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Nav items
  const sidebar = (
    <div className="flex flex-col h-full space-y-2">
      <SidebarSection label="Analysis Panels" />
      {TABS.map((tab) => (
        <SidebarNavItem
          key={tab.id}
          icon={tab.icon}
          label={tab.label}
          description={tab.description}
          isActive={activeTab === tab.id}
          onClick={() => setActiveTab(tab.id)}
          accentClass="text-violet-400"
          activeBgClass="bg-violet-500/10"
          activeBorderClass="border-violet-400"
        />
      ))}
    </div>
  );

  const renderPanel = () => {
    const props = { clientId, apiBase: API };
    switch (activeTab) {
      case 'profile':      return <ProfilePanel {...props} />;
      case 'missing':      return <MissingnessPanel {...props} />;
      case 'endpoint':     return <EndpointDiagnosticsPanel {...props} />;
      case 'correlation':  return <CorrelationPanel {...props} />;
      case 'outliers':     return <OutlierPanel {...props} />;
      case 'distribution': return <DistributionPanel {...props} />;
      default:             return null;
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.parquet"
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
      />
      <StudioShell
        studioId="analytics"
        onPauseAndGoHub={onGoHub}
        sidebar={sidebar}
        onUpload={() => fileInputRef.current?.click()}
        onExport={filename ? handleExportReport : undefined}
        onReset={handleReset}
        isProcessing={isUploading || isDemoLoading}
        datasetFilename={filename}
        rowCount={rowCount}
        activeStep={TABS.find(t => t.id === activeTab)?.label}
      >
        <div className="h-full overflow-y-auto bg-[#030b18]">

          {/* Panel content */}
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
                <EmptyState onLoadDemo={handleLoadDemo} isDemoLoading={isDemoLoading} />
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
