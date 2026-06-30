import json
import time
import hashlib
import logging
from typing import Dict, Any, List, Optional
import pandas as pd
from sqlalchemy import select, desc

from backend.database.session import SessionLocal
from backend.database.models import Workspace, WorkspaceBranch, WorkflowEvent
from backend.core.database.duckdb_engine import duckdb_engine

logger = logging.getLogger("sdo.core.replay.event_sourcer")

class EventSourcer:
    """
    Event Sourcing Engine for Scientific Workflow Replay™ and Analysis Provenance Tree™.
    Logs every workspace change to SQLite and plays them back sequentially in DuckDB.
    """

    @staticmethod
    def record_event(
        workspace_id: str,
        branch_id: str,
        action_type: str,
        payload: Dict[str, Any]
    ) -> Optional[WorkflowEvent]:
        """Saves a new serialized event checkpoint in the SQLite audit log."""
        with SessionLocal() as session:
            # 1. Determine sequence order
            stmt = select(WorkflowEvent).where(
                WorkflowEvent.workspace_id == workspace_id,
                WorkflowEvent.branch_id == branch_id
            ).order_by(desc(WorkflowEvent.sequence_order)).limit(1)
            
            last_event = session.execute(stmt).scalar_one_or_none()
            seq = (last_event.sequence_order + 1) if last_event else 1

            # 2. Compute state signature hash
            serialized_payload = json.dumps(payload, sort_keys=True)
            prev_hash = last_event.signature_hash if last_event else "GENESIS"
            hash_input = f"{prev_hash}_{seq}_{action_type}_{serialized_payload}".encode("utf-8")
            sig_hash = hashlib.sha256(hash_input).hexdigest()

            # 3. Create event record
            event_id = f"evt_{workspace_id}_{branch_id}_{seq}_{int(time.time())}"
            event = WorkflowEvent(
                event_id=event_id,
                workspace_id=workspace_id,
                branch_id=branch_id,
                sequence_order=seq,
                timestamp=time.time(),
                action_type=action_type,
                payload=payload,
                signature_hash=sig_hash
            )
            
            session.add(event)
            session.commit()
            
            # Check if active branch needs updating on workspace
            ws_stmt = select(Workspace).where(Workspace.workspace_id == workspace_id)
            ws = session.execute(ws_stmt).scalar_one_or_none()
            if ws and ws.active_branch_id != branch_id:
                ws.active_branch_id = branch_id
                session.commit()
                
            logger.info(f"Recorded event {event_id} (Seq: {seq}, Type: {action_type})")
            return event

    @staticmethod
    def create_branch(workspace_id: str, name: str, parent_event_id: Optional[str] = None) -> WorkspaceBranch:
        """Creates a new analysis branch stemming from a parent event."""
        with SessionLocal() as session:
            branch_id = f"br_{workspace_id}_{name.lower().replace(' ', '_')}"
            branch = WorkspaceBranch(
                branch_id=branch_id,
                workspace_id=workspace_id,
                name=name,
                parent_event_id=parent_event_id,
                created_at=pd.Timestamp.now()
            )
            session.add(branch)
            session.commit()
            logger.info(f"Created branch {branch_id} for workspace {workspace_id}")
            return branch

    @staticmethod
    def replay_branch(workspace_id: str, branch_id: str) -> pd.DataFrame:
        """
        Replays all events for a branch step-by-step.
        Builds a clean table state `ws_{workspace_id}_active` in DuckDB.
        """
        with SessionLocal() as session:
            # 1. Fetch all branches leading up to the current branch to rebuild complete lineage
            # If the branch has a parent event, we must replay parent events up to parent_event_id first
            branch_stmt = select(WorkspaceBranch).where(WorkspaceBranch.branch_id == branch_id)
            branch = session.execute(branch_stmt).scalar_one_or_none()
            if not branch:
                raise ValueError(f"Branch {branch_id} not found")

            event_history = []
            current_br = branch
            
            # Walk up branch parents to collect all parent events
            while current_br:
                br_events_stmt = select(WorkflowEvent).where(
                    WorkflowEvent.branch_id == current_br.branch_id
                ).order_by(WorkflowEvent.sequence_order)
                br_events = session.execute(br_events_stmt).scalars().all()
                
                if current_br.parent_event_id:
                    # Filter events in this branch only up to parent_event_id
                    filtered = []
                    for e in br_events:
                        filtered.append(e)
                        if e.event_id == current_br.parent_event_id:
                            break
                    event_history = filtered + event_history
                    
                    # Move to parent branch
                    parent_evt_stmt = select(WorkflowEvent).where(WorkflowEvent.event_id == current_br.parent_event_id)
                    parent_evt = session.execute(parent_evt_stmt).scalar_one_or_none()
                    if parent_evt:
                        parent_br_stmt = select(WorkspaceBranch).where(WorkspaceBranch.branch_id == parent_evt.branch_id)
                        current_br = session.execute(parent_br_stmt).scalar_one_or_none()
                    else:
                        current_br = None
                else:
                    event_history = list(br_events) + event_history
                    current_br = None

            # 2. Re-run events sequentially in DuckDB
            table_name = f"ws_{workspace_id}_active"
            logger.info(f"Replaying {len(event_history)} events to rebuild {table_name}")

            for event in event_history:
                EventSourcer._apply_event_to_duckdb(table_name, event.action_type, event.payload)

            # 3. Return final dataframe from DuckDB
            return duckdb_engine.query_to_df(f"SELECT * FROM {table_name}")

    @staticmethod
    def _apply_event_to_duckdb(table_name: str, action_type: str, payload: Dict[str, Any]):
        """Executes a single event transition in DuckDB."""
        if action_type == "INGEST_DATA":
            # Load raw data from CSV or Excel path
            file_path = payload.get("file_path")
            if not file_path or not os.path.exists(file_path):
                raise FileNotFoundError(f"Source file {file_path} not found during replay")
            
            # Read and register
            if file_path.endswith('.xlsx') or file_path.endswith('.xls'):
                df = pd.read_excel(file_path)
            else:
                df = pd.read_csv(file_path)
            duckdb_engine.register_dataframe(df, table_name)

        elif action_type == "FILTER_ROWS":
            col = payload.get("column")
            op = payload.get("operator")  # =, >, <, !=, etc.
            val = payload.get("value")
            
            # Apply deletion
            query = f"DELETE FROM {table_name} WHERE {col} {op} ?"
            duckdb_engine.execute_query(query, (val,))

        elif action_type == "IMPUTE_VALUES":
            col = payload.get("column")
            val = payload.get("value")
            
            query = f"UPDATE {table_name} SET {col} = ? WHERE {col} IS NULL"
            duckdb_engine.execute_query(query, (val,))

        elif action_type == "MAP_COLUMNS":
            mappings = payload.get("mappings", {})  # {old_name: new_name}
            for old_col, new_col in mappings.items():
                if duckdb_engine.table_exists(table_name):
                    # Rename column in DuckDB
                    query = f"ALTER TABLE {table_name} RENAME COLUMN {old_col} TO {new_col}"
                    duckdb_engine.execute_query(query)

        else:
            logger.warning(f"Unresolved event action type during DuckDB replay: {action_type}")

    @staticmethod
    def get_provenance_tree(workspace_id: str) -> Dict[str, Any]:
        """Returns the complete branching Provenance Tree schema for UI rendering."""
        with SessionLocal() as session:
            # Fetch all branches and events
            stmt_branches = select(WorkspaceBranch).where(WorkspaceBranch.workspace_id == workspace_id)
            branches = session.execute(stmt_branches).scalars().all()
            
            stmt_events = select(WorkflowEvent).where(WorkflowEvent.workspace_id == workspace_id).order_by(WorkflowEvent.sequence_order)
            events = session.execute(stmt_events).scalars().all()

            nodes = []
            edges = []

            # Add genesis node
            nodes.append({
                "id": "genesis",
                "label": "Genesis Ingestion",
                "type": "root",
                "timestamp": time.time()
            })

            # Map branches
            branch_map = {b.branch_id: b for b in branches}

            for event in events:
                node_id = event.event_id
                nodes.append({
                    "id": node_id,
                    "label": f"{event.action_type} (Seq: {event.sequence_order})",
                    "type": "event",
                    "timestamp": event.timestamp,
                    "payload": event.payload,
                    "branch_id": event.branch_id
                })

                # Connect nodes
                if event.sequence_order == 1:
                    # Connect to genesis or parent branch event
                    br = branch_map.get(event.branch_id)
                    parent_id = br.parent_event_id if (br and br.parent_event_id) else "genesis"
                    edges.append({"source": parent_id, "target": node_id, "label": br.name if br else "main"})
                else:
                    # Connect to previous event in same branch
                    prev_evt_stmt = select(WorkflowEvent).where(
                        WorkflowEvent.workspace_id == workspace_id,
                        WorkflowEvent.branch_id == event.branch_id,
                        WorkflowEvent.sequence_order == event.sequence_order - 1
                    )
                    prev_evt = session.execute(prev_evt_stmt).scalar_one_or_none()
                    if prev_evt:
                        edges.append({"source": prev_evt.event_id, "target": node_id})

            return {
                "workspace_id": workspace_id,
                "nodes": nodes,
                "edges": edges
            }
