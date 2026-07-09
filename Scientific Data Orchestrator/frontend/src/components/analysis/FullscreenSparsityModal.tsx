import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Table2, BarChart3, Download, Image as ImageIcon, Beaker, BarChart2 } from 'lucide-react';
import { toPng } from 'html-to-image';

interface FullscreenSparsityModalProps {
  isOpen: boolean;
  onClose: () => void;
  sparsity: {
    sparsity_pct: number;
    grid: number[];
  };
  chemical_diversity: {
    supported: boolean;
    tanimoto_mean: number;
    tanimoto_std: number;
    scaffold_count: number;
    unique_compounds: number;
  };
  title: string;
}

export const FullscreenSparsityModal: React.FC<FullscreenSparsityModalProps> = ({
  isOpen, onClose, sparsity, chemical_diversity, title
}) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const chartRef = useRef<HTMLDivElement>(null);

  const handleDownloadPng = async () => {
    if (!chartRef.current) return;
    try {
      const dataUrl = await toPng(chartRef.current, { pixelRatio: 2 });
      const a = document.createElement('a');
      a.download = `sdo_sparsity_${title.replace(/\s+/g, '_')}.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error('PNG Export failed:', err);
    }
  };

  const handleDownloadCsv = () => {
    if (!sparsity || !sparsity.grid) return;
    const header = 'SampleIndex,Status\n';
    const body = sparsity.grid.map((val, idx) => `${idx + 1},${val === 1 ? 'Present' : 'Missing'}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sdo_sparsity_${title.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && sparsity && (
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
                    <BarChart3 className="w-4 h-4" /> Sparsity Grid Map
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
                  <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
                    <div className="grid grid-cols-10 gap-1.5 border border-white/[0.08] p-3 bg-white/[0.01] rounded-2xl shadow-[0_0_30px_rgba(52,211,153,0.15)]">
                      {sparsity.grid.map((cell: number, idx: number) => (
                        <div
                          key={idx}
                          className={`w-10 h-10 rounded-lg transition-all duration-300 hover:scale-110 cursor-help
                            ${cell === 1 ? 'bg-emerald-400/90 shadow-[0_0_10px_rgba(52,211,153,0.4)]' : 'bg-white/[0.04]'}`}
                          title={cell === 1 ? 'Present Cell' : 'Missing Cell'}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-mono text-white/50 uppercase tracking-widest mt-6">Sparsity Density Map (10x10 Sample Grid)</span>
                  </div>
                ) : (
                  <div className="w-full h-full overflow-auto custom-scrollbar pr-4">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#080f1f]/90 backdrop-blur-md z-10">
                        <tr>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05]">Grid Coordinate</th>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05]">Row / Column Sample</th>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05] text-right">Quality Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sparsity.grid.map((cell, idx) => {
                          const r = Math.floor(idx / 10) + 1;
                          const c = (idx % 10) + 1;
                          return (
                            <tr key={idx} className="hover:bg-white/[0.02] border-b border-white/[0.02] transition-colors">
                              <td className="py-3 px-4 text-sm text-white/40 font-mono">Sample Cell ({r}, {c})</td>
                              <td className="py-3 px-4 text-sm font-medium text-white flex items-center gap-3 font-mono">
                                <span className={`w-3 h-3 rounded-full ${cell === 1 ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                                Row Sample {r} · Col Sample {c}
                              </td>
                              <td className={`py-3 px-4 text-sm text-right font-mono font-bold ${cell === 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {cell === 1 ? 'Data Present' : 'Missing Cell'}
                              </td>
                            </tr>
                          );
                        })}
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
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Tanimoto Mean Similarity</p>
                    <p className="text-2xl font-bold text-white">
                      {chemical_diversity.supported ? chemical_diversity.tanimoto_mean.toFixed(4) : 'N/A'}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Tanimoto Standard Deviation (σ)</p>
                    <p className="text-2xl font-bold text-white">
                      {chemical_diversity.supported ? chemical_diversity.tanimoto_std.toFixed(4) : 'N/A'}
                    </p>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                    <p className="text-[10px] text-cyan-400/60 uppercase tracking-wider font-bold mb-1">Bemis-Murcko Scaffolds</p>
                    <p className="text-2xl font-bold text-cyan-400">{chemical_diversity.supported ? chemical_diversity.scaffold_count : 0}</p>
                    <div className="grid grid-cols-1 gap-2 mt-2 pt-2 border-t border-cyan-500/10 text-xs font-mono">
                      <div>
                        <span className="text-cyan-400/60">Parsed Compounds:</span>
                        <p className="text-white font-bold">{chemical_diversity.supported ? chemical_diversity.unique_compounds : 0}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <p className="text-[10px] text-rose-400/60 uppercase tracking-wider font-bold mb-1">Cell Sparsity Percentage</p>
                    <p className="text-2xl font-bold text-rose-400">{sparsity.sparsity_pct.toFixed(2)}%</p>
                  </div>
                </div>

                <div className="w-full h-px bg-white/[0.05]" />

                {/* Research Metrics */}
                <div>
                  <h4 className="text-xs font-bold text-white/30 uppercase tracking-wider mb-4">Chemical Space Coverage</h4>
                  <div className="space-y-4">
                    <div>
                      <span className="text-white/60 text-xs font-semibold block mb-1">Diversity & Sparsity</span>
                      <p className="text-[10px] text-white/30 leading-relaxed">Pairwise Tanimoto similarity evaluates structural diversity. A balanced coefficient prevents both model overfitting (too high) and prediction domain overflow (too low).</p>
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
