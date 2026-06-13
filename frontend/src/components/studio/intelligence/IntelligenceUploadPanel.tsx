import React, { useCallback, useState } from 'react';
import { Upload, Loader2, AlertCircle, CheckCircle2, FlaskConical } from 'lucide-react';

interface Props { clientId: string; apiBase: string; session: any; onLoaded: (info: any) => void; }

export const IntelligenceUploadPanel: React.FC<Props> = ({ clientId, apiBase, session, onLoaded }) => {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setLoading(true); setError(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await fetch(`${apiBase}/api/intelligence/${clientId}/upload`, { method: 'POST', body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      onLoaded(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) upload(f);
  }, [clientId]);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
        <div className="text-sm font-bold text-white flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-cyan-400" /> Scientific Intelligence Studio
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Upload a dataset containing SMILES strings and/or physicochemical descriptors to access 
          cheminformatics intelligence tools: scaffold frequency, activity cliff detection, 
          chemical diversity profiling, and read-across similarity analysis.
        </p>
        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
          {[
            ['Scaffold Analysis', 'Murcko scaffold frequency → chemical series'],
            ['Activity Cliffs', 'High similarity + large Δactivity pairs'],
            ['Chemical Diversity', 'MW, logP, TPSA, Lipinski Ro5'],
            ['Read-Across', 'k-NN neighbours + predicted activity'],
          ].map(([t, d]) => (
            <div key={t} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="text-cyan-400/80 font-semibold mb-0.5">{t}</div>
              <div>{d}</div>
            </div>
          ))}
        </div>
      </div>

      <label
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all
          ${dragging ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/[0.08] hover:border-cyan-500/30 hover:bg-white/[0.02]'}`}>
        <input type="file" className="hidden" accept=".csv,.parquet" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        {loading ? <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          : <Upload className={`w-8 h-8 ${dragging ? 'text-cyan-400' : 'text-slate-600'}`} />}
        <div className="text-center">
          <div className={`text-sm font-bold ${dragging ? 'text-cyan-300' : 'text-slate-400'}`}>
            {loading ? 'Processing…' : 'Drop CSV / Parquet or click to browse'}
          </div>
          <div className="text-[10px] text-slate-600 mt-1">Include SMILES + descriptors + endpoint for full analysis</div>
        </div>
      </label>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {session && (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
          <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4" /> Dataset Loaded
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              { l: 'File', v: session.filename },
              { l: 'Rows', v: session.rows?.toLocaleString() },
              { l: 'Cols', v: session.cols },
            ].map(s => (
              <div key={s.l} className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <div className="text-emerald-300 font-bold">{s.v}</div>
                <div className="text-slate-600 text-[10px]">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-emerald-400/60">→ Proceeding to Scaffold Analysis…</div>
        </div>
      )}
    </div>
  );
};
