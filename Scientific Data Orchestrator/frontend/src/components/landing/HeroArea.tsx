import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Play, Check, ChevronRight, GitBranch, FlaskConical, BarChart3, Database, ShieldCheck, HelpCircle } from 'lucide-react';
import { SUTRIXLogo } from '../ui/SUTRIXLogo';

// ─── Center Column: Ingestion Stages ─────────────────────────────────────────
interface TransformStage {
  id: string;
  title: string;
  badge: string;
  icon: React.ReactNode;
  color: string;
  render: () => React.ReactNode;
}

const STAGES = (): TransformStage[] => [
  {
    id: 'raw',
    title: 'RAW DATA',
    badge: 'Messy Input',
    icon: <Database className="w-4 h-4 text-red-400" />,
    color: 'red',
    render: () => (
      <div className="font-mono text-[10px] space-y-1.5 text-red-400/80">
        <div className="flex justify-between border-b border-red-500/10 pb-1 text-white/30 font-bold">
          <span>SMILES</span>
          <span>LC50</span>
        </div>
        <div className="flex justify-between">
          <span className="text-red-400 font-bold">????</span>
          <span>5 mg/L</span>
        </div>
        <div className="flex justify-between">
          <span>CCO</span>
          <span className="text-red-400">20 ppm</span>
        </div>
        <div className="flex justify-between">
          <span className="text-red-400 font-bold">NaN</span>
          <span className="text-red-400">0.2 mg/mL</span>
        </div>
      </div>
    ),
  },
  {
    id: 'recovery',
    title: 'STRUCTURE RECOVERY',
    badge: 'API Syncing',
    icon: <FlaskConical className="w-4 h-4 text-cyan-400" />,
    color: 'cyan',
    render: () => (
      <div className="space-y-3 pt-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-white/60 font-semibold">Synonym resolving...</span>
          <span className="text-cyan-400 font-mono font-bold">92%</span>
        </div>
        <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/[0.04]">
          <motion.div className="bg-cyan-400 h-full" initial={{ width: 0 }} animate={{ width: '92%' }} transition={{ duration: 1 }} />
        </div>
        <div className="flex justify-between text-[10px] text-white/30 font-mono">
          <span>Confidence: High</span>
          <span>PubChem Sync: OK</span>
        </div>
      </div>
    ),
  },
  {
    id: 'normalization',
    title: 'UNIT NORMALIZATION',
    badge: 'Harmonization',
    icon: <Database className="w-4 h-4 text-violet-400" />,
    color: 'violet',
    render: () => (
      <div className="space-y-2 font-mono text-[10px] text-violet-300">
        <div className="flex items-center justify-between p-1.5 rounded bg-violet-500/5 border border-violet-500/10">
          <span>ppm → mg/L</span>
          <span className="text-white/40 font-bold">CONVERTED</span>
        </div>
        <div className="flex items-center justify-between p-1.5 rounded bg-violet-500/5 border border-violet-500/10">
          <span>mg/mL → mg/L</span>
          <span className="text-white/40 font-bold">CONVERTED</span>
        </div>
        <div className="flex items-center justify-between p-1.5 rounded bg-violet-500/5 border border-violet-500/10">
          <span>g/L → mg/L</span>
          <span className="text-white/40 font-bold">CONVERTED</span>
        </div>
      </div>
    ),
  },
  {
    id: 'descriptors',
    title: 'DESCRIPTORS GENERATED',
    badge: 'RDKit & Mordred',
    icon: <FlaskConical className="w-4 h-4 text-amber-400" />,
    color: 'amber',
    render: () => (
      <div className="grid grid-cols-3 gap-2 text-center pt-1">
        <div className="p-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <div className="text-sm font-black text-amber-400">200</div>
          <div className="text-[8px] text-white/30 uppercase mt-0.5">RDKit</div>
        </div>
        <div className="p-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <div className="text-sm font-black text-amber-400">1,600</div>
          <div className="text-[8px] text-white/30 uppercase mt-0.5">Mordred</div>
        </div>
        <div className="p-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <div className="text-sm font-black text-amber-400">2,048</div>
          <div className="text-[8px] text-white/30 uppercase mt-0.5">Morgan</div>
        </div>
      </div>
    ),
  },
  {
    id: 'readiness',
    title: 'AI READINESS AUDIT',
    badge: 'OECD principles',
    icon: <ShieldCheck className="w-4 h-4 text-rose-400" />,
    color: 'rose',
    render: () => (
      <div className="space-y-2 pt-1">
        <div className="flex justify-between items-center text-xs">
          <span className="text-white/60">Compliance Index</span>
          <span className="text-rose-400 font-mono font-bold">89 / 100</span>
        </div>
        <div className="w-full bg-white/5 h-2.5 rounded-full overflow-hidden border border-white/[0.04]">
          <motion.div className="bg-rose-400 h-full" initial={{ width: 0 }} animate={{ width: '89%' }} transition={{ duration: 1 }} />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
          <Check className="w-3.5 h-3.5" />
          <span>OECD validation: 5 / 5 Guidelines Passed</span>
        </div>
      </div>
    ),
  },
  {
    id: 'model',
    title: 'MODELING DATASET',
    badge: 'Export Ready',
    icon: <Check className="w-4 h-4 text-emerald-400" />,
    color: 'emerald',
    render: () => (
      <div className="flex flex-col items-center justify-center py-2 space-y-2 text-center">
        <div className="text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
          <Check className="w-4 h-4" />
          <span>Fish_Acute_v3.parquet</span>
        </div>
        <span className="text-[10px] text-white/30">Vectorized Parquet matrix successfully generated</span>
      </div>
    ),
  },
];

export const HeroArea: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeStageIdx, setActiveStageIdx] = useState(0);

  // Auto-transition pipeline stages every 3 seconds
  useEffect(() => {
    const t = setInterval(() => {
      setActiveStageIdx(prev => (prev + 1) % STAGES().length);
    }, 3200);
    return () => clearInterval(t);
  }, []);

  // Floating Molecule and Node Network Canvas background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initial molecules nodes
    const nodes: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      label?: string;
    }> = Array.from({ length: 45 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 2 + 1,
      label: Math.random() > 0.85 ? ['C', 'O', 'N', 'OH'][Math.floor(Math.random() * 4)] : undefined
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connection lines
      nodes.forEach((n, idx) => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0) n.x = canvas.width;
        if (n.x > canvas.width) n.x = 0;
        if (n.y < 0) n.y = canvas.height;
        if (n.y > canvas.height) n.y = 0;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
        ctx.fill();

        if (n.label) {
          ctx.font = '8px monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fillText(n.label, n.x + 6, n.y + 3);
        }

        for (let j = idx + 1; j < nodes.length; j++) {
          const dx = n.x - nodes[j].x;
          const dy = n.y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(34, 211, 238, ${0.05 * (1 - dist / 130)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const activeStage = STAGES()[activeStageIdx];

  const colorMap: Record<string, string> = {
    red: 'border-red-500/20 bg-red-500/5 text-red-400',
    cyan: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-400',
    violet: 'border-violet-500/20 bg-violet-500/5 text-violet-400',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
    rose: 'border-rose-500/20 bg-rose-500/5 text-rose-400',
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  };

  const badgeColor = colorMap[activeStage.color] || colorMap.cyan;

  return (
    <section className="relative min-h-screen flex flex-col w-full bg-[#030712] overflow-hidden font-sans border-b border-white/[0.04]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-40" />

      {/* Radial glow background */}
      <div className="absolute top-1/4 left-1/3 w-[60vw] h-[60vw] rounded-full bg-gradient-to-tr from-cyan-500/5 to-purple-500/5 blur-[120px] pointer-events-none" />

      {/* Main 3-Column Layout: copy (40%) | transform (40%) | cards (20%) */}
      <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 px-6 lg:px-16 w-full max-w-[1600px] mx-auto pt-24 pb-12 items-center">
        
        {/* COLUMN 1: LEFT COPY (40%) -> Span 5 */}
        <div className="lg:col-span-5 flex flex-col space-y-6 text-left">
          
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-cyan-400 text-[10px] font-bold uppercase tracking-wider self-start select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            SUTRIX V5 — Dataset Control Center
          </div>

          <h1 className="text-4xl lg:text-[3.2rem] font-black text-white leading-[1.08] tracking-tight">
            Transform Scientific Data <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-100 to-violet-400">
              Into AI-Ready Intelligence
            </span>
          </h1>

          <p className="text-white/60 text-base leading-relaxed max-w-lg">
            Recover structures, standardize units, engineer descriptors, and build reproducible modeling datasets—all in one scientific workspace.
          </p>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-2 select-none">
            {['OECD-aligned', 'AI-ready', 'QSAR-focused', 'Reproducible', 'Publication-ready'].map(badge => (
              <span key={badge} className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/10 text-white/50">
                <Check className="w-3 h-3 text-emerald-400" />
                {badge}
              </span>
            ))}
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              onClick={() => navigate('/qsar')}
              className="group flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 text-slate-950 font-black text-xs hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(6,182,212,0.2)]"
            >
              Engineer QSAR Datasets
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            
            <button
              onClick={() => navigate('/hierarchy')}
              className="group flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-cyan-500/20 text-white font-black text-xs hover:bg-white/[0.06] transition-all"
            >
              Start Building Hierarchies
            </button>
          </div>
        </div>

        {/* COLUMN 2: CENTER WORKFLOW TRANSFORM (40%) -> Span 4 */}
        <div className="lg:col-span-4 flex justify-center items-center h-full">
          <div className="w-full max-w-[380px] rounded-3xl glass-elevated border border-white/[0.08] p-6 flex flex-col justify-between h-[360px]">
            <div>
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30">
                  Data Pipeline Process
                </div>
                <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                  {activeStage.badge}
                </div>
              </div>

              {/* Progress Stepper indicators */}
              <div className="flex items-center gap-1 py-4 justify-between select-none">
                {STAGES().map((st, i) => (
                  <button
                    key={st.id}
                    onClick={() => setActiveStageIdx(i)}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      i === activeStageIdx ? 'bg-cyan-400' : i < activeStageIdx ? 'bg-cyan-400/30' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Active stage info container */}
            <div className="flex-1 flex flex-col justify-between pt-1">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    {activeStage.icon}
                  </div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">{activeStage.title}</h4>
                </div>

                <div className="rounded-2xl bg-slate-950/70 border border-white/[0.04] p-4 min-h-[140px] flex flex-col justify-center">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeStage.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="w-full"
                    >
                      {activeStage.render()}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <div className="text-[9px] text-white/25 flex items-center justify-between font-mono pt-3 border-t border-white/[0.03]">
                <span>Pipeline Stage {activeStageIdx + 1} / 6</span>
                <span className="animate-pulse text-cyan-400 font-bold">● SIMULATION RUNNING</span>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 3: RIGHT STUDIO CARDS (20%) -> Span 3 */}
        <div className="lg:col-span-3 flex flex-col gap-3 justify-center">
          
          {/* Studio Card 1: Hierarchy */}
          <motion.div
            onClick={() => navigate('/hierarchy')}
            whileHover={{ scale: 1.02, x: 4 }}
            className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.01] hover:border-cyan-500/20 hover:bg-cyan-500/[0.03] transition-all cursor-pointer group flex items-start gap-3 select-none"
          >
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <GitBranch className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">Hierarchy Studio</h4>
              <p className="text-[10px] text-white/40 leading-normal mt-0.5">Build species taxonomic subgroup branches and endpoint hierarchies.</p>
            </div>
          </motion.div>

          {/* Studio Card 2: QSAR */}
          <motion.div
            onClick={() => navigate('/qsar')}
            whileHover={{ scale: 1.02, x: 4 }}
            className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.01] hover:border-violet-500/20 hover:bg-violet-500/[0.03] transition-all cursor-pointer group flex items-start gap-3 select-none"
          >
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 flex items-center justify-center shrink-0">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white group-hover:text-violet-300 transition-colors">QSAR Studio</h4>
              <p className="text-[10px] text-white/40 leading-normal mt-0.5">Recover broken SMILES structures and compute modeling descriptor matrices.</p>
            </div>
          </motion.div>

          {/* Studio Card 3: Analytics */}
          <motion.div
            onClick={() => navigate('/analytics')}
            whileHover={{ scale: 1.02, x: 4 }}
            className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.01] hover:border-emerald-500/20 hover:bg-emerald-500/[0.03] transition-all cursor-pointer group flex items-start gap-3 select-none"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">Analytics Studio</h4>
              <p className="text-[10px] text-white/40 leading-normal mt-0.5">Explore distributions, check missing values, and view t-SNE clusters.</p>
            </div>
          </motion.div>
        </div>

      </div>

      {/* BOTTOM SOCIAL PROOF STRIP */}
      <div className="relative z-10 w-full border-t border-white/[0.04] bg-[#02050b]/80 backdrop-blur-md py-4 mt-auto">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-16 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-white/30">
            SUTRIX Platform Capabilities:
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] font-bold text-white/50">
            {[
              'Standardize scientific units',
              'Recover missing structures',
              'Generate 5000+ descriptors',
              'Validate OECD principles',
              'Build reproducible AI datasets',
              'Export publication-ready outputs',
            ].map(proof => (
              <span key={proof} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                {proof}
              </span>
            ))}
          </div>
        </div>
      </div>

    </section>
  );
};
export default HeroArea;
