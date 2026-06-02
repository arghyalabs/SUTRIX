"""
backend/api/routes/subgroup_routes.py

SUTRIX V5 — Subgroup Lifecycle Management
Endpoints for subgroup status, reset, and export.
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.workspace_registry import registry

logger = logging.getLogger("sdo.api.subgroup")

router = APIRouter(prefix="/api/subgroup", tags=["subgroup"])


@router.get("/{client_id}/status")
async def get_subgroup_status(client_id: str):
    """Returns the full subgroup and pipeline state for the frontend."""
    context = registry.get_context(client_id)
    return {
        "selected": getattr(context, 'subgroup_selected', False),
        "name": context.subgroup_metadata.get('name', '') if hasattr(context, 'subgroup_metadata') and context.subgroup_metadata else '',
        "rows": context.subgroup_metadata.get('rows', 0) if hasattr(context, 'subgroup_metadata') and context.subgroup_metadata else 0,
        "compounds": context.subgroup_metadata.get('unique_compounds', 0) if hasattr(context, 'subgroup_metadata') and context.subgroup_metadata else 0,
        "active_subgroup_path": getattr(context, 'active_subgroup_path', None),
        "structure_state": getattr(context, 'structure_state', 'UNKNOWN'),
        "smiles_coverage_pct": getattr(context, 'smiles_coverage_pct', 0.0),
        "recovery_attempted": getattr(context, 'recovery_attempted', False),
        "recovery_completed": getattr(context, 'recovery_completed', False),
        "post_recovery_coverage_pct": getattr(context, 'post_recovery_coverage_pct', 0.0),
        "descriptor_ready": bool(getattr(context, 'descriptor_dataframe_path', None)),
    }


class ResetPayload(BaseModel):
    client_id: str


@router.delete("/{client_id}/reset")
async def reset_subgroup(client_id: str):
    """
    Clears the active subgroup and all downstream state.
    The user will need to re-select a subgroup from Step 5.
    """
    context = registry.get_context(client_id)
    
    context.active_subgroup_path = None
    context.subgroup_selected = False
    context.subgroup_metadata = {}
    context.structure_state = "UNKNOWN"
    context.smiles_coverage_pct = 0.0
    context.total_unique_compounds = 0
    context.structures_available = 0
    context.structures_missing = 0
    context.recovery_attempted = False
    context.recovery_completed = False
    context.post_recovery_coverage_pct = 0.0
    context.recovered_subgroup_path = None
    context.descriptor_dataframe_path = None
    context.dataframe_cache = None
    context.touch(save_to_disk=True)
    
    logger.info(f"Workspace {client_id}: Subgroup reset. All downstream state cleared.")
    
    return {
        "success": True,
        "message": "Active subgroup cleared. Please return to Step 5 (Subgroup Selection) to select a new subgroup."
    }

from fastapi.responses import StreamingResponse
import io

@router.get("/{client_id}/export")
async def export_subgroup(client_id: str, format: str = "csv"):
    """Exports the active subgroup directly."""
    context = registry.get_context(client_id)
    if not context.subgroup_selected:
        raise HTTPException(status_code=400, detail="No subgroup selected.")
        
    try:
        df = context.load_active_dataset()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load dataset: {e}")
        
    buf = io.BytesIO()
    if format.lower() == "csv":
        df.to_csv(buf, index=False)
        mime = "text/csv"
        ext = "csv"
    elif format.lower() == "parquet":
        df.to_parquet(buf, index=False)
        mime = "application/octet-stream"
        ext = "parquet"
    else:
        raise HTTPException(status_code=400, detail="Format must be 'csv' or 'parquet'")
        
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="active_subgroup.{ext}"'}
    )
