import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, FlaskConical, ChevronRight, HelpCircle, Layers, CheckCircle } from 'lucide-react';

interface NodeDef {
  id: string;
  label: string;
  sub: string;
  details: string;
}

const HIERARCHY_PIPELINE: NodeDef[] = [
  { id: 'h-up', label: 'Upload Dataset', sub: 'CSV/XLSX/Parquet', details: 'Ingest raw experimental data. Validates columns and reads the data matrix into memory.' },
  { id: 'h-map', label: 'Variable Mapping', sub: 'Ontology matching', details: 'Binds variable variants dynamically. Fuzzy ontology engine maps species, endpoints, and values.' },
  { id: 'h-tree', label: 'Hierarchy Builder', sub: 'Lineage creation', details: 'Group compounds by taxons and experimental metrics to form clean subgroup directories.' },
  { id: 'h-seg', label: 'Segregation Analysis', sub: 'Sutrix index calculation', details: 'Run taxonomic segregation index calculations to analyze statistical variance across subgroups.' },
  { id: 'h-exp', label: 'Export Subgroups', sub: 'Clean hierarchy ZIP', details: 'Export your mapped, segregated subgroups as a structured manifest ZIP ready for QSAR calculations.' },
];

const QSAR_PIPELINE: NodeDef[] = [
  { id: 'q-up', label: 'Upload ZIP', sub: 'Hierarchy package', details: 'Ingest a structured SUTRIX hierarchy ZIP package, metadata manifest, or standard CSV compound tables.' },
  { id: 'q-assess', label: 'Structure Assessment', sub: 'SMILES check', details: 'Check chemical compound SMILES structural validity, flagging missing, duplicate, or corrupted formulas.' },
  { id: 'q-rec', label: 'Recovery Engine', sub: 'API synonym resolves', details: 'Standardize molecular structures automatically. Queries PubChem/ChEMBL synonyms to resolve invalid SMILES.' },
  { id: 'q-desc', label: 'Descriptors calculation', sub: 'Morgan & Mordred', details: 'Calculate Morgan Circular Fingerprints, MACCS, and 2D/3D descriptors using RDKit and Mordred.' },
  { id: 'q-ready', label: 'AI Readiness', sub: 'OECD compliance checks', details: 'Audit dataset completeness, feature coverage, class imbalances, and outline applicability domains.' },
  { id: 'q-opt', label: 'Optimization', sub: 'Feature selections', details: 'Perform feature importance rankings and drop collinear variables to optimize dataset signals.' },
  { id: 'q-exp', label: 'Modeling Export', sub: 'AI-ready package', details: 'Download standardized modeling vectors, correlation networks, and OECD compliance documentation.' },
];

export const PipelineExplorer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'qsar'>('hierarchy');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('h-up');

  const pipeline = activeTab === 'hierarchy' ? HIERARCHY_PIPELINE : QSAR_PIPELINE;
  const activeNode = pipeline.find(n => n.id === selectedNodeId) || pipeline[0];

  const handleTabChange = (tab: 'hierarchy' | 'qsar') => {
    setActiveTab(tab);
    setSelectedNodeId(tab === 'hierarchy' ? 'h-up' : 'q-up');
  };

  return (
    <section className="py-24 px-6 bg-[#020610] border-b border-white/[0.04]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 text-xs font-semibold text-cyan-400 mb-5">
            <Layers className="w-3.5 h-3.5" />
            Interactive Pipeline Explorer
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Platform Architecture
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            Click into the studios below to explore their internal pipeline steps and architectural node connections.
          </p>
        </div>

        {/* Tab selector */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex p-1 rounded-xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-md">
            <button
              onClick={() => handleTabChange('hierarchy')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                activeTab === 'hierarchy'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-white/45 hover:text-white/80'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Hierarchy Studio Pipeline
            </button>
            <button
              onClick={() => handleTabChange('qsar')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                activeTab === 'qsar'
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'text-white/45 hover:text-white/80'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              QSAR Studio Pipeline
            </button>
          </div>
        </div>

        {/* Pipeline Flow Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Nodes list row */}
          <div className="lg:col-span-8 bg-slate-950/40 rounded-3xl p-6 border border-white/[0.04] overflow-x-auto">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 min-w-[600px] py-4">
              {pipeline.map((node, index) => {
                const isSelected = selectedNodeId === node.id;
                return (
                  <React.Fragment key={node.id}>
                    <motion.button
                      onClick={() => setSelectedNodeId(node.id)}
                      whileHover={{ scale: 1.03 }}
                      className={`flex flex-col items-center p-4 rounded-2xl border text-center cursor-pointer transition-all duration-300 shrink-0 w-32 ${
                        isSelected
                          ? activeTab === 'hierarchy'
                            ? 'border-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                            : 'border-violet-500 bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
                          : 'border-white/[0.04] bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black mb-3 ${
                        isSelected
                          ? activeTab === 'hierarchy' ? 'bg-cyan-400 text-slate-950' : 'bg-violet-400 text-slate-950'
                          : 'bg-white/5 text-white/50'
                      }`}>
                        {index + 1}
                      </div>
                      <span className="text-xs font-bold text-white mb-0.5 leading-tight truncate w-full">{node.label}</span>
                      <span className="text-[9px] text-white/40 truncate w-full">{node.sub}</span>
                    </motion.button>

                    {index < pipeline.length - 1 && (
                      <ChevronRight className="w-5 h-5 text-white/10 shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Node detail display card */}
          <div className="lg:col-span-4 h-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedNodeId}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="glass-elevated border border-white/[0.06] rounded-3xl p-6 space-y-4 h-56 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 text-white/30 text-[10px] font-black uppercase tracking-wider">
                    <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                    Node details
                  </div>
                  <h4 className="text-base font-extrabold text-white mt-2 mb-1">{activeNode.label}</h4>
                  <p className="text-xs text-white/50 leading-relaxed">
                    {activeNode.details}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg self-start">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Integration Verified
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

      </div>
    </section>
  );
};
