"""
SUTRIX V6 — Unit Normalization Routes
/api/normalization/* endpoints for unit detection, conversion, log transformation,
endpoint standardization, species normalization, and quality checks.
"""
import logging
import os
import io
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from fpdf import FPDF
import xlsxwriter

from backend.core.workspace_registry import registry
from backend.normalization.unit_engine import UnitEngine

logger = logging.getLogger("sdo.api.normalization")
router = APIRouter(prefix="/api/normalization", tags=["normalization"])

# ─── Pydantic Models ────────────────────────────────────────────────────────

class ConversionSpec(BaseModel):
    col: str
    from_unit: str
    to_unit: str
    new_col_name: Optional[str] = None
    use_mw: bool = False
    mw_scalar: Optional[float] = None

class ConvertUnitsPayload(BaseModel):
    conversions: List[ConversionSpec]

class LogTransformPayload(BaseModel):
    col: str
    transform: str  # 'log10' | 'ln' | 'neg_log10'
    new_col_name: Optional[str] = None

class EndpointMappingPayload(BaseModel):
    col: str
    mapping: Dict[str, str]

class SpeciesMappingPayload(BaseModel):
    col: str
    mapping: Dict[str, str]

class NormalizeDatasetPayload(BaseModel):
    target_unit: str


# ─── Helper ─────────────────────────────────────────────────────────────────

def _load_df(client_id: str):
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail=f"Workspace '{client_id}' not found")

    df = None
    try:
        df = context.load_active_dataset()
    except Exception:
        pass

    if df is None:
        try:
            df = context.load_slice()
        except Exception:
            pass

    if df is None:
        raise HTTPException(status_code=404, detail="No dataset loaded in this workspace")

    return df, context


def _identify_columns(df: pd.DataFrame, mappings: dict) -> dict:
    """Helper to resolve dataset column names for key scientific concepts using explicit mappings and expanded synonym lists."""
    chem_col = mappings.get("chemical_name")
    cas_col = mappings.get("cas_number")
    smiles_col = mappings.get("canonical_smiles") or mappings.get("smiles")
    inchi_col = mappings.get("inchi")
    formula_col = mappings.get("molecular_formula")
    value_col = mappings.get("value") or mappings.get("response_value")
    unit_col = mappings.get("unit") or mappings.get("response_unit")
    endpoint_col = mappings.get("endpoint")

    chem_fallbacks = ['chemical_name', 'chemical', 'compound', 'name', 'substance', 'chem name', 'compound_name', 'compound name', 'chemicalname', 'compoundname']
    cas_fallbacks = ['cas_number', 'cas', 'casrn', 'cas_no', 'casnumber', 'cas_num']
    smiles_fallbacks = ['smiles', 'canonical_smiles', 'isomeric_smiles', 'smile', 'canonical_smile', 'smiles string', 'smiles_string']
    inchi_fallbacks = ['inchi', 'inchikey', 'inchi_key', 'inchi key']
    formula_fallbacks = ['formula', 'molecular_formula', 'molecular formula', 'molecularformula', 'molformula', 'chemical_formula', 'chemical formula']
    value_fallbacks = ['value', 'response_value', 'lc50_96h', 'conc', 'doseval', 'concentration', 'val', 'original_val', 'original val']
    unit_fallbacks = ['unit', 'response_unit', 'units', 'original_unit', 'original unit']
    endpoint_fallbacks = ['endpoint', 'endpoints', 'effect']

    for col in df.columns:
        col_lower = col.lower().strip()
        if not chem_col and col_lower in chem_fallbacks:
            chem_col = col
        if not cas_col and col_lower in cas_fallbacks:
            cas_col = col
        if not smiles_col and col_lower in smiles_fallbacks:
            smiles_col = col
        if not inchi_col and col_lower in inchi_fallbacks:
            inchi_col = col
        if not formula_col and col_lower in formula_fallbacks:
            formula_col = col
        if not value_col and col_lower in value_fallbacks:
            value_col = col
        if not unit_col and col_lower in unit_fallbacks:
            unit_col = col
        if not endpoint_col and col_lower in endpoint_fallbacks:
            endpoint_col = col

    return {
        "chemical_name": chem_col,
        "cas_number": cas_col,
        "smiles": smiles_col,
        "inchi": inchi_col,
        "molecular_formula": formula_col,
        "value": value_col,
        "unit": unit_col,
        "endpoint": endpoint_col
    }


def _safe_json(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, float) and (np.isnan(val) or np.isinf(val)):
        return None
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, (np.ndarray,)):
        return val.tolist()
    if isinstance(val, (np.bool_,)):
        return bool(val)
    return val


# ─── Report Generators ───────────────────────────────────────────────────────

class NormalizationPDF(FPDF):
    def header(self):
        # Draw a dark blue top banner
        self.set_fill_color(0, 33, 71)  # navy
        self.rect(0, 0, 210, 12, 'F')
        self.set_y(1)
        self.set_text_color(255, 255, 255)
        self.set_font('Arial', 'B', 10)
        self.cell(0, 10, "SUTRIX OECD-COMPLIANT DATA NORMALIZATION REPORT", 0, 0, 'C')
        self.set_text_color(0, 0, 0)
        self.set_y(15)
        
    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f"Page {self.page_no()} | Generated by SUTRIX V6 Harmonization Engine", 0, 0, 'C')


def build_pdf_report(summary: dict, provenance: list) -> bytes:
    pdf = NormalizationPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font('Arial', 'B', 16)
    pdf.cell(0, 10, "OECD Regulatory Audit Report", 0, 1, 'L')
    pdf.set_font('Arial', '', 10)
    pdf.cell(0, 6, f"Timestamp: {summary['timestamp']}", 0, 1, 'L')
    pdf.cell(0, 6, "Software Version: SUTRIX V6 (Intelligent Compound-Aware Harmonization)", 0, 1, 'L')
    pdf.ln(5)
    
    # Section 1: Summary Statistics
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 8, "1. Normalization Summary Metrics", 0, 1, 'L')
    pdf.set_font('Arial', '', 9)
    
    metrics = [
        ["Total Rows Processed", str(summary["rows_processed"])],
        ["Rows Successfully Converted", str(summary["rows_normalized"])],
        ["Rows Skipped (Missing MW / Forbidden)", str(summary["rows_skipped"])],
        ["Target Standardized Unit", str(summary["target_unit"])],
    ]
    
    col_w = [80, 100]
    # Draw metrics table
    pdf.set_font('Arial', 'B', 9)
    pdf.set_fill_color(240, 240, 240)
    pdf.cell(col_w[0], 7, "Metric", 1, 0, 'L', True)
    pdf.cell(col_w[1], 7, "Value", 1, 1, 'L', True)
    pdf.set_font('Arial', '', 9)
    for row in metrics:
        pdf.cell(col_w[0], 7, row[0], 1, 0, 'L')
        pdf.cell(col_w[1], 7, row[1], 1, 1, 'L')
    pdf.ln(8)
    
    # Section 2: Audit Logs Preview (First 15 Rows)
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 8, "2. Master Audit Trail (First 15 Rows preview)", 0, 1, 'L')
    pdf.set_font('Arial', 'B', 8)
    
    trail_headers = ["Row", "Compound", "Orig Unit", "MW", "MW Source", "Target", "Value", "Status"]
    trail_widths = [12, 45, 20, 20, 30, 20, 23, 20]
    
    pdf.set_fill_color(0, 33, 71)
    pdf.set_text_color(255, 255, 255)
    for i, h in enumerate(trail_headers):
        pdf.cell(trail_widths[i], 7, h, 1, 0, 'C', True)
    pdf.ln()
    
    pdf.set_font('Arial', '', 7)
    pdf.set_text_color(0, 0, 0)
    for entry in provenance[:15]:
        mw_str = f"{entry['mw']:.2f}" if entry['mw'] is not None else "N/A"
        val_str = f"{entry['converted_value']:.4f}" if entry['converted_value'] is not None else "N/A"
        status = "Normalized" if entry['converted_value'] is not None else "Skipped"
        
        pdf.cell(trail_widths[0], 6, str(entry['row']), 1, 0, 'C')
        pdf.cell(trail_widths[1], 6, str(entry['compound'])[:22], 1, 0, 'L')
        pdf.cell(trail_widths[2], 6, str(entry['original_unit']), 1, 0, 'C')
        pdf.cell(trail_widths[3], 6, mw_str, 1, 0, 'C')
        pdf.cell(trail_widths[4], 6, str(entry['mw_source']), 1, 0, 'C')
        pdf.cell(trail_widths[5], 6, str(entry['target_unit']), 1, 0, 'C')
        pdf.cell(trail_widths[6], 6, val_str, 1, 0, 'R')
        pdf.cell(trail_widths[7], 6, status, 1, 1, 'C')
        
    pdf.ln(5)
    pdf.set_font('Arial', 'I', 8)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(0, 4, "*Note: This report conforms to the OECD principles for good laboratory practice (GLP) and QSAR model development. Full dataset conversion details are exported in the Excel spreadsheet and JSON schema.")
    
    return bytes(pdf.output())


def build_xlsx_report(summary: dict, provenance: list) -> bytes:
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
    # Summary Sheet
    ws_sum = workbook.add_worksheet("Summary Metrics")
    header_fmt = workbook.add_format({'bold': True, 'bg_color': '#002147', 'font_color': 'white', 'border': 1})
    border_fmt = workbook.add_format({'border': 1})
    title_fmt = workbook.add_format({'bold': True, 'size': 14})
    
    ws_sum.write(0, 0, "SUTRIX OECD Normalization Summary Report", title_fmt)
    ws_sum.write(2, 0, "Metric", header_fmt)
    ws_sum.write(2, 1, "Value", header_fmt)
    
    metrics = [
        ("Timestamp", summary["timestamp"]),
        ("Software Version", "SUTRIX V6 (OECD-Compliant)"),
        ("Dataset Rows Processed", summary["rows_processed"]),
        ("Rows Successfully Normalized", summary["rows_normalized"]),
        ("Rows Skipped (Failed MW / Forbidden)", summary["rows_skipped"]),
        ("Target Unit", summary["target_unit"])
    ]
    for row_idx, (m, v) in enumerate(metrics, start=3):
        ws_sum.write(row_idx, 0, m, border_fmt)
        ws_sum.write(row_idx, 1, v, border_fmt)
    ws_sum.set_column('A:A', 35)
    ws_sum.set_column('B:B', 30)
    
    # Audit Trail Sheet
    ws_trail = workbook.add_worksheet("Master Audit Trail")
    headers = [
        "Row Index", "Compound", "Original Value", "Original Unit", 
        "Calculated MW", "MW Source", "MW Confidence", 
        "Target Unit", "Converted Value", "Conversion Formula", "Status"
    ]
    for col_idx, h in enumerate(headers):
        ws_trail.write(0, col_idx, h, header_fmt)
        
    for row_idx, entry in enumerate(provenance, start=1):
        status = "Normalized" if entry["converted_value"] is not None else "Skipped"
        ws_trail.write(row_idx, 0, entry["row"], border_fmt)
        ws_trail.write(row_idx, 1, entry["compound"], border_fmt)
        ws_trail.write(row_idx, 2, entry["original_value"], border_fmt)
        ws_trail.write(row_idx, 3, entry["original_unit"], border_fmt)
        ws_trail.write(row_idx, 4, entry["mw"], border_fmt)
        ws_trail.write(row_idx, 5, entry["mw_source"], border_fmt)
        ws_trail.write(row_idx, 6, entry["mw_confidence"], border_fmt)
        ws_trail.write(row_idx, 7, entry["target_unit"], border_fmt)
        ws_trail.write(row_idx, 8, entry["converted_value"], border_fmt)
        ws_trail.write(row_idx, 9, entry["conversion_formula"], border_fmt)
        ws_trail.write(row_idx, 10, status, border_fmt)
        
    ws_trail.set_column('A:K', 16)
    workbook.close()
    return output.getvalue()


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/{client_id}/upload")
async def upload_dataset_test(client_id: str, file: UploadFile = File(...)):
    """Synchronous upload specifically for V6 testing flow."""
    import io
    content = await file.read()
    fname = file.filename or "dataset.csv"
    fname_lower = fname.lower()
    try:
        if fname_lower.endswith(".parquet"):
            df = pd.read_parquet(io.BytesIO(content))
        elif fname_lower.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        elif fname_lower.endswith(".zip"):
            import zipfile
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                data_file = None
                for zname in z.namelist():
                    if zname.lower().endswith((".csv", ".tsv", ".xlsx", ".xls", ".parquet")):
                        data_file = zname
                        break
                if not data_file:
                    raise ValueError("No CSV, Excel, or Parquet file found inside the ZIP archive.")
                with z.open(data_file) as f_inner:
                    inner_content = f_inner.read()
                    inner_name = data_file.lower()
                    if inner_name.endswith(".parquet"):
                        df = pd.read_parquet(io.BytesIO(inner_content))
                    elif inner_name.endswith((".xlsx", ".xls")):
                        df = pd.read_excel(io.BytesIO(inner_content))
                    else:
                        df = pd.read_csv(io.BytesIO(inner_content))
        else:
            df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Cannot parse file: {e}")
    context = registry.get_context(client_id)
    import os
    base_dir = os.path.join(getattr(context, "workspace_dir", f"workspaces/{client_id}"), "uploads")
    os.makedirs(base_dir, exist_ok=True)
    parquet_path = os.path.join(base_dir, "dataset.parquet")
    df.to_parquet(parquet_path, index=False)
    context.parquet_path = parquet_path
    context.dataframe_cache = df
    context.reset_subgroup_state()
    context.add_trace("ingest")
    context.touch(save_to_disk=True)
    return {"status": "ok", "filename": fname, "rows": len(df), "cols": len(df.columns)}


@router.get("/{client_id}/scan")
async def scan_dataset(client_id: str):
    """
    Scans the active dataset row-by-row to detect units, resolve structures,
    calculate molecular weights, and evaluate conversion feasibility.
    """
    try:
        df, context = _load_df(client_id)
        
        # 1. Identify columns
        mappings = context.mappings or {}
        cols = _identify_columns(df, mappings)
        chem_col = cols["chemical_name"]
        cas_col = cols["cas_number"]
        smiles_col = cols["smiles"]
        inchi_col = cols["inchi"]
        formula_col = cols["molecular_formula"]
        value_col = cols["value"]
        unit_col = cols["unit"]
        endpoint_col = cols["endpoint"]

        # Initialize counters for breakdown stats
        unit_counts = {}
        mw_source_counts = {"SMILES": 0, "InChI": 0, "Formula": 0, "CAS Cache": 0, "Name Cache": 0, "Common Name Dictionary": 0, "Missing": 0}
        confidence_counts = {"High": 0, "Medium": 0, "Low": 0, "Failed": 0}
        unresolved_set = set()
        
        preview_rows = []
        
        # Scan row-by-row
        for idx, row in df.iterrows():
            # A. Detect unit
            orig_unit = UnitEngine.detect_row_unit(row, value_col, unit_col, endpoint_col)
            unit_counts[orig_unit] = unit_counts.get(orig_unit, 0) + 1
            
            # B. Resolve compound & MW
            res = UnitEngine.resolve_row_compound_and_mw(row, chem_col, cas_col, smiles_col, inchi_col, formula_col)
            mw = res["mw"]
            mw_source = res["mw_source"]
            confidence = res["confidence"]
            comp_name = res["compound_name"]
            
            mw_source_counts[mw_source] = mw_source_counts.get(mw_source, 0) + 1
            confidence_counts[confidence] = confidence_counts.get(confidence, 0) + 1
            
            # C. Feasibility & Warnings
            from_cat = UnitEngine.get_unit_category(orig_unit)
            has_mw = mw is not None and mw > 0
            
            # Check endpoint safety rules if endpoint column exists
            ep_val = row[endpoint_col] if endpoint_col and endpoint_col in row.index else ""
            warnings = []
            is_forbidden = False
            if ep_val:
                is_allowed, cat, msg = UnitEngine.validate_endpoint_conversion(str(ep_val), orig_unit, "µmol/L")
                if not is_allowed:
                    warnings.append(msg)
                    is_forbidden = True
            
            feasibility = False
            suggested_conversions = []
            if orig_unit != "Unknown" and not is_forbidden:
                if from_cat == 'mass':
                    suggested_conversions.extend(['mg/L', 'µg/L'])
                    if has_mw:
                        suggested_conversions.extend(['µmol/L', 'mmol/L', 'pLC50', 'pEC50'])
                        feasibility = True
                elif from_cat == 'molar':
                    suggested_conversions.extend(['µmol/L', 'mmol/L', 'pLC50', 'pEC50'])
                    feasibility = True
                    if has_mw:
                        suggested_conversions.extend(['mg/L', 'µg/L'])
                elif from_cat == 'log_molar':
                    suggested_conversions.extend(['µmol/L', 'mmol/L', 'pLC50', 'pEC50'])
                    feasibility = True
                    if has_mw:
                        suggested_conversions.extend(['mg/L', 'µg/L'])
                elif from_cat == 'solid':
                    suggested_conversions.extend(['mg/kg', 'µg/kg', '%', 'mg/L'])
                    feasibility = True
            else:
                if is_forbidden:
                    warnings.append("Conversion blocked due to endpoint restriction.")
                else:
                    warnings.append("Conversion between mass and molar units cannot be performed because compound identity is unavailable.")
            
            if mw_source == "Missing":
                unresolved_set.add(comp_name)
            
            # Pack preview data
            orig_val = row[value_col] if value_col and value_col in row.index else None
            try:
                orig_val = float(orig_val) if orig_val is not None else None
            except ValueError:
                orig_val = None
                
            preview_rows.append({
                "row_idx": int(idx),
                "compound": comp_name,
                "original_unit": orig_unit,
                "target_feasibility": feasibility,
                "mw": mw,
                "mw_source": mw_source,
                "confidence": confidence,
                "original_value": _safe_json(orig_val),
                "suggested_conversions": list(set(suggested_conversions)),
                "endpoint": str(ep_val) if ep_val else "",
                "warnings": warnings
            })

        # Calculate percentages for MW recovery
        total_rows = len(df)
        mw_recovery_pcts = {}
        for source, count in mw_source_counts.items():
            mw_recovery_pcts[source] = round((count / total_rows) * 100, 1) if total_rows > 0 else 0.0

        # Suggestions for unresolved compounds
        unresolved_suggestions = []
        for cmp in sorted(list(unresolved_set))[:20]:
            unresolved_suggestions.append({
                "compound": cmp,
                "suggestions": [
                    "Upload structure file with SMILES or InChI mapped",
                    "Add CAS Registry number (e.g. 50-78-2) column",
                    "Add molecular formula (e.g. C8H10N4O2) column",
                    "Search synonym dictionary"
                ]
            })

        return {
            "total_rows": total_rows,
            "detected_units": unit_counts,
            "mw_recovery_stats": mw_recovery_pcts,
            "confidence_distribution": confidence_counts,
            "preview": preview_rows[:50],
            "unresolved_compounds": unresolved_suggestions
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Row-wise scanning failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/normalize")
async def normalize_dataset(client_id: str, payload: NormalizeDatasetPayload):
    """
    Applies row-wise normalization conversion to the user-selected target unit,
    updates the active dataset with converted columns, and saves audit PDF/XLSX/JSON reports.
    """
    try:
        df, context = _load_df(client_id)
        target = payload.target_unit
        
        # 1. Identify columns
        mappings = context.mappings or {}
        cols = _identify_columns(df, mappings)
        chem_col = cols["chemical_name"]
        cas_col = cols["cas_number"]
        smiles_col = cols["smiles"]
        inchi_col = cols["inchi"]
        formula_col = cols["molecular_formula"]
        value_col = cols["value"]
        unit_col = cols["unit"]
        endpoint_col = cols["endpoint"]

        # Lists to store output values
        standardized_values = []
        standardized_units = []
        formulas = []
        resolved_mws = []
        mw_confidences = []
        provenance_log = []
        
        rows_normalized = 0
        rows_skipped = 0
        
        # Row-by-row conversion
        for idx, row in df.iterrows():
            orig_unit = UnitEngine.detect_row_unit(row, value_col, unit_col, endpoint_col)
            res = UnitEngine.resolve_row_compound_and_mw(row, chem_col, cas_col, smiles_col, inchi_col, formula_col)
            
            mw = res["mw"]
            mw_source = res["mw_source"]
            confidence = res["confidence"]
            comp_name = res["compound_name"]
            
            orig_val = row[value_col] if value_col and value_col in row.index else None
            try:
                orig_val = float(orig_val) if orig_val is not None else None
            except (ValueError, TypeError):
                orig_val = None
                
            converted_val = None
            formula_str = "N/A"
            
            # Check safety validation
            ep_val = row[endpoint_col] if endpoint_col and endpoint_col in row.index else ""
            is_allowed = True
            if ep_val:
                is_allowed, _, _ = UnitEngine.validate_endpoint_conversion(str(ep_val), orig_unit, target)
                
            if orig_val is not None and orig_unit != "Unknown" and is_allowed:
                try:
                    converted_val, formula_str = UnitEngine.convert_value(orig_val, orig_unit, target, mw)
                    rows_normalized += 1
                except Exception as e:
                    formula_str = f"Error: {str(e)}"
                    rows_skipped += 1
            else:
                rows_skipped += 1
                if not is_allowed:
                    formula_str = "Skipped: endpoint restriction"
                elif orig_unit == "Unknown":
                    formula_str = "Skipped: unknown original unit"
                else:
                    formula_str = "Skipped: missing compound MW"
                    
            standardized_values.append(converted_val)
            standardized_units.append(target)
            formulas.append(formula_str)
            resolved_mws.append(mw)
            mw_confidences.append(confidence)
            
            provenance_log.append({
                "row": int(idx),
                "compound": comp_name,
                "original_value": _safe_json(orig_val),
                "original_unit": orig_unit,
                "target_unit": target,
                "mw": _safe_json(mw),
                "mw_source": mw_source,
                "mw_confidence": confidence,
                "converted_value": _safe_json(converted_val),
                "conversion_formula": formula_str
            })

        # Insert new columns in dataframe
        df["standardized_value"] = standardized_values
        df["standardized_unit"] = standardized_units
        df["normalization_formula"] = formulas
        df["resolved_mw"] = resolved_mws
        df["mw_confidence"] = mw_confidences
        
        # Save to disk
        save_path = context.recovered_subgroup_path or context.active_subgroup_path or context.parquet_path
        if not save_path:
            save_path = os.path.join(context.workspace_dir, "uploads", "dataset.parquet")
        
        df.to_parquet(save_path, index=False)
        context.dataframe_cache = df
        context.touch(save_to_disk=True)

        # Generate Reports
        timestamp = datetime.utcnow().isoformat()
        summary = {
            "timestamp": timestamp,
            "rows_processed": len(df),
            "rows_normalized": rows_normalized,
            "rows_skipped": rows_skipped,
            "target_unit": target
        }
        
        exports_dir = os.path.join(context.workspace_dir, "exports")
        os.makedirs(exports_dir, exist_ok=True)
        
        # A. JSON Report
        json_path = os.path.join(exports_dir, "normalization_audit.json")
        with open(json_path, "w") as f:
            json.dump({"summary": summary, "audit_trail": provenance_log}, f, indent=2)
            
        # B. PDF Report
        pdf_path = os.path.join(exports_dir, "normalization_report.pdf")
        pdf_bytes = build_pdf_report(summary, provenance_log)
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)
            
        # C. XLSX Report
        xlsx_path = os.path.join(exports_dir, "normalization_report.xlsx")
        xlsx_bytes = build_xlsx_report(summary, provenance_log)
        with open(xlsx_path, "wb") as f:
            f.write(xlsx_bytes)

        return {
            "status": "ok",
            "summary": summary,
            "pdf_report": f"/api/normalization/{client_id}/download-report?format=pdf",
            "xlsx_report": f"/api/normalization/{client_id}/download-report?format=xlsx",
            "json_report": f"/api/normalization/{client_id}/download-report?format=json"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Dataset normalization failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/download-report")
async def download_report(client_id: str, format: str = Query(..., pattern="^(pdf|xlsx|json)$")):
    """Serves the generated Normalization & Audit reports from workspace exports."""
    context = registry.get_context(client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Workspace not found")
        
    filename_map = {
        "pdf": "normalization_report.pdf",
        "xlsx": "normalization_report.xlsx",
        "json": "normalization_audit.json"
    }
    
    file_path = os.path.join(context.workspace_dir, "exports", filename_map[format])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"The requested report '{format}' has not been generated yet. Run normalization first.")
        
    return FileResponse(
        path=file_path,
        filename=filename_map[format],
        media_type="application/octet-stream"
    )


# ─── Legacy Backward Compatibility Endpoints ────────────────────────────────

@router.get("/{client_id}/detect-units")
async def detect_units(client_id: str):
    """Legacy endpoint for backward compatibility."""
    try:
        df, _ = _load_df(client_id)
        results = UnitEngine.detect_units(df)
        for r in results:
            r["sample_values"] = [_safe_json(v) for v in r.get("sample_values", [])]
        return {"detections": results, "column_count": len(results)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/convert-units")
async def convert_units(client_id: str, payload: ConvertUnitsPayload):
    """Legacy endpoint for backward compatibility."""
    try:
        df, _ = _load_df(client_id)
        results = []
        for spec in payload.conversions:
            if spec.col not in df.columns:
                results.append({"col": spec.col, "status": "error", "message": f"Column '{spec.col}' not found"})
                continue
            series = pd.to_numeric(df[spec.col], errors="coerce")
            try:
                converted, warnings = UnitEngine.convert_column(
                    series=series,
                    from_unit=spec.from_unit,
                    to_unit=spec.to_unit,
                    mw_scalar=spec.mw_scalar,
                )
                preview = [_safe_json(v) for v in converted.dropna().head(5).tolist()]
                safe_to = spec.to_unit.replace("/", "_").replace("µ", "u").replace("°", "deg")
                results.append({
                    "col": spec.col,
                    "status": "ok",
                    "from_unit": spec.from_unit,
                    "to_unit": spec.to_unit,
                    "preview": preview,
                    "warnings": warnings,
                    "new_col_name": spec.new_col_name or f"{spec.col}_{safe_to}",
                })
            except ValueError as e:
                results.append({"col": spec.col, "status": "error", "message": str(e)})
        return {"results": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/log-transform")
async def log_transform(client_id: str, payload: LogTransformPayload):
    try:
        df, _ = _load_df(client_id)
        if payload.col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{payload.col}' not found")
        series = pd.to_numeric(df[payload.col], errors="coerce")
        transformed, warnings = UnitEngine.log_transform(series, payload.transform)
        prefix_map = {"log10": "log10_", "ln": "ln_", "neg_log10": "p"}
        prefix = prefix_map.get(payload.transform, "transformed_")
        new_col = payload.new_col_name or f"{prefix}{payload.col}"
        preview_before = [_safe_json(v) for v in series.dropna().head(5).tolist()]
        preview_after  = [_safe_json(v) for v in transformed.dropna().head(5).tolist()]
        return {
            "original_col": payload.col,
            "new_col_name": new_col,
            "transform": payload.transform,
            "preview_before": preview_before,
            "preview_after": preview_after,
            "warnings": warnings,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/detect-endpoints")
async def detect_endpoints(client_id: str, col: str):
    try:
        df, _ = _load_df(client_id)
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{col}' not found")
        variants = UnitEngine.detect_endpoint_variants(df[col])
        return {"col": col, "variants": variants}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/standardize-endpoints")
async def standardize_endpoints(client_id: str, payload: EndpointMappingPayload):
    try:
        df, _ = _load_df(client_id)
        if payload.col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{payload.col}' not found")
        standardized = UnitEngine.apply_endpoint_mapping(df[payload.col], payload.mapping)
        return {
            "col": payload.col,
            "sample": standardized.head(5).tolist(),
            "unique_canonical": standardized.unique().tolist(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/detect-species")
async def detect_species(client_id: str, col: str):
    try:
        df, _ = _load_df(client_id)
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{col}' not found")
        variants = UnitEngine.detect_species_variants(df[col])
        return {"col": col, "variants": variants}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/standardize-species")
async def standardize_species(client_id: str, payload: SpeciesMappingPayload):
    try:
        df, _ = _load_df(client_id)
        if payload.col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{payload.col}' not found")
        standardized = UnitEngine.apply_species_mapping(df[payload.col], payload.mapping)
        return {
            "col": payload.col,
            "sample": standardized.head(5).tolist(),
            "unique_canonical": standardized.unique().tolist(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/quality-checks")
async def quality_checks(client_id: str):
    try:
        df, _ = _load_df(client_id)
        issues = UnitEngine.run_quality_checks(df)
        for issue in issues:
            issue["affected_rows"] = [int(r) for r in issue.get("affected_rows", [])[:10]]
        return {"issues": issues, "total": len(issues)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/quality-score")
async def quality_score(client_id: str):
    try:
        df, _ = _load_df(client_id)
        issues = UnitEngine.run_quality_checks(df)
        score = UnitEngine.compute_quality_score(df, issues)
        return score
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/apply-and-save")
async def apply_and_save(client_id: str):
    try:
        df, context = _load_df(client_id)
        base_dir = (
            os.path.dirname(context.parquet_path)
            if getattr(context, "parquet_path", None)
            else os.path.join(os.getcwd(), "uploads", "normalized")
        )
        os.makedirs(base_dir, exist_ok=True)
        save_path = os.path.join(base_dir, f"dataset_normalized_{client_id[:8]}.parquet")
        df.to_parquet(save_path, index=False)
        return {"status": "saved", "path": save_path, "rows": len(df)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
