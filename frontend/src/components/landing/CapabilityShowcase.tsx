import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Brain, FlaskConical, CheckSquare, X, Info } from 'lucide-react';

interface ShowcaseItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  tags: string[];
  description: string;
  details: {
    subtitle: string;
    body: string;
    libraries: string[];
    features: string[];
  };
}

const ITEMS: ShowcaseItem[] = [
  {
    id: 'chem',
    title: 'Chemical Intelligence',
    icon: <FlaskConical className="w-6 h-6" />,
    color: 'cyan',
    tags: ['SMILES Recovery', 'PubChem Sync', 'ChEMBL Registry'],
    description: 'Resolve, clean, and standardize organic chemical structures on upload. Fuzzy mapping of compound nomenclature to canonical SMILES.',
    details: {
      subtitle: 'REST-Enabled Compound Resolving',
      body: 'Bioinformatics projects often contain irregular compound synonyms or invalid structures. SUTRIX runs parallel API query handlers targeting PubChem and ChEMBL registries, extracting canonical SMILES, Molecular Formula, IUPAC designations, and molecular weights dynamically.',
      libraries: ['PubChem API', 'ChEMBL Web Services', 'RDKit structure checkers'],
      features: ['SMILES canonicalization', 'Automated synonym resolving', 'Salt strip-out rules', 'Structure quality flags'],
    },
  },
  {
    id: 'desc',
    title: 'Descriptor Engineering',
    icon: <FlaskConical className="w-6 h-6 text-violet-400" />,
    color: 'violet',
    tags: ['RDKit Features', 'Mordred 3D', 'Fingerprints'],
    description: 'Calculate over 5,000 constitutional, physical, topological, and fingerprint descriptors per compound automatically.',
    details: {
      subtitle: 'Vectorized Descriptor Calculators',
      body: 'Converts chemical SMILES into dense numerical representations suitable for modeling. SUTRIX wraps high-throughput chemical engines to extract structural fingerprints (MACCS, Morgan/Circular) and 3D descriptors on-the-fly.',
      libraries: ['RDKit', 'Mordred', 'NumPy vector calculators'],
      features: ['Physicochemical properties (LogP, TPSA, QED)', 'Topological index equations', 'Morgan circular fingerprints', 'Macromolecule descriptors'],
    },
  },
  {
    id: 'ml',
    title: 'Machine Learning Ready',
    icon: <Brain className="w-6 h-6 text-emerald-400" />,
    color: 'emerald',
    tags: ['Random Forest', 'XGBoost', 'ExtraTrees'],
    description: 'Format data vectors for advanced machine learning pipelines. Evaluates dataset signaling, PCA variance, and class balances.',
    details: {
      subtitle: 'High-Dimensional Pipeline Formatter',
      body: 'Prepares features for predictive toxicology algorithms. Calculates principal component analysis (PCA) to profile features, detects high-correlation redundancies, and balances classes via synthetic minority oversampling models.',
      libraries: ['scikit-learn', 'XGBoost', 'Imbalanced-Learn'],
      features: ['PCA variance curves', 'Multicollinearity drop filters', 'Feature importance metrics', 'Cross-validation splitting'],
    },
  },
  {
    id: 'val',
    title: 'Regulatory Validation',
    icon: <CheckSquare className="w-6 h-6 text-rose-400" />,
    color: 'rose',
    tags: ['OECD Compliance', 'Applicability Domain', 'Predictability'],
    description: 'Check compliance against the 5 OECD guidelines for QSAR modeling validation. Run applicability domain audits.',
    details: {
      subtitle: 'OECD Regulatory Verification Layer',
      body: 'Ensures machine learning datasets satisfy global chemical regulators. Computes similarity-based applicability domains using Mahalanobis distance, identifies chemical outliers, and logs endpoints, satisfying validation protocols.',
      libraries: ['QSAR Validation Engine', 'SciPy spatial distance', 'Pandas QA audits'],
      features: ['Defined endpoint validation', 'Applicability domain distance maps', 'Goodness-of-fit calculators', 'Mechanistic interpretations'],
    },
  },
];

export const CapabilityShowcase: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const active = ITEMS.find(item => item.id === selectedId);

  return (
    <section className="py-24 px-6 bg-[#030712] border-b border-white/[0.04]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/[0.08] border border-violet-500/20 text-xs font-semibold text-violet-400 mb-5">
            Scientific Frameworks
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Scientific Capability Showcase
          </h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">
            SUTRIX is built on industry-standard scientific foundations, ensuring regulatory and experimental credibility.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {ITEMS.map(item => (
            <motion.div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              whileHover={{ scale: 1.02, y: -4 }}
              className="flex flex-col p-6 rounded-2xl border border-white/[0.06] bg-white/[0.01] hover:border-cyan-500/20 hover:bg-cyan-500/[0.02] cursor-pointer transition-all h-[340px] justify-between relative group overflow-hidden"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-6 group-hover:scale-105 transition-all">
                  {item.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                <p className="text-xs text-white/50 leading-relaxed mb-4">{item.description}</p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-cyan-400">
                  <Info className="w-3.5 h-3.5" />
                  View Details
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Slide-out Overlay Modal */}
        <AnimatePresence>
          {active && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-2xl rounded-3xl bg-[#0b1329] border border-white/[0.08] shadow-2xl overflow-hidden"
              >
                {/* Modal Header */}
                <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between bg-slate-950/40">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                      {active.icon}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base leading-none">{active.title}</h3>
                      <span className="text-[10px] text-white/40 mt-0.5 block">{active.details.subtitle}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-6">
                  <p className="text-sm text-white/70 leading-relaxed font-medium">
                    {active.details.body}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/[0.04]">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-white/30 mb-3">Methods & Core Libraries</div>
                      <div className="flex flex-wrap gap-2">
                        {active.details.libraries.map(lib => (
                          <span key={lib} className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-950/60 border border-white/[0.06] text-cyan-300">
                            {lib}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-white/30 mb-3">Capabilities Available</div>
                      <ul className="space-y-1.5">
                        {active.details.features.map(feat => (
                          <li key={feat} className="flex items-center gap-2 text-xs text-white/60">
                            <span className="w-1 h-1 rounded-full bg-cyan-400" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 bg-slate-950/40 border-t border-white/[0.04] flex justify-end">
                  <button
                    onClick={() => setSelectedId(null)}
                    className="px-6 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition-all"
                  >
                    Got It
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </section>
  );
};
