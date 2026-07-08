import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Play, Info, CheckCircle2 } from 'lucide-react';
import { useColumnIntelligence } from '../../../hooks/useColumnIntelligence';
import { toast } from 'react-hot-toast';
import { SciPanel } from '../../../components/charts/SciPanel';
import { SciScatter } from '../../../components/charts/SciScatter';
import type { ScatterSeries, ScatterPoint } from '../../../components/charts/SciScatter';

interface PanelProps {
  clientId: string;
  apiBase: string;
}

interface GroupStat {
  group_name: string;
  n: number;
  mean: number;
  median: number;
  std: number;
  is_normal: boolean;
  values: number[];
}

interface TestResult {
  test_name: string;
  statistic: number;
  p_value: number;
  significance: string;
  interpretation: string;
  groups: GroupStat[];
}

export const StatisticalTestPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const { columns } = useColumnIntelligence(clientId, apiBase);
  const [numericCol, setNumericCol] = useState('');
  const [groupCol, setGroupCol] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect defaults
  useEffect(() => {
    if (columns.length > 0) {
      const num = columns.find(c => c.role === 'ENDPOINT');
      const cat = columns.find(c => c.role === 'CATEGORICAL' || c.name.toLowerCase().includes('species') || c.name.toLowerCase().includes('group'));
      if (num) setNumericCol(num.name);
      if (cat) setGroupCol(cat.name);
    }
  }, [columns]);

  const runTest = async () => {
    if (!numericCol || !groupCol) {
      toast.error('Select both a numeric column and a grouping column');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append('numeric_col', numericCol);
    form.append('group_col', groupCol);

    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/statistical-test`, {
        method: 'POST',
        body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Statistical test failed');
      setResult(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
            Numeric Variable (Compare values)
          </label>
          <select
            value={numericCol}
            onChange={e => setNumericCol(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs focus:outline-none focus:border-cyan-400/30"
          >
            <option value="">-- Select Numeric Variable --</option>
            {columns.filter(c => c.role === 'ENDPOINT' || c.role === 'DESCRIPTOR' || c.role === 'UNKNOWN').map(c => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.role})
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
            Grouping Variable (Categorical)
          </label>
          <select
            value={groupCol}
            onChange={e => setGroupCol(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs focus:outline-none focus:border-cyan-400/30"
          >
            <option value="">-- Select Grouping Variable --</option>
            {columns.filter(c => c.role === 'CATEGORICAL' || c.role === 'IDENTIFIER' || c.role === 'UNKNOWN').map(c => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.role})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={runTest}
          disabled={loading || !numericCol || !groupCol}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-bold hover:bg-violet-500/20 transition-all disabled:opacity-40"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Running test...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              Run Hypothesis Test
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && !result && (
        <div className="flex items-center justify-center py-10 gap-2 text-cyan-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-semibold">Running statistical comparison models...</span>
        </div>
      )}

      {result && (
        <div className="space-y-6 animate-all duration-300">
          {/* Summary / Interpretation Banner */}
          <div className={`p-4 rounded-xl border text-xs leading-normal flex gap-3 ${
            result.significance === 'significant'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-slate-500/10 border-white/[0.08] text-slate-300'
          }`}>
            {result.significance === 'significant' ? (
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <strong>{result.test_name} Summary</strong>
              <div>{result.interpretation}</div>
              <div className="text-[10px] text-slate-500 font-mono">
                Statistic value: {result.statistic.toFixed(4)} | p-value: {result.p_value.toExponential(4)}
              </div>
            </div>
          </div>

          {/* Group details list & Scatter Plot with jitter */}
          <div className="grid grid-cols-3 gap-4">
            {/* Table */}
            <div className="col-span-2 rounded-xl border border-white/[0.06] overflow-hidden self-start">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/[0.04] border-b border-white/[0.06]">
                    <th className="px-3 py-2 text-left font-semibold text-slate-500" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>Group Name</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>N</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>Mean</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>Median</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>Std Dev</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-500" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>Normality</th>
                  </tr>
                </thead>
                <tbody>
                  {result.groups.map((gp, idx) => (
                    <tr
                      key={gp.group_name}
                      style={{
                        background: idx % 2 ? 'rgba(255,255,255,0.01)' : 'transparent',
                        fontFamily: "'Geist Mono', monospace",
                        fontSize: 11,
                      }}
                      className="hover:bg-white/[0.02] border-b border-white/[0.03]"
                    >
                      <td className="px-3 py-2.5 font-semibold text-white">{gp.group_name}</td>
                      <td className="px-3 py-2.5 text-slate-400">{gp.n}</td>
                      <td className="px-3 py-2.5 text-slate-300">{gp.mean.toFixed(4)}</td>
                      <td className="px-3 py-2.5 text-slate-400">{gp.median.toFixed(4)}</td>
                      <td className="px-3 py-2.5 text-slate-400">{gp.std.toFixed(4)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          gp.is_normal ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {gp.is_normal ? 'Normal' : 'Skewed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Scientific Explanation Card */}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[11px] leading-relaxed text-slate-400 space-y-2 h-fit">
              <div className="font-bold text-slate-200 text-xs">Test Auto-Selection Criteria</div>
              <p>
                The system automatically audits group normality using the <strong>Shapiro-Wilk</strong> algorithm:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Welch's t-test</strong> (2 groups, both normal): robust against unequal variances.
                </li>
                <li>
                  <strong>Mann-Whitney U</strong> (2 groups, skewed): non-parametric median comparison.
                </li>
                <li>
                  <strong>One-way ANOVA</strong> (&gt;2 groups, all normal): parametric variance comparison.
                </li>
                <li>
                  <strong>Kruskal-Wallis</strong> (&gt;2 groups, skewed): non-parametric group comparison.
                </li>
              </ul>
            </div>
          </div>

          {/* Jitter scatter plot via SciScatter */}
          <SciPanel title="STATISTICAL TEST RESULTS" height={300}>
            <SciScatter
              series={result.groups.map((gp, gpIdx) => ({
                name: gp.group_name,
                data: gp.values.map((val, idx) => ({
                  x: gpIdx + (Math.sin(idx * 342.3) * 0.15),
                  y: val,
                  label: gp.group_name,
                  color: result.significance === 'significant' ? '#22D3EE' : '#94A3B8',
                })),
              }))}
              height={268}
              xLabel="Group"
              yLabel={numericCol}
              xDomain={[-0.5, result.groups.length - 0.5]}
              tooltipFormatter={(point, seriesName) => (
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: '#F1F5F9' }}>
                  <span style={{ color: '#64748B' }}>group </span>
                  <span style={{ color: '#22D3EE', fontWeight: 600 }}>{seriesName}</span>
                  {'  '}
                  <span style={{ color: '#64748B' }}>val </span>
                  <span style={{ color: '#22D3EE', fontWeight: 600 }}>{point.y?.toFixed(4)}</span>
                </span>
              )}
            />
          </SciPanel>
        </div>
      )}
    </div>
  );
};
