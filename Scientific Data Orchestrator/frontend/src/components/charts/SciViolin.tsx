/**
 * SciViolin — pure SVG violin plot with box, whiskers, and jitter strip.
 * Used in DistributionPanel for multi-column shape comparison.
 */
import React, { useMemo, useState } from 'react';
import { SCI_COLORS, SCI_FONT, SCI_GEOMETRY } from './chartTheme';

export interface ViolinStats {
  label: string;
  /** All individual values (for jitter) */
  values: number[];
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  /** KDE points: array of [x_value, density] pairs */
  kde?: Array<[number, number]>;
  color?: string;
}

interface SciViolinProps {
  series: ViolinStats[];
  height?: number;
  width?: number;
  showJitter?: boolean;
  showBox?: boolean;
  yLabel?: string;
  selectedItem?: any;
  hoveredItem?: any;
  onHoverItem?: (item: any | null) => void;
  isFullscreen?: boolean;
}

const VIOLIN_W = 56; // px per violin
const PADDING_X = 32;
const PADDING_Y = 28;
const JITTER_W = 10; // max jitter displacement in px

export const SciViolin: React.FC<SciViolinProps> = ({
  series,
  height = 300,
  width,
  showJitter = true,
  showBox = true,
  yLabel,
  selectedItem,
  hoveredItem,
  onHoverItem,
  isFullscreen,
}) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const selectedIdx = useMemo(() => {
    if (!selectedItem) return null;
    return series.findIndex(s => s.label === selectedItem.label);
  }, [selectedItem, series]);

  const hoveredIdxFromProp = useMemo(() => {
    if (!hoveredItem) return null;
    return series.findIndex(s => s.label === hoveredItem.label);
  }, [hoveredItem, series]);

  const totalW = width ?? Math.max(300, series.length * (VIOLIN_W + 16) + PADDING_X * 2);
  const plotH = height - PADDING_Y * 2;

  // Global Y range
  const allVals = series.flatMap(s => s.values);
  const globalMin = Math.min(...allVals);
  const globalMax = Math.max(...allVals);
  const range = globalMax - globalMin || 1;

  const toY = (v: number) => PADDING_Y + (1 - (v - globalMin) / range) * plotH;

  // Y axis ticks
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    globalMin + (i / (tickCount - 1)) * range
  );

  return (
    <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <svg
        width={totalW}
        height={height}
        style={{ display: 'block', fontFamily: SCI_FONT.mono }}
      >
        {/* Y axis */}
        <line
          x1={PADDING_X}
          y1={PADDING_Y}
          x2={PADDING_X}
          y2={PADDING_Y + plotH}
          stroke={SCI_GEOMETRY.axisStroke}
          strokeWidth={1}
        />

        {/* Y axis ticks + labels */}
        {ticks.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line
                x1={PADDING_X - 4}
                y1={y}
                x2={totalW - 8}
                y2={y}
                stroke={SCI_GEOMETRY.gridStroke}
                strokeWidth={1}
              />
              <text
                x={PADDING_X - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={8}
                fill={SCI_GEOMETRY.tickFill}
              >
                {v.toFixed(v > 100 ? 0 : 2)}
              </text>
            </g>
          );
        })}

        {/* Y axis label */}
        {yLabel && (
          <text
            x={10}
            y={PADDING_Y + plotH / 2}
            textAnchor="middle"
            fontSize={9}
            fill={SCI_GEOMETRY.labelFill}
            transform={`rotate(-90, 10, ${PADDING_Y + plotH / 2})`}
            fontFamily="'Inter', sans-serif"
            letterSpacing="0.08em"
            style={{ textTransform: 'uppercase' }}
          >
            {yLabel}
          </text>
        )}

        {/* Violins */}
        {series.map((s, si) => {
          const cx = PADDING_X + 32 + si * (VIOLIN_W + 16);
          const isSelected = selectedIdx === si;
          const isHoveredFromProp = hoveredIdxFromProp === si;
          const color = isSelected ? '#22D3EE' : isHoveredFromProp ? '#F43F5E' : (s.color || SCI_COLORS[si % SCI_COLORS.length]);
          const isHov = hovered === si || isHoveredFromProp || isSelected;

          // Build violin path from KDE
          let violinPath = '';
          if (s.kde && s.kde.length > 1) {
            const maxDensity = Math.max(...s.kde.map(([, d]) => d));
            const halfW = (VIOLIN_W / 2) * 0.9;
            const mirror = (density: number) => (density / maxDensity) * halfW;

            const right = s.kde.map(([v, d]) => ({ x: cx + mirror(d), y: toY(v) }));
            const left = [...s.kde].reverse().map(([v, d]) => ({ x: cx - mirror(d), y: toY(v) }));

            const pts = [...right, ...left];
            violinPath = pts
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(' ') + ' Z';
          }

          // Jitter points
          const jitterPts = showJitter
            ? s.values.map(v => ({
                y: toY(v),
                x: cx + (Math.random() - 0.5) * JITTER_W,
              }))
            : [];

          const q1Y = toY(s.q1);
          const q3Y = toY(s.q3);
          const medY = toY(s.median);
          const minY = toY(s.min);
          const maxY = toY(s.max);

          return (
            <g
              key={si}
              onMouseEnter={() => {
                setHovered(si);
                if (onHoverItem) onHoverItem(s);
              }}
              onMouseLeave={() => {
                setHovered(null);
                if (onHoverItem) onHoverItem(null);
              }}
            >
              {/* Violin body */}
              {violinPath && (
                <path
                  d={violinPath}
                  fill={color + (isHov ? '30' : '18')}
                  stroke={color}
                  strokeWidth={1}
                  style={{ transition: 'fill 0.15s' }}
                />
              )}

              {/* Whiskers */}
              {showBox && (
                <>
                  <line x1={cx} y1={minY} x2={cx} y2={q1Y}
                    stroke={color} strokeWidth={1} opacity={0.5} />
                  <line x1={cx} y1={q3Y} x2={cx} y2={maxY}
                    stroke={color} strokeWidth={1} opacity={0.5} />
                  {/* Min/max caps */}
                  <line x1={cx - 6} y1={minY} x2={cx + 6} y2={minY}
                    stroke={color} strokeWidth={1} opacity={0.5} />
                  <line x1={cx - 6} y1={maxY} x2={cx + 6} y2={maxY}
                    stroke={color} strokeWidth={1} opacity={0.5} />

                  {/* IQR box */}
                  <rect
                    x={cx - 8}
                    y={q3Y}
                    width={16}
                    height={q1Y - q3Y}
                    fill={color + '22'}
                    stroke={color}
                    strokeWidth={1}
                  />

                  {/* Median line */}
                  <line x1={cx - 8} y1={medY} x2={cx + 8} y2={medY}
                    stroke={color} strokeWidth={2} />
                </>
              )}

              {/* Jitter strip */}
              {jitterPts.map((p, pi) => (
                <circle
                  key={pi}
                  cx={p.x}
                  cy={p.y}
                  r={1.2}
                  fill={color}
                  opacity={0.3}
                  style={{ pointerEvents: 'none' }}
                />
              ))}

              {/* X label */}
              <text
                x={cx}
                y={height - 6}
                textAnchor="middle"
                fontSize={9}
                fill={isHov ? '#F1F5F9' : SCI_GEOMETRY.tickFill}
                style={{ transition: 'fill 0.1s' }}
              >
                {s.label.length > 10 ? s.label.slice(0, 9) + '…' : s.label}
              </text>

              {/* Hover stats tooltip */}
              {!isFullscreen && isHov && (
                <g>
                  <rect
                    x={cx + VIOLIN_W / 2 - 2}
                    y={PADDING_Y}
                    width={88}
                    height={80}
                    rx={3}
                    fill="rgba(5,8,22,0.96)"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1}
                  />
                  {[
                    { label: 'med', value: s.median.toFixed(3) },
                    { label: 'q1', value: s.q1.toFixed(3) },
                    { label: 'q3', value: s.q3.toFixed(3) },
                    { label: 'min', value: s.min.toFixed(3) },
                    { label: 'max', value: s.max.toFixed(3) },
                  ].map((stat, i) => (
                    <text key={i} x={cx + VIOLIN_W / 2 + 4} y={PADDING_Y + 12 + i * 13} fontSize={8} fontFamily={SCI_FONT.mono}>
                      <tspan fill="#64748B">{stat.label} </tspan>
                      <tspan fill={color} fontWeight={600}>{stat.value}</tspan>
                    </text>
                  ))}
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
