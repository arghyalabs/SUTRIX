import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import CountUpComponent from 'react-countup';
import { Layers, Activity, Award, BarChart3 } from 'lucide-react';

const CountUp = (CountUpComponent as any).default || CountUpComponent;

interface StatDef {
  label: string;
  count: number;
  suffix: string;
  desc: string;
}

const STATS: StatDef[] = [
  { label: 'Descriptor Families', count: 30, suffix: '+', desc: 'Constitutional, Topological, Quantum Chemical, etc.' },
  { label: 'Descriptors Available', count: 5000, suffix: '+', desc: 'SMILES properties via RDKit and Mordred calculatives.' },
  { label: 'Supported Formats', count: 20, suffix: '+', desc: 'CSV, XLSX, Parquet, SDF, SMI, ZIP structures.' },
  { label: 'ML Algorithms', count: 15, suffix: '+', desc: 'Random Forest, XGBoost, ExtraTrees, SVM, etc.' },
  { label: 'OECD Checks', count: 5, suffix: '+', desc: 'Applicability domains, endpoint alignments, safety audits.' },
];

export const StatsDashboard: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section ref={ref} className="py-24 px-6 bg-[#030712] border-b border-white/[0.04]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 text-xs font-semibold text-cyan-400 mb-5">
            <Activity className="w-3.5 h-3.5" />
            Platform Capabilities
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Live Statistics Dashboard
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            Review the scale of chemical calculations, formats, and regulatory audits compiled in SUTRIX.
          </p>
        </div>

        {/* Counter Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
          {STATS.map(stat => (
            <div 
              key={stat.label} 
              className="p-5 rounded-2xl border border-white/[0.04] bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02] text-center space-y-2 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="text-3xl lg:text-5xl font-black text-cyan-400 select-none">
                  {inView ? (
                    <CountUp end={stat.count} duration={2.5} separator="," />
                  ) : (
                    0
                  )}
                  {stat.suffix}
                </div>
                <h4 className="text-xs font-bold text-white mt-3 leading-snug">{stat.label}</h4>
              </div>
              <p className="text-[10px] text-white/30 leading-normal pt-2 border-t border-white/[0.03] mt-4">
                {stat.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
