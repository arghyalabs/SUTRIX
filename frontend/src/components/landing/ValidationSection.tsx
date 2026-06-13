import React from 'react';
import { ShieldCheck, CheckCircle2, Award, FileText } from 'lucide-react';

interface ValidationItem {
  name: string;
  desc: string;
}

const OECD_PRINCIPLES: ValidationItem[] = [
  { name: 'Defined Endpoint', desc: 'Ensures target values map to canonical endpoints (e.g. Fish 96h LC50) with standardized units.' },
  { name: 'Defined Algorithm', desc: 'Generates transparent descriptor matrices directly integrated into scikit-learn & XGBoost scripts.' },
  { name: 'Applicability Domain', desc: 'Computes chemical domain ranges using Mahalanobis distance checks to flag predictions outside training ranges.' },
  { name: 'Goodness of Fit', desc: 'Calculates structural regression metrics, providing standard error profiles and diagnostic charts.' },
  { name: 'Mechanistic Interpretation', desc: 'Logs compound descriptor importance coefficients, mapping mathematical weights to toxicological modes of action.' },
];

const AI_METRICS: ValidationItem[] = [
  { name: 'Feature Coverage', desc: 'Audits feature sparsity, dropping molecular descriptors with zero variance across dataset samples.' },
  { name: 'Missingness Profiles', desc: 'Flags incomplete records, enforcing standard threshold drops (< 5% missing cells) prior to training.' },
  { name: 'Data Balance', desc: 'Audits classification distributions, warning of major class biases and recommending balancing steps.' },
  { name: 'Chemical Diversity', desc: 'Profiles compound scaffold distributions and calculates Tanimoto similarity index statistics.' },
  { name: 'Predictability assessment', desc: 'Calculates cross-validation predictability factors ($Q^2$) alongside training fitting metrics ($R^2$).' },
];

export const ValidationSection: React.FC = () => {
  return (
    <section className="py-24 px-6 bg-[#030712] border-b border-white/[0.04]">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 text-xs font-semibold text-cyan-400 mb-5">
            <Award className="w-3.5 h-3.5" />
            Validation Standards
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4">
            Scientific Validation Registry
          </h2>
          <p className="text-white/40 text-lg max-w-xl mx-auto">
            SUTRIX datasets satisfy both chemical regulatory standards (OECD) and advanced machine learning modeling checks.
          </p>
        </div>

        {/* Validation Split Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* OECD Principles */}
          <div className="rounded-3xl glass-elevated border border-white/[0.06] p-6 lg:p-8 space-y-6">
            <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">OECD Principles Supported</h3>
                <span className="text-[10px] text-white/40">Regulatory compliance guidelines</span>
              </div>
            </div>

            <div className="space-y-4">
              {OECD_PRINCIPLES.map(item => (
                <div key={item.name} className="flex items-start gap-3.5 group">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">{item.name}</h4>
                    <p className="text-xs text-white/40 leading-relaxed mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Metrics */}
          <div className="rounded-3xl glass-elevated border border-white/[0.06] p-6 lg:p-8 space-y-6">
            <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">AI Validation Metrics</h3>
                <span className="text-[10px] text-white/40">Model suitability checks</span>
              </div>
            </div>

            <div className="space-y-4">
              {AI_METRICS.map(item => (
                <div key={item.name} className="flex items-start gap-3.5 group">
                  <CheckCircle2 className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-violet-300 transition-colors">{item.name}</h4>
                    <p className="text-xs text-white/40 leading-relaxed mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
