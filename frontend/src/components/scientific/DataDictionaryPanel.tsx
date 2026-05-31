import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FileText, Download, Check, AlertCircle, Copy, FileSpreadsheet, Loader2, Info
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { toast } from 'react-hot-toast';

interface DataDictionaryPanelProps {
  clientId: string;
}

export const DataDictionaryPanel: React.FC<DataDictionaryPanelProps> = ({
  clientId,
}) => {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

  useEffect(() => {
    fetchDictionary();
  }, [clientId]);

  const fetchDictionary = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/workspace/${clientId}/data-dictionary`);
      if (!res.ok) throw new Error('Failed to load dictionary');
      const data = await res.json();
      setEntries(data || []);
    } catch {
      toast.error('Failed to load dataset data dictionary.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (format: 'xlsx' | 'pdf') => {
    const url = `${apiBase}/api/workspace/${clientId}/data-dictionary/export?format=${format}`;
    
    // Create hidden download anchor link
    const link = document.createElement('a');
    link.href = url;
    link.download = `data_dictionary_${clientId.substring(0, 8)}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Data dictionary ${format.toUpperCase()} export initiated.`);
  };

  const handleCopyJSON = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
      setCopied(true);
      toast.success('JSON copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy JSON.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        <span className="text-xs text-slate-500">Generating publication-grade data dictionary...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header / Actions Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            Platform Data Dictionary
          </h4>
          <p className="text-[10px] text-slate-400 mt-1">
            Standardized column profiles, metadata bindings, and semantic ontological mapping.
          </p>
        </div>

        {/* Download Buttons */}
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => handleDownload('xlsx')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 font-bold text-xs transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            onClick={() => handleDownload('pdf')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-slate-950 font-bold text-xs transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
            PDF Report
          </button>
          <button
            onClick={handleCopyJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500 hover:text-slate-950 font-bold text-xs transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            Copy JSON
          </button>
        </div>
      </div>

      {/* Dictionary Table */}
      <div className="border border-slate-800 bg-slate-950/40 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60 text-[10px] font-bold text-slate-500 uppercase">
              <th className="px-4 py-3">Column Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Mapped Role</th>
              <th className="px-4 py-3">Missingness</th>
              <th className="px-4 py-3">Unique Values</th>
              <th className="px-4 py-3">Ontological Meaning</th>
            </tr>
          </thead>
          <tbody className="text-xs divide-y divide-slate-850/60 text-slate-400">
            {entries.map((entry, idx) => (
              <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
                <td className="px-4 py-2.5 text-white font-semibold font-mono">{entry.column_name}</td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold text-[9px] uppercase tracking-wider">
                    {entry.detected_type}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                    entry.mapped_variable === 'none' 
                      ? 'bg-slate-900 text-slate-600' 
                      : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                  }`}>
                    {entry.mapped_variable}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono">{entry.missing_pct.toFixed(1)}%</td>
                <td className="px-4 py-2.5 font-mono">{entry.unique_values}</td>
                <td className="px-4 py-2.5 text-slate-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span className="truncate max-w-[250px]">{entry.scientific_meaning}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
};
