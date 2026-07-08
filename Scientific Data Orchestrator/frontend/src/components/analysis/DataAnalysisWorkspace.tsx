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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SimpleAnalysisWorkspace />
    </div>
  );

};
