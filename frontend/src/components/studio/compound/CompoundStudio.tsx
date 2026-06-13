/**
 * CompoundStudio — Studio 3
 *
 * A dedicated Compound Explorer & Feature Engineering studio.
 * Uses the new StudioShell + SidebarNavItem (emerald theme).
 * Focuses on: upload → enrich → browse structures → feature select → readiness.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  Upload, Search, Cpu, FlaskConical, ShieldCheck, FileText, Layers
} from 'lucide-react';

import { StudioShell, SidebarNavItem, SidebarSection } from '../StudioShell';
import { useStudioInit } from '../../../hooks/useStudioInit';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useWebSocket } from '../../../performance/useWebSocket';
import { uploadApi } from '../../../services/uploadApi';
import { enrichmentApi } from '../../../services/enrichmentApi';
import { modelingApi } from '../../../services/modelingApi';
import { workspaceApi } from '../../../services/workspaceApi';

// Legacy panels
import { UploadWorkspace } from '../../upload/UploadWorkspace';
import { DescriptorEnrichment } from '../../enrichment/DescriptorEnrichment';
import { CompoundExplorer } from '../../reports/CompoundExplorer';
import { DescriptorEndpointOptimization } from '../../modeling/DescriptorEndpointOptimization';
import ModelingReadinessWorkspace from '../../modeling/ModelingReadinessWorkspace';
import { QSARReadinessWorkspace } from '../../readiness/QSARReadinessWorkspace';
import { ReportsExport } from '../../reports/ReportsExport';
import { SubgroupSelectionHub } from '../../analysis/SubgroupSelectionHub';

const STEPS = [
  { id: 'ingest',            label: 'Upload Dataset',         icon: <Upload className="w-4 h-4" />,       desc: 'Load a dataset with SMILES column' },
  { id: 'subgroup-selection',label: 'Subgroup Selection',     icon: <Layers className="w-4 h-4" />,       desc: 'Select and isolate primary target subgroup', needsData: true },
  { id: 'enrichment',        label: 'Descriptor Enrichment',  icon: <Cpu className="w-4 h-4" />,          desc: 'RDKit / Mordred descriptor calc', needsData: true },
  { id: 'compound-explorer', label: 'Compound Explorer',      icon: <Search className="w-4 h-4" />,       desc: 'Browse structures & similarity search', needsData: true },
  { id: 'reports',           label: 'Reports & Export',       icon: <FileText className="w-4 h-4" />,     desc: 'Generate & download reports', needsData: true },
];

interface CompoundStudioProps { onGoHub: () => void; }

export const CompoundStudio: React.FC<CompoundStudioProps> = ({ onGoHub }) => {
  useStudioInit('compound');

  const {
    activeTab: storeTab, setActiveTab,
    filename, rowCount, columns, preview, setDataset,
    enrichmentMode, setEnrichmentMode,
    includeMordred, setIncludeMordred,
    activeJobId, setActiveJobId, setActiveJobType,
    modelingAnalysis, setModelingAnalysis, modelingLoading, setModelingLoading,
    modelingActivePanel, setModelingActivePanel,
    resetWorkspace, datasetMode,
    setWorkspaceId,
    currentStudioId,
  } = useWorkspaceStore();

  const activeTab = storeTab || 'ingest';

  const genId = useRef(`CMPD_${Math.random().toString(36).substring(2, 9)}`).current;
  const storeId = useWorkspaceStore(s => s.workspaceId);
  const clientId = storeId || genId;

  if (currentStudioId !== 'compound') {
    return null;
  }

  const socket = useWebSocket(clientId);

  // Ensure workspaceId is persisted in the store so child components can use it.
  useEffect(() => {
    if (clientId) setWorkspaceId(clientId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const wsState = socket as any;
    const rawMsg = wsState?.lastMessage;
    if (!rawMsg || !uploadJobIdRef.current) return;
    try {
      const msg = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : rawMsg;
      if (msg.job_id !== uploadJobIdRef.current && msg.workspace_id !== clientId) return;
      if (msg.type === 'STAGE_CHANGE') { setUploadStage(msg.stage || ''); setUploadMessage(msg.description || ''); }
      if (msg.type === 'PROGRESS_UPDATE') {
        setUploadProgress(msg.progress || 0); setUploadEta(msg.eta_seconds || 0);
        setUploadItemsPerSec(msg.items_per_sec || 0); setUploadStage(msg.stage || uploadStage);
        setUploadMessage(msg.message || '');
        if (msg.logs?.length) setUploadLogs(msg.logs);
      }
      if (msg.type === 'JOB_COMPLETED') {
        const d = msg.result || {};
        if (d.filename || d.row_count) setDataset(d.filename, d.parquet_path, d.row_count, d.columns, d.preview);
        setIsUploadProcessing(false); setUploadProgress(100);
        toast.success('Dataset loaded!');
      }
      if (msg.type === 'JOB_FAILED') { setIsUploadProcessing(false); toast.error(`Upload failed: ${msg.error}`); }
    } catch { /* ignore */ }
  }, [(socket as any)?.lastMessage, uploadJobId]);

  const handleIngestFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setIsUploadProcessing(true); setUploadProgress(0);
    setUploadStage('UPLOADING'); setUploadMessage(`Uploading ${file.name}...`); setUploadLogs([]);
    try {
      const res = await uploadApi.ingestFile(file, clientId);
      if (res.job_id) {
        uploadJobIdRef.current = res.job_id; setUploadJobId(res.job_id);
      } else {
        const d = res as any;
        setDataset(d.filename || file.name, d.parquet_path ?? '', d.row_count ?? 0, d.columns ?? [], d.preview ?? []);
        setIsUploadProcessing(false); toast.success('Dataset loaded!');
      }
    } catch (e: any) { setIsUploadProcessing(false); toast.error(e?.message || 'Upload failed'); }
  }, [clientId]);

  const handleLoadDemo = useCallback(async () => {
    setIsUploadProcessing(true); setUploadProgress(0);
    setUploadStage('PARSING'); setUploadMessage('Loading demo dataset.'); setUploadLogs([]);
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
    try {
      const res = await workspaceApi.loadDemoDataset(clientId);
      if (res.job_id) {
        uploadJobIdRef.current = res.job_id; setUploadJobId(res.job_id);
        
        // Polling fallback
        const poll = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_BASE_URL}/api/jobs/${res.job_id}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.status === 'COMPLETED') {
                clearInterval(poll);
                const d = statusData.result || {};
                setDataset(d.filename, d.parquet_path, d.row_count, d.columns, d.preview);
                setIsUploadProcessing(false); toast.success('Demo dataset loaded.');
              } else if (statusData.status === 'FAILED') {
                clearInterval(poll);
                setIsUploadProcessing(false); toast.error('Demo dataset failed to load.');
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
        setIsUploadProcessing(false); toast.success('Demo dataset loaded.');
      }
    } catch (e: any) { setIsUploadProcessing(false); toast.error(e?.message || 'Failed to load demo'); }
  }, [clientId]);

  const handleRunEnrichment = async () => {
    try {
      const s = useWorkspaceStore.getState();
      const r = await enrichmentApi.runEnrichment(s.selectedDescriptors, s.includeMordred, s.enrichmentMode, clientId);
      setActiveJobId(r.job_id); setActiveJobType('enrichment'); socket.connectToJob(r.job_id);
      toast.success('Enrichment job dispatched.');
    } catch (e: any) { toast.error(e?.message || 'Enrichment failed'); }
  };

  const handleCancelJob = useCallback(async () => {
    try { await enrichmentApi.cancelJob(clientId); toast('Job cancelled.', { icon: '⚠️' }); } catch { /**/ }
  }, [clientId]);

  const handleFetchEnrichmentResults = async () => {
    const s = useWorkspaceStore.getState();
    if (!s.activeJobId) { toast.error('No enrichment job found.'); return; }
    try {
      const t = toast.loading('Assembling enriched parquet…');
      const d = await enrichmentApi.fetchResults(clientId, s.activeJobId);
      toast.success('Enrichment matrix loaded.', { id: t });
      setDataset(d.job_id + '.parquet', d.parquet_path, d.total_rows, d.columns, d.preview);
      setActiveTab('compound-explorer');
    } catch (e: any) { toast.error(e?.message || 'Failed to fetch results'); }
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
    setActiveTab('ingest');
  };

  const hasData = rowCount > 0;

  const sidebar = (
    <div className="flex flex-col h-full space-y-2">
      <SidebarSection label="Studio Steps" />
      {STEPS.map(step => (
        <SidebarNavItem
          key={step.id}
          icon={step.icon}
          label={step.label}
          description={step.desc}
          isActive={activeTab === step.id}
          isDisabled={(step as any).needsData && !hasData}
          onClick={() => setActiveTab(step.id)}
          accentClass="text-emerald-400"
          activeBgClass="bg-emerald-500/10"
          activeBorderClass="border-emerald-400"
        />
      ))}
    </div>
  );

  const activeStep = STEPS.find(s => s.id === activeTab);

  const renderPanel = () => {
    switch (activeTab) {
      case 'ingest':
        return (
          <UploadWorkspace
            filename={filename} rowCount={rowCount} columns={columns} preview={preview}
            isProcessing={isUploadProcessing}
            processingStage={uploadStage} processingMessage={uploadMessage}
            processingProgress={uploadProgress} processingEta={uploadEta}
            processingItemsPerSec={uploadItemsPerSec} processingStageLogs={uploadLogs}
            activeJobId={uploadJobId}
            handleIngestFile={handleIngestFile} handleLoadDemo={handleLoadDemo}
            handleCurateColumns={async () => {}} onCancelJob={handleCancelJob}
          />
        );
      case 'subgroup-selection':
        return <SubgroupSelectionHub clientId={clientId} onContinue={() => setActiveTab('enrichment')} />;
      case 'enrichment':
        return (
          <DescriptorEnrichment
            enrichmentMode={enrichmentMode} setEnrichmentMode={setEnrichmentMode}
            includeMordred={includeMordred} setIncludeMordred={setIncludeMordred}
            handleRunEnrichment={handleRunEnrichment} handleCancelJob={handleCancelJob}
            handleFetchEnrichmentResults={handleFetchEnrichmentResults}
            socket={socket} ramUsage={45} fps={60}
          />
        );
      case 'compound-explorer':
        return <CompoundExplorer clientId={clientId} activeJobId={activeJobId || null} onContinue={() => setActiveTab('reports')} />;
      case 'reports':
        return <ReportsExport clientId={clientId} activeJobId={activeJobId || null} handleResetWorkspace={handleReset} onNavigate={setActiveTab} />;
      default:
        return null;
    }
  };

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".csv,.tsv,.parquet,.xlsx"
        className="hidden" onChange={handleIngestFile}
      />
      <StudioShell
        studioId="compound"
        onPauseAndGoHub={onGoHub}
        sidebar={sidebar}
        onUpload={() => fileInputRef.current?.click()}
        onReset={handleReset}
        isProcessing={isUploadProcessing}
        datasetFilename={filename}
        rowCount={rowCount}
        activeStep={activeStep?.label}
      >
        <div className="h-full overflow-y-auto bg-[#030b18]">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            >
              {renderPanel()}
            </motion.div>
          </AnimatePresence>
        </div>
      </StudioShell>
    </>
  );
};
