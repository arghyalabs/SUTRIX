import React from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export const DatasetModeBadge: React.FC = () => {
  const { datasetMode } = useWorkspaceStore();

  const config = {
    MOLECULAR: {
      text: '⚗ Molecular Mode',
      style: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.05)]',
    },
    SCIENTIFIC: {
      text: '📊 Scientific Mode',
      style: 'bg-violet-500/10 border-violet-500/20 text-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.05)]',
    },
    HYBRID: {
      text: '🧬 Hybrid Mode',
      style: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.05)]',
    },
    GENERIC: {
      text: '📁 Generic Mode',
      style: 'bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.05)]',
    },
    RECOVERABLE: {
      text: '⚠️ Recoverable Mode',
      style: 'bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.05)]',
    }
  };

  const badge = config[datasetMode] || config.GENERIC;

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold border uppercase tracking-wider inline-flex items-center gap-1 ${badge.style}`}>
      {badge.text}
    </span>
  );
};
