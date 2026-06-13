import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, HelpCircle, BookOpen, ChevronRight, FileText } from 'lucide-react';

interface ArticleDef {
  id: string;
  question: string;
  steps: string[];
  notes: string;
}

const ARTICLES: ArticleDef[] = [
  {
    id: 'qsar-create',
    question: 'How do I create a QSAR dataset?',
    steps: [
      'Open QSAR Studio and upload your compound data matrix containing SMILES formulas.',
      'Run Structure Assessment to review molecular integrity and flag broken SMILES strings.',
      'Activate Chemical Recovery to automatically fetch missing compound models via PubChem.',
      'Generate descriptors (Constitutional, Topological, Morgan Fingerprints) using RDKit/Mordred.',
      'Review OECD Principle metrics, define the applicability domain, and export your completed dataset ZIP.',
    ],
    notes: 'Input: Mapped hierarchy ZIP or simple CSV tables containing chemical structures.',
  },
  {
    id: 'descriptors-type',
    question: 'What molecular descriptors does SUTRIX generate?',
    steps: [
      'Constitutional properties (Molecular Weight, atom counts, bond types).',
      'Physicochemical indices (partition coefficient LogP, polar surface area TPSA, drug-likeness QED).',
      'Structural Fingerprints (MACCS 166-bit keys, Morgan Circular Fingerprints).',
      'Topological and electrostatic descriptor matrices (Mordred 2D/3D vectors).',
    ],
    notes: 'Requires a verified SMILES column containing standard chemical formulas.',
  },
  {
    id: 'hierarchy-align',
    question: 'How do I align species taxonomies?',
    steps: [
      'Open Hierarchy Studio and upload experimental toxicity records.',
      'Map your species variables in the Mapping panel (maps raw variants to standard binomial names).',
      'Define taxonomy nodes (e.g. Kingdom -> Phylum -> Class -> Order -> Species).',
      'SUTRIX clusters observations, forming subgroup directories with calculated segregation scores.',
    ],
    notes: 'Helps structure multi-species ecotoxicology tables into uniform training folds.',
  },
  {
    id: 'oecd-app-domain',
    question: 'How is the applicability domain evaluated?',
    steps: [
      'Ingest trained model regression results alongside compound descriptors in OECD Validation Studio.',
      'SUTRIX computes average euclidean/Mahalanobis distances of compound features relative to training means.',
      'Compounds exceeding 3 standard deviations are flagged as outside the applicability domain.',
      'Goodness-of-fit charts ($Q^2$ predictability ratios vs $R^2$ fitting) are compiled into validation sheets.',
    ],
    notes: 'Crucial for REACH compliance audits and regulatory submissions.',
  },
];

export const DocCenter: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);

  const filteredArticles = ARTICLES.filter(art =>
    art.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    art.steps.some(step => step.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const activeArticle = ARTICLES.find(art => art.id === activeArticleId);

  return (
    <section className="py-24 px-6 bg-[#030712] border-b border-white/[0.04]">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/[0.08] border border-violet-500/20 text-xs font-semibold text-violet-400 mb-5">
            <BookOpen className="w-3.5 h-3.5" />
            Documentation Center
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Interactive Support Guides
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            Search or click questions below to explore step-by-step tutorials detailing SUTRIX features.
          </p>
        </div>

        {/* Documentation Widget */}
        <div className="space-y-6">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <input
              type="text"
              placeholder="Search guides (e.g. 'qsar', 'descriptors', 'hierarchy')..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-6 py-4 rounded-2xl bg-white/[0.02] border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-cyan-500/50 transition-all shadow-inner"
            />
          </div>

          {/* Grid Layout: Left Question links, Right Dropdown Content */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Questions Menu list */}
            <div className="md:col-span-5 space-y-2">
              {filteredArticles.length === 0 ? (
                <div className="p-4 text-xs text-white/30 italic">No tutorials match your search.</div>
              ) : (
                filteredArticles.map(art => (
                  <button
                    key={art.id}
                    onClick={() => setActiveArticleId(art.id === activeArticleId ? null : art.id)}
                    className={`w-full text-left p-4 rounded-xl border text-xs font-bold transition-all flex items-center justify-between ${
                      activeArticleId === art.id
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                        : 'border-white/[0.04] bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02] text-white/70'
                    }`}
                  >
                    <span className="truncate">{art.question}</span>
                    <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${activeArticleId === art.id ? 'rotate-90 text-cyan-400' : 'text-white/20'}`} />
                  </button>
                ))
              )}
            </div>

            {/* Answer Display Card */}
            <div className="md:col-span-7">
              <AnimatePresence mode="wait">
                {activeArticle ? (
                  <motion.div
                    key={activeArticleId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="glass-elevated border border-white/[0.06] rounded-3xl p-6 space-y-4"
                  >
                    <div className="flex items-center gap-2 border-b border-white/[0.05] pb-3 text-white/30 text-[10px] font-black uppercase tracking-wider">
                      <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                      Step-by-step Tutorial
                    </div>

                    <h4 className="font-extrabold text-white text-sm leading-tight">{activeArticle.question}</h4>

                    <ol className="space-y-3 pt-2">
                      {activeArticle.steps.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-3 text-xs text-white/70">
                          <div className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold text-[10px] shrink-0 text-white/40">
                            {idx + 1}
                          </div>
                          <p className="leading-relaxed">{step}</p>
                        </li>
                      ))}
                    </ol>

                    <div className="pt-4 mt-4 border-t border-white/[0.04] flex items-center gap-2 text-[10px] font-bold text-white/40 italic">
                      <FileText className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{activeArticle.notes}</span>
                    </div>
                  </motion.div>
                ) : (
                  <div className="border border-dashed border-white/10 rounded-3xl p-8 text-center text-white/20 text-xs h-64 flex flex-col items-center justify-center gap-2">
                    <BookOpen className="w-8 h-8" />
                    <span>Select a question link on the left to display its step-by-step walkthrough guide.</span>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
