import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Maximize2, Minimize2, ZoomIn, ZoomOut, RefreshCw, X, Copy, 
  HelpCircle, Sparkles, Activity
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface AtomNode {
  id: number;
  symbol: string;
  label: string;
  x: number;
  y: number;
  is_aromatic: boolean;
  is_donor: boolean;
  is_acceptor: boolean;
}

interface BondLink {
  source: number;
  target: number;
  type: string;
  is_aromatic: boolean;
}

interface GraphData {
  atoms: AtomNode[];
  bonds: BondLink[];
  formula: string;
  mw: number;
  tpsa: number;
  rotatable_bonds: number;
  iupac_name: string;
}

interface LigandStructureVisualizerProps {
  smiles: string;
  compoundName: string;
  onClose: () => void;
  category?: string;
  apiBase: string;
}

export const LigandStructureVisualizer: React.FC<LigandStructureVisualizerProps> = ({
  smiles,
  compoundName,
  onClose,
  category = "ORGANIC COMPOUND",
  apiBase
}) => {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [highlightMode, setHighlightMode] = useState<'none' | 'aromatics' | 'donors' | 'acceptors'>('none');
  
  // Viewport transforms
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportWidth = 800;
  const viewportHeight = 600;

  useEffect(() => {
    let isMounted = true;
    const fetchGraph = async () => {
      setLoading(true);
      try {
        const url = `${apiBase}/api/explorer/structure/graph?smiles=${encodeURIComponent(smiles)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch molecular graph coordinates');
        const json: GraphData = await res.json();
        if (isMounted) {
          setData(json);
          // Reset zoom/pan
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to load interactive molecular structure');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchGraph();
    return () => { isMounted = false; };
  }, [smiles, apiBase]);

  // Center & Fit coordinates calculation
  const transformedAtoms = useMemo(() => {
    if (!data || data.atoms.length === 0) return [];
    
    // RDKit coordinates are in arbitrary units, let's find the bounding box
    const xs = data.atoms.map(a => a.x);
    const ys = data.atoms.map(a => a.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    const dx = maxX - minX || 1;
    const dy = maxY - minY || 1;
    
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    
    // Scale to fit viewport with padding
    const padding = 100;
    const scaleX = (viewportWidth - padding * 2) / dx;
    const scaleY = (viewportHeight - padding * 2) / dy;
    const autoScale = Math.min(scaleX, scaleY, 45); // cap at 45

    // Transform points to center them in the SVG viewport
    return data.atoms.map(atom => {
      // Invert Y axis because RDKit uses standard Cartesian but SVG uses top-left origin
      const x = viewportWidth / 2 + (atom.x - cx) * autoScale;
      const y = viewportHeight / 2 - (atom.y - cy) * autoScale;
      return { ...atom, x, y };
    });
  }, [data]);

  // Look up coordinates helper for bonds drawing
  const atomCoords = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>();
    transformedAtoms.forEach(a => map.set(a.id, { x: a.x, y: a.y }));
    return map;
  }, [transformedAtoms]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // only left click drag
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) {
      setZoom(prev => Math.min(prev * zoomFactor, 5));
    } else {
      setZoom(prev => Math.max(prev / zoomFactor, 0.4));
    }
  };

  // Zoom controls
  const zoomIn = () => setZoom(prev => Math.min(prev * 1.2, 5));
  const zoomOut = () => setZoom(prev => Math.max(prev / 1.2, 0.4));
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Copy helpers
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  // Helper to calculate bond parallel double-lines
  const getDoubleBondLines = (x1: number, y1: number, x2: number, y2: number, offset = 4.5) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    return {
      line1: { x1: x1 + nx * offset, y1: y1 + ny * offset, x2: x2 + nx * offset, y2: y2 + ny * offset },
      line2: { x1: x1 - nx * offset, y1: y1 - ny * offset, x2: x2 - nx * offset, y2: y2 - ny * offset }
    };
  };

  return (
    <div className="w-full h-full flex flex-col md:flex-row bg-[#080f25] text-white overflow-hidden select-none">
      
      {/* LEFT SECTION: Visualizer Viewport */}
      <div className="flex-1 relative flex flex-col p-6 overflow-hidden">
        
        {/* Top toolbar */}
        <div className="flex items-center justify-between shrink-0 mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/40 font-mono">
              LIGAND STRUCTURE VISUALIZER
            </span>
          </div>
          
          {/* Highlights Options */}
          <div className="flex items-center gap-1.5 bg-[#050816]/60 border border-white/[0.05] p-1 rounded-xl text-xs">
            <span className="text-white/40 px-2 uppercase tracking-wider text-[9px] font-bold">Highlights</span>
            {[
              { id: 'none', label: 'None' },
              { id: 'aromatics', label: 'Aromatics' },
              { id: 'donors', label: 'H-Donors' },
              { id: 'acceptors', label: 'H-Acceptors' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setHighlightMode(t.id as any)}
                className={`px-3 py-1 rounded-lg font-semibold transition-all text-[11px]
                  ${highlightMode === t.id 
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                    : 'text-white/40 hover:text-white/60 border border-transparent'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Large skeletal formula title */}
        <div className="shrink-0 mb-2">
          <h2 className="text-lg xl:text-xl font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-6 rounded-full bg-cyan-400" />
            {compoundName} 2D SKELETAL FORMULA
          </h2>
        </div>

        {/* VIEWPORT CANVAS CONTAINER */}
        <div 
          className="flex-1 rounded-2xl bg-black/40 border border-white/[0.06] relative overflow-hidden cursor-grab active:cursor-grabbing shadow-inner"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          onWheel={handleWheel}
        >
          {/* Grid dot overlay pattern */}
          <div className="absolute inset-0 opacity-[0.025] pointer-events-none" 
            style={{ 
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', 
              backgroundSize: '20px 20px' 
            }} 
          />

          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/30 text-xs font-mono">
              <RefreshCw className="w-7 h-7 animate-spin text-cyan-400" />
              BUILDING 2D ATOMIC GRAPH...
            </div>
          ) : (
            <svg 
              ref={svgRef}
              width="100%" 
              height="100%" 
              viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
              className="w-full h-full"
            >
              {/* Outer transform group */}
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                
                {/* 1. DRAW BONDS/LINKS */}
                {data?.bonds.map((bond, idx) => {
                  const src = atomCoords.get(bond.source);
                  const tgt = atomCoords.get(bond.target);
                  if (!src || !tgt) return null;
                  
                  const isAromaticHighlight = highlightMode === 'aromatics' && bond.is_aromatic;
                  const bondColor = isAromaticHighlight ? '#a78bfa' : '#4b5563';
                  const strokeWidth = 4.5;
                  
                  // Double bond rendering
                  if (bond.type === 'DOUBLE') {
                    const { line1, line2 } = getDoubleBondLines(src.x, src.y, tgt.x, tgt.y, 4.0);
                    return (
                      <g key={`bond-${idx}`}>
                        <line 
                          x1={line1.x1} y1={line1.y1} x2={line1.x2} y2={line1.y2}
                          stroke={bondColor} strokeWidth={2.5} strokeLinecap="round"
                        />
                        <line 
                          x1={line2.x1} y1={line2.y1} x2={line2.x2} y2={line2.y2}
                          stroke={bondColor} strokeWidth={2.5} strokeLinecap="round"
                        />
                      </g>
                    );
                  }
                  
                  // Triple bond rendering
                  if (bond.type === 'TRIPLE') {
                    const { line1, line2 } = getDoubleBondLines(src.x, src.y, tgt.x, tgt.y, 5.5);
                    return (
                      <g key={`bond-${idx}`}>
                        <line 
                          x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                          stroke={bondColor} strokeWidth={2.0} strokeLinecap="round"
                        />
                        <line 
                          x1={line1.x1} y1={line1.y1} x2={line1.x2} y2={line1.y2}
                          stroke={bondColor} strokeWidth={2.0} strokeLinecap="round"
                        />
                        <line 
                          x1={line2.x1} y1={line2.y1} x2={line2.x2} y2={line2.y2}
                          stroke={bondColor} strokeWidth={2.0} strokeLinecap="round"
                        />
                      </g>
                    );
                  }

                  // Single or Aromatic bonds
                  return (
                    <line 
                      key={`bond-${idx}`}
                      x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                      stroke={bondColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={bond.type === 'AROMATIC' ? '5,4' : undefined}
                      strokeLinecap="round"
                    />
                  );
                })}

                {/* 2. DRAW ATOM NODES */}
                {transformedAtoms.map((atom) => {
                  const isAromaticHighlight = highlightMode === 'aromatics' && atom.is_aromatic;
                  const isDonorHighlight = highlightMode === 'donors' && atom.is_donor;
                  const isAcceptorHighlight = highlightMode === 'acceptors' && atom.is_acceptor;
                  const isHighlighted = isAromaticHighlight || isDonorHighlight || isAcceptorHighlight;

                  // Styling constants depending on Atom Symbol
                  let bgFill = '#1f2937';
                  let borderStroke = '#374151';
                  let hasLabel = atom.label.length > 0;
                  let radius = hasLabel ? 16 : 8;

                  if (atom.symbol === 'O') {
                    bgFill = '#450a0a'; // dark red
                    borderStroke = '#dc2626'; // bright red
                  } else if (atom.symbol === 'N') {
                    bgFill = '#172554'; // dark blue
                    borderStroke = '#2563eb'; // bright blue
                  } else if (atom.symbol === 'S') {
                    bgFill = '#451a03'; // brown
                    borderStroke = '#d97706'; // amber
                  } else if (['F', 'Cl', 'Br', 'I'].includes(atom.symbol)) {
                    bgFill = '#022c22'; // dark green
                    borderStroke = '#059669'; // green
                  } else if (atom.label === 'CH3') {
                    bgFill = '#1e293b'; // slate
                    borderStroke = '#64748b'; // slate light
                  }

                  return (
                    <g key={`atom-${atom.id}`}>
                      {/* GLOwing halo if highlighted */}
                      {isHighlighted && (
                        <circle 
                          cx={atom.x} cy={atom.y} r={radius + 7}
                          fill={isAromaticHighlight ? '#8b5cf6' : isDonorHighlight ? '#f43f5e' : '#10b981'}
                          fillOpacity={0.15}
                          className="animate-pulse"
                        />
                      )}
                      
                      {/* Atom Node circle */}
                      <circle 
                        cx={atom.x} cy={atom.y} r={radius}
                        fill={bgFill}
                        stroke={isHighlighted ? (isAromaticHighlight ? '#a78bfa' : isDonorHighlight ? '#fb7185' : '#34d399') : borderStroke}
                        strokeWidth={2}
                      />
                      
                      {/* Atom symbol text label */}
                      {hasLabel && (
                        <text 
                          x={atom.x} y={atom.y + 3.5}
                          fill="#ffffff"
                          fontSize="10px"
                          fontWeight="bold"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {atom.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* Controls overlay (Bottom Left) */}
          <div className="absolute bottom-5 left-5 flex gap-1.5 bg-[#050816]/80 backdrop-blur-md border border-white/[0.06] p-1.5 rounded-xl shadow-lg">
            <button onClick={zoomIn} title="Zoom In" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={zoomOut} title="Zoom Out" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={resetView} title="Reset View" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Info overlay (Bottom Center) */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-[#050816]/75 backdrop-blur-md border border-white/[0.04] px-4 py-2 rounded-xl text-[10px] text-white/40 font-medium tracking-wide flex items-center gap-1.5 shadow-lg select-none">
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            Scroll wheel to zoom. Drag to pan chemical skeletal formula.
          </div>
        </div>
      </div>

      {/* RIGHT SECTION: Dossier panel */}
      <div className="w-full md:w-[380px] shrink-0 border-l border-white/[0.06] bg-[#0b1329]/60 backdrop-blur-lg p-6 flex flex-col justify-between overflow-y-auto custom-scrollbar">
        
        {/* Close Button */}
        <div className="flex justify-end shrink-0">
          <button 
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-white/50 hover:bg-white/5 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all"
          >
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>

        {/* Header and Titles */}
        <div className="my-6 space-y-2 shrink-0">
          <span className="px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-extrabold uppercase tracking-wider font-mono">
            {category}
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-white uppercase">
            {compoundName}
          </h1>
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
            STRUCTURE TELEMETRY DOSSIER
          </p>
        </div>

        {/* Key Properties (TOC format layout) */}
        <div className="flex-1 space-y-6 py-4">
          <div>
            <h3 className="text-[10px] font-extrabold text-white/30 uppercase tracking-widest mb-3">
              KEY STRUCTURAL PROPERTIES
            </h3>
            
            <div className="space-y-3.5 text-xs font-medium">
              
              {/* IUPAC Name */}
              <div className="border-b border-white/[0.03] pb-2.5">
                <div className="flex justify-between items-start mb-1 text-[11px]">
                  <span className="text-white/40">IUPAC Name</span>
                  <button 
                    onClick={() => copyToClipboard(data?.iupac_name || 'N/A', 'IUPAC Name')} 
                    className="text-white/20 hover:text-cyan-400 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <p className="font-mono text-cyan-400/90 text-[11.5px] leading-relaxed break-words max-h-16 overflow-y-auto custom-scrollbar">
                  {loading ? 'Fetching IUPAC Name...' : data?.iupac_name || 'N/A'}
                </p>
              </div>

              {/* Chemical Formula */}
              <div className="border-b border-white/[0.03] pb-2.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-white/40">Formula</span>
                  <span className="font-mono text-white font-bold text-[12px]">{loading ? '...' : data?.formula || 'N/A'}</span>
                </div>
              </div>

              {/* Molecular Weight */}
              <div className="border-b border-white/[0.03] pb-2.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-white/40">Molecular Weight</span>
                  <span className="font-mono text-white font-bold">{loading ? '...' : `${data?.mw.toFixed(2)} g/mol`}</span>
                </div>
              </div>

              {/* Rotatable Bonds */}
              <div className="border-b border-white/[0.03] pb-2.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-white/40">Rotatable Bonds</span>
                  <span className="font-mono text-white font-bold">{loading ? '...' : data?.rotatable_bonds}</span>
                </div>
              </div>

              {/* Polar Surface Area (PSA) */}
              <div className="border-b border-white/[0.03] pb-2.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-white/40">Polar Surface Area (PSA)</span>
                  <span className="font-mono text-cyan-400 font-bold">{loading ? '...' : `${data?.tpsa.toFixed(2)} Å²`}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SMILES Notation (Bottom) */}
        <div className="mt-6 border-t border-white/[0.06] pt-6 shrink-0">
          <div className="flex justify-between items-center text-[9px] font-bold text-white/30 uppercase tracking-widest mb-2">
            <span>SMILES NOTATION</span>
            <button onClick={() => copyToClipboard(smiles, 'SMILES')} className="hover:text-cyan-400 text-white/20 transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="bg-[#050816] rounded-xl p-3.5 font-mono text-[10px] text-white/70 border border-white/[0.05] break-all select-all leading-normal">
            {smiles}
          </div>
        </div>
      </div>
    </div>
  );
};
