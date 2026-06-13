"""
backend/core/harmonization/harmonization_engine.py

Orchestrates preview and apply operations for the Cross-Studio
Data Reduction Control & Audit Framework.

The engine runs two operations:
  - preview(): Computes what WOULD be reduced without mutating any data.
  - apply():   Applies the configured strategies, mutates the parquet,
               and returns a full HarmonizationAudit for the session.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional

import pandas as pd

from .reduction_models import (
    DuplicateSegregationStrategy,
    HarmonizationAudit,
    HarmonizationSettings,
    VarianceConflictStrategy,
    VariancePruningAudit,
    DuplicateSegregationAudit,
)
from .reduction_registry import DuplicateSegregator, VariancePruner

logger = logging.getLogger("sdo.harmonization.engine")


class HarmonizationEngine:
    """
    Scientist-facing harmonization orchestrator.

    Usage:
        engine = HarmonizationEngine()
        preview = engine.preview(df, mappings, settings)
        result_df, audit = engine.apply(df, mappings, settings)
    """

    def __init__(self):
        self._variance_pruner = VariancePruner()
        self._dedup_segregator = DuplicateSegregator()

    # ──────────────────────────────────────────────────────────
    # Preview (read-only — no df mutation)
    # ──────────────────────────────────────────────────────────

    def preview(
        self,
        df: pd.DataFrame,
        mappings: Dict[str, str],
        settings: HarmonizationSettings,
    ) -> Dict[str, Any]:
        """
        Returns projected row counts for each reduction step without
        modifying the dataframe or persisting anything.

        Returns a dict suitable for direct JSON serialization.
        """
        raw_count = len(df)
        logger.info(f"HarmonizationEngine.preview(): {raw_count} raw rows, settings={settings}")

        # Step 1: Deduplication preview
        dedup_df, dedup_audit = self._dedup_segregator.apply(
            df, mappings, settings.duplicate_segregation_strategy
        )
        post_dedup = len(dedup_df)

        # Step 2: Variance pruning preview (on post-dedup frame)
        variance_df, variance_audit = self._variance_pruner.apply(
            dedup_df, mappings, settings.variance_conflict_strategy
        )
        post_variance = len(variance_df)

        return {
            "raw_ingestion_count": raw_count,
            "post_dedup_count": post_dedup,
            "post_variance_count": post_variance,
            "final_projected_count": post_variance,
            "dedup_removed": raw_count - post_dedup,
            "variance_removed": post_dedup - post_variance,
            "total_removed": raw_count - post_variance,
            "deduplication": dedup_audit.dict(),
            "variance_pruning": variance_audit.dict(),
            "settings": settings.dict(),
        }

    # ──────────────────────────────────────────────────────────
    # Apply (mutating — returns cleaned df + audit)
    # ──────────────────────────────────────────────────────────

    def apply(
        self,
        df: pd.DataFrame,
        mappings: Dict[str, str],
        settings: HarmonizationSettings,
    ) -> Tuple[pd.DataFrame, HarmonizationAudit]:
        """
        Applies deduplication and variance pruning strategies in sequence,
        returning the cleaned dataframe and a complete HarmonizationAudit.

        Pipeline order:
          Raw → Duplicate Segregation → Variance Conflict Filtration → Active Dataset
        """
        raw_count = len(df)
        logger.info(
            f"HarmonizationEngine.apply(): {raw_count} rows | "
            f"dedup={settings.duplicate_segregation_strategy} | "
            f"variance={settings.variance_conflict_strategy}"
        )

        # ── Step 1: Duplicate segregation ──────────────────────
        step1_df, dedup_audit = self._dedup_segregator.apply(
            df, mappings, settings.duplicate_segregation_strategy
        )
        post_dedup = len(step1_df)

        # ── Step 2: Variance conflict filtration ────────────────
        step2_df, variance_audit = self._variance_pruner.apply(
            step1_df, mappings, settings.variance_conflict_strategy
        )
        post_variance = len(step2_df)

        # ── Build complete audit record ─────────────────────────
        audit = HarmonizationAudit(
            raw_ingestion_count=raw_count,
            post_dedup_count=post_dedup,
            post_variance_count=post_variance,
            final_active_count=post_variance,
            total_removed=raw_count - post_variance,
            deduplication=dedup_audit,
            variance_pruning=variance_audit,
            settings_used=settings,
            audit_timestamp=datetime.now(timezone.utc).isoformat(),
        )

        logger.info(
            f"Harmonization complete: {raw_count} → {post_dedup} → {post_variance} "
            f"({raw_count - post_variance} rows total removed)"
        )
        return step2_df, audit
