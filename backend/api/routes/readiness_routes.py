from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
import pandas as pd
from backend.api.validators.request_validator import BaseClientPayload

from backend.core.workspace_registry import registry
from backend.core.predictability_engine import AIPredictabilityEngine
from backend.core.readiness_engine import ReadinessEngine

router = APIRouter(prefix="/api/readiness", tags=["Readiness"])

@router.get("/{client_id}/predictability")
def get_predictability_score(client_id: str) -> Dict[str, Any]:
    """
    Returns the AI Predictability Score for the currently active subgroup.
    Usually called before descriptor enrichment.
    """
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Context not found")
        
    if not getattr(context, 'subgroup_selected', False):
        raise HTTPException(
            status_code=400,
            detail="Readiness assessment requires a selected subgroup. Complete Step 5 (Subgroup Selection) first."
        )
        
    df = context.load_active_dataset()
    if df is None:
        raise HTTPException(status_code=400, detail="Subgroup dataset not found or empty")
        
    result = AIPredictabilityEngine.analyze_subgroup(df, context.mappings)
    return result

@router.post("/assessment")
def get_ai_readiness_assessment(payload: BaseClientPayload) -> Dict[str, Any]:
    """
    Returns the full AI and QSAR Readiness Assessment for the subgroup.
    Requires the subgroup to be enriched with descriptors.
    """
    client_id = payload.client_id
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Context not found")
        
    if not getattr(context, 'subgroup_selected', False):
        raise HTTPException(
            status_code=400,
            detail="Readiness assessment requires a selected subgroup. Complete Step 5 (Subgroup Selection) first."
        )
        
    df = context.load_active_dataset()
    if df is None:
        raise HTTPException(status_code=400, detail="Enriched subgroup dataset not found or empty")

    if getattr(payload, "subgroup_ids", None):
        from backend.api.state import registry
        engine = registry.get_hierarchy_engine(client_id)
        if engine:
            slices = []
            for node_id in payload.subgroup_ids:
                if node_id in engine.node_details:
                    detail = engine.node_details[node_id]
                    filters = {**detail.get("metadata", {}).get("inherited_filters", {}), **detail.get("metadata", {}).get("applied_filter", {})}
                    df_slice = df
                    for col, val in filters.items():
                        if col in df_slice.columns:
                            df_slice = df_slice[df_slice[col].astype(str) == str(val)]
                    slices.append(df_slice)
            if slices:
                df = pd.concat(slices).drop_duplicates()
        
    result = ReadinessEngine.evaluate_readiness(df, context.mappings)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("reason", "Evaluation failed"))
        
    return result

from fastapi import BackgroundTasks
from backend.core.pipeline_task_manager import pipeline_manager
import asyncio

def run_benchmark_background(job_id: str, client_id: str, subgroup_ids: Optional[List[str]] = None):
    job = pipeline_manager.get_job(job_id)
    if not job:
        return
        
    context = registry.get_context(client_id)
    if not context:
        asyncio.run(pipeline_manager.broadcast_failed(job, "Context not found"))
        return
        
    try:
        job.started_at = asyncio.get_event_loop().time() if asyncio.get_event_loop().is_running() else 0
        asyncio.run(pipeline_manager.broadcast_stage_change(job, "PROCESSING", "Running ML Benchmark..."))
        
        descriptor_path = getattr(context, 'descriptor_dataframe_path', None) or getattr(context, 'parquet_path', None)
        import pandas as pd
        df = pd.read_parquet(descriptor_path)
        
        if subgroup_ids:
            from backend.api.state import registry
            engine = registry.get_hierarchy_engine(client_id)
            if engine:
                slices = []
                for node_id in subgroup_ids:
                    if node_id in engine.node_details:
                        detail = engine.node_details[node_id]
                        filters = {**detail.get("metadata", {}).get("inherited_filters", {}), **detail.get("metadata", {}).get("applied_filter", {})}
                        df_slice = df
                        for col, val in filters.items():
                            if col in df_slice.columns:
                                df_slice = df_slice[df_slice[col].astype(str) == str(val)]
                        slices.append(df_slice)
                if slices:
                    df = pd.concat(slices).drop_duplicates()
        
        from backend.core.ml_benchmark_engine import MLBenchmarkEngine
        engine = MLBenchmarkEngine()
        result = engine.benchmark(df, context.mappings)
        
        asyncio.run(pipeline_manager.broadcast_completed(job, result))
    except Exception as e:
        asyncio.run(pipeline_manager.broadcast_failed(job, f"Benchmark failed: {str(e)}"))


@router.post("/benchmark")
def start_ml_benchmark(payload: BaseClientPayload, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    """
    Starts the rapid ML benchmark engine in the background.
    Requires the subgroup to be enriched with descriptors.
    """
    client_id = payload.client_id
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Context not found")
        
    if not getattr(context, 'subgroup_selected', False):
        raise HTTPException(
            status_code=400,
            detail="Benchmarking requires a selected subgroup. Complete Step 5 first."
        )
        
    descriptor_path = getattr(context, 'descriptor_dataframe_path', None) or getattr(context, 'parquet_path', None)
    if not descriptor_path:
        raise HTTPException(
            status_code=400,
            detail="Benchmarking requires descriptors. Complete Step 8 first."
        )
        
    job = pipeline_manager.create_job(client_id, "ml_benchmark", 1)
    background_tasks.add_task(run_benchmark_background, job.job_id, client_id, payload.subgroup_ids)
    
    return {"job_id": job.job_id, "status": "PROCESSING"}


@router.get("/{client_id}/benchmark/status")
def get_ml_benchmark_status(client_id: str, job_id: str) -> Dict[str, Any]:
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Benchmark job not found")
        
    if job.status.value == "FAILED":
        return {"status": "FAILED", "error": job.error}
        
    if job.status.value == "COMPLETED":
        return {"status": "COMPLETED", "result": job.result}
        
    return {"status": "PROCESSING"}
