# Scientific Intelligence Studio — Feature Implementation Reference

## CRITICAL: Fix Session Persistence First (Before Any Other Feature)

### Problem
`_sessions` dict in `intelligence_routes.py` is a Python module-level variable.
Server restart = all uploaded data is lost. This must be fixed before building any new features.

### Fix — Persist Intelligence Sessions to Disk

```python
# In intelligence_routes.py, replace the _sessions dict with disk-backed persistence:

import os, json
import pandas as pd

INTELLIGENCE_DIR = os.path.join(os.getcwd(), "workspaces", "intelligence")
os.makedirs(INTELLIGENCE_DIR, exist_ok=True)

def _get_session_dir(client_id: str) -> str:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in client_id)
    return os.path.join(INTELLIGENCE_DIR, safe)

def _save_session(client_id: str, df: pd.DataFrame, filename: str):
    d = _get_session_dir(client_id)
    os.makedirs(d, exist_ok=True)
    df.to_parquet(os.path.join(d, "dataset.parquet"))
    with open(os.path.join(d, "meta.json"), "w") as f:
        json.dump({"filename": filename, "cols": list(df.columns)}, f)

def _load_session(client_id: str) -> tuple[pd.DataFrame, str] | None:
    """Returns (df, filename) or raises HTTP 404."""
    d = _get_session_dir(client_id)
    parquet = os.path.join(d, "dataset.parquet")
    meta_path = os.path.join(d, "meta.json")
    if not os.path.exists(parquet):
        raise HTTPException(404, f"No dataset found for session '{client_id}'. Please upload a file first.")
    df = pd.read_parquet(parquet)
    filename = "dataset.parquet"
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            filename = json.load(f).get("filename", filename)
    return df, filename

# Update upload endpoint to call _save_session instead of _sessions[client_id] = ...
# Update all other endpoints to call _load_session instead of _sessions.get(client_id)
```

---

## Sprint 1: SMILES → 2D Structure Rendering (Foundation)

### Critical: This is required by ALL other Intelligence Studio features.

### New Backend Route — Add to `backend/main.py` or new `render_routes.py`

```python
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import Response
import hashlib

render_router = APIRouter(prefix="/api/render", tags=["render"])

# In-process SVG cache (cleared on restart, but warm cache during session)
_svg_cache: dict[str, str] = {}

@render_router.get("/structure")
async def render_structure(
    smiles: str = Query(..., description="SMILES string to render"),
    width:  int = Query(300),
    height: int = Query(200),
    highlight_atoms: str = Query("", description="Comma-separated atom indices to highlight"),
    bg_color: str = Query("transparent"),  # "transparent" | "white"
):
    """
    Render a SMILES string as an SVG 2D molecular structure.
    SVGs are cached by canonical SMILES for 24 hours.
    """
    try:
        from rdkit import Chem
        from rdkit.Chem.Draw import rdMolDraw2D
    except ImportError:
        raise HTTPException(503, "RDKit not available on this server.")

    # Cache key includes all params
    cache_key = hashlib.md5(f"{smiles}:{width}:{height}:{highlight_atoms}:{bg_color}".encode()).hexdigest()
    if cache_key in _svg_cache:
        return Response(content=_svg_cache[cache_key], media_type="image/svg+xml",
                        headers={"Cache-Control": "public, max-age=86400"})

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        # Return a placeholder SVG indicating invalid SMILES
        placeholder = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">
          <rect width="{width}" height="{height}" fill="rgba(30,30,50,0.5)" rx="8"/>
          <text x="{width//2}" y="{height//2}" text-anchor="middle" fill="#f43f5e"
                font-family="monospace" font-size="11">Invalid SMILES</text>
        </svg>'''
        return Response(content=placeholder, media_type="image/svg+xml")

    # Parse highlight atoms
    atom_ids = []
    if highlight_atoms:
        try:
            atom_ids = [int(x.strip()) for x in highlight_atoms.split(",") if x.strip()]
            # Validate atom indices
            atom_ids = [a for a in atom_ids if 0 <= a < mol.GetNumAtoms()]
        except ValueError:
            atom_ids = []

    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    opts = drawer.drawOptions()
    opts.addStereoAnnotation = True
    opts.addAtomIndices = False
    opts.bondLineWidth = 1.5
    opts.atomLabelFontSize = 0.35

    # Set background
    if bg_color == "transparent":
        drawer.SetDrawBkg(False)
    else:
        drawer.SetDrawBkg(True)

    if atom_ids:
        atom_colors = {i: (0.95, 0.2, 0.2) for i in atom_ids}  # red highlight
        bond_colors = {}
        drawer.DrawMolecule(mol, highlightAtoms=atom_ids,
                           highlightAtomColors=atom_colors,
                           highlightBonds=[],
                           highlightBondColors=bond_colors)
    else:
        drawer.DrawMolecule(mol)

    drawer.FinishDrawing()
    svg = drawer.GetDrawingText()

    _svg_cache[cache_key] = svg
    return Response(content=svg, media_type="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=86400"})
```

Register in `main.py`:
```python
from backend.api.routes.render_routes import render_router
app.include_router(render_router)
```

### Frontend: Reusable `MoleculeCard.tsx` Component

```tsx
// Path: frontend/src/components/studio/intelligence/MoleculeCard.tsx

import React, { useState } from 'react';

interface MoleculeCardProps {
  smiles: string;
  apiBase: string;
  label?: string;
  sublabel?: string;
  activityValue?: number | null;
  activityUnit?: string;
  adStatus?: 'inside' | 'outside' | 'borderline' | null;
  highlightAtoms?: number[];
  width?: number;
  height?: number;
  onClick?: () => void;
  compact?: boolean;  // compact=true: smaller card with less padding
}

export const MoleculeCard: React.FC<MoleculeCardProps> = ({
  smiles, apiBase, label, sublabel, activityValue, activityUnit = 'pIC₅₀',
  adStatus, highlightAtoms = [], width = 200, height = 150, onClick, compact = false,
}) => {
  const [imgError, setImgError] = useState(false);

  const highlightParam = highlightAtoms.length > 0
    ? `&highlight_atoms=${highlightAtoms.join(',')}`
    : '';

  const src = smiles && !imgError
    ? `${apiBase}/api/render/structure?smiles=${encodeURIComponent(smiles)}&width=${width}&height=${height}${highlightParam}`
    : '';

  const adColors = {
    inside: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    outside: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    borderline: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-rose-500/20 transition-all
        ${onClick ? 'cursor-pointer' : ''} ${compact ? 'p-2' : 'p-3'}`}
    >
      {/* Structure image */}
      <div className={`flex items-center justify-center bg-white/[0.03] rounded-lg overflow-hidden
        ${compact ? 'h-20 mb-1.5' : 'h-28 mb-2'}`}>
        {src ? (
          <img
            src={src}
            alt={label || 'Molecule structure'}
            className="max-w-full max-h-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="text-[10px] text-slate-600 font-mono text-center px-2">
            {!smiles ? 'No SMILES' : 'Render failed'}
          </div>
        )}
      </div>

      {/* Labels */}
      {label && (
        <div className={`font-semibold text-white truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {label}
        </div>
      )}
      {sublabel && (
        <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{sublabel}</div>
      )}

      {/* Activity value */}
      {activityValue !== null && activityValue !== undefined && (
        <div className={`font-black text-white ${compact ? 'text-xs mt-0.5' : 'text-sm mt-1'}`}>
          {activityValue.toFixed(3)}
          <span className="text-[9px] text-slate-500 font-normal ml-1">{activityUnit}</span>
        </div>
      )}

      {/* AD status badge */}
      {adStatus && (
        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wide mt-1 ${adColors[adStatus]}`}>
          {adStatus === 'inside' ? '✓ In AD' : adStatus === 'outside' ? '✗ Outside AD' : '~ Borderline'}
        </div>
      )}
    </div>
  );
};
```

---

## Sprint 2: Activity Cliff Analysis with Structure Display

### Upgrade File
`frontend/src/components/studio/intelligence/ActivityCliffPanel.tsx`

### Backend Extension — Extend `GET /{client_id}/activity-cliffs`

Add to response:
1. SALI score per pair:
   ```python
   # SALI (Structure-Activity Landscape Index):
   # SALI(i,j) = |activity_i - activity_j| / (1 - Tanimoto(i,j))
   # Only defined when Tanimoto < 1.0 (not identical structures)
   sali = act_diff / (1 - sim) if sim < 1.0 else float('inf')
   ```

2. Per-compound maximum SALI (for SALI map):
   ```python
   # After computing all pairs, for each compound find its max SALI with any partner
   compound_max_sali = {}
   for cliff in cliffs:
     i, j = cliff["compound_i"], cliff["compound_j"]
     compound_max_sali[i] = max(compound_max_sali.get(i, 0), cliff.get("sali", 0))
     compound_max_sali[j] = max(compound_max_sali.get(j, 0), cliff.get("sali", 0))
   # Add to response: sali_per_compound list
   ```

3. Add `"smiles_i"` and `"smiles_j"` to every cliff pair in the response
4. Add `"sali"` to every cliff pair

### Frontend: Complete Rebuild

**State:**
```tsx
const [data, setData]          = useState<CliffsData | null>(null);
const [currentCliff, setCurrentCliff] = useState(0);  // carousel index
const [threshold, setThreshold] = useState(2.0);
const [topN, setTopN]          = useState(30);
const [loading, setLoading]    = useState(false);
const [error, setError]        = useState<string | null>(null);

interface CliffPair {
  compound_i: number; compound_j: number;
  similarity: number; activity_i: number; activity_j: number;
  activity_diff: number; cliff_score: number; sali: number;
  smiles_i: string; smiles_j: string;
}
```

**Visualizations (in order from top to bottom):**

1. **Summary KPI row** (4 cards):
   - Total compounds | Cliff pairs found | Max cliff score | Mean Tanimoto of cliff pairs

2. **Cliff Pair Carousel** (PRIMARY visualization — full width, prominent):
   ```tsx
   // Navigation buttons: ◀ Previous | Cliff 3 of 15 | Next ▶
   // The main card content:
   <div className="p-5 rounded-2xl border border-rose-500/20 bg-rose-500/5">
     {/* Title row */}
     <div className="flex justify-between items-center mb-4">
       <div className="font-bold text-rose-400">Activity Cliff #{currentCliff + 1}</div>
       <div className="text-xs text-slate-400">
         Tanimoto: {(cliff.similarity * 100).toFixed(0)}% similar
       </div>
     </div>

     {/* Side-by-side structures */}
     <div className="grid grid-cols-2 gap-6">
       {[
         {smiles: cliff.smiles_i, idx: cliff.compound_i, act: cliff.activity_i},
         {smiles: cliff.smiles_j, idx: cliff.compound_j, act: cliff.activity_j},
       ].map((cpd, k) => (
         <MoleculeCard
           key={k} smiles={cpd.smiles} apiBase={apiBase}
           label={`Compound ${cpd.idx}`}
           activityValue={cpd.act} activityUnit="pIC₅₀"
           width={240} height={180}
         />
       ))}
     </div>

     {/* Activity delta badge */}
     <div className="text-center mt-4">
       <span className="text-lg font-black text-amber-400">
         Δ = {cliff.activity_diff.toFixed(2)} log units
       </span>
       <div className="text-[10px] text-slate-500 mt-1">
         {cliff.activity_diff >= 2
           ? 'Major activity cliff — strong SAR discontinuity'
           : 'Minor activity cliff — moderate SAR discontinuity'}
       </div>
     </div>
   </div>
   ```

3. **Cliff Score Bar Chart** (Recharts BarChart, horizontal, height=200):
   ```tsx
   // X: cliff_score | Y: "Pair {i}–{j}" label
   // Top 15 cliff pairs only
   // Color: gradient rose (high score) → amber (lower score)
   // Click a bar → jumps carousel to that cliff pair
   ```

4. **SALI Map** (Recharts ScatterChart, height=250):
   ```tsx
   // X: compound index | Y: max SALI score
   // Point size: proportional to SALI (range 3–12px)
   // Color: rose if SALI > 5 (hot cliff former), amber if > 2, cyan otherwise
   // Tooltip: "Compound {idx}: max SALI = {sali.toFixed(2)} — involved in {n} cliff pairs"
   // Title: "SALI Map — Compounds with highest SALI are most structurally information-rich"
   ```

5. **Cliff Pairs Table** (scrollable, collapsible, shows all cliff pairs):
   - Columns: Pair | Cmpd i | Cmpd j | Activity i | Activity j | Δ Activity | Tanimoto | SALI | Score
   - Sortable by score (default), SALI, activity_diff
   - Click row → jumps carousel

---

## Sprint 3: Tanimoto Read-Across with External Compound

### Upgrade File
`frontend/src/components/studio/intelligence/ReadAcrossPanel.tsx`

### Backend Extension — Extend `GET /{client_id}/read-across`

Add `query_smiles` parameter (for external compounds not in the dataset):
```python
@router.get("/{client_id}/read-across")
async def read_across(
    client_id: str,
    query_idx: Optional[int] = Query(None),       # index in dataset
    query_smiles: Optional[str] = Query(None),     # NEW: external SMILES
    k: int = Query(10),
    activity_col: Optional[str] = Query(None),
    method: str = Query("auto"),                   # "auto" | "tanimoto" | "euclidean"
):
    df, filename = _load_session(client_id)
    # ... (existing query_idx logic stays)

    # NEW: if query_smiles provided, compute descriptors inline
    if query_smiles:
        from rdkit import Chem, DataStructs
        from rdkit.Chem import AllChem

        smiles_col = next((c for c in df.columns if "smiles" in c.lower()), None)
        if smiles_col and (method == "tanimoto" or method == "auto"):
            # Build Morgan FP for all compounds in dataset
            query_mol = Chem.MolFromSmiles(query_smiles)
            if query_mol is None:
                raise HTTPException(422, f"Invalid query SMILES: {query_smiles[:60]}")
            query_fp = AllChem.GetMorganFingerprintAsBitVect(query_mol, 2, 2048)

            sims, valid_idx = [], []
            for i, smi in enumerate(df[smiles_col].fillna("").tolist()):
                mol = Chem.MolFromSmiles(str(smi))
                if mol:
                    fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, 2048)
                    sims.append(DataStructs.TanimotoSimilarity(query_fp, fp))
                    valid_idx.append(i)

            if not sims:
                raise HTTPException(422, "No valid SMILES found in dataset for Tanimoto comparison.")

            top_k_idx = sorted(range(len(sims)), key=lambda x: sims[x], reverse=True)[:k]
            neighbours = []
            for rank, li in enumerate(top_k_idx):
                di = valid_idx[li]
                neighbours.append({
                    "rank": rank + 1, "compound_idx": int(di),
                    "similarity": _safe(float(sims[li])),  # Tanimoto, not distance
                    "activity": _safe(df[activity_col].iloc[di]) if activity_col else None,
                    "smiles": str(df[smiles_col].iloc[di]),
                })

            act_vals = [n["activity"] for n in neighbours if n["activity"] is not None]
            pred_activity = _safe(float(np.mean(act_vals))) if act_vals else None
            pred_std = _safe(float(np.std(act_vals))) if len(act_vals) > 1 else None

            return {
                "query": {"smiles": query_smiles, "activity": None, "is_external": True},
                "neighbours": neighbours, "k": k,
                "activity_col": activity_col,
                "predicted_activity": pred_activity,
                "prediction_std": pred_std,
                "confidence": "High" if min(sims[i] for i in top_k_idx) >= 0.7
                              else "Medium" if min(sims[i] for i in top_k_idx) >= 0.4
                              else "Low",
                "method": "tanimoto_morgan",
                "n_features_used": None,
            }
```

### Frontend: Complete Upgrade

**UI Layout:**
```
┌──────────────────────────────────────────────┐
│  Query Compound                              │
│  ○ Select from dataset  ● Enter SMILES       │
│  [SMILES input text area]                    │
│  [k=10 slider] [Method: Tanimoto Morgan FP]  │
│  [Endpoint dropdown: pIC50]                  │
│  [🔍 Find Neighbors] button                  │
└──────────────────────────────────────────────┘
```

**Visualizations:**

1. **Query + Neighbors Gallery** (PRIMARY, shown after run):
   ```tsx
   // Left panel: Query compound
   <div className="w-48 shrink-0">
     <MoleculeCard smiles={data.query.smiles} apiBase={apiBase}
       label={data.query.is_external ? "Query (External)" : `Compound ${data.query.idx}`}
       activityValue={data.predicted_activity}
       width={180} height={140} />
     <div className="mt-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-center">
       <div className="text-[10px] text-slate-500">Predicted</div>
       <div className="text-lg font-black text-white">
         {data.predicted_activity?.toFixed(3) ?? 'N/A'}
       </div>
       <div className="text-[10px] text-slate-500">
         ±{data.prediction_std?.toFixed(3) ?? '?'} (1σ)
       </div>
       <div className={`text-[9px] font-bold mt-1 ${
         data.confidence === 'High' ? 'text-emerald-400' :
         data.confidence === 'Medium' ? 'text-amber-400' : 'text-rose-400'
       }`}>
         {data.confidence} Confidence
       </div>
     </div>
   </div>

   // Arrow →→→

   // Right panel: Neighbors grid
   <div className="flex-1 grid grid-cols-5 gap-2">
     {data.neighbours.map(n => (
       <MoleculeCard key={n.rank} smiles={n.smiles} apiBase={apiBase}
         label={`#${n.rank} • ${(n.similarity * 100).toFixed(0)}%`}
         activityValue={n.activity} compact />
     ))}
   </div>
   ```

2. **Tanimoto Similarity Bar Chart** (Recharts BarChart horizontal):
   ```tsx
   // X: Tanimoto similarity (0–1) | Y: neighbor rank
   // Color gradient: emerald (sim > 0.7), violet (0.5–0.7), amber (< 0.5)
   // Threshold line at 0.5 (amber dashed): "minimum acceptable similarity"
   // X-axis label: "Tanimoto Similarity (Morgan FP, radius=2)"
   ```

3. **Activity vs. Similarity Scatter** (Recharts ScatterChart):
   ```tsx
   // X: Tanimoto similarity | Y: measured activity of neighbor
   // Each point = one neighbor
   // Trend line (linear regression) overlay
   // Star symbol at query position: x = undefined (external), y = predicted activity
   // Tooltip: "Compound {idx}: similarity={sim.toFixed(2)}, activity={act.toFixed(3)}"
   ```

4. **Confidence Report Card:**
   ```tsx
   // 3 metrics displayed as cards:
   // "Structural Coverage": avg(Tanimoto of neighbors) → green ≥ 0.7, amber 0.5–0.7, rose < 0.5
   // "Activity Consistency": 1 - (std/mean of neighbor activities) → how consistent are neighbors
   // "Prediction Confidence": composite badge — High / Medium / Low
   // Explanation text: "Prediction is based on 10 structurally similar compounds (Tanimoto 0.71–0.93)"
   ```

5. **Download Report Button**: Creates a formatted text report:
   ```
   READ-ACROSS PREDICTION REPORT
   ==============================
   Query SMILES: [smiles]
   Method: Tanimoto (Morgan FP, r=2, 2048 bits)
   Endpoint: pIC50
   
   PREDICTED VALUE: 6.430 pIC50 ± 0.312 (1σ)
   CONFIDENCE: High
   
   SUPPORTING EVIDENCE (k=10 nearest neighbors):
   Rank | Similarity | Measured Activity | Compound
   1    | 0.931      | 6.72              | Compound 47
   2    | 0.887      | 6.15              | Compound 52
   ...
   ```

---

## Sprint 4: Scaffold Analysis with Structure Gallery

### Upgrade File
`frontend/src/components/studio/intelligence/ScaffoldPanel.tsx`

### Backend Extension — Extend `GET /{client_id}/scaffold-analysis`

Add activity statistics per scaffold:
```python
# After building scaffold_counts, for each scaffold, gather activity data:
scaffold_activity = {}  # scaffold_smiles → list of activity values

# Re-iterate df to collect per-scaffold activities:
if activity_col:
    for _, row in df.iterrows():
        smi = str(row.get(smiles_col, ""))
        scaffold = get_murcko_scaffold(smi)
        if scaffold and not pd.isna(row.get(activity_col)):
            scaffold_activity.setdefault(scaffold, []).append(float(row[activity_col]))

# Build enriched scaffold list:
scaffold_list = []
for scaffold_smiles, count in sorted_scaffolds[:top_n]:
    acts = scaffold_activity.get(scaffold_smiles, [])
    scaffold_list.append({
        "scaffold": scaffold_smiles,
        "count": count,
        "pct": _safe(count / total_compounds * 100),
        "activity_mean": _safe(float(np.mean(acts))) if acts else None,
        "activity_std": _safe(float(np.std(acts))) if len(acts) > 1 else None,
        "activity_min": _safe(float(min(acts))) if acts else None,
        "activity_max": _safe(float(max(acts))) if acts else None,
        "best_activity": _safe(float(max(acts))) if acts else None,  # highest activity in series
    })

return {
    "smiles_col": smiles_col, "activity_col": activity_col,
    "mode": "rdkit_murcko", "total_compounds": total_compounds,
    "unique_scaffolds": len(scaffold_counts), "scaffold_diversity": _safe(scaffold_diversity),
    "scaffolds": scaffold_list,
}
```

### Frontend: Scaffold Gallery

**Primary visualization — Scaffold Gallery Grid:**
```tsx
// Grid: responsive, 3–5 columns depending on screen width
<div className="grid grid-cols-3 gap-3">
  {data.scaffolds.slice(0, 15).map((scaffold, i) => (
    <div key={i}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 hover:border-rose-500/20 transition-all cursor-pointer"
      onClick={() => setSelectedScaffold(scaffold)}
    >
      {/* 2D Structure */}
      <img
        src={`${apiBase}/api/render/structure?smiles=${encodeURIComponent(scaffold.scaffold)}&width=200&height=140`}
        alt={`Scaffold ${i+1}`}
        className="w-full h-28 object-contain rounded-lg bg-white/[0.02] mb-2"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />

      {/* Stats */}
      <div className="text-rose-400 font-bold text-xs">{scaffold.count} compounds</div>
      <div className="text-[10px] text-slate-500 mt-0.5">
        {scaffold.pct.toFixed(1)}% of library
      </div>

      {scaffold.activity_mean !== null && (
        <>
          <div className="text-[10px] text-emerald-400 mt-1">
            Mean: {scaffold.activity_mean.toFixed(2)} pIC₅₀
          </div>
          {/* Activity range mini-bar */}
          <div className="mt-1 text-[9px] text-slate-600">
            Range: {scaffold.activity_min?.toFixed(1)} — {scaffold.activity_max?.toFixed(1)}
          </div>
        </>
      )}
    </div>
  ))}
</div>
```

**Secondary visualizations:**

1. **Scaffold Activity Box Plot** (Recharts BarChart custom — draw as box-and-whisker):
   ```tsx
   // For each scaffold (top 10): show a vertical box
   // Box height: Q1 to Q3 of activity values
   // Median line inside
   // Whiskers: min to max
   // X-axis: scaffold index (1–10), hoverable with scaffold SMILES
   // Y-axis: "Activity (pIC₅₀)"
   ```

2. **Scaffold Diversity Score Card:**
   ```tsx
   // Large gauge: scaffold_diversity (% of unique scaffolds)
   // "Library has {unique_scaffolds} unique Murcko scaffolds from {total_compounds} compounds"
   // "Scaffold diversity: {diversity.toFixed(1)}%"
   // Interpretation:
   // > 70%: "Highly diverse — broad structural coverage"
   // 40–70%: "Moderate diversity — several dominant scaffold families"
   // < 40%: "Low diversity — compound series dominated by {topScaffold.count} analogues"
   ```

---

## Sprint 5: Drug-Likeness & ADMET Profiling

### Replace `DiversityPanel.tsx` with `DrugLikenessPanel.tsx`

Add to sidebar navigation as "Drug-Likeness" tab.

### Backend Extension — Extend `GET /{client_id}/diversity`

Add per-compound Lipinski compliance and Veber's rules:
```python
# After computing property distributions, add per-compound flags:
lipinski_details = []
if mw_col and logp_col and hbd_col and hba_col:
    for _, row in df.iterrows():
        mw = float(row[mw_col]) if pd.notna(row[mw_col]) else None
        logp = float(row[logp_col]) if pd.notna(row[logp_col]) else None
        hbd = float(row[hbd_col]) if pd.notna(row[hbd_col]) else None
        hba = float(row[hba_col]) if pd.notna(row[hba_col]) else None
        tpsa = float(row[tpsa_col]) if tpsa_col and pd.notna(row.get(tpsa_col)) else None

        violations = []
        if mw and mw > 500: violations.append(f"MW={mw:.0f}>500")
        if logp and logp > 5: violations.append(f"LogP={logp:.1f}>5")
        if hbd and hbd > 5: violations.append(f"HBD={hbd:.0f}>5")
        if hba and hba > 10: violations.append(f"HBA={hba:.0f}>10")

        ro5_pass = len(violations) == 0
        veber_pass = (tpsa <= 140 and rotbonds <= 10) if (tpsa and rotbonds) else None

        # Drug-likeness score (0-100): penalize each violation by 25 points
        score = max(0, 100 - len(violations) * 25)

        lipinski_details.append({
            "idx": int(row.name),
            "ro5_pass": ro5_pass, "violations": violations,
            "veber_pass": veber_pass, "score": score,
        })

# Summary statistics:
pass_count = sum(1 for l in lipinski_details if l["ro5_pass"])
response["lipinski"] = {
    "ro5_pass": pass_count,
    "ro5_fail": len(lipinski_details) - pass_count,
    "ro5_pct": _safe(pass_count / len(lipinski_details) * 100) if lipinski_details else None,
    "per_compound": lipinski_details[:500],   # cap for response size
}
```

### Frontend Visualizations

1. **Drug-Likeness Radar Chart** (Recharts RadarChart, PRIMARY visualization):
   ```tsx
   // Data: library mean values, normalized to 0–1 scale
   // Two overlaid areas:
   //   - Ro5 threshold zone (shaded green region)
   //   - Library mean (shaded violet)
   // Axes: MW / LogP / HBD / HBA / TPSA / RotBonds
   // Legend: Ro5 Threshold | Library Mean
   ```

2. **Ro5 Filter Waterfall** (Recharts BarChart, horizontal stacked waterfall):
   ```tsx
   // Shows stepwise filtering:
   // All compounds → after MW filter → after LogP filter → after HBD filter → after HBA filter
   // Each bar segment shows how many are removed at each step
   // Final result: "X of {total} compounds pass all Ro5 criteria"
   ```

3. **Property Space Map: TPSA vs LogP** (Recharts ScatterChart, PRIMARY for medicinal chemists):
   ```tsx
   // Each point = one compound
   // X-axis: LogP (−5 to 10) | Y-axis: TPSA (0 to 200 Å²)
   // Quadrant shading:
   //   - Oral bioavailability zone: LogP 1–5, TPSA < 140 → light emerald
   //   - CNS active zone: LogP 2–5, TPSA < 90 → light violet
   //   - Poor absorption zone: TPSA > 140 → light rose
   // Reference lines: TPSA=140 (horizontal amber dashed), TPSA=90 (horizontal violet dashed)
   // Color points by activity (if endpoint available) or by Ro5 pass/fail
   // Tooltip: "MW: {mw}, LogP: {logp}, TPSA: {tpsa}, {ro5_pass ? 'Ro5 PASS' : 'Ro5 FAIL'}"
   ```

4. **Compound Ranking Table** (sortable):
   - Columns: Idx | MW | LogP | HBD | HBA | TPSA | Ro5 ✓/✗ | Score
   - Default sort: score descending (most drug-like first)
   - Filter: show only Ro5 passers (toggle)

---

## Sprint 6: Chemical Space Explorer

### New File
`frontend/src/components/studio/intelligence/ChemicalSpacePanel.tsx`

### New Backend Route — Add to `intelligence_routes.py`

```python
@router.get("/{client_id}/chemical-space")
async def chemical_space(
    client_id: str,
    method: str = Query("pca"),         # "pca" | "tsne"
    color_col: str = Query(""),
    n_clusters: int = Query(0),
):
    from sklearn.decomposition import PCA
    from sklearn.preprocessing import StandardScaler
    from sklearn.cluster import KMeans

    df, filename = _load_session(client_id)

    # Use only physicochemical property columns (MW, LogP, TPSA, HBD, HBA, RotBonds)
    PROPERTY_ALIASES = {
        "mw": ["mw", "mol_weight", "molecular_weight", "exactmw"],
        "logp": ["logp", "alogp", "crippen_logp", "xlogp"],
        "tpsa": ["tpsa", "topological_polar_surface_area"],
        "hbd": ["hbd", "h_bond_donors", "num_hbd"],
        "hba": ["hba", "h_bond_acceptors", "num_hba"],
        "rotbonds": ["rotatable_bonds", "rotbonds", "num_rotatable"],
    }

    feat_cols = []
    for prop, aliases in PROPERTY_ALIASES.items():
        for col in df.columns:
            if col.lower() in aliases:
                feat_cols.append(col)
                break

    # Fallback: use first 10 numeric columns if no property columns found
    if len(feat_cols) < 3:
        feat_cols = df.select_dtypes(include=[np.number]).columns.tolist()[:10]

    X = df[feat_cols].apply(pd.to_numeric, errors='coerce').fillna(0).values
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    if method == "pca":
        pca = PCA(n_components=2, random_state=42)
        coords = pca.fit_transform(Xs)
        explained = [_safe(float(v * 100)) for v in pca.explained_variance_ratio_]
    elif method == "tsne":
        from sklearn.manifold import TSNE
        perp = min(30, max(5, len(Xs) // 10))
        coords = TSNE(n_components=2, perplexity=perp, random_state=42).fit_transform(Xs)
        explained = None

    color_values = []
    if color_col and color_col in df.columns:
        color_values = [_safe(v) for v in df[color_col].tolist()]

    cluster_labels = []
    if n_clusters > 1:
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        cluster_labels = km.fit_predict(coords).tolist()

    smiles_col = next((c for c in df.columns if "smiles" in c.lower()), None)

    points = [{
        "idx": int(i),
        "x": _safe(float(coords[i, 0])),
        "y": _safe(float(coords[i, 1])),
        "color_value": color_values[i] if i < len(color_values) else None,
        "cluster": int(cluster_labels[i]) if i < len(cluster_labels) else None,
        "smiles": str(df[smiles_col].iloc[i]) if smiles_col else None,
    } for i in range(len(coords))]

    return {
        "method": method, "points": points,
        "explained_variance": explained,
        "features_used": feat_cols,
        "color_col": color_col,
        "smiles_col": smiles_col,
    }
```

### Frontend Visualizations

1. **Interactive Chemical Space Scatter** (Recharts ScatterChart, height=450, PRIMARY):
   ```tsx
   // Controls row above chart:
   // [Method: PCA | t-SNE] [Color by: endpoint / cluster / scaffold] [k-means clusters: 0-8]
   // [Regenerate] button

   // Chart:
   // Each point = one compound
   // Color by color_value:
   //   - If numeric (activity): gradient teal→violet→rose (inactive→active)
   //   - If categorical (scaffold): discrete COLORS array
   //   - If cluster: discrete COLORS array
   // Point size: 5px
   // HOVER TOOLTIP (most important part):
   const CustomTooltip = ({ active, payload }) => {
     if (!active || !payload?.length) return null;
     const pt = payload[0].payload;
     return (
       <div className="bg-[#0d1a2e] border border-white/[0.08] rounded-xl p-3 shadow-2xl">
         <div className="text-xs font-bold text-white mb-2">Compound {pt.idx}</div>
         {/* Show inline 2D structure in tooltip! */}
         {pt.smiles && (
           <img
             src={`${apiBase}/api/render/structure?smiles=${encodeURIComponent(pt.smiles)}&width=140&height=100`}
             className="rounded-lg mb-2"
             style={{ background: 'rgba(255,255,255,0.05)' }}
           />
         )}
         {pt.color_value !== null && (
           <div className="text-[10px] text-slate-300">{colorColName}: {pt.color_value}</div>
         )}
         {pt.cluster !== null && (
           <div className="text-[10px] text-violet-400">Cluster {pt.cluster}</div>
         )}
       </div>
     );
   };
   ```

2. **Cluster Statistics Panel** (shown when n_clusters > 0, below scatter):
   ```tsx
   // Card per cluster: Cluster {n} | {count} compounds | Mean activity | Example structure
   // Example structure: MoleculeCard for the compound closest to cluster center
   ```

3. **Explained Variance Display** (PCA only, small pill badges):
   ```tsx
   <div className="flex gap-2">
     <span className="px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold">
       PC1: {data.explained_variance[0].toFixed(1)}% variance
     </span>
     <span className="px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold">
       PC2: {data.explained_variance[1].toFixed(1)}% variance
     </span>
   </div>
   ```

---

## Sprint 7: Structural Alert Screening (PAINS + Brenk)

### New File
`frontend/src/components/studio/intelligence/StructuralAlertPanel.tsx`

### New Backend Route
```python
@router.get("/{client_id}/structural-alerts")
async def structural_alerts(client_id: str):
    """
    Screen all compounds for PAINS and Brenk structural alerts using RDKit FilterCatalog.
    PAINS: Pan-Assay Interference Compounds — structures causing false positives in HTS.
    Brenk: Potentially reactive, toxic, or chemically unstable substructures.
    """
    try:
        from rdkit import Chem
        from rdkit.Chem import FilterCatalog
    except ImportError:
        raise HTTPException(503, "RDKit required for structural alert screening.")

    df, filename = _load_session(client_id)
    smiles_col = next((c for c in df.columns if "smiles" in c.lower()), None)
    if not smiles_col:
        raise HTTPException(422, "No SMILES column found. Structural alert screening requires SMILES.")

    # Build catalogs
    pains_p = FilterCatalog.FilterCatalogParams()
    pains_p.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS_A)
    pains_p.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS_B)
    pains_p.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS_C)
    pains_cat = FilterCatalog.FilterCatalog(pains_p)

    brenk_p = FilterCatalog.FilterCatalogParams()
    brenk_p.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.BRENK)
    brenk_cat = FilterCatalog.FilterCatalog(brenk_p)

    results = []
    alert_category_counts = {}

    for idx, row in df.iterrows():
        smi = str(row[smiles_col]) if pd.notna(row[smiles_col]) else ""
        mol = Chem.MolFromSmiles(smi) if smi else None
        alerts = []

        if mol:
            for entry in pains_cat.GetMatches(mol):
                match = entry.GetFilterMatch(mol)
                try:
                    matched_atoms = list(match.GetMatchingAtoms())
                except Exception:
                    matched_atoms = []
                alert_name = entry.GetDescription()
                alerts.append({
                    "name": alert_name, "category": "PAINS",
                    "severity": "HIGH", "matched_atoms": matched_atoms[:20],
                })
                alert_category_counts[alert_name] = alert_category_counts.get(alert_name, 0) + 1

            for entry in brenk_cat.GetMatches(mol):
                match = entry.GetFilterMatch(mol)
                try:
                    matched_atoms = list(match.GetMatchingAtoms())
                except Exception:
                    matched_atoms = []
                alert_name = entry.GetDescription()
                alerts.append({
                    "name": alert_name, "category": "Brenk",
                    "severity": "MEDIUM", "matched_atoms": matched_atoms[:20],
                })
                alert_category_counts[alert_name] = alert_category_counts.get(alert_name, 0) + 1

        results.append({
            "idx": int(idx), "smiles": smi,
            "alerts": alerts,
            "is_pains": any(a["category"] == "PAINS" for a in alerts),
            "is_brenk": any(a["category"] == "Brenk" for a in alerts),
            "n_alerts": len(alerts),
        })

    n_pains = sum(1 for r in results if r["is_pains"])
    n_brenk = sum(1 for r in results if r["is_brenk"] and not r["is_pains"])
    n_clean = sum(1 for r in results if not r["alerts"])

    return {
        "total_screened": len(results),
        "n_pains": n_pains,
        "n_brenk_only": n_brenk,
        "n_clean": n_clean,
        "compounds": results,
        "alert_category_counts": dict(sorted(alert_category_counts.items(),
                                            key=lambda x: x[1], reverse=True)[:20]),
        "smiles_col": smiles_col,
    }
```

### Frontend Visualizations

1. **KPI Summary Row** (4 cards):
   - Compounds Screened | PAINS Flagged (rose) | Brenk Only (amber) | Clean ✅ (emerald, large)

2. **Alert Category Bar Chart** (Recharts BarChart horizontal, height=200):
   ```tsx
   // Top 15 alert categories by frequency
   // Rose bars for PAINS, amber bars for Brenk
   // Click bar → filters compound cards below to show only that alert
   ```

3. **Flagged Compound Cards** (scrollable grid, 3 columns):
   ```tsx
   // For each flagged compound:
   <MoleculeCard
     smiles={compound.smiles} apiBase={apiBase}
     label={`Compound ${compound.idx}`}
     highlightAtoms={compound.alerts.flatMap(a => a.matched_atoms)}
     // Highlighting shows matched alert substructure in red on the 2D structure
   />
   // Below the card:
   {compound.alerts.map(alert => (
     <div className={`px-2 py-0.5 rounded text-[9px] font-bold
       ${alert.category === 'PAINS' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
       ⚠ {alert.category}: {alert.name}
     </div>
   ))}
   ```

4. **Clean Compound Gallery** (emerald-bordered grid):
   ```tsx
   // Compounds with no alerts shown with emerald border
   // Caption: "✅ {n_clean} compounds passed all structural alert filters"
   // These are the recommended candidates for bioassay testing
   ```
