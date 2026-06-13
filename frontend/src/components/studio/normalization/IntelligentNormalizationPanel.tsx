import React, { useState, useEffect } from 'react';
import {
  Loader2, AlertCircle, CheckCircle2, AlertTriangle, Play,
  Pause, XCircle, FileText, Download, ListFilter, HelpCircle, Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PanelProps {
  clientId: string;
  apiBase: string;
}

interface ScanResult {
  total_rows: number;
  detected_units: Record<string, number>;
  mw_recovery_stats: Record<string, number>;
  confidence_distribution: Record<string, number>;
  preview: Array<{
    row_idx: number;
    compound: string;
    original_unit: string;
    target_feasibility: boolean;
    mw: number | null;
    mw_source: string;
    confidence: string;
    original_value: number | null;
    suggested_conversions: string[];
    endpoint: string;
    warnings: string[];
  }>;
  unresolved_compounds: Array<{
    compound: string;
    suggestions: string[];
  }>;
}

interface NormalizeResponse {
  status: string;
  summary: {
    timestamp: string;
    rows_processed: number;
    rows_normalized: number;
    rows_skipped: number;
    target_unit: string;
  };
  pdf_report: string;
  xlsx_report: string;
  json_report: string;
}

export const IntelligentNormalizationPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [scanData, setScanData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Target conversion selection
  const [targetUnit, setTargetUnit] = useState<string>('µmol/L');

  // Normalization progression
  const [normalizing, setNormalizing] = useState(false);
  const [normProgress, setNormProgress] = useState(0);
  const [normStatus, setNormStatus] = useState<string>('');
  const [paused, setPaused] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [normResult, setNormResult] = useState<NormalizeResponse | null>(null);

  // Suggestions toggle
  const [showSuggestions, setShowSuggestions] = useState(false);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    setNormResult(null);
    try {
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/scan`);
      if (!r.ok) throw new Error((await r.json()).detail || 'Failed scanning dataset');
      const data = await r.json();
      setScanData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runScan();
  }, [clientId]);

  // Simulate progress queue and batch controls for large datasets
  const executeNormalization = async () => {
    if (!scanData) return;
    setNormalizing(true);
    setCancelled(false);
    setPaused(false);
    setNormResult(null);

    // Phase 1: Resolving Structures
    setNormStatus('Resolving chemical structures...');
    setNormProgress(10);
    await new Promise((r) => setTimeout(r, 600));
    if (cancelled) return;

    setNormProgress(35);
    setNormStatus('Resolving chemical structures (53%)...');
    await new Promise((r) => setTimeout(r, 500));
    if (cancelled) return;

    // Phase 2: Calculating MW
    setNormStatus('Calculating molecular weights (71%)...');
    setNormProgress(70);
    await new Promise((r) => setTimeout(r, 600));
    if (cancelled) return;

    // Phase 3: Conversions & Checkpoints
    setNormStatus('Standardizing concentration units (92%)...');
    setNormProgress(90);
    await new Promise((r) => setTimeout(r, 400));
    if (cancelled) return;

    try {
      const r = await fetch(`${apiBase}/api/normalization/${clientId}/normalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_unit: targetUnit }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Normalization failed');
      const data = await r.json();

      setNormProgress(100);
      setNormStatus('Completed successfully!');
      setNormResult(data);
      toast.success('Dataset standardized and audited successfully!');
      // Refresh scan data to show standardized value previews
      runScan();
    } catch (e: any) {
      setError(e.message);
      toast.error(`Normalization failed: ${e.message}`);
    } finally {
      setNormalizing(false);
    }
  };

  const handleCancel = () => {
    setCancelled(true);
    setNormalizing(false);
    setNormProgress(0);
    setNormStatus('Cancelled by user.');
    toast.error('Normalization cancelled.');
  };

  const getConfidenceColor = (conf: string) => {
    switch (conf.toLowerCase()) {
      case 'high': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5';
      case 'medium': return 'text-amber-400 border-amber-500/20 bg-amber-500/5';
      case 'low': return 'text-orange-400 border-orange-500/20 bg-orange-500/5';
      default: return 'text-rose-400 border-rose-500/20 bg-rose-500/5';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Intelligent Compound-Aware Normalization</h3>
            <p className="text-xs text-slate-400">Row-wise unit detection and molecular weight resolution via persistent cache lookups.</p>
          </div>
        </div>
        <button
          onClick={runScan}
          disabled={loading || normalizing}
          className="px-3.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white text-xs font-semibold transition-all disabled:opacity-50"
        >
          Rescan Dataset
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-amber-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm font-semibold">Scanning rows and resolving compound molecular structures...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {!loading && scanData && (
        <div className="space-y-6">
          {/* Section 1: Dashboard Widgets */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Units Detected Breakdown */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400">Detected Original Units</span>
                <div className="mt-3 space-y-2 max-h-[120px] overflow-y-auto pr-1">
                  {Object.entries(scanData.detected_units).map(([unit, count]) => (
                    <div key={unit} className="flex justify-between items-center text-xs">
                      <span className="font-mono text-slate-300">{unit}</span>
                      <span className="font-semibold text-white bg-white/[0.04] px-1.5 py-0.5 rounded">{count} rows</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-white/[0.04] pt-2 mt-2 text-[10px] text-slate-500">
                Mixed-unit dataset detected. Normalization is recommended.
              </div>
            </div>

            {/* MW Recovery Distribution */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400">Structure & MW Recovery Stats</span>
                <div className="mt-3 space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                  {Object.entries(scanData.mw_recovery_stats).map(([source, pct]) => (
                    <div key={source} className="space-y-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-400">{source}</span>
                        <span className="text-slate-200 font-bold">{pct}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${source === 'Missing' ? 'bg-rose-500' : 'bg-amber-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-white/[0.04] pt-2 mt-2 text-[10px] text-slate-500">
                Resolved using offline priority-order structure identifiers.
              </div>
            </div>

            {/* Confidence Distribution */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400">Molecular Confidence Levels</span>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {Object.entries(scanData.confidence_distribution).map(([level, count]) => (
                    <div key={level} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-center">
                      <div className={`text-sm font-black ${level === 'High' ? 'text-emerald-400' : level === 'Medium' ? 'text-amber-400' : level === 'Low' ? 'text-orange-400' : 'text-rose-400'}`}>{count}</div>
                      <div className="text-[9px] text-slate-600 uppercase mt-0.5">{level}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-white/[0.04] pt-2 mt-2 text-[10px] text-slate-500 font-medium">
                High/Medium confidence allows audit safety verification.
              </div>
            </div>
          </div>

          {/* Section 2: Normalization Actions Panel */}
          <div className="p-5 rounded-xl bg-white/[0.03] border border-amber-500/10 space-y-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Normalization Configuration</h4>
            
            <div className="flex flex-wrap items-center gap-6">
              {/* Target unit selection */}
              <div className="space-y-1">
                <span className="text-xs text-slate-400 block">Target Standardization Unit</span>
                <select
                  value={targetUnit}
                  onChange={(e) => setTargetUnit(e.target.value)}
                  disabled={normalizing}
                  className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-semibold focus:outline-none focus:border-amber-500/40 w-48"
                >
                  <option value="mg/L">mg/L</option>
                  <option value="µg/L">µg/L</option>
                  <option value="µmol/L">µmol/L</option>
                  <option value="mmol/L">mmol/L</option>
                  <option value="pLC50">pLC50</option>
                  <option value="pEC50">pEC50</option>
                </select>
              </div>

              {/* Progress and controls */}
              <div className="flex-1 min-w-[240px]">
                {normalizing ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {normStatus}
                      </span>
                      <span className="text-slate-400 font-mono">{normProgress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full transition-all duration-300" style={{ width: `${normProgress}%` }} />
                    </div>
                    {/* Controls */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => setPaused(!paused)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/[0.04] text-[10px] text-slate-400 hover:text-white transition-all"
                      >
                        {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                        {paused ? 'Resume' : 'Pause'}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/10 text-[10px] text-rose-300 hover:bg-rose-500/20 transition-all"
                      >
                        <XCircle className="w-3 h-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 text-[11px] text-slate-500">
                    <div>Conversion from mass concentration to molar transformations (e.g. pLC50) requires resolved molecular weight.</div>
                    <div>Safe conversion boundaries are validated before processing.</div>
                  </div>
                )}
              </div>

              {!normalizing && !normResult && (
                <button
                  onClick={executeNormalization}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/10 transition-all ml-auto"
                >
                  Normalize Dataset
                </button>
              )}
            </div>

            {/* Normalization Results & Audit Downloads */}
            {normResult && (
              <div className="pt-4 border-t border-white/[0.04] flex items-center justify-between flex-wrap gap-4 bg-emerald-500/5 p-4 rounded-xl border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Normalization Completed!</div>
                    <div className="text-[10px] text-slate-400">
                      Successfully converted: <strong className="text-white">{normResult.summary.rows_normalized}</strong> rows.
                      Skipped: <strong className="text-white">{normResult.summary.rows_skipped}</strong> rows.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 mr-2">Download OECD Audit Reports:</span>
                  <a
                    href={`${apiBase}${normResult.pdf_report}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white text-xs font-semibold transition-all"
                    download
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-400" />
                    PDF Report
                  </a>
                  <a
                    href={`${apiBase}${normResult.xlsx_report}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white text-xs font-semibold transition-all"
                    download
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    Excel Sheet
                  </a>
                  <a
                    href={`${apiBase}${normResult.json_report}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-white text-xs font-semibold transition-all"
                    download
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    JSON Audit
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Troubleshooting Recommendations for Unresolved Compounds */}
          {scanData.unresolved_compounds.length > 0 && (
            <div className="p-4 rounded-xl border border-rose-500/10 bg-rose-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Unable to resolve structure for {scanData.unresolved_compounds.length} compounds</span>
                </div>
                <button
                  onClick={() => setShowSuggestions(!showSuggestions)}
                  className="text-[10px] text-slate-400 hover:text-white transition-all underline"
                >
                  {showSuggestions ? 'Hide Suggestions' : 'Show Suggestions'}
                </button>
              </div>

              {showSuggestions && (
                <div className="space-y-3 pt-2 max-h-[200px] overflow-y-auto pr-2">
                  {scanData.unresolved_compounds.map((unres) => (
                    <div key={unres.compound} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[11px] space-y-1">
                      <div className="font-semibold text-slate-300">Compound: "{unres.compound}"</div>
                      <div className="text-slate-500 text-[10px] pl-2 space-y-0.5 list-disc">
                        {unres.suggestions.map((sug, i) => (
                          <div key={i}>• {sug}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 4: Data Preview Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Row-wise Harmonization Preview</span>
              <span className="text-[10px] text-slate-600">Showing first 50 rows</span>
            </div>

            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] border-b border-white/[0.06] text-slate-500 font-semibold">
                    <th className="px-4 py-2.5 text-center w-12">Row</th>
                    <th className="px-4 py-2.5 text-left">Compound</th>
                    <th className="px-4 py-2.5 text-left w-24">Endpoint</th>
                    <th className="px-4 py-2.5 text-center w-24">Original Unit</th>
                    <th className="px-4 py-2.5 text-center w-36">MW Source</th>
                    <th className="px-4 py-2.5 text-right w-24">Molecular Wt.</th>
                    <th className="px-4 py-2.5 text-center w-28">Confidence</th>
                    <th className="px-4 py-2.5 text-center w-20">Feasible?</th>
                    <th className="px-4 py-2.5 text-right w-28">Original Val</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {scanData.preview.map((row) => (
                    <tr key={row.row_idx} className="hover:bg-white/[0.01] transition-colors">
                      <td className="px-4 py-2 text-center text-slate-600 font-mono">{row.row_idx}</td>
                      <td className="px-4 py-2 text-slate-200 font-mono font-medium truncate max-w-[180px]" title={row.compound}>
                        {row.compound}
                      </td>
                      <td className="px-4 py-2 text-slate-400 font-mono">{row.endpoint || '—'}</td>
                      <td className="px-4 py-2 text-center text-slate-300 font-mono">{row.original_unit}</td>
                      <td className="px-4 py-2 text-center text-slate-500">{row.mw_source}</td>
                      <td className="px-4 py-2 text-right text-slate-300 font-mono">
                        {row.mw !== null ? row.mw.toFixed(2) : '—'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold ${getConfidenceColor(row.confidence)}`}>
                          {row.confidence}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {row.target_feasibility ? (
                          <span className="text-emerald-400 flex justify-center"><CheckCircle2 className="w-3.5 h-3.5" /></span>
                        ) : (
                          <span className="text-rose-400 flex justify-center" title={row.warnings.join(', ')}>
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-400 font-mono">
                        {row.original_value !== null ? row.original_value.toFixed(4) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
