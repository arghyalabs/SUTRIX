import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { hierarchyApi } from '../../services/hierarchyApi';
import { NodeVisualization } from './NodeVisualization';
import { NodeMetaPanel } from './NodeMetaPanel';
import { simpleAnalysisApi } from '../../services/simpleAnalysisApi';
import { FullscreenPieModal } from './FullscreenPieModal';
import { FullscreenBarModal } from './FullscreenBarModal';
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  Search, ChevronRight, FileText, CheckCircle2,
  AlertTriangle, ArrowDown, Award, Layers, Database,
  GitBranch, Download, RefreshCw, HelpCircle,
  Maximize2, Image
} from 'lucide-react';
import { toPng } from 'html-to-image';

// ── Download PNG helper (matches NodeVisualization) ───────────────────────────
async function downloadChartAsPng(ref: React.RefObject<HTMLDivElement | null>, filename: string) {
  const el = ref.current;
  if (!el) return;
  const filter = (node: Element) => !(node instanceof HTMLElement && node.dataset.downloadIgnore === 'true');
  try {
    await toPng(el, { pixelRatio: 2, cacheBust: true, filter });
    const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true, filter });
    const a = document.createElement('a'); a.download = filename; a.href = dataUrl; a.click();
  } catch (err) { console.error('[SDO] PNG export failed:', err); }
}

// ── ChartCard — identical to NodeVisualization ────────────────────────────────
const ChartCard = React.forwardRef<HTMLDivElement, {
  title: string; subtitle?: string;
  onDownload: () => void; onExpand?: () => void;
  children: React.ReactNode;
}>(({ title, subtitle, onDownload, onExpand, children }, ref) => (
  <div ref={ref} className="p-5 rounded-2xl bg-[#080f1f] border border-white/[0.07] flex flex-col overflow-visible">
    <div className="flex items-start justify-between mb-3 shrink-0">
      <div>
        <h4 className="text-sm font-bold text-white">{title}</h4>
        {subtitle && <p className="text-[10px] text-white/30 mt-0.5 font-mono">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2" data-download-ignore="true">
        {onExpand && (
          <button onClick={onExpand} title="Open in Interactive Fullscreen"
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/40 hover:bg-violet-500/10 hover:border-violet-500/30 hover:text-violet-400 transition-all">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={onDownload} title="Download PNG" data-download-ignore="true"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/40 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-400 text-[10px] font-semibold uppercase tracking-wider transition-all">
          <Image className="w-3 h-3" /> PNG
        </button>
      </div>
    </div>
    {children}
  </div>
));
ChartCard.displayName = 'ChartCard';

// ── Shared tooltip styles ─────────────────────────────────────────────────────
const TOOLTIP_STYLE = { contentStyle: { background: '#0d1a30', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }, labelStyle: { color: 'rgba(255,255,255,0.5)', fontSize: '10px' }, itemStyle: { color: '#22d3ee', fontWeight: 'bold', fontSize: '12px' } };
const CHART_COLORS = ['#22d3ee','#8b5cf6','#10b981','#f59e0b','#f43f5e','#3b82f6','#ec4899','#84cc16'];

const CustomPieTooltip = ({ active, payload, categoryLabel }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    const displayLabel = categoryLabel ? categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1) : 'Category';
    return (
      <div className="bg-[#0d1a30] border border-white/[0.08] rounded-xl px-4 py-3 shadow-2xl space-y-1">
        <p className="text-white text-xs font-semibold">
          <span className="text-white/50">{displayLabel}: </span>
          <span className="text-cyan-400 font-bold">{d.name}</span>
        </p>
        <p className="text-white text-xs">
          <span className="text-white/50">Count: </span>
          <span className="font-bold text-white">{d.value.toLocaleString()}</span>
        </p>
        <p className="text-white text-xs">
          <span className="text-white/50">Percentage: </span>
          <span className="font-bold text-cyan-400">{(d.pct !== undefined ? d.pct : d.percentage)?.toFixed(1)}%</span>
        </p>
      </div>
    );
  }
  return null;
};

const CustomBarTooltip = ({ active, payload, label, categoryLabel, total }: any) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    const pct = total > 0 ? (value / total) * 100 : 0;
    const displayLabel = categoryLabel ? categoryLabel.charAt(0).toUpperCase() + categoryLabel.slice(1) : 'Category';
    return (
      <div className="bg-[#0d1a30] border border-white/[0.08] rounded-xl px-4 py-3 shadow-2xl space-y-1">
        <p className="text-white text-xs font-semibold">
          <span className="text-white/50">{displayLabel}: </span>
          <span className="text-cyan-400 font-bold">{label}</span>
        </p>
        <p className="text-white text-xs">
          <span className="text-white/50">Count: </span>
          <span className="font-bold text-white">{value.toLocaleString()}</span>
        </p>
        <p className="text-white text-xs">
          <span className="text-white/50">Percentage: </span>
          <span className="font-bold text-cyan-400">{pct.toFixed(1)}%</span>
        </p>
      </div>
    );
  }
  return null;
};

const renderCustomBarLabel = (props: any) => {
  const { x, y, width, value } = props;
  if (value === undefined || value === null) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      fill="rgba(255,255,255,0.95)"
      fontSize={11}
      fontWeight="bold"
      textAnchor="middle"
      className="font-mono"
    >
      {value.toLocaleString()}
    </text>
  );
};

interface HierarchyNodeMeta {
  id: string;
  parent_id: string | null;
  level: number;
  node_name: string;
  filter_col: string;
  filter_val: string;
  path: string;
  row_count: number;
  unique_compounds: number;
  is_leaf: boolean;
  children: string[];
}

// Recursive Tree Node for Left Sidebar
const BranchTreeNode: React.FC<{
  node: HierarchyNodeMeta;
  nodeMap: Record<string, HierarchyNodeMeta>;
  selectedId: string;
  onSelect: (id: string) => void;
  depth?: number;
}> = ({ node, nodeMap, selectedId, onSelect, depth = 0 }) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = node.id === selectedId;
  const hasChildren = node.children && node.children.length > 0;
  
  const levelColors = ['text-emerald-400', 'text-cyan-400', 'text-violet-400', 'text-amber-400'];
  const accent = levelColors[Math.min(node.level, levelColors.length - 1)];

  return (
    <div className="w-full">
      <div
        onClick={() => onSelect(node.id)}
        className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-xs group cursor-pointer pr-4
          ${isSelected
            ? 'bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_12px_rgba(34,211,238,0.15)]'
            : 'hover:bg-white/[0.03] border border-transparent'
          }`}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
            className="w-4 h-4 flex items-center justify-center shrink-0 text-white/30 hover:text-white/60"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}

        {node.level === 0 ? (
          <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <GitBranch className={`w-3.5 h-3.5 ${accent} shrink-0`} />
        )}

        <div className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
          {node.level === 0 ? (
            <span className="font-bold text-white">Root Dataset</span>
          ) : (
            <span className={`font-semibold ${isSelected ? 'text-white' : 'text-white/70'}`}>
              <span className="text-white/40">{node.filter_col}</span>
              <span className="text-white/20 mx-1">=</span>
              <span className={accent}>{node.filter_val}</span>
            </span>
          )}
        </div>

        {node.row_count > 0 && (
          <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full
            ${isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/[0.04] text-white/30'}`}>
            {node.row_count.toLocaleString()}
          </span>
        )}
      </div>

      <AnimatePresence>
        {hasChildren && expanded && (
          <div className="relative ml-3">
            <div className="absolute left-2 top-0 bottom-2 w-px bg-white/[0.05]" />
            {node.children.map(childId => {
              const childNode = nodeMap[childId];
              if (!childNode) return null;
              return (
                <BranchTreeNode
                  key={childId}
                  node={childNode}
                  nodeMap={nodeMap}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  depth={depth + 1}
                />
              );
            })}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const SimpleAnalysisWorkspace: React.FC = () => {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const activeLineage = useWorkspaceStore((state) => state.activeLineage);
  const activeSegregationResult = useWorkspaceStore((state) => state.activeSegregationResult);
  const datasetMode = useWorkspaceStore((state) => state.datasetMode);

  // States
  const [nodesList, setNodesList] = useState<HierarchyNodeMeta[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('root');
  const [branchDetail, setBranchDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFullscreenChart, setActiveFullscreenChart] = useState<string | null>(null);
  const [nodeDetail, setNodeDetail] = useState<any | null>(null);
  const [loadingNode, setLoadingNode] = useState<boolean>(false);
  const [explorerTab, setExplorerTab] = useState<'overview' | 'advanced' | 'inspector'>('advanced');

  // Fetch Tree structure
  const fetchTree = async () => {
    if (!workspaceId) return;
    try {
      const lineage = activeLineage || (activeSegregationResult?.graph ? {
        nodes: activeSegregationResult.graph.nodes || [],
        edges: activeSegregationResult.graph.edges || [],
        root_id: 'root',
      } : null);

      if (lineage?.nodes) {
        setNodesList(lineage.nodes);
        setSelectedNodeId(lineage.root_id || lineage.nodes[0].id);
      } else {
        const treeData = await hierarchyApi.getTree(workspaceId);
        if (treeData && treeData.nodes) {
          setNodesList(treeData.nodes);
          setSelectedNodeId(treeData.root_id || treeData.nodes[0].id);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch hierarchy tree structure.');
    }
  };

  useEffect(() => {
    fetchTree();
  }, [workspaceId, activeLineage, activeSegregationResult]);

  // Fetch details of selected Branch
  const fetchBranchDetail = async (nodeId: string) => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await simpleAnalysisApi.getBranchDetail(nodeId, workspaceId);
      setBranchDetail(data);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.detail || 'Failed to analyze selected branch.');
    } finally {
      setLoading(false);
    }
  };

  const fetchNodeDetail = async (nodeId: string) => {
    if (!workspaceId) return;
    setLoadingNode(true);
    try {
      const detail = await hierarchyApi.getNodeDetail(workspaceId, nodeId);
      setNodeDetail(detail);
    } catch (err: any) {
      console.error('Failed to fetch node detail:', err);
    } finally {
      setLoadingNode(false);
    }
  };

  useEffect(() => {
    if (selectedNodeId) {
      fetchBranchDetail(selectedNodeId);
      fetchNodeDetail(selectedNodeId);
    }
  }, [selectedNodeId, workspaceId]);

  // Index nodes map for fast recursive lookups
  const nodeMap = useMemo(() => {
    const map: Record<string, HierarchyNodeMeta> = {};
    nodesList.forEach((n) => {
      map[n.id] = n;
    });
    return map;
  }, [nodesList]);

  const rootNode = useMemo(() => {
    return nodesList.find(n => n.parent_id === null || n.id === 'root') || nodesList[0];
  }, [nodesList]);

  // Filter nodes dynamically for search list
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return nodesList.filter(n =>
      n.node_name.toLowerCase().includes(query) ||
      (n.filter_col && n.filter_col.toLowerCase().includes(query)) ||
      (n.filter_val && n.filter_val.toLowerCase().includes(query))
    );
  }, [nodesList, searchQuery]);

  // Direct CSV/JSON downloads helper
  const triggerExport = (format: 'csv' | 'json') => {
    if (!workspaceId || !selectedNodeId) return;
    simpleAnalysisApi.exportChart(workspaceId, selectedNodeId, format);
  };

  // Generate PDF report
  const triggerPdfReport = () => {
    if (!workspaceId || !selectedNodeId) return;
    simpleAnalysisApi.exportBranchPdf(selectedNodeId, workspaceId);
  };

  // Charts data processing
  const compositionPieData = useMemo(() => {
    if (!branchDetail?.charts?.composition_pie) return [];
    const pie = branchDetail.charts.composition_pie;
    const labels = pie.labels || [];
    const values = pie.values || [];
    const total = values.reduce((a: number, b: number) => a + b, 0);
    return labels.map((label: string, idx: number) => ({
      name: label,
      value: values[idx] || 0,
      pct: total > 0 ? (values[idx] / total) * 100 : 0
    }));
  }, [branchDetail]);

  const pieTotal = useMemo(() => {
    return compositionPieData.reduce((sum: number, item: { value: number }) => sum + item.value, 0);
  }, [compositionPieData]);

  const compositionBarData = useMemo(() => {
    if (!branchDetail?.charts?.composition_bar) return [];
    const bar = branchDetail.charts.composition_bar;
    return (bar.x || []).map((label: string, idx: number) => ({
      name: label,
      count: bar.y?.[idx] || 0
    }));
  }, [branchDetail]);

  const pathCurvesData = useMemo(() => {
    if (!branchDetail?.curves) return [];
    const c = branchDetail.curves;
    return (c.labels || []).map((lbl: string, idx: number) => ({
      name: lbl,
      rows: c.row_reduction?.[idx] || 0,
      compounds: c.compound_reduction?.[idx] || 0,
      retention: c.retention_curve?.[idx] || 0,
      missingness: c.missingness_curve?.[idx] || 0,
    }));
  }, [branchDetail]);

  // Chart Custom HSL Colors
  const COLORS = ['#10b981', '#06b6d4', '#6366f1', '#f59e0b', '#ec4899', '#3b82f6'];

  const getQualityRatingBadge = (rating: string) => {
    switch (rating) {
      case 'Excellent':
        return <span className="px-2 py-1 rounded-xl text-xs font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /> Excellent</span>;
      case 'Good':
        return <span className="px-2 py-1 rounded-xl text-xs font-extrabold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1.5 shrink-0"><Award className="w-3.5 h-3.5" /> Good</span>;
      case 'Fair':
        return <span className="px-2 py-1 rounded-xl text-xs font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5 shrink-0"><HelpCircle className="w-3.5 h-3.5" /> Fair</span>;
      default:
        return <span className="px-2 py-1 rounded-xl text-xs font-extrabold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1.5 shrink-0"><AlertTriangle className="w-3.5 h-3.5" /> Poor</span>;
    }
  };

  // Per-chart refs for PNG export
  const pieRef    = useRef<HTMLDivElement>(null);
  const barRef    = useRef<HTMLDivElement>(null);
  const cmpRef    = useRef<HTMLDivElement>(null);
  const rowRef    = useRef<HTMLDivElement>(null);
  const retRef    = useRef<HTMLDivElement>(null);
  const misRef    = useRef<HTMLDivElement>(null);

  // Fullscreen Modal Render Helper
  const renderFullscreenModal = () => {
    if (!activeFullscreenChart || !branchDetail) return null;
    
    let chartComponent = null;
    let title = "";
    let subtitle = "";
    
    switch (activeFullscreenChart) {
      case 'row_reduction':
        title = "Dataset Rows Attrition";
        subtitle = "Total rows remaining along the lineage path";
        chartComponent = (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pathCurvesData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11 }} />
              <YAxis stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#090f1f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                itemStyle={{ fontSize: 12 }}
              />
              <Line type="monotone" dataKey="rows" name="Row Count" stroke="#6366f1" strokeWidth={4} activeDot={{ r: 8 }} label={{ fill: '#6366f1', fontSize: 10, position: 'top' }} />
            </LineChart>
          </ResponsiveContainer>
        );
        break;
      case 'retention_curve':
        title = "Data Decay (Cumulative Retention %)";
        subtitle = "Percentage of original dataset rows retained at each level";
        chartComponent = (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pathCurvesData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
              <defs>
                <linearGradient id="colorRetentionFullscreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11 }} />
              <YAxis stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: '#090f1f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                itemStyle={{ fontSize: 12 }}
              />
              <Area type="monotone" dataKey="retention" name="Retention %" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRetentionFullscreen)" />
            </AreaChart>
          </ResponsiveContainer>
        );
        break;
      case 'missingness_curve':
        title = "Frictional Missingness Trend %";
        subtitle = "Data quality decay (missing values percentage) along the branch path";
        chartComponent = (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pathCurvesData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
              <defs>
                <linearGradient id="colorMissingFullscreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11 }} />
              <YAxis stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: '#090f1f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                itemStyle={{ fontSize: 12 }}
              />
              <Area type="monotone" dataKey="missingness" name="Missingness %" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorMissingFullscreen)" />
            </AreaChart>
          </ResponsiveContainer>
        );
        break;
    }

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6 md:p-10 text-left">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="relative bg-[#060c18] border border-white/[0.08] w-full max-w-6xl h-[90vh] rounded-3xl overflow-hidden flex flex-col p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        >
          {/* Glowing top bar accent */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500/60 via-violet-500/40 to-transparent" />

          {/* Header — identical to NodeVisualization fullscreen */}
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-6 shrink-0">
            <div>
              <span className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-widest block">Branch Explorer · Interactive Fullscreen</span>
              <h3 className="text-xl font-bold text-white mt-1">{title}</h3>
              <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-xl">
                <button onClick={() => triggerExport('csv')}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase text-white/40 hover:text-white/60 hover:bg-white/5 transition-all flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button onClick={() => triggerExport('json')}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase text-white/40 hover:text-white/60 hover:bg-white/5 transition-all flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> JSON
                </button>
              </div>
              <button onClick={() => setActiveFullscreenChart(null)}
                className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white/70 hover:text-white font-extrabold text-xs rounded-xl transition-all">
                ✕ Close
              </button>
            </div>
          </div>

          {/* Chart Container */}
          <div className="flex-1 w-full overflow-hidden">
            {chartComponent}
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start text-left relative">
      
      {/* Searchable Branch Tree Navigator (4 spans) */}
      <div className="xl:col-span-4 flex flex-col gap-6 h-full min-h-[600px] xl:max-h-[850px] xl:overflow-hidden">
        
        <div className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl backdrop-blur-md flex flex-col h-full overflow-hidden">
          
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Branch Tree Explorer
            </h3>
            <button
              onClick={fetchTree}
              className="p-1 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/60 transition-colors"
              title="Refresh Tree"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search Input */}
          <div className="relative mb-4 shrink-0">
            <input
              type="text"
              placeholder="Search nodes by value/column..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#080f1f]/50 border border-white/[0.06] rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/40 transition-colors"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          </div>

          {/* Collapsible Node Tree/Search Results */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
            {searchQuery.trim() ? (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-wider block mb-1">
                  Search Results ({filteredNodes.length})
                </span>
                {filteredNodes.length > 0 ? (
                  filteredNodes.map(node => (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`text-xs p-3 rounded-2xl cursor-pointer border transition-all text-left flex justify-between items-center
                        ${selectedNodeId === node.id
                          ? 'bg-cyan-500/10 border-cyan-500/30'
                          : 'bg-white/[0.01] hover:bg-white/[0.03] border-white/[0.04]'
                        }`}
                    >
                      <div>
                        <div className="font-bold text-white">{node.node_name}</div>
                        <div className="text-[10px] text-white/40 mt-0.5">{node.path}</div>
                      </div>
                      <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/20 px-2 py-0.5 rounded-full shrink-0">
                        {node.row_count.toLocaleString()} rows
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-xs text-white/20">No matching branches found.</div>
                )}
              </div>
            ) : (
              <div className="w-max min-w-full">
                {rootNode ? (
                  <BranchTreeNode
                    node={rootNode}
                    nodeMap={nodeMap}
                    selectedId={selectedNodeId}
                    onSelect={setSelectedNodeId}
                  />
                ) : (
                  <div className="py-12 text-center text-xs text-white/20">Loading lineage tree...</div>
                )}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* RIGHT PANE: Scientific Visualization Workspace (8 spans) */}
      <div className="xl:col-span-8 flex flex-col gap-6">
        
        {/* Breadcrumb Header + Exporters */}
        <div className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-wider">Active Analysis Path</span>
            <div className="text-xs font-bold text-white mt-1 flex flex-wrap items-center gap-1">
              {branchDetail?.path ? (
                branchDetail.path.split(' > ').map((part: string, idx: number, arr: string[]) => (
                  <React.Fragment key={part}>
                    <span className={idx === arr.length - 1 ? 'text-cyan-300' : 'text-white/60'}>{part}</span>
                    {idx < arr.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-white/20" />}
                  </React.Fragment>
                ))
              ) : (
                <span className="text-white/40">Root Dataset</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={triggerPdfReport}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/30 text-cyan-300 text-xs font-extrabold shadow-sm transition-all"
            >
              <FileText className="w-4 h-4" /> Generate PDF Branch Report
            </button>
            <div className="flex bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-xl">
              <button
                onClick={() => triggerExport('csv')}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold uppercase text-white/40 hover:text-white/60 hover:bg-white/5 transition-all flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={() => triggerExport('json')}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold uppercase text-white/40 hover:text-white/60 hover:bg-white/5 transition-all flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> JSON
              </button>
            </div>
          </div>
        </div>
        <div className="flex bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-xl shrink-0">
          <button
            onClick={() => setExplorerTab('advanced')}
            className={`flex-1 py-2 text-center text-[10px] font-bold uppercase transition-all rounded-lg
              ${explorerTab === 'advanced' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/40 hover:text-white/60'}`}
          >
            Overview
          </button>
          <button
            onClick={() => setExplorerTab('overview')}
            className={`flex-1 py-2 text-center text-[10px] font-bold uppercase transition-all rounded-lg
              ${explorerTab === 'overview' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/40 hover:text-white/60'}`}
          >
            Advanced Analytics
          </button>
          <button
            onClick={() => setExplorerTab('inspector')}
            className={`flex-1 py-2 text-center text-[10px] font-bold uppercase transition-all rounded-lg
              ${explorerTab === 'inspector' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/40 hover:text-white/60'}`}
          >
            Node Inspector
          </button>
        </div>

        {/* Dynamic Shift Warnings Banner */}
        {explorerTab === 'overview' && branchDetail?.distribution_shift?.shift_detected && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 p-4 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-pulse">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>{branchDetail.distribution_shift.message}</span>
          </div>
        )}

        {explorerTab === 'overview' ? (
          /* 6 Grid Scientific Charts Panel — styled identical to Advanced Tree NodeVisualization */
          <div className="bg-white/[0.02] border border-white/[0.04] p-6 rounded-3xl backdrop-blur-md flex flex-col gap-6">
            <div className="border-b border-white/[0.04] pb-3 shrink-0">
              <h3 className="text-sm font-extrabold text-white">Visualization Workspace
                <span className="ml-2 text-[10px] font-bold text-white/30 uppercase tracking-widest">Active Subgroup Distribution & Path Attrition</span>
              </h3>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                <span className="text-sm font-semibold text-white/50">Recalculating responsive distributions...</span>
              </div>
            ) : branchDetail ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* ── Chart 1: Subgroup Composition Pie ── */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}>
                  <ChartCard
                    ref={pieRef}
                    title="Subgroup Composition %"
                    subtitle={branchDetail.charts?.composition_pie?.title ? `column: ${branchDetail.charts.composition_pie.title}` : undefined}
                    onDownload={() => downloadChartAsPng(pieRef, `sdo_composition_pie_${selectedNodeId}.png`)}
                    onExpand={() => setActiveFullscreenChart('composition_pie')}
                  >
                    <div className="flex flex-col h-[340px]">
                      {compositionPieData.length > 0 ? (
                        <>
                          <div className="relative w-full h-[200px] flex-shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={compositionPieData} cx="50%" cy="50%" innerRadius={46} outerRadius={68} paddingAngle={3} dataKey="value" labelLine={false} label={false}>
                                  {compositionPieData.map((_: any, i: number) => <Cell key={`c-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                </Pie>
                                <Tooltip content={<CustomPieTooltip categoryLabel={branchDetail.charts?.composition_pie?.title || 'Category'} />} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-[9px] uppercase tracking-wider text-white/40 font-bold">TOTAL</span>
                              <span className="text-lg font-extrabold text-white leading-none my-0.5">
                                {pieTotal.toLocaleString()}
                              </span>
                              <span className="text-[8px] uppercase tracking-wider text-cyan-400 font-bold">
                                Records
                              </span>
                            </div>
                          </div>
                          <ul className="space-y-1.5 w-full mt-2 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar flex-1">
                            {compositionPieData.map((entry: any, index: number) => {
                              const count = entry.value;
                              const pct = entry.pct;
                              const color = CHART_COLORS[index % CHART_COLORS.length];
                              return (
                                <li key={`item-${index}`} className="flex items-center justify-between w-full text-xs font-mono">
                                  <span className="flex items-center gap-2 text-white/80">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                    <span className="truncate max-w-[120px]">{entry.name}</span>
                                  </span>
                                  <span className="flex-1 mx-2 border-b border-dotted border-white/20 align-bottom h-3" />
                                  <span className="text-white/60 shrink-0 font-bold">
                                    {count.toLocaleString()} ({pct.toFixed(1)}%)
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-full text-white/20 text-xs">No composition categories available</div>
                      )}
                    </div>
                  </ChartCard>
                </motion.div>

                {/* ── Chart 2: Subgroup Frequencies Bar ── */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
                  <ChartCard
                    ref={barRef}
                    title="Subgroup Frequencies"
                    subtitle={branchDetail.charts?.composition_bar?.title ? `column: ${branchDetail.charts.composition_bar.title}` : undefined}
                    onDownload={() => downloadChartAsPng(barRef, `sdo_composition_bar_${selectedNodeId}.png`)}
                    onExpand={() => setActiveFullscreenChart('composition_bar')}
                  >
                    <div className="h-[260px]">
                      {compositionBarData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={compositionBarData} margin={{ top: 35, right: 10, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                            <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 600 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
                            <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<CustomBarTooltip categoryLabel={branchDetail.charts?.composition_bar?.title || 'Category'} total={compositionBarData.reduce((sum: number, item: any) => sum + item.count, 0)} />} />
                            <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]}>
                              <LabelList dataKey="count" content={renderCustomBarLabel} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-white/20 text-xs">No composition frequencies available</div>
                      )}
                    </div>
                  </ChartCard>
                </motion.div>

                {/* ── Table 3: Compound Attrition Path (Data Reduction) ── */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }} className="col-span-1 md:col-span-2">
                  <div className="p-5 rounded-2xl bg-[#080f1f] border border-white/[0.07] flex flex-col overflow-visible h-full">
                    <div className="flex items-start justify-between mb-4 shrink-0">
                      <div>
                        <h4 className="text-sm font-bold text-white">Data Reduction Path</h4>
                        <p className="text-[10px] text-white/30 mt-0.5 font-mono">numerical reduction after each filtration step</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {branchDetail.compound_attrition?.length > 0 ? (
                        branchDetail.compound_attrition.map((node: any, idx: number) => (
                          <div key={node.label} className="flex items-center gap-3">
                            {idx > 0 && <ArrowDown className="w-3.5 h-3.5 text-rose-400/50 shrink-0" />}
                            <div className="flex-1 bg-white/[0.01] border border-white/[0.04] px-4 py-2.5 rounded-xl flex justify-between items-center text-xs">
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span className="text-[10px] text-white/30 font-mono">#{idx+1}</span>
                                {node.label}
                              </div>
                              <div className="flex items-center gap-3 font-semibold">
                                <span className="text-emerald-400">{node.unique_compounds} compounds</span>
                                {idx > 0 && (
                                  <span className="text-rose-400 text-[10px] bg-rose-500/10 px-1.5 py-0.5 rounded-lg">
                                    -{node.reduction_pct}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-white/30 text-xs py-4">No attrition data available.</div>
                      )}
                    </div>
                  </div>
                </motion.div>

                {/* ── Chart 3: Dataset Rows Attrition ── */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
                  <ChartCard
                    ref={rowRef}
                    title="Dataset Rows Attrition"
                    subtitle="Total rows remaining along the lineage path"
                    onDownload={() => downloadChartAsPng(rowRef, `sdo_row_attrition_${selectedNodeId}.png`)}
                    onExpand={() => setActiveFullscreenChart('row_reduction')}
                  >
                    <div className="h-[260px]">
                      {pathCurvesData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={pathCurvesData} margin={{ top: 35, right: 10, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                            <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#090f1f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                              itemStyle={{ fontSize: 12, fontWeight: 'bold' }}
                            />
                            <Line type="monotone" dataKey="rows" name="Row Count" stroke="#6366f1" strokeWidth={3} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-white/20 text-xs">No path curve data available</div>
                      )}
                    </div>
                  </ChartCard>
                </motion.div>

                {/* ── Chart 4: Data Decay (Cumulative Retention %) ── */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
                  <ChartCard
                    ref={retRef}
                    title="Data Decay (Cumulative Retention %)"
                    subtitle="Percentage of original dataset rows retained at each level"
                    onDownload={() => downloadChartAsPng(retRef, `sdo_retention_curve_${selectedNodeId}.png`)}
                    onExpand={() => setActiveFullscreenChart('retention_curve')}
                  >
                    <div className="h-[260px]">
                      {pathCurvesData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={pathCurvesData} margin={{ top: 35, right: 10, left: -10, bottom: 5 }}>
                            <defs>
                              <linearGradient id="colorRetention" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                            <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#090f1f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                              itemStyle={{ fontSize: 12, fontWeight: 'bold' }}
                            />
                            <Area type="monotone" dataKey="retention" name="Retention %" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRetention)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-white/20 text-xs">No path curve data available</div>
                      )}
                    </div>
                  </ChartCard>
                </motion.div>

                {/* ── Chart 5: Frictional Missingness Trend % ── */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}>
                  <ChartCard
                    ref={misRef}
                    title="Frictional Missingness Trend %"
                    subtitle="Data quality decay (missing values percentage) along the branch path"
                    onDownload={() => downloadChartAsPng(misRef, `sdo_missingness_curve_${selectedNodeId}.png`)}
                    onExpand={() => setActiveFullscreenChart('missingness_curve')}
                  >
                    <div className="h-[260px]">
                      {pathCurvesData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={pathCurvesData} margin={{ top: 35, right: 10, left: -10, bottom: 5 }}>
                            <defs>
                              <linearGradient id="colorMissing" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                            <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#090f1f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                              itemStyle={{ fontSize: 12, fontWeight: 'bold' }}
                            />
                            <Area type="monotone" dataKey="missingness" name="Missingness %" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorMissing)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-white/20 text-xs">No path curve data available</div>
                      )}
                    </div>
                  </ChartCard>
                </motion.div>

              </div>
            ) : (
              <div className="py-20 text-center text-xs text-white/30">No analysis details loaded.</div>
            )}
          </div>
        ) : explorerTab === 'advanced' ? (
          <div className="bg-[#080f1f]/50 border border-white/[0.04] p-4 rounded-3xl backdrop-blur-md min-h-[500px]">
            <NodeVisualization nodeDetail={nodeDetail} isLoading={loadingNode} />
          </div>
        ) : (
          <div className="bg-[#080f1f]/50 border border-white/[0.04] p-4 rounded-3xl backdrop-blur-md min-h-[500px]">
            <NodeMetaPanel nodeDetail={nodeDetail} clientId={workspaceId} branchDetail={branchDetail} />
          </div>
        )}

      </div>



      <FullscreenPieModal
        isOpen={activeFullscreenChart === 'composition_pie'}
        onClose={() => setActiveFullscreenChart(null)}
        data={compositionPieData}
        title="Subgroup Composition %"
        colors={CHART_COLORS}
      />
      
      <FullscreenBarModal
        isOpen={activeFullscreenChart === 'composition_bar'}
        onClose={() => setActiveFullscreenChart(null)}
        data={compositionBarData.map((d: any) => ({ name: d.name, value: d.count }))}
        title="Subgroup Frequencies"
      />

      {/* AnimatePresence Fullscreen Overlay Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {['row_reduction', 'retention_curve', 'missingness_curve'].includes(activeFullscreenChart || '') && renderFullscreenModal()}
        </AnimatePresence>,
        document.body
      )}

    </div>
  );
};
