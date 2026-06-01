"""
backend/api/routes/simple_analysis_routes.py

Router for the beginner-friendly Simple Analysis Mode funnel.
"""

from fastapi import APIRouter, HTTPException, Query
from backend.api.routes.hierarchy_routes import _get_context, _require_engine, _require_lineage, get_lineage_funnel

router = APIRouter(prefix="/api/analysis/simple", tags=["simple_analysis"])

@router.get("/{client_id}/funnel")
async def get_simple_funnel(client_id: str):
    """
    Returns funnel flow steps for the beginner-friendly view.
    """
    return await get_lineage_funnel(client_id)

@router.get("/{client_id}/charts/{node_id}")
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
