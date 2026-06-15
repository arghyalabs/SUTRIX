import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, BarChart3, Database, Brain, RefreshCw, AlertCircle, CheckCircle, 
  TrendingUp, HelpCircle, Network as NetIcon, ArrowRight, Play, Pause, GitBranch,
  Plus, Settings, Filter, FileSpreadsheet, Layers, ShieldAlert, BookOpen, User, HelpCircle as HelpIcon
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { toast } from 'react-hot-toast';
import { API_BASE_URL } from '../../config';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface ScientificInsightsWorkspaceProps {
  clientId: string;
}

export const ScientificInsightsWorkspace: React.FC<ScientificInsightsWorkspaceProps> = ({
  clientId,
}) => {
  const { 
    columns, mappings, datasetMode, detectedDomain, rowCount, setDataset
  } = useWorkspaceStore();

  const apiBase = API_BASE_URL;

  // Active state vars
  const [activeRibbonTab, setActiveRibbonTab] = useState<'home' | 'curation' | 'stats' | 'qsar' | 'clinical'>('home');
  const [userPersona, setUserPersona] = useState<'TOXICOLOGIST' | 'CLINICAL' | 'SOCIAL' | 'FORMULATION'>('TOXICOLOGIST');
  const [rowData, setRowData] = useState<any[]>([]);
  const [provenance, setProvenance] = useState<any>({ nodes: [], edges: [] });
  const [activeBranch, setActiveBranch] = useState<string>('main');
  const [branches, setBranches] = useState<any[]>([]);
  
  // Modals / Input dialogs
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showImputeModal, setShowImputeModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);

  // Form states
  const [filterCol, setFilterCol] = useState('');
  const [filterOp, setFilterOp] = useState('=');
  const [filterVal, setFilterVal] = useState('');

  const [imputeCol, setImputeCol] = useState('');
  const [imputeVal, setImputeVal] = useState('');

  const [newBranchName, setNewBranchName] = useState('');
  const [parentEventId, setParentEventId] = useState('');

  // Stats test form states
  const [testType, setTestType] = useState<'T_TEST' | 'ANOVA' | 'REGRESSION'>('T_TEST');
  const [targetColumn, setTargetColumn] = useState('');
  const [groupColumn, setGroupColumn] = useState('');
  const [predictorColumns, setPredictorColumns] = useState<string[]>([]);
  const [runFallback, setRunFallback] = useState(true);
  const [testResult, setTestResult] = useState<any>(null);

  // Assumption health state
  const [assumptionHealth, setAssumptionHealth] = useState<any>(null);
  const [assumptionLoading, setAssumptionLoading] = useState(false);

  // ── 1. Fetch grid data from DuckDB ──────────────────────────────────────────
  const fetchGridData = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/spreadsheet/query?client_id=${clientId}&query=SELECT * FROM ws_${clientId}_active`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setRowData(data.rows || []);
      }
    } catch (err) {
      console.error('Failed to load grid data:', err);
    }
  }, [clientId, apiBase]);

  // ── 2. Fetch provenance tree and branches ───────────────────────────────────
  const fetchProvenance = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/replay/${clientId}/provenance`);
      if (res.ok) {
        const data = await res.json();
        setProvenance(data);
        
        // Extract unique branches from nodes
        const uniqueBranches = Array.from(new Set(data.nodes.map((n: any) => n.branch_id).filter(Boolean)));
        setBranches(uniqueBranches.map(b => ({ id: b, name: String(b).replace(`br_${clientId}_`, '') })));
      }
    } catch (err) {
      console.error('Failed to load provenance:', err);
    }
  }, [clientId, apiBase]);

  // ── 3. Fetch assumption health ──────────────────────────────────────────────
  const fetchAssumptionHealth = useCallback(async () => {
    setAssumptionLoading(true);
    // Find numeric columns for testing
    const numericCols = columns.filter(c => {
      if (rowData.length === 0) return false;
      const val = rowData[0][c];
      return typeof val === 'number' && !isNaN(val);
    });

    const payload = {
      client_id: clientId,
      columns: numericCols.slice(0, 5), // evaluate up to 5 numeric columns
      target_column: targetColumn || numericCols[0] || null,
      group_column: groupColumn || columns.find(c => c.toLowerCase() === 'group' || c.toLowerCase() === 'species') || null
    };

    try {
      const res = await fetch(`${apiBase}/api/statistics/assumption-health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setAssumptionHealth(data);
      }
    } catch (err) {
      console.error('Failed to load assumption health:', err);
    } finally {
      setAssumptionLoading(false);
    }
  }, [clientId, columns, rowData, targetColumn, groupColumn, apiBase]);

  // Load everything on mount
  useEffect(() => {
    fetchGridData();
    fetchProvenance();
  }, [fetchGridData, fetchProvenance]);

  // Update assumption health when data changes
  useEffect(() => {
    if (rowData.length > 0) {
      fetchAssumptionHealth();
    }
  }, [rowData, fetchAssumptionHealth]);

  // ── 4. Apply spreadsheet filter ────────────────────────────────────────────
  const handleApplyFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filterCol) return;
    const toastId = toast.loading('Applying spreadsheet filter...');
    try {
      const res = await fetch(
        `${apiBase}/api/spreadsheet/apply-filter?client_id=${clientId}&column=${encodeURIComponent(filterCol)}&operator=${encodeURIComponent(filterOp)}&value=${encodeURIComponent(filterVal)}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Filter application failed');
      
      toast.success('Filter applied successfully', { id: toastId });
      setShowFilterModal(false);
      fetchGridData();
      fetchProvenance();
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    }
  };

  // ── 5. Apply missingness imputation ─────────────────────────────────────────
  const handleApplyImpute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imputeCol) return;
    const toastId = toast.loading('Imputing missing values...');
    try {
      const res = await fetch(
        `${apiBase}/api/spreadsheet/impute?client_id=${clientId}&column=${encodeURIComponent(imputeCol)}&value=${encodeURIComponent(imputeVal)}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Imputation failed');
      
      toast.success('Missing values imputed successfully', { id: toastId });
      setShowImputeModal(false);
      fetchGridData();
      fetchProvenance();
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    }
  };

  // ── 6. Create a new branch ──────────────────────────────────────────────────
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName) return;
    const toastId = toast.loading('Creating branch...');
    try {
      const form = new FormData();
      form.append('name', newBranchName);
      if (parentEventId) {
        form.append('parent_event_id', parentEventId);
      }
      const res = await fetch(`${apiBase}/api/replay/${clientId}/branch`, {
        method: 'POST',
        body: form
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Branch creation failed');
      
      toast.success(`Branch "${newBranchName}" created!`, { id: toastId });
      setShowBranchModal(false);
      setNewBranchName('');
      setParentEventId('');
      fetchProvenance();
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    }
  };

  // ── 7. Replay branch state ──────────────────────────────────────────────────
  const handleReplayBranch = async (branchId: string) => {
    const toastId = toast.loading(`Replaying branch logs...`);
    try {
      const form = new FormData();
      form.append('branch_id', branchId);
      const res = await fetch(`${apiBase}/api/replay/${clientId}/run`, {
        method: 'POST',
        body: form
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Replay failed');
      
      toast.success(`Switched and replayed to branch!`, { id: toastId });
      setActiveBranch(branchId);
      fetchGridData();
      fetchProvenance();
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    }
  };

  // ── 8. Execute hypothesis test ──────────────────────────────────────────────
  const handleExecuteTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const toastId = toast.loading('Executing hypothesis test...');
    try {
      const payload = {
        client_id: clientId,
        test_type: testType,
        target_column: targetColumn,
        group_column: groupColumn || null,
        predictor_columns: testType === 'REGRESSION' ? predictorColumns : null,
        run_fallback: runFallback
      };

      const res = await fetch(`${apiBase}/api/statistics/hypothesis-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Test execution failed');

      setTestResult(data);
      toast.success('Statistical test complete!', { id: toastId });
      fetchProvenance(); // refresh replay log
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    }
  };

  // AG Grid columns configuration
  const gridColumns = useMemo(() => {
    return columns.map(col => ({
      field: col,
      headerName: col,
      sortable: true,
      filter: true,
      resizable: true,
      flex: 1
    }));
  }, [columns]);

  return (
    <div className="flex flex-col h-[85vh] bg-[#030b18] overflow-hidden text-white font-sans">
      
      {/* ─── Ribbon Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col border-b bg-slate-900/40 border-slate-800 shrink-0">
        {/* Upper persona & tab navigator */}
        <div className="flex flex-col md:flex-row justify-between items-center px-6 py-3 border-b border-slate-800 gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-violet-400" />
              <select 
                value={userPersona} 
                onChange={(e) => setUserPersona(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-1.5 font-bold text-violet-300 focus:outline-none"
              >
                <option value="TOXICOLOGIST">Toxicologist Persona</option>
                <option value="CLINICAL">Clinical Analyst Persona</option>
                <option value="SOCIAL">Social Scientist Persona</option>
                <option value="FORMULATION">Formulation Scientist Persona</option>
              </select>
            </div>
            
            <nav className="flex gap-2">
              {[
                { id: 'home', label: 'Home Workspace' },
                { id: 'curation', label: 'Data Curation' },
                { id: 'stats', label: 'Statistics' },
                { id: 'qsar', label: 'QSAR & Modeling' },
                { id: 'clinical', label: 'Clinical' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveRibbonTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeRibbonTab === tab.id 
                      ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2.5 py-1 rounded-md">
              MODE: {datasetMode} ({detectedDomain})
            </span>
            <span className="text-[10px] font-mono bg-violet-950 text-violet-400 px-2.5 py-1 rounded-md">
              ROWS: {rowCount}
            </span>
          </div>
        </div>

        {/* Lower tab contextual actions */}
        <div className="px-6 py-2.5 bg-slate-950/40 flex items-center gap-3 min-h-[48px] overflow-x-auto">
          {activeRibbonTab === 'home' && (
            <>
              <button 
                onClick={fetchGridData} 
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Data
              </button>
              <button 
                onClick={() => setShowBranchModal(true)} 
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs transition-colors"
              >
                <GitBranch className="w-3.5 h-3.5" /> Branch Workspace
              </button>
            </>
          )}

          {activeRibbonTab === 'curation' && (
            <>
              <button 
                onClick={() => setShowFilterModal(true)} 
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                <Filter className="w-3.5 h-3.5" /> Apply Filter
              </button>
              <button 
                onClick={() => setShowImputeModal(true)} 
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Impute Missing Values
              </button>
            </>
          )}

          {activeRibbonTab === 'stats' && (
            <>
              <button 
                onClick={() => { setTestType('T_TEST'); setShowTestModal(true); }} 
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold hover:bg-violet-500/20 transition-all"
              >
                <Activity className="w-3.5 h-3.5" /> Independent T-test
              </button>
              <button 
                onClick={() => { setTestType('ANOVA'); setShowTestModal(true); }} 
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold hover:bg-violet-500/20 transition-all"
              >
                <Layers className="w-3.5 h-3.5" /> One-way ANOVA
              </button>
              <button 
                onClick={() => { setTestType('REGRESSION'); setShowTestModal(true); }} 
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold hover:bg-violet-500/20 transition-all"
              >
                <TrendingUp className="w-3.5 h-3.5" /> Multiple Regression
              </button>
            </>
          )}

          {activeRibbonTab === 'qsar' && (
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              QSAR Studio Mode active for molecular workspaces. Open the QSAR tab in the sidebar to generate descriptor matrices.
            </div>
          )}

          {activeRibbonTab === 'clinical' && (
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-500" />
              Clinical Research Studio. CDISC SDTM demographics/vital signs schema alignment verified.
            </div>
          )}
        </div>
      </div>

      {/* ─── Workspace Main Layout ──────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Side: StudyNavigator (Provenance & Replay Logs) */}
        <div className="w-72 border-r bg-slate-950/40 border-slate-800 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">🌿 Branch Provenance</span>
            <button 
              onClick={() => setShowBranchModal(true)}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 border-b border-slate-800 bg-slate-950/20 shrink-0">
            <label className="text-[10px] text-slate-400 block mb-1 font-bold">Active Branch</label>
            <select 
              value={activeBranch} 
              onChange={(e) => handleReplayBranch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-xs text-white rounded-lg p-2 focus:outline-none"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Timeline of events (Replay Events logs) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Replay Events Log</span>
            {provenance.nodes.length === 0 ? (
              <span className="text-xs text-slate-600 block">No events recorded</span>
            ) : (
              <div className="relative border-l border-slate-800 pl-4 space-y-4 ml-2">
                {provenance.nodes.map((node: any, idx: number) => (
                  <div key={node.id} className="relative group text-left">
                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border border-[#030b18] ${
                      node.type === 'root' ? 'bg-emerald-500' : 'bg-violet-500'
                    }`} />
                    <div className="text-[11px] font-bold text-slate-300 leading-none">
                      {node.label}
                    </div>
                    {node.payload && (
                      <pre className="text-[9px] text-slate-500 bg-slate-950/60 p-1.5 rounded-md mt-1 border border-slate-800/40 overflow-x-auto max-w-full">
                        {JSON.stringify(node.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: Grid and Hypothesis Outputs */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/20">
          
          {/* Main Grid View */}
          <div className="flex-1 relative overflow-hidden">
            <div className="ag-theme-alpine-dark w-full h-full">
              <AgGridReact
                rowData={rowData}
                columnDefs={gridColumns}
                pagination={true}
                paginationPageSize={20}
              />
            </div>
          </div>

          {/* Hypothesis testing results board */}
          {testResult && (
            <div className="h-60 border-t border-slate-800 bg-[#050d1b] flex flex-col overflow-hidden shrink-0">
              <div className="flex justify-between items-center px-6 py-2 border-b border-slate-800 shrink-0 bg-slate-950/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Brain className="w-4 h-4 text-violet-400" />
                  Hypothesis Output: {testResult.test_used}
                </span>
                {testResult.fallback_triggered && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/20 font-bold uppercase tracking-wider">
                    Assumption Guardian Fallback Active
                  </span>
                )}
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Numeric parameters */}
                <div className="w-72 border-r border-slate-800/60 p-4 overflow-y-auto text-xs space-y-2.5 shrink-0">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Statistic:</span>
                    <span className="font-bold text-white">
                      {testResult.results.statistic !== undefined ? testResult.results.statistic.toFixed(4) : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">p-value:</span>
                    <span className={`font-bold ${testResult.results.p_value < 0.05 ? 'text-emerald-400' : 'text-slate-200'}`}>
                      {testResult.results.p_value !== undefined ? testResult.results.p_value.toExponential(4) : 'N/A'}
                    </span>
                  </div>
                  {testResult.results.df !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">DF:</span>
                      <span className="font-bold text-white">{testResult.results.df}</span>
                    </div>
                  )}
                  {testResult.results.r_squared !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">R-squared:</span>
                      <span className="font-bold text-white">{testResult.results.r_squared.toFixed(4)}</span>
                    </div>
                  )}
                </div>

                {/* Narrative explanations */}
                <div className="flex-1 p-6 overflow-y-auto bg-slate-950/10">
                  <h4 className="text-xs font-bold text-violet-300 uppercase tracking-wider mb-2">Scientific Narrative Report™</h4>
                  <p className="text-xs text-slate-300 leading-relaxed font-mono">
                    {testResult.narrative}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Real-Time Assumption Dashboard */}
        <div className="w-72 border-l bg-slate-950/40 border-slate-800 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-violet-400" />
              Assumption Guardian Panel
            </span>
            {assumptionLoading && <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {assumptionHealth ? (
              <>
                {/* Normality Box */}
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Shapiro-Wilk Normality</span>
                  {assumptionHealth.normality?.map((n: any) => (
                    <div key={n.column} className="p-3 rounded-xl border bg-slate-950/40 border-slate-800 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-slate-200 block">{n.column}</span>
                        <span className="text-[10px] text-slate-400 mt-1 block">p = {n.p_value ? n.p_value.toExponential(2) : 'N/A'}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        n.passed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {n.passed ? 'Normal' : 'Skewed'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Homogeneity Box */}
                {assumptionHealth.homogeneity && assumptionHealth.homogeneity.length > 0 && (
                  <div className="space-y-2.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Variance Homogeneity</span>
                    {assumptionHealth.homogeneity.map((h: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-xl border bg-slate-950/40 border-slate-800 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-slate-200 block">Levene's Test</span>
                          <span className="text-[10px] text-slate-400 mt-1 block">p = {h.p_value ? h.p_value.toExponential(2) : 'N/A'}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          h.passed ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {h.passed ? 'Equal' : 'Unequal'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Multicollinearity VIF Box */}
                {Object.keys(assumptionHealth.multicollinearity_vif || {}).length > 0 && (
                  <div className="space-y-2.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Multicollinearity VIF</span>
                    <div className="p-3 rounded-xl border bg-slate-950/40 border-slate-800 text-xs space-y-1.5">
                      {Object.entries(assumptionHealth.multicollinearity_vif).map(([col, vif]: any) => (
                        <div key={col} className="flex justify-between items-center">
                          <span className="text-slate-400">{col}</span>
                          <span className={`font-bold ${vif > 5.0 ? 'text-rose-400' : 'text-slate-200'}`}>
                            {vif.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-500 block text-center mt-8">Loading diagnostics...</span>
            )}
          </div>
        </div>

      </div>

      {/* ─── Dialogue Modals ────────────────────────────────────────────────── */}
      
      {/* 1. Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <form onSubmit={handleApplyFilter} className="w-full max-w-sm p-6 border rounded-3xl bg-slate-900 border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white">Apply Spreadsheet Filter</h3>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 block">Select Column</label>
              <select 
                value={filterCol} 
                onChange={(e) => setFilterCol(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none"
              >
                <option value="">-- Choose --</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <label className="text-xs text-slate-400 block">Operator</label>
                <select 
                  value={filterOp} 
                  onChange={(e) => setFilterOp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none"
                >
                  <option value="=">=</option>
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                  <option value=">=">&gt;=</option>
                  <option value="<=">&lt;=</option>
                  <option value="!=">!=</option>
                  <option value="like">Like</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-400 block">Value</label>
                <input 
                  type="text" 
                  value={filterVal} 
                  onChange={(e) => setFilterVal(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none" 
                  placeholder="e.g. 50"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                type="submit" 
                className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
              >
                Apply
              </button>
              <button 
                type="button" 
                onClick={() => setShowFilterModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Imputation Modal */}
      {showImputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <form onSubmit={handleApplyImpute} className="w-full max-w-sm p-6 border rounded-3xl bg-slate-900 border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white">Impute Missing Values</h3>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 block">Column to Impute</label>
              <select 
                value={imputeCol} 
                onChange={(e) => setImputeCol(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none"
              >
                <option value="">-- Choose --</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 block">Replacement Value</label>
              <input 
                type="text" 
                value={imputeVal} 
                onChange={(e) => setImputeVal(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none" 
                placeholder="e.g. 0.0 or Mean"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                type="submit" 
                className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
              >
                Impute
              </button>
              <button 
                type="button" 
                onClick={() => setShowImputeModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <form onSubmit={handleCreateBranch} className="w-full max-w-sm p-6 border rounded-3xl bg-slate-900 border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white">Create Analysis Branch</h3>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 block">Branch Name</label>
              <input 
                type="text" 
                value={newBranchName} 
                onChange={(e) => setNewBranchName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none" 
                placeholder="e.g. non-parametric-tests"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 block">Stem Event ID (Optional)</label>
              <select 
                value={parentEventId} 
                onChange={(e) => setParentEventId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none"
              >
                <option value="">-- Stem from Active Tip --</option>
                {provenance.nodes.filter((n: any) => n.type === 'event').map((n: any) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                type="submit" 
                className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
              >
                Branch
              </button>
              <button 
                type="button" 
                onClick={() => setShowBranchModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Statistics Test Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <form onSubmit={handleExecuteTest} className="w-full max-w-md p-6 border rounded-3xl bg-slate-900 border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white">Execute Hypothesis Test: {testType}</h3>
            
            <div className="space-y-2">
              <label className="text-xs text-slate-400 block">Target Variable (Continuous outcome)</label>
              <select 
                value={targetColumn} 
                onChange={(e) => setTargetColumn(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none"
              >
                <option value="">-- Choose --</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {testType !== 'REGRESSION' ? (
              <div className="space-y-2">
                <label className="text-xs text-slate-400 block">Grouping Variable (Categorical/discrete)</label>
                <select 
                  value={groupColumn} 
                  onChange={(e) => setGroupColumn(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded-lg p-2.5 focus:outline-none"
                >
                  <option value="">-- Choose --</option>
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs text-slate-400 block">Predictor Column(s) (Check all that apply)</label>
                <div className="max-h-24 overflow-y-auto border border-slate-800 bg-slate-950 rounded-lg p-2.5 space-y-1">
                  {columns.filter(c => c !== targetColumn).map(col => (
                    <label key={col} className="flex items-center gap-2 text-xs text-slate-300">
                      <input 
                        type="checkbox" 
                        checked={predictorColumns.includes(col)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPredictorColumns([...predictorColumns, col]);
                          } else {
                            setPredictorColumns(predictorColumns.filter(c => c !== col));
                          }
                        }}
                      />
                      {col}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="run_fallback_check" 
                checked={runFallback} 
                onChange={(e) => setRunFallback(e.target.checked)}
              />
              <label htmlFor="run_fallback_check" className="text-xs text-slate-300">
                Assumption Guardian™ (auto fallback to non-parametric tests if assumptions fail)
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                type="submit" 
                className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
              >
                Execute
              </button>
              <button 
                type="button" 
                onClick={() => setShowTestModal(false)}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
