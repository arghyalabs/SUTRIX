import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Beaker, Cpu, Zap, CheckCircle, AlertTriangle, Check, ChevronRight, X, Loader2
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { mappingApi } from '../../services/mappingApi';
import { toast } from 'react-hot-toast';
import { StructureRecoveryV2 } from './StructureRecoveryV2';

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
  const [recoveredCount, setRecoveredCount] = useState(0);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [coveragePct, setCoveragePct] = useState(0);
  const [smilesMap, setSmilesMap] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<string[]>([]);

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

  if (!isOpen) return null;

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
      setLogs([
        `✅ Finished structure recovery!`,
        `🔑 Resolved: ${recovered} compounds.`,
        `❌ Unresolved: ${unresolved} compounds.`,
        `📈 Structural coverage: ${coverage.toFixed(1)}%.`
      ]);
      setStep(4);
    } catch (err: any) {
      toast.error(`Result parsing error: ${err.message}`);
    }
  };

  const handleTransition = async () => {
    const loader = toast.loading('Promoting workspace and re-evaluating metadata...');
    try {
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
          className="relative w-full max-w-4xl overflow-hidden border rounded-3xl bg-slate-900/95 border-slate-800 shadow-2xl flex flex-col max-h-[85vh] text-left"
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
                <h3 className="text-lg font-bold text-white leading-none">Structure Recovery Wizard V2</h3>
                <p className="text-xs text-slate-400 mt-1">Convert descriptive variables to chemical coordinate SMILES</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Container */}
          <div className="flex-1 flex overflow-hidden">
            
            {/* Left Sidebar Steps Map */}
            <div className="w-64 border-r border-slate-800/80 bg-slate-950/20 p-6 space-y-4 hidden md:block shrink-0">
              {[
                { s: 1, name: 'Source Column' },
                { s: 2, name: 'Tiered Recovery V2' },
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
                <div className="space-y-6 flex-1">
                  <h4 className="text-xl font-bold text-white">Identify the Compound Name Column</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
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

                  <div className="flex justify-end pt-6">
                    <button
                      onClick={() => setStep(2)}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 text-xs transition-colors"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Tiered Recovery V2 Dashboard */}
              {step === 2 && (
                <div className="flex-1">
                  <StructureRecoveryV2 
                    columnToResolve={columnToResolve}
                    onComplete={fetchResults}
                  />
                </div>
              )}

              {/* Step 4: Review Results */}
              {step === 4 && (
                <div className="space-y-5 flex-1">
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
                  {coveragePct > 50 ? (
                    <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                      <p className="text-xs text-slate-400">
                        <strong className="text-emerald-400 block">Molecular workspace requirement satisfied!</strong>
                        More than 50% structural coverage has been recovered. You can now unlock RDKit molecular descriptor extraction and QSAR pipelines.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.02] flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                      <p className="text-xs text-slate-400">
                        <strong className="text-amber-400 block">Low structural coverage resolved.</strong>
                        Less than 50% structural coverage was resolved. SUTRIX can continue operating in Scientific Dataset mode or promote to Molecular fallback environment.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-6">
                    {coveragePct > 50 ? (
                      <button
                        onClick={handleTransition}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 text-xs transition-colors shadow-lg shadow-emerald-500/10"
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
                </div>
              )}

            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
