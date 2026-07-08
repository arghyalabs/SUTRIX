/**
 * SciTooltip — shared scientific tooltip for all Recharts components.
 * Minimal, monospace, no box-shadow.
 */
import React from 'react';
import { SCI_FONT } from './chartTheme';

interface SciTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number | string; color?: string; unit?: string }>;
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
  formatter?: (name: string, value: number | string, color?: string) => React.ReactNode;
}

export const SciTooltip: React.FC<SciTooltipProps> = ({
  active,
  payload,
  label,
  labelFormatter,
  formatter,
}) => {
  if (!active || !payload?.length) return null;

  const formattedLabel = label !== undefined
    ? (labelFormatter ? labelFormatter(label) : String(label))
    : null;

  return (
    <div
      style={{
        background: 'rgba(5,8,22,0.96)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 4,
        padding: '7px 11px',
        fontFamily: SCI_FONT.mono,
        fontSize: 11,
        color: '#F1F5F9',
        lineHeight: 1.7,
        pointerEvents: 'none',
        minWidth: 120,
      }}
    >
      {formattedLabel && (
        <div style={{ color: '#64748B', fontSize: 10, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Inter', sans-serif" }}>
          {formattedLabel}
        </div>
      )}
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <span style={{ color: '#94A3B8', fontSize: 10 }}>
            {entry.name}
          </span>
          <span style={{ color: entry.color || '#22D3EE', fontWeight: 600 }}>
            {formatter
              ? formatter(entry.name, entry.value, entry.color)
              : typeof entry.value === 'number'
                ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 4 })
                : entry.value}
            {entry.unit ? <span style={{ color: '#64748B', marginLeft: 2 }}>{entry.unit}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
};

/**
 * Simple inline stat — renders a single key=value pair in mono font.
 */
export const SciStat: React.FC<{
  label: string;
  value: string | number;
  accent?: string;
  size?: 'sm' | 'md';
}> = ({ label, value, accent = '#22D3EE', size = 'sm' }) => (
  <span style={{ fontFamily: SCI_FONT.mono, fontSize: size === 'sm' ? 11 : 13 }}>
    <span style={{ color: '#64748B' }}>{label}{' '}</span>
    <span style={{ color: accent, fontWeight: 600 }}>{value}</span>
  </span>
);
