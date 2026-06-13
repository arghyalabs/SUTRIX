import React, { useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2, TrendingDown } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PanelProps { clientId: string; apiBase: string; }

const TRANSFORMS = [
  { id: 'log10',     label: 'log₁₀(x)',          desc: 'Standard log base-10', formula: 'log₁₀(x)' },
  { id: 'ln',        label: 'ln(x)',              desc: 'Natural log',          formula: 'ln(x)' },
  { id: 'neg_log10', label: 'pX = −log₁₀(x)',    desc: 'pLC50, pEC50, pKi',   formula: '−log₁₀(x)' },
];

export const LogTransformPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [col, setCol] = useState('');
  const [transform, setTransform] = useState('neg_log10');
  const [newColName, setNewColName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!col) { toast.error('Enter a column name'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/log-transform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ col, transform, new_col_name: newColName || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      setResult(data);
      toast.success(`Transform applied → ${data.new_col_name}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const selected = TRANSFORMS.find(t => t.id === transform)!;

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Transform selector */}
      <div className="grid grid-cols-3 gap-3">
        {TRANSFORMS.map(t => (
          <button
            key={t.id}
            onClick={() => setTransform(t.id)}
            className={`flex flex-col gap-1 p-4 rounded-xl border text-left transition-all
              ${transform === t.id
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/[0.12]'
              }`}
          >
            <span className="text-sm font-bold font-mono">{t.label}</span>
            <span className="text-[10px] text-slate-500">{t.desc}</span>
            <span className={`text-[10px] font-mono mt-1 ${transform === t.id ? 'text-amber-400/60' : 'text-slate-700'}`}>
              y = {t.formula}
            </span>
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Source Column</label>
          <input
            value={col}
            onChange={e => setCol(e.target.value)}
            placeholder="e.g. lc50_mg_l"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-amber-500/40"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">New Column Name (optional)</label>
          <input
            value={newColName}
            onChange={e => setNewColName(e.target.value)}
            placeholder={`e.g. p${col || 'lc50'}`}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-amber-500/40"
          />
        </div>
      </div>

      {/* Info box */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-slate-500 space-y-1">
        <div className="font-semibold text-slate-400">Transform formula: <span className="text-amber-300 font-mono">y = {selected.formula}</span></div>
        <div>Non-positive values (≤0) will produce NaN and be excluded from results.</div>
        {transform === 'neg_log10' && (
          <div className="text-amber-400/70">
            📌 Use <strong>−log₁₀</strong> to convert EC50/LC50 (mg/L or µmol/L) → pEC50/pLC50 for QSAR modeling.
          </div>
        )}
      </div>

      <button
        onClick={run}
        disabled={loading || !col}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm font-bold hover:bg-amber-500/20 transition-all disabled:opacity-40"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingDown className="w-4 h-4" />}
        Apply Transformation
      </button>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4" /> Transformation Preview
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-slate-600 mb-1.5">BEFORE ({result.original_col})</div>
              <div className="font-mono text-xs text-slate-300 space-y-0.5">
                {result.preview_before.map((v: number, i: number) => (
                  <div key={i} className="text-slate-400">{v?.toFixed(4) ?? 'NaN'}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-600 mb-1.5">AFTER ({result.new_col_name})</div>
              <div className="font-mono text-xs space-y-0.5">
                {result.preview_after.map((v: number, i: number) => (
                  <div key={i} className="text-amber-300">{v?.toFixed(4) ?? 'NaN'}</div>
                ))}
              </div>
            </div>
          </div>
          {result.warnings?.map((w: string, i: number) => (
            <div key={i} className="text-[10px] text-amber-400/70">⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
};
