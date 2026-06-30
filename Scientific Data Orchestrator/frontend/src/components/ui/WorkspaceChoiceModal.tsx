import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Beaker, Brain, Cpu, Zap, ArrowRight, ShieldAlert } from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { DatasetMode } from '../../types';

interface WorkspaceChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMode: (mode: DatasetMode) => void;
  onStartRecovery?: () => void;
}

export const WorkspaceChoiceModal: React.FC<WorkspaceChoiceModalProps> = ({
  isOpen,
  onClose,
  onSelectMode,
  onStartRecovery,
}) => {
  const { datasetClassification } = useWorkspaceStore();

  if (!isOpen || !datasetClassification) return null;

  const total = datasetClassification.total_rows;
  const structRows = datasetClassification.structure_rows;
  const missingRows = datasetClassification.missing_structure_rows;
  const pct = datasetClassification.structure_coverage_pct;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="relative w-full max-w-4xl overflow-hidden border rounded-3xl bg-slate-900/90 border-slate-800 shadow-2xl shadow-cyan-500/5 max-h-[90vh] flex flex-col"
        >
          {/* Header Graphic */}
          <div className="absolute top-0 left-0 w-full h-[6px] bg-gradient-to-r from-emerald-500 via-cyan-500 to-violet-500" />
          
          {/* Main Container */}
          <div className="p-8 overflow-y-auto">
            
            {/* Modal Heading */}
            <div className="text-center mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-semibold text-cyan-400 mb-3">
                <Brain className="w-3.5 h-3.5" />
                Hybrid Dataset Detected
              </span>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">
                Select Your Orchestration Environment
              </h2>
              <p className="mt-2 text-sm text-slate-400 max-w-xl mx-auto">
                SUTRIX has identified a mixture of chemical structures and general scientific data rows. 
                Select a workflow optimized for your research goals.
              </p>
            </div>

            {/* Coverage Bar Card */}
            <div className="p-5 border rounded-2xl bg-slate-950/60 border-slate-800/80 mb-6">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400 mb-2">
                <span>STRUCTURE PREVALENCE SCAN</span>
                <span className="text-cyan-400">{pct}% STRUCTURE COVERAGE</span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-850 overflow-hidden relative border border-slate-800">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                />
              </div>
              <div className="flex justify-between items-center mt-3 text-xs text-slate-400 font-medium">
                <span>{structRows.toLocaleString()} rows with chemical coordinates</span>
                <span>{missingRows.toLocaleString()} rows missing structures</span>
              </div>
            </div>

            {/* Cards Grid */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              
              {/* Molecular Mode Card */}
              <motion.div
                whileHover={{ y: -4, borderColor: 'rgba(52,211,153,0.3)' }}
                className="relative flex flex-col p-6 border rounded-2xl bg-slate-900/60 border-slate-800/80 cursor-pointer group"
                onClick={() => onSelectMode('MOLECULAR')}
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
                    <Beaker className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                      Molecular Workspace
                    </h3>
                    <p className="text-xs text-slate-400">Optimized for Cheminformatics & QSAR</p>
                  </div>
                </div>

                <ul className="space-y-2 mb-6 text-xs text-slate-400 flex-1">
                  <li className="flex items-center gap-2 text-slate-300 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    Filters out the {missingRows.toLocaleString()} non-structural rows
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                    Enables RDKit & Mordred descriptor enrichment
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                    Full QSAR readiness scoring & OECD validations
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                    Structure-based chemical diversity and correlation
                  </li>
                </ul>

                <button className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold text-xs group-hover:bg-emerald-500 group-hover:text-slate-950 transition-all">
                  Launch Molecular Workspace
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>

              {/* Scientific Mode Card */}
              <motion.div
                whileHover={{ y: -4, borderColor: 'rgba(167,139,250,0.3)' }}
                className="relative flex flex-col p-6 border rounded-2xl bg-slate-900/60 border-slate-800/80 cursor-pointer group"
                onClick={() => onSelectMode('SCIENTIFIC')}
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 group-hover:scale-110 transition-transform">
                    <Cpu className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-violet-400 transition-colors">
                      Scientific Workspace
                    </h3>
                    <p className="text-xs text-slate-400">Optimized for Holistic Data Science</p>
                  </div>
                </div>

                <ul className="space-y-2 mb-6 text-xs text-slate-400 flex-1">
                  <li className="flex items-center gap-2 text-slate-300 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                    Preserves all {total.toLocaleString()} rows of your dataset
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                    Bypasses molecular descriptor calculation steps
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                    Non-chemistry ML readiness scoring & leakage risk
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                    Force-directed variable relationship network graphs
                  </li>
                </ul>

                <button className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 font-semibold text-xs group-hover:bg-violet-500 group-hover:text-slate-950 transition-all">
                  Launch Scientific Workspace
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>

            </div>

            {/* Structure Recovery Wizard Banner */}
            {missingRows > 0 && onStartRecovery && (
              <div className="flex items-center justify-between p-4 border rounded-2xl bg-cyan-500/[0.04] border-cyan-500/20 text-xs text-cyan-300">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                    <Zap className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <span className="font-bold text-white block mb-0.5">Attempt Structure Recovery?</span>
                    SUTRIX can query PubChem, CompTox, and ChEBI to fetch SMILES for the {missingRows.toLocaleString()} missing rows automatically.
                  </div>
                </div>
                <button
                  onClick={onStartRecovery}
                  className="px-3 py-1.5 rounded-lg bg-cyan-400 text-slate-950 font-bold hover:bg-cyan-300 transition-colors"
                >
                  Start Wizard
                </button>
              </div>
            )}

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
