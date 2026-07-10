import React, { useEffect, useState, useMemo } from 'react';
import { API_BASE_URL } from '../../config';
import { Play, Ban, ChevronRight, Cpu, Zap, Beaker, Activity, Terminal, Search, CheckSquare, Square, ListFilter, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Progress from '@radix-ui/react-progress';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { enrichmentApi } from '../../services/enrichmentApi';
import { LogoLoader } from '../ui/SUTRIXLogo';

interface DescriptorEnrichmentProps {
  enrichmentMode: 'fast' | 'standard' | 'full';
  setEnrichmentMode: (mode: 'fast' | 'standard' | 'full') => void;
  includeMordred: boolean;
  setIncludeMordred: (include: boolean) => void;
  handleRunEnrichment: () => Promise<void>;
  handleCancelJob: () => Promise<void>;
  handleFetchEnrichmentResults: () => Promise<void>;
  socket: any;
  ramUsage: number;
  fps: number;
}

const modes = [
  {
    id: 'fast' as const,
    label: 'Fast Mode',
    icon: Zap,
    accent: 'cyan',
    desc: '9 core properties (MW, LogP, TPSA, HBD/A, RB, AROM, QED, SlogP)',
    color: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/30',
    activeText: 'text-cyan-400',
  },
  {
    id: 'standard' as const,
    label: 'Standard Mode',
    icon: Beaker,
    accent: 'violet',
    desc: 'RDKit 2D+3D suite — ~208 descriptors',
    color: 'from-violet-500/10 to-violet-500/5 border-violet-500/30',
    activeText: 'text-violet-400',
  },
  {
    id: 'full' as const,
    label: 'Full Research',
    icon: Cpu,
    accent: 'rose',
    desc: '2,043 2D/3D descriptors via Mordred',
    color: 'from-rose-500/10 to-rose-500/5 border-rose-500/30',
    activeText: 'text-rose-400',
  },
];

const FAST_DESCRIPTORS = ['MolWt', 'LogP', 'TPSA', 'HBA', 'HBD', 'RotatableBonds', 'RingCount', 'HeavyAtomCount', 'FractionCSP3'];

const RECOMMENDED_RDKIT = [
  'MolWt', 'MolLogP', 'TPSA', 'NumHDonors', 'NumHAcceptors', 
  'NumRotatableBonds', 'RingCount', 'HeavyAtomCount', 'FractionCSP3', 'QED', 'BertzCT', 'MaxPartialCharge'
];

const RECOMMENDED_MORDRED = [
  'ABC', 'ABCGG', 'nAcid', 'nBase', 'SpAbs_A', 'SpMax_A', 'SpDiam_A', 
  'SpAD_A', 'SpMAD_A', 'LogEE_A', 'VE1_A', 'VE2_A', 'VE3_A', 'VR1_A', 'VR2_A', 'VR3_A', 'Vv'
];

export const DescriptorEnrichment: React.FC<DescriptorEnrichmentProps> = ({
  enrichmentMode,
  setEnrichmentMode,
  includeMordred,
  setIncludeMordred,
  handleRunEnrichment,
  handleCancelJob,
  handleFetchEnrichmentResults,
  socket,
}) => {
  const { activeJobType, selectedDescriptors, setSelectedDescriptors } = useWorkspaceStore();
  const isRunning = socket.jobStatus === 'RUNNING' && activeJobType === 'enrichment';
  // isCompleted requires socket to have actually received COMPLETED this session (progress===100)
  // This prevents the Assemble button from reappearing after workspace re-entry from stale persisted state
  const isCompleted = socket.jobStatus === 'COMPLETED' && activeJobType === 'enrichment' && socket.progress === 100;

  const [rdkitAvailable, setRdkitAvailable] = useState<string[]>([]);
  const [mordredAvailable, setMordredAvailable] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [preGenSummary, setPreGenSummary] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    const fetchDescriptors = async () => {
      try {
        const data = await enrichmentApi.fetchAvailableDescriptors();
        if (mounted) {
          setRdkitAvailable(data.rdkit || []);
          setMordredAvailable(data.mordred || []);
        }
      } catch (err) {
        console.error('Failed to fetch descriptors', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    const fetchPreGenSummary = async () => {
      try {
        const { workspaceId } = useWorkspaceStore.getState();
        if (!workspaceId) return;
        const res = await fetch(`${API_BASE_URL}/api/descriptors/${workspaceId}/pre-generation-summary`);
        if (res.ok) {
          const data = await res.json();
          if (mounted) setPreGenSummary(data);
        }
      } catch (err) {
        console.error('Failed to fetch pre-gen summary', err);
      }
    };
    fetchDescriptors();
    fetchPreGenSummary();
    return () => { mounted = false; };
  }, []);

  const searchWords = searchQuery.toLowerCase().split(' ').filter(w => w);

  const filterList = (list: string[]) => {
    if (searchWords.length === 0) return list;
    return list.filter(d => {
      const dLower = d.toLowerCase();
      // Act like Google Search: All keywords must match somewhere in the descriptor name
      return searchWords.every(word => dLower.includes(word));
    });
  };

  const filteredRdkit = useMemo(() => filterList(rdkitAvailable), [rdkitAvailable, searchQuery]);
  const filteredMordred = useMemo(() => filterList(mordredAvailable), [mordredAvailable, searchQuery]);

  // O(1) Set lookups instead of O(n) Array.includes() on every render — critical for 2251 descriptors
  const selectedSet = useMemo(() => new Set(selectedDescriptors), [selectedDescriptors]);
  const rdkitSet = useMemo(() => new Set(rdkitAvailable), [rdkitAvailable]);

  const rdkitRecommended = useMemo(() => filteredRdkit.filter(d => RECOMMENDED_RDKIT.includes(d)), [filteredRdkit]);
  const rdkitOther = useMemo(() => filteredRdkit.filter(d => !RECOMMENDED_RDKIT.includes(d)), [filteredRdkit]);

  const mordredRecommended = useMemo(() => filteredMordred.filter(d => RECOMMENDED_MORDRED.includes(d)), [filteredMordred]);
  const mordredOther = useMemo(() => filteredMordred.filter(d => !RECOMMENDED_MORDRED.includes(d)), [filteredMordred]);


  const handleToggle = (desc: string) => {
    if (selectedDescriptors.includes(desc)) {
      setSelectedDescriptors(selectedDescriptors.filter(d => d !== desc));
    } else {
      setSelectedDescriptors([...selectedDescriptors, desc]);
    }
  };

  const handleModeSelect = (modeId: 'fast' | 'standard' | 'full') => {
    setEnrichmentMode(modeId);
    if (modeId === 'fast') {
      setSelectedDescriptors(FAST_DESCRIPTORS.filter(d => rdkitAvailable.includes(d) || FAST_DESCRIPTORS.includes(d)));
      setIncludeMordred(false);
    } else if (modeId === 'standard') {
      setSelectedDescriptors(rdkitAvailable);
      setIncludeMordred(false);
    } else if (modeId === 'full') {
      setSelectedDescriptors([...rdkitAvailable, ...mordredAvailable]);
      setIncludeMordred(true);
    }
  };

  const selectAllRdkit = () => {
    const newSelection = Array.from(new Set([...selectedDescriptors, ...rdkitAvailable]));
    setSelectedDescriptors(newSelection);
  };

  const selectAllMordred = () => {
    const newSelection = Array.from(new Set([...selectedDescriptors, ...mordredAvailable]));
    setSelectedDescriptors(newSelection);
    setIncludeMordred(true);
  };

  const clearAll = () => {
    setSelectedDescriptors([]);
  };

  const renderDescriptorGrid = (title: string, list: string[], iconColor: string) => {
    if (list.length === 0) return null;
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className={`text-[10px] font-bold uppercase tracking-wider ${iconColor}`}>{title} ({list.length})</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {list.map(desc => {
            const isSelected = selectedSet.has(desc);   // O(1) Set lookup
            const isRdkit = rdkitSet.has(desc);         // O(1) Set lookup
            const activeColorBg = isRdkit ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-violet-500/10 border-violet-500/30';
            const activeTextColor = isRdkit ? 'text-cyan-400' : 'text-violet-400';
            const activeTextLightColor = isRdkit ? 'text-cyan-100' : 'text-violet-100';

            return (
              <button
                key={desc}
                onClick={() => handleToggle(desc)}
                className={`flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all ${isSelected ? activeColorBg : 'bg-white/[0.02] border-white/[0.04] hover:border-white/[0.1]'}`}
              >
                {isSelected ? <CheckSquare className={`w-3.5 h-3.5 ${activeTextColor} shrink-0`} /> : <Square className="w-3.5 h-3.5 text-white/20 shrink-0" />}
                <span className={`text-xs truncate ${isSelected ? `${activeTextLightColor} font-medium` : 'text-white/60'}`} title={desc}>{desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden bg-[#080f1f]">
      {/* LEFT: Configuration panel (Smart Rec, Presets, Run, Telemetry) */}
      <div className="w-[380px] shrink-0 border-r border-white/[0.06] bg-[#080f1f] flex flex-col overflow-hidden">
        
        {/* Smart Recommendation Module */}
        {preGenSummary && (
          <div className="px-6 py-5 border-b border-white/[0.06] shrink-0 bg-gradient-to-r from-blue-500/10 to-transparent">
            <h2 className="text-white font-bold text-sm flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-blue-400" />
              Smart Recommendation
            </h2>
            <div className="space-y-2 mb-3">
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Dataset Size</span>
                <span className="text-white font-medium">{preGenSummary.dataset_size} compounds</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Classification</span>
                <span className="text-blue-400 font-bold">{preGenSummary.size_tier}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Rec. Engine</span>
                <span className="text-white font-medium">{preGenSummary.recommended_engine}</span>
              </div>
            </div>
            <p className="text-white/50 text-[10px] leading-relaxed">
              {preGenSummary.reason}
            </p>
          </div>
        )}
        
        <div className="px-6 py-5 border-b border-white/[0.06] shrink-0">
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            Descriptor Selection
          </h2>
          <p className="text-white/40 text-xs mt-1 leading-relaxed">
            Select exact properties to calculate offline.
          </p>
        </div>

        {/* Run button & Small Job Telemetry (Relocated to Top) */}
        <div className="px-5 py-4 border-b border-white/[0.06] bg-[#0a142c]/30 shrink-0">
          {!isRunning && !isCompleted ? (
            <button
              onClick={handleRunEnrichment}
              disabled={selectedDescriptors.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-black font-bold text-sm shadow-[0_4px_14px_rgba(255,255,255,0.15)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.25)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 fill-current" />
              Run ({selectedDescriptors.length} descriptors)
            </button>
          ) : isRunning ? (
            <button
              onClick={handleCancelJob}
              className="w-full flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl
                bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold text-sm
                hover:bg-rose-500/20 transition-all"
            >
              <Ban className="w-4 h-4" />
              Cancel Job
            </button>
          ) : isCompleted ? (
            <button
              onClick={handleFetchEnrichmentResults}
              className="w-full flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl
                bg-emerald-500 text-void font-bold text-sm
                shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:bg-emerald-400 transition-all"
            >
              Next Step <ChevronRight className="w-4 h-4" />
            </button>
          ) : null}

          {/* Job Telemetry */}
          {(isRunning || isCompleted) && (
            <div className="mt-4 p-3.5 border border-white/[0.05] rounded-xl space-y-3 bg-[#060b18]/40">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Job Telemetry</span>
                {isRunning && (
                  <span className="ml-auto flex items-center gap-1 text-[9px] text-emerald-400 font-medium">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping" />
                    Running
                  </span>
                )}
                {isCompleted && (
                  <span className="ml-auto text-[9px] text-cyan-400 font-bold">Completed</span>
                )}
              </div>

              {/* Progress and phase */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-white/40 truncate max-w-[200px]" title={socket.phase || 'Processing...'}>
                    {socket.phase || 'Initializing...'}
                  </span>
                  <span className="text-cyan-400 font-bold">{socket.progress}%</span>
                </div>
                <Progress.Root className="h-1 w-full bg-white/[0.04] rounded-full overflow-hidden" value={socket.progress}>
                  <Progress.Indicator
                    className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full transition-all duration-500"
                    style={{ width: `${socket.progress}%` }}
                  />
                </Progress.Root>
              </div>

              {/* Telemetry info cards */}
              <div className="grid grid-cols-2 gap-2 text-[9px]">
                <div className="p-2 rounded-lg bg-white/[0.01] border border-white/[0.04]">
                  <p className="text-white/30 uppercase tracking-wider font-semibold mb-0.5">Enriched</p>
                  <p className="text-white font-bold">
                    {Math.round((socket.progress / 100) * (preGenSummary?.dataset_size || 90))} / {preGenSummary?.dataset_size || 90}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.01] border border-white/[0.04]">
                  <p className="text-white/30 uppercase tracking-wider font-semibold mb-0.5">Speed / ETA</p>
                  <p className="text-cyan-400 font-bold">
                    {isRunning ? `${socket.speed || 0} cmp/s • ${socket.eta || 0}s` : 'Done ✓'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modes Presets - Scrollable in config panel */}
        <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/30 mb-3">
            Compute Presets
          </p>
          <div className="space-y-2">
            {modes.map(mode => {
              const Icon = mode.icon;
              const isActive = enrichmentMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => handleModeSelect(mode.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    isActive
                      ? `bg-gradient-to-br ${mode.color} ring-1 ring-inset ${mode.color.includes('cyan') ? 'ring-cyan-500/20' : mode.color.includes('violet') ? 'ring-violet-500/20' : 'ring-rose-500/20'}`
                      : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? mode.activeText : 'text-white/30'}`} />
                    <div>
                      <span className={`text-sm font-bold block ${isActive ? mode.activeText : 'text-white/60'}`}>
                        {mode.label}
                      </span>
                      <span className="text-[10px] text-white/40">{mode.desc}</span>
                    </div>
                    {isActive && (
                      <span className={`ml-auto shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        mode.accent === 'cyan' ? 'bg-cyan-500/20 text-cyan-300' :
                        mode.accent === 'violet' ? 'bg-violet-500/20 text-violet-300' :
                        'bg-rose-500/20 text-rose-300'
                      }`}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT: Checklist selection grid (takes the rest of the screen, full-width) */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#060b18]/10">
        {/* Custom Selection Header, Search, and Action Buttons (Sticky/Shrink-0) */}
        <div className="p-5 pb-3 border-b border-white/[0.06] bg-[#080f1f]">
          <div className="flex items-center gap-2 mb-3">
            <ListFilter className="w-4 h-4 text-white/30" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">
              Custom Selection
            </p>
            <span className="ml-auto text-[10px] text-white/30">{selectedDescriptors.length} total selected</span>
          </div>
          
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search keywords (e.g. 'log', 'ring')..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={selectAllRdkit} className="whitespace-nowrap px-3 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 transition-colors">
                + All RDKit
              </button>
              <button onClick={selectAllMordred} className="whitespace-nowrap px-3 py-1 rounded-lg bg-violet-500/10 text-violet-400 text-xs font-semibold hover:bg-violet-500/20 transition-colors">
                + All Mordred
              </button>
              <button onClick={clearAll} className="whitespace-nowrap px-3 py-1 rounded-lg bg-white/5 text-white/60 text-xs font-semibold hover:bg-white/10 hover:text-white transition-colors">
                Clear All
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Checklist Grid (Flex-1) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <LogoLoader size="w-16 h-16" label="Loading Descriptor Library..." />
            </div>
          ) : (
            <div className="space-y-8 pb-6">
              
              {/* RDKIT SECTION */}
              {(rdkitRecommended.length > 0 || rdkitOther.length > 0) && (
                <div>
                  <div className="flex items-center gap-2 border-b border-white/[0.04] pb-2 mb-4">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">RDKit Descriptors</h3>
                    <span className="ml-auto text-[10px] text-white/30">
                      {/* O(1): count by intersecting two sets */}
                      {selectedDescriptors.filter(d => rdkitSet.has(d)).length} selected
                    </span>
                  </div>
                  {renderDescriptorGrid('★ Recommended', rdkitRecommended, 'text-amber-400/70')}
                  {renderDescriptorGrid('All RDKit Properties', rdkitOther, 'text-cyan-400/70')}
                </div>
              )}

              {/* MORDRED SECTION */}
              {(mordredRecommended.length > 0 || mordredOther.length > 0) && (
                <div>
                  <div className="flex items-center gap-2 border-b border-white/[0.04] pb-2 mb-4">
                    <Beaker className="w-4 h-4 text-violet-400" />
                    <h3 className="text-sm font-bold text-white">Mordred Engine</h3>
                    <span className="ml-auto text-[10px] text-white/30">
                      {/* O(1): count by filtering against rdkitSet (not present in RDKit = Mordred) */}
                      {selectedDescriptors.filter(d => !rdkitSet.has(d)).length} selected
                    </span>
                  </div>
                  {renderDescriptorGrid('★ Recommended', mordredRecommended, 'text-amber-400/70')}
                  {renderDescriptorGrid('All Mordred Properties', mordredOther, 'text-violet-400/70')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
