import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export const GenericModeBanner: React.FC = () => {
  const { genericMode, genericModeReason, genericBannerDismissed, setGenericBannerDismissed } = useWorkspaceStore();

  if (!genericMode || genericBannerDismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mb-6 p-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.02] backdrop-blur-md shadow-[0_4px_25px_rgba(245,158,11,0.03)] flex items-start gap-4 relative overflow-hidden"
      >
        {/* Decorative subtle amber radial glow */}
        <div className="absolute -left-12 -top-12 w-28 h-28 bg-amber-500/[0.08] rounded-full blur-2xl pointer-events-none" />
        
        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 shrink-0 mt-0.5 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.05)]">
          <AlertTriangle className="w-5 h-5 animate-pulse" />
        </div>
        
        <div className="flex-1 space-y-1.5 pr-8">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest leading-none">
              Generic Mode Active
            </h4>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[8px] font-extrabold tracking-normal uppercase text-amber-400">
              No chemical coordinates
            </span>
          </div>
          <p className="text-[11px] text-secondary leading-relaxed max-w-3xl font-medium">
            {genericModeReason || "This dataset is operating in Generic mode because no chemical coordinates (SMILES/InChI) or structure mappings are available. Molecular enrichment and 3D exploration are disabled, but hierarchical walker, variance pruning, and tabular analysis are fully functional."}
          </p>
        </div>

        <button 
          onClick={() => setGenericBannerDismissed(true)} 
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.08] border border-white/[0.06] text-muted hover:text-white transition-all outline-none"
          title="Dismiss Banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};
export default GenericModeBanner;
