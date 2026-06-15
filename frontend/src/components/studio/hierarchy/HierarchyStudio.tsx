/**
 * HierarchyStudio — Studio 1
 *
 * Wraps the legacy 13-step pipeline inside the new StudioShell + SidebarNavItem
 * navigation so it matches the V6 studio design.  All business logic is
 * delegated to the child panels that already exist; this component only owns
 * the navigation layer.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  Upload, GitBranch, GitMerge, BarChart2, Layers,
  Cpu, Search, FlaskConical, ShieldCheck, FileText,
  Activity, Dna, Globe, Database
} from 'lucide-react';

import { StudioShell, SidebarNavItem, SidebarSection } from '../StudioShell';
import { useStudioInit } from '../../../hooks/useStudioInit';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useWebSocket } from '../../../performance/useWebSocket';
import { uploadApi } from '../../../services/uploadApi';
import { mappingApi } from '../../../services/mappingApi';
import { enrichmentApi } from '../../../services/enrichmentApi';
import { readinessApi } from '../../../services/readinessApi';
import { workspaceApi } from '../../../services/workspaceApi';
import { modelingApi } from '../../../services/modelingApi';

// Panel imports from the existing legacy components
import { UploadWorkspace } from '../../upload/UploadWorkspace';
import { DatasetMapping } from '../../mapping/DatasetMapping';
import { HierarchyBuilder } from '../../segregation/HierarchyBuilder';
import { DataAnalysisWorkspace } from '../../analysis/DataAnalysisWorkspace';
import { SubgroupSelectionHub } from '../../analysis/SubgroupSelectionHub';
import { DatasetStructureAssessment } from '../../assessment/DatasetStructureAssessment';
import { ChemicalStructureRecovery } from '../../recovery/ChemicalStructureRecovery';
import { DescriptorEnrichment } from '../../enrichment/DescriptorEnrichment';
import { CompoundExplorer } from '../../reports/CompoundExplorer';
import { DescriptorEndpointOptimization } from '../../modeling/DescriptorEndpointOptimization';
import ModelingReadinessWorkspace from '../../modeling/ModelingReadinessWorkspace';
import { QSARReadinessWorkspace } from '../../readiness/QSARReadinessWorkspace';
import { ScientificInsightsWorkspace } from '../../scientific/ScientificInsightsWorkspace';
import { ReportsExport } from '../../reports/ReportsExport';

// ─── Step definitions ─────────────────────────────────────────────────────────
import { StudioNavigationProvider, useStudioNavigation } from '../navigation/StudioNavigationProvider';
import type { NavigationStep } from '../navigation/StudioNavigationProvider';
// Removed deprecated indicators
import { AlertTriangle } from 'lucide-react';

const stepsConfig: NavigationStep[] = [
  {
    id: 'ingest',
    label: 'Upload Dataset',
    icon: <Upload className="w-4 h-4" />,
    desc: 'Load CSV, Excel or Parquet files',
    nextLabel: 'Continue to Mapping',
    nextStep: 'mapping',
    validation: (store: any) => {
      if (!store.filename) return 'Please upload a dataset or load the demo dataset first.';
      return true;
    }
  },
  {
    id: 'mapping',
    label: 'Variable Mapping',
    icon: <GitMerge className="w-4 h-4" />,
    desc: 'Map columns to scientific roles',
    nextLabel: 'Build Hierarchy',
    nextStep: 'hierarchy',
    prevLabel: 'Back to Upload',
    previousStep: 'ingest',
    validation: (store: any) => {
      const hasMap = Object.values(store.mappings || {}).some(v => v !== 'none');
      if (!hasMap) return 'Complete variable mapping before continuing.';
      return true;
    },
    isBlocked: (store: any) => {
      if (!store.filename) return 'Upload a dataset first.';
      return false;
    }
  },
  {
    id: 'hierarchy',
    label: 'Hierarchy Generation',
    icon: <GitBranch className="w-4 h-4" />,
    desc: 'Build endpoint/species tree',
    nextLabel: 'Perform Segregation',
    nextStep: 'analysis',
    prevLabel: 'Back to Mapping',
    previousStep: 'mapping',
    alternativeSteps: [{ id: 'reports', label: 'Skip to Reports & Export' }],
    validation: (store: any) => {
      if (!store.activeLineage) return 'Please generate the taxonomic hierarchy tree first.';
      return true;
    },
    isBlocked: (store: any) => {
      if (!store.filename) return 'Upload a dataset first.';
      const hasMap = Object.values(store.mappings || {}).some(v => v !== 'none');
      if (!hasMap) return 'Complete variable mapping first.';
      return false;
    }
  },
  {
    id: 'analysis',
    label: 'Variance & Segregation',
    icon: <BarChart2 className="w-4 h-4" />,
    desc: 'Statistical analysis workspace',
    nextLabel: 'Proceed to Data Explorer',
    nextStep: 'sci-explorer',
    prevLabel: 'Back to Hierarchy',
    previousStep: 'hierarchy',
    validation: (store: any) => {
      if (!store.segregationExecuted) return 'Please perform variance filtration and segregation analysis first.';
      return true;
    },
    isBlocked: (store: any) => {
      if (!store.activeLineage) return 'Generate taxonomic hierarchy first.';
      return false;
    }
  },
  {
    id: 'sci-explorer',
    label: 'Data Explorer',
    icon: <Search className="w-4 h-4" />,
    desc: 'Column searches & value scans',
    nextLabel: 'Proceed to Scientific Workspace',
    nextStep: 'sci-intelligence',
    prevLabel: 'Back to Segregation',
    previousStep: 'analysis',
    isBlocked: (store: any) => {
      if (!store.filename) return 'Upload a dataset first.';
      return false;
    }
  },
  {
    id: 'sci-intelligence',
    label: 'Scientific Workspace',
    icon: <Database className="w-4 h-4" />,
    desc: 'SPSS/Excel Spreadsheet Grid & Stats',
    nextLabel: 'Proceed to Reports',
    nextStep: 'reports',
    prevLabel: 'Back to Explorer',
    previousStep: 'sci-explorer',
    isBlocked: (store: any) => {
      if (!store.filename) return 'Upload a dataset first.';
      return false;
    }
  },
  {
    id: 'reports',
    label: 'Reports & Export',
    icon: <FileText className="w-4 h-4" />,
    desc: 'Generate & download reports',
    prevLabel: 'Back to Scientific Workspace',
    previousStep: 'sci-intelligence',
    isBlocked: (store: any) => {
      if (!store.filename) return 'Upload a dataset first.';
      return false;
    },
    warning: (store: any) => {
      if (!store.segregationExecuted) return 'Segregation and statistical analysis were not executed. Exported reports will lack taxonomic variance indexes.';
      return null;
    }
  }
];

interface HierarchyStudioProps { onGoHub: () => void; }

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

export const HierarchyStudioInner: React.FC<HierarchyStudioProps> = ({ onGoHub }) => {
  const { activeTab, handleJump, getStepStatus, setActiveTab } = useStudioNavigation();

  const {
    filename, parquetPath, rowCount, columns, preview, setDataset,
    mappings, setMappings,
    enrichmentMode, setEnrichmentMode,
    includeMordred, setIncludeMordred,
    activeJobId, setActiveJobId, setActiveJobType,
    modelingAnalysis, setModelingAnalysis, modelingLoading, setModelingLoading,
    modelingActivePanel, setModelingActivePanel,
    resetWorkspace, setWorkspaceId,
    datasetMode, setDatasetMode,
    setDatasetClassification, setDatasetPassport,
    setDetectedDomain, setPrimaryEntityType,
    currentStudioId,
  } = useWorkspaceStore();

  const generatedId = useRef(`HIER_${Math.random().toString(36).substring(2, 9)}`).current;
  const storeId = useWorkspaceStore(s => s.workspaceId);
  const clientId = storeId || generatedId;

  const socket = useWebSocket(clientId);

  // Ensure the workspaceId is persisted in the store
  useEffect(() => {
    if (clientId) setWorkspaceId(clientId);
  }, [clientId, setWorkspaceId]);

  // ── Upload state ────────────────────────────────────────────────
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

  // ── WebSocket listener ──────────────────────────────────────────
  useEffect(() => {
    const wsState = socket as any;
    const rawMsg = wsState?.lastMessage;
    if (!rawMsg) return;
    try {
      const msg = typeof rawMsg === 'string' ? JSON.parse(rawMsg) : rawMsg;
      
      if (msg.type === 'STAGE_CHANGE') { setUploadStage(msg.stage || ''); setUploadMessage(msg.description || ''); }
      if (msg.type === 'PROGRESS_UPDATE') {
        setUploadProgress(msg.progress || 0);
        setUploadStage(msg.stage || uploadStage);
        setUploadMessage(msg.message || '');
      }
      if (msg.type === 'JOB_COMPLETED') {
        const d = msg.result || {};
        const data = msg.data || {};
        
        const lineageData = data.lineage || d.graph || data.graph || d;
        if (lineageData && lineageData.nodes) {
          useWorkspaceStore.getState().setActiveSegregationResult({ graph: lineageData, ...lineageData });
          useWorkspaceStore.getState().setActiveLineage(lineageData);
          useWorkspaceStore.getState().setSegregation(lineageData, true);
        }

        if (d.filename || d.row_count) {
          setDataset(d.filename, d.parquet_path, d.row_count, d.columns, d.preview);
          if (d.columns?.length) {
            mappingApi.inferSchema(d.columns).then(res => {
              const m: any = {}; const inf: any = {};
              res.mappings.forEach((x: any) => { m[x.column] = x.mapped_to; inf[x.column] = x; });
              setMappings(m);
              useWorkspaceStore.getState().setMappingIntelligence?.(inf);
            }).catch(() => {
              const fb: any = {}; d.columns.forEach((c: string) => { fb[c] = 'none'; }); setMappings(fb);
            });
          }
          setIsUploadProcessing(false); setUploadProgress(100);
          toast.success('Dataset ingested and workspace ready!');
        }
      }
      if (msg.type === 'JOB_FAILED') { setIsUploadProcessing(false); toast.error(`Ingestion failed: ${msg.error}`); }
    } catch { /* ignore */ }
  }, [(socket as any)?.lastMessage]);

  // ── Upload handler ──────────────────────────────────────────────
  const handleIngestFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setIsUploadProcessing(true); setUploadProgress(0);
    setUploadStage('UPLOADING'); setUploadMessage(`Uploading ${file.name}...`); setUploadLogs([]);
    try {
      const res = await uploadApi.ingestFile(file, clientId);
      if (res.job_id) {
        uploadJobIdRef.current = res.job_id; setUploadJobId(res.job_id);
        const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
        for (let i = 0; i < 15; i++) {
          if (useWorkspaceStore.getState().rowCount > 0) break;
          await new Promise(r => setTimeout(r, 1000));
          try {
            const r2 = await fetch(`${apiBase}/api/jobs/${res.job_id}`);
            if (!r2.ok) continue;
            const job = await r2.json();
            if (job.status === 'COMPLETED' && job.result?.row_count > 0) {
              const d = job.result;
              setDataset(d.filename || file.name, d.parquet_path, d.row_count, d.columns, d.preview ?? []);
              if (d.columns?.length) {
                mappingApi.inferSchema(d.columns).then(res => {
                  const m: any = {}; const inf: any = {};
                  res.mappings.forEach((x: any) => { m[x.column] = x.mapped_to; inf[x.column] = x; });
                  setMappings(m);
                  useWorkspaceStore.getState().setMappingIntelligence?.(inf);
                }).catch(() => {
                  const fb: any = {}; d.columns.forEach((c: string) => { fb[c] = 'none'; }); setMappings(fb);
                });
              }
              setIsUploadProcessing(false); setUploadProgress(100);
              toast.success('Dataset ingested and workspace ready!');
              break;
            }
            if (job.status === 'FAILED') { setIsUploadProcessing(false); toast.error(`Ingestion failed`); break; }
          } catch { /* WS will deliver */ }
        }
      } else {
        const legacy = res as any;
        setDataset(res.filename, legacy.parquet_path ?? '', legacy.row_count ?? 0, legacy.columns ?? [], legacy.preview ?? []);
        if (legacy.columns?.length) {
          mappingApi.inferSchema(legacy.columns).then(res => {
            const m: any = {}; const inf: any = {};
            res.mappings.forEach((x: any) => { m[x.column] = x.mapped_to; inf[x.column] = x; });
            setMappings(m);
            useWorkspaceStore.getState().setMappingIntelligence?.(inf);
          }).catch(() => {
            const fb: any = {}; legacy.columns.forEach((c: string) => { fb[c] = 'none'; }); setMappings(fb);
          });
        }
        setIsUploadProcessing(false); toast.success('Dataset ingested.');
      }
    } catch (error: any) { setIsUploadProcessing(false); toast.error(error?.message || 'Upload failed'); }
  }, [clientId, setDataset, setMappings]);

  const handleLoadDemo = useCallback(async () => {
    setIsUploadProcessing(true); setUploadProgress(0);
    setUploadStage('PARSING'); setUploadMessage('Loading eco-toxicity demo dataset.'); setUploadLogs([]);
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
    try {
      const res = await workspaceApi.loadDemoDataset(clientId);
      if (res.job_id) {
        uploadJobIdRef.current = res.job_id; setUploadJobId(res.job_id);
        
        const poll = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_BASE_URL}/api/jobs/${res.job_id}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.status === 'COMPLETED') {
                clearInterval(poll);
                const d = statusData.result || {};
                setDataset(d.filename, d.parquet_path, d.row_count, d.columns, d.preview);
                if (d.columns?.length) {
                  mappingApi.inferSchema(d.columns).then(res => {
                    const m: any = {}; const inf: any = {};
                    res.mappings.forEach((x: any) => { m[x.column] = x.mapped_to; inf[x.column] = x; });
                    setMappings(m);
                    useWorkspaceStore.getState().setMappingIntelligence?.(inf);
                  }).catch(() => {
                    const fb: any = {}; d.columns.forEach((c: string) => { fb[c] = 'none'; }); setMappings(fb);
                  });
                }
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
        if (legacy.columns?.length) {
          mappingApi.inferSchema(legacy.columns).then(res => {
            const m: any = {}; const inf: any = {};
            res.mappings.forEach((x: any) => { m[x.column] = x.mapped_to; inf[x.column] = x; });
            setMappings(m);
            useWorkspaceStore.getState().setMappingIntelligence?.(inf);
          }).catch(() => {
            const fb: any = {}; legacy.columns.forEach((c: string) => { fb[c] = 'none'; }); setMappings(fb);
          });
        }
        setIsUploadProcessing(false); toast.success('Demo dataset loaded.');
      }
    } catch (e: any) { setIsUploadProcessing(false); toast.error(e?.message || 'Failed to load demo'); }
  }, [clientId, setDataset, setMappings]);

  // V5: Auto-load demo dataset if ?demo=true parameter is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'true') {
      window.history.replaceState({}, document.title, window.location.pathname);
      handleLoadDemo();
    }
  }, [handleLoadDemo]);

  const handleCurateColumns = async (colsToDrop: string[]) => {
    try {
      const t = toast.loading('Curating columns…');
      const d = await uploadApi.curateColumns(colsToDrop, clientId);
      toast.success('Dataset curated.', { id: t });
      setDataset(filename || 'dataset.parquet', d.parquet_path, d.row_count, d.columns, d.preview);
    } catch (e: any) { toast.error(e?.message || 'Curation failed'); }
  };

  const handleSaveMappings = async () => {
    try {
      const t = toast.loading('Saving mappings…');
      const mapRes = await mappingApi.saveMappings(mappings, clientId);
      if (mapRes.mappings) { setMappings(mapRes.mappings as any); }
      if (mapRes.columns) {
        setDataset(filename || 'dataset.parquet', parquetPath, rowCount, mapRes.columns, preview);
      }
      if (mapRes.dataset_mode) {
        setDatasetMode(mapRes.dataset_mode as any);
        setDatasetClassification(mapRes.dataset_classification);
        setDatasetPassport(mapRes.dataset_passport);
        setDetectedDomain(mapRes.dataset_passport?.detected_domain || 'General Scientific');
        setPrimaryEntityType(mapRes.dataset_passport?.primary_entity_type || 'Compound');
      }
      toast.success('Mapping complete.', { id: t });
    } catch (e: any) { toast.error(e?.message || 'Mapping failed'); }
  };

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
  };

  // ── Sidebar ─────────────────────────────────────────────────────
  const hasData = rowCount > 0;

  const sidebar = (
    <div className="flex flex-col h-full space-y-2">
      <SidebarSection label="Pipeline Steps" />
      {stepsConfig.map(step => {
        const status = getStepStatus(step.id);
        const isDisabled = status === 'blocked';
        return (
          <SidebarNavItem
            key={step.id}
            icon={step.icon}
            label={step.label}
            description={step.desc}
            isActive={activeTab === step.id}
            isDisabled={isDisabled}
            onClick={() => handleJump(step.id)}
            accentClass="text-cyan-400"
            activeBgClass="bg-cyan-500/10"
            activeBorderClass="border-cyan-400"
          />
        );
      })}
    </div>
  );

  // ── Panel renderer ───────────────────────────────────────────────
  const mockTelemetry = { ram_usage_pct: 45, fps: 60, active_jobs_count: 0 };

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
            handleCurateColumns={handleCurateColumns} onCancelJob={handleCancelJob}
          />
        );
      case 'mapping':
        return <DatasetMapping columns={columns} mappings={mappings} setMappings={setMappings} handleSaveMappings={handleSaveMappings} />;
      case 'hierarchy':
        return <HierarchyBuilder clientId={clientId} socket={socket} />;
      case 'analysis':
        return <DataAnalysisWorkspace />;
      case 'structure-assessment':
        return <DatasetStructureAssessment />;
      case 'structure-recovery':
        return <ChemicalStructureRecovery />;
      case 'enrichment':
        return (
          <DescriptorEnrichment
            enrichmentMode={enrichmentMode} setEnrichmentMode={setEnrichmentMode}
            includeMordred={includeMordred} setIncludeMordred={setIncludeMordred}
            handleRunEnrichment={handleRunEnrichment} handleCancelJob={handleCancelJob}
            handleFetchEnrichmentResults={handleFetchEnrichmentResults}
            socket={socket} ramUsage={mockTelemetry.ram_usage_pct} fps={60}
          />
        );
      case 'compound-explorer':
        return <CompoundExplorer clientId={clientId} activeJobId={activeJobId || null} onContinue={() => setActiveTab('feature-selection')} />;
      case 'feature-selection':
        return <DescriptorEndpointOptimization clientId={clientId} onContinue={() => setActiveTab('sci-intelligence')} />;
      case 'readiness':
        return datasetMode === 'SCIENTIFIC'
          ? <QSARReadinessWorkspace />
          : (
            <ModelingReadinessWorkspace
              clientId={clientId} modelingAnalysis={modelingAnalysis}
              modelingLoading={modelingLoading}
              onRunAnalysis={async (ids?: string[]) => {
                setModelingLoading(true);
                try { const r = await modelingApi.runAnalysis(clientId, ids); setModelingAnalysis(r); toast.success('AI Analysis complete!'); }
                catch (e: any) { toast.error(e?.message || 'Analysis failed'); }
                finally { setModelingLoading(false); }
              }}
              activePanel={modelingActivePanel} setActivePanel={setModelingActivePanel}
            />
          );
      case 'sci-intelligence':
        return <ScientificInsightsWorkspace clientId={clientId} />;
      case 'reports':
        return <ReportsExport clientId={clientId} activeJobId={activeJobId || null} handleResetWorkspace={handleReset} onNavigate={setActiveTab} />;
      default:
        return null;
    }
  };

  const activeStep = stepsConfig.find(s => s.id === activeTab);

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".csv,.tsv,.parquet,.xlsx,.xls"
        className="hidden"
        onChange={handleIngestFile}
      />
      <StudioShell
        studioId="hierarchy"
        onPauseAndGoHub={onGoHub}
        sidebar={sidebar}
        onReset={handleReset}
        isProcessing={isUploadProcessing}
        datasetFilename={filename}
        rowCount={rowCount}
        activeStep={activeStep?.label}
      >
        <div className="h-full flex flex-col bg-[#030b18] overflow-y-auto relative pb-4 animate-fade-in">
          <WarningBanner />
          <div className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div key={activeTab}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                className="p-6"
              >
                {renderPanel()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </StudioShell>
    </>
  );
};

export const HierarchyStudio: React.FC<HierarchyStudioProps> = (props) => {
  const { columns, setMappings } = useWorkspaceStore();
  
  const handleResetStep = (stepId: string) => {
    if (stepId === 'mapping') {
      const resetMap: any = {};
      columns.forEach(c => { resetMap[c] = 'none'; });
      setMappings(resetMap);
      toast.success('Variable mappings cleared.');
    } else if (stepId === 'hierarchy') {
      useWorkspaceStore.getState().setActiveLineage(null);
      useWorkspaceStore.getState().setActiveSegregationResult(null);
      toast.success('Generated taxonomy hierarchy cleared.');
    } else if (stepId === 'analysis') {
      useWorkspaceStore.getState().setSegregation(null, false);
      toast.success('Segregation analysis results cleared.');
    }
  };

  const handleResetWorkspaceWrapper = async () => {
    const store = useWorkspaceStore.getState();
    const clientId = store.workspaceId || 'HIER_temp';
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
      studioId="hierarchy"
      onReset={handleResetWorkspaceWrapper}
      onResetStep={handleResetStep}
    >
      <HierarchyStudioInner {...props} />
    </StudioNavigationProvider>
  );
};
