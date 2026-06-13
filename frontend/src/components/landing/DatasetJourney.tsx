import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Layers, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';

export const DatasetJourney: React.FC = () => {
  const [sliderPosition, setSliderPosition] = useState(50); // percentage 0-100
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  return (
    <section className="py-24 px-6 bg-[#030712] border-b border-white/[0.04]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 text-xs font-semibold text-cyan-400 mb-5">
            <Layers className="w-3.5 h-3.5" />
            Interactive Dataset Journey
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Before & After Comparison
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            Hover and slide across the dataset below to see SUTRIX cleanse and enrich messy experimental records in real-time.
          </p>
        </div>

        {/* Drag/Hover Container */}
        <div 
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onTouchMove={handleTouchMove}
          className="relative w-full h-[320px] rounded-3xl overflow-hidden border border-white/[0.08] bg-slate-950/40 select-none cursor-ew-resize"
        >
          {/* Left Side: Dirty Raw Data (Always visible underneath) */}
          <div className="absolute inset-0 w-full h-full p-6 font-mono text-xs text-red-400/80 bg-[#090308]/40">
            <div className="flex items-center gap-2 mb-4 text-red-400 font-bold border-b border-red-500/10 pb-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>RAW DATASET (Dirty, mixed formats, gaps)</span>
            </div>
            
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-white/20 border-b border-white/[0.04]">
                  <th className="py-2 px-2">Compound</th>
                  <th className="py-2 px-2">Species</th>
                  <th className="py-2 px-2">Value</th>
                  <th className="py-2 px-2">Unit</th>
                  <th className="py-2 px-2">SMILES</th>
                  <th className="py-2 px-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/[0.02] bg-red-500/[0.03]">
                  <td className="py-2.5 px-2 text-white/50">Aspirin</td>
                  <td className="py-2.5 px-2 text-white/50">rainbow trout</td>
                  <td className="py-2.5 px-2 text-red-400 font-bold">??</td>
                  <td className="py-2.5 px-2 text-red-400">ug/L</td>
                  <td className="py-2.5 px-2 text-white/30">CC(=O)Oc1ccccc1C(=O)O</td>
                  <td className="py-2.5 px-2 text-white/50">96h</td>
                </tr>
                <tr className="border-b border-white/[0.02] bg-red-500/[0.03]">
                  <td className="py-2.5 px-2 text-white/50">Phenol</td>
                  <td className="py-2.5 px-2 text-white/50">fathead minnow</td>
                  <td className="py-2.5 px-2 text-white/50">12.5</td>
                  <td className="py-2.5 px-2 text-white/50">mg/L</td>
                  <td className="py-2.5 px-2 text-red-400 font-bold">[MISSING]</td>
                  <td className="py-2.5 px-2 text-white/50">48h</td>
                </tr>
                <tr className="border-b border-white/[0.02] bg-red-500/[0.03]">
                  <td className="py-2.5 px-2 text-white/50">Paracetamol</td>
                  <td className="py-2.5 px-2 text-white/50">D. magna</td>
                  <td className="py-2.5 px-2 text-red-400 font-bold">-999.0</td>
                  <td className="py-2.5 px-2 text-red-400">ppm</td>
                  <td className="py-2.5 px-2 text-white/30">CC(=O)Nc1ccc(O)cc1</td>
                  <td className="py-2.5 px-2 text-white/50">24h</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Right Side: Clean Mapped Data (Clipped based on slider position) */}
          <div 
            className="absolute inset-0 h-full p-6 font-mono text-xs text-emerald-400 bg-[#020a0b]/90 border-r-2 border-cyan-400/40"
            style={{ width: `${sliderPosition}%`, overflow: 'hidden' }}
          >
            <div className="flex items-center gap-2 mb-4 text-emerald-400 font-bold border-b border-emerald-500/10 pb-2 min-w-[700px]">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>SUTRIX HARMONIZED OUTPUT (Enriched structures, corrected units, OECD audited)</span>
            </div>

            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="text-white/30 border-b border-white/[0.05]">
                  <th className="py-2 px-2">Compound</th>
                  <th className="py-2 px-2">Canonical Species</th>
                  <th className="py-2 px-2">Clean Value</th>
                  <th className="py-2 px-2">Canonical Unit</th>
                  <th className="py-2 px-2">MolWt</th>
                  <th className="py-2 px-2">LogP</th>
                  <th className="py-2 px-2">OECD check</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/[0.03]">
                  <td className="py-2.5 px-2 text-white/80">Aspirin</td>
                  <td className="py-2.5 px-2 text-white/80">Oncorhynchus mykiss</td>
                  <td className="py-2.5 px-2 text-emerald-400 font-bold">0.82</td>
                  <td className="py-2.5 px-2 text-emerald-400">mg/L</td>
                  <td className="py-2.5 px-2 text-cyan-300">180.16</td>
                  <td className="py-2.5 px-2 text-cyan-300">1.19</td>
                  <td className="py-2.5 px-2 text-emerald-400">Passed</td>
                </tr>
                <tr className="border-b border-white/[0.03]">
                  <td className="py-2.5 px-2 text-white/80">Phenol</td>
                  <td className="py-2.5 px-2 text-white/80">Pimephales promelas</td>
                  <td className="py-2.5 px-2 text-white/80">12.50</td>
                  <td className="py-2.5 px-2 text-white/80">mg/L</td>
                  <td className="py-2.5 px-2 text-cyan-300">94.11</td>
                  <td className="py-2.5 px-2 text-cyan-300">1.46</td>
                  <td className="py-2.5 px-2 text-emerald-400">Passed</td>
                </tr>
                <tr className="border-b border-white/[0.03]">
                  <td className="py-2.5 px-2 text-white/80">Paracetamol</td>
                  <td className="py-2.5 px-2 text-white/80">Daphnia magna</td>
                  <td className="py-2.5 px-2 text-emerald-400 font-bold">2.40</td>
                  <td className="py-2.5 px-2 text-emerald-400">mg/L</td>
                  <td className="py-2.5 px-2 text-cyan-300">151.16</td>
                  <td className="py-2.5 px-2 text-cyan-300">0.91</td>
                  <td className="py-2.5 px-2 text-emerald-400">Passed</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Draggable vertical bar handle */}
          <div 
            className="absolute top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] pointer-events-none z-20"
            style={{ left: `${sliderPosition}%` }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-cyan-400 border border-slate-900 shadow-xl flex items-center justify-center text-slate-950 font-bold text-xs">
              ↔
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
