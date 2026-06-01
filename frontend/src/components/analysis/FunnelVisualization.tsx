import React from 'react';
import { motion } from 'framer-motion';
import type { SimpleFunnelStep } from '../../services/simpleAnalysisApi';

interface FunnelVisualizationProps {
  steps: SimpleFunnelStep[];
  selectedStepId: string;
  onSelectStep: (id: string) => void;
}

export const FunnelVisualization: React.FC<FunnelVisualizationProps> = ({
  steps,
  selectedStepId,
  onSelectStep,
}) => {
  const maxRows = steps[0]?.row_count || 1;
  const heightPerStep = 65;
  const width = 600;
  const totalHeight = steps.length * heightPerStep + (steps.length - 1) * 8;

  // Let's compute coordinates for N trapezoids
  const trapezoids = steps.map((step, idx) => {
    const isSelected = step.id === selectedStepId;
    const currentRows = step.row_count;
    const nextRows = steps[idx + 1] ? steps[idx + 1].row_count : currentRows;

    const topWidth = (currentRows / maxRows) * 400 + 80;
    const bottomWidth = (nextRows / maxRows) * 400 + 80;

    const yStart = idx * (heightPerStep + 8);
    const yEnd = yStart + heightPerStep;

    const xTopLeft = (width - topWidth) / 2;
    const xTopRight = xTopLeft + topWidth;
    const xBottomLeft = (width - bottomWidth) / 2;
    const xBottomRight = xBottomLeft + bottomWidth;

    const path = `M ${xTopLeft} ${yStart} L ${xTopRight} ${yStart} L ${xBottomRight} ${yEnd} L ${xBottomLeft} ${yEnd} Z`;

    const colors = [
      'from-emerald-500/30 to-emerald-500/10 hover:from-emerald-500/40 hover:to-emerald-500/20 border-emerald-500/40',
      'from-cyan-500/30 to-cyan-500/10 hover:from-cyan-500/40 hover:to-cyan-500/20 border-cyan-500/40',
      'from-violet-500/30 to-violet-500/10 hover:from-violet-500/40 hover:to-violet-500/20 border-violet-500/40',
      'from-amber-500/30 to-amber-500/10 hover:from-amber-500/40 hover:to-amber-500/20 border-amber-500/40',
    ];
    const borderColors = [
      'stroke-emerald-400',
      'stroke-cyan-400',
      'stroke-violet-400',
      'stroke-amber-400'
    ];

    const idxColor = idx % colors.length;

    return {
      id: step.id,
      path,
      isSelected,
      gradientId: `funnel-grad-${idx}`,
      colorClass: colors[idxColor],
      borderColor: borderColors[idxColor],
      label: step.label,
      filterCol: step.filter_col,
      filterVal: step.filter_val,
      pctRetained: step.pct_retained,
      rows: step.row_count,
      compounds: step.unique_compounds,
      textY: yStart + heightPerStep / 2 + 4,
    };
  });

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-bold text-white mb-1 flex items-center justify-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          Interactive Data Reduction Funnel
        </h3>
        <p className="text-xs text-white/40 max-w-md mx-auto">
          Click any level to inspect statistical representations, distributions, and custom metrics.
        </p>
      </div>

      <div className="relative w-full max-w-[620px] bg-white/[0.01] border border-white/[0.03] p-6 rounded-3xl backdrop-blur-md overflow-hidden">
        <svg viewBox={`0 0 ${width} ${totalHeight}`} className="w-full h-auto overflow-visible">
          <defs>
            {trapezoids.map((t, idx) => (
              <linearGradient key={t.gradientId} id={t.gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={t.isSelected ? '#22d3ee' : '#38bdf8'} stopOpacity={t.isSelected ? 0.35 : 0.15} />
                <stop offset="100%" stopColor={t.isSelected ? '#a855f7' : '#1e1b4b'} stopOpacity={t.isSelected ? 0.15 : 0.02} />
              </linearGradient>
            ))}
          </defs>

          <g>
            {trapezoids.map((t, idx) => (
              <g
                key={t.id}
                className="cursor-pointer"
                onClick={() => onSelectStep(t.id)}
              >
                {/* SVG Trapezoid Shape */}
                <motion.path
                  d={t.path}
                  fill={`url(#${t.gradientId})`}
                  className={`${t.borderColor} transition-all duration-300`}
                  strokeWidth={t.isSelected ? 2 : 1}
                  strokeDasharray={t.isSelected ? '0' : '3,3'}
                  whileHover={{ scale: 1.01, filter: 'brightness(1.15)' }}
                />

                {/* Left Side Tag Label */}
                <text
                  x={30}
                  y={t.textY}
                  className={`text-[10px] font-bold tracking-wider text-left transition-colors duration-300
                    ${t.isSelected ? 'fill-cyan-400' : 'fill-white/40'}`}
                >
                  {idx === 0 ? 'START' : `STEP ${idx}`}
                </text>

                {/* Right Side % Retained */}
                {idx > 0 && (
                  <text
                    x={width - 30}
                    y={t.textY}
                    textAnchor="end"
                    className={`text-[10px] font-mono font-bold tracking-wider transition-colors duration-300
                      ${t.isSelected ? 'fill-emerald-400' : 'fill-emerald-400/60'}`}
                  >
                    {t.pctRetained}%
                  </text>
                )}

                {/* Center Content Label */}
                <text
                  x={width / 2}
                  y={t.textY - 6}
                  textAnchor="middle"
                  className={`text-xs font-bold transition-colors duration-300
                    ${t.isSelected ? 'fill-white' : 'fill-white/80'}`}
                >
                  {idx === 0 ? 'Full Ingested Dataset' : `${t.filterCol} = ${t.filterVal}`}
                </text>

                {/* Center Subtext (Row & Compounds Count) */}
                <text
                  x={width / 2}
                  y={t.textY + 10}
                  textAnchor="middle"
                  className={`text-[9px] transition-colors duration-300
                    ${t.isSelected ? 'fill-cyan-300/80 font-semibold' : 'fill-white/30'}`}
                >
                  {t.rows.toLocaleString()} rows · {t.compounds.toLocaleString()} unique
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
};
