import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, GitBranch, FlaskConical, BarChart3, ChevronRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Goal = 'hierarchy' | 'analysis' | 'qsar' | null;

interface Recommendation {
  studio: string;
  path: string;
  icon: React.ReactNode;
  color: string;
  explanation: string;
  features: string[];
}

const RECOMMENDATIONS: Record<string, Recommendation> = {
  hierarchy: {
    studio: 'Hierarchy Builder & Segregation Studio',
    path: '/hierarchy',
    icon: <GitBranch className="w-6 h-6" />,
    color: 'cyan',
    explanation: 'SUTRIX recommends the Hierarchy Studio because your primary focus is structuring raw toxicity datasets into nested subgroups (e.g., species taxons, endpoints, durations) and analyzing taxonomic segregation profiles.',
    features: ['Upload raw CSV/Excel datasets', 'Ontology mapping', 'Subgroup tree layout', 'Segregation index calculation'],
  },
  analysis: {
    studio: 'Scientific Data Analysis Studio',
    path: '/analytics',
    icon: <BarChart3 className="w-6 h-6" />,
    color: 'emerald',
    explanation: 'SUTRIX recommends the Analytics Studio. It provides interactive visual profiling, correlation matrices, dimensionality reductions (PCA, t-SNE), and checks for missing variables without requiring compound calculations.',
    features: ['Interactive dataset data grid', 'Dimensionality clusters', 'Distribution & correlation graphs', 'Feature statistics'],
  },
  qsar: {
    studio: 'QSAR / AI Dataset Engineering Studio',
    path: '/qsar',
    icon: <FlaskConical className="w-6 h-6" />,
    color: 'violet',
    explanation: 'SUTRIX recommends the QSAR Studio. This environment calculates molecular descriptors (RDKit/Mordred), performs SMILES structural assessment/recovery, evaluates AI dataset readiness, and generates regulatory compliance reports.',
    features: ['SMILES structure assessment', 'SMILES recovery via PubChem/ChEMBL', '2000+ descriptor generation', 'OECD compliance audit'],
  },
};

export const StudioMap: React.FC = () => {
  const navigate = useNavigate();
  const [selectedGoal, setSelectedGoal] = useState<Goal>(null);

  const rec = selectedGoal ? RECOMMENDATIONS[selectedGoal] : null;

  return (
    <section className="py-24 px-6 bg-[#030712] border-b border-white/[0.04]">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 text-xs font-semibold text-cyan-400 mb-5">
            <HelpCircle className="w-3.5 h-3.5" />
            Decision Tree
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Studio Selection Map
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            Not sure where to begin? Answer the question below, and SUTRIX will guide you to the appropriate studio.
          </p>
        </div>

        {/* Wizard Container */}
        <div className="rounded-3xl glass-elevated border border-white/[0.06] p-6 lg:p-10 relative overflow-hidden">
          <div className="relative z-10 space-y-8">
            <div>
              <h3 className="text-xl font-bold text-white mb-4">What is your scientific goal?</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: 'hierarchy', label: 'Build hierarchy', desc: 'Group compounds by species taxonomy, endpoints & durations.' },
                  { id: 'analysis', label: 'Analyze dataset', desc: 'Profile missing values, correlations, and cluster points.' },
                  { id: 'qsar', label: 'Build QSAR dataset', desc: 'Verify SMILES structures, calculate descriptors, audit AI readiness.' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedGoal(opt.id as Goal)}
                    className={`p-5 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between h-40 ${
                      selectedGoal === opt.id
                        ? 'border-cyan-500 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-xs font-black uppercase tracking-wider ${selectedGoal === opt.id ? 'text-cyan-400' : 'text-white/40'}`}>Goal</span>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        selectedGoal === opt.id ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-white/20'
                      }`}>
                        {selectedGoal === opt.id && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-base mb-1">{opt.label}</h4>
                      <p className="text-xs text-white/40 leading-relaxed">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recommendation Display Area */}
            <AnimatePresence mode="wait">
              {rec && (
                <motion.div
                  key={selectedGoal}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.3 }}
                  className="pt-8 border-t border-white/[0.06] grid grid-cols-1 md:grid-cols-12 gap-6 items-center"
                >
                  <div className="md:col-span-8 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${rec.color}-500/10 border border-rec.color-500/20 text-${rec.color}-400`}>
                        {rec.icon}
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-white/30">Recommended Studio</div>
                        <h4 className="font-extrabold text-white text-lg leading-none mt-0.5">{rec.studio}</h4>
                      </div>
                    </div>
                    <p className="text-sm text-white/60 leading-relaxed">{rec.explanation}</p>
                  </div>

                  <div className="md:col-span-4 flex flex-col gap-4">
                    <div className="bg-slate-950/40 rounded-xl p-4 border border-white/[0.04] space-y-2">
                      <div className="text-[9px] font-black uppercase tracking-wider text-white/30">Included Pipelines</div>
                      {rec.features.map(feat => (
                        <div key={feat} className="flex items-center gap-2 text-xs text-white/70">
                          <Check className={`w-3.5 h-3.5 text-${rec.color}-400`} />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => navigate(rec.path)}
                      className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-${rec.color}-500/10 border border-${rec.color}-500/20 text-${rec.color}-300 hover:bg-${rec.color}-500/20 hover:text-white transition-all`}
                    >
                      Open Studio
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
};
