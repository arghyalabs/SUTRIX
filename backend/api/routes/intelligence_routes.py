"""
SUTRIX V6 — Scientific Intelligence Studio Routes
Independent cheminformatics intelligence studio.

Endpoints:
  POST /{client_id}/upload              — upload CSV/Parquet for intelligence analysis
  GET  /{client_id}/dataset-info        — session info
  GET  /{client_id}/scaffold-analysis   — Murcko scaffold frequency analysis
  GET  /{client_id}/activity-cliffs     — activity cliff detection (Δactivity vs similarity)
  GET  /{client_id}/diversity           — chemical diversity: MW/logP distribution summary
  GET  /{client_id}/read-across         — read-across similarity table (nearest neighbours)
  GET  /{client_id}/export              — export CSV
"""
import io
import json
import logging
import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

logger = logging.getLogger("sdo.api.intelligence")
router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])

_sessions: Dict[str, Dict] = {}


def _safe(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        fv = float(v)
        return None if (math.isnan(fv) or math.isinf(fv)) else fv
    return v


def _get_session(client_id: str) -> Dict:
    if client_id not in _sessions:
        raise HTTPException(404, f"No Intelligence session for '{client_id}'. Upload a dataset first.")
    return _sessions[client_id]


# ─── Upload ───────────────────────────────────────────────────────────────────

@router.post("/{client_id}/upload")
async def upload(client_id: str, file: UploadFile = File(...)):
    content = await file.read()
    fname = file.filename or "dataset"
    try:
        df = pd.read_parquet(io.BytesIO(content)) if fname.endswith(".parquet") else pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Cannot parse file: {e}")
    _sessions[client_id] = {"df": df, "filename": fname}
    return {"status": "ok", "filename": fname, "rows": len(df), "cols": len(df.columns), "columns": df.columns.tolist()}


@router.get("/{client_id}/dataset-info")
async def dataset_info(client_id: str):
    s = _get_session(client_id)
    df = s["df"]
    return {"filename": s["filename"], "rows": len(df), "cols": len(df.columns),
            "columns": df.columns.tolist(), "missing_pct": round(df.isna().mean().mean() * 100, 2)}


# ─── Scaffold Analysis ────────────────────────────────────────────────────────

@router.get("/{client_id}/scaffold-analysis")
async def scaffold_analysis(client_id: str, smiles_col: Optional[str] = None, top_n: int = 20):
    """
    Murcko scaffold frequency analysis.
    Falls back to MW-binned pseudo-scaffold if RDKit is unavailable.
    """
    s = _get_session(client_id)
    df = s["df"]

    # Find SMILES column
    if not smiles_col:
        smiles_col = next((c for c in df.columns if "smiles" in c.lower()), None)

    result = {"smiles_col": smiles_col, "mode": "none", "scaffolds": [], "top_n": top_n}

    if smiles_col and smiles_col in df.columns:
        # Try RDKit
        try:
            from rdkit import Chem
            from rdkit.Chem.Scaffolds import MurckoScaffold

            smiles_series = df[smiles_col].dropna().astype(str)
            scaffold_counts: Dict[str, int] = {}
            invalid = 0
            for smi in smiles_series:
                try:
                    mol = Chem.MolFromSmiles(smi)
                    if mol:
                        scaffold = MurckoScaffold.MurckoScaffoldSmiles(mol=mol, includeChirality=False)
                        scaffold_counts[scaffold] = scaffold_counts.get(scaffold, 0) + 1
                    else:
                        invalid += 1
                except Exception:
                    invalid += 1

            total = len(smiles_series)
            sorted_scaffolds = sorted(scaffold_counts.items(), key=lambda x: -x[1])
            result["mode"] = "rdkit_murcko"
            result["total_compounds"] = total
            result["unique_scaffolds"] = len(scaffold_counts)
            result["invalid_smiles"] = invalid
            result["scaffold_diversity"] = round(len(scaffold_counts) / max(total, 1) * 100, 1)
            result["scaffolds"] = [
                {"scaffold": sc, "count": cnt, "pct": round(cnt / total * 100, 1)}
                for sc, cnt in sorted_scaffolds[:top_n]
            ]
        except ImportError:
            # RDKit not available — fall back to MW-based grouping
            result["mode"] = "mw_bins"
            result["note"] = "RDKit not installed — showing MW-based compound grouping instead"

    if result["mode"] in ("none", "mw_bins"):
        # MW-based pseudo-scaffold
        mw_col = next((c for c in df.columns if c.lower() in ["mw", "mol_weight", "molecular_weight", "mw_g_mol"]), None)
        if not mw_col:
            num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if num_cols:
                mw_col = num_cols[0]

        if mw_col:
            mw = pd.to_numeric(df[mw_col], errors="coerce").dropna()
            bins = [0, 200, 300, 400, 500, 600, 800, 1200, float("inf")]
            labels = ["<200", "200-300", "300-400", "400-500", "500-600", "600-800", "800-1200", ">1200"]
            binned = pd.cut(mw, bins=bins, labels=labels)
            vc = binned.value_counts().sort_index()
            result["smiles_col"] = smiles_col
            result["total_compounds"] = len(mw)
            result["scaffolds"] = [
                {"scaffold": f"MW {lbl} Da", "count": int(cnt), "pct": round(cnt / len(mw) * 100, 1)}
                for lbl, cnt in vc.items() if cnt > 0
            ]
        else:
            raise HTTPException(400, "No SMILES or MW column found for scaffold analysis")

    return result


# ─── Activity Cliffs ─────────────────────────────────────────────────────────

@router.get("/{client_id}/activity-cliffs")
async def activity_cliffs(
    client_id: str,
    smiles_col: Optional[str] = None,
    activity_col: Optional[str] = None,
    threshold: float = 2.0,
    top_n: int = 30,
):
    """
    Activity cliff detection.
    A cliff pair = high structural similarity + large activity difference.
    Uses Tanimoto on Morgan fingerprints if RDKit available, else descriptor-distance fallback.
    """
    s = _get_session(client_id)
    df = s["df"]

    if not smiles_col:
        smiles_col = next((c for c in df.columns if "smiles" in c.lower()), None)
    if not activity_col:
        activity_col = next((c for c in df.columns if any(k in c.lower() for k in ["lc50", "ec50", "ic50", "activity", "value", "target", "plc", "pec"])), None)
        if not activity_col:
            num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            activity_col = num_cols[-1] if num_cols else None

    if not activity_col or activity_col not in df.columns:
        raise HTTPException(400, "No activity column detected. Specify activity_col parameter.")

    activity = pd.to_numeric(df[activity_col], errors="coerce")
    valid_mask = activity.notna()
    df_valid = df[valid_mask].copy()
    activity_valid = activity[valid_mask].values
    n = len(df_valid)

    if n < 2:
        raise HTTPException(400, "Not enough compounds for cliff analysis")

    cliffs = []
    mode = "descriptor_distance"

    if smiles_col and smiles_col in df.columns:
        try:
            from rdkit import Chem
            from rdkit.Chem import AllChem, DataStructs

            smiles_list = df_valid[smiles_col].fillna("").astype(str).tolist()
            fps = []
            valid_idx = []
            for i, smi in enumerate(smiles_list):
                mol = Chem.MolFromSmiles(smi)
                if mol:
                    fps.append(AllChem.GetMorganFingerprintAsBitVect(mol, 2, 2048))
                    valid_idx.append(i)

            act_sub = activity_valid[valid_idx]
            mode = "tanimoto_morgan"

            for i in range(len(fps)):
                for j in range(i + 1, min(len(fps), i + 50)):  # limit for perf
                    sim = DataStructs.TanimotoSimilarity(fps[i], fps[j])
                    act_diff = abs(float(act_sub[i]) - float(act_sub[j]))
                    if sim >= 0.7 and act_diff >= threshold:
                        cliffs.append({
                            "compound_i": int(valid_idx[i]),
                            "compound_j": int(valid_idx[j]),
                            "similarity": round(sim, 3),
                            "activity_i": _safe(float(act_sub[i])),
                            "activity_j": _safe(float(act_sub[j])),
                            "activity_diff": round(act_diff, 3),
                            "cliff_score": round(sim * act_diff, 3),
                        })
        except ImportError:
            pass

    if mode == "descriptor_distance":
        # Descriptor-based distance fallback
        num_cols = df_valid.select_dtypes(include=[np.number]).columns.tolist()
        desc_cols = [c for c in num_cols if c != activity_col][:20]
        if desc_cols:
            X = df_valid[desc_cols].apply(pd.to_numeric, errors="coerce").fillna(0).values
            # Normalise
            std = X.std(axis=0)
            std[std == 0] = 1
            X_n = (X - X.mean(axis=0)) / std

            n_sample = min(n, 200)
            idx_sample = list(range(n_sample))
            for i in idx_sample:
                for j in range(i + 1, min(n_sample, i + 30)):
                    dist = float(np.linalg.norm(X_n[i] - X_n[j]))
                    sim = 1 / (1 + dist)
                    act_diff = abs(float(activity_valid[i]) - float(activity_valid[j]))
                    if sim >= 0.6 and act_diff >= threshold:
                        cliffs.append({
                            "compound_i": i, "compound_j": j,
                            "similarity": round(sim, 3),
                            "activity_i": _safe(float(activity_valid[i])),
                            "activity_j": _safe(float(activity_valid[j])),
                            "activity_diff": round(act_diff, 3),
                            "cliff_score": round(sim * act_diff, 3),
                        })

    cliffs.sort(key=lambda x: -x["cliff_score"])
    return {
        "mode": mode,
        "activity_col": activity_col,
        "smiles_col": smiles_col,
        "threshold": threshold,
        "n_compounds": n,
        "n_cliffs": len(cliffs),
        "cliffs": cliffs[:top_n],
    }


# ─── Chemical Diversity ───────────────────────────────────────────────────────

@router.get("/{client_id}/diversity")
async def chemical_diversity(client_id: str):
    """MW, logP, TPSA distribution stats + diversity index."""
    s = _get_session(client_id)
    df = s["df"]
    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()

    properties = {}
    prop_names = {
        "MW":   ["mw", "mol_weight", "molecular_weight", "mw_g_mol", "exactmw"],
        "logP": ["logp", "alogp", "crippen_logp", "xlogp", "wlogp"],
        "TPSA": ["tpsa", "topological_polar_surface_area"],
        "HBD":  ["hbd", "h_bond_donors", "num_hbd"],
        "HBA":  ["hba", "h_bond_acceptors", "num_hba"],
        "RotBonds": ["rotatable_bonds", "rotbonds", "num_rotatable"],
    }

    for prop, aliases in prop_names.items():
        col = next((c for c in df.columns if c.lower() in aliases), None)
        if not col:
            col = next((c for c in num_cols if any(a in c.lower() for a in aliases)), None)
        if col:
            vals = pd.to_numeric(df[col], errors="coerce").dropna()
            if len(vals) > 0:
                properties[prop] = {
                    "col": col,
                    "mean": _safe(float(vals.mean())),
                    "std":  _safe(float(vals.std())),
                    "min":  _safe(float(vals.min())),
                    "max":  _safe(float(vals.max())),
                    "p25":  _safe(float(vals.quantile(0.25))),
                    "p75":  _safe(float(vals.quantile(0.75))),
                    "count": len(vals),
                    "histogram": {
                        "values": [_safe(float(v)) for v in vals.sample(min(len(vals), 300), random_state=42).tolist()],
                    }
                }

    # Lipinski drug-likeness check (if MW + logP available)
    lipinski = None
    if "MW" in properties and "logP" in properties:
        mw_col = properties["MW"]["col"]
        lp_col = properties["logP"]["col"]
        mw = pd.to_numeric(df[mw_col], errors="coerce")
        lp = pd.to_numeric(df[lp_col], errors="coerce")
        ro5_pass = ((mw <= 500) & (lp <= 5)).sum()
        lipinski = {
            "ro5_pass": int(ro5_pass),
            "ro5_fail": int(len(df) - ro5_pass),
            "ro5_pct": round(ro5_pass / max(len(df), 1) * 100, 1),
        }

    return {
        "n": len(df),
        "properties": properties,
        "lipinski": lipinski,
        "properties_found": list(properties.keys()),
    }


# ─── Read-Across ──────────────────────────────────────────────────────────────

@router.get("/{client_id}/read-across")
async def read_across(
    client_id: str,
    query_idx: int = 0,
    k: int = 10,
    activity_col: Optional[str] = None,
):
    """
    Find k nearest neighbours for compound at query_idx.
    Uses Euclidean distance on numeric descriptors (normalised).
    """
    s = _get_session(client_id)
    df = s["df"]
    n = len(df)
    if query_idx >= n:
        raise HTTPException(400, f"query_idx {query_idx} out of range (0–{n-1})")

    if not activity_col:
        activity_col = next((c for c in df.columns if any(kw in c.lower() for kw in ["lc50", "ec50", "ic50", "activity", "value", "target"])), None)

    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    feat_cols = [c for c in num_cols if c != activity_col][:50]
    if not feat_cols:
        raise HTTPException(400, "No descriptor columns found for read-across")

    X = df[feat_cols].apply(pd.to_numeric, errors="coerce").fillna(0).values
    std = X.std(axis=0)
    std[std == 0] = 1
    Xn = (X - X.mean(axis=0)) / std

    query = Xn[query_idx]
    dists = np.linalg.norm(Xn - query, axis=1)
    dists[query_idx] = np.inf  # exclude self

    top_k = np.argsort(dists)[:k]
    neighbours = []
    for idx in top_k:
        row = {"rank": len(neighbours) + 1, "compound_idx": int(idx), "distance": round(float(dists[idx]), 4)}
        if activity_col and activity_col in df.columns:
            row["activity"] = _safe(pd.to_numeric(df[activity_col].iloc[idx], errors="coerce"))
        smiles_col = next((c for c in df.columns if "smiles" in c.lower()), None)
        if smiles_col:
            row["smiles"] = str(df[smiles_col].iloc[idx]) if pd.notna(df[smiles_col].iloc[idx]) else None
        neighbours.append(row)

    query_info: Dict = {"compound_idx": query_idx}
    if activity_col and activity_col in df.columns:
        query_info["activity"] = _safe(pd.to_numeric(df[activity_col].iloc[query_idx], errors="coerce"))
    smiles_col = next((c for c in df.columns if "smiles" in c.lower()), None)
    if smiles_col:
        query_info["smiles"] = str(df[smiles_col].iloc[query_idx]) if pd.notna(df[smiles_col].iloc[query_idx]) else None

    # Predict by weighted average of neighbours
    if activity_col and all("activity" in nb for nb in neighbours):
        acts = [nb.get("activity") for nb in neighbours if nb.get("activity") is not None]
        if acts:
            query_info["predicted_activity"] = round(float(np.mean(acts)), 4)
            query_info["neighbour_activity_std"] = round(float(np.std(acts)), 4)

    return {
        "query": query_info,
        "neighbours": neighbours,
        "k": k,
        "activity_col": activity_col,
        "n_features_used": len(feat_cols),
    }


# ─── Export ───────────────────────────────────────────────────────────────────

@router.get("/{client_id}/export")
async def export_dataset(client_id: str, format: str = "csv"):
    s = _get_session(client_id)
    df = s["df"]
    fname = s["filename"].rsplit(".", 1)[0]
    if format == "csv":
        return Response(df.to_csv(index=False).encode(), media_type="text/csv",
                        headers={"Content-Disposition": f"attachment; filename={fname}_intelligence.csv"})
    buf = io.BytesIO()
    df.to_parquet(buf, index=False)
    return Response(buf.getvalue(), media_type="application/octet-stream",
                    headers={"Content-Disposition": f"attachment; filename={fname}_intelligence.parquet"})
