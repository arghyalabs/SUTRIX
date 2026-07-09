import React, { useRef, useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ComposedChart, Cell, LabelList
} from 'recharts';
import { Download, Layers, ShieldAlert, Activity, CheckCircle, Info } from 'lucide-react';
import { toPng } from 'html-to-image';
import { LogoLoader } from '../ui/SUTRIXLogo';
import { hierarchyApi } from '../../services/hierarchyApi';

interface NodeDetail {
  id: string;
  metadata: any;
  stats: {
    total_rows: number;
    missing_cells: number;
    numeric_cols: number;
    categorical_cols: number;
    unique_compounds: number;
    missing_pct: number;
  };
  charts: {
    composition_pie?: { labels: string[]; values: number[]; title: string };
    composition_bar?: { x: string[]; y: number[]; title: string };
    statistical_table?: Array<{
      subgroup: string; count: number; percentage: number; missing: number; duplicates: number;
    }>;
    distributions?: Record<string, {
      counts: number[]; bins: number[]; mean: number; median: number; std: number;
    }>;
  };
  export_formats: string[];
}

interface NodeVisualizationProps {
  nodeDetail: NodeDetail | null;
  isLoading: boolean;
  workspaceId: string;
}

// Reusable Chart Card Wrapper
const ChartCard: React.FC<{
  title: string;
  subtitle?: string;
  onDownload: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, onDownload, children }) => (
  <div className="p-5 rounded-2xl bg-[#080f1f] border border-white/[0.07] flex flex-col overflow-visible relative group">
    <div className="flex items-start justify-between mb-4 shrink-0">
      <div>
        <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider">{title}</h4>
        {subtitle && (
          <p className="text-[10px] text-cyan-300/40 mt-0.5 font-mono">{subtitle}</p>
        )}
      </div>
      <button
        onClick={onDownload}
        title="Download Chart"
        className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/40 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-400 transition-all opacity-0 group-hover:opacity-100"
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    </div>
    <div className="flex-1 min-h-[220px]">
      {children}
    </div>
  </div>
);

export const NodeVisualization: React.FC<NodeVisualizationProps> = ({ nodeDetail, isLoading, workspaceId }) => {
  const [advancedData, setAdvancedData] = useState<any>(null);
  const [loadingAdvanced, setLoadingAdvanced] = useState(false);

  // References for PNG downloads
  const homogeneityRef = useRef<HTMLDivElement>(null);
  const normalityRef = useRef<HTMLDivElement>(null);
  const sparsityRef = useRef<HTMLDivElement>(null);
  const attritionRef = useRef<HTMLDivElement>(null);

  // Fetch advanced scientific payload
  useEffect(() => {
    if (!nodeDetail?.id || !workspaceId) return;

    const fetchAdvanced = async () => {
      setLoadingAdvanced(true);
      try {
        const data = await hierarchyApi.getAdvancedBranchDetail(workspaceId, nodeDetail.id);
        setAdvancedData(data);
      } catch (err) {
        console.error('[SDO] Failed to fetch advanced branch analytics:', err);
      } finally {
        setLoadingAdvanced(false);
      }
    };

    fetchAdvanced();
  }, [nodeDetail?.id, workspaceId]);

  // Capture helper for PNG downloads
  const handleDownload = useCallback(async (ref: React.RefObject<HTMLDivElement | null>, filename: string) => {
    const el = ref.current;
    if (!el) return;
    try {
      await toPng(el, { pixelRatio: 2, cacheBust: true });
      const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement('a');
      a.download = filename;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error('[SDO] PNG export failed:', err);
    }
  }, []);

  if (isLoading || loadingAdvanced) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px]">
        <LogoLoader size="w-20 h-20" label="Processing Advanced Scientific Metrics..." />
      </div>
    );
  }

  if (!nodeDetail || !advancedData) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] text-white/20 p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-white/[0.02] flex items-center justify-center mb-4 border border-white/[0.04]">
          <Layers className="w-7 h-7 text-cyan-400/40" />
        </div>
        <p className="text-xs font-semibold text-white/50">Select a subgroup node to view advanced mathematical metrics</p>
        <p className="text-[10px] text-white/20 mt-1 max-w-[280px]">Calculations including Tanimoto chemical similarities and Shapiro-Wilk normal fits run dynamically per subgroup selection.</p>
      </div>
    );
  }

  const { homogeneity_path, normality_fit, chemical_diversity, sparsity, attrition_waterfall } = advancedData;

  // Custom tooltips to keep standard styling
  const customTooltipStyle = {
    contentStyle: { backgroundColor: '#090f1f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' },
    itemStyle: { fontSize: 11, fontWeight: 'bold' }
  };

  return (
    <div className="p-2 space-y-6">
      
      {/* SECTION HEADER */}
      <div className="flex items-center justify-between border-b border-white/[0.04] pb-4 shrink-0">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Advanced Subgroup Diagnostics
          </h2>
          <p className="text-[10px] text-white/40 mt-0.5">
            Statistical variance analysis and chemical fingerprint indicators for subgroup <span className="text-cyan-300 font-bold">{nodeDetail.metadata?.node_name || 'selected node'}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono bg-cyan-500/10 text-cyan-300 px-3 py-1.5 rounded-xl border border-cyan-500/20">
          <Info className="w-3.5 h-3.5" />
          OECD QSAR Principle 1 Compliant
        </div>
      </div>

      {/* 2X2 DIAGNOSTIC GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* CARD 1: Homogeneity Path */}
        <div ref={homogeneityRef}>
          <ChartCard
            title="Homogeneity Path"
            subtitle="Shannon Information Entropy decrement along tree trajectory"
            onDownload={() => handleDownload(homogeneityRef, `sdo_homogeneity_path_${nodeDetail.id}.png`)}
          >
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={homogeneity_path} margin={{ top: 15, right: -5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  stroke="rgba(255,255,255,0.4)" 
                  tick={{ fontSize: 9 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  tickLine={false}
                />
                <YAxis 
                  yAxisId="left" 
                  stroke="rgba(255,255,255,0.3)" 
                  tick={{ fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="rgba(255,255,255,0.3)" 
                  tick={{ fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 'auto']}
                />
                <Tooltip {...customTooltipStyle as any} />
                <Bar yAxisId="left" dataKey="size" name="Subgroup Size" fill="#8b5cf6" fillOpacity={0.15} radius={[2, 2, 0, 0]} barSize={25} />
                <Line yAxisId="right" type="monotone" dataKey="entropy" name="Shannon Entropy" stroke="#22d3ee" strokeWidth={3} dot={{ r: 4, stroke: '#22d3ee', strokeWidth: 2, fill: '#060c18' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* CARD 2: Normality Fit */}
        <div ref={normalityRef}>
          <ChartCard
            title="Normality Fit & Bell Overlay"
            subtitle={normality_fit.is_numeric ? `Gaussian distribution overlay of metric: ${normality_fit.mean ? 'potency' : 'value'}` : "Insufficient quantitative data"}
            onDownload={() => handleDownload(normalityRef, `sdo_normality_fit_${nodeDetail.id}.png`)}
          >
            {normality_fit.is_numeric ? (
              <div className="flex flex-col h-full justify-between">
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={normality_fit.histogram} margin={{ top: 15, right: -5, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis 
                      dataKey="bin_label" 
                      stroke="rgba(255,255,255,0.4)" 
                      tick={{ fontSize: 8 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="rgba(255,255,255,0.3)" 
                      tick={{ fontSize: 8 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip {...customTooltipStyle as any} />
                    <Bar dataKey="actual_count" name="Observed" fill="#22d3ee" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
                    <Line type="monotone" dataKey="normal_count" name="Expected Normal" stroke="#f43f5e" strokeWidth={2} dot={false} strokeDasharray="3 3" />
                  </ComposedChart>
                </ResponsiveContainer>
                
                {/* Normality Stats strip */}
                <div className="flex items-center justify-between font-mono text-[9px] bg-white/[0.02] border border-white/[0.04] p-2.5 rounded-xl mt-2 select-none">
                  <div>
                    <span className="text-white/40">Shapiro W:</span>{' '}
                    <span className="text-cyan-300 font-bold">{normality_fit.shapiro_w.toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-white/40">p-value:</span>{' '}
                    <span className="text-cyan-300 font-bold">{normality_fit.shapiro_p.toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-white/40">Skewness:</span>{' '}
                    <span className="text-cyan-300 font-bold">{normality_fit.skewness.toFixed(3)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-white/40">Verdict:</span>{' '}
                    <span className={`font-bold px-1.5 py-0.5 rounded-sm flex items-center gap-0.5
                      ${normality_fit.verdict === 'Normal' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                      {normality_fit.verdict === 'Normal' ? <CheckCircle className="w-2.5 h-2.5" /> : <ShieldAlert className="w-2.5 h-2.5" />}
                      {normality_fit.verdict}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[200px] text-white/20 text-center px-6">
                <ShieldAlert className="w-8 h-8 text-amber-500/40 mb-2" />
                <span className="text-xs font-semibold text-white/50">Normality calculation unavailable</span>
                <span className="text-[10px] text-white/20 mt-1">This subgroup slice contains no numeric columns mapped to toxicity value roles.</span>
              </div>
            )}
          </ChartCard>
        </div>

        {/* CARD 3: Sparsity & Structural Diversity */}
        <div ref={sparsityRef}>
          <ChartCard
            title="Sparsity & Scaffold Diversity"
            subtitle="Structural distribution and missingness audit"
            onDownload={() => handleDownload(sparsityRef, `sdo_sparsity_diversity_${nodeDetail.id}.png`)}
          >
            <div className="flex items-center h-full gap-5">
              {/* Sparsity Grid Map */}
              <div className="flex flex-col items-center gap-2">
                <div className="grid grid-cols-10 gap-0.5 border border-white/[0.06] p-1 bg-white/[0.01] rounded-lg relative">
                  {sparsity.grid.map((cell: number, idx: number) => (
                    <div
                      key={idx}
                      className={`w-3.5 h-3.5 rounded-sm transition-colors cursor-help
                        ${cell === 1 ? 'bg-emerald-400/80 shadow-[0_0_4px_rgba(52,211,153,0.3)]' : 'bg-white/[0.04]'}`}
                      title={cell === 1 ? 'Data Cell Present' : 'Data Cell Missing'}
                    />
                  ))}
                </div>
                <span className="text-[8px] font-mono text-white/40 uppercase tracking-widest">Sparsity Grid Map</span>
              </div>

              {/* Diversity Stats list */}
              <div className="flex-1 flex flex-col justify-center font-mono text-[10px] space-y-3.5 border-l border-white/[0.04] pl-5 h-[160px]">
                <div className="flex items-center justify-between">
                  <span className="text-white/40 uppercase tracking-wider text-[9px]">Mean Tanimoto Similarity:</span>
                  <span className="text-cyan-300 font-extrabold">
                    {chemical_diversity.supported 
                      ? `μ=${chemical_diversity.tanimoto_mean.toFixed(2)}` 
                      : 'N/A (SMILES absent)'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40 uppercase tracking-wider text-[9px]">Similarity Std Dev (σ):</span>
                  <span className="text-cyan-300 font-extrabold">
                    {chemical_diversity.supported 
                      ? `σ=${chemical_diversity.tanimoto_std.toFixed(2)}` 
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40 uppercase tracking-wider text-[9px]">Bemis-Murcko Scaffolds:</span>
                  <span className="text-cyan-300 font-extrabold">
                    {chemical_diversity.supported ? chemical_diversity.scaffold_count : 0} scaffolds
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40 uppercase tracking-wider text-[9px]">Cell Missingness (Sparsity %):</span>
                  <span className="text-cyan-300 font-extrabold">
                    {sparsity.sparsity_pct.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </ChartCard>
        </div>

        {/* CARD 4: Attrition Funnel */}
        <div ref={attritionRef}>
          <ChartCard
            title="Cleansing Attrition Funnel"
            subtitle="Pruning retention cascade from raw upload to subgroup slice"
            onDownload={() => handleDownload(attritionRef, `sdo_attrition_funnel_${nodeDetail.id}.png`)}
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={attrition_waterfall} margin={{ top: 15, right: -5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis 
                  dataKey="step" 
                  stroke="rgba(255,255,255,0.4)" 
                  tick={{ fontSize: 9 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  tickLine={false}
                />
                <YAxis 
                  stroke="rgba(255,255,255,0.3)" 
                  tick={{ fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  {...customTooltipStyle as any}
                  formatter={(value: any, name: any, props: any) => {
                    const change = props.payload.change;
                    const changeLabel = change !== 0 ? ` (${change > 0 ? '+' : ''}${change.toLocaleString()})` : '';
                    return [`${value.toLocaleString()}${changeLabel}`, name];
                  }}
                />
                <Bar dataKey="count" name="Retained Count" radius={[4, 4, 0, 0]} barSize={35}>
                  {attrition_waterfall.map((entry: any, index: number) => {
                    const isLast = index === attrition_waterfall.length - 1;
                    const isFirst = index === 0;
                    // Colors: emerald for first & last, pink for intermediate drops
                    const color = isFirst || isLast ? '#34d399' : '#f43f5e';
                    return <Cell key={`cell-${index}`} fill={color} fillOpacity={0.7} />;
                  })}
                  <LabelList 
                    dataKey="count" 
                    position="top"
                    content={(props: any) => {
                      const { x, y, width, value } = props;
                      return (
                        <text
                          x={x + width / 2}
                          y={y - 8}
                          fill="rgba(255,255,255,0.7)"
                          fontSize={9}
                          fontWeight="bold"
                          textAnchor="middle"
                          className="font-mono"
                        >
                          {value.toLocaleString()}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

      </div>
    </div>
  );
};
