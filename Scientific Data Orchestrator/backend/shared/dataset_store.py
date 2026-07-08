import os
import time
import logging
import pandas as pd
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger("sdo.shared.dataset_store")


@dataclass
class DatasetMetadata:
    workspace_id: str
    filename: str
    original_path: str
    parquet_path: str
    row_count: int
    column_count: int
    columns: List[str]
    file_size_bytes: int
    ingested_at: float
    source: str = "upload"  # "upload" | "demo" | "recovery"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "workspace_id": self.workspace_id,
            "filename": self.filename,
            "original_path": self.original_path,
            "parquet_path": self.parquet_path,
            "row_count": self.row_count,
            "column_count": self.column_count,
            "columns": self.columns,
            "file_size_bytes": self.file_size_bytes,
            "ingested_at": self.ingested_at,
            "source": self.source,
        }


class DatasetStore:
    """
    Shared dataset storage layer.
    Provides unified access to workspace datasets regardless of which studio
    ingested the data. The source of truth is parquet files on disk;
    in-memory dataframes are cached for performance.
    """

    def __init__(self):
        self._cache: Dict[str, pd.DataFrame] = {}
        self._metadata: Dict[str, DatasetMetadata] = {}
        self._last_access: Dict[str, float] = {}

    # ── Registration ─────────────────────────────────────────────────────────

    def register_dataset(
        self,
        workspace_id: str,
        filename: str,
        original_path: str,
        parquet_path: str,
        row_count: int,
        columns: List[str],
        file_size_bytes: int,
        source: str = "upload",
    ) -> DatasetMetadata:
        meta = DatasetMetadata(
            workspace_id=workspace_id,
            filename=filename,
            original_path=original_path,
            parquet_path=parquet_path,
            row_count=row_count,
            column_count=len(columns),
            columns=columns,
            file_size_bytes=file_size_bytes,
            ingested_at=time.time(),
            source=source,
        )
        self._metadata[workspace_id] = meta
        logger.info(
            f"Dataset registered for workspace {workspace_id}: "
            f"{row_count} rows x {len(columns)} cols ({filename})"
        )
        return meta

    def unregister_dataset(self, workspace_id: str):
        self._metadata.pop(workspace_id, None)
        self._cache.pop(workspace_id, None)
        self._last_access.pop(workspace_id, None)

    # ── Access ───────────────────────────────────────────────────────────────

    def get_metadata(self, workspace_id: str) -> Optional[DatasetMetadata]:
        return self._metadata.get(workspace_id)

    def has_dataset(self, workspace_id: str) -> bool:
        meta = self._metadata.get(workspace_id)
        if meta is None:
            return False
        return os.path.exists(meta.parquet_path)

    def load_dataframe(
        self,
        workspace_id: str,
        use_cache: bool = True,
        columns: Optional[List[str]] = None,
    ) -> pd.DataFrame:
        meta = self._metadata.get(workspace_id)
        if meta is None:
            raise ValueError(
                f"No dataset registered for workspace '{workspace_id}'. "
                "Upload a dataset first."
            )
        if not os.path.exists(meta.parquet_path):
            raise FileNotFoundError(
                f"Parquet file not found for workspace '{workspace_id}': "
                f"{meta.parquet_path}"
            )
        if use_cache and workspace_id in self._cache:
            df = self._cache[workspace_id]
            if columns:
                available = [c for c in columns if c in df.columns]
                return df[available]
            return df
        df = pd.read_parquet(meta.parquet_path, columns=columns)
        if use_cache:
            self._cache[workspace_id] = df
        self._last_access[workspace_id] = time.time()
        return df

    def update_dataframe(
        self, workspace_id: str, df: pd.DataFrame, persist: bool = True
    ):
        self._cache[workspace_id] = df
        self._last_access[workspace_id] = time.time()
        if persist:
            meta = self._metadata.get(workspace_id)
            if meta and os.path.exists(os.path.dirname(meta.parquet_path)):
                df.to_parquet(meta.parquet_path, index=False)
                meta.row_count = len(df)
                meta.columns = df.columns.tolist()
                meta.column_count = len(df.columns)

    def evict_cache(self, workspace_id: str):
        self._cache.pop(workspace_id, None)
        self._last_access.pop(workspace_id, None)

    def clear_all(self):
        self._cache.clear()
        self._metadata.clear()
        self._last_access.clear()

    def workspace_summary(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        meta = self.get_metadata(workspace_id)
        if meta is None:
            return None
        return {
            **meta.to_dict(),
            "cached": workspace_id in self._cache,
        }


# Global singleton
dataset_store = DatasetStore()
