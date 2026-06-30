import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch, BarChart2, FlaskConical, Ruler, Brain, Microscope,
  CheckSquare, Search, AlertTriangle, Play, RotateCcw, ChevronRight,
  Database, Activity, Clock, Layers, Zap, BookOpen, HelpCircle, X, Check,
  ShieldCheck
} from 'lucide-react';
import { SUTRIXLogo } from '../ui/SUTRIXLogo';
import type { StudioId, StudioSnapshot } from '../../services/workspaceManagerService';
import { workspaceManager } from '../../services/workspaceManagerService';
import { useNavigate } from 'react-router-dom';

interface PersonaDef {
  id: string;
  name: string;
  emoji: string;
  color: string;
  studios: StudioId[];
  desc: string;
}

const PERSONAS: PersonaDef[] = [
  { id: 'ecotox', name: 'Ecotoxicologist', emoji: '🧪', color: 'cyan', studios: ['hierarchy', 'qsar', 'oecd'], desc: 'Filter taxons, resolve SMILES structures, and audit REACH compliance.' },
  { id: 'drug', name: 'Drug Discovery', emoji: '💊', color: 'violet', studios: ['qsar', 'compound', 'intelligence'], desc: 'Generate descriptors, view scaffolds, and detect activity cliffs.' },
  { id: 'env', name: 'Environmental Scientist', emoji: '🌱', color: 'emerald', studios: ['hierarchy', 'analytics', 'normalization'], desc: 'Standardize heterogeneous units and analyze sample variances.' },
  { id: 'ai', name: 'AI Researcher', emoji: '🤖', color: 'blue', studios: ['analytics', 'normalization', 'qsar'], desc: 'Explore feature correlations, run PCA, and format ML vectors.' },
  { id: 'reg', name: 'Regulatory Auditor', emoji: '📋', color: 'rose', studios: ['normalization', 'oecd'], desc: 'Verify endpoints, map applicability domains, and log compliance.' },
];

interface ManualDetail {
  title: string;
  solve: string;
  when: string[];
  workflow: string[];
  output: string;
  demoName: string;
}

const MANUAL_DETAILS: Record<StudioId, ManualDetail> = {
  hierarchy: {
    title: 'Hierarchy Builder & Segregation Studio',
    solve: 'Grouping and clustering inconsistent experimental records with multiple species and duration categories.',
    when: ['You are managing multi-species toxicological datasets.', 'You need taxonomic subgroups prior to modeling.'],
    workflow: ['Ingest Raw CSV/Excel', 'Map Variable Ontologies', 'Taxonomic Node Grouping', 'Segregation index audit', 'Export Hierarchy ZIP'],
    output: `Subgroup/
    Daphnia_magna/
        data.parquet
        data.xlsx
    Danio_rerio/
        data.parquet
    manifest.json`,
    demoName: 'ECOTOX Sample',
  },
  analytics: {
    title: 'Scientific Data Analysis Studio',
    solve: 'Profiling missing values, verifying correlation matrices, and mapping cluster points.',
    when: ['You need high-dimensional feature visual profiling.', 'You need UMAP/t-SNE scatter projections.'],
    workflow: ['Ingest dataset', 'Heatmap Missingness checks', 'Correlation Spring-Force networks', 'PCA variance profiling'],
    output: `correlation_matrix.csv
pca_loadings.csv`,
    demoName: 'Toxicity Demo',
  },
  compound: {
    title: 'Compound Explorer Studio',
    solve: 'Searching, browsing, and rendering compound cards.',
    when: ['You are reviewing compound chemical groups.', 'You need 2D structural representations.'],
    workflow: ['Ingest SMILES data', 'Structure check', 'Similarity indexes', 'Compound card exports'],
    output: `compound_profiles.zip (2D rendered structure images)`,
    demoName: 'Active Synonyms',
  },
  normalization: {
    title: 'Unit Harmonization Studio',
    solve: 'Standardizing heterogeneous dosages (ppm, ug/L, mg/mL) to standard molecular metrics.',
    when: ['Your dataset contains mismatched units.', 'You need log transformations (pX).'],
    workflow: ['Ingest dose columns', 'Select unit aliases', 'Run MW-dependent conversions', 'Log-transform (pX)'],
    output: `normalized_dataset.csv`,
    demoName: 'Dosage Matrix',
  },
  qsar: {
    title: 'QSAR / AI Dataset Engineering Studio',
    solve: 'Standardizing structures, generating molecular descriptors, and auditing AI readiness.',
    when: ['You are calculating RDKit/Mordred descriptors.', 'You need OECD readiness checks.'],
    workflow: ['Ingest hierarchy ZIP', 'Resolve synonyms via PubChem', 'Generate 5000+ descriptors', 'Verify OECD guidelines'],
    output: `descriptors_matrix.csv
readiness_report.json`,
    demoName: 'Fish Acute ZIP',
  },
  intelligence: {
    title: 'Scientific Intelligence Studio',
    solve: 'Grouping Murcko scaffolds, mapping cliffs, and evaluating read-across similarities.',
    when: ['You are analyzing SAR activity cliffs.', 'You need similarity read-across.'],
    workflow: ['Ingest SMILES column', 'Murcko scaffold clustering', 'SAR activity cliff mapping', 'k-NN read-across'],
    output: `scaffold_frequency.csv`,
    demoName: 'Scaffold Set',
  },
  oecd: {
    title: 'OECD Validation Studio',
    solve: 'Verifying model outcomes against regulatory principles.',
    when: ['You need REACH-compliant QSAR validation.', 'You are mapping applicability domains.'],
    workflow: ['Ingest model outputs', 'Defined endpoint check', 'Applicability domain calculations', 'R²/Q² ratios PDF export'],
    output: `OECD_Validation_Report.pdf`,
    demoName: 'Model Results',
  },
};

interface StudioDef {
  id: StudioId;
  letter: string;
  name: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  features: string[];
}

const STUDIOS: StudioDef[] = [
  { id: 'hierarchy', letter: '1', name: 'Hierarchy Builder Studio', subtitle: 'Build species and endpoint hierarchies', icon: <GitBranch className="w-5 h-5" />, color: 'cyan', features: ['Ontology mapping', 'Subgroup tree splits', 'Segregation index'] },
  { id: 'analytics', letter: '2', name: 'Data Analysis Studio', subtitle: 'Explore and visualize datasets', icon: <BarChart2 className="w-5 h-5" />, color: 'emerald', features: ['Correlation networks', 'PCA variance', 'UMAP projections'] },
  { id: 'compound', letter: '3', name: 'Compound Explorer Studio', subtitle: 'Visual compound card browsing', icon: <Search className="w-5 h-5" />, color: 'violet', features: ['Structure renders', 'Similarity search', 'Synonym lookups'] },
  { id: 'normalization', letter: '4', name: 'Unit Normalization Studio', subtitle: 'Standardize units and dose log-transforms', icon: <Ruler className="w-5 h-5" />, color: 'amber', features: ['Unit conversion alias', 'MW-dependent rules', 'pX log transform'] },
  { id: 'qsar', letter: '5', name: 'QSAR Engineering Studio', subtitle: 'SMILES recovery & descriptor calculations', icon: <FlaskConical className="w-5 h-5" />, color: 'violet', features: ['Synonym resolving', '5000+ descriptors', 'OECD audits'] },
  { id: 'intelligence', letter: '6', name: 'Scientific Intelligence', subtitle: 'Murcko scaffolds & SAR activity cliffs', icon: <Brain className="w-5 h-5" />, color: 'violet', features: ['Scaffold groupings', 'Cliff identification', 'k-NN read-across'] },
  { id: 'oecd', letter: '7', name: 'OECD Validation Studio', subtitle: 'Regulatory validation compliance checks', icon: <CheckSquare className="w-5 h-5" />, color: 'rose', features: ['5 OECD Guidelines', 'Applicability domain', 'PDF report export'] },
];

export const WorkspaceSelectionHub: React.FC<{
  onOpenStudio: (id: StudioId) => void;
  onGoLanding: () => void;
}> = ({ onOpenStudio, onGoLanding }) => {
  const navigate = useNavigate();
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [mode, setMode] = useState<'explore' | 'guided'>('explore');
  const [learnStudioId, setLearnStudioId] = useState<StudioId | null>(null);
  const [resetConfirm, setResetConfirm] = useState<StudioId | null>(null);
  const [, forceUpdate] = useState(0);

  // Load snapshots for each studio
  const snapshots = STUDIOS.reduce((acc, s) => {
    acc[s.id] = workspaceManager.getSnapshot(s.id);
    return acc;
  }, {} as Record<StudioId, StudioSnapshot>);

  const activeCount = Object.values(snapshots).filter(s => s.status !== 'empty').length;

  const handleReset = (id: StudioId) => {
    workspaceManager.resetWorkspace(id);
    setResetConfirm(null);
    forceUpdate(n => n + 1);
  };

  const handleTryDemo = (id: StudioId) => {
    // Route to studio with ?demo=true query parameter to trigger demo load on mount
    navigate(`/${id}?demo=true`);
  };

  const selectedPersonaDef = PERSONAS.find(p => p.id === selectedPersona);
  const activeManual = learnStudioId ? MANUAL_DETAILS[learnStudioId] : null;

  return (
    <div className="min-h-screen bg-[#030b18] text-white font-sans overflow-x-hidden flex flex-col">
      
      {/* ── Top Navigation Bar ───────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-[#030b18]/90 backdrop-blur-md border-b border-white/[0.05]">
        <button onClick={onGoLanding} className="flex items-center gap-3 group">
          <SUTRIXLogo className="w-8 h-8" />
          <div className="flex flex-col text-left leading-none">
            <span className="text-xl font-extrabold tracking-tight text-white group-hover:text-cyan-400 transition-colors">
              SUTRIX
            </span>
            <span className="text-[9px] font-bold text-white/35 uppercase tracking-widest mt-0.5">Mission Control</span>
          </div>
        </button>

        {/* Mode Toggle */}
        <div className="inline-flex p-1 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <button
            onClick={() => setMode('explore')}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
              mode === 'explore' ? 'bg-white/5 text-white' : 'text-white/40 hover:text-white'
            }`}
          >
            Explore Mode
          </button>
          <button
            onClick={() => setMode('guided')}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
              mode === 'guided' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/40 hover:text-white'
            }`}
          >
            Guided Mode
          </button>
        </div>

        <div className="flex items-center gap-4">
          {activeCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] font-bold text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {activeCount} active session{activeCount !== 1 ? 's' : ''}
            </div>
          )}
          <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider">v5.0</span>
        </div>
      </header>

      {/* ── Main Dashboard Layout (3 Columns) ────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 w-full max-w-[1700px] mx-auto items-stretch">
        
        {/* COLUMN 1: LEFT SIDEBAR (Personas & Guides) -> Span 3 */}
        <aside className="lg:col-span-3 border-r border-white/[0.04] p-6 space-y-8 flex flex-col justify-between bg-slate-950/20">
          <div className="space-y-6">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Scientific Personas</div>
              <p className="text-xs text-white/45 mb-4 leading-relaxed">
                Select your persona profile to highlight related workflows and studio connections.
              </p>
              <div className="space-y-2">
                {PERSONAS.map(p => {
                  const isActive = selectedPersona === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPersona(isActive ? null : p.id)}
                      className={`w-full p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                        isActive
                          ? `border-${p.color}-500 bg-${p.color}-500/10 text-white shadow-md`
                          : 'border-white/[0.04] bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02]'
                      }`}
                    >
                      <span className="text-base leading-none">{p.emoji}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold">{p.name}</div>
                        {isActive && (
                          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[9px] text-white/60 leading-normal mt-1">
                            {p.desc}
                          </motion.p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/[0.04] space-y-3">
            <div className="text-[9px] font-black uppercase tracking-widest text-white/25">Need Help?</div>
            <a href="#manual" className="flex items-center gap-2 text-xs text-white/50 hover:text-cyan-400 transition-colors">
              <BookOpen className="w-4 h-4" />
              SUTRIX Knowledge Base
            </a>
            <a href="#manual" className="flex items-center gap-2 text-xs text-white/50 hover:text-cyan-400 transition-colors">
              <HelpCircle className="w-4 h-4" />
              Guided Tour Guide
            </a>
            <a
              href="#verification-dashboard"
              onClick={(e) => { e.preventDefault(); navigate('/verification-dashboard'); }}
              className="flex items-center gap-2 text-xs text-white/50 hover:text-rose-400 transition-colors border-t border-white/[0.03] pt-2"
            >
              <ShieldCheck className="w-4 h-4 text-rose-500" />
              SQAF Verification Suite
            </a>
          </div>
        </aside>

        {/* COLUMN 2: CENTER MISSION CONTROL (Grid of cards) -> Span 6 */}
        <main className="lg:col-span-6 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-white/[0.04] pb-4">
            <div>
              <h2 className="text-xl font-black text-white leading-none">Studio Mission Control</h2>
              <p className="text-xs text-slate-500 mt-1">
                {mode === 'guided' 
                  ? 'Guided Mode: Highlights sequential pipelines based on scientific targets.'
                  : 'Explore Mode: Launch workspaces independently in any order.'}
              </p>
            </div>
            {selectedPersona && (
              <button
                onClick={() => setSelectedPersona(null)}
                className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-bold text-white/50 hover:text-white"
              >
                Clear Persona filter
              </button>
            )}
          </div>

          {/* Living Studio Cards list */}
          <div className="space-y-4">
            {STUDIOS.map((studio, idx) => {
              const snap = snapshots[studio.id];
              const isSession = snap.status !== 'empty';
              
              // Evaluate highlighting based on selected persona
              const isHighlighted = selectedPersonaDef ? selectedPersonaDef.studios.includes(studio.id) : true;
              
              // Progress calculation
              let progress = 0;
              if (isSession) {
                progress = 40;
                if (snap.rowCount > 0) progress = 70;
                if (snap.parquetPath) progress = 90;
              }

              // Circular progress SVG constants
              const radius = 16;
              const stroke = 2.5;
              const normalizedRadius = radius - stroke * 2;
              const circumference = normalizedRadius * 2 * Math.PI;
              const strokeDashoffset = circumference - (progress / 100) * circumference;

              return (
                <motion.div
                  key={studio.id}
                  animate={{ opacity: isHighlighted ? 1 : 0.35 }}
                  className={`relative p-5 rounded-2xl border bg-white/[0.01] border-white/[0.06] hover:border-${studio.color}-500/20 hover:bg-${studio.color}-500/[0.02] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all group`}
                >
                  {/* Left node info */}
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {/* Ring Progress around Icon */}
                    <div className="relative shrink-0 w-11 h-11 flex items-center justify-center">
                      <svg className="absolute w-full h-full -rotate-90">
                        <circle stroke="rgba(255,255,255,0.03)" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={22} cy={22} />
                        {isSession && (
                          <motion.circle
                            stroke={studio.id === 'hierarchy' ? '#22d3ee' : studio.id === 'qsar' ? '#8b5cf6' : '#10b981'}
                            fill="transparent"
                            strokeWidth={stroke}
                            strokeDasharray={circumference + ' ' + circumference}
                            style={{ strokeDashoffset }}
                            r={normalizedRadius}
                            cx={22}
                            cy={22}
                          />
                        )}
                      </svg>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${studio.color}-500/10 border border-${studio.color}-500/20 text-${studio.color}-400 relative z-10`}>
                        {studio.icon}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Studio {studio.letter}</span>
                        {isSession && (
                          <span className="text-[8px] font-extrabold uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 rounded-full">
                            Active {progress}%
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">{studio.name}</h3>
                      <p className="text-xs text-white/40 leading-normal truncate">{studio.subtitle}</p>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setLearnStudioId(studio.id)}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-[10px] font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all"
                    >
                      Learn
                    </button>
                    <button
                      onClick={() => handleTryDemo(studio.id)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/20 hover:text-white transition-all"
                    >
                      Try Demo
                    </button>
                    <button
                      onClick={() => onOpenStudio(studio.id)}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 bg-${studio.color}-500 text-slate-950 hover:bg-opacity-90 transition-all shadow-md`}
                    >
                      Launch
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Guided Mode Connection overlay lines */}
                  {mode === 'guided' && idx < STUDIOS.length - 1 && (
                    <div className="absolute bottom-[-16px] left-10 w-0.5 h-4 bg-gradient-to-b from-cyan-500 to-violet-500 opacity-20 pointer-events-none hidden sm:block" />
                  )}
                </motion.div>
              );
            })}
          </div>
        </main>

        {/* COLUMN 3: RIGHT SIDEBAR (Active Sessions) -> Span 3 */}
        <aside className="lg:col-span-3 border-l border-white/[0.04] p-6 space-y-6 bg-slate-950/20">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Active Workspace Sessions
            </div>
            
            {activeCount === 0 ? (
              <div className="border border-dashed border-white/10 rounded-2xl p-6 text-center text-xs text-white/20">
                No active workspaces. Open or Launch a studio to start a workspace session.
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(snapshots)
                  .filter(([_, snap]) => snap.status !== 'empty')
                  .map(([id, snap]) => {
                    const studio = STUDIOS.find(s => s.id === id);
                    if (!studio) return null;

                    return (
                      <div key={id} className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.01] space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-lg bg-${studio.color}-500/10 border border-${studio.color}-500/20 text-${studio.color}-400 flex items-center justify-center shrink-0`}>
                              {studio.icon}
                            </div>
                            <span className="text-xs font-bold text-white truncate max-w-[120px]">{studio.name}</span>
                          </div>
                          <button
                            onClick={() => setResetConfirm(id as StudioId)}
                            className="p-1 rounded bg-rose-500/5 hover:bg-rose-500/15 border border-rose-500/10 text-rose-500/60 hover:text-rose-400"
                            title="Reset workspace"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="text-[10px] text-white/40 space-y-1 font-mono">
                          {snap.datasetFilename && (
                            <div className="truncate flex items-center gap-1">
                              <Database className="w-3 h-3" />
                              <span>{snap.datasetFilename}</span>
                            </div>
                          )}
                          {snap.rowCount > 0 && (
                            <div className="flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              <span>{snap.rowCount.toLocaleString()} records</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Last: {new Date(snap.lastActivity).toLocaleTimeString()}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => onOpenStudio(id as StudioId)}
                          className="w-full py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[10px] font-bold text-white"
                        >
                          Resume Session
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </aside>

      </div>

      {/* ── Apple-Style Interactive Product Manual Modal Drawer ──────── */}
      <AnimatePresence>
        {learnStudioId && activeManual && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-2xl rounded-3xl bg-[#0b1329] border border-white/[0.08] shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-white/[0.06] bg-slate-950/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    {STUDIOS.find(s => s.id === learnStudioId)?.icon}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-base leading-none">{activeManual.title}</h3>
                    <span className="text-[10px] text-white/40 block mt-1">SUTRIX V5 Interactive Manual</span>
                  </div>
                </div>
                <button
                  onClick={() => setLearnStudioId(null)}
                  className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                
                {/* 1. Purpose */}
                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-white/30">What does it solve?</div>
                  <p className="text-sm text-white/80 leading-relaxed font-semibold">
                    {activeManual.solve}
                  </p>
                </div>

                {/* 2. When to Use */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-white/30">When should I use it?</div>
                  <div className="space-y-1.5">
                    {activeManual.when.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-white/70">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Pipeline Flowchart */}
                <div className="space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-wider text-white/30">Workflow pipeline</div>
                  <div className="flex flex-wrap items-center gap-2 p-4 rounded-2xl bg-slate-950/60 border border-white/[0.04]">
                    {activeManual.workflow.map((flow, i) => (
                      <React.Fragment key={flow}>
                        <div className="text-[10px] font-mono text-cyan-300 bg-cyan-500/5 border border-cyan-500/10 px-2.5 py-1.5 rounded-lg">
                          {flow}
                        </div>
                        {i < activeManual.workflow.length - 1 && (
                          <span className="text-white/20 text-xs">→</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* 4. Example Output */}
                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-white/30">Example Outputs</div>
                  <pre className="p-4 rounded-2xl bg-slate-950 border border-white/[0.05] text-xs font-mono text-white/50 leading-relaxed overflow-x-auto select-text">
                    {activeManual.output}
                  </pre>
                </div>

              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-950/40 border-t border-white/[0.04] flex justify-between items-center">
                <button
                  onClick={() => {
                    handleTryDemo(learnStudioId);
                    setLearnStudioId(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/20 text-cyan-400 font-bold text-xs hover:bg-cyan-500/25 transition-all"
                >
                  Load Demo dataset
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLearnStudioId(null)}
                    className="px-5 py-2.5 rounded-xl border border-white/10 text-white/40 hover:text-white hover:bg-white/5 text-xs font-bold transition-all"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      onOpenStudio(learnStudioId);
                      setLearnStudioId(null);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-black text-xs hover:bg-cyan-400 transition-all"
                  >
                    Launch Workspace
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Reset Confirmation Modal ──────────────────────────────────── */}
      <AnimatePresence>
        {resetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm p-6 rounded-2xl bg-[#0d1a2e] border border-white/[0.08] shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Reset Workspace?</h3>
                  <p className="text-xs text-slate-500">
                    {STUDIOS.find(s => s.id === resetConfirm)?.name}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                This will clear all uploaded files, generated artifacts, and processing state for this studio. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setResetConfirm(null)}
                  className="flex-1 py-2 rounded-xl border border-white/[0.08] text-slate-400 text-xs font-bold hover:bg-white/[0.04] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleReset(resetConfirm)}
                  className="flex-1 py-2 rounded-xl bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-bold hover:bg-rose-500/30 transition-colors"
                >
                  Reset Studio
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
export default WorkspaceSelectionHub;
