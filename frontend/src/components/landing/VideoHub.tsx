import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X, Film, Activity, GitBranch, FlaskConical, BarChart3, HelpCircle } from 'lucide-react';

interface VideoDef {
  id: string;
  title: string;
  duration: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  animationComponent: React.ReactNode;
}

// Mock Video Animations for the Player Modal
const GettingStartedWalkthrough: React.FC = () => (
  <div className="w-full h-full bg-[#050b18] flex flex-col justify-between p-6 relative">
    <div className="text-white/30 text-[10px] font-mono">$ cat sutrix_introduction.txt</div>
    <div className="space-y-4 my-auto">
      <motion.div 
        animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 3, repeat: Infinity }}
        className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/20 mx-auto flex items-center justify-center text-cyan-400"
      >
        <Film className="w-8 h-8" />
      </motion.div>
      <div className="text-center">
        <div className="text-white font-bold text-sm">Welcome to SUTRIX V5</div>
        <p className="text-white/40 text-xs mt-1">Connecting Data, Taxonomy & QSAR structures</p>
      </div>
    </div>
    <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
      <motion.div 
        className="bg-cyan-500 h-full"
        animate={{ width: ['0%', '100%'] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  </div>
);

const HierarchyWalkthrough: React.FC = () => (
  <div className="w-full h-full bg-[#050b18] flex flex-col justify-between p-6">
    <div className="text-white/30 text-[10px] font-mono">$ py create_taxonomy.py</div>
    <div className="my-auto space-y-3">
      {/* Animated nodes branching */}
      <div className="flex justify-center items-center gap-6">
        <motion.div 
          animate={{ y: [-5, 5, -5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="p-2.5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 text-cyan-400 text-xs font-bold"
        >
          Raw Data
        </motion.div>
        <div className="text-white/20">→</div>
        <motion.div 
          animate={{ y: [5, -5, 5] }}
          transition={{ duration: 2.2, repeat: Infinity }}
          className="p-2.5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 text-cyan-400 text-xs font-bold"
        >
          3 Taxons
        </motion.div>
      </div>
    </div>
    <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
      <motion.div 
        className="bg-cyan-500 h-full"
        animate={{ width: ['0%', '100%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  </div>
);

const QSARWalkthrough: React.FC = () => (
  <div className="w-full h-full bg-[#050b18] flex flex-col justify-between p-6">
    <div className="text-white/30 text-[10px] font-mono">$ py calc_descriptors.py</div>
    <div className="my-auto text-center space-y-2">
      {/* Animated Benzene ring rotating */}
      <motion.div 
        className="w-12 h-12 border border-violet-500/30 rounded-xl mx-auto flex items-center justify-center text-violet-400"
        animate={{ rotate: 360 }}
        transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
      >
        ⎔
      </motion.div>
      <div className="text-xs text-white/50 font-mono">1,240 Mordred features generated</div>
    </div>
    <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
      <motion.div 
        className="bg-violet-500 h-full"
        animate={{ width: ['0%', '100%'] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  </div>
);

const AnalyticsWalkthrough: React.FC = () => (
  <div className="w-full h-full bg-[#050b18] flex flex-col justify-between p-6">
    <div className="text-white/30 text-[10px] font-mono">$ py plot_clusters.py</div>
    <div className="my-auto flex justify-center items-center gap-1.5 h-12">
      {/* Animated loading chart bars */}
      {[25, 45, 15, 60, 30].map((h, i) => (
        <motion.div
          key={i}
          className="w-2.5 bg-emerald-500/40 border border-emerald-500/60 rounded-t"
          animate={{ height: [`${h}%`, `${Math.min(100, h * 1.5)}%`, `${h}%`] }}
          transition={{ duration: 1.5 + i * 0.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
    <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
      <motion.div 
        className="bg-emerald-500 h-full"
        animate={{ width: ['0%', '100%'] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  </div>
);

const VIDEOS: VideoDef[] = [
  {
    id: 'start',
    title: 'Getting Started Walkthrough',
    duration: '2:15',
    desc: 'An overview of the SUTRIX scientific ecosystem and database architecture.',
    icon: <Film className="w-5 h-5 text-cyan-400" />,
    color: 'cyan',
    animationComponent: <GettingStartedWalkthrough />,
  },
  {
    id: 'hier',
    title: 'Hierarchy Studio Curation',
    duration: '3:40',
    desc: 'How to build subgroup taxons and run taxonomic segregation indices.',
    icon: <GitBranch className="w-5 h-5 text-cyan-400" />,
    color: 'cyan',
    animationComponent: <HierarchyWalkthrough />,
  },
  {
    id: 'qsar',
    title: 'QSAR Studio Engineering',
    duration: '4:10',
    desc: 'Standardizing SMILES structures and calculating high-dimensional molecular descriptors.',
    icon: <FlaskConical className="w-5 h-5 text-violet-400" />,
    color: 'violet',
    animationComponent: <QSARWalkthrough />,
  },
  {
    id: 'analytics',
    title: 'Analytics Studio Explorer',
    duration: '3:05',
    desc: 'Dimensionality reductions, PCA variance curves, and profiling variable distributions.',
    icon: <BarChart3 className="w-5 h-5 text-emerald-400" />,
    color: 'emerald',
    animationComponent: <AnalyticsWalkthrough />,
  },
];

export const VideoHub: React.FC = () => {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  const activeVideo = VIDEOS.find(v => v.id === selectedVideoId);

  return (
    <section className="py-24 px-6 bg-[#020610] border-b border-white/[0.04]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 text-xs font-semibold text-cyan-400 mb-5">
            <Film className="w-3.5 h-3.5" />
            Video Tutorial Hub
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Visual Learning Center
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            Click into our step-by-step video tutorials below to review platform integrations.
          </p>
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {VIDEOS.map(video => (
            <motion.div
              key={video.id}
              onClick={() => setSelectedVideoId(video.id)}
              whileHover={{ scale: 1.02, y: -4 }}
              className="group flex flex-col justify-between p-5 rounded-2xl border border-white/[0.06] bg-white/[0.01] hover:border-cyan-500/20 hover:bg-cyan-500/[0.02] cursor-pointer transition-all h-72"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.03] border border-white/10 flex items-center justify-center">
                    {video.icon}
                  </div>
                  <span className="text-[10px] text-white/30 font-mono">{video.duration}</span>
                </div>

                <h3 className="text-sm font-bold text-white mb-2 leading-snug group-hover:text-cyan-300 transition-colors">
                  {video.title}
                </h3>
                <p className="text-xs text-white/40 leading-relaxed">{video.desc}</p>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-cyan-400 mt-4">
                <Play className="w-3.5 h-3.5 fill-current" />
                Play Walkthrough
              </div>
            </motion.div>
          ))}
        </div>

        {/* Video Player Overlay Modal */}
        <AnimatePresence>
          {activeVideo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-xl rounded-3xl bg-[#090e1a] border border-white/[0.08] shadow-2xl overflow-hidden"
              >
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-slate-950/40">
                  <div className="flex items-center gap-2.5">
                    {activeVideo.icon}
                    <span className="font-extrabold text-white text-xs">{activeVideo.title}</span>
                  </div>
                  <button
                    onClick={() => setSelectedVideoId(null)}
                    className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Animated video screen */}
                <div className="h-72 w-full border-b border-white/[0.04] relative">
                  {activeVideo.animationComponent}
                </div>

                {/* Controller footer bar */}
                <div className="px-6 py-4 bg-slate-950/40 flex items-center justify-between text-xs text-white/30 font-mono">
                  <div className="flex items-center gap-4">
                    <span className="text-cyan-400">▶ PLAYING</span>
                    <span>HD 1080p</span>
                  </div>
                  <button
                    onClick={() => setSelectedVideoId(null)}
                    className="px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all font-sans font-bold text-[10px]"
                  >
                    Close Player
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
