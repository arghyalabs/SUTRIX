import React, { useCallback, useState } from 'react';
import { Upload, FileText, Archive, AlertCircle, CheckCircle2, Loader2, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Props {
  clientId: string; apiBase: string;
  onSessionLoaded: (info: any) => void;
  sessionInfo: any;
  onSuccess: () => void;
}

type UploadMode = 'csv' | 'zip';

export const QSARUploadPanel: React.FC<Props> = ({ clientId, apiBase, onSessionLoaded, sessionInfo, onSuccess }) => {
  const [mode, setMode] = useState<UploadMode>('csv');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setLoading(true); setError(null);
    const isZip = file.name.endsWith('.zip');
    const endpoint = isZip
      ? `${apiBase}/api/qsar-studio/${clientId}/upload-zip`
      : `${apiBase}/api/qsar-studio/${clientId}/upload-csv`;
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await fetch(endpoint, { method: 'POST', body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      onSessionLoaded(d);
      toast.success(`Dataset loaded: ${d.rows?.toLocaleString()} rows`);
      onSuccess();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, [clientId, mode]);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-3">
        {([
          { id: 'csv' as UploadMode, icon: <FileText className="w-5 h-5" />, label: 'CSV / Parquet', desc: 'Flat dataset — descriptors + endpoint in columns' },
          { id: 'zip' as UploadMode, icon: <Archive className="w-5 h-5" />, label: 'Hierarchical ZIP', desc: 'From Hierarchy Studio — multiple subgroups auto-detected' },
        ] as const).map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all
              ${mode === m.id ? 'border-blue-500/40 bg-blue-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'}`}>
            <span className={mode === m.id ? 'text-blue-400' : 'text-slate-500'}>{m.icon}</span>
            <div>
              <div className={`text-xs font-bold ${mode === m.id ? 'text-blue-300' : 'text-slate-400'}`}>{m.label}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">{m.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-xs text-blue-300/80">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          {mode === 'csv'
            ? 'Upload a CSV or Parquet with descriptor columns and at least one numeric endpoint (LC50, EC50, etc.).'
            : 'Upload a ZIP exported from the Hierarchy Studio. Subgroups are auto-detected from the folder structure.'}
        </div>
      </div>

      {/* Drop zone */}
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all
          ${dragging ? 'border-blue-400 bg-blue-500/10' : 'border-white/[0.08] hover:border-blue-500/30 hover:bg-white/[0.02]'}`}>
        <input type="file" className="hidden" accept={mode === 'zip' ? '.zip' : '.csv,.parquet,.xlsx'}
          onChange={onFileInput} />
        {loading ? (
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        ) : (
          <Upload className={`w-8 h-8 ${dragging ? 'text-blue-400' : 'text-slate-600'}`} />
        )}
        <div className="text-center">
          <div className={`text-sm font-bold ${dragging ? 'text-blue-300' : 'text-slate-400'}`}>
            {loading ? 'Uploading…' : dragging ? 'Drop to upload' : 'Drag & drop or click to browse'}
          </div>
          <div className="text-[10px] text-slate-600 mt-1">
            {mode === 'csv' ? 'CSV, Parquet, XLSX' : 'ZIP with subgroup folders'}
          </div>
        </div>
      </label>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Session loaded summary */}
      {sessionInfo && (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-bold">
            <CheckCircle2 className="w-4 h-4" /> Dataset Loaded
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: 'File', value: sessionInfo.filename },
              { label: 'Rows', value: sessionInfo.rows?.toLocaleString() ?? sessionInfo.total_rows?.toLocaleString() },
              { label: 'Columns', value: sessionInfo.cols },
              { label: 'Subgroups', value: sessionInfo.subgroups?.length ?? 1 },
            ].map(s => (
              <div key={s.label} className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <div className="text-emerald-300 font-bold">{s.value ?? '—'}</div>
                <div className="text-slate-600 text-[10px]">{s.label}</div>
              </div>
            ))}
          </div>
          {sessionInfo.subgroups?.length > 1 && (
            <div className="text-[10px] text-slate-500">
              Subgroups detected: {(Array.isArray(sessionInfo.subgroups)
                ? sessionInfo.subgroups
                : Object.keys(sessionInfo.subgroups ?? {})).join(', ')}
            </div>
          )}
          <div className="text-xs text-emerald-400/70">
            → Proceed to <strong>Readiness</strong> to assess QSAR suitability
          </div>
        </div>
      )}
    </div>
  );
};
