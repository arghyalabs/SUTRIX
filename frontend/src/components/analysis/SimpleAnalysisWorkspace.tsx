import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { simpleAnalysisApi } from '../../services/simpleAnalysisApi';
import { FilterStepNavigator } from './FilterStepNavigator';
import { FilterStepInspector } from './FilterStepInspector';
import { FunnelVisualization } from './FunnelVisualization';
import { FiltrationChartSet } from './FiltrationChartSet';
import { AlertCircle, RefreshCw, Layers } from 'lucide-react';

export const SimpleAnalysisWorkspace: React.FC = () => {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const simpleFunnelData = useWorkspaceStore((state) => state.simpleFunnelData);
  const setSimpleFunnelData = useWorkspaceStore((state) => state.setSimpleFunnelData);
  const genericMode = useWorkspaceStore((state) => state.genericMode);

  const [selectedStepId, setSelectedStepId] = useState<string>('root');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFunnelData = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await simpleAnalysisApi.getFunnel(workspaceId);
      setSimpleFunnelData(data);
      if (data.steps && data.steps.length > 0) {
        setSelectedStepId(data.steps[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.detail || 'Failed to compute funnel data path. Please ensure segregation was executed successfully.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!simpleFunnelData) {
      fetchFunnelData();
    } else if (simpleFunnelData.steps && simpleFunnelData.steps.length > 0) {
      setSelectedStepId(simpleFunnelData.steps[0].id);
    }
  }, [workspaceId, simpleFunnelData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
        <span className="text-sm font-semibold text-white/50">Computing progressive filtration path...</span>
      </div>
    );
  }

  if (error || !simpleFunnelData || !simpleFunnelData.steps || simpleFunnelData.steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 max-w-lg mx-auto bg-white/[0.02] border border-white/[0.04] rounded-3xl gap-4">
        <AlertCircle className="w-10 h-10 text-rose-400" />
        <div className="text-center">
          <h4 className="text-sm font-bold text-white mb-1">Simple Funnel Offline</h4>
          <p className="text-xs text-white/40 leading-relaxed">
            {error || 'The simple analysis workflow could not resolve a linear lineage segment. Go back and ensure your column mapping and hierarchy nodes are correctly set up.'}
          </p>
        </div>
        <button
          onClick={fetchFunnelData}
          className="mt-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/30 text-cyan-300 text-xs font-bold rounded-xl transition-all"
        >
          Re-calculate Funnel Path
        </button>
      </div>
    );
  }

  const steps = simpleFunnelData.steps;
  const currentStepIndex = steps.findIndex((s: any) => s.id === selectedStepId);
  const currentStep = steps[currentStepIndex] || steps[0];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* LEFT COLUMN: Sidebar Steps Navigator + Details (4 spans) */}
      <div className="xl:col-span-4 flex flex-col gap-6">
        <div className="bg-white/[0.02] border border-white/[0.04] p-5 rounded-3xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Filtration Steps
            </h3>
            <button
              onClick={fetchFunnelData}
              className="p-1 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/60 transition-colors"
              title="Refresh path data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <FilterStepNavigator
            steps={steps}
            selectedStepId={selectedStepId}
            onSelectStep={setSelectedStepId}
          />
        </div>

        {/* Selected Step Metadata Inspector */}
        <FilterStepInspector step={currentStep} index={currentStepIndex} />
      </div>

      {/* RIGHT COLUMN: Funnel Graphics + Dynamic Charts (8 spans) */}
      <div className="xl:col-span-8 flex flex-col gap-6">
        {/* Funnel SVG Block */}
        <div className="bg-white/[0.02] border border-white/[0.04] p-2 rounded-3xl backdrop-blur-md">
          <FunnelVisualization
            steps={steps}
            selectedStepId={selectedStepId}
            onSelectStep={setSelectedStepId}
          />
        </div>

        {/* Charts area */}
        <div className="bg-white/[0.02] border border-white/[0.04] p-6 rounded-3xl backdrop-blur-md">
          <div className="mb-4 text-left border-b border-white/[0.04] pb-3">
            <span className="text-[10px] font-bold tracking-wider text-cyan-400 uppercase">
              Current Node Analytics
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">
              {currentStepIndex === 0
                ? 'Full Ingested Dataset Summary'
                : `Filtered Step ${currentStepIndex}: ${currentStep.filter_col} = ${currentStep.filter_val}`}
            </h3>
          </div>

          <FiltrationChartSet
            step={currentStep}
            allSteps={steps}
            clientId={workspaceId}
          />
        </div>
      </div>
    </div>
  );
};
