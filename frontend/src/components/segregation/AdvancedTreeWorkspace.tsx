import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Network, GitBranch, ArrowLeft, Check, Info, HelpCircle, BookOpen, Layers, X, Plus } from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { FilterNodeCard } from './FilterNodeCard';
import { FilterEditorPanel } from '../hierarchy/FilterEditorPanel';

interface AdvancedTreeWorkspaceProps {
  clientId: string;
  socket: any;
  onClose: () => void;
  isInline?: boolean;
}

interface FilterNodeData {
  id: string;
  parentId: string | null;
  column: string;
  value: string;
  operator: string;
}

let nodeIdCounter = 100;
const genId = () => `fnode_${Date.now()}_${nodeIdCounter++}`;

const NODE_TYPES = { filterNode: FilterNodeCard };

function buildFlowGraph(
  filterNodes: FilterNodeData[],
  selectedNodeId: string | null,
  onAddChild: (parentId: string, parentLabel: string) => void
): { nodes: Node[], edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Root node
  nodes.push({
    id: 'root',
    type: 'filterNode',
    position: { x: 350, y: 60 },
    data: {
      label: 'Full Dataset',
      filterCol: '',
      filterVal: '',
      rowCount: 0,
      uniqueCompounds: 0,
      isRoot: true,
      isLeaf: filterNodes.filter(n => n.parentId === 'root').length === 0,
      level: 0,
      onAddChild: () => onAddChild('root', 'Root'),
    },
    selected: selectedNodeId === 'root',
  });

  // BFS sorting
  const childMap: Record<string, FilterNodeData[]> = { root: [] };
  filterNodes.forEach(fn => {
    const parentId = fn.parentId || 'root';
    if (!childMap[parentId]) childMap[parentId] = [];
    childMap[parentId].push(fn);
  });

  const queue: { id: string; depth: number }[] = [{ id: 'root', depth: 0 }];
  const posMap: Record<string, { x: number; y: number }> = { root: { x: 350, y: 60 } };

  while (queue.length) {
    const { id, depth } = queue.shift()!;
    const children = childMap[id] || [];
    const spacing = Math.max(260, 640 / (children.length + 1));
    const totalWidth = (children.length - 1) * spacing;
    const parentX = posMap[id]?.x ?? 350;

    children.forEach((child, i) => {
      const x = parentX - totalWidth / 2 + i * spacing;
      const y = 60 + (depth + 1) * 190;
      posMap[child.id] = { x, y };
      queue.push({ id: child.id, depth: depth + 1 });

      const hasChildren = (childMap[child.id] || []).length > 0;
      nodes.push({
        id: child.id,
        type: 'filterNode',
        position: { x, y },
        data: {
          label: `${child.column} = ${child.value}`,
          filterCol: child.column,
          filterVal: child.value,
          rowCount: 0,
          uniqueCompounds: 0,
          isRoot: false,
          isLeaf: !hasChildren,
          level: depth + 1,
          onAddChild: () => onAddChild(child.id, `${child.column} = ${child.value}`),
        },
        selected: selectedNodeId === child.id,
      });

      edges.push({
        id: `e_${id}_${child.id}`,
        source: id,
        target: child.id,
        type: 'smoothstep',
        animated: true,
        style: { stroke: 'rgba(167, 139, 250, 0.4)', strokeWidth: 2, strokeDasharray: '6 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(167, 139, 250, 0.6)' },
      });
    });
  }

  return { nodes, edges };
}

export const AdvancedTreeWorkspace: React.FC<AdvancedTreeWorkspaceProps> = ({ clientId, socket, onClose, isInline = false }) => {
  const { columns, mappings, filterNodes: storeNodes, setFilterNodes: setStoreNodes } = useWorkspaceStore();
  const [localNodes, setLocalNodes] = useState<FilterNodeData[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('root');
  const [editorParentId, setEditorParentId] = useState<string | null>(null);
  const [editorParentLabel, setEditorParentLabel] = useState<string>('');
  const [infoTab, setInfoTab] = useState<'how' | 'why'>('how');

  // Auto-sync localNodes to storeNodes when inline
  useEffect(() => {
    if (isInline) {
      setStoreNodes(localNodes);
    }
  }, [localNodes, isInline, setStoreNodes]);

  // Load from store on mount
  useEffect(() => {
    setLocalNodes(storeNodes || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const handleOpenEditor = useCallback((parentId: string, parentLabel: string) => {
    setEditorParentId(parentId);
    setEditorParentLabel(parentLabel);
  }, []);

  // Recompile ReactFlow elements whenever localNodes shifts
  useEffect(() => {
    const { nodes, edges } = buildFlowGraph(localNodes, selectedNodeId, handleOpenEditor);
    setFlowNodes(nodes);
    setFlowEdges(edges);
  }, [localNodes, selectedNodeId, handleOpenEditor, setFlowNodes, setFlowEdges]);

  const handleConfirmFilter = (filter: { column: string; operator: string; value: string }) => {
    const newNode: FilterNodeData = {
      id: genId(),
      parentId: editorParentId,
      column: filter.column,
      value: filter.value,
      operator: filter.operator,
    };
    setLocalNodes(prev => [...prev, newNode]);
    setEditorParentId(null);
  };

  const handleNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    setFlowEdges(eds => addEdge(connection, eds));
  }, [setFlowEdges]);

  const handleApply = () => {
    setStoreNodes(localNodes);
    onClose();
  };

  const handleDiscard = () => {
    onClose();
  };

  const handleReset = () => {
    setLocalNodes([]);
    setSelectedNodeId('root');
  };

  const candidateColumns = useMemo(() => {
    const safeColumns = columns || [];
    const safeMappings = mappings || {};
    return safeColumns.length > 0 ? safeColumns : Object.keys(safeMappings);
  }, [columns, mappings]);

  return (
    <div className={`flex flex-col select-none text-white relative ${isInline ? 'h-[650px] rounded-2xl border border-white/[0.06] bg-[#050813]' : 'h-full bg-[#050813]'}`}>
      {/* Decoupled Workspace Top Banner */}
      {!isInline ? (
        <div className="flex justify-between items-center px-8 py-5 border-b border-white/[0.06] bg-[#0c1224]/85 backdrop-blur-xl shrink-0 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={handleDiscard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-white/65 text-xs hover:text-white hover:bg-white/[0.06] transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Discard
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-violet-400 font-mono">
                  Advanced Analytical Sandbox
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] bg-red-500/10 border border-red-500/20 text-red-400 font-bold uppercase tracking-wider">
                  Expert Mode
                </span>
              </div>
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2 mt-0.5">
                <Network className="w-4 h-4 text-violet-400" />
                Advanced Tree Designer (Custom DAG Override)
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {localNodes.length > 0 && (
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white transition-colors text-xs font-bold"
              >
                Reset Graph
              </button>
            )}
            <button
              onClick={handleApply}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-bold hover:from-cyan-400 hover:to-violet-400 transition-all text-xs tracking-wider shadow-[0_0_20px_rgba(139,92,246,0.3)] flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Apply Custom Tree & Close
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-between items-center px-6 py-3 border-b border-white/[0.06] bg-[#0c1224]/50 shrink-0 z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-extrabold uppercase font-mono">
              Advanced DAG Sandbox
            </span>
            <span className="text-xs text-white/50">Custom Directed Acyclic Graph Filters</span>
          </div>
          <div className="flex items-center gap-2">
            {localNodes.length > 0 && (
              <button
                onClick={handleReset}
                className="px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-white/50 hover:text-white text-[11px] font-bold transition-all"
              >
                Reset Graph
              </button>
            )}
          </div>
        </div>
      )}

      {/* Access Control Alert / Instruction strip */}
      {!isInline && (
        <div className="bg-amber-500/[0.07] border-b border-amber-500/20 px-8 py-3 flex items-start gap-2.5 text-xs text-amber-300 z-10 shrink-0">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-bold">Caution:</span> This designer allows manual directed-acyclic-graph (DAG) branching to configure bespoke logical filters. This overrides standard sequential columns. Recommended for expert users only. Most users should utilize SUTRIX's <strong>Select Hierarchy Columns (Sequential)</strong> interface.
          </div>
        </div>
      )}

      {/* Main workspace container */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Left Side Floating Context Guide (glassmorphic floater) */}
        <div className="absolute top-6 left-6 w-[320px] bg-[#0c1224]/85 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 shadow-2xl flex flex-col max-h-[calc(100%-48px)] overflow-y-auto z-10 custom-scrollbar">
          <div className="flex items-center gap-2 pb-3.5 border-b border-white/[0.06] mb-4 shrink-0">
            <BookOpen className="w-4 h-4 text-violet-400" />
            <span className="text-white text-xs font-bold uppercase tracking-wider">Designer Reference Guide</span>
          </div>

          <div className="flex gap-1 bg-white/[0.02] border border-white/[0.06] p-1 rounded-xl mb-4 shrink-0">
            <button
              onClick={() => setInfoTab('how')}
              className={`flex-1 py-1.5 rounded-lg text-[10.5px] font-bold tracking-wider uppercase transition-colors ${
                infoTab === 'how' ? 'bg-violet-600/25 border border-violet-500/30 text-violet-300 font-extrabold' : 'text-white/40 hover:text-white/70'
              }`}
            >
              How to Use
            </button>
            <button
              onClick={() => setInfoTab('why')}
              className={`flex-1 py-1.5 rounded-lg text-[10.5px] font-bold tracking-wider uppercase transition-colors ${
                infoTab === 'why' ? 'bg-violet-600/25 border border-violet-500/30 text-violet-300 font-extrabold' : 'text-white/40 hover:text-white/70'
              }`}
            >
              Implications
            </button>
          </div>

          <div className="flex-1 min-h-0 text-[11px] leading-relaxed text-white/60 space-y-4">
            {infoTab === 'how' ? (
              <div className="space-y-3">
                <div className="p-3 bg-white/[0.01] rounded-xl border border-white/[0.03]">
                  <strong className="text-cyan-400 block mb-1 uppercase tracking-wider text-[9.5px]">Step 1: Adding Nodes</strong>
                  Click the dashed <strong>+ Add Child</strong> button on any active node (e.g., <em>Full Dataset</em> root) to append a new filter criteria layer.
                </div>
                <div className="p-3 bg-white/[0.01] rounded-xl border border-white/[0.03]">
                  <strong className="text-violet-400 block mb-1 uppercase tracking-wider text-[9.5px]">Step 2: Defining Filters</strong>
                  Select a candidate database column (e.g. <em>Species</em>), comparison operator (e.g. <code>=</code>, <code>&gt;=</code>), and criteria value.
                </div>
                <div className="p-3 bg-white/[0.01] rounded-xl border border-white/[0.03]">
                  <strong className="text-emerald-400 block mb-1 uppercase tracking-wider text-[9.5px]">Step 3: Branching & Linking</strong>
                  Chain multiple custom branches side-by-side or in nested depths to segregate specific taxonomic, duration, or test groups.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-white/[0.01] rounded-xl border border-white/[0.03]">
                  <strong className="text-amber-400 block mb-1 uppercase tracking-wider text-[9.5px]">Acyclic Integrity</strong>
                  Manually curated filters compose a directed-acyclic-graph (DAG). Downstream validation checks ensure acyclic consistency before saving.
                </div>
                <div className="p-3 bg-white/[0.01] rounded-xl border border-white/[0.03]">
                  <strong className="text-cyan-400 block mb-1 uppercase tracking-wider text-[9.5px]">Non-Linear Splits</strong>
                  Unlike standard rigid columns, manual nodes permit filtering fish under 96 hours while keeping Daphnia under 48 hours in parallel paths.
                </div>
                <div className="p-3 bg-white/[0.01] rounded-xl border border-white/[0.03]">
                  <strong className="text-violet-400 block mb-1 uppercase tracking-wider text-[9.5px]">Homogeneous Analytics</strong>
                  Enables localized QSAR predictor modeling on highly uniform sub-populations, yielding vastly superior local predictivity.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ReactFlow Interactive Canvas */}
        <div className="flex-1 h-full z-0">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onNodeClick={handleNodeClick}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
            style={{ background: 'transparent' }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { stroke: 'rgba(167,139,250,0.35)', strokeWidth: 2 },
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="rgba(167,139,250,0.06)"
            />

            <style>{`
              .react-flow__controls {
                background: #0d1a30 !important;
                border: 1px solid rgba(167, 139, 250, 0.2) !important;
                border-radius: 12px !important;
                box-shadow: 0 0 20px rgba(0,0,0,0.6), 0 0 8px rgba(167,139,250,0.08) !important;
                padding: 2px !important;
                overflow: hidden;
              }
              .react-flow__controls-button {
                background: #0d1a30 !important;
                border: none !important;
                border-bottom: 1px solid rgba(255,255,255,0.06) !important;
                color: rgba(255,255,255,0.7) !important;
                fill: rgba(255,255,255,0.7) !important;
                width: 32px !important;
                height: 32px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: background 0.15s, color 0.15s !important;
              }
              .react-flow__controls-button:last-child {
                border-bottom: none !important;
              }
              .react-flow__controls-button:hover {
                background: rgba(167, 139, 250, 0.12) !important;
                color: #a78bfa !important;
                fill: #a78bfa !important;
              }
              .react-flow__controls-button svg {
                fill: currentColor !important;
                color: inherit !important;
                width: 14px !important;
                height: 14px !important;
              }
            `}</style>

            <Controls showInteractive={false} />

            <MiniMap
              style={{ background: '#070d1c', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '10px' }}
              nodeColor={() => 'rgba(167,139,250,0.4)'}
              maskColor="rgba(7,13,28,0.85)"
            />
          </ReactFlow>

          {/* Empty state overlay inside canvas */}
          {localNodes.length === 0 && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="text-center pl-[340px]">
                <GitBranch className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <p className="text-sm text-white/20 font-medium">Click <span className="text-violet-400/50 font-bold">+ Add Child</span> on the Root Dataset node to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      {!isInline && (
        <div className="px-8 py-5 border-t border-white/[0.06] bg-[#0c1224]/85 backdrop-blur-xl flex justify-between items-center shrink-0 z-10">
          <div className="text-xs text-white/40 font-mono">
            {localNodes.length} custom branches configured. Manual changes override default column selection.
          </div>
          <div className="flex gap-4">
            <button
              onClick={handleDiscard}
              className="px-6 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] text-white/80 transition-colors text-xs font-bold"
            >
              Cancel changes
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-gray-100 transition-colors shadow-lg"
            >
              Apply Custom Tree
            </button>
          </div>
        </div>
      )}

      {/* Filter Editor Panel (slide-in from right) */}
      <AnimatePresence>
        {editorParentId !== null && (
          <FilterEditorPanel
            columns={candidateColumns}
            onConfirm={handleConfirmFilter}
            onCancel={() => setEditorParentId(null)}
            parentLabel={editorParentLabel}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
