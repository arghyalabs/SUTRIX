import React, { useEffect, useState } from "react";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { SciPanel } from "../../../components/charts/SciPanel";
import { SciBar } from "../../../components/charts/SciBar";
import type { SciBarDatum } from "../../../components/charts/SciBar";

interface Props { clientId: string; apiBase: string; session: any; }

export const ScaffoldPanel: React.FC<Props> = ({ clientId, apiBase }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topN, setTopN] = useState(15);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/intelligence/${clientId}/scaffold-analysis?top_n=${topN}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [clientId]);

  const scaffolds = data?.scaffolds ?? [];
  const chartData: SciBarDatum[] = scaffolds.map((s: any) => ({
    label: s.scaffold.length > 18 ? s.scaffold.slice(0, 16) + "…" : s.scaffold,
    value: s.count,
    annotation: `${s.pct}%`,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          Top <input type="number" min={5} max={50} value={topN} onChange={e => setTopN(Number(e.target.value) || 15)}
            className="w-12 px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs text-center focus:outline-none" /> scaffolds
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/20 transition-all disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Analyse
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-32 gap-2 text-cyan-400">
          <Loader2 className="w-5 h-5 animate-spin" /> <span className="text-sm">Analysing scaffolds…</span>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: "Total Compounds", v: data.total_compounds?.toLocaleString() },
              { l: "Unique Scaffolds", v: data.unique_scaffolds?.toLocaleString() ?? "—" },
              { l: "Scaffold Diversity", v: data.scaffold_diversity ? `${data.scaffold_diversity}%` : "—", hi: (data.scaffold_diversity ?? 0) > 70 },
            ].map(s => (
              <div key={s.l} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <div className={`text-xl font-black ${(s as any).hi ? "text-cyan-400" : "text-slate-300"}`}>{s.v ?? "—"}</div>
                <div className="text-[10px] text-slate-600">{s.l}</div>
              </div>
            ))}
          </div>

          {data.mode === "mw_bins" && (
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-xs text-amber-300/80">
              ⚠ RDKit not installed — showing MW-based grouping. Install RDKit for Murcko scaffold analysis.
            </div>
          )}

          {chartData.length > 0 && (
            <SciPanel
              title={`Top ${chartData.length} ${data.mode === "rdkit_murcko" ? "Murcko Scaffolds" : "MW Groups"}`}
              height={260}
            >
              <SciBar
                data={chartData}
                color="#22D3EE"
                barAccentStroke={true}
                horizontal={true}
                height={Math.max(160, chartData.length * 22)}
                tooltipFormatter={(_name, value) => `${value} compounds`}
              />
            </SciPanel>
          )}

          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-xs">
              <thead><tr className="bg-white/[0.04] border-b border-white/[0.06]">
                {["Rank", "Scaffold / Group", "Count", "%"].map(h => <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {scaffolds.map((s: any, i: number) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-slate-500">#{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-cyan-300 max-w-xs truncate" title={s.scaffold}>{s.scaffold}</td>
                    <td className="px-3 py-2 font-bold text-white">{s.count}</td>
                    <td className="px-3 py-2 text-slate-400">{s.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
