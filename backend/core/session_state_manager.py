import os
import json
import logging
import time
from typing import Dict, Any, Optional
import pandas as pd

from backend.core.workspace_registry import PipelineContext, registry

logger = logging.getLogger("sdo.core.session_state_manager")

PIPELINE_VERSION = 5

class SessionStateManager:
    """
    Manages persistence, recovery, and cleanup of scientific pipeline sessions.
    Saves and loads PipelineContext states to/from a crash-safe JSON directory
    to ensure seamless reconnection, data recovery, and resilience.
    """
    
    def __init__(self, session_dir: str = "uploads/sessions"):
        self.session_dir = session_dir
        os.makedirs(self.session_dir, exist_ok=True)

    def get_state_file_path(self, workspace_id: str) -> str:
        """Returns the file path for a workspace session state."""
        return os.path.join(self.session_dir, f"session_{workspace_id}.json")

    def save_session(self, context: PipelineContext) -> bool:
        """
        Serializes and persists the active PipelineContext to disk.
        Executes atomically to prevent data corruption.
        """
        try:
            state_data = {
                "workspace_id": context.workspace_id,
                "pipeline_version": context.pipeline_version,
                "scientific_schema_version": context.scientific_schema_version,
                "descriptor_engine_version": context.descriptor_engine_version,
                "parquet_path": context.parquet_path,
                "mappings": context.mappings,
                "execution_trace": context.execution_trace,
                "segmentation_results": context.segmentation_results,
                "readiness_results": context.readiness_results,
                "active_job_id": context.active_job_id,
                "active_lineage": context.active_lineage,
                "node_details": context.hierarchy_engine.node_details if (context.hierarchy_engine and hasattr(context.hierarchy_engine, "node_details")) else None,
                "last_accessed": context.last_accessed,
                "saved_at": time.time(),
                # Dataset Intelligence fields (new)
                "dataset_mode": getattr(context, "dataset_mode", "MOLECULAR"),
                "dataset_classification": getattr(context, "dataset_classification", None),
                "dataset_passport": getattr(context, "dataset_passport", None),
                "detected_domain": getattr(context, "detected_domain", "General Scientific"),
                "primary_entity_type": getattr(context, "primary_entity_type", "Compound"),
                # V5 Subgroup Gate & Structure State fields
                "active_subgroup_path": getattr(context, "active_subgroup_path", None),
                "subgroup_metadata": getattr(context, "subgroup_metadata", {}),
                "subgroup_selected": getattr(context, "subgroup_selected", False),
                "selected_node_ids": getattr(context, "selected_node_ids", []),
                "structure_state": getattr(context, "structure_state", "UNKNOWN"),
                "smiles_coverage_pct": getattr(context, "smiles_coverage_pct", 0.0),
                "total_unique_compounds": getattr(context, "total_unique_compounds", 0),
                "structures_available": getattr(context, "structures_available", 0),
                "structures_missing": getattr(context, "structures_missing", 0),
                "recovery_attempted": getattr(context, "recovery_attempted", False),
                "recovery_completed": getattr(context, "recovery_completed", False),
                "post_recovery_coverage_pct": getattr(context, "post_recovery_coverage_pct", 0.0),
                "recovered_subgroup_path": getattr(context, "recovered_subgroup_path", None),
                "descriptor_dataframe_path": getattr(context, "descriptor_dataframe_path", None),
                "descriptor_engine_used": getattr(context, "descriptor_engine_used", None),
                "descriptor_count": getattr(context, "descriptor_count", 0),
            }
            
            temp_path = self.get_state_file_path(context.workspace_id) + ".tmp"
            with open(temp_path, "w") as f:
                json.dump(state_data, f, indent=2)
                
            # Atomic replace (standard deployment best practice)
            final_path = self.get_state_file_path(context.workspace_id)
            if os.path.exists(final_path):
                os.remove(final_path)
            os.rename(temp_path, final_path)
            
            logger.info(f"Session {context.workspace_id} successfully serialized to disk.")
            return True
        except Exception as e:
            logger.error(f"Failed to serialize session state for {context.workspace_id}: {e}")
            return False

    def load_session(self, workspace_id: str) -> Optional[PipelineContext]:
        """
        Deserializes and restores a PipelineContext session state from disk.
        Reconstructs database indices and dataframe slices if a cached source exists.
        """
        state_path = self.get_state_file_path(workspace_id)
        if not os.path.exists(state_path):
            logger.info(f"No serial session file found for workspace {workspace_id}.")
            return None
            
        try:
            with open(state_path, "r") as f:
                state_data = json.load(f)
                
            # V5 hard session wipe if version mismatch
            loaded_version = state_data.get("pipeline_version", 3.0)
            if loaded_version < PIPELINE_VERSION:
                logger.warning(f"Workspace {workspace_id}: V4/V3 session ({loaded_version}) detected. Clearing stale session.")
                try:
                    os.remove(state_path)
                except Exception:
                    pass
                return None

            # Reconstruct context
            context = PipelineContext(
                workspace_id=state_data["workspace_id"],
                pipeline_version=5,
                scientific_schema_version=state_data.get("scientific_schema_version", "1.0"),
                descriptor_engine_version=state_data.get("descriptor_engine_version", "2023.9")
            )
            
            context.parquet_path = state_data.get("parquet_path")
            context.mappings = state_data.get("mappings", {})
            context.execution_trace = state_data.get("execution_trace", [])
            context.segmentation_results = state_data.get("segmentation_results", {})
            context.readiness_results = state_data.get("readiness_results", {})
            context.active_job_id = state_data.get("active_job_id")
            context.last_accessed = state_data.get("last_accessed", time.time())
            
            # Restore Dataset Intelligence fields (with MOLECULAR default for legacy sessions)
            context.dataset_mode = state_data.get("dataset_mode", "MOLECULAR")
            context.dataset_classification = state_data.get("dataset_classification", None)
            context.dataset_passport = state_data.get("dataset_passport", None)
            context.detected_domain = state_data.get("detected_domain", "General Scientific")
            context.primary_entity_type = state_data.get("primary_entity_type", "Compound")

            # Restore active lineage & hierarchy engine details
            context.active_lineage = state_data.get("active_lineage")
            context.active_segregation_result = context.active_lineage
            
            # Restore V5 Subgroup Gate & Structure State fields
            context.active_subgroup_path = state_data.get("active_subgroup_path", None)
            context.subgroup_metadata = state_data.get("subgroup_metadata", {})
            context.subgroup_selected = state_data.get("subgroup_selected", False)
            context.selected_node_ids = state_data.get("selected_node_ids", [])
            context.structure_state = state_data.get("structure_state", "UNKNOWN")
            context.smiles_coverage_pct = state_data.get("smiles_coverage_pct", 0.0)
            context.total_unique_compounds = state_data.get("total_unique_compounds", 0)
            context.structures_available = state_data.get("structures_available", 0)
            context.structures_missing = state_data.get("structures_missing", 0)
            context.recovery_attempted = state_data.get("recovery_attempted", False)
            context.recovery_completed = state_data.get("recovery_completed", False)
            context.post_recovery_coverage_pct = state_data.get("post_recovery_coverage_pct", 0.0)
            context.recovered_subgroup_path = state_data.get("recovered_subgroup_path", None)
            context.descriptor_dataframe_path = state_data.get("descriptor_dataframe_path", None)
            context.descriptor_engine_used = state_data.get("descriptor_engine_used", None)
            context.descriptor_count = state_data.get("descriptor_count", 0)

            node_details = state_data.get("node_details")
            if node_details:
                try:
                    from backend.core.hierarchy_engine import HierarchyEngine
                    engine = HierarchyEngine(context.workspace_id, context.mappings)
                    engine.node_details = node_details
                    context.hierarchy_engine = engine
                except Exception as e:
                    logger.error(f"Failed to restore hierarchy engine in load_session: {e}")
            
            # Re-seed into global registry
            registry.workspaces[workspace_id] = context
            logger.info(f"Session {workspace_id} successfully restored from serialized state.")
            return context
        except Exception as e:
            logger.error(f"Failed to load session state for {workspace_id}: {e}")
            return None

    def delete_session(self, workspace_id: str) -> bool:
        """Removes session files and cleans up system caches to free disk space."""
        try:
            state_path = self.get_state_file_path(workspace_id)
            if os.path.exists(state_path):
                os.remove(state_path)
                logger.info(f"Deleted state file for session {workspace_id}.")
            return True
        except Exception as e:
            logger.error(f"Failed to delete session state file for {workspace_id}: {e}")
            return False

# Global state manager singleton
session_manager = SessionStateManager()
