# -----------------------------------------------------------------------------
# Scientific Data Orchestrator (SDO) — Data Dictionary Generator
# Compiles column metadata and exports to Excel, PDF, and JSON formats.
# -----------------------------------------------------------------------------
"""
backend/core/data_dictionary_generator.py

Analyzes active dataset schemas, mapping binds, and quality indicators to
generate a comprehensive data dictionary. Exports to .xlsx, .pdf, and JSON.
Uses fpdf2 for PDF generation and xlsxwriter for high-quality styled Excel outputs.
"""

import io
import time
import logging
from dataclasses import dataclass, asdict
from typing import List, Dict, Any
import pandas as pd
import numpy as np

from backend.core.scientific_ontology import SCIENTIFIC_VARIABLES
from backend.core.dataset_passport import DatasetPassport

logger = logging.getLogger("sdo.core.data_dictionary")

@dataclass
class ColumnDictionaryEntry:
    """Represents a single column's metadata in the Data Dictionary."""
    column_name: str
    detected_type: str            # "Numeric", "Categorical", "Text", "Date"
    mapped_variable: str          # standard scientific role or "none"
    missing_pct: float
    unique_values: int
    sample_values: List[str]      # up to 5 examples
    scientific_meaning: str       # human-readable definition from ontology

class DataDictionaryGenerator:
    """
    Stateless data dictionary compiler and exporter.
    Generates metadata summaries for both MOLECULAR and SCIENTIFIC datasets.
    """

    @staticmethod
    def generate(df: pd.DataFrame, mappings: Dict[str, str]) -> List[ColumnDictionaryEntry]:
        """
        Scan a DataFrame and column mappings to generate metadata catalog.
        """
        if df is None:
            return []

        entries: List[ColumnDictionaryEntry] = []
        total_rows = len(df)

        for col in df.columns:
            non_null_series = df[col].dropna()
            cardinality = non_null_series.nunique()
            missing_count = total_rows - len(non_null_series)
            missing_pct = round((missing_count / total_rows) * 100.0, 2) if total_rows > 0 else 0.0

            # ── 1. Determine Column Type ─────────────────────────────────────
            col_dtype = df[col].dtype
            col_lower = str(col).lower()

            if np.issubdtype(col_dtype, np.number):
                detected_type = "Numeric"
            elif isinstance(col_dtype, pd.DatetimeTZDtype) or np.issubdtype(col_dtype, np.datetime64) or "date" in col_lower or "time" in col_lower:
                detected_type = "Date"
            elif cardinality <= 100:
                detected_type = "Categorical"
            else:
                detected_type = "Text"

            # ── 2. Get Scientific Role and Meaning ────────────────────────────
            role = mappings.get(col, "none")
            meaning = "General dataset variable (unmapped)."

            if role != "none" and role in SCIENTIFIC_VARIABLES:
                meta = SCIENTIFIC_VARIABLES[role]
                meaning = meta.get("label", role) + ": " + meta.get("aliases", [role])[0]
                # Try to get scientific meaning from label
                meaning = f"Standard {meta.get('label', role)} field used by SDO processing pipeline."
            else:
                # Type-based generic meaning
                if detected_type == "Numeric":
                    meaning = "Quantitative numeric measurement or ratio."
                elif detected_type == "Date":
                    meaning = "Temporal indicator, timestamp, or observation date."
                elif detected_type == "Categorical":
                    meaning = "Categorical grouping or discrete factor."
                else:
                    meaning = "General free-text identifier or comment."

            # ── 3. Gather Sample Values ───────────────────────────────────────
            sample_series = non_null_series.head(5).astype(str).tolist()
            sample_values = [str(val).strip() for val in sample_series if str(val).strip() != ""]

            entries.append(
                ColumnDictionaryEntry(
                    column_name=col,
                    detected_type=detected_type,
                    mapped_variable=role,
                    missing_pct=missing_pct,
                    unique_values=cardinality,
                    sample_values=sample_values,
                    scientific_meaning=meaning
                )
            )

        return entries

    @staticmethod
    def to_excel(entries: List[ColumnDictionaryEntry]) -> bytes:
        """
        Exports the data dictionary as a beautifully-formatted .xlsx file in memory.
        """
        output = io.BytesIO()
        
        # Prepare tabular data
        data = []
        for entry in entries:
            samples_str = ", ".join(entry.sample_values) if entry.sample_values else "N/A"
            data.append({
                "Column Name": entry.column_name,
                "Data Type": entry.detected_type,
                "Mapped Scientific Role": entry.mapped_variable,
                "Missing Data %": entry.missing_pct,
                "Unique Cardinality": entry.unique_values,
                "Sample Values": samples_str,
                "Scientific Interpretation": entry.scientific_meaning
            })

        df = pd.DataFrame(data)

        # Write styled Excel using xlsxwriter
        with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
            df.to_excel(writer, sheet_name="Data Dictionary", index=False)
            
            # Excel formatting
            workbook = writer.book
            worksheet = writer.sheets["Data Dictionary"]
            
            # Define header format
            header_format = workbook.add_format({
                "bold": True,
                "text_wrap": True,
                "valign": "top",
                "fg_color": "#1f2937",
                "font_color": "#ffffff",
                "border": 1
            })

            # Define standard cell formats
            cell_format = workbook.add_format({"valign": "top"})
            num_format = workbook.add_format({"valign": "top", "num_format": "0.00"})
            int_format = workbook.add_format({"valign": "top", "num_format": "#,##0"})

            # Set widths and apply formats
            for col_idx, col in enumerate(df.columns):
                # Write header explicitly with style
                worksheet.write(0, col_idx, col, header_format)
                
                # Auto-adjust column width based on content
                max_len = max(
                    df[col].astype(str).map(len).max(),
                    len(col)
                ) + 3
                max_len = min(max_len, 50)  # limit width to 50
                
                # Apply column format
                if col == "Missing Data %":
                    worksheet.set_column(col_idx, col_idx, max_len, num_format)
                elif col == "Unique Cardinality":
                    worksheet.set_column(col_idx, col_idx, max_len, int_format)
                else:
                    worksheet.set_column(col_idx, col_idx, max_len, cell_format)

            # Freeze panes at row 1
            worksheet.freeze_panes(1, 0)

        return output.getvalue()

    @staticmethod
    def to_pdf(entries: List[ColumnDictionaryEntry], passport: DatasetPassport) -> bytes:
        """
        Exports the data dictionary as a publication-ready PDF using fpdf2.
        """
        try:
            from fpdf import FPDF
        except ImportError:
            # Safe fallback if fpdf2 is not available at import time
            logger.error("fpdf2 is not installed! Cannot generate PDF. Returning empty bytes.")
            return b""

        class DataDictionaryPDF(FPDF):
            def header(self):
                # Top Navy/Teal Banner background
                self.set_fill_color(15, 23, 42) # Slate-900
                self.rect(0, 0, 210, 40, 'F')
                
                # Banner Title
                self.set_xy(15, 12)
                self.set_font("helvetica", "B", 16)
                self.set_text_color(255, 255, 255)
                self.cell(0, 8, "SCIENTIFIC DATA ORCHESTRATOR", ln=True)
                
                self.set_x(15)
                self.set_font("helvetica", "", 10)
                self.set_text_color(148, 163, 184) # Slate-400
                self.cell(0, 6, "Metadata Dictionary & Dataset Blueprint", ln=True)
                
                # Decorative colored bar
                self.set_fill_color(34, 211, 238) # Cyan-400
                self.rect(0, 39, 210, 1, 'F')
                
                self.ln(12)

            def footer(self):
                self.set_y(-15)
                self.set_font("helvetica", "I", 8)
                self.set_text_color(148, 163, 184)
                self.cell(0, 10, f"Page {self.page_no()}/{{nb}}  |  Generated automatically by SDO Platform", align="C")

        # Initialize PDF in Portrait mode, A4
        pdf = DataDictionaryPDF(orientation="P", unit="mm", format="A4")
        pdf.alias_nb_pages()
        pdf.add_page()
        pdf.set_margins(15, 15, 15)

        # ── 1. Render Dataset Passport Card ──────────────────────────────────
        pdf.set_fill_color(248, 250, 252) # Slate-50 (off-white)
        pdf.set_draw_color(226, 232, 240) # Slate-200
        pdf.rect(15, 45, 180, 48, 'DF')
        
        pdf.set_xy(20, 48)
        pdf.set_font("helvetica", "B", 11)
        pdf.set_text_color(15, 23, 42) # Slate-900
        pdf.cell(0, 6, "DATASET IDENTITY PASSPORT", ln=True)
        
        pdf.ln(1)
        pdf.set_x(20)
        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(71, 85, 105) # Slate-600
        
        mode = getattr(passport, "dataset_mode", "SCIENTIFIC")
        domain = getattr(passport, "detected_domain", "General Scientific")
        entity = getattr(passport, "primary_entity_type", "Compound")
        rows = getattr(passport, "row_count", 0)
        cols = getattr(passport, "column_count", 0)
        missing = getattr(passport, "missing_pct", 0.0)
        dups = getattr(passport, "duplicate_pct", 0.0)
        workflow = getattr(passport, "recommended_workflow", "Scientific Intelligence")
        
        pdf.cell(90, 5, f"• Workflow Mode: {mode} ({workflow})", ln=False)
        pdf.cell(90, 5, f"• Primary Entity: {entity}", ln=True)
        
        pdf.set_x(20)
        pdf.cell(90, 5, f"• Detected Domain: {domain}", ln=False)
        pdf.cell(90, 5, f"• Total Rows: {rows:,}", ln=True)
        
        pdf.set_x(20)
        pdf.cell(90, 5, f"• Columns Profiled: {cols}", ln=False)
        pdf.cell(90, 5, f"• Cell Missingness: {missing:.2f}%", ln=True)
        
        pdf.set_x(20)
        pdf.cell(90, 5, f"• Row Duplication: {dups:.2f}%", ln=False)
        pdf.cell(90, 5, f"• Profiled On: {time.strftime('%Y-%m-%d %H:%M:%S')}", ln=True)

        pdf.set_xy(15, 102)
        pdf.set_font("helvetica", "B", 12)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(0, 6, "COLUMN METADATA DIRECTORY", ln=True)
        pdf.ln(2)

        # ── 2. Render Columns Grid ───────────────────────────────────────────
        # Column widths for A4 (Margins are 15, width remains 180mm)
        col_w = [45, 25, 30, 20, 60] # Name, Type, Mapped, Missing, Meaning (Total: 180)
        
        # Headers
        pdf.set_fill_color(30, 41, 59) # Slate-800
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("helvetica", "B", 8.5)
        
        headers = ["Column Name", "Type", "Mapped Role", "Missing %", "Interpretation / Context"]
        for w, h in zip(col_w, headers):
            pdf.cell(w, 7, h, border=1, align="C", fill=True)
        pdf.ln()

        # Rows
        pdf.set_font("helvetica", "", 8)
        pdf.set_text_color(51, 65, 85) # Slate-700
        fill = False
        
        for entry in entries:
            # We calculate height based on the multi-line meaning column
            meaning_str = entry.scientific_meaning
            # Sample values injection into meaning if available
            if entry.sample_values:
                samples_str = ", ".join(entry.sample_values[:3])
                meaning_str += f" (Samples: {samples_str})"

            # Calculate height for cell
            # Width of meaning col is 60mm. Average char size in Helvetica 8 is ~1.5mm.
            # So roughly 35-40 characters per line. Let's wrap.
            nb_lines = pdf.get_string_width(meaning_str) / 58
            lines = max(int(np.ceil(nb_lines)), 1)
            row_h = 5 * lines
            row_h = max(row_h, 6) # minimum height 6mm

            # Check page break
            if pdf.get_y() + row_h > 275:
                pdf.add_page()
                # Redraw header
                pdf.set_fill_color(30, 41, 59)
                pdf.set_text_color(255, 255, 255)
                pdf.set_font("helvetica", "B", 8.5)
                for w, h in zip(col_w, headers):
                    pdf.cell(w, 7, h, border=1, align="C", fill=True)
                pdf.ln()
                pdf.set_font("helvetica", "", 8)
                pdf.set_text_color(51, 65, 85)

            # Draw row
            pdf.set_fill_color(248, 250, 252) if fill else pdf.set_fill_color(255, 255, 255)
            
            # Print column name (handling long names)
            x, y = pdf.get_x(), pdf.get_y()
            pdf.rect(x, y, col_w[0], row_h, 'F' if fill else '')
            pdf.multi_cell(col_w[0], 5, entry.column_name, border=1, align="L")
            
            pdf.set_xy(x + col_w[0], y)
            pdf.cell(col_w[1], row_h, entry.detected_type, border=1, align="C", fill=fill)
            pdf.cell(col_w[2], row_h, entry.mapped_variable, border=1, align="C", fill=fill)
            pdf.cell(col_w[3], row_h, f"{entry.missing_pct:.1f}%", border=1, align="C", fill=fill)
            
            # Print multi-line scientific meaning
            pdf.multi_cell(col_w[4], 5, meaning_str, border=1, align="L")
            
            # Reset cursor after multi_cell
            pdf.set_xy(15, y + row_h)
            fill = not fill

        return pdf.output()
