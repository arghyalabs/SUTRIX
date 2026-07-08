import React, { useState, useEffect } from "react";
import { Loader2, AlertCircle, Activity, Info, ChevronRight } from "lucide-react";
import { useColumnIntelligence } from "../../../hooks/useColumnIntelligence";
import { MoleculeCard } from "./MoleculeCard";
import { SciPanel } from "../../../components/charts/SciPanel";
import { SciScatter } from "../../../components/charts/SciScatter";
import type { ScatterPoint, ScatterSeries } from "../../../components/charts/SciScatter";

interface Props {
  clientId: string;
  apiBase: string;
  session: any;
}

interface CliffPair {
  compound_i: number;
  compound_j: number;
  smiles_i: string;
  smiles_j: string;
  similarity: number;
  activity_i: number;
  activity_j: number;
  activity_diff: number;
  cliff_score: number;
}

export const ActivityCliffPanel: React.FC<Props> = ({ clientId, apiBase, session }) => {
  const { columns } = useColumnIntelligence(clientId, apiBase);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(2.0);
  const [actCol, setActCol] = useState("");
  const [selectedPair, setSelectedPair] = useState<CliffPair | null>(null);

  // Auto-detect activity column
  useEffect(() => {
    if (columns.length > 0) {
      const act = columns.find(c => c.role === "ENDPOINT");
      if (act) setActCol(act.name);
    }
  }, [columns]);

  const load = async () => {
    setLoading(true);
    setError(null);
    setSelectedPair(null);
    try {
      const p = new URLSearchParams({ threshold: threshold.toString() });
      if (actCol) p.set("activity_col", actCol);
      const r = await fetch(`${apiBase}/api/intelligence/${clientId}/activity-cliffs?${p}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Cliff scan failed");
      setData(d);
      if (d.cliffs && d.cliffs.length > 0) {
        setSelectedPair(d.cliffs[0]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) {
      load();
    }
  }, [clientId, threshold]);

  const cliffs: CliffPair[] = data?.cliffs ?? [];
  const maxCliffIndex = cliffs.length > 0 ? Math.max(...cliffs.map(c => c.cliff_score)) : 1;

  // Map each cliff pair to a ScatterPoint with opacity varying 0.3–1.0 by cliff index
  const scatterPoints: ScatterPoint[] = cliffs.map((c, i) => ({
    x: c.similarity,
    y: c.activity_diff,
    opacity: 0.3 + 0.7 * (c.cliff_score / maxCliffIndex),
    label: `#${c.compound_i} ↔ #${c.compound_j} | Cliff: ${c.cliff_score.toFixed(2)}`,
    color: "#FB923C",
  }));

  const scatterSeries: ScatterSeries[] = [
    { name: "Cliff Pairs", data: scatterPoints, color: "#FB923C" },
  ];

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
            Activity Column
          </label>
          <select
            value={actCol}
            onChange={e => setActCol(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs focus:outline-none focus:border-rose-500/40"
          >
            <option value="">-- Auto Detect --</option>
            {columns.filter(c => c.role === "ENDPOINT" || c.role === "UNKNOWN").map(c => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
            Activity Threshold (Δ)
          </label>
          <div className="flex items-center gap-2 pt-1.5">
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.5}
              value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value))}
              className="w-28 accent-rose-500"
            />
            <span className="text-xs text-rose-300 font-bold w-8">{threshold}</span>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-bold hover:bg-rose-500/20 transition-all disabled:opacity-40"
        >
          {loading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Scanning...</>
          ) : (
            <><Activity className="w-3.5 h-3.5" />Scan Cliffs</>
          )}
        </button>
      </div>

      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/10 text-xs text-rose-300 leading-normal">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
        <div>
          <strong>Activity Cliff Rule</strong>: Defined as a compound pair where Tanimoto similarity &ge; 0.70 and potency change |&Delta; Activity| &ge; {threshold}. The Cliff Index is computed as |&Delta; Act| / (1 - Tanimoto).
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-10 gap-2 text-cyan-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-semibold">Auditing pairwise molecular fingerprints...</span>
        </div>
      )}

      {data && (
        <div className="space-y-6 animate-all duration-300">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: "Compounds Checked", v: data.n_compounds },
              { l: "Cliff Pairs Found", v: data.n_cliffs, hi: data.n_cliffs > 0 },
              {
                l: "Similarity Engine",
                v: data.mode === "tanimoto_morgan" ? "Tanimoto Morgan (RDKit)" : "Descriptor Distance",
              },
            ].map(s => (
              <div key={s.l} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                <div className={`text-xl font-black ${s.hi ? "text-rose-400" : "text-slate-300"}`}>
                  {s.v}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{s.l}</div>
              </div>
            ))}
          </div>

          {/* Active Cliff Pair side-by-side structure card */}
          {selectedPair && (
            <div className="p-4 rounded-xl bg-[#091120] border border-rose-500/20 space-y-4">
              <div className="flex justify-between items-center border-b border-white/[0.06] pb-2.5">
                <span className="text-xs font-bold text-slate-300">
                  Potency Cliff Pair Detail (Index: {selectedPair.cliff_score.toFixed(2)})
                </span>
                <div className="flex gap-4 text-xs font-mono">
                  <span className="text-slate-500">
                    Similarity:{" "}
                    <strong className="text-rose-300">{selectedPair.similarity.toFixed(3)}</strong>
                  </span>
                  <span className="text-slate-500">
                    Δ Activity:{" "}
                    <strong className="text-rose-400">{selectedPair.activity_diff.toFixed(3)}</strong>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    Compound A (#{selectedPair.compound_i})
                  </div>
                  <MoleculeCard
                    smiles={selectedPair.smiles_i}
                    activityValue={selectedPair.activity_i}
                    label={data.activity_col}
                    apiBase={apiBase}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    Compound B (#{selectedPair.compound_j})
                  </div>
                  <MoleculeCard
                    smiles={selectedPair.smiles_j}
                    activityValue={selectedPair.activity_j}
                    label={data.activity_col}
                    apiBase={apiBase}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Scatter Chart & Cliff list split */}
          <div className="grid grid-cols-3 gap-4">
            {/* List */}
            <div className="col-span-2 rounded-xl border border-white/[0.06] overflow-hidden self-start">
              <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Top Cliff Pairs (Ordered by Cliff Index)
              </div>
              {cliffs.length > 0 ? (
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/[0.02] border-b border-white/[0.04] text-slate-500 font-semibold">
                        <th className="px-3 py-2 text-left">Pair</th>
                        <th className="px-3 py-2 text-left">Similarity</th>
                        <th className="px-3 py-2 text-left">Act A</th>
                        <th className="px-3 py-2 text-left">Act B</th>
                        <th className="px-3 py-2 text-left">Δ Act</th>
                        <th className="px-3 py-2 text-left">Cliff Index</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {cliffs.slice(0, 30).map((c, i) => (
                        <tr
                          key={i}
                          onClick={() => setSelectedPair(c)}
                          className={`cursor-pointer transition-colors ${
                            selectedPair?.compound_i === c.compound_i &&
                            selectedPair?.compound_j === c.compound_j
                              ? "bg-rose-500/10 hover:bg-rose-500/15"
                              : "hover:bg-white/[0.02]"
                          }`}
                        >
                          <td className="px-3 py-2.5 font-mono text-slate-400">
                            #{c.compound_i}↔#{c.compound_j}
                          </td>
                          <td className="px-3 py-2.5 font-bold text-rose-300 font-mono">
                            {c.similarity.toFixed(3)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-400">{c.activity_i.toFixed(3)}</td>
                          <td className="px-3 py-2.5 font-mono text-slate-400">{c.activity_j.toFixed(3)}</td>
                          <td className="px-3 py-2.5 font-bold text-rose-400 font-mono">
                            {c.activity_diff.toFixed(3)}
                          </td>
                          <td className="px-3 py-2.5 font-black text-amber-400 font-mono">
                            {c.cliff_score.toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <ChevronRight className="w-3.5 h-3.5 inline text-slate-500" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-500">
                  No cliff pairs found. Try lowering the activity threshold slider.
                </div>
              )}
            </div>

            {/* Scatter chart */}
            {scatterPoints.length > 0 && (
              <SciPanel title="Activity Cliffs" height={300}>
                <SciScatter
                  series={scatterSeries}
                  height={240}
                  xLabel="Tanimoto Similarity"
                  yLabel="Delta Activity"
                  xDomain={[0.7, 1.0]}
                  vLines={[{ x: 0.7, label: "sim=0.70", dashed: true }]}
                  hLines={[{ y: threshold, label: `Δ=${threshold}`, dashed: true }]}
                  tooltipFormatter={(point, _seriesName) => (
                    <div>
                      <div style={{ color: "#64748B", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                        {point.label}
                      </div>
                      <div style={{ display: "flex", gap: 10, color: "#F1F5F9", fontSize: 11, fontFamily: "monospace" }}>
                        <span><span style={{ color: "#94A3B8" }}>Sim </span><span style={{ color: "#FB923C", fontWeight: 600 }}>{point.x?.toFixed(3)}</span></span>
                        <span><span style={{ color: "#94A3B8" }}>Δ Act </span><span style={{ color: "#FB923C", fontWeight: 600 }}>{point.y?.toFixed(3)}</span></span>
                      </div>
                    </div>
                  )}
                />
              </SciPanel>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
