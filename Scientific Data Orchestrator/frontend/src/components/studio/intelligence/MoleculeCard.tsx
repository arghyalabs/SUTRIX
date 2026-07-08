import React, { useState } from 'react';

interface MoleculeCardProps {
  smiles: string;
  apiBase: string;
  label?: string;
  sublabel?: string;
  activityValue?: number | null;
  activityUnit?: string;
  adStatus?: 'inside' | 'outside' | 'borderline' | null;
  highlightAtoms?: number[];
  width?: number;
  height?: number;
  onClick?: () => void;
  compact?: boolean;  // compact=true: smaller card with less padding
}

export const MoleculeCard: React.FC<MoleculeCardProps> = ({
  smiles,
  apiBase,
  label,
  sublabel,
  activityValue,
  activityUnit = 'pIC₅₀',
  adStatus,
  highlightAtoms = [],
  width = 200,
  height = 150,
  onClick,
  compact = false,
}) => {
  const [imgError, setImgError] = useState(false);

  const highlightParam = highlightAtoms.length > 0
    ? `&highlight_atoms=${highlightAtoms.join(',')}`
    : '';

  const src = smiles && !imgError
    ? `${apiBase}/api/render/structure?smiles=${encodeURIComponent(smiles)}&width=${width}&height=${height}${highlightParam}`
    : '';

  const adColors = {
    inside: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    outside: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    borderline: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-rose-500/20 transition-all
        ${onClick ? 'cursor-pointer' : ''} ${compact ? 'p-2' : 'p-3'}`}
    >
      {/* Structure image */}
      <div className={`flex items-center justify-center bg-white/[0.03] rounded-lg overflow-hidden
        ${compact ? 'h-20 mb-1.5' : 'h-28 mb-2'}`}>
        {src ? (
          <img
            src={src}
            alt={label || 'Molecule structure'}
            className="max-w-full max-h-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="text-[10px] text-slate-600 font-mono text-center px-2">
            {!smiles ? 'No SMILES' : 'Render failed'}
          </div>
        )}
      </div>

      {/* Labels */}
      {label && (
        <div className={`font-semibold text-white truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {label}
        </div>
      )}
      {sublabel && (
        <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{sublabel}</div>
      )}

      {/* Activity value */}
      {activityValue !== null && activityValue !== undefined && (
        <div className={`font-black text-white ${compact ? 'text-xs mt-0.5' : 'text-sm mt-1'}`}>
          {activityValue.toFixed(3)}
          <span className="text-[9px] text-slate-500 font-normal ml-1">{activityUnit}</span>
        </div>
      )}

      {/* AD status badge */}
      {adStatus && (
        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wide mt-1 ${adColors[adStatus]}`}>
          {adStatus === 'inside' ? '✓ In AD' : adStatus === 'outside' ? '✗ Outside AD' : '~ Borderline'}
        </div>
      )}
    </div>
  );
};
