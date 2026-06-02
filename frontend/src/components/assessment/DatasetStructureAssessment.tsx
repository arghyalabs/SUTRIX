import React, { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { Card } from '../ui/Card';
import { AlertCircle, CheckCircle2, ArrowRight, Zap, Beaker, FileType2 } from 'lucide-react';
import { API_BASE_URL } from '../../config';

interface AssessmentStatus {
  structure_state: 'MOLECULAR' | 'HYBRID' | 'NAME_ONLY';
  smiles_column: string | null;
  total_unique_compounds: number;
  structures_available: number;
  structures_missing: number;
  smiles_coverage_pct: number;
  dataset_rows: number;
  recommendation: 'proceed' | 'optional_recovery' | 'recommended_recovery' | 'recovery_required';
  recommendation_reason: string;
  can_proceed_to_descriptors: boolean;
  recovery_required: boolean;
  predicted_post_recovery_coverage_pct: number;
  predicted_recovered_compounds: number;
  current_descriptors_estimate: number;
  predicted_post_recovery_descriptors: number;
  current_ai_readiness_estimate: number;
  predicted_post_recovery_ai_readiness: number;
}

interface ScopePreview {
  total_missing: number;
  cache_hits_estimate: number;
  estimated_recovery_rate: number;
  estimated_time_seconds: {
    '100': number;
    '500': number;
    '1000': number;
    'all': number;
  };
}

export const DatasetStructureAssessment: React.FC = () => {
  const { workspaceId, setStructureState, setActiveTab } = useWorkspaceStore();
  const [status, setStatus] = useState<AssessmentStatus | null>(null);
  const [scopePreview, setScopePreview] = useState<ScopePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    const runAssessment = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE_URL}/api/assessment/${workspaceId}/structure-status`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Failed to assess structure state');
        }
        const data = await res.json();
        setStatus(data);

        setStructureState(
          data.structure_state,
          data.smiles_coverage_pct,
          data.structures_available,
          data.structures_missing,
          data.recommendation
        );

        if (data.structure_state !== 'MOLECULAR') {
          try {
            const scopeRes = await fetch(`${API_BASE_URL}/api/structure-recovery/v2/${workspaceId}/scope-preview`);
            if (scopeRes.ok) {
              const scopeData = await scopeRes.json();
              setScopePreview(scopeData);
            }
          } catch (scopeErr) {
            console.warn("Failed to fetch scope preview:", scopeErr);
          }
        }

      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    runAssessment();
  }, [workspaceId, setStructureState]);

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-400">Analyzing dataset structures...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-900/20 border border-red-500/50 rounded-xl text-red-200">
        <div className="flex items-center space-x-3 mb-2">
          <AlertCircle className="w-6 h-6 text-red-400" />
          <h3 className="text-lg font-medium">Assessment Failed</h3>
        </div>
        <p>{error}</p>
      </div>
    );
  }

  if (!status) return null;

  const StateIcon = status.structure_state === 'MOLECULAR' ? Beaker :
                    status.structure_state === 'HYBRID' ? FileType2 :
                    FileType2;

  const stateColor = status.structure_state === 'MOLECULAR' ? 'text-emerald-400' :
                     status.structure_state === 'HYBRID' ? 'text-amber-400' :
                     'text-red-400';

  const stateBg = status.structure_state === 'MOLECULAR' ? 'bg-emerald-500/10 border-emerald-500/30' :
                  status.structure_state === 'HYBRID' ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-red-500/10 border-red-500/30';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-light text-white tracking-wide">
            Dataset Readiness & Structure Assessment
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Analyzing structural data availability for QSAR modeling.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className={`col-span-1 p-6 ${stateBg} border rounded-xl flex flex-col items-center justify-center text-center space-y-4`}>
          <div className={`p-4 rounded-full bg-slate-800 ${stateColor}`}>
            <StateIcon className="w-10 h-10" />
          </div>
          <div>
            <h3 className={`text-xl font-medium ${stateColor}`}>
              {status.structure_state}
            </h3>
            <p className="text-gray-300 mt-1">
              {status.smiles_coverage_pct}% SMILES Coverage
            </p>
          </div>
        </Card>

        <Card className="col-span-2 p-6 bg-slate-800/50 border border-slate-700 rounded-xl space-y-4">
          <h3 className="text-lg font-medium text-white mb-2">Dataset Composition</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
              <p className="text-sm text-gray-400 mb-1">Total Unique Compounds</p>
              <p className="text-2xl font-light text-white">{status.total_unique_compounds.toLocaleString()}</p>
            </div>
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
              <p className="text-sm text-gray-400 mb-1">Total Dataset Rows</p>
              <p className="text-2xl font-light text-white">{status.dataset_rows.toLocaleString()}</p>
            </div>
            <div className="bg-emerald-900/20 p-4 rounded-lg border border-emerald-500/20">
              <p className="text-sm text-emerald-400/80 mb-1">Structures Available</p>
              <p className="text-2xl font-light text-emerald-400">{status.structures_available.toLocaleString()}</p>
            </div>
            <div className="bg-amber-900/20 p-4 rounded-lg border border-amber-500/20">
              <p className="text-sm text-amber-400/80 mb-1">Structures Missing</p>
              <p className="text-2xl font-light text-amber-400">{status.structures_missing.toLocaleString()}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6 bg-slate-800/80 border border-slate-700 rounded-xl mt-6">
        <h3 className="text-lg font-medium text-white mb-4">AI Recommendation</h3>
        
        <div className="flex items-start space-x-4">
          {status.recovery_required ? (
            <AlertCircle className="w-6 h-6 text-red-400 mt-1 flex-shrink-0" />
          ) : status.recommendation === 'proceed' ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-400 mt-1 flex-shrink-0" />
          ) : (
            <Zap className="w-6 h-6 text-amber-400 mt-1 flex-shrink-0" />
          )}
          
          <div className="flex-1">
            <p className="text-gray-200 text-lg leading-relaxed">
              {status.recommendation_reason}
            </p>

            {(status.structure_state === 'HYBRID' || status.structure_state === 'NAME_ONLY') && (
              <div className="mt-6 bg-slate-900/80 p-5 rounded-lg border border-slate-700">
                <h4 className="text-sm font-medium text-gray-400 mb-4 uppercase tracking-wider">Predicted Recovery Impact</h4>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Coverage Increase</p>
                    <p className="text-lg text-emerald-400">
                      {status.smiles_coverage_pct}% → <span className="font-medium">{status.predicted_post_recovery_coverage_pct}%</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Additional Descriptors</p>
                    <p className="text-lg text-emerald-400">
                      +{((status.predicted_post_recovery_descriptors - status.current_descriptors_estimate)).toLocaleString()} features
                    </p>
                  </div>
                  {scopePreview && (
                    <>
                      <div>
                        <p className="text-sm text-gray-500">Missing Compounds</p>
                        <p className="text-lg text-amber-400">
                          {scopePreview.total_missing.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Est. Recovery Time</p>
                        <p className="text-lg text-blue-400">
                          ~{Math.ceil(scopePreview.estimated_time_seconds.all / 60)} min
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-8 flex gap-4">
              {status.structure_state === 'MOLECULAR' ? (
                <button
                  onClick={() => setActiveTab('enrichment')}
                  className="px-6 py-3 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50 rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                  Continue to Descriptor Enrichment
                  <ArrowRight className="w-5 h-5" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setActiveTab('structure-recovery')}
                    className="px-6 py-3 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-xl font-medium transition-colors flex items-center gap-2"
                  >
                    Configure Structure Recovery
                    <ArrowRight className="w-5 h-5" />
                  </button>
                  {status.recommendation !== 'recovery_required' && (
                    <button
                      onClick={() => setActiveTab('enrichment')}
                      className="px-6 py-3 bg-transparent text-gray-400 hover:text-white border border-gray-600 rounded-xl font-medium transition-colors"
                    >
                      Skip & Proceed to Descriptors
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Page navigation managed globally in top-right and bottom controls */}
          </div>
        </div>
      </Card>
    </div>
  );
};
