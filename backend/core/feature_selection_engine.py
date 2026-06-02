"""
backend/core/feature_selection_engine.py

Executes a QSAR feature selection pipeline:
1. Variance filtering
2. Pearson correlation filtering
3. Mutual Information feature selection
4. Recursive Feature Elimination (RFE) using a fast estimator.
"""

import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple
from sklearn.feature_selection import SelectKBest, mutual_info_regression, mutual_info_classif, RFE
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.linear_model import Ridge, LogisticRegression

class FeatureSelectionEngine:
    """Runs a step-by-step feature reduction pipeline for QSAR modeling datasets."""

    @staticmethod
    def _resolve_target_and_descriptors(df: pd.DataFrame, mappings: Dict[str, str]) -> Tuple[str, List[str]]:
        """Resolves target column and numeric descriptor columns."""
        sci_to_user = {v: k for k, v in mappings.items()}
        target_col = sci_to_user.get("value") or sci_to_user.get("endpoint_value")
        if not target_col:
            for col in df.columns:
                if col.lower() in ["value", "target", "endpoint_value", "potency", "activity"]:
                    target_col = col
                    break

        smiles_col = sci_to_user.get("canonical_smiles") or sci_to_user.get("smiles")
        unit_col = sci_to_user.get("unit")
        ep_col = sci_to_user.get("endpoint")
        system_cols = {smiles_col, target_col, unit_col, ep_col, "audit_flag", "session_id", "id"}
        
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        descriptor_cols = [c for c in numeric_cols if c not in system_cols and c]

        return target_col, descriptor_cols

    @classmethod
    def run_pipeline(
        cls,
        df: pd.DataFrame,
        mappings: Dict[str, str],
        variance_threshold: float = 0.01,
        correlation_threshold: float = 0.85,
        mi_fraction: float = 0.5,
        run_rfe: bool = True,
        rfe_n_features: int = 50
    ) -> Dict[str, Any]:
        """Runs the sequential feature reduction and tracks counts at each step."""
        target_col, descriptor_cols = cls._resolve_target_and_descriptors(df, mappings)

        if not target_col or target_col not in df.columns:
            return {"error": "Target column not found in dataset. Ensure mappings are saved."}
        
        if not descriptor_cols:
            return {"error": "No numeric descriptor columns found. Please run Enrichment first."}

        # Prepare data slice
        y = pd.to_numeric(df[target_col], errors="coerce")
        valid_idx = y.notna()
        y = y[valid_idx]
        X = df.loc[valid_idx, descriptor_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)

        if len(y) < 5:
            return {"error": "Insufficient valid target data rows (need at least 5 rows)."}

        # Determine target type
        n_unique_y = y.nunique()
        is_classification = n_unique_y <= 5

        # Initialize tracking steps
        steps = []
        current_features = list(descriptor_cols)
        steps.append({
            "name": "Original Features",
            "count": len(current_features),
            "description": f"Initial pool of numeric descriptors generated during enrichment.",
            "features": current_features[:100]
        })

        # --- Step 1: Variance Filter ---
        variances = X[current_features].var()
        after_variance = [col for col in current_features if variances.get(col, 0.0) >= variance_threshold]
        if not after_variance:
            # Avoid dropping everything if threshold is too high
            after_variance = current_features
        current_features = after_variance
        steps.append({
            "name": "Variance Filter",
            "count": len(current_features),
            "description": f"Dropped features with variance below {variance_threshold} (near-constant).",
            "features": current_features[:100]
        })

        # --- Step 2: Correlation Filter ---
        if len(current_features) > 1:
            corr_matrix = X[current_features].corr(method="pearson").abs()
            upper_tri = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
            to_drop = [column for column in upper_tri.columns if any(upper_tri[column] > correlation_threshold)]
            after_correlation = [c for c in current_features if c not in to_drop]
            if not after_correlation:
                after_correlation = current_features
            current_features = after_correlation
        steps.append({
            "name": "Correlation Filter",
            "count": len(current_features),
            "description": f"Removed collinear descriptors with pairwise Pearson correlation > {correlation_threshold}.",
            "features": current_features[:100]
        })

        # --- Step 3: Mutual Information ---
        if len(current_features) > 2:
            try:
                if is_classification:
                    mi_scores = mutual_info_classif(X[current_features], y, random_state=42)
                else:
                    mi_scores = mutual_info_regression(X[current_features], y, random_state=42)
                
                mi_series = pd.Series(mi_scores, index=current_features).sort_values(ascending=False)
                # Keep top K features based on mi_fraction
                k = max(1, int(len(current_features) * mi_fraction))
                after_mi = mi_series.head(k).index.tolist()
                current_features = after_mi
                mi_rankings = [{"feature": k, "score": round(float(v), 4)} for k, v in mi_series.items()]
            except Exception as e:
                mi_rankings = []
        else:
            mi_rankings = []

        steps.append({
            "name": "Mutual Information",
            "count": len(current_features),
            "description": f"Retained top {int(mi_fraction*100)}% features with highest mutual information relative to endpoint.",
            "features": current_features[:100]
        })

        # --- Step 4: Recursive Feature Elimination ---
        if run_rfe and len(current_features) > rfe_n_features:
            try:
                # Use a fast tree estimator or linear estimator depending on classification/regression
                if is_classification:
                    estimator = RandomForestClassifier(n_estimators=10, max_depth=5, random_state=42, n_jobs=-1)
                else:
                    estimator = RandomForestRegressor(n_estimators=10, max_depth=5, random_state=42, n_jobs=-1)
                
                rfe = RFE(estimator=estimator, n_features_to_select=rfe_n_features)
                rfe.fit(X[current_features], y)
                after_rfe = [col for col, selected in zip(current_features, rfe.support_) if selected]
                current_features = after_rfe
            except Exception as e:
                pass
        
        steps.append({
            "name": "Recursive Feature Elimination (RFE)",
            "count": len(current_features),
            "description": f"Recursive pruning using Random Forest feature importance down to target size of {rfe_n_features}.",
            "features": current_features
        })

        return {
            "steps": steps,
            "final_features": current_features,
            "mi_rankings": mi_rankings[:50]  # top 50
        }
