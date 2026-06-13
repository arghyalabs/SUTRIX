import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GitBranch, FlaskConical, BarChart3, ChevronRight } from 'lucide-react';

interface LauncherDef {
  id: string;
  name: string;
  desc: string;
  path: string;
  color: string;
  icon: React.ReactNode;
}

const LAUNCHERS: LauncherDef[] = [
  {
    id: 'hierarchy',
    name: 'Hierarchy Studio',
    desc: 'Map variable schemas, run segregation profiles, and construct taxonomic datasets.',
    path: '/hierarchy',
    color: 'cyan',
    icon: <GitBranch className="w-6 h-6 text-cyan-400" />,
  },
  {
    id: 'qsar',
    name: 'QSAR Studio',
    desc: 'Perform compound structure cleanup, recover missing compounds, and calculate 2D/3D descriptors.',
    path: '/qsar',
    color: 'violet',
    icon: <FlaskConical className="w-6 h-6 text-violet-400" />,
  },
  {
    id: 'analytics',
    name: 'Analytics Studio',
    desc: 'Profile missing data structures, t-SNE projections, distribution histograms, and correlations.',
    path: '/analytics',
    color: 'emerald',
    icon: <BarChart3 className="w-6 h-6 text-emerald-400" />,
  },
];

export const LaunchWorkspace: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="py-28 px-6 bg-[#020610] text-center border-b border-white/[0.04]">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="space-y-4 mb-16"
        >
          <h2 className="text-4xl font-extrabold text-white">Start Building Immediately</h2>
          <p className="text-white/40 text-base max-w-xl mx-auto">
            Choose a workspace to launch below. Your project workspace is initialized automatically, preserving active sessions.
          </p>
        </motion.div>

        {/* Large cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {LAUNCHERS.map((launcher, index) => {
            const borderColors: Record<string, string> = {
              cyan: 'hover:border-cyan-500/30 hover:bg-cyan-500/[0.03]',
              violet: 'hover:border-violet-500/30 hover:bg-violet-500/[0.03]',
              emerald: 'hover:border-emerald-500/30 hover:bg-emerald-500/[0.03]',
            };

            return (
              <motion.div
                key={launcher.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
                onClick={() => navigate(launcher.path)}
                className={`flex flex-col justify-between p-6 rounded-3xl border border-white/[0.06] bg-white/[0.01] transition-all cursor-pointer group text-left h-72 ${
                  borderColors[launcher.color] || borderColors.cyan
                }`}
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-6">
                    {launcher.icon}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2 leading-none group-hover:text-cyan-300 transition-colors">
                    {launcher.name}
                  </h3>
                  <p className="text-xs text-white/50 leading-relaxed">{launcher.desc}</p>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-400 mt-4 group-hover:translate-x-0.5 transition-transform">
                  Launch Studio
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
