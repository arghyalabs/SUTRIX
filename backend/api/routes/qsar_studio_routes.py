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

# ─── In-memory job store ────────────────────────────────────────────────────
_jobs: Dict[str, Dict] = {}


def _new_job() -> str:
    jid = str(uuid.uuid4())[:8]
    _jobs[jid] = {"status": "PENDING", "result": None, "error": None}
    return jid


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
    for encoding in ["utf-8", "latin1", "cp1252", "iso-8859-1"]:
        try:
            return pd.read_csv(io.BytesIO(content), encoding=encoding)
        except (UnicodeDecodeError, ValueError) as e:
            last_err = e
            continue
    raise last_err or ValueError("Failed to decode CSV content with standard encodings.")


# ─── Workspace session store (in-memory, keyed by client_id) ───────────────
# Each entry: { "df": pd.DataFrame, "subgroups": {name: df}, "filename": str, "source": str }
_sessions: Dict[str, Dict] = {}


def _get_session(client_id: str) -> Dict:
    if client_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"No QSAR Studio session found for '{client_id}'. Upload a dataset first.")
    return _sessions[client_id]


# ─── Upload endpoints ─────────────────────────────────────────────────────

@router.post("/{client_id}/upload-csv")
async def upload_csv(client_id: str, file: UploadFile = File(...)):
    """Upload a flat CSV or Parquet file as the QSAR working dataset."""
    fname = file.filename or "dataset"
    content = await file.read()

    try:
        if fname.endswith(".parquet"):
            df = pd.read_parquet(io.BytesIO(content))
        else:
            df = _read_csv_safely(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    _sessions[client_id] = {
        "df": df,
        "subgroups": {"main": df},
        "filename": fname,
        "source": "csv_upload",
        "active_subgroup": "main",
    }

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

    _sessions[client_id] = {
        "df": merged,
        "subgroups": subgroups,
        "filename": file.filename or "upload.zip",
        "source": "zip_upload",
        "active_subgroup": list(subgroups.keys())[0],
        "manifest": manifest_data,
    }

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
    # Search for demo file: check data/ first, then project root, then backend root
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # Try multiple parent levels to robustly locate the project root containing 'data/'
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

    _sessions[client_id] = {
        "df": df,
        "subgroups": {"main": df},
        "filename": "qsar_demo_dataset.csv",
        "source": "demo_load",
        "active_subgroup": "main",
    }

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
    session = _get_session(client_id)
    subgroups = session.get("subgroups", {})

    if subgroup and subgroup in subgroups:
        df = subgroups[subgroup]
        active = subgroup
    else:
        df = session["df"]
        active = session.get("active_subgroup", "main")

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    text_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    return {
        "filename": session["filename"],
        "source": session["source"],
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
    session = _get_session(client_id)
    subgroups = session.get("subgroups", {})
    df = subgroups.get(subgroup, session["df"]) if subgroup else session["df"]

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

    results["checks"] = checks
    results["oecd_principles"] = oecd
    results["overall_score"] = score
    results["grade"] = ("A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D" if score >= 40 else "F")
    results["smiles_col"] = smiles_col
    results["descriptor_count"] = len(desc_cols)

    return results


# ─── ML Benchmark ─────────────────────────────────────────────────────────────

def _run_benchmark_sync(job_id: str, client_id: str, subgroup: str, endpoint_col: str, test_size: float):
    """Synchronous ML benchmark — runs in BackgroundTasks thread."""
    _jobs[job_id]["status"] = "RUNNING"
    try:
        session = _sessions.get(client_id)
        if not session:
            raise ValueError(f"No session for '{client_id}'")

        subgroups = session.get("subgroups", {})
        df = subgroups.get(subgroup, session["df"]) if subgroup else session["df"]

        if endpoint_col not in df.columns:
            raise ValueError(f"Endpoint column '{endpoint_col}' not in dataset")

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

        _jobs[job_id]["status"] = "DONE"
        _jobs[job_id]["result"] = {
            "models": results,
            "n_train": len(X_train),
            "n_test": len(X_test),
            "n_features": len(feature_cols),
            "endpoint_col": endpoint_col,
            "top_model": top_model_name,
            "feature_importances": feature_importances,
        }

    except Exception as e:
        _jobs[job_id]["status"] = "FAILED"
        _jobs[job_id]["error"] = str(e)
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
    session = _sessions.get(client_id)
    if not session:
        raise HTTPException(status_code=404, detail="No session found. Upload a dataset first.")

    job_id = _new_job()
    background_tasks.add_task(
        _run_benchmark_sync, job_id, client_id,
        subgroup or session.get("active_subgroup", "main"),
        endpoint_col, test_size
    )
    return {"job_id": job_id, "status": "PENDING"}


@router.get("/{client_id}/benchmark/status")
async def benchmark_status(client_id: str, job_id: str):
    """Poll benchmark job status. Returns result when DONE."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ─── Applicability Domain (Williams Plot) ─────────────────────────────────────

@router.get("/{client_id}/applicability-domain")
async def applicability_domain(client_id: str, subgroup: Optional[str] = None, endpoint_col: Optional[str] = None):
    """
    Compute Williams plot data:
    - Standardized residuals (y-axis)
    - Hat values / leverage (x-axis)
    - Warning leverage h* = 3k/n
    """
    session = _get_session(client_id)
    subgroups = session.get("subgroups", {})
    df = subgroups.get(subgroup, session["df"]) if subgroup else session["df"]

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
        # H = X(X'X)^{-1}X'  → diag(H)
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
    session = _get_session(client_id)
    subgroups = session.get("subgroups", {})
    df = subgroups.get(subgroup, session["df"]) if subgroup else session["df"]
    fname = session["filename"].rsplit(".", 1)[0]

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
            zf.writestr("manifest.json", json.dumps({"source": session["filename"], "subgroups": list(subgroups.keys())}, indent=2))
        mem.seek(0)
        return Response(mem.getvalue(), media_type="application/zip",
                        headers={"Content-Disposition": f"attachment; filename={fname}_qsar.zip"})
    raise HTTPException(status_code=400, detail="Unsupported format. Use csv, parquet, or zip.")
