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
from fastapi import APIRouter, HTTPException, UploadFile, File
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

@router.post("/{client_id}/upload")
async def upload_dataset_test(client_id: str, file: UploadFile = File(...)):
    """Synchronous upload specifically for V6 testing/standalone studio flow."""
    import io
    content = await file.read()
    fname = file.filename or "dataset.csv"
    try:
        df = pd.read_parquet(io.BytesIO(content)) if fname.endswith(".parquet") else pd.read_csv(io.BytesIO(content))
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
    context.touch(save_to_disk=True)
    return {"status": "ok", "filename": fname, "rows": len(df), "cols": len(df.columns)}


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
    context.touch(save_to_disk=True)

    return {"status": "ok", "filename": "qsar_demo_dataset.csv", "rows": len(df), "cols": len(df.columns)}


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
    """Per-column missing value analysis with patterns."""
    try:
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

        # MCAR pattern: check if missingness is correlated with other columns
        numeric_df = df.select_dtypes(include=[np.number])
        miss_corr = []
        if len(numeric_df.columns) >= 2:
            miss_flags = df.isna().astype(int)
            for col_a in miss_flags.columns[:10]:  # limit for performance
                for col_b in numeric_df.columns[:10]:
                    if col_a != col_b and miss_flags[col_a].sum() > 0:
                        try:
                            corr = float(miss_flags[col_a].corr(numeric_df[col_b]))
                            if not math.isnan(corr) and abs(corr) > 0.2:
                                miss_corr.append({
                                    "missing_col": col_a,
                                    "correlated_with": col_b,
                                    "correlation": round(corr, 3),
                                })
                        except Exception:
                            pass

        return {
            "columns": results,
            "total_missing": sum(r["missing_count"] for r in results),
            "columns_with_missing": sum(1 for r in results if r["missing_count"] > 0),
            "missingness_correlations": miss_corr[:10],
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
    """Compute correlation matrix for all numeric columns. method: pearson|spearman|kendall."""
    try:
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

        # Build matrix for heatmap
        matrix = []
        for i, col_a in enumerate(cols):
            for j, col_b in enumerate(cols):
                val = corr.loc[col_a, col_b]
                matrix.append({
                    "col_a": col_a,
                    "col_b": col_b,
                    "i": i,
                    "j": j,
                    "value": _safe(val),
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
        strong.sort(key=lambda x: -abs(x["correlation"]))

        return {
            "columns": cols,
            "method": method,
            "matrix": matrix,
            "strong_correlations": strong,
            "col_count": len(cols),
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
    """Full distribution analysis for a single column: histogram, KDE, normality tests."""
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
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Distribution failed: {e}", exc_info=True)
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
