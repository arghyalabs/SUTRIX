import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
  Activity, Sliders, CheckCircle2, Database, Download, 
  AlertTriangle, ShieldCheck, HelpCircle, BarChart2 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, 
  ResponsiveContainer, CartesianGrid, Cell 
} from 'recharts';
import { API_BASE_URL } from '../../config';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { simpleAnalysisApi } from '../../services/simpleAnalysisApi';
import { Layers } from 'lucide-react';

interface FeatureSelectionProps {
  clientId: string;
  onContinue: () => void;
}

interface EndpointDiagnostics {
  endpoint_column: string;
  endpoint_type: string;
  total_rows: number;
  missing_count: number;
  missing_endpoint_pct: number;
  unique_values: number;
  distribution: {
    min?: number;
    max?: number;
    mean?: number;
    median?: number;
    std?: number;
    skewness?: number;
    outlier_count?: number;
    outlier_pct?: number;
    class_balance?: Record<string, number>;
    imbalance_ratio?: number;
    n_classes?: number;
  };
  log_transform_recommended: boolean;
  modeling_suitability: string;
  warnings: string[];
}

interface CascadeStep {
  step: string;
  descriptors: number;
  removed: number;
}

interface ImportanceRank {
  feature: string;
  importance: number;
}

interface PipelineResponse {
  success: boolean;
  initial_descriptors: number;
  final_descriptors: number;
  final_features: string[];
  cascade_steps: CascadeStep[];
  importance_ranking: ImportanceRank[];
  task_type: string;
  endpoint_column: string;
}

export const FeatureSelection: React.FC<FeatureSelectionProps> = ({ clientId, onContinue }) => {
  // Hyperparameter states matching FeatureSelectionPayload V5
  const [variance, setVariance] = useState<number>(0.01);
  const [correlation, setCorrelation] = useState<number>(0.90);
  const [mutualInfoK, setMutualInfoK] = useState<number>(200);
  const [rfeK, setRfeK] = useState<number>(50);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<EndpointDiagnostics | null>(null);
  const [result, setResult] = useState<PipelineResponse | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(true);

  const { setDescriptorReady } = useWorkspaceStore();

  // Subgroup selection state
  const [availableSubgroups, setAvailableSubgroups] = useState<any[]>([]);
  const [selectedSubgroupNodeIds, setSelectedSubgroupNodeIds] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (clientId) {
      const fetchSubgroups = async () => {
        try {
          const data = await simpleAnalysisApi.getSubgroups(clientId);
          const activeRes = await fetch(`${API_BASE_URL}/api/simple-analysis/subgroups/${clientId}/active`);
          if (activeRes.ok) {
            const activeData = await activeRes.json();
            if (activeData.selected_node_ids && activeData.selected_node_ids.length > 0) {
              setSelectedSubgroupNodeIds(activeData.selected_node_ids);
              setAvailableSubgroups(data.filter((s: any) => activeData.selected_node_ids.includes(s.node_id)));
            } else {
              setAvailableSubgroups(data);
            }
          } else {
            setAvailableSubgroups(data);
          }
        } catch (err) {
          console.error("Failed to fetch subgroups:", err);
        }
      };
      
      fetchSubgroups().then(() => fetchDiagnostics());
    }
  }, [clientId]);

  const fetchDiagnostics = async () => {
    try {
      setLoadingDiag(true);
      const res = await fetch(`${API_BASE_URL}/api/features/${clientId}/endpoint-diagnostics`);
      if (!res.ok) {
        throw new Error("Ensure descriptors are enriched before running Step 11.");
      }
      const data = await res.json();
      setDiagnostics(data);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to fetch endpoint diagnostics');
    } finally {
      setLoadingDiag(false);
    }
  };

  const handleRunSelection = async () => {
    try {
      setIsProcessing(true);
      const toastId = toast.loading('Running feature selection cascade...');
      
      const res = await fetch(`${API_BASE_URL}/api/features/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          subgroup_ids: selectedSubgroupNodeIds,
          variance_threshold: variance,
          correlation_threshold: correlation,
          mutual_info_k: mutualInfoK,
          rfe_k: rfeK
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to run selection pipeline');
      }

      const data: PipelineResponse = await res.json();
      setResult(data);
      
      // Update store state
      const sizeTier = data.final_descriptors < 50 ? 'SMALL' : data.final_descriptors <= 200 ? 'MEDIUM' : 'LARGE';
      setDescriptorReady(data.final_descriptors, sizeTier);
      
      toast.success('Feature selection complete!', { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'Feature selection failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPackage = async () => {
    try {
      setIsDownloading(true);
      const toastId = toast.loading('Compiling export modeling package ZIP...');
      
      const response = await fetch(`${API_BASE_URL}/api/modeling/${clientId}/export-package`);
      if (!response.ok) throw new Error("Failed to compile zip package");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `sutrix_modeling_ready_${clientId.substring(0, 8)}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Package downloaded successfully!', { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'Failed to download package');
    } finally {
      setIsDownloading(false);
    }
  };

  // Funnel chart helper
  const funnelData = result ? result.cascade_steps.map((c, i) => {
    const colors = ['#64748b', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];
    return {
      name: c.step,
      count: c.descriptors,
      fill: colors[i % colors.length]
    };
  }) : [];

  // Importances chart helper
  const importancesData = result ? result.importance_ranking.slice(0, 15).map(r => ({
    name: r.feature.length > 20 ? r.feature.substring(0, 18) + '..' : r.feature,
    score: r.importance,
    fullName: r.feature
  })) : [];

  return (
    <div className="h-full flex flex-col p-8 max-w-7xl mx-auto text-white overflow-y-auto space-y-8">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <Sliders className="w-8 h-8 text-cyan-400" />
            Descriptor & Endpoint Selection
          </h1>
          <p className="text-slate-400 mt-2 max-w-3xl text-sm leading-relaxed">
            Filter out noisy, constant, or highly correlated descriptors before training. A streamlined feature space drastically improves OECD Mechanistic Interpretability and guards against overfitting.
          </p>
        </div>
        {/* Subgroup Dropdown */}
        {availableSubgroups.length > 0 && (
          <div className="relative z-20">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="px-4 py-2 bg-slate-900 border border-white/[0.06] rounded-xl flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-lg min-w-[200px] justify-between"
            >
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="font-medium truncate max-w-[150px]">
                  {selectedSubgroupNodeIds.length === 0 ? "No Subgroups Selected" : 
                   selectedSubgroupNodeIds.length === 1 ? availableSubgroups.find(s => s.node_id === selectedSubgroupNodeIds[0])?.metadata?.node_name || "1 Selected" :
                   `${selectedSubgroupNodeIds.length} Subgroups Selected`}
                </span>
              </div>
              <span className="text-xs text-slate-500">▼</span>
            </button>
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-white/[0.06] rounded-xl shadow-xl overflow-hidden py-2 max-h-64 overflow-y-auto">
                {availableSubgroups.map(subgroup => {
                  const isSelected = selectedSubgroupNodeIds.includes(subgroup.node_id);
                  return (
                    <div
                      key={subgroup.node_id}
                      className="px-4 py-2 flex items-center gap-3 hover:bg-white/[0.04] cursor-pointer"
                      onClick={() => {
                        let newSelection;
                        if (isSelected) {
                          newSelection = selectedSubgroupNodeIds.filter(id => id !== subgroup.node_id);
                        } else {
                          newSelection = [...selectedSubgroupNodeIds, subgroup.node_id];
                        }
                        setSelectedSubgroupNodeIds(newSelection);
                      }}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-cyan-500 border-cyan-500 text-slate-950' : 'border-white/[0.2] bg-transparent'}`}>
                        {isSelected && <CheckCircle2 className="w-3 h-3" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm text-slate-200 truncate">{subgroup.metadata?.node_name || subgroup.node_id}</span>
                        <span className="text-[10px] text-slate-500">{subgroup.compound_count} compounds</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 0 — Endpoint Diagnostics */}
      {loadingDiag ? (
        <div className="flex justify-center p-4">
          <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : diagnostics && (
        <div className="glass-panel p-6 border border-white/[0.06] bg-slate-900/40 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3 text-cyan-400 font-bold text-sm uppercase tracking-wider">
            <ShieldCheck className="w-5 h-5" />
            Section 0: Endpoint Diagnostics
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <DiagnosticStat label="Endpoint Name" value={diagnostics.endpoint_column} />
            <DiagnosticStat label="Endpoint Type" value={diagnostics.endpoint_type.replace('_', ' ')} />
            <DiagnosticStat label="Total Sample Size" value={diagnostics.total_rows.toLocaleString()} />
            <DiagnosticStat label="Modeling Suitability" value={diagnostics.modeling_suitability.toUpperCase()} highlight={diagnostics.modeling_suitability === 'suitable'} />
            
            <DiagnosticStat label="Missing Values" value={`${diagnostics.missing_count} (${diagnostics.missing_endpoint_pct.toFixed(1)}%)`} />
            {diagnostics.endpoint_type === 'continuous' ? (
              <>
                <DiagnosticStat label="Outliers" value={`${diagnostics.distribution?.outlier_count ?? 0} (${(diagnostics.distribution?.outlier_pct ?? 0).toFixed(1)}%)`} />
                <DiagnosticStat label="Min / Max" value={diagnostics.distribution?.min !== undefined ? `${diagnostics.distribution.min.toFixed(2)} / ${diagnostics.distribution.max?.toFixed(2)}` : 'N/A'} />
                <DiagnosticStat label="Mean / Median" value={diagnostics.distribution?.mean !== undefined ? `${diagnostics.distribution.mean.toFixed(2)} / ${diagnostics.distribution.median?.toFixed(2)}` : 'N/A'} />
              </>
            ) : (
              <>
                <DiagnosticStat label="Unique Classes" value={`${diagnostics.distribution?.n_classes ?? diagnostics.unique_values}`} />
                <DiagnosticStat label="Imbalance Ratio" value={diagnostics.distribution?.imbalance_ratio ? diagnostics.distribution.imbalance_ratio.toFixed(2) : 'N/A'} />
              </>
            )}
          </div>

          {/* Warnings */}
          {diagnostics.warnings.length > 0 && (
            <div className="space-y-2 pt-2">
              {diagnostics.warnings.map((w, idx) => (
                <div key={idx} className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-xl flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Controls & Funnel Funnels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Controls Panel */}
        <div className="glass-panel rounded-2xl p-6 border border-white/[0.06] bg-slate-900/30 flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-white/[0.06] pb-3">
              <Sliders className="w-5 h-5 text-cyan-400" />
              Cascade Controls
            </h2>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5 font-semibold text-slate-300">
                  <span>Variance Filter Threshold</span>
                  <span className="text-cyan-400 font-mono font-bold">{variance}</span>
                </div>
                <input 
                  type="range" min="0.0" max="0.1" step="0.005" 
                  value={variance} onChange={e => setVariance(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 bg-slate-800"
                />
                <p className="text-[10px] text-slate-500 mt-1">Strips near-constant descriptors with no variance.</p>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5 font-semibold text-slate-300">
                  <span>Correlation Ceiling</span>
                  <span className="text-cyan-400 font-mono font-bold">{correlation}</span>
                </div>
                <input 
                  type="range" min="0.5" max="0.99" step="0.01" 
                  value={correlation} onChange={e => setCorrelation(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 bg-slate-800"
                />
                <p className="text-[10px] text-slate-500 mt-1">Drops one of any two descriptors with high collinearity.</p>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5 font-semibold text-slate-300">
                  <span>Mutual Information Top-K</span>
                  <span className="text-cyan-400 font-mono font-bold">{mutualInfoK} features</span>
                </div>
                <input 
                  type="range" min="20" max="500" step="10" 
                  value={mutualInfoK} onChange={e => setMutualInfoK(parseInt(e.target.value))}
                  className="w-full accent-cyan-500 bg-slate-800"
                />
                <p className="text-[10px] text-slate-500 mt-1">Retains the top K features ranked by statistical target association.</p>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5 font-semibold text-slate-300">
                  <span>RFE Feature Target K</span>
                  <span className="text-cyan-400 font-mono font-bold">{rfeK} features</span>
                </div>
                <input 
                  type="range" min="5" max="150" step="5" 
                  value={rfeK} onChange={e => setRfeK(parseInt(e.target.value))}
                  className="w-full accent-cyan-500 bg-slate-800"
                />
                <p className="text-[10px] text-slate-500 mt-1">Optimal feature subset size reached via Recursive elimination.</p>
              </div>
            </div>
          </div>

          <button 
            onClick={handleRunSelection}
            disabled={isProcessing}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
          >
            {isProcessing ? <Activity className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
            Execute Feature Selection
          </button>
        </div>

        {/* Funnel Funnel */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="glass-panel rounded-2xl border border-white/[0.06] p-6 flex-1 min-h-[300px] flex flex-col bg-slate-900/10">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-cyan-400" />
              Section 1: Feature Reduction Funnel
            </h2>
            {result ? (
              <div className="flex-1 w-full h-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" tick={{fill: '#94a3b8', fontSize: 10}} />
                    <YAxis stroke="rgba(255,255,255,0.2)" tick={{fill: '#94a3b8', fontSize: 10}} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {funnelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
                <Sliders className="w-6 h-6 mb-2 text-slate-700" />
                <span>Configure hyperparameters and execute to view reduction funnel.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feature Importances (Section 2) & Export Controls (Section 3) */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Feature Importances */}
          <div className="lg:col-span-2 glass-panel rounded-2xl border border-white/[0.06] p-6 flex flex-col bg-slate-900/10 min-h-[350px]">
            <h2 className="text-lg font-bold text-white mb-4">Section 2: Feature Importance Ranking (Top 15)</h2>
            <div className="flex-1 w-full h-full min-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={importancesData} layout="vertical" margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" stroke="rgba(255,255,255,0.2)" tick={{fill: '#94a3b8', fontSize: 10}} />
                  <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.2)" tick={{fill: '#94a3b8', fontSize: 10}} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="score" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Section 3: Dataset Library & Export */}
          <div className="lg:col-span-1 glass-panel rounded-2xl border border-white/[0.06] p-6 flex flex-col justify-between bg-slate-900/30">
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-white/[0.06] pb-3">
                <Download className="w-5 h-5 text-cyan-400" />
                Section 3: Dataset Library & Export
              </h2>
              
              <p className="text-slate-400 text-xs leading-relaxed">
                Export specific QSAR-ready datasets or run a massive batch enrichment on the entire library hierarchy.
              </p>

              <div className="p-4 bg-slate-950/50 border border-white/[0.04] rounded-xl text-xs space-y-3">
                <button 
                  onClick={handleDownloadPackage}
                  disabled={isDownloading}
                  className="w-full py-2.5 rounded-lg bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  {isDownloading ? <Activity className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Export Current Subgroup
                </button>
                
                <button 
                  onClick={() => {/* TODO: Implement selected export */}}
                  className="w-full py-2.5 rounded-lg bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export Selected QSAR Ready Datasets
                </button>

                <button 
                  onClick={() => {/* TODO: Implement all export */}}
                  className="w-full py-2.5 rounded-lg bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export All QSAR Ready Datasets
                </button>
              </div>
            </div>

            <button 
              onClick={() => { window.location.href = `/workspace/${clientId}/global-enrichment` }}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-black hover:from-emerald-400 hover:to-teal-500 transition-all flex items-center justify-center gap-2 text-sm shadow-[0_0_20px_rgba(16,185,129,0.15)] mt-6"
            >
              <Layers className="w-5 h-5 fill-current" />
              Launch Global Enrichment Workspace
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface DiagnosticStatProps {
  label: string;
  value: string;
  highlight?: boolean;
}

const DiagnosticStat: React.FC<DiagnosticStatProps> = ({ label, value, highlight }) => {
  return (
    <div className="p-3 bg-white/[0.01] border border-white/[0.04] rounded-xl">
      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</span>
      <span className={`block text-sm font-bold font-mono mt-1 ${highlight ? 'text-cyan-400' : 'text-slate-200'}`}>{value}</span>
    </div>
  );
};
