import time
import math
import logging
import os
from typing import Dict, Any, List, Optional
from backend.core.pipeline_stages import PipelineStage, get_stage_meta

logger = logging.getLogger("sdo.backend.workers.tracker")


class ProgressTracker:
    """
    Rich real-time execution telemetry for ALL pipeline operations.
    Emits compound/sec, rows/sec, stage info, active node, cache metrics,
    and memory usage. Throttled to max 5Hz to avoid React rendering storms.
    """
    def __init__(
        self,
        job_id: str,
        total_items: int,
        throttle_seconds: float = 0.2,
        operation: str = "enrichment"
    ):
        self.job_id = job_id
        self.total = max(total_items, 1)
        self.operation = operation
        self.start_time = time.time()
        self.last_update_time = 0.0
        self.throttle_seconds = throttle_seconds

        # Stage tracking
        self.current_stage: PipelineStage = PipelineStage.IDLE
        self.stage_start_time: float = time.time()
        self.stages_completed: List[Dict[str, Any]] = []

        # Rows tracking
        self.rows_processed: int = 0
        self.rows_total: int = total_items

        # Speed tracking
        self.history_limit = 15
        self.speed_history: List[float] = []
        self.rows_speed_history: List[float] = []
        self.last_rows_count: int = 0
        self.last_rows_time: float = time.time()

        # Cache tracking
        self.cache_hits: int = 0
        self.cache_misses: int = 0

        # Hierarchy tracking
        self.active_node: str = ""
        self.nodes_complete: int = 0
        self.nodes_total: int = 0

        # Log buffer
        self.log_buffer: List[str] = []

    # ── Stage Management ─────────────────────────────────────────
    def set_stage(self, stage: PipelineStage, active_node: str = ""):
        """Transition to a new pipeline stage."""
        now = time.time()
        if self.current_stage != PipelineStage.IDLE:
            self.stages_completed.append({
                "stage": self.current_stage.value,
                "label": (get_stage_meta(self.current_stage) or type('', (), {'label': self.current_stage.value})()).label if get_stage_meta(self.current_stage) else self.current_stage.value,
                "duration_s": round(now - self.stage_start_time, 2)
            })
        self.current_stage = stage
        self.stage_start_time = now
        if active_node:
            self.active_node = active_node
        meta = get_stage_meta(stage)
        if meta:
            self.log(f"▶ {meta.label}: {meta.description}")

    # ── Logging ───────────────────────────────────────────────────
    def log(self, message: str):
        """Timestamped log line for WebSocket terminal console."""
        elapsed = time.time() - self.start_time
        ts = f"[{int(elapsed // 60):02d}:{int(elapsed % 60):02d}]"
        self.log_buffer.append(f"{ts} {message}")
        if len(self.log_buffer) > 200:
            self.log_buffer.pop(0)

    # ── Telemetry Calculation ─────────────────────────────────────
    def calculate_telemetry(self, current_items: int, rows_done: int = 0) -> Dict[str, Any]:
        """
        Full scientific telemetry payload:
        progress, ETA, items/sec, rows/sec, stage, node, cache, memory, logs.
        """
        now = time.time()
        elapsed = now - self.start_time
        remaining = self.total - current_items

        # ── Speed smoothing ───
        if elapsed > 0.01 and current_items > 0:
            raw_speed = current_items / elapsed
            self.speed_history.append(raw_speed)
            if len(self.speed_history) > self.history_limit:
                self.speed_history.pop(0)
        avg_speed = sum(self.speed_history) / len(self.speed_history) if self.speed_history else 0.01

        # ── Rows/sec ─────────
        rows_elapsed = now - self.last_rows_time
        if rows_elapsed > 0.5 and rows_done > self.last_rows_count:
            rows_delta = rows_done - self.last_rows_count
            rows_speed = rows_delta / rows_elapsed
            self.rows_speed_history.append(rows_speed)
            if len(self.rows_speed_history) > self.history_limit:
                self.rows_speed_history.pop(0)
            self.last_rows_count = rows_done
            self.last_rows_time = now
        avg_rows_speed = sum(self.rows_speed_history) / len(self.rows_speed_history) if self.rows_speed_history else 0.0

        # ── ETA ──────────────
        eta = remaining / avg_speed if avg_speed > 0 and remaining > 0 else 0.0
        progress_pct = min(99, int((current_items / self.total) * 100))

        # ── Memory ───────────
        memory_mb = 0.0
        try:
            import psutil
            proc = psutil.Process(os.getpid())
            memory_mb = round(proc.memory_info().rss / (1024 ** 2), 1)
        except Exception:
            pass

        # ── Stage meta ───────
        meta = get_stage_meta(self.current_stage)
        stage_label = meta.label if meta else self.current_stage.value
        stage_desc = meta.description if meta else ""

        # ── Cache hit rate ────
        total_cache = self.cache_hits + self.cache_misses
        hit_rate = round((self.cache_hits / total_cache) * 100, 1) if total_cache > 0 else 0.0

        return {
            "progress_pct":       progress_pct,
            "eta_seconds":        round(eta, 1),
            "elapsed_seconds":    round(elapsed, 1),
            "items_per_sec":      round(avg_speed, 2),
            "rows_per_sec":       round(avg_rows_speed, 1),
            "stage":              self.current_stage.value,
            "stage_label":        stage_label,
            "stage_description":  stage_desc,
            "active_node":        self.active_node,
            "nodes_complete":     self.nodes_complete,
            "nodes_total":        self.nodes_total,
            "cache_hits":         self.cache_hits,
            "cache_misses":       self.cache_misses,
            "cache_hit_rate_pct": hit_rate,
            "memory_mb":          memory_mb,
            "logs":               self.log_buffer[-10:],
            "stages_completed":   self.stages_completed,
        }

    def should_broadcast(self, force: bool = False) -> bool:
        """Throttle to max 5Hz (200ms interval)."""
        now = time.time()
        if force or (now - self.last_update_time) >= self.throttle_seconds:
            self.last_update_time = now
            return True
        return False
