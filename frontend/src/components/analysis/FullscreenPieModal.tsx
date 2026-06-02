import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Table2, PieChart as PieChartIcon, Download, Image as ImageIcon, Beaker, BarChart2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { toPng } from 'html-to-image';

interface FullscreenPieModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Array<{ name: string; value: number }>;
  title: string;
  colors: string[];
}

export const FullscreenPieModal: React.FC<FullscreenPieModalProps> = ({
  isOpen, onClose, data, title, colors
}) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const chartRef = useRef<HTMLDivElement>(null);
  const legendListRef = useRef<HTMLUListElement>(null);
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(new Set());

  // Reset exclusions when data changes or modal opens/closes
  React.useEffect(() => {
    setExcludedCategories(new Set());
  }, [data, isOpen]);

  const toggleCategory = (name: string) => {
    setExcludedCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        if (next.size >= data.length - 1) return prev; // Keep at least one subgroup active
        next.add(name);
      }
      return next;
    });
  };

  const filteredData = useMemo(() => {
    return data.filter(item => !excludedCategories.has(item.name));
  }, [data, excludedCategories]);

  // Compute Research Metrics dynamically from filtered active categories
  const metrics = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return null;
    
    const total = filteredData.reduce((sum, item) => sum + item.value, 0);
    let shannonEntropy = 0;
    let maxProp = 0;
    let minProp = Infinity;
    let dominantCategory = '';
    let dominantCount = 0;
    let rareCategory = '';
    let rareCount = 0;

    const enrichedData = filteredData.map(item => {
      const p = item.value / total;
      if (p > 0) shannonEntropy -= p * Math.log(p);
      if (p > maxProp) {
        maxProp = p;
        dominantCategory = item.name;
        dominantCount = item.value;
      }
      if (p < minProp) {
        minProp = p;
        rareCategory = item.name;
        rareCount = item.value;
      }
      return { ...item, percentage: p * 100 };
    });

    // Shannon Diversity Index: H = -sum(p * ln(p))
    const maxEntropy = Math.log(filteredData.length) || 1;
    const evenness = shannonEntropy / maxEntropy;
    const richness = filteredData.length;

    return {
      total,
      shannonEntropy: shannonEntropy.toFixed(3),
      evenness: evenness.toFixed(3),
      dominantCategory,
      dominantCount,
      dominanceRatio: (maxProp * 100).toFixed(1),
      rareCategory,
      rareCount,
      rareRatio: (minProp * 100).toFixed(1),
      richness,
      enrichedData: enrichedData.sort((a, b) => b.value - a.value)
    };
  }, [filteredData]);

  const handleDownloadPng = async () => {
    if (!chartRef.current) return;
    
    // Add downloading class to completely strip scrollbars and set overflow hidden via CSS
    chartRef.current.classList.add('downloading-png');
    
    try {
      const filter = (node: Element) => !(node instanceof HTMLElement && node.dataset.downloadIgnore === 'true');
      // Two-pass for font/style warm-up to ensure clean rendering
      await toPng(chartRef.current, { pixelRatio: 2, filter, cacheBust: true });
      const dataUrl = await toPng(chartRef.current, { pixelRatio: 2, filter, cacheBust: true });
      const a = document.createElement('a');
      a.download = `sdo_pie_${title.replace(/\s+/g, '_')}.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error('PNG Export failed:', err);
    } finally {
      // Remove downloading class to restore normal UI scrollbars and interaction
      chartRef.current.classList.remove('downloading-png');
    }
  };

  const handleDownloadCsv = () => {
    if (!metrics) return;
    const header = 'Category,Count,Percentage\n';
    const body = metrics.enrichedData.map(r => `"${r.name}",${r.value},${r.percentage.toFixed(1)}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sdo_pie_${title.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {isOpen && metrics && typeof document !== 'undefined' && createPortal(
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
                    <PieChartIcon className="w-4 h-4" /> Chart
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${viewMode === 'table' ? 'bg-cyan-500/20 text-cyan-400' : 'text-white/40 hover:text-white'}`}
                  >
                    <Table2 className="w-4 h-4" /> Data Table
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 relative w-full h-full">
                {viewMode === 'chart' ? (
                  <div className="grid grid-cols-12 gap-6 w-full h-full p-4">
                    {/* Left Panel: Pie chart (9/12 cols) — uses flex centering with square inner box so cx/cy=50% is always symmetric */}
                    <div className="col-span-9 w-full h-full flex items-center justify-center">
                      {/* Square aspect box ensures equal horizontal and vertical radius from cx/cy center */}
                      <div className="relative" style={{ width: 'min(100%, 100vh - 220px)', aspectRatio: '1 / 1' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            <Pie
                              data={metrics.enrichedData}
                              cx="50%"
                              cy="50%"
                              innerRadius="28%"
                              outerRadius="46%"
                              paddingAngle={2}
                              dataKey="value"
                              labelLine={metrics.richness <= 12}
                              label={metrics.richness <= 12
                                ? ({ name, percentage }: any) => {
                                    if (percentage < 2) return '';
                                    const shortName = name.length > 14 ? name.slice(0, 13) + '…' : name;
                                    return `${shortName} ${percentage.toFixed(1)}%`;
                                  }
                                : false
                              }
                            >
                              {metrics.enrichedData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="rgba(255,255,255,0.05)" />
                              ))}
                            </Pie>
                            
                            {/* Center text rendered directly inside SVG to guarantee perfect, pixel-accurate alignment with the Pie center */}
                            <text
                              x="50%"
                              y="50%"
                              dy="-18"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="rgba(255, 255, 255, 0.4)"
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                fontFamily: "'Inter', system-ui, sans-serif"
                              }}
                            >
                              TOTAL
                            </text>
                            <text
                              x="50%"
                              y="50%"
                              dy="5"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#ffffff"
                              style={{
                                fontSize: '24px',
                                fontWeight: 800,
                                fontFamily: "'Inter', system-ui, sans-serif"
                              }}
                            >
                              {metrics.total.toLocaleString()}
                            </text>
                            <text
                              x="50%"
                              y="50%"
                              dy="24"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#22D3EE"
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                fontFamily: "'Inter', system-ui, sans-serif"
                              }}
                            >
                              Records
                            </text>

                            <Tooltip 
                              content={({ active, payload }: any) => {
                                if (active && payload && payload.length) {
                                  const d = payload[0].payload;
                                  const displayLabel = title.replace("Composition Analysis: ", "").replace("Pie Chart Analysis", "").trim();
                                  const finalLabel = displayLabel ? displayLabel : 'Category';
                                  return (
                                    <div className="bg-[#0d1a30] border border-white/[0.08] rounded-xl px-4 py-3 shadow-2xl space-y-1 font-mono">
                                      <p className="text-white text-xs font-semibold">
                                        <span className="text-white/50">{finalLabel}: </span>
                                        <span className="text-cyan-400 font-bold">{d.name}</span>
                                      </p>
                                      <p className="text-white text-xs">
                                        <span className="text-white/50">Count: </span>
                                        <span className="font-bold text-white">{d.value.toLocaleString()}</span>
                                      </p>
                                      <p className="text-white text-xs">
                                        <span className="text-white/50">Percentage: </span>
                                        <span className="font-bold text-cyan-400">{d.percentage.toFixed(1)}%</span>
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Right Panel: Clean Sidebar Legend (3/12 cols) with interactive select/deselect toggles */}
                    <div className="col-span-3 flex items-center justify-center pr-2">
                      <ul ref={legendListRef} className="w-full max-h-full overflow-y-auto pr-1 custom-scrollbar bg-[#0b1220]/90 p-5 border border-white/[0.06] rounded-xl shadow-2xl">
                        <li className="text-[10px] uppercase tracking-wider font-extrabold text-white/40 mb-3 border-b border-white/[0.05] pb-2 flex justify-between items-center font-mono">
                          <div className="flex items-center gap-2">
                            <span>Subgroup</span>
                            <button
                              onClick={() => {
                                if (excludedCategories.size > 0) {
                                  setExcludedCategories(new Set());
                                } else {
                                  // Exclude all except the first one (highest count category)
                                  const sorted = [...data].sort((a, b) => b.value - a.value);
                                  const firstCat = sorted[0]?.name;
                                  if (firstCat) {
                                    setExcludedCategories(new Set(data.map(d => d.name).filter(n => n !== firstCat)));
                                  }
                                }
                              }}
                              className="text-[9px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded transition-all normal-case cursor-pointer select-none"
                              title="Toggle all categories"
                              data-download-ignore="true"
                            >
                              {excludedCategories.size > 0 ? "select all" : "clear all"}
                            </button>
                          </div>
                          <span>Distribution</span>
                        </li>
                        {[...data].sort((a, b) => b.value - a.value).map((entry: any, index: number) => {
                          const isExcluded = excludedCategories.has(entry.name);
                          const count = entry.value;
                          const activeTotal = metrics?.total ?? 0;
                          const pct = activeTotal > 0 ? (count / activeTotal) * 100 : 0;
                          const color = colors[index % colors.length];
                          return (
                            <li
                              key={`item-${index}`}
                              onClick={() => toggleCategory(entry.name)}
                              className="flex items-center justify-between w-full text-xs font-mono py-1.5 px-2 rounded-lg cursor-pointer hover:bg-white/[0.03] select-none transition-colors"
                            >
                              <span className="flex items-center gap-2 text-white/85 min-w-0 flex-1">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0 border transition-all duration-200"
                                  style={{
                                    backgroundColor: isExcluded ? 'transparent' : color,
                                    borderColor: isExcluded ? 'rgba(255,255,255,0.2)' : 'transparent'
                                  }}
                                />
                                <span className={`truncate transition-all ${isExcluded ? 'text-white/20 line-through' : 'text-white/80'}`} title={entry.name}>
                                  {entry.name}
                                </span>
                              </span>
                              <span className="flex-1 mx-2 border-b border-dotted border-white/20 align-bottom h-3" />
                              <span className={`shrink-0 font-bold transition-all ${isExcluded ? 'text-white/10 font-normal' : 'text-white/60'}`}>
                                {isExcluded ? `${count.toLocaleString()} (hidden)` : `${count.toLocaleString()} (${pct.toFixed(1)}%)`}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full overflow-auto custom-scrollbar pr-4">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#080f1f]/90 backdrop-blur-md z-10">
                        <tr>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05]">Category</th>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05] text-right">Count</th>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05] text-right">Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.enrichedData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.02] border-b border-white/[0.02] transition-colors">
                            <td className="py-3 px-4 text-sm font-medium text-white flex items-center gap-3">
                              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }} />
                              {row.name}
                            </td>
                            <td className="py-3 px-4 text-sm text-white/80 text-right font-mono">{row.value.toLocaleString()}</td>
                            <td className="py-3 px-4 text-sm text-cyan-400 text-right font-mono">{row.percentage.toFixed(2)}%</td>
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
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Total Records</p>
                    <p className="text-2xl font-bold text-white">{metrics.total.toLocaleString()}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Category Richness</p>
                    <p className="text-2xl font-bold text-violet-400">{metrics.richness.toLocaleString()}</p>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                    <p className="text-[10px] text-cyan-400/60 uppercase tracking-wider font-bold mb-1">Dominant Category</p>
                    <p className="text-lg font-bold text-cyan-400 truncate" title={metrics.dominantCategory}>{metrics.dominantCategory}</p>
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-cyan-500/10 text-xs font-mono">
                      <div>
                        <span className="text-cyan-400/60">Records:</span>
                        <p className="text-white font-bold">{metrics.dominantCount.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-cyan-400/60">Contribution:</span>
                        <p className="text-cyan-400 font-bold">{metrics.dominanceRatio}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <p className="text-[10px] text-rose-400/60 uppercase tracking-wider font-bold mb-1">Rare Category</p>
                    <p className="text-lg font-bold text-rose-400 truncate" title={metrics.rareCategory}>{metrics.rareCategory}</p>
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-rose-500/10 text-xs font-mono">
                      <div>
                        <span className="text-rose-400/60">Records:</span>
                        <p className="text-white font-bold">{metrics.rareCount.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-rose-400/60">Contribution:</span>
                        <p className="text-rose-400 font-bold">{metrics.rareRatio}%</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-white/[0.05]" />

                {/* Research Metrics */}
                <div>
                  <h4 className="text-xs font-bold text-white/30 uppercase tracking-wider mb-4">Diversity Metrics</h4>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white/60">Shannon Entropy (H)</span>
                        <span className="text-violet-400 font-mono font-bold">{metrics.shannonEntropy}</span>
                      </div>
                      <p className="text-[10px] text-white/30 leading-relaxed">Measures distributional diversity. Higher values indicate more evenly distributed categories.</p>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white/60">Evenness Index (E)</span>
                        <span className="text-emerald-400 font-mono font-bold">{metrics.evenness}</span>
                      </div>
                      <p className="text-[10px] text-white/30 leading-relaxed">Normalized entropy (0 to 1). 1.0 represents perfectly even distribution.</p>
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
        </div>,
        document.body
      )}
    </AnimatePresence>
  );
};
