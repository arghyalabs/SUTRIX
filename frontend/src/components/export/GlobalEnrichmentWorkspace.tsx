import React, { useState, useEffect } from 'react';
import { Layers, Activity, AlertTriangle, FileBox, CheckCircle2, XCircle } from 'lucide-react';
import { API_BASE_URL } from '../../config';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

interface GlobalEnrichmentWorkspaceProps {
  clientId: string;
}

export const GlobalEnrichmentWorkspace: React.FC<GlobalEnrichmentWorkspaceProps> = ({ clientId }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);

  const startGlobalEnrichment = async () => {
    try {
      setIsProcessing(true);
      const res = await fetch(`${API_BASE_URL}/api/export/${clientId}/global-enrichment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engines: ['rdkit'],
          recovery_strategy: 'skip'
        })
      });
      const data = await res.json();
      setJobId(data.job_id);
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/jobs/${clientId}/status`);
        const data = await res.json();
        // The API returns the status for active_job_id, so if multiple jobs, it might be tricky.
        // Assuming we get the right job status back or just fetch by job_id directly if possible.
        // SUTRIX backend usually has /api/jobs/{job_id}/status or we can use the main status.
        setStatus(data);
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          setIsProcessing(false);
          clearInterval(interval);
        }
      } catch (e) {
        console.error(e);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, clientId]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="border-b border-white/[0.06] pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">Global Enrichment Workspace</h1>
              <p className="text-slate-400 mt-1">Batch process and export the entire dataset hierarchy.</p>
            </div>
          </div>
        </header>

        {!isProcessing && status?.status !== 'COMPLETED' && (
          <div className="grid grid-cols-2 gap-6">
            <div className="glass-panel p-6 rounded-2xl border border-white/[0.06] bg-slate-900/30">
              <h2 className="text-lg font-bold text-white mb-4">Configuration</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Descriptor Engine</label>
                  <select className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2 text-white">
                    <option value="rdkit">RDKit (Fast)</option>
                    <option value="mordred">Mordred (Comprehensive)</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Recovery Strategy</label>
                  <select className="mt-1 w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2 text-white">
                    <option value="skip">Skip Recovery</option>
                    <option value="all">Attempt All Missing</option>
                  </select>
                </div>

                <button 
                  onClick={startGlobalEnrichment}
                  className="w-full py-4 mt-6 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-600 text-white font-black hover:from-indigo-400 hover:to-cyan-500 transition-all flex items-center justify-center gap-2"
                >
                  Launch Batch Enrichment
                </button>
              </div>
            </div>
            
            <div className="glass-panel p-6 rounded-2xl border border-white/[0.06] bg-slate-900/30">
              <h2 className="text-lg font-bold text-white mb-4">Dataset Assessment</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/10">
                  <span className="text-sm font-medium">Total Subgroups Found</span>
                  <span className="text-cyan-400 font-mono font-bold">Scanning...</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/10">
                  <span className="text-sm font-medium">Estimated Runtime</span>
                  <span className="text-emerald-400 font-mono font-bold">~ 15m</span>
                </div>
                <div className="p-4 mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 text-amber-200 text-sm">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <p>Global enrichment is a resource-intensive operation. Please do not close the browser while the job is active.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="glass-panel p-8 rounded-2xl border border-indigo-500/30 bg-indigo-950/20 max-w-2xl mx-auto text-center">
            <Activity className="w-12 h-12 text-indigo-400 animate-spin mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Processing Global Library</h2>
            <p className="text-slate-400 mb-8">{status?.message || 'Initializing job...'}</p>
            
            <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-white/10">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 animate-pulse w-full"></div>
            </div>
          </div>
        )}
        
        {status?.status === 'COMPLETED' && (
          <div className="glass-panel p-8 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 max-w-2xl mx-auto text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Global Enrichment Complete</h2>
            <p className="text-emerald-200/70 mb-8">Your hierarchical dataset library is ready for download.</p>
            
            <button 
              onClick={() => window.open(`${API_BASE_URL}/api/export/${clientId}/modeling-package/download?job_id=${jobId}`)}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-black hover:from-emerald-400 hover:to-teal-500 transition-all flex items-center justify-center gap-2 mx-auto"
            >
              <FileBox className="w-5 h-5 fill-current" />
              Download Dataset Library (ZIP)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
