import React from 'react';
import { motion } from 'framer-motion';
import { Beaker, ArrowRight, X } from 'lucide-react';

interface StructureRecoveryBannerProps {
  onStartRecovery: () => void;
  onDismiss: () => void;
}

export const StructureRecoveryBanner: React.FC<StructureRecoveryBannerProps> = ({
  onStartRecovery,
  onDismiss,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="relative w-full p-5 border rounded-2xl bg-cyan-500/[0.04] border-cyan-500/20 text-cyan-300 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl"
    >
      <button 
        onClick={onDismiss}
        className="absolute top-3 right-3 text-cyan-400 hover:text-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0">
          <Beaker className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h4 className="font-bold text-white text-sm mb-1 flex items-center gap-2">
            No Molecular Structures Detected
          </h4>
          <p className="text-xs text-slate-400 max-w-xl">
            SUTRIX is currently in Scientific mode. Descriptor generation, QSAR modeling, and chemical structural analysis require compound coordinates (SMILES/InChI).
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 w-full md:w-auto justify-end shrink-0">
        <button
          onClick={onStartRecovery}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-400 text-slate-950 font-bold hover:bg-cyan-300 text-xs transition-colors shadow-lg shadow-cyan-500/10"
        >
          Recover Structures
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
};
