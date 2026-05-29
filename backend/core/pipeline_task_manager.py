"""
backend/core/pipeline_task_manager.py

Unified async pipeline task manager for SUTRIX.
Orchestrates all background jobs: upload parsing, hierarchy generation,
descriptor enrichment. Provides instant job IDs, live telemetry, ETA
estimation, partial result checkpointing, and resume support.
"""
import asyncio
import time
import uuid
import logging
import json
import os
from typing import Dict, Any, Optional, List, Callable, Awaitable
from enum import Enum

from backend.core.pipeline_stages import PipelineStage, get_upload_stages, get_hierarchy_stages, get_enrichment_stages

logger = logging.getLogger("sdo.backend.pipeline.manager")


class JobStatus(str, Enum):
    QUEUED     = "QUEUED"
    RUNNING    = "RUNNING"
    PAUSED     = "PAUSED"
    COMPLETED  = "COMPLETED"
    FAILED     = "FAILED"
    CANCELLED  = "CANCELLED"
    PARTIAL    = "PARTIAL"       # Cancelled with partial results preserved


class PipelineJob:
    """Represents a single background pipeline job with full checkpoint support."""

    def __init__(self, job_id: str, client_id: str, operation: str, total_items: int = 1):
        self.job_id = job_id
        self.client_id = client_id
        self.operation = operation       # "upload" | "hierarchy" | "enrichment"
        self.total_items = total_items

        self.status = JobStatus.QUEUED
        self.stage = PipelineStage.IDLE
        self.progress_pct = 0
        self.eta_seconds = 0.0
        self.items_per_sec = 0.0
        self.rows_per_sec = 0.0
        self.active_node = ""
        self.nodes_complete = 0
        self.nodes_total = 0
        self.cache_hits = 0
        self.memory_mb = 0.0

        self.created_at = time.time()
        self.started_at: Optional[float] = None
        self.completed_at: Optional[float] = None

        self.error: Optional[str] = None
        self.result: Optional[Dict[str, Any]] = None

        # Checkpoint: partial results for resume
        self.checkpoint: Dict[str, Any] = {}
        self.completed_nodes: List[str] = []

        # Cancellation signal
        self._cancel_event = asyncio.Event()

    def request_cancel(self):
        self._cancel_event.set()

    def is_cancelled(self) -> bool:
        return self._cancel_event.is_set()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id":          self.job_id,
            "client_id":       self.client_id,
            "operation":       self.operation,
            "status":          self.status.value,
            "stage":           self.stage.value,
            "progress_pct":    self.progress_pct,
            "eta_seconds":     self.eta_seconds,
            "items_per_sec":   self.items_per_sec,
            "rows_per_sec":    self.rows_per_sec,
            "active_node":     self.active_node,
            "nodes_complete":  self.nodes_complete,
            "nodes_total":     self.nodes_total,
            "cache_hits":      self.cache_hits,
            "memory_mb":       self.memory_mb,
            "created_at":      self.created_at,
            "started_at":      self.started_at,
            "completed_at":    self.completed_at,
            "error":           self.error,
            "has_partial":     len(self.completed_nodes) > 0,
            "nodes_saved":     len(self.completed_nodes),
        }


class PipelineTaskManager:
    """
    Singleton background task engine.
    - Creates and tracks all pipeline jobs
    - Maintains live WebSocket telemetry
    - Supports cancel + partial checkpoint + resume
    - Provides ETA estimation per operation type
    """
    def __init__(self):
        self._jobs: Dict[str, PipelineJob] = {}
        self._ws_broadcaster = None   # injected at startup to avoid circular import

    def inject_broadcaster(self, broadcaster):
        """Inject the WebSocket broadcaster (called from main.py startup)."""
        self._ws_broadcaster = broadcaster

    # ── Job Lifecycle ────────────────────────────────────────────

    def create_job(self, client_id: str, operation: str, total_items: int = 1) -> PipelineJob:
        """Create a new pipeline job and return it immediately."""
        job_id = f"{operation}_{uuid.uuid4().hex[:12]}"
        job = PipelineJob(job_id, client_id, operation, total_items)
        self._jobs[job_id] = job
        logger.info(f"[PipelineManager] Job created: {job_id} ({operation}) for client {client_id}")
        return job

    def get_job(self, job_id: str) -> Optional[PipelineJob]:
        return self._jobs.get(job_id)

    def get_client_jobs(self, client_id: str) -> List[PipelineJob]:
        return [j for j in self._jobs.values() if j.client_id == client_id]

    def cancel_job(self, job_id: str) -> bool:
        job = self._jobs.get(job_id)
        if job and job.status == JobStatus.RUNNING:
            job.request_cancel()
            job.status = JobStatus.PARTIAL if job.completed_nodes else JobStatus.CANCELLED
            logger.info(f"[PipelineManager] Cancel requested for job {job_id}. Partial nodes saved: {len(job.completed_nodes)}")
            return True
        return False

    # ── Telemetry Broadcasting ───────────────────────────────────

    async def broadcast_progress(self, job: PipelineJob, telemetry: Dict[str, Any]):
        """Push PROGRESS_UPDATE to the client over WebSocket."""
        if not self._ws_broadcaster:
            return
        payload = {
            "type":         "PROGRESS_UPDATE",
            "job_id":       job.job_id,
            "workspace_id": job.client_id,
            "stage":        job.stage.value,
            "stage_label":  telemetry.get("stage_label", job.stage.value),
            "stage_description": telemetry.get("stage_description", ""),
            "progress":     telemetry.get("progress_pct", 0),
            "eta_seconds":  telemetry.get("eta_seconds", 0),
            "items_per_sec": telemetry.get("items_per_sec", 0),
            "rows_per_sec": telemetry.get("rows_per_sec", 0),
            "active_node":  telemetry.get("active_node", ""),
            "nodes_complete": telemetry.get("nodes_complete", 0),
            "nodes_total":  telemetry.get("nodes_total", 0),
            "cache_hits":   telemetry.get("cache_hits", 0),
            "cache_hit_rate_pct": telemetry.get("cache_hit_rate_pct", 0),
            "memory_mb":    telemetry.get("memory_mb", 0),
            "message":      telemetry.get("logs", [""])[-1] if telemetry.get("logs") else "",
            "logs":         telemetry.get("logs", []),
            "stages_completed": telemetry.get("stages_completed", []),
        }
        await self._ws_broadcaster.send_to_client(job.client_id, payload)
        # Also broadcast to all (for multi-window support)
        await self._ws_broadcaster.broadcast(payload)

    async def broadcast_stage_change(self, job: PipelineJob, stage: PipelineStage, description: str = ""):
        """Broadcast a STAGE_CHANGE event — triggers animated transition in frontend."""
        if not self._ws_broadcaster:
            return
        from backend.core.pipeline_stages import get_stage_meta
        meta = get_stage_meta(stage)
        job.stage = stage
        payload = {
            "type":         "STAGE_CHANGE",
            "job_id":       job.job_id,
            "workspace_id": job.client_id,
            "stage":        stage.value,
            "stage_label":  meta.label if meta else stage.value,
            "description":  description or (meta.description if meta else ""),
            "icon":         meta.icon if meta else "activity",
            "timestamp":    time.time(),
        }
        await self._ws_broadcaster.send_to_client(job.client_id, payload)
        await self._ws_broadcaster.broadcast(payload)

    async def broadcast_active_node(self, job: PipelineJob, node_path: str, rows: int, depth: int):
        """Broadcast ACTIVE_NODE for hierarchy construction animation."""
        if not self._ws_broadcaster:
            return
        job.active_node = node_path
        payload = {
            "type":         "ACTIVE_NODE",
            "job_id":       job.job_id,
            "workspace_id": job.client_id,
            "node":         node_path,
            "rows":         rows,
            "depth":        depth,
            "nodes_complete": job.nodes_complete,
            "nodes_total":  job.nodes_total,
        }
        await self._ws_broadcaster.send_to_client(job.client_id, payload)

    async def broadcast_completed(self, job: PipelineJob, result: Optional[Dict] = None):
        """Broadcast JOB_COMPLETED — triggers frontend navigation."""
        if not self._ws_broadcaster:
            return
        job.status = JobStatus.COMPLETED
        job.completed_at = time.time()
        job.progress_pct = 100
        job.result = result
        payload = {
            "type":         "JOB_COMPLETED",
            "job_id":       job.job_id,
            "workspace_id": job.client_id,
            "result":       result or {},
            "duration_s":   round(job.completed_at - (job.started_at or job.created_at), 2),
        }
        await self._ws_broadcaster.send_to_client(job.client_id, payload)
        await self._ws_broadcaster.broadcast(payload)

    async def broadcast_failed(self, job: PipelineJob, error: str):
        """Broadcast JOB_FAILED."""
        if not self._ws_broadcaster:
            return
        job.status = JobStatus.FAILED
        job.error = error
        payload = {
            "type":         "JOB_FAILED",
            "job_id":       job.job_id,
            "workspace_id": job.client_id,
            "error":        error,
        }
        await self._ws_broadcaster.send_to_client(job.client_id, payload)
        await self._ws_broadcaster.broadcast(payload)

    async def broadcast_partial_save(self, job: PipelineJob):
        """Broadcast PARTIAL_SAVE — user can resume later."""
        if not self._ws_broadcaster:
            return
        payload = {
            "type":         "PARTIAL_SAVE",
            "job_id":       job.job_id,
            "workspace_id": job.client_id,
            "nodes_saved":  len(job.completed_nodes),
            "message":      f"Processing cancelled. {len(job.completed_nodes)} nodes preserved — you can resume anytime.",
        }
        await self._ws_broadcaster.send_to_client(job.client_id, payload)
        await self._ws_broadcaster.broadcast(payload)

    # ── ETA Estimation ───────────────────────────────────────────

    def estimate_upload_eta(self, file_size_mb: float, row_estimate: int) -> float:
        """Rough ETA estimate for upload parsing phase (seconds)."""
        base = file_size_mb * 0.5   # ~0.5s per MB parsing
        row_cost = row_estimate * 0.00005  # 50µs per row for schema inference
        return round(base + row_cost, 1)

    def estimate_hierarchy_eta(self, total_rows: int, n_columns: int, hierarchy_depth: int) -> float:
        """Rough ETA for hierarchy segregation (seconds)."""
        nodes_estimate = 2 ** hierarchy_depth
        return round((total_rows * n_columns * 0.0001) + (nodes_estimate * 0.3), 1)

    def estimate_enrichment_eta(self, n_compounds: int, cache_hit_rate: float = 0.0, mode: str = "standard") -> float:
        """Rough ETA for enrichment (seconds)."""
        mode_factor = {"fast": 0.3, "standard": 0.8, "full": 2.5}.get(mode, 0.8)
        effective = n_compounds * (1.0 - cache_hit_rate)
        return round(effective * mode_factor, 1)

    # ── System Metrics ───────────────────────────────────────────

    def get_system_metrics(self) -> Dict[str, Any]:
        """Returns real-time host resource metrics for BenchmarkPanel."""
        try:
            import psutil
            mem = psutil.virtual_memory()
            cpu = psutil.cpu_percent(interval=None)
            proc = psutil.Process(os.getpid())
            proc_mem = proc.memory_info().rss / (1024 ** 2)
        except Exception:
            mem = type('m', (), {'percent': 0, 'available': 0})()
            cpu = 0.0
            proc_mem = 0.0

        active_jobs = [j for j in self._jobs.values() if j.status == JobStatus.RUNNING]
        return {
            "cpu_pct":          round(cpu, 1),
            "ram_pct":          round(mem.percent, 1),
            "available_ram_gb": round(mem.available / (1024 ** 3), 2),
            "process_ram_mb":   round(proc_mem, 1),
            "active_jobs":      len(active_jobs),
            "total_jobs":       len(self._jobs),
            "ws_connections":   0,   # injected by ws_broadcaster
            "worker_pool_size": os.cpu_count() or 1,
        }

    # ── Partial Workspace Detect ─────────────────────────────────

    def get_partial_job(self, client_id: str, operation: str) -> Optional[PipelineJob]:
        """Find a partially completed job that can be resumed."""
        for job in self._jobs.values():
            if (job.client_id == client_id
                    and job.operation == operation
                    and job.status in (JobStatus.PARTIAL, JobStatus.CANCELLED)
                    and job.completed_nodes):
                return job
        return None


# Global singleton
pipeline_manager = PipelineTaskManager()
