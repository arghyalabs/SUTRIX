import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical, Globe, Shield, Activity, Dna, ArrowRight } from 'lucide-react';

interface UseCaseDef {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  desc: string;
  workflow: string[];
}

const CASES: UseCaseDef[] = [
  {
    id: 'eco',
    icon: <Globe className="w-5 h-5 text-cyan-400" />,
    title: 'Ecotoxicology',
    subtitle: 'Fish LC50 / EC50',
    desc: 'Map variable concentration datasets for aquatic species. Organizes taxons dynamically and strips inconsistent chemical units.',
    workflow: ['Ingest EcoTox CSV', 'Map Species & Duration', 'Calculate MolWt', 'OECD 96h LC50 Subgroup'],
  },
  {
    id: 'drug',
    icon: <Dna className="w-5 h-5 text-violet-400" />,
    title: 'Drug Discovery',
    subtitle: 'ADMET Curation',
    desc: 'Prepare high-throughput biological screening data. Calculates LogP, solubility parameters, and formats molecular structures.',
    workflow: ['Ingest SMILES list', 'Clean duplicate salts', 'Morgan Circular vectors', 'QSAR ML model ready'],
  },
  {
    id: 'nano',
    icon: <Activity className="w-5 h-5 text-emerald-400" />,
    title: 'Nanotoxicology',
    subtitle: 'Material Safety',
    desc: 'Verify structural safety matrices for nanomaterials and metal oxides. Standardizes exposure dosages across trials.',
    workflow: ['Ingest trial data', 'Unit Harmonization', 'Outlier variance drops', 'AI readiness matrices'],
  },
  {
    id: 'env',
    icon: <Shield className="w-5 h-5 text-rose-400" />,
    title: 'Environmental Risk',
    subtitle: 'EPA datasets ingestion',
    desc: 'Consolidate multiple EPA EcoTox chemical registries. Build multi-species hierarchical groups to evaluate read-across thresholds.',
    workflow: ['Import registry database', 'Ontology classification', 'Segregation profiling', 'Lineage DAG export'],
  },
  {
    id: 'reg',
    icon: <FlaskConical className="w-5 h-5 text-amber-400" />,
    title: 'Regulatory Submissions',
    subtitle: 'OECD Workflows',
    desc: 'Format QSAR calculations satisfying REACH requirements. Generates compliant reports documenting applicability domains.',
    workflow: ['Model outcome tables', 'Applicability domain check', 'OECD checklist validation', 'REACH PDF report export'],
  },
];

export const UseCases: React.FC = () => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <section className="py-24 px-6 bg-[#020610] border-b border-white/[0.04]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 text-xs font-semibold text-cyan-400 mb-5">
            Real-World Impact
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Scientific Use Cases
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            SUTRIX serves toxicologists, pharmacologists, and regulatory experts across diverse study pathways.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {CASES.map(uc => {
            const isHovered = hoveredId === uc.id;

            return (
              <motion.div
                key={uc.id}
                onMouseEnter={() => setHoveredId(uc.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="relative p-5 rounded-2xl border border-white/[0.05] bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02] flex flex-col justify-between h-[360px] overflow-hidden group transition-all"
              >
                {/* Background overlay on hover showing mini workflow */}
                <motion.div
                  animate={{ opacity: isHovered ? 1 : 0 }}
                  className="absolute inset-0 bg-[#050e20] p-5 flex flex-col justify-between z-10 border border-cyan-500/20 rounded-2xl pointer-events-none"
                >
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-cyan-400 mb-4">Workflow Pipeline</div>
                    <div className="space-y-3">
                      {uc.workflow.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-[10px] text-cyan-400 font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <span className="text-[10px] text-white/80 font-mono truncate">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-[10px] text-cyan-400/50 flex items-center gap-1 font-bold">
                    Learn more
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </motion.div>

                <div>
                  <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-5">
                    {uc.icon}
                  </div>
                  <h3 className="text-base font-bold text-white mb-0.5">{uc.title}</h3>
                  <span className="text-[10px] text-white/30 block mb-3 font-semibold">{uc.subtitle}</span>
                  <p className="text-xs text-white/50 leading-relaxed">{uc.desc}</p>
                </div>

                <div className="text-[10px] text-white/30 font-bold group-hover:text-cyan-300 flex items-center gap-1 mt-4">
                  Hover to view workflow
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
