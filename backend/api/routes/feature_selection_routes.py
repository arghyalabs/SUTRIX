"""
backend/api/routes/feature_selection_routes.py

SUTRIX V5 — Step 11: Descriptor & Endpoint Selection
Endpoint diagnostics and cascading feature selection pipeline.
"""

import logging
import numpy as np
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.workspace_registry import registry

logger = logging.getLogger("sdo.api.feature_selection")

router = APIRouter(prefix="/api/features", tags=["feature-selection"])


def _require_subgroup(context, client_id: str):
    if not getattr(context, 'subgroup_selected', False):
        raise HTTPException(
            status_code=400,
            detail="Feature selection requires a selected subgroup. Complete Step 5 first."
        )


@router.get("/{client_id}/endpoint-diagnostics")
async def endpoint_diagnostics(client_id: str):
    """
    Analyzes the endpoint column in the active subgroup dataset.
    Returns: endpoint type, distribution, class balance, outlier count, missingness, suitability.
    """
    context = registry.get_context(client_id)
    _require_subgroup(context, client_id)
    
    try:
        df = context.load_active_dataset()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    mappings = getattr(context, 'mappings', {}) or {}
    role_to_col = {v: k for k, v in mappings.items()}
    endpoint_col = role_to_col.get('endpoint') or role_to_col.get('activity') or role_to_col.get('target')
    
    if not endpoint_col or endpoint_col not in df.columns:
        # Try to find numerically
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        endpoint_col = numeric_cols[-1] if numeric_cols else None
    
    if not endpoint_col:
        raise HTTPException(status_code=400, detail="No endpoint column identified in dataset mappings.")
    
    series = df[endpoint_col]
    total = len(series)
    missing_count = int(series.isna().sum())
    missing_pct = round((missing_count / total) * 100, 2) if total > 0 else 0.0
    non_null = series.dropna()
    
    unique_vals = non_null.nunique()
    
    warnings = []
    
    # Determine endpoint type
    if unique_vals <= 2:
        endpoint_type = "binary_classification"
        class_counts = non_null.astype(str).value_counts()
        class_balance = {str(k): round(v / len(non_null), 3) for k, v in class_counts.items()}
        ratio = max(class_counts.values) / min(class_counts.values) if len(class_counts) > 1 else 1.0
        imbalance_warning = ratio > 3.0
        if imbalance_warning:
            warnings.append(f"Class imbalance detected (ratio: {ratio:.1f}:1). Consider SMOTE or class weights.")
        distribution_info = {"class_balance": class_balance, "imbalance_ratio": round(float(ratio), 2)}
        log_transform_recommended = False
        modeling_suitability = "caution" if imbalance_warning else "suitable"
    elif unique_vals <= 10:
        endpoint_type = "multiclass_classification"
        class_counts = non_null.astype(str).value_counts()
        class_balance = {str(k): round(v / len(non_null), 3) for k, v in class_counts.items()}
        distribution_info = {"class_balance": class_balance, "n_classes": int(unique_vals)}
        log_transform_recommended = False
        modeling_suitability = "suitable"
    else:
        endpoint_type = "regression"
        numeric_series = non_null.astype(float)
        distribution_info = {
            "min": round(float(numeric_series.min()), 4),
            "max": round(float(numeric_series.max()), 4),
            "mean": round(float(numeric_series.mean()), 4),
            "median": round(float(numeric_series.median()), 4),
            "std": round(float(numeric_series.std()), 4),
        }
        # Check skewness for log transform recommendation
        from scipy import stats as scipy_stats
        skewness = float(scipy_stats.skew(numeric_series.values))
        log_transform_recommended = abs(skewness) > 1.5
        if log_transform_recommended:
            direction = "right" if skewness > 0 else "left"
            warnings.append(f"{direction.capitalize()}-skewed distribution (skewness: {skewness:.2f}) — log transform recommended before modeling.")
        distribution_info["skewness"] = round(skewness, 4)
        
        # Outlier detection (IQR method)
        q1, q3 = numeric_series.quantile(0.25), numeric_series.quantile(0.75)
        iqr = q3 - q1
        outlier_mask = (numeric_series < q1 - 1.5 * iqr) | (numeric_series > q3 + 1.5 * iqr)
        outlier_count = int(outlier_mask.sum())
        outlier_pct = round((outlier_count / len(non_null)) * 100, 2)
        distribution_info["outlier_count"] = outlier_count
        distribution_info["outlier_pct"] = outlier_pct
        if outlier_pct > 5.0:
            warnings.append(f"High outlier rate ({outlier_pct:.1f}%) — review outliers before modeling.")
        modeling_suitability = "suitable"
    
    if missing_pct > 10.0:
        warnings.append(f"High endpoint missingness ({missing_pct:.1f}%) — this will reduce effective dataset size.")
    
    return {
        "endpoint_column": endpoint_col,
        "endpoint_type": endpoint_type,
        "total_rows": total,
        "missing_count": missing_count,
        "missing_endpoint_pct": missing_pct,
        "unique_values": int(unique_vals),
        "distribution": distribution_info,
        "log_transform_recommended": log_transform_recommended,
        "modeling_suitability": modeling_suitability,
        "warnings": warnings,
    }


class FeatureSelectionPayload(BaseModel):
    client_id: str
    subgroup_ids: Optional[List[str]] = None
    variance_threshold: float = 0.01
    correlation_threshold: float = 0.90
    mutual_info_k: int = 200
    rfe_k: int = 50


@router.post("/pipeline")
async def run_feature_selection_pipeline(payload: FeatureSelectionPayload):
    """
    Runs the full feature selection cascade on the descriptor matrix:
    1. Variance filter
    2. Correlation filter
    3. Mutual Information Top-K
    4. RFE
    5. Feature Importance ranking
    """
    context = registry.get_context(payload.client_id)
    _require_subgroup(context, payload.client_id)
    
    descriptor_path = getattr(context, 'descriptor_dataframe_path', None) or getattr(context, 'parquet_path', None)
    if not descriptor_path:
        raise HTTPException(
            status_code=400,
            detail="No descriptor matrix found. Run Step 8 (Descriptor Enrichment) first."
        )
    
    import pandas as pd
    from sklearn.feature_selection import VarianceThreshold, SelectKBest, mutual_info_regression, mutual_info_classif, RFE
    from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
    from sklearn.impute import SimpleImputer
    
    try:
        df = pd.read_parquet(descriptor_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load descriptor matrix: {e}")

    if getattr(payload, "subgroup_ids", None):
        engine = registry.get_hierarchy_engine(payload.client_id)
        if engine:
            slices = []
            for node_id in payload.subgroup_ids:
                if node_id in engine.node_details:
                    detail = engine.node_details[node_id]
                    filters = {**detail.get("metadata", {}).get("inherited_filters", {}), **detail.get("metadata", {}).get("applied_filter", {})}
                    df_slice = df
                    for col, val in filters.items():
                        if col in df_slice.columns:
                            df_slice = df_slice[df_slice[col].astype(str) == str(val)]
                    slices.append(df_slice)
            if slices:
                df = pd.concat(slices).drop_duplicates()
                logger.info(f"[{payload.client_id}] Sliced dataset for subgroups {payload.subgroup_ids}. New size: {len(df)}")
    
    mappings = getattr(context, 'mappings', {}) or {}
    role_to_col = {v: k for k, v in mappings.items()}
    endpoint_col = role_to_col.get('endpoint') or role_to_col.get('activity')
    
    if not endpoint_col or endpoint_col not in df.columns:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        endpoint_col = numeric_cols[-1] if numeric_cols else None
    
    if not endpoint_col:
        raise HTTPException(status_code=400, detail="No endpoint column found.")
    
    feature_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c != endpoint_col]
    initial_count = len(feature_cols)
    
    X = df[feature_cols].values
    y_series = df[endpoint_col].dropna()
    valid_idx = df[endpoint_col].dropna().index
    X = df.loc[valid_idx, feature_cols].values
    y = y_series.values
    
    # Impute
    imputer = SimpleImputer(strategy='median')
    X = imputer.fit_transform(X)
    
    cascade_steps = [{"step": "Initial", "descriptors": initial_count, "removed": 0}]
    
    # Step 1: Variance filter
    vt = VarianceThreshold(threshold=payload.variance_threshold)
    X = vt.fit_transform(X)
    after_variance = X.shape[1]
    cascade_steps.append({"step": f"Variance Filter (≥{payload.variance_threshold})", "descriptors": after_variance, "removed": initial_count - after_variance})
    selected_cols = [feature_cols[i] for i in range(len(feature_cols)) if vt.get_support()[i]]
    
    # Step 2: Correlation filter
    import pandas as pd
    df_temp = pd.DataFrame(X, columns=selected_cols)
    corr_matrix = df_temp.corr().abs()
    upper = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
    to_drop = [c for c in upper.columns if any(upper[c] > payload.correlation_threshold)]
    df_temp = df_temp.drop(columns=to_drop)
    X = df_temp.values
    selected_cols = df_temp.columns.tolist()
    after_correlation = X.shape[1]
    cascade_steps.append({"step": f"Correlation Filter (≤{payload.correlation_threshold})", "descriptors": after_correlation, "removed": after_variance - after_correlation})
    
    # Step 3: Mutual Information
    k_mi = min(payload.mutual_info_k, after_correlation)
    task_type = MLBenchmarkEngine.detect_task_type(y_series) if 'MLBenchmarkEngine' in dir() else 'regression'
    try:
        from backend.core.ml_benchmark_engine import MLBenchmarkEngine
        task_type = MLBenchmarkEngine.detect_task_type(y_series)
    except:
        task_type = 'regression'
    
    mi_func = mutual_info_classif if 'classification' in task_type else mutual_info_regression
    selector_mi = SelectKBest(mi_func, k=k_mi)
    X = selector_mi.fit_transform(X, y[:len(X)] if len(y) > len(X) else y)
    selected_cols = [selected_cols[i] for i in range(len(selected_cols)) if selector_mi.get_support()[i]]
    after_mi = X.shape[1]
    cascade_steps.append({"step": f"Mutual Information Top-{k_mi}", "descriptors": after_mi, "removed": after_correlation - after_mi})
    
    # Step 4: RFE
    k_rfe = min(payload.rfe_k, after_mi)
    if k_rfe < after_mi:
        if 'classification' in task_type:
            estimator = RandomForestClassifier(n_estimators=50, random_state=42)
        else:
            estimator = RandomForestRegressor(n_estimators=50, random_state=42)
        rfe = RFE(estimator, n_features_to_select=k_rfe)
        rfe.fit(X, y[:len(X)] if len(y) > len(X) else y)
        selected_cols = [selected_cols[i] for i in range(len(selected_cols)) if rfe.support_[i]]
        X = X[:, rfe.support_]
        after_rfe = X.shape[1]
    else:
        after_rfe = after_mi
    cascade_steps.append({"step": f"RFE (k={k_rfe})", "descriptors": after_rfe, "removed": after_mi - after_rfe})
    
    # Step 5: Feature importance ranking
    if 'classification' in task_type:
        rf = RandomForestClassifier(n_estimators=100, random_state=42)
    else:
        rf = RandomForestRegressor(n_estimators=100, random_state=42)
    
    try:
        rf.fit(X, y[:len(X)] if len(y) > len(X) else y)
        importances = rf.feature_importances_
        importance_ranking = [
            {"feature": col, "importance": round(float(imp), 6)}
            for col, imp in sorted(zip(selected_cols, importances), key=lambda x: x[1], reverse=True)
        ]
    except Exception as e:
        importance_ranking = [{"feature": col, "importance": 0.0} for col in selected_cols]
    
    
    results = {
        "success": True,
        "initial_descriptors": initial_count,
        "final_descriptors": after_rfe,
        "final_features": selected_cols,
        "cascade_steps": cascade_steps,
        "importance_ranking": importance_ranking[:20],  # top 20
        "task_type": task_type,
        "endpoint_column": endpoint_col,
    }
    
    setattr(context, 'feature_selection_results', results)
    context.touch()
    
    return results

@router.get("/{client_id}/export-package")
async def get_export_package(client_id: str):
    """
    Generates and returns the final modeling package ZIP.
    """
    context = registry.get_context(client_id)
    _require_subgroup(context, client_id)
    
    feature_results = getattr(context, 'feature_selection_results', None)
    if not feature_results:
        raise HTTPException(status_code=400, detail="Run the feature selection pipeline first.")
        
    selected_features = feature_results.get("final_features", [])
    
    try:
        from backend.exports.modeling_package_generator import ModelingPackageGenerator
        zip_bytes = ModelingPackageGenerator.generate(context, selected_features=selected_features)
    except Exception as e:
        logger.error(f"Failed to generate export package: {e}")
        raise HTTPException(status_code=500, detail=f"Export generation failed: {e}")
        
    from fastapi import Response
    safe_name = context.subgroup_metadata.get('name', 'subgroup') if hasattr(context, 'subgroup_metadata') else 'subgroup'
    safe_name = "".join(c if c.isalnum() or c in ('_', '-') else '_' for c in safe_name)
    
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=SUTRIX_Modeling_Package_{safe_name}.zip"}
    )


@router.get("/{client_id}/cascade-summary")
async def get_cascade_summary(client_id: str):
    """Returns the stored cascade summary from the last pipeline run."""
    context = registry.get_context(client_id)
    feature_results = getattr(context, 'feature_selection_results', None)
    if not feature_results:
        raise HTTPException(status_code=404, detail="No feature selection results found. Run /pipeline first.")
    return feature_results
