import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { SCI_FONT } from './chartTheme';

interface SciPanelProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  /** Supplemental stat chips shown inline with the title */
  stats?: Array<{ label: string; value: string | number; accent?: string }>;
  /** Height of the chart area. Defaults to 280. Pass 'auto' for data-driven height. */
  height?: number | 'auto';
  /** If true, panel takes full width */
  fullWidth?: boolean;
  /** Optional override for raw dataset inspector */
  rawData?: Array<Record<string, any>>;
  /** Columns definition for dataset inspector */
  rawColumns?: Array<{ key: string; label: string; format?: (v: any) => string }>;
}

const getSmilesFromItem = (item: any): string | null => {
  if (!item) return null;
  const smilesKeys = ['smiles', 'smiles_i', 'smiles_j', 'scaffold_smiles', 'query_smiles', 'structure'];
  for (const key of smilesKeys) {
    if (item[key] && typeof item[key] === 'string' && item[key].trim().length > 0) {
      return item[key];
    }
  }
  for (const [key, val] of Object.entries(item)) {
    if (key.toLowerCase().includes('smiles') && typeof val === 'string' && val.trim().length > 0) {
      return val;
    }
  }
  return null;
};

const API = 'http://127.0.0.1:8000';

export const SciPanel: React.FC<SciPanelProps> = ({
  title,
  subtitle,
  children,
  className = '',
  stats = [],
  height = 280,
  fullWidth = true,
  rawData,
  rawColumns,
}) => {
  const [hovered, setHovered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Interactive workbench states
  const [zoomScale, setZoomScale] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'EXPLORER' | 'SETTINGS'>('EXPLORER');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [hoveredRowIdx, setHoveredRowIdx] = useState<number | null>(null);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  
  // Scientific filters
  const [residualThreshold, setResidualThreshold] = useState(3.0);
  const [corrThreshold, setCorrThreshold] = useState(0.0);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFullscreen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsFullscreen(false);
      };
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    } else {
      // Reset zoom/pan when closing fullscreen
      setZoomScale(1.0);
      setPanX(0);
      setPanY(0);
    }
  }, [isFullscreen]);

  const handleDownloadSVG = () => {
    const svg = containerRef.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'chart').toLowerCase().replace(/\s+/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-infer raw dataset from chart component props
  const dataset = useMemo(() => {
    if (rawData) return rawData;
    let list: any[] = [];
    React.Children.forEach(children, (child: any) => {
      if (!child) return;
      if (Array.isArray(child.props?.data)) {
        list = child.props.data;
      } else if (Array.isArray(child.props?.cells)) {
        const cells = child.props.cells;
        const rowLabels = child.props.rowLabels || [];
        const colLabels = child.props.colLabels || [];
        list = cells.map((c: any) => ({
          row: rowLabels[c.row] || `Row ${c.row}`,
          column: colLabels[c.col] || `Col ${c.col}`,
          r: c.value,
        }));
      } else if (Array.isArray(child.props?.series)) {
        child.props.series.forEach((s: any) => {
          if (Array.isArray(s.data)) {
            s.data.forEach((pt: any) => {
              list.push({ series: s.name, ...pt });
            });
          }
        });
      } else if (Array.isArray(child.props?.bins)) {
        list = child.props.bins;
      }
    });
    return list;
  }, [rawData, children]);

  // Auto-infer columns
  const columns = useMemo(() => {
    if (rawColumns) return rawColumns;
    if (!dataset || dataset.length === 0) return [];
    const sample = dataset[0];
    return Object.keys(sample)
      .filter(k => {
        const val = sample[k];
        return typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean';
      })
      .map(k => ({
        key: k,
        label: k.replace(/_/g, ' ').toUpperCase(),
        format: (v: any) => typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v ?? ''),
      }));
  }, [rawColumns, dataset]);

  // Context-aware title checks for specific sliders
  const isCorrelation = (title || '').toLowerCase().includes('correlation');
  const isWilliams = (title || '').toLowerCase().includes('williams') || (title || '').toLowerCase().includes('outlier');

  // Filtered dataset
  const filteredDataset = useMemo(() => {
    let result = [...dataset];
    
    // Apply scientific threshold filters
    if (isCorrelation && corrThreshold > 0) {
      result = result.filter(item => {
        const r = typeof item.r === 'number' ? Math.abs(item.r) : 0;
        return r >= corrThreshold;
      });
    }
    if (isWilliams && residualThreshold < 5.0) {
      result = result.filter(item => {
        const res = typeof item.std_residual === 'number' ? Math.abs(item.std_residual) : 0;
        const lev = typeof item.leverage === 'number' ? item.leverage : 0;
        return res <= residualThreshold;
      });
    }

    // Search query filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => 
        Object.values(item).some(val => String(val).toLowerCase().includes(q))
      );
    }

    // Apply sorting
    if (sortKey) {
      result.sort((a, b) => {
        const valA = a[sortKey];
        const valB = b[sortKey];
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        return (valA < valB ? -1 : 1) * (sortAsc ? 1 : -1);
      });
    }

    return result;
  }, [dataset, searchQuery, sortKey, sortAsc, isCorrelation, corrThreshold, isWilliams, residualThreshold]);

  const selectedItem = useMemo(() => {
    return selectedRowIdx !== null && selectedRowIdx < filteredDataset.length ? filteredDataset[selectedRowIdx] : null;
  }, [selectedRowIdx, filteredDataset]);

  const hoveredItem = useMemo(() => {
    return hoveredRowIdx !== null && hoveredRowIdx < filteredDataset.length ? filteredDataset[hoveredRowIdx] : null;
  }, [hoveredRowIdx, filteredDataset]);

  const handleHoverItem = useCallback((item: any | null) => {
    if (!item) {
      setHoveredRowIdx(null);
      return;
    }
    // Find matching item index in filteredDataset
    const idx = filteredDataset.findIndex(d => {
      // 1. Check coordinates / series match for scatter
      if (item.x !== undefined && item.y !== undefined) {
        const matchesX = Math.abs((d.x ?? 0) - item.x) < 0.00001;
        const matchesY = Math.abs((d.y ?? 0) - item.y) < 0.00001;
        const matchesLabel = !item.label || d.label === item.label;
        const matchesSeries = !item.series || d.series === item.series;
        return matchesX && matchesY && matchesLabel && matchesSeries;
      }
      // 2. Check row / column / label match for heatmap
      if (item.row !== undefined && item.column !== undefined) {
        return d.row === item.row && d.column === item.column;
      }
      // 3. Check bins bounds match for histogram
      if (item.x0 !== undefined && item.x1 !== undefined) {
        return Math.abs((d.x0 ?? 0) - item.x0) < 0.00001 && Math.abs((d.x1 ?? 0) - item.x1) < 0.00001;
      }
      // 4. Default label/value fallback
      return d.label === item.label;
    });
    if (idx !== -1) {
      setHoveredRowIdx(idx);
    } else {
      setHoveredRowIdx(null);
    }
  }, [filteredDataset]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const renderHeaderControls = (compact: boolean = false) => (
    <div
      style={{
        marginLeft: 'auto',
        display: 'flex',
        gap: 6,
        opacity: compact ? (hovered ? 1 : 0) : 1,
        transition: 'opacity 0.15s ease',
        pointerEvents: compact ? (hovered ? 'auto' : 'none') : 'auto',
      }}
    >
      <button
        onClick={handleDownloadSVG}
        title="Download as SVG"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 3,
          padding: '2px 7px',
          fontSize: 9,
          fontFamily: SCI_FONT.mono,
          color: '#64748B',
          cursor: 'pointer',
          letterSpacing: '0.06em',
        }}
      >
        SVG ↓
      </button>
      {!isFullscreen && (
        <button
          onClick={() => setIsFullscreen(true)}
          title="View full screen interactive explorer"
          style={{
            background: 'rgba(34,211,238,0.05)',
            border: '1px solid rgba(34,211,238,0.2)',
            borderRadius: 3,
            padding: '2px 7px',
            fontSize: 9,
            fontFamily: SCI_FONT.mono,
            color: '#22D3EE',
            cursor: 'pointer',
            letterSpacing: '0.06em',
          }}
        >
          EXPAND ⛶
        </button>
      )}
    </div>
  );

  return (
    <>
      <div
        className={`relative ${fullWidth ? 'w-full' : ''} ${className}`}
        style={{
          background: 'rgba(255,255,255,0.008)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Header */}
        {(title || stats.length > 0) && (
          <div
            style={{
              padding: '10px 14px 8px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            {title && (
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#F1F5F9',
                }}
              >
                {title}
              </span>
            )}
            {subtitle && (
              <span
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 10,
                  color: '#64748B',
                  fontWeight: 400,
                }}
              >
                {subtitle}
              </span>
            )}
            {stats.map((s, i) => (
              <span
                key={i}
                style={{
                  fontFamily: SCI_FONT.mono,
                  fontSize: 10,
                  display: 'inline-flex',
                  gap: 4,
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#64748B' }}>{s.label}</span>
                <span style={{ color: s.accent || '#22D3EE', fontWeight: 600 }}>{s.value}</span>
              </span>
            ))}

            {renderHeaderControls(true)}
          </div>
        )}

        {/* Chart area */}
        <div
          ref={containerRef}
          style={{ padding: '12px 4px 10px', height: height === 'auto' ? 'auto' : height }}
        >
          {React.Children.map(children, child => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child, {
                selectedItem,
                hoveredItem,
                onHoverItem: handleHoverItem,
                isFullscreen: false,
              } as any);
            }
            return child;
          })}
        </div>
      </div>

      {isFullscreen && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: '#070B19',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            color: '#F1F5F9',
          }}
        >
          {/* Fullscreen Header */}
          <div
            style={{
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              padding: '16px 32px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
              background: '#0B1126',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {title && (
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#22D3EE',
                  }}
                >
                  {title} <span style={{ color: '#64748B', fontWeight: 400, fontSize: 10 }}>[RESEARCH WORKBENCH]</span>
                </span>
              )}
              {subtitle && (
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 11,
                    color: '#64748B',
                    fontWeight: 400,
                  }}
                >
                  {subtitle}
                </span>
              )}
            </div>

            {/* Stats strip */}
            {stats.length > 0 && (
              <div style={{ display: 'flex', gap: 20, marginLeft: 24, flexWrap: 'wrap' }}>
                {stats.map((s, i) => (
                  <span
                    key={i}
                    style={{
                      fontFamily: SCI_FONT.mono,
                      fontSize: 11,
                      display: 'inline-flex',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: '#64748B' }}>{s.label}</span>
                    <span style={{ color: s.accent || '#22D3EE', fontWeight: 600 }}>{s.value}</span>
                  </span>
                ))}
              </div>
            )}

            {/* Fullscreen Controls */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                onClick={handleDownloadSVG}
                title="Download as SVG"
                style={{
                  background: 'rgba(34,211,238,0.07)',
                  border: '1px solid rgba(34,211,238,0.2)',
                  borderRadius: 4,
                  padding: '4px 12px',
                  fontSize: 10,
                  fontFamily: SCI_FONT.mono,
                  color: '#22D3EE',
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                }}
              >
                DOWNLOAD SVG
              </button>
              <button
                onClick={() => setIsFullscreen(false)}
                title="Close Fullscreen"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 4,
                  padding: '4px 12px',
                  fontSize: 10,
                  fontFamily: SCI_FONT.mono,
                  color: '#94A3B8',
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                }}
              >
                CLOSE [ESC]
              </button>
            </div>
          </div>

          {/* Workbench Grid Layout */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            
            {/* Chart Sandbox Workspace (70% width) */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                background: '#040712',
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 40,
              }}
            >
              {/* Centralized Live Hover HUD Overlay Banner */}
              {hoveredItem && (
                <div
                  style={{
                    position: 'absolute',
                    top: 16,
                    left: 20,
                    zIndex: 99999, // Floating on top of zoomed chart
                    background: 'rgba(5, 12, 30, 0.85)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(34, 211, 238, 0.25)',
                    borderRadius: 6,
                    padding: '8px 14px',
                    fontFamily: SCI_FONT.mono,
                    fontSize: 11,
                    color: '#F1F5F9',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    pointerEvents: 'none',
                    maxWidth: '80%',
                  }}
                >
                  <span style={{ color: '#22D3EE', fontWeight: 'bold', fontSize: 10, letterSpacing: '0.06em' }}>
                    LIVE INSPECTION
                  </span>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {Object.entries(hoveredItem).map(([key, val]) => {
                      if (key === 'color' || key === 'opacity') return null;
                      // Format labels
                      const displayKey = key === 'r' ? 'r' : key.replace(/_/g, ' ').toUpperCase();
                      return (
                        <span key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ color: '#64748B', fontSize: 10 }}>{displayKey}</span>
                          <span style={{ color: '#F1F5F9', fontWeight: 600 }}>
                            {typeof val === 'number' ? val.toFixed(4) : String(val)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Zoom & Pan Transform Wrapper */}
              <div
                ref={containerRef}
                style={{
                  width: '100%',
                  height: '100%',
                  transform: `scale(${zoomScale}) translate(${panX}px, ${panY}px)`,
                  transformOrigin: 'center center',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                {React.Children.map(children, child => {
                  if (React.isValidElement(child)) {
                    const extraProps: any = {
                      width: window.innerWidth - 480,
                      height: window.innerHeight - 200,
                      selectedItem,
                      hoveredItem,
                      onHoverItem: handleHoverItem,
                      isFullscreen: true,
                    };
                    return React.cloneElement(child, extraProps);
                  }
                  return child;
                })}
              </div>

              {/* Status bar */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 20,
                  fontSize: 10,
                  fontFamily: SCI_FONT.mono,
                  color: '#475569',
                  display: 'flex',
                  gap: 16,
                }}
              >
                <span>zoom: {Math.round(zoomScale * 100)}%</span>
                <span>pan: x={panX} y={panY}</span>
                {selectedRowIdx !== null && <span>Selected item #{selectedRowIdx}</span>}
              </div>
            </div>

            {/* Sidebar Workbench (30% width) */}
            <div
              style={{
                width: 380,
                borderLeft: '1px solid rgba(255,255,255,0.06)',
                background: '#070B19',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Tab selector */}
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {(['EXPLORER', 'SETTINGS'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: activeTab === tab ? '#22D3EE' : '#64748B',
                      background: activeTab === tab ? 'rgba(255,255,255,0.01)' : 'transparent',
                      borderBottom: activeTab === tab ? '2px solid #22D3EE' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Explorer Tab */}
              {activeTab === 'EXPLORER' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16 }}>
                  {/* Search Bar */}
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search coordinates or labels..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#F1F5F9',
                      fontSize: 11,
                      fontFamily: SCI_FONT.mono,
                      marginBottom: 12,
                      outline: 'none',
                    }}
                  />

                  {/* Summary / Filter stat */}
                  <div style={{ fontSize: 10, color: '#64748B', marginBottom: 8, display: 'flex', justifyContent: 'between' }}>
                    <span>Showing {filteredDataset.length} of {dataset.length} items</span>
                  </div>

                  {/* Monospace scroll table */}
                  <div style={{ flex: 1, overflow: 'auto', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 4 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: SCI_FONT.mono }}>
                      <thead style={{ background: 'rgba(255,255,255,0.02)', position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {columns.map(col => (
                            <th
                              key={col.key}
                              onClick={() => handleSort(col.key)}
                              style={{
                                padding: '6px 8px',
                                textAlign: 'left',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                userSelect: 'none',
                              }}
                            >
                              {col.label} {sortKey === col.key ? (sortAsc ? '↑' : '↓') : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDataset.map((row, idx) => (
                          <tr
                            key={idx}
                            onMouseEnter={() => setHoveredRowIdx(idx)}
                            onMouseLeave={() => setHoveredRowIdx(null)}
                            onClick={() => setSelectedRowIdx(idx)}
                            style={{
                              borderBottom: '1px solid rgba(255,255,255,0.02)',
                              background: selectedRowIdx === idx 
                                ? 'rgba(34,211,238,0.08)' 
                                : hoveredRowIdx === idx 
                                  ? 'rgba(255,255,255,0.02)' 
                                  : 'transparent',
                              cursor: 'pointer',
                            }}
                          >
                            {columns.map(col => (
                              <td key={col.key} style={{ padding: '6px 8px', color: '#CBD5E1' }}>
                                {col.format(row[col.key])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Selection Detail Inspector */}
                  {selectedRowIdx !== null && filteredDataset[selectedRowIdx] && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 12,
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        fontSize: 10,
                        fontFamily: SCI_FONT.mono,
                      }}
                    >
                      <div style={{ color: '#22D3EE', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 4, marginBottom: 6 }}>
                        ITEM DETAIL
                      </div>
                      {Object.entries(filteredDataset[selectedRowIdx]).map(([key, val]) => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ color: '#64748B' }}>{key}</span>
                          <span style={{ color: '#F1F5F9', textAlign: 'right', wordBreak: 'break-all', maxWidth: 220 }}>
                            {typeof val === 'number' ? val.toFixed(5) : String(val)}
                          </span>
                        </div>
                      ))}
                      {/* Virtual Visualization Card */}
                      {(() => {
                        const smiles = getSmilesFromItem(filteredDataset[selectedRowIdx]);
                        if (!smiles) return null;
                        
                        // Check if we have two SMILES (e.g. for cliff pairs)
                        const smilesJ = filteredDataset[selectedRowIdx].smiles_j || filteredDataset[selectedRowIdx].smiles2 || null;
                        
                        return (
                          <div style={{
                            marginTop: 14,
                            padding: 12,
                            borderRadius: 6,
                            background: 'rgba(255, 255, 255, 0.01)',
                            border: '1px solid rgba(255, 255, 255, 0.04)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 8,
                          }}>
                            <div style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: '#22D3EE',
                              fontFamily: "'Inter', sans-serif",
                              letterSpacing: '0.08em',
                              alignSelf: 'flex-start',
                              textTransform: 'uppercase',
                            }}>
                              Virtual Compound Representation
                            </div>
                            
                            {smilesJ ? (
                              <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                                <div style={{
                                  flex: 1,
                                  height: 120,
                                  background: 'rgba(255, 255, 255, 0.01)',
                                  borderRadius: 4,
                                  border: '1px solid rgba(255,255,255,0.03)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  overflow: 'hidden',
                                }}>
                                  <img
                                    src={`${API}/api/render/structure?smiles=${encodeURIComponent(smiles)}&width=150&height=120`}
                                    alt="Structure A"
                                    style={{
                                      maxWidth: '90%',
                                      maxHeight: '90%',
                                      filter: 'invert(1) hue-rotate(180deg) brightness(1.2) contrast(1.1)',
                                    }}
                                  />
                                </div>
                                <div style={{
                                  flex: 1,
                                  height: 120,
                                  background: 'rgba(255, 255, 255, 0.01)',
                                  borderRadius: 4,
                                  border: '1px solid rgba(255,255,255,0.03)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  overflow: 'hidden',
                                }}>
                                  <img
                                    src={`${API}/api/render/structure?smiles=${encodeURIComponent(smilesJ)}&width=150&height=120`}
                                    alt="Structure B"
                                    style={{
                                      maxWidth: '90%',
                                      maxHeight: '90%',
                                      filter: 'invert(1) hue-rotate(180deg) brightness(1.2) contrast(1.1)',
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div style={{
                                width: '100%',
                                height: 160,
                                background: 'rgba(255, 255, 255, 0.01)',
                                borderRadius: 4,
                                border: '1px solid rgba(255,255,255,0.03)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                              }}>
                                <img
                                  src={`${API}/api/render/structure?smiles=${encodeURIComponent(smiles)}&width=300&height=160`}
                                  alt="Structure representation"
                                  style={{
                                    maxWidth: '90%',
                                    maxHeight: '90%',
                                    filter: 'invert(1) hue-rotate(180deg) brightness(1.2) contrast(1.1)',
                                  }}
                                />
                              </div>
                            )}
                            
                            <div style={{
                              fontSize: 8,
                              fontFamily: SCI_FONT.mono,
                              color: '#64748B',
                              wordBreak: 'break-all',
                              textAlign: 'center',
                            }}>
                              {smilesJ ? `${smiles} ➔ ${smilesJ}` : smiles}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Interactive Settings Tab */}
              {activeTab === 'SETTINGS' && (
                <div style={{ flex: 1, padding: 20, spaceY: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
                  
                  {/* Zoom controls */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>
                      ZOOM & TRANSLATION
                    </div>
                    
                    {/* Zoom scale */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B', marginBottom: 4 }}>
                        <span>Scale factor</span>
                        <span>{zoomScale.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="3.0"
                        step="0.05"
                        value={zoomScale}
                        onChange={e => setZoomScale(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: '#22D3EE' }}
                      />
                    </div>

                    {/* Pan X */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B', marginBottom: 4 }}>
                        <span>X Offset</span>
                        <span>{panX}px</span>
                      </div>
                      <input
                        type="range"
                        min="-400"
                        max="400"
                        step="5"
                        value={panX}
                        onChange={e => setPanX(parseInt(e.target.value))}
                        style={{ width: '100%', accentColor: '#22D3EE' }}
                      />
                    </div>

                    {/* Pan Y */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B', marginBottom: 4 }}>
                        <span>Y Offset</span>
                        <span>{panY}px</span>
                      </div>
                      <input
                        type="range"
                        min="-400"
                        max="400"
                        step="5"
                        value={panY}
                        onChange={e => setPanY(parseInt(e.target.value))}
                        style={{ width: '100%', accentColor: '#22D3EE' }}
                      />
                    </div>

                    {/* Quick reset */}
                    <button
                      onClick={() => { setZoomScale(1.0); setPanX(0); setPanY(0); }}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 4,
                        padding: '6px 0',
                        fontSize: 10,
                        fontFamily: SCI_FONT.mono,
                        color: '#CBD5E1',
                        cursor: 'pointer',
                        marginTop: 4,
                      }}
                    >
                      RESET TRANSFORMS
                    </button>
                  </div>

                  {/* Context-aware thresholds */}
                  {isCorrelation && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>
                        CORRELATION COEFFICIENT FILTER
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B', marginBottom: 4 }}>
                        <span>Minimum correlation |r|</span>
                        <span>{corrThreshold.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={corrThreshold}
                        onChange={e => setCorrThreshold(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: '#22D3EE' }}
                      />
                      <div style={{ fontSize: 9, color: '#64748B', fontFamily: SCI_FONT.mono, marginTop: 4 }}>
                        Filters out weak correlations from the workspace list live.
                      </div>
                    </div>
                  )}

                  {isWilliams && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>
                        WILLIAMS RESIDUAL FILTER
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B', marginBottom: 4 }}>
                        <span>Std residual limit (±σ)</span>
                        <span>{residualThreshold.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="1.5"
                        max="5.0"
                        step="0.1"
                        value={residualThreshold}
                        onChange={e => setResidualThreshold(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: '#22D3EE' }}
                      />
                      <div style={{ fontSize: 9, color: '#64748B', fontFamily: SCI_FONT.mono, marginTop: 4 }}>
                        Filters coordinates to study clusters within specified error bounds.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
};

/** Compact axis label rendered below or beside a chart */
export const SciAxisLabel: React.FC<{
  children: React.ReactNode;
  vertical?: boolean;
}> = ({ children, vertical = false }) => (
  <span
    style={{
      fontFamily: "'Inter', sans-serif",
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: '#64748B',
      display: 'block',
      textAlign: 'center',
      transform: vertical ? 'rotate(-90deg)' : undefined,
    }}
  >
    {children}
  </span>
);

/** Thin horizontal legend row */
export const SciLegend: React.FC<{
  items: Array<{ label: string; color: string }>;
}> = ({ items }) => (
  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '0 14px 10px' }}>
    {items.map((item, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            border: `1.5px solid ${item.color}`,
            background: 'transparent',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 10,
            color: '#94A3B8',
          }}
        >
          {item.label}
        </span>
      </div>
    ))}
  </div>
);
