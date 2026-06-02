import os
import asyncio
import logging
from typing import Dict, Any, List

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import Response
from pydantic import BaseModel

from backend.core.workspace_registry import registry
from backend.core.pipeline_task_manager import pipeline_manager
from backend.exports.modeling_package_generator import ModelingPackageGenerator

logger = logging.getLogger("sdo.api.export")
router = APIRouter(prefix="/api/export", tags=["export"])

class ExportRequest(BaseModel):
    selected_features: List[str] = []

def run_export_background(job_id: str, client_id: str, selected_features: List[str]):
    """Background task wrapper to run generation and store the result in the job object."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        return
        
    context = registry.get_context(client_id)
    if not context:
        asyncio.run(pipeline_manager.broadcast_failed(job, "Workspace context not found"))
        return
        
    try:
        job.started_at = asyncio.get_event_loop().time() if asyncio.get_event_loop().is_running() else 0
        asyncio.run(pipeline_manager.broadcast_stage_change(job, "PROCESSING", "Generating export package..."))
        
        # Actually generate the bytes
        zip_bytes = ModelingPackageGenerator.generate(context, selected_features=selected_features)
        
        # Save to job result
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
    
    # Launch in background
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
