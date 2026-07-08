"""
SUTRIX V6 — QSAR Studio Routes
Independent QSAR/AI Dataset Engineering Studio.
Accepts: CSV upload, ZIP (hierarchical subgroups), or carry-over from any other studio.

Endpoints:
  POST /{client_id}/upload-csv       — upload a flat CSV
  POST /{client_id}/upload-zip       — upload a ZIP with subgroups (auto-detects manifest)
  GET  /{client_id}/dataset-info     — shape, columns, subgroup list
  GET  /{client_id}/readiness        — OECD/QSAR readiness assessment
  POST /{client_id}/benchmark        — run ML benchmark (RF, SVM, GBM, kNN, PLS)
  GET  /{client_id}/benchmark/status — poll benchmark job
  GET  /{client_id}/applicability-domain — Williams plot data + leverage matrix
  GET  /{client_id}/export           — export QSAR-ready dataset (CSV/parquet/ZIP)
"""
import io
import json
import logging
import math
import os
import shutil
import tempfile
import uuid
import zipfile
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from backend.core.workspace_registry import registry

logger = logging.getLogger("sdo.api.qsar_studio")
router = APIRouter(prefix="/api/qsar-studio", tags=["qsar-studio"])

UPLOAD_DIR = os.path.join(os.getcwd(), "uploads", "qsar_studio")
os.makedirs(UPLOAD_DIR, exist_ok=True)


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
    if isinstance(val, (np.bool_,)):
        return bool(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    return val


def _read_csv_safely(content: bytes) -> pd.DataFrame:
    last_err = None
    # 1. Try standard comma sep with common encodings
    for encoding in ["utf-8", "latin1", "cp1252", "iso-8859-1"]:
        try:
            return pd.read_csv(io.BytesIO(content), encoding=encoding)
        except Exception as e:
            last_err = e
            continue
    # 2. Try auto-detect separator with python engine
    for encoding in ["utf-8", "latin1"]:
        try:
            return pd.read_csv(io.BytesIO(content), encoding=encoding, sep=None, engine='python')
        except Exception as e:
            last_err = e
            continue
    # 3. Try skipping bad lines
    for encoding in ["utf-8", "latin1"]:
        try:
            return pd.read_csv(io.BytesIO(content), encoding=encoding, on_bad_lines='skip')
        except Exception as e:
            last_err = e
            continue
    raise last_err or ValueError("Failed to parse CSV content.")


def _qsar_state_key() -> str:
    return "_qsar_state"


def _get_qsar_state(client_id: str) -> Dict:
    """Get or create QSAR-specific state stored in the workspace context."""
    context = registry.get_context(client_id)
    if not hasattr(context, '_extended_state'):
        context._extended_state = {}
    if _qsar_state_key() not in context._extended_state:
        raise HTTPException(
            status_code=404,
            detail=f"No QSAR Studio session found for '{client_id}'. Upload a dataset first."
        )
    return context._extended_state[_qsar_state_key()]


def _set_qsar_state(client_id: str, state: Dict):
    context = registry.get_context(client_id)
    if not hasattr(context, '_extended_state'):
        context._extended_state = {}
    context._extended_state[_qsar_state_key()] = state
    context.touch(save_to_disk=True)


def _load_qsar_df(client_id: str) -> pd.DataFrame:
    """Load QSAR dataframe from workspace registry."""
    context = registry.get_context(client_id)
    meta = getattr(context, '_extended_state', {}).get(_qsar_state_key(), {})
    qsar_path = meta.get("_parquet_path")
    if qsar_path and os.path.exists(qsar_path):
        return pd.read_parquet(qsar_path)
    if context.parquet_path and os.path.exists(context.parquet_path):
        return pd.read_parquet(context.parquet_path)
    if context.dataframe_cache is not None:
        return context.dataframe_cache
    raise HTTPException(status_code=404, detail="No dataset loaded in this workspace")


def _save_qsar_df(client_id: str, df: pd.DataFrame, fname: str = "qsar_dataset.parquet"):
    """Save QSAR dataframe to workspace storage."""
    context = registry.get_context(client_id)
    qsar_dir = os.path.join(getattr(context, "workspace_dir", f"workspaces/{client_id}"), "qsar")
    os.makedirs(qsar_dir, exist_ok=True)
    qsar_path = os.path.join(qsar_dir, fname.rsplit(".", 1)[0] + ".parquet")
    df.to_parquet(qsar_path, index=False)
    return qsar_path


# ─── Upload endpoints ─────────────────────────────────────────────────────

@router.post("/{client_id}/upload-csv")
async def upload_csv(client_id: str, file: UploadFile = File(...)):
    """Upload a flat CSV or Parquet file as the QSAR working dataset."""
    fname = file.filename or "dataset"
    content = await file.read()

    try:
        if fname.endswith(".parquet"):
            df = pd.read_parquet(io.BytesIO(content))
        elif fname.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = _read_csv_safely(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    # Strip whitespace, BOM chars, and invisible unicode from all column names
    df.columns = [str(c).strip().lstrip('\ufeff').strip() for c in df.columns]

    qsar_path = _save_qsar_df(client_id, df, fname)
    _set_qsar_state(client_id, {
        "df": df,
        "subgroups": {"main": df},
        "filename": fname,
        "source": "csv_upload",
        "active_subgroup": "main",
        "_parquet_path": qsar_path,
    })

    return {
        "status": "ok",
        "filename": fname,
        "rows": len(df),
        "cols": len(df.columns),
        "columns": df.columns.tolist(),
    }


@router.post("/{client_id}/upload-zip")
async def upload_zip(client_id: str, file: UploadFile = File(...)):
    """
    Upload a hierarchical ZIP (from Hierarchy Studio or external).
    Auto-detects subgroups from folder structure.
    Each folder with a dataset.csv or dataset.parquet becomes one subgroup.
    """
    content = await file.read()
    subgroups: Dict[str, pd.DataFrame] = {}
    manifest_data: Dict = {}

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            names = zf.namelist()

            # Read manifest if present
            if "manifest.json" in names:
                try:
                    manifest_data = json.loads(zf.read("manifest.json").decode())
                except Exception:
                    pass

            # Find subgroup datasets
            for name in names:
                if not (name.endswith("dataset.csv") or name.endswith("dataset.parquet")):
                    continue
                parts = name.split("/")
                subgroup_name = parts[0] if len(parts) > 1 else "main"
                try:
                    raw = zf.read(name)
                    df = pd.read_parquet(io.BytesIO(raw)) if name.endswith(".parquet") else _read_csv_safely(raw)
                    subgroups[subgroup_name] = df
                except Exception as e:
                    logger.warning(f"Skipping {name}: {e}")

            # Fallback: top-level CSV
            if not subgroups:
                for name in names:
                    if name.endswith(".csv") and "/" not in name:
                        try:
                            df = _read_csv_safely(zf.read(name))
                            subgroups["main"] = df
                            break
                        except Exception:
                            pass

    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    if not subgroups:
        raise HTTPException(status_code=400, detail="No valid dataset files found in ZIP")

    # Combine all subgroups into one merged df
    all_dfs = list(subgroups.values())
    merged = pd.concat(all_dfs, ignore_index=True).drop_duplicates() if len(all_dfs) > 1 else all_dfs[0]

    qsar_path = _save_qsar_df(client_id, merged, file.filename or "upload.zip")
    _set_qsar_state(client_id, {
        "df": merged,
        "subgroups": subgroups,
        "filename": file.filename or "upload.zip",
        "source": "zip_upload",
        "active_subgroup": list(subgroups.keys())[0],
        "manifest": manifest_data,
        "_parquet_path": qsar_path,
    })

    return {
        "status": "ok",
        "filename": file.filename,
        "subgroups": [
            {"name": k, "rows": len(v), "cols": len(v.columns)}
            for k, v in subgroups.items()
        ],
        "total_rows": len(merged),
        "cols": len(merged.columns),
        "columns": merged.columns.tolist(),
        "manifest": manifest_data,
    }


@router.post("/{client_id}/load-demo")
async def load_demo(client_id: str):
    """Load the pre-computed QSAR demo dataset into the session."""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(project_root)), "data", "qsar_demo_dataset.csv"),
        os.path.join(project_root, "data", "qsar_demo_dataset.csv"),
        "data/qsar_demo_dataset.csv",
        "qsar_demo_dataset.csv",
        os.path.join(project_root, "qsar_demo_dataset.csv"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "qsar_demo_dataset.csv"),
    ]
    demo_path = next((p for p in candidates if os.path.exists(p)), None)
    if not demo_path:
        raise HTTPException(status_code=404, detail="QSAR demo dataset not found.")

    try:
        df = pd.read_csv(demo_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read QSAR demo dataset: {e}")

    qsar_path = _save_qsar_df(client_id, df, "qsar_demo_dataset.csv")
    _set_qsar_state(client_id, {
        "df": df,
        "subgroups": {"main": df},
        "filename": "qsar_demo_dataset.csv",
        "source": "demo_load",
        "active_subgroup": "main",
        "_parquet_path": qsar_path,
    })

    return {
        "status": "ok",
        "filename": "qsar_demo_dataset.csv",
        "rows": len(df),
        "cols": len(df.columns),
        "columns": df.columns.tolist(),
    }


# ─── Dataset info ────────────────────────────────────────────────────────────

@router.get("/{client_id}/dataset-info")
async def dataset_info(client_id: str, subgroup: Optional[str] = None):
    """Return shape and column info for the active/selected subgroup."""
    state = _get_qsar_state(client_id)
    subgroups = state.get("subgroups", {})

    if subgroup and subgroup in subgroups:
        df = subgroups[subgroup]
        active = subgroup
    else:
        df = state["df"]
        active = state.get("active_subgroup", "main")

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    text_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    return {
        "filename": state["filename"],
        "source": state["source"],
        "active_subgroup": active,
        "subgroups": list(subgroups.keys()),
        "rows": len(df),
        "cols": len(df.columns),
        "numeric_cols": len(numeric_cols),
        "text_cols": len(text_cols),
        "columns": df.columns.tolist(),
        "numeric_columns": numeric_cols,
        "missing_pct": round(df.isna().mean().mean() * 100, 2),
        "duplicate_rows": int(df.duplicated().sum()),
        "sample": df.head(5).fillna("").to_dict(orient="records"),
    }


# ─── QSAR Readiness Assessment ────────────────────────────────────────────────

@router.get("/{client_id}/readiness")
async def qsar_readiness(client_id: str, subgroup: Optional[str] = None, endpoint_col: Optional[str] = None):
    """
    OECD-aligned QSAR readiness assessment.
    Evaluates: dataset size, endpoint quality, descriptor coverage,
    chemical diversity potential, and 5 OECD principles compliance.
    """
    state = _get_qsar_state(client_id)
    subgroups = state.get("subgroups", {})
    df = subgroups.get(subgroup, state["df"]) if subgroup else state["df"]

    # Auto-detect endpoint column
    if not endpoint_col:
        for c in df.columns:
            if any(k in c.lower() for k in ["lc50", "ec50", "ic50", "activity", "endpoint", "value", "target", "plc", "pec"]):
                endpoint_col = c
                break
    if not endpoint_col:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        endpoint_col = numeric_cols[-1] if numeric_cols else None

    results: Dict[str, Any] = {
        "endpoint_col": endpoint_col,
        "rows": len(df),
        "cols": len(df.columns),
        "checks": [],
        "oecd_principles": {},
        "overall_score": 0,
        "grade": "F",
        "recommendations": [],
    }

    score = 0
    checks = []

    # ── Check 1: Dataset size ──
    n = len(df)
    if n >= 100:
        checks.append({"check": "Dataset Size", "status": "PASS", "detail": f"{n} compounds ≥ 100 (good)", "points": 15})
        score += 15
    elif n >= 30:
        checks.append({"check": "Dataset Size", "status": "WARN", "detail": f"{n} compounds (30–99 is borderline for QSAR)", "points": 8})
        score += 8
    else:
        checks.append({"check": "Dataset Size", "status": "FAIL", "detail": f"{n} compounds < 30 (insufficient for reliable QSAR)", "points": 0})
        results["recommendations"].append("Collect more compounds (minimum 30, ideally ≥100) for QSAR modeling.")

    # ── Check 2: Endpoint quality ──
    if endpoint_col and endpoint_col in df.columns:
        ep = pd.to_numeric(df[endpoint_col], errors="coerce")
        miss_pct = ep.isna().mean() * 100
        if miss_pct < 5:
            checks.append({"check": "Endpoint Completeness", "status": "PASS", "detail": f"{miss_pct:.1f}% missing in '{endpoint_col}'", "points": 20})
            score += 20
        elif miss_pct < 20:
            checks.append({"check": "Endpoint Completeness", "status": "WARN", "detail": f"{miss_pct:.1f}% missing — impute or remove", "points": 10})
            score += 10
        else:
            checks.append({"check": "Endpoint Completeness", "status": "FAIL", "detail": f"{miss_pct:.1f}% missing endpoint values", "points": 0})
            results["recommendations"].append(f"Endpoint column '{endpoint_col}' has {miss_pct:.1f}% missing values — clean before modeling.")

        # Range check
        pos = ep.dropna()
        if len(pos) > 0:
            log_range = None
            try:
                pos_vals = pos[pos > 0]
                if len(pos_vals) >= 2:
                    log_range = math.log10(float(pos_vals.max())) - math.log10(float(pos_vals.min()))
            except Exception:
                pass
            if log_range and log_range >= 2:
                checks.append({"check": "Endpoint Dynamic Range", "status": "PASS", "detail": f"{log_range:.1f} orders of magnitude (≥2 required)", "points": 10})
                score += 10
            else:
                rng_str = f"{log_range:.1f} orders" if log_range else "undetermined"
                checks.append({"check": "Endpoint Dynamic Range", "status": "WARN", "detail": f"{rng_str} — narrow range limits model sensitivity", "points": 5})
                score += 5
    else:
        checks.append({"check": "Endpoint Completeness", "status": "FAIL", "detail": "No numeric endpoint column detected", "points": 0})
        results["recommendations"].append("Map or add a numeric endpoint column (LC50, EC50, IC50, etc.).")

    # ── Check 3: Descriptor coverage ──
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    desc_cols = [c for c in numeric_cols if c != endpoint_col]
    if len(desc_cols) >= 50:
        checks.append({"check": "Descriptor Coverage", "status": "PASS", "detail": f"{len(desc_cols)} numeric descriptors present", "points": 15})
        score += 15
    elif len(desc_cols) >= 10:
        checks.append({"check": "Descriptor Coverage", "status": "WARN", "detail": f"{len(desc_cols)} descriptors (≥50 recommended)", "points": 8})
        score += 8
    else:
        checks.append({"check": "Descriptor Coverage", "status": "FAIL", "detail": f"Only {len(desc_cols)} numeric descriptors — run descriptor generation first", "points": 0})
        results["recommendations"].append("Run Compound Explorer Studio to generate RDKit/Mordred descriptors before QSAR modeling.")

    # ── Check 4: Missing descriptors ──
    if desc_cols:
        desc_miss = df[desc_cols].isna().mean().mean() * 100
        if desc_miss < 5:
            checks.append({"check": "Descriptor Completeness", "status": "PASS", "detail": f"{desc_miss:.1f}% average missing in descriptors", "points": 10})
            score += 10
        elif desc_miss < 20:
            checks.append({"check": "Descriptor Completeness", "status": "WARN", "detail": f"{desc_miss:.1f}% average missing — consider imputation", "points": 5})
            score += 5
        else:
            checks.append({"check": "Descriptor Completeness", "status": "FAIL", "detail": f"{desc_miss:.1f}% average missing — too many NaN for modeling", "points": 0})

    # ── Check 5: Variance filter ──
    if desc_cols:
        n_zero_var = 0
        for c in desc_cols:
            try:
                if df[c].std() == 0:
                    n_zero_var += 1
            except Exception:
                pass
        if n_zero_var == 0:
            checks.append({"check": "Zero-Variance Descriptors", "status": "PASS", "detail": "No zero-variance descriptors", "points": 10})
            score += 10
        elif n_zero_var < len(desc_cols) * 0.1:
            checks.append({"check": "Zero-Variance Descriptors", "status": "WARN", "detail": f"{n_zero_var} zero-variance descriptors (remove them)", "points": 5})
            score += 5
        else:
            checks.append({"check": "Zero-Variance Descriptors", "status": "FAIL", "detail": f"{n_zero_var} zero-variance descriptors — dataset may be duplicated or corrupted", "points": 0})

    # ── Check 6: Duplicates ──
    dup_count = int(df.duplicated().sum())
    if dup_count == 0:
        checks.append({"check": "Duplicate Rows", "status": "PASS", "detail": "No duplicate rows", "points": 10})
        score += 10
    elif dup_count < n * 0.05:
        checks.append({"check": "Duplicate Rows", "status": "WARN", "detail": f"{dup_count} duplicate rows ({dup_count/n*100:.1f}%)", "points": 5})
        score += 5
    else:
        checks.append({"check": "Duplicate Rows", "status": "FAIL", "detail": f"{dup_count} duplicate rows ({dup_count/n*100:.1f}%) — deduplicate before modeling", "points": 0})
        results["recommendations"].append("Remove duplicate rows before QSAR modeling.")

    # ── Check 7: SMILES column ──
    smiles_col = next((c for c in df.columns if "smiles" in c.lower()), None)
    if smiles_col:
        checks.append({"check": "SMILES Column Present", "status": "PASS", "detail": f"SMILES column '{smiles_col}' found — applicability domain analysis possible", "points": 10})
        score += 10
    else:
        checks.append({"check": "SMILES Column Present", "status": "WARN", "detail": "No SMILES column found — applicability domain analysis not possible", "points": 5})
        score += 5

    # ── OECD Principles ──
    oecd = {
        "P1_defined_endpoint": endpoint_col is not None,
        "P2_unambiguous_algorithm": len(desc_cols) > 0,
        "P3_applicability_domain": smiles_col is not None,
        "P4_appropriate_measures": n >= 30,
        "P5_mechanistic_interpretation": len(desc_cols) > 0,
    }

    endpoint_skewness = None
    endpoint_kurtosis = None
    bimodal_warning = False
    kde_data = []

    if endpoint_col and endpoint_col in df.columns:
        ep_clean = pd.to_numeric(df[endpoint_col], errors="coerce").dropna()
        if len(ep_clean) > 1:
            endpoint_skewness = _safe(float(ep_clean.skew()))
            endpoint_kurtosis = _safe(float(ep_clean.kurtosis()))
            # Bimodal heuristic: high excess kurtosis or high skewness
            bimodal_warning = bool(abs(endpoint_kurtosis or 0) > 3 or abs(endpoint_skewness or 0) > 1)
            try:
                from scipy import stats as sp_stats
                kde = sp_stats.gaussian_kde(ep_clean)
                x_range = np.linspace(float(ep_clean.min()), float(ep_clean.max()), 100)
                kde_y = kde(x_range)
                kde_data = [{"x": _safe(float(x)), "y": _safe(float(y))} for x, y in zip(x_range, kde_y)]
            except Exception:
                pass

    results["checks"] = checks
    results["oecd_principles"] = oecd
    results["overall_score"] = score
    results["grade"] = ("A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D" if score >= 40 else "F")
    results["smiles_col"] = smiles_col
    results["descriptor_count"] = len(desc_cols)
    results["endpoint_skewness"] = endpoint_skewness
    results["endpoint_kurtosis"] = endpoint_kurtosis
    results["bimodal_warning"] = bimodal_warning
    results["kde_data"] = kde_data

    return results



# ─── ML Benchmark ─────────────────────────────────────────────────────────────

def _run_benchmark_sync(job_id: str, client_id: str, subgroup: str, endpoint_col: str, test_size: float):
    """Synchronous ML benchmark — runs in BackgroundTasks thread."""
    from backend.shared.job_manager import job_manager, JobStatus

    job_manager.update_job(job_id, status=JobStatus.RUNNING)
    try:
        state = _get_qsar_state(client_id)
        subgroups = state.get("subgroups", {})
        df = subgroups.get(subgroup, state["df"]) if subgroup else state["df"]

        if endpoint_col not in df.columns:
            col_map = {str(c).strip().lower(): str(c) for c in df.columns}
            resolved = col_map.get(endpoint_col.strip().lower())
            if resolved:
                endpoint_col = resolved
            else:
                raise ValueError(f"Endpoint column '{endpoint_col}' not in dataset. Available: {list(df.columns[:20])}")

        # Prepare features
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        feature_cols = [c for c in numeric_cols if c != endpoint_col]
        if not feature_cols:
            raise ValueError("No descriptor/feature columns found after removing endpoint")

        X = df[feature_cols].apply(pd.to_numeric, errors="coerce")
        y = pd.to_numeric(df[endpoint_col], errors="coerce")

        # Drop rows with missing endpoint
        valid = y.notna()
        X, y = X[valid], y[valid]

        # Impute missing features with median
        X = X.fillna(X.median())

        n_total = len(y)
        if n_total < 10:
            raise ValueError(f"Too few samples after cleaning: {n_total}")

        from sklearn.model_selection import train_test_split, cross_val_score
        from sklearn.preprocessing import StandardScaler
        from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
        from sklearn.svm import SVR
        from sklearn.neighbors import KNeighborsRegressor
        from sklearn.linear_model import Ridge
        from sklearn.pipeline import Pipeline
        from sklearn.metrics import r2_score, mean_squared_error

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=42)

        models = {
            "Random Forest":   RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
            "Gradient Boost":  GradientBoostingRegressor(n_estimators=100, random_state=42),
            "Ridge Regression":Ridge(alpha=1.0),
            "SVR":             Pipeline([("sc", StandardScaler()), ("svr", SVR(kernel="rbf", C=1.0))]),
            "k-NN":            KNeighborsRegressor(n_neighbors=min(5, len(X_train))),
        }

        results = []
        for name, model in models.items():
            try:
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)
                r2 = _safe(r2_score(y_test, y_pred))
                rmse = _safe(math.sqrt(mean_squared_error(y_test, y_pred)))

                # Cross-validation (5-fold or less if small dataset)
                cv_folds = min(5, len(X_train))
                cv_r2 = cross_val_score(model, X_train, y_train, cv=cv_folds, scoring="r2")
                cv_mean = _safe(float(np.mean(cv_r2)))
                cv_std = _safe(float(np.std(cv_r2)))

                results.append({
                    "model": name,
                    "r2_test": round(r2, 4) if r2 is not None else None,
                    "rmse_test": round(rmse, 4) if rmse is not None else None,
                    "cv_r2_mean": round(cv_mean, 4) if cv_mean is not None else None,
                    "cv_r2_std": round(cv_std, 4) if cv_std is not None else None,
                    "status": "ok",
                })
            except Exception as e:
                results.append({"model": name, "status": "error", "error": str(e)})

        results.sort(key=lambda x: -(x.get("r2_test") or -999))

        # Feature importances from top model
        top_model_name = results[0]["model"] if results else None
        feature_importances = []
        if top_model_name and top_model_name in ("Random Forest", "Gradient Boost"):
            top_model = models[top_model_name]
            if hasattr(top_model, "feature_importances_"):
                fi = top_model.feature_importances_
                feature_importances = sorted(
                    [{"feature": f, "importance": round(float(v), 4)} for f, v in zip(feature_cols, fi)],
                    key=lambda x: -x["importance"]
                )[:20]

        job_manager.update_job(job_id, status=JobStatus.COMPLETED, result={
            "models": results,
            "n_train": len(X_train),
            "n_test": len(X_test),
            "n_features": len(feature_cols),
            "endpoint_col": endpoint_col,
            "top_model": top_model_name,
            "feature_importances": feature_importances,
        })

    except Exception as e:
        job_manager.update_job(job_id, status=JobStatus.FAILED, error=str(e))
        logger.error(f"Benchmark job {job_id} failed: {e}", exc_info=True)


@router.post("/{client_id}/benchmark")
async def start_benchmark(
    client_id: str,
    background_tasks: BackgroundTasks,
    subgroup: str = Form(default=""),
    endpoint_col: str = Form(...),
    test_size: float = Form(default=0.2),
):
    """Launch ML benchmark in background. Returns job_id to poll."""
    from backend.shared.job_manager import job_manager

    # Verify session exists
    state = _get_qsar_state(client_id)

    job = job_manager.create_job(client_id, "qsar_benchmark")
    background_tasks.add_task(
        _run_benchmark_sync, job.job_id, client_id,
        subgroup or state.get("active_subgroup", "main"),
        endpoint_col, test_size
    )
    return {"job_id": job.job_id, "status": "PENDING"}


@router.get("/{client_id}/benchmark/status")
async def benchmark_status(client_id: str, job_id: str):
    """Poll benchmark job status. Returns result when DONE."""
    from backend.shared.job_manager import job_manager

    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "status": job.status.value,
        "result": job.result,
        "error": job.error,
    }


# ─── Applicability Domain (Williams Plot) ─────────────────────────────────────

@router.get("/{client_id}/applicability-domain")
async def applicability_domain(client_id: str, subgroup: Optional[str] = None, endpoint_col: Optional[str] = None):
    """
    Compute Williams plot data:
    - Standardized residuals (y-axis)
    - Hat values / leverage (x-axis)
    - Warning leverage h* = 3k/n
    """
    state = _get_qsar_state(client_id)
    subgroups = state.get("subgroups", {})
    df = subgroups.get(subgroup, state["df"]) if subgroup else state["df"]

    # Auto-detect endpoint
    if not endpoint_col:
        for c in df.columns:
            if any(k in c.lower() for k in ["lc50", "ec50", "ic50", "activity", "value", "target"]):
                endpoint_col = c
                break
    if not endpoint_col:
        nc = df.select_dtypes(include=[np.number]).columns.tolist()
        endpoint_col = nc[-1] if nc else None
    if not endpoint_col or endpoint_col not in df.columns:
        raise HTTPException(status_code=400, detail="No endpoint column found")

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    feature_cols = [c for c in numeric_cols if c != endpoint_col]
    if len(feature_cols) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 descriptor columns for AD analysis")

    y = pd.to_numeric(df[endpoint_col], errors="coerce")
    X = df[feature_cols].apply(pd.to_numeric, errors="coerce")

    valid = y.notna() & X.notna().all(axis=1)
    X, y = X[valid].fillna(X.median()), y[valid]

    n, k = X.shape
    if n < k + 2:
        raise HTTPException(status_code=400, detail=f"Too few samples ({n}) for {k} descriptors")

    try:
        from sklearn.linear_model import LinearRegression
        from sklearn.preprocessing import StandardScaler

        sc = StandardScaler()
        Xs = sc.fit_transform(X)
        X_df = pd.DataFrame(Xs, columns=feature_cols)

        model = LinearRegression()
        model.fit(X_df, y)
        y_pred = model.predict(X_df)
        residuals = y.values - y_pred

        # Hat matrix diagonal (leverage)
        Xa = np.hstack([np.ones((n, 1)), Xs])
        try:
            XtXinv = np.linalg.pinv(Xa.T @ Xa)
            hat = np.einsum("ij,jk,ik->i", Xa, XtXinv, Xa)
        except Exception:
            hat = np.full(n, np.nan)

        # Standardized residuals
        s = float(np.std(residuals, ddof=k + 1)) if n > k + 1 else 1.0
        std_residuals = residuals / s if s > 0 else residuals

        # Warning leverage threshold
        h_star = 3 * (k + 1) / n

        points = []
        for i in range(n):
            points.append({
                "idx": int(valid[valid].index[i]),
                "leverage": _safe(float(hat[i])),
                "std_residual": _safe(float(std_residuals[i])),
                "endpoint": _safe(float(y.iloc[i])),
                "predicted": _safe(float(y_pred[i])),
                "in_ad": bool(abs(std_residuals[i]) <= 3 and hat[i] <= h_star),
            })

        in_ad_count = sum(1 for p in points if p["in_ad"])
        return {
            "points": points,
            "h_star": round(h_star, 4),
            "n": n,
            "k": k,
            "in_ad_count": in_ad_count,
            "in_ad_pct": round(in_ad_count / n * 100, 1),
            "r2": _safe(float(model.score(X_df, y))),
            "endpoint_col": endpoint_col,
            "feature_count": k,
        }
    except Exception as e:
        logger.error(f"AD analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─── Export ────────────────────────────────────────────────────────────────────

@router.get("/{client_id}/export")
async def export_dataset(client_id: str, format: str = "csv", subgroup: Optional[str] = None):
    """Export the QSAR working dataset as CSV, Parquet, or ZIP."""
    state = _get_qsar_state(client_id)
    subgroups = state.get("subgroups", {})
    df = subgroups.get(subgroup, state["df"]) if subgroup else state["df"]
    fname = state["filename"].rsplit(".", 1)[0]

    if format == "csv":
        return Response(df.to_csv(index=False).encode(), media_type="text/csv",
                        headers={"Content-Disposition": f"attachment; filename={fname}_qsar.csv"})
    elif format == "parquet":
        buf = io.BytesIO()
        df.to_parquet(buf, index=False)
        return Response(buf.getvalue(), media_type="application/octet-stream",
                        headers={"Content-Disposition": f"attachment; filename={fname}_qsar.parquet"})
    elif format == "zip":
        mem = io.BytesIO()
        with zipfile.ZipFile(mem, "w", zipfile.ZIP_DEFLATED) as zf:
            for sg_name, sg_df in subgroups.items():
                safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in sg_name)
                zf.writestr(f"{safe}/dataset.csv", sg_df.to_csv(index=False))
                zf.writestr(f"{safe}/metadata.json", json.dumps({"subgroup": sg_name, "rows": len(sg_df), "cols": len(sg_df.columns)}, indent=2))
            zf.writestr("manifest.json", json.dumps({"source": state["filename"], "subgroups": list(subgroups.keys())}, indent=2))
        mem.seek(0)
        return Response(mem.getvalue(), media_type="application/zip",
                        headers={"Content-Disposition": f"attachment; filename={fname}_qsar.zip"})
    raise HTTPException(status_code=400, detail="Unsupported format. Use csv, parquet, or zip.")


@router.post("/{client_id}/generate-descriptors")
async def generate_descriptors(
    client_id: str,
    smiles_col: str = Form(...),
    mode: str = Form("fast"),           # "fast" | "standard" | "full"
    include_3d: bool = Form(False),
):
    """
    Compute RDKit/Mordred molecular descriptors from a SMILES column.
    Uses RDKitEngine.calculate_from_smiles() in parallel using a thread pool.
    Merges computed descriptors back into the dataset and saves parquet.
    """
    from backend.descriptor_engine.rdkit_engine import RDKitEngine
    import concurrent.futures

    state = _get_qsar_state(client_id)
    df = _load_qsar_df(client_id)

    if smiles_col not in df.columns:
        # Try case-insensitive / stripped match
        col_map = {str(c).strip().lower(): str(c) for c in df.columns}
        resolved = col_map.get(smiles_col.strip().lower())
        if resolved:
            smiles_col = resolved
        else:
            raise HTTPException(422, f"Column '{smiles_col}' not found. Available columns: {list(df.columns[:20])}")
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
    success_rows = []
    fail_rows = []
    all_desc_keys = set()
    for i, res in enumerate(results):
        if res.get("success"):
            all_desc_keys.update(res["data"].keys())
            success_rows.append(i)
        else:
            fail_rows.append({"idx": i, "smiles": smiles_list[i], "error": res.get("error", "")})

    # Merge descriptors back into df
    desc_df = pd.DataFrame([
        results[i]["data"] if results[i].get("success") else {} for i in range(len(results))
    ], index=df.index)

    # Remove purely string/identifier columns from desc_df before merge
    non_desc = {"CanonicalSMILES", "IsomericSMILES", "InChIKey", "MolecularFormula"}
    numeric_desc_cols = [c for c in desc_df.columns if c not in non_desc]
    desc_df = desc_df[numeric_desc_cols].apply(pd.to_numeric, errors='coerce')

    df_merged = pd.concat([df, desc_df], axis=1)
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
    preview_df = df_merged[preview_cols].head(5)
    preview = [{col: _safe(val) for col, val in row.items()} for _, row in preview_df.iterrows()]

    return {
        "success_count": len(success_rows),
        "fail_count": len(fail_rows),
        "descriptor_count": len(numeric_desc_cols),
        "descriptor_names": numeric_desc_cols,
        "failed_rows": fail_rows[:50],
        "categories": {k: len(v) for k, v in categories.items()},
        "preview": preview,
        "mode": mode,
    }


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
    """
    from scipy import stats as sp_stats
    import numpy as np

    state = _get_qsar_state(client_id)
    df = _load_qsar_df(client_id)

    if endpoint_col not in df.columns:
        col_map = {str(c).strip().lower(): str(c) for c in df.columns}
        resolved = col_map.get(endpoint_col.strip().lower())
        if resolved:
            endpoint_col = resolved
        else:
            raise HTTPException(422, f"Column '{endpoint_col}' not found. Available: {list(df.columns[:20])}")
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


@router.post("/{client_id}/y-randomization")
async def y_randomization_test(
    client_id: str,
    endpoint_col: str = Form(...),
    n_permutations: int = Form(100),
    subgroup: str = Form(""),
):
    """
    Y-randomization (permutation test) to validate the QSAR model.
    Permutes y-labels n times, fits RF model each time, records CV R².
    """
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.model_selection import cross_val_score
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

    if len(X) < 5:
        raise HTTPException(422, "Insufficient data to compute validation metrics.")

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
        "delta_r2_q2": _safe(r2_train - q2),
        "n_cv_folds": 10 if len(X) > 200 else len(X),
        "cv_type": "10-fold" if len(X) > 200 else "LOO",
        "endpoint_col": endpoint_col,
        "n": len(y),
        "scatter_data": [
            {"actual": _safe(float(y[i])), "predicted": _safe(float(y_train_pred[i])),
             "residual": _safe(float(y[i] - y_train_pred[i]))}
            for i in range(len(y))
        ],
    }

