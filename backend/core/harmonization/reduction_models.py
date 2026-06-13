"""
backend/core/harmonization/reduction_models.py

Pydantic data models for harmonization settings and audit records.
All settings default to KEEP_ALL to ensure no silent data removal.
"""
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel


# ──────────────────────────────────────────────────────────────
# Strategy Enums
# ──────────────────────────────────────────────────────────────

class VarianceConflictStrategy(str, Enum):
    """
    Determines how rows flagged as High_Variance_Conflict are handled.
    Default: KEEP_ALL — no silent pruning.
    """
    KEEP_ALL = "KEEP_ALL"
    KEEP_MEDIAN = "KEEP_MEDIAN"
    KEEP_FIRST = "KEEP_FIRST"
    KEEP_MOST_RECENT = "KEEP_MOST_RECENT"
    REMOVE_CONFLICTS = "REMOVE_CONFLICTS"


class DuplicateSegregationStrategy(str, Enum):
    """
    Determines how exact or structural duplicates are handled.
    Default: KEEP_ALL — no silent pruning.
    """
    KEEP_ALL = "KEEP_ALL"
    REMOVE_EXACT_DUPLICATES = "REMOVE_EXACT_DUPLICATES"
    REMOVE_STRUCTURE_DUPLICATES = "REMOVE_STRUCTURE_DUPLICATES"
    MERGE_DUPLICATES = "MERGE_DUPLICATES"


# ──────────────────────────────────────────────────────────────
# Settings Model (User-Controlled)
# ──────────────────────────────────────────────────────────────

class HarmonizationSettings(BaseModel):
    """
    Scientist-controlled harmonization preferences.
    Persisted in PipelineContext and JSON session files.
    """
    variance_conflict_strategy: VarianceConflictStrategy = VarianceConflictStrategy.KEEP_ALL
    duplicate_segregation_strategy: DuplicateSegregationStrategy = DuplicateSegregationStrategy.KEEP_ALL
    # Whether the user has explicitly reviewed & confirmed settings
    settings_confirmed: bool = False
    # Applied timestamp (ISO 8601) when user last clicked "Apply"
    applied_at: Optional[str] = None

    class Config:
        use_enum_values = True


# ──────────────────────────────────────────────────────────────
# Audit Records (Scientific Transparency)
# ──────────────────────────────────────────────────────────────

class VariancePruningAudit(BaseModel):
    """
    Records the exact outcome of variance conflict filtration.
    """
    strategy_applied: str = VarianceConflictStrategy.KEEP_ALL
    raw_count: int = 0                    # Rows before variance analysis
    flagged_groups: int = 0               # Number of compound/endpoint groups flagged
    flagged_rows: int = 0                 # Total rows in flagged groups
    removed_rows: int = 0                 # Rows actually removed (0 if KEEP_ALL)
    retained_rows: int = 0               # Rows remaining after this step
    consistency_score: float = 100.0     # % of groups that passed (< 1.0 log10 range)
    conflict_compounds: List[Dict[str, Any]] = []  # Up to 50 conflict details


class DuplicateSegregationAudit(BaseModel):
    """
    Records the exact outcome of duplicate segregation.
    """
    strategy_applied: str = DuplicateSegregationStrategy.KEEP_ALL
    raw_count: int = 0                   # Rows before dedup analysis
    duplicate_groups: int = 0            # Number of unique duplicate groups found
    duplicate_rows: int = 0              # Total duplicate rows found
    removed_rows: int = 0               # Rows actually removed (0 if KEEP_ALL)
    retained_rows: int = 0              # Rows remaining after this step
    keys_used: List[str] = []           # Column keys used for comparison


class HarmonizationAudit(BaseModel):
    """
    Complete harmonization audit: tracks data lineage from raw ingestion to
    harmonized active dataset. Persisted with session and included in exports.
    """
    raw_ingestion_count: int = 0          # Original file row count (before any reduction)
    post_dedup_count: int = 0             # After duplicate segregation
    post_variance_count: int = 0          # After variance conflict filtration
    final_active_count: int = 0           # Final dataset rows
    total_removed: int = 0               # Total rows removed across all steps

    deduplication: DuplicateSegregationAudit = DuplicateSegregationAudit()
    variance_pruning: VariancePruningAudit = VariancePruningAudit()

    settings_used: HarmonizationSettings = HarmonizationSettings()
    audit_timestamp: Optional[str] = None
