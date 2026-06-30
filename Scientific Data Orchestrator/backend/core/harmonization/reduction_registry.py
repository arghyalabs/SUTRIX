"""
backend/core/harmonization/reduction_registry.py

Strategy implementations for variance conflict filtration and
duplicate segregation. All strategies are pure functions that
receive a DataFrame and return (cleaned_df, audit_details).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, Tuple, Any, Optional

import numpy as np
import pandas as pd

from .reduction_models import (
    DuplicateSegregationAudit,
    DuplicateSegregationStrategy,
    HarmonizationAudit,
    HarmonizationSettings,
    VarianceConflictStrategy,
    VariancePruningAudit,
)

logger = logging.getLogger("sdo.harmonization.registry")


# ──────────────────────────────────────────────────────────────
# Variance Conflict Filtration Strategies
# ──────────────────────────────────────────────────────────────

def _resolve_variance_columns(df: pd.DataFrame, mappings: Dict[str, str]) -> Optional[Tuple[str, str, str, Optional[str]]]:
    """Resolve chemical, value, endpoint, and unit columns from mappings."""
    sci_to_user = {v: k for k, v in mappings.items()}
    chem_col = (
        sci_to_user.get("chemical_name")
        or sci_to_user.get("chemical_id")
        or sci_to_user.get("cas_number")
    )
    val_col = sci_to_user.get("value")
    ep_col = sci_to_user.get("endpoint")
    unit_col = sci_to_user.get("unit")

    if not chem_col or not val_col or not ep_col:
        return None
    if chem_col not in df.columns or val_col not in df.columns or ep_col not in df.columns:
        return None
    return chem_col, val_col, ep_col, unit_col


def _compute_variance_flags(df: pd.DataFrame, mappings: Dict[str, str]) -> Tuple[pd.DataFrame, Optional[pd.DataFrame]]:
    """
    Compute log10 variance flags per [chemical, endpoint, unit] group.
    Returns (flagged_df_with_audit_flag_col, group_summary_df_or_None).
    """
    cols = _resolve_variance_columns(df, mappings)
    if not cols:
        return df.copy(), None

    chem_col, val_col, ep_col, unit_col = cols
    out = df.copy()

    numeric_vals = pd.to_numeric(out[val_col], errors="coerce")
    valid_mask = numeric_vals > 0
    log_vals = np.full(len(out), np.nan)
    log_vals[valid_mask] = np.log10(numeric_vals[valid_mask].values)
    out["_log10_val"] = log_vals

    group_keys = [chem_col, ep_col]
    if unit_col and unit_col in out.columns:
        group_keys.append(unit_col)

    grouped = out.groupby(group_keys, dropna=False)["_log10_val"]
    out["_log_max"] = grouped.transform("max")
    out["_log_min"] = grouped.transform("min")
    out["_log_range"] = (out["_log_max"] - out["_log_min"]).fillna(0.0)

    conditions = [out["_log_range"] >= 1.0, out["_log_range"] >= 0.5]
    choices = ["High_Variance_Conflict", "Moderate_Variance"]
    out["audit_flag"] = np.select(conditions, choices, default="Consistent")

    group_summary = out.drop_duplicates(subset=group_keys)
    out.drop(columns=["_log10_val", "_log_max", "_log_min", "_log_range"], inplace=True)
    return out, group_summary


class VariancePruner:
    """Applies a variance conflict filtration strategy to a DataFrame."""

    def apply(
        self,
        df: pd.DataFrame,
        mappings: Dict[str, str],
        strategy: VarianceConflictStrategy,
    ) -> Tuple[pd.DataFrame, VariancePruningAudit]:
        raw_count = len(df)

        flagged_df, group_summary = _compute_variance_flags(df, mappings)

        if group_summary is None:
            audit = VariancePruningAudit(
                strategy_applied=strategy,
                raw_count=raw_count,
                retained_rows=raw_count,
                consistency_score=100.0,
            )
            # Remove audit_flag column if it was added
            if "audit_flag" in flagged_df.columns:
                flagged_df = flagged_df.drop(columns=["audit_flag"])
            return flagged_df, audit

        # Build summary stats
        conflict_mask_group = group_summary["_log_range"] >= 1.0 if "_log_range" in group_summary.columns else pd.Series([False] * len(group_summary))
        flagged_groups = int(conflict_mask_group.sum())

        # Count flagged rows in the full df
        row_conflict_mask = flagged_df.get("audit_flag") == "High_Variance_Conflict"
        flagged_rows = int(row_conflict_mask.sum()) if row_conflict_mask is not None else 0

        total_groups = len(group_summary)
        passed = total_groups - flagged_groups
        consistency_score = round((passed / total_groups * 100) if total_groups > 0 else 100.0, 1)

        # Build conflict compound detail list (for audit / PDF export)
        conflict_compounds: list = []
        cols = _resolve_variance_columns(df, mappings)
        if cols and "_log_range" in group_summary.columns:
            chem_col, _, ep_col, unit_col = cols
            conflict_group_df = group_summary[group_summary["_log_range"] >= 1.0]
            for _, row in conflict_group_df.head(50).iterrows():
                entry: Dict[str, Any] = {
                    "chemical": str(row.get(chem_col, "")),
                    "endpoint": str(row.get(ep_col, "")),
                    "log_range": round(float(row.get("_log_range", 0)), 3),
                }
                if unit_col and unit_col in row.index:
                    entry["unit"] = str(row.get(unit_col, ""))
                conflict_compounds.append(entry)

        # ── Apply strategy ──────────────────────────────────────
        removed_rows = 0
        result_df = flagged_df.copy()

        if strategy == VarianceConflictStrategy.KEEP_ALL:
            # Do nothing — keep all rows as-is
            pass

        elif strategy == VarianceConflictStrategy.REMOVE_CONFLICTS:
            before = len(result_df)
            result_df = result_df[result_df["audit_flag"] != "High_Variance_Conflict"].copy()
            removed_rows = before - len(result_df)

        elif strategy == VarianceConflictStrategy.KEEP_MEDIAN:
            cols_resolved = _resolve_variance_columns(df, mappings)
            if cols_resolved:
                chem_col, val_col, ep_col, unit_col = cols_resolved
                group_keys = [chem_col, ep_col]
                if unit_col and unit_col in result_df.columns:
                    group_keys.append(unit_col)

                conflict_rows = result_df["audit_flag"] == "High_Variance_Conflict"
                non_conflict = result_df[~conflict_rows].copy()

                conflict_df = result_df[conflict_rows].copy()
                numeric_val = pd.to_numeric(conflict_df[val_col], errors="coerce")
                conflict_df["_num_val"] = numeric_val

                # Keep only the row closest to group median
                def pick_median_row(grp: pd.DataFrame) -> pd.DataFrame:
                    median = grp["_num_val"].median()
                    idx = (grp["_num_val"] - median).abs().idxmin()
                    return grp.loc[[idx]]

                kept_from_conflicts = conflict_df.groupby(group_keys, group_keys=False).apply(pick_median_row)
                kept_from_conflicts = kept_from_conflicts.drop(columns=["_num_val"])
                result_df = pd.concat([non_conflict, kept_from_conflicts], ignore_index=True)
                removed_rows = flagged_rows - len(kept_from_conflicts)
            else:
                pass  # Cannot resolve columns; fall back to KEEP_ALL

        elif strategy == VarianceConflictStrategy.KEEP_FIRST:
            cols_resolved = _resolve_variance_columns(df, mappings)
            if cols_resolved:
                chem_col, val_col, ep_col, unit_col = cols_resolved
                group_keys = [chem_col, ep_col]
                if unit_col and unit_col in result_df.columns:
                    group_keys.append(unit_col)

                conflict_rows = result_df["audit_flag"] == "High_Variance_Conflict"
                non_conflict = result_df[~conflict_rows].copy()
                conflict_df = result_df[conflict_rows].copy()
                kept_from_conflicts = conflict_df.groupby(group_keys).first().reset_index()
                result_df = pd.concat([non_conflict, kept_from_conflicts], ignore_index=True)
                removed_rows = flagged_rows - len(kept_from_conflicts)

        elif strategy == VarianceConflictStrategy.KEEP_MOST_RECENT:
            # Keep last row (most recently appended) per conflict group
            cols_resolved = _resolve_variance_columns(df, mappings)
            if cols_resolved:
                chem_col, val_col, ep_col, unit_col = cols_resolved
                group_keys = [chem_col, ep_col]
                if unit_col and unit_col in result_df.columns:
                    group_keys.append(unit_col)

                conflict_rows = result_df["audit_flag"] == "High_Variance_Conflict"
                non_conflict = result_df[~conflict_rows].copy()
                conflict_df = result_df[conflict_rows].copy()
                kept_from_conflicts = conflict_df.groupby(group_keys).last().reset_index()
                result_df = pd.concat([non_conflict, kept_from_conflicts], ignore_index=True)
                removed_rows = flagged_rows - len(kept_from_conflicts)

        # Remove internal audit_flag column from result
        if "audit_flag" in result_df.columns:
            result_df = result_df.drop(columns=["audit_flag"])

        audit = VariancePruningAudit(
            strategy_applied=strategy,
            raw_count=raw_count,
            flagged_groups=flagged_groups,
            flagged_rows=flagged_rows,
            removed_rows=max(0, removed_rows),
            retained_rows=len(result_df),
            consistency_score=consistency_score,
            conflict_compounds=conflict_compounds,
        )
        return result_df, audit


# ──────────────────────────────────────────────────────────────
# Duplicate Segregation Strategies
# ──────────────────────────────────────────────────────────────

class DuplicateSegregator:
    """Applies a duplicate segregation strategy to a DataFrame."""

    def apply(
        self,
        df: pd.DataFrame,
        mappings: Dict[str, str],
        strategy: DuplicateSegregationStrategy,
    ) -> Tuple[pd.DataFrame, DuplicateSegregationAudit]:
        raw_count = len(df)

        if strategy == DuplicateSegregationStrategy.KEEP_ALL:
            audit = DuplicateSegregationAudit(
                strategy_applied=strategy,
                raw_count=raw_count,
                retained_rows=raw_count,
                keys_used=["None — KEEP_ALL selected"],
            )
            return df.copy(), audit

        elif strategy == DuplicateSegregationStrategy.REMOVE_EXACT_DUPLICATES:
            is_dup = df.duplicated(subset=df.columns.tolist(), keep="first")
            dup_groups = int(df[is_dup].drop_duplicates().shape[0]) if is_dup.any() else 0
            removed = int(is_dup.sum())
            result_df = df[~is_dup].reset_index(drop=True)

            audit = DuplicateSegregationAudit(
                strategy_applied=strategy,
                raw_count=raw_count,
                duplicate_groups=dup_groups,
                duplicate_rows=removed,
                removed_rows=removed,
                retained_rows=len(result_df),
                keys_used=["All Columns (exact match)"],
            )
            return result_df, audit

        elif strategy == DuplicateSegregationStrategy.REMOVE_STRUCTURE_DUPLICATES:
            sci_to_user = {v: k for k, v in mappings.items()}
            smiles_col = sci_to_user.get("canonical_smiles") or sci_to_user.get("smiles")
            if smiles_col and smiles_col in df.columns:
                is_dup = df.duplicated(subset=[smiles_col], keep="first")
                removed = int(is_dup.sum())
                dup_groups = int(df[is_dup].drop_duplicates(subset=[smiles_col]).shape[0]) if is_dup.any() else 0
                result_df = df[~is_dup].reset_index(drop=True)
                audit = DuplicateSegregationAudit(
                    strategy_applied=strategy,
                    raw_count=raw_count,
                    duplicate_groups=dup_groups,
                    duplicate_rows=removed,
                    removed_rows=removed,
                    retained_rows=len(result_df),
                    keys_used=[smiles_col],
                )
                return result_df, audit
            else:
                # Fall back to exact dedup if no SMILES column
                logger.warning("REMOVE_STRUCTURE_DUPLICATES: No SMILES column found. Falling back to exact dedup.")
                return self.apply(df, mappings, DuplicateSegregationStrategy.REMOVE_EXACT_DUPLICATES)

        elif strategy == DuplicateSegregationStrategy.MERGE_DUPLICATES:
            # Use scientific composite key to find duplicates, then average numeric values
            sci_to_user = {v: k for k, v in mappings.items()}
            key_vars = ["chemical_name", "chemical_id", "cas_number", "endpoint", "unit", "species", "duration"]
            key_cols = []
            for var in key_vars:
                col = sci_to_user.get(var)
                if col and col in df.columns:
                    key_cols.append(col)

            if len(key_cols) >= 2:
                val_col = sci_to_user.get("value")
                is_dup = df.duplicated(subset=key_cols, keep=False)
                dup_groups = int(df[is_dup].drop_duplicates(subset=key_cols).shape[0]) if is_dup.any() else 0
                removed = int(is_dup.sum()) - dup_groups  # one row kept per group

                num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                cat_cols = [c for c in df.columns if c not in num_cols]

                # Aggregate: mean for numerics, first for categoricals
                agg_dict = {c: "mean" for c in num_cols if c in df.columns}
                agg_dict.update({c: "first" for c in cat_cols if c in df.columns and c not in key_cols})
                try:
                    result_df = df.groupby(key_cols).agg(agg_dict).reset_index()
                except Exception:
                    result_df = df.drop_duplicates(subset=key_cols, keep="first").reset_index(drop=True)

                audit = DuplicateSegregationAudit(
                    strategy_applied=strategy,
                    raw_count=raw_count,
                    duplicate_groups=dup_groups,
                    duplicate_rows=int(is_dup.sum()),
                    removed_rows=max(0, removed),
                    retained_rows=len(result_df),
                    keys_used=key_cols,
                )
                return result_df, audit
            else:
                # Not enough key columns to merge; fall back to exact dedup
                logger.warning("MERGE_DUPLICATES: Insufficient key columns. Falling back to exact dedup.")
                return self.apply(df, mappings, DuplicateSegregationStrategy.REMOVE_EXACT_DUPLICATES)

        # Unknown strategy — KEEP_ALL by default
        return df.copy(), DuplicateSegregationAudit(
            strategy_applied=strategy, raw_count=raw_count, retained_rows=raw_count
        )
