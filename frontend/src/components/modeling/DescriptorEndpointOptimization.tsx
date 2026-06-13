/**
 * DescriptorEndpointOptimization.tsx
 * SUTRIX V5 — Step 11: Descriptor & Endpoint Optimization
 *
 * PURPOSE: SCIENTIFIC DATASET CREATION WORKSPACE
 * This page CREATES modeling-ready datasets. It does NOT export, download, or manage a library.
 *
 * Sections:
 *  1. Descriptor Reduction Funnel
 *  2. Feature Importance Ranking
 *  3. Endpoint Diagnostics & Selection
 *  4. Descriptor Family Configuration
 *  5. Model Preparation Summary
 *  6. Generate Modeling-Ready Dataset
 */

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import {
  Activity, Sliders, CheckCircle2, Database, AlertTriangle,
  ShieldCheck, BarChart2, FlaskConical, Layers, ChevronDown,
  TrendingUp, Target, Cpu, Zap, Info, CheckSquare, Square,
  Brain, Atom, Lock, Unlock, RefreshCw
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts';
import { API_BASE_URL } from '../../config';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { simpleAnalysisApi } from '../../services/simpleAnalysisApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
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
    min?: number; max?: number; mean?: number; median?: number;
    std?: number; skewness?: number; outlier_count?: number;
    outlier_pct?: number; class_balance?: Record<string, number>;
    imbalance_ratio?: number; n_classes?: number;
  };
  log_transform_recommended: boolean;
  modeling_suitability: string;
  warnings: string[];
  recommended_algorithms?: string[];
  difficulty_score?: number;
  predictability_score?: number;
}

interface CascadeStep {
  step: string;
  descriptors: number;
  removed: number;
}

interface ImportanceRank {
  feature: string;
  importance: number;
  family?: string;
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
  total_rows: number;
  total_compounds: number;
}

interface DescriptorFamily {
  id: string;
  name: string;
  count: number;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DESCRIPTOR_FAMILIES: DescriptorFamily[] = [
  { id: 'rdkit',       name: 'RDKit',            count: 208,  description: 'Topological, constitutional, and electronic', icon: <Atom className="w-4 h-4" />,       enabled: true  },
  { id: 'mordred',     name: 'Mordred',           count: 1613, description: '3D and 2D molecular descriptors',             icon: <FlaskConical className="w-4 h-4" />, enabled: false },
  { id: 'morgan',      name: 'Morgan FP',         count: 2048, description: 'Circular fingerprints (ECFP4)',               icon: <Layers className="w-4 h-4" />,      enabled: true  },
  { id: 'maccs',       name: 'MACCS Keys',        count: 166,  description: '166-bit structural keys',                    icon: <Database className="w-4 h-4" />,    enabled: false },
  { id: 'padel',       name: 'PaDEL',             count: 1444, description: 'Physicochemical and topological',             icon: <Cpu className="w-4 h-4" />,         enabled: false },
  { id: 'physico',     name: 'Physicochemical',   count: 42,   description: 'LogP, MW, TPSA, HBD/HBA',                   icon: <TrendingUp className="w-4 h-4" />,  enabled: true  },
  { id: 'druglike',    name: 'Drug-likeness',     count: 18,   description: 'Lipinski, Veber, Egan rules',                icon: <ShieldCheck className="w-4 h-4" />, enabled: false },
  { id: 'toxicity',    name: 'Toxicity',          count: 64,   description: 'OECD toxicophore alerts',                    icon: <AlertTriangle className="w-4 h-4" />,enabled: false },
];

const STEP_COLORS = ['#64748b', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];

// ─── Main Component ───────────────────────────────────────────────────────────

export const DescriptorEndpointOptimization: React.FC<Props> = ({ clientId, onContinue }) => {
  // Cascade controls
  const [variance, setVariance]       = useState(0.01);
  const [correlation, setCorrelation] = useState(0.90);
  const [mutualInfoK, setMutualInfoK] = useState(200);
  const [rfeK, setRfeK]               = useState(50);

  // Descriptor families
  const [families, setFamilies] = useState<DescriptorFamily[]>(DESCRIPTOR_FAMILIES);

  // UI state
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving]         = useState(false);
  const [result, setResult]             = useState<PipelineResponse | null>(null);
  const [diagnostics, setDiagnostics]   = useState<EndpointDiagnostics | null>(null);
  const [loadingDiag, setLoadingDiag]   = useState(true);
  const [lastSaved, setLastSaved]       = useState<string | null>(null);

  // Subgroup selector
  const [availableSubgroups, setAvailableSubgroups] = useState<any[]>([]);
  const [selectedSubgroupNodeIds, setSelectedSubgroupNodeIds] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const { setDescriptorReady } = useWorkspaceStore();

  const enabledFamilyCount = families.filter(f => f.enabled).reduce((sum, f) => sum + f.count, 0);

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const fetchDiagnostics = useCallback(async () => {
    try {
      setLoadingDiag(true);
      const res = await fetch(`${API_BASE_URL}/api/features/${clientId}/endpoint-diagnostics`);
      if (!res.ok) throw new Error("Run Descriptor Enrichment (Step 8) before Step 11.");
      setDiagnostics(await res.json());
    } catch (err: any) {
      toast.error(err.message || 'Failed to load endpoint diagnostics');
    } finally {
      setLoadingDiag(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        const data = await simpleAnalysisApi.getSubgroups(clientId);
        const activeRes = await fetch(`${API_BASE_URL}/api/analysis/subgroups/${clientId}/active`);
        if (activeRes.ok) {
          const activeData = await activeRes.json();
          if (activeData.selected_node_ids?.length > 0) {
            setSelectedSubgroupNodeIds(activeData.selected_node_ids);
            setAvailableSubgroups(data.filter((s: any) => activeData.selected_node_ids.includes(s.node_id)));
          } else {
            setAvailableSubgroups(data);
          }
        } else {
          setAvailableSubgroups(data);
        }
      } catch {}
      await fetchDiagnostics();
    })();
  }, [clientId, fetchDiagnostics]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleRunOptimization = async () => {
    try {
      setIsProcessing(true);
      const toastId = toast.loading('Running descriptor optimization cascade…');
      const res = await fetch(`${API_BASE_URL}/api/features/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          subgroup_ids: selectedSubgroupNodeIds,
          variance_threshold: variance,
          correlation_threshold: correlation,
          mutual_info_k: mutualInfoK,
          rfe_k: rfeK,
          descriptor_families: families.filter(f => f.enabled).map(f => f.id),
        })
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.detail || 'Optimization pipeline failed');
      }
      const data: PipelineResponse = await res.json();
      setResult(data);
      const sizeTier = data.final_descriptors < 50 ? 'SMALL' : data.final_descriptors <= 200 ? 'MEDIUM' : 'LARGE';
      setDescriptorReady(data.final_descriptors, sizeTier);
      toast.success('Descriptor optimization complete!', { id: toastId });
    } catch (err: any) {
      toast.error(err.message || 'Optimization failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateDataset = async () => {
    if (!result) { toast.error('Run optimization cascade first.'); return; }
    try {
      setIsSaving(true);
      const toastId = toast.loading('Saving modeling-ready dataset to registry…');
      const res = await fetch(`${API_BASE_URL}/api/features/${clientId}/generate-dataset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subgroup_ids: selectedSubgroupNodeIds,
          variance_threshold: variance,
          correlation_threshold: correlation,
          mutual_info_k: mutualInfoK,
          rfe_k: rfeK,
          descriptor_families: families.filter(f => f.enabled).map(f => f.id),
        })
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.detail || 'Failed to save dataset');
      }
      const data = await res.json();
      setLastSaved(data.version_name || 'v1');
      toast.success(`Saved as ${data.version_name} — view in Step 13 Dataset Library`, { id: toastId, duration: 5000 });
    } catch (err: any) {
      toast.error(err.message || 'Failed to save dataset');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Derived chart data ────────────────────────────────────────────────────

  const funnelData = result ? result.cascade_steps.map((c, i) => ({
    name: c.step.replace(/[()=≤≥]/g, '').trim().substring(0, 22),
    count: c.descriptors,
    removed: c.removed,
    fill: STEP_COLORS[i % STEP_COLORS.length],
  })) : [];

  const importancesData = result ? result.importance_ranking.slice(0, 15).map(r => ({
    name: r.feature.length > 22 ? r.feature.substring(0, 20) + '…' : r.feature,
    score: r.importance,
    fullName: r.feature,
    family: r.family || 'RDKit',
  })) : [];

  // ─── Computed model readiness ─────────────────────────────────────────────

  const samplesPerFeature = result ? (result.total_rows / Math.max(result.final_descriptors, 1)) : null;
  const aiReadiness = diagnostics ? Math.max(0, Math.min(100, Math.round(
    (diagnostics.modeling_suitability === 'suitable' ? 60 : 30) +
    (1 - diagnostics.missing_endpoint_pct / 100) * 25 +
    (samplesPerFeature ? Math.min(15, samplesPerFeature / 10) : 0)
  ))) : null;
  const qsarReadiness = aiReadiness ? Math.max(0, Math.min(100, Math.round(aiReadiness * 0.95))) : null;
  const oecdReadiness = aiReadiness ? Math.max(0, Math.min(100, Math.round(aiReadiness * 0.88))) : null;

  const recommendedModels = diagnostics?.recommended_algorithms ||
    (diagnostics?.endpoint_type === 'continuous'
      ? ['Random Forest', 'XGBoost', 'ExtraTrees']
      : ['Random Forest Classifier', 'SVM', 'Gradient Boosting']);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-y-auto bg-[#050d1a] text-white">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-[#050d1a]/95 backdrop-blur-md border-b border-white/[0.05] px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white">Descriptor &amp; Endpoint Optimization</h1>
            <p className="text-xs text-slate-500">Step 11 of 13 · Scientific Dataset Engineering Workspace</p>
          </div>
        </div>

        {/* Subgroup dropdown */}
        {availableSubgroups.length > 0 && (
          <div className="relative z-20">
            <button
              onClick={() => setIsDropdownOpen(o => !o)}
              className="px-4 py-2 bg-slate-900/80 border border-white/[0.08] rounded-xl flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-lg min-w-[210px] justify-between"
            >
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="font-medium truncate max-w-[150px]">
                  {selectedSubgroupNodeIds.length === 0 ? 'All Subgroups' :
                   selectedSubgroupNodeIds.length === 1 ? availableSubgroups.find(s => s.node_id === selectedSubgroupNodeIds[0])?.subgroup_name || '1 Subgroup' :
                   `${selectedSubgroupNodeIds.length} Subgroups`}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-950 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden py-2 max-h-64 overflow-y-auto">
                {availableSubgroups.map(sg => {
                  const isSel = selectedSubgroupNodeIds.includes(sg.node_id);
                  return (
                    <div
                      key={sg.node_id}
                      className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.04] cursor-pointer"
                      onClick={() => {
                        setSelectedSubgroupNodeIds(isSel
                          ? selectedSubgroupNodeIds.filter(id => id !== sg.node_id)
                          : [...selectedSubgroupNodeIds, sg.node_id]);
                      }}
                    >
                      {isSel ? <CheckSquare className="w-4 h-4 text-cyan-400 shrink-0" /> : <Square className="w-4 h-4 text-slate-600 shrink-0" />}
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm text-slate-200 truncate">{sg.subgroup_name || sg.node_id}</span>
                        <span className="text-[10px] text-slate-500">{sg.compounds} compounds</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 p-8 space-y-6">

        {/* ══ TOP BAND: Cascade Controls + Funnel side-by-side ══════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Cascade Controls — left panel */}
          <div className="lg:col-span-4 bg-slate-900/40 border border-white/[0.06] rounded-2xl p-6 flex flex-col gap-5">
            <div className="flex items-center gap-2 border-b border-white/[0.05] pb-3">
              <Sliders className="w-5 h-5 text-cyan-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Cascade Controls</h2>
            </div>

            <SliderControl
              label="Variance Filter Threshold"
              value={variance} min={0} max={0.1} step={0.005}
              onChange={setVariance}
              hint="Removes near-constant descriptors with negligible spread."
            />
            <SliderControl
              label="Correlation Ceiling"
              value={correlation} min={0.5} max={0.99} step={0.01}
              onChange={setCorrelation}
              hint="Drops one of any two highly collinear features (Pearson > threshold)."
            />
            <SliderControl
              label="Mutual Information Top-K"
              value={mutualInfoK} min={20} max={500} step={10}
              onChange={setMutualInfoK}
              hint="Retains the top K features ranked by statistical target association."
              suffix=" features"
            />
            <SliderControl
              label="RFE Feature Target K"
              value={rfeK} min={5} max={150} step={5}
              onChange={setRfeK}
              hint="Final feature subset size via Recursive Feature Elimination."
              suffix=" features"
            />

            <button
              onClick={handleRunOptimization}
              disabled={isProcessing}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.2)] mt-auto"
            >
              {isProcessing ? <Activity className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
              {isProcessing ? 'Optimizing…' : 'Run Optimization Cascade'}
            </button>
          </div>

          {/* SECTION 1: Descriptor Reduction Funnel — right panel */}
          <div className="lg:col-span-8 bg-slate-900/20 border border-white/[0.06] rounded-2xl p-6 flex flex-col min-h-[340px]">
            <div className="flex items-center gap-2 border-b border-white/[0.05] pb-3 mb-4">
              <BarChart2 className="w-5 h-5 text-cyan-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Section 1 — Descriptor Reduction Funnel</h2>
              {result && (
                <span className="ml-auto text-xs text-cyan-400 font-mono">
                  {result.initial_descriptors.toLocaleString()} → {result.final_descriptors.toLocaleString()} features
                </span>
              )}
            </div>

            {result ? (
              <div className="flex gap-6 flex-1">
                {/* Bar chart */}
                <div className="flex-1" style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} margin={{ top: 5, right: 5, left: -20, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="name" stroke="rgba(255,255,255,0.15)" tick={{ fill: '#64748b', fontSize: 9 }} angle={-25} textAnchor="end" />
                      <YAxis stroke="rgba(255,255,255,0.15)" tick={{ fill: '#64748b', fontSize: 10 }} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'rgba(10,18,35,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(val: any, _: any, p: any) => [`${val} descriptors (−${p.payload.removed} removed)`, '']}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {funnelData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Step cards */}
                <div className="flex flex-col gap-2 min-w-[160px] justify-center">
                  {result.cascade_steps.map((s, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                      <span className="text-[10px] text-slate-400 truncate max-w-[80px]">{s.step.split('(')[0].trim()}</span>
                      <div className="text-right">
                        <span className="text-xs font-bold text-white font-mono">{s.descriptors.toLocaleString()}</span>
                        {s.removed > 0 && <span className="block text-[9px] text-rose-400 font-mono">−{s.removed}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-3">
                <Sliders className="w-10 h-10 text-slate-800" />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-500">Configure cascade controls and run optimization</p>
                  <p className="text-xs text-slate-700 mt-1">The funnel will visualize descriptor reduction at each stage</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: Feature Importance Ranking */}
        {result && (
          <div className="bg-slate-900/20 border border-white/[0.06] rounded-2xl p-6">
            <div className="flex items-center gap-2 border-b border-white/[0.05] pb-3 mb-4">
              <TrendingUp className="w-5 h-5 text-violet-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Section 2 — Feature Importance Ranking</h2>
              <span className="ml-auto text-xs text-slate-500">Top 15 of {result.final_descriptors} selected</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={importancesData} layout="vertical" margin={{ top: 5, right: 10, left: 35, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis type="number" stroke="rgba(255,255,255,0.15)" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.15)" tick={{ fill: '#94a3b8', fontSize: 10 }} width={80} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'rgba(10,18,35,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(v: any, _: any, p: any) => [v.toFixed(4), p.payload.fullName]}
                    />
                    <Bar dataKey="score" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {result.importance_ranking.slice(0, 15).map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                    <span className="text-[10px] font-bold text-slate-600 font-mono w-5 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-300 truncate">{r.feature}</p>
                      <p className="text-[10px] text-slate-600">{r.family || 'RDKit'}</p>
                    </div>
                    <span className="text-xs font-mono text-violet-400 shrink-0">{r.importance.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: Endpoint Diagnostics */}
        <div className="bg-slate-900/30 border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center gap-2 border-b border-white/[0.05] pb-3 mb-4">
            <Target className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Section 3 — Endpoint Diagnostics</h2>
            {diagnostics && (
              <span className={`ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full ${diagnostics.modeling_suitability === 'suitable' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                {diagnostics.modeling_suitability.toUpperCase()}
              </span>
            )}
          </div>

          {loadingDiag ? (
            <div className="flex items-center justify-center py-8 gap-3 text-slate-500">
              <Activity className="w-5 h-5 animate-spin text-cyan-500" />
              <span className="text-sm">Loading endpoint diagnostics…</span>
            </div>
          ) : diagnostics ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <DiagStat label="Endpoint" value={diagnostics.endpoint_column} accent />
                <DiagStat label="Task Type" value={diagnostics.endpoint_type === 'continuous' ? 'Regression' : 'Classification'} />
                <DiagStat label="Samples" value={diagnostics.total_rows.toLocaleString()} />
                <DiagStat label="Missing Values" value={`${diagnostics.missing_endpoint_pct.toFixed(1)}%`} warn={diagnostics.missing_endpoint_pct > 10} />
                {diagnostics.endpoint_type === 'continuous' ? (
                  <>
                    <DiagStat label="Min / Max" value={`${diagnostics.distribution.min?.toFixed(2)} / ${diagnostics.distribution.max?.toFixed(2)}`} />
                    <DiagStat label="Mean / Median" value={`${diagnostics.distribution.mean?.toFixed(2)} / ${diagnostics.distribution.median?.toFixed(2)}`} />
                    <DiagStat label="Skewness" value={diagnostics.distribution.skewness?.toFixed(3) ?? 'N/A'} warn={Math.abs(diagnostics.distribution.skewness ?? 0) > 1} />
                    <DiagStat label="Outliers" value={`${diagnostics.distribution.outlier_count ?? 0} (${(diagnostics.distribution.outlier_pct ?? 0).toFixed(1)}%)`} />
                  </>
                ) : (
                  <>
                    <DiagStat label="Classes" value={String(diagnostics.distribution.n_classes ?? diagnostics.unique_values)} />
                    <DiagStat label="Imbalance Ratio" value={diagnostics.distribution.imbalance_ratio?.toFixed(2) ?? 'N/A'} warn={(diagnostics.distribution.imbalance_ratio ?? 1) > 3} />
                  </>
                )}
                {diagnostics.log_transform_recommended && (
                  <DiagStat label="Log Transform" value="Recommended" warn />
                )}
              </div>

              {/* Recommended Algorithms */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Recommended Algorithms</p>
                <div className="flex flex-wrap gap-2">
                  {recommendedModels.map(algo => (
                    <span key={algo} className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300">
                      {algo}
                    </span>
                  ))}
                </div>
              </div>

              {/* Scores */}
              {(diagnostics.difficulty_score !== undefined || diagnostics.predictability_score !== undefined) && (
                <div className="flex gap-4">
                  {diagnostics.difficulty_score !== undefined && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <Brain className="w-4 h-4 text-orange-400" />
                      <span className="text-xs text-slate-400">Difficulty:</span>
                      <span className="text-sm font-bold text-orange-400">{diagnostics.difficulty_score}/100</span>
                    </div>
                  )}
                  {diagnostics.predictability_score !== undefined && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs text-slate-400">Predictability:</span>
                      <span className="text-sm font-bold text-emerald-400">{diagnostics.predictability_score}/100</span>
                    </div>
                  )}
                </div>
              )}

              {/* Warnings */}
              {diagnostics.warnings.length > 0 && (
                <div className="space-y-1.5">
                  {diagnostics.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 bg-amber-500/[0.08] border border-amber-500/15 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-xs text-amber-300">{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-slate-600 gap-2">
              <Info className="w-5 h-5" />
              <span className="text-sm">Endpoint diagnostics unavailable — ensure Step 8 (Descriptor Enrichment) is complete</span>
            </div>
          )}
        </div>

        {/* SECTION 4: Descriptor Family Configuration */}
        <div className="bg-slate-900/30 border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center gap-2 border-b border-white/[0.05] pb-3 mb-4">
            <Atom className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Section 4 — Descriptor Family Configuration</h2>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-slate-500">Estimated total:</span>
              <span className="text-sm font-bold font-mono text-cyan-400">{enabledFamilyCount.toLocaleString()} features</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {families.map(fam => (
              <button
                key={fam.id}
                onClick={() => setFamilies(prev => prev.map(f => f.id === fam.id ? { ...f, enabled: !f.enabled } : f))}
                className={`text-left p-4 rounded-xl border transition-all ${fam.enabled
                  ? 'bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.08)]'
                  : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04]'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-1.5 rounded-lg ${fam.enabled ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/[0.05] text-slate-500'}`}>
                    {fam.icon}
                  </div>
                  {fam.enabled
                    ? <Unlock className="w-3.5 h-3.5 text-cyan-400" />
                    : <Lock className="w-3.5 h-3.5 text-slate-600" />}
                </div>
                <p className={`font-bold text-sm ${fam.enabled ? 'text-white' : 'text-slate-400'}`}>{fam.name}</p>
                <p className="text-[10px] text-slate-600 mt-0.5 mb-1.5">{fam.description}</p>
                <p className={`text-xs font-mono font-bold ${fam.enabled ? 'text-cyan-400' : 'text-slate-600'}`}>
                  {fam.count.toLocaleString()} descriptors
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* SECTION 5: Model Preparation Summary */}
        <div className="bg-slate-900/30 border border-white/[0.06] rounded-2xl p-6">
          <div className="flex items-center gap-2 border-b border-white/[0.05] pb-3 mb-4">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Section 5 — Model Preparation Summary</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <ReadinessStat label="Rows" value={result ? result.total_rows.toLocaleString() : diagnostics ? diagnostics.total_rows.toLocaleString() : '—'} />
            <ReadinessStat label="Compounds" value={result ? result.total_compounds.toLocaleString() : '—'} />
            <ReadinessStat label="Endpoint" value={diagnostics?.endpoint_column || '—'} small />
            <ReadinessStat label="Descriptors" value={result ? result.final_descriptors.toLocaleString() : enabledFamilyCount.toLocaleString() + '*'} accent />
            <ReadinessStat label="Samples/Feature" value={samplesPerFeature ? samplesPerFeature.toFixed(1) : '—'} warn={!!samplesPerFeature && samplesPerFeature < 5} />
            <ReadinessStat label="AI Readiness" value={aiReadiness !== null ? `${aiReadiness}%` : '—'} accent={!!aiReadiness && aiReadiness >= 70} />
            <ReadinessStat label="QSAR Readiness" value={qsarReadiness !== null ? `${qsarReadiness}%` : '—'} accent={!!qsarReadiness && qsarReadiness >= 70} />
            <ReadinessStat label="OECD Readiness" value={oecdReadiness !== null ? `${oecdReadiness}%` : '—'} accent={!!oecdReadiness && oecdReadiness >= 70} />
          </div>

          {samplesPerFeature !== null && samplesPerFeature < 5 && (
            <div className="mt-4 p-3 bg-rose-500/[0.08] border border-rose-500/15 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-300">
                <strong>Low samples-per-feature ratio ({samplesPerFeature.toFixed(1)}:1).</strong> Increase RFE K or reduce Mutual Information K to reduce overfitting risk. Aim for at least 5:1.
              </p>
            </div>
          )}
        </div>

        {/* SECTION 6: Generate Modeling-Ready Dataset */}
        <div className="bg-gradient-to-br from-slate-900/60 to-cyan-950/20 border border-cyan-500/[0.12] rounded-2xl p-6">
          <div className="flex items-center gap-2 border-b border-white/[0.05] pb-3 mb-4">
            <Database className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Section 6 — Generate Modeling-Ready Dataset</h2>
          </div>

          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
            <div className="flex-1">
              <p className="text-sm text-slate-300 leading-relaxed">
                Save the optimized dataset to your <strong className="text-cyan-400">Modeling Dataset Registry</strong>. 
                Each version is stored with full lineage, OECD metadata, and feature importance rankings. 
                Access and export datasets from <strong className="text-cyan-400">Step 13 — Dataset Library</strong>.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Versioned automatically
                </span>
                <span className="px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> OECD metadata attached
                </span>
                <span className="px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Full lineage tracked
                </span>
                <span className="px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> No download — internal save only
                </span>
              </div>

              {lastSaved && (
                <div className="mt-3 p-3 bg-emerald-500/[0.08] border border-emerald-500/15 rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-xs text-emerald-300">
                    Last saved as <strong className="text-emerald-400">{lastSaved}</strong> — view it in Step 13 Dataset Library.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 shrink-0">
              {!result && (
                <p className="text-xs text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Run the optimization cascade first
                </p>
              )}
              <button
                onClick={handleGenerateDataset}
                disabled={!result || isSaving}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 shadow-[0_0_25px_rgba(6,182,212,0.25)] text-sm whitespace-nowrap"
              >
                {isSaving ? <Activity className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                {isSaving ? 'Saving to Registry…' : 'Generate Modeling-Ready Dataset'}
              </button>
              {result && (
                <button
                  onClick={handleRunOptimization}
                  disabled={isProcessing}
                  className="px-6 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.07] transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Re-run with new settings
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SliderControlProps {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string; suffix?: string;
}
const SliderControl: React.FC<SliderControlProps> = ({ label, value, min, max, step, onChange, hint, suffix = '' }) => (
  <div>
    <div className="flex justify-between text-xs mb-1.5 font-semibold text-slate-300">
      <span>{label}</span>
      <span className="text-cyan-400 font-mono font-bold">{value}{suffix}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value))}
      className="w-full accent-cyan-500"
    />
    {hint && <p className="text-[10px] text-slate-600 mt-1">{hint}</p>}
  </div>
);

interface DiagStatProps { label: string; value: string; accent?: boolean; warn?: boolean; small?: boolean; }
const DiagStat: React.FC<DiagStatProps> = ({ label, value, accent, warn, small }) => (
  <div className="p-3 bg-white/[0.01] border border-white/[0.04] rounded-xl">
    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
    <p className={`${small ? 'text-xs' : 'text-sm'} font-bold font-mono mt-1 break-all ${accent ? 'text-cyan-400' : warn ? 'text-amber-400' : 'text-slate-200'}`}>{value}</p>
  </div>
);

interface ReadinessStatProps { label: string; value: string; accent?: boolean; warn?: boolean; small?: boolean; }
const ReadinessStat: React.FC<ReadinessStatProps> = ({ label, value, accent, warn, small }) => (
  <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl text-center">
    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
    <p className={`${small ? 'text-xs' : 'text-sm'} font-bold font-mono mt-1 ${accent ? 'text-cyan-400' : warn ? 'text-amber-400' : 'text-slate-200'}`}>{value}</p>
  </div>
);
