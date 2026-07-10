/**
 * SciScatter — scientific scatter plot with hollow circle markers.
 * Wraps Recharts ScatterChart.
 * Supports: multi-series, reference lines, crosshair, identity line.
 */
import React from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid, ZAxis,
} from 'recharts';
import {
  SCI_COLORS, sciXAxisProps, sciYAxisProps, sciCartesianGridProps,
  SCI_FONT, SCI_GEOMETRY,
} from './chartTheme';
import { SciTooltip } from './SciTooltip';

export interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
  color?: string;
  /** Opacity override (0–1) */
  opacity?: number;
  smiles?: string;
}

export interface ScatterSeries {
  name: string;
  data: ScatterPoint[];
  color?: string;
}

interface SciScatterProps {
  /** Single or multi-series */
  series: ScatterSeries[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  /** Draw y = x identity line */
  identityLine?: boolean;
  /** Draw x = 0 and y = 0 reference lines */
  zeroLines?: boolean;
  /** Custom vertical reference lines */
  vLines?: Array<{ x: number; label?: string; color?: string; dashed?: boolean }>;
  /** Custom horizontal reference lines */
  hLines?: Array<{ y: number; label?: string; color?: string; dashed?: boolean }>;
  /** Custom regression fit line segment */
  regressionLine?: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    color?: string;
  };
  /** Domain for X axis */
  xDomain?: [number | string, number | string];
  /** Domain for Y axis */
  yDomain?: [number | string, number | string];
  dotRadius?: number;
  tooltipFormatter?: (point: ScatterPoint, seriesName: string) => React.ReactNode;
  selectedItem?: any;
  hoveredItem?: any;
  onHoverItem?: (item: any | null) => void;
  isFullscreen?: boolean;
}

/** Custom hollow-circle dot renderer with virtual highlighting */
const HollowDot = (props: any) => {
  const { cx, cy, fill, payload, selectedItem, hoveredItem } = props;
  const color = payload?.color || fill;
  const opacity = payload?.opacity ?? 0.85;

  const isSelected = selectedItem && 
    payload && 
    Math.abs(payload.x - selectedItem.x) < 0.00001 && 
    Math.abs(payload.y - selectedItem.y) < 0.00001;

  const isHovered = hoveredItem && 
    payload && 
    Math.abs(payload.x - hoveredItem.x) < 0.00001 && 
    Math.abs(payload.y - hoveredItem.y) < 0.00001;

  return (
    <g>
      {(isSelected || isHovered) && (
        <circle
          cx={cx}
          cy={cy}
          r={props.r ? props.r + 7 : 10}
          fill="none"
          stroke={isSelected ? '#22D3EE' : '#F43F5E'}
          strokeWidth={1.5}
          opacity={0.6}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
          className="animate-ping"
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={isSelected || isHovered ? (props.r ? props.r + 2.5 : 5.5) : (props.r ?? 3)}
        fill={isSelected ? '#22D3EE' : isHovered ? '#F43F5E' : 'rgba(5, 8, 22, 0.4)'}
        stroke={isSelected ? '#040815' : color}
        strokeWidth={isSelected || isHovered ? 2 : 1.5}
        opacity={opacity}
      />
    </g>
  );
};

export const SciScatter: React.FC<SciScatterProps> = ({
  series,
  height = 280,
  xLabel,
  yLabel,
  identityLine = false,
  zeroLines = false,
  vLines = [],
  hLines = [],
  regressionLine,
  xDomain,
  yDomain,
  dotRadius = 3,
  tooltipFormatter,
  selectedItem,
  hoveredItem,
  onHoverItem,
  isFullscreen,
}) => {
  // Compute data range for identity line
  const allX = series.flatMap(s => s.data.map(d => d.x));
  const allY = series.flatMap(s => s.data.map(d => d.y));
  const minV = Math.min(...allX, ...allY);
  const maxV = Math.max(...allX, ...allY);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: xLabel ? 28 : 16, left: 4 }}>
        <CartesianGrid {...sciCartesianGridProps} />

        <XAxis
          type="number"
          dataKey="x"
          {...sciXAxisProps}
          domain={xDomain ?? ['auto', 'auto']}
          tickFormatter={(v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          label={xLabel ? {
            value: xLabel,
            position: 'insideBottom',
            offset: -12,
            fontSize: SCI_FONT.labelSize,
            fontFamily: "'Inter', sans-serif",
            fill: SCI_GEOMETRY.labelFill,
            letterSpacing: '0.08em',
          } : undefined}
        />

        <YAxis
          type="number"
          dataKey="y"
          {...sciYAxisProps}
          domain={yDomain ?? ['auto', 'auto']}
          tickFormatter={(v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          label={yLabel ? {
            value: yLabel,
            angle: -90,
            position: 'insideLeft',
            offset: 12,
            fontSize: SCI_FONT.labelSize,
            fontFamily: "'Inter', sans-serif",
            fill: SCI_GEOMETRY.labelFill,
          } : undefined}
        />

        <ZAxis range={[dotRadius * dotRadius * Math.PI, dotRadius * dotRadius * Math.PI]} />

        {!isFullscreen && (
          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }}
            content={(props: any) => {
              if (!props.active || !props.payload?.length) return null;
              const point = props.payload[0]?.payload as ScatterPoint;
              const seriesName = props.payload[0]?.name ?? '';
              if (tooltipFormatter) {
                return (
                  <div style={{
                    background: 'rgba(5,8,22,0.96)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 4,
                    padding: '7px 11px',
                    fontFamily: SCI_FONT.mono,
                    fontSize: 11,
                  }}>
                    {tooltipFormatter(point, seriesName)}
                  </div>
                );
              }
              return (
                <div style={{
                  background: 'rgba(5,8,22,0.96)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4,
                  padding: '7px 11px',
                  fontFamily: SCI_FONT.mono,
                  fontSize: 11,
                  color: '#F1F5F9',
                }}>
                  {point?.label && (
                    <div style={{ color: '#64748B', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontFamily: "'Inter', sans-serif" }}>
                      {point.label}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span><span style={{ color: '#94A3B8' }}>x </span><span style={{ color: '#22D3EE', fontWeight: 600 }}>{point?.x?.toFixed(4)}</span></span>
                    <span><span style={{ color: '#94A3B8' }}>y </span><span style={{ color: '#22D3EE', fontWeight: 600 }}>{point?.y?.toFixed(4)}</span></span>
                  </div>
                </div>
              );
            }}
          />
        )}

        {/* Zero lines */}
        {zeroLines && (
          <>
            <ReferenceLine y={0} stroke={SCI_GEOMETRY.zeroLine} strokeWidth={1} />
            <ReferenceLine x={0} stroke={SCI_GEOMETRY.zeroLine} strokeWidth={1} />
          </>
        )}

        {/* Identity line y = x */}
        {identityLine && (
          <ReferenceLine
            segment={[{ x: minV, y: minV }, { x: maxV, y: maxV }]}
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="4 3"
            strokeWidth={1}
          />
        )}

        {regressionLine && (
          <ReferenceLine
            segment={[regressionLine.start, regressionLine.end]}
            stroke={regressionLine.color || '#22D3EE'}
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
        )}

        {/* Custom vLines */}
        {vLines.map((vl, i) => (
          <ReferenceLine
            key={`vl-${i}`}
            x={vl.x}
            stroke={vl.color || 'rgba(255,255,255,0.2)'}
            strokeDasharray={vl.dashed !== false ? '4 3' : '0'}
            strokeWidth={1}
            label={vl.label ? { value: vl.label, fontSize: 8, fill: '#64748B', fontFamily: SCI_FONT.mono } : undefined}
          />
        ))}

        {/* Custom hLines */}
        {hLines.map((hl, i) => (
          <ReferenceLine
            key={`hl-${i}`}
            y={hl.y}
            stroke={hl.color || 'rgba(255,255,255,0.2)'}
            strokeDasharray={hl.dashed !== false ? '4 3' : '0'}
            strokeWidth={1}
            label={hl.label ? { value: hl.label, fontSize: 8, fill: '#64748B', fontFamily: SCI_FONT.mono } : undefined}
          />
        ))}

        {/* Data series */}
        {series.map((s, si) => (
          <Scatter
            key={s.name}
            name={s.name}
            data={s.data}
            fill={s.color || SCI_COLORS[si % SCI_COLORS.length]}
            shape={<HollowDot r={dotRadius} selectedItem={selectedItem} hoveredItem={hoveredItem} />}
            isAnimationActive={false}
            onMouseEnter={(data) => {
              if (onHoverItem && data) {
                onHoverItem({
                  series: s.name,
                  x: data.x,
                  y: data.y,
                  label: (data as any).label,
                });
              }
            }}
            onMouseLeave={() => {
              if (onHoverItem) onHoverItem(null);
            }}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
};
