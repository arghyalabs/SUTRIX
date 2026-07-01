/**
 * DatasetLibrary.tsx â€” SUTRIX V5 â€” Step 13
 * Dataset Library & Distribution Center
 *
 * PURPOSE: MANAGE & EXPORT datasets. Never creates or optimizes.
 *
 * Sections:
 *  1. Modeling Dataset Registry  (primary â€” reads from modeling_datasets/registry.json)
 *  2. Export Active Dataset
 *  3. Export Multiple Subgroups
 *  4. Global Hierarchical Export
 *  5. Global Enrichment Workspace Launcher
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, Archive, GitBranch, FolderOpen, AlertCircle,
  Database, Layers, CheckSquare, Square, ExternalLink,
  BarChart2, Trash2, Copy, Eye, GitCompare, RefreshCw,
  CheckCircle2, Clock, FlaskConical, Activity, FileText,
  ChevronDown, ChevronUp, RotateCcw, Package, Zap, Globe,
  TrendingUp, ShieldCheck
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { hierarchyApi } from '../../services/hierarchyApi';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { simpleAnalysisApi } from '../../services/simpleAnalysisApi';
import { API_BASE_URL } from '../../config';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ReportsExportProps {
  clientId: string;
  activeJobId: string | null;
  handleResetWorkspace: () => void;
  onNavigate?: (tab: string) => void;
}

interface ModelingDataset {
  version_name: string;
  version_num: number;
  subgroup: string;
  endpoint: string;
  task_type: string;
  rows: number;
  compounds: number;
  descriptors_original: number;
  descriptors_selected: number;
  ai_ready_score: number;
  qsar_ready_score: number;
  oecd_ready: boolean;
  created_at: string;
  descriptor_families: string[];
  feature_selection: {
    variance: number;
    correlation: number;
    mi_top_k: number;
    rfe: number;
  };
}

interface HierarchyNode {
  id: string;
  path: string;
  filter_col: string;
  filter_val: string;
  row_count: number;
  is_leaf: boolean;
  level: number;
}

interface CompareResult {
  v1: ModelingDataset;
  v2: ModelingDataset;
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const ReportsExport: React.FC<ReportsExportProps> = ({
  clientId,
  activeJobId,
  handleResetWorkspace,
  onNavigate
}) => {
  // Registry
  const [datasets, setDatasets]               = useState<ModelingDataset[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(true);
  const [selectedCompare, setSelectedCompare] = useState<string[]>([]);
  const [compareResult, setCompareResult]     = useState<CompareResult | null>(null);
  const [showCompare, setShowCompare]         = useState(false);
  const [expandedMeta, setExpandedMeta]       = useState<string | null>(null);

  // Export
  const [availableSubgroups, setAvailableSubgroups] = useState<any[]>([]);
  const [selectedExportIds, setSelectedExportIds]   = useState<string[]>([]);
  const [exportFormat, setExportFormat]             = useState<'csv' | 'parquet' | 'xlsx' | 'zip'>('parquet');
  const [isExporting, setIsExporting]               = useState(false);

  // Hierarchy
  const [hierarchyNodes, setHierarchyNodes]         = useState<HierarchyNode[]>([]);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(false);
  const [hasHierarchy, setHasHierarchy]             = useState(false);
  const [isHierarchyExporting, setIsHierarchyExporting] = useState(false);

  const { activeLineage, varianceFilterEnabled } = useWorkspaceStore();

  const downloadParquetUrl = activeJobId
    ? `${API_BASE_URL}/api/jobs/${clientId}/download_enriched_parquet?job_id=${activeJobId}&apply_variance_filter=${varianceFilterEnabled}`
    : '#';

  // â”€â”€â”€ Load data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const loadRegistry = useCallback(async () => {
    try {
      setLoadingRegistry(true);
      const res = await fetch(`${API_BASE_URL}/api/features/${clientId}/registry`);
      if (res.ok) {
        const data = await res.json();
        setDatasets(data.datasets || []);
      } else {
        setDatasets([]);
      }
    } catch {
      setDatasets([]);
    } finally {
      setLoadingRegistry(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    loadRegistry();

    // Load subgroups for export
    simpleAnalysisApi.getSubgroups(clientId)
      .then(d => setAvailableSubgroups(d))
      .catch(() => {});

    // Load hierarchy
    if (activeLineage?.nodes) {
      setHierarchyNodes(activeLineage.nodes);
      setHasHierarchy(true);
    } else {
      setIsLoadingHierarchy(true);
      hierarchyApi.getTree(clientId)
        .then((tree: any) => {
          if (tree?.nodes?.length > 0) { setHierarchyNodes(tree.nodes); setHasHierarchy(true); }
        })
        .catch(() => setHasHierarchy(false))
        .finally(() => setIsLoadingHierarchy(false));
    }
  }, [clientId, activeLineage, loadRegistry]);

  // â”€â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleDeleteDataset = async (versionName: string) => {
    if (!confirm(`Delete ${versionName}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/features/${clientId}/registry/${versionName}`, { method: 'DELETE' });
      if (res.ok) { toast.success(`Deleted ${versionName}`); loadRegistry(); }
      else { const e = await res.json(); throw new Error(e.detail); }
    } catch (err: any) { toast.error(err.message || 'Delete failed'); }
  };

  const handleDownloadDataset = (versionName: string, fmt: string) => {
    const url = `${API_BASE_URL}/api/features/${clientId}/registry/${versionName}/download?format=${fmt}`;
    const a = document.createElement('a'); a.href = url;
    a.download = `${versionName}.${fmt}`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleCompare = () => {
    if (selectedCompare.length !== 2) { toast.error('Select exactly 2 datasets to compare.'); return; }
    const v1 = datasets.find(d => d.version_name === selectedCompare[0]);
    const v2 = datasets.find(d => d.version_name === selectedCompare[1]);
    if (v1 && v2) { setCompareResult({ v1, v2 }); setShowCompare(true); }
  };

  const handleExportActive = async (fmt: string) => {
    try {
      setIsExporting(true);
      let url = `${API_BASE_URL}/api/features/${clientId}/export-active?format=${fmt}`;
      if (selectedExportIds && selectedExportIds.length > 0) {
        url += `&subgroups=${selectedExportIds.join(',')}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `active_subgroup.${fmt}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast.success(`Exported as ${fmt.toUpperCase()}`);
    } catch (err: any) { toast.error(err.message || 'Export failed'); }
    finally { setIsExporting(false); }
  };

  const handleBulkExport = async () => {
    if (selectedExportIds.length === 0) { toast.error('Select at least one subgroup.'); return; }
    try {
      setIsExporting(true);
      const toastId = toast.loading('Building multi-subgroup exportâ€¦');
      const res = await fetch(`${API_BASE_URL}/api/features/${clientId}/export-subgroups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subgroup_ids: selectedExportIds, format: exportFormat })
      });
      if (!res.ok) throw new Error('Bulk export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `subgroups_export.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast.success('Multi-subgroup export ready!', { id: toastId });
    } catch (err: any) { toast.error(err.message || 'Export failed'); }
    finally { setIsExporting(false); }
  };

  const handleHierarchyExport = async () => {
    try {
      setIsHierarchyExporting(true);
      const toastId = toast.loading('Building hierarchical ZIP archiveâ€¦');
      const res = await fetch(`${API_BASE_URL}/api/hierarchy/${clientId}/export-all`);
      if (!res.ok) throw new Error('Hierarchy export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'QSAR_AI_READY_LIBRARY.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast.success('QSAR Library exported!', { id: toastId });
    } catch (err: any) { toast.error(err.message || 'Export failed'); }
    finally { setIsHierarchyExporting(false); }
  };

  const leafNodes = hierarchyNodes.filter(n => n.is_leaf);
  const totalRows = hierarchyNodes.reduce((sum, n) => n.is_leaf ? sum + (n.row_count || 0) : sum, 0);

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className="h-full flex flex-col overflow-y-auto bg-[#050d1a] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#050d1a]/95 backdrop-blur-md border-b border-white/[0.05] px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/20 flex items-center justify-center">
            <Package className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white">Dataset Library &amp; Distribution Center</h1>
            <p className="text-xs text-slate-500">Manage, Export, and Distribute Modeling Datasets</p>
          </div>
        </div>
        <button
          onClick={handleResetWorkspace}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white/30 hover:text-white hover:bg-white/[0.04] text-xs font-medium transition-colors border border-white/[0.04]"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset Workspace
        </button>
      </div>

      <div className="flex-1 p-8 space-y-6">

        {/* â•â• SECTION 1: Global Hierarchical Export â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <Section
          icon={<GitBranch className="w-5 h-5 text-emerald-400" />}
          title="Global Hierarchical Export"
          subtitle="Export the entire dataset hierarchy as a structured ZIP archive"
          accent="emerald"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">
                Generates <strong className="text-emerald-400">QSAR_AI_READY_LIBRARY.zip</strong> preserving the full hierarchy tree from Step 4. Each subgroup folder contains <code className="text-slate-400 text-xs">dataset.parquet</code>, <code className="text-slate-400 text-xs">dataset.csv</code>, <code className="text-slate-400 text-xs">metadata.json</code>, and <code className="text-slate-400 text-xs">diagnostics.json</code>.
              </p>
              {hasHierarchy && (
                <div className="flex items-center gap-3 text-xs text-slate-500 mb-4">
                  <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" />{hierarchyNodes.length} nodes</span>
                  <span>Â·</span>
                  <span>{leafNodes.length} leaf datasets</span>
                  <span>Â·</span>
                  <span>{totalRows.toLocaleString()} total rows</span>
                </div>
              )}
              <button
                onClick={handleHierarchyExport}
                disabled={isHierarchyExporting || !hasHierarchy}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.25)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isHierarchyExporting ? <Activity className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                {isHierarchyExporting ? 'Building ZIPâ€¦' : 'Download QSAR_AI_READY_LIBRARY.zip'}
              </button>
            </div>

            {/* Tree preview */}
            {hasHierarchy && (
              <div className="bg-[#040810] rounded-xl border border-white/[0.04] p-4 max-h-48 overflow-y-auto">
                {hierarchyNodes.slice(0, 15).map((node, i) => (
                  <div key={node.id} className="flex items-center gap-2 py-1" style={{ paddingLeft: `${node.level * 16 + 4}px` }}>
                    <FolderOpen className="w-3 h-3 shrink-0 text-emerald-500/60" />
                    <span className="text-[10px] font-mono text-slate-600">
                      {node.filter_col ? <><span className="text-slate-700">{node.filter_col}</span><span className="text-slate-800 mx-0.5">=</span><span className="text-emerald-600">{node.filter_val}</span></> : <span className="text-emerald-500">Root</span>}
                    </span>
                    <span className="ml-auto text-[9px] font-mono text-slate-700">{node.row_count?.toLocaleString()}</span>
                  </div>
                ))}
                {hierarchyNodes.length > 15 && <p className="text-[9px] text-slate-700 text-center mt-1">â€¦and {hierarchyNodes.length - 15} more</p>}
              </div>
            )}
          </div>
        </Section>

        {/* â•â• SECTION 2: Export Active Dataset â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <Section
          icon={<Download className="w-5 h-5 text-cyan-400" />}
          title="Export Active Dataset"
          subtitle="Download the currently active enriched descriptor matrix"
          accent="cyan"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-5 bg-white/[0.02] border border-white/[0.05] rounded-xl">
              <p className="text-xs text-slate-400 mb-4">Download the full enriched descriptor matrix for the active subgroup in your preferred format.</p>
              <div className="flex flex-wrap gap-2">
                {(['parquet', 'csv', 'xlsx', 'zip'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => handleExportActive(fmt)}
                    disabled={isExporting}
                    className="px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-bold uppercase tracking-wider hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                  >
                    {isExporting ? <Activity className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    {fmt}
                  </button>
                ))}
              </div>
              {!activeJobId && (
                <p className="text-xs text-amber-400 mt-3 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Complete Step 8 (Descriptor Enrichment) first.
                </p>
              )}
            </div>

            <div className="p-5 bg-white/[0.02] border border-white/[0.05] rounded-xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Active Dataset Info</p>
              <div className="space-y-1.5 text-xs text-slate-400">
                <div className="flex justify-between"><span>Status:</span> <span className={activeJobId ? 'text-emerald-400 font-bold' : 'text-slate-600'}>{activeJobId ? 'Ready to export' : 'Pending enrichment'}</span></div>
                <div className="flex justify-between"><span>Direct Parquet:</span>
                  {activeJobId
                    ? <a href={downloadParquetUrl} download className="text-cyan-400 hover:underline font-mono">Download â†—</a>
                    : <span className="text-slate-700">â€”</span>}
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* â•â• SECTION 3: Export Multiple Subgroups â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <Section
          icon={<Layers className="w-5 h-5 text-blue-400" />}
          title="Section 3 â€” Export Multiple Subgroups"
          subtitle="Select subgroups and bulk-export as a structured ZIP"
          accent="blue"
          action={
            <div className="flex items-center gap-2">
              <select
                value={exportFormat}
                onChange={e => setExportFormat(e.target.value as any)}
                className="text-xs bg-slate-900 border border-white/[0.08] rounded-lg px-2 py-1.5 text-slate-300"
              >
                <option value="parquet">Parquet</option>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel</option>
                <option value="zip">ZIP (all formats)</option>
              </select>
              <button
                onClick={handleBulkExport}
                disabled={isExporting || selectedExportIds.length === 0}
                className="px-4 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/25 text-blue-300 text-xs font-bold hover:bg-blue-500/25 disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {isExporting ? <Activity className="w-3 h-3 animate-spin" /> : <Package className="w-3 h-3" />}
                Export {selectedExportIds.length > 0 ? `(${selectedExportIds.length})` : 'Selected'}
              </button>
            </div>
          }
        >
          {availableSubgroups.length === 0 ? (
            <p className="text-sm text-slate-600 py-4 text-center">No subgroups available. Complete Step 5 first.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setSelectedExportIds(availableSubgroups.map((s: any) => s.node_id))}
                  className="text-xs text-slate-500 hover:text-white transition-colors"
                >Select all</button>
                <span className="text-slate-700">Â·</span>
                <button onClick={() => setSelectedExportIds([])} className="text-xs text-slate-500 hover:text-white transition-colors">Clear</button>
              </div>
              {availableSubgroups.map((sg: any) => {
                const isSelected = selectedExportIds.includes(sg.node_id);
                return (
                  <div
                    key={sg.node_id}
                    onClick={() => setSelectedExportIds(prev => isSelected ? prev.filter(id => id !== sg.node_id) : [...prev, sg.node_id])}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${isSelected ? 'bg-blue-500/[0.06] border-blue-500/20' : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04]'}`}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" /> : <Square className="w-4 h-4 text-slate-600 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate font-medium">{sg.subgroup_name || sg.node_id}</p>
                      <p className="text-[10px] text-slate-600">{sg.compounds} compounds Â· {sg.node_id}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>


        {/* â•â• SECTION 5: Global Enrichment Workspace Launcher â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        <Section
          icon={<Globe className="w-5 h-5 text-amber-400" />}
          title="Section 5 â€” Global Enrichment Workspace"
          subtitle="Launch the batch enrichment dashboard to enrich all subgroups at scale"
          accent="amber"
        >
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
            <div className="flex-1">
              <p className="text-sm text-slate-300 leading-relaxed mb-3">
                The Global Enrichment Workspace runs descriptor generation across <strong className="text-amber-400">every subgroup</strong> in your hierarchy simultaneously. Supports 200â€“1000+ subgroup batch jobs with full resume, failure tracking, and resource monitoring.
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                {['Job Queue', 'Progress Monitor', 'Failure Recovery', 'Resume Support', 'Batch Execution', 'Resource Monitor'].map(feature => (
                  <span key={feature} className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400/80">
                    {feature}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-600 mt-3">
                Output is saved to <code className="text-slate-500">workspace/global_enrichment/</code> â€” isolated from your curated modeling datasets.
              </p>
            </div>

            <button
              onClick={() => onNavigate ? onNavigate('global-enrichment') : window.open(`/global-enrichment`, '_blank')}
              className="flex items-center gap-2.5 px-8 py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-sm shadow-[0_0_25px_rgba(245,158,11,0.25)] hover:from-amber-400 hover:to-orange-400 transition-all whitespace-nowrap shrink-0"
            >
              <Zap className="w-5 h-5" />
              Launch Global Enrichment
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </Section>

      </div>
    </div>
  );
};

// â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}
const Section: React.FC<SectionProps> = ({ icon, title, subtitle, accent = 'cyan', action, children }) => {
  const borderColor = {
    violet: 'border-violet-500/15', cyan: 'border-cyan-500/15',
    blue: 'border-blue-500/15', emerald: 'border-emerald-500/15', amber: 'border-amber-500/15',
  }[accent] || 'border-white/[0.06]';

  return (
    <div className={`bg-slate-900/30 border ${borderColor} rounded-2xl p-6`}>
      <div className="flex items-center justify-between border-b border-white/[0.05] pb-3 mb-5">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h2>
            <p className="text-[10px] text-slate-600 mt-0.5">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
};

interface ScoreBadgeProps { value: number; color?: string; }
const ScoreBadge: React.FC<ScoreBadgeProps> = ({ value, color = 'blue' }) => {
  const c = value >= 80 ? 'text-emerald-400' : value >= 60 ? 'text-amber-400' : 'text-rose-400';
  return <span className={`text-xs font-bold font-mono ${c}`}>{value}%</span>;
};

interface ActionBtnProps { icon: React.ReactNode; onClick: () => void; tip: string; accent?: boolean; danger?: boolean; }
const ActionBtn: React.FC<ActionBtnProps> = ({ icon, onClick, tip, accent, danger }) => (
  <button
    onClick={onClick}
    title={tip}
    className={`p-1.5 rounded-lg transition-all ${accent ? 'text-cyan-400 hover:bg-cyan-500/15' : danger ? 'text-slate-600 hover:text-rose-400 hover:bg-rose-500/10' : 'text-slate-600 hover:text-white hover:bg-white/[0.06]'}`}
  >
    {icon}
  </button>
);

interface MetaItemProps { label: string; value: string; }
const MetaItem: React.FC<MetaItemProps> = ({ label, value }) => (
  <div>
    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
    <p className="text-slate-300 font-mono mt-0.5 break-all">{value}</p>
  </div>
);
