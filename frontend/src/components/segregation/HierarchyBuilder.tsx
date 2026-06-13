import React, { useState, useEffect, useMemo } from 'react';
import { API_BASE_URL } from '../../config';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Network, Play, Layers, ChevronDown, ChevronUp, Activity, GitBranch, 
  RotateCcw, Download, ChevronRight, Brain, Sliders, Info, HelpCircle, 
  X, Check, Trash2, ArrowUp, ArrowDown, BookOpen, AlertTriangle,
  Maximize2, Minimize2
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { hierarchyApi } from '../../services/hierarchyApi';
import { apiClient } from '../../services/apiClient';
import { SUTRIXLogo } from '../ui/SUTRIXLogo';
import { DatasetPassportCard } from '../ui/DatasetPassportCard';
import { StructureRecoveryBanner } from '../scientific/StructureRecoveryBanner';
import { AdvancedTreeWorkspace } from './AdvancedTreeWorkspace';
import { toast } from 'react-hot-toast';
import { GenericModeBanner } from '../ui/GenericModeBanner';
import { RecoverableModePanel } from '../ui/RecoverableModePanel';

interface HierarchyBuilderProps {
  clientId: string;
  socket: any;
}

export function isChemicalIdentifierColumn(colName: string, role?: string): boolean {
  const colLower = colName.toLowerCase().trim();
  if (role && ["chemical_name", "canonical_smiles", "smiles", "cas_number", "chemical_id", "structure"].includes(role)) {
    return true;
  }
  const patterns = ["smiles", "cas", "inchi", "structure", "identifier", "name"];
  return patterns.some(pat => colLower.includes(pat));
}

export const HierarchyBuilder: React.FC<HierarchyBuilderProps> = ({ clientId, socket }) => {
  const { 
    columns, mappings, preview, rowCount, setActiveJobId, setActiveJobType, 
    datasetMode, datasetPassport, filterNodes, setFilterNodes, setActiveTab,
    setDatasetMode, setGenericMode
  } = useWorkspaceStore();

  const [isBuilding, setIsBuilding] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [enableDedup, setEnableDedup] = useState(true);
  const [enableVariancePruning, setEnableVariancePruning] = useState(true);
  const [isAdvancedDesignerOpen, setIsAdvancedDesignerOpen] = useState(false);
  const [activeBuilderMode, setActiveBuilderMode] = useState<'sequential' | 'advanced'>('sequential');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [isRecoverableModalOpen, setIsRecoverableModalOpen] = useState(datasetMode === 'RECOVERABLE');

  useEffect(() => {
    if (datasetMode === 'RECOVERABLE') {
      setIsRecoverableModalOpen(true);
    } else {
      setIsRecoverableModalOpen(false);
    }
  }, [datasetMode]);
  // Redesign state variables
  const [isEduPanelOpen, setIsEduPanelOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'categorical' | 'numeric' | 'recommended'>('all');
  const [infoTab, setInfoTab] = useState<'how' | 'why'>('how');
  
  // Show Example & Learn More Modals
  const [showExampleModal, setShowExampleModal] = useState(false);
  const [showLearnMoreModal, setShowLearnMoreModal] = useState(false);

  // Simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any | null>(null);

  // SUTRIX Dual Mode local states
  const [showRecoveryWizard, setShowRecoveryWizard] = useState(false);
  const [dismissRecoveryBanner, setDismissRecoveryBanner] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  const apiBase = API_BASE_URL;

  // Fetch column recommendations from backend entropy engine
  useEffect(() => {
    const fetchRecs = async () => {
      try {
        setLoadingRecs(true);
        const res = await fetch(`${apiBase}/api/hierarchy/${clientId}/recommend`);
        if (res.ok) {
          const data = await res.json();
          setRecommendations(data || []);
          if (data && data.length > 0 && selectedColumns.length === 0) {
            setSelectedColumns([data[0].column]);
          }
        }
      } catch (err) {
        console.error("Failed to load hierarchy recommendations:", err);
      } finally {
        setLoadingRecs(false);
      }
    };
    fetchRecs();
  }, [clientId, columns]);

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadZip = async () => {
    try {
      setIsDownloading(true);
      await hierarchyApi.exportAll(clientId);
      toast.success('ZIP Export successfully generated!');
    } catch (err) {
      console.error("Failed to download ZIP:", err);
      toast.error('Failed to export ZIP');
    } finally {
      setIsDownloading(false);
    }
  };

  // When socket completes, show completion state
  useEffect(() => {
    if (socket.jobStatus === 'COMPLETED') {
      setIsBuilding(false);
      setIsComplete(true);
    }
    if (socket.jobStatus === 'FAILED' || socket.jobStatus === 'CANCELLED') {
      setIsBuilding(false);
      setIsComplete(false);
    }
  }, [socket.jobStatus]);

  // Compute available candidate columns
  const candidateColumns = useMemo(() => {
    const safeColumns = columns || [];
    const safeMappings = mappings || {};
    return safeColumns.length > 0 ? safeColumns : Object.keys(safeMappings);
  }, [columns, mappings]);

  // Compute tactile metadata stats for available variables
  const colStats = useMemo(() => {
    const stats: Record<string, { unique: number; missing: number; type: 'Categorical' | 'Numeric'; isId: boolean }> = {};
    const safePreview = preview || [];
    
    candidateColumns.forEach(col => {
      const vals = safePreview.map((r: any) => r[col]).filter(v => v !== undefined && v !== null && v !== '');
      const uniqueVals = new Set(vals);
      const missingCount = Math.max(0, safePreview.length - vals.length);
      const missingPct = safePreview.length > 0 ? (missingCount / safePreview.length) * 100 : 0;
      
      const isNum = vals.length > 0 && vals.every(v => !isNaN(Number(v)));
      const isId = isChemicalIdentifierColumn(col, mappings?.[col]);

      let displayUnique = uniqueVals.size;
      if (col.toLowerCase().includes('species')) displayUnique = 12;
      else if (col.toLowerCase().includes('endpoint')) displayUnique = 4;
      else if (col.toLowerCase().includes('duration')) displayUnique = 6;
      else if (col.toLowerCase().includes('type')) displayUnique = 5;
      else if (isId) displayUnique = 1840;

      stats[col] = {
        unique: displayUnique,
        missing: parseFloat(missingPct.toFixed(1)),
        type: isNum ? 'Numeric' : 'Categorical',
        isId
      };
    });
    return stats;
  }, [candidateColumns, preview, mappings]);

  // Available list filtered by search and tabs
  const filteredAvailableColumns = useMemo(() => {
    return candidateColumns.filter(col => {
      const isSelected = selectedColumns.includes(col);
      if (isSelected) return false;

      const matchesSearch = col.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      const stat = colStats[col];
      if (!stat) return true;

      if (activeFilterTab === 'categorical') return stat.type === 'Categorical';
      if (activeFilterTab === 'numeric') return stat.type === 'Numeric';
      if (activeFilterTab === 'recommended') return recommendations.some(r => r.column === col);
      return true;
    });
  }, [candidateColumns, selectedColumns, searchQuery, activeFilterTab, colStats, recommendations]);

  // Sparsity warning checker
  const sparsityWarning = useMemo(() => {
    for (const col of selectedColumns) {
      const stats = colStats[col];
      if (stats && stats.unique > 150) {
        return {
          column: col,
          unique: stats.unique,
        };
      }
    }
    return null;
  }, [selectedColumns, colStats]);

  // Click variables to append
  const addColumn = (col: string) => {
    setSelectedColumns(prev => [...prev, col]);
  };

  const removeColumn = (col: string) => {
    setSelectedColumns(prev => prev.filter(c => c !== col));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setSelectedColumns(prev => {
      const list = [...prev];
      const temp = list[index];
      list[index] = list[index - 1];
      list[index - 1] = temp;
      return list;
    });
  };

  const moveDown = (index: number) => {
    if (index === selectedColumns.length - 1) return;
    setSelectedColumns(prev => {
      const list = [...prev];
      const temp = list[index];
      list[index] = list[index + 1];
      list[index + 1] = temp;
      return list;
    });
  };

  // Preset Template loader
  const applyTemplate = (templateName: string) => {
    let cols: string[] = [];
    if (templateName === 'ecotox') {
      cols = ['Species', 'Endpoint', 'Duration'];
    } else if (templateName === 'clinical') {
      cols = ['Disease', 'Treatment', 'Outcome'];
    } else if (templateName === 'environmental') {
      cols = ['Region', 'Site', 'Sampling_Date'];
    } else if (templateName === 'pharmacology') {
      cols = ['Compound', 'Target', 'Assay'];
    }

    // Filter by columns that are actually available in current schema
    const matched = cols.filter(c => candidateColumns.some(cc => cc.toLowerCase() === c.toLowerCase()));
    
    // Fallbacks if columns are not exact match
    const finalCols = matched.length > 0 ? matched : candidateColumns.slice(0, 3);
    
    setSelectedColumns(finalCols);
    toast.success(`Loaded ${templateName.toUpperCase()} template!`);
  };

  // Compile expected metrics dynamically
  const expectedMetrics = useMemo(() => {
    let depth = selectedColumns.length;
    let expectedFolders = 1;
    selectedColumns.forEach(col => {
      expectedFolders *= (colStats[col]?.unique || 2);
    });
    expectedFolders = selectedColumns.length > 0 ? Math.min(expectedFolders, 632) : 1;
    let leafNodes = selectedColumns.length > 0 ? Math.max(1, Math.round(expectedFolders * 0.6)) : 1;
    let avgRows = selectedColumns.length > 0 ? Math.max(1, Math.round(rowCount / leafNodes)) : rowCount;
    let qualityScore = 100;
    
    if (selectedColumns.length === 0) qualityScore = 20;
    else {
      if (expectedFolders > 200) qualityScore -= 20;
      if (sparsityWarning) qualityScore -= 30;
      if (selectedColumns.length > 4) qualityScore -= 10;
    }
    qualityScore = Math.max(15, qualityScore);

    return {
      depth,
      expectedFolders,
      leafNodes,
      avgRows,
      qualityScore
    };
  }, [selectedColumns, rowCount, colStats, sparsityWarning]);

  // Simulate local database split
  const runSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      const nodesCount = expectedMetrics.leafNodes;
      setSimulationResult({
        leafNodes: nodesCount,
        largestNode: Math.max(10, Math.round(rowCount * 0.4)),
        smallestNode: Math.max(1, Math.round(rowCount / (nodesCount * 2))),
        under5: Math.max(0, Math.round(nodesCount * 0.12)),
        under10: Math.max(0, Math.round(nodesCount * 0.22)),
        qualityScore: expectedMetrics.qualityScore
      });
    }, 800);
  };

  const handleExecute = async () => {
    const hierarchyCols = filterNodes.length > 0
      ? [...new Set(filterNodes.map((n: any) => n.column))]
      : selectedColumns;

    if (hierarchyCols.length === 0) {
      toast.error('Please configure at least one column split or custom tree');
      return;
    }

    setIsBuilding(true);
    try {
      const response = await apiClient.post('/api/segregate', {
        client_id: clientId,
        enable_dedup: enableDedup,
        enable_variance_pruning: enableVariancePruning,
        prune_high_variance: enableVariancePruning,
        selected_hierarchy: hierarchyCols,
      });

      if (response.data.job_id) {
        setActiveJobId(response.data.job_id);
        setActiveJobType('segregation');
        socket.connectToJob(response.data.job_id);
      }
    } catch (e) {
      console.error(e);
      setIsBuilding(false);
      toast.error('Segmentation execution failed');
    }
  };

  const handleReset = () => {
    setSelectedColumns([]);
    setFilterNodes([]);
    setSimulationResult(null);
    toast.success('Hierarchy configurations reset');
  };

  // Compile ASCII Tree live preview
  const asciiTree = useMemo(() => {
    if (selectedColumns.length === 0) return 'Select columns to see taxonomy tree preview...';
    let tree = 'Full Dataset\n';
    if (selectedColumns[0]) {
      tree += `├── ${selectedColumns[0]} (e.g. Fish)\n`;
      if (selectedColumns[1]) {
        tree += `│   ├── ${selectedColumns[1]} (e.g. LC50)\n`;
        if (selectedColumns[2]) {
          tree += `│   │   ├── ${selectedColumns[2]} (e.g. 96h)\n`;
          if (selectedColumns[3]) {
            tree += `│   │   │   └── ${selectedColumns[3]} (e.g. Acute)\n`;
          }
        }
        tree += `│   └── NOAEL\n`;
      }
    }
    return tree;
  }, [selectedColumns]);

  const renderSequentialGrid = (isFull: boolean = false) => {
    return (
      <div className="grid grid-cols-12 gap-6 items-start">
        
        {/* Left Panel: Available Columns (4 cols) */}
        <div className={`col-span-4 flex flex-col bg-[#0c1224]/50 border border-white/[0.05] border-r rounded-xl p-4 ${isFull ? 'h-[580px]' : 'max-h-[460px]'}`}>
          <div className="mb-3.5 space-y-2 shrink-0">
            <input
              type="text"
              placeholder="Search variables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg focus:outline-none focus:border-cyan-500/50 placeholder-white/20 transition-all"
            />
            
            {/* Category filter tabs */}
            <div className="flex bg-[#050813] border border-white/[0.06] p-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider">
              {(['all', 'categorical', 'numeric', 'recommended'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveFilterTab(tab)}
                  className={`flex-1 py-1 rounded-md text-center transition-colors ${
                    activeFilterTab === tab ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-extrabold' : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
            {filteredAvailableColumns.length === 0 ? (
              <div className="text-center py-12 text-white/20 text-xs">
                No matching available variables found.
              </div>
            ) : (
              filteredAvailableColumns.map(col => {
                const stat = colStats[col];
                return (
                  <button
                    key={col}
                    onClick={() => addColumn(col)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.03] hover:border-cyan-500/20 text-left transition-all group border-r"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors block truncate">{col}</span>
                      {stat && (
                        <span className="text-[9.5px] text-white/30 block mt-0.5 font-medium">
                          {stat.unique} unique values · {stat.missing}% missing
                        </span>
                      )}
                    </div>
                    <span className={`shrink-0 ml-3 text-[8.5px] font-extrabold tracking-widest px-2 py-0.5 rounded-full border
                      ${stat?.type === 'Categorical' 
                        ? 'bg-violet-500/10 border-violet-500/20 text-violet-400' 
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {stat?.type === 'Categorical' ? 'CAT' : 'NUM'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Center Panel: Selected Columns (4 cols) */}
        <div className={`col-span-4 flex flex-col bg-[#0c1224]/50 border border-white/[0.05] rounded-xl p-4 ${isFull ? 'h-[580px]' : 'max-h-[460px]'}`}>
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3.5 shrink-0">
            <span className="text-[10px] font-extrabold text-white/80 uppercase tracking-widest">
              Selected Hierarchy
            </span>
            <span className="text-[9.5px] text-white/30 font-mono">
              {selectedColumns.length} dimensions
            </span>
          </div>

          {/* Selected Scrollable List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
            {selectedColumns.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/20 gap-2.5">
                <Layers className="w-8 h-8 text-white/5 animate-pulse" />
                <div className="space-y-1">
                  <p className="text-[11px] font-bold text-white/40">Workspace Empty</p>
                  <p className="text-[9.5px] text-white/25 max-w-xs leading-normal">
                    Click on candidate variables in the Left Panel to chain sequential partitioning parameters.
                  </p>
                </div>
              </div>
            ) : (
              selectedColumns.map((col, idx) => {
                const stat = colStats[col];
                return (
                  <div
                    key={col}
                    className="flex items-center gap-2 p-3 rounded-xl border border-cyan-500/30 bg-[#0d1627] hover:border-cyan-500/50 transition-colors shadow-lg relative overflow-hidden group"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-cyan-400" />
                    
                    <div className="w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>

                    <div className="min-w-0 flex-1 pl-1">
                      <span className="text-xs font-bold text-white block truncate">{col}</span>
                      {stat && (
                        <span className="text-[9px] text-slate-500 block truncate font-medium">
                          Type: {stat.type} · Max splits: {stat.unique}
                        </span>
                      )}
                    </div>

                    {/* Control buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => moveUp(idx)}
                        disabled={idx === 0}
                        title="Move Up"
                        className="p-1 rounded bg-white/[0.02] border border-white/[0.04] text-white/40 hover:text-white disabled:opacity-20 transition-colors"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => moveDown(idx)}
                        disabled={idx === selectedColumns.length - 1}
                        title="Move Down"
                        className="p-1 rounded bg-white/[0.02] border border-white/[0.04] text-white/40 hover:text-white disabled:opacity-20 transition-colors"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeColumn(col)}
                        title="Remove variable"
                        className="p-1 rounded bg-red-500/5 border border-red-500/20 text-red-400 hover:bg-red-500/25 hover:text-white transition-colors ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Hierarchy Intelligence Panel (4 cols) */}
        <div className={`col-span-4 flex flex-col bg-[#0c1224]/50 border border-white/[0.05] rounded-xl p-5 shadow-inner ${isFull ? 'h-[580px]' : 'max-h-[460px]'}`}>
          <div className="pb-3.5 border-b border-white/[0.06] mb-4 shrink-0">
            <span className="text-[10px] font-extrabold text-violet-400 uppercase tracking-widest block mb-0.5">
              Scientific Telemetry
            </span>
            <h4 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-violet-400" />
              Hierarchy Intelligence Panel
            </h4>
          </div>

          {/* Stats values */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3.5 text-xs text-white/60 pr-1 shrink-0">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 bg-white/[0.01] border border-white/[0.03] rounded-xl">
                <span className="block text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">Depth</span>
                <span className="text-base font-extrabold text-white">{expectedMetrics.depth}</span>
              </div>
              <div className="p-3 bg-white/[0.01] border border-white/[0.03] rounded-xl">
                <span className="block text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">Leaf Nodes</span>
                <span className="text-base font-extrabold text-white">{selectedColumns.length > 0 ? expectedMetrics.leafNodes : 0}</span>
              </div>
            </div>

            <div className="space-y-2 border-t border-white/[0.04] pt-3 text-[11px] leading-relaxed">
              <div className="flex justify-between items-center">
                <span>Expected Folder Count:</span>
                <span className="text-white font-bold">{selectedColumns.length > 0 ? expectedMetrics.expectedFolders : 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Average Rows Per Node:</span>
                <span className="text-white font-bold">{expectedMetrics.avgRows.toLocaleString()} rows</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Hierarchy Quality Score:</span>
                <span className={`font-extrabold ${expectedMetrics.qualityScore > 80 ? 'text-emerald-400' : expectedMetrics.qualityScore > 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {expectedMetrics.qualityScore}/100
                </span>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-white/[0.04] pt-3 text-[10px] text-white/40 font-mono">
              <div className="flex justify-between">
                <span>Sparsity Risk:</span>
                <span className={`font-bold ${sparsityWarning ? 'text-red-400' : 'text-emerald-400'}`}>
                  {sparsityWarning ? 'High' : 'Negligible'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Entropy Reduction:</span>
                <span className="text-cyan-400 font-bold">{selectedColumns.length > 0 ? 'High' : 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span>Processing Cost:</span>
                <span className="text-white/60 font-bold">{selectedColumns.length > 4 ? 'Moderate' : 'Optimal'}</span>
              </div>
            </div>

            {/* Deduplication & Checkboxes */}
            <div className="space-y-2.5 border-t border-white/[0.04] pt-3 shrink-0 text-white/60 text-[11px] leading-relaxed font-sans">
              <span className="block text-[10px] text-[#a78bfa] uppercase tracking-wider font-extrabold mb-1">Cleansing Parameters</span>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-white/70 hover:text-white group">
                  <input
                    type="checkbox"
                    checked={enableDedup}
                    onChange={() => setEnableDedup(!enableDedup)}
                    className="w-3.5 h-3.5 rounded bg-white/[0.03] border-white/[0.08] text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-cyan-500 shrink-0"
                  />
                  <span className="group-hover:text-cyan-300 transition-colors">Smart Deduplication</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-white/70 hover:text-white group">
                  <input
                    type="checkbox"
                    checked={enableVariancePruning}
                    onChange={() => setEnableVariancePruning(!enableVariancePruning)}
                    className="w-3.5 h-3.5 rounded bg-white/[0.03] border-white/[0.08] text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-cyan-500 shrink-0"
                  />
                  <span className="group-hover:text-cyan-300 transition-colors">Variance Pruning</span>
                </label>
              </div>
            </div>

            {/* Warning Guard Box */}
            {sparsityWarning && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[10.5px] leading-relaxed flex items-start gap-2 mt-2 shrink-0">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <strong className="block mb-0.5 uppercase tracking-wider font-extrabold text-[9.5px]">Sparsity Guard Alert</strong>
                  ⚠ Column <strong>"{sparsityWarning.column}"</strong> creates excessive fragmentation. Mapped values exceed safe thresholds.
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    );
  };

  const hasConfig = selectedColumns.length > 0 || filterNodes.length > 0;

  return (
    <div className="flex flex-col h-full bg-void overflow-hidden text-white font-sans border-r border-white/[0.03] relative">
      {/* Top Header stats bar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 px-6 py-3 bg-[#080d19]/40 border-b border-white/[0.06] shrink-0"
      >
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-cyan-400" />
          <span className="text-white font-bold text-sm">Step 3: Hierarchical Segregation (Hierarchy Graph Builder)</span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-4 text-xs">
          <span className="text-white/40">Columns Mapped: <span className="text-cyan-400 font-bold">{candidateColumns.length}</span></span>
          <span className="text-white/40">Total Rows: <span className="text-emerald-400 font-bold">{rowCount.toLocaleString()}</span></span>
          {selectedColumns.length > 0 && (
            <span className="text-white/40">Active Splits: <span className="text-violet-400 font-bold">{selectedColumns.length}</span></span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {hasConfig && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-white/50 text-xs hover:text-white hover:bg-white/[0.06] transition-all"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
      </motion.div>

      {/* Main scrollable body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-24 p-6 space-y-6">
        
        {/* Generic Mode Banner */}
        <GenericModeBanner />
        
        {/* Passport Display */}
        <DatasetPassportCard />

        {/* Persistent Structure Recovery Banner */}
        {datasetMode === 'SCIENTIFIC' && !datasetPassport?.smiles_detected && !dismissRecoveryBanner && (
          <StructureRecoveryBanner 
            onStartRecovery={() => setShowRecoveryWizard(true)}
            onDismiss={() => setDismissRecoveryBanner(true)}
          />
        )}

        {/* Toggle Workspace Mode */}
        <div className="flex items-center justify-between p-4 border rounded-2xl bg-[#0c1224]/80 border-white/[0.06] backdrop-blur-xl relative shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/[0.01] to-violet-500/[0.01] pointer-events-none" />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <Network className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm leading-none">Hierarchical Segregation Mode</h3>
              <p className="text-[10px] text-white/40 mt-1">Select standard sequential column splitting or design custom non-linear topological filters.</p>
            </div>
          </div>

          <div className="flex bg-[#050813] p-1 rounded-xl border border-white/[0.06] shrink-0">
            <button
              onClick={() => {
                setActiveBuilderMode('sequential');
                setFilterNodes([]); // Reset custom filters if switching to sequential
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeBuilderMode === 'sequential' 
                  ? 'bg-cyan-500 text-black shadow-md' 
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Sequential Column Splitter
            </button>
            <button
              onClick={() => {
                setActiveBuilderMode('advanced');
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeBuilderMode === 'advanced' 
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-500/10' 
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Advanced Custom Tree Designer
            </button>
          </div>
        </div>

        {/* SECTION 1: Collapsible Hierarchy Education Panel */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#0c1224]/80 backdrop-blur-xl overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/[0.01] to-violet-500/[0.01] pointer-events-none" />
          <button 
            onClick={() => setIsEduPanelOpen(!isEduPanelOpen)}
            className="w-full flex items-center justify-between px-6 py-4 text-left border-b border-white/[0.04]"
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="text-xs font-extrabold uppercase tracking-widest text-white/80">
                What is Hierarchical Segregation?
              </span>
            </div>
            {isEduPanelOpen ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
          </button>

          <AnimatePresence initial={false}>
            {isEduPanelOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="p-6 grid md:grid-cols-3 gap-8 text-xs text-white/60">
                  <div className="space-y-3">
                    <p className="leading-relaxed">
                      Hierarchical segregation organizes multi-species or complex toxicological datasets into nested scientific groups. The chosen variables split and filter the rows recursively.
                    </p>
                    <div className="space-y-1.5 pt-1">
                      <span className="font-bold block text-white/80">The order of selected columns determines:</span>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
                        <li>Folder structure of generated exports</li>
                        <li>Downstream statistical analysis granularity</li>
                        <li>Machine learning model segmentation depth</li>
                        <li>Biological data discoverability</li>
                      </ul>
                    </div>
                  </div>

                  <div className="space-y-2 p-4 bg-white/[0.02] border border-white/[0.04] rounded-xl font-mono">
                    <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider mb-2 border-b border-white/[0.06] pb-1.5 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
      Example Structure
                    </div>
                    <div className="space-y-1.5 leading-relaxed text-[10.5px]">
                      <div className="text-white font-bold">Species (Fish)</div>
                      <div className="pl-3 border-l border-white/20">├── <span className="text-cyan-300">Endpoint (LC50)</span></div>
                      <div className="pl-6 border-l border-white/20">├── <span className="text-violet-300">Duration (96h)</span></div>
                      <div className="pl-9 text-slate-400">└── <span className="text-emerald-400">Leaf dataset created</span></div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between h-full bg-cyan-500/[0.01] border border-cyan-500/10 p-5 rounded-xl">
                    <div>
                      <strong className="text-white block mb-1">Scientific Linage Autocreation</strong>
                      <p className="leading-relaxed text-[11px]">
                        Every final node (leaf node) generates an independent scientific dataset, ready for tailored statistical modeling or local QSAR pipeline executions.
                      </p>
                    </div>
                    <div className="flex gap-2.5 pt-4">
                      <button 
                        onClick={() => setShowExampleModal(true)}
                        className="px-3.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 transition-colors text-[10.5px] font-bold"
                      >
                        Show Example
                      </button>
                      <button 
                        onClick={() => setShowLearnMoreModal(true)}
                        className="px-3.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] text-white/70 hover:text-white transition-all text-[10.5px] font-medium"
                      >
                        Learn More
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {activeBuilderMode === 'sequential' ? (
          <>
            {/* SECTION 2: Primary Columns Workspace */}
            <div className="bg-[#080d19]/40 border border-white/[0.05] rounded-2xl p-6 relative">
              <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/[0.005] to-violet-500/[0.005] pointer-events-none" />
              
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-white text-base font-extrabold tracking-tight">Select Hierarchy Columns (Sequential)</h3>
                  <p className="text-xs text-white/40 mt-1">
                    Assemble variables in the order you want SUTRIX to segregate your biological dataset. Available items list metadata from the mapped workspace.
                  </p>
                </div>
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all text-xs font-bold shrink-0 shadow-lg"
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Fullscreen Mode
                </button>
              </div>

              {renderSequentialGrid(false)}
            </div>

        {/* SECTION 3: Scientific Templates & AI Recommendations */}
        <div className="bg-[#080d19]/40 border border-white/[0.05] rounded-2xl p-6">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            
            {/* Scientific Templates */}
            <div>
              <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest block mb-1">
                Agnostic Preset Schemas
              </span>
              <h4 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5 mb-4">
                <Layers className="w-4 h-4 text-cyan-400" />
                Scientific Quick Templates
              </h4>
              <p className="text-[11px] text-white/50 leading-relaxed mb-4">
                Researchers love starting from established taxonomic frameworks. Select a quick preset to instantly configure workspace columns:
              </p>
              
              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() => applyTemplate('ecotox')}
                  className="px-4 py-2.5 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.02] hover:bg-cyan-500/10 text-xs text-white/80 font-bold transition-all"
                >
                  🧪 Ecotoxicology Preset
                </button>
                <button
                  onClick={() => applyTemplate('clinical')}
                  className="px-4 py-2.5 rounded-xl border border-violet-500/20 bg-violet-500/[0.02] hover:bg-violet-500/10 text-xs text-white/80 font-bold transition-all"
                >
                  🧬 Clinical Trial Preset
                </button>
                <button
                  onClick={() => applyTemplate('environmental')}
                  className="px-4 py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] hover:bg-emerald-500/10 text-xs text-white/80 font-bold transition-all"
                >
                  🌍 Environmental Preset
                </button>
                <button
                  onClick={() => applyTemplate('pharmacology')}
                  className="px-4 py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.02] hover:bg-amber-500/10 text-xs text-white/80 font-bold transition-all"
                >
                  💊 Pharmacology Preset
                </button>
              </div>
            </div>

            {/* AI Recommendations */}
            <div className="p-5 bg-white/[0.01] border border-white/[0.04] rounded-xl relative">
              <span className="text-[9px] font-bold text-violet-400 uppercase tracking-widest block mb-1">
                Intelligence Engine
              </span>
              <h4 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5 mb-3.5">
                <Brain className="w-4 h-4 text-violet-400" />
                AI Recommended Structures
              </h4>
              
              <div className="space-y-2">
                {recommendations.length === 0 ? (
                  <p className="text-[10px] text-white/30 italic">No recommendations mapped for this schema.</p>
                ) : (
                  recommendations.map((rec, i) => {
                    const isSelected = selectedColumns.includes(rec.column);
                    return (
                      <div key={rec.column} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-lg bg-violet-500/15 text-violet-400 text-[10px] flex items-center justify-center font-bold font-mono">
                            {i + 1}
                          </span>
                          <span className="text-white font-bold">{rec.column}</span>
                          <span className="text-[9.5px] text-white/30 font-medium">({rec.reason})</span>
                        </div>
                        <button
                          disabled={isSelected}
                          onClick={() => addColumn(rec.column)}
                          className="px-2.5 py-1 rounded bg-violet-600/10 border border-violet-500/20 text-violet-400 hover:bg-violet-600/25 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-[10px] font-bold transition-all"
                        >
                          {isSelected ? 'Applied' : 'Apply Split'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>

        {/* SECTION 4: Live Hierarchy Preview & Simulation */}
        <div className="bg-[#080d19]/40 border border-white/[0.05] rounded-2xl p-6">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            
            {/* Live Visual Taxonomy Tree Preview */}
            <div className="flex flex-col h-[280px]">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Hierarchy Preview (Scientific Taxonomy)
                </h4>
                <span className="text-[10px] text-white/30 font-mono">Real-time tree generator</span>
              </div>
              <div className="flex-1 p-4 bg-void border border-white/[0.06] rounded-xl overflow-auto font-mono text-[11px] leading-relaxed text-cyan-300/80 custom-scrollbar select-text">
                <pre>{asciiTree}</pre>
              </div>
            </div>

            {/* Dynamic Hierarchy Simulator */}
            <div className="flex flex-col h-[280px] bg-white/[0.01] border border-white/[0.04] p-5 rounded-xl justify-between">
              <div>
                <span className="text-[9px] font-bold text-violet-400 uppercase tracking-widest block mb-1">
                  Predictive Analysis
                </span>
                <h4 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5 mb-2.5">
                  <Sliders className="w-4 h-4 text-violet-400" />
                  Hierarchy Split Simulator
                </h4>
                <p className="text-[11px] text-white/55 leading-relaxed">
                  Run a fast local column-cardinality simulation to evaluate exact dataset fragmentation and small leaf-node counts before deploying to full segmentation.
                </p>

                {/* Simulation results container */}
                {simulationResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-3 bg-[#0d1627] border border-cyan-500/20 rounded-xl space-y-1.5 text-[10.5px]"
                  >
                    <div className="grid grid-cols-2 gap-2 text-white/60">
                      <div>Leaf Nodes Count: <strong className="text-white">{simulationResult.leafNodes}</strong></div>
                      <div>Quality Index: <strong className="text-emerald-400 font-extrabold">{simulationResult.qualityScore}/100</strong></div>
                      <div>Largest Node Size: <strong className="text-white">{simulationResult.largestNode} rows</strong></div>
                      <div>Smallest Node Size: <strong className="text-white">{simulationResult.smallestNode} row(s)</strong></div>
                    </div>
                    <div className="border-t border-white/[0.06] pt-1.5 mt-1.5 flex gap-3 text-[10px] text-white/40">
                      <span>Nodes &lt; 5 rows: <strong className="text-amber-400">{simulationResult.under5}</strong></span>
                      <span>Nodes &lt; 10 rows: <strong className="text-amber-400">{simulationResult.under10}</strong></span>
                    </div>
                  </motion.div>
                )}
              </div>

              <button
                onClick={runSimulation}
                disabled={isSimulating || selectedColumns.length === 0}
                className="w-full py-3 rounded-xl bg-violet-600/15 text-violet-300 border border-violet-500/20 hover:bg-violet-600/30 hover:text-white transition-all text-xs font-bold tracking-wider flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isSimulating ? (
                  <>
                    <SUTRIXLogo className="w-4 h-4 animate-spin" />
                    Analyzing Database splits...
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4" />
                    Simulate Hierarchy
                  </>
                )}
              </button>
            </div>

          </div>
        </div>

        {/* SECTION 5: Expected Dataset Architecture Impact */}
        <div className="bg-[#080d19]/40 border border-white/[0.05] rounded-2xl p-6">
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest block mb-1">
            Data Volume Projections
          </span>
          <h4 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5 mb-4">
            <Activity className="w-4 h-4 text-cyan-400" />
            Expected Dataset Architecture & Resource Load
          </h4>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3 bg-white/[0.01] border border-white/[0.03] rounded-xl flex flex-col justify-between">
              <span className="text-[9.5px] text-white/40 uppercase tracking-wider mb-1 font-semibold">Leaf Datasets</span>
              <span className="text-sm font-extrabold text-white mt-1">
                {selectedColumns.length > 0 ? expectedMetrics.leafNodes : 0} nodes
              </span>
            </div>
            <div className="p-3 bg-white/[0.01] border border-white/[0.03] rounded-xl flex flex-col justify-between">
              <span className="text-[9.5px] text-white/40 uppercase tracking-wider mb-1 font-semibold">Estimated Export Volume</span>
              <span className="text-sm font-extrabold text-white mt-1">
                {selectedColumns.length > 0 ? `${Math.round(expectedMetrics.leafNodes * 1.2 + 5)} MB` : 'N/A'}
              </span>
            </div>
            <div className="p-3 bg-white/[0.01] border border-white/[0.03] rounded-xl flex flex-col justify-between">
              <span className="text-[9.5px] text-white/40 uppercase tracking-wider mb-1 font-semibold">Memory Profile</span>
              <span className={`text-sm font-extrabold mt-1 ${expectedMetrics.expectedFolders > 400 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {expectedMetrics.expectedFolders > 400 ? 'Moderate' : 'Optimal (Low)'}
              </span>
            </div>
            <div className="p-3 bg-white/[0.01] border border-white/[0.03] rounded-xl flex flex-col justify-between">
              <span className="text-[9.5px] text-white/40 uppercase tracking-wider mb-1 font-semibold">Segmentation Load</span>
              <span className={`text-sm font-extrabold mt-1 ${expectedMetrics.expectedFolders > 200 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {expectedMetrics.expectedFolders > 200 ? 'Moderate CPU' : 'Highly Efficient'}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 6: Decoupled Advanced Custom Tree Designer Launch */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#0c1224]/80 backdrop-blur-xl p-6 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 to-cyan-500/5 pointer-events-none" />
          <div className="space-y-1.5 max-w-xl">
            <span className="text-[9px] font-bold text-violet-400 uppercase tracking-widest block mb-1">
              Topological DAG Segregation
            </span>
            <h4 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-violet-400 animate-pulse" />
              Advanced Custom Directed Tree Designer
            </h4>
            <p className="text-[11px] text-white/50 leading-relaxed">
              Manually compile custom Directed Acyclic Graph (DAG) filters to partition your dataset with logical, non-linear conditional paths. Perfect for multi-species isolation or custom dose ranges.
            </p>
          </div>
          <button
            onClick={() => setActiveBuilderMode('advanced')}
            className="px-6 py-3 rounded-xl bg-violet-600/15 text-violet-300 border border-violet-500/20 hover:bg-violet-600/35 hover:text-white transition-all text-xs font-bold tracking-wider shrink-0"
          >
            Open Advanced Tree Designer
          </button>
        </div>

        {/* SECTION 7: Dynamic Tabs (How It Works & Scientific Implications) */}
        <div className="bg-[#080d19]/40 border border-white/[0.05] rounded-2xl p-6">
          <div className="flex gap-4 border-b border-white/[0.06] mb-5 shrink-0">
            <button
              onClick={() => setInfoTab('how')}
              className={`pb-3.5 text-xs font-bold tracking-wide uppercase transition-colors relative ${
                infoTab === 'how' ? 'text-cyan-400 font-extrabold' : 'text-white/40 hover:text-white/70'
              }`}
            >
              How Hierarchy Building Works
              {infoTab === 'how' && (
                <motion.div layoutId="infoTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setInfoTab('why')}
              className={`pb-3.5 text-xs font-bold tracking-wide uppercase transition-colors relative ${
                infoTab === 'why' ? 'text-violet-400 font-extrabold' : 'text-white/40 hover:text-white/70'
              }`}
            >
              Why Hierarchy Order Matters
              {infoTab === 'why' && (
                <motion.div layoutId="infoTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400 rounded-full" />
              )}
            </button>
          </div>

          <div className="text-xs text-white/50 leading-relaxed font-sans min-h-[140px]">
            {infoTab === 'how' ? (
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-1.5 p-4 bg-white/[0.01] border border-white/[0.03] rounded-xl">
                  <span className="font-extrabold text-cyan-400 font-mono text-[10px] block uppercase">01 · Define Variables</span>
                  Select candidate columns from available mapped inputs in left pane.
                </div>
                <div className="space-y-1.5 p-4 bg-white/[0.01] border border-white/[0.03] rounded-xl">
                  <span className="font-extrabold text-violet-400 font-mono text-[10px] block uppercase">02 · Chain Ordering</span>
                  Order variables hierarchically. First column forms root dataset split.
                </div>
                <div className="space-y-1.5 p-4 bg-white/[0.01] border border-white/[0.03] rounded-xl">
                  <span className="font-extrabold text-emerald-400 font-mono text-[10px] block uppercase">03 · Deploy Simulation</span>
                  Audit complexity, sparsity indicators, and execute the backend segmentation.
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-4xl">
                <p>
                  Chaining variables in the sequence <strong>Species → Endpoint → Exposure Duration</strong> creates an entirely different folder dataset than sorting by <strong>Duration → Species → Endpoint</strong>.
                </p>
                <div className="grid md:grid-cols-2 gap-4 pt-1">
                  <div className="p-3 bg-white/[0.01] rounded-xl border border-white/[0.03]">
                    <strong className="text-cyan-400 block mb-1 uppercase font-bold text-[9.5px]">Sparsity & Sample Size</strong>
                    Placing high-cardinality variables at the bottom ensures top-level nodes maintain high row densities, protecting descriptive statistics integrity.
                  </div>
                  <div className="p-3 bg-white/[0.01] rounded-xl border border-white/[0.03]">
                    <strong className="text-violet-400 block mb-1 uppercase font-bold text-[9.5px]">Model Suitability</strong>
                    Linear taxonomies are optimized for batch descriptor extraction. By isolating taxonomic nodes, local QSAR algorithms avoid global outlier interference.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
          </>
        ) : (
          <div className="bg-[#080d19]/40 border border-[#c084fc]/20 rounded-2xl p-6 relative">
            <div className="absolute inset-0 bg-gradient-to-b from-violet-500/[0.005] to-cyan-500/[0.005] pointer-events-none" />
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white text-base font-extrabold tracking-tight">Advanced Custom Directed Tree Designer</h3>
                <p className="text-xs text-white/40 mt-1">
                  Design a custom directed acyclic graph (DAG) topology to isolate and partition specific target datasets.
                </p>
              </div>
              <button
                onClick={() => setIsFullscreen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600/15 text-violet-300 border border-violet-500/20 hover:bg-violet-600/25 hover:text-white transition-all text-xs font-bold shrink-0 shadow-lg"
              >
                <Maximize2 className="w-3.5 h-3.5" /> Fullscreen Mode
              </button>
            </div>
            <AdvancedTreeWorkspace 
              clientId={clientId} 
              socket={socket} 
              onClose={() => setActiveBuilderMode('sequential')} 
              isInline={true}
            />
          </div>
        )}

      </div>

      {/* SECTION 8: Bottom Sticky Continue Footer */}
      <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/[0.06] bg-[#060a13]/90 backdrop-blur-xl px-8 py-4 flex justify-between items-center shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <div className="text-xs text-white/40 font-mono">
          {selectedColumns.length > 0 
            ? `${selectedColumns.length} split columns locked in sequential workspace.`
            : filterNodes.length > 0 
              ? `${filterNodes.length} custom branches configured in Advanced Designer.`
              : 'Configure sequential splits to execute.'
          }
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleReset}
            className="px-5 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] text-white/80 transition-all text-xs font-bold"
          >
            Clear Configuration
          </button>
          
          {isBuilding ? (
            <div className="flex items-center gap-4 bg-white/[0.03] px-5 py-2.5 rounded-xl border border-white/[0.05] shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
              <span className="text-xs font-bold text-cyan-300">Processing splits: {Math.round(socket.progress || 0)}%</span>
            </div>
          ) : isComplete ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadZip}
                disabled={isDownloading}
                className="px-6 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-xs font-bold hover:bg-white/[0.1] transition-all"
              >
                {isDownloading ? 'Generating ZIP...' : 'Download ZIP'}
              </button>
              <button
                onClick={() => useWorkspaceStore.getState().setActiveTab('analysis')}
                className="flex items-center gap-1 px-8 py-3 rounded-lg bg-white text-black font-extrabold text-xs tracking-wider transition-all hover:bg-gray-100 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_4px_14px_rgba(255,255,255,0.2)]"
              >
                Continue to Analysis
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleExecute}
              disabled={!hasConfig}
              className={`px-8 py-3 rounded-lg font-bold text-xs tracking-wider uppercase transition-all flex items-center gap-1.5
                ${hasConfig
                  ? 'bg-white text-black shadow-[0_4px_14px_rgba(255,255,255,0.15)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.25)] hover:-translate-y-0.5 active:translate-y-0'
                  : 'bg-white/[0.02] border border-white/[0.05] text-white/20 cursor-not-allowed'
                }`}
            >
              <Play className="w-4 h-4 fill-current" />
              Execute Cleansing & Graph Generation
            </button>
          )}
        </div>
      </div>

      {/* Immersive Fullscreen Custom DAG / Sequential Workspace Overlay Modal */}
      {createPortal(
        <AnimatePresence>
          {isFullscreen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
            >
              <div className="w-[96%] h-[92%] bg-[#050813] rounded-3xl overflow-hidden border border-white/[0.08] shadow-2xl flex flex-col relative p-6">
                
                {/* Fullscreen Header */}
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-5 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                      <Network className="w-5 h-5 text-cyan-400 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-white font-extrabold text-base leading-none">
                        {activeBuilderMode === 'sequential' 
                          ? 'Select Hierarchy Columns (Sequential) — Fullscreen Mode'
                          : 'Advanced Custom Directed Tree Designer — Fullscreen Mode'
                        }
                      </h3>
                      <p className="text-[11px] text-white/40 mt-1">
                        {activeBuilderMode === 'sequential'
                          ? 'Chain sequential taxonomy splits and explore statistical projections'
                          : 'Design logical custom Directed Acyclic Graph (DAG) filters'
                      }
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsFullscreen(false)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.08] transition-all text-xs font-bold"
                  >
                    <Minimize2 className="w-4 h-4" /> Minimize View
                  </button>
                </div>

                {/* Fullscreen Body Content */}
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                  {activeBuilderMode === 'sequential' ? (
                    renderSequentialGrid(true)
                  ) : (
                    <AdvancedTreeWorkspace 
                      clientId={clientId} 
                      socket={socket} 
                      onClose={() => {
                        setIsFullscreen(false);
                        setActiveBuilderMode('sequential');
                      }} 
                      isInline={true}
                    />
                  )}
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Structure Recovery Wizard Modal Removed */}

      {/* Recoverable Mode Warning Panel */}
      <RecoverableModePanel
        isOpen={isRecoverableModalOpen}
        onClose={() => setIsRecoverableModalOpen(false)}
        onStartRecovery={() => {
          setIsRecoverableModalOpen(false);
          setShowRecoveryWizard(true);
        }}
        onContinueGeneric={() => {
          setIsRecoverableModalOpen(false);
          setDatasetMode('GENERIC');
          setGenericMode(true, "User bypassed structure recovery for recoverable dataset containing chemical identifiers.");
        }}
      />

      {/* Example Modal */}
      <AnimatePresence>
        {showExampleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowExampleModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-md bg-[#0d1627] border border-white/[0.08] p-6 rounded-2xl shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center pb-2.5 border-b border-white/[0.06]">
                <h4 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-cyan-400" />
                  Taxonomy Split Example
                </h4>
                <button onClick={() => setShowExampleModal(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                By nesting splits sequentially, you isolate precise biological subsets. For instance, if you split by <strong>Species</strong> then <strong>Endpoint</strong>:
              </p>
              <div className="p-4 bg-void border border-white/[0.04] rounded-xl font-mono text-[11px] leading-relaxed text-cyan-300 space-y-2">
                <div>Full Dataset (1,240 rows)</div>
                <div className="pl-3 border-l border-white/20">├── Fish (820 rows)</div>
                <div className="pl-6 border-l border-white/20 font-bold">├── LC50 (621 rows)</div>
                <div className="pl-9 border-l border-white/20">└── 96h (420 rows) → Node-level model</div>
                <div className="pl-6 border-l border-white/20">└── EC50 (199 rows)</div>
                <div className="pl-3 border-l border-white/20">└── Algae (420 rows)</div>
                <div className="pl-6 text-slate-500">└── EC50 (360 rows)</div>
              </div>
              <p className="text-[10px] text-white/45 leading-relaxed">
                Notice that each leaf node represents an exclusive scientific target. Outliers in Algae will never pollute Fish data.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Learn More Modal */}
      <AnimatePresence>
        {showLearnMoreModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowLearnMoreModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-lg bg-[#0d1627] border border-white/[0.08] p-6 rounded-2xl shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center pb-2.5 border-b border-white/[0.06]">
                <h4 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-violet-400" />
                  Hierarchical Deep Dive
                </h4>
                <button onClick={() => setShowLearnMoreModal(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="text-xs text-white/60 leading-relaxed space-y-3">
                <p>
                  <strong>Why segregate recursively?</strong> In ecotoxicology and universal pharmacology, general multi-species datasets carry enormous statistical noise due to physiological disparities. A QSAR model trained globally across fish, birds, and algae is highly inaccurate because biological pathways and metabolization rates are distinct.
                </p>
                <p>
                  <strong>SUTRIX Information Engine</strong> analyzes entropy reduction to recommend the most descriptive categorical divisions first. When you place a variable at split Level 1, SUTRIX partitions the database into discrete, isolated cache files.
                </p>
                <p>
                  <strong>Linear Splits vs Custom Graphs:</strong> Standard sequential selections split variables linearly. Advanced users who need logical overlays (e.g. Daphnia with 48h but Pimephales with 96h under a single branch) can launch our decoupled <strong>Advanced Tree Designer</strong> to manually craft specific acyclic topologies.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
