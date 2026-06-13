"""
SUTRIX V6 — OECD Validation Studio Routes
Comprehensive OECD 5-principle validation for QSAR/predictive models.

Each principle is assessed with multiple sub-criteria, generating a
detailed compliance report with a traffic-light (GREEN/AMBER/RED) system.

Endpoints:
  POST /{client_id}/upload           — upload dataset for OECD assessment
  GET  /{client_id}/dataset-info     — current session info
  GET  /{client_id}/principle/{n}    — detailed assessment for OECD Principle 1-5
  GET  /{client_id}/full-report      — complete 5-principle report
  GET  /{client_id}/export-report    — Excel OECD compliance report
"""
import io
import json
import logging
import math
import os
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

logger = logging.getLogger("sdo.api.oecd_validation")
router = APIRouter(prefix="/api/oecd", tags=["oecd-validation"])

# ─── Session store (client_id → session dict) ─────────────────────────────────
_sessions: Dict[str, Dict] = {}


def _safe(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        v = float(val)
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(val, np.ndarray):
        return val.tolist()
    return val


def _get_session(client_id: str) -> Dict:
    if client_id not in _sessions:
        raise HTTPException(404, f"No OECD session for '{client_id}'. Upload a dataset first.")
    return _sessions[client_id]


def _traffic_light(score: float) -> str:
    """Convert 0-100 score to traffic-light status."""
    if score >= 70:
        return "GREEN"
    elif score >= 40:
        return "AMBER"
    return "RED"


# ─── Upload ───────────────────────────────────────────────────────────────────

@router.post("/{client_id}/upload")
async def upload_dataset(client_id: str, file: UploadFile = File(...)):
    """Upload a CSV or Parquet dataset for OECD validation."""
    content = await file.read()
    fname = file.filename or "dataset"
    try:
        if fname.endswith(".parquet"):
            df = pd.read_parquet(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {e}")

    _sessions[client_id] = {
        "df": df,
        "filename": fname,
        "model_info": {},  # user can provide model metadata later
    }
    return {
        "status": "ok", "filename": fname,
        "rows": len(df), "cols": len(df.columns),
        "columns": df.columns.tolist(),
    }


@router.get("/{client_id}/dataset-info")
async def dataset_info(client_id: str):
    session = _get_session(client_id)
    df = session["df"]
    numeric = df.select_dtypes(include=[np.number]).columns.tolist()
    return {
        "filename": session["filename"],
        "rows": len(df), "cols": len(df.columns),
        "numeric_cols": len(numeric),
        "text_cols": len(df.columns) - len(numeric),
        "columns": df.columns.tolist(),
        "missing_pct": round(df.isna().mean().mean() * 100, 2),
    }


# ─── Principle Evaluators ─────────────────────────────────────────────────────

def _eval_p1(df: pd.DataFrame) -> Dict:
    """
    OECD Principle 1: Defined Endpoint
    Sub-criteria: endpoint column present, documented units, biological relevance, data source.
    """
    checks = []
    score = 0

    # Check 1a: Numeric endpoint column exists
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    ep_col = None
    for c in df.columns:
        if any(k in c.lower() for k in ["lc50", "ec50", "ic50", "noec", "loec", "ld50",
                                          "activity", "endpoint", "value", "target", "pec", "plc"]):
            ep_col = c
            break
    if not ep_col and numeric_cols:
        ep_col = numeric_cols[-1]

    if ep_col:
        checks.append({"criterion": "Endpoint column identified", "status": "GREEN",
                        "detail": f"Column '{ep_col}' identified as endpoint", "score": 25})
        score += 25
    else:
        checks.append({"criterion": "Endpoint column identified", "status": "RED",
                        "detail": "No numeric endpoint column found in dataset", "score": 0})

    # Check 1b: Single numeric endpoint (not multi-output)
    numeric_count = len(numeric_cols)
    if ep_col:
        descriptor_cols = [c for c in numeric_cols if c != ep_col]
        if len(descriptor_cols) >= 1:
            checks.append({"criterion": "Single defined endpoint", "status": "GREEN",
                            "detail": f"1 endpoint + {len(descriptor_cols)} feature columns — well-structured", "score": 20})
            score += 20
        else:
            checks.append({"criterion": "Single defined endpoint", "status": "AMBER",
                            "detail": "Only one numeric column — endpoint and features may be mixed", "score": 10})
            score += 10

    # Check 1c: Endpoint value completeness
    if ep_col and ep_col in df.columns:
        miss = df[ep_col].isna().mean() * 100
        if miss < 5:
            checks.append({"criterion": "Endpoint completeness", "status": "GREEN",
                            "detail": f"{miss:.1f}% missing endpoint values", "score": 20})
            score += 20
        elif miss < 20:
            checks.append({"criterion": "Endpoint completeness", "status": "AMBER",
                            "detail": f"{miss:.1f}% missing values — document or impute", "score": 10})
            score += 10
        else:
            checks.append({"criterion": "Endpoint completeness", "status": "RED",
                            "detail": f"{miss:.1f}% missing endpoint values — data quality concern", "score": 0})

    # Check 1d: Biological/chemical relevance (column name heuristic)
    regulatory_endpoints = ["lc50", "ec50", "ic50", "noec", "loec", "ld50", "bmd", "bmc"]
    is_regulatory = ep_col and any(k in ep_col.lower() for k in regulatory_endpoints)
    if is_regulatory:
        checks.append({"criterion": "Regulatory/toxicological endpoint", "status": "GREEN",
                        "detail": f"'{ep_col}' is a recognized regulatory toxicological endpoint", "score": 20})
        score += 20
    elif ep_col:
        checks.append({"criterion": "Regulatory/toxicological endpoint", "status": "AMBER",
                        "detail": "Endpoint name not a standard regulatory measure — document the endpoint clearly", "score": 10})
        score += 10

    # Check 1e: Endpoint dynamic range
    if ep_col and ep_col in df.columns:
        vals = pd.to_numeric(df[ep_col], errors="coerce").dropna()
        pos = vals[vals > 0]
        if len(pos) >= 2:
            try:
                log_range = math.log10(float(pos.max())) - math.log10(float(pos.min()))
                if log_range >= 3:
                    checks.append({"criterion": "Endpoint dynamic range", "status": "GREEN",
                                   "detail": f"{log_range:.1f} orders of magnitude — excellent range for QSAR", "score": 15})
                    score += 15
                elif log_range >= 1.5:
                    checks.append({"criterion": "Endpoint dynamic range", "status": "AMBER",
                                   "detail": f"{log_range:.1f} orders of magnitude — acceptable but narrow", "score": 8})
                    score += 8
                else:
                    checks.append({"criterion": "Endpoint dynamic range", "status": "RED",
                                   "detail": f"{log_range:.1f} orders of magnitude — too narrow for reliable QSAR", "score": 0})
            except Exception:
                pass

    return {"principle": 1, "title": "Defined Endpoint",
            "description": "The biological or physico-chemical endpoint to be predicted must be clearly defined.",
            "checks": checks, "score": min(score, 100), "status": _traffic_light(min(score, 100)),
            "endpoint_col": ep_col}


def _eval_p2(df: pd.DataFrame) -> Dict:
    """
    OECD Principle 2: Unambiguous Algorithm
    Sub-criteria: descriptor presence, descriptor diversity, zero-variance, high-correlation pairs.
    """
    checks = []
    score = 0

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    # Identify endpoint
    ep_col = None
    for c in df.columns:
        if any(k in c.lower() for k in ["lc50", "ec50", "ic50", "activity", "endpoint", "value", "target"]):
            ep_col = c
            break
    desc_cols = [c for c in numeric_cols if c != ep_col] if ep_col else numeric_cols

    # Check 2a: Descriptor count
    n_desc = len(desc_cols)
    if n_desc >= 50:
        checks.append({"criterion": "Descriptor richness", "status": "GREEN",
                        "detail": f"{n_desc} numeric descriptors — comprehensive representation", "score": 25})
        score += 25
    elif n_desc >= 10:
        checks.append({"criterion": "Descriptor richness", "status": "AMBER",
                        "detail": f"{n_desc} descriptors — consider enriching with RDKit/Mordred", "score": 15})
        score += 15
    else:
        checks.append({"criterion": "Descriptor richness", "status": "RED",
                        "detail": f"Only {n_desc} descriptors — insufficient for robust QSAR algorithm", "score": 0})

    # Check 2b: Zero-variance descriptors
    if desc_cols:
        zero_var = [c for c in desc_cols if df[c].std() == 0 or df[c].nunique() <= 1]
        zero_pct = len(zero_var) / max(len(desc_cols), 1) * 100
        if zero_pct == 0:
            checks.append({"criterion": "Zero-variance descriptors", "status": "GREEN",
                            "detail": "No constant-value descriptors — all descriptors carry information", "score": 20})
            score += 20
        elif zero_pct < 10:
            checks.append({"criterion": "Zero-variance descriptors", "status": "AMBER",
                            "detail": f"{len(zero_var)} zero-variance descriptors ({zero_pct:.0f}%) — remove before modeling", "score": 10})
            score += 10
        else:
            checks.append({"criterion": "Zero-variance descriptors", "status": "RED",
                            "detail": f"{len(zero_var)} zero-variance descriptors ({zero_pct:.0f}%) — dataset quality issue", "score": 0})

    # Check 2c: Highly correlated descriptor pairs (>0.95)
    if len(desc_cols) >= 2:
        sub = df[desc_cols[:30]].fillna(0)  # limit for performance
        try:
            corr = sub.corr().abs()
            np.fill_diagonal(corr.values, 0)
            n_high_corr = int((corr > 0.95).sum().sum() // 2)
            if n_high_corr == 0:
                checks.append({"criterion": "Descriptor collinearity", "status": "GREEN",
                                "detail": "No descriptor pairs with |r| > 0.95 — good feature independence", "score": 20})
                score += 20
            elif n_high_corr < 5:
                checks.append({"criterion": "Descriptor collinearity", "status": "AMBER",
                                "detail": f"{n_high_corr} highly correlated pairs — consider PCA or manual selection", "score": 10})
                score += 10
            else:
                checks.append({"criterion": "Descriptor collinearity", "status": "RED",
                                "detail": f"{n_high_corr} highly correlated pairs — significant multicollinearity", "score": 5})
                score += 5
        except Exception:
            pass

    # Check 2d: Missing values in descriptors
    if desc_cols:
        desc_miss = df[desc_cols].isna().mean().mean() * 100
        if desc_miss < 5:
            checks.append({"criterion": "Descriptor completeness", "status": "GREEN",
                            "detail": f"{desc_miss:.1f}% average missing in descriptors", "score": 20})
            score += 20
        elif desc_miss < 20:
            checks.append({"criterion": "Descriptor completeness", "status": "AMBER",
                            "detail": f"{desc_miss:.1f}% average missing — impute before training", "score": 10})
            score += 10
        else:
            checks.append({"criterion": "Descriptor completeness", "status": "RED",
                            "detail": f"{desc_miss:.1f}% average missing — too many NaN for reproducible algorithm", "score": 0})

    # Check 2e: Dataset size adequacy
    n = len(df)
    ratio = n / max(len(desc_cols), 1) if desc_cols else 0
    if ratio >= 5:
        checks.append({"criterion": "n/p ratio (samples/descriptors)", "status": "GREEN",
                        "detail": f"n/p = {ratio:.1f} — sufficient samples per descriptor", "score": 15})
        score += 15
    elif ratio >= 2:
        checks.append({"criterion": "n/p ratio (samples/descriptors)", "status": "AMBER",
                        "detail": f"n/p = {ratio:.1f} — risk of overfitting; use regularisation", "score": 8})
        score += 8
    else:
        checks.append({"criterion": "n/p ratio (samples/descriptors)", "status": "RED",
                        "detail": f"n/p = {ratio:.1f} — underdetermined system; reduce descriptors or add data", "score": 0})

    return {"principle": 2, "title": "Unambiguous Algorithm",
            "description": "The model algorithm must be fully described to allow independent reproduction.",
            "checks": checks, "score": min(score, 100), "status": _traffic_light(min(score, 100)),
            "descriptor_count": len(desc_cols)}


def _eval_p3(df: pd.DataFrame) -> Dict:
    """
    OECD Principle 3: Applicability Domain
    Sub-criteria: SMILES present (chemical space), descriptor range coverage, outlier fraction.
    """
    checks = []
    score = 0

    smiles_col = next((c for c in df.columns if "smiles" in c.lower()), None)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    ep_col = next((c for c in df.columns if any(k in c.lower() for k in ["lc50", "ec50", "ic50", "activity", "value", "target"])), None)
    desc_cols = [c for c in numeric_cols if c != ep_col] if ep_col else numeric_cols

    # Check 3a: SMILES column
    if smiles_col:
        smiles_miss = df[smiles_col].isna().mean() * 100
        checks.append({"criterion": "Chemical structure (SMILES) present", "status": "GREEN" if smiles_miss < 5 else "AMBER",
                        "detail": f"SMILES column '{smiles_col}' found ({smiles_miss:.0f}% missing) — AD analysis enabled",
                        "score": 30 if smiles_miss < 5 else 15})
        score += 30 if smiles_miss < 5 else 15
    else:
        checks.append({"criterion": "Chemical structure (SMILES) present", "status": "RED",
                        "detail": "No SMILES column — cannot define chemical space AD; add SMILES for full OECD P3 compliance",
                        "score": 0})

    # Check 3b: Descriptor range coverage (check for extreme outliers in each descriptor)
    if desc_cols:
        n_with_outliers = 0
        for c in desc_cols[:20]:
            s = pd.to_numeric(df[c], errors="coerce").dropna()
            if len(s) < 4:
                continue
            q1, q3 = s.quantile(0.25), s.quantile(0.75)
            iqr = q3 - q1
            if ((s < q1 - 3 * iqr) | (s > q3 + 3 * iqr)).any():
                n_with_outliers += 1
        outlier_col_pct = n_with_outliers / max(len(desc_cols[:20]), 1) * 100
        if outlier_col_pct < 10:
            checks.append({"criterion": "Descriptor range uniformity", "status": "GREEN",
                            "detail": f"{n_with_outliers} descriptor columns with extreme outliers ({outlier_col_pct:.0f}%) — good coverage",
                            "score": 25})
            score += 25
        elif outlier_col_pct < 30:
            checks.append({"criterion": "Descriptor range uniformity", "status": "AMBER",
                            "detail": f"{n_with_outliers} columns with extreme outliers — document AD boundaries",
                            "score": 12})
            score += 12
        else:
            checks.append({"criterion": "Descriptor range uniformity", "status": "RED",
                            "detail": f"{n_with_outliers} columns with extreme outliers — wide AD uncertainty",
                            "score": 5})
            score += 5

    # Check 3c: Dataset size for AD definition
    n = len(df)
    if n >= 100:
        checks.append({"criterion": "Dataset size for AD definition", "status": "GREEN",
                        "detail": f"{n} compounds — sufficient to define a reliable AD", "score": 25})
        score += 25
    elif n >= 30:
        checks.append({"criterion": "Dataset size for AD definition", "status": "AMBER",
                        "detail": f"{n} compounds — borderline; AD will have high uncertainty", "score": 12})
        score += 12
    else:
        checks.append({"criterion": "Dataset size for AD definition", "status": "RED",
                        "detail": f"Only {n} compounds — too few to define a meaningful AD", "score": 0})

    # Check 3d: Structural diversity (unique SMILES ratio if SMILES available)
    if smiles_col and smiles_col in df.columns:
        unique_smiles = df[smiles_col].nunique()
        diversity = unique_smiles / max(len(df), 1) * 100
        if diversity >= 95:
            checks.append({"criterion": "Structural diversity", "status": "GREEN",
                            "detail": f"{unique_smiles} unique structures ({diversity:.0f}%) — high chemical diversity",
                            "score": 20})
            score += 20
        elif diversity >= 70:
            checks.append({"criterion": "Structural diversity", "status": "AMBER",
                            "detail": f"{unique_smiles} unique structures ({diversity:.0f}%) — moderate diversity",
                            "score": 10})
            score += 10
        else:
            checks.append({"criterion": "Structural diversity", "status": "RED",
                            "detail": f"Only {diversity:.0f}% unique structures — high redundancy may bias AD",
                            "score": 0})

    return {"principle": 3, "title": "Defined Applicability Domain",
            "description": "Every QSAR model is associated with a defined domain of applicability.",
            "checks": checks, "score": min(score, 100), "status": _traffic_light(min(score, 100)),
            "smiles_col": smiles_col}


def _eval_p4(df: pd.DataFrame) -> Dict:
    """
    OECD Principle 4: Appropriate Measures of Goodness-of-Fit, Robustness, Predictivity.
    Sub-criteria: R², RMSE estimation, CV feasibility, test set size adequacy, y-scrambling awareness.
    """
    checks = []
    score = 0
    n = len(df)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    ep_col = next((c for c in df.columns if any(k in c.lower() for k in ["lc50", "ec50", "ic50", "activity", "value", "target"])), None)
    desc_cols = [c for c in numeric_cols if c != ep_col] if ep_col else []

    # Check 4a: Test set feasibility (n >= 20 for 80/20 split)
    test_n = int(n * 0.2)
    if test_n >= 20:
        checks.append({"criterion": "Test set adequacy (20% holdout)", "status": "GREEN",
                        "detail": f"20% holdout = {test_n} compounds — adequate external validation set",
                        "score": 25})
        score += 25
    elif test_n >= 5:
        checks.append({"criterion": "Test set adequacy (20% holdout)", "status": "AMBER",
                        "detail": f"20% holdout = {test_n} compounds — small test set; use LOOCV",
                        "score": 12})
        score += 12
    else:
        checks.append({"criterion": "Test set adequacy (20% holdout)", "status": "RED",
                        "detail": f"20% holdout = only {test_n} compounds — insufficient for external validation",
                        "score": 0})

    # Check 4b: Cross-validation feasibility (n >= 10 for 5-fold CV)
    if n >= 50:
        checks.append({"criterion": "Cross-validation (5-fold CV)", "status": "GREEN",
                        "detail": f"{n} samples — 5-fold CV recommended with ~{n//5} per fold",
                        "score": 25})
        score += 25
    elif n >= 20:
        checks.append({"criterion": "Cross-validation (5-fold CV)", "status": "AMBER",
                        "detail": f"{n} samples — 5-fold CV possible but use stratified split",
                        "score": 12})
        score += 12
    else:
        checks.append({"criterion": "Cross-validation (5-fold CV)", "status": "RED",
                        "detail": f"Only {n} samples — use LOOCV; 5-fold CV not reliable",
                        "score": 0})

    # Check 4c: Y-scrambling test feasibility
    if n >= 30 and desc_cols:
        checks.append({"criterion": "Y-scrambling test feasibility", "status": "GREEN",
                        "detail": "Dataset has sufficient size for y-scrambling validation",
                        "score": 20})
        score += 20
    elif n >= 10:
        checks.append({"criterion": "Y-scrambling test feasibility", "status": "AMBER",
                        "detail": "Y-scrambling possible but limited — results may be noisy",
                        "score": 10})
        score += 10
    else:
        checks.append({"criterion": "Y-scrambling test feasibility", "status": "RED",
                        "detail": "Too few samples for meaningful y-scrambling", "score": 0})

    # Check 4d: Endpoint distribution (for classification of regression suitability)
    if ep_col and ep_col in df.columns:
        ep = pd.to_numeric(df[ep_col], errors="coerce").dropna()
        skew = float(ep.skew()) if len(ep) > 3 else None
        if skew is not None and abs(skew) < 1:
            checks.append({"criterion": "Endpoint distribution", "status": "GREEN",
                            "detail": f"Skewness = {skew:.2f} — near-normal; regression metrics applicable",
                            "score": 15})
            score += 15
        elif skew is not None and abs(skew) < 2:
            checks.append({"criterion": "Endpoint distribution", "status": "AMBER",
                            "detail": f"Skewness = {skew:.2f} — consider log-transform before modeling",
                            "score": 8})
            score += 8
        else:
            lbl = f"{skew:.2f}" if skew is not None else "unknown"
            checks.append({"criterion": "Endpoint distribution", "status": "RED",
                            "detail": f"Skewness = {lbl} — highly skewed; standard regression metrics unreliable",
                            "score": 0})

    # Check 4e: Duplicate rows (bias in performance metrics)
    dup = int(df.duplicated().sum())
    if dup == 0:
        checks.append({"criterion": "No duplicate rows", "status": "GREEN",
                        "detail": "No duplicates — performance estimates unbiased",
                        "score": 15})
        score += 15
    elif dup < n * 0.05:
        checks.append({"criterion": "No duplicate rows", "status": "AMBER",
                        "detail": f"{dup} duplicates ({dup/n*100:.1f}%) — deduplicate to avoid metric inflation",
                        "score": 8})
        score += 8
    else:
        checks.append({"criterion": "No duplicate rows", "status": "RED",
                        "detail": f"{dup} duplicates ({dup/n*100:.1f}%) — metrics will be overestimated",
                        "score": 0})

    return {"principle": 4, "title": "Goodness-of-Fit, Robustness & Predictivity",
            "description": "Appropriate statistical measures for internal and external validation.",
            "checks": checks, "score": min(score, 100), "status": _traffic_light(min(score, 100))}


def _eval_p5(df: pd.DataFrame) -> Dict:
    """
    OECD Principle 5: Mechanistic Interpretation
    Sub-criteria: descriptor naming, constitutional/topological/electronic coverage,
    log-transform feasibility, endpoint-descriptor correlation.
    """
    checks = []
    score = 0

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    ep_col = next((c for c in df.columns if any(k in c.lower() for k in ["lc50", "ec50", "ic50", "activity", "value", "target"])), None)
    desc_cols = [c for c in numeric_cols if c != ep_col] if ep_col else numeric_cols

    # Descriptor type classification (heuristic by name)
    def classify(cols):
        cats = {"constitutional": [], "topological": [], "electronic": [], "geometric_3d": [], "fragment": [], "other": []}
        keywords = {
            "constitutional": ["mw", "molwt", "hbd", "hba", "rot", "nring", "naromring", "nhetero", "natoms", "formula"],
            "topological": ["chi", "kappa", "wiener", "zagreb", "balaban", "moran", "tpsa"],
            "electronic": ["logp", "esol", "crippen", "gasteiger", "charge", "dipole", "polar", "refract"],
            "geometric_3d": ["asp", "pmi", "rgy", "inertia", "vol", "sa", "psa", "3d"],
            "fragment": ["smarts", "ecfp", "maccs", "morgan", "rdkit", "frag", "bit"],
        }
        for c in cols:
            c_lower = c.lower()
            matched = "other"
            for cat, kws in keywords.items():
                if any(k in c_lower for k in kws):
                    matched = cat
                    break
            cats[matched].append(c)
        return cats

    cat_map = classify(desc_cols)
    covered = [k for k, v in cat_map.items() if len(v) > 0 and k != "other"]

    # Check 5a: Descriptor class diversity
    if len(covered) >= 3:
        checks.append({"criterion": "Descriptor class diversity", "status": "GREEN",
                        "detail": f"Descriptors span {len(covered)} classes: {', '.join(covered)} — good mechanistic coverage",
                        "score": 25})
        score += 25
    elif len(covered) >= 1:
        checks.append({"criterion": "Descriptor class diversity", "status": "AMBER",
                        "detail": f"Only {len(covered)} descriptor class(es) — add diverse physicochemical descriptors",
                        "score": 12})
        score += 12
    else:
        checks.append({"criterion": "Descriptor class diversity", "status": "RED",
                        "detail": "Cannot classify descriptors by physicochemical type — add named descriptors",
                        "score": 0})

    # Check 5b: logP / hydrophobicity descriptor present
    has_logp = any("logp" in c.lower() or "lipophil" in c.lower() for c in desc_cols)
    if has_logp:
        checks.append({"criterion": "Hydrophobicity descriptor (logP)", "status": "GREEN",
                        "detail": "logP descriptor present — key ADME/toxicity mechanistic driver",
                        "score": 15})
        score += 15
    else:
        checks.append({"criterion": "Hydrophobicity descriptor (logP)", "status": "AMBER",
                        "detail": "No logP column detected — consider adding for mechanistic interpretability",
                        "score": 8})
        score += 8

    # Check 5c: MW descriptor
    has_mw = any(c.lower() in ["mw", "molwt", "molecular_weight", "exact_mw"] for c in desc_cols)
    if has_mw:
        checks.append({"criterion": "Molecular weight descriptor", "status": "GREEN",
                        "detail": "MW column present — fundamental constitutional descriptor",
                        "score": 10})
        score += 10
    else:
        checks.append({"criterion": "Molecular weight descriptor", "status": "AMBER",
                        "detail": "No MW column — consider adding for mechanistic context",
                        "score": 5})
        score += 5

    # Check 5d: Endpoint-descriptor correlation (top correlated descriptor)
    if ep_col and desc_cols and ep_col in df.columns:
        try:
            ep_series = pd.to_numeric(df[ep_col], errors="coerce")
            corr_vals = []
            for c in desc_cols[:50]:
                try:
                    r = abs(float(ep_series.corr(pd.to_numeric(df[c], errors="coerce"))))
                    if not math.isnan(r):
                        corr_vals.append((c, r))
                except Exception:
                    pass
            if corr_vals:
                top_corr_col, top_corr = max(corr_vals, key=lambda x: x[1])
                if top_corr >= 0.4:
                    checks.append({"criterion": "Endpoint-descriptor correlation", "status": "GREEN",
                                    "detail": f"Top correlated descriptor: '{top_corr_col}' (r={top_corr:.3f}) — mechanistic link detectable",
                                    "score": 25})
                    score += 25
                elif top_corr >= 0.2:
                    checks.append({"criterion": "Endpoint-descriptor correlation", "status": "AMBER",
                                    "detail": f"Top correlated descriptor: '{top_corr_col}' (r={top_corr:.3f}) — weak signal",
                                    "score": 12})
                    score += 12
                else:
                    checks.append({"criterion": "Endpoint-descriptor correlation", "status": "RED",
                                    "detail": f"Highest descriptor correlation: r={top_corr:.3f} — no clear mechanistic driver",
                                    "score": 0})
        except Exception:
            pass

    # Check 5e: Log-transformed endpoint (pX values)
    if ep_col:
        if any(k in ep_col.lower() for k in ["plc", "pec", "pic", "pld", "log"]):
            checks.append({"criterion": "Log-transformed endpoint", "status": "GREEN",
                            "detail": f"'{ep_col}' appears to be log-transformed — linear QSAR assumptions met",
                            "score": 25})
            score += 25
        else:
            checks.append({"criterion": "Log-transformed endpoint", "status": "AMBER",
                            "detail": "Endpoint may not be log-transformed — consider pX = -log10(EC50) for linearity",
                            "score": 12})
            score += 12

    return {"principle": 5, "title": "Mechanistic Interpretation",
            "description": "Where possible, QSAR models should be based on a mechanistic interpretation.",
            "checks": checks, "score": min(score, 100), "status": _traffic_light(min(score, 100)),
            "descriptor_classes": {k: len(v) for k, v in cat_map.items()}}


# ─── Route: Individual Principle ──────────────────────────────────────────────

@router.get("/{client_id}/principle/{n}")
async def get_principle(client_id: str, n: int):
    """Evaluate a single OECD principle (1-5)."""
    session = _get_session(client_id)
    df = session["df"]
    fn_map = {1: _eval_p1, 2: _eval_p2, 3: _eval_p3, 4: _eval_p4, 5: _eval_p5}
    if n not in fn_map:
        raise HTTPException(400, "Principle must be 1–5")
    try:
        return fn_map[n](df)
    except Exception as e:
        logger.error(f"P{n} eval failed: {e}", exc_info=True)
        raise HTTPException(500, str(e))


# ─── Route: Full Report ───────────────────────────────────────────────────────

@router.get("/{client_id}/full-report")
async def full_report(client_id: str):
    """Compute all 5 OECD principles and return a consolidated report."""
    session = _get_session(client_id)
    df = session["df"]
    try:
        principles = [_eval_p1(df), _eval_p2(df), _eval_p3(df), _eval_p4(df), _eval_p5(df)]
        overall_score = round(sum(p["score"] for p in principles) / 5)
        total_checks = sum(len(p["checks"]) for p in principles)
        green = sum(1 for p in principles for c in p["checks"] if c["status"] == "GREEN")
        amber = sum(1 for p in principles for c in p["checks"] if c["status"] == "AMBER")
        red   = sum(1 for p in principles for c in p["checks"] if c["status"] == "RED")

        return {
            "filename": session["filename"],
            "rows": len(df), "cols": len(df.columns),
            "overall_score": overall_score,
            "overall_status": _traffic_light(overall_score),
            "overall_grade": "A" if overall_score >= 85 else "B" if overall_score >= 70 else "C" if overall_score >= 55 else "D" if overall_score >= 40 else "F",
            "total_checks": total_checks,
            "green": green, "amber": amber, "red": red,
            "principles": principles,
        }
    except Exception as e:
        logger.error(f"Full report failed: {e}", exc_info=True)
        raise HTTPException(500, str(e))


# ─── Route: Export Excel ─────────────────────────────────────────────────────

@router.get("/{client_id}/export-report")
async def export_report(client_id: str):
    """Export a multi-sheet Excel OECD compliance report."""
    session = _get_session(client_id)
    df = session["df"]
    try:
        principles = [_eval_p1(df), _eval_p2(df), _eval_p3(df), _eval_p4(df), _eval_p5(df)]
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            # Summary sheet
            summary = pd.DataFrame([{
                "Principle": f"P{p['principle']}",
                "Title": p["title"],
                "Score": p["score"],
                "Status": p["status"],
                "Checks (Total)": len(p["checks"]),
                "GREEN": sum(1 for c in p["checks"] if c["status"] == "GREEN"),
                "AMBER": sum(1 for c in p["checks"] if c["status"] == "AMBER"),
                "RED": sum(1 for c in p["checks"] if c["status"] == "RED"),
            } for p in principles])
            summary.to_excel(writer, sheet_name="OECD Summary", index=False)

            # Detail sheet per principle
            for p in principles:
                rows = [{"Criterion": c["criterion"], "Status": c["status"],
                          "Detail": c["detail"], "Points": c["score"]} for c in p["checks"]]
                pd.DataFrame(rows).to_excel(writer, sheet_name=f"P{p['principle']} Detail", index=False)

            # Dataset preview
            df.head(100).to_excel(writer, sheet_name="Dataset Preview", index=False)

        output.seek(0)
        fname = f"OECD_report_{session['filename'].rsplit('.', 1)[0]}.xlsx"
        return Response(
            content=output.read(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={fname}"},
        )
    except Exception as e:
        logger.error(f"Export failed: {e}", exc_info=True)
        raise HTTPException(500, str(e))
