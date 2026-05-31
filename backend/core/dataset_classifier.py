# -----------------------------------------------------------------------------
# Scientific Data Orchestrator (SDO) — Dataset Classifier
# Detects dataset mode (MOLECULAR/SCIENTIFIC/HYBRID), scientific domain,
# and primary entity type from a DataFrame and column mappings.
# -----------------------------------------------------------------------------
"""
backend/core/dataset_classifier.py

Classifies any uploaded dataset as MOLECULAR, SCIENTIFIC, or HYBRID based on:
  - Presence and coverage of SMILES/InChI/molecular structure columns
  - Column name pattern recognition
  - Lightweight value scanning using RDKit (if available) or regex heuristics

Also detects the scientific domain (Ecotoxicology, Clinical, etc.) and
primary entity type (Compound, Patient, Site, …) from mapped/column metadata.
"""

import re
import logging
from dataclasses import dataclass, asdict
from typing import Literal, Optional, List, Dict, Any
import pandas as pd

logger = logging.getLogger("sdo.core.classifier")

# ---------------------------------------------------------------------------
# Domain catalogue
# ---------------------------------------------------------------------------

SCIENTIFIC_DOMAINS = [
    "Ecotoxicology", "Clinical Research", "Environmental Monitoring",
    "Healthcare Analytics", "Pharmacology", "Drug Discovery",
    "Toxicology", "Social Science Research", "Epidemiology",
    "Regulatory Science", "Public Health", "General Scientific"
]

DOMAIN_SIGNALS: Dict[str, List[str]] = {
    "Ecotoxicology": [
        "lc50", "ec50", "noec", "loec", "species", "aquatic", "fish",
        "daphnia", "algae", "ecotox", "log_kow", "bcf", "baf",
    ],
    "Clinical Research": [
        "patient", "subject", "trial", "arm", "dosage", "treatment",
        "cohort", "clinical", "adverse", "efficacy", "randomized",
    ],
    "Environmental Monitoring": [
        "site", "station", "sampling", "concentration", "pm2_5", "pm10",
        "pollution", "emission", "wastewater", "air_quality",
    ],
    "Healthcare Analytics": [
        "diagnosis", "icd", "hospital", "admission", "mortality", "icu",
        "readmission", "comorbidity", "procedure", "discharge",
    ],
    "Pharmacology": [
        "dose", "route", "bioavailability", "clearance", "half_life",
        "cmax", "auc", "pk", "pharmacokinetic", "bioequivalence",
    ],
    "Drug Discovery": [
        "target", "assay", "ic50", "pka", "logd", "binding", "hit",
        "lead", "scaffold", "fragment", "hts", "selectivity",
    ],
    "Toxicology": [
        "ld50", "noael", "loael", "dose_response", "bmd", "bmdl",
        "acute", "chronic", "subchronic", "genotoxic",
    ],
    "Social Science Research": [
        "respondent", "survey", "likert", "household", "income",
        "education", "perception", "attitude", "behavior",
    ],
    "Epidemiology": [
        "prevalence", "incidence", "odds_ratio", "hazard", "relative_risk",
        "case", "control", "cohort", "follow_up", "survival",
    ],
    "Regulatory Science": [
        "guideline", "oecd", "reach", "ghs", "classification",
        "registration", "dossier", "regulatory", "authorization",
    ],
    "Public Health": [
        "population", "intervention", "morbidity", "vaccination",
        "epidemic", "screening", "surveillance", "outbreak",
    ],
}

# Role → human-readable entity label
ENTITY_ROLE_MAP: Dict[str, str] = {
    "chemical_name":    "Compound",
    "cas_number":       "Compound",
    "canonical_smiles": "Compound",
    "smiles":           "Compound",
    "patient_id":       "Patient",
    "subject_id":       "Patient",
    "participant_id":   "Patient",
    "entity_id":        "Entity",
    "entity_name":      "Entity",
    "site_id":          "Site",
    "station_id":       "Site",
    "location":         "Site",
    "region":           "Site",
    "sample_id":        "Sample",
    "material_id":      "Material",
    "device_id":        "Device",
}

# ---------------------------------------------------------------------------
# DatasetClassification dataclass
# ---------------------------------------------------------------------------

@dataclass
class DatasetClassification:
    """Immutable result of a DatasetClassifier.classify() call."""

    dataset_mode: Literal["MOLECULAR", "SCIENTIFIC", "HYBRID"]
    """Primary mode inferred from structure coverage."""

    smiles_detected: bool
    """True if at least one parseable SMILES/structure value was found."""

    smiles_col: Optional[str]
    """Name of the column determined to carry structural data (or None)."""

    structure_rows: int
    """Number of rows with a valid (parseable) structure value."""

    missing_structure_rows: int
    """Number of rows where structure value is null or unparseable."""

    total_rows: int
    """Total rows in the DataFrame."""

    structure_coverage_pct: float
    """Percentage of rows that carry a valid structure (0–100)."""

    detection_method: str
    """How the structure column was identified: mapping | column_name | value_scan | none."""

    detected_domain: str
    """Highest-scoring scientific domain label."""

    domain_confidence: float
    """Confidence score for the detected domain (0–1)."""

    domain_signals: List[str]
    """Column/role tokens that matched the domain signals."""

    primary_entity_type: str
    """Human-readable entity label (Compound, Patient, Site, …)."""

    primary_entity_col: Optional[str]
    """Column name mapped to the primary entity role."""


# ---------------------------------------------------------------------------
# DatasetClassifier
# ---------------------------------------------------------------------------

# Lightweight SMILES heuristic regex (used when RDKit is unavailable)
_SMILES_HEURISTIC_RE = re.compile(r"^[A-Za-z0-9@+\-\[\]\(\)\\.=#$:\/]+$")


class DatasetClassifier:
    """
    Stateless classifier that determines the dataset modality and domain.

    Usage::

        classification = DatasetClassifier.classify(df, mappings)
    """

    # ── Column-role keys that indicate a molecular structure ─────────────────
    STRUCTURE_KEYS = frozenset({
        "canonical_smiles", "smiles", "isomeric_smiles",
        "inchi", "inchikey", "molblock", "selfies", "sdf", "structure",
    })

    # ── Regex patterns for structure-carrying column names ────────────────────
    STRUCTURE_COL_PATTERNS = [
        r"smiles", r"inchi", r"mol_?block", r"sdf",
        r"canonical", r"structure",
    ]
    _COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in STRUCTURE_COL_PATTERNS]

    # ── Minimum coverage thresholds ───────────────────────────────────────────
    _MOLECULAR_THRESHOLD = 50.0   # >= 50 % → MOLECULAR
    _HYBRID_MIN = 10.0            # >= 10 % → HYBRID (below = SCIENTIFIC)

    @classmethod
    def classify(cls, df: pd.DataFrame, mappings: Dict[str, str]) -> "DatasetClassification":
        """
        Classify a DataFrame as MOLECULAR, SCIENTIFIC, or HYBRID.

        Detection order:
          1. Check column→role mappings for structure keys.
          2. Check column names against STRUCTURE_COL_PATTERNS.
          3. Value-scan up to 1000 rows (RDKit or regex fallback).

        Parameters
        ----------
        df:
            The (possibly large) DataFrame to classify.
        mappings:
            Column → scientific-role mapping dict (from the UI mapping step).

        Returns
        -------
        DatasetClassification
        """
        total_rows = len(df)
        smiles_col: Optional[str] = None
        detection_method = "none"

        # ── Step 1: Mappings ──────────────────────────────────────────────────
        if mappings:
            for col, role in mappings.items():
                if role in cls.STRUCTURE_KEYS and col in df.columns:
                    smiles_col = col
                    detection_method = "mapping"
                    break

        # ── Step 2: Column name patterns ──────────────────────────────────────
        if smiles_col is None:
            for col in df.columns:
                for pattern in cls._COMPILED_PATTERNS:
                    if pattern.search(str(col)):
                        smiles_col = col
                        detection_method = "column_name"
                        break
                if smiles_col:
                    break

        # ── Step 3: Value scan ────────────────────────────────────────────────
        if smiles_col is None and total_rows > 0:
            smiles_col, detection_method = cls._value_scan(df)

        # ── Compute coverage ──────────────────────────────────────────────────
        structure_rows = 0
        missing_structure_rows = 0
        smiles_detected = False

        if smiles_col and smiles_col in df.columns and total_rows > 0:
            series = df[smiles_col].dropna().astype(str)
            non_null = len(series)
            missing_structure_rows = total_rows - non_null
            structure_rows = cls._count_valid_structures(series)
            smiles_detected = structure_rows > 0
            missing_structure_rows += (non_null - structure_rows)
        else:
            missing_structure_rows = total_rows

        coverage_pct = (structure_rows / total_rows * 100.0) if total_rows > 0 else 0.0

        # ── Determine mode ────────────────────────────────────────────────────
        if coverage_pct >= cls._MOLECULAR_THRESHOLD:
            dataset_mode: Literal["MOLECULAR", "SCIENTIFIC", "HYBRID"] = "MOLECULAR"
        elif coverage_pct >= cls._HYBRID_MIN:
            dataset_mode = "HYBRID"
        else:
            dataset_mode = "SCIENTIFIC"

        # ── Domain & entity detection ─────────────────────────────────────────
        detected_domain, domain_confidence, domain_signals = cls.detect_domain(
            list(df.columns), mappings
        )
        primary_entity_type, primary_entity_col = cls.detect_entity(mappings)

        logger.info(
            f"DatasetClassifier: mode={dataset_mode}, coverage={coverage_pct:.1f}%, "
            f"domain={detected_domain} ({domain_confidence:.2f}), "
            f"entity={primary_entity_type} (col={primary_entity_col}), "
            f"method={detection_method}"
        )

        return DatasetClassification(
            dataset_mode=dataset_mode,
            smiles_detected=smiles_detected,
            smiles_col=smiles_col,
            structure_rows=structure_rows,
            missing_structure_rows=missing_structure_rows,
            total_rows=total_rows,
            structure_coverage_pct=round(coverage_pct, 2),
            detection_method=detection_method,
            detected_domain=detected_domain,
            domain_confidence=round(domain_confidence, 4),
            domain_signals=domain_signals,
            primary_entity_type=primary_entity_type,
            primary_entity_col=primary_entity_col,
        )

    # ── Domain detection ──────────────────────────────────────────────────────

    @classmethod
    def detect_domain(
        cls,
        columns: List[str],
        mappings: Dict[str, str],
    ) -> tuple:  # (domain_name, confidence, matched_signals)
        """
        Score each scientific domain by matching normalised column names
        and mapped scientific roles against DOMAIN_SIGNALS.

        Parameters
        ----------
        columns:
            List of DataFrame column names.
        mappings:
            Column → scientific-role mapping dict.

        Returns
        -------
        tuple of (domain_name: str, confidence: float, matched_signals: List[str])
        """
        # Normalise tokens: lowercase, replace spaces/hyphens → underscore
        def _normalise(token: str) -> str:
            return re.sub(r"[\s\-]+", "_", token.lower().strip())

        col_tokens = {_normalise(c) for c in columns}
        # Also include role values from mappings
        role_tokens = {_normalise(v) for v in mappings.values() if v and v != "none"}
        all_tokens = col_tokens | role_tokens

        best_domain = "General Scientific"
        best_score = 0
        best_signals: List[str] = []

        total_possible = max(len(all_tokens), 1)

        for domain, signals in DOMAIN_SIGNALS.items():
            matched = [sig for sig in signals if any(sig in tok for tok in all_tokens)]
            score = len(matched)
            if score > best_score:
                best_score = score
                best_domain = domain
                best_signals = matched

        confidence = min(best_score / total_possible, 1.0) if best_score > 0 else 0.0
        return best_domain, confidence, best_signals

    # ── Entity detection ──────────────────────────────────────────────────────

    @classmethod
    def detect_entity(cls, mappings: Dict[str, str]) -> tuple:  # (entity_label, col_name)
        """
        Determine the primary entity type from the mappings dict.

        Priority order follows ENTITY_ROLE_MAP key order.

        Parameters
        ----------
        mappings:
            Column → scientific-role mapping dict.

        Returns
        -------
        tuple of (entity_type_label: str, entity_col_name: Optional[str])
        """
        if not mappings:
            return "Compound", None

        # Walk in priority order (compound-centric first, then generic entity)
        priority_roles = [
            "canonical_smiles", "smiles", "cas_number", "chemical_name",
            "entity_id", "entity_name",
            "patient_id", "subject_id", "participant_id",
            "site_id", "location", "region",
            "sample_id", "material_id", "device_id",
        ]
        for role in priority_roles:
            col = next((k for k, v in mappings.items() if v == role), None)
            if col:
                label = ENTITY_ROLE_MAP.get(role, "Entity")
                return label, col

        # Fallback: any mapped column
        for col, role in mappings.items():
            if role and role != "none":
                label = ENTITY_ROLE_MAP.get(role, "Entity")
                return label, col

        return "Compound", None

    # ── Private helpers ───────────────────────────────────────────────────────

    @classmethod
    def _value_scan(cls, df: pd.DataFrame) -> tuple:  # (smiles_col, method)
        """
        Scan object/string columns for SMILES-like values.

        Tries RDKit first; falls back to a lightweight regex heuristic.
        Scans up to 1 000 rows per candidate column.
        """
        MAX_SCAN_ROWS = 1000
        SMILES_THRESHOLD = 0.5   # at least 50 % of non-null values must validate

        rdkit_available = False
        try:
            from rdkit import Chem  # type: ignore
            rdkit_available = True
        except ImportError:
            pass

        candidate_cols = df.select_dtypes(include=["object", "string"]).columns.tolist()

        for col in candidate_cols:
            series = df[col].dropna().astype(str).head(MAX_SCAN_ROWS)
            if len(series) == 0:
                continue

            valid_count = 0
            for val in series:
                val = val.strip()
                if not val or len(val) < 2:
                    continue
                if rdkit_available:
                    try:
                        mol = Chem.MolFromSmiles(val)  # type: ignore
                        if mol is not None:
                            valid_count += 1
                    except Exception:
                        pass
                else:
                    if _SMILES_HEURISTIC_RE.match(val) and len(val) >= 4:
                        valid_count += 1

            frac = valid_count / len(series)
            if frac >= SMILES_THRESHOLD:
                logger.debug(
                    f"DatasetClassifier value_scan: col='{col}' "
                    f"has {frac:.0%} SMILES-like values → selected."
                )
                return col, "value_scan"

        return None, "none"

    @classmethod
    def _count_valid_structures(cls, series: pd.Series) -> int:
        """
        Count values in ``series`` that are parseable as SMILES.

        Uses RDKit when available; falls back to regex heuristic.
        ``series`` should already be non-null and cast to str.
        """
        rdkit_available = False
        try:
            from rdkit import Chem  # type: ignore
            rdkit_available = True
        except ImportError:
            pass

        count = 0
        for val in series:
            val = str(val).strip()
            if not val or val.lower() in {"nan", "none", ""}:
                continue
            if rdkit_available:
                try:
                    mol = Chem.MolFromSmiles(val)  # type: ignore
                    if mol is not None:
                        count += 1
                except Exception:
                    pass
            else:
                if _SMILES_HEURISTIC_RE.match(val) and len(val) >= 4:
                    count += 1
        return count
