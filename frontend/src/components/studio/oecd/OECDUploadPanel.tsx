import React, { useCallback, useState } from 'react';
import { UploadCloud, Loader2, AlertCircle, CheckCircle2, Play } from 'lucide-react';

interface Props {
  clientId: string;
  apiBase: string;
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

  const handleLoadDemo = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/api/oecd/${clientId}/load-demo`, { method: 'POST' });
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
    <div className="max-w-4xl mx-auto py-12 flex flex-col items-center w-full">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-3">Upload Dataset</h1>
        <p className="text-secondary text-sm max-w-lg mx-auto">
          QSAR validation data ingestion. Upload your dataset to begin OECD compliance assessment.
        </p>
      </div>

      <div className="w-full max-w-2xl space-y-6">
        <label
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative flex flex-col items-center justify-center w-full h-80 rounded-[2rem] border-2 border-dashed cursor-pointer transition-all duration-300 group overflow-hidden
            ${dragging
              ? 'border-slate-400 bg-slate-400/[0.03] shadow-[0_0_30px_rgba(148,163,184,0.15)]'
              : 'border-white/[0.08] glass hover:border-white/[0.2] hover:bg-white/[0.02]'}`}
        >
          <input type="file" className="hidden" accept=".csv,.parquet,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/[0.02] pointer-events-none" />
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-transform duration-500
            ${dragging ? 'bg-slate-400 text-void scale-110' : 'bg-white/[0.04] text-secondary group-hover:bg-white/[0.08] group-hover:text-white'}`}>
            {loading ? <Loader2 className="w-8 h-8 text-slate-400 animate-spin" /> : <UploadCloud className="w-8 h-8" />}
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {loading ? 'Processing…' : dragging ? 'Drop file to upload' : 'Drag & drop or click to browse'}
          </h3>
          <div className="flex items-center gap-2 mt-4">
            {['.CSV', '.XLSX', '.PARQUET'].map(ext => (
              <span key={ext} className="px-2 py-1 rounded-md bg-white/[0.04] text-[10px] font-mono text-muted uppercase tracking-wider">{ext}</span>
            ))}
          </div>
        </label>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {loaded && (
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
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
                  <div className="text-emerald-300 font-bold truncate" title={s.v}>{s.v}</div>
                  <div className="text-slate-600 text-[10px]">{s.l}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-emerald-400/60">→ Redirecting to full OECD report…</div>
          </div>
        )}

        {!loaded && !loading && (
          <>
            <div className="flex items-center justify-center gap-4 text-sm text-secondary pt-2">
              <span className="w-12 h-px bg-white/[0.1]" />
              <span>or try it out with</span>
              <span className="w-12 h-px bg-white/[0.1]" />
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleLoadDemo}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white font-medium hover:bg-white/[0.08] transition-colors"
              >
                <Play className="w-4 h-4 text-slate-400" />
                Load Demo Dataset
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
