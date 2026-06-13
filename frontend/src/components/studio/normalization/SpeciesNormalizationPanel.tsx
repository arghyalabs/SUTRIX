import React, { useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2, Users, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PanelProps { clientId: string; apiBase: string; }

interface SpeciesVariant {
  raw_value: string;
  suggested_canonical: string;
  known: boolean;
  frequency: number;
}

export const SpeciesNormalizationPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [col, setCol] = useState('');
  const [variants, setVariants] = useState<SpeciesVariant[]>([]);
  const [userMapping, setUserMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<any>(null);

  const detect = async () => {
    if (!col) { toast.error('Enter a column name'); return; }
    setLoading(true); setError(null); setVariants([]); setApplyResult(null);
    try {
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/detect-species?col=${encodeURIComponent(col)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      const init: Record<string, string> = {};
      (data.variants as SpeciesVariant[]).forEach(v => { init[v.raw_value] = v.suggested_canonical; });
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
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/standardize-species`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ col, mapping: userMapping }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      setApplyResult(data);
      toast.success('Species mapping applied');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  };

  const knownCount = variants.filter(v => v.known).length;
  const unknownCount = variants.length - knownCount;

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Info banner */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-slate-500">
        Maps common species names to OECD-compliant <strong className="text-white">binomial nomenclature</strong>.
        Known species (e.g. "zebrafish" → <em>Danio rerio</em>) are auto-resolved. Unknown names can be manually mapped.
      </div>

      {/* Column input */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Species Column Name</label>
          <input
            value={col}
            onChange={e => setCol(e.target.value)}
            placeholder="e.g. organism, species, test_species"
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-amber-500/40"
          />
        </div>
        <button
          onClick={detect}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold hover:bg-amber-500/20 transition-all disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Detect Species
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Stats */}
      {variants.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Species', value: variants.length, color: 'text-slate-300' },
            { label: 'Auto-Resolved', value: knownCount, color: 'text-emerald-400' },
            { label: 'Manual Review', value: unknownCount, color: 'text-amber-400' },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
              <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Mapping table */}
      {variants.length > 0 && (
        <>
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.04] border-b border-white/[0.06]">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Raw Value</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Freq.</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Canonical Name (Binomial)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {variants.map(v => (
                  <tr key={v.raw_value} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 font-mono text-slate-300">{v.raw_value}</td>
                    <td className="px-4 py-2.5 text-slate-500">{v.frequency.toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      {v.known ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-semibold">
                          <CheckCircle2 className="w-3 h-3" /> Known
                        </span>
                      ) : (
                        <span className="text-amber-400/80 text-[10px] font-semibold">⚠ Manual</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        value={userMapping[v.raw_value] ?? v.suggested_canonical}
                        onChange={e => setUserMapping(prev => ({ ...prev, [v.raw_value]: e.target.value }))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-amber-300 text-xs font-mono italic focus:outline-none focus:border-amber-500/40"
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
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            Apply Species Mapping
          </button>
        </>
      )}

      {applyResult && (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold mb-2">
            <CheckCircle2 className="w-4 h-4" /> Species mapping applied
          </div>
          <div className="flex flex-wrap gap-1.5">
            {applyResult.unique_canonical?.map((c: string) => (
              <span key={c} className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] italic">{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
