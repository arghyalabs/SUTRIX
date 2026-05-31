import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, ArrowUpDown, ChevronLeft, ChevronRight, BarChart3, Database, 
  HelpCircle, Eye, Info, RefreshCw, X, ArrowUp, ArrowDown
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { toast } from 'react-hot-toast';

interface ScientificDataExplorerProps {
  clientId: string;
}

export const ScientificDataExplorer: React.FC<ScientificDataExplorerProps> = ({
  clientId,
}) => {
  const { columns, mappings } = useWorkspaceStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [limit] = useState(25);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Sorting
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Active Column for Sidebar Stats
  const [activeCol, setActiveCol] = useState<string | null>(null);
  const [colStats, setColStats] = useState<any>(null);

  const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

  useEffect(() => {
    fetchData();
  }, [page, sortCol, sortDir, clientId]);

  const fetchData = async (query = searchQuery) => {
    setLoading(true);
    try {
      const url = new URL(`${apiBase}/api/explorer/${clientId}/search`);
      url.searchParams.append('q', query);
      url.searchParams.append('page', page.toString());
      url.searchParams.append('limit', limit.toString());
      if (sortCol) {
        url.searchParams.append('sort_col', sortCol);
        url.searchParams.append('sort_dir', sortDir);
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Search failed');

      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Failed to query dataset records.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchData();
  };

  const toggleSort = (colName: string) => {
    if (sortCol === colName) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(colName);
      setSortDir('asc');
    }
    setPage(0);
  };

  // Calculate statistics for the clicked column on the frontend
  const handleColumnClick = (colName: string) => {
    if (results.length === 0) return;

    setActiveCol(colName);
    
    // Calculate simple stats
    const values = results.map(r => r[colName]).filter(v => v !== null && v !== undefined && v !== '');
    const isNum = values.every(v => !isNaN(Number(v)));
    const unique = new Set(values);

    let stats: any = {
      name: colName,
      type: isNum ? 'Numeric' : 'Categorical',
      role: mappings[colName] || 'Unmapped',
      uniqueCount: unique.size,
      totalCount: results.length,
      missingPct: ((results.length - values.length) / results.length) * 100,
    };

    if (isNum && values.length > 0) {
      const numVals = values.map(Number);
      numVals.sort((a, b) => a - b);
      const min = numVals[0];
      const max = numVals[numVals.length - 1];
      const sum = numVals.reduce((a, b) => a + b, 0);
      const mean = sum / numVals.length;
      
      const mid = Math.floor(numVals.length / 2);
      const median = numVals.length % 2 !== 0 ? numVals[mid] : (numVals[mid - 1] + numVals[mid]) / 2;
      
      const sqDiff = numVals.map(v => Math.pow(v - mean, 2));
      const variance = sqDiff.reduce((a, b) => a + b, 0) / numVals.length;
      const std = Math.sqrt(variance);

      stats = {
        ...stats,
        min,
        max,
        mean,
        median,
        std,
      };
    } else if (values.length > 0) {
      // Frequency distribution for categories
      const freqs: Record<string, number> = {};
      values.forEach(v => {
        const s = String(v);
        freqs[s] = (freqs[s] || 0) + 1;
      });
      const sortedFreqs = Object.entries(freqs).sort((a, b) => b[1] - a[1]);
      stats.distribution = sortedFreqs.slice(0, 5); // top 5
    }

    setColStats(stats);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex h-[75vh] gap-6 relative overflow-hidden">
      
      {/* Main Table Panel */}
      <div className="flex-1 flex flex-col border rounded-3xl bg-slate-900/60 border-slate-800/80 backdrop-blur-md overflow-hidden p-6">
        
        {/* Upper Search Bar & Filters */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
          <form onSubmit={handleSearch} className="relative w-full md:max-w-md">
            <input
              type="text"
              placeholder="Search scientific records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-violet-500 transition-colors"
            />
            <Search className="w-4.5 h-4.5 text-slate-500 absolute left-3 top-3" />
          </form>

          {/* Sizing Indicator */}
          <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
            <span>Showing {results.length} / {total} records</span>
            <button 
              onClick={() => fetchData()}
              className="p-2 rounded-lg bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Records Table */}
        <div className="flex-1 overflow-x-auto border border-slate-800 bg-slate-950/40 rounded-2xl overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
              <div className="w-8 h-8 rounded-full border-2 border-violet-500/10 border-t-violet-500 animate-spin" />
              <span className="text-xs text-slate-500">Querying records from Parquet engine...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 space-y-2">
              <Database className="w-8 h-8 text-slate-600" />
              <p className="text-xs text-white font-bold">No records found</p>
              <p className="text-[10px] text-slate-500">Try adjusting your fuzzy search query.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10">
                  {columns.map(col => {
                    const isSorted = sortCol === col;
                    return (
                      <th 
                        key={col} 
                        onClick={() => toggleSort(col)}
                        className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-800/40 cursor-pointer select-none hover:bg-slate-800/30 transition-colors
                          ${isSorted ? 'text-violet-400 bg-violet-500/[0.02]' : ''}
                        `}
                      >
                        <div className="flex items-center gap-1.5 justify-between">
                          <span className="truncate">{col}</span>
                          {isSorted ? (
                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-violet-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-violet-400 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="text-xs text-slate-400 divide-y divide-slate-800/60">
                {results.map((row, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
                    {columns.map(col => (
                      <td 
                        key={col} 
                        onClick={() => handleColumnClick(col)}
                        className={`px-4 py-2.5 truncate max-w-[180px] border-r border-slate-800/20 cursor-pointer
                          ${activeCol === col ? 'bg-violet-500/[0.02] text-violet-300 font-medium' : ''}
                        `}
                      >
                        {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-700 italic">null</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6 border-t border-slate-800/80 pt-4">
            <span className="text-xs text-slate-500">Page {page + 1} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(prev => Math.max(0, prev - 1))}
                className="p-2 rounded-xl border border-slate-800 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(prev => prev + 1)}
                className="p-2 rounded-xl border border-slate-800 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Collapsible Column Statistics Sidebar */}
      <AnimatePresence>
        {activeCol && colStats && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-80 border rounded-3xl bg-slate-900/60 border-slate-800/80 backdrop-blur-md overflow-hidden flex flex-col p-6 shrink-0 relative shadow-2xl"
          >
            {/* Close Button */}
            <button 
              onClick={() => setActiveCol(null)}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Sidebar Header */}
            <div className="flex items-center gap-3 border-b border-slate-800/80 pb-4 mb-6">
              <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400">
                <BarChart3 className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="font-bold text-white text-xs truncate max-w-[180px]">{colStats.name}</h4>
                <span className="text-[10px] text-slate-500 block uppercase font-semibold mt-0.5">{colStats.role}</span>
              </div>
            </div>

            {/* Stats Body */}
            <div className="flex-1 space-y-6 overflow-y-auto">
              
              {/* Type Chip & Missing% */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 border rounded-xl bg-slate-950/40 border-slate-800">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">DataType</span>
                  <span className="text-xs font-bold text-white">{colStats.type}</span>
                </div>
                <div className="p-3 border rounded-xl bg-slate-950/40 border-slate-800">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Missingness</span>
                  <span className={`text-xs font-bold ${colStats.missingPct > 20 ? 'text-rose-400' : 'text-emerald-400'}`}>{colStats.missingPct.toFixed(1)}%</span>
                </div>
              </div>

              {/* Unique Values */}
              <div className="p-4 border rounded-xl bg-slate-950/40 border-slate-800 text-center">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Unique Values (Cardinality)</span>
                <span className="text-xl font-extrabold text-violet-400">{colStats.uniqueCount}</span>
              </div>

              {/* Numeric Stats */}
              {colStats.type === 'Numeric' && colStats.mean !== undefined && (
                <div className="space-y-3 p-4 border rounded-xl bg-slate-950/20 border-slate-800">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block border-b border-slate-800 pb-1.5">Statistical Moments</span>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Minimum</span>
                      <span className="text-white font-mono">{colStats.min.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Maximum</span>
                      <span className="text-white font-mono">{colStats.max.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Mean (Average)</span>
                      <span className="text-white font-mono font-bold text-violet-400">{colStats.mean.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Median</span>
                      <span className="text-white font-mono">{colStats.median.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Std Deviation</span>
                      <span className="text-white font-mono">{colStats.std.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Categorical Distribution */}
              {colStats.type === 'Categorical' && colStats.distribution && (
                <div className="space-y-3 p-4 border rounded-xl bg-slate-950/20 border-slate-800">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block border-b border-slate-800 pb-1.5">Top Frequencies</span>
                  <div className="space-y-2 text-xs">
                    {colStats.distribution.map(([val, count]: any, idx: number) => {
                      const pct = (count / colStats.totalCount) * 100;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-slate-400">
                            <span className="truncate max-w-[150px] font-semibold text-white">{val}</span>
                            <span className="font-mono text-slate-500">{count} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </motion.aside>
        )}
      </AnimatePresence>

    </div>
  );
};
