---
name: studio_scientific_implementation
description: >
  Activated when implementing, building, editing, or upgrading any feature in the
  QSAR Engineering Studio, Data Analysis Studio, or Scientific Intelligence Studio
  inside the Scientific Data Orchestrator (SDO / SUTRIX) project. Also activates
  for tasks involving: adding panels, adding backend routes, fixing scientific
  analysis, building visualizations, or improving any of these three studios.
---

# Studio Scientific Implementation Skill

## CRITICAL MANDATE

Every line of code you write must be **scientifically correct first, then aesthetically good**.
If a feature produces a wrong result scientifically, it has failed — regardless of how good it looks.
Never fabricate data, never use `Math.random()` for scientific values, never hardcode example results.
All numbers shown to the user must come from actual computation on their actual dataset.

---

## PART 1 — PROJECT ARCHITECTURE (read this first, every time)

### Project Root
```
b:\SUTRIX__\Scientific Data Orchestrator\
├── backend/                     ← FastAPI Python backend
│   ├── api/routes/              ← All API route files
│   │   ├── qsar_studio_routes.py     (prefix: /api/qsar-studio)
│   │   ├── analytics_routes.py       (prefix: /api/analytics)
│   │   └── intelligence_routes.py    (prefix: /api/intelligence)
│   ├── descriptor_engine/       ← RDKit/Mordred descriptor calculators
│   │   ├── rdkit_engine.py           (RDKitEngine class, calculate_from_smiles())
│   │   ├── mordred_engine.py         (MordredEngine class)
│   │   └── descriptor_registry.py   (calculate_all(), DESCRIPTOR_FUNCTIONS)
│   ├── intelligence/            ← Dataset health internal library
│   ├── pipeline/                ← AsyncEnrichmentOrchestrator
│   └── main.py                  ← Router registration + app startup
├── frontend/src/
│   ├── components/studio/
│   │   ├── StudioShell.tsx           ← Shared layout wrapper for ALL studios
│   │   ├── analytics/               ← Data Analysis Studio panels
│   │   ├── qsar/                    ← QSAR Engineering Studio panels
│   │   └── intelligence/            ← Scientific Intelligence Studio panels
│   ├── components/modeling/         ← ModelingReadinessWorkspace (10-tab deep workspace)
│   ├── services/                    ← API service modules
│   ├── store/useWorkspaceStore.ts   ← Zustand global store
│   └── hooks/useStudioInit.ts       ← Studio initialization hook
└── data/                        ← Demo datasets
    ├── qsar_demo_dataset.csv
    └── eco_toxicity_dataset.csv
```

### Studio Accent Colors (NEVER mix these up)
| Studio | ID | Accent | Tailwind classes to use |
|--------|-----|--------|------------------------|
| Data Analysis | `analytics` | Violet | `text-violet-400`, `bg-violet-500/10`, `border-violet-500/20`, `border-violet-400` |
| QSAR Engineering | `qsar` | Blue | `text-blue-400`, `bg-blue-500/10`, `border-blue-500/20`, `border-blue-400` |
| Scientific Intelligence | `intelligence` | Rose | `text-rose-400`, `bg-rose-500/10`, `border-rose-500/20`, `border-rose-400` |

---

## PART 2 — MANDATORY FRONTEND CODE PATTERNS

### 2.1 Every Panel Has This Exact Structure

```tsx
import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
// add other lucide icons as needed

interface PanelProps {
  clientId: string;
  apiBase: string;
  // add panel-specific props (sessionInfo, etc.) only if needed
}

// Define all TypeScript interfaces for API response shapes HERE, before the component

export const MyNewPanel: React.FC<PanelProps> = ({ clientId, apiBase }) => {
  const [data, setData]     = useState<MyResponseType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  // add only the state you actually need

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase}/api/analytics/${clientId}/my-endpoint`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Request failed');
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [clientId]); // auto-load on mount

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center h-32 gap-2 text-violet-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Computing…</span>
        </div>
      )}

      {/* Content — only render when data is available */}
      {data && (
        <>
          {/* YOUR CONTENT HERE */}
        </>
      )}
    </div>
  );
};
```

**Rules:**
- Always use `fetch()` — NEVER import or use axios in studio panels
- API URL always: `` `${apiBase}/api/{studio-prefix}/${clientId}/{endpoint}` ``
- Loading text should describe what's being computed: "Computing correlation matrix…" NOT just "Loading…"
- The `load` function MUST set `setLoading(true)` at start and `setLoading(false)` in `finally`
- For manual-trigger panels, omit the `useEffect` and wire `load` to a button's `onClick`

### 2.2 Stat Cards (KPI numbers)

```tsx
// Grid of stat cards — always use this exact pattern:
<div className="grid grid-cols-3 gap-3">  {/* adjust cols as needed */}
  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
    <div className="text-xl font-black text-white">{value}</div>
    <div className="text-[10px] text-slate-500 mt-0.5">Label</div>
  </div>
</div>
```

For colored stat cards (warning/success states):
```tsx
// Success/emerald card:
<div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
  <div className="text-xl font-black text-emerald-400">{value}</div>
  <div className="text-[10px] text-emerald-600 mt-0.5">Label</div>
</div>
// Warning/amber card:
<div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
  <div className="text-xl font-black text-amber-400">{value}</div>
  <div className="text-[10px] text-amber-600 mt-0.5">Label</div>
</div>
// Danger/rose card:
<div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
  <div className="text-xl font-black text-rose-400">{value}</div>
  <div className="text-[10px] text-rose-600 mt-0.5">Label</div>
</div>
```

### 2.3 Section Labels (above charts/tables)

```tsx
<div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
  Section Title
</div>
```

### 2.4 Chart Wrapper Card

```tsx
<div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">
    Chart Title
  </div>
  {/* chart goes here */}
</div>
```

### 2.5 Data Tables

```tsx
<div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
  <table className="w-full text-xs">
    <thead>
      <tr className="bg-white/[0.04] border-b border-white/[0.06]">
        <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Column</th>
        <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Value</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-white/[0.04]">
      {rows.map((row, i) => (
        <tr key={i} className="hover:bg-white/[0.02] transition-colors">
          <td className="px-3 py-2 text-white font-mono">{row.col}</td>
          <td className="px-3 py-2 text-slate-300">{row.val}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### 2.6 Trigger Buttons (manual-run panels)

```tsx
// Primary trigger button — use studio accent color:
<button
  onClick={load}
  disabled={loading}
  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-bold hover:bg-violet-500/20 transition-all disabled:opacity-40"
>
  {loading
    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Computing…</>
    : <><Play className="w-3.5 h-3.5" /> Run Analysis</>}
</button>
```

### 2.7 Input Controls (dropdowns, sliders, text inputs)

```tsx
// Text input:
<input
  type="text"
  value={colInput}
  onChange={e => setColInput(e.target.value)}
  placeholder="column_name"
  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs font-mono focus:outline-none focus:border-violet-500/40 placeholder-slate-600"
/>

// Dropdown select (when columns are known):
<select
  value={selectedCol}
  onChange={e => setSelectedCol(e.target.value)}
  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-violet-500/40"
>
  <option value="">Auto-detect</option>
  {columns.map(c => <option key={c} value={c}>{c}</option>)}
</select>

// Label above any input:
<label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
  Label Text
</label>

// Range slider:
<input type="range" min={0} max={1} step={0.05} value={val} onChange={e => setVal(+e.target.value)}
  className="flex-1 accent-violet-500" />
```

### 2.8 Recharts — Exact Usage Pattern

Always import only what you use:
```tsx
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, ScatterChart, Scatter, LineChart, Line,
  ComposedChart, Area, CartesianGrid
} from 'recharts';
```

Standard chart wrapper:
```tsx
<ResponsiveContainer width="100%" height={200}>
  <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 24, left: 0 }}>
    <XAxis
      dataKey="name"
      tick={{ fontSize: 9, fill: '#475569' }}
      interval={0}
      angle={-35}
      textAnchor="end"
    />
    <YAxis tick={{ fontSize: 9, fill: '#475569' }} />
    <Tooltip
      contentStyle={{
        background: '#0d1a2e',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        fontSize: 11,
        color: '#e2e8f0'
      }}
      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
    />
    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
      {chartData.map((_, i) => (
        <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
      ))}
    </Bar>
  </BarChart>
</ResponsiveContainer>
```

Standard color palette (use in order):
```tsx
const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#84cc16'];
```

Scatter chart (for Williams plot, chemical space, etc.):
```tsx
<ResponsiveContainer width="100%" height={300}>
  <ScatterChart margin={{ top: 8, right: 8, bottom: 20, left: 0 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
    <XAxis dataKey="x" type="number" name="X Label" tick={{ fontSize: 9, fill: '#475569' }} />
    <YAxis dataKey="y" type="number" name="Y Label" tick={{ fontSize: 9, fill: '#475569' }} />
    <Tooltip
      cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.1)' }}
      contentStyle={{ background: '#0d1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
      content={<CustomTooltip />}
    />
    <ReferenceLine x={threshold} stroke="#f59e0b" strokeDasharray="4 4" />
    <Scatter data={scatterData} shape={<CustomDot />} />
  </ScatterChart>
</ResponsiveContainer>
```

### 2.9 Framer Motion — Page Transitions (only in studio root files, NOT in panels)

```tsx
import { motion, AnimatePresence } from 'framer-motion';

// In the studio root renderPanel wrapper:
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
    className="p-6"
  >
    {renderPanel()}
  </motion.div>
</AnimatePresence>
```

**Do NOT use framer-motion inside individual panel components** — only in the studio root tab switcher.

### 2.10 Adding a New Tab to a Studio

When adding a new panel/tab to AnalyticsStudio, QSARStudio, or IntelligenceStudio:

1. Create the panel component file (e.g., `NewPanel.tsx`) in the correct studio folder
2. Add to the `TABS` array in the studio root file:
   ```tsx
   { id: 'newtab', label: 'Panel Label', icon: <IconName className="w-4 h-4" />, description: 'Short description' }
   ```
3. Add `import { NewPanel } from './NewPanel';` to studio root
4. Add case to `renderPanel()` switch statement:
   ```tsx
   case 'newtab': return <NewPanel clientId={clientId} apiBase={API} />;
   ```
5. The `SidebarNavItem` entries are generated automatically from the `TABS` array

---

## PART 3 — MANDATORY BACKEND CODE PATTERNS

### 3.1 New Route Function Structure

```python
import logging
import math
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any

logger = logging.getLogger("sdo.api.qsar_studio")  # use correct logger name
router = APIRouter(prefix="/api/qsar-studio", tags=["qsar-studio"])

# --- REQUIRED HELPERS (copy these into every route file) ---

def _safe(val: Any) -> Any:
    """Convert numpy types and NaN/Inf to JSON-serializable Python types."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return None if (math.isnan(float(val)) or math.isinf(float(val))) else float(val)
    if isinstance(val, (np.bool_,)):
        return bool(val)
    if isinstance(val, (np.ndarray,)):
        return val.tolist()
    return val

def _sanitize_dict(d: Dict) -> Dict:
    return {k: _safe(v) for k, v in d.items()}

# --- ROUTE FUNCTION ---

@router.get("/{client_id}/new-endpoint")
async def new_endpoint(
    client_id: str,
    col: Optional[str] = Query(None),
    method: str = Query("pearson"),
):
    """
    Docstring explaining what this computes scientifically.
    """
    state = _get_qsar_state(client_id)   # or use _load_df() for analytics
    df = _load_qsar_df(client_id)

    # --- Validate inputs ---
    if method not in ("pearson", "spearman", "kendall"):
        raise HTTPException(status_code=400, detail=f"Invalid method: {method}. Use pearson, spearman, or kendall.")

    # --- Auto-detect column if not specified ---
    if col is None:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        if not numeric_cols:
            raise HTTPException(status_code=422, detail="No numeric columns found in dataset.")
        col = numeric_cols[0]  # sensible default
    elif col not in df.columns:
        raise HTTPException(status_code=422, detail=f"Column '{col}' not found. Available: {list(df.columns)[:10]}")

    # --- Computation (real science here) ---
    series = pd.to_numeric(df[col], errors='coerce').dropna()
    if len(series) < 3:
        raise HTTPException(status_code=422, detail=f"Column '{col}' has fewer than 3 valid numeric values.")

    result = float(series.mean())   # example

    # --- Always sanitize before returning ---
    return {
        "column": col,
        "result": _safe(result),
        "n": len(series),
    }
```

**Rules:**
- Always call `_safe()` on every numeric value in the response. NEVER return raw numpy floats.
- Always validate inputs and raise `HTTPException` with a useful `detail` message.
- If a column cannot be found, show the user what columns ARE available (first 10).
- For long-running computations, use FastAPI's `BackgroundTasks` + a job manager (see benchmark pattern).
- Never load the entire DataFrame twice — get it once and pass it around.

### 3.2 Registering a New Route File in main.py

If you create a NEW route file, it must be registered in `backend/main.py`:
```python
from backend.api.routes.new_routes import router as new_router
app.include_router(new_router)  # Add AFTER existing routers
```

### 3.3 SMILES Rendering Endpoint (new shared route)

When you need to render molecular structures, add this route to `backend/main.py` or a new `render_routes.py`:

```python
from fastapi.responses import Response
from rdkit import Chem
from rdkit.Chem import Draw
from rdkit.Chem.Draw import rdMolDraw2D
import io

@router.get("/render/structure")
async def render_structure(
    smiles: str = Query(...),
    width: int = Query(300),
    height: int = Query(200),
    highlight_atoms: str = Query(""),  # comma-separated atom indices
):
    """Render a SMILES string as an SVG structure image."""
    try:
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            raise HTTPException(status_code=422, detail=f"Invalid SMILES: {smiles[:50]}")

        drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
        drawer.drawOptions().addStereoAnnotation = True
        drawer.drawOptions().addAtomIndices = False

        # Highlight atoms if requested
        atom_ids = []
        if highlight_atoms:
            try:
                atom_ids = [int(x) for x in highlight_atoms.split(",") if x.strip()]
            except ValueError:
                pass

        if atom_ids:
            drawer.DrawMolecule(mol, highlightAtoms=atom_ids,
                highlightAtomColors={i: (1.0, 0.2, 0.2) for i in atom_ids})
        else:
            drawer.DrawMolecule(mol)

        drawer.FinishDrawing()
        svg = drawer.GetDrawingText()

        return Response(
            content=svg,
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=86400"}  # cache 24h by canonical SMILES
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## PART 4 — EXACT SCIENTIFIC ALGORITHMS BY FEATURE

Read this section carefully before implementing any scientific computation. Use EXACTLY these libraries and methods.

### 4.1 Distribution Analysis

```python
import scipy.stats as stats
import numpy as np

# Shapiro-Wilk normality test (use for n ≤ 5000; sample if larger)
sample = series.sample(min(5000, len(series)), random_state=42)
stat_w, p_value = stats.shapiro(sample)
is_normal = bool(p_value > 0.05)

# Skewness and kurtosis
skewness = float(series.skew())
kurtosis = float(series.kurtosis())  # excess kurtosis (normal = 0)

# Optimal Box-Cox lambda (only on positive values)
pos_vals = series[series > 0]
if len(pos_vals) >= 8:
    _, optimal_lambda = stats.boxcox(pos_vals)

# KDE data for client-side rendering (send 200 x,y points)
kde = stats.gaussian_kde(series.dropna())
x_range = np.linspace(series.min(), series.max(), 200)
kde_y = kde(x_range)
kde_data = [{"x": float(x), "y": float(y)} for x, y in zip(x_range, kde_y)]
```

### 4.2 Correlation Matrix with p-values

```python
import numpy as np
import pandas as pd
from scipy import stats

def compute_correlation_with_pvalues(df_numeric: pd.DataFrame, method: str = "pearson"):
    cols = df_numeric.columns.tolist()
    n = len(df_numeric)
    matrix = []
    for i, ca in enumerate(cols):
        for j, cb in enumerate(cols):
            if i == j:
                matrix.append({"col_a": ca, "col_b": cb, "i": i, "j": j, "value": 1.0, "p_value": 0.0})
                continue
            a = df_numeric[ca].dropna()
            b = df_numeric[cb].dropna()
            common = a.index.intersection(b.index)
            if len(common) < 3:
                matrix.append({"col_a": ca, "col_b": cb, "i": i, "j": j, "value": None, "p_value": None})
                continue
            a_v, b_v = a[common].values, b[common].values
            if method == "pearson":
                r, p = stats.pearsonr(a_v, b_v)
            elif method == "spearman":
                r, p = stats.spearmanr(a_v, b_v)
            else:  # kendall
                r, p = stats.kendalltau(a_v, b_v)
            matrix.append({"col_a": ca, "col_b": cb, "i": i, "j": j,
                           "value": _safe(r), "p_value": _safe(p)})
    return matrix
```

### 4.3 VIF (Variance Inflation Factor)

```python
from statsmodels.stats.outliers_influence import variance_inflation_factor

def compute_vif(df_numeric: pd.DataFrame) -> list:
    """Returns list of {feature, vif} dicts, sorted descending by vif."""
    X = df_numeric.dropna().values
    if X.shape[0] < X.shape[1] + 2:
        return []  # not enough samples
    results = []
    for i, col in enumerate(df_numeric.columns):
        try:
            vif = variance_inflation_factor(X, i)
            results.append({"feature": col, "vif": _safe(vif)})
        except Exception:
            results.append({"feature": col, "vif": None})
    return sorted(results, key=lambda x: (x["vif"] or 0), reverse=True)
```

### 4.4 Outlier Detection

```python
# IQR method:
q1 = series.quantile(0.25)
q3 = series.quantile(0.75)
iqr = q3 - q1
lower = q1 - 1.5 * iqr
upper = q3 + 1.5 * iqr
outlier_mask = (series < lower) | (series > upper)

# Z-score method:
z_scores = np.abs((series - series.mean()) / series.std())
outlier_mask = z_scores > 3

# Severity classification:
pct = outlier_mask.sum() / len(series) * 100
severity = "HIGH" if pct > 10 else "MEDIUM" if pct > 2 else "LOW"
```

### 4.5 Y-Randomization (Permutation Test)

```python
from sklearn.model_selection import cross_val_score
import numpy as np

def y_randomization(model, X, y, n_permutations=100, cv=5, random_state=42):
    """
    Permutes y-labels n_permutations times, fits model, records CV R².
    Returns distribution of permuted R² values and p-value vs real model R².
    """
    rng = np.random.RandomState(random_state)
    real_r2 = float(np.mean(cross_val_score(model, X, y, cv=min(cv, len(X)), scoring='r2')))
    perm_r2s = []
    for _ in range(n_permutations):
        y_perm = rng.permutation(y)
        scores = cross_val_score(model, X, y_perm, cv=min(cv, len(X)), scoring='r2')
        perm_r2s.append(float(np.mean(scores)))
    p_value = float(np.mean(np.array(perm_r2s) >= real_r2))
    return {
        "real_r2": _safe(real_r2),
        "permuted_r2_distribution": [_safe(v) for v in perm_r2s],
        "p_value": _safe(p_value),
        "is_significant": p_value < 0.05,
        "n_permutations": n_permutations,
    }
```

### 4.6 LOO Cross-Validation (Q² metric)

```python
from sklearn.model_selection import LeaveOneOut, cross_val_predict
from sklearn.metrics import r2_score
import numpy as np

def compute_q2_loo(model, X, y):
    """
    Q² = 1 - PRESS/SS_total
    PRESS = sum of squared LOO prediction errors
    """
    if len(X) > 200:
        # LOO is expensive for large datasets; use 10-fold instead
        from sklearn.model_selection import KFold
        cv = KFold(n_splits=10, shuffle=True, random_state=42)
    else:
        cv = LeaveOneOut()
    y_pred_loo = cross_val_predict(model, X, y, cv=cv)
    ss_res = np.sum((y - y_pred_loo) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    q2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    sdep = float(np.sqrt(ss_res / len(y)))  # Standard Deviation of Error of Prediction
    return {"q2_loo": _safe(q2), "sdep": _safe(sdep), "press": _safe(float(ss_res))}
```

### 4.7 RDKit Murcko Scaffold Analysis

```python
try:
    from rdkit import Chem
    from rdkit.Chem.Scaffolds import MurckoScaffold
    RDKIT_AVAILABLE = True
except ImportError:
    RDKIT_AVAILABLE = False

def get_murcko_scaffold(smiles: str) -> str | None:
    """Returns canonical Murcko scaffold SMILES or None if parse fails."""
    if not RDKIT_AVAILABLE:
        return None
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    try:
        scaffold = MurckoScaffold.MurckoScaffoldSmiles(mol=mol, includeChirality=False)
        return scaffold if scaffold else None
    except Exception:
        return None
```

### 4.8 Morgan Fingerprint Tanimoto Similarity

```python
try:
    from rdkit import Chem, DataStructs
    from rdkit.Chem import AllChem
    RDKIT_AVAILABLE = True
except ImportError:
    RDKIT_AVAILABLE = False

def compute_tanimoto(smiles_a: str, smiles_b: str, radius: int = 2, nbits: int = 2048) -> float | None:
    """Returns Tanimoto similarity [0,1] between two SMILES, or None on failure."""
    if not RDKIT_AVAILABLE:
        return None
    mol_a = Chem.MolFromSmiles(smiles_a)
    mol_b = Chem.MolFromSmiles(smiles_b)
    if mol_a is None or mol_b is None:
        return None
    fp_a = AllChem.GetMorganFingerprintAsBitVect(mol_a, radius, nbits)
    fp_b = AllChem.GetMorganFingerprintAsBitVect(mol_b, radius, nbits)
    return float(DataStructs.TanimotoSimilarity(fp_a, fp_b))
```

### 4.9 Applicability Domain — Hat Matrix (Williams Plot)

```python
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression

def compute_applicability_domain(X: np.ndarray, y: np.ndarray):
    """
    Williams Plot AD: leverage (hat matrix diagonal) vs standardized residuals.
    Returns per-compound leverage, std_residual, in_ad flag, and h* threshold.
    """
    n, k = X.shape
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    model = LinearRegression().fit(Xs, y)
    y_pred = model.predict(Xs)
    residuals = y - y_pred

    # Hat matrix diagonal via einsum (memory efficient)
    Xa = np.column_stack([np.ones(n), Xs])   # augmented with intercept column
    try:
        XtXinv = np.linalg.pinv(Xa.T @ Xa)
        h = np.einsum("ij,jk,ik->i", Xa, XtXinv, Xa)  # leverage vector
    except np.linalg.LinAlgError:
        h = np.full(n, np.nan)

    # Standardized residuals
    dof = max(1, n - k - 1)
    s = np.std(residuals, ddof=min(k + 1, dof)) or 1.0
    std_residuals = residuals / s

    h_star = 3 * (k + 1) / n   # warning leverage threshold
    in_ad = (np.abs(std_residuals) <= 3) & (h <= h_star)

    return {
        "h": h.tolist(), "std_residuals": std_residuals.tolist(),
        "in_ad": in_ad.tolist(), "h_star": float(h_star),
        "r2": float(model.score(Xs, y)),
        "n": n, "k": k,
    }
```

### 4.10 Statistical Group Tests

```python
from scipy import stats
import numpy as np

def run_statistical_test(group_values: dict, test_type: str):
    """
    group_values: {"GroupA": [1.1, 2.3, ...], "GroupB": [...], ...}
    test_type: "ttest", "mannwhitney", "anova", "kruskal"
    """
    groups = list(group_values.values())
    names = list(group_values.keys())

    if test_type == "ttest" and len(groups) == 2:
        stat, p = stats.ttest_ind(groups[0], groups[1])
        # Cohen's d effect size
        pooled_std = np.sqrt((np.std(groups[0])**2 + np.std(groups[1])**2) / 2)
        effect_size = (np.mean(groups[0]) - np.mean(groups[1])) / pooled_std if pooled_std > 0 else 0
        effect_label = "Large" if abs(effect_size) > 0.8 else "Medium" if abs(effect_size) > 0.5 else "Small"

    elif test_type == "mannwhitney" and len(groups) == 2:
        stat, p = stats.mannwhitneyu(groups[0], groups[1], alternative="two-sided")
        n1, n2 = len(groups[0]), len(groups[1])
        effect_size = 1 - (2 * stat) / (n1 * n2)  # rank-biserial r

    elif test_type == "anova":
        stat, p = stats.f_oneway(*groups)

    elif test_type == "kruskal":
        stat, p = stats.kruskal(*groups)

    return {"statistic": _safe(stat), "p_value": _safe(p), "significant": bool(p < 0.05)}
```

### 4.11 PCA for Chemical Space

```python
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
import numpy as np

def compute_pca_space(df_numeric: pd.DataFrame, n_components: int = 2, n_clusters: int = 0):
    X = df_numeric.fillna(df_numeric.median()).values
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    pca = PCA(n_components=min(n_components, min(X.shape)))
    coords = pca.fit_transform(Xs)

    # Loadings (contribution of each original variable to each PC)
    loadings = pca.components_  # shape: (n_components, n_features)
    explained = pca.explained_variance_ratio_.tolist()

    result = {
        "points": [{"idx": int(i), "x": float(coords[i, 0]),
                    "y": float(coords[i, 1] if n_components > 1 else 0)}
                   for i in range(len(coords))],
        "explained_variance": [{"component": f"PC{i+1}", "variance_pct": round(v*100, 2),
                                 "cumulative": round(sum(explained[:i+1])*100, 2)}
                                for i, v in enumerate(explained)],
        "loadings": [{"feature": df_numeric.columns[j], "pc1": float(loadings[0,j]),
                      "pc2": float(loadings[1,j]) if n_components > 1 else 0.0}
                     for j in range(len(df_numeric.columns))],
    }

    if n_clusters > 1:
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = km.fit_predict(coords)
        for i, pt in enumerate(result["points"]):
            pt["cluster"] = int(labels[i])

    return result
```

### 4.12 Structural Alert Screening (PAINS / Brenk)

```python
try:
    from rdkit.Chem import FilterCatalog
    RDKIT_AVAILABLE = True
except ImportError:
    RDKIT_AVAILABLE = False

def screen_structural_alerts(smiles_list: list[str]) -> list[dict]:
    """
    Screen compounds for PAINS (A, B, C) and Brenk alerts using RDKit FilterCatalog.
    Returns per-compound alert list.
    """
    if not RDKIT_AVAILABLE:
        return []

    # Build filter catalogs
    pains_params = FilterCatalog.FilterCatalogParams()
    pains_params.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS_A)
    pains_params.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS_B)
    pains_params.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS_C)
    pains_catalog = FilterCatalog.FilterCatalog(pains_params)

    brenk_params = FilterCatalog.FilterCatalogParams()
    brenk_params.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.BRENK)
    brenk_catalog = FilterCatalog.FilterCatalog(brenk_params)

    results = []
    for idx, smi in enumerate(smiles_list):
        mol = Chem.MolFromSmiles(smi) if smi else None
        alerts = []
        if mol:
            for entry in pains_catalog.GetMatches(mol):
                aids = list(entry.GetFilterMatch(mol).GetMatchingAtoms())
                alerts.append({"name": entry.GetDescription(), "category": "PAINS",
                               "severity": "HIGH", "matched_atoms": aids})
            for entry in brenk_catalog.GetMatches(mol):
                aids = list(entry.GetFilterMatch(mol).GetMatchingAtoms())
                alerts.append({"name": entry.GetDescription(), "category": "Brenk",
                               "severity": "MEDIUM", "matched_atoms": aids})
        results.append({"idx": idx, "smiles": smi, "alerts": alerts,
                        "is_pains": any(a["category"] == "PAINS" for a in alerts),
                        "is_brenk": any(a["category"] == "Brenk" for a in alerts)})
    return results
```

---

## PART 5 — WHAT NOT TO DO (ANTI-PATTERNS)

### ❌ Scientific Anti-Patterns

1. **Never** use `Math.random()` or Python `random.random()` to generate data shown to users.
2. **Never** hardcode example values like `r2 = 0.87` or `p_value = 0.003` in the UI or backend.
3. **Never** show a scientific metric without defining what it means. Every chart needs axis labels. Every number needs a unit or context.
4. **Never** report a correlation without knowing if it was Pearson, Spearman, or Kendall.
5. **Never** show a p-value without also showing the test statistic and which test was used.
6. **Never** compute Shapiro-Wilk on more than 5000 samples — always sample first.
7. **Never** compute LOO-CV on more than 200 samples without switching to k-fold — it will hang.
8. **Never** claim a model is validated without a Y-randomization test.
9. **Never** use Euclidean distance as the similarity metric when Tanimoto on Morgan fingerprints is available.
10. **Never** truncate SMILES strings and show them in a table — if the user can't read it, don't show it. Show a rendered 2D structure instead.

### ❌ Code Anti-Patterns

1. **Never** use axios — only `fetch()` in frontend panels.
2. **Never** return raw numpy types from FastAPI — always call `_safe()`.
3. **Never** import framer-motion inside individual panel components.
4. **Never** put a `<ResponsiveContainer height={0}>` — charts will be invisible.
5. **Never** use the wrong studio accent color (violet for analytics, blue for qsar, rose for intelligence).
6. **Never** make the loading text generic ("Loading...") — describe what's happening ("Computing correlation matrix...").
7. **Never** show an empty panel with no action button — always provide an "empty state" with instructions and a trigger.
8. **Never** hardcode `clientId = "demo"` — always use the prop passed down from the studio root.
9. **Never** create a panel that doesn't handle `loading`, `error`, AND `data === null` states — all three must be handled.
10. **Never** cap table rows silently — always show "Showing 20 of 347 results" if you cap.

---

## PART 6 — VISUALIZATION SPECIFICATIONS BY PANEL

### 6.1 Predicted vs. Actual Scatter Plot (QSAR)

```tsx
// Data shape expected from backend:
// { train: [{actual: number, predicted: number}], test: [{actual: number, predicted: number, residual: number}] }
// Render using Recharts ScatterChart

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  const dist = Math.abs(payload.residual);
  // color by residual magnitude: green close, rose far
  const color = dist > 1 ? '#f43f5e' : dist > 0.5 ? '#f59e0b' : '#10b981';
  return <circle cx={cx} cy={cy} r={4} fill={color} fillOpacity={0.8} stroke="none" />;
};

// Diagonal reference line (y = x, ideal prediction):
// Add as <ReferenceLine segment={[{x: min, y: min}, {x: max, y: max}]} stroke="#3b82f6" strokeDasharray="4 4" />
// where min/max are the actual min/max of the endpoint range
```

### 6.2 Residual Plot

```tsx
// X-axis: predicted values | Y-axis: residuals (actual - predicted)
// Add: horizontal ReferenceLine at y=0 (stroke="#475569", not dashed)
// Add: shaded band ±2σ: two ReferenceLine at y=+2sigma and y=-2sigma (amber dashed)
// Color points: blue if residual > 0, rose if residual < 0

const residualColor = (r: number) => r > 0 ? '#3b82f6' : '#f43f5e';
```

### 6.3 Correlation Heatmap

```tsx
// When correlation matrix has > 15 columns: reduce cell size
// Cell color mapping function:
function corrColor(value: number | null): string {
  if (value === null) return 'rgba(255,255,255,0.04)';
  const abs = Math.abs(value);
  const isPos = value > 0;
  if (abs >= 0.9) return isPos ? '#7c3aed' : '#be123c';   // very strong
  if (abs >= 0.7) return isPos ? '#8b5cf6' : '#e11d48';   // strong
  if (abs >= 0.4) return isPos ? '#a78bfa' : '#fb7185';   // moderate
  if (abs >= 0.2) return isPos ? '#c4b5fd' : '#fda4af';   // weak
  return 'rgba(100,116,139,0.2)';                          // negligible
}

// Diagonal cells (self-correlation) always render as:
// <div style={{ background: 'rgba(255,255,255,0.1)' }}>1.00</div>

// Hover state should show: "Column A vs Column B: r = 0.87, p = 0.003"
```

### 6.4 Scaffold Gallery Card

```tsx
// Each scaffold rendered as:
<div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-rose-500/20 transition-all cursor-pointer">
  {/* 2D structure SVG */}
  <img
    src={`${apiBase}/api/render/structure?smiles=${encodeURIComponent(scaffold.smiles)}&width=200&height=150`}
    alt={`Scaffold ${i+1}`}
    className="w-full h-24 object-contain bg-white/[0.02] rounded-lg mb-2"
    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-molecule.svg'; }}
  />
  <div className="text-xs font-bold text-rose-400">{scaffold.count} compounds</div>
  <div className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">{scaffold.smiles}</div>
  {scaffold.mean_activity !== undefined && (
    <div className="text-[10px] text-emerald-400 mt-1">
      Mean pIC₅₀: {scaffold.mean_activity.toFixed(2)}
    </div>
  )}
</div>
```

### 6.5 Activity Cliff Pair Viewer

```tsx
// Each cliff pair rendered as a prominent card:
<div className="p-4 rounded-2xl bg-white/[0.03] border border-rose-500/20">
  <div className="text-xs font-bold text-rose-400 mb-3">
    Cliff #{rank} — Score: {score.toFixed(2)} — Tanimoto: {(similarity * 100).toFixed(0)}%
  </div>
  <div className="grid grid-cols-2 gap-4">
    {[compoundA, compoundB].map((cpd, idx) => (
      <div key={idx} className="text-center">
        <img
          src={`${apiBase}/api/render/structure?smiles=${encodeURIComponent(cpd.smiles)}&width=200&height=160`}
          alt={`Compound ${cpd.idx}`}
          className="w-full h-32 object-contain bg-white/[0.02] rounded-lg mb-2"
        />
        <div className="text-[10px] text-slate-500">Compound {cpd.idx}</div>
        <div className="text-sm font-black text-white">{cpd.activity.toFixed(3)}</div>
        <div className="text-[10px] text-slate-500">pIC₅₀</div>
      </div>
    ))}
  </div>
  <div className="mt-3 text-center">
    <span className="text-sm font-bold text-amber-400">Δ = {activityDiff.toFixed(2)} log units</span>
  </div>
</div>
```

### 6.6 Drug-Likeness Radar Chart (Recharts Radar)

```tsx
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

// Normalize each property to 0-1 range for radar display:
const radarData = [
  { axis: 'MW', value: Math.min(data.mw / 1000, 1), threshold: 0.5 },
  { axis: 'LogP', value: (data.logp + 5) / 15, threshold: 0.67 },
  { axis: 'HBD', value: Math.min(data.hbd / 10, 1), threshold: 0.5 },
  { axis: 'HBA', value: Math.min(data.hba / 15, 1), threshold: 0.67 },
  { axis: 'TPSA', value: Math.min(data.tpsa / 200, 1), threshold: 0.7 },
  { axis: 'RotBonds', value: Math.min(data.rotbonds / 15, 1), threshold: 0.67 },
];

<ResponsiveContainer width="100%" height={300}>
  <RadarChart data={radarData}>
    <PolarGrid stroke="rgba(255,255,255,0.08)" />
    <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: '#94a3b8' }} />
    <PolarRadiusAxis angle={90} domain={[0, 1]} tick={false} axisLine={false} />
    {/* Ro5 compliance zone */}
    <Radar name="Ro5 Threshold" dataKey="threshold" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeDasharray="4 4" />
    {/* Library mean */}
    <Radar name="Library Mean" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
  </RadarChart>
</ResponsiveContainer>
```

---

## PART 7 — IMPLEMENTATION CHECKLIST (run through for every panel)

Before marking a panel as complete:

### Backend Checklist
- [ ] All response numeric values wrapped in `_safe()`
- [ ] All query parameters have validation with useful error messages
- [ ] Auto-detection logic for columns (endpoint, SMILES, etc.) with fallback chain
- [ ] Minimum sample size check before computation (raise 422 if dataset too small)
- [ ] Response fields exactly match what the frontend TypeScript interface expects
- [ ] Route registered in main.py (if new route file)
- [ ] `_load_df()` or `_get_qsar_state()` used correctly for the right studio

### Frontend Checklist
- [ ] `loading`, `error`, `data === null` all handled with appropriate UI
- [ ] API URL uses `${apiBase}` — never hardcoded `http://127.0.0.1:8000`
- [ ] Studio accent color used consistently throughout the panel
- [ ] Chart has proper axis labels with units where applicable
- [ ] Numbers shown with appropriate precision (2-4 decimal places for scientific values)
- [ ] Empty state has instructions ("Run the analysis to see results" + trigger button)
- [ ] Long lists capped with a visible "Showing X of Y" message
- [ ] Table rows have hover state (`hover:bg-white/[0.02]`)
- [ ] Section labels present above every chart or table
- [ ] TypeScript interfaces defined for all API response shapes

### Scientific Validation Checklist
- [ ] The algorithm used is scientifically correct for the data type
- [ ] Normality tests only run on n ≤ 5000 (sample if larger)
- [ ] LOO-CV only runs on n ≤ 200 (use k-fold otherwise)
- [ ] Tanimoto on Morgan FP used for structural similarity (not Euclidean on descriptors)
- [ ] Log transformation only suggested/applied on positive-valued data
- [ ] p-values shown alongside test statistics
- [ ] Every chart has a title explaining what is shown and why it matters

---

## PART 8 — REFERENCE PATHS (always use these exact paths)

### Backend route files
- `b:\SUTRIX__\Scientific Data Orchestrator\backend\api\routes\qsar_studio_routes.py`
- `b:\SUTRIX__\Scientific Data Orchestrator\backend\api\routes\analytics_routes.py`
- `b:\SUTRIX__\Scientific Data Orchestrator\backend\api\routes\intelligence_routes.py`
- `b:\SUTRIX__\Scientific Data Orchestrator\backend\main.py` (for router registration)

### Frontend panel directories
- `b:\SUTRIX__\Scientific Data Orchestrator\frontend\src\components\studio\analytics\`
- `b:\SUTRIX__\Scientific Data Orchestrator\frontend\src\components\studio\qsar\`
- `b:\SUTRIX__\Scientific Data Orchestrator\frontend\src\components\studio\intelligence\`

### Shared frontend infrastructure
- `b:\SUTRIX__\Scientific Data Orchestrator\frontend\src\components\studio\StudioShell.tsx`
- `b:\SUTRIX__\Scientific Data Orchestrator\frontend\src\store\useWorkspaceStore.ts`
- `b:\SUTRIX__\Scientific Data Orchestrator\frontend\src\services\`
- `b:\SUTRIX__\Scientific Data Orchestrator\frontend\src\hooks\useStudioInit.ts`

### Data files
- `b:\SUTRIX__\Scientific Data Orchestrator\data\qsar_demo_dataset.csv`
- `b:\SUTRIX__\Scientific Data Orchestrator\data\eco_toxicity_dataset.csv`
