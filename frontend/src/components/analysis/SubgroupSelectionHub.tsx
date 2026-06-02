import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Filter, Check, Activity, AlertTriangle, ShieldCheck, 
  ChevronRight, Award, Brain, Target, Shield, Zap, Sparkles, 
  Database, RefreshCw, Layers, CheckCircle2 
} from 'lucide-react';
import { simpleAnalysisApi } from '../../services/simpleAnalysisApi';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { toast } from 'react-hot-toast';

interface SubgroupScores {
  ai_predictability_score: number;
  qsar_potential_score: number;
  data_quality_score: number;
  chemical_diversity_score: number;
  completeness_score: number;
  balance_score: number;
  coverage_score: number;
  missingness_score: number;
  duplicate_score: number;
  overall_rank?: number;
}

interface SubgroupNode {
  node_id: string;
  subgroup_name: string;
  path: string;
  rows: number;
  compounds: number;
  missing_pct: number;
  ai_score: number;
  scores: SubgroupScores;
  recommendation: string;
  reasons: string[];
  recommended: boolean;
  is_leaf: boolean;
}

interface SubgroupSelectionHubProps {
  clientId: string;
  onContinue: () => void;
}

export const SubgroupSelectionHub: React.FC<SubgroupSelectionHubProps> = ({ clientId, onContinue }) => {
  const [subgroups, setSubgroups] = useState<SubgroupNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Dynamic Score Display State (Hover or Active Selection)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('ai_score');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  const { setActiveSubgroup } = useWorkspaceStore();

  useEffect(() => {
    fetchSubgroups();
  }, [clientId]);

  const fetchSubgroups = async () => {
    try {
      setLoading(true);
      const data = await simpleAnalysisApi.getSubgroups(clientId);
      setSubgroups(data);
      
      // Auto-select the first recommended node
      const recommended = data.find((s: SubgroupNode) => s.recommended);
      if (recommended) {
        setSelectedIds(new Set([recommended.node_id]));
      } else if (data.length > 0) {
        setSelectedIds(new Set([data[0].node_id]));
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || 'Failed to fetch subgroups');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (nodeId: string, event?: React.MouseEvent) => {
    if (event?.stopPropagation) {
      event.stopPropagation();
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        if (next.size > 1) {
          next.delete(nodeId);
        } else {
          toast.error("Please select at least one subgroup.");
        }
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Determine active display node for scores dashboard
  const activeNodeId = hoveredNodeId || Array.from(selectedIds)[0] || (subgroups.length > 0 ? subgroups[0].node_id : null);
  const activeNode = subgroups.find(s => s.node_id === activeNodeId) || subgroups[0];

  // Combined statistics for multi-select (Branch Merge Builder)
  const selectedNodes = subgroups.filter(s => selectedIds.has(s.node_id));
  const combinedRows = selectedNodes.reduce((acc, curr) => acc + curr.rows, 0);
  const combinedCompounds = selectedNodes.reduce((acc, curr) => acc + curr.compounds, 0); // Note: simple sum, backend handles deduplication on combine

  const handleIsolateClick = () => {
    if (selectedIds.size === 0) {
      toast.error('Please select at least one subgroup.');
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmIsolate = async () => {
    setShowConfirmModal(false);
    try {
      setIsProcessing(true);
      const toastId = toast.loading('Isolating chosen subgroups...');
      const res = await simpleAnalysisApi.selectSubgroups(clientId, Array.from(selectedIds));
      
      // Set in store
      const primaryNode = selectedNodes[0];
      const displayName = selectedNodes.length > 1 
        ? `Combined (${selectedNodes.length} Subgroups)`
        : primaryNode.subgroup_name;
      
      setActiveSubgroup(displayName, res.rows || combinedRows, combinedCompounds);
      
      toast.success('Subgroups isolated successfully!', { id: toastId });
      onContinue();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || 'Failed to isolate subgroups');
    } finally {
      setIsProcessing(false);
    }
  };

  // Sorting logic
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getSortedSubgroups = () => {
    const items = [...subgroups];
    items.sort((a, b) => {
      let valA: any = a[sortField as keyof SubgroupNode] ?? 0;
      let valB: any = b[sortField as keyof SubgroupNode] ?? 0;
      
      if (sortField.startsWith('scores.')) {
        const scoreKey = sortField.split('.')[1];
        valA = a.scores[scoreKey as keyof SubgroupScores] ?? 0;
        valB = b.scores[scoreKey as keyof SubgroupScores] ?? 0;
      }

      if (typeof valA === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? valA - valB : valB - valA;
    });
    return items;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 space-y-4 py-32">
        <Activity className="w-12 h-12 animate-spin text-cyan-400" />
        <p className="text-sm font-medium tracking-wide">Evaluating AI Predictability metrics for all subgroups...</p>
      </div>
    );
  }

  const activeScores = activeNode?.scores || {
    ai_predictability_score: 0,
    qsar_potential_score: 0,
    data_quality_score: 0,
    chemical_diversity_score: 0,
    completeness_score: 0,
    balance_score: 0,
    coverage_score: 0,
    missingness_score: 0,
    duplicate_score: 0,
  };

  return (
    <div className="h-full flex flex-col p-8 max-w-7xl mx-auto text-white overflow-y-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <Filter className="w-8 h-8 text-cyan-400" />
            Subgroup Selection Hub
          </h1>
          <p className="text-slate-400 mt-2 max-w-3xl text-sm leading-relaxed">
            Select high-quality chemical subgroups for QSAR modeling. Rather than building generic models on the entire dataset, isolating high-predictability domains improves OECD validation success rates and computational efficiency.
          </p>
        </div>
        <button
          onClick={handleIsolateClick}
          disabled={selectedIds.size === 0 || isProcessing}
          className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.25)] shrink-0 self-start md:self-center"
        >
          {isProcessing ? <Activity className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          Isolate Selected Subgroups
        </button>
      </div>

      {/* 9-Score Dashboard */}
      <div className="glass-panel rounded-2xl p-6 border border-white/[0.06] bg-slate-900/40 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-cyan-400" />
            <h2 className="font-bold text-white text-base">
              Predictability Dashboard: <span className="text-cyan-400">{activeNode?.subgroup_name || 'No subgroup'}</span>
            </h2>
            {hoveredNodeId && (
              <span className="text-xs bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 px-2 py-0.5 rounded-full animate-pulse">
                Previewing hovered row
              </span>
            )}
          </div>
          <span className="text-xs font-mono text-slate-500">Step 5/13</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-9 gap-4">
          <ScoreCard 
            title="AI Predictability" 
            value={activeScores.ai_predictability_score} 
            icon={<Brain className="w-4 h-4 text-cyan-400" />} 
            color="cyan"
          />
          <ScoreCard 
            title="QSAR Potential" 
            value={activeScores.qsar_potential_score} 
            icon={<Target className="w-4 h-4 text-violet-400" />} 
            color="violet"
          />
          <ScoreCard 
            title="Data Quality" 
            value={activeScores.data_quality_score} 
            icon={<Shield className="w-4 h-4 text-emerald-400" />} 
            color="emerald"
          />
          <ScoreCard 
            title="Chemical Diversity" 
            value={activeScores.chemical_diversity_score} 
            icon={<Sparkles className="w-4 h-4 text-amber-400" />} 
            color="amber"
          />
          <ScoreCard 
            title="Completeness" 
            value={activeScores.completeness_score} 
            icon={<Database className="w-4 h-4 text-blue-400" />} 
            color="blue"
          />
          <ScoreCard 
            title="Balance" 
            value={activeScores.balance_score} 
            icon={<Layers className="w-4 h-4 text-rose-400" />} 
            color="rose"
          />
          <ScoreCard 
            title="Coverage" 
            value={activeScores.coverage_score} 
            icon={<Zap className="w-4 h-4 text-yellow-400" />} 
            color="yellow"
          />
          <ScoreCard 
            title="Missingness" 
            value={activeScores.missingness_score} 
            icon={<RefreshCw className="w-4 h-4 text-indigo-400" />} 
            color="indigo"
          />
          <ScoreCard 
            title="Duplicate Score" 
            value={activeScores.duplicate_score} 
            icon={<Layers className="w-4 h-4 text-orange-400" />} 
            color="orange"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Branch Merge Builder (Left Panel) */}
        <div className="lg:col-span-1 glass-panel rounded-2xl p-6 border border-white/[0.06] bg-slate-900/30 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm uppercase tracking-wider">
              <ShieldCheck className="w-5 h-5" />
              Merge Builder
            </div>
            
            <p className="text-slate-400 text-xs leading-relaxed">
              Multi-select subgroups to combine their compound scopes. SUTRIX will intelligently deduplicate structures and construct a unified active dataset downstream.
            </p>

            <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Selection Summary</div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Selected Count</span>
                <span className="font-bold font-mono text-cyan-400">{selectedIds.size}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Total Rows</span>
                <span className="font-bold font-mono text-white">{combinedRows.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Unique Compounds</span>
                <span className="font-bold font-mono text-white">{combinedCompounds.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Recommendation Guidance</div>
            {selectedNodes.length === 1 && selectedNodes[0].recommended && (
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs rounded-lg flex gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Excellent choice. This subgroup has high predictability, adequate volume, and is ready for enrichment.</span>
              </div>
            )}
            {selectedIds.size > 1 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-lg flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Warning: Merging different subgroups might introduce chemical heterogeneity, shifting distributions.</span>
              </div>
            )}
            {selectedNodes.some(s => s.ai_score < 50) && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Selected subgroups include low predictability scores. Modeling results might have high error rates.</span>
              </div>
            )}
          </div>

          {/* New Selected Lineage Tree Section */}
          <div className="space-y-3 pt-4 border-t border-white/[0.06] flex-1 min-h-[200px]">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
              <Layers className="w-4 h-4" /> Detailed Lineage Tree
            </div>
            <div className="max-h-80 overflow-y-auto pr-2 space-y-4">
              {selectedNodes.length === 0 ? (
                <div className="text-xs text-slate-500 italic">No subgroups selected.</div>
              ) : (
                selectedNodes.map(node => (
                  <div key={node.node_id} className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl flex flex-col gap-2">
                    <div className="text-xs font-bold text-white flex items-center justify-between">
                      <span className="truncate">{node.subgroup_name}</span>
                      <span className="text-cyan-400 font-mono ml-2 shrink-0">{node.rows} rows</span>
                    </div>
                    <div className="flex flex-col gap-1.5 relative ml-1">
                      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/[0.06]" />
                      {node.path.split(' > ').map((step, idx, arr) => (
                        <div key={idx} className="flex items-center gap-2.5 relative z-10">
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 border bg-slate-900 ${idx === arr.length - 1 ? 'border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]' : 'border-slate-700'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${idx === arr.length - 1 ? 'bg-cyan-400' : 'bg-slate-500'}`} />
                          </div>
                          <span className={`text-[10px] font-mono truncate ${idx === arr.length - 1 ? 'text-cyan-400 font-semibold' : 'text-slate-400'}`} title={step}>
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Ranked Candidate Table (Right Panel) */}
        <div className="lg:col-span-3 glass-panel rounded-2xl border border-white/[0.06] overflow-hidden flex flex-col bg-slate-900/20">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.03]">
                  <th className="p-4 font-semibold text-xs text-slate-400 uppercase tracking-wider w-16">Select</th>
                  <th 
                    className="p-4 font-semibold text-xs text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white"
                    onClick={() => handleSort('subgroup_name')}
                  >
                    Subgroup Name {sortField === 'subgroup_name' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th 
                    className="p-4 font-semibold text-xs text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white text-right"
                    onClick={() => handleSort('rows')}
                  >
                    Rows {sortField === 'rows' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th 
                    className="p-4 font-semibold text-xs text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white text-right"
                    onClick={() => handleSort('compounds')}
                  >
                    Compounds {sortField === 'compounds' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th 
                    className="p-4 font-semibold text-xs text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white text-right"
                    onClick={() => handleSort('missing_pct')}
                  >
                    Missing % {sortField === 'missing_pct' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th 
                    className="p-4 font-semibold text-xs text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white text-center"
                    onClick={() => handleSort('ai_score')}
                  >
                    AI Score {sortField === 'ai_score' && (sortAsc ? '▲' : '▼')}
                  </th>
                  <th className="p-4 font-semibold text-xs text-slate-400 uppercase tracking-wider text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {getSortedSubgroups().map((node) => {
                  const isSelected = selectedIds.has(node.node_id);
                  let rankEmoji = '▫️';
                  const rank = node.scores.overall_rank || 99;
                  if (rank === 1) rankEmoji = '🥇';
                  else if (rank === 2) rankEmoji = '🥈';
                  else if (rank === 3) rankEmoji = '🥉';

                  let statusBg = 'bg-slate-700/30 border-slate-700/50 text-slate-400';
                  let statusText = 'Fair';
                  if (node.recommended) {
                    statusBg = 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400';
                    statusText = 'Recommended';
                  } else if (node.ai_score >= 70) {
                    statusBg = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
                    statusText = 'Good';
                  } else if (node.ai_score < 50) {
                    statusBg = 'bg-rose-500/10 border-rose-500/20 text-rose-400';
                    statusText = 'Poor';
                  }

                  return (
                    <tr 
                      key={node.node_id} 
                      className={`transition-colors cursor-pointer hover:bg-white/[0.02] ${isSelected ? 'bg-cyan-500/5' : ''}`}
                      onClick={() => handleToggleSelect(node.node_id, {} as any)}
                      onMouseEnter={() => setHoveredNodeId(node.node_id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                    >
                      <td className="p-4">
                        <div 
                          onClick={(e) => handleToggleSelect(node.node_id, e)}
                          className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                            isSelected 
                              ? 'bg-cyan-500 border-cyan-500 text-slate-900 shadow-[0_0_10px_rgba(6,182,212,0.3)]' 
                              : 'border-white/20 bg-black/20 hover:border-cyan-400'
                          }`}
                        >
                          {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-white flex items-center gap-2">
                          <span className="text-sm">{rankEmoji}</span>
                          <span>{node.subgroup_name}</span>
                          {node.recommended && <ShieldCheck className="w-4 h-4 text-cyan-400" />}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-1 max-w-[280px] truncate">{node.path}</div>
                      </td>
                      <td className="p-4 text-slate-300 font-mono text-sm text-right">{node.rows.toLocaleString()}</td>
                      <td className="p-4 text-slate-300 font-mono text-sm text-right">{node.compounds.toLocaleString()}</td>
                      <td className="p-4 text-slate-300 font-mono text-sm text-right">{node.missing_pct.toFixed(1)}%</td>
                      <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border ${
                          node.ai_score >= 80 ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/5' :
                          node.ai_score >= 60 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' :
                          'text-rose-400 border-rose-500/30 bg-rose-500/5'
                        }`}>
                          {node.ai_score.toFixed(0)}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusBg}`}>
                          {statusText}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md p-6 border rounded-3xl bg-slate-900 border-slate-800 shadow-2xl flex flex-col space-y-4"
            >
              <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3 text-cyan-400">
                <CheckCircle2 className="w-6 h-6" />
                <h3 className="text-lg font-bold text-white">Confirm Subgroup Lock-in</h3>
              </div>

              <div className="space-y-3 py-2 text-sm text-slate-300">
                <p>
                  You are about to isolate <strong className="text-white">{selectedIds.size}</strong> chemical subgroup(s) for the downstream modeling pipeline.
                </p>
                <div className="p-4 bg-slate-950/50 rounded-xl border border-white/[0.04] space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Isolated Rows:</span>
                    <span className="font-mono text-white font-bold">{combinedRows.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Compounds:</span>
                    <span className="font-mono text-white font-bold">{combinedCompounds.toLocaleString()}</span>
                  </div>
                </div>
                <blockquote className="p-3 bg-cyan-950/20 border-l-2 border-cyan-400 text-xs text-cyan-300 rounded-r-lg mt-2">
                  ⚠️ <strong>Mandate 1:</strong> Downstream operations (Steps 6-13) will operate exclusively on this isolated subgroup. Root dataset will not be referenced again.
                </blockquote>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmIsolate}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-bold hover:from-cyan-300 hover:to-blue-400 text-xs transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                >
                  Lock-in & Continue
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface ScoreCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

const ScoreCard: React.FC<ScoreCardProps> = ({ title, value, icon, color }) => {
  let colorClass = 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5';
  if (color === 'emerald') colorClass = 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
  if (color === 'rose') colorClass = 'text-rose-400 border-rose-500/20 bg-rose-500/5';
  if (color === 'violet') colorClass = 'text-violet-400 border-violet-500/20 bg-violet-500/5';
  if (color === 'amber') colorClass = 'text-amber-400 border-amber-500/20 bg-amber-500/5';
  if (color === 'blue') colorClass = 'text-blue-400 border-blue-500/20 bg-blue-500/5';
  if (color === 'yellow') colorClass = 'text-yellow-400 border-yellow-500/20 bg-yellow-500/5';
  if (color === 'indigo') colorClass = 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5';
  if (color === 'orange') colorClass = 'text-orange-400 border-orange-500/20 bg-orange-500/5';

  return (
    <div className={`p-3 rounded-xl border flex flex-col justify-between h-[105px] ${colorClass} transition-all duration-200 hover:scale-[1.02]`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider line-clamp-2 leading-tight text-slate-400">{title}</span>
        <span className="shrink-0">{icon}</span>
      </div>
      <div className="text-2xl font-black tracking-tight mt-2 text-white">{value.toFixed(0)}</div>
    </div>
  );
};
