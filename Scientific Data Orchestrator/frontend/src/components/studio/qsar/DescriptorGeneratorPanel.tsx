import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Play, Database } from 'lucide-react';
import { useColumnIntelligence } from '../../../hooks/useColumnIntelligence';
import { SciPanel } from '../../../components/charts/SciPanel';
import { SciBar } from '../../../components/charts/SciBar';
import type { SciBarDatum } from '../../../components/charts/SciBar';
import { SCI_COLORS } from '../../../components/charts/chartTheme';

interface PanelProps {
  clientId: string;
  apiBase: string;
}

interface FailedRow {
  idx: number;
  smiles: string;
  error: string;
}

interface DescResult {
  success_count: number;
  fail_count: number;
  descriptor_count: number;
  descriptor_names: string[];
  failed_rows: FailedRow[];
  categories: Record<string, number>;
  preview: Record<string, any>[];
  mode: string;
}

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

export const DescriptorGeneratorPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const { columns } = useColumnIntelligence(clientId, apiBase);
  const [smilesCol, setSmilesCol] = useState('');
  const [mode, setMode] = useState<'fast' | 'standard' | 'full'>('fast');
  const [include3d, setInclude3d] = useState(false);
  const [data, setData] = useState<DescResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect SMILES column
  useEffect(() => {
    if (columns.length > 0) {
      const smiles = columns.find(c => c.role === 'SMILES');
      if (smiles) {
        setSmilesCol(smiles.name);
      } else {
        const anySmiles = columns.find(c => c.name.toLowerCase().includes('smiles'));
        if (anySmiles) {
          setSmilesCol(anySmiles.name);
        }
      }
    }
  }, [columns]);

  const handleGenerate = async () => {
    if (!smilesCol) {
      setError('Please select a SMILES column.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('smiles_col', smilesCol);
      form.append('mode', mode);
      form.append('include_3d', String(include3d));

      const r = await fetch(`${apiBase}/api/qsar-studio/${clientId}/generate-descriptors`, {
        method: 'POST',
        body: form,
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.detail || 'Failed to generate descriptors');
      }
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const total = data ? data.success_count + data.fail_count : 0;
  const successRate = total > 0 ? (data!.success_count / total) * 100 : 0;

  const barData: SciBarDatum[] = data
    ? Object.entries(data.categories).map(([name, count], i) => ({
        label: name,
        value: count as number,
        color: SCI_COLORS[i % SCI_COLORS.length] as string,
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Descriptor Pipeline Settings
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
              Select SMILES Column
            </label>
            <select
              value={smilesCol}
              onChange={e => setSmilesCol(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-slate-300 text-xs focus:outline-none focus:border-cyan-400/30"
            >
              <option value="">-- Select SMILES Column --</option>
              {columns.map(c => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
              Descriptor Mode
            </label>
            <div className="flex gap-2">
              {(['fast', 'standard', 'full'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    mode === m
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                      : 'bg-white/[0.02] border-white/[0.05] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {mode === 'full' && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="include3d"
              checked={include3d}
              onChange={e => setInclude3d(e.target.checked)}
              className="rounded bg-white/[0.04] border-white/[0.08] text-blue-500 focus:ring-blue-500"
            />
            <label htmlFor="include3d" className="text-xs text-slate-400 cursor-pointer">
              Compute 3D descriptors (requires 3D conformer generation, slower)
            </label>
          </div>
        )}

        <div className="text-[10px] text-slate-500 leading-relaxed font-mono">
          {mode === 'fast' && '⚡ FAST mode: Computes 9 standard RDKit descriptors (MW, LogP, TPSA, HBD, HBA, RotBonds, etc.).'}
          {mode === 'standard' && '🛡️ STANDARD mode: Computes 200+ comprehensive RDKit 2D descriptors.'}
          {mode === 'full' && '🌌 FULL mode: Computes standard RDKit + 1800+ Mordred chemical descriptors.'}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || !smilesCol}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-bold hover:bg-cyan-500/20 transition-all disabled:opacity-40"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Computing descriptors...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              Generate Descriptors
            </>
          )}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/[0.08] border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Results Display */}
      {data && (
        <div className="space-y-6">
          {/* KPI grid */}
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
              <div className="text-xl font-black text-white">{data.success_count + data.fail_count}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Total Molecules</div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
              <div className="text-xl font-black text-emerald-400">{data.success_count}</div>
              <div className="text-[10px] text-emerald-600 mt-0.5">Successfully Parsed</div>
            </div>
            <div className={`p-3 rounded-xl text-center border ${
              data.fail_count > 0
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                : 'bg-white/[0.03] border border-white/[0.06] text-white'
            }`}>
              <div className="text-xl font-black">{data.fail_count}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Parsing Failures</div>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
              <div className="text-xl font-black text-blue-400">{data.descriptor_count}</div>
              <div className="text-[10px] text-blue-600 mt-0.5">Features Generated</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Progress bar — parse quality */}
            <div style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: '12px 14px' }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#F1F5F9', marginBottom: 10 }}>
                Parse Quality
              </div>
              <div style={{ display: 'flex', gap: 16, fontFamily: "'Geist Mono', monospace", fontSize: 11, marginBottom: 10 }}>
                <span><span style={{ color: '#64748B' }}>total </span><span style={{ color: '#22D3EE', fontWeight: 600 }}>{total}</span></span>
                <span><span style={{ color: '#64748B' }}>valid </span><span style={{ color: '#34D399', fontWeight: 600 }}>{data!.success_count}</span></span>
                {data!.fail_count > 0 && <span><span style={{ color: '#64748B' }}>failed </span><span style={{ color: '#F43F5E', fontWeight: 600 }}>{data!.fail_count}</span></span>}
              </div>
              {/* Progress bar */}
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#34D399', width: `${successRate}%`, transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: '#34D399', marginTop: 5 }}>
                {successRate.toFixed(1)}% parse success
              </div>
            </div>

            {/* SciBar — category breakdown */}
            <SciPanel title="DESCRIPTOR CATEGORIES" height={200}>
              <SciBar
                data={barData}
                useSeriesColors={true}
                horizontal={true}
                height={160}
                xLabel="Count"
              />
            </SciPanel>
          </div>

          {/* Failed rows list */}
          {data.fail_count > 0 && (
            <div className="p-4 rounded-xl bg-rose-500/[0.01] border border-rose-500/10 space-y-3">
              <div className="flex justify-between items-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-rose-400">
                  Parsing Failures details
                </div>
                <span className="text-[10px] text-slate-500">
                  Showing {data.failed_rows.length} of {data.fail_count} failures
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-rose-500/10 divide-y divide-rose-500/10">
                {data.failed_rows.map((row, i) => (
                  <div key={i} className="p-2 flex justify-between items-start text-[11px] hover:bg-rose-500/[0.02]">
                    <div className="space-y-0.5">
                      <div className="text-slate-400 font-mono">Row {row.idx}</div>
                      <div className="text-rose-300 font-mono break-all">{row.smiles}</div>
                    </div>
                    <div className="text-rose-400/70 text-[10px] font-medium">{row.error}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview Table */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Descriptor Preview Matrix (First 10 Columns)
            </div>
            <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
              <table className="w-full text-xs min-w-[600px]">
                <thead>
                  <tr className="bg-white/[0.04] border-b border-white/[0.06]">
                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Row</th>
                    {data.descriptor_names.slice(0, 10).map(name => (
                      <th key={name} className="px-3 py-2 text-left font-semibold text-slate-500 font-mono">
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {data.preview.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2 text-slate-500 font-mono">{idx}</td>
                      {data.descriptor_names.slice(0, 10).map(name => (
                        <td key={name} className="px-3 py-2 text-slate-300 font-mono">
                          {row[name] !== null && row[name] !== undefined ? row[name].toFixed(4) : '-'}
                        </td>
                      ))}
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
