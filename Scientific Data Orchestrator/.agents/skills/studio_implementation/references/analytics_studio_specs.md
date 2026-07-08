# Data Analysis Studio — Feature Implementation Reference

## Sprint 1: Column Intelligence System

### Priority: P0 — Build this first. All other panels depend on it.

### New Backend Route — Add to `analytics_routes.py`
```python
@router.get("/{client_id}/column-intelligence")
async def column_intelligence(client_id: str):
    """
    Classify every column into a scientific role.
    Roles: SMILES | ENDPOINT | DESCRIPTOR | IDENTIFIER | CATEGORICAL | DATETIME | UNKNOWN
    Also returns a data health score per column.
    """
    df, context = _load_df(client_id)

    SMILES_HINTS = {"smiles", "smi", "structure", "canonical_smiles", "isomeric_smiles"}
    ENDPOINT_HINTS = {"lc50","ec50","ic50","noec","loec","activity","value","target","endpoint",
                      "ki","kd","plc","pec","pic","logbcf","logkoc","inhibition","potency"}
    IDENTIFIER_HINTS = {"cas","casrn","id","name","compound","chemical","substance","inchikey",
                        "inchi","formula","iupac","dtxsid","chembl","pubchem"}

    columns_info = []
    for col in df.columns:
        col_lower = col.lower().replace(" ", "_").replace("-", "_")
        dtype = str(df[col].dtype)
        is_numeric = pd.api.types.is_numeric_dtype(df[col])
        is_datetime = pd.api.types.is_datetime64_any_dtype(df[col])

        # Determine role
        if any(h in col_lower for h in SMILES_HINTS):
            role = "SMILES"
        elif any(h in col_lower for h in ENDPOINT_HINTS):
            role = "ENDPOINT"
        elif any(h in col_lower for h in IDENTIFIER_HINTS):
            role = "IDENTIFIER"
        elif is_datetime:
            role = "DATETIME"
        elif not is_numeric and df[col].nunique() / max(len(df), 1) < 0.05:
            role = "CATEGORICAL"
        elif is_numeric:
            role = "DESCRIPTOR"
        else:
            role = "UNKNOWN"

        # Health score (0-100): penalize missing, low variance, all-zeros
        missing_pct = float(df[col].isna().mean() * 100)
        health = 100
        if missing_pct > 50: health -= 50
        elif missing_pct > 20: health -= 30
        elif missing_pct > 5:  health -= 10
        if is_numeric and df[col].std() == 0: health -= 40  # zero variance
        health = max(0, health)

        # Histogram data (20 bins) for numeric columns
        histogram = None
        if is_numeric:
            vals = pd.to_numeric(df[col], errors='coerce').dropna()
            if len(vals) > 1:
                counts, edges = np.histogram(vals, bins=min(20, len(vals.unique())))
                histogram = [{"x": _safe(float(edges[i])), "count": int(counts[i])}
                             for i in range(len(counts))]

        # Top values for categorical
        top_values = None
        if not is_numeric:
            top_values = df[col].value_counts().head(5).to_dict()
            top_values = {str(k): int(v) for k, v in top_values.items()}

        columns_info.append({
            "name": col, "dtype": dtype, "role": role, "health_score": health,
            "missing_pct": _safe(missing_pct),
            "unique_count": int(df[col].nunique()),
            "histogram": histogram, "top_values": top_values,
        })

    role_counts = {}
    for ci in columns_info:
        role_counts[ci["role"]] = role_counts.get(ci["role"], 0) + 1

    return {"columns": columns_info, "role_counts": role_counts, "total_cols": len(df.columns)}
```

### Frontend: Column Intelligence Integration

**New hook:** `useColumnIntelligence(clientId, apiBase)` — fetches and caches column intelligence on upload.

```tsx
// In every panel that needs column dropdowns:
const { columns, getByRole } = useColumnIntelligence(clientId, apiBase);
const endpointCols = getByRole('ENDPOINT');   // columns likely to be endpoints
const descriptorCols = getByRole('DESCRIPTOR');
const smilesCols = getByRole('SMILES');

// Replace all text inputs for column selection with:
<select value={col} onChange={e => setCol(e.target.value)}
  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-violet-500/40">
  <option value="">Auto-detect</option>
  {endpointCols.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
  {columns.filter(c => !endpointCols.includes(c)).map(c =>
    <option key={c.name} value={c.name}>{c.name} ({c.role})</option>)}
</select>
```

**New visualization — Dataset Anatomy in ProfilePanel:**

Add a donut chart ABOVE the existing stat cards:
```tsx
// Recharts PieChart showing column role distribution:
const donutData = Object.entries(roleCount).map(([role, count]) => ({
  name: role, value: count,
  color: { SMILES:'#06b6d4', ENDPOINT:'#10b981', DESCRIPTOR:'#8b5cf6',
            IDENTIFIER:'#f59e0b', CATEGORICAL:'#3b82f6', DATETIME:'#ec4899', UNKNOWN:'#475569' }[role]
}));

// Inner label: "N columns classified"
```

**Add to ProfilePanel column table:**
- New column: "Role" — shows a colored badge (ENDPOINT=emerald, DESCRIPTOR=violet, SMILES=cyan, etc.)
- New column: "Health" — green/amber/rose dot + percentage
- New inline sparkline per numeric column: a tiny 40px-wide histogram bar chart

---

## Sprint 2: Distribution Transformation Lab

### Upgrade File
`frontend/src/components/studio/analytics/DistributionPanel.tsx`

### Backend Extension — Extend `GET /{client_id}/distribution`
Add to response:
```python
# KDE data:
from scipy.stats import gaussian_kde
kde_vals = series.dropna().values
if len(kde_vals) > 1:
    kde = gaussian_kde(kde_vals)
    x_range = np.linspace(float(kde_vals.min()), float(kde_vals.max()), 100)
    kde_data = [{"x": _safe(float(x)), "y": _safe(float(kde(x)[0]))} for x in x_range]
else:
    kde_data = []

# QQ-plot data:
from scipy import stats as sp_stats
(osm, osr), _ = sp_stats.probplot(series.dropna(), dist="norm")
qq_data = [{"theoretical": _safe(float(osm[i])), "sample": _safe(float(osr[i]))} for i in range(len(osm))]

# Box-Cox lambda:
pos_vals = series.dropna()
pos_vals = pos_vals[pos_vals > 0]
boxcox_lambda = None
if len(pos_vals) >= 8:
    try:
        _, lam = sp_stats.boxcox(pos_vals)
        boxcox_lambda = _safe(float(lam))
    except Exception:
        pass

# Add to response:
response["kde_data"] = kde_data
response["qq_data"] = qq_data
response["boxcox_lambda"] = boxcox_lambda
```

### New Backend Route — Add batch distribution
```python
@router.get("/{client_id}/distribution-batch")
async def distribution_batch(client_id: str):
    """
    Analyze ALL numeric columns at once.
    Returns normality scores and recommended transformations for each column.
    Used by the 'Analyze All' button in DistributionPanel.
    """
    from scipy import stats as sp_stats

    df, context = _load_df(client_id)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    results = []
    for col in numeric_cols[:50]:  # cap at 50 columns for performance
        series = pd.to_numeric(df[col], errors='coerce').dropna()
        if len(series) < 5:
            continue
        skew = float(series.skew())
        kurt = float(series.kurtosis())
        sample = series.sample(min(5000, len(series)), random_state=42)
        w, p = sp_stats.shapiro(sample)
        is_normal = bool(p > 0.05)

        # Check log-normality
        pos = series[series > 0]
        log_is_normal = False
        if len(pos) >= 5:
            log_sample = np.log10(pos).sample(min(5000, len(pos)), random_state=42)
            _, lp = sp_stats.shapiro(log_sample)
            log_is_normal = bool(lp > 0.05)

        recommended = "log10" if (not is_normal and log_is_normal) else "none"

        results.append({
            "column": col, "n": len(series), "skewness": _safe(skew),
            "is_normal": is_normal, "shapiro_w": _safe(float(w)), "shapiro_p": _safe(float(p)),
            "log_is_normal": log_is_normal, "recommended_transform": recommended,
        })

    return {"columns": results, "total_analyzed": len(results)}
```

### Frontend Changes to `DistributionPanel.tsx`

Replace the current single-column text input with:
1. **Column dropdown** (from column intelligence)
2. **"Analyze All Columns" button** — calls `/distribution-batch`
3. **"Analyze Selected" button** — calls `/distribution?col=`

**New Visualizations:**

1. **4-Panel Transformation Workshop** (shown when single column analyzed):
   ```tsx
   // 2×2 grid of small charts, each showing a ComposedChart with:
   // - BarChart (histogram, 20 bins, semi-transparent)
   // - Line (KDE curve, smooth)
   // Each panel labeled: "Raw" | "log₁₀" | "–log₁₀" | "√x"
   // The most normal panel gets a green "✅ Recommended" banner
   // Panel shows: Skewness badge, Shapiro-Wilk W, p-value
   ```

   Computing the transformed histograms client-side from backend data:
   ```tsx
   // Backend sends histogram + kde_data for raw values only
   // Client computes log10(values) histogram from the raw distribution
   // Use data.histogram[].bin_start values to compute transformed bins
   ```

2. **QQ-Plot** (Recharts ScatterChart, 200px height):
   ```tsx
   // X-axis: "Theoretical Quantiles (Normal)", Y-axis: "Sample Quantiles"
   // Data: data.qq_data (array of {theoretical, sample})
   // Reference line: diagonal y=x line drawn as ReferenceLine segment
   // Color points by distance from diagonal: emerald (close) → rose (far)
   // Axis label: "Points near the diagonal indicate normal distribution"
   ```

3. **Batch Normality Heatmap** (shown when batch mode):
   ```tsx
   // Grid: rows = columns, columns = [Raw, log₁₀, √x]
   // Cell color: by p-value: green (is_normal=true), rose (is_normal=false)
   // Cell text: p-value formatted as "0.423" or "<0.001"
   // Header: "Green cells = normally distributed (Shapiro-Wilk p > 0.05)"
   ```

---

## Sprint 3: Missingness Workshop

### Upgrade File
`frontend/src/components/studio/analytics/MissingnessPanel.tsx`

### Backend Extension — Extend `GET /{client_id}/missing-analysis`
Add to response:
```python
# Pattern matrix: 200 randomly sampled rows × all columns with any missing
# True = present (1), False = missing (0)
sample_idx = df.sample(min(200, len(df)), random_state=42).index
missing_cols = [c for c in df.columns if df[c].isna().any()][:30]  # cap at 30 cols
pattern_matrix = []
for idx in sample_idx:
    pattern_matrix.append({
        "row": int(idx),
        "pattern": [int(not pd.isna(df.loc[idx, c])) for c in missing_cols]
    })

# MAR/MNAR/MCAR classification per column:
column_classification = {}
for col in [c["column"] for c in results if c["missing_pct"] > 0]:
    miss_flag = df[col].isna().astype(int)
    # Check correlation with numeric columns
    correlations = []
    for nc in df.select_dtypes(include=[np.number]).columns[:20]:
        if nc == col:
            continue
        valid = df[nc].dropna()
        if len(valid) > 10:
            r, p = pearsonr(miss_flag.loc[valid.index], valid)
            if abs(r) > 0.2:
                correlations.append({"corr_col": nc, "r": _safe(r), "p": _safe(p)})
    if correlations:
        classification = "MAR"  # Missingness correlates with other variable
        reason = f"Missingness correlates with {correlations[0]['corr_col']} (r={correlations[0]['r']:.2f})"
    else:
        classification = "MCAR"  # No detectable pattern
        reason = "No correlation with other variables detected"
    column_classification[col] = {"type": classification, "reason": reason, "correlations": correlations[:3]}

# Fix the mislabeled summary count:
# "missingness_pattern_count" = number of columns showing non-MCAR patterns
mar_count = sum(1 for v in column_classification.values() if v["type"] == "MAR")
response["mar_column_count"] = mar_count  # correctly labeled now
response["column_classification"] = column_classification
response["pattern_matrix_cols"] = missing_cols
response["pattern_matrix"] = pattern_matrix[:100]  # send max 100 rows
```

### Frontend Changes to `MissingnessPanel.tsx`

**Fix the mislabeled summary card:**
- Change "MCAR Correlations" → "Non-MCAR Columns (MAR patterns)"

**New Visualizations:**

1. **Missingness Pattern Heatmap** (custom CSS grid, primary visualization):
   ```tsx
   // Grid: 100 sampled rows × up to 30 columns
   // Cell: white (present) or deep navy (missing)
   // Row height: 2px, Column width: adaptive
   // Column headers rotated -45°, showing abbreviated column name
   // Caption: "Sampled 100 rows × {n} columns — White = present, Navy = missing"
   // Visual patterns reveal: systematic row missingness, column-specific missingness
   ```

2. **MAR/MCAR Classification Panel** (per column, expandable accordion):
   ```tsx
   // For each column with missing values:
   <div className="...">
     <div>Column: {col.column}</div>
     <div>Missing: {col.missing_pct.toFixed(1)}%</div>
     <div>Classification: {classification.type}</div>  // MAR | MCAR
     <div>Reason: {classification.reason}</div>
     {classification.type === "MAR" && (
       <div className="text-amber-400 text-[10px]">
         ⚠ Use KNN or MICE imputation — simple deletion may introduce bias.
       </div>
     )}
     {classification.type === "MCAR" && (
       <div className="text-emerald-400 text-[10px]">
         ✅ MCAR — mean/median imputation or listwise deletion is acceptable.
       </div>
     )}
   </div>
   ```

3. **Imputation Strategy Recommendations** (static, education-focused):
   ```tsx
   const STRATEGIES = {
     "MCAR": [
       { name: "Listwise Deletion", when: "< 5% missing", risk: "Low" },
       { name: "Mean/Median Imputation", when: "5–20% missing", risk: "Low" },
     ],
     "MAR": [
       { name: "KNN Imputation", when: "Any %", risk: "Medium", note: "Use k=5 neighbors" },
       { name: "MICE (Multiple Imputation)", when: "High %", risk: "Low", note: "Best for regulatory datasets" },
     ],
   };
   // Show as a 2-column table: Strategy | When to use | Risk | Notes
   ```

---

## Sprint 4: Correlation + VIF Analysis

### Upgrade File
`frontend/src/components/studio/analytics/CorrelationPanel.tsx`

### Backend Extension — Extend `GET /{client_id}/correlation`
Add VIF computation and p-values:
```python
# Add p-values to every cell:
from scipy.stats import pearsonr, spearmanr, kendalltau

# For the matrix, compute p-value for each pair:
# (modify existing loop to also compute p-value)

# Add VIF:
try:
    from statsmodels.stats.outliers_influence import variance_inflation_factor
    X_vif = df_numeric.dropna().values
    vif_data = []
    if X_vif.shape[0] > X_vif.shape[1] + 2:
        for i, col in enumerate(df_numeric.columns):
            try:
                vif = variance_inflation_factor(X_vif, i)
                vif_data.append({"feature": col, "vif": _safe(float(vif))})
            except Exception:
                vif_data.append({"feature": col, "vif": None})
        vif_data.sort(key=lambda x: (x["vif"] or 0), reverse=True)
except ImportError:
    vif_data = []

response["vif"] = vif_data
# Also add p_value field to each matrix cell
```

### Frontend Changes to `CorrelationPanel.tsx`

**New UI Controls:**
- Toggle: "Show r values / Show p-values / Show significance stars"
- Toggle: "Cluster columns" (reorders columns by hierarchical clustering similarity)
- New tab below the heatmap: "VIF Analysis"

**New Visualizations:**

1. **p-Value Overlay Mode** (toggle on existing heatmap):
   When toggled, cells show –log₁₀(p) instead of r value.
   Stars: *** p<0.001 | ** p<0.01 | * p<0.05
   Cells with p > 0.05 shown in muted gray (not significant).

2. **Correlation Network Graph** (Recharts ScatterChart with drawn edges):
   ```tsx
   // Only shown for datasets with ≤ 30 columns
   // Nodes positioned in a circle layout
   // Edges drawn between pairs where |r| > 0.7
   // Edge color: violet (positive r), rose (negative r)
   // Edge thickness: scaled by |r|
   // Node color: by VIF level (emerald = safe, amber = moderate, rose = high VIF)
   // Node labels: abbreviated column name

   // Simple circle layout:
   const nodePositions = cols.map((_, i) => ({
     x: 50 + 40 * Math.cos(2 * Math.PI * i / cols.length),
     y: 50 + 40 * Math.sin(2 * Math.PI * i / cols.length),
   }));
   ```

3. **VIF Bar Chart** (horizontal Recharts BarChart, shown in VIF tab):
   ```tsx
   // Sorted descending by VIF
   // Color per bar: rose if VIF > 10, amber if VIF > 5, emerald otherwise
   // Reference lines: amber at VIF=5, rose at VIF=10
   // Labels on each bar: the VIF value
   // Caption: "VIF > 10: collinear (consider removing) | VIF 5-10: moderate | VIF < 5: acceptable"
   ```

4. **Endpoint Correlation Bar Chart** (horizontal sorted, new "vs Endpoint" tab):
   ```tsx
   // Only shown when an endpoint column is detected by column intelligence
   // X-axis: correlation with endpoint (-1 to +1)
   // Y-axis: all other columns, sorted by absolute correlation
   // Color: violet (positive correlation) / rose (negative correlation)
   // Reference lines at ±0.3 (weak), ±0.5 (moderate), ±0.7 (strong)
   // Tooltip: "r = 0.73 (p = 0.001, Pearson)"
   ```

---

## Sprint 5: Statistical Group Tests

### New File
`frontend/src/components/studio/analytics/StatisticalTestPanel.tsx`

### New Backend Route
```python
@router.post("/{client_id}/statistical-test")
async def statistical_test(
    client_id: str,
    value_col: str = Form(...),
    group_col: str = Form(...),
    test_type: str = Form("auto"),   # "auto" | "ttest" | "mannwhitney" | "anova" | "kruskal"
    posthoc: str = Form("tukey"),    # "tukey" | "dunn" | "none"
):
    from scipy import stats as sp_stats
    import numpy as np

    df, context = _load_df(client_id)

    if value_col not in df.columns or group_col not in df.columns:
        raise HTTPException(422, "Column not found.")

    values = pd.to_numeric(df[value_col], errors='coerce')
    groups_raw = df[group_col].astype(str)
    combined = pd.DataFrame({"value": values, "group": groups_raw}).dropna()
    group_names = combined["group"].unique().tolist()
    n_groups = len(group_names)

    if n_groups < 2:
        raise HTTPException(422, "Need at least 2 groups to compare.")

    group_data = {g: combined[combined["group"] == g]["value"].tolist() for g in group_names}

    # Auto-select test
    if test_type == "auto":
        if n_groups == 2:
            # Shapiro-Wilk on both groups to decide parametric vs non-parametric
            _, p1 = sp_stats.shapiro(group_data[group_names[0]][:5000])
            _, p2 = sp_stats.shapiro(group_data[group_names[1]][:5000])
            test_type = "ttest" if (p1 > 0.05 and p2 > 0.05) else "mannwhitney"
        else:
            test_type = "anova"

    # Run the test
    groups = [group_data[g] for g in group_names]
    if test_type == "ttest" and n_groups == 2:
        stat, p = sp_stats.ttest_ind(groups[0], groups[1], equal_var=False)  # Welch's t-test
        m1, m2 = np.mean(groups[0]), np.mean(groups[1])
        pooled_std = np.sqrt((np.var(groups[0]) + np.var(groups[1])) / 2)
        effect_size = abs(m1 - m2) / pooled_std if pooled_std > 0 else 0
        effect_label = "Large" if effect_size >= 0.8 else "Medium" if effect_size >= 0.5 else "Small"
        test_name = "Welch's t-test"

    elif test_type == "mannwhitney" and n_groups == 2:
        stat, p = sp_stats.mannwhitneyu(groups[0], groups[1], alternative="two-sided")
        n1, n2 = len(groups[0]), len(groups[1])
        effect_size = abs(1 - 2 * stat / (n1 * n2))  # rank-biserial r
        effect_label = "Large" if effect_size >= 0.5 else "Medium" if effect_size >= 0.3 else "Small"
        test_name = "Mann-Whitney U"

    elif test_type == "anova":
        stat, p = sp_stats.f_oneway(*groups)
        effect_size = None; effect_label = None
        test_name = "One-way ANOVA"

    elif test_type == "kruskal":
        stat, p = sp_stats.kruskal(*groups)
        effect_size = None; effect_label = None
        test_name = "Kruskal-Wallis"

    # Per-group statistics for box plot
    per_group_stats = []
    for g in group_names:
        vals = np.array(group_data[g])
        q1, q3 = np.percentile(vals, 25), np.percentile(vals, 75)
        per_group_stats.append({
            "group": g, "n": len(vals), "mean": _safe(float(vals.mean())),
            "median": _safe(float(np.median(vals))), "std": _safe(float(vals.std())),
            "q1": _safe(float(q1)), "q3": _safe(float(q3)),
            "min": _safe(float(vals.min())), "max": _safe(float(vals.max())),
            "values": [_safe(float(v)) for v in vals[:200]],  # send up to 200 raw points for jitter
        })

    return {
        "test_name": test_name, "test_type": test_type,
        "statistic": _safe(float(stat)), "p_value": _safe(float(p)),
        "significant": bool(p < 0.05),
        "effect_size": _safe(effect_size) if effect_size is not None else None,
        "effect_label": effect_label,
        "n_groups": n_groups, "group_names": group_names,
        "per_group": per_group_stats,
        "interpretation": (
            f"{test_name}: statistic = {stat:.3f}, p = {p:.4f}. "
            f"{'Significant difference between groups.' if p < 0.05 else 'No significant difference detected.'}"
            + (f" Effect size: {effect_label} (d = {effect_size:.2f})." if effect_size else "")
        ),
    }
```

### Frontend Visualizations

**Panel layout:**

1. **Controls row:**
   - Value column dropdown (numeric columns from column intelligence)
   - Group column dropdown (categorical columns from column intelligence)
   - Test dropdown: Auto | t-test (2 groups) | Mann-Whitney (2 groups) | ANOVA (≥3) | Kruskal-Wallis (≥3)
   - "Run Test" button

2. **Results (after run):**

   a. **Violin + Box Plot** (Recharts ComposedChart or custom SVG per group):
   ```tsx
   // For each group, draw:
   // - Vertical box (Q1 to Q3 rectangle)
   // - Median line inside box
   // - Whiskers extending to min/max (or 1.5×IQR)
   // - Jittered individual points (scatter)
   // - Violin: KDE curve on each side (custom path element)

   // Significance bracket between groups (when 2 groups):
   // Draw a horizontal line above both boxes with p-value annotation:
   //   "p = 0.003 **"
   ```

   b. **Test Summary Card:**
   ```tsx
   <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
     <div className="text-xs font-bold">{data.test_name}</div>
     <div className="text-[10px] text-slate-500 mt-1">{data.interpretation}</div>
     <div className="grid grid-cols-3 gap-2 mt-3">
       <div>Statistic: <span className="text-white font-mono">{data.statistic.toFixed(3)}</span></div>
       <div>p-value: <span className={data.significant ? 'text-emerald-400' : 'text-slate-400'}>
         {data.p_value.toFixed(4)}</span></div>
       {data.effect_label && (
         <div>Effect: <span className="text-violet-400">{data.effect_label}</span></div>
       )}
     </div>
   </div>
   ```

   c. **Per-Group Summary Table:**
   | Group | N | Mean | Median | Std | Q1 | Q3 |
   Each row colored with the group's accent color.

---

## Sprint 6: PCA / Dimensionality Reduction

### New File
`frontend/src/components/studio/analytics/DimensionalityReductionPanel.tsx`

### New Backend Route
```python
@router.post("/{client_id}/dimensionality-reduction")
async def dimensionality_reduction(
    client_id: str,
    method: str = Form("pca"),       # "pca" | "tsne" | "umap"
    color_col: str = Form(""),
    n_components: int = Form(2),
    tsne_perplexity: float = Form(30.0),
    umap_n_neighbors: int = Form(15),
    n_clusters: int = Form(0),
):
    from sklearn.decomposition import PCA
    from sklearn.preprocessing import StandardScaler
    from sklearn.cluster import KMeans
    import numpy as np

    df, context = _load_df(client_id)
    numeric_df = df.select_dtypes(include=[np.number])

    # Remove endpoint column from features if detected
    endpoint_hints = ["lc50","ec50","ic50","activity","value","endpoint","target"]
    feat_cols = [c for c in numeric_df.columns
                 if not any(h in c.lower() for h in endpoint_hints)][:100]

    X = numeric_df[feat_cols].fillna(numeric_df[feat_cols].median()).values
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    if method == "pca":
        from sklearn.decomposition import PCA
        pca = PCA(n_components=min(n_components, min(Xs.shape)), random_state=42)
        coords = pca.fit_transform(Xs)
        explained = [_safe(float(v * 100)) for v in pca.explained_variance_ratio_]
        cumulative = [_safe(float(sum(pca.explained_variance_ratio_[:i+1]) * 100))
                      for i in range(len(pca.explained_variance_ratio_))]
        loadings = [{"feature": feat_cols[j], "pc1": _safe(float(pca.components_[0,j])),
                     "pc2": _safe(float(pca.components_[1,j])) if n_components > 1 else 0.0}
                    for j in range(len(feat_cols))]
    elif method == "tsne":
        from sklearn.manifold import TSNE
        coords = TSNE(n_components=2, perplexity=tsne_perplexity, random_state=42,
                      n_iter=1000).fit_transform(Xs)
        explained = None; cumulative = None; loadings = None
    elif method == "umap":
        try:
            import umap
            coords = umap.UMAP(n_components=2, n_neighbors=umap_n_neighbors,
                               random_state=42).fit_transform(Xs)
        except ImportError:
            raise HTTPException(422, "UMAP not installed. Run: pip install umap-learn")
        explained = None; cumulative = None; loadings = None

    # Color values
    color_values = []
    if color_col and color_col in df.columns:
        color_values = [_safe(v) for v in df[color_col].tolist()]

    # Clustering
    cluster_labels = []
    if n_clusters > 1:
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        cluster_labels = km.fit_predict(coords).tolist()

    points = [{"idx": int(i), "x": _safe(float(coords[i, 0])),
               "y": _safe(float(coords[i, 1])) if coords.shape[1] > 1 else 0.0,
               "color_value": color_values[i] if i < len(color_values) else None,
               "cluster": int(cluster_labels[i]) if i < len(cluster_labels) else None}
              for i in range(len(coords))]

    return {
        "method": method, "n_points": len(points), "points": points,
        "explained_variance": [{"component": f"PC{i+1}", "variance_pct": explained[i],
                                 "cumulative": cumulative[i]}
                                for i in range(len(explained))] if explained else None,
        "loadings": loadings,
        "n_clusters": n_clusters if cluster_labels else 0,
        "color_col": color_col,
        "features_used": feat_cols[:20],  # first 20 for display
    }
```

### Frontend Visualizations

1. **2D Scatter Plot** (Recharts ScatterChart, height=400, primary visualization):
   ```tsx
   // Color each point by color_value
   // If categorical color_col: assign discrete colors from COLORS array
   // If numeric color_col: use a continuous gradient (blue→violet→rose)
   // Point radius: 4px, fillOpacity: 0.8
   // Hover tooltip: shows idx, color_value, cluster (if applicable)
   // Axis labels: "PC1 (42.3% variance)" etc. (include % for PCA)
   ```

2. **Explained Variance Chart** (PCA only, Recharts ComposedChart):
   ```tsx
   // BarChart: variance per PC (cyan bars)
   // Line: cumulative variance (violet line, dashed)
   // ReferenceLine at y=80 (horizontal, "80% threshold")
   // X-axis: "PC1, PC2, PC3..."
   // Y-axis: "Variance (%)"
   ```

3. **PCA Loadings Plot** (PCA only, Recharts ScatterChart):
   ```tsx
   // Each descriptor as a point in (PC1_loading, PC2_loading) space
   // Points colored by absolute loading magnitude
   // Quadrant lines at x=0 and y=0
   // Labels on top 10 highest-loading descriptors
   // Tooltip: descriptor name, PC1 loading, PC2 loading
   ```
