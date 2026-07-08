/**
 * SciHistogram — scientific histogram with KDE overlay.
 * Flush bins (no gap), KDE line, mean/±σ reference lines.
 * Pure responsive SVG component using ResizeObserver for distortion-free typography.
 */
import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  SCI_COLORS, SCI_FONT, SCI_GEOMETRY,
} from './chartTheme';

export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
  density?: number;
  kde?: number;
}

interface SciHistogramProps {
  bins: HistogramBin[];
  mode?: 'count' | 'density';
  showKDE?: boolean;
  mean?: number;
  std?: number;
  normalKDE?: Array<{ x: number; y: number }>;
  height?: number;
  color?: string;
  xLabel?: string;
  yLabel?: string;
  selectedItem?: any;
  hoveredItem?: any;
  onHoverItem?: (item: any | null) => void;
  isFullscreen?: boolean;
}

export const SciHistogram: React.FC<SciHistogramProps> = ({
  bins,
  mode = 'count',
  showKDE = true,
  mean,
  std,
  normalKDE,
  height = 260,
  color = SCI_COLORS[0],
  xLabel,
  yLabel,
  selectedItem,
  hoveredItem,
  onHoverItem,
  isFullscreen,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600); // default width until observer fires

  // Track parent width dynamically to draw text/rects at exact pixel values
  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const valueKey = mode === 'density' ? 'density' : 'count';

  // Map selectedItem and hoveredItem from parent explorer table to bins
  const selectedIdx = useMemo(() => {
    if (!selectedItem) return null;
    return bins.findIndex(b => Math.abs(b.x0 - selectedItem.x0) < 0.00001 && Math.abs(b.x1 - selectedItem.x1) < 0.00001);
  }, [selectedItem, bins]);

  const hoveredIdxFromProp = useMemo(() => {
    if (!hoveredItem) return null;
    return bins.findIndex(b => Math.abs(b.x0 - hoveredItem.x0) < 0.00001 && Math.abs(b.x1 - hoveredItem.x1) < 0.00001);
  }, [hoveredItem, bins]);

  // Find min/max values
  const { minX, maxX, maxY } = useMemo(() => {
    if (bins.length === 0) return { minX: 0, maxX: 1, maxY: 1 };
    const min = Math.min(...bins.map(b => b.x0));
    const max = Math.max(...bins.map(b => b.x1));
    const maxVal = Math.max(...bins.map(b => b[valueKey] ?? 0), 1);
    return { minX: min, maxX: max, maxY: maxVal };
  }, [bins, valueKey]);

  const rangeX = maxX - minX || 1;

  // Layout geometry with margins
  const paddingLeft = 55;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 40;
  const plotW = Math.max(100, width - paddingLeft - paddingRight);
  const plotH = Math.max(50, height - paddingTop - paddingBottom);

  const toX = (v: number) => paddingLeft + ((v - minX) / rangeX) * plotW;
  const toY = (v: number) => paddingTop + plotH - (v / maxY) * plotH;

  // Trigger tooltip positioning based on prop hover
  useEffect(() => {
    if (hoveredIdxFromProp !== null && bins[hoveredIdxFromProp]) {
      const idx = hoveredIdxFromProp;
      const b = bins[idx];
      const bx0 = toX(b.x0);
      const bx1 = toX(b.x1);
      const bw = bx1 - bx0;
      const by = toY(b[valueKey] ?? 0);
      setTooltipPos({
        x: bx0 + bw / 2,
        y: by - 8,
      });
    }
  }, [hoveredIdxFromProp, bins, valueKey, width]);

  // Generate ticks exactly at bin boundaries
  const ticks = useMemo(() => {
    if (bins.length === 0) return [];
    const boundaries = [bins[0].x0, ...bins.map(b => b.x1)];
    // Filter to show at most 6 ticks to prevent overlap
    const step = Math.max(1, Math.ceil(boundaries.length / 6));
    return boundaries.filter((_, i) => i % step === 0 || i === boundaries.length - 1);
  }, [bins]);

  // Generate 4 horizontal grid lines
  const yTicks = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => (maxY / 3) * i);
  }, [maxY]);

  // Theoretical Normal PDF Line Path
  const normalKdePath = useMemo(() => {
    if (!normalKDE || normalKDE.length === 0 || bins.length === 0) return '';
    
    // Scale normal PDF density to count if mode is count
    const totalCount = bins.reduce((acc, b) => acc + b.count, 0);
    const binWidth = bins[0] ? (bins[0].x1 - bins[0].x0) : 1;
    const scaleFactor = mode === 'count' ? (totalCount * binWidth) : 1.0;

    const points = normalKDE
      .filter(pt => pt.x >= minX && pt.x <= maxX)
      .map(pt => {
        const scaledY = pt.y * scaleFactor;
        return `${toX(pt.x).toFixed(1)},${toY(scaledY).toFixed(1)}`;
      });
    return points.length > 0 ? `M ${points.join(' L ')}` : '';
  }, [normalKDE, mode, bins, minX, maxX, maxY, width]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height }}>
      <svg
        width={width}
        height={height}
        style={{ display: 'block', overflow: 'visible', background: 'transparent' }}
      >
        {/* Horizontal Gridlines */}
        {yTicks.map((yVal, i) => (
          <g key={i}>
            <line
              x1={paddingLeft}
              y1={toY(yVal)}
              x2={width - paddingRight}
              y2={toY(yVal)}
              stroke="rgba(255,255,255,0.03)"
              strokeDasharray="3 3"
            />
            <text
              x={paddingLeft - 8}
              y={toY(yVal) + 3}
              textAnchor="end"
              fill={SCI_GEOMETRY.tickFill}
              fontSize={SCI_FONT.tickSize}
              fontFamily={SCI_FONT.mono}
            >
              {yVal < 1 ? yVal.toFixed(3) : String(Math.round(yVal))}
            </text>
          </g>
        ))}

        {/* X-Axis Ticks (Aligned with Bin Borders) */}
        {ticks.map((tVal, i) => {
          const tx = toX(tVal);
          return (
            <g key={i}>
              <line
                x1={tx}
                y1={paddingTop + plotH}
                x2={tx}
                y2={paddingTop + plotH + 5}
                stroke={SCI_GEOMETRY.axisStroke}
              />
              <text
                x={tx}
                y={paddingTop + plotH + 16}
                textAnchor="middle"
                fill={SCI_GEOMETRY.tickFill}
                fontSize={SCI_FONT.tickSize}
                fontFamily={SCI_FONT.mono}
              >
                {tVal.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Histogram Rects */}
        {bins.map((b, i) => {
          const bx0 = toX(b.x0);
          const bx1 = toX(b.x1);
          const bw = Math.max(1, bx1 - bx0);
          const by = toY(b[valueKey] ?? 0);
          const bh = Math.max(0, toY(0) - by);
          const isSelected = selectedIdx === i;
          const isHovered = hoveredIdx === i || hoveredIdxFromProp === i;

          let fillCol = isSelected ? '#22D3EE55' : isHovered ? '#F43F5E55' : color + '22';
          let strokeCol = isSelected ? '#22D3EE' : isHovered ? '#F43F5E' : color;
          let sWidth = isSelected || isHovered ? 2 : 0.8;

          return (
            <rect
              key={i}
              x={bx0}
              y={by}
              width={bw}
              height={bh}
              fill={fillCol}
              stroke={strokeCol}
              strokeWidth={sWidth}
              onMouseEnter={(e) => {
                setHoveredIdx(i);
                // Calculate position relative to container
                const rect = e.currentTarget.getBoundingClientRect();
                const containerRect = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
                if (containerRect) {
                  setTooltipPos({
                    x: rect.left - containerRect.left + bw / 2,
                    y: rect.top - containerRect.top - 8,
                  });
                }
                if (onHoverItem) {
                  onHoverItem(b);
                }
              }}
              onMouseLeave={() => {
                setHoveredIdx(null);
                if (onHoverItem) onHoverItem(null);
              }}
              style={{ transition: 'fill 0.1s' }}
            />
          );
        })}

        {/* Normal theoretical KDE overlay */}
        {normalKdePath && (
          <path
            d={normalKdePath}
            fill="none"
            stroke="#F472B6" // bright pink for clear contrast
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        )}

        {/* Mean Reference line */}
        {mean !== undefined && mean >= minX && mean <= maxX && (
          <g>
            <line
              x1={toX(mean)}
              y1={paddingTop}
              x2={toX(mean)}
              y2={paddingTop + plotH}
              stroke="#22D3EE" // bright cyan for visibility
              strokeWidth={1.5}
            />
            <text
              x={toX(mean) + 5}
              y={paddingTop + 12}
              fill="#22D3EE"
              fontSize={SCI_FONT.tickSize}
              fontFamily={SCI_FONT.mono}
              fontWeight="bold"
            >
              μ = {mean.toFixed(2)}
            </text>
          </g>
        )}

        {/* ±1σ standard deviation bounds */}
        {mean !== undefined && std !== undefined && (
          <>
            {mean - std >= minX && (
              <line
                x1={toX(mean - std)}
                y1={paddingTop}
                x2={toX(mean - std)}
                y2={paddingTop + plotH}
                stroke="rgba(255,255,255,0.3)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            )}
            {mean + std <= maxX && (
              <line
                x1={toX(mean + std)}
                y1={paddingTop}
                x2={toX(mean + std)}
                y2={paddingTop + plotH}
                stroke="rgba(255,255,255,0.3)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            )}
          </>
        )}

        {/* Labels */}
        {xLabel && (
          <text
            x={paddingLeft + plotW / 2}
            y={height - 6}
            textAnchor="middle"
            fill={SCI_GEOMETRY.labelFill}
            fontSize={SCI_FONT.labelSize}
            fontFamily={SCI_FONT.sans}
            letterSpacing="0.08em"
            style={{ textTransform: 'uppercase', fontWeight: 600 }}
          >
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text
            x={12}
            y={paddingTop + plotH / 2}
            textAnchor="middle"
            fill={SCI_GEOMETRY.labelFill}
            fontSize={SCI_FONT.labelSize}
            fontFamily={SCI_FONT.sans}
            transform={`rotate(-90, 12, ${paddingTop + plotH / 2})`}
            letterSpacing="0.08em"
            style={{ textTransform: 'uppercase', fontWeight: 600 }}
          >
            {yLabel}
          </text>
        )}
      </svg>

      {/* Dynamic Monospace Tooltip */}
      {!isFullscreen && (() => {
        const activeIdx = hoveredIdx !== null ? hoveredIdx : (hoveredIdxFromProp !== null ? hoveredIdxFromProp : null);
        if (activeIdx === null || !bins[activeIdx]) return null;
        const activeBin = bins[activeIdx];
        return (
          <div
            style={{
              position: 'absolute',
              left: tooltipPos.x,
              top: tooltipPos.y,
              transform: 'translate(-50%, -100%)',
              background: 'rgba(5, 8, 22, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 4,
              padding: '6px 8px',
              fontSize: 10,
              fontFamily: SCI_FONT.mono,
              color: '#F1F5F9',
              pointerEvents: 'none',
              zIndex: 10,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ color: '#22D3EE', fontWeight: 'bold', marginBottom: 2 }}>
              BIN: {activeBin.x0.toFixed(3)} – {activeBin.x1.toFixed(3)}
            </div>
            <div>
              <span style={{ color: '#64748B' }}>count </span>
              <span style={{ fontWeight: 600 }}>{activeBin.count}</span>
            </div>
            {activeBin.density !== undefined && (
              <div>
                <span style={{ color: '#64748B' }}>density </span>
                <span style={{ fontWeight: 600 }}>{activeBin.density?.toFixed(4)}</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
