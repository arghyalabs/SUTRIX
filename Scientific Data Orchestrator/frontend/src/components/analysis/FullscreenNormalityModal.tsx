import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Table2, BarChart3, Download, Image as ImageIcon, Beaker, BarChart2 } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toPng } from 'html-to-image';

interface NormalityBin {
  bin_start: number;
  bin_end: number;
  bin_label: string;
  actual_count: number;
  normal_count: number;
}

interface FullscreenNormalityModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    is_numeric: boolean;
    mean: number;
    median: number;
    std: number;
    shapiro_w: number;
    shapiro_p: number;
    verdict: string;
    skewness: number;
    histogram: NormalityBin[];
  };
  title: string;
}

export const FullscreenNormalityModal: React.FC<FullscreenNormalityModalProps> = ({
  isOpen, onClose, data, title
}) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const chartRef = useRef<HTMLDivElement>(null);

  const handleDownloadPng = async () => {
    if (!chartRef.current) return;
    try {
      const filter = (node: Element) => !(node instanceof HTMLElement && node.dataset.downloadIgnore === 'true');
      const dataUrl = await toPng(chartRef.current, { pixelRatio: 2, filter });
      const a = document.createElement('a');
      a.download = `sdo_normality_${title.replace(/\s+/g, '_')}.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error('PNG Export failed:', err);
    }
  };

  const handleDownloadCsv = () => {
    if (!data || !data.histogram) return;
    const header = 'Bin Label,Bin Start,Bin End,Observed Count,Expected Gaussian Count\n';
    const body = data.histogram.map(r => `"${r.bin_label}",${r.bin_start},${r.bin_end},${r.actual_count},${r.normal_count}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sdo_normality_${title.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && data && (
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
                      <ComposedChart data={data.histogram} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis
                          dataKey="bin_label"
                          tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600 }}
                          axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0d1a30', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
                          itemStyle={{ fontSize: 11, fontWeight: 'bold' }}
                        />
                        <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11, fontFamily: 'monospace' }} />
                        <Bar name="Observed Bin Count" dataKey="actual_count" fill="#22d3ee" fillOpacity={0.7} radius={[4, 4, 0, 0]} />
                        <Line name="Theoretical Gaussian Curve" type="monotone" dataKey="normal_count" stroke="#f43f5e" strokeWidth={3} dot={false} strokeDasharray="5 5" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="w-full h-full overflow-auto custom-scrollbar pr-4">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#080f1f]/90 backdrop-blur-md z-10">
                        <tr>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05]">Bin Interval</th>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05] text-right">Observed Count</th>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05] text-right">Expected Normal Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.histogram.map((row, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.02] border-b border-white/[0.02] transition-colors">
                            <td className="py-3 px-4 text-sm font-medium text-white flex items-center gap-3 font-mono">
                              <span className="w-3 h-3 rounded-full bg-cyan-400" />
                              {row.bin_label}
                            </td>
                            <td className="py-3 px-4 text-sm text-white/80 text-right font-mono">{row.actual_count.toLocaleString()}</td>
                            <td className="py-3 px-4 text-sm text-cyan-400 text-right font-mono">{row.normal_count.toFixed(2)}</td>
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
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Mean (μ)</p>
                    <p className="text-2xl font-bold text-white">{data.mean.toFixed(4)}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Std Dev (σ)</p>
                    <p className="text-2xl font-bold text-white">{data.std.toFixed(4)}</p>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                    <p className="text-[10px] text-cyan-400/60 uppercase tracking-wider font-bold mb-1">Shapiro W Statistic</p>
                    <p className="text-2xl font-bold text-cyan-400">{data.shapiro_w.toFixed(5)}</p>
                    <div className="grid grid-cols-1 gap-2 mt-2 pt-2 border-t border-cyan-500/10 text-xs font-mono">
                      <div>
                        <span className="text-cyan-400/60">p-value:</span>
                        <p className="text-white font-bold">{data.shapiro_p.toFixed(5)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                    <p className="text-[10px] text-violet-400/60 uppercase tracking-wider font-bold mb-1">Normality Verdict</p>
                    <p className="text-lg font-bold text-white">{data.verdict}</p>
                    <div className="grid grid-cols-1 gap-2 mt-2 pt-2 border-t border-violet-500/10 text-xs font-mono">
                      <div>
                        <span className="text-violet-400/60">Skewness:</span>
                        <p className="text-cyan-400 font-bold">{data.skewness.toFixed(3)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-white/[0.05]" />

                {/* Research Metrics */}
                <div>
                  <h4 className="text-xs font-bold text-white/30 uppercase tracking-wider mb-4">Normality & Modeling</h4>
                  <div className="space-y-4">
                    <div>
                      <span className="text-white/60 text-xs font-semibold block mb-1">Gaussian Bell Curves</span>
                      <p className="text-[10px] text-white/30 leading-relaxed">Most parametric statistical models and QSAR regressions assume normally distributed endpoint values. Non-normal distributions flag unresolved latent variables.</p>
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
