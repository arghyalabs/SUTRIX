/**
 * SDO Studio — Scientific Chart Design System
 * Central palette, colour interpolation, and axis/tooltip defaults.
 * All chart components pull from here — never hardcode colours in panels.
 */

// ─── Categorical palette (8 perceptually distinct stops) ─────────────────────
export const SCI_COLORS = [
  '#22D3EE', // cyan-400    — primary series
  '#818CF8', // indigo-400  — secondary series
  '#34D399', // emerald-400 — positive / valid
  '#FB923C', // orange-400  — warning
  '#F472B6', // pink-400    — highlight
  '#A78BFA', // violet-400  — tertiary
  '#FACC15', // yellow-400  — emphasis
  '#94A3B8', // slate-400   — neutral / NA
] as const;

// ─── Diverging palette (correlation / heatmap) ────────────────────────────────
export const SCI_DIVERGING = {
  negative: '#F43F5E', // rose-500
  zero: '#0A0F1E',     // void (near-transparent)
  positive: '#22D3EE', // cyan-400
} as const;

// ─── Sequential palette (density / missingness) ───────────────────────────────
export const SCI_SEQUENTIAL = {
  low: 'rgba(255,255,255,0.03)',
  high: '#22D3EE',
} as const;

// ─── Severity colours (for inline badges, not chart fills) ────────────────────
export const SCI_SEVERITY = {
  critical: '#F43F5E',
  high: '#FB923C',
  medium: '#FACC15',
  low: '#22D3EE',
  none: '#34D399',
} as const;

// ─── Typography tokens (applied inline to Recharts ticks / custom SVG) ────────
export const SCI_FONT = {
  mono: "'Geist Mono', 'Fira Mono', 'Courier New', monospace",
  sans: "'Inter', system-ui, sans-serif",
  tickSize: 10,
  annotationSize: 9,
  labelSize: 10,
} as const;

// ─── Geometry tokens ──────────────────────────────────────────────────────────
export const SCI_GEOMETRY = {
  axisStroke: 'rgba(255,255,255,0.08)',
  gridStroke: 'rgba(255,255,255,0.04)',
  zeroLine: 'rgba(255,255,255,0.15)',
  tickFill: '#CBD5E1',
  labelFill: '#94A3B8',
  dotRadius: 3,
  strokeWidth: 1.5,
} as const;

// ─── Recharts shared axis props ───────────────────────────────────────────────
export const sciXAxisProps = {
  tick: {
    fontFamily: SCI_FONT.mono,
    fontSize: SCI_FONT.tickSize,
    fill: SCI_GEOMETRY.tickFill,
  },
  axisLine: { stroke: SCI_GEOMETRY.axisStroke },
  tickLine: false as const,
} as const;

export const sciYAxisProps = {
  tick: {
    fontFamily: SCI_FONT.mono,
    fontSize: SCI_FONT.tickSize,
    fill: SCI_GEOMETRY.tickFill,
  },
  axisLine: { stroke: SCI_GEOMETRY.axisStroke },
  tickLine: false as const,
  width: 52,
} as const;

export const sciCartesianGridProps = {
  stroke: SCI_GEOMETRY.gridStroke,
  strokeDasharray: '0',
} as const;

// ─── Recharts shared tooltip content style ────────────────────────────────────
export const sciTooltipStyle = {
  background: 'rgba(5,8,22,0.95)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: SCI_FONT.mono,
  padding: '6px 10px',
  color: '#F1F5F9',
  boxShadow: 'none',
} as const;

// ─── 3-stop linear colour interpolation (no D3 required) ─────────────────────
/**
 * Interpolate between three hex colours based on t ∈ [−1, +1].
 * t < 0  → lerp(negativeHex, zeroHex,  |t|)
 * t >= 0 → lerp(zeroHex,     positiveHex, t)
 */
export function interpolateDiverging(t: number): string {
  const clamp = Math.max(-1, Math.min(1, t));
  if (clamp < 0) {
    return lerpHex(SCI_DIVERGING.zero, SCI_DIVERGING.negative, -clamp);
  }
  return lerpHex(SCI_DIVERGING.zero, SCI_DIVERGING.positive, clamp);
}

/**
 * Interpolate between two hex colours; u ∈ [0, 1].
 */
export function interpolateSequential(u: number): string {
  // From transparent near-black → cyan-400
  const r0 = 10, g0 = 15, b0 = 30;
  const r1 = 34, g1 = 211, b1 = 238;
  const uc = Math.max(0, Math.min(1, u));
  const r = Math.round(r0 + (r1 - r0) * uc);
  const g = Math.round(g0 + (g1 - g0) * uc);
  const b = Math.round(b0 + (b1 - b0) * uc);
  const a = 0.05 + uc * 0.85;
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl2 = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl2})`;
}

/**
 * Returns a contrasting label colour (white or dark) for a given background colour string.
 * Accepts hex (#rrggbb) or rgb(r,g,b) or rgba(r,g,b,a).
 */
export function contrastColor(bgColor: string): string {
  try {
    let r = 0, g = 0, b = 0;
    if (bgColor.startsWith('#')) {
      [r, g, b] = hexToRgb(bgColor);
    } else {
      const nums = bgColor.match(/\d+/g);
      if (nums && nums.length >= 3) {
        r = parseInt(nums[0]);
        g = parseInt(nums[1]);
        b = parseInt(nums[2]);
      }
    }
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.4 ? '#0A0F1E' : 'rgba(255,255,255,0.85)';
  } catch {
    return 'rgba(255,255,255,0.7)';
  }
}
