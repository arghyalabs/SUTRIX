import React, { useCallback, useState } from 'react';
import { Upload, Loader2, AlertCircle, CheckCircle2, FileCheck } from 'lucide-react';

interface Props {
  clientId: string; apiBase: string;
  onSessionLoaded: (info: any) => void;
}

export const OECDUploadPanel: React.FC<Props> = ({ clientId, apiBase, onSessionLoaded }) => {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<any>(null);

  const upload = async (file: File) => {
    setLoading(true); setError(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await fetch(`${apiBase}/api/oecd/${clientId}/upload`, { method: 'POST', body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setLoaded(d);
      onSessionLoaded(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, [clientId]);

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Intro */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
        <div className="text-sm font-bold text-white">OECD QSAR Validation Framework</div>
        <p className="text-xs text-slate-400 leading-relaxed">
          The OECD has established 5 principles that every QSAR model used for regulatory purposes must satisfy.
          Upload your dataset to receive a detailed traffic-light compliance report for each principle.
        </p>
        <div className="grid grid-cols-1 gap-1.5 text-[10px] text-slate-500">
          {[
            ['P1', 'Defined Endpoint', 'The biological/physico-chemical endpoint must be clearly specified'],
            ['P2', 'Unambiguous Algorithm', 'The model algorithm must be fully reproducible'],
            ['P3', 'Applicability Domain', 'The model must define its chemical space boundaries'],
            ['P4', 'Goodness-of-Fit', 'Internal/external validation metrics must be appropriate'],
            ['P5', 'Mechanistic Interpretation', 'Where possible, a mechanistic rationale must be provided'],
          ].map(([code, title, desc]) => (
            <div key={code} className="flex items-start gap-2.5 py-1.5 border-b border-white/[0.04] last:border-0">
              <span className="text-slate-300 font-black w-5 flex-shrink-0">{code}</span>
              <span className="text-slate-400 font-semibold w-36 flex-shrink-0">{title}</span>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all
          ${dragging ? 'border-slate-400 bg-slate-500/10' : 'border-white/[0.08] hover:border-slate-500/40 hover:bg-white/[0.02]'}`}>
        <input type="file" className="hidden" accept=".csv,.parquet,.xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        {loading ? <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
          : <Upload className={`w-8 h-8 ${dragging ? 'text-slate-300' : 'text-slate-600'}`} />}
        <div className="text-center">
          <div className={`text-sm font-bold ${dragging ? 'text-slate-200' : 'text-slate-400'}`}>
            {loading ? 'Uploading…' : 'Drag & drop or click to browse'}
          </div>
          <div className="text-[10px] text-slate-600 mt-1">CSV, Parquet, or Excel with descriptors + endpoint</div>
        </div>
      </label>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loaded && (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
          <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4" /> Dataset Loaded — Running OECD Assessment
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              { l: 'File', v: loaded.filename },
              { l: 'Rows', v: loaded.rows?.toLocaleString() },
              { l: 'Columns', v: loaded.cols },
            ].map(s => (
              <div key={s.l} className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <div className="text-emerald-300 font-bold">{s.v}</div>
                <div className="text-slate-600 text-[10px]">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-emerald-400/60">→ Redirecting to full OECD report…</div>
        </div>
      )}
    </div>
  );
};
