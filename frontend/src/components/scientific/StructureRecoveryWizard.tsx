import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Beaker, Cpu, Zap, CheckCircle, AlertTriangle, Play, Check, ChevronRight, X, Loader2
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { mappingApi } from '../../services/mappingApi';
import { toast } from 'react-hot-toast';

interface StructureRecoveryWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StructureRecoveryWizard: React.FC<StructureRecoveryWizardProps> = ({
  isOpen,
  onClose,
}) => {
  const { 
    columns, workspaceId, setDatasetMode, setDatasetClassification, 
    setDatasetPassport, setDetectedDomain, setPrimaryEntityType, setActiveTab 
  } = useWorkspaceStore();

  const clientId = workspaceId;

  const [step, setStep] = useState(1);
  const [columnToResolve, setColumnToResolve] = useState('');
  const [sources, setSources] = useState({ pubchem: true, comptox: true, chebi: true });
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [recoveredCount, setRecoveredCount] = useState(0);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [coveragePct, setCoveragePct] = useState(0);
  const [smilesMap, setSmilesMap] = useState<Record<string, string>>({});

  const logsEndRef = useRef<HTMLDivElement>(null);
  const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

  // Suggest best source columns automatically on load
  useEffect(() => {
    if (columns.length > 0) {
      const suggested = columns.find(c => {
        const lower = c.toLowerCase();
        return lower.includes('chemical') || lower.includes('compound') || lower.includes('name') || lower.includes('cas') || lower.includes('substance');
      });
      setColumnToResolve(suggested || columns[0]);
    }
  }, [columns]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!isOpen) return null;

  const startRecoveryJob = async () => {
    if (!columnToResolve) {
      toast.error('Please select a source column first.');
      return;
    }
    
    setStatus('running');
    setProgress(0);
    setLogs([`⏳ Queueing structure recovery job for column: '${columnToResolve}'...`]);
    setStep(3);

    try {
      const response = await fetch(`${apiBase}/api/structure-recovery/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          column_to_resolve: columnToResolve
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      if (data.job_id) {
        setJobId(data.job_id);
        pollJobStatus(data.job_id);
      } else {
        throw new Error('Failed to obtain background job ID.');
      }
    } catch (err: any) {
      setStatus('failed');
      setLogs(prev => [...prev, `❌ Error: ${err.message || 'Resolution failed to start.'}`]);
      toast.error('Recovery failed to start.');
    }
  };

  const pollJobStatus = async (id: string) => {
    let complete = false;
    
    const interval = setInterval(async () => {
      if (complete) {
        clearInterval(interval);
        return;
      }

      try {
        const res = await fetch(`${apiBase}/api/structure-recovery/${clientId}/status`);
        if (!res.ok) return;

        const job = await res.json();
        
        if (job.status === 'RUNNING' || job.status === 'QUEUED') {
          setProgress(job.progress || 0);
          setSpeed(job.compounds_per_sec || 0);
          setEta(job.eta_seconds || 0);
          if (job.error_message) {
            setLogs(prev => [...prev, `⚠️ ${job.error_message}`]);
          } else {
            setLogs(prev => {
              const newLog = `⚡ Processing batch. Progress: ${job.progress}%. Speed: ${job.compounds_per_sec} cmp/sec.`;
              return prev[prev.length - 1] === newLog ? prev : [...prev, newLog];
            });
          }
        } else if (job.status === 'COMPLETED') {
          complete = true;
          clearInterval(interval);
          setProgress(100);
          setStatus('completed');
          fetchResults();
        } else if (job.status === 'FAILED') {
          complete = true;
          clearInterval(interval);
          setStatus('failed');
          setLogs(prev => [...prev, `❌ Task failed: ${job.error_message || 'Internal error'}`]);
        }
      } catch (err) {
        // ignore polling errs, retry
      }
    }, 1000);
  };

  const fetchResults = async () => {
    try {
      const res = await fetch(`${apiBase}/api/structure-recovery/${clientId}/result`);
      if (!res.ok) throw new Error('Failed to fetch results file.');
      
      const data = await res.json();
      setSmilesMap(data.smiles_map || {});
      
      const recovered = Object.keys(data.smiles_map || {}).length;
      const unresolved = (data.unresolved || []).length;
      const total = recovered + unresolved;
      const coverage = total > 0 ? (recovered / total) * 100 : 0;

      setRecoveredCount(recovered);
      setUnresolvedCount(unresolved);
      setCoveragePct(coverage);
      setLogs(prev => [
        ...prev, 
        `✅ Finished structure recovery!`,
        `🔑 Resolved: ${recovered} compounds.`,
        `❌ Unresolved: ${unresolved} compounds.`,
        `📈 Structural coverage: ${coverage.toFixed(1)}%.`
      ]);
      setStep(4);
    } catch (err: any) {
      setLogs(prev => [...prev, `❌ Result parsing error: ${err.message}`]);
    }
  };

  const handleTransition = async () => {
    const loader = toast.loading('Promoting workspace and re-evaluating metadata...');
    try {
      // Re-trigger save mappings so backend re-evaluates SMILES caches and promotes to MOLECULAR
      const storeState = useWorkspaceStore.getState();
      const mapRes = await mappingApi.saveMappings(storeState.mappings, clientId);
      if (mapRes.dataset_mode) {
        setDatasetMode(mapRes.dataset_mode);
        setDatasetClassification(mapRes.dataset_classification);
        setDatasetPassport(mapRes.dataset_passport);
        setDetectedDomain(mapRes.dataset_passport?.detected_domain || 'General Scientific');
        setPrimaryEntityType(mapRes.dataset_passport?.primary_entity_type || 'Compound');
      }
      setActiveTab('hierarchy');
      toast.success('Successfully promoted workspace to Molecular mode!', { id: loader });
      onClose();
    } catch {
      // Fallback
      setDatasetMode('MOLECULAR');
      setActiveTab('hierarchy');
      toast.success('Workspace forced to Molecular environment.', { id: loader });
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl overflow-hidden border rounded-3xl bg-slate-900/95 border-slate-800 shadow-2xl flex flex-col max-h-[85vh]"
        >
          {/* Top Bar Indicator */}
          <div className="absolute top-0 left-0 w-full h-[6px] bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500" />
          
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                <Beaker className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white leading-none">Structure Recovery Wizard</h3>
                <p className="text-xs text-slate-400 mt-1">Convert descriptive variables to chemical coordinate SMILES</p>
              </div>
            </div>
            {status !== 'running' && (
              <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Body Container */}
          <div className="flex-1 flex overflow-hidden">
            
            {/* Left Sidebar Steps Map */}
            <div className="w-64 border-r border-slate-800/80 bg-slate-950/20 p-6 space-y-4 hidden md:block shrink-0">
              {[
                { s: 1, name: 'Source Column' },
                { s: 2, name: 'Databases & Tuning' },
                { s: 3, name: 'Asynchronous Query' },
                { s: 4, name: 'Review Outcomes' },
                { s: 5, name: 'Environment Promotion' },
              ].map(stepItem => (
                <div key={stepItem.s} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono border transition-all ${
                    step === stepItem.s 
                      ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-md shadow-cyan-500/5' 
                      : step > stepItem.s
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'border-slate-800 text-slate-500'
                  }`}>
                    {step > stepItem.s ? <Check className="w-4 h-4" /> : stepItem.s}
                  </div>
                  <span className={`text-xs font-semibold ${step === stepItem.s ? 'text-white' : 'text-slate-500'}`}>
                    {stepItem.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Steps Content Panel */}
            <div className="flex-1 p-8 overflow-y-auto flex flex-col justify-between">
              
              {/* Step 1: Select Column */}
              {step === 1 && (
                <div className="space-y-6">
                  <h4 className="text-xl font-bold text-white">Identify the Compound Name Column</h4>
                  <p className="text-xs text-slate-400">
                    SUTRIX will isolate the unique tokens from this column and submit them in chunks to online catalogs (PubChem, EPA CompTox, and ChEBI) to fetch valid SMILES.
                  </p>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Select Column</label>
                    <select
                      value={columnToResolve}
                      onChange={(e) => setColumnToResolve(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                    >
                      {columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-400">
                      Ideal columns contain IUPAC names, common names (e.g. "Aspirin", "Benzene"), or CAS numbers (e.g. "50-78-2"). Ensure there are no spaces or trailing formatting issues.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 2: Choose Sources */}
              {step === 2 && (
                <div className="space-y-6">
                  <h4 className="text-xl font-bold text-white">Select Online Chemical Registries</h4>
                  <p className="text-xs text-slate-400">
                    Choose which data repositories SUTRIX should query sequentially. Rate limit guards are applied automatically.
                  </p>

                  <div className="space-y-3">
                    {/* PubChem */}
                    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                      <div className="flex items-center gap-3">
                        <Cpu className="w-5 h-5 text-cyan-400" />
                        <div>
                          <span className="text-xs font-bold text-white block">PubChem API Gateway</span>
                          <span className="text-[10px] text-slate-500">Fastest name-to-SMILES coordinates lookups</span>
                        </div>
                      </div>
                      <input 
                        type="checkbox" checked={sources.pubchem} 
                        onChange={() => setSources(prev => ({ ...prev, pubchem: !prev.pubchem }))}
                        className="w-4 h-4 accent-cyan-500"
                      />
                    </div>

                    {/* CompTox */}
                    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                      <div className="flex items-center gap-3">
                        <Beaker className="w-5 h-5 text-emerald-400" />
                        <div>
                          <span className="text-xs font-bold text-white block">EPA CompTox Dashboard</span>
                          <span className="text-[10px] text-slate-500">Fallback for agricultural chemicals and ecological substances</span>
                        </div>
                      </div>
                      <input 
                        type="checkbox" checked={sources.comptox} 
                        onChange={() => setSources(prev => ({ ...prev, comptox: !prev.comptox }))}
                        className="w-4 h-4 accent-cyan-500"
                      />
                    </div>

                    {/* ChEBI */}
                    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                      <div className="flex items-center gap-3">
                        <Zap className="w-5 h-5 text-violet-400" />
                        <div>
                          <span className="text-xs font-bold text-white block">ChEBI Database</span>
                          <span className="text-[10px] text-slate-500">Optimal resolving for complex biomolecules</span>
                        </div>
                      </div>
                      <input 
                        type="checkbox" checked={sources.chebi} 
                        onChange={() => setSources(prev => ({ ...prev, chebi: !prev.chebi }))}
                        className="w-4 h-4 accent-cyan-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Run Recovery */}
              {step === 3 && (
                <div className="space-y-6">
                  <h4 className="text-xl font-bold text-white">Querying Online Registries</h4>
                  <p className="text-xs text-slate-400">
                    Establishing background asynchronous task. Processing in chunks of 50 compounds per batch...
                  </p>

                  {/* Progress Indicators */}
                  <div className="space-y-3 p-5 border rounded-2xl bg-slate-950/60 border-slate-800">
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400">
                      <span>STATUS: {status.toUpperCase()}</span>
                      <span className="text-cyan-400">{progress}%</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden relative border border-slate-700">
                      <motion.div
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5 }}
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                      />
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-400 font-semibold">
                      <span>Speed: {speed} cmp/s</span>
                      <span>ETA: {eta}s remaining</span>
                    </div>
                  </div>

                  {/* Logs Container */}
                  <div className="h-44 overflow-y-auto bg-slate-950 border border-slate-800 p-4 rounded-xl font-mono text-[10px] text-slate-400 space-y-1 bg-gradient-to-b from-slate-950 to-slate-950/80 shadow-inner">
                    {logs.map((log, idx) => (
                      <div key={idx} className="flex gap-2">
                        <span className="text-cyan-500 select-none">&gt;</span>
                        <span>{log}</span>
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              )}

              {/* Step 4: Review Results */}
              {step === 4 && (
                <div className="space-y-5">
                  <h4 className="text-xl font-bold text-white">Structure Discovery Results</h4>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 border rounded-xl bg-emerald-500/[0.02] border-emerald-500/20 text-center">
                      <span className="text-lg font-extrabold text-emerald-400 block">{recoveredCount}</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">RESOLVED</span>
                    </div>
                    <div className="p-4 border rounded-xl bg-slate-950 border-slate-800 text-center">
                      <span className="text-lg font-extrabold text-slate-300 block">{unresolvedCount}</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">UNRESOLVED</span>
                    </div>
                    <div className="p-4 border rounded-xl bg-cyan-500/[0.02] border-cyan-500/20 text-center">
                      <span className="text-lg font-extrabold text-cyan-400 block">{coveragePct.toFixed(1)}%</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">COVERAGE</span>
                    </div>
                  </div>

                  {/* Results Map Table */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 max-h-40 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-[10px] font-bold text-slate-500 uppercase">
                          <th className="px-4 py-2">Compound Token</th>
                          <th className="px-4 py-2">Resolved SMILES Coordinates</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs font-mono text-slate-400 divide-y divide-slate-900">
                        {Object.entries(smilesMap).slice(0, 10).map(([k, v]) => (
                          <tr key={k}>
                            <td className="px-4 py-2 text-white font-sans font-bold">{k}</td>
                            <td className="px-4 py-2 text-cyan-400 truncate max-w-xs">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Success Promo Banner */}
                  {coveragePct > 50 && (
                    <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                      <p className="text-xs text-slate-400">
                        <strong className="text-emerald-400 block">Molecular workspace requirement satisfied!</strong>
                        More than 50% structural coverage has been recovered. You can now unlock RDKit molecular descriptor extraction and QSAR pipelines.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Actions Footer */}
              <div className="flex justify-between items-center border-t border-slate-800/80 pt-6 mt-8">
                <div>
                  {step > 1 && step < 3 && (
                    <button
                      onClick={() => setStep(prev => prev - 1)}
                      className="px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold transition-colors"
                    >
                      Back
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  {step === 1 && (
                    <button
                      onClick={() => setStep(2)}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 text-xs transition-colors"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}

                  {step === 2 && (
                    <button
                      onClick={startRecoveryJob}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 text-xs transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Submit Query
                    </button>
                  )}

                  {step === 3 && status === 'running' && (
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 px-4 py-2 border rounded-xl bg-slate-900 border-slate-800">
                      <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                      Running Asynchronous Worker...
                    </div>
                  )}

                  {step === 3 && status === 'completed' && (
                    <button
                      onClick={() => setStep(4)}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 text-xs transition-colors"
                    >
                      Review Outcomes
                    </button>
                  )}

                  {step === 4 && (
                    <div className="flex gap-2">
                      {coveragePct > 50 ? (
                        <button
                          onClick={handleTransition}
                          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 text-xs transition-colors shadow-lg shadow-emerald-500/10 animate-bounce"
                        >
                          Transition to Molecular Mode
                        </button>
                      ) : (
                        <button
                          onClick={onClose}
                          className="px-5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold hover:bg-slate-700 text-xs transition-colors"
                        >
                          Continue in Scientific Mode
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
