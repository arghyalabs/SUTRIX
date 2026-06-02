"""
backend/api/routes/simple_analysis_routes.py

Router for the advanced Branch Explorer, scientific quality dashboard, and branch report exports.
"""

import math
import time
from typing import Optional
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import StreamingResponse

from backend.api.routes.hierarchy_routes import _get_context, _require_engine, _require_lineage, get_lineage_funnel
from backend.core.workspace_registry import registry
from backend.exports.pdf_generator import BranchPDFGenerator

router = APIRouter(prefix="/api/analysis", tags=["simple_analysis"])

# Remap the linear funnel segmented step route for full backward compatibility
@router.get("/simple/{client_id}/funnel")
async def get_simple_funnel(client_id: str):
    """
    Returns funnel flow steps for the beginner-friendly view.
    """
    return await get_lineage_funnel(client_id)


@router.get("/simple/{client_id}/charts/{node_id}")
async def get_simple_step_charts(client_id: str, node_id: str):
    """
    Returns precomputed charts for a specific funnel step node.
    """
    context = _get_context(client_id)
    engine = _require_engine(context, client_id)
    detail = engine.node_details.get(node_id)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Step node '{node_id}' not found.")
    
    public_charts = {k: v for k, v in detail.get("charts", {}).items() if not k.startswith("_")}
    return public_charts


def _get_branch_payload(node_id: str, client_id: Optional[str] = None) -> dict:
    """Helper to build the comprehensive scientific analysis payload for a node."""
    context = None
    
    if client_id:
        context = _get_context(client_id)
    else:
        # Scan active memory workspaces
        for wid, ctx in registry.workspaces.items():
            if ctx.hierarchy_engine and node_id in ctx.hierarchy_engine.node_details:
                context = ctx
                break
                
    if not context:
        raise HTTPException(
            status_code=404,
            detail=f"Node '{node_id}' not found in any active workspace context. Please run segregation first.",
        )
        
    engine = context.hierarchy_engine
    if not engine or node_id not in engine.node_details:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found in hierarchy.")
        
    detail = engine.node_details[node_id]
    
    # 1. Walk up the parent pointers to construct the ordered path of ancestors (Root -> Node)
    path_nodes = []
    curr_id = node_id
    while curr_id:
        curr_detail = engine.node_details.get(curr_id)
        if not curr_detail:
            break
        path_nodes.append(curr_detail)
        curr_id = curr_detail.get("metadata", {}).get("parent_id")
    path_nodes.reverse()
    
    # 2. Load the full source of truth slice and dynamically reconstruct this node's filtered dataframe
    df = context.load_slice()
    metadata = detail.get("metadata", {})
    filters = {**metadata.get("inherited_filters", {}), **metadata.get("applied_filter", {})}
    
    df_slice = df
    for col, val in filters.items():
        if col in df_slice.columns:
            df_slice = df_slice[df_slice[col].astype(str) == str(val)]
            
    # 3. Calculate scientific quality and entropy metrics
    # Shannon Entropy for category distribution
    comp_col = detail.get("charts", {}).get("composition_pie", {}).get("title")
    shannon_entropy = 0.0
    if comp_col and comp_col in df_slice.columns and not df_slice.empty:
        counts = df_slice[comp_col].dropna().astype(str).value_counts()
        total_in_col = len(df_slice[comp_col].dropna())
        if total_in_col > 0:
            for count in counts.values:
                p = count / total_in_col
                if p > 0:
                    shannon_entropy -= p * math.log(p)
                    
    # Potency variance
    POTENCY_ROLES = {"ic50", "ec50", "lc50", "ld50", "logp", "molecular_weight", "tpsa", "exposure_time"}
    potency_cols = [col for col, role in context.mappings.items() if role.lower() in POTENCY_ROLES and col in df_slice.columns]
    variance_score = 0.0
    if potency_cols and not df_slice.empty:
        potency_series = pd.to_numeric(df_slice[potency_cols[0]], errors="coerce").dropna()
        if len(potency_series) > 1:
            variance_score = float(potency_series.var())
            
    # Coverage score (non-null in potency columns)
    coverage_score = 100.0
    if potency_cols and not df_slice.empty:
        total_possible = len(df_slice) * len(potency_cols)
        non_null = int(df_slice[potency_cols].notnull().sum().sum())
        coverage_score = round((non_null / total_possible) * 100, 2)
        
    # Completeness score (non-null in all columns)
    completeness_score = 100.0
    if not df_slice.empty and len(df_slice.columns) > 0:
        total_cells = len(df_slice) * len(df_slice.columns)
        non_null = int(df_slice.notnull().sum().sum())
        completeness_score = round((non_null / total_cells) * 100, 2)
        
    sparsity_score = round(100.0 - completeness_score, 2)
    
    # Redundancy score (duplicate percentage)
    redundancy_score = 0.0
    if not df_slice.empty:
        dup_count = int(df_slice.duplicated().sum())
        redundancy_score = round((dup_count / len(df_slice)) * 100, 2)
        
    # Weighted Branch Quality score
    evenness = 1.0
    if comp_col and comp_col in df_slice.columns and not df_slice.empty:
        unique_cats = df_slice[comp_col].dropna().astype(str).nunique()
        if unique_cats > 1:
            evenness = shannon_entropy / math.log(unique_cats)
            
    weighted_score = (completeness_score * 0.4) + (coverage_score * 0.4) + (evenness * 20.0)
    if weighted_score >= 85:
        rating = "Excellent"
    elif weighted_score >= 70:
        rating = "Good"
    elif weighted_score >= 50:
        rating = "Fair"
    else:
        rating = "Poor"
        
    # 4. Generate 6-curve path arrays
    row_reduction = []
    compound_reduction = []
    retention_curve = []
    compound_retention_curve = []
    missingness_curve = []
    redundancy_curve = []
    
    root_rows = path_nodes[0].get("stats", {}).get("total_rows", 1) or 1
    root_compounds = path_nodes[0].get("stats", {}).get("unique_compounds", 1) or 1
    
    for node_detail in path_nodes:
        rows = node_detail.get("stats", {}).get("total_rows", 0)
        compounds = node_detail.get("stats", {}).get("unique_compounds", 0)
        missingness = node_detail.get("stats", {}).get("missing_pct", 0.0)
        
        row_reduction.append(rows)
        compound_reduction.append(compounds)
        retention_curve.append(round((rows / root_rows) * 100, 2))
        compound_retention_curve.append(round((compounds / root_compounds) * 100, 2))
        missingness_curve.append(missingness)
        
        # Pull or calculate duplicate percentage
        dup_pct = 0.0
        if "charts" in node_detail and "statistical_table" in node_detail["charts"]:
            table = node_detail["charts"]["statistical_table"]
            if table:
                total_dups = sum(item.get("duplicates", 0) for item in table)
                dup_pct = round((total_dups / max(rows, 1)) * 100, 2)
        redundancy_curve.append(dup_pct)
        
    # 5. Compound Attrition Analysis
    compound_attrition = []
    for i, node_detail in enumerate(path_nodes):
        compounds = node_detail.get("stats", {}).get("unique_compounds", 0)
        label = node_detail.get("metadata", {}).get("node_name", "Root") if node_detail.get("id") != "root" else "Root"
        
        if i == 0:
            reduction_pct = 0.0
        else:
            prev_compounds = path_nodes[i - 1].get("stats", {}).get("unique_compounds", 0)
            if prev_compounds > 0:
                reduction_pct = round(((prev_compounds - compounds) / prev_compounds) * 100, 2)
            else:
                reduction_pct = 0.0
                
        compound_attrition.append({
            "label": label,
            "unique_compounds": compounds,
            "reduction_pct": reduction_pct
        })
        
    # 6. Filtration Impact Ranking
    filtration_impact = []
    for i in range(1, len(path_nodes)):
        parent = path_nodes[i - 1]
        child = path_nodes[i]
        parent_compounds = parent.get("stats", {}).get("unique_compounds", 0)
        child_compounds = child.get("stats", {}).get("unique_compounds", 0)
        removed = max(0, parent_compounds - child_compounds)
        pct = round((removed / max(parent_compounds, 1)) * 100, 2)
        
        filter_col = child.get("metadata", {}).get("filter_col", "Filter")
        filtration_impact.append({
            "filter_col": filter_col,
            "compounds_removed": removed,
            "reduction_pct": pct
        })
    filtration_impact.sort(key=lambda x: x["compounds_removed"], reverse=True)
    
    # 7. Distribution Shift Warning
    shift_detected = False
    shift_message = ""
    if comp_col and comp_col in df_slice.columns and comp_col in df.columns and not df_slice.empty:
        active_vc = df_slice[comp_col].dropna().astype(str).value_counts(normalize=True)
        root_vc = df[comp_col].dropna().astype(str).value_counts(normalize=True)
        
        max_delta = 0.0
        max_cat = ""
        for cat, p_active in active_vc.items():
            p_root = root_vc.get(cat, 0.0)
            delta = abs(p_active - p_root)
            if delta > max_delta:
                max_delta = delta
                max_cat = cat
                
        if max_delta > 0.20:
            shift_detected = True
            dir_str = "overrepresented" if active_vc[max_cat] > root_vc.get(max_cat, 0.0) else "underrepresented"
            shift_message = f"Significant distribution shift detected in subgroup '{comp_col}'. Category '{max_cat}' is {dir_str} by {round(max_delta * 100, 1)}% relative to baseline Root."
            
    # Compound identifier column
    compound_col = getattr(engine, "_compound_col", None)
    total_unique_compounds_slice = 0
    if compound_col and compound_col in df_slice.columns:
        total_unique_compounds_slice = len(df_slice[compound_col].dropna().astype(str).unique())
        
    return {
        "node_id": node_id,
        "node_name": detail.get("metadata", {}).get("node_name", "Root") if node_id != "root" else "Root Dataset",
        "path": detail.get("metadata", {}).get("path", "Root"),
        "is_leaf": detail.get("metadata", {}).get("is_leaf", False),
        "stats": detail.get("stats", {}),
        "charts": {
            "composition_pie": detail.get("charts", {}).get("composition_pie", {}),
            "composition_bar": detail.get("charts", {}).get("composition_bar", {}),
            "statistical_table": detail.get("charts", {}).get("statistical_table", []),
            "distributions": detail.get("charts", {}).get("distributions", {})
        },
        "curves": {
            "row_reduction": row_reduction,
            "compound_reduction": compound_reduction,
            "retention_curve": retention_curve,
            "compound_retention_curve": compound_retention_curve,
            "missingness_curve": missingness_curve,
            "redundancy_curve": redundancy_curve,
            "labels": [n.get("metadata", {}).get("node_name", "Root") if n.get("id") != "root" else "Root" for n in path_nodes]
        },
        "quality_metrics": {
            "shannon_entropy": round(shannon_entropy, 3),
            "variance_score": round(variance_score, 3),
            "coverage_score": coverage_score,
            "completeness_score": completeness_score,
            "sparsity_score": sparsity_score,
            "redundancy_score": redundancy_score,
            "branch_quality_rating": rating,
            "rows_removed": root_rows - len(df_slice),
            "compounds_removed": root_compounds - total_unique_compounds_slice,
            "cumulative_retention_pct": round((len(df_slice) / root_rows) * 100, 2),
            "reduction_pct": round(((root_rows - len(df_slice)) / root_rows) * 100, 2)
        },
        "compound_attrition": compound_attrition,
        "filtration_impact": filtration_impact,
        "distribution_shift": {
            "shift_detected": shift_detected,
            "message": shift_message
        }
    }


@router.get("/branch/{node_id}")
async def get_branch_detail(node_id: str, client_id: Optional[str] = None):
    """
    Returns high-value branch metrics, path reduction curves, and attrition ranks.
    """
    return _get_branch_payload(node_id, client_id)


@router.get("/branch/{node_id}/export/pdf")
async def export_branch_pdf(node_id: str, client_id: Optional[str] = None):
    """
    Streams a professional, publication-ready PDF Snapshot Report for a selected branch.
    """
    payload = _get_branch_payload(node_id, client_id)
    generator = BranchPDFGenerator()
    pdf_buffer = generator.generate_report(payload)
    
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="branch_report_{node_id}.pdf"',
            "Content-Transfer-Encoding": "binary"
        }
    )


# ─────────────────────────────────────────────────────────────────────────────
# Subgroup Selection Hub Endpoints (Step 5)
# ─────────────────────────────────────────────────────────────────────────────

import os
from typing import List
from pydantic import BaseModel
from backend.core.predictability_engine import AIPredictabilityEngine

class SubgroupSelectPayload(BaseModel):
    node_ids: List[str]

@router.get("/subgroups/{client_id}")
async def get_available_subgroups(client_id: str):
    """
    Returns a list of all subgroups in the hierarchy tree, complete with
    rows, compounds, missingness %, and the full 9-score AI Predictability Matrix.
    """
    context = _get_context(client_id)
    engine = _require_engine(context, client_id)
    
    subgroups = []
    # Load mapped dataframe to ensure original structure is used
    mapped_path = context.mapped_dataframe_path or context.parquet_path
    if not mapped_path:
        raise HTTPException(status_code=400, detail="No mapped dataset available.")
    
    try:
        df_base = pd.read_parquet(mapped_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read dataset: {e}")
        
    for node_id, detail in engine.node_details.items():
        metadata = detail.get("metadata", {})
        
        # Only process terminal subgroups (leaf nodes) to improve performance
        if not metadata.get("is_leaf", False) and node_id != "root":
            # Wait, if there is no tree at all, root is the only node. 
            # We should include root if it's a leaf, but metadata might not have is_leaf set for root.
            # Let's just check is_leaf or if it's the only node in the tree.
            if len(engine.node_details) > 1:
                continue

        # Get filters for this node
        filters = {**metadata.get("inherited_filters", {}), **metadata.get("applied_filter", {})}
        
        # Apply filters to mapped df
        df_slice = df_base
        for col, val in filters.items():
            if col in df_slice.columns:
                df_slice = df_slice[df_slice[col].astype(str) == str(val)]
                
        # Analyze using predictability engine
        node_name = metadata.get("node_name", "Root") if node_id != "root" else "Root Dataset"
        analysis = AIPredictabilityEngine.analyze_subgroup(df_slice, context.mappings, node_name)
        
        # Calculate 9 scores from predictability engine metrics
        unique_compounds = analysis["unique_compounds"]
        missing_pct = analysis["missing_pct"]
        duplicate_percentage = analysis["duplicate_percentage"]
        feature_variance = analysis["feature_variance"]
        
        # 1. Sufficiency Score
        if unique_compounds < 50:
            sufficiency_score = 15.0
        elif unique_compounds < 150:
            sufficiency_score = 45.0
        elif unique_compounds < 500:
            sufficiency_score = 75.0
        else:
            sufficiency_score = min(100.0, 75.0 + (unique_compounds - 500) / 1500.0 * 25.0)

        # 2. Completeness Score
        completeness_score = max(0.0, 100.0 - missing_pct * 2.0)

        # 3. Balance Score
        imbalance_ratio = analysis["imbalance_ratio"]
        balance_score = imbalance_ratio * 100.0

        # 4. Duplicate/Redundancy Score
        dup_score = max(0.0, 100.0 - duplicate_percentage * 2.0)

        # 5. Variance/Spread Score
        if feature_variance <= 0.001:
            var_score = 20.0
        elif feature_variance <= 0.1:
            var_score = 60.0
        else:
            var_score = 100.0

        # Build 9 scores
        ai_predictability = analysis["ai_predictability_score"]
        qsar_potential = round(sufficiency_score * 0.6 + balance_score * 0.4)
        data_quality = round(completeness_score * 0.5 + dup_score * 0.5)
        chemical_diversity = round(min(100.0, 30.0 + min(unique_compounds, 2000)/20))
        coverage = round(min(100.0, 50.0 + unique_compounds / max(len(df_slice), 1) * 50.0))
        missingness = round(100.0 - missing_pct)
        
        scores = {
            "ai_predictability_score": round(ai_predictability),
            "qsar_potential_score": round(qsar_potential),
            "data_quality_score": round(data_quality),
            "chemical_diversity_score": round(chemical_diversity),
            "completeness_score": round(completeness_score),
            "balance_score": round(balance_score),
            "coverage_score": round(coverage),
            "missingness_score": round(missingness),
            "duplicate_score": round(dup_score)
        }
        
        subgroups.append({
            "node_id": node_id,
            "subgroup_name": node_name,
            "path": metadata.get("path", "Root"),
            "rows": len(df_slice),
            "compounds": unique_compounds,
            "missing_pct": missing_pct,
            "ai_score": ai_predictability,
            "scores": scores,
            "recommendation": "Recommended" if analysis["recommended"] else "Fair" if ai_predictability >= 50 else "Poor",
            "reasons": analysis["reasons"],
            "recommended": analysis["recommended"],
            "is_leaf": metadata.get("is_leaf", False)
        })
        
    # Sort and rank
    subgroups.sort(key=lambda s: s["ai_score"], reverse=True)
    for idx, s in enumerate(subgroups):
        s["scores"]["overall_rank"] = idx + 1
        
    return subgroups


@router.post("/subgroups/{client_id}/select")
async def select_subgroups(client_id: str, payload: SubgroupSelectPayload):
    """
    Slices and combines the original mapped dataset based on the selected subgroup nodes,
    saving the result to context.parquet_path for all subsequent steps (Enrichment, etc.).
    """
    context = _get_context(client_id)
    engine = _require_engine(context, client_id)
    
    if not payload.node_ids:
        raise HTTPException(status_code=400, detail="Please select at least one subgroup.")
        
    mapped_path = context.mapped_dataframe_path
    if not mapped_path or not os.path.exists(mapped_path):
        mapped_path = context.parquet_path
        
    if not mapped_path or not os.path.exists(mapped_path):
        raise HTTPException(status_code=400, detail="No source mapped dataset found.")
        
    try:
        df_base = pd.read_parquet(mapped_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read mapped dataset: {e}")
        
    slices = []
    for node_id in payload.node_ids:
        if node_id not in engine.node_details:
            raise HTTPException(status_code=404, detail=f"Subgroup node '{node_id}' not found.")
            
        detail = engine.node_details[node_id]
        metadata = detail.get("metadata", {})
        filters = {**metadata.get("inherited_filters", {}), **metadata.get("applied_filter", {})}
        
        df_slice = df_base
        for col, val in filters.items():
            if col in df_slice.columns:
                df_slice = df_slice[df_slice[col].astype(str) == str(val)]
        slices.append(df_slice)
        
    # Combine slices and drop duplicates
    df_combined = pd.concat(slices).drop_duplicates()
    
    # Save combined subgroup dataset
    subgroup_filename = f"subgroup_{client_id}.parquet"
    subgroup_path = os.path.join(context.workspace_dir, "uploads", subgroup_filename)
    df_combined.to_parquet(subgroup_path, index=False)
    
    # ── V5 UPDATE: Set active subgroup state instead of overwriting parquet_path ──
    context.active_subgroup_path = subgroup_path
    context.subgroup_selected = True
    
    # Extract name for metadata
    subgroup_name = "Combined Subgroups"
    if len(payload.node_ids) == 1:
        subgroup_name = engine.node_details[payload.node_ids[0]].get("metadata", {}).get("node_name", "Subgroup")
        
    # Find chemical column for unique count
    chem_col = None
    mappings = getattr(context, 'mappings', {}) or {}
    role_to_col = {v: k for k, v in mappings.items()}
    chem_col = role_to_col.get('chemical_name') or role_to_col.get('cas_number')
    if not chem_col:
        for col in df_combined.columns:
            if col.lower() in ['name', 'compound', 'chemical', 'cas', 'substance']:
                chem_col = col
                break
                
    context.subgroup_metadata = {
        "name": subgroup_name,
        "rows": len(df_combined),
        "unique_compounds": int(df_combined[chem_col].nunique()) if chem_col and chem_col in df_combined.columns else 0,
        "created_at": time.time()
    }
    
    # Reset downstream V5 state
    context.structure_state = "UNKNOWN"
    context.recovery_attempted = False
    context.recovery_completed = False
    context.recovered_subgroup_path = None
    context.descriptor_dataframe_path = None
    context.dataframe_cache = None
    # ⚠ DO NOT TOUCH context.parquet_path or context.mapped_dataframe_path
    
    context.add_trace(f"Selected subgroups: {payload.node_ids}. Rows: {len(df_combined)}")
    context.touch(save_to_disk=True)
    
    return {
        "status": "success",
        "rows": len(df_combined),
        "columns": df_combined.columns.tolist(),
        "parquet_path": subgroup_path,  # kept for legacy frontend compatibility during migration
        "active_subgroup_path": subgroup_path
    }


@router.get("/subgroups/{client_id}/active")
async def get_active_subgroup(client_id: str):
    """Returns the current active subgroup status for the frontend banner."""
    context = registry.get_context(client_id)
    return {
        "selected": getattr(context, 'subgroup_selected', False),
        "name": context.subgroup_metadata.get('name', '') if hasattr(context, 'subgroup_metadata') else '',
        "rows": context.subgroup_metadata.get('rows', 0) if hasattr(context, 'subgroup_metadata') else 0,
        "compounds": context.subgroup_metadata.get('unique_compounds', 0) if hasattr(context, 'subgroup_metadata') else 0,
        "structure_state": getattr(context, 'structure_state', 'UNKNOWN'),
        "smiles_coverage_pct": getattr(context, 'smiles_coverage_pct', 0.0),
        "active_subgroup_path": getattr(context, 'active_subgroup_path', None),
    }

