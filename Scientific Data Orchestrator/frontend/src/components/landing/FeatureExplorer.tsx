import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, FlaskConical, BarChart3, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface StudioCardProps {
  title: string;
  desc: string;
  color: string;
  icon: React.ReactNode;
  features: string[];
  animationComponent: React.ReactNode;
  onClick: () => void;
}

const StudioCard: React.FC<StudioCardProps> = ({ title, desc, color, icon, features, animationComponent, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  const colorMap: Record<string, { text: string, border: string, bg: string, glow: string }> = {
    cyan: { text: 'text-cyan-400', border: 'border-cyan-500/20', bg: 'bg-cyan-500/5', glow: 'shadow-[0_0_30px_rgba(6,182,212,0.15)]' },
    violet: { text: 'text-violet-400', border: 'border-violet-500/20', bg: 'bg-violet-500/5', glow: 'shadow-[0_0_30px_rgba(139,92,246,0.15)]' },
    emerald: { text: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', glow: 'shadow-[0_0_30px_rgba(16,185,129,0.15)]' },
  };

  const style = colorMap[color] || colorMap.cyan;

  return (
    <motion.div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      whileHover={{ y: -6 }}
      className={`relative flex flex-col p-6 rounded-2xl border ${style.border} ${style.bg} hover:border-${color}-500/40 hover:bg-${color}-500/[0.08] transition-all cursor-pointer group select-none ${isHovered ? style.glow : ''}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/10 ${style.text}`}>
          {icon}
        </div>
        <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/80 group-hover:translate-x-0.5 transition-all" />
      </div>

      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/50 leading-relaxed mb-6">{desc}</p>

      {/* Interactive Animation Placeholder Area */}
      <div className="h-40 w-full rounded-xl bg-slate-950/60 border border-white/[0.05] mb-6 overflow-hidden flex items-center justify-center relative">
        {animationComponent}
      </div>

      <div className="mt-auto space-y-2">
        <div className="text-[10px] font-black uppercase tracking-wider text-white/30">Key Features</div>
        <ul className="grid grid-cols-2 gap-2">
          {features.map(f => (
            <li key={f} className="flex items-center gap-1.5 text-xs text-white/70">
              <span className={`w-1 h-1 rounded-full bg-${color}-400 flex-shrink-0`} />
              <span className="truncate">{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
};

// Animation component 1: Hierarchy Tree splitting
const HierarchyTreeAnimation: React.FC = () => {
  return (
    <svg className="w-full h-32" viewBox="0 0 200 120">
      {/* Root Node */}
      <motion.circle cx="100" cy="20" r="6" fill="#22d3ee" />
      
      {/* Branch Lines */}
      <motion.path 
        d="M 100 20 L 50 60 M 100 20 L 150 60" 
        stroke="rgba(34, 211, 238, 0.4)" 
        strokeWidth="1.5" 
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse" }}
      />
      
      {/* Subgroups Level 1 */}
      <motion.circle cx="50" cy="60" r="5" fill="#22d3ee" />
      <motion.circle cx="150" cy="60" r="5" fill="#22d3ee" />

      {/* Branch Lines Level 2 */}
      <motion.path 
        d="M 50 60 L 25 100 M 50 60 L 75 100 M 150 60 L 125 100 M 150 60 L 175 100" 
        stroke="rgba(34, 211, 238, 0.4)" 
        strokeWidth="1" 
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.8, delay: 0.2, repeat: Infinity, repeatType: "reverse" }}
      />

      {/* Subgroups Level 2 */}
      <motion.circle cx="25" cy="100" r="4" fill="#0891b2" />
      <motion.circle cx="75" cy="100" r="4" fill="#0891b2" />
      <motion.circle cx="125" cy="100" r="4" fill="#0891b2" />
      <motion.circle cx="175" cy="100" r="4" fill="#0891b2" />

      {/* Moving Data Packets */}
      <motion.circle 
        cx="100" 
        cy="20" 
        r="3" 
        fill="#ffffff"
        animate={{ 
          cx: [100, 50, 25], 
          cy: [20, 60, 100] 
        }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle 
        cx="100" 
        cy="20" 
        r="3" 
        fill="#ffffff"
        animate={{ 
          cx: [100, 150, 175], 
          cy: [20, 60, 100] 
        }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
      />
    </svg>
  );
};

// Animation component 2: Molecular Ring / Calculations
const QSARMolecularAnimation: React.FC = () => {
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Rotating Benzene Ring */}
      <motion.svg 
        className="w-24 h-24 text-violet-400" 
        viewBox="0 0 100 100"
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      >
        {/* Hexagon */}
        <polygon points="50,15 80,32 80,68 50,85 20,68 20,32" fill="none" stroke="currentColor" strokeWidth="2" />
        {/* Inside double bonds */}
        <line x1="48" y1="21" x2="74" y2="36" stroke="currentColor" strokeWidth="1.5" />
        <line x1="77" y1="65" x2="50" y2="80" stroke="currentColor" strokeWidth="1.5" />
        <line x1="23" y1="65" x2="23" y2="35" stroke="currentColor" strokeWidth="1.5" />
      </motion.svg>

      {/* Calculating indicator */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <motion.div 
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-[9px] font-mono text-violet-300 uppercase tracking-widest bg-violet-950/70 border border-violet-500/20 px-2 py-0.5 rounded-full"
        >
          DESCRIPTORS: 5,420
        </motion.div>
      </div>

      {/* Dynamic calculation particles */}
      <motion.div 
        className="absolute w-1.5 h-1.5 rounded-full bg-violet-400"
        animate={{ 
          x: [0, 40, -30, 0], 
          y: [-20, 30, 10, -20],
          scale: [0.5, 1.2, 0.8, 0.5] 
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div 
        className="absolute w-1 h-1 rounded-full bg-indigo-400"
        animate={{ 
          x: [0, -35, 45, 0], 
          y: [20, -10, -30, 20],
          scale: [1, 0.6, 1.2, 1] 
        }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
    </div>
  );
};

// Animation component 3: Analytics Scatter Plot (t-SNE/UMAP) points floating
const AnalyticsPlotAnimation: React.FC = () => {
  return (
    <svg className="w-full h-32" viewBox="0 0 200 120">
      {/* Grid Lines */}
      <line x1="20" y1="100" x2="180" y2="100" stroke="rgba(255,255,255,0.05)" />
      <line x1="20" y1="20" x2="20" y2="100" stroke="rgba(255,255,255,0.05)" />
      
      {/* Cluster 1: Green points */}
      {[[50, 40], [65, 30], [55, 55], [75, 45], [40, 50]].map((p, idx) => (
        <motion.circle
          key={`c1-${idx}`}
          cx={p[0]}
          cy={p[1]}
          r="3"
          fill="#10b981"
          animate={{
            cx: [p[0], p[0] + (Math.random() - 0.5) * 8, p[0]],
            cy: [p[1], p[1] + (Math.random() - 0.5) * 8, p[1]]
          }}
          transition={{ duration: 3 + idx, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* Cluster 2: Blue points */}
      {[[130, 80], [145, 90], [155, 75], [125, 70], [140, 60]].map((p, idx) => (
        <motion.circle
          key={`c2-${idx}`}
          cx={p[0]}
          cy={p[1]}
          r="3"
          fill="#3b82f6"
          animate={{
            cx: [p[0], p[0] + (Math.random() - 0.5) * 8, p[0]],
            cy: [p[1], p[1] + (Math.random() - 0.5) * 8, p[1]]
          }}
          transition={{ duration: 4 + idx, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* Centroid connecting line */}
      <motion.line 
        x1="57" y1="44" x2="139" y2="75" 
        stroke="rgba(255, 255, 255, 0.1)" 
        strokeWidth="1.5"
        strokeDasharray="4,4"
        animate={{ opacity: [0.2, 0.6, 0.2] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </svg>
  );
};

export const FeatureExplorer: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="py-24 px-6 bg-[#020610] border-b border-white/[0.04]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/[0.08] border border-violet-500/20 text-xs font-semibold text-violet-400 mb-5">
            What Can SUTRIX Do?
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Interactive Feature Explorer
          </h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">
            Standardize molecular data, group properties, run analytics, and generate OECD checklists in specialized workspaces.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StudioCard
            title="Hierarchy Studio"
            desc="Build and segregates toxicological subgroup matrices. Map endpoints, biological classes, and exposure variables."
            color="cyan"
            icon={<GitBranch className="w-6 h-6" />}
            features={['automatic subgrouping', 'branch merging', 'segregation analysis', 'hierarchy exports']}
            animationComponent={<HierarchyTreeAnimation />}
            onClick={() => navigate('/hierarchy')}
          />

          <StudioCard
            title="QSAR Studio"
            desc="Construct modeling-ready QSAR datasets. Perform structural cleaning, calculate properties, and run AI evaluations."
            color="violet"
            icon={<FlaskConical className="w-6 h-6" />}
            features={['structure recovery', 'descriptor generation', 'feature optimization', 'OECD & AI readiness']}
            animationComponent={<QSARMolecularAnimation />}
            onClick={() => navigate('/qsar')}
          />

          <StudioCard
            title="Analytics Studio"
            desc="Inspect chemical clusters and distributions. Explore PCA, correlation matrices, and missing values dynamically."
            color="emerald"
            icon={<BarChart3 className="w-6 h-6" />}
            features={['PCA dimensionality', 't-SNE & UMAP plots', 'value distributions', 'missingness profiles']}
            animationComponent={<AnalyticsPlotAnimation />}
            onClick={() => navigate('/analytics')}
          />
        </div>
      </div>
    </section>
  );
};
