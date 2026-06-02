import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple
import logging

try:
    from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier, ExtraTreesRegressor, ExtraTreesClassifier, GradientBoostingRegressor, GradientBoostingClassifier
    from sklearn.model_selection import cross_val_score, StratifiedKFold, KFold
    from sklearn.metrics import make_scorer, roc_auc_score, r2_score
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

logger = logging.getLogger("sdo.backend.core.readiness_engine")

class ReadinessEngine:
    """
    Evaluates the actual scientific AI and QSAR readiness of a fully enriched subgroup.
    Includes fast ML benchmarking using scikit-learn.
    """

    @staticmethod
    def _resolve_columns(df: pd.DataFrame, mappings: Dict[str, str]) -> Tuple[str, str, str]:
        sci_to_user = {v: k for k, v in mappings.items()}
        smiles_col = sci_to_user.get("canonical_smiles") or sci_to_user.get("smiles")
        if not smiles_col:
            for col in df.columns:
                if col.lower() in ["smiles", "canonical_smiles", "structure", "cas"]:
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
    def evaluate_readiness(cls, df: pd.DataFrame, mappings: Dict[str, str]) -> Dict[str, Any]:
        if df is None or df.empty:
            return cls._empty_result()

        smiles_col, target_col, endpoint_col = cls._resolve_columns(df, mappings)
        
        if not target_col or target_col not in df.columns:
            return cls._empty_result(reason="No mapped endpoint value column found.")

        # Filter out rows with missing targets
        valid_df = df.dropna(subset=[target_col])
        if len(valid_df) < 50:
            return cls._empty_result(reason=f"Insufficient data: only {len(valid_df)} rows with valid targets.")

        # Identify descriptor columns (numeric columns excluding targets/identifiers)
        exclude = {smiles_col, target_col, endpoint_col, "isomeric_smiles", "chemical_name", "cas_number", "id", "PubChem_Error"}
        descriptor_cols = [c for c in valid_df.select_dtypes(include=[np.number]).columns if c not in exclude]

        if not descriptor_cols:
            return cls._empty_result(reason="No numeric descriptors found. Ensure Descriptor Enrichment has been run.")

        target_series = valid_df[target_col]
        is_continuous = pd.api.types.is_numeric_dtype(target_series) and target_series.nunique() > 10

        # Calculate QSAR Readiness (Applicability domain, variance, correlation, sample size)
        qsar_score, qsar_metrics = cls._calculate_qsar_readiness(valid_df, descriptor_cols, target_series, is_continuous)
        
        # Calculate AI Readiness (Target distribution, information gain, noise)
        ai_score, ai_metrics = cls._calculate_ai_readiness(valid_df, descriptor_cols, target_series, is_continuous)

        # ML Benchmarking
        ml_benchmarks = cls._run_ml_benchmarks(valid_df, descriptor_cols, target_series, is_continuous)

        return {
            "success": True,
            "qsar_readiness_score": qsar_score,
            "ai_readiness_score": ai_score,
            "qsar_metrics": qsar_metrics,
            "ai_metrics": ai_metrics,
            "ml_benchmarks": ml_benchmarks,
            "task_type": "Regression" if is_continuous else "Classification",
            "samples": len(valid_df),
            "features": len(descriptor_cols)
        }

    @staticmethod
    def _empty_result(reason="Dataset empty or invalid.") -> Dict[str, Any]:
        return {
            "success": False,
            "reason": reason,
            "qsar_readiness_score": 0,
            "ai_readiness_score": 0,
            "qsar_metrics": {},
            "ai_metrics": {},
            "ml_benchmarks": [],
            "task_type": "Unknown",
            "samples": 0,
            "features": 0
        }

    @staticmethod
    def _calculate_qsar_readiness(df, feature_cols, target, is_continuous):
        """QSAR Readiness considers structural diversity, feature variance, and sample size."""
        score = 0
        metrics = {}
        
        # Sample size (ideal > 300)
        n = len(df)
        sample_score = min(30, (n / 300) * 30)
        score += sample_score
        metrics["sample_size"] = n
        
        # Feature Variance
        variances = df[feature_cols].var()
        zero_var_pct = (variances == 0).mean() * 100
        var_score = max(0, 30 - (zero_var_pct * 0.5))
        score += var_score
        metrics["zero_variance_features_pct"] = round(zero_var_pct, 1)

        # Ratio of features to samples (Curse of dimensionality)
        ratio = len(feature_cols) / max(1, n)
        if ratio < 0.2:
            ratio_score = 40
        elif ratio < 1.0:
            ratio_score = 25
        elif ratio < 5.0:
            ratio_score = 10
        else:
            ratio_score = 0
        score += ratio_score
        metrics["feature_sample_ratio"] = round(ratio, 2)

        return round(score, 1), metrics

    @staticmethod
    def _calculate_ai_readiness(df, feature_cols, target, is_continuous):
        """AI Readiness considers missingness, target distribution, and non-linear signal potential."""
        score = 0
        metrics = {}
        
        # Missingness in features
        missing_pct = df[feature_cols].isna().mean().mean() * 100
        missing_score = max(0, 40 - (missing_pct * 2))
        score += missing_score
        metrics["feature_missingness_pct"] = round(missing_pct, 1)

        # Target Distribution
        if is_continuous:
            target_numeric = pd.to_numeric(target, errors='coerce').dropna()
            skew = abs(target_numeric.skew())
            dist_score = max(0, 30 - (skew * 10))
            metrics["target_skewness"] = round(skew, 2)
        else:
            counts = target.value_counts(normalize=True)
            majority_class = counts.iloc[0]
            # Perfect balance gets 30, highly imbalanced gets 0
            dist_score = max(0, 30 - ((majority_class - (1/len(counts))) * 60))
            metrics["majority_class_pct"] = round(majority_class * 100, 1)
        
        score += dist_score
        
        # Base AI score bonus
        score += 30 
        
        return round(min(100, score), 1), metrics

    @staticmethod
    def _run_ml_benchmarks(df, feature_cols, target, is_continuous):
        """Runs quick cross-validated baseline models using scikit-learn."""
        if not SKLEARN_AVAILABLE:
            return [{"model": "Error", "metric": "R2", "score": 0.0, "status": "scikit-learn not installed"}]

        results = []
        
        # Prepare data
        X = df[feature_cols].values
        
        # Impute missing
        imputer = SimpleImputer(strategy='median')
        X = imputer.fit_transform(X)
        
        # Scale
        scaler = StandardScaler()
        X = scaler.fit_transform(X)

        # Subsample if too large for quick benchmarking
        if len(X) > 2000:
            indices = np.random.choice(len(X), 2000, replace=False)
            X = X[indices]
            y = target.iloc[indices].values
        else:
            y = target.values

        if is_continuous:
            y = pd.to_numeric(y, errors='coerce')
            valid_idx = ~np.isnan(y)
            X = X[valid_idx]
            y = y[valid_idx]
            
            models = {
                "Random Forest": RandomForestRegressor(n_estimators=50, max_depth=10, n_jobs=-1, random_state=42),
                "Extra Trees": ExtraTreesRegressor(n_estimators=50, max_depth=10, n_jobs=-1, random_state=42),
                "Gradient Boosting": GradientBoostingRegressor(n_estimators=50, max_depth=5, random_state=42)
            }
            cv = KFold(n_splits=3, shuffle=True, random_state=42)
            scoring = 'r2'
            metric_name = "R²"
        else:
            # Classification
            models = {
                "Random Forest": RandomForestClassifier(n_estimators=50, max_depth=10, n_jobs=-1, random_state=42),
                "Extra Trees": ExtraTreesClassifier(n_estimators=50, max_depth=10, n_jobs=-1, random_state=42),
                "Gradient Boosting": GradientBoostingClassifier(n_estimators=50, max_depth=5, random_state=42)
            }
            # Only use StratifiedKFold if all classes have at least 3 members
            from collections import Counter
            counts = Counter(y)
            if min(counts.values()) >= 3:
                cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
            else:
                cv = KFold(n_splits=3, shuffle=True, random_state=42)
                
            if len(set(y)) == 2:
                scoring = 'roc_auc'
                metric_name = "ROC-AUC"
            else:
                scoring = 'accuracy'
                metric_name = "Accuracy"

        for name, model in models.items():
            try:
                scores = cross_val_score(model, X, y, cv=cv, scoring=scoring, n_jobs=-1)
                mean_score = np.mean(scores)
                # Q2 is approximated by CV R2 for regression
                q2_score = mean_score if is_continuous else None
                
                res = {
                    "model": name,
                    "metric": metric_name,
                    "score": round(mean_score, 3),
                    "status": "Success"
                }
                if is_continuous:
                    res["q2"] = round(q2_score, 3)
                results.append(res)
            except Exception as e:
                logger.error(f"Benchmarking failed for {name}: {e}")
                results.append({
                    "model": name,
                    "metric": metric_name,
                    "score": 0.0,
                    "status": f"Failed: {str(e)}"
                })

        return results
