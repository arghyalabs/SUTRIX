import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Search, Download, CheckCircle2, Loader2, Play,
  Activity, AlertCircle, Database, HelpCircle, ArrowRight, UploadCloud
} from 'lucide-react';
import { StudioShell, SidebarNavItem, SidebarSection } from '../StudioShell';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useStudioInit } from '../../../hooks/useStudioInit';
import { API_BASE_URL } from '../../../config';
import { toast } from 'react-hot-toast';
import { StudioNavigationProvider, useStudioNavigation } from '../navigation/StudioNavigationProvider';
import type { NavigationStep } from '../navigation/StudioNavigationProvider';

interface RecoveryResult {
  compound: string;
  smiles: string;
  source: string;
  status: 'Recovered' | 'Failed' | 'Cache Hit';
}

const stepsConfig: NavigationStep[] = [
  {
    id: 'ingest',
    label: 'Upload & Map Identifier',
    icon: <Upload className="w-4 h-4" />,
    desc: 'Ingest raw chemical dataset and map identity column',
    nextLabel: 'Proceed to Enrichment',
    nextStep: 'enrich',
    validation: (store: any) => {
      if (!store.filename) return 'Please upload a dataset or load the demo dataset first.';
      return true;
    }
  },
  {
    id: 'enrich',
    label: 'Enrichment Engine',
    icon: <Search className="w-4 h-4" />,
    desc: 'Resolve structures & download output',
    prevLabel: 'Back to Upload',
    previousStep: 'ingest',
    isBlocked: (store: any) => {
      if (!store.filename) return 'Upload a dataset first.';
      return false;
    }
  }
];

const StructureEnrichmentStudioInner: React.FC<{ onGoHub: () => void }> = ({ onGoHub }) => {
  useStudioInit('enrichment');
  const { steps, activeTab, getStepStatus, handleNext, handlePrevious, handleJump } = useStudioNavigation();
  const { workspaceId, mappings, filename, setDataset, setWorkspaceId, resetWorkspace } = useWorkspaceStore();

  const genId = React.useRef(`ENRICH_${Math.random().toString(36).substring(2, 9)}`).current;
  const storeId = useWorkspaceStore(s => s.workspaceId);
  const clientId = storeId || genId;

  // Persist workspaceId to store
  useEffect(() => {
    if (clientId) setWorkspaceId(clientId);
  }, [clientId, setWorkspaceId]);

  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  
  // Resolution engine states
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [polling, setPolling] = useState(false);
  const [results, setResults] = useState<RecoveryResult[]>([]);
  const [limitOption, setLimitOption] = useState<string>('all');
  const [sources] = useState<string[]>(['pubchem', 'chembl', 'comptox']);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Determine the identifier column
  const roleToCol = Object.entries(mappings).reduce((acc, [col, role]) => {
    acc[role] = col;
    return acc;
  }, {} as Record<string, string>);
  const resolveCol = roleToCol['chemical_name'] || roleToCol['cas_number'] || (mappings ? Object.keys(mappings)[0] : '');

  // Load scope preview on entering enrichment tab
  useEffect(() => {
    if (activeTab === 'enrich' && workspaceId) {
      fetchPreview();
    }
  }, [activeTab, workspaceId]);

  const fetchPreview = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/structure-recovery/v2/${workspaceId}/scope-preview`);
      if (res.ok) {
        const data = await res.json();
        setPreview(data);
      }
    } catch (err) {
      console.error('Failed to load enrichment preview', err);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('client_id', clientId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ingest`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('File upload failed');
      const data = await res.json();
      
      const uploadJobId = data.job_id;
      let errorCount = 0;
      
      // Poll job status until complete
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE_URL}/api/jobs/${uploadJobId}`);
          if (statusRes.ok) {
            errorCount = 0; // Reset on successful poll
            const statusData = await statusRes.json();
            if (statusData && statusData.status === 'COMPLETED') {
              clearInterval(poll);
              const d = statusData.result || {};
              
              setDataset(
                d.filename || file.name,
                d.parquet_path || '',
                d.row_count || 0,
                d.columns || [],
                d.preview || []
              );
              
              // Auto map first column to chemical name
              const initialMappings: Record<string, string> = {};
              if (d.columns && d.columns.length > 0) {
                initialMappings[d.columns[0]] = 'chemical_name';
              }
              useWorkspaceStore.setState({ mappings: initialMappings });
              
              toast.success(`Successfully ingested ${file.name}`);
              setUploading(false);
              handleNext();
            } else if (statusData && statusData.status === 'FAILED') {
              clearInterval(poll);
              setUploading(false);
              toast.error(`Upload failed: ${statusData.error || statusData.error_message || 'Unknown error'}`);
            }
          } else {
            errorCount++;
            if (errorCount > 15) {
              clearInterval(poll);
              setUploading(false);
              toast.error('Failed to locate upload job status after multiple retries.');
            }
          }
        } catch (e) {
          errorCount++;
          if (errorCount > 15) {
            clearInterval(poll);
            setUploading(false);
            toast.error('Connection lost: Failed to poll upload job status.');
          }
        }
      }, 1000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to ingest file');
      setUploading(false);
    }
  };

  const handleLoadDemo = async () => {
    setUploading(true);
    const formData = new FormData();
    formData.append('client_id', clientId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/demo_ingest`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Failed to load demo');
      const data = await res.json();
      
      const demoJobId = data.job_id;
      let errorCount = 0;
      
      // Poll job status
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE_URL}/api/jobs/${demoJobId}`);
          if (statusRes.ok) {
            errorCount = 0; // Reset on successful poll
            const statusData = await statusRes.json();
            if (statusData && statusData.status === 'COMPLETED') {
              clearInterval(poll);
              const d = statusData.result || {};
              
              setDataset(
                d.filename || 'demo_dataset.csv',
                d.parquet_path || '',
                d.row_count || 0,
                d.columns || [],
                d.preview || []
              );
              
              // Auto-map chemical column
              const initialMappings: Record<string, string> = {};
              if (d.columns && d.columns.includes('Chemical Name')) {
                initialMappings['Chemical Name'] = 'chemical_name';
              } else if (d.columns && d.columns.length > 0) {
                initialMappings[d.columns[0]] = 'chemical_name';
              }
              useWorkspaceStore.setState({ mappings: initialMappings });

              toast.success('Loaded Ecotox Demo dataset.');
              setUploading(false);
              handleNext();
            } else if (statusData && statusData.status === 'FAILED') {
              clearInterval(poll);
              setUploading(false);
              toast.error(`Demo failed: ${statusData.error || statusData.error_message || 'Unknown error'}`);
            }
          } else {
            errorCount++;
            if (errorCount > 15) {
              clearInterval(poll);
              setUploading(false);
              toast.error('Failed to locate demo job status after multiple retries.');
            }
          }
        } catch (e) {
          errorCount++;
          if (errorCount > 15) {
            clearInterval(poll);
            setUploading(false);
            toast.error('Connection lost: Failed to poll demo job status.');
          }
        }
      }, 1000);
    } catch (err: any) {
      toast.error(err.message);
      setUploading(false);
    }
  };

  // WebSocket job status
  useEffect(() => {
    let ws: WebSocket | null = null;
    if (polling && workspaceId && jobId) {
      const wsUrl = `${API_BASE_URL.replace('http', 'ws').replace('https', 'wss')}/ws/jobs/${workspaceId}`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'PROGRESS') {
            setJobStatus({
              status: 'RUNNING',
              progress: data.data?.progress_pct || 0,
              metrics: {
                current_speed_cps: data.data?.compounds_per_sec || 0,
                estimated_time_remaining_sec: data.data?.eta_seconds || 0
              }
            });
          } else if (data.type === 'JOB_COMPLETED') {
            setJobStatus({
              status: 'COMPLETED',
              progress: 100
            });
            setPolling(false);
            toast.success('Notation enrichment complete!');
            fetchFinalResults();
          } else if (data.type === 'JOB_FAILED') {
            setJobStatus({ status: 'FAILED' });
            setPolling(false);
            toast.error(`Enrichment failed: ${data.error || 'Unknown error'}`);
          }
        } catch (err) {
          console.error("WS parse error", err);
        }
      };
    }
    return () => {
      if (ws) ws.close();
    };
  }, [polling, workspaceId, jobId]);

  const fetchFinalResults = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/structure-recovery/${workspaceId}/result`);
      if (res.ok) {
        const data = await res.json();
        const smilesMap = data.smiles_map || {};
        const unresolved = data.unresolved || [];
        
        const mappedResults: RecoveryResult[] = [];
        Object.entries(smilesMap).forEach(([compound, info]: any) => {
          mappedResults.push({
            compound,
            smiles: typeof info === 'string' ? info : info.smiles || '—',
            source: typeof info === 'string' ? 'Resolved' : info.source || 'Resolved',
            status: unresolved.includes(compound) ? 'Failed' : 'Recovered'
          });
        });
        unresolved.forEach((compound: string) => {
          if (!smilesMap[compound]) {
            mappedResults.push({
              compound,
              smiles: '—',
              source: 'Not Found',
              status: 'Failed'
            });
          }
        });
        setResults(mappedResults);
      }
    } catch (err) {
      console.error("Failed to load results", err);
    }
  };

  const handleStartEnrichment = async () => {
    if (!resolveCol) {
      toast.error('Please map the identifier column.');
      return;
    }
    const limitVal = limitOption === '100' ? 100 
                   : limitOption === '500' ? 500 
                   : limitOption === '1000' ? 1000 
                   : preview?.total_missing || -1;
    try {
      const res = await fetch(`${API_BASE_URL}/api/structure-recovery/v2/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: workspaceId,
          column_to_resolve: resolveCol,
          mode: 'standard',
          limit: limitVal,
          sources
        })
      });
      if (!res.ok) throw new Error('Failed to submit job');
      const data = await res.json();
      setJobId(data.job_id);
      setPolling(true);
      setJobStatus({ status: 'QUEUED', progress: 0 });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDownloadFile = (format: 'csv' | 'xlsx') => {
    if (!workspaceId) return;
    const downloadUrl = `${API_BASE_URL}/api/structure-recovery/${workspaceId}/export-file?format=${format}`;
    window.open(downloadUrl, '_blank');
  };

  // Pagination filters
  const filteredResults = results.filter(r => 
    r.compound.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.smiles.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const paginatedResults = filteredResults.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <StudioShell
      studioId="enrichment"
      activeStep={activeTab}
      isProcessing={polling}
      onPauseAndGoHub={onGoHub}
      sidebar={
        <div className="flex flex-col h-full space-y-2">
          <SidebarSection label="Structure Enrichment Steps" />
          {steps.map(step => (
            <SidebarNavItem
              key={step.id}
              icon={step.icon}
              label={step.label}
              isActive={activeTab === step.id}
              isDisabled={!filename && step.id !== 'ingest'}
              onClick={() => handleJump(step.id)}
              accentClass="text-cyan-400"
              activeBgClass="bg-cyan-500/10"
              activeBorderClass="border-cyan-400"
            />
          ))}
        </div>
      }
    >
      <div className="max-w-5xl mx-auto py-8 px-4 text-white">
        <AnimatePresence mode="wait">
          {activeTab === 'ingest' && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-8"
            >
              {filename ? (
                <div className="glass-panel p-8 rounded-2xl border border-white/[0.06] bg-slate-900/20 max-w-2xl mx-auto text-center space-y-6">
                  <div className="w-16 h-16 bg-cyan-500/10 border border-cyan-500/20 rounded-full flex items-center justify-center mx-auto">
                    <Database className="w-8 h-8 text-cyan-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{filename}</h2>
                    <p className="text-xs text-slate-400 mt-1">{useWorkspaceStore.getState().rowCount} rows loaded</p>
                  </div>
                  
                  {/* Column mapping selection */}
                  <div className="text-left bg-black/30 p-5 rounded-xl border border-white/[0.04] space-y-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Select Identifier Column to Resolve</label>
                    <select
                      value={resolveCol}
                      onChange={(e) => {
                        const newMappings: Record<string, string> = {};
                        newMappings[e.target.value] = 'chemical_name';
                        useWorkspaceStore.setState({ mappings: newMappings });
                      }}
                      className="w-full bg-slate-950 border border-white/[0.1] px-4 py-2.5 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
                    >
                      {useWorkspaceStore.getState().columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-500 block leading-relaxed">
                      SUTRIX will resolve CAS Numbers, IUPAC Names, or Common names in this column into Canonical SMILES, InChI, and InChIKeys.
                    </span>
                  </div>

                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => { resetWorkspace(); }}
                      className="px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold transition-all"
                    >
                      Reupload Different File
                    </button>
                    <button
                      onClick={handleNext}
                      className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                    >
                      <span>Proceed to Enrichment</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState handleUpload={handleUpload} handleLoadDemo={handleLoadDemo} isUploading={uploading} />
              )}
            </motion.div>
          )}

          {activeTab === 'enrich' && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {/* Setup Panel */}
              {!polling && !jobStatus && (
                <div className="glass-panel p-8 rounded-2xl border border-white/[0.06] bg-slate-900/20 max-w-2xl mx-auto space-y-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-cyan-400" />
                    Enrichment Engine Setup
                  </h2>
                  <p className="text-xs text-slate-400">
                    SUTRIX will scan the mapped column, fetch structures, and format them for download.
                  </p>

                  <div className="space-y-4">
                    <div className="bg-black/30 p-4 rounded-xl border border-white/[0.04] flex justify-between items-center">
                      <div>
                        <span className="text-xs font-bold text-slate-400 block uppercase">Identifier Target</span>
                        <span className="text-sm font-mono font-bold text-white mt-1 block">{resolveCol || 'Unmapped'}</span>
                      </div>
                      <button
                        onClick={handlePrevious}
                        className="text-xs text-cyan-400 hover:underline"
                      >
                        Change Mapping
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Processing Limit</label>
                        <select
                          value={limitOption}
                          onChange={(e) => setLimitOption(e.target.value)}
                          className="w-full bg-slate-950 border border-white/[0.1] px-3 py-2 rounded-lg text-xs"
                        >
                          <option value="100">100 compounds</option>
                          <option value="500">500 compounds</option>
                          <option value="1000">1000 compounds</option>
                          <option value="all">Entire dataset</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Resolution Source</label>
                        <select
                          className="w-full bg-slate-950 border border-white/[0.1] px-3 py-2 rounded-lg text-xs"
                          disabled
                        >
                          <option>PubChem + Cache (Default)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleStartEnrichment}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Start Enrichment Process
                  </button>
                </div>
              )}

              {/* Progress & Downloading Panel */}
              {(polling || jobStatus) && (
                <div className="space-y-6">
                  <div className="glass-panel p-8 border border-white/[0.06] bg-slate-900/40 rounded-2xl text-center space-y-6 max-w-2xl mx-auto">
                    {jobStatus?.status === 'COMPLETED' ? (
                      <div className="flex flex-col items-center space-y-4">
                        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                        </div>
                        <h3 className="text-2xl font-black text-white">Dataset Enriched!</h3>
                        
                        <div className="w-full p-4 bg-slate-950/40 border border-white/[0.04] rounded-xl text-sm max-w-md space-y-2 text-left">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Processed Compounds:</span>
                            <span className="font-mono text-white font-bold">{results.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Resolution Rate:</span>
                            <span className="font-mono text-emerald-400 font-bold">
                              {((results.filter(r => r.status === 'Recovered').length / results.length) * 100 || 0).toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-4 w-full justify-center">
                          <button
                            onClick={() => handleDownloadFile('csv')}
                            className="px-5 py-3 rounded-xl border border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                          >
                            <Download className="w-4 h-4" />
                            Download Enriched CSV
                          </button>
                          <button
                            onClick={() => handleDownloadFile('xlsx')}
                            className="px-5 py-3 rounded-xl border border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                          >
                            <Download className="w-4 h-4" />
                            Download Enriched Excel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-5">
                        <Activity className="w-12 h-12 text-cyan-400 animate-pulse mb-1" />
                        <div>
                          <h3 className="text-lg font-bold text-white">Resolving Compounds...</h3>
                          <p className="text-xs text-slate-500 mt-1">Cross-referencing registries sequentially</p>
                        </div>

                        <div className="w-full max-w-md">
                          <div className="flex justify-between text-xs font-mono text-slate-400 mb-1.5">
                            <span>Progress Status</span>
                            <span>{jobStatus?.progress || 0}%</span>
                          </div>
                          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-white/[0.04]">
                            <div 
                              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2.5 rounded-full transition-all duration-300"
                              style={{ width: `${jobStatus?.progress || 0}%` }}
                            ></div>
                          </div>
                        </div>

                        {jobStatus?.metrics && (
                          <div className="flex justify-center gap-6 text-xs font-mono text-slate-400 pt-2 border-t border-white/[0.04] w-full max-w-sm">
                            <div>
                              <span className="text-slate-500 block">Current Speed</span>
                              <strong className="text-cyan-400">{jobStatus.metrics.current_speed_cps || 0} cmpd/s</strong>
                            </div>
                            <div className="w-px h-6 bg-white/[0.06]" />
                            <div>
                              <span className="text-slate-500 block">Remaining ETA</span>
                              <strong className="text-white">{jobStatus.metrics.estimated_time_remaining_sec || 0}s</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Results preview table */}
                  {results.length > 0 && (
                    <div className="glass-panel border border-white/[0.06] rounded-2xl overflow-hidden bg-slate-900/20">
                      <div className="p-4 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white/[0.02]">
                        <h3 className="text-sm font-bold text-slate-300">Resolution Journal Log</h3>
                        <div className="relative max-w-xs w-full">
                          <input
                            type="text"
                            placeholder="Search resolved chemicals..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                          />
                          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-950/60 text-slate-400 border-b border-white/[0.06] font-semibold">
                              <th className="p-3">Compound Identifier</th>
                              <th className="p-3">Resolved SMILES Coordinate</th>
                              <th className="p-3">Method Source</th>
                              <th className="p-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04] font-mono">
                            {paginatedResults.map((r, i) => (
                              <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                                <td className="p-3 font-sans text-slate-200">{r.compound}</td>
                                <td className="p-3 text-slate-400 truncate max-w-xs" title={r.smiles}>{r.smiles}</td>
                                <td className="p-3 text-slate-500">{r.source}</td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    r.status === 'Recovered' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                  }`}>
                                    {r.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {totalPages > 1 && (
                        <div className="p-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-500 bg-slate-950/40">
                          <span>Showing Page {currentPage} of {totalPages}</span>
                          <div className="flex gap-2">
                            <button
                              disabled={currentPage === 1}
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                            >
                              Previous
                            </button>
                            <button
                              disabled={currentPage === totalPages}
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </StudioShell>
  );
};

const EmptyState: React.FC<{
  handleUpload: (file: File) => Promise<void>;
  handleLoadDemo: () => Promise<void>;
  isUploading: boolean;
}> = ({ handleUpload, handleLoadDemo, isUploading }) => {
  const [dragging, setDragging] = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  return (
    <div className="max-w-4xl mx-auto py-12 flex flex-col items-center w-full">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-black text-white tracking-tight mb-3">Upload Dataset</h1>
        <p className="text-slate-400 text-sm max-w-lg mx-auto">
          Ingest your CSV or Excel dataset to resolve and enrich molecular structures offline.
        </p>
      </div>

      <div className="w-full max-w-2xl space-y-6">
        <label
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative flex flex-col items-center justify-center w-full h-80 rounded-[2rem] border-2 border-dashed cursor-pointer transition-all duration-300 group overflow-hidden
            ${dragging
              ? 'border-cyan-400 bg-cyan-400/[0.03] shadow-[0_0_30px_rgba(34,211,238,0.15)]'
              : 'border-white/[0.08] glass hover:border-white/[0.2] hover:bg-white/[0.02]'}`}
        >
          <input type="file" className="hidden" accept=".csv,.parquet,.xlsx,.xls,.zip" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/[0.02] pointer-events-none" />
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-transform duration-500
            ${dragging ? 'bg-cyan-400 text-void scale-110' : 'bg-white/[0.04] text-slate-400 group-hover:bg-white/[0.08] group-hover:text-white'}`}>
            {isUploading ? <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" /> : <UploadCloud className="w-8 h-8" />}
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {isUploading ? 'Ingesting…' : dragging ? 'Drop file to upload' : 'Drag & drop or click to browse'}
          </h3>
          <div className="flex items-center gap-2 mt-4">
            {['.CSV', '.XLSX', '.PARQUET', '.ZIP'].map(ext => (
              <span key={ext} className="px-2 py-1 rounded-md bg-white/[0.04] text-[10px] font-mono text-slate-500 uppercase tracking-wider">{ext}</span>
            ))}
          </div>
        </label>

        <div className="flex justify-center mt-4">
          <button
            onClick={handleLoadDemo}
            disabled={isUploading}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-400 hover:text-cyan-300 font-semibold text-sm transition-all duration-200 shadow-lg hover:shadow-cyan-500/5 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            <span>Load Enrichment Demo Dataset</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const StructureEnrichmentStudio: React.FC<{ onGoHub: () => void }> = (props) => {
  const handleResetStep = (stepId: string) => {
    toast.success(`Cleared enrichment inputs for ${stepId}`);
  };

  const handleResetWorkspaceWrapper = async () => {
    const store = useWorkspaceStore.getState();
    const clientId = store.workspaceId || 'ENRICH_temp';
    try {
      await fetch(`${API_BASE_URL}/api/workspace/${clientId}/reset`, { method: 'POST' });
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
      studioId="enrichment"
      onReset={handleResetWorkspaceWrapper}
      onResetStep={handleResetStep}
    >
      <StructureEnrichmentStudioInner {...props} />
    </StudioNavigationProvider>
  );
};
