import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, BarChart3, Database, Brain, RefreshCw, AlertCircle, CheckCircle, 
  TrendingUp, HelpCircle, Network as NetIcon, ArrowRight
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { modelingApi } from '../../services/modelingApi';
import { toast } from 'react-hot-toast';
import { OptimizedPlotly } from '../charts/OptimizedPlotly';

interface ScientificInsightsWorkspaceProps {
  clientId: string;
}

export const ScientificInsightsWorkspace: React.FC<ScientificInsightsWorkspaceProps> = ({
  clientId,
}) => {
  const { 
    modelingAnalysis, setModelingAnalysis, modelingLoading, setModelingLoading,
    datasetPassport
  } = useWorkspaceStore();

  const [activeSubTab, setActiveSubTab] = useState<'health' | 'stats' | 'readiness' | 'network'>('health');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Trigger analysis if not already loaded
  useEffect(() => {
    if (!modelingAnalysis && !modelingLoading) {
      triggerAnalysis();
    }
  }, [modelingAnalysis]);

  const triggerAnalysis = async () => {
    setModelingLoading(true);
    const toastId = toast.loading('Running high-dimensional scientific diagnostics...');
    try {
      const result = await modelingApi.runAnalysis(clientId);
      setModelingAnalysis(result);
      toast.success('Scientific intelligence analysis completed!', { id: toastId });
    } catch (e: any) {
      toast.error('Diagnostics failed to run.', { id: toastId });
    } finally {
      setModelingLoading(false);
    }
  };

  // ── Physics Network Simulation Loop ───────────────────────────────────────
  useEffect(() => {
    if (activeSubTab !== 'network' || !modelingAnalysis?.visualizations?.correlation_matrix || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const corr = modelingAnalysis.visualizations.correlation_matrix;
    const labels = corr.labels;
    const z = corr.z;

    // Build Node & Link lists
    interface Node {
      id: number;
      label: string;
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
    }
    interface Link {
      source: number;
      target: number;
      weight: number;
    }

    const width = canvas.width = canvas.parentElement?.clientWidth || 700;
    const height = canvas.height = 450;

    const nodes: Node[] = labels.map((label, idx) => {
      const angle = (idx / labels.length) * Math.PI * 2;
      const radius = 100 + Math.random() * 50;
      return {
        id: idx,
        label,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        radius: 12 + Math.min(10, label.length / 2),
        color: idx % 2 === 0 ? '#818cf8' : '#c084fc', // sleek purple / violet
      };
    });

    const links: Link[] = [];
    for (let i = 0; i < z.length; i++) {
      for (let j = i + 1; j < z[i].length; j++) {
        const val = z[i][j];
        if (Math.abs(val) > 0.3) {
          links.push({ source: i, target: j, weight: val });
        }
      }
    }

    let draggedNode: Node | null = null;

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      
      for (const node of nodes) {
        const dx = node.x - mx;
        const dy = node.y - my;
        if (dx * dx + dy * dy < node.radius * node.radius * 2) {
          draggedNode = node;
          break;
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!draggedNode) return;
      const rect = canvas.getBoundingClientRect();
      draggedNode.x = e.clientX - rect.left;
      draggedNode.y = e.clientY - rect.top;
    };

    const handleMouseUp = () => {
      draggedNode = null;
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    let animFrame: number;
    const k = 0.08; // Spring constant
    const rep = 400; // Repulsion constant
    const gravity = 0.04;

    const updatePhysics = () => {
      // 1. Repulsion force between all node pairs (Coulomb-like)
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy + 1e-4;
          const dist = Math.sqrt(distSq);
          if (dist < 250) {
            const force = rep / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            if (n1 !== draggedNode) { n1.vx -= fx; n1.vy -= fy; }
            if (n2 !== draggedNode) { n2.vx += fx; n2.vy += fy; }
          }
        }
      }

      // 2. Attraction force along spring links (Hooke's law)
      for (const link of links) {
        const n1 = nodes[link.source];
        const n2 = nodes[link.target];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 1e-4;
        const targetLen = 120;
        const force = k * (dist - targetLen);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (n1 !== draggedNode) { n1.vx += fx; n1.vy += fy; }
        if (n2 !== draggedNode) { n2.vx -= fx; n2.vy -= fy; }
      }

      // 3. Central Gravity & apply velocities
      const centerX = width / 2;
      const centerY = height / 2;
      for (const node of nodes) {
        if (node === draggedNode) continue;
        const gX = (centerX - node.x) * gravity;
        const gY = (centerY - node.y) * gravity;
        node.vx += gX;
        node.vy += gY;

        // Apply friction/drag
        node.vx *= 0.82;
        node.vy *= 0.82;

        node.x += node.vx;
        node.y += node.vy;

        // Clamp inside canvas bounds
        node.x = Math.max(20, Math.min(width - 20, node.x));
        node.y = Math.max(20, Math.min(height - 20, node.y));
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw connections
      for (const link of links) {
        const n1 = nodes[link.source];
        const n2 = nodes[link.target];
        const opacity = Math.min(1.0, Math.abs(link.weight));
        ctx.beginPath();
        ctx.strokeStyle = link.weight > 0 ? `rgba(6,182,212,${opacity * 0.4})` : `rgba(244,63,94,${opacity * 0.4})`; // Cyan positive, Rose negative
        ctx.lineWidth = Math.abs(link.weight) * 4;
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        // Shadow/Glow effect
        ctx.beginPath();
        const grad = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, node.radius * 1.5);
        grad.addColorStop(0, node.color + '44');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.arc(node.x, node.y, node.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = node.color;
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff22';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + 4);
      }
    };

    const renderLoop = () => {
      updatePhysics();
      draw();
      animFrame = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animFrame);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeSubTab, modelingAnalysis]);

  if (modelingLoading || !modelingAnalysis) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 space-y-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-violet-500/10 border-t-violet-500 animate-spin" />
          <Brain className="w-6 h-6 text-violet-400 absolute top-5 left-5 animate-pulse" />
        </div>
        <div>
          <h3 className="text-white font-bold text-lg">Profiling Scientific Parameters</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            Running structural entropy checks, high-dimensional variance audits, and PCA modeling scans...
          </p>
        </div>
      </div>
    );
  }

  const readinessObj = (modelingAnalysis.readiness || {}) as any;
  const score = readinessObj.score ?? readinessObj.ai_score ?? 0;
  const tier = readinessObj.tier ?? 'Unknown';
  const breakdown = readinessObj.breakdown ?? {};
  const deductions = readinessObj.deductions ?? [];
  const recommendations = readinessObj.recommendations ?? modelingAnalysis.quality?.recommendations ?? [];
  const visualizations = modelingAnalysis.visualizations;

  return (
    <div className="space-y-6">
      
      {/* Upper Tab Navigation */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 border rounded-2xl bg-slate-900/40 border-slate-800/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm leading-none">Scientific Insights</h3>
            <p className="text-[10px] text-slate-400 mt-1">Holistic multi-dimensional dataset analytical workspace</p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-slate-950/60 p-1 rounded-xl border border-slate-800 shrink-0">
          {[
            { id: 'health', name: 'Dataset Health', icon: <Database className="w-4 h-4" /> },
            { id: 'stats', name: 'Statistical Suite', icon: <BarChart3 className="w-4 h-4" /> },
            { id: 'readiness', name: 'ML Readiness', icon: <Activity className="w-4 h-4" /> },
            { id: 'network', name: 'Discovery Graph', icon: <NetIcon className="w-4 h-4" /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeSubTab === tab.id 
                  ? 'bg-violet-500 text-white shadow-md shadow-violet-500/10' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.name}
            </button>
          ))}
        </div>

        <button 
          onClick={triggerAnalysis}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Re-Analyze
        </button>
      </div>

      {/* Primary Tab Content Panel */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSubTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
          className="w-full"
        >

          {/* AI Diagnostic Interpretation Panel (Global Insight) */}
          {(activeSubTab === 'health' || activeSubTab === 'readiness') && (modelingAnalysis.feasibility?.interpretation || modelingAnalysis.readiness?.success_confidence) && (
            <div className="mb-6 p-4 border rounded-xl bg-indigo-900/20 border-indigo-500/30">
              <h4 className="text-sm font-bold text-indigo-300 mb-2 flex items-center gap-2">
                <Brain className="w-4 h-4" />
                AI Diagnostic Interpretation
              </h4>
              <div className="flex flex-col md:flex-row gap-4">
                {modelingAnalysis.readiness?.success_confidence && (
                  <div className="flex-1 bg-indigo-950/40 p-3 rounded-lg border border-indigo-800/50">
                    <p className="text-xs text-indigo-200">
                      <strong className="text-indigo-100 block mb-1">Success Confidence:</strong> {modelingAnalysis.readiness.success_confidence}
                    </p>
                  </div>
                )}
                {modelingAnalysis.feasibility?.interpretation && (
                  <div className="flex-2 bg-indigo-950/40 p-3 rounded-lg border border-indigo-800/50">
                    <p className="text-xs text-indigo-200 leading-relaxed">
                      {modelingAnalysis.feasibility.interpretation}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Sub-Tab 1: Health */}
          {activeSubTab === 'health' && (
            <div className="grid md:grid-cols-3 gap-6">
              {/* Gauge Column */}
              <div className="p-6 border rounded-2xl bg-slate-900/60 border-slate-800/80 flex flex-col justify-between items-center text-center">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Integrity Score</span>
                  <span className="text-4xl font-extrabold text-violet-400 tracking-tight">{score}</span>
                  <span className="text-xs font-bold text-slate-400 block mt-1 uppercase tracking-wider">Tier: {tier}</span>
                </div>
                
                {/* Visual Circle Gauge */}
                <div className="relative w-36 h-36 my-6 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="72" cy="72" r="64" className="stroke-slate-800" strokeWidth="8" fill="transparent" />
                    <circle 
                      cx="72" cy="72" r="64" className="stroke-violet-500" strokeWidth="8" fill="transparent"
                      strokeDasharray={402} strokeDashoffset={402 - (402 * score) / 100}
                    />
                  </svg>
                  <Brain className="w-10 h-10 text-violet-400 absolute" />
                </div>

                <p className="text-xs text-slate-400 max-w-[200px]">
                  Composite score evaluated along completeness, variance, anomalies, and cardinality indices.
                </p>
              </div>

              {/* Heatmap/Profiling Area */}
              <div className="md:col-span-2 space-y-6">
                
                {/* Missingness Heatmap (Using Plotly) */}
                {visualizations?.missing_heatmap && (
                  <div className="p-6 border rounded-2xl bg-slate-900/60 border-slate-800/80">
                    <h4 className="text-sm font-bold text-white mb-4">Dataset Missingness Density Heatmap</h4>
                    <div className="w-full h-[220px] overflow-hidden rounded-xl">
                      <OptimizedPlotly
                        data={[{
                          z: visualizations.missing_heatmap.z,
                          x: visualizations.missing_heatmap.x,
                          y: visualizations.missing_heatmap.y,
                          type: 'heatmap',
                          colorscale: 'Viridis',
                          showscale: false
                        }]}
                        layout={{
                          autosize: true,
                          margin: { l: 40, r: 10, t: 10, b: 40 },
                          xaxis: { tickfont: { size: 9, color: '#94a3b8' } },
                          yaxis: { tickfont: { size: 9, color: '#94a3b8' } }
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Anomalies Box */}
                <div className="p-6 border rounded-2xl bg-slate-900/60 border-slate-800/80">
                  <h4 className="text-sm font-bold text-white mb-3">Identified Structural Anomalies</h4>
                  {modelingAnalysis.quality.anomalies.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle className="w-4 h-4" />
                      Zero critical anomalies or conflicting mappings detected in active columns!
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {modelingAnalysis.quality.anomalies.slice(0, 3).map((a, idx) => (
                        <div key={idx} className="flex gap-3 p-3 rounded-xl border bg-slate-950/40 border-slate-800 text-xs">
                          <AlertCircle className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-white block">{a.type} &bull; {a.severity}</span>
                            <span className="text-slate-400 mt-1 block">{a.description}</span>
                            <span className="text-[10px] text-violet-400 mt-1.5 block">Recommended action: {a.suggested_action}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* Sub-Tab 2: Stats */}
          {activeSubTab === 'stats' && (
            <div className="grid md:grid-cols-2 gap-6">
              
              {/* Correlation Heatmap */}
              {visualizations?.correlation_matrix && (
                <div className="p-6 border rounded-2xl bg-slate-900/60 border-slate-800/80">
                  <h4 className="text-sm font-bold text-white mb-4">Linear Correlation Matrix</h4>
                  <div className="w-full h-[320px] overflow-hidden rounded-xl">
                    <OptimizedPlotly
                      data={[{
                        z: visualizations.correlation_matrix.z,
                        x: visualizations.correlation_matrix.labels,
                        y: visualizations.correlation_matrix.labels,
                        type: 'heatmap',
                        colorscale: 'RdBu',
                        showscale: true
                      }]}
                      layout={{
                        autosize: true,
                        margin: { l: 60, r: 10, t: 10, b: 60 },
                        xaxis: { tickfont: { size: 9, color: '#94a3b8' } },
                        yaxis: { tickfont: { size: 9, color: '#94a3b8' } }
                      }}
                    />
                  </div>
                </div>
              )}

                {/* Right Column: PCA Scatter Plot */}
              <div className="space-y-6">
                {visualizations?.outliers && (
                  <div className="p-6 border rounded-2xl bg-slate-900/60 border-slate-800/80">
                    <h4 className="text-sm font-bold text-white mb-4">Principal Component Analysis (PCA) Projection</h4>
                    <div className="w-full h-[320px] overflow-hidden rounded-xl">
                      <OptimizedPlotly
                        data={[{
                          x: visualizations.outliers.x,
                          y: visualizations.outliers.y,
                          mode: 'markers',
                          type: 'scatter',
                          marker: {
                            color: visualizations.outliers.is_outlier.map(o => o ? '#f43f5e' : '#6366f1'),
                            size: 7
                          }
                        }]}
                        layout={{
                          autosize: true,
                          margin: { l: 40, r: 10, t: 10, b: 40 },
                          xaxis: { tickfont: { size: 9, color: '#94a3b8' }, title: { text: 'PC1', font: { size: 10, color: '#94a3b8' } } },
                          yaxis: { tickfont: { size: 9, color: '#94a3b8' }, title: { text: 'PC2', font: { size: 10, color: '#94a3b8' } } }
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* PCA Interpretation Panel */}
                {visualizations?.outliers && (
                  <div className="p-4 border rounded-xl bg-slate-800/50 border-slate-700/50">
                    <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      PCA Diagnostic Interpretation
                    </h4>
                    <p className="text-xs text-slate-400">
                      Projection of high-dimensional dataset features into 2D space. Points in <span className="text-rose-400 font-semibold">rose</span> are flagged as potential structural outliers based on interquartile variance.
                    </p>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Sub-Tab 3: ML Readiness */}
          {activeSubTab === 'readiness' && (
            <div className="grid md:grid-cols-3 gap-6">
              
              {/* Left Breakdown Column */}
              <div className="p-6 border rounded-2xl bg-slate-900/60 border-slate-800/80 space-y-4">
                <h4 className="text-sm font-bold text-white mb-2">Readiness Dimensions</h4>
                {(Object.entries(breakdown) as Array<[string, any]>).map(([dim, val]) => (
                  <div key={dim} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-slate-400 capitalize">
                      <span>{dim.replace('_', ' ')}</span>
                      <span className="text-white">{val}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-violet-500 rounded-full"
                        style={{ width: `${val}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Deductions, Recommendations & Interpretations Area */}
              <div className="md:col-span-2 space-y-6">
                
                {/* Removed AI Interpretation from here as it's now global */}

                {/* Deductions Box */}
                {deductions.length > 0 && (
                  <div className="p-6 border rounded-2xl bg-slate-900/60 border-slate-800/80">
                    <h4 className="text-sm font-bold text-white mb-3">Score Deductions & Flagged Items</h4>
                    <div className="space-y-2">
                      {deductions.map((d: any, idx: number) => (
                        <div key={idx} className="flex gap-2.5 items-start text-xs text-rose-400">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations Box */}
                <div className="p-6 border rounded-2xl bg-slate-900/60 border-slate-800/80">
                  <h4 className="text-sm font-bold text-white mb-3">Actionable Data-Cleaning Tips</h4>
                  <div className="space-y-3">
                    {recommendations.slice(0, 4).map((r: any, idx: number) => (
                      <div key={idx} className="flex gap-2.5 items-start text-xs text-slate-400">
                        <span className="w-5 h-5 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0">{idx + 1}</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* Sub-Tab 4: Network */}
          {activeSubTab === 'network' && (
            <div className="p-6 border rounded-2xl bg-slate-900/60 border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Interactive Correlation Discovery Graph</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Drag variables around. Cyan edges represent positive correlations, Rose edges represent negative correlations (|r| &gt; 0.3).
                  </p>
                </div>
                <div className="flex gap-3 text-[10px] font-mono text-slate-500 font-bold uppercase shrink-0">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> POSITIVE</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> NEGATIVE</span>
                </div>
              </div>

              {/* Interactive Canvas container */}
              <div className="border border-slate-800 bg-slate-950/80 rounded-2xl overflow-hidden relative shadow-inner h-[450px]">
                <canvas ref={canvasRef} className="w-full h-full block" />
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>

    </div>
  );
};
