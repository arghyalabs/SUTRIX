import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  Upload, ShieldCheck, Cpu, Target, Layers
} from 'lucide-react';
import { StudioShell, SidebarNavItem, SidebarSection } from '../StudioShell';
import { QSARReadinessPanel } from './QSARReadinessPanel';
import { MLBenchmarkPanel } from './MLBenchmarkPanel';
import { ApplicabilityDomainPanel } from './ApplicabilityDomainPanel';
import { UploadWorkspace } from '../../upload/UploadWorkspace';
import { DescriptorEnrichment } from '../../enrichment/DescriptorEnrichment';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useStudioInit } from '../../../hooks/useStudioInit';
import { useWebSocket } from '../../../performance/useWebSocket';
import { uploadApi } from '../../../services/uploadApi';
import { enrichmentApi } from '../../../services/enrichmentApi';
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

  const {
    filename, rowCount, columns, preview, setDataset,
    workspaceId, setWorkspaceId, enrichmentMode, setEnrichmentMode,
    includeMordred, setIncludeMordred, setActiveJobId, setActiveJobType, activeJobId, activeJobType
  } = useWorkspaceStore();

  const genId = useRef(`QSAR_${Math.random().toString(36).substring(2, 9)}`).current;
  const storeId = useWorkspaceStore(s => s.workspaceId);
  const clientId = storeId || genId;

  const socket = useWebSocket(clientId);

  // Persist workspaceId to store
  useEffect(() => {
    if (clientId) setWorkspaceId(clientId);
  }, [clientId, setWorkspaceId]);

  // ── Upload state ─────────────────────────────────────────────────
  const [isUploadProcessing, setIsUploadProcessing] = useState(false);
  const [uploadJobId, setUploadJobId] = useState<string | null>(null);
  const uploadJobIdRef = useRef<string | null>(null);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadEta, setUploadEta] = useState(0);
  const [uploadItemsPerSec, setUploadItemsPerSec] = useState(0);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);

  useEffect(() => {
    const wsState = socket as any;
    const rawMsg = wsState?.lastMessage;
    if (!rawMsg || !uploadJobIdRef.current) return;
    try {
      const msg = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : rawMsg;
      if (msg.job_id !== uploadJobIdRef.current && msg.workspace_id !== clientId) return;
      if (msg.type === 'STAGE_CHANGE') {
        setUploadStage(msg.stage || '');
        setUploadMessage(msg.description || '');
      }
      if (msg.type === 'PROGRESS_UPDATE') {
        setUploadProgress(msg.progress || 0);
        setUploadEta(msg.eta_seconds || 0);
        setUploadItemsPerSec(msg.items_per_sec || 0);
        setUploadStage(msg.stage || uploadStage);
        setUploadMessage(msg.message || '');
        if (msg.logs?.length) setUploadLogs(msg.logs);
      }
      if (msg.type === 'JOB_COMPLETED') {
        const d = msg.result || {};
        if (d.filename || d.row_count) {
          setDataset(d.filename, d.parquet_path, d.row_count, d.columns, d.preview);
        }
        setIsUploadProcessing(false);
        setUploadProgress(100);
        toast.success('Dataset loaded!');
      }
      if (msg.type === 'JOB_FAILED') {
        setIsUploadProcessing(false);
        toast.error(`Upload failed: ${msg.error}`);
      }
    } catch { /* ignore */ }
  }, [(socket as any)?.lastMessage, uploadJobId, clientId, setDataset, uploadStage]);

  const handleIngestFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setIsUploadProcessing(true);
    setUploadProgress(0);
    setUploadStage('UPLOADING');
    setUploadMessage(`Uploading ${file.name}...`);
    setUploadLogs([]);
    try {
      const res = await uploadApi.ingestFile(file, clientId);
      if (res.job_id) {
        uploadJobIdRef.current = res.job_id;
        setUploadJobId(res.job_id);
      } else {
        const d = res as any;
        setDataset(d.filename || file.name, d.parquet_path ?? '', d.row_count ?? 0, d.columns ?? [], d.preview ?? []);
        setIsUploadProcessing(false);
        toast.success('Dataset loaded!');
      }
    } catch (err: any) {
      setIsUploadProcessing(false);
      toast.error(err?.message || 'Upload failed');
    }
  }, [clientId, setDataset]);

  const handleLoadDemo = useCallback(async () => {
    setIsUploadProcessing(true);
    setUploadProgress(0);
    setUploadStage('PARSING');
    setUploadMessage('Loading demo dataset.');
    setUploadLogs([]);
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
    try {
      const res = await workspaceApi.loadDemoDataset(clientId);
      if (res.job_id) {
        uploadJobIdRef.current = res.job_id;
        setUploadJobId(res.job_id);
        
        const poll = setInterval(async () => {
          try {
             const statusRes = await fetch(`${API_BASE_URL}/api/jobs/${res.job_id}`);
             if (statusRes.ok) {
               const statusData = await statusRes.json();
               if (statusData.status === 'COMPLETED') {
                 clearInterval(poll);
                 const d = statusData.result || {};
                 setDataset(d.filename, d.parquet_path, d.row_count, d.columns, d.preview);
                 setIsUploadProcessing(false);
                 toast.success('Demo dataset loaded.');
               } else if (statusData.status === 'FAILED') {
                 clearInterval(poll);
                 setIsUploadProcessing(false);
                 toast.error('Demo dataset failed to load.');
               } else if (statusData.progress) {
                 setUploadProgress(statusData.progress);
                 if (statusData.stage) setUploadStage(statusData.stage);
                 if (statusData.message) setUploadMessage(statusData.message);
               }
             }
          } catch (e) { /* ignore */ }
        }, 1500);
      } else {
        const legacy = res as any;
        setDataset(res.filename, legacy.parquet_path ?? '', legacy.row_count ?? 0, legacy.columns ?? [], legacy.preview ?? []);
        setIsUploadProcessing(false);
        toast.success('Demo dataset loaded.');
      }
    } catch (err: any) {
      setIsUploadProcessing(false);
      toast.error(err?.message || 'Failed to load demo');
    }
  }, [clientId, setDataset]);

  const handleCurateColumns = async (colsToDrop: string[]) => {
    try {
      const t = toast.loading('Curating columns…');
      const d = await uploadApi.curateColumns(colsToDrop, clientId);
      toast.success('Dataset curated.', { id: t });
      setDataset(filename || 'dataset.parquet', d.parquet_path, d.row_count, d.columns, d.preview);
      setActiveTab('generator');
    } catch (err: any) {
      toast.error(err?.message || 'Curation failed');
    }
  };

  const handleRunEnrichment = async () => {
    try {
      const s = useWorkspaceStore.getState();
      const r = await enrichmentApi.runEnrichment(s.selectedDescriptors, s.includeMordred, s.enrichmentMode, clientId);
      setActiveJobId(r.job_id);
      setActiveJobType('enrichment');
      socket.connectToJob(r.job_id);
      toast.success('Enrichment job dispatched.');
    } catch (err: any) {
      toast.error(err?.message || 'Enrichment failed');
    }
  };

  const handleCancelJob = useCallback(async () => {
    try {
      if (activeJobType === 'enrichment' && activeJobId) {
        await enrichmentApi.cancelJob(clientId);
        toast('Job cancelled.', { icon: '⚠️' });
      } else if (isUploadProcessing && uploadJobId) {
        await fetch(`${API}/api/jobs/${uploadJobId}/cancel`, { method: 'POST' });
        setIsUploadProcessing(false);
        toast('Upload job cancelled.', { icon: '⚠️' });
      }
    } catch { /* ignore */ }
  }, [clientId, activeJobType, activeJobId, isUploadProcessing, uploadJobId]);

  const handleFetchEnrichmentResults = async () => {
    const s = useWorkspaceStore.getState();
    if (!s.activeJobId) {
      toast.error('No enrichment job found.');
      return;
    }
    try {
      const t = toast.loading('Assembling enriched parquet…');
      const d = await enrichmentApi.fetchResults(clientId, s.activeJobId);
      toast.success('Enrichment matrix loaded.', { id: t });
      setDataset(d.job_id + '.parquet', d.parquet_path, d.total_rows, d.columns, d.preview);
      setActiveTab('readiness');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to fetch results');
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
          <UploadWorkspace
            filename={filename}
            rowCount={rowCount}
            columns={columns}
            preview={preview}
            isProcessing={isUploadProcessing}
            processingStage={uploadStage}
            processingMessage={uploadMessage}
            processingProgress={uploadProgress}
            processingEta={uploadEta}
            processingItemsPerSec={uploadItemsPerSec}
            processingStageLogs={uploadLogs}
            activeJobId={uploadJobId}
            handleIngestFile={handleIngestFile}
            handleLoadDemo={handleLoadDemo}
            handleCurateColumns={handleCurateColumns}
            onCancelJob={handleCancelJob}
          />
        );
      case 'generator':
        return (
          <DescriptorEnrichment
            enrichmentMode={enrichmentMode}
            setEnrichmentMode={setEnrichmentMode}
            includeMordred={includeMordred}
            setIncludeMordred={setIncludeMordred}
            handleRunEnrichment={handleRunEnrichment}
            handleCancelJob={handleCancelJob}
            handleFetchEnrichmentResults={handleFetchEnrichmentResults}
            socket={socket}
            ramUsage={45}
            fps={60}
          />
        );
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
