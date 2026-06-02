import os
import asyncio
import logging
import io
import zipfile
import pandas as pd
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import Response
from pydantic import BaseModel

from backend.core.workspace_registry import registry
from backend.core.pipeline_task_manager import pipeline_manager
from backend.exports.modeling_package_generator import ModelingPackageGenerator
from backend.exports.global_enrichment_worker import GlobalEnrichmentEngine

logger = logging.getLogger("sdo.api.export")
router = APIRouter(prefix="/api/export", tags=["export"])

class ExportRequest(BaseModel):
    selected_features: List[str] = []
    subgroup_ids: Optional[List[str]] = None

class GlobalEnrichmentRequest(BaseModel):
    # Potential configs: recovery strategy, descriptor engines, etc.
    engines: List[str] = ["rdkit"]
    recovery_strategy: str = "skip"

def run_selective_export_background(job_id: str, client_id: str, selected_features: List[str], subgroup_ids: List[str]):
    """Background task to generate selective subgroup enriched excel files."""
    job = pipeline_manager.get_job(job_id)
    if not job: return
    context = registry.get_context(client_id)
    if not context: return
    
    try:
        job.started_at = asyncio.get_event_loop().time() if asyncio.get_event_loop().is_running() else 0
        asyncio.run(pipeline_manager.broadcast_stage_change(job, "PROCESSING", "Generating selective subgroup exports..."))
        
        engine = registry.get_hierarchy_engine(client_id)
        if not engine:
            raise ValueError("Hierarchy engine not found")
            
        zip_buffer = io.BytesIO()
        df_base = pd.read_parquet(context.parquet_path)
        
        with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            for node_id in subgroup_ids:
                if node_id not in engine.node_details: continue
                node = engine.node_details[node_id]
                node_name = node.get("metadata", {}).get("node_name", "Subgroup")
                safe_name = "".join(c if c.isalnum() or c in ('_', '-') else '_' for c in node_name)
                
                # Apply filters to get the slice
                filters = {**node.get("metadata", {}).get("inherited_filters", {}), 
                           **node.get("metadata", {}).get("applied_filter", {})}
                
                df_slice = df_base
                for col, val in filters.items():
                    if col in df_slice.columns:
                        df_slice = df_slice[df_slice[col].astype(str) == str(val)]
                        
                # We save it as an Excel file per user request inside QSAR/AI predictive rady Data/
                excel_buf = io.BytesIO()
                with pd.ExcelWriter(excel_buf, engine='openpyxl') as writer:
                    df_slice.to_excel(writer, index=False, sheet_name="Enriched Data")
                    
                path_in_zip = f"QSAR_AI_predictive_ready_Data/{safe_name}_enriched.xlsx"
                zf.writestr(path_in_zip, excel_buf.getvalue())
                
        result = {"zip_bytes": zip_buffer.getvalue()}
        asyncio.run(pipeline_manager.broadcast_completed(job, result))
        
    except Exception as e:
        logger.exception("Selective Export generation failed")
        asyncio.run(pipeline_manager.broadcast_failed(job, f"Export failed: {str(e)}"))

def run_export_background(job_id: str, client_id: str, selected_features: List[str]):
    """Background task wrapper to run generation and store the result in the job object."""
    job = pipeline_manager.get_job(job_id)
    if not job: return
    context = registry.get_context(client_id)
    if not context:
        asyncio.run(pipeline_manager.broadcast_failed(job, "Workspace context not found"))
        return
        
    try:
        job.started_at = asyncio.get_event_loop().time() if asyncio.get_event_loop().is_running() else 0
        asyncio.run(pipeline_manager.broadcast_stage_change(job, "PROCESSING", "Generating export package..."))
        zip_bytes = ModelingPackageGenerator.generate(context, selected_features=selected_features)
        result = {"zip_bytes": zip_bytes}
        asyncio.run(pipeline_manager.broadcast_completed(job, result))
    except Exception as e:
        logger.exception("Export generation failed")
        asyncio.run(pipeline_manager.broadcast_failed(job, f"Export failed: {str(e)}"))

@router.post("/{client_id}/modeling-package")
async def start_modeling_package_export(client_id: str, request: ExportRequest, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Context not found")
        
    job = pipeline_manager.create_job(client_id, "export_package", 1)
    
    # If specific subgroups are provided, run the selective export
    if request.subgroup_ids:
        background_tasks.add_task(run_selective_export_background, job.job_id, client_id, request.selected_features, request.subgroup_ids)
    else:
        # Otherwise run the classic active subgroup export
        background_tasks.add_task(run_export_background, job.job_id, client_id, request.selected_features)
    
    return {"job_id": job.job_id, "status": "PROCESSING"}

@router.get("/{client_id}/modeling-package/download")
async def download_modeling_package(client_id: str, job_id: str):
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Export job not found")
    if job.status.value != "COMPLETED":
        raise HTTPException(status_code=400, detail=f"Export job is not completed. Current status: {job.status.value}")
        
    zip_bytes = job.result.get("zip_bytes") if job.result else None
    if not zip_bytes:
        raise HTTPException(status_code=500, detail="Result zip bytes not found")
        
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="sdo_modeling_package.zip"'}
    )

@router.post("/{client_id}/global-enrichment")
async def start_global_enrichment(client_id: str, request: GlobalEnrichmentRequest, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Context not found")
        
    # We create a job that runs on the current client_id, but the UI will switch to a global enrichment view
    job = pipeline_manager.create_job(client_id, "global_enrichment", 1)
    
    # Launch in background
    background_tasks.add_task(GlobalEnrichmentEngine.process_and_export, job, client_id, request.dict())
    
    return {"job_id": job.job_id, "status": "PROCESSING"}
