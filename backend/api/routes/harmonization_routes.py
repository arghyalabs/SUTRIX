"""
backend/api/routes/harmonization_routes.py

REST endpoints for the Cross-Studio Data Reduction Control & Audit Framework.

Endpoints:
  GET  /api/harmonization/{client_id}/settings  — Get current settings + audit
  POST /api/harmonization/{client_id}/preview   — Compute projected counts (no mutation)
  POST /api/harmonization/{client_id}/apply     — Apply settings, mutate parquet, return audit
  POST /api/harmonization/{client_id}/reset     — Reset settings to KEEP_ALL defaults
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.core.workspace_registry import registry, _DEFAULT_HARMONIZATION_SETTINGS
from backend.core.harmonization import HarmonizationEngine, HarmonizationSettings
from backend.storage.parquet_engine import ParquetEngine

logger = logging.getLogger("sdo.routes.harmonization")
router = APIRouter(prefix="/api/harmonization", tags=["harmonization"])


# ──────────────────────────────────────────────────────────────
# Request Models
# ──────────────────────────────────────────────────────────────

class HarmonizationSettingsPayload(BaseModel):
    variance_conflict_strategy: str = "KEEP_ALL"
    duplicate_segregation_strategy: str = "KEEP_ALL"


# ──────────────────────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────────────────────

def _get_context(client_id: str):
    context = registry.get_context(client_id)
    if not context or not context.parquet_path:
        raise HTTPException(status_code=404, detail=f"Workspace '{client_id}' not found or empty.")
    return context


def _load_df(context):
    try:
        df = context.load_slice()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not load dataset: {e}")
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Dataset is empty. Run column mapping and segregation first.")
    return df


# ──────────────────────────────────────────────────────────────
# GET — Settings & Current Audit
# ──────────────────────────────────────────────────────────────

@router.get("/{client_id}/settings")
async def get_harmonization_settings(client_id: str):
    """
    Returns current harmonization settings and the last applied audit
    (if any) for the given workspace.
    """
    context = _get_context(client_id)
    return {
        "settings": context.harmonization_settings,
        "audit": context.harmonization_audit,
        "raw_ingestion_count": context.raw_ingestion_count,
        "current_row_count": (
            len(context.dataframe_cache)
            if context.dataframe_cache is not None
            else (
                ParquetEngine().get_row_count(context.parquet_path)
                if context.parquet_path
                else 0
            )
        ),
    }


# ──────────────────────────────────────────────────────────────
# POST — Preview (Read-only)
# ──────────────────────────────────────────────────────────────

@router.post("/{client_id}/preview")
async def preview_harmonization(client_id: str, payload: HarmonizationSettingsPayload):
    """
    Computes projected row counts for each reduction step WITHOUT
    modifying the active dataset or persisting anything.

    Returns a breakdown suitable for rendering the preview metrics
    card in HarmonizationControlPanel.
    """
    context = _get_context(client_id)
    df = _load_df(context)

    settings = HarmonizationSettings(
        variance_conflict_strategy=payload.variance_conflict_strategy,
        duplicate_segregation_strategy=payload.duplicate_segregation_strategy,
    )

    engine = HarmonizationEngine()
    try:
        preview = engine.preview(df, context.mappings, settings)
    except Exception as e:
        logger.error(f"Harmonization preview failed for {client_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Preview computation failed: {e}")

    # Enrich with raw_ingestion_count from context if we have it
    if context.raw_ingestion_count > 0:
        preview["raw_ingestion_count"] = context.raw_ingestion_count

    return preview


# ──────────────────────────────────────────────────────────────
# POST — Apply (Mutating)
# ──────────────────────────────────────────────────────────────

@router.post("/{client_id}/apply")
async def apply_harmonization(client_id: str, payload: HarmonizationSettingsPayload):
    """
    Applies deduplication + variance filtration strategies to the active
    dataset in the specified workspace.

    - Saves the cleaned dataframe to a new parquet file.
    - Stores a full HarmonizationAudit in the session context.
    - Persists settings and audit to the session JSON.

    Returns the complete audit record.
    """
    context = _get_context(client_id)
    df = _load_df(context)

    settings = HarmonizationSettings(
        variance_conflict_strategy=payload.variance_conflict_strategy,
        duplicate_segregation_strategy=payload.duplicate_segregation_strategy,
        settings_confirmed=True,
        applied_at=datetime.now(timezone.utc).isoformat(),
    )

    engine = HarmonizationEngine()
    try:
        cleaned_df, audit = engine.apply(df, context.mappings, settings)
    except Exception as e:
        logger.error(f"Harmonization apply failed for {client_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Harmonization failed: {e}")

    # Persist cleaned dataframe as new parquet source of truth
    pe = ParquetEngine()
    new_path = pe.convert_dataframe_to_parquet(cleaned_df, f"harmonized_{client_id}")
    if new_path:
        context.parquet_path = new_path
        context.dataframe_cache = cleaned_df

    # Persist settings and audit to context
    context.harmonization_settings = settings.dict()
    context.harmonization_audit = audit.dict()

    # Update segmentation_results so existing UI panels pick up correct counts
    if context.segmentation_results:
        context.segmentation_results["input_records"] = len(cleaned_df)
        context.segmentation_results["harmonization_applied"] = True

    context.add_trace("harmonization_applied")
    logger.info(
        f"Harmonization applied for {client_id}: "
        f"{audit.raw_ingestion_count} → {audit.final_active_count} rows "
        f"({audit.total_removed} removed)"
    )

    return {
        "success": True,
        "audit": audit.dict(),
        "active_row_count": len(cleaned_df),
    }


# ──────────────────────────────────────────────────────────────
# POST — Reset to KEEP_ALL
# ──────────────────────────────────────────────────────────────

@router.post("/{client_id}/reset")
async def reset_harmonization(client_id: str):
    """
    Resets harmonization settings to KEEP_ALL defaults and clears
    the audit record. Does NOT restore any previously removed rows
    (the raw parquet is preserved separately at raw_dataframe_path).
    """
    context = _get_context(client_id)
    context.harmonization_settings = dict(_DEFAULT_HARMONIZATION_SETTINGS)
    context.harmonization_audit = None
    context.add_trace("harmonization_reset")
    return {"success": True, "settings": context.harmonization_settings}
