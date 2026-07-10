"""
SUTRIX V6 — Scientific Data Analytics Routes
/api/analytics/* endpoints for dataset profiling, missing data analysis,
endpoint diagnostics, correlation, outlier detection, and distribution analysis.
"""
import logging
import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import Response

from backend.core.workspace_registry import registry

logger = logging.getLogger("sdo.api.analytics")
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _load_df(client_id: str):
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail=f"Workspace '{client_id}' not found")
    df = None
    try:
        df = context.load_active_dataset()
    except Exception:
        pass
    if df is None:
        try:
            df = context.load_slice()
        except Exception:
            pass
    if df is None:
        raise HTTPException(status_code=404, detail="No dataset loaded in this workspace")
    return df, context


def _safe(val: Any) -> Any:
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


# ─── Endpoints ────────────────────────────────────────────────────────────────

def _read_csv_safely(content: bytes) -> pd.DataFrame:
    import io
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


@router.post("/{client_id}/upload")
async def upload_dataset_test(client_id: str, file: UploadFile = File(...)):
    """Synchronous upload specifically for V6 testing/standalone studio flow."""
    import io
    content = await file.read()
    fname = file.filename or "dataset.csv"
    try:
        if fname.endswith(".parquet"):
            df = pd.read_parquet(io.BytesIO(content))
        elif fname.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = _read_csv_safely(content)
    except Exception as e:
        raise HTTPException(400, f"Cannot parse file: {e}")
    context = registry.get_context(client_id)
    import os
    base_dir = os.path.join(getattr(context, "workspace_dir", f"workspaces/{client_id}"), "uploads")
    os.makedirs(base_dir, exist_ok=True)
    parquet_path = os.path.join(base_dir, "dataset.parquet")
    df.to_parquet(parquet_path, index=False)
    context.parquet_path = parquet_path
    context.dataframe_cache = df
    context.reset_subgroup_state()
    context.add_trace("ingest")
    return {
        "status": "ok",
        "filename": fname,
        "rows": len(df),
        "cols": len(df.columns),
        "row_count": len(df),
        "columns": df.columns.tolist()
    }


@router.post("/{client_id}/load-demo")
async def load_demo(client_id: str):
    """Load the pre-computed demo dataset for Analytics Studio."""
    import os
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
        raise HTTPException(status_code=404, detail="Demo dataset not found.")

    try:
        df = pd.read_csv(demo_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read demo dataset: {e}")

    context = registry.get_context(client_id)
    base_dir = os.path.join(getattr(context, "workspace_dir", f"workspaces/{client_id}"), "uploads")
    os.makedirs(base_dir, exist_ok=True)
    parquet_path = os.path.join(base_dir, "dataset.parquet")
    df.to_parquet(parquet_path, index=False)
    context.parquet_path = parquet_path
    context.dataframe_cache = df
    context.reset_subgroup_state()
    return {
        "status": "ok",
        "filename": "qsar_demo_dataset.csv",
        "rows": len(df),
        "cols": len(df.columns),
        "row_count": len(df),
        "columns": df.columns.tolist()
    }


@router.get("/{client_id}/profile")
async def dataset_profile(client_id: str):
    """Full dataset profile: shape, dtypes, completeness, numeric summaries."""
    try:
        df, context = _load_df(client_id)
        total_rows, total_cols = df.shape
        total_cells = total_rows * total_cols
        missing_cells = int(df.isna().sum().sum())
        completeness_pct = round((1 - missing_cells / max(1, total_cells)) * 100, 2)

        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        categorical_cols = df.select_dtypes(include=["object", "category", "string"]).columns.tolist()
        datetime_cols = df.select_dtypes(include=["datetime"]).columns.tolist()

        columns = []
        for col in df.columns:
            s = df[col]
            col_info: Dict[str, Any] = {
                "name": col,
                "dtype": str(s.dtype),
                "missing_count": int(s.isna().sum()),
                "missing_pct": round(s.isna().mean() * 100, 2),
                "unique_count": int(s.nunique()),
            }
            if pd.api.types.is_numeric_dtype(s):
                desc = s.describe()
                col_info.update({
                    "mean":   _safe(desc.get("mean")),
                    "std":    _safe(desc.get("std")),
                    "min":    _safe(desc.get("min")),
                    "q25":    _safe(desc.get("25%")),
                    "median": _safe(desc.get("50%")),
                    "q75":    _safe(desc.get("75%")),
                    "max":    _safe(desc.get("max")),
                    "skewness": _safe(float(s.skew())),
                    "kurtosis": _safe(float(s.kurtosis())),
                    "zeros": int((s == 0).sum()),
                    "negatives": int((s < 0).sum()),
                })
            else:
                top = s.value_counts().head(3)
                col_info["top_values"] = {str(k): int(v) for k, v in top.items()}

            columns.append(col_info)

        return {
            "total_rows": total_rows,
            "total_cols": total_cols,
            "total_cells": total_cells,
            "missing_cells": missing_cells,
            "completeness_pct": completeness_pct,
            "numeric_cols": len(numeric_cols),
            "categorical_cols": len(categorical_cols),
            "datetime_cols": len(datetime_cols),
            "duplicate_rows": int(df.duplicated().sum()),
            "memory_mb": round(df.memory_usage(deep=True).sum() / 1024 / 1024, 3),
            "columns": columns,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Profile failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/missing-analysis")
async def missing_analysis(client_id: str):
    """Per-column missing value analysis with systematic patterns and MCAR/MAR diagnostics."""
    try:
        from scipy.stats import pearsonr
        df, _ = _load_df(client_id)
        results = []
        for col in df.columns:
            s = df[col]
            miss = int(s.isna().sum())
            results.append({
                "column": col,
                "dtype": str(s.dtype),
                "missing_count": miss,
                "missing_pct": round(s.isna().mean() * 100, 2),
                "present_count": int(s.notna().sum()),
                "unique_count": int(s.nunique()),
                "severity": "CRITICAL" if miss / len(df) > 0.5 else
                            "HIGH" if miss / len(df) > 0.2 else
                            "MEDIUM" if miss / len(df) > 0.05 else
                            "LOW" if miss > 0 else "NONE",
            })

        results.sort(key=lambda x: -x["missing_pct"])

        # MCAR vs MAR classification per column
        column_classification = {}
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        
        for r in results:
            col = r["column"]
            if r["missing_count"] == 0:
                continue
            
            miss_flag = df[col].isna().astype(int)
            correlations = []
            
            for nc in numeric_cols[:20]:
                if nc == col:
                    continue
                # Align indicators and check pearsonr
                valid_indices = df[nc].dropna().index
                if len(valid_indices) > 10:
                    try:
                        flag_series = miss_flag.loc[valid_indices]
                        val_series = df[nc].loc[valid_indices]
                        # Check variance
                        if flag_series.std() > 0 and val_series.std() > 0:
                            r_val, p_val = pearsonr(flag_series, val_series)
                            if abs(r_val) > 0.2 and p_val < 0.05:
                                correlations.append({
                                    "corr_col": nc,
                                    "r": _safe(float(r_val)),
                                    "p": _safe(float(p_val))
                                })
                    except Exception:
                        pass
            
            if correlations:
                # Sort by absolute correlation strength
                correlations.sort(key=lambda x: -abs(x["r"]))
                classification = "MAR"
                reason = f"Missingness correlates with {correlations[0]['corr_col']} (r={correlations[0]['r']:.2f}, p={correlations[0]['p']:.4f})"
            else:
                classification = "MCAR"
                reason = "No significant correlation with other variables detected (Missing Completely at Random)"
                
            column_classification[col] = {
                "type": classification,
                "reason": reason,
                "correlations": correlations[:3]
            }

        # Pattern matrix (sampled 100 rows x columns with any missing values)
        missing_cols = [r["column"] for r in results if r["missing_count"] > 0][:30]
        sample_idx = df.sample(min(100, len(df)), random_state=42).index
        pattern_matrix = []
        for idx in sample_idx:
            pattern_matrix.append({
                "row": int(idx),
                "pattern": [int(not pd.isna(df.loc[idx, c])) for c in missing_cols]
            })

        mar_column_count = sum(1 for v in column_classification.values() if v["type"] == "MAR")

        return {
            "columns": results,
            "total_missing": sum(r["missing_count"] for r in results),
            "columns_with_missing": sum(1 for r in results if r["missing_count"] > 0),
            "mar_column_count": mar_column_count,
            "column_classification": column_classification,
            "pattern_matrix_cols": missing_cols,
            "pattern_matrix": pattern_matrix,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Missing analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/{client_id}/endpoint-analysis")
async def endpoint_analysis(client_id: str, col: Optional[str] = None):
    """
    Analyze endpoint column: value distribution, log-normal check,
    statistics by species/endpoint group if mappings available.
    """
    try:
        df, context = _load_df(client_id)
        mappings = context.mappings or {}

        # Auto-detect endpoint column
        if not col:
            for user_col, role in mappings.items():
                if role == "value" and user_col in df.columns:
                    col = user_col
                    break
        if not col:
            # Try heuristic: numeric column with name suggesting toxicity
            for c in df.select_dtypes(include=[np.number]).columns:
                if any(k in c.lower() for k in ["lc50", "ec50", "ic50", "noec", "loec", "value", "conc"]):
                    col = c
                    break
        if not col:
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if numeric_cols:
                col = numeric_cols[0]

        if not col or col not in df.columns:
            raise HTTPException(status_code=400, detail="No endpoint/value column found. Specify ?col=column_name")

        s = df[col].dropna()
        numeric_s = pd.to_numeric(s, errors="coerce").dropna()

        if len(numeric_s) == 0:
            raise HTTPException(status_code=400, detail=f"Column '{col}' has no numeric values")

        # Distribution statistics
        stats = {
            "column": col,
            "count": int(len(numeric_s)),
            "mean": _safe(float(numeric_s.mean())),
            "std": _safe(float(numeric_s.std())),
            "min": _safe(float(numeric_s.min())),
            "q05": _safe(float(numeric_s.quantile(0.05))),
            "q25": _safe(float(numeric_s.quantile(0.25))),
            "median": _safe(float(numeric_s.median())),
            "q75": _safe(float(numeric_s.quantile(0.75))),
            "q95": _safe(float(numeric_s.quantile(0.95))),
            "max": _safe(float(numeric_s.max())),
            "skewness": _safe(float(numeric_s.skew())),
            "kurtosis": _safe(float(numeric_s.kurtosis())),
            "cv_pct": _safe(round(numeric_s.std() / numeric_s.mean() * 100, 2)) if numeric_s.mean() != 0 else None,
            "zeros": int((numeric_s == 0).sum()),
            "negatives": int((numeric_s < 0).sum()),
            "range_orders_of_magnitude": None,
        }

        # Orders of magnitude (log range)
        pos = numeric_s[numeric_s > 0]
        if len(pos) > 0:
            log_range = math.log10(float(pos.max())) - math.log10(float(pos.min()))
            stats["range_orders_of_magnitude"] = round(log_range, 2)

        # Log-normality test
        log_normal_score = None
        if len(pos) >= 8:
            log_s = np.log10(pos)
            log_skew = float(log_s.skew())
            log_kurt = float(log_s.kurtosis())
            log_normal_score = max(0, 100 - abs(log_skew) * 20 - abs(log_kurt) * 10)
            stats["log_normal_score"] = round(log_normal_score, 1)
            stats["log_skewness"] = round(log_skew, 3)
            stats["recommended_transform"] = "log10" if log_normal_score > 50 else "none"

        # Histogram data (20 bins)
        hist_vals, hist_edges = np.histogram(numeric_s, bins=20)
        histogram = [
            {"bin_start": _safe(float(hist_edges[i])),
             "bin_end": _safe(float(hist_edges[i + 1])),
             "count": int(hist_vals[i])}
            for i in range(len(hist_vals))
        ]

        # Log-scale histogram (positive values only)
        log_histogram = []
        if len(pos) > 0:
            log_vals = np.log10(pos)
            lh_vals, lh_edges = np.histogram(log_vals, bins=20)
            log_histogram = [
                {"bin_start": _safe(float(lh_edges[i])),
                 "bin_end": _safe(float(lh_edges[i + 1])),
                 "count": int(lh_vals[i])}
                for i in range(len(lh_vals))
            ]

        # By-group stats (if endpoint/species columns are mapped)
        group_stats = []
        ep_col = next((k for k, v in mappings.items() if v == "endpoint" and k in df.columns), None)
        sp_col = next((k for k, v in mappings.items() if v in ("organism", "species") and k in df.columns), None)
        group_by = ep_col or sp_col
        if group_by and group_by in df.columns:
            for grp, grp_df in df.groupby(group_by):
                grp_vals = pd.to_numeric(grp_df[col], errors="coerce").dropna()
                if len(grp_vals) >= 3:
                    group_stats.append({
                        "group": str(grp),
                        "count": int(len(grp_vals)),
                        "mean": _safe(float(grp_vals.mean())),
                        "median": _safe(float(grp_vals.median())),
                        "std": _safe(float(grp_vals.std())),
                        "min": _safe(float(grp_vals.min())),
                        "max": _safe(float(grp_vals.max())),
                    })
            group_stats.sort(key=lambda x: -x["count"])

        return {
            "stats": stats,
            "histogram": histogram,
            "log_histogram": log_histogram,
            "group_stats": group_stats,
            "group_by_col": group_by,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Endpoint analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/correlation")
async def correlation_matrix(client_id: str, method: str = "pearson", max_cols: int = 30):
    """Compute correlation matrix for all numeric columns including p-values and VIF analysis."""
    try:
        import scipy.stats as sp_stats
        df, _ = _load_df(client_id)
        numeric_df = df.select_dtypes(include=[np.number])

        if numeric_df.shape[1] < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 numeric columns for correlation")

        # Limit columns
        cols = numeric_df.columns[:max_cols].tolist()
        numeric_df = numeric_df[cols]

        if method not in ("pearson", "spearman", "kendall"):
            method = "pearson"

        corr = numeric_df.corr(method=method)

        # Build matrix for heatmap with p-values
        matrix = []
        for i, col_a in enumerate(cols):
            for j, col_b in enumerate(cols):
                val = corr.loc[col_a, col_b]
                p_val = 1.0
                if col_a == col_b:
                    p_val = 0.0
                else:
                    valid = df[[col_a, col_b]].dropna()
                    if len(valid) > 3:
                        try:
                            if method == "pearson":
                                _, p = sp_stats.pearsonr(valid[col_a], valid[col_b])
                            elif method == "spearman":
                                _, p = sp_stats.spearmanr(valid[col_a], valid[col_b])
                            elif method == "kendall":
                                _, p = sp_stats.kendalltau(valid[col_a], valid[col_b])
                            p_val = float(p)
                        except Exception:
                            pass
                matrix.append({
                    "col_a": col_a,
                    "col_b": col_b,
                    "i": i,
                    "j": j,
                    "value": _safe(val),
                    "p_value": _safe(p_val),
                })

        # Find strong correlations (|r| > 0.7, excluding diagonal)
        strong = []
        for i, col_a in enumerate(cols):
            for j, col_b in enumerate(cols):
                if i >= j:
                    continue
                val = corr.loc[col_a, col_b]
                if not math.isnan(val) and abs(val) > 0.7:
                    strong.append({
                        "col_a": col_a,
                        "col_b": col_b,
                        "correlation": round(float(val), 3),
                        "strength": "very_strong" if abs(val) > 0.9 else "strong",
                        "direction": "positive" if val > 0 else "negative",
                    })
        # VIF calculation using scikit-learn
        vif_data = []
        try:
            from sklearn.linear_model import LinearRegression
            vif_df = numeric_df.copy()
            # Filter out columns with zero variance (constant values) or all nulls
            valid_vif_cols = [c for c in cols if vif_df[c].notna().any() and vif_df[c].nunique() > 1]
            
            # Impute missing values with mean
            for c in valid_vif_cols:
                c_mean = vif_df[c].mean()
                vif_df[c] = vif_df[c].fillna(0.0 if pd.isna(c_mean) else c_mean)
                
            if len(valid_vif_cols) > 1 and vif_df.shape[0] > len(valid_vif_cols) + 2:
                for col in cols:
                    if col not in valid_vif_cols:
                        vif_data.append({"feature": col, "vif": None})
                        continue
                    try:
                        other_cols = [c for c in valid_vif_cols if c != col]
                        X = vif_df[other_cols].values
                        y = vif_df[col].values
                        lr = LinearRegression()
                        lr.fit(X, y)
                        r2 = lr.score(X, y)
                        if r2 >= 1.0:
                            v = 999999.0
                        else:
                            v = float(1.0 / (1.0 - r2))
                        vif_data.append({"feature": col, "vif": _safe(v)})
                    except Exception:
                        vif_data.append({"feature": col, "vif": None})
                vif_data.sort(key=lambda x: (x["vif"] or 0), reverse=True)
        except Exception as e:
            logger.error(f"VIF failed in analytics: {e}")

        strong.sort(key=lambda x: -abs(x["correlation"]))
        return {
            "columns": cols,
            "method": method,
            "matrix": matrix,
            "strong_correlations": strong,
            "col_count": len(cols),
            "vif": vif_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Correlation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/outliers")
async def outlier_detection(client_id: str, method: str = "iqr"):
    """
    Detect outliers per numeric column.
    method: iqr (IQR fence) | zscore (±3 SD) | both
    """
    try:
        df, _ = _load_df(client_id)
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

        if not numeric_cols:
            raise HTTPException(status_code=400, detail="No numeric columns found")

        results = []
        for col in numeric_cols:
            s = pd.to_numeric(df[col], errors="coerce").dropna()
            if len(s) < 4:
                continue

            outlier_rows_iqr = []
            outlier_rows_z = []
            iqr_lower = iqr_upper = None

            if method in ("iqr", "both"):
                q1 = float(s.quantile(0.25))
                q3 = float(s.quantile(0.75))
                iqr_val = q3 - q1
                iqr_lower = q1 - 1.5 * iqr_val
                iqr_upper = q3 + 1.5 * iqr_val
                iqr_mask = (df[col] < iqr_lower) | (df[col] > iqr_upper)
                outlier_rows_iqr = df.index[iqr_mask].tolist()[:20]

            if method in ("zscore", "both"):
                mean = float(s.mean())
                std = float(s.std())
                if std > 0:
                    z_mask = ((df[col] - mean).abs() / std) > 3
                    outlier_rows_z = df.index[z_mask].tolist()[:20]

            combined = list(set(outlier_rows_iqr + outlier_rows_z))
            if not combined:
                continue

            results.append({
                "column": col,
                "method": method,
                "outlier_count": len(combined),
                "outlier_pct": round(len(combined) / len(df) * 100, 2),
                "iqr_lower": _safe(iqr_lower),
                "iqr_upper": _safe(iqr_upper),
                "outlier_rows": [int(r) for r in combined[:20]],
                "sample_values": [_safe(v) for v in df.loc[combined[:5], col].tolist()],
                "severity": "HIGH" if len(combined) / len(df) > 0.1 else
                            "MEDIUM" if len(combined) / len(df) > 0.02 else "LOW",
            })

        results.sort(key=lambda x: -x["outlier_count"])
        return {
            "results": results,
            "total_columns_checked": len(numeric_cols),
            "columns_with_outliers": len(results),
            "method": method,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Outlier detection failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/distribution")
async def distribution_analysis(client_id: str, col: str, bins: int = 30):
    """Full distribution analysis for a single column: histogram, KDE, QQ-plot, normality tests."""
    try:
        df, _ = _load_df(client_id)
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{col}' not found")

        s = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(s) < 4:
            raise HTTPException(status_code=400, detail=f"Column '{col}' has too few numeric values")

        # Histogram
        hist_vals, hist_edges = np.histogram(s, bins=bins)
        histogram = [
            {"bin_start": _safe(float(hist_edges[i])),
             "bin_end": _safe(float(hist_edges[i + 1])),
             "count": int(hist_vals[i]),
             "frequency": round(float(hist_vals[i]) / len(s), 4)}
            for i in range(len(hist_vals))
        ]

        # Log histogram (positive only)
        log_histogram = []
        pos = s[s > 0]
        if len(pos) > 4:
            log_s = np.log10(pos)
            lh_vals, lh_edges = np.histogram(log_s, bins=bins)
            log_histogram = [
                {"bin_start": _safe(float(lh_edges[i])),
                 "bin_end": _safe(float(lh_edges[i + 1])),
                 "count": int(lh_vals[i])}
                for i in range(len(lh_vals))
            ]

        # Normality (Shapiro-Wilk on sample ≤5000)
        normality = None
        try:
            from scipy import stats as sp_stats
            sample = s.sample(min(5000, len(s)), random_state=42) if len(s) > 5000 else s
            stat, p = sp_stats.shapiro(sample)
            normality = {"test": "shapiro_wilk", "statistic": round(float(stat), 4),
                         "p_value": round(float(p), 6), "is_normal": bool(p > 0.05)}
        except Exception:
            pass

        # KDE data
        kde_data = []
        try:
            from scipy.stats import gaussian_kde
            kde_vals = s.values
            if len(kde_vals) > 1:
                kde = gaussian_kde(kde_vals)
                x_range = np.linspace(float(kde_vals.min()), float(kde_vals.max()), 100)
                kde_data = [{"x": _safe(float(x)), "y": _safe(float(kde(x)[0]))} for x in x_range]
        except Exception:
            pass

        # QQ-plot data
        qq_data = []
        try:
            from scipy import stats as sp_stats
            (osm, osr), _ = sp_stats.probplot(s, dist="norm")
            qq_data = [{"theoretical": _safe(float(osm[i])), "sample": _safe(float(osr[i]))} for i in range(len(osm))]
        except Exception:
            pass

        # Box-Cox lambda
        boxcox_lambda = None
        if len(pos) >= 8:
            try:
                from scipy import stats as sp_stats
                _, lam = sp_stats.boxcox(pos)
                boxcox_lambda = _safe(float(lam))
            except Exception:
                pass

        # Percentiles
        percentiles = {str(p): _safe(float(s.quantile(p / 100)))
                       for p in [1, 5, 10, 25, 50, 75, 90, 95, 99]}

        return {
            "column": col,
            "count": int(len(s)),
            "mean": _safe(float(s.mean())),
            "std": _safe(float(s.std())),
            "skewness": _safe(float(s.skew())),
            "kurtosis": _safe(float(s.kurtosis())),
            "histogram": histogram,
            "log_histogram": log_histogram,
            "normality": normality,
            "percentiles": percentiles,
            "kde_data": kde_data,
            "qq_data": qq_data,
            "boxcox_lambda": boxcox_lambda,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Distribution failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/distribution-batch")
async def distribution_batch(client_id: str):
    """
    Analyze ALL numeric columns at once.
    Returns normality scores and recommended transformations for each column.
    """
    try:
        from scipy import stats as sp_stats
        df, _ = _load_df(client_id)
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        results = []
        for col in numeric_cols[:50]:  # limit to 50 columns
            series = pd.to_numeric(df[col], errors='coerce').dropna()
            if len(series) < 5:
                continue
            skew = float(series.skew())
            kurt = float(series.kurtosis())
            sample = series.sample(min(5000, len(series)), random_state=42)
            w, p = sp_stats.shapiro(sample)
            is_normal = bool(p > 0.05)

            # Check log-normality (positive values only)
            pos = series[series > 0]
            log_is_normal = False
            if len(pos) >= 5:
                try:
                    log_sample = np.log10(pos).sample(min(5000, len(pos)), random_state=42)
                    _, lp = sp_stats.shapiro(log_sample)
                    log_is_normal = bool(lp > 0.05)
                except Exception:
                    pass

            recommended = "log10" if (not is_normal and log_is_normal) else "none"

            results.append({
                "column": col,
                "n": len(series),
                "skewness": _safe(skew),
                "kurtosis": _safe(kurt),
                "is_normal": is_normal,
                "shapiro_w": _safe(float(w)),
                "shapiro_p": _safe(float(p)),
                "log_is_normal": log_is_normal,
                "recommended_transform": recommended,
            })

        return {"columns": results, "total_analyzed": len(results)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch distribution failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/{client_id}/export-report")
async def export_analytics_report(client_id: str):
    """Export a full analytics report as Excel with multiple sheets."""
    try:
        import io
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment

        df, context = _load_df(client_id)

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            # Sheet 1: Profile
            profile_rows = []
            for col in df.columns:
                s = df[col]
                row = {
                    "Column": col,
                    "DType": str(s.dtype),
                    "Missing": int(s.isna().sum()),
                    "Missing%": round(s.isna().mean() * 100, 2),
                    "Unique": int(s.nunique()),
                }
                if pd.api.types.is_numeric_dtype(s):
                    row.update({"Mean": _safe(float(s.mean())), "Std": _safe(float(s.std())),
                                "Min": _safe(float(s.min())), "Max": _safe(float(s.max()))})
                profile_rows.append(row)
            pd.DataFrame(profile_rows).to_excel(writer, sheet_name="Dataset Profile", index=False)

            # Sheet 2: First 200 rows
            df.head(200).to_excel(writer, sheet_name="Data Preview", index=False)

            # Sheet 3: Numeric summary
            df.describe().to_excel(writer, sheet_name="Numeric Summary")

        output.seek(0)
        fname = f"analytics_report_{client_id[:8]}.xlsx"
        return Response(
            content=output.read(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={fname}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export report failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/column-intelligence")
async def column_intelligence(client_id: str):
    """
    Classify every column into a scientific role.
    Roles: SMILES | ENDPOINT | DESCRIPTOR | IDENTIFIER | CATEGORICAL | DATETIME | UNKNOWN
    Also returns a data health score per column.
    """
    try:
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
            if missing_pct > 50:
                health -= 50
            elif missing_pct > 20:
                health -= 30
            elif missing_pct > 5:
                health -= 10
            
            if is_numeric:
                std_val = df[col].std()
                if pd.isna(std_val) or std_val == 0:
                    health -= 40  # zero variance
            
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Column intelligence failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/statistical-test")
async def statistical_test(
    client_id: str,
    numeric_col: str = Form(...),
    group_col: str = Form(...),
):
    """
    Compare numeric values across groups defined by group_col.
    Auto-selects t-test, Mann-Whitney, ANOVA, or Kruskal-Wallis.
    """
    try:
        from scipy import stats as sp_stats
        df, _ = _load_df(client_id)

        if numeric_col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Numeric column '{numeric_col}' not found")
        if group_col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Group column '{group_col}' not found")

        # Drop rows with missing values in either column
        sub = df[[numeric_col, group_col]].dropna()
        sub[numeric_col] = pd.to_numeric(sub[numeric_col], errors="coerce")
        sub = sub.dropna()

        groups = sub[group_col].unique().tolist()
        if len(groups) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 distinct groups to perform test")

        group_data = []
        all_normally_distributed = True
        
        # Collect stats per group
        for gp in groups[:10]:  # limit to top 10 groups
            data_pts = sub[sub[group_col] == gp][numeric_col].values
            if len(data_pts) < 3:
                continue
            
            # Normality check
            w_stat, p_val = sp_stats.shapiro(data_pts) if len(data_pts) <= 5000 else (0.0, 1.0)
            is_normal = bool(p_val > 0.05) if len(data_pts) <= 5000 else True
            if not is_normal:
                all_normally_distributed = False
                
            group_data.append({
                "group_name": str(gp),
                "n": len(data_pts),
                "mean": _safe(float(np.mean(data_pts))),
                "median": _safe(float(np.median(data_pts))),
                "std": _safe(float(np.std(data_pts))),
                "is_normal": is_normal,
                "values": [_safe(float(x)) for x in data_pts[:100]],  # sample for jitter plot
                "raw_values": data_pts
            })

        if len(group_data) < 2:
            raise HTTPException(status_code=400, detail="Insufficient group sizes (minimum 3 samples per group)")

        # Determine and execute appropriate test
        test_name = ""
        stat = 0.0
        p = 1.0
        
        if len(group_data) == 2:
            # 2 groups
            g1 = group_data[0]["raw_values"]
            g2 = group_data[1]["raw_values"]
            if all_normally_distributed:
                test_name = "Welch's t-test (parametric)"
                t_stat, p_val = sp_stats.ttest_ind(g1, g2, equal_var=False)
                stat, p = float(t_stat), float(p_val)
            else:
                test_name = "Mann-Whitney U test (non-parametric)"
                u_stat, p_val = sp_stats.mannwhitneyu(g1, g2, alternative="two-sided")
                stat, p = float(u_stat), float(p_val)
        else:
            # > 2 groups
            arrs = [gp["raw_values"] for gp in group_data]
            if all_normally_distributed:
                test_name = "One-way ANOVA (parametric)"
                f_stat, p_val = sp_stats.f_oneway(*arrs)
                stat, p = float(f_stat), float(p_val)
            else:
                test_name = "Kruskal-Wallis H-test (non-parametric)"
                h_stat, p_val = sp_stats.kruskal(*arrs)
                stat, p = float(h_stat), float(p_val)

        # Cleanup raw numpy arrays from return payload
        for gd in group_data:
            del gd["raw_values"]

        sig = "significant" if p < 0.05 else "not_significant"
        interpretation = (
            f"Statistically {sig} difference detected (p={p:.4e}) using {test_name}."
            if p < 0.05 else
            f"No statistically significant difference detected (p={p:.4f}) using {test_name}."
        )

        return {
            "test_name": test_name,
            "statistic": _safe(stat),
            "p_value": _safe(p),
            "significance": sig,
            "interpretation": interpretation,
            "groups": group_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Statistical test failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/dimensionality-reduction")
async def dimensionality_reduction(
    client_id: str,
    method: str = Form("pca"),
    features: str = Form(...),  # comma-separated feature names
    target_col: Optional[str] = Form(None),
    n_clusters: Optional[int] = Form(None),
):
    """Run PCA, t-SNE, or UMAP on selected numeric features."""
    try:
        from sklearn.decomposition import PCA
        from sklearn.preprocessing import StandardScaler
        from sklearn.cluster import KMeans
        
        df, _ = _load_df(client_id)
        feat_cols = [x.strip() for x in features.split(",") if x.strip() in df.columns]
        
        if len(feat_cols) < 2:
            raise HTTPException(status_code=400, detail="Select at least 2 features for dimensionality reduction")

        # dropna across feature space
        sub_df = df[feat_cols].dropna()
        if len(sub_df) < 5:
            raise HTTPException(status_code=400, detail="Too few rows (less than 5) without missing values in selected features")

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(sub_df.values)

        x_coords = []
        y_coords = []
        explained_var = []
        loadings = []

        if method == "pca":
            pca = PCA(n_components=2)
            coords = pca.fit_transform(X_scaled)
            x_coords = coords[:, 0].tolist()
            y_coords = coords[:, 1].tolist()
            explained_var = [float(x) for x in pca.explained_variance_ratio_]
            
            # loadings: feature weights on PCA dimensions
            for idx, f_name in enumerate(feat_cols):
                loadings.append({
                    "feature": f_name,
                    "pc1": _safe(float(pca.components_[0, idx])),
                    "pc2": _safe(float(pca.components_[1, idx])),
                })
        elif method == "tsne":
            from sklearn.manifold import TSNE
            # Use perplexity min of 5 or (len(X_scaled) - 1) / 3
            perp = min(30, max(5, (len(X_scaled) - 1) // 3))
            tsne = TSNE(n_components=2, perplexity=perp, random_state=42)
            coords = tsne.fit_transform(X_scaled)
            x_coords = coords[:, 0].tolist()
            y_coords = coords[:, 1].tolist()
        elif method == "umap":
            try:
                import umap
                reducer = umap.UMAP(n_components=2, random_state=42)
                coords = reducer.fit_transform(X_scaled)
                x_coords = coords[:, 0].tolist()
                y_coords = coords[:, 1].tolist()
            except ImportError:
                # Fallback to PCA if UMAP is not installed
                pca = PCA(n_components=2)
                coords = pca.fit_transform(X_scaled)
                x_coords = coords[:, 0].tolist()
                y_coords = coords[:, 1].tolist()
                explained_var = [float(x) for x in pca.explained_variance_ratio_]
                method = "pca (UMAP not available)"
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported method '{method}'")

        # Optional KMeans clustering
        cluster_labels = []
        if n_clusters and n_clusters > 1:
            km = KMeans(n_clusters=min(n_clusters, len(X_scaled)), random_state=42)
            cluster_labels = km.fit_predict(X_scaled).tolist()

        # Build coordinates payload
        points = []
        for i, idx in enumerate(sub_df.index):
            lbl = None
            if target_col and target_col in df.columns:
                lbl = _safe(df.loc[idx, target_col])
            elif cluster_labels:
                lbl = f"Cluster {cluster_labels[i]}"
            else:
                lbl = "Data"
                
            points.append({
                "row_idx": int(idx),
                "x": _safe(x_coords[i]),
                "y": _safe(y_coords[i]),
                "label": str(lbl)
            })

        return {
            "method": method,
            "points": points,
            "explained_variance": explained_var,
            "loadings": loadings,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Dimensionality reduction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/scatter-data")
async def get_scatter_data(client_id: str, col_x: str, col_y: str):
    """Fetch paired values of two columns for interactive scatter plotting and compute regression/correlation statistics."""
    try:
        import scipy.stats as sp_stats
        df, _ = _load_df(client_id)
        
        if col_x not in df.columns or col_y not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column not found in active dataset.")

        # Identify structural identifiers if they exist in the dataset to return them
        smiles_col = next((c for c in df.columns if c.lower() in ["smiles", "structure"]), None)
        id_col = next((c for c in df.columns if c.lower() in ["id", "cas", "cas_number", "chemical_name"]), None)

        cols_to_load = [col_x, col_y]
        if smiles_col and smiles_col not in cols_to_load:
            cols_to_load.append(smiles_col)
        if id_col and id_col not in cols_to_load:
            cols_to_load.append(id_col)

        valid_df = df[cols_to_load].dropna(subset=[col_x, col_y])
        if len(valid_df) < 3:
            raise HTTPException(status_code=400, detail="Too few matched data points (minimum 3 required) between selected variables.")

        x_vals = pd.to_numeric(valid_df[col_x], errors="coerce")
        y_vals = pd.to_numeric(valid_df[col_y], errors="coerce")
        
        # Filter rows where values are not numeric
        mask = x_vals.notna() & y_vals.notna()
        valid_df = valid_df[mask]
        x_vals = x_vals[mask]
        y_vals = y_vals[mask]

        if len(valid_df) < 3:
            raise HTTPException(status_code=400, detail="Selected columns must contain numeric values to compute correlations.")

        # Run linear regression & correlations
        slope, intercept, r_val, p_val, _ = sp_stats.linregress(x_vals, y_vals)
        spearman_rho, spearman_p = sp_stats.spearmanr(x_vals, y_vals)
        r2 = r_val ** 2

        # Interpret correlation strength
        abs_r = abs(r_val)
        direction = "positive" if r_val >= 0 else "negative"
        if abs_r >= 0.7:
            strength = "strong"
        elif abs_r >= 0.4:
            strength = "moderate"
        elif abs_r >= 0.1:
            strength = "weak"
        else:
            strength = "negligible"

        if strength == "negligible":
            verdict = "No significant correlation detected."
        else:
            verdict = f"Scientific indicator reveals a {strength} {direction} correlation (r={r_val:.3f}, p={p_val:.4f})."

        total_points = len(valid_df)
        max_ui_points = 2000
        if total_points > max_ui_points:
            step = total_points / max_ui_points
            indices = [int(i * step) for i in range(max_ui_points)]
            indices[-1] = total_points - 1
            
            sampled_df = valid_df.iloc[indices]
            sampled_x = x_vals.iloc[indices]
            sampled_y = y_vals.iloc[indices]
        else:
            sampled_df = valid_df
            sampled_x = x_vals
            sampled_y = y_vals

        points = []
        for idx in sampled_df.index:
            pt = {
                "x": _safe(float(sampled_x.loc[idx])),
                "y": _safe(float(sampled_y.loc[idx])),
                "label": str(sampled_df.loc[idx, id_col]) if id_col else f"Row {idx}"
            }
            if smiles_col:
                pt["smiles"] = str(sampled_df.loc[idx, smiles_col])
            points.append(pt)

        return {
            "col_x": col_x,
            "col_y": col_y,
            "r": _safe(r_val),
            "p_value": _safe(p_val),
            "r2": _safe(r2),
            "spearman_rho": _safe(spearman_rho),
            "slope": _safe(slope),
            "intercept": _safe(intercept),
            "verdict": verdict,
            "points": points
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Scatter data calculation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))



