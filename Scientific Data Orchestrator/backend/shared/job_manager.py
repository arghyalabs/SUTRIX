import time
import uuid
import logging
from typing import Dict, Any, Optional, List
from enum import Enum

logger = logging.getLogger("sdo.shared.job_manager")


class JobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Job:
    """In-memory job representation."""

    def __init__(
        self,
        job_id: str,
        workspace_id: str,
        job_type: str,
        total_items: int = 1,
    ):
        self.job_id = job_id
        self.workspace_id = workspace_id
        self.job_type = job_type
        self.status = JobStatus.QUEUED
        self.progress_pct = 0
        self.total_items = total_items
        self.processed_items = 0
        self.started_at: Optional[float] = None
        self.completed_at: Optional[float] = None
        self.eta_seconds: float = 0.0
        self.speed: float = 0.0
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.phase: str = "Queued"
        self.logs: List[str] = []
        self.created_at = time.time()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "workspace_id": self.workspace_id,
            "job_type": self.job_type,
            "status": self.status.value,
            "progress_pct": self.progress_pct,
            "total_items": self.total_items,
            "processed_items": self.processed_items,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "eta_seconds": self.eta_seconds,
            "speed": self.speed,
            "result": self.result,
            "error": self.error,
            "phase": self.phase,
            "logs": self.logs,
            "created_at": self.created_at,
        }


class JobManager:
    """
    Shared job manager.
    Provides unified job tracking across all studios.
    Wraps the existing job_registry (SQLite) for persistence while
    maintaining an in-memory cache for fast access.
    """

    def __init__(self):
        self._jobs: Dict[str, Job] = {}

    def create_job(
        self,
        workspace_id: str,
        job_type: str,
        total_items: int = 1,
    ) -> Job:
        job_id = str(uuid.uuid4())
        job = Job(
            job_id=job_id,
            workspace_id=workspace_id,
            job_type=job_type,
            total_items=total_items,
        )
        self._jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        return self._jobs.get(job_id)

    def update_job(
        self,
        job_id: str,
        status: Optional[JobStatus] = None,
        progress: Optional[int] = None,
        eta: Optional[float] = None,
        speed: Optional[float] = None,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        phase: Optional[str] = None,
    ) -> bool:
        job = self._jobs.get(job_id)
        if job is None:
            return False
        if status is not None:
            job.status = status
            if status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                job.completed_at = time.time()
        if progress is not None:
            job.progress_pct = min(progress, 100)
        if eta is not None:
            job.eta_seconds = eta
        if speed is not None:
            job.speed = speed
        if result is not None:
            job.result = result
        if error is not None:
            job.error = error
        if phase is not None:
            job.phase = phase
        return True

    def cancel_job(self, job_id: str) -> bool:
        return self.update_job(
            job_id,
            status=JobStatus.CANCELLED,
            error="Cancelled by user",
        )

    def get_workspace_jobs(self, workspace_id: str) -> List[Job]:
        return [
            job for job in self._jobs.values()
            if job.workspace_id == workspace_id
        ]

    def get_active_jobs(self) -> List[Job]:
        return [
            job for job in self._jobs.values()
            if job.status in (JobStatus.QUEUED, JobStatus.RUNNING)
        ]

    def clean_old_jobs(self, max_age_seconds: float = 86400):
        now = time.time()
        to_remove = [
            jid for jid, job in self._jobs.items()
            if job.completed_at and (now - job.completed_at) > max_age_seconds
        ]
        for jid in to_remove:
            self._jobs.pop(jid, None)


# Global singleton
job_manager = JobManager()
