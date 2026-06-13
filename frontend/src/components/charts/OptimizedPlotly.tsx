import React from 'react';
import Plot from 'react-plotly.js';

interface PlotProps {
  data: any[];
  layout: any;
  useGL?: boolean;
}

// Safely unwrap react-plotly.js component from CJS/ESM double default wrapping in Vite/React 19
let SafePlot: any = Plot;
if (SafePlot) {
  if (SafePlot.default) {
    SafePlot = SafePlot.default;
  }
  if (SafePlot && SafePlot.default) {
    SafePlot = SafePlot.default;
  }
}

export const OptimizedPlotly: React.FC<PlotProps> = ({ data, layout, useGL = false }) => {
  // Guard: if data or layout missing, show placeholder
  if (!data || !layout) {
    return (
      <div className="w-full h-full min-h-[300px] flex items-center justify-center border border-white/[0.06] rounded-2xl bg-white/[0.02] text-xs text-secondary">
        No chart data to display
      </div>
    );
  }

  let parsedLayout = layout;
  try {
    // Deep clone the layout object to prevent Plotly from mutatively cross-wiring nested objects (xaxis, yaxis) between multiple charts on the same page
    parsedLayout = JSON.parse(JSON.stringify(layout));
  } catch (e) {
    console.warn("OptimizedPlotly: Failed to deep clone layout, falling back to original", e);
  }

  const finalLayout = {
    ...parsedLayout,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { ...(parsedLayout?.font || {}), family: 'Inter, system-ui, sans-serif', color: '#94A3B8' },
    margin: parsedLayout.margin || { t: 40, r: 20, l: 40, b: 40 },
  };

  // Enforce WebGL rendering ONLY if explicitly requested, otherwise fallback to SVG for maximum environmental compatibility
  const optimizedData = (Array.isArray(data) ? data : []).map(trace => {
    if (useGL) {
      if (trace.type === 'scatter') return { ...trace, type: 'scattergl' };
      if (trace.type === 'heatmap') return { ...trace, type: 'heatmapgl' };
      if (trace.type === 'contour') return { ...trace, type: 'contourgl' };
    }
    return trace;
  });

  // Fallback to placeholder if Plotly component failed to resolve or is an invalid plain object (safeguard against bundling issues)
  if (!SafePlot || (typeof SafePlot === 'object' && !SafePlot.$$typeof)) {
    return (
      <div className="w-full h-full min-h-[300px] flex items-center justify-center border border-white/[0.06] rounded-2xl bg-white/[0.02] text-xs text-secondary">
        Interactive chart rendering offline
      </div>
    );
  }

  return (
    <SafePlot
      data={optimizedData}
      layout={finalLayout}
      useWebGL={useGL}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: '100%', height: '100%' }}
    />
  );
};
