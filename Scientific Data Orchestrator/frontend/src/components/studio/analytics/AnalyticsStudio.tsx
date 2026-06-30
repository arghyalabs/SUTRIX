import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  BarChart2, AlertTriangle, Activity, GitBranch, TrendingUp,
  Layers, Download, Upload, FileText, UploadCloud, Loader2, Play
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

const EmptyState: React.FC<{
  handleUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  onLoadDemo: () => void;
  isDemoLoading: boolean;
}> = ({ handleUpload, isUploading, onLoadDemo, isDemoLoading }) => {
  const [dragging, setDragging] = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const loading = isUploading || isDemoLoading;

  return (
    <div className="max-w-4xl mx-auto py-12 flex flex-col items-center w-full">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-3">Upload Dataset</h1>
        <p className="text-secondary text-sm max-w-lg mx-auto">
          Simple Analysis data ingestion. Upload your dataset to begin profiling and diagnostics.
        </p>
      </div>

      <div className="w-full max-w-2xl space-y-6">
        <label
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative flex flex-col items-center justify-center w-full h-80 rounded-[2rem] border-2 border-dashed cursor-pointer transition-all duration-300 group overflow-hidden
            ${dragging
              ? 'border-violet-400 bg-violet-400/[0.03] shadow-[0_0_30px_rgba(139,92,246,0.15)]'
              : 'border-white/[0.08] glass hover:border-white/[0.2] hover:bg-white/[0.02]'}`}
        >
          <input type="file" className="hidden" accept=".csv,.parquet,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/[0.02] pointer-events-none" />
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-transform duration-500
            ${dragging ? 'bg-violet-400 text-void scale-110' : 'bg-white/[0.04] text-secondary group-hover:bg-white/[0.08] group-hover:text-white'}`}>
            {loading ? <Loader2 className="w-8 h-8 text-violet-400 animate-spin" /> : <UploadCloud className="w-8 h-8" />}
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {loading ? 'Processing…' : dragging ? 'Drop file to upload' : 'Drag & drop or click to browse'}
          </h3>
          <div className="flex items-center gap-2 mt-4">
            {['.CSV', '.XLSX', '.PARQUET'].map(ext => (
              <span key={ext} className="px-2 py-1 rounded-md bg-white/[0.04] text-[10px] font-mono text-muted uppercase tracking-wider">{ext}</span>
            ))}
          </div>
        </label>

        {!loading && (
          <>
            <div className="flex items-center justify-center gap-4 text-sm text-secondary pt-2">
              <span className="w-12 h-px bg-white/[0.1]" />
              <span>or try it out with</span>
              <span className="w-12 h-px bg-white/[0.1]" />
            </div>

            <div className="flex justify-center">
              <button
                onClick={onLoadDemo}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white font-medium hover:bg-white/[0.08] transition-colors"
              >
                <Play className="w-4 h-4 text-violet-400" />
                Load Demo Dataset
              </button>
            </div>
          </>
        )}
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
  const { filename, rowCount, workspaceId, setWorkspaceId, currentStudioId } = useWorkspaceStore();
  const clientId = workspaceId || 'ANALYTICS_demo';

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
