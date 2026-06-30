import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Play, AlertCircle, CheckCircle, RefreshCw, FileText, Database, ShieldCheck, Zap } from 'lucide-react';

interface SimulationStep {
  id: string;
  label: string;
  desc: string;
  status: 'idle' | 'running' | 'completed';
  logs: string[];
}

const INITIAL_STEPS = (): SimulationStep[] => [
  { id: 'hier', label: 'Hierarchy Creation', desc: 'Grouping variables & taxons', status: 'idle', logs: [] },
  { id: 'assess', label: 'Structure Assessment', desc: 'SMILES structural integrity checks', status: 'idle', logs: [] },
  { id: 'desc', label: 'Descriptor Generation', desc: 'RDKit & Mordred calculation', status: 'idle', logs: [] },
  { id: 'ready', label: 'AI Readiness', desc: 'OECD principles audit checks', status: 'idle', logs: [] },
];

const HIER_LOGS = [
  'Reading data matrix columns...',
  'Detected endpoint variable: LC50',
  'Detected species column: "Danio rerio", "Daphnia magna"',
  'Generated 3 taxonomic subgroups (Fish_96h, Daphnia_48h)',
];

const ASSESS_LOGS = [
  'Extracting SMILES strings...',
  'Checking molecular connectivity...',
  'Recovered 3 structures via PubChem synonyms resolver',
  'Validation score: 98.4% structures verified',
];

const DESC_LOGS = [
  'Initializing RDKit chemical descriptors engine...',
  'Calculating Constitutional, Topological & Molecular Weight',
  'Executing Mordred 3D descriptor vectors...',
  'Added 1,240 active features per compound',
];

const READY_LOGS = [
  'Checking missingness thresholds (< 5%)...',
  'Evaluating class distributions...',
  'Defining applicability domain (standard deviation limits)...',
  'OECD Principle compliance status: PASSED (92.5%)',
];

export const WorkflowSimulator: React.FC = () => {
  const [fileUploaded, setFileUploaded] = useState(false);
  const [fileName, setFileName] = useState('');
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<SimulationStep[]>(INITIAL_STEPS());
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);

  const triggerUpload = (name: string) => {
    setFileName(name);
    setFileUploaded(true);
    setSteps(INITIAL_STEPS());
    setLogs([]);
    setCompleted(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      triggerUpload(e.dataTransfer.files[0].name);
    }
  };

  const handleSelectDemo = () => {
    triggerUpload('fish_acute_ecotox_demo.csv');
  };

  const runSimulation = async () => {
    if (!fileUploaded || running) return;
    setRunning(true);
    setCompleted(false);
    setCurrentStepIdx(0);
    setSteps(INITIAL_STEPS().map((s, i) => i === 0 ? { ...s, status: 'running' } : s));

    const stepLogs = [HIER_LOGS, ASSESS_LOGS, DESC_LOGS, READY_LOGS];

    for (let i = 0; i < INITIAL_STEPS().length; i++) {
      setCurrentStepIdx(i);
      setSteps(prev => prev.map((s, idx) => {
        if (idx === i) return { ...s, status: 'running' };
        if (idx < i) return { ...s, status: 'completed' };
        return s;
      }));

      // Stream logs
      const currLogs = stepLogs[i];
      for (const logLine of currLogs) {
        await new Promise(r => setTimeout(r, 600));
        setLogs(prev => [...prev, `[${INITIAL_STEPS()[i].label}] ${logLine}`]);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    setSteps(prev => prev.map(s => ({ ...s, status: 'completed' })));
    setRunning(false);
    setCompleted(true);
  };

  return (
    <section className="py-24 px-6 bg-[#020610] border-b border-white/[0.04]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 text-xs font-semibold text-emerald-400 mb-5">
            <Zap className="w-3.5 h-3.5 animate-pulse" />
            Interactive Workflow Simulator
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Test the Pipeline Instantly
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            Upload a tiny dataset or select a preset to watch SUTRIX run its full data curation steps before setting up a workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left panel: Upload Area or Simulation controller */}
          <div className="lg:col-span-5 space-y-6">
            {!fileUploaded ? (
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-white/10 hover:border-cyan-500/30 rounded-3xl p-8 text-center bg-white/[0.01] hover:bg-cyan-500/[0.02] transition-all cursor-pointer flex flex-col items-center justify-center h-80"
                onClick={handleSelectDemo}
              >
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4 text-cyan-400">
                  <Upload className="w-7 h-7" />
                </div>
                <h4 className="font-bold text-white text-base mb-2">Drag and drop file here</h4>
                <p className="text-xs text-white/40 max-w-xs mb-4">
                  Accepts CSV, XLSX or Parquet dataset formats (Max 5MB).
                </p>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleSelectDemo();
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/20 text-cyan-400 font-bold text-xs hover:bg-cyan-500/25 transition-all"
                >
                  Load Preset Ecotoxicology Demo
                </button>
              </div>
            ) : (
              <div className="glass-elevated border border-white/[0.06] rounded-3xl p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-wider text-white/30">Target File</div>
                    <div className="text-sm font-bold text-white truncate">{fileName}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {steps.map((step, idx) => (
                    <div key={step.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] relative">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        step.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : step.status === 'running'
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse'
                            : 'bg-white/5 text-white/30 border border-white/10'
                      }`}>
                        {step.status === 'completed' ? '✓' : idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white leading-none">{step.label}</div>
                        <div className="text-[10px] text-white/40 truncate mt-0.5">{step.desc}</div>
                      </div>
                      {step.status === 'running' && (
                        <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={runSimulation}
                    disabled={running}
                    className="flex-1 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {running ? 'Running Simulation...' : 'Run SUTRIX Pipeline'}
                  </button>
                  <button
                    onClick={() => setFileUploaded(false)}
                    disabled={running}
                    className="p-3 rounded-xl border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition-all"
                    title="Upload another file"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right panel: Simulation Outputs / Console Logs */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl bg-slate-950 border border-white/[0.06] overflow-hidden flex flex-col h-80 lg:h-[340px]">
              {/* Header */}
              <div className="px-5 py-3 border-b border-white/[0.06] bg-slate-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-[10px] font-mono text-white/30 ml-2">sutrix_orchestration_run.log</span>
                </div>
                {completed && (
                  <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Run Success
                  </span>
                )}
              </div>

              {/* Console log list */}
              <div className="p-5 flex-1 overflow-y-auto font-mono text-xs text-cyan-300 space-y-2 select-text custom-scrollbar">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-white/20 text-center gap-2">
                    <Database className="w-8 h-8" />
                    <span>Upload a dataset to stream pipeline outputs.</span>
                  </div>
                ) : (
                  <>
                    {logs.map((log, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={log.includes('PASSED') || log.includes('PASSED') ? 'text-emerald-400 font-bold' : log.includes('Detected') ? 'text-violet-300' : 'text-cyan-300'}
                      >
                        $ {log}
                      </motion.div>
                    ))}
                    {completed && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="pt-4 mt-4 border-t border-white/[0.06] grid grid-cols-2 gap-4 text-left"
                      >
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-white/30 font-bold">Subgroups Generated</div>
                          <div className="text-sm font-bold text-white">3 Taxons (Acute Fish)</div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-white/30 font-bold">Structures Cleaned</div>
                          <div className="text-sm font-bold text-white">96/96 SMILES recovery</div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-white/30 font-bold">Generated Descriptors</div>
                          <div className="text-sm font-bold text-white">1,240 RDKit/Mordred</div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-white/30 font-bold">OECD compliance</div>
                          <div className="text-sm font-bold text-emerald-400 flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Passed
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
