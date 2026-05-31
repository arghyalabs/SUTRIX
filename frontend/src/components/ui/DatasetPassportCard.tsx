import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ShieldAlert, Award, Grid, Database, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export const DatasetPassportCard: React.FC = () => {
  const { datasetPassport } = useWorkspaceStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!datasetPassport) return null;

  const mode = datasetPassport.dataset_mode;
  const domain = datasetPassport.detected_domain;
  const confidence = datasetPassport.domain_confidence;
  const entity = datasetPassport.primary_entity_type;
  const rows = datasetPassport.row_count;
  const cols = datasetPassport.column_count;
  const missing = datasetPassport.missing_pct;
  const dups = datasetPassport.duplicate_pct;
  const recommended = datasetPassport.recommended_workflow;
  const warnings = datasetPassport.key_warnings || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full border rounded-2xl bg-slate-900/60 border-slate-800/80 backdrop-blur-md overflow-hidden shadow-lg shadow-cyan-500/[0.02]"
    >
      {/* Top Header Row */}
      <div 
        className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800/80 cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
            <Award className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-white tracking-widest uppercase">
            Dataset Identity Passport
          </span>
          <span className="text-xs text-slate-500 font-mono">
            v{datasetPassport.timestamp ? new Date(datasetPassport.timestamp * 1000).toLocaleDateString() : 'Active'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              mode === 'MOLECULAR' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              mode === 'HYBRID' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
              'bg-violet-500/10 text-violet-400 border border-violet-500/20'
            }`}>
              {mode} MODE
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold uppercase tracking-wider border border-slate-700">
              {domain}
            </span>
          </div>
          <button className="text-slate-400 hover:text-white transition-colors">
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Details Body */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                
                {/* Rows & Columns */}
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Dataset Sizing
                  </span>
                  <span className="text-lg font-bold text-white tracking-tight">
                    {rows.toLocaleString()} <span className="text-xs text-slate-400 font-normal">rows</span>
                  </span>
                  <span className="text-xs text-slate-400 mt-0.5">
                    {cols} features / columns
                  </span>
                </div>

                {/* Missing & Duplicates */}
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Quality Profiling
                  </span>
                  <span className="text-lg font-bold text-white tracking-tight">
                    {missing.toFixed(1)}% <span className="text-xs text-slate-400 font-normal">missing</span>
                  </span>
                  <span className="text-xs text-slate-400 mt-0.5">
                    {dups.toFixed(1)}% row duplication
                  </span>
                </div>

                {/* Entity & Mappings */}
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Scientific Context
                  </span>
                  <span className="text-lg font-bold text-cyan-400 tracking-tight">
                    {entity}
                  </span>
                  <span className="text-xs text-slate-400 mt-0.5">
                    Domain Confidence: {(confidence * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Recommendation */}
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Workflow Target
                  </span>
                  <span className="text-lg font-bold text-emerald-400 tracking-tight">
                    {recommended}
                  </span>
                  <span className="text-xs text-slate-400 mt-0.5">
                    Optimal interface loaded
                  </span>
                </div>

              </div>

              {/* Warnings Panel */}
              {warnings.length > 0 && (
                <div className="mt-5 p-4 border rounded-xl bg-amber-500/[0.03] border-amber-500/10">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400 mb-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    DATA QUALITY CHECKS: {warnings.length} ADVISORIES
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-400">
                    {warnings.map((w, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
