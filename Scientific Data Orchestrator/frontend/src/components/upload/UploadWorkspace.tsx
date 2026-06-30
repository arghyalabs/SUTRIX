import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, FileType, CheckCircle, Play, Sliders,
  Trash2, Database, ChevronRight, File as FileIcon,
  AlertCircle, RotateCcw
} from 'lucide-react';
import { ProcessingTimeline } from '../telemetry/ProcessingTimeline';
import type { StageItem } from '../telemetry/ProcessingTimeline';
import { LiveTelemetryPanel } from '../telemetry/LiveTelemetryPanel';

const UPLOAD_STAGE_ORDER = [
  { stage: 'PARSING',          stage_label: 'Parsing Dataset',       description: 'Reading and validating scientific data...' },
  { stage: 'SCHEMA_DETECTION', stage_label: 'Detecting Schema',      description: 'Identifying toxicological variable columns...' },
  { stage: 'UNIT_STANDARDIZE', stage_label: 'Standardizing Units',   description: 'Normalizing measurement units and qualifiers...' },
  { stage: 'DEDUPLICATION',    stage_label: 'Deduplicating Records', description: 'Removing duplicate chemical entries...' },
  { stage: 'SMILES_RESOLVE',   stage_label: 'Canonicalizing SMILES', description: 'Resolving chemical structure coordinates...' },
  { stage: 'PREVIEW_CACHE',    stage_label: 'Building Preview',      description: 'Preparing interactive data preview...' },
  { stage: 'STATISTICS_BUILD', stage_label: 'Generating Statistics', description: 'Computing column-level statistics...' },
  { stage: 'WORKSPACE_READY',  stage_label: 'Workspace Ready',       description: 'Dataset fully preprocessed and cached.' },
];

interface UploadWorkspaceProps {
  filename: string | null;
  rowCount: number;
  columns: string[];
  preview: any[];
  isProcessing?: boolean;
  processingStage?: string;
  processingMessage?: string;
  processingProgress?: number;
  processingEta?: number;
  processingItemsPerSec?: number;
  processingStageLogs?: string[];
  activeJobId?: string | null;
  handleIngestFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleLoadDemo: () => Promise<void>;
  handleCurateColumns: (colsToDrop: string[]) => Promise<void>;
  onCancelJob?: (jobId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileType(name: string): string {
  const ext = name.split('.').pop()?.toUpperCase() || '';
  return ext;
}

export const UploadWorkspace: React.FC<UploadWorkspaceProps> = ({
  filename,
  rowCount,
  columns,
  preview,
  isProcessing = false,
  processingStage = '',
  processingMessage = '',
  processingProgress = 0,
  processingEta = 0,
  processingItemsPerSec = 0,
  processingStageLogs = [],
  activeJobId,
  handleIngestFile,
  handleLoadDemo,
  handleCurateColumns,
  onCancelJob,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDropCols, setSelectedDropCols] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<{ name: string; size: number; type: string } | null>(null);

  // Build timeline stages from current processing stage
  const timelineStages: StageItem[] = useMemo(() => {
    const activeIdx = UPLOAD_STAGE_ORDER.findIndex(s => s.stage === processingStage);
    return UPLOAD_STAGE_ORDER.map((s, i) => ({
      ...s,
      status: i < activeIdx ? 'completed' : i === activeIdx ? 'active' : 'pending',
    }));
  }, [processingStage]);

  const toggleDropColumn = (col: string) => {
    setSelectedDropCols(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const onCurationSubmit = async () => {
    await handleCurateColumns(selectedDropCols);
    setSelectedDropCols([]);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const f = e.dataTransfer.files[0];
      setPendingFile({ name: f.name, size: f.size, type: getFileType(f.name) });
      const pseudoEvent = { target: { files: e.dataTransfer.files } } as any;
      handleIngestFile(pseudoEvent);
    }
  }, [handleIngestFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setPendingFile({ name: f.name, size: f.size, type: getFileType(f.name) });
    handleIngestFile(e);
  }, [handleIngestFile]);

  return (
    <div className="max-w-4xl mx-auto py-12 flex flex-col items-center">

      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-3">Upload Dataset</h1>
        <p className="text-secondary text-sm max-w-lg mx-auto">
          Async scientific data ingestion. Upload your dataset to begin the pipeline.
        </p>
      </div>

      <AnimatePresence mode="wait">

        {/* ── PROCESSING STATE ── */}
        {isProcessing && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="w-full space-y-5"
          >
            {/* File pill */}
            {pendingFile && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl glass border border-white/[0.06]">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                  <FileIcon className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{pendingFile.name}</p>
                  <p className="text-xs text-white/30">{formatBytes(pendingFile.size)} · {pendingFile.type}</p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-xs font-mono border border-cyan-500/20">
                  PROCESSING
                </span>
              </div>
            )}

            {/* Two-column layout: timeline + telemetry */}
            <div className="grid md:grid-cols-2 gap-5">
              <div className="glass rounded-2xl border border-white/[0.06] p-5">
                <p className="text-xs font-mono text-white/40 uppercase tracking-wider mb-4">Pipeline Stages</p>
                <ProcessingTimeline
                  stages={timelineStages}
                  activeStage={processingStage}
                  message={processingMessage}
                  etaSeconds={processingEta}
                  itemsPerSec={processingItemsPerSec}
                  progressPct={processingProgress}
                />
              </div>

              <LiveTelemetryPanel
                jobId={activeJobId || undefined}
                stage={processingStage}
                stageLabel={timelineStages.find(s => s.stage === processingStage)?.stage_label}
                stageDescription={processingMessage}
                progressPct={processingProgress}
                etaSeconds={processingEta}
                itemsPerSec={processingItemsPerSec}
                logs={processingStageLogs}
                onCancel={activeJobId && onCancelJob ? () => onCancelJob(activeJobId) : undefined}
              />
            </div>
          </motion.div>
        )}

        {/* ── COMPLETED — show dataset ── */}
        {!isProcessing && filename && (
          <motion.div
            key="success-zone"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full space-y-6"
          >
            {/* Success card */}
            <div className="glass p-6 rounded-2xl flex items-center justify-between border-emerald-500/20 bg-emerald-500/[0.02]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-white font-medium mb-1">{filename}</h3>
                  <p className="text-xs text-emerald-400">Successfully ingested and compressed to Parquet.</p>
                </div>
              </div>
              <div className="flex items-center gap-8 text-center px-4">
                <div>
                  <span className="block text-2xl font-bold text-white">{rowCount.toLocaleString()}</span>
                  <span className="text-[10px] text-muted font-mono uppercase tracking-wider">Rows</span>
                </div>
                <div className="w-px h-8 bg-white/[0.1]" />
                <div>
                  <span className="block text-2xl font-bold text-white">{columns.length}</span>
                  <span className="text-[10px] text-muted font-mono uppercase tracking-wider">Columns</span>
                </div>
              </div>
            </div>

            {/* Preview table */}
            <div className="glass rounded-2xl overflow-hidden border-white/[0.06]">
              <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-2">
                <FileType className="w-4 h-4 text-cyan-400" />
                <h4 className="text-sm font-semibold text-white">Data Preview</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/[0.06]">
                      {columns.map(col => (
                        <th key={col} className="px-6 py-3 font-medium text-secondary">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 6).map((row, idx) => (
                      <tr key={idx} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                        {columns.map(col => (
                          <td key={col} className="px-6 py-3 text-white/80">{String(row[col] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Column curation */}
            <div className="glass rounded-3xl p-6 border-white/[0.06] space-y-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h4 className="text-sm font-semibold text-white">Interactive Curation</h4>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                Select unnecessary or metadata-only columns to drop before mapping the schema.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                {columns.map(col => {
                  const isSelected = selectedDropCols.includes(col);
                  return (
                    <button
                      key={col}
                      onClick={() => toggleDropColumn(col)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5
                        ${isSelected
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          : 'bg-white/[0.02] border-white/[0.06] text-secondary hover:border-white/[0.12] hover:text-white'
                        }`}
                    >
                      {isSelected ? <Trash2 className="w-3.5 h-3.5 shrink-0" /> : <Database className="w-3.5 h-3.5 shrink-0 opacity-40" />}
                      {col}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end pt-4 border-t border-white/[0.06]">
                <button
                  onClick={onCurationSubmit}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-void font-bold text-xs hover:bg-gray-100 transition-colors shadow-lg"
                >
                  Confirm & Proceed
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── IDLE — upload zone ── */}
        {!isProcessing && !filename && (
          <motion.div
            key="upload-zone"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-2xl"
          >
            <label
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`relative flex flex-col items-center justify-center w-full h-80 rounded-[2rem] border-2 border-dashed cursor-pointer transition-all duration-300 group overflow-hidden
                ${isDragging
                  ? 'border-cyan-400 bg-cyan-400/[0.03] shadow-[0_0_30px_rgba(34,211,238,0.15)]'
                  : 'border-white/[0.08] glass hover:border-white/[0.2] hover:bg-white/[0.02]'}`}
            >
              <input type="file" className="hidden" accept=".csv,.xlsx,.parquet" onChange={onFileChange} />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/[0.02] pointer-events-none" />
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-transform duration-500
                ${isDragging ? 'bg-cyan-400 text-void scale-110' : 'bg-white/[0.04] text-secondary group-hover:bg-white/[0.08] group-hover:text-white'}`}>
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {isDragging ? 'Drop file to upload' : 'Drag & drop or click to browse'}
              </h3>
              <div className="flex items-center gap-2 mt-4">
                {['.CSV', '.XLSX', '.PARQUET'].map(ext => (
                  <span key={ext} className="px-2 py-1 rounded-md bg-white/[0.04] text-[10px] font-mono text-muted uppercase tracking-wider">{ext}</span>
                ))}
              </div>
            </label>

            <div className="mt-8 flex items-center justify-center gap-4 text-sm text-secondary">
              <span className="w-12 h-px bg-white/[0.1]" />
              <span>or try it out with</span>
              <span className="w-12 h-px bg-white/[0.1]" />
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={handleLoadDemo}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white font-medium hover:bg-white/[0.08] transition-colors"
              >
                <Play className="w-4 h-4 text-cyan-400" />
                Load Demo Dataset
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
