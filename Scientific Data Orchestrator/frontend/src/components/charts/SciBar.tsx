/**
 * SciBar — flat, scientific bar chart wrapper around Recharts BarChart.
 * No rounded corners, 1px top stroke, monospace ticks, optional reference line.
 */
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, CartesianGrid, LabelList,
} from 'recharts';
import {
  SCI_COLORS, sciXAxisProps, sciYAxisProps, sciCartesianGridProps,
  SCI_FONT, SCI_GEOMETRY,
} from './chartTheme';
import { SciTooltip } from './SciTooltip';

export interface SciBarDatum {
  label: string;
  value: number;
  color?: string;
  annotation?: string;
}

interface SciBarProps {
  data: SciBarDatum[];
  /** Accent colour for uniform-colour bars */
  color?: string;
  /** Use per-datum colour from SCI_COLORS (for multi-category) */
  useSeriesColors?: boolean;
  horizontal?: boolean;
  height?: number;
  yLabel?: string;
  xLabel?: string;
  /** Show a reference line at this Y value */
  referenceLine?: number;
  referenceLabel?: string;
  /** Stroke colour of the top/left edge on each bar */
  barAccentStroke?: boolean;
  maxBarSize?: number;
  /** Show value labels on bars */
  showLabels?: boolean;
  tooltipFormatter?: (name: string, value: number | string) => string;
  /** Domain override for axis */
  domain?: [number, number];
  selectedItem?: any;
  hoveredItem?: any;
  onHoverItem?: (item: any | null) => void;
  isFullscreen?: boolean;
}

export const SciBar: React.FC<SciBarProps> = ({
  data,
  color = SCI_COLORS[0],
  useSeriesColors = false,
  horizontal = false,
  height = 260,
  yLabel,
  xLabel,
  referenceLine,
  referenceLabel,
  barAccentStroke = true,
  maxBarSize = 32,
  showLabels = false,
  tooltipFormatter,
  domain,
  selectedItem,
  hoveredItem,
  onHoverItem,
  isFullscreen,
}) => {
  const layout = horizontal ? 'vertical' : 'horizontal';
  const dataKey = 'value';
  const categoryKey = 'label';

  const accent = color;

  const bottomMargin = horizontal
    ? (xLabel ? 28 : 16)
    : (data.length > 8 ? 64 : (xLabel ? 28 : 16));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: 16, bottom: bottomMargin, left: yLabel ? 8 : 4 }}
        barSize={maxBarSize}
      >
        <CartesianGrid
          {...sciCartesianGridProps}
          vertical={horizontal}
          horizontal={!horizontal}
        />

        {horizontal ? (
          <>
            <XAxis
              type="number"
              {...sciXAxisProps}
              domain={domain}
              label={xLabel ? {
                value: xLabel,
                position: 'insideBottom',
                offset: -10,
                fontSize: SCI_FONT.labelSize,
                fontFamily: "'Inter', sans-serif",
                fill: SCI_GEOMETRY.labelFill,
                letterSpacing: '0.08em',
              } : undefined}
            />
            <YAxis
              type="category"
              dataKey={categoryKey}
              tick={{
                fontFamily: SCI_FONT.mono,
                fontSize: SCI_FONT.tickSize,
                fill: SCI_GEOMETRY.tickFill,
              }}
              axisLine={{ stroke: SCI_GEOMETRY.axisStroke }}
              tickLine={false}
              width={80}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={categoryKey}
              {...sciXAxisProps}
              tick={data.length > 8 ? {
                ...sciXAxisProps.tick,
                angle: -45,
                textAnchor: 'end',
              } : sciXAxisProps.tick}
              height={data.length > 8 ? 60 : 30}
              label={xLabel ? {
                value: xLabel,
                position: 'insideBottom',
                offset: data.length > 8 ? 0 : -16,
                fontSize: SCI_FONT.labelSize,
                fontFamily: "'Inter', sans-serif",
                fill: SCI_GEOMETRY.labelFill,
                letterSpacing: '0.08em',
              } : undefined}
            />
            <YAxis
              {...sciYAxisProps}
              domain={domain}
              label={yLabel ? {
                value: yLabel,
                angle: -90,
                position: 'insideLeft',
                offset: 12,
                fontSize: SCI_FONT.labelSize,
                fontFamily: "'Inter', sans-serif",
                fill: SCI_GEOMETRY.labelFill,
                letterSpacing: '0.08em',
              } : undefined}
            />
          </>
        )}

        {!isFullscreen && (
          <Tooltip
            content={(props: any) => (
              <SciTooltip
                {...props}
                formatter={tooltipFormatter
                  ? (name: string, value: number | string) => tooltipFormatter(name, value as number)
                  : undefined}
              />
            )}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
        )}

        {referenceLine !== undefined && (
          <ReferenceLine
            {...(horizontal ? { x: referenceLine } : { y: referenceLine })}
            stroke={SCI_GEOMETRY.zeroLine}
            strokeDasharray="4 3"
            label={{
              value: referenceLabel ?? String(referenceLine),
              fontSize: 8,
              fill: '#64748B',
              fontFamily: SCI_FONT.mono,
            }}
          />
        )}

        <Bar
          dataKey={dataKey}
          radius={0}
          isAnimationActive={false}
          onMouseEnter={(data) => {
            if (onHoverItem && data) {
              onHoverItem(data);
            }
          }}
          onMouseLeave={() => {
            if (onHoverItem) onHoverItem(null);
          }}
        >
          {data.map((entry, index) => {
            const isSelected = selectedItem && entry && entry.label === selectedItem.label && Math.abs(entry.value - selectedItem.value) < 0.00001;
            const isHovered = hoveredItem && entry && entry.label === hoveredItem.label && Math.abs(entry.value - hoveredItem.value) < 0.00001;
            
            let fillCol = useSeriesColors
              ? (entry.color || SCI_COLORS[index % SCI_COLORS.length]) + '33'
              : accent + '28';
            let strokeCol = useSeriesColors
              ? (entry.color || SCI_COLORS[index % SCI_COLORS.length])
              : (barAccentStroke ? accent : 'transparent');

            if (isSelected) {
              fillCol = '#22D3EE99';
              strokeCol = '#22D3EE';
            } else if (isHovered) {
              fillCol = '#F43F5E99';
              strokeCol = '#F43F5E';
            }

            return (
              <Cell
                key={`cell-${index}`}
                fill={fillCol}
                stroke={strokeCol}
                strokeWidth={barAccentStroke || isSelected || isHovered ? 2 : 0}
              />
            );
          })}
          {showLabels && (
            <LabelList
              dataKey={dataKey}
              position={horizontal ? 'right' : 'top'}
              style={{
                fontFamily: SCI_FONT.mono,
                fontSize: 8,
                fill: SCI_GEOMETRY.tickFill,
              }}
              formatter={(v: any) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '')}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};
