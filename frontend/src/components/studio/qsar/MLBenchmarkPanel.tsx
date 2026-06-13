import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, Cpu, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface Props { clientId: string; apiBase: string; sessionInfo: any; onSessionLoaded: (i: any) => void; }

interface ModelResult {
  model: string; r2_test?: number; rmse_test?: number;
  cv_r2_mean?: number; cv_r2_std?: number; status: string; error?: string;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

function r2Color(v?: number | null): string {
  if (v === null || v === undefined) return 'text-slate-500';
  if (v >= 0.8) return 'text-emerald-400';
  if (v >= 0.6) return 'text-blue-400';
  if (v >= 0.4) return 'text-amber-400';
  return 'text-rose-400';
}

export const MLBenchmarkPanel: React.FC<Props> = ({ clientId, apiBase, sessionInfo }) => {
  const [endpointCol, setEndpointCol] = useState('');
  const [testSize, setTestSize] = useState(0.2);
  const [subgroup, setSubgroup] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('IDLE');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showImportances, setShowImportances] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

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
      } catch (e) { stopPolling(); }
    }, 1000);
  };

  const launch = async () => {
    if (!endpointCol) { toast.error('Enter an endpoint column name'); return; }
    setStatus('PENDING'); setResult(null); setError(null);
    const form = new FormData();
    form.append('endpoint_col', endpointCol);
    form.append('test_size', testSize.toString());
    if (subgroup) form.append('subgroup', subgroup);
    try {
      const r = await fetch(`${apiBase}/api/qsar-studio/${clientId}/benchmark`, { method: 'POST', body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setJobId(d.job_id);
      setStatus('RUNNING');
      poll(d.job_id);
    } catch (e: any) { setError(e.message); setStatus('IDLE'); }
  };

  useEffect(() => () => stopPolling(), []);

  const models: ModelResult[] = result?.models ?? [];
  const importances: { feature: string; importance: number }[] = result?.feature_importances ?? [];
  const subgroups: string[] = Array.isArray(sessionInfo?.subgroups) ? sessionInfo.subgroups : [];

  const chartData = models.filter(m => m.status === 'ok').map(m => ({
    name: m.model.replace(' ', '\n'), r2: m.r2_test ?? 0, cv: m.cv_r2_mean ?? 0,
  }));

  return (
    <div className="space-y-5">
      {/* Config */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Endpoint Column *</label>
          <input value={endpointCol} onChange={e => setEndpointCol(e.target.value)}
            placeholder="e.g. lc50_mg_l, pec50"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-blue-500/40" />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Test Set Size</label>
          <div className="flex items-center gap-2">
            <input type="range" min={0.1} max={0.4} step={0.05} value={testSize}
              onChange={e => setTestSize(parseFloat(e.target.value))}
              className="flex-1 accent-blue-500" />
            <span className="text-xs text-blue-300 font-bold w-8">{Math.round(testSize * 100)}%</span>
          </div>
        </div>
        {subgroups.length > 1 && (
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Subgroup</label>
            <select value={subgroup} onChange={e => setSubgroup(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-blue-500/40">
              <option value="">All (merged)</option>
              {subgroups.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>

      <button onClick={launch} disabled={status === 'RUNNING' || status === 'PENDING'}
        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm font-bold hover:bg-blue-500/20 transition-all disabled:opacity-40">
        {status === 'RUNNING' || status === 'PENDING'
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Running benchmark…</>
          : <><Cpu className="w-4 h-4" /> Launch ML Benchmark</>}
      </button>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Running indicator */}
      {(status === 'RUNNING' || status === 'PENDING') && (
        <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 text-xs text-blue-300/70 text-center">
          Training 5 models with {Math.round((1 - testSize) * 100)}% train / {Math.round(testSize * 100)}% test split + cross-validation…
        </div>
      )}

      {result && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Train Samples', value: result.n_train?.toLocaleString() },
              { label: 'Test Samples',  value: result.n_test?.toLocaleString() },
              { label: 'Features Used', value: result.n_features?.toLocaleString() },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <div className="text-xl font-black text-slate-300">{s.value}</div>
                <div className="text-[10px] text-slate-600">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          {chartData.length > 0 && (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">R² Comparison</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 20, left: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#475569' }} interval={0} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 9, fill: '#475569' }} />
                  <Tooltip formatter={(v: any) => typeof v === 'number' ? v.toFixed(3) : v} contentStyle={{ background: '#0d1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }} />
                  <ReferenceLine y={0.6} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '0.6', fill: '#f59e0b', fontSize: 9 }} />
                  <Bar dataKey="r2" name="R² Test" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Model results table */}
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.04] border-b border-white/[0.06]">
                  {['Rank', 'Model', 'R² Test', 'RMSE Test', 'CV R² (mean ± std)'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {models.map((m, i) => (
                  <tr key={m.model} className={`hover:bg-white/[0.02] ${i === 0 ? 'bg-blue-500/5' : ''}`}>
                    <td className="px-3 py-2.5">
                      {i === 0 && m.status === 'ok' ? <Trophy className="w-3.5 h-3.5 text-amber-400" /> : <span className="text-slate-600">#{i + 1}</span>}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-white">{m.model}</td>
                    {m.status === 'ok' ? (
                      <>
                        <td className={`px-3 py-2.5 font-bold font-mono ${r2Color(m.r2_test)}`}>{m.r2_test?.toFixed(4)}</td>
                        <td className="px-3 py-2.5 text-slate-400 font-mono">{m.rmse_test?.toFixed(4)}</td>
                        <td className="px-3 py-2.5 text-slate-400 font-mono">
                          {m.cv_r2_mean?.toFixed(3)} ± {m.cv_r2_std?.toFixed(3)}
                        </td>
                      </>
                    ) : (
                      <td colSpan={3} className="px-3 py-2.5 text-rose-400 text-[10px]">{m.error}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Feature importances */}
          {importances.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <button onClick={() => setShowImportances(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.04] text-xs font-bold text-slate-400 hover:bg-white/[0.06] transition-colors">
                <span>Top Feature Importances ({result.top_model})</span>
                {showImportances ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showImportances && (
                <div className="p-4 space-y-2">
                  {importances.slice(0, 15).map((f, i) => (
                    <div key={f.feature} className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 w-4 flex-shrink-0">#{i + 1}</span>
                      <span className="text-xs font-mono text-slate-300 w-48 truncate flex-shrink-0">{f.feature}</span>
                      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full"
                          style={{ width: `${(f.importance / importances[0].importance) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-blue-300 font-mono w-12 text-right">{f.importance.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
