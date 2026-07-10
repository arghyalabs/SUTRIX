import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, Cpu, Trophy, ChevronDown, ChevronUp, Play, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SciPanel } from '../../../components/charts/SciPanel';
import { SciBar } from '../../../components/charts/SciBar';
import type { SciBarDatum } from '../../../components/charts/SciBar';
import { SciScatter } from '../../../components/charts/SciScatter';
import type { ScatterSeries } from '../../../components/charts/SciScatter';
import { SCI_COLORS } from '../../../components/charts/chartTheme';

interface Props {
  clientId: string;
  apiBase: string;
  sessionInfo: any;
  onSessionLoaded: (i: any) => void;
}

interface ModelResult {
  model: string;
  r2_test?: number;
  rmse_test?: number;
  cv_r2_mean?: number;
  cv_r2_std?: number;
  status: string;
  error?: string;
}

interface ValidationMetrics {
  q2_loo: number;
  sdep: number;
  crmse: number;
  r2_train: number;
  delta_r2_q2: number;
  n_cv_folds: number;
  cv_type: string;
  endpoint_col: string;
  n: number;
  scatter_data: { actual: number; predicted: number; residual: number }[];
}

interface YRandResult {
  real_r2: number;
  permuted_r2_distribution: number[];
  p_value: number;
  is_significant: boolean;
  n_permutations: number;
  interpretation: string;
}

function r2Color(v?: number | null): string {
  if (v === null || v === undefined) return 'text-slate-500';
  if (v >= 0.8) return 'text-emerald-400';
  if (v >= 0.6) return 'text-blue-400';
  if (v >= 0.4) return 'text-amber-400';
  return 'text-rose-400';
}

export const MLBenchmarkPanel: React.FC<Props> = ({ clientId, apiBase, sessionInfo }) => {
  const [endpointCol, setEndpointCol] = useState(sessionInfo?.endpoint_col || '');
  const [testSize, setTestSize] = useState(0.2);
  const [subgroup, setSubgroup] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('IDLE');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showImportances, setShowImportances] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Validation states
  const [valMetrics, setValMetrics] = useState<ValidationMetrics | null>(null);
  const [valLoading, setValLoading] = useState(false);
  const [yRand, setYRand] = useState<YRandResult | null>(null);
  const [yRandLoading, setYRandLoading] = useState(false);
  const [valTab, setValTab] = useState<'scatter' | 'residual' | 'yrand'>('scatter');

  useEffect(() => {
    if (sessionInfo?.endpoint_col) {
      setEndpointCol(sessionInfo.endpoint_col);
    }
  }, [sessionInfo]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const fetchValidationMetrics = async () => {
    setValLoading(true);
    try {
      const q = subgroup ? `?subgroup=${encodeURIComponent(subgroup)}&endpoint_col=${encodeURIComponent(endpointCol)}` : `?endpoint_col=${encodeURIComponent(endpointCol)}`;
      const r = await fetch(`${apiBase}/api/qsar-studio/${clientId}/validation-metrics${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Failed to fetch validation metrics');
      setValMetrics(d);
    } catch (e: any) {
      toast.error(e.message || 'Failed to compute validation metrics');
    } finally {
      setValLoading(false);
    }
  };

  const poll = (jid: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${apiBase}/api/qsar-studio/${clientId}/benchmark/status?job_id=${jid}`);
        const d = await r.json();
        setStatus(d.status);
        if (d.status === 'DONE') {
          stopPolling();
          setResult(d.result);
          toast.success('ML Benchmark complete!');
        } else if (d.status === 'FAILED') {
          stopPolling();
          setError(d.error || 'Benchmark failed');
          toast.error('Benchmark failed');
        }
      } catch (e) {
        stopPolling();
      }
    }, 1000);
  };

  const launch = async () => {
    if (!endpointCol) {
      toast.error('Enter an endpoint column name');
      return;
    }
    setStatus('PENDING');
    setResult(null);
    setError(null);
    setValMetrics(null);
    setYRand(null);
    const form = new FormData();
    form.append('endpoint_col', endpointCol);
    form.append('test_size', testSize.toString());
    if (subgroup) form.append('subgroup', subgroup);
    try {
      const r = await fetch(`${apiBase}/api/qsar-studio/${clientId}/benchmark`, {
        method: 'POST',
        body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setJobId(d.job_id);
      setStatus('RUNNING');
      poll(d.job_id);
    } catch (e: any) {
      setError(e.message);
      setStatus('IDLE');
    }
  };

  const handleRunYRand = async () => {
    setYRandLoading(true);
    try {
      const form = new FormData();
      form.append('endpoint_col', endpointCol);
      form.append('n_permutations', '100');
      if (subgroup) form.append('subgroup', subgroup);

      const r = await fetch(`${apiBase}/api/qsar-studio/${clientId}/y-randomization`, {
        method: 'POST',
        body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Y-randomization failed');
      setYRand(d);
      toast.success('Y-Randomization complete!');
    } catch (e: any) {
      toast.error(e.message || 'Y-Randomization failed');
    } finally {
      setYRandLoading(false);
    }
  };

  useEffect(() => {
    if (result) {
      fetchValidationMetrics();
    }
  }, [result]);

  useEffect(() => () => stopPolling(), []);

  const models: ModelResult[] = result?.models ?? [];
  const importances: { feature: string; importance: number }[] = result?.feature_importances ?? [];
  const subgroups: string[] = Array.isArray(sessionInfo?.subgroups) ? sessionInfo.subgroups : [];

  // SciBar data: one bar per model showing R² Test score
  const perfBarData: SciBarDatum[] = models
    .filter(m => m.status === 'ok')
    .map((m, i) => ({
      label: m.model,
      value: +(m.r2_test ?? 0).toFixed(4),
      color: SCI_COLORS[i % SCI_COLORS.length] as string,
    }));

  // Scatter & Residual plot data
  const scatterPoints = valMetrics?.scatter_data || [];

  // Predicted vs Actual series (x=actual, y=predicted)
  const scatterSeries: ScatterSeries[] = [{
    name: 'Predicted vs Actual',
    color: '#22D3EE',
    data: scatterPoints.map(p => ({ x: p.actual, y: p.predicted })),
  }];

  // Residual series (x=predicted, y=residual)
  const residualSeries: ScatterSeries[] = [{
    name: 'Residuals',
    color: SCI_COLORS[1] as string,
    data: scatterPoints.map(p => ({ x: p.predicted, y: p.residual })),
  }];

  // Y-rand histogram data
  const yRandChartData = yRand
    ? yRand.permuted_r2_distribution.reduce((acc: { r2: number; count: number }[], curr) => {
        const bin = Math.round(curr * 20) / 20;
        const existing = acc.find(item => Math.abs(item.r2 - bin) < 0.01);
        if (existing) {
          existing.count += 1;
        } else {
          acc.push({ r2: bin, count: 1 });
        }
        return acc;
      }, []).sort((a, b) => a.r2 - b.r2)
    : [];

  const yRandBarData: SciBarDatum[] = yRandChartData.map(d => ({
    label: d.r2.toFixed(2),
    value: d.count,
  }));

  return (
    <div className="space-y-6">
      {/* Config */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          QSAR Benchmarking Controls
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
              Endpoint Column *
            </label>
            <input
              value={endpointCol}
              onChange={e => setEndpointCol(e.target.value)}
              placeholder="e.g. lc50_mg_l, pec50"
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs font-mono focus:outline-none focus:border-cyan-400/30"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
              Test Set Size
            </label>
            <div className="flex items-center gap-2 pt-1.5">
              <input
                type="range"
                min={0.1}
                max={0.4}
                step={0.05}
                value={testSize}
                onChange={e => setTestSize(parseFloat(e.target.value))}
                className="flex-1 accent-cyan-400"
              />
              <span className="text-xs text-cyan-300 font-bold w-8">{Math.round(testSize * 100)}%</span>
            </div>
          </div>
          {subgroups.length > 1 && (
            <div className="col-span-2">
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
                Subgroup Selection
              </label>
              <select
                value={subgroup}
                onChange={e => setSubgroup(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0b1224] border border-white/[0.05] text-slate-300 text-xs focus:outline-none focus:border-cyan-400/30"
              >
                <option value="" className="bg-[#0b1224] text-[#CBD5E1]">All (merged)</option>
                {subgroups.map(s => (
                  <option key={s} value={s} className="bg-[#0b1224] text-[#CBD5E1]">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={launch}
          disabled={status === 'RUNNING' || status === 'PENDING'}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-bold hover:bg-cyan-500/20 transition-all disabled:opacity-40"
        >
          {status === 'RUNNING' || status === 'PENDING' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              Running benchmark...
            </>
          ) : (
            <>
              <Cpu className="w-3.5 h-3.5" />
              Launch ML Benchmark
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

      {/* Running indicator */}
      {(status === 'RUNNING' || status === 'PENDING') && (
        <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/10 text-xs text-cyan-300/70 text-center">
          Training 5 models with {Math.round((1 - testSize) * 100)}% train / {Math.round(testSize * 100)}% test split + cross-validation...
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Train Samples', value: result.n_train?.toLocaleString() },
              { label: 'Test Samples', value: result.n_test?.toLocaleString() },
              { label: 'Features Used', value: result.n_features?.toLocaleString() },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <div className="text-xl font-black text-slate-300">{s.value}</div>
                <div className="text-[10px] text-slate-600 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Bar chart — MODEL PERFORMANCE */}
            <div className="col-span-2">
              <SciPanel title="MODEL PERFORMANCE" height={260}>
                <SciBar
                  data={perfBarData}
                  useSeriesColors={true}
                  height={220}
                  yLabel="R² TEST"
                  domain={[0, 1]}
                  referenceLine={0.6}
                  referenceLabel="0.6"
                  tooltipFormatter={(name, value) =>
                    `${name}: ${typeof value === 'number' ? value.toFixed(4) : value}`
                  }
                />
              </SciPanel>
            </div>

            {/* Feature importances */}
            <div className="rounded-xl border border-white/[0.06] flex flex-col justify-between overflow-hidden">
              <button
                onClick={() => setShowImportances(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.04] text-xs font-bold text-slate-400 hover:bg-white/[0.06] transition-colors shrink-0"
              >
                <span>Feature Importances ({result.top_model})</span>
                {showImportances ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <div className="p-4 space-y-2.5 overflow-y-auto flex-1 max-h-48">
                {importances.slice(0, 10).map((f, i) => (
                  <div key={f.feature} className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-500 w-4 shrink-0">#{i + 1}</span>
                    <span className="text-xs font-mono text-slate-300 w-32 truncate shrink-0">{f.feature}</span>
                    <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 rounded-full"
                        style={{ width: `${(f.importance / importances[0].importance) * 100}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-cyan-300 font-mono w-10 text-right">
                      {f.importance.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Model results table */}
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.04] border-b border-white/[0.06]">
                  {['Rank', 'Model', 'R² Test', 'RMSE Test', 'CV R² (mean ± std)'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {models.map((m, i) => (
                  <tr key={m.model} className={`hover:bg-white/[0.02] ${i === 0 ? 'bg-cyan-500/5' : ''}`}>
                    <td className="px-3 py-2.5">
                      {i === 0 && m.status === 'ok' ? (
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <span className="text-slate-600">#{i + 1}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-white">{m.model}</td>
                    {m.status === 'ok' ? (
                      <>
                        <td className={`px-3 py-2.5 font-bold font-mono ${r2Color(m.r2_test)}`}>
                          {m.r2_test?.toFixed(4)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 font-mono">{m.rmse_test?.toFixed(4)}</td>
                        <td className="px-3 py-2.5 text-slate-400 font-mono">
                          {m.cv_r2_mean?.toFixed(3)} ± {m.cv_r2_std?.toFixed(3)}
                        </td>
                      </>
                    ) : (
                      <td colSpan={3} className="px-3 py-2.5 text-rose-400 text-[10px]">
                        {m.error}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Validation Hub */}
          {valLoading && (
            <div className="flex items-center justify-center gap-2 text-cyan-400 py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Computing validation diagnostics...</span>
            </div>
          )}

          {valMetrics && (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Model Validation Diagnostics (OECD compliant)
              </div>

              {/* Tab Selector */}
              <div className="flex border-b border-white/[0.06]">
                {(['scatter', 'residual', 'yrand'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setValTab(tab)}
                    className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all -mb-px ${
                      valTab === tab
                        ? 'border-cyan-400/60 text-cyan-300'
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {tab === 'scatter' && 'Predicted vs. Actual'}
                    {tab === 'residual' && 'Residual Plot'}
                    {tab === 'yrand' && 'Y-Randomization'}
                  </button>
                ))}
              </div>

              {/* Tab Panels */}
              {valTab === 'scatter' && (
                <div className="grid grid-cols-3 gap-4 items-start">
                  <div className="col-span-2">
                    <SciPanel title="PREDICTED vs ACTUAL" height={280}>
                      <SciScatter
                        series={scatterSeries}
                        height={240}
                        xLabel="ACTUAL"
                        yLabel="PREDICTED"
                        identityLine={true}
                      />
                    </SciPanel>
                  </div>

                  {/* Summary stats */}
                  <div className="space-y-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      OECD validation score card
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs p-2 rounded-lg bg-white/[0.02]">
                        <span className="text-slate-400">R² (Train)</span>
                        <span className={`font-bold font-mono ${r2Color(valMetrics.r2_train)}`}>
                          {valMetrics.r2_train.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs p-2 rounded-lg bg-white/[0.02]">
                        <span className="text-slate-400">Q² (CV Coefficient)</span>
                        <span className={`font-bold font-mono ${r2Color(valMetrics.q2_loo)}`}>
                          {valMetrics.q2_loo.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs p-2 rounded-lg bg-white/[0.02]">
                        <span className="text-slate-400">Δ(R² - Q²)</span>
                        <span
                          className={`font-bold font-mono ${
                            valMetrics.delta_r2_q2 < 0.3 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {valMetrics.delta_r2_q2.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs p-2 rounded-lg bg-white/[0.02]">
                        <span className="text-slate-400">cRMSE / SDEP</span>
                        <span className="font-bold font-mono text-white">
                          {valMetrics.crmse.toFixed(4)} / {valMetrics.sdep.toFixed(4)}
                        </span>
                      </div>
                    </div>
                    <div className={`p-2.5 rounded-lg border text-[10px] leading-normal ${
                      valMetrics.q2_loo >= 0.6
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/[0.08] border-rose-500/20 text-rose-300'
                    }`}>
                      {valMetrics.q2_loo >= 0.6
                        ? '✅ Model meets OECD Principle 4 standard. High validation coefficient.'
                        : '❌ Model has poor generalizability (Q² < 0.60). Avoid regulatory usage.'}
                    </div>
                  </div>
                </div>
              )}

              {valTab === 'residual' && (
                <div>
                  <SciPanel title="RESIDUALS" height={240}>
                    <SciScatter
                      series={residualSeries}
                      height={200}
                      xLabel="PREDICTED"
                      yLabel="RESIDUAL"
                      hLines={[
                        { y: 0, dashed: false, color: 'rgba(255,255,255,0.18)' },
                        { y: 2 * valMetrics.sdep, dashed: true, color: '#f59e0b', label: '+2σ' },
                        { y: -2 * valMetrics.sdep, dashed: true, color: '#f59e0b', label: '-2σ' },
                      ]}
                    />
                  </SciPanel>
                  <div className="text-[9px] text-slate-500 text-center font-mono mt-1">
                    Residual Plot: Golden lines show ±2σ prediction error bounds (SDEP = {valMetrics.sdep.toFixed(3)})
                  </div>
                </div>
              )}

              {valTab === 'yrand' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleRunYRand}
                      disabled={yRandLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-bold hover:bg-cyan-500/20 transition-all disabled:opacity-40"
                    >
                      {yRandLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                          Permuting...
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          Run Y-Randomization (100 runs)
                        </>
                      )}
                    </button>
                    {yRand && (
                      <span className={`text-xs font-bold ${yRand.is_significant ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {yRand.is_significant ? '✅ Statistically Significant' : '❌ Not Statistically Significant'} (p = {yRand.p_value.toFixed(3)})
                      </span>
                    )}
                  </div>

                  {yRand && (
                    <div className="grid grid-cols-3 gap-4 items-center">
                      <div className="col-span-2">
                        <SciPanel title="Y-RAND DISTRIBUTION" height={200}>
                          <SciBar
                            data={yRandBarData}
                            color={SCI_COLORS[0] as string}
                            height={160}
                            xLabel="R²"
                            yLabel="COUNT"
                            referenceLine={yRand.real_r2}
                            referenceLabel={`Actual (${yRand.real_r2.toFixed(3)})`}
                          />
                        </SciPanel>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs leading-relaxed space-y-2">
                        <div className="font-bold text-slate-300">Y-Scramble Interpretation</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {yRand.interpretation}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
