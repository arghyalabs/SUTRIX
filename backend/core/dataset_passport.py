# -----------------------------------------------------------------------------
# Scientific Data Orchestrator (SDO) — Dataset Passport Generator
# Produces a compact, serialisable summary of a dataset's health and metadata.
# -----------------------------------------------------------------------------
"""
backend/core/dataset_passport.py

A *DatasetPassport* is a lightweight, JSON-serialisable object that captures:
  - Dataset modality (MOLECULAR / SCIENTIFIC / HYBRID)
  - Detected scientific domain and entity type
  - Row/column counts and data quality metrics (missing %, duplicate %)
  - Structure coverage (for molecular datasets)
  - Recommended workflow for the SUTRIX UI
  - Top mapped roles, key warnings

Generated once per mapping step and persisted in PipelineContext.
"""

import time
import logging
from dataclasses import dataclass, asdict, field
from typing import List, Optional, Dict
from collections import Counter
import pandas as pd

from backend.core.dataset_classifier import DatasetClassification

logger = logging.getLogger("sdo.core.passport")


# ---------------------------------------------------------------------------
# DatasetPassport dataclass
# ---------------------------------------------------------------------------

@dataclass
class DatasetPassport:
    """
    Compact, JSON-safe summary of an uploaded dataset.

    All fields are primitive Python types (str, int, float, bool, list)
    so the object can be serialised directly with dataclasses.asdict().
    """

    dataset_mode: str
    """'MOLECULAR' | 'SCIENTIFIC' | 'HYBRID'"""

    detected_domain: str
    """Highest-confidence scientific domain (e.g. 'Ecotoxicology')."""

    domain_confidence: float
    """Confidence of the domain detection (0–1)."""

    primary_entity_type: str
    """Human-readable primary entity label (e.g. 'Compound', 'Patient')."""

    row_count: int
    """Total rows in the dataset."""

    column_count: int
    """Total columns in the dataset."""

    missing_pct: float
    """Percentage of all cells that are null/NaN."""

    duplicate_pct: float
    """Percentage of rows that are exact duplicates of another row."""

    smiles_detected: bool
    """True if at least one parseable SMILES value was found."""

    structure_coverage_pct: float
    """Fraction of rows (%) that have a valid structure value."""

    recommended_workflow: str
    """'Molecular Intelligence' | 'Scientific Intelligence'"""

    top_mapped_roles: List[str]
    """Up to 5 most frequently assigned scientific roles (excluding 'none')."""

    key_warnings: List[str]
    """User-facing advisory messages about data quality."""

    timestamp: float = field(default_factory=time.time)
    """Unix timestamp of passport generation."""


# ---------------------------------------------------------------------------
# DatasetPassportGenerator
# ---------------------------------------------------------------------------

class DatasetPassportGenerator:
    """
    Stateless factory that creates a DatasetPassport from a DataFrame,
    the column→role mappings, and a DatasetClassification result.
    """

    @staticmethod
    def generate(
        df: pd.DataFrame,
        mappings: Dict[str, str],
        classification: DatasetClassification,
    ) -> DatasetPassport:
        """
        Compute all passport fields from the DataFrame and classification.

        Parameters
        ----------
        df:
            The source DataFrame (post-mapping, post-curation).
        mappings:
            Column → scientific-role mapping dict.
        classification:
            Result of DatasetClassifier.classify() for this DataFrame.

        Returns
        -------
        DatasetPassport
        """
        try:
            row_count = len(df)
            column_count = len(df.columns)

            # ── Missing percentage ────────────────────────────────────────────
            if row_count > 0 and column_count > 0:
                total_cells = row_count * column_count
                null_cells = int(df.isnull().sum().sum())
                missing_pct = round(null_cells / total_cells * 100.0, 2)
            else:
                missing_pct = 0.0

            # ── Duplicate percentage ──────────────────────────────────────────
            if row_count > 0:
                dup_count = int(df.duplicated().sum())
                duplicate_pct = round(dup_count / row_count * 100.0, 2)
            else:
                duplicate_pct = 0.0

            # ── Top mapped roles (exclude 'none', take top 5 by frequency) ───
            role_values = [v for v in mappings.values() if v and v.strip().lower() != "none"]
            role_counter = Counter(role_values)
            top_mapped_roles = [role for role, _ in role_counter.most_common(5)]

            # ── Key warnings ──────────────────────────────────────────────────
            key_warnings: List[str] = []

            if classification.dataset_mode == "HYBRID":
                key_warnings.append(
                    f"Dataset is HYBRID: only {classification.structure_coverage_pct:.1f}% of rows "
                    f"contain valid molecular structures. Non-molecular rows will be excluded "
                    f"from cheminformatics analyses."
                )

            if missing_pct > 20.0:
                key_warnings.append(
                    f"High missing data: {missing_pct:.1f}% of cells are null. "
                    "Consider imputation or column removal before modelling."
                )

            if duplicate_pct > 5.0:
                key_warnings.append(
                    f"High duplicate rate: {duplicate_pct:.1f}% of rows are exact duplicates. "
                    "Enable deduplication during segregation to avoid data leakage."
                )

            if classification.dataset_mode == "SCIENTIFIC" and not top_mapped_roles:
                key_warnings.append(
                    "No column mappings detected. Map columns to scientific roles "
                    "for full analytical capabilities."
                )

            # ── Recommended workflow ──────────────────────────────────────────
            if classification.dataset_mode in ("MOLECULAR", "HYBRID"):
                recommended_workflow = "Molecular Intelligence"
            else:
                recommended_workflow = "Scientific Intelligence"

            return DatasetPassport(
                dataset_mode=classification.dataset_mode,
                detected_domain=classification.detected_domain,
                domain_confidence=classification.domain_confidence,
                primary_entity_type=classification.primary_entity_type,
                row_count=row_count,
                column_count=column_count,
                missing_pct=missing_pct,
                duplicate_pct=duplicate_pct,
                smiles_detected=classification.smiles_detected,
                structure_coverage_pct=classification.structure_coverage_pct,
                recommended_workflow=recommended_workflow,
                top_mapped_roles=top_mapped_roles,
                key_warnings=key_warnings,
            )
        except Exception as exc:
            logger.error(f"DatasetPassportGenerator.generate() failed: {exc}", exc_info=True)
            # Return a minimal safe passport rather than crashing the pipeline
            return DatasetPassport(
                dataset_mode=classification.dataset_mode if classification else "MOLECULAR",
                detected_domain="General Scientific",
                domain_confidence=0.0,
                primary_entity_type="Compound",
                row_count=len(df) if df is not None else 0,
                column_count=len(df.columns) if df is not None else 0,
                missing_pct=0.0,
                duplicate_pct=0.0,
                smiles_detected=False,
                structure_coverage_pct=0.0,
                recommended_workflow="Molecular Intelligence",
                top_mapped_roles=[],
                key_warnings=[f"Passport generation failed: {exc}"],
            )

    @staticmethod
    def to_dict(passport: DatasetPassport) -> dict:
        """
        Convert a DatasetPassport to a plain Python dict (JSON-safe).

        Parameters
        ----------
        passport:
            The passport to serialise.

        Returns
        -------
        dict
        """
        return asdict(passport)
