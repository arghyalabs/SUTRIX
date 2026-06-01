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
    
    # Verify that column exists
    df = context.load_slice()
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
    
    # Verify that column exists
    df = context.load_slice()
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

