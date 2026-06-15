import os
import shutil
import uuid
import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Depends
import pandas as pd
from sqlalchemy import select

from backend.core.workspace_registry import registry, PipelineContext
from backend.core.database.duckdb_engine import duckdb_engine
from backend.core.study_detection.classifier import StudyTypeDetector
from backend.core.replay.event_sourcer import EventSourcer
from backend.database.session import SessionLocal
from backend.database.models import Workspace, WorkspaceBranch

logger = logging.getLogger("sdo.api.routes.spreadsheet")

router = APIRouter(prefix="/api/spreadsheet", tags=["Spreadsheet"])

@router.post("/ingest")
async def ingest_dataset(
    client_id: str = Form(...),
    title: Optional[str] = Form(None),
    user_persona: Optional[str] = Form("TOXICOLOGIST"),
    file: UploadFile = File(...)
) -> Dict[str, Any]:
    """
    Ingests a raw CSV or Excel dataset into the SIOS workspace.
    Runs the 3-Layer Study-Type Detection Engine, registers the data in DuckDB,
    initiates the git-like main branch, and logs the Genesis event.
    """
    try:
        # 1. Retrieve or create PipelineContext
        context = registry.get_context(client_id)
        if not context:
            context = PipelineContext(workspace_id=client_id)
            registry.register_context(client_id, context)

        # 2. Save the uploaded file to workspace uploads path
        filename = file.filename or "raw_dataset.csv"
        file_path = os.path.join(context.workspace_dir, "uploads", filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 3. Read dataset into Pandas DataFrame
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(file_path)
        else:
            df = pd.read_csv(file_path)

        # 4. Run 3-Layer Study-Type Detection Engine
        classification = StudyTypeDetector.detect(df)
        detected_domain = classification["detected_domain"]

        # 5. Initialize Relational Database Records (SQLite)
        with SessionLocal() as session:
            ws_stmt = select(Workspace).where(Workspace.workspace_id == client_id)
            ws = session.execute(ws_stmt).scalar_one_or_none()
            if not ws:
                ws = Workspace(
                    workspace_id=client_id,
                    title=title or f"Workspace_{client_id[:8]}",
                    dataset_mode=detected_domain,
                    user_persona=user_persona or "TOXICOLOGIST",
                    active_branch_id="main"
                )
                session.add(ws)
                session.commit()
                # Create main branch
                EventSourcer.create_branch(client_id, "main")

        # 6. Log the Genesis event in Replay log (Event Sourcing)
        branch_id = f"br_{client_id}_main"
        payload = {"file_path": file_path, "filename": filename, "title": title}
        EventSourcer.record_event(client_id, branch_id, "INGEST_DATA", payload)

        # 7. Register DataFrame in DuckDB
        table_name = f"ws_{client_id}_active"
        duckdb_engine.register_dataframe(df, table_name)

        # 8. Save active state as parquet checkpoint to ensure compatibility with legacy SUTRIX modules
        parquet_path = os.path.join(context.workspace_dir, "active_dataset.parquet")
        df.to_parquet(parquet_path)
        
        # Update PipelineContext properties
        context.parquet_path = parquet_path
        context.dataframe_cache = df
        context.dataset_mode = detected_domain
        context.user_persona = user_persona or "TOXICOLOGIST"
        context.detected_domain = detected_domain
        context.raw_ingestion_count = len(df)
        context.touch(save_to_disk=True)

        return {
            "workspace_id": client_id,
            "title": ws.title if ws else title,
            "detected_domain": detected_domain,
            "confidence_score": classification["confidence_score"],
            "triggered_rules": classification["triggered_rules"],
            "row_count": len(df),
            "columns": list(df.columns),
            "preview_rows": df.head(10).fillna("").to_dict(orient="records"),
            "metadata": classification["metadata"]
        }

    except Exception as e:
        logger.error(f"Failed to ingest dataset: {e}")
        raise HTTPException(status_code=500, detail=f"Dataset ingestion failed: {str(e)}")

@router.post("/query")
def execute_spreadsheet_query(client_id: str, query: str) -> Dict[str, Any]:
    """Runs a custom analytical DuckDB SQL query against the active workspace spreadsheet."""
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Workspace context not found")

    table_name = f"ws_{client_id}_active"
    if not duckdb_engine.table_exists(table_name):
        raise HTTPException(status_code=400, detail="Spreadsheet table does not exist. Ingest data first.")

    # Prevent SQL injections targeting system tables or dropping databases
    query_lower = query.lower().strip()
    if any(kw in query_lower for kw in ["drop database", "shutdown", "alter system", "pragma"]):
        raise HTTPException(status_code=403, detail="Unauthorized system query block triggered.")

    try:
        df = duckdb_engine.query_to_df(query)
        return {
            "columns": list(df.columns),
            "row_count": len(df),
            "rows": df.fillna("").to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"SQL Execution Error: {str(e)}")

@router.post("/apply-filter")
def apply_row_filter(
    client_id: str,
    column: str,
    operator: str,
    value: str
) -> Dict[str, Any]:
    """Applies a spreadsheet filter (deleting matching rows), logging the event and mutating DuckDB."""
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Workspace context not found")

    table_name = f"ws_{client_id}_active"
    if not duckdb_engine.table_exists(table_name):
        raise HTTPException(status_code=400, detail="Active table not found")

    # Validate operators to prevent raw query injections
    valid_operators = ["=", ">", "<", ">=", "<=", "!=", "like", "ilike"]
    if operator.lower() not in valid_operators:
        raise HTTPException(status_code=400, detail=f"Invalid operator: {operator}")

    try:
        # Record the FILTER_ROWS event
        branch_id = f"br_{client_id}_{context.active_branch_id}" if hasattr(context, "active_branch_id") else f"br_{client_id}_main"
        payload = {"column": column, "operator": operator, "value": value}
        EventSourcer.record_event(client_id, branch_id, "FILTER_ROWS", payload)

        # Mutate DuckDB table
        query = f"DELETE FROM {table_name} WHERE {column} {operator} ?"
        duckdb_engine.execute_query(query, (value,))

        # Synchronize back to Pandas/Parquet cache
        df = duckdb_engine.query_to_df(f"SELECT * FROM {table_name}")
        df.to_parquet(context.parquet_path)
        context.dataframe_cache = df
        context.touch(save_to_disk=True)

        return {
            "status": "SUCCESS",
            "remaining_rows": len(df),
            "columns": list(df.columns)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Filter application failed: {str(e)}")

@router.post("/impute")
def apply_imputation(
    client_id: str,
    column: str,
    value: str
) -> Dict[str, Any]:
    """Imputes missing (NULL) values in a column, logging the event and updating the DuckDB database."""
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Workspace context not found")

    table_name = f"ws_{client_id}_active"
    if not duckdb_engine.table_exists(table_name):
        raise HTTPException(status_code=400, detail="Active table not found")

    try:
        # Record IMPUTE_VALUES event
        branch_id = f"br_{client_id}_{context.active_branch_id}" if hasattr(context, "active_branch_id") else f"br_{client_id}_main"
        payload = {"column": column, "value": value}
        EventSourcer.record_event(client_id, branch_id, "IMPUTE_VALUES", payload)

        # Mutate DuckDB table
        query = f"UPDATE {table_name} SET {column} = ? WHERE {column} IS NULL"
        duckdb_engine.execute_query(query, (value,))

        # Synchronize back to cache
        df = duckdb_engine.query_to_df(f"SELECT * FROM {table_name}")
        df.to_parquet(context.parquet_path)
        context.dataframe_cache = df
        context.touch(save_to_disk=True)

        return {
            "status": "SUCCESS",
            "row_count": len(df),
            "null_count": int(df[column].isna().sum())
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Imputation failed: {str(e)}")

@router.get("/cdisc-info")
def get_cdisc_compliance_mapping(client_id: str) -> Dict[str, Any]:
    """Analyses the active spreadsheet columns to detect CDISC SDTM/ADaM compliance domains."""
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Workspace context not found")

    df = context.load_active_dataset()
    if df is None:
         raise HTTPException(status_code=400, detail="Active dataset empty or not loaded")

    col_names = [str(c).upper() for c in df.columns]
    detected_domains = []

    # Demographics (DM) checks
    dm_matches = [c for c in ["USUBJID", "SUBJID", "ARM", "SEX", "AGE", "RACE"] if c in col_names]
    if "USUBJID" in col_names and len(dm_matches) >= 3:
        detected_domains.append({
            "domain": "DM",
            "name": "Demographics",
            "matches": dm_matches,
            "completeness_pct": round((len(dm_matches) / 6.0) * 100, 1)
        })

    # Adverse Events (AE) checks
    ae_matches = [c for c in ["USUBJID", "AEDECOD", "AESTDTC", "AEENDTC", "AESEV", "AESER"] if c in col_names]
    if "USUBJID" in col_names and "AEDECOD" in col_names:
        detected_domains.append({
            "domain": "AE",
            "name": "Adverse Events",
            "matches": ae_matches,
            "completeness_pct": round((len(ae_matches) / 6.0) * 100, 1)
        })

    # Vital Signs (VS) checks
    vs_matches = [c for c in ["USUBJID", "VSTESTCD", "VSORRES", "VSORRESU", "VSDTC"] if c in col_names]
    if "USUBJID" in col_names and "VSTESTCD" in col_names:
        detected_domains.append({
            "domain": "VS",
            "name": "Vital Signs",
            "matches": vs_matches,
            "completeness_pct": round((len(vs_matches) / 5.0) * 100, 1)
        })

    return {
        "workspace_id": client_id,
        "cdisc_compliant": len(detected_domains) > 0,
        "detected_domains": detected_domains
    }

@router.get("/detect")
def detect_study_type_endpoint(client_id: str) -> Dict[str, Any]:
    """Manually re-runs the 3-Layer Study-Type Detection Engine on the workspace dataset."""
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Workspace context not found")
        
    df = context.load_active_dataset()
    if df is None:
        raise HTTPException(status_code=400, detail="Active dataset empty or not loaded")
        
    return StudyTypeDetector.detect(df)
