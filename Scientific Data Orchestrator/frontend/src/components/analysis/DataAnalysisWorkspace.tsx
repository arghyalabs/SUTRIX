import React from 'react';
import { motion } from 'framer-motion';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { Activity, ChevronRight, AlertCircle } from 'lucide-react';
import { SimpleAnalysisWorkspace } from './SimpleAnalysisWorkspace';

export const DataAnalysisWorkspace: React.FC = () => {
  const {
    activeLineage,
    activeSegregationResult,
  } = useWorkspaceStore();

  const lineage = activeLineage || (activeSegregationResult?.graph ? {
    nodes: activeSegregationResult.graph.nodes || [],
    edges: activeSegregationResult.graph.edges || [],
    root_id: activeSegregationResult.graph.root_id || 'root',
    total_nodes: activeSegregationResult.graph.nodes?.length || 0,
    max_depth: activeSegregationResult.graph.max_depth || 1,
  } : null);

  if (!lineage || !lineage.nodes?.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center h-full text-center px-6 py-20"
      >
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-3xl bg-cyan-500/5 border border-cyan-500/10 flex items-center justify-center mx-auto">
            <Activity className="w-12 h-12 text-cyan-500/30" />
          </div>
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          </div>
        </div>
        <h3 className="text-white font-bold text-xl mb-3">No Hierarchy Available</h3>
        <p className="text-white/40 text-sm max-w-sm">
          Complete the Hierarchy Builder step to generate a DAG. The analysis workspace will auto-populate once the graph computation finishes.
        </p>
        <button
          onClick={() => useWorkspaceStore.getState().setActiveTab('hierarchy')}
          className="mt-8 flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-bold text-sm shadow-[0_4px_14px_rgba(255,255,255,0.15)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.25)] transition-all hover:-translate-y-0.5 active:translate-y-0"
        >
          Go to Hierarchy Builder <ChevronRight className="w-4 h-4" />
        </button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SimpleAnalysisWorkspace />
    </div>
  );
};
