# -----------------------------------------------------------------------------
# Scientific Data Orchestrator (SDO) — Structure Recovery Routes
# Exposes API endpoints to control and poll background structures recovery tasks.
# -----------------------------------------------------------------------------
"""
backend/api/routes/structure_recovery_routes.py

FastAPI router exposing structure recovery controller endpoints:
  POST /api/structure-recovery/start
  GET /api/structure-recovery/{client_id}/status
  GET /api/structure-recovery/{client_id}/result
"""

import os
import json
import logging
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.workspace_registry import registry
from backend.workers.task_manager import TaskManager

logger = logging.getLogger("sdo.api.structure_recovery")

router = APIRouter(prefix="/api/structure-recovery", tags=["structure-recovery"])

class StructureRecoveryPayload(BaseModel):
    client_id: str
    column_to_resolve: str

def _get_context(client_id: str):
    context = registry.get_context(client_id)
    if context is None:
        raise HTTPException(
            status_code=404,
            detail=f"No workspace context found for client_id='{client_id}'."
        )
    return context

@router.post("/start")
async def start_recovery(payload: StructureRecoveryPayload):
    """
    Submits a background job to attempt molecular structures recovery.
    Uses ChemicalIdentifierService to resolve compound names/CAS to canonical SMILES coordinates.
    """
    context = _get_context(payload.client_id)
    
    if getattr(context, 'structure_state', 'UNKNOWN') == 'MOLECULAR':
        raise HTTPException(
            status_code=400,
            detail="Dataset is already MOLECULAR. No recovery needed."
        )

    # Verify that column exists
    df = context.load_active_dataset()
    if payload.column_to_resolve not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Column '{payload.column_to_resolve}' does not exist in the active dataset."
        )

    # Submit background task
    job_id = TaskManager.submit_structure_recovery(
        workspace_id=payload.client_id,
        column_to_resolve=payload.column_to_resolve
    )
    
    if not job_id:
        raise HTTPException(
            status_code=500,
            detail="Failed to submit structure recovery job to background registry."
        )

    # Save job state in context
    context.active_job_id = job_id
    context.touch(save_to_disk=True)

    return {
        "success": True,
        "job_id": job_id,
        "status": "QUEUED"
    }

@router.get("/{client_id}/status")
async def recovery_status(client_id: str):
    """
    Query the active structure recovery job progress, speed, and ETA.
    """
    context = _get_context(client_id)
    
    if not context.active_job_id:
        return {
            "status": "IDLE",
            "progress": 0,
            "error_message": None
        }

    status = TaskManager.query_status(context.active_job_id)
    return status

@router.get("/{client_id}/result")
async def recovery_result(client_id: str):
    """
    Retrieve the output compound-to-SMILES resolved map and list of unresolved tokens.
    """
    context = _get_context(client_id)
    
    res_dir = os.path.join("workspaces", client_id, "cache")
    res_path = os.path.join(res_dir, "structure_recovery_result.json")

    if not os.path.exists(res_path):
        # Check active job
        if context.active_job_id:
            status = TaskManager.query_status(context.active_job_id)
            if status["status"] == "RUNNING" or status["status"] == "QUEUED":
                raise HTTPException(
                    status_code=202,
                    detail="Structure recovery task is still running. Please poll status endpoint first."
                )
            elif status["status"] == "FAILED":
                raise HTTPException(
                    status_code=500,
                    detail=f"Background task failed: {status['error_message']}"
                )
        raise HTTPException(
            status_code=404,
            detail="No structure recovery results found for this workspace. Start the wizard first."
        )

    try:
        with open(res_path, "r") as f:
            result_data = json.load(f)
        return {
            "success": True,
            "smiles_map": result_data.get("smiles_map", {}),
            "unresolved": result_data.get("unresolved", [])
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read structures recovery output file: {e}"
        )


class StructureRecoveryPayloadV2(BaseModel):
    client_id: str
    column_to_resolve: str
    mode: str = "quick"
    limit: int = 100
    sources: List[str] = ["pubchem", "chembl", "comptox"]


@router.post("/v2/start")
async def start_recovery_v2(payload: StructureRecoveryPayloadV2):
    """
    Submits a background job to attempt molecular structures recovery using V2 engine.
    """
    context = _get_context(payload.client_id)
    
    if getattr(context, 'structure_state', 'UNKNOWN') == 'MOLECULAR':
        raise HTTPException(
            status_code=400,
            detail="Dataset is already MOLECULAR. No recovery needed."
        )

    # Verify that column exists
    df = context.load_active_dataset()
    if payload.column_to_resolve not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Column '{payload.column_to_resolve}' does not exist in the active dataset."
        )

    # Submit background task
    job_id = TaskManager.submit_structure_recovery_v2(
        workspace_id=payload.client_id,
        column_to_resolve=payload.column_to_resolve,
        mode=payload.mode,
        limit=payload.limit,
        sources=payload.sources
    )
    
    if not job_id:
        raise HTTPException(
            status_code=500,
            detail="Failed to submit structure recovery V2 job to background registry."
        )

    context.active_job_id = job_id
    context.recovery_attempted = True
    context.touch(save_to_disk=True)

    return {
        "success": True,
        "job_id": job_id,
        "status": "QUEUED"
    }


@router.post("/v2/estimate")
async def estimate_recovery_v2(payload: StructureRecoveryPayloadV2):
    """
    Returns time and compound estimates for structure recovery without starting the task.
    """
    context = _get_context(payload.client_id)
    
    try:
        df = context.load_active_dataset()
    except ValueError:
        df = context.load_slice()
    if payload.column_to_resolve not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Column '{payload.column_to_resolve}' does not exist."
        )

    unique_vals = df[payload.column_to_resolve].dropna().astype(str).str.strip().unique().tolist()
    unique_vals = [v for v in unique_vals if v]
    unique_count = len(unique_vals)

    from backend.cache.structure_cache import global_cache
    cached_map = global_cache.get_many(unique_vals)
    cached_count = len(cached_map)

    from backend.core.recovery_eta_engine import RecoveryETAEngine
    est = RecoveryETAEngine.estimate(
        unique_count=unique_count,
        cached_count=cached_count,
        sources=payload.sources
    )
    return est


@router.get("/v2/{client_id}/status")
async def recovery_status_v2(client_id: str):
    """
    Query the active structure recovery job progress, speed, and ETA.
    """
    return await recovery_status(client_id)


@router.get("/cache/stats")
async def cache_stats():
    """
    Query the persistent structures cache metrics.
    """
    from backend.cache.structure_cache import global_cache
    return global_cache.stats()


@router.get("/v2/{client_id}/scope-preview")
async def recovery_scope_preview(client_id: str):
    """
    Returns a preview of which compounds are missing SMILES in the active subgroup,
    along with time estimates for recovery at different batch sizes.
    Used by Step 7 UI before starting a recovery job.
    """
    context = registry.get_context(client_id)
    
    if not getattr(context, 'subgroup_selected', False):
        raise HTTPException(
            status_code=400,
            detail="Scope preview requires a selected subgroup. Complete Step 5 first."
        )
    
    try:
        df = context.load_active_dataset()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load active subgroup: {e}")
    
    mappings = getattr(context, 'mappings', {}) or {}
    role_to_col = {v: k for k, v in mappings.items()}
    
    chem_col = role_to_col.get('chemical_name') or role_to_col.get('cas_number')
    smiles_col = role_to_col.get('smiles') or role_to_col.get('canonical_smiles')
    
    # Heuristic fallback
    if not chem_col:
        for col in df.columns:
            if col.lower() in ['name', 'compound', 'chemical', 'substance', 'cas']:
                chem_col = col
                break
    if not smiles_col:
        for col in df.columns:
            if col.lower() in ['smiles', 'canonical_smiles', 'isomeric_smiles']:
                smiles_col = col
                break
    
    if not chem_col:
        raise HTTPException(status_code=400, detail="No compound name column found in dataset mapping.")
    
    # Find compounds missing SMILES
    if smiles_col and smiles_col in df.columns:
        compound_df = df[[chem_col, smiles_col]].dropna(subset=[chem_col]).copy()
        compound_df['_has_smiles'] = (
            compound_df[smiles_col].astype(str).str.strip().notna() &
            (compound_df[smiles_col].astype(str).str.strip() != '') &
            (compound_df[smiles_col].astype(str).str.strip() != 'nan') &
            (compound_df[smiles_col].astype(str).str.strip() != 'None')
        )
        coverage_per_compound = compound_df.groupby(chem_col)['_has_smiles'].any()
        missing_compounds = coverage_per_compound[~coverage_per_compound].index.tolist()
    else:
        # No SMILES column at all — all unique compounds are missing
        missing_compounds = df[chem_col].dropna().astype(str).str.strip().unique().tolist()
    
    total_missing = len(missing_compounds)
    
    # Check cache hits
    try:
        from backend.cache.structure_cache import global_cache
        cached = global_cache.get_many(missing_compounds)
        cache_hits_estimate = len(cached)
    except Exception:
        cache_hits_estimate = 0
    
    # Time estimates (empirical: ~0.45s/compound for fresh lookups, 0.05s for cache)
    fresh_count = total_missing - cache_hits_estimate
    def estimate_seconds(batch: int) -> int:
        actual_batch = min(batch, total_missing)
        fresh_in_batch = max(0, actual_batch - cache_hits_estimate)
        return int(fresh_in_batch * 0.45 + min(cache_hits_estimate, actual_batch) * 0.05)
    
    return {
        "missing_compounds": missing_compounds[:50],  # cap for response size
        "total_missing": total_missing,
        "cache_hits_estimate": cache_hits_estimate,
        "estimated_recovery_rate": 0.85,
        "estimated_time_seconds": {
            "100": estimate_seconds(100),
            "500": estimate_seconds(500),
            "1000": estimate_seconds(1000),
            "all": estimate_seconds(total_missing)
        },
        "sources_available": ["pubchem", "chembl", "comptox"]
    }


@router.post("/v2/mark-complete")
async def mark_recovery_complete(payload: dict):
    """
    Called by the recovery job worker when it finishes, to update context
    with the new coverage percentage and recovered subgroup path.
    """
    from pydantic import BaseModel
    client_id = payload.get('client_id')
    if not client_id:
        raise HTTPException(status_code=400, detail="client_id required")
    
    context = registry.get_context(client_id)
    new_coverage = payload.get('new_coverage_pct', 0.0)
    recovered_path = payload.get('recovered_subgroup_path')
    
    context.recovery_completed = True
    context.post_recovery_coverage_pct = float(new_coverage)
    if recovered_path:
        context.recovered_subgroup_path = recovered_path
    context.touch(save_to_disk=True)
    
    return {"success": True, "new_coverage_pct": new_coverage}

