import React, { useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2, Target, Edit2, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PanelProps { clientId: string; apiBase: string; }

interface Variant {
  raw_value: string;
  suggested_canonical: string;
  frequency: number;
}

export const EndpointStandardizationPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [col, setCol] = useState('');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [userMapping, setUserMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<any>(null);

  const detect = async () => {
    if (!col) { toast.error('Enter a column name'); return; }
    setLoading(true); setError(null); setVariants([]); setApplyResult(null);
    try {
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/detect-endpoints?col=${encodeURIComponent(col)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      const init: Record<string, string> = {};
      (data.variants as Variant[]).forEach(v => { init[v.raw_value] = v.suggested_canonical; });
      setVariants(data.variants);
      setUserMapping(init);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    setApplying(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/standardize-endpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ col, mapping: userMapping }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      setApplyResult(data);
      toast.success('Endpoint mapping applied');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Column input */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Endpoint Column Name</label>
          <input
            value={col}
            onChange={e => setCol(e.target.value)}
            placeholder="e.g. endpoint, test_type"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-amber-500/40"
          />
        </div>
        <button
          onClick={detect}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold hover:bg-amber-500/20 transition-all disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Detect Variants
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Mapping table */}
      {variants.length > 0 && (
        <>
          <div className="text-xs text-slate-500 mb-2">
            Found <strong className="text-white">{variants.length}</strong> unique endpoint values. Edit canonical names below:
          </div>
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.04] border-b border-white/[0.06]">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Raw Value</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Frequency</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Canonical Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {variants.map(v => (
                  <tr key={v.raw_value} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 font-mono text-slate-300">{v.raw_value}</td>
                    <td className="px-4 py-2.5 text-slate-500">{v.frequency.toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      <input
                        value={userMapping[v.raw_value] ?? v.suggested_canonical}
                        onChange={e => setUserMapping(prev => ({ ...prev, [v.raw_value]: e.target.value }))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-amber-300 text-xs font-mono focus:outline-none focus:border-amber-500/40"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={apply}
            disabled={applying}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm font-bold hover:bg-amber-500/20 transition-all disabled:opacity-40"
          >
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
            Apply Endpoint Mapping
          </button>
        </>
      )}

      {/* Apply result */}
      {applyResult && (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold mb-2">
            <CheckCircle2 className="w-4 h-4" /> Mapping applied
          </div>
          <div className="text-[10px] text-slate-500 mb-1">Canonical values in dataset:</div>
          <div className="flex flex-wrap gap-1.5">
            {applyResult.unique_canonical?.map((c: string) => (
              <span key={c} className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-semibold">{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
