import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Layers, Cpu, Shield, Database, Network, FlaskConical, Download, Activity, Zap, Compass, Info, BarChart3 } from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  desc: string;
  tag: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  detail: string;
}

const molecularFeatures: Feature[] = [
  {
    icon: <Shield className="w-5 h-5" />,
    title: 'QSAR Readiness Engine',
    tag: 'Validation',
    desc: 'Evaluates dataset suitability before model development.',
    detail: 'Flags structural duplicates, missing SMILES, and severe data gaps before machine learning pipelines are run.',
    color: 'rgba(244,114,182,0.4)', textColor: 'text-pink-400',
    bgColor: 'bg-pink-500/[0.05]', borderColor: 'border-pink-500/[0.12]',
  },
  {
    icon: <Layers className="w-5 h-5" />,
    title: 'OECD Compliance Evaluation',
    tag: 'Regulatory',
    desc: 'Checks readiness against QSAR best practices.',
    detail: 'Generates detailed audit checklists against the 5 OECD principles, including defined endpoints and applicability domains.',
    color: 'rgba(167,139,250,0.4)', textColor: 'text-violet-400',
    bgColor: 'bg-violet-500/[0.05]', borderColor: 'border-violet-500/[0.12]',
  },
  {
    icon: <Database className="w-5 h-5" />,
    title: 'Compound Explorer',
    tag: 'Interactive',
    desc: 'Search and inspect every compound interactively.',
    detail: 'Google-style live search and on-demand 2D chemical structure rendering using RDKit backend engines.',
    color: 'rgba(96,165,250,0.4)', textColor: 'text-blue-400',
    bgColor: 'bg-blue-500/[0.05]', borderColor: 'border-blue-500/[0.12]',
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: 'Descriptor Intelligence',
    tag: 'Calculation',
    desc: 'Identify generated and missing descriptor families.',
    detail: 'Groups 2,000+ molecular features into Constitutional, Physicochemical, Topological, and Fingerprint descriptors.',
    color: 'rgba(251,191,36,0.4)', textColor: 'text-amber-400',
    bgColor: 'bg-amber-500/[0.05]', borderColor: 'border-amber-500/[0.12]',
  },
];

const scientificFeatures: Feature[] = [
  {
    icon: <Cpu className="w-5 h-5" />,
    title: 'Scientific Ontologies',
    tag: 'Ontology Engine',
    desc: 'Fuzzy binding binds column variants dynamically.',
    detail: 'Automatically matches columns to standardized variables across general pharmacological, biological, and clinical contexts.',
    color: 'rgba(34,211,238,0.4)', textColor: 'text-cyan-400',
    bgColor: 'bg-cyan-500/[0.05]', borderColor: 'border-cyan-500/[0.12]',
  },
  {
    icon: <Network className="w-5 h-5" />,
    title: 'Variable Correlation Networks',
    tag: 'Topological Visualizer',
    desc: 'Interactive spring-force networks of correlations.',
    detail: 'Visualizes variables as nodes and correlation paths as color-coded links, with filters to isolate key network hubs.',
    color: 'rgba(45,212,191,0.4)', textColor: 'text-teal-400',
    bgColor: 'bg-teal-500/[0.05]', borderColor: 'border-teal-500/[0.12]',
  },
  {
    icon: <Compass className="w-5 h-5" />,
    title: 'Scientific Data Explorer',
    tag: 'Big Data Explorer',
    desc: 'Fluid server-side pagination with type profiling.',
    detail: 'Enables real-time data browsing, custom sorting, filtering, and deep column profiling sidebars without client-side lag.',
    color: 'rgba(96,165,250,0.4)', textColor: 'text-blue-400',
    bgColor: 'bg-blue-500/[0.05]', borderColor: 'border-blue-500/[0.12]',
  },
  {
    icon: <Activity className="w-5 h-5" />,
    title: 'Multi-modal ML Readiness',
    tag: 'Signal Predictor',
    desc: 'Scans class imbalance, PCA, and baseline signaling.',
    detail: 'Performs non-chemical high-dimensional audits, recommending optimal model algorithms and warning of overfitting.',
    color: 'rgba(251,146,60,0.4)', textColor: 'text-orange-400',
    bgColor: 'bg-orange-500/[0.05]', borderColor: 'border-orange-500/[0.12]',
  },
];

const FeatureCard: React.FC<{ f: Feature; i: number; inView: boolean }> = ({ f, i, inView }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={inView ? { opacity: 1, y: 0 } : {}}
    transition={{ delay: i * 0.06, duration: 0.5 }}
    whileHover={{ y: -3 }}
    className={`group relative p-6 rounded-2xl border ${f.borderColor} ${f.bgColor} hover:border-opacity-50 transition-all cursor-default overflow-hidden`}
  >
    {/* Glow on hover */}
    <div
      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
      style={{ background: `radial-gradient(circle at 20% 20%, ${f.color.replace('0.4', '0.08')}, transparent 70%)` }}
    />
    <div className="relative z-10">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl ${f.bgColor} border ${f.borderColor} flex items-center justify-center ${f.textColor}`}>
          {f.icon}
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${f.bgColor} ${f.textColor} border ${f.borderColor}`}>
          {f.tag}
        </span>
      </div>
      <h3 className="text-sm font-bold text-white mb-2">{f.title}</h3>
      <p className="text-xs text-white/40 leading-relaxed mb-3">{f.desc}</p>
      <div className="pt-3 border-t border-white/[0.04]">
        <p className="text-[10px] text-white/25 leading-relaxed italic">{f.detail}</p>
      </div>
    </div>
  </motion.div>
);

export const FeatureExplorer: React.FC = () => {
  const [activeMode, setActiveMode] = useState<'MOLECULAR' | 'SCIENTIFIC'>('MOLECULAR');
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  const currentFeatures = activeMode === 'MOLECULAR' ? molecularFeatures : scientificFeatures;

  return (
    <section id="features" ref={ref} className="py-28 px-6 bg-[#03070f] border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/[0.08] border border-emerald-500/20 text-xs font-semibold text-emerald-400 mb-5">
            <Cpu className="w-3 h-3" />
            Platform Capabilities
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">Dual Environment Intelligence</h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">
            Choose an environment capability mode below to view our highly optimized platform integrations.
          </p>
        </motion.div>

        {/* Mode Selector */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex p-1 rounded-xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-md">
            <button
              onClick={() => setActiveMode('MOLECULAR')}
              className={`px-5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                activeMode === 'MOLECULAR'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(34,211,238,0.15)]'
                  : 'text-white/45 hover:text-white/80'
              }`}
            >
              Molecular / Cheminformatics
            </button>
            <button
              onClick={() => setActiveMode('SCIENTIFIC')}
              className={`px-5 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                activeMode === 'SCIENTIFIC'
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30 shadow-[0_0_12px_rgba(139,92,246,0.15)]'
                  : 'text-white/45 hover:text-white/80'
              }`}
            >
              Scientific Data Science
            </button>
          </div>
        </div>

        <div className="min-h-[300px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMode}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="grid md:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              {currentFeatures.map((f, i) => (
                <FeatureCard key={f.title} f={f} i={i} inView={inView} />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};
