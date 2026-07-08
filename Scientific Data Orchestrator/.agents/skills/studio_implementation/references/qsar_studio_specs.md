# QSAR Engineering Studio — Feature Implementation Reference

## Sprint 1: Descriptor Generator Panel

### New File
`frontend/src/components/studio/qsar/DescriptorGeneratorPanel.tsx`

### New Backend Route — Add to `qsar_studio_routes.py`
```python
@router.post("/{client_id}/generate-descriptors")
async def generate_descriptors(
    client_id: str,
    background_tasks: BackgroundTasks,
    smiles_col: str = Form(...),
    mode: str = Form("fast"),           # "fast" | "standard" | "full"
    include_3d: bool = Form(False),
):
    """
    Compute RDKit/Mordred molecular descriptors from a SMILES column.
    Uses RDKitEngine.calculate_from_smiles() in a thread pool for performance.
    Merges computed descriptors back into the dataset and saves parquet.
    """
    from backend.descriptor_engine.rdkit_engine import RDKitEngine
    import concurrent.futures

    state = _get_qsar_state(client_id)
    df = _load_qsar_df(client_id)

    if smiles_col not in df.columns:
        raise HTTPException(422, f"Column '{smiles_col}' not found.")
    if mode not in ("fast", "standard", "full"):
        raise HTTPException(400, f"Invalid mode '{mode}'. Use: fast, standard, full.")

    engine = RDKitEngine()
    smiles_list = df[smiles_col].fillna("").tolist()

    # Run in thread pool
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(
            lambda s: engine.calculate_from_smiles(s, mode=mode, include_mordred=(mode=="full")),
            smiles_list
        ))

    # Build descriptor matrix
    success_rows, fail_rows = [], []
    all_desc_keys = set()
    for i, res in enumerate(results):
        if res["success"]:
            all_desc_keys.update(res["data"].keys())
            success_rows.append(i)
        else:
            fail_rows.append({"idx": i, "smiles": smiles_list[i], "error": res.get("error", "")})

    # Merge descriptors back into df
    desc_df = pd.DataFrame([
        results[i]["data"] if results[i]["success"] else {} for i in range(len(results))
    ], index=df.index)

    # Remove purely string/identifier columns from desc_df before merge
    # (CanonicalSMILES, IsomericSMILES, InChIKey, MolecularFormula are NOT descriptors)
    non_desc = {"CanonicalSMILES", "IsomericSMILES", "InChIKey", "MolecularFormula"}
    numeric_desc_cols = [c for c in desc_df.columns if c not in non_desc]
    desc_df = desc_df[numeric_desc_cols].apply(pd.to_numeric, errors='coerce')

    df_merged = pd.concat([df, desc_df], axis=1)
    # Remove duplicate columns
    df_merged = df_merged.loc[:, ~df_merged.columns.duplicated()]

    parquet_path = _save_qsar_df(client_id, df_merged, state["filename"])
    state["df"] = df_merged
    state["_parquet_path"] = parquet_path
    _set_qsar_state(client_id, state)

    # Build category breakdown
    categories = {
        "Constitutional": [c for c in numeric_desc_cols if c in ("MolWt","HeavyAtomCount","FractionCSP3","RingCount")],
        "Topological": [c for c in numeric_desc_cols if "Chi" in c or "Kappa" in c or "BalabanJ" in c],
        "Electronic": [c for c in numeric_desc_cols if "LogP" in c or "TPSA" in c or "MR" in c],
        "Fingerprint-derived": [c for c in numeric_desc_cols if "Morgan" in c or "ECFP" in c],
        "Other": [],
    }
    assigned = {c for cats in categories.values() for c in cats}
    categories["Other"] = [c for c in numeric_desc_cols if c not in assigned]

    # Preview: first 5 rows, first 10 descriptor columns only
    preview_cols = numeric_desc_cols[:10]
    preview = df_merged[preview_cols].head(5).applymap(_safe).to_dict(orient="records")

    return {
        "success_count": len(success_rows),
        "fail_count": len(fail_rows),
        "descriptor_count": len(numeric_desc_cols),
        "descriptor_names": numeric_desc_cols,
        "failed_rows": fail_rows[:50],   # cap at 50
        "categories": {k: len(v) for k, v in categories.items()},
        "preview": preview,
        "mode": mode,
    }
```

### Frontend Component Specification

**Props:** `{ clientId: string; apiBase: string; sessionInfo: any; }`

**State:**
```tsx
const [smilesCol, setSmilesCol] = useState('');
const [mode, setMode]           = useState<'fast'|'standard'|'full'>('fast');
const [include3d, setInclude3d] = useState(false);
const [data, setData]           = useState<DescResult | null>(null);
const [loading, setLoading]     = useState(false);
const [error, setError]         = useState<string | null>(null);

interface DescResult {
  success_count: number; fail_count: number; descriptor_count: number;
  descriptor_names: string[]; failed_rows: {idx:number; smiles:string; error:string}[];
  categories: Record<string, number>; preview: Record<string,any>[];
}
```

**Generate trigger:** POST with FormData to `/api/qsar-studio/${clientId}/generate-descriptors`

**Visualizations (in order):**

1. **4 KPI stat cards** (grid-cols-4):
   - Total SMILES | ✅ Parsed | ❌ Failed (rose if > 0) | Descriptors Generated

2. **Parse Quality Donut Chart** (Recharts PieChart, height=160):
   ```tsx
   data={[
     { name: 'Valid', value: data.success_count, color: '#10b981' },
     { name: 'Failed', value: data.fail_count, color: '#f43f5e' },
   ]}
   ```
   Center label: `${data.success_count} / ${data.success_count + data.fail_count} parsed`

3. **Descriptor Category Bar Chart** (Recharts BarChart horizontal, height=160):
   ```tsx
   data={Object.entries(data.categories).map(([name, count]) => ({ name, count }))}
   // X = count, Y = category name
   ```
   Colors: COLORS array cycling.

4. **Failed SMILES Table** (only shown if `data.fail_count > 0`):
   - Columns: Row # | SMILES (monospace, truncated 40 chars) | Error
   - Caption: "Showing {data.failed_rows.length} of {data.fail_count} failures"
   - Download button: generates a CSV blob of all failed rows

5. **Descriptor Preview Table** (show first 5 rows, first 10 columns):
   - Searchable by descriptor name (text filter on columns)
   - Caption: "Showing 10 of {data.descriptor_count} descriptors"

**Mode descriptions to show as info banner below mode selector:**
- fast: "9 key RDKit descriptors (MW, LogP, TPSA, HBD, HBA, RotBonds, Rings, HeavyAtoms, FractionCSP3) — fast, ~0.1s per compound"
- standard: "200+ RDKit descriptors including topological, constitutional, and electronic — ~0.5s per compound"
- full: "200+ RDKit + 1800+ Mordred descriptors including 3D geometric — ~5s per compound, requires 3D embedding"

---

## Sprint 2: Endpoint Quality Workshop

### Upgrade File
`frontend/src/components/studio/qsar/QSARReadinessPanel.tsx`

### New Backend Route — Add to `qsar_studio_routes.py`
```python
@router.post("/{client_id}/endpoint-transform")
async def apply_endpoint_transform(
    client_id: str,
    endpoint_col: str = Form(...),
    transform: str = Form(...),   # "log10" | "neg_log10" | "sqrt" | "none"
    new_col_name: str = Form(""),
):
    """
    Apply a mathematical transformation to the endpoint column.
    Creates a new column named new_col_name (or f'{endpoint_col}_transformed').
    For pIC50/pEC50: use neg_log10 on raw IC50/EC50 concentrations.
    """
    from scipy import stats as sp_stats
    import numpy as np

    state = _get_qsar_state(client_id)
    df = _load_qsar_df(client_id)

    if endpoint_col not in df.columns:
        raise HTTPException(422, f"Column '{endpoint_col}' not found.")
    if transform not in ("log10", "neg_log10", "sqrt", "none"):
        raise HTTPException(400, f"Invalid transform '{transform}'.")

    series = pd.to_numeric(df[endpoint_col], errors='coerce').dropna()
    if (transform in ("log10", "neg_log10")) and (series <= 0).any():
        raise HTTPException(422,
            f"Transform '{transform}' requires all positive values. "
            f"Found {(series <= 0).sum()} non-positive values.")

    if transform == "log10":
        transformed = np.log10(series)
    elif transform == "neg_log10":
        transformed = -np.log10(series)
    elif transform == "sqrt":
        transformed = np.sqrt(series)
    else:
        transformed = series

    col_name = new_col_name or f"{endpoint_col}_{transform}"
    df[col_name] = np.nan
    df.loc[series.index, col_name] = transformed

    # Normality test on transformed values
    sample = transformed.sample(min(5000, len(transformed)), random_state=42)
    w, p = sp_stats.shapiro(sample)

    parquet_path = _save_qsar_df(client_id, df, state["filename"])
    state["df"] = df
    state["_parquet_path"] = parquet_path
    _set_qsar_state(client_id, state)

    return {
        "new_col": col_name,
        "transform": transform,
        "n_transformed": len(transformed),
        "new_mean": _safe(float(transformed.mean())),
        "new_std": _safe(float(transformed.std())),
        "new_skewness": _safe(float(transformed.skew())),
        "shapiro_w": _safe(float(w)),
        "shapiro_p": _safe(float(p)),
        "is_normal": bool(p > 0.05),
    }
```

**Add to `/readiness` response** (extend existing endpoint):
- Add `"endpoint_skewness"` and `"endpoint_kurtosis"` fields
- Add `"bimodal_warning": bool` (True if abs(kurtosis) > 3 and abs(skewness) > 1)
- Add `"kde_data": [{"x": float, "y": float}, ...]` — 100 KDE points for the endpoint column

**Frontend additions to `QSARReadinessPanel.tsx`:**

After the existing grade/check display, add:

1. **Endpoint Distribution Panel** with 3 side-by-side histogram panels:
   - Panel A: Raw values | Panel B: log₁₀ | Panel C: –log₁₀
   - Each shows: histogram (10 bars) + KDE line overlay (ComposedChart)
   - Each shows: Skewness badge, Shapiro-Wilk p-value badge
   - "Recommended" banner on the most normal-looking transformation

2. **Bimodal Warning Banner** (amber, shown only if bimodal_warning=true):
   "⚠ Two distinct peaks detected in endpoint distribution. Consider splitting by chemical series."

3. **Apply Transformation Button**: Opens a small inline form:
   - Dropdown: log₁₀ / –log₁₀ / √x / no transform
   - New column name text input (auto-filled)
   - "Apply & Save" button → POST `/endpoint-transform`
   - After success: green success banner "Column '{name}' added to dataset"

---

## Sprint 3: Model Validation Dashboard

### Upgrade File
`frontend/src/components/studio/qsar/MLBenchmarkPanel.tsx`

### New Backend Routes — Add to `qsar_studio_routes.py`

```python
@router.post("/{client_id}/y-randomization")
async def y_randomization_test(
    client_id: str,
    background_tasks: BackgroundTasks,
    endpoint_col: str = Form(...),
    n_permutations: int = Form(100),
    subgroup: str = Form(""),
):
    """
    Y-randomization (permutation test) to validate the QSAR model.
    Permutes y-labels 100 times, fits RF model each time, records CV R².
    p-value = fraction of permuted R² ≥ real model R².
    """
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import cross_val_score
    from sklearn.preprocessing import StandardScaler
    import numpy as np

    state = _get_qsar_state(client_id)
    df = _load_qsar_df(client_id)
    if subgroup and subgroup in state.get("subgroups", {}):
        df = state["subgroups"][subgroup]

    feat_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c != endpoint_col]
    X = df[feat_cols].apply(pd.to_numeric, errors='coerce').fillna(0).values
    y = pd.to_numeric(df[endpoint_col], errors='coerce').values
    valid = ~np.isnan(y)
    X, y = X[valid], y[valid]

    if len(X) < 20:
        raise HTTPException(422, "Need at least 20 samples for Y-randomization test.")

    model = RandomForestRegressor(n_estimators=50, random_state=42, n_jobs=-1)
    cv_folds = min(5, len(X))

    real_r2 = float(np.mean(cross_val_score(model, X, y, cv=cv_folds, scoring='r2')))

    rng = np.random.RandomState(42)
    perm_r2s = []
    for _ in range(n_permutations):
        y_perm = rng.permutation(y)
        scores = cross_val_score(model, X, y_perm, cv=cv_folds, scoring='r2')
        perm_r2s.append(_safe(float(np.mean(scores))))

    p_value = float(np.mean(np.array(perm_r2s) >= real_r2))

    return {
        "real_r2": _safe(real_r2),
        "permuted_r2_distribution": perm_r2s,
        "p_value": _safe(p_value),
        "is_significant": bool(p_value < 0.05),
        "n_permutations": n_permutations,
        "interpretation": (
            f"Model R² = {real_r2:.3f} is {'statistically significant' if p_value < 0.05 else 'NOT significant'} "
            f"(p = {p_value:.3f}). "
            f"{'The model captures real structure-activity relationships.' if p_value < 0.05 else 'The model may be overfitting noise.'}"
        ),
    }

@router.get("/{client_id}/validation-metrics")
async def get_validation_metrics(client_id: str, endpoint_col: Optional[str] = None, subgroup: str = ""):
    """
    Compute Q² (LOO/10-fold CV), SDEP, cRMSE for the top model from last benchmark.
    Requires benchmark to have been run first.
    """
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import cross_val_predict, KFold, LeaveOneOut
    from sklearn.metrics import mean_squared_error
    import numpy as np

    state = _get_qsar_state(client_id)
    df = _load_qsar_df(client_id)
    if subgroup and subgroup in state.get("subgroups", {}):
        df = state["subgroups"][subgroup]

    if not endpoint_col:
        for kw in ("lc50","ec50","ic50","activity","endpoint","value","target"):
            matches = [c for c in df.columns if kw in c.lower()]
            if matches: endpoint_col = matches[0]; break
        if not endpoint_col:
            endpoint_col = df.select_dtypes(include=[np.number]).columns[-1]

    feat_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c != endpoint_col]
    X = df[feat_cols].apply(pd.to_numeric, errors='coerce').fillna(0).values
    y = pd.to_numeric(df[endpoint_col], errors='coerce').values
    valid = ~np.isnan(y)
    X, y = X[valid], y[valid]

    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    cv = KFold(n_splits=10, shuffle=True, random_state=42) if len(X) > 200 else LeaveOneOut()
    y_pred_cv = cross_val_predict(model, X, y, cv=cv)

    ss_res = float(np.sum((y - y_pred_cv) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    q2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    sdep = float(np.sqrt(ss_res / len(y)))
    crmse = float(np.sqrt(mean_squared_error(y, y_pred_cv)))

    # Train on all data to get training predictions for R²
    model.fit(X, y)
    y_train_pred = model.predict(X)
    r2_train = float(model.score(X, y))

    return {
        "q2_loo": _safe(q2),
        "sdep": _safe(sdep),
        "crmse": _safe(crmse),
        "r2_train": _safe(r2_train),
        "delta_r2_q2": _safe(r2_train - q2),  # should be < 0.3 for a good model
        "n_cv_folds": 10 if len(X) > 200 else len(X),
        "cv_type": "10-fold" if len(X) > 200 else "LOO",
        "endpoint_col": endpoint_col,
        "n": len(y),
        # Predicted vs actual data for scatter plot
        "scatter_data": [
            {"actual": _safe(float(y[i])), "predicted": _safe(float(y_train_pred[i])),
             "residual": _safe(float(y[i] - y_train_pred[i]))}
            for i in range(len(y))
        ],
    }
```

**Frontend additions to `MLBenchmarkPanel.tsx`** (add AFTER existing model ranking table):

After `result` is set and displayed, add 3 new collapsible sections:

**Section A — Predicted vs. Actual Plot:**
```tsx
// Fetch validation metrics after benchmark completes
useEffect(() => {
  if (result) fetchValidationMetrics();
}, [result]);

// ScatterChart with diagonal reference line (y=x)
// X-axis: "Actual pIC₅₀", Y-axis: "Predicted pIC₅₀"
// Color points by residual magnitude
// R² and RMSE annotations in top-left corner of chart
```

**Section B — Residual Plot:**
```tsx
// ScatterChart: X = predicted, Y = residual
// Horizontal ReferenceLine at y=0
// Two ReferenceLine at y=±2*sdep (amber dashed)
// Color points: blue (positive residual) / rose (negative residual)
```

**Section C — Y-Randomization:**
```tsx
// Button: "Run Y-Randomization (100 permutations)"
// After run: BarChart histogram of permuted R² distribution
// Vertical ReferenceLine at real_r2 (violet)
// Result badge: "✅ Significant (p = 0.001)" or "❌ Not Significant (p = 0.32)"
```

**Section D — Metrics Summary Table:**
| Metric | Value | QSAR Standard | Assessment |
|--------|-------|--------------|-----------|
| R² (training) | computed | > 0.90 | ✅/⚠/❌ |
| Q² (CV) | computed | > 0.60 | ✅/⚠/❌ |
| Δ(R² − Q²) | computed | < 0.30 | ✅/⚠/❌ |
| SDEP | computed | — | display only |
| Y-rand p | computed | < 0.05 | ✅/⚠/❌ |

Thresholds for assessment badges:
- R² train ≥ 0.90: ✅ Excellent | ≥ 0.70: ⚠ Acceptable | < 0.70: ❌ Poor
- Q² ≥ 0.60: ✅ Good | ≥ 0.40: ⚠ Marginal | < 0.40: ❌ Poor (model fails OECD P4)
- Δ(R²−Q²) < 0.30: ✅ Low overfitting | < 0.50: ⚠ Moderate | ≥ 0.50: ❌ Overfit
- Y-rand p < 0.05: ✅ Significant | ≥ 0.05: ❌ Not significant

---

## Sprint 4: Multi-Method Applicability Domain

### Upgrade File
`frontend/src/components/studio/qsar/ApplicabilityDomainPanel.tsx`

### Backend Extension — Extend `GET /{client_id}/applicability-domain`

Add `method` query parameter (`williams|knn|bbox|all`, default `williams`).
Add k-NN AD computation:
```python
elif method in ("knn", "all"):
    from sklearn.neighbors import NearestNeighbors
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X_clean)
    nbrs = NearestNeighbors(n_neighbors=min(5, len(Xs)-1)).fit(Xs)
    distances, _ = nbrs.kneighbors(Xs)
    knn_distances = distances[:, -1]  # distance to k-th neighbor
    knn_threshold = float(np.percentile(knn_distances, 95))  # 95th pct of training
    knn_in_ad = knn_distances <= knn_threshold
    # Add to response: knn_distances, knn_threshold, knn_in_ad
```

Add bounding box AD:
```python
elif method in ("bbox", "all"):
    X_min = X_clean.min(axis=0)
    X_max = X_clean.max(axis=0)
    bbox_in_ad = np.all((X_clean >= X_min) & (X_clean <= X_max), axis=1)
    # Add violation counts per descriptor to response
```

**Frontend additions:**

1. **Method selector tabs**: Williams Plot | k-NN Distance | Bounding Box | All Methods

2. **AD Coverage Summary Cards** (one per method when "All Methods" selected):
   ```
   Williams Plot AD    k-NN Distance AD    Bounding Box AD
   Inside: 87%         Inside: 91%          Inside: 78%
   ```

3. **k-NN Distance Distribution** (Recharts ComposedChart, shown in k-NN mode):
   - Histogram of distances to k-th neighbor for all compounds
   - Vertical amber dashed line at 95th percentile threshold
   - Compounds to the right = outside AD

4. **Bounding Box Violation Table** (shown in bbox mode):
   - For each out-of-AD compound: which descriptors are outside their training range
   - Color: rose if outside, emerald if inside

---

## Sprint 5: New Compound Prediction Interface

### New File
`frontend/src/components/studio/qsar/PredictionPanel.tsx`

### New Backend Routes
```python
@router.post("/{client_id}/predict")
async def predict_new_compounds(
    client_id: str,
    smiles_list: List[str] = Body(..., embed=True),
    endpoint_col: str = Body(""),
    descriptor_mode: str = Body("fast"),
):
    """
    Predict endpoint values for new compounds given as SMILES strings.
    1. Compute descriptors for each SMILES
    2. Apply same descriptor curation as training set
    3. Predict using top model from last benchmark
    4. Compute AD membership (Williams method)
    5. Return predictions with confidence
    """
    # ... implementation ...

@router.get("/{client_id}/render-smiles")
async def render_smiles(client_id: str, smiles: str = Query(...), width: int = 280, height: int = 200):
    """Render SMILES as SVG for display in prediction cards."""
    # Use RDKit Draw.MolDraw2DSVG — see SKILL.md Part 3.3 for exact code
```

**Frontend — Prediction Panel layout:**
```
[SMILES Input Section]
- Textarea: "Paste SMILES strings (one per line)"
- OR CSV upload button
- Descriptor mode selector (fast/standard)
- "Predict" button

[Results Grid — one card per compound]
┌─────────────────────────┐
│ [2D Structure Image]    │
│ Compound 1              │
│ Predicted: 6.43 pIC₅₀  │
│ AD: ✅ Inside (h=0.12)  │
│ CI: [6.1 — 6.8]        │
└─────────────────────────┘

[Prediction vs Training Distribution]
Violin plot: new predictions overlaid on training set distribution
```
