import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  LineChart,
  Line
} from 'recharts';
import { Download, PieChart as PieIcon, BarChart2, TrendingDown, HelpCircle, Activity } from 'lucide-react';
import type { SimpleFunnelStep } from '../../services/simpleAnalysisApi';

interface FiltrationChartSetProps {
  step: SimpleFunnelStep;
  allSteps: SimpleFunnelStep[];
  clientId: string;
}

export const FiltrationChartSet: React.FC<FiltrationChartSetProps> = ({
  step,
  allSteps,
  clientId,
}) => {
  const [activeTab, setActiveTab] = useState<'composition' | 'reduction' | 'distributions'>('composition');

  const charts = step.charts || {};
  const compositionPie = charts.composition_pie || { labels: [], values: [], title: '' };
  const compositionBar = charts.composition_bar || { x: [], y: [], title: '' };
  const distributions = charts.distributions || {};

  // ── Prepare Pie Data ──────────────────────────────────────────────────────
  const pieData = compositionPie.labels.map((lbl: string, i: number) => ({
    name: lbl,
    value: compositionPie.values[i] || 0,
  })).slice(0, 8); // Top 8 values for visual cleanliness

  // ── Prepare Bar Data ──────────────────────────────────────────────────────
  const barData = compositionBar.x.map((xVal: string, i: number) => ({
    name: xVal,
    count: compositionBar.y[i] || 0,
  })).slice(0, 10); // Top 10 categories

  // ── Prepare Reduction Data across all steps ──────────────────────────────
  const reductionData = allSteps.map((s, idx) => ({
    name: idx === 0 ? 'Root' : `Step ${idx}`,
    rows: s.row_count,
    compounds: s.unique_compounds,
    retention: s.pct_retained,
  }));

  const COLORS = ['#22d3ee', '#a855f7', '#fbbf24', '#34d399', '#f87171', '#60a5fa', '#f472b6', '#a78bfa'];

  // ── Export Chart Data helper ──────────────────────────────────────────────
  const handleExport = (type: 'csv' | 'json', dataset: any[], filename: string) => {
    let content = '';
    let mimeType = 'text/plain';

    if (type === 'json') {
      content = JSON.stringify(dataset, null, 2);
      mimeType = 'application/json';
    } else {
      // CSV
      if (dataset.length === 0) return;
      const headers = Object.keys(dataset[0]);
      const rows = dataset.map((row) =>
        headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
      );
      content = [headers.join(','), ...rows].join('\n');
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.${type}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tab Selector bar */}
      <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
        <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/[0.04] p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('composition')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${activeTab === 'composition' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/40 hover:text-white/60'}`}
          >
            <PieIcon className="w-3.5 h-3.5" />
            Step Composition
          </button>
          <button
            onClick={() => setActiveTab('reduction')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${activeTab === 'reduction' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/40 hover:text-white/60'}`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            Funnel Sizing
          </button>
          {Object.keys(distributions).length > 0 && (
            <button
              onClick={() => setActiveTab('distributions')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${activeTab === 'distributions' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/40 hover:text-white/60'}`}
            >
              <Activity className="w-3.5 h-3.5" />
              Descriptor Curves
            </button>
          )}
        </div>
      </div>

      {/* Render Active Chart panel */}
      <AnimatePresence mode="wait">
        {activeTab === 'composition' && (
          <motion.div
            key="composition"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Composition Pie */}
            <div className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-bold text-white text-left">
                    Categorical Breakdown ({compositionPie.title || 'Splitting Variable'})
                  </h4>
                  <p className="text-[10px] text-white/30 text-left">Relative percentage distribution of categories</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleExport('csv', pieData, 'composition_pie')}
                    className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-white/40 hover:text-white/60 text-[10px] font-bold flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> CSV
                  </button>
                  <button
                    onClick={() => handleExport('json', pieData, 'composition_pie')}
                    className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-white/40 hover:text-white/60 text-[10px] font-bold flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> JSON
                  </button>
                </div>
              </div>

              {pieData.length > 0 ? (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                        itemStyle={{ color: '#e2e8f0', fontSize: '12px' }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        formatter={(val) => <span className="text-[10px] text-white/60">{val}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-60 flex items-center justify-center text-xs text-white/20">
                  No categorical composition data precalculated.
                </div>
              )}
            </div>

            {/* Composition Bar */}
            <div className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-bold text-white text-left">
                    Category Counts ({compositionBar.title || 'Splitting Variable'})
                  </h4>
                  <p className="text-[10px] text-white/30 text-left">Exact counts per subgroup category</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleExport('csv', barData, 'composition_bar')}
                    className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-white/40 hover:text-white/60 text-[10px] font-bold flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> CSV
                  </button>
                  <button
                    onClick={() => handleExport('json', barData, 'composition_bar')}
                    className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-white/40 hover:text-white/60 text-[10px] font-bold flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> JSON
                  </button>
                </div>
              </div>

              {barData.length > 0 ? (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                      <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                        itemStyle={{ color: '#e2e8f0', fontSize: '12px' }}
                      />
                      <Bar dataKey="count" fill="url(#barGradient)" radius={[8, 8, 0, 0]}>
                        <defs>
                          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.8} />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.1} />
                          </linearGradient>
                        </defs>
                        {barData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} opacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-60 flex items-center justify-center text-xs text-white/20">
                  No categorical count data precalculated.
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'reduction' && (
          <motion.div
            key="reduction"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Reduction Funnel Trend */}
            <div className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-bold text-white text-left">
                    Row & Compound Filtration Trend
                  </h4>
                  <p className="text-[10px] text-white/30 text-left">Quantity reduction curve across progressive stages</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleExport('csv', reductionData, 'filtration_reduction')}
                    className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-white/40 hover:text-white/60 text-[10px] font-bold flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> CSV
                  </button>
                </div>
              </div>

              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={reductionData}>
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={10} />
                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                      itemStyle={{ color: '#e2e8f0', fontSize: '12px' }}
                    />
                    <Legend iconType="circle" />
                    <Area type="monotone" dataKey="rows" stroke="#22d3ee" fillOpacity={0.15} fill="url(#rowsGrad)" name="Rows" />
                    <Area type="monotone" dataKey="compounds" stroke="#a855f7" fillOpacity={0.15} fill="url(#compoundsGrad)" name="Compounds" />
                    <defs>
                      <linearGradient id="rowsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="compoundsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Retention Percentage Trend */}
            <div className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-bold text-white text-left">
                    Database Retention rate (%)
                  </h4>
                  <p className="text-[10px] text-white/30 text-left">Percentage of dataset preserved at each stage</p>
                </div>
              </div>

              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={reductionData}>
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={10} />
                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                      itemStyle={{ color: '#e2e8f0', fontSize: '12px' }}
                    />
                    <Line type="monotone" dataKey="retention" stroke="#fbbf24" strokeWidth={3} activeDot={{ r: 8 }} name="Retention %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'distributions' && (
          <motion.div
            key="distributions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 gap-6"
          >
            {Object.entries(distributions).map(([roleName, item]: [string, any], dIdx) => {
              const curveData = item.counts.map((cnt: number, i: number) => ({
                value: item.bins[i] || 0,
                Frequency: cnt,
              }));

              return (
                <div key={roleName} className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl relative">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase text-left">
                        {roleName} Continuous Distribution Curve
                      </h4>
                      <p className="text-[10px] text-white/30 text-left">
                        Mean: {item.mean} · Median: {item.median} · Std Dev: {item.std}
                      </p>
                    </div>
                  </div>

                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={curveData}>
                        <XAxis dataKey="value" stroke="rgba(255,255,255,0.3)" fontSize={10} tickFormatter={(val) => Number(val).toFixed(2)} />
                        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '12px' }}
                          itemStyle={{ color: '#e2e8f0', fontSize: '12px' }}
                        />
                        <Area type="monotone" dataKey="Frequency" stroke="#34d399" fillOpacity={0.15} fill="url(#distGrad)" />
                        <defs>
                          <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
