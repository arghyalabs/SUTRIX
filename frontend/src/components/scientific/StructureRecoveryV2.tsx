import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { structureRecoveryV2Api } from '../../services/structureRecoveryV2Api';
import { apiClient } from '../../services/apiClient';
import { 
  Zap, Clock, Play, AlertCircle, CheckCircle2, RefreshCw, XCircle, ChevronRight, HelpCircle 
} from 'lucide-react';

interface StructureRecoveryV2Props {
  columnToResolve: string;
  onComplete: () => void;
}

export const StructureRecoveryV2: React.FC<StructureRecoveryV2Props> = ({
  columnToResolve,
  onComplete,
}) => {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const activeJobId = useWorkspaceStore((state) => state.activeJobId);
  const setActiveJobId = useWorkspaceStore((state) => state.setActiveJobId);
  const activeJobType = useWorkspaceStore((state) => state.activeJobType);
  const setActiveJobType = useWorkspaceStore((state) => state.setActiveJobType);

  // Estimates state
  const [estimates, setEstimates] = useState<any>(null);
  const [loadingEstimates, setLoadingEstimates] = useState<boolean>(false);

  // Selected parameters
  const [limit, setLimit] = useState<number>(100);
  const [recoveryMode, setRecoveryMode] = useState<'quick' | 'batch' | 'massive'>('quick');
  const [sources, setSources] = useState<string[]>(['pubchem', 'chembl', 'comptox']);

  // Active Job progress state
  const [jobProgress, setJobProgress] = useState<any>(null);
  const [polling, setPolling] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch estimates on load
  const fetchEstimates = async () => {
    if (!workspaceId || !columnToResolve) return;
    setLoadingEstimates(true);
    try {
      const est = await structureRecoveryV2Api.estimate(workspaceId, columnToResolve, sources);
      setEstimates(est);

      // Smart defaults logic based on uncached compounds
      const toFetch = est.to_fetch;
      if (toFetch < 100) {
        setLimit(-1);
        setRecoveryMode('massive');
      } else if (toFetch < 1000) {
        setLimit(100);
        setRecoveryMode('quick');
      } else if (toFetch < 5000) {
        setLimit(500);
        setRecoveryMode('quick');
      } else {
        setLimit(1000);
        setRecoveryMode('quick');
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingEstimates(false);
    }
  };

  useEffect(() => {
    fetchEstimates();
  }, [workspaceId, columnToResolve]);

  // Submit Job
  const handleStartRecovery = async () => {
    if (!workspaceId || !columnToResolve) return;
    setError(null);
    try {
      const res = await structureRecoveryV2Api.startRecovery(
        workspaceId,
        columnToResolve,
        recoveryMode,
        limit,
        sources
      );
      if (res.success && res.job_id) {
        setActiveJobId(res.job_id);
        setActiveJobType('recovery_v2');
        setPolling(true);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to initialize structures recovery worker.');
    }
  };

  // Poll progress V2
  useEffect(() => {
    let timer: any;
    const poll = async () => {
      if (!workspaceId || !activeJobId || activeJobType !== 'recovery_v2') {
        setPolling(false);
        return;
      }
      try {
        const status = await structureRecoveryV2Api.getStatus(workspaceId);
        setJobProgress(status);

        if (status.status === 'COMPLETED') {
          setPolling(false);
          setActiveJobId('');
          setActiveJobType(null);
          onComplete();
        } else if (status.status === 'FAILED' || status.status === 'CANCELLED') {
          setPolling(false);
          setError(status.error_message || 'Recovery task execution aborted.');
        } else {
          timer = setTimeout(poll, 1500);
        }
      } catch (err) {
        console.error(err);
        setPolling(false);
      }
    };

    if (polling || (activeJobId && activeJobType === 'recovery_v2')) {
      poll();
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [workspaceId, activeJobId, polling, activeJobType]);

  const handleCancel = async () => {
    if (!activeJobId) return;
    try {
      await apiClient.post('/api/jobs/cancel', { client_id: workspaceId });
    } catch (e) {
      // Direct Cancel fallback
    }
    setPolling(false);
    setActiveJobId('');
    setActiveJobType(null);
    setJobProgress(null);
  };

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="border-b border-white/[0.04] pb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />
          Tiered Structure Recovery System V2
        </h3>
        <p className="text-xs text-white/40 leading-relaxed mt-1">
          Resolves raw compound identifiers/names to publications-ready Canonical SMILES structural keys.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!activeJobId ? (
          <motion.div
            key="config"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-6"
          >
            {/* ESTIMATES PANEL */}
            {loadingEstimates ? (
              <div className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl flex items-center justify-center py-10 gap-3">
                <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                <span className="text-xs text-white/50">Analyzing dataset compounds & cross-workspace cache DB...</span>
              </div>
            ) : estimates ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Metrics */}
                <div className="lg:col-span-5 bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block mb-3">
                    Dataset Inventory
                  </span>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-2xl font-bold text-white font-mono">{estimates.unique_compounds}</span>
                      <span className="text-[10px] text-white/40 block mt-0.5">Unique Compounds</span>
                    </div>
                    <div>
                      <span className="text-2xl font-bold text-emerald-400 font-mono">{estimates.cached_already}</span>
                      <span className="text-[10px] text-emerald-400/60 block mt-0.5">Cached in DB</span>
                    </div>
                  </div>
                  <div className="border-t border-white/[0.04] mt-4 pt-3 flex items-center justify-between">
                    <span className="text-xs text-white/40">Pending Fetch:</span>
                    <span className="text-xs font-bold text-cyan-300 font-mono">{estimates.to_fetch} compounds</span>
                  </div>
                </div>

                {/* ETAs */}
                <div className="lg:col-span-7 bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                      Online Retrieval ETAs
                    </span>
                    <button onClick={fetchEstimates} className="text-[10px] font-bold text-cyan-400 flex items-center gap-1 hover:underline">
                      <RefreshCw className="w-2.5 h-2.5" /> Refresh Cache Metrics
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 flex-1">
                    {Object.entries(estimates.estimates_per_source || {}).map(([src, estItem]: [string, any]) => (
                      <div key={src} className="bg-white/[0.02] border border-white/[0.04] p-3 rounded-2xl flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-white/50 capitalize">{src}</span>
                        <div className="my-2">
                          <span className="text-lg font-bold text-white font-mono block">~{estItem.estimated_display}</span>
                          <span className="text-[9px] text-white/30">{estItem.rate_per_min} req/min limit</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* RECOVERY PARAMETERS MODE SELECTOR */}
            <div className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block mb-4">
                Recovery Pipeline Parameters
              </span>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div 
                  onClick={() => { setRecoveryMode('quick'); setLimit(100); }}
                  className={`p-4 rounded-2xl cursor-pointer border text-left transition-all
                    ${recoveryMode === 'quick' && limit === 100 
                      ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.08)]' 
                      : 'bg-white/[0.01] border-white/[0.04] hover:bg-white/[0.03]'}`}
                >
                  <h4 className="text-xs font-bold text-white mb-1">Quick Resolve (100)</h4>
                  <p className="text-[10px] text-white/40">Resolves first 100 unique compounds. Instant preview.</p>
                </div>

                <div 
                  onClick={() => { setRecoveryMode('quick'); setLimit(500); }}
                  className={`p-4 rounded-2xl cursor-pointer border text-left transition-all
                    ${recoveryMode === 'quick' && limit === 500 
                      ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.08)]' 
                      : 'bg-white/[0.01] border-white/[0.04] hover:bg-white/[0.03]'}`}
                >
                  <h4 className="text-xs font-bold text-white mb-1">Standard Batch (500)</h4>
                  <p className="text-[10px] text-white/40">Resolves up to 500 unique compounds.</p>
                </div>

                <div 
                  onClick={() => { setRecoveryMode('massive'); setLimit(-1); }}
                  className={`p-4 rounded-2xl cursor-pointer border text-left transition-all
                    ${recoveryMode === 'massive' 
                      ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.08)]' 
                      : 'bg-white/[0.01] border-white/[0.04] hover:bg-white/[0.03]'}`}
                >
                  <h4 className="text-xs font-bold text-white mb-1">Complete Dataset (All)</h4>
                  <p className="text-[10px] text-white/40">Resolves every compound. Recommended for full modeling.</p>
                </div>
              </div>

              {/* Source priority indicator */}
              <div className="border-t border-white/[0.04] pt-4 flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="text-white/40">Execution Priority Sequence:</span>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-cyan-500/10 text-cyan-300 font-bold rounded-lg border border-cyan-500/10">1. PubChem</span>
                  <span className="text-white/20">→</span>
                  <span className="px-2.5 py-1 bg-violet-500/10 text-violet-300 font-bold rounded-lg border border-violet-500/10">2. ChEMBL</span>
                  <span className="text-white/20">→</span>
                  <span className="px-2.5 py-1 bg-amber-500/10 text-amber-300 font-bold rounded-lg border border-amber-500/10">3. CompTox</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ACTION FOOTER */}
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                onClick={handleStartRecovery}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-bold text-sm shadow-[0_4px_14px_rgba(255,255,255,0.15)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.25)] hover:-translate-y-0.5 transition-all"
              >
                <Play className="w-4 h-4 fill-black" /> Initialize Recovery V2
              </button>
            </div>
          </motion.div>
        ) : (
          /* ACTIVE POLLING PROGRESS BAR */
          <motion.div
            key="progress"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white/[0.02] border border-white/[0.04] p-6 rounded-3xl flex flex-col gap-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                <span className="text-sm font-bold text-white">
                  {jobProgress?.phase || 'Queued in background task worker queue...'}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-cyan-400">
                {jobProgress?.progress ?? 0}%
              </span>
            </div>

            {/* Progress line */}
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-cyan-400 to-violet-500"
                style={{ width: `${jobProgress?.progress ?? 0}%` }}
                layout
              />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-4 border-t border-b border-white/[0.04] py-4">
              <div>
                <span className="text-[10px] text-white/30 block mb-0.5">Speed</span>
                <span className="text-sm font-bold text-white font-mono">
                  {jobProgress?.compounds_per_sec ?? 0} cpd/sec
                </span>
              </div>
              <div>
                <span className="text-[10px] text-white/30 block mb-0.5">Time Remaining</span>
                <span className="text-sm font-bold text-white font-mono">
                  {jobProgress?.eta_seconds ? `${Math.ceil(jobProgress.eta_seconds)}s` : 'estimating...'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-white/30 block mb-0.5">Task Status</span>
                <span className="text-xs font-bold text-cyan-400 uppercase">
                  {jobProgress?.status || 'QUEUED'}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-xl transition-all"
              >
                Abort & Continue
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
