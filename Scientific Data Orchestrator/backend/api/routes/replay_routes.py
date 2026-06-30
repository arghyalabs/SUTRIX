import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Form
from backend.core.workspace_registry import registry
from backend.core.replay.event_sourcer import EventSourcer

logger = logging.getLogger("sdo.api.routes.replay")

router = APIRouter(prefix="/api/replay", tags=["Replay"])

@router.get("/{client_id}/provenance")
def get_provenance_tree_endpoint(client_id: str) -> Dict[str, Any]:
    """Returns the complete branching analysis history (Provenance Tree) for visualization."""
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Workspace context not found")
    
    try:
        return EventSourcer.get_provenance_tree(client_id)
    except Exception as e:
        logger.error(f"Failed to fetch provenance tree: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{client_id}/run")
def run_workflow_replay(
    client_id: str,
    branch_id: str = Form(...)
) -> Dict[str, Any]:
    """Replays the event logs of a branch in DuckDB, updating the active session state cache."""
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Workspace context not found")

    try:
        # Re-execute all events in DuckDB
        df = EventSourcer.replay_branch(client_id, branch_id)

        # Synchronize DuckDB state back to legacy SUTRIX Parquet/dataframe cache
        df.to_parquet(context.parquet_path)
        context.dataframe_cache = df
        
        # Save branch ID to context
        context.active_branch_id = branch_id
        context.touch(save_to_disk=True)

        return {
            "status": "SUCCESS",
            "active_branch": branch_id,
            "row_count": len(df),
            "columns": list(df.columns)
        }
    except Exception as e:
        logger.error(f"Replay run failed: {e}")
        raise HTTPException(status_code=500, detail=f"Replay failed: {str(e)}")

@router.post("/{client_id}/branch")
def create_analysis_branch(
    client_id: str,
    name: str = Form(...),
    parent_event_id: Optional[str] = Form(None)
) -> Dict[str, Any]:
    """Creates a new branch stemming from a specific event step (branching)."""
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Workspace context not found")

    try:
        branch = EventSourcer.create_branch(client_id, name, parent_event_id)
        return {
            "status": "SUCCESS",
            "branch_id": branch.branch_id,
            "name": branch.name,
            "parent_event_id": branch.parent_event_id
        }
    except Exception as e:
        logger.error(f"Failed to create branch: {e}")
        raise HTTPException(status_code=500, detail=str(e))
