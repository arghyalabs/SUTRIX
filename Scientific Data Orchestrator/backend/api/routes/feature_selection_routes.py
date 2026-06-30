"""
backend/api/routes/feature_selection_routes.py

SUTRIX V5 — Step 11 & Step 13 Routes
Descriptor & Endpoint Selection and Modeling Dataset Registry.
"""

import logging
import os
import json
import uuid
import datetime
import shutil
import io
import zipfile
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from backend.core.workspace_registry import registry

logger = logging.getLogger("sdo.api.feature_selection")

router = APIRouter(prefix="/api/features", tags=["feature-selection"])


def _require_subgroup(context, client_id: str):
    if not getattr(context, 'subgroup_selected', False):
        raise HTTPException(
            status_code=400,
            detail="Requires a selected subgroup. Complete Step 5 first."
        )


@router.get("/{client_id}/endpoint-diagnostics")
async def endpoint_diagnostics(client_id: str):
    """
    Analyzes the endpoint column in the active subgroup dataset.
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
        endpoint_type = "continuous"
        numeric_series = non_null.astype(float)
        distribution_info = {
            "min": round(float(numeric_series.min()), 4),
            "max": round(float(numeric_series.max()), 4),
            "mean": round(float(numeric_series.mean()), 4),
            "median": round(float(numeric_series.median()), 4),
            "std": round(float(numeric_series.std()), 4),
        }
        from scipy import stats as scipy_stats
        skewness = float(scipy_stats.skew(numeric_series.values))
        log_transform_recommended = abs(skewness) > 1.5
        if log_transform_recommended:
            direction = "right" if skewness > 0 else "left"
            warnings.append(f"{direction.capitalize()}-skewed distribution (skewness: {skewness:.2f}) — log transform recommended.")
        distribution_info["skewness"] = round(skewness, 4)
        
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
        "recommended_algorithms": ["Random Forest", "XGBoost", "ExtraTrees"] if endpoint_type == "continuous" else ["Random Forest Classifier", "SVM", "Gradient Boosting"],
        "difficulty_score": 65 if modeling_suitability == "caution" else 30,
        "predictability_score": 75 if endpoint_type == "continuous" else 85
    }


class FeatureSelectionPayload(BaseModel):
    client_id: str
    subgroup_ids: Optional[List[str]] = None
    variance_threshold: float = 0.01
    correlation_threshold: float = 0.90
    mutual_info_k: int = 200
    rfe_k: int = 50
    descriptor_families: Optional[List[str]] = None

class GenerateDatasetPayload(BaseModel):
    """Payload for generate-dataset route (client_id comes from path, not body)."""
    subgroup_ids: Optional[List[str]] = None
    variance_threshold: float = 0.01
    correlation_threshold: float = 0.90
    mutual_info_k: int = 200
    rfe_k: int = 50
    descriptor_families: Optional[List[str]] = None


@router.post("/pipeline")
async def run_feature_selection_pipeline(payload: FeatureSelectionPayload):
    """
    Runs the full feature selection cascade on the descriptor matrix.
    """
    context = registry.get_context(payload.client_id)
    _require_subgroup(context, payload.client_id)
    
    descriptor_path = getattr(context, 'descriptor_dataframe_path', None) or getattr(context, 'parquet_path', None)
    if not descriptor_path:
        raise HTTPException(status_code=400, detail="No descriptor matrix found. Run Step 8 (Descriptor Enrichment) first.")
    
    from sklearn.feature_selection import VarianceThreshold, SelectKBest, mutual_info_regression, mutual_info_classif, RFE
    from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
    from sklearn.impute import SimpleImputer
    
    try:
        df = pd.read_parquet(descriptor_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load descriptor matrix: {e}")

    if getattr(payload, "subgroup_ids", None):
        setattr(context, 'active_subgroups', payload.subgroup_ids)
        engine = context.hierarchy_engine if context else None
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
    
    mappings = getattr(context, 'mappings', {}) or {}
    role_to_col = {v: k for k, v in mappings.items()}
    endpoint_col = role_to_col.get('endpoint') or role_to_col.get('activity')
    
    if not endpoint_col or endpoint_col not in df.columns:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        endpoint_col = numeric_cols[-1] if numeric_cols else None
    if not endpoint_col:
        raise HTTPException(status_code=400, detail="No endpoint column found.")
    
    # Robustly filter to only truly numeric feature columns
    # Handles Arrow string columns misidentified as numeric in some Parquet schemas
    candidate_feature_cols = [c for c in df.columns if c != endpoint_col]
    feature_cols = []
    for col in candidate_feature_cols:
        try:
            numeric_data = pd.to_numeric(df[col], errors='raise')
            feature_cols.append(col)
        except (ValueError, TypeError):
            pass  # Skip columns that cannot be converted to numeric
    initial_count = len(feature_cols)
    if initial_count == 0:
        raise HTTPException(status_code=400, detail="No numeric descriptor columns found. Run Step 8 (Descriptor Enrichment) first.")
    
    y_series = df[endpoint_col].dropna()
    
    try:
        from backend.core.ml_benchmark_engine import MLBenchmarkEngine
        task_type = MLBenchmarkEngine.detect_task_type(y_series)
    except Exception:
        task_type = 'regression'
        
    if 'classification' in task_type:
        from sklearn.preprocessing import LabelEncoder
        y_series = y_series.astype(str)
        y = LabelEncoder().fit_transform(y_series)
        valid_idx = y_series.index
    else:
        y_series = pd.to_numeric(y_series, errors='coerce').dropna()
        if len(y_series) == 0:
            raise HTTPException(status_code=400, detail=f"Endpoint column '{endpoint_col}' cannot be converted to numeric values.")
        y = y_series.values
        valid_idx = y_series.index

    X = df.loc[valid_idx, feature_cols].apply(pd.to_numeric, errors='coerce').fillna(0).values
    
    imputer = SimpleImputer(strategy='median')
    X = imputer.fit_transform(X)
    
    cascade_steps = [{"step": "Initial", "descriptors": initial_count, "removed": 0}]
    
    # 1. Variance
    vt = VarianceThreshold(threshold=payload.variance_threshold)
    X = vt.fit_transform(X)
    after_variance = X.shape[1]
    cascade_steps.append({"step": f"Variance Filter (≥{payload.variance_threshold})", "descriptors": after_variance, "removed": initial_count - after_variance})
    selected_cols = [feature_cols[i] for i in range(len(feature_cols)) if vt.get_support()[i]]
    
    # 2. Correlation
    df_temp = pd.DataFrame(X, columns=selected_cols)
    corr_matrix = df_temp.corr().abs()
    upper = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
    to_drop = [c for c in upper.columns if any(upper[c] > payload.correlation_threshold)]
    df_temp = df_temp.drop(columns=to_drop)
    X = df_temp.values
    selected_cols = df_temp.columns.tolist()
    after_correlation = X.shape[1]
    cascade_steps.append({"step": f"Correlation Filter (≤{payload.correlation_threshold})", "descriptors": after_correlation, "removed": after_variance - after_correlation})
    
    # 3. MI
    k_mi = min(payload.mutual_info_k, after_correlation)
    
    mi_func = mutual_info_classif if 'classification' in task_type else mutual_info_regression
    selector_mi = SelectKBest(mi_func, k=k_mi)
    X = selector_mi.fit_transform(X, y[:len(X)] if len(y) > len(X) else y)
    selected_cols = [selected_cols[i] for i in range(len(selected_cols)) if selector_mi.get_support()[i]]
    after_mi = X.shape[1]
    cascade_steps.append({"step": f"Mutual Information Top-{k_mi}", "descriptors": after_mi, "removed": after_correlation - after_mi})
    
    # 4. RFE
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
    
    # 5. Importance
    if 'classification' in task_type:
        rf = RandomForestClassifier(n_estimators=100, random_state=42)
    else:
        rf = RandomForestRegressor(n_estimators=100, random_state=42)
    
    try:
        rf.fit(X, y[:len(X)] if len(y) > len(X) else y)
        importances = rf.feature_importances_
        importance_ranking = [
            {"feature": col, "importance": round(float(imp), 6), "family": "RDKit"}
            for col, imp in sorted(zip(selected_cols, importances), key=lambda x: x[1], reverse=True)
        ]
    except Exception as e:
        importance_ranking = [{"feature": col, "importance": 0.0, "family": "RDKit"} for col in selected_cols]
    
    results = {
        "success": True,
        "initial_descriptors": initial_count,
        "final_descriptors": after_rfe,
        "final_features": selected_cols,
        "cascade_steps": cascade_steps,
        "importance_ranking": importance_ranking[:20],
        "task_type": task_type,
        "endpoint_column": endpoint_col,
        "total_rows": len(y),
        "total_compounds": len(df.drop_duplicates(
            subset=[
                mappings.get('compound_id')
                or next((c for c in ['SMILES', 'smiles', 'InChI', 'CAS'] if c in df.columns), df.columns[0])
            ]
        ))
    }
    
    setattr(context, 'feature_selection_results', results)
    context.touch()
    
    return results

# ─── DATASET REGISTRY & GENERATION (STEP 11 -> 13) ──────────────────────────

def _get_registry_path(client_id: str):
    """Returns the modeling_datasets directory for this workspace."""
    ctx = registry.get_context(client_id)
    # workspace_dir is already "workspaces/{client_id}" — use it directly
    workspace_dir = getattr(ctx, 'workspace_dir', os.path.join("workspaces", client_id))
    reg_dir = os.path.join(workspace_dir, "modeling_datasets")
    os.makedirs(reg_dir, exist_ok=True)
    return reg_dir

def _load_registry(client_id: str):
    reg_dir = _get_registry_path(client_id)
    reg_file = os.path.join(reg_dir, "registry.json")
    if os.path.exists(reg_file):
        with open(reg_file, "r") as f:
            return json.load(f)
    return {"datasets": []}

def _save_registry(client_id: str, data: dict):
    reg_dir = _get_registry_path(client_id)
    reg_file = os.path.join(reg_dir, "registry.json")
    with open(reg_file, "w") as f:
        json.dump(data, f, indent=2)

@router.post("/{client_id}/generate-dataset")
async def generate_dataset(client_id: str, payload: GenerateDatasetPayload):
    """
    Creates a modeling-ready dataset using the results from the feature selection pipeline.
    Saves it in workspace/modeling_datasets/[Dataset_vX]/ with lineage and metadata.
    Updates workspace/modeling_datasets/registry.json.
    Note: client_id comes from path parameter, NOT from request body.
    """
    context = registry.get_context(client_id)
    results = getattr(context, 'feature_selection_results', None)
    if not results:
        raise HTTPException(status_code=400, detail="Run optimization cascade first.")
    
    descriptor_path = getattr(context, 'descriptor_dataframe_path', None) or getattr(context, 'parquet_path', None)
    if not descriptor_path or not os.path.exists(descriptor_path):
        raise HTTPException(status_code=400, detail="Descriptor dataset not found on disk.")
    try:
        df = pd.read_parquet(descriptor_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read dataset: {e}")
    
    # Filter columns to final features + endpoint + identifiers
    mappings = getattr(context, 'mappings', {}) or {}
    endpoint_col = results["endpoint_column"]
    id_col = mappings.get('compound_id') or ('SMILES' if 'SMILES' in df.columns else None)
    
    keep_cols = [c for c in [id_col, endpoint_col] if c] + results["final_features"]
    keep_cols = [c for c in keep_cols if c in df.columns]
    
    final_df = df[keep_cols].dropna(subset=[endpoint_col])
    
    # Registry and Versioning
    reg_data = _load_registry(client_id)
    # Get subgroup name safely from multiple possible context attributes
    subgroup_name = (
        getattr(context, 'subgroup_name', None)
        or (context.subgroup_metadata.get("name") if hasattr(context, "subgroup_metadata") and isinstance(context.subgroup_metadata, dict) else None)
        or getattr(context, 'active_subgroup_name', None)
        or "Active_Subgroup"
    )
    
    existing_versions = [d["version_num"] for d in reg_data["datasets"] if d["subgroup"] == subgroup_name]
    next_ver = max(existing_versions) + 1 if existing_versions else 1
    version_name = f"{subgroup_name.replace(' ', '_')}_v{next_ver}"
    
    reg_dir = _get_registry_path(client_id)
    ds_dir = os.path.join(reg_dir, version_name)
    os.makedirs(ds_dir, exist_ok=True)
    
    # Save files
    parquet_path = os.path.join(ds_dir, "dataset.parquet")
    csv_path = os.path.join(ds_dir, "dataset.csv")
    final_df.to_parquet(parquet_path, engine="pyarrow")
    final_df.to_csv(csv_path, index=False)
    
    # Compute dynamic AI/QSAR readiness scores from pipeline results
    total_rows = results["total_rows"]
    final_descriptors = results["final_descriptors"]
    samples_per_feature = total_rows / max(final_descriptors, 1)
    missing_pct = 0  # Already filtered by dropna on endpoint
    task = results["task_type"]
    base_score = 75 if task == "continuous" else 80
    spf_bonus = min(20, samples_per_feature * 2)  # up to +20 for high sample density
    ai_score = int(min(99, base_score + spf_bonus))
    qsar_score = int(min(99, ai_score * 0.95))
    oecd_ready = ai_score >= 70 and samples_per_feature >= 5
    
    meta = {
        "version_name": version_name,
        "version_num": next_ver,
        "subgroup": subgroup_name,
        "endpoint": endpoint_col,
        "task_type": results["task_type"],
        "rows": results["total_rows"],
        "compounds": results["total_compounds"],
        "descriptors_original": results["initial_descriptors"],
        "descriptors_selected": results["final_descriptors"],
        "descriptor_families": payload.descriptor_families or ["RDKit", "Physicochemical"],
        "feature_selection": {
            "variance": payload.variance_threshold,
            "correlation": payload.correlation_threshold,
            "mi_top_k": payload.mutual_info_k,
            "rfe": payload.rfe_k
        },
        "lineage": {
            "source_dataset": getattr(context, "original_filename", "unknown"),
            "hierarchy_path": [],
            "recovery_performed": getattr(context, "recovery_applied", False)
        },
        "ai_ready_score": ai_score,
        "qsar_ready_score": qsar_score,
        "oecd_ready": oecd_ready,
        "created_at": datetime.datetime.now().isoformat()
    }
    
    with open(os.path.join(ds_dir, "metadata.json"), "w") as f:
        json.dump(meta, f, indent=2)
        
    with open(os.path.join(ds_dir, "diagnostics.json"), "w") as f:
        json.dump({"importance_ranking": results["importance_ranking"], "cascade": results["cascade_steps"]}, f, indent=2)
    
    # Update registry
    reg_data["datasets"].append(meta)
    _save_registry(client_id, reg_data)
    
    return {"status": "success", "version_name": version_name, "metadata": meta}


@router.get("/{client_id}/registry")
async def get_registry(client_id: str):
    return _load_registry(client_id)


@router.delete("/{client_id}/registry/{version_name}")
async def delete_registry_dataset(client_id: str, version_name: str):
    reg_data = _load_registry(client_id)
    ds = next((d for d in reg_data["datasets"] if d["version_name"] == version_name), None)
    if not ds: raise HTTPException(404, "Dataset not found")
    
    reg_data["datasets"] = [d for d in reg_data["datasets"] if d["version_name"] != version_name]
    _save_registry(client_id, reg_data)
    
    ds_dir = os.path.join(_get_registry_path(client_id), version_name)
    if os.path.exists(ds_dir): shutil.rmtree(ds_dir)
    return {"status": "success"}


@router.get("/{client_id}/registry/{version_name}/download")
async def download_registry_dataset(client_id: str, version_name: str, format: str = "parquet"):
    ds_dir = os.path.join(_get_registry_path(client_id), version_name)
    if not os.path.exists(ds_dir): raise HTTPException(404, "Dataset directory not found")
    
    if format == "zip":
        mem_zip = io.BytesIO()
        with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(ds_dir):
                for file in files:
                    zf.write(os.path.join(root, file), arcname=file)
        return Response(mem_zip.getvalue(), media_type="application/zip", headers={"Content-Disposition": f"attachment; filename={version_name}.zip"})
    else:
        file_path = os.path.join(ds_dir, f"dataset.{format}")
        if not os.path.exists(file_path): raise HTTPException(404, f"Format {format} not available")
        with open(file_path, "rb") as f:
            content = f.read()
        mime = "text/csv" if format == "csv" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if format == "xlsx" else "application/octet-stream"
        return Response(content, media_type=mime, headers={"Content-Disposition": f"attachment; filename={version_name}.{format}"})


@router.get("/{client_id}/export-active")
async def export_active_dataset(client_id: str, format: str = "csv", subgroups: Optional[str] = None):
    context = registry.get_context(client_id)
    descriptor_path = getattr(context, 'descriptor_dataframe_path', None) or getattr(context, 'parquet_path', None)
    if not descriptor_path or not os.path.exists(descriptor_path): raise HTTPException(400, "No active dataset found.")
    try:
        df = pd.read_parquet(descriptor_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read active dataset: {e}")
    
    engine = getattr(context, 'hierarchy_engine', None)
    
    if not subgroups:
        # Check if they set active subgroups in Step 11
        active_subgroups = getattr(context, 'active_subgroups', None)
        if active_subgroups:
            subgroups = ",".join(active_subgroups)
            
    if subgroups and engine:
        subgroup_ids = [s.strip() for s in subgroups.split(',')]
        slices = []
        for node_id in subgroup_ids:
            if node_id in getattr(engine, 'node_details', {}):
                detail = engine.node_details[node_id]
                filters = {
                    **detail.get("metadata", {}).get("inherited_filters", {}),
                    **detail.get("metadata", {}).get("applied_filter", {})
                }
                df_slice = df.copy()
                for col, val in filters.items():
                    if col in df_slice.columns:
                        df_slice = df_slice[df_slice[col].astype(str) == str(val)]
                slices.append(df_slice)
        if slices:
            df = pd.concat(slices, ignore_index=True).drop_duplicates()
        else:
            df = df.iloc[0:0]
    else:
        # Filter by the currently active subgroup node if it exists
        active_node_id = getattr(context, 'active_node', None)
        if engine and active_node_id and active_node_id in getattr(engine, 'node_details', {}):
            detail = engine.node_details[active_node_id]
            filters = {
                **detail.get("metadata", {}).get("inherited_filters", {}),
                **detail.get("metadata", {}).get("applied_filter", {})
            }
            for col, val in filters.items():
                if col in df.columns:
                    df = df[df[col].astype(str) == str(val)]
    
    if format == "csv":
        return Response(df.to_csv(index=False), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=active_dataset.csv"})
    elif format == "parquet":
        return Response(df.to_parquet(), media_type="application/octet-stream", headers={"Content-Disposition": "attachment; filename=active_dataset.parquet"})
    elif format == "xlsx":
        import io
        b = io.BytesIO()
        df.to_excel(b, index=False)
        return Response(b.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=active_dataset.xlsx"})
    elif format == "zip":
        import io
        import zipfile
        mem_zip = io.BytesIO()
        with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("active_dataset.csv", df.to_csv(index=False))
        return Response(mem_zip.getvalue(), media_type="application/zip", headers={"Content-Disposition": "attachment; filename=active_dataset.zip"})
    raise HTTPException(400, "Unsupported format")


class BulkExportPayload(BaseModel):
    subgroup_ids: List[str]
    format: str

@router.post("/{client_id}/export-subgroups")
async def export_subgroups(client_id: str, payload: BulkExportPayload):
    """Bulk export selected subgroups as a structured ZIP."""
    context = registry.get_context(client_id)
    descriptor_path = getattr(context, 'descriptor_dataframe_path', None) or getattr(context, 'parquet_path', None)
    
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        manifest = {"exported_subgroups": payload.subgroup_ids, "format": payload.format}
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        
        if descriptor_path and os.path.exists(descriptor_path):
            df = pd.read_parquet(descriptor_path)
            engine = getattr(context, 'hierarchy_engine', None)
            
            for node_id in payload.subgroup_ids:
                try:
                    df_slice = df
                    if engine and node_id in getattr(engine, 'node_details', {}):
                        detail = engine.node_details[node_id]
                        filters = {
                            **detail.get("metadata", {}).get("inherited_filters", {}),
                            **detail.get("metadata", {}).get("applied_filter", {})
                        }
                        for col, val in filters.items():
                            if col in df.columns:
                                df_slice = df_slice[df_slice[col].astype(str) == str(val)]
                    
                    safe_name = "".join(c if c.isalnum() or c in ('_', '-') else '_' for c in node_id)
                    if payload.format in ('csv', 'zip'):
                        zf.writestr(f"{safe_name}/dataset.csv", df_slice.to_csv(index=False))
                    if payload.format in ('parquet', 'zip'):
                        buf = io.BytesIO()
                        df_slice.to_parquet(buf)
                        zf.writestr(f"{safe_name}/dataset.parquet", buf.getvalue())
                    if payload.format in ('xlsx', 'excel', 'zip'):
                        buf = io.BytesIO()
                        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
                            df_slice.to_excel(writer, sheet_name="Subgroup Data", index=False)
                        zf.writestr(f"{safe_name}/dataset.xlsx", buf.getvalue())
                    zf.writestr(f"{safe_name}/metadata.json", json.dumps({
                        "node_id": node_id,
                        "rows": len(df_slice),
                        "exported_at": datetime.datetime.now().isoformat()
                    }, indent=2))
                except Exception as e:
                    logger.warning(f"Failed to export subgroup {node_id}: {e}")
        else:
            zf.writestr("README.txt", "Note: Run Descriptor Enrichment (Step 8) to enable per-subgroup exports.")
    
    mem_zip.seek(0)
    return Response(
        mem_zip.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=bulk_subgroup_export.zip"}
    )

@router.get("/{client_id}/cascade-summary")
async def get_cascade_summary(client_id: str):
    context = registry.get_context(client_id)
    feature_results = getattr(context, 'feature_selection_results', None)
    if not feature_results: raise HTTPException(404, "No feature selection results found.")
    return feature_results
