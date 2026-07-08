import os
import json
import time
import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field, asdict

logger = logging.getLogger("sdo.shared.metadata_store")


@dataclass
class WorkspaceMeta:
    workspace_id: str
    label: str = ""
    created_at: float = 0.0
    last_accessed: float = 0.0
    pipeline_version: int = 5
    dataset_mode: str = "MOLECULAR"
    detected_domain: str = "General Scientific"
    primary_entity_type: str = "Compound"
    dataset_count: int = 0
    tags: List[str] = field(default_factory=list)
    studio_progress: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class MetadataStore:
    """
    Shared workspace metadata store.
    Tracks workspace-level metadata that is independent of any specific studio.
    Persisted to JSON for crash recovery.
    """

    def __init__(self, storage_dir: str = "workspaces"):
        self._storage_dir = storage_dir
        self._cache: Dict[str, WorkspaceMeta] = {}
        os.makedirs(storage_dir, exist_ok=True)

    def _meta_path(self, workspace_id: str) -> str:
        return os.path.join(
            self._storage_dir, workspace_id, "workspace_meta.json"
        )

    def get_or_create(self, workspace_id: str) -> WorkspaceMeta:
        if workspace_id in self._cache:
            return self._cache[workspace_id]
        meta = self._load_from_disk(workspace_id)
        if meta is None:
            meta = WorkspaceMeta(
                workspace_id=workspace_id,
                created_at=time.time(),
                last_accessed=time.time(),
            )
        self._cache[workspace_id] = meta
        return meta

    def save(self, workspace_id: str):
        meta = self._cache.get(workspace_id)
        if meta is None:
            return
        meta.last_accessed = time.time()
        path = self._meta_path(workspace_id)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(meta.to_dict(), f, indent=2)

    def _load_from_disk(self, workspace_id: str) -> Optional[WorkspaceMeta]:
        path = self._meta_path(workspace_id)
        if not os.path.exists(path):
            return None
        try:
            with open(path) as f:
                data = json.load(f)
            return WorkspaceMeta(**data)
        except Exception as e:
            logger.warning(f"Failed to load metadata for {workspace_id}: {e}")
            return None

    def update(
        self, workspace_id: str, **kwargs
    ) -> WorkspaceMeta:
        meta = self.get_or_create(workspace_id)
        for key, value in kwargs.items():
            if hasattr(meta, key):
                setattr(meta, key, value)
        self.save(workspace_id)
        return meta

    def set_studio_progress(
        self, workspace_id: str, studio_id: str, status: str
    ):
        meta = self.get_or_create(workspace_id)
        if meta.studio_progress is None:
            meta.studio_progress = {}
        meta.studio_progress[studio_id] = status
        self.save(workspace_id)

    def get_all_workspaces(self) -> List[Dict[str, Any]]:
        results = []
        if not os.path.exists(self._storage_dir):
            return results
        for entry in os.listdir(self._storage_dir):
            meta_path = os.path.join(self._storage_dir, entry, "workspace_meta.json")
            if os.path.exists(meta_path):
                try:
                    with open(meta_path) as f:
                        results.append(json.load(f))
                except Exception:
                    pass
        return results

    def delete(self, workspace_id: str):
        self._cache.pop(workspace_id, None)
        meta_path = self._meta_path(workspace_id)
        if os.path.exists(meta_path):
            try:
                os.remove(meta_path)
            except Exception as e:
                logger.warning(f"Failed to delete metadata for {workspace_id}: {e}")


# Global singleton
metadata_store = MetadataStore()
