import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Table2, BarChart3, Download, Image as ImageIcon, Beaker, BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, Legend } from 'recharts';
import { toPng } from 'html-to-image';

interface AttritionStep {
  step: string;
  count: number;
  change: number;
}

interface FullscreenAttritionModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: AttritionStep[];
  title: string;
}

export const FullscreenAttritionModal: React.FC<FullscreenAttritionModalProps> = ({
  isOpen, onClose, data, title
}) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const chartRef = useRef<HTMLDivElement>(null);

  const stats = React.useMemo(() => {
    if (!data || data.length === 0) return null;
    const rawStep = data[0];
    const invalidStep = data[1];
    const dedupStep = data[2];
    const finalStep = data[data.length - 1];

    const totalDropped = rawStep.count - finalStep.count;
    const retentionPct = (finalStep.count / (rawStep.count || 1)) * 100;

    return {
      rawCount: rawStep.count,
      finalCount: finalStep.count,
      invalidLoss: Math.abs(invalidStep.change),
      dedupLoss: Math.abs(dedupStep.change),
      totalDropped,
      retentionPct: retentionPct.toFixed(1)
    };
  }, [data]);

  const handleDownloadPng = async () => {
    if (!chartRef.current) return;
    try {
      const filter = (node: Element) => !(node instanceof HTMLElement && node.dataset.downloadIgnore === 'true');
      const dataUrl = await toPng(chartRef.current, { pixelRatio: 2, filter });
      const a = document.createElement('a');
      a.download = `sdo_attrition_${title.replace(/\s+/g, '_')}.png`;
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error('PNG Export failed:', err);
    }
  };

  const handleDownloadCsv = () => {
    if (!data) return;
    const header = 'Step,Remaining Count,Loss Change\n';
    const body = data.map(r => `"${r.step}",${r.count},${r.change}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sdo_attrition_${title.replace(/\s+/g, '_')}.csv`;
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
                      <BarChart data={data} margin={{ top: 30, right: 20, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis
                          dataKey="step"
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
                          formatter={(value: any, name: any, props: any) => {
                            const change = props.payload.change;
                            const changeLabel = change !== 0 ? ` (${change > 0 ? '+' : ''}${change.toLocaleString()} rows)` : '';
                            return [`${value.toLocaleString()}${changeLabel}`, name];
                          }}
                        />
                        <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11, fontFamily: 'monospace' }} />
                        <Bar name="Retained Records Count" dataKey="count" radius={[4, 4, 0, 0]} barSize={45}>
                          {data.map((entry, index) => {
                            const isLast = index === data.length - 1;
                            const isFirst = index === 0;
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
                                  y={y - 10}
                                  fill="rgba(255,255,255,0.85)"
                                  fontSize={11}
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
                  </div>
                ) : (
                  <div className="w-full h-full overflow-auto custom-scrollbar pr-4">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#080f1f]/90 backdrop-blur-md z-10">
                        <tr>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05]">Cleansing Stage</th>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05] text-right">Remaining Records</th>
                          <th className="py-4 px-4 text-xs font-bold uppercase tracking-wider text-white/40 border-b border-white/[0.05] text-right">Stage Attrition (Loss)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, idx) => (
                          <tr key={idx} className="hover:bg-white/[0.02] border-b border-white/[0.02] transition-colors">
                            <td className="py-3 px-4 text-sm font-medium text-white flex items-center gap-3 font-mono">
                              <span className={`w-3 h-3 rounded-full ${idx === 0 || idx === data.length - 1 ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                              {row.step}
                            </td>
                            <td className="py-3 px-4 text-sm text-white/80 text-right font-mono">{row.count.toLocaleString()}</td>
                            <td className={`py-3 px-4 text-sm text-right font-mono font-bold ${row.change < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {row.change === 0 ? 'Initial State' : `${row.change.toLocaleString()} rows`}
                            </td>
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
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Raw Uploaded Rows</p>
                    <p className="text-2xl font-bold text-white">{stats.rawCount.toLocaleString()}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-bold mb-1">Final Retained Rows</p>
                    <p className="text-2xl font-bold text-white">{stats.finalCount.toLocaleString()}</p>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                    <p className="text-[10px] text-cyan-400/60 uppercase tracking-wider font-bold mb-1">Pruning Filter Loss</p>
                    <p className="text-2xl font-bold text-cyan-400">-{stats.invalidLoss.toLocaleString()}</p>
                    <div className="grid grid-cols-1 gap-2 mt-2 pt-2 border-t border-cyan-500/10 text-xs font-mono">
                      <div>
                        <span className="text-cyan-400/60">Deduplication Loss:</span>
                        <p className="text-white font-bold">-{stats.dedupLoss.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                    <p className="text-[10px] text-violet-400/60 uppercase tracking-wider font-bold mb-1">Retention Percentage</p>
                    <p className="text-2xl font-bold text-violet-400">{stats.retentionPct}%</p>
                  </div>
                </div>

                <div className="w-full h-px bg-white/[0.05]" />

                {/* Research Metrics */}
                <div>
                  <h4 className="text-xs font-bold text-white/30 uppercase tracking-wider mb-4">OECD Principle 5 Compliance</h4>
                  <div className="space-y-4">
                    <div>
                      <span className="text-white/60 text-xs font-semibold block mb-1">Audit Traceability</span>
                      <p className="text-[10px] text-white/30 leading-relaxed">Tracks raw-to-modeled data lineage. Provides the exact audit trail of pruning filters, duplicate consolidation, and partition splits required for regulatory validation.</p>
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
