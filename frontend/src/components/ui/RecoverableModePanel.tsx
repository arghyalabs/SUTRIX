import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Zap, ArrowRight, FileText } from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

interface RecoverableModePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onStartRecovery: () => void;
  onContinueGeneric: () => void;
}

export const RecoverableModePanel: React.FC<RecoverableModePanelProps> = ({
  isOpen,
  onClose,
  onStartRecovery,
  onContinueGeneric
}) => {
  const { rowCount } = useWorkspaceStore();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="relative w-full max-w-2xl overflow-hidden border rounded-3xl bg-slate-900/90 border-slate-800 shadow-2xl shadow-rose-500/5 max-h-[90vh] flex flex-col"
        >
          {/* Header Accent Line */}
          <div className="absolute top-0 left-0 w-full h-[6px] bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />
          
          <div className="p-8 overflow-y-auto">
            
            {/* Modal Heading */}
            <div className="text-center mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-400 mb-3 animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" />
                Missing Molecular Structures
              </span>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                Recoverable Dataset Identified
              </h2>
              <p className="mt-2 text-sm text-slate-400 max-w-lg mx-auto">
                SUTRIX has detected chemical identifiers (such as Chemical Names or CAS Numbers) but is missing canonical SMILES coordinates. 
                Molecular descriptor calculations and 3D modeling are currently restricted.
              </p>
            </div>

            {/* Quick Details Box */}
            <div className="p-5 border rounded-2xl bg-slate-950/60 border-slate-800/80 mb-8 space-y-3">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider">Dataset Volume</span>
                <span className="font-mono text-white">{(rowCount || 0).toLocaleString()} Rows</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider">Identified Identifiers</span>
                <span className="font-mono text-cyan-400">Chemical Names, CAS Registry Numbers</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider">SMILES Coverage</span>
                <span className="font-mono text-rose-400">0% (Incomplete Structure Mapping)</span>
              </div>
            </div>

            {/* Two Choices Buttons Grid */}
            <div className="grid md:grid-cols-2 gap-4">
              
              {/* Option 1: Start Structure Recovery V2 */}
              <motion.div
                whileHover={{ y: -4, borderColor: 'rgba(6,182,212,0.3)' }}
                className="flex flex-col p-5 border rounded-2xl bg-slate-900/60 border-slate-800/80 cursor-pointer group"
                onClick={onStartRecovery}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:scale-105 transition-transform">
                    <Zap className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">
                    1. Recover Structures
                  </h3>
                </div>
                <p className="text-xs text-slate-400 leading-normal mb-5 flex-1">
                  Query PubChem, ChEMBL, and CompTox databases dynamically to fetch and resolve 2D/3D chemical structures. Enables advanced cheminformatics descriptors.
                </p>
                <button className="flex items-center justify-between w-full px-3.5 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-semibold text-xs transition-all group-hover:bg-cyan-400 group-hover:text-slate-950">
                  Launch PubChem Recovery V2
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </motion.div>

              {/* Option 2: Proceed in Generic Mode */}
              <motion.div
                whileHover={{ y: -4, borderColor: 'rgba(245,158,11,0.3)' }}
                className="flex flex-col p-5 border rounded-2xl bg-slate-900/60 border-slate-800/80 cursor-pointer group"
                onClick={onContinueGeneric}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 group-hover:scale-105 transition-transform">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                    2. Continue Generic Mode
                  </h3>
                </div>
                <p className="text-xs text-slate-400 leading-normal mb-5 flex-1">
                  Bypass structure resolution and execute all operations in Generic analysis mode. Standard filtering, log-variance pruning, and statistical analysis are preserved.
                </p>
                <button className="flex items-center justify-between w-full px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold text-xs transition-all group-hover:bg-amber-500 group-hover:text-slate-950">
                  Proceed to Tabular Analysis
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </motion.div>

            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
export default RecoverableModePanel;
