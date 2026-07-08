import time
import logging
from typing import Dict, Any, Optional, Set
from dataclasses import dataclass, field

from backend.shared.dataset_store import dataset_store, DatasetMetadata
from backend.shared.metadata_store import metadata_store, WorkspaceMeta

logger = logging.getLogger("sdo.shared.state_manager")


@dataclass
class StudioState:
    studio_id: str
    workspace_id: str
    active_tab: str = ""
    processing: bool = False
    status: str = "idle"
    metadata: Dict[str, Any] = field(default_factory=dict)
    last_activity: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "studio_id": self.studio_id,
            "workspace_id": self.workspace_id,
            "active_tab": self.active_tab,
            "processing": self.processing,
            "status": self.status,
            "metadata": self.metadata,
            "last_activity": self.last_activity,
        }


class StateManager:
    """
    Unified workspace state manager.
    Provides a single point of access for:
    - Dataset store (shared across studios)
    - Metadata store (workspace-level)
    - Studio state (per-studio within a workspace)
    - Event hooks for lifecycle tracking
    """

    def __init__(self):
        self._studio_states: Dict[str, StudioState] = {}

    # ── Workspace Lifecycle ──────────────────────────────────────────────────

    def create_workspace(
        self, workspace_id: str, label: str = ""
    ) -> WorkspaceMeta:
        meta = metadata_store.get_or_create(workspace_id)
        if label:
            meta.label = label
        metadata_store.save(workspace_id)
        logger.info(f"Workspace created: {workspace_id}")
        return meta

    def has_workspace(self, workspace_id: str) -> bool:
        return metadata_store.get_or_create(workspace_id) is not None

    def delete_workspace(self, workspace_id: str):
        dataset_store.unregister_dataset(workspace_id)
        metadata_store.delete(workspace_id)
        self._studio_states = {
            k: v for k, v in self._studio_states.items()
            if v.workspace_id != workspace_id
        }

    def get_workspace_meta(self, workspace_id: str) -> Optional[WorkspaceMeta]:
        return metadata_store.get_or_create(workspace_id)

    # ── Dataset Management ───────────────────────────────────────────────────

    def register_dataset(
        self,
        workspace_id: str,
        filename: str,
        original_path: str,
        parquet_path: str,
        row_count: int,
        columns: list,
        file_size_bytes: int,
        source: str = "upload",
    ) -> DatasetMetadata:
        meta = dataset_store.register_dataset(
            workspace_id=workspace_id,
            filename=filename,
            original_path=original_path,
            parquet_path=parquet_path,
            row_count=row_count,
            columns=columns,
            file_size_bytes=file_size_bytes,
            source=source,
        )
        metadata_store.update(
            workspace_id,
            last_accessed=time.time(),
            dataset_count=1,
        )
        return meta

    def get_dataset_meta(self, workspace_id: str) -> Optional[DatasetMetadata]:
        return dataset_store.get_metadata(workspace_id)

    def has_dataset(self, workspace_id: str) -> bool:
        return dataset_store.has_dataset(workspace_id)

    # ── Studio State ─────────────────────────────────────────────────────────

    def get_studio_state(
        self, workspace_id: str, studio_id: str
    ) -> StudioState:
        key = f"{workspace_id}:{studio_id}"
        if key not in self._studio_states:
            self._studio_states[key] = StudioState(
                studio_id=studio_id,
                workspace_id=workspace_id,
                last_activity=time.time(),
            )
        return self._studio_states[key]

    def update_studio_state(
        self,
        workspace_id: str,
        studio_id: str,
        **kwargs,
    ) -> StudioState:
        state = self.get_studio_state(workspace_id, studio_id)
        for k, v in kwargs.items():
            if hasattr(state, k):
                setattr(state, k, v)
        state.last_activity = time.time()

        meta_status = "completed" if state.status == "completed" else "in_progress" if state.processing else "pending"
        metadata_store.set_studio_progress(workspace_id, studio_id, meta_status)
        return state

    def get_all_studio_states(self, workspace_id: str) -> Dict[str, StudioState]:
        return {
            k.split(":")[1]: v
            for k, v in self._studio_states.items()
            if k.startswith(f"{workspace_id}:")
        }

    # ── Cleanup ──────────────────────────────────────────────────────────────

    def cleanup_orphaned(self):
        """Remove state for workspaces that no longer have metadata."""
        workspace_ids: Set[str] = set()
        for key in list(self._studio_states.keys()):
            ws_id = key.split(":")[0]
            workspace_ids.add(ws_id)

        for ws_id in workspace_ids:
            try:
                meta = metadata_store.get_or_create(ws_id)
                if not meta:
                    self.delete_workspace(ws_id)
            except Exception:
                pass


# Global singleton
state_manager = StateManager()
