import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface Props { clientId: string; apiBase: string; principleNum: number; }

const TL: Record<string, { icon: React.ReactNode; badge: string; bar: string }> = {
  GREEN: {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
    badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    bar: 'bg-emerald-500',
  },
  AMBER: {
    icon: <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />,
    badge: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
    bar: 'bg-amber-500',
  },
  RED: {
    icon: <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />,
    badge: 'bg-rose-500/10 border-rose-500/20 text-rose-300',
    bar: 'bg-rose-500',
  },
};

const PRINCIPLE_GUIDANCE: Record<number, { why: string; how: string }> = {
  1: {
    why: 'A clearly defined endpoint ensures that the model has a specific prediction target, enables interpretation, and allows regulatory reviewers to assess relevance.',
    how: 'Ensure your dataset has a single, well-named numeric endpoint column (e.g., LC50_mg_L, pEC50) with <5% missing values and ≥2 orders of magnitude dynamic range.',
  },
  2: {
    why: 'Unambiguous algorithms are fully reproducible — any competent scientist can re-implement them. Black-box or proprietary algorithms without documentation violate OECD P2.',
    how: 'Document your descriptors, their sources, and the algorithm (e.g., Random Forest with 100 trees, max_depth=None). Remove zero-variance and highly correlated (|r|>0.95) descriptors.',
  },
  3: {
    why: 'Every QSAR model is valid only within a defined chemical space. Predictions outside the AD are unreliable and must be flagged.',
    how: 'Include SMILES strings for all compounds. Use Williams plot (leverage vs residuals) or Euclidean distance-based AD. Document h* = 3(k+1)/n as warning leverage threshold.',
  },
  4: {
    why: 'Appropriate validation measures detect overfitting and confirm generalizability. Internal metrics alone (R², RMSE on training set) are insufficient — external validation is mandatory.',
    how: 'Report both internal (5-fold CV, LOO) and external (20% test set) validation. Perform y-scrambling. Target Q²ext ≥ 0.6 and Q²cv ≥ 0.5 for regulatory QSAR.',
  },
  5: {
    why: 'Mechanistic interpretation links molecular properties to biological response, enabling regulators to assess scientific plausibility and identify potential mechanisms of toxicity.',
    how: 'Use physicochemically meaningful descriptors (logP, MW, TPSA, charge). Prioritize descriptors with known mechanistic links to your endpoint. Report top descriptors with their biological relevance.',
  },
};

export const OECDPrincipleView: React.FC<Props> = ({ clientId, apiBase, principleNum }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/oecd/${clientId}/principle/${principleNum}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [clientId, principleNum]);

  const guidance = PRINCIPLE_GUIDANCE[principleNum];
  const checks = data?.checks ?? [];
  const green = checks.filter((c: any) => c.status === 'GREEN').length;
  const amber = checks.filter((c: any) => c.status === 'AMBER').length;
  const red   = checks.filter((c: any) => c.status === 'RED').length;

  const statusColor = data?.status === 'GREEN' ? 'text-emerald-400'
    : data?.status === 'AMBER' ? 'text-amber-400' : 'text-rose-400';
  const statusBorder = data?.status === 'GREEN' ? 'border-emerald-500/20'
    : data?.status === 'AMBER' ? 'border-amber-500/20' : 'border-rose-500/20';

  return (
    <div className="space-y-4">
      {/* Refresh */}
      <button onClick={load} disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-300 text-xs font-semibold hover:bg-slate-500/20 transition-all disabled:opacity-40">
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
      </button>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-32 gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Evaluating OECD Principle {principleNum}…</span>
        </div>
      )}

      {data && (
        <>
          {/* Header */}
          <div className={`p-5 rounded-2xl bg-white/[0.02] border ${statusBorder}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  OECD Principle {data.principle}
                </div>
                <div className="text-xl font-black text-white mb-1">{data.title}</div>
                <div className="text-xs text-slate-400 leading-relaxed max-w-xl">{data.description}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-5xl font-black ${statusColor}`}>{data.score}</div>
                <div className="text-xs text-slate-600">/100</div>
                <div className={`mt-1 px-2 py-0.5 rounded-md border text-[10px] font-bold inline-block
                  ${TL[data.status]?.badge}`}>{data.status}</div>
                <div className="flex gap-2 mt-2 justify-end text-[10px]">
                  <span className="text-emerald-400">{green}✓</span>
                  <span className="text-amber-400">{amber}⚠</span>
                  <span className="text-rose-400">{red}✗</span>
                </div>
              </div>
            </div>

            {/* Score bar */}
            <div className="mt-4 h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700
                ${data.score >= 70 ? 'bg-emerald-500' : data.score >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${data.score}%` }} />
            </div>
          </div>

          {/* Criteria checks */}
          <div className="space-y-2">
            {checks.map((c: any, i: number) => {
              const tl = TL[c.status] ?? TL['RED'];
              return (
                <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border ${tl.badge.split(' ').slice(0, 2).join(' ')}`}>
                  {tl.icon}
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-white">{c.criterion}</div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${tl.badge}`}>{c.status}</span>
                        <span className="text-[10px] text-slate-600">{c.score} pts</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">{c.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Why & How guidance */}
          {guidance && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70 mb-2">Why This Matters</div>
                <p className="text-xs text-slate-400 leading-relaxed">{guidance.why}</p>
              </div>
              <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10">
                <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70 mb-2">How to Improve</div>
                <p className="text-xs text-slate-400 leading-relaxed">{guidance.how}</p>
              </div>
            </div>
          )}

          {/* Extra context for specific principles */}
          {principleNum === 3 && data.smiles_col && (
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-xs text-emerald-300/80">
              ✓ SMILES column <code className="font-mono bg-white/[0.04] px-1 rounded">{data.smiles_col}</code> detected — Williams plot AD analysis available in the QSAR Studio.
            </div>
          )}
          {principleNum === 3 && !data.smiles_col && (
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-xs text-amber-300/80">
              ⚠ No SMILES column found. Add a column named <code className="font-mono bg-white/[0.04] px-1 rounded">SMILES</code> or <code className="font-mono bg-white/[0.04] px-1 rounded">smiles</code> to enable full chemical space AD analysis.
            </div>
          )}
          {principleNum === 2 && (
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-xs text-blue-300/80">
              💡 Detected <strong className="text-blue-200">{data.descriptor_count}</strong> descriptor columns.
              For P2 compliance, document each descriptor's source (e.g., RDKit, Mordred) and version in your model report.
            </div>
          )}
        </>
      )}
    </div>
  );
};
