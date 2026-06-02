"""
backend/core/ml_benchmark_engine.py

SUTRIX V5 — ML Benchmark Engine
Provides rapid predictability estimation using scikit-learn models.
Used by Step 10 (AI & QSAR Readiness Assessment).

NOTE: These are rapid estimates, not production models.
      Final models require rigorous cross-validation and domain expertise.
"""

import logging
import numpy as np
from typing import Dict, Any, Optional, List

logger = logging.getLogger("sdo.core.ml_benchmark")


class MLBenchmarkEngine:
    """Rapid ML predictability estimation for the active subgroup dataset."""

    CLASSIFIER_CONFIGS = {
        "RandomForest": {
            "module": "sklearn.ensemble",
            "class": "RandomForestClassifier",
            "params": {"n_estimators": 100, "random_state": 42, "n_jobs": -1}
        },
        "ExtraTrees": {
            "module": "sklearn.ensemble",
            "class": "ExtraTreesClassifier",
            "params": {"n_estimators": 100, "random_state": 42, "n_jobs": -1}
        },
        "GradientBoosting": {
            "module": "sklearn.ensemble",
            "class": "GradientBoostingClassifier",
            "params": {"random_state": 42, "n_estimators": 100}
        },
        "HistGradientBoosting": {
            "module": "sklearn.ensemble",
            "class": "HistGradientBoostingClassifier",
            "params": {"random_state": 42, "max_iter": 100}
        },
    }

    REGRESSOR_CONFIGS = {
        "RandomForest": {
            "module": "sklearn.ensemble",
            "class": "RandomForestRegressor",
            "params": {"n_estimators": 100, "random_state": 42, "n_jobs": -1}
        },
        "ExtraTrees": {
            "module": "sklearn.ensemble",
            "class": "ExtraTreesRegressor",
            "params": {"n_estimators": 100, "random_state": 42, "n_jobs": -1}
        },
        "GradientBoosting": {
            "module": "sklearn.ensemble",
            "class": "GradientBoostingRegressor",
            "params": {"random_state": 42, "n_estimators": 100}
        },
        "HistGradientBoosting": {
            "module": "sklearn.ensemble",
            "class": "HistGradientBoostingRegressor",
            "params": {"random_state": 42, "max_iter": 100}
        },
    }

    @staticmethod
    def _load_model(config: dict):
        import importlib
        mod = importlib.import_module(config["module"])
        cls = getattr(mod, config["class"])
        return cls(**config["params"])

    @staticmethod
    def detect_task_type(y_series) -> str:
        """Auto-detect regression vs classification."""
        unique_vals = y_series.dropna().unique()
        n_unique = len(unique_vals)
        if n_unique <= 2:
            return "binary_classification"
        elif n_unique <= 10:
            return "multiclass_classification"
        else:
            return "regression"

    def benchmark(
        self,
        df,
        mappings: dict,
        task_type: str = "auto",
        cv_folds: int = 5
    ) -> Dict[str, Any]:
        """
        Runs cross-validated ML benchmarking on the active subgroup descriptor matrix.
        
        Args:
            df: Active subgroup DataFrame with descriptors computed
            mappings: Column role mappings dict
            task_type: 'auto', 'regression', or 'classification'
            cv_folds: Number of cross-validation folds
        
        Returns:
            Dict with model_scores, best_model, recommendation, task_type, etc.
        """
        import pandas as pd
        from sklearn.model_selection import cross_val_score
        from sklearn.preprocessing import LabelEncoder
        from sklearn.impute import SimpleImputer

        # Find endpoint column
        role_to_col = {v: k for k, v in mappings.items()}
        endpoint_col = role_to_col.get('endpoint') or role_to_col.get('activity') or role_to_col.get('target')
        if not endpoint_col or endpoint_col not in df.columns:
            # Try to find a numeric endpoint column
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            endpoint_col = numeric_cols[-1] if numeric_cols else None
        
        if not endpoint_col:
            return {"error": "No endpoint column found for benchmarking", "success": False}

        # Prepare features: numeric columns only, excluding endpoint
        feature_cols = [
            c for c in df.select_dtypes(include=[np.number]).columns
            if c != endpoint_col
        ]
        
        if not feature_cols:
            return {"error": "No numeric feature columns available for benchmarking", "success": False}

        X = df[feature_cols].values
        y_raw = df[endpoint_col].dropna()
        
        # Align X with non-null y
        valid_idx = df[endpoint_col].dropna().index
        X = df.loc[valid_idx, feature_cols].values
        y = y_raw.values

        if len(y) < cv_folds * 2:
            return {
                "error": f"Insufficient data for {cv_folds}-fold CV (need at least {cv_folds * 2} samples, got {len(y)})",
                "success": False
            }

        # Impute missing values
        imputer = SimpleImputer(strategy='median')
        X = imputer.fit_transform(X)

        # Detect task type
        if task_type == "auto":
            task_type = MLBenchmarkEngine.detect_task_type(y_raw)

        # Encode labels for classification
        if "classification" in task_type:
            le = LabelEncoder()
            y = le.fit_transform(y.astype(str))
            configs = MLBenchmarkEngine.CLASSIFIER_CONFIGS
            metric = "roc_auc" if task_type == "binary_classification" else "f1_macro"
            metric_label = "AUC" if task_type == "binary_classification" else "F1 (macro)"
        else:
            configs = MLBenchmarkEngine.REGRESSOR_CONFIGS
            metric = "r2"
            metric_label = "R²"

        model_scores = []
        best_score = -np.inf
        best_model_name = None

        for model_name, config in configs.items():
            try:
                model = MLBenchmarkEngine._load_model(config)
                scores = cross_val_score(model, X, y, cv=cv_folds, scoring=metric, n_jobs=-1)
                mean_score = float(np.mean(scores))
                std_score = float(np.std(scores))
                
                suitable = mean_score > 0.6 if "classification" in task_type else mean_score > 0.5
                
                model_scores.append({
                    "model": model_name,
                    "task_type": task_type,
                    "metric": metric_label,
                    "score": round(mean_score, 4),
                    "std": round(std_score, 4),
                    "cv_folds": cv_folds,
                    "suitable": suitable,
                    "status": "✓ Suitable" if suitable else "✗ Not Suitable"
                })
                
                if mean_score > best_score:
                    best_score = mean_score
                    best_model_name = model_name
                    
            except Exception as e:
                logger.warning(f"Benchmark failed for {model_name}: {e}")
                model_scores.append({
                    "model": model_name,
                    "task_type": task_type,
                    "metric": metric_label,
                    "score": None,
                    "std": None,
                    "cv_folds": cv_folds,
                    "suitable": False,
                    "status": "✗ Error",
                    "error": str(e)
                })

        # Sort by score
        model_scores.sort(key=lambda x: (x['score'] or -np.inf), reverse=True)

        # Generate recommendation
        if best_score > 0.85 if "classification" in task_type else best_score > 0.75:
            suitability = "excellent"
            recommendation = f"{best_model_name} is the top performer ({metric_label}: {best_score:.3f}). This dataset shows strong ML predictability."
        elif best_score > 0.7 if "classification" in task_type else best_score > 0.55:
            suitability = "good"
            recommendation = f"{best_model_name} shows good predictability ({metric_label}: {best_score:.3f}). Suitable for QSAR modeling."
        elif best_score > 0.6 if "classification" in task_type else best_score > 0.4:
            suitability = "fair"
            recommendation = f"Moderate predictability ({metric_label}: {best_score:.3f}). Consider feature engineering or additional data."
        else:
            suitability = "poor"
            recommendation = f"Low predictability ({metric_label}: {best_score:.3f}). Review endpoint quality and structural diversity."

        return {
            "success": True,
            "task_type": task_type,
            "endpoint_column": endpoint_col,
            "feature_count": len(feature_cols),
            "sample_count": len(y),
            "metric": metric_label,
            "best_model": best_model_name,
            "best_score": round(best_score, 4),
            "suitability": suitability,
            "recommendation": recommendation,
            "model_scores": model_scores,
            "disclaimer": "These are rapid estimates using 5-fold CV. Final QSAR models require rigorous cross-validation, domain expertise, and applicability domain assessment."
        }
