import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Table2, BarChart3, Download, Image as ImageIcon, Beaker, BarChart2 } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toPng } from 'html-to-image';

interface HomogeneityStep {
  node_id: string;
  label: string;
  size: number;
  entropy: number;
}

interface FullscreenHomogeneityModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: HomogeneityStep[];
  title: string;
}

export const FullscreenHomogeneityModal: React.FC<FullscreenHomogeneityModalProps> = ({
  isOpen, onClose, data, title
}) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const chartRef = useRef<HTMLDivElement>(null);

  const stats = React.useMemo(() => {
    if (!data || data.length === 0) return null;
    const rootStep = data[0];
    const finalStep = data[data.length - 1];
    const contraction = rootStep.entropy - finalStep.entropy;
    const retentionRate = (finalStep.size / (rootStep.size || 1)) * 100;
    
    return {
      rootEntropy: rootStep.entropy.toFixed(3),
      finalEntropy: finalStep.entropy.toFixed(3),
      contraction: contraction.toFixed(3),
      retentionRate: retentionRate.toFixed(1),
      stepsCount: data.length,
      finalSize: finalStep.size
    };
  }, [data]);

  const handleDownloadPng = async () => {
    if (!chartRef.current) return;
    try {
      const filter = (node: Element) => !(node instanceof HTMLElement && node.dataset.downloadIgnore === 'true');
      const dataUrl = await toPng(chartRef.current, { pixelRatio: 2, filter });
      const a = document.createElement('a');
      a.download = `sdo_homogeneity_${title.replace(/\s+/g, '_')}.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error('PNG Export failed:', err);
    }
  };

  const handleDownloadCsv = () => {
    if (!data) return;
    const header = 'Step,Subgroup Node,Records Count,Shannon Entropy\n';
    const body = data.map((r, idx) => `${idx + 1},"${r.label}",${r.size},${r.entropy.toFixed(4)}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sdo_homogeneity_${title.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && stats && (
        <div className="fixed inset-0 z-[100] flex bg-void/90 backdrop-blur-xl p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full h-full bg-[#080f1f] border border-white/[0.05] shadow-2xl rounded-2xl flex overflow-hidden"
          >
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col p-6 border-r border-white/[0.05]" ref={chartRef}>
              <div className="flex items-center justify-between mb-8" data-download-ignore="true">
                <div>
                  <h2 className="text-2xl font-bold text-white">{title}</h2>
                  <p className="text-white/40 text-sm mt-1 flex items-center gap-2">
                    <Beaker className="w-4 h-4 text-cyan-500" />
                    Interactive Research View
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-white/[0.03] p-1 rounded-xl">
                  <button
                    onClick={() => setViewMode('chart')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${viewMode === 'chart' ? 'bg-cyan-500/20 text-cyan-400' : 'text-white/40 hover:text-white'}`}
                  >
                    <BarChart3 className="w-4 h-4" /> Chart
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${viewMode === 'table' ? 'bg-cyan-500/20 text-cyan-400' : 'text-white/40 hover:text-white'}`}
                  >
                    <Table2 className="w-4 h-4" /> Data Table
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 relative flex items-center justify-center">
                {viewMode === 'chart' ? (
                  <div className="relative w-full h-full flex items-center justify-center p-4">
                    <ResponsiveContainer width="100%" height="90%">
                      <ComposedChart data={data} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                          tickLine={false}
                        />
                        <YAxis
                          yAxisId="left"
                          tick={{ fill: '#8b5cf6', fontSize: 11, fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fill: '#22d3ee', fontSize: 11, fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0d1a30', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                          itemStyle={{ fontSize: 11, fontWeight: 'bold' }}
                        />
                        <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11, fontFamily: 'monospace' }} />
                        <Bar yAxisId="left" name="Subgroup Size" dataKey="size" fill="#8b5cf6" fillOpacity={0.15} radius={[4, 4, 0, 0]} barSize={35} />
                        <Line yAxisId="right" name="Shannon Entropy" type="monotone" dataKey="entropy" stroke="#22d3ee" strokeWidth={3.5} dot={{ r: 5, stroke: '#22d3ee', strokeWidth: 3, fill: '#080f1f' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="w-full h-full overflow-auto custom-scrollbar pr-4">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#080f1f]/90 backdrop-blur-md z-10">
                        <tr>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05]">Step Index</th>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05]">Subgroup Name</th>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05] text-right">Records Count</th>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05] text-right">Shannon Entropy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.02] border-b border-white/[0.02] transition-colors">
                            <td className="py-3 px-4 text-sm text-white/40 font-mono">Step #{idx + 1}</td>
                            <td className="py-3 px-4 text-sm font-medium text-white flex items-center gap-3 font-mono">
                              <span className="w-3 h-3 rounded-full bg-cyan-400" />
                              {row.label}
                            </td>
                            <td className="py-3 px-4 text-sm text-white/80 text-right font-mono">{row.size.toLocaleString()}</td>
                            <td className="py-3 px-4 text-sm text-cyan-400 text-right font-mono">{row.entropy.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Right Sidebar - Analysis Tools */}
            <div className="w-80 bg-white/[0.01] p-6 flex flex-col">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-violet-400" />
                  Analysis
                </h3>
                <button 
                  onClick={onClose}
                  className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto max-h-[calc(100vh-250px)] pr-1 custom-scrollbar">
                {/* Core Stats */}
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Total Path Steps</p>
                    <p className="text-2xl font-bold text-white">{stats.stepsCount}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Final Subgroup Size</p>
                    <p className="text-2xl font-bold text-white">{stats.finalSize.toLocaleString()}</p>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                    <p className="text-[10px] text-cyan-400/60 uppercase tracking-wider font-bold mb-1">Entropy Contraction</p>
                    <p className="text-2xl font-bold text-cyan-400">{stats.contraction}</p>
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-cyan-500/10 text-xs font-mono">
                      <div>
                        <span className="text-cyan-400/60">Root H:</span>
                        <p className="text-white font-bold">{stats.rootEntropy}</p>
                      </div>
                      <div>
                        <span className="text-cyan-400/60">Final H:</span>
                        <p className="text-cyan-400 font-bold">{stats.finalEntropy}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                    <p className="text-[10px] text-violet-400/60 uppercase tracking-wider font-bold mb-1">Data Retention Rate</p>
                    <p className="text-2xl font-bold text-violet-400">{stats.retentionRate}%</p>
                  </div>
                </div>

                <div className="w-full h-px bg-white/[0.05]" />

                {/* Research Metrics */}
                <div>
                  <h4 className="text-xs font-bold text-white/30 uppercase tracking-wider mb-4">Information Theory</h4>
                  <div className="space-y-4">
                    <div>
                      <span className="text-white/60 text-xs font-semibold block mb-1">Shannon Information Entropy</span>
                      <p className="text-[10px] text-white/30 leading-relaxed">Measures categorical uncertainty or impurity. As the segregation tree branches down, the entropy contraction validates that the filtration steps successfully isolate homogeneous cohorts.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Export Actions */}
              <div className="pt-6 mt-auto border-t border-white/[0.05] space-y-3">
                <button 
                  onClick={handleDownloadCsv}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export CSV Data
                </button>
                <button 
                  onClick={handleDownloadPng}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-void font-bold shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-colors"
                >
                  <ImageIcon className="w-4 h-4" />
                  Save High-Res Chart
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
