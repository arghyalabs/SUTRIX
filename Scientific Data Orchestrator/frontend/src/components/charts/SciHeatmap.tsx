/**
 * SciHeatmap — pure SVG correlation / missingness matrix.
 * No Recharts. Pixel-perfect cell layout, diverging or sequential colour scale,
 * hover row+column highlight, value labels auto-hidden when cells are small.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { interpolateDiverging, interpolateSequential, SCI_FONT, SCI_GEOMETRY } from './chartTheme';

export type HeatmapMode = 'diverging' | 'sequential' | 'binary';

interface HeatmapCell {
  row: number;
  col: number;
  value: number; // −1 to +1 for diverging; 0 to 1 for sequential; 0|1 for binary
  label?: string;   // override display label
}

interface SciHeatmapProps {
  /** Row (Y-axis) labels */
  rowLabels: string[];
  /** Column (X-axis) labels */
  colLabels: string[];
  /** Flat cell data */
  cells: HeatmapCell[];
  mode?: HeatmapMode;
  /** Override tooltip content */
  tooltipFormatter?: (row: string, col: string, value: number) => React.ReactNode;
  /** Max size of each cell in px (will shrink to fit container) */
  maxCellSize?: number;
  /** Show value inside each cell */
  showValues?: boolean;
  width?: number;
  height?: number;
  selectedItem?: any;
  hoveredItem?: any;
  onHoverItem?: (item: any | null) => void;
  isFullscreen?: boolean;
}

const cellColor = (value: number, mode: HeatmapMode): string => {
  if (mode === 'diverging') return interpolateDiverging(value);
  if (mode === 'sequential') return interpolateSequential(value);
  // binary: 0 = void, 1 = cyan
  return value ? 'rgba(34,211,238,0.55)' : 'rgba(10,15,30,0.9)';
};

export const SciHeatmap: React.FC<SciHeatmapProps> = ({
  rowLabels,
  colLabels,
  cells,
  mode = 'diverging',
  tooltipFormatter,
  maxCellSize = 28,
  showValues,
  width = 600,
  height = 500,
  selectedItem,
  hoveredItem,
  onHoverItem,
  isFullscreen,
}) => {
  const [hovered, setHovered] = useState<{
    row: number;
    col: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  // Dynamic margins to fit labels without aggressive truncation
  const dynamicLabelWidth = useMemo(() => {
    const maxLen = Math.max(...rowLabels.map(l => l.length), 0);
    return Math.min(180, Math.max(80, maxLen * 7.5));
  }, [rowLabels]);

  const dynamicLabelHeight = useMemo(() => {
    const maxLen = Math.max(...colLabels.map(l => l.length), 0);
    return Math.min(150, Math.max(72, maxLen * 5.8));
  }, [colLabels]);

  const LABEL_WIDTH = dynamicLabelWidth;
  const LABEL_HEIGHT = dynamicLabelHeight;

  // Layout sizing logic: auto-scroll mode with minimum cell size of 18px
  const gridW = width - LABEL_WIDTH;
  const gridH = height - LABEL_HEIGHT;
  const MIN_CELL_SIZE = 18;
  const cellW = Math.max(MIN_CELL_SIZE, Math.min(maxCellSize, Math.floor(gridW / Math.max(colLabels.length, 1))));
  const cellH = Math.max(MIN_CELL_SIZE, Math.min(maxCellSize, Math.floor(gridH / Math.max(rowLabels.length, 1))));
  const cellSize = Math.min(cellW, cellH);

  const actualW = LABEL_WIDTH + colLabels.length * cellSize;
  const actualH = LABEL_HEIGHT + rowLabels.length * cellSize;

  // Build lookup map for fast access
  const cellMap = useMemo(() => {
    const m: Record<string, HeatmapCell> = {};
    cells.forEach(c => { m[`${c.row}_${c.col}`] = c; });
    return m;
  }, [cells]);

  const autoShowValues = showValues ?? cellSize >= 20;

  const handleMouseEnter = useCallback((row: number, col: number, e: React.MouseEvent) => {
    const rect = (e.currentTarget as SVGElement).closest('svg')!.getBoundingClientRect();
    setHovered({
      row,
      col,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      clientX: e.clientX,
      clientY: e.clientY,
    });
    const cell = cellMap[`${row}_${col}`];
    if (onHoverItem && cell) {
      onHoverItem({
        row: rowLabels[row],
        column: colLabels[col],
        r: cell.value,
      });
    }
  }, [cellMap, rowLabels, colLabels, onHoverItem]);

  const hoveredCell = hovered ? cellMap[`${hovered.row}_${hovered.col}`] : null;

  // Map selectedItem and hoveredItem to row/col indices
  const selectedCell = useMemo(() => {
    if (!selectedItem) return null;
    const rIdx = rowLabels.indexOf(selectedItem.row);
    const cIdx = colLabels.indexOf(selectedItem.column);
    if (rIdx !== -1 && cIdx !== -1) return { row: rIdx, col: cIdx };
    return null;
  }, [selectedItem, rowLabels, colLabels]);

  const hoveredCellFromProp = useMemo(() => {
    if (!hoveredItem) return null;
    const rIdx = rowLabels.indexOf(hoveredItem.row);
    const cIdx = colLabels.indexOf(hoveredItem.column);
    if (rIdx !== -1 && cIdx !== -1) return { row: rIdx, col: cIdx };
    return null;
  }, [hoveredItem, rowLabels, colLabels]);

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        maxWidth: '100%',
        maxHeight: isFullscreen ? 'calc(100vh - 220px)' : '550px',
        overflowX: 'auto',
        overflowY: 'auto',
      }}
    >
      <svg
        width={actualW}
        height={actualH}
        style={{ display: 'block', fontFamily: SCI_FONT.mono }}
        onMouseLeave={() => {
          setHovered(null);
          if (onHoverItem) onHoverItem(null);
        }}
      >
        {/* Column headers (rotated −45°) */}
        {colLabels.map((label, ci) => {
          const x = LABEL_WIDTH + ci * cellSize + cellSize / 2;
          const y = LABEL_HEIGHT - 6;
          const isHoveredCol = hovered?.col === ci || (hoveredCellFromProp && hoveredCellFromProp.col === ci);
          return (
            <text
              key={`ch-${ci}`}
              x={x}
              y={y}
              textAnchor="start"
              transform={`rotate(-45, ${x}, ${y})`}
              fontSize={Math.max(9, Math.min(11, cellSize * 0.45))}
              fill={isHoveredCol ? '#F1F5F9' : SCI_GEOMETRY.tickFill}
              style={{ transition: 'fill 0.1s' }}
            >
              {label.length > 24 ? label.slice(0, 23) + '…' : label}
            </text>
          );
        })}

        {/* Row headers */}
        {rowLabels.map((label, ri) => {
          const y = LABEL_HEIGHT + ri * cellSize + cellSize / 2;
          const isHoveredRow = hovered?.row === ri || (hoveredCellFromProp && hoveredCellFromProp.row === ri);
          return (
            <text
              key={`rh-${ri}`}
              x={LABEL_WIDTH - 6}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={Math.max(9, Math.min(11, cellSize * 0.45))}
              fill={isHoveredRow ? '#F1F5F9' : SCI_GEOMETRY.tickFill}
              style={{ transition: 'fill 0.1s' }}
            >
              {label.length > 24 ? label.slice(0, 23) + '…' : label}
            </text>
          );
        })}

        {/* Cells */}
        {rowLabels.map((_, ri) =>
          colLabels.map((_, ci) => {
            const cell = cellMap[`${ri}_${ci}`];
            const value = cell?.value ?? 0;
            const color = cellColor(value, mode);
            const x = LABEL_WIDTH + ci * cellSize;
            const y = LABEL_HEIGHT + ri * cellSize;
            const isHovRow = hovered?.row === ri || (hoveredCellFromProp && hoveredCellFromProp.row === ri);
            const isHovCol = hovered?.col === ci || (hoveredCellFromProp && hoveredCellFromProp.col === ci);
            const isHovCell = (hovered?.row === ri && hovered?.col === ci) || (hoveredCellFromProp && hoveredCellFromProp.row === ri && hoveredCellFromProp.col === ci);
            const isSelCell = selectedCell && selectedCell.row === ri && selectedCell.col === ci;
            const gap = 1;

            const labelText = cell?.label ?? (typeof value === 'number' ? value.toFixed(2) : '');

            return (
              <g key={`cell-${ri}-${ci}`}>
                {/* Row / col highlight band */}
                {(isHovRow || isHovCol) && !isHovCell && (
                  <rect
                    x={x + gap / 2}
                    y={y + gap / 2}
                    width={cellSize - gap}
                    height={cellSize - gap}
                    fill="rgba(255,255,255,0.04)"
                  />
                )}
                {/* Cell fill */}
                <rect
                  x={x + gap / 2}
                  y={y + gap / 2}
                  width={cellSize - gap}
                  height={cellSize - gap}
                  fill={isHovCell ? 'rgba(255,255,255,0.12)' : color}
                  style={{ cursor: 'crosshair', transition: 'fill 0.1s' }}
                  onMouseEnter={(e) => handleMouseEnter(ri, ci, e)}
                  onMouseMove={(e) => handleMouseEnter(ri, ci, e)}
                />
                {/* Value label */}
                {autoShowValues && cell && (
                  <text
                    x={x + cellSize / 2}
                    y={y + cellSize / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.max(8, cellSize * 0.38)}
                    fill={isHovCell || isSelCell ? '#FFFFFF' : 'rgba(255,255,255,0.75)'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {labelText}
                  </text>
                )}
              </g>
            );
          })
        )}

        {/* Hovered cell ring */}
        {hovered && (
          <rect
            x={LABEL_WIDTH + hovered.col * cellSize + 0.5}
            y={LABEL_HEIGHT + hovered.row * cellSize + 0.5}
            width={cellSize - 1}
            height={cellSize - 1}
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Hovered cell ring from prop */}
        {hoveredCellFromProp && (
          <rect
            x={LABEL_WIDTH + hoveredCellFromProp.col * cellSize + 0.5}
            y={LABEL_HEIGHT + hoveredCellFromProp.row * cellSize + 0.5}
            width={cellSize - 1}
            height={cellSize - 1}
            fill="none"
            stroke="#F43F5E"
            strokeWidth={2}
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Selected cell ring */}
        {selectedCell && (
          <rect
            x={LABEL_WIDTH + selectedCell.col * cellSize + 0.5}
            y={LABEL_HEIGHT + selectedCell.row * cellSize + 0.5}
            width={cellSize - 1}
            height={cellSize - 1}
            fill="none"
            stroke="#22D3EE"
            strokeWidth={2.5}
            style={{ pointerEvents: 'none' }}
            className="animate-pulse"
          />
        )}
      </svg>

      {/* Floating tooltip with viewport boundary detection */}
      {!isFullscreen && hovered && hoveredCell && (() => {
        const alignLeft = hovered.clientX > window.innerWidth * 0.65;
        const alignTop = hovered.clientY > window.innerHeight * 0.65;
        const leftPos = hovered.clientX + (alignLeft ? -15 : 15);
        const topPos = hovered.clientY + (alignTop ? -15 : 15);
        const tx = alignLeft ? '-100%' : '0%';
        const ty = alignTop ? '-100%' : '0%';
        return (
          <div
            style={{
              position: 'fixed',
              left: leftPos,
              top: topPos,
              transform: `translate(${tx}, ${ty})`,
              background: 'rgba(5,8,22,0.98)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              padding: '7px 11px',
              fontFamily: SCI_FONT.mono,
              fontSize: 11,
              color: '#F1F5F9',
              pointerEvents: 'none',
              zIndex: 99999,
              whiteSpace: 'nowrap',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)',
            }}
          >
            {tooltipFormatter
              ? tooltipFormatter(rowLabels[hoveredCell.row], colLabels[hoveredCell.col], hoveredCell.value)
              : (
                <div>
                  <div style={{ color: '#64748B', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif", marginBottom: 4 }}>
                    {colLabels[hoveredCell.col]} × {rowLabels[hoveredCell.row]}
                  </div>
                  <span style={{ color: '#94A3B8' }}>value </span>
                  <span style={{ color: hoveredCell.value >= 0 ? '#22D3EE' : '#F43F5E', fontWeight: 600 }}>
                    {hoveredCell.value.toFixed(4)}
                  </span>
                </div>
              )
            }
          </div>
        );
      })()}

      {/* Diverging colour legend bar */}
      {mode === 'diverging' && (
        <DivergingLegend width={Math.min(200, actualW - LABEL_WIDTH)} labelWidth={LABEL_WIDTH} />
      )}
    </div>
  );
};

const DivergingLegend: React.FC<{ width: number; labelWidth: number }> = ({ width, labelWidth }) => {
  const stops = [-1, -0.5, 0, 0.5, 1];
  const h = 10;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 4px', marginLeft: labelWidth }}>
      <svg width={width} height={h + 16} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="sci-div-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            {stops.map((v, i) => (
              <stop
                key={i}
                offset={`${((v + 1) / 2) * 100}%`}
                stopColor={interpolateDiverging(v)}
              />
            ))}
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={width} height={h} fill="url(#sci-div-grad)" />
        {[-1, 0, 1].map(v => {
          const x = ((v + 1) / 2) * width;
          return (
            <g key={v}>
              <line x1={x} y1={h} x2={x} y2={h + 4} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
              <text x={x} y={h + 12} textAnchor="middle" fontSize={8} fill="#64748B" fontFamily={SCI_FONT.mono}>
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
