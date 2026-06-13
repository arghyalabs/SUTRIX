import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { hierarchyApi } from '../../services/hierarchyApi';
import { Activity, ChevronRight, Database, AlertCircle } from 'lucide-react';
import { SimpleAnalysisWorkspace } from './SimpleAnalysisWorkspace';

interface HierarchyNodeMeta {
  id: string;
  parent_id: string | null;
  level: number;
  node_name: string;
  filter_col: string;
  filter_val: string;
  path: string;
  inherited_filters: Record<string, string>;
  applied_filter: Record<string, string>;
  row_count: number;
  unique_compounds: number;
  is_leaf: boolean;
  children: string[];
}

export const DataAnalysisWorkspace: React.FC = () => {
  const {
    activeLineage,
    activeSegregationResult,
  } = useWorkspaceStore();

  // Build nodeMap for efficient lookup
  const lineage = activeLineage || (activeSegregationResult?.graph ? {
    nodes: activeSegregationResult.graph.nodes || [],
    edges: activeSegregationResult.graph.edges || [],
    root_id: activeSegregationResult.graph.root_id || 'root',
    total_nodes: activeSegregationResult.graph.nodes?.length || 0,
    max_depth: activeSegregationResult.graph.max_depth || 1,
  } : null);

  // Empty state — no nodes yet (hierarchy not built or nodes is empty)
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
      {/* Top Dual Mode Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-[#080f1f]/80 border-b border-white/[0.06] shrink-0 backdrop-blur-md z-10 text-left">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">Step 4: Data Analysis Workspace</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-6">
        <SimpleAnalysisWorkspace />
      </div>
    </div>
  );
};
