# -----------------------------------------------------------------------------
# Scientific Data Orchestrator (SDO) — Structure Export & Enrichment Router
# Exposes API endpoints to download structural/identifier enriched datasets.
# -----------------------------------------------------------------------------
"""
backend/api/routes/structure_export_routes.py
"""

import io
import logging
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from backend.core.workspace_registry import registry

logger = logging.getLogger("sdo.api.structure_export")
router = APIRouter(prefix="/api/structure-recovery", tags=["structure-export"])

def _get_context(client_id: str):
    context = registry.get_context(client_id)
    if context is None:
        raise HTTPException(
            status_code=404,
            detail=f"No workspace context found for client_id='{client_id}'."
        )
    return context

@router.get("/{client_id}/export-file")
async def export_enriched_dataset(
    client_id: str,
    format: str = Query("csv", pattern="^(csv|xlsx)$")
):
    """
    Downloads the active structural enriched dataset as a CSV or Excel file.
    Includes the resolved SMILES, InChI, InChIKey, Formula, and CID columns.
    """
    context = _get_context(client_id)
    
    try:
        # Load the active dataset (which has the resolved SMILES/InChI columns)
        df = context.load_active_dataset()
    except Exception as e:
        try:
            df = context.load_slice()
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Could not load active dataset or slice for workspace {client_id}: {e}"
            )

    if df is None or df.empty:
        raise HTTPException(
            status_code=400,
            detail="The active dataset is empty. Please upload or resolve structures first."
        )

    if format == "csv":
        # Stream CSV
        stream = io.StringIO()
        df.to_csv(stream, index=False)
        response = StreamingResponse(
            iter([stream.getvalue()]),
            media_type="text/csv"
        )
        response.headers["Content-Disposition"] = f"attachment; filename=sutrix_enriched_{client_id}.csv"
        return response
    else:
        # Stream Excel
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Enriched Dataset")
        buffer.seek(0)
        response = StreamingResponse(
            io.BytesIO(buffer.read()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response.headers["Content-Disposition"] = f"attachment; filename=sutrix_enriched_{client_id}.xlsx"
        return response
