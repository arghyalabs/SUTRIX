import React from 'react';
import { Check, X } from 'lucide-react';

interface RowDef {
  feature: string;
  manual: string;
  sutrix: string;
  sutrixBetter: boolean;
}

const COMPARISON_ROWS: RowDef[] = [
  { feature: 'Hierarchy Creation', manual: 'Hours (custom spreadsheet scripting)', sutrix: 'Minutes (automated taxonomic clustering)', sutrixBetter: true },
  { feature: 'Descriptor Generation', manual: 'Multiple disconnected tools (RDKit scripts, online wrappers)', sutrix: 'Built-in (unified high-throughput engines)', sutrixBetter: true },
  { feature: 'Structure Recovery', manual: 'Manual lookup on PubChem registry databases', sutrix: 'Automated REST synonym query mapping', sutrixBetter: true },
  { feature: 'OECD Assessment', manual: 'Manual checklists, spreadsheet validation', sutrix: 'Automated compliance validations', sutrixBetter: true },
];

export const FeatureComparison: React.FC = () => {
  return (
    <section className="py-24 px-6 bg-[#020610] border-b border-white/[0.04]">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 text-xs font-semibold text-cyan-400 mb-5">
            Performance Matrix
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Feature Comparison
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            See how SUTRIX eliminates standard data engineering friction points relative to typical bioinformatics workflows.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="rounded-3xl glass-elevated border border-white/[0.06] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="py-4 px-6 text-sm font-bold text-white">Feature</th>
                <th className="py-4 px-6 text-sm font-bold text-white/40">Typical Manual Workflow</th>
                <th className="py-4 px-6 text-sm font-bold text-cyan-400">SUTRIX Platform</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row, idx) => (
                <tr 
                  key={row.feature} 
                  className={`border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors ${
                    idx === COMPARISON_ROWS.length - 1 ? 'border-none' : ''
                  }`}
                >
                  <td className="py-4 px-6 text-sm font-bold text-white">{row.feature}</td>
                  <td className="py-4 px-6 text-xs text-white/50 flex items-center gap-2 mt-1">
                    <X className="w-4 h-4 text-red-500 shrink-0" />
                    <span>{row.manual}</span>
                  </td>
                  <td className="py-4 px-6 text-xs text-cyan-300 font-semibold">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{row.sutrix}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
