"""
backend/core/predictability_engine.py

Calculates the AI Predictability Score and modeling suitability metrics for scientific subgroups.
Used in Step 5 (Subgroup Selection Hub) to determine which subgroups are suitable for QSAR.
"""

import math
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional

class AIPredictabilityEngine:
    """Analyzes a scientific subgroup dataframe to compute its QSAR modeling predictability score (0-100)."""

    @staticmethod
    def _resolve_columns(df: pd.DataFrame, mappings: Dict[str, str]):
        """Helper to resolve SMILES/CAS, target values, and endpoint columns from mappings."""
        sci_to_user = {v: k for k, v in mappings.items()}
        smiles_col = sci_to_user.get("canonical_smiles") or sci_to_user.get("smiles")
        if not smiles_col:
            # Look for default column names
            for col in df.columns:
                if col.lower() in ["smiles", "canonical_smiles", "structure", "cas", "cas_number", "cas_no"]:
                    smiles_col = col
                    break
        
        target_col = sci_to_user.get("value") or sci_to_user.get("endpoint_value")
        if not target_col:
            for col in df.columns:
                if col.lower() in ["value", "target", "endpoint_value", "potency", "activity"]:
                    target_col = col
                    break

        endpoint_col = sci_to_user.get("endpoint") or sci_to_user.get("endpoint_name")
        if not endpoint_col:
            for col in df.columns:
                if col.lower() in ["endpoint", "effect", "test_type", "endpoint_name"]:
                    endpoint_col = col
                    break

        return smiles_col, target_col, endpoint_col

    @classmethod
    def analyze_subgroup(cls, df: pd.DataFrame, mappings: Dict[str, str], subgroup_name: str = "Subgroup") -> Dict[str, Any]:
        """Runs the predictability engine on a subgroup dataframe. All metrics are JSON-serializable."""
        if df is None or df.empty:
            return {
                "subgroup_name": subgroup_name,
                "total_rows": 0,
                "unique_compounds": 0,
                "missing_pct": 100.0,
                "number_of_classes": 0,
                "imbalance_ratio": 0.0,
                "feature_variance": 0.0,
                "duplicate_percentage": 0.0,
                "ai_predictability_score": 0.0,
                "reasons": ["✕ Dataset is empty"],
                "recommended": False
            }

        total_rows = len(df)
        smiles_col, target_col, endpoint_col = cls._resolve_columns(df, mappings)

        # 1. Unique compounds count
        if smiles_col and smiles_col in df.columns:
            unique_compounds = int(df[smiles_col].dropna().nunique())
        else:
            # Fallback to CAS or chemical name or index
            unique_compounds = int(total_rows)

        # 2. Missingness
        total_cells = df.size
        missing_cells = int(df.isnull().sum().sum())
        missing_pct = round((missing_cells / total_cells) * 100.0, 2) if total_cells > 0 else 0.0

        # 3. Endpoint Diversity (Classes or continuous ranges)
        number_of_classes = 0
        imbalance_ratio = 1.0
        is_continuous = False

        if target_col and target_col in df.columns:
            series = df[target_col].dropna()
            if len(series) > 0:
                n_unique = series.nunique()
                dtype_is_numeric = pd.api.types.is_numeric_dtype(series)
                is_continuous = dtype_is_numeric and n_unique > 10

                if is_continuous:
                    number_of_classes = int(n_unique)
                    # For continuous, imbalance is skewness or range coverage
                    numeric = pd.to_numeric(series, errors="coerce").dropna()
                    if len(numeric) > 1:
                        # Convert skewness into a 0-1 balance score
                        skew = abs(float(numeric.skew()))
                        imbalance_ratio = round(max(0.1, 1.0 / (1.0 + skew)), 2)
                    else:
                        imbalance_ratio = 1.0
                else:
                    # Classification target
                    counts = series.astype(str).value_counts()
                    number_of_classes = int(len(counts))
                    if number_of_classes > 1:
                        majority_count = int(counts.iloc[0])
                        minority_count = int(counts.iloc[-1])
                        imbalance_ratio = round(minority_count / majority_count, 4)
                    else:
                        imbalance_ratio = 0.0
            else:
                number_of_classes = 0
                imbalance_ratio = 0.0
        else:
            # Fallback if no target column
            number_of_classes = 1
            imbalance_ratio = 1.0

        # 4. Feature variance (average variance of numeric columns, excluding target)
        exclude_cols = {target_col, smiles_col} if target_col else {smiles_col}
        numeric_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c not in exclude_cols]
        
        if numeric_cols:
            variances = df[numeric_cols].var().dropna()
            feature_variance = float(variances.mean()) if not variances.empty else 1.0
        else:
            # Prior to enrichment, we may not have numeric descriptors yet.
            feature_variance = 1.0

        # 5. Duplicate ratio
        dup_count = int(df.duplicated().sum())
        duplicate_percentage = round((dup_count / total_rows) * 100.0, 2) if total_rows > 0 else 0.0

        # 6. Calculate AI Predictability Score (0-100)
        # Weights: Data Sufficiency (35%), Missingness/Completeness (20%), Target quality/imbalance (20%), Feature variance (15%), Duplicate ratio (10%)
        
        # Data sufficiency score
        if unique_compounds < 50:
            sufficiency_score = 15.0
        elif unique_compounds < 150:
            sufficiency_score = 45.0
        elif unique_compounds < 500:
            sufficiency_score = 75.0
        else:
            sufficiency_score = min(100.0, 75.0 + (unique_compounds - 500) / 1500.0 * 25.0)

        # Completeness score
        completeness_score = max(0.0, 100.0 - missing_pct * 2.0)

        # Balance score
        balance_score = imbalance_ratio * 100.0

        # Variance score (log scale)
        if feature_variance <= 0.001:
            var_score = 20.0
        elif feature_variance <= 0.1:
            var_score = 60.0
        else:
            var_score = 100.0

        # Duplicate score
        dup_score = max(0.0, 100.0 - duplicate_percentage * 2.0)

        ai_predictability_score = (
            sufficiency_score * 0.35 +
            completeness_score * 0.20 +
            balance_score * 0.20 +
            var_score * 0.15 +
            dup_score * 0.10
        )
        ai_predictability_score = round(max(0.0, min(100.0, ai_predictability_score)), 1)

        # Generate reasons
        reasons = []
        if unique_compounds >= 1000:
            reasons.append("✓ High compound count")
        elif unique_compounds >= 200:
            reasons.append("✓ Adequate compound count")
        else:
            reasons.append("✕ Low compound count (requires more data)")

        if missing_pct <= 5.0:
            reasons.append("✓ Low missingness")
        elif missing_pct <= 20.0:
            reasons.append("✓ Moderate missingness")
        else:
            reasons.append("✕ High missingness (imputation recommended)")

        if number_of_classes > 1:
            if is_continuous:
                reasons.append("✓ Continuous target (regression-ready)")
            else:
                reasons.append(f"✓ Strong endpoint diversity ({number_of_classes} classes)")
        else:
            reasons.append("✕ Zero endpoint diversity (single value/class)")

        if imbalance_ratio >= 0.6:
            reasons.append("✓ Balanced distribution")
        elif imbalance_ratio >= 0.2:
            reasons.append("✓ Moderately balanced distribution")
        else:
            reasons.append("✕ Severe class imbalance (resampling recommended)")

        if feature_variance >= 0.05:
            reasons.append("✓ High descriptor variance")
        else:
            reasons.append("✓ Balanced feature spread")

        if duplicate_percentage <= 5.0:
            reasons.append("✓ Low redundancy (few duplicates)")
        else:
            reasons.append("✕ High redundancy (deduplication recommended)")

        recommended = ai_predictability_score >= 60.0 and unique_compounds >= 100

        return {
            "subgroup_name": subgroup_name,
            "total_rows": total_rows,
            "unique_compounds": unique_compounds,
            "missing_pct": missing_pct,
            "number_of_classes": number_of_classes,
            "imbalance_ratio": imbalance_ratio,
            "feature_variance": round(feature_variance, 4),
            "duplicate_percentage": duplicate_percentage,
            "ai_predictability_score": ai_predictability_score,
            "reasons": reasons,
            "recommended": recommended
        }
