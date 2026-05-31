# -----------------------------------------------------------------------------
# Scientific Data Orchestrator (SDO) — Scientific Readiness Engine
# Non-chemistry dataset readiness scorer for SCIENTIFIC mode datasets.
# -----------------------------------------------------------------------------
"""
backend/processing/scientific_readiness_engine.py

Evaluates the ML/analytical readiness of non-chemistry (SCIENTIFIC mode)
datasets along eight dimensions, each scored 0–100:

  1. Completeness     — fraction of non-null cells
  2. Consistency      — intra-column type consistency
  3. Variance         — feature variance (low-variance cols carry little info)
  4. Class Balance    — distribution evenness for categorical targets
  5. Leakage Risk     — inverse correlation between numeric features and target
  6. Feature Diversity — column type diversity index
  7. Outlier Density  — inverse fraction of statistical outliers (|Z| > 3)
  8. Sample Adequacy  — rows-to-features ratio (n/p)

Final score is the equal-weighted mean of all eight dimension scores.

Tier thresholds:
  >= 85  →  EXCELLENT
  >= 70  →  GOOD
  >= 55  →  ACCEPTABLE
  >= 40  →  POOR
  else   →  INSUFFICIENT
"""

import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Any

logger = logging.getLogger("sdo.processing.scientific_readiness")

# ---------------------------------------------------------------------------
# Tier thresholds
# ---------------------------------------------------------------------------

_TIERS = [
    (85.0, "EXCELLENT"),
    (70.0, "GOOD"),
    (55.0, "ACCEPTABLE"),
    (40.0, "POOR"),
    (0.0,  "INSUFFICIENT"),
]


def _score_to_tier(score: float) -> str:
    """Map a 0–100 score to its quality tier label."""
    for threshold, label in _TIERS:
        if score >= threshold:
            return label
    return "INSUFFICIENT"


# ---------------------------------------------------------------------------
# ScientificReadinessEngine
# ---------------------------------------------------------------------------

class ScientificReadinessEngine:
    """
    Non-chemistry Scientific Dataset Readiness Scorer.

    Replaces DatasetReadinessScorer for SCIENTIFIC mode datasets.

    Scoring dimensions (each 0–100, equal weight):

    1. Completeness     — ratio of non-null cells
    2. Consistency      — intra-column type consistency
    3. Variance         — feature variance (low variance = low info)
    4. Class Balance    — distribution evenness for categorical target
    5. Leakage Risk     — inverse correlation analysis
    6. Feature Diversity — column type diversity
    7. Outlier Density  — inverse fraction of statistical outliers (Z>3)
    8. Sample Adequacy  — rows vs features ratio (n/p ratio)
    """

    @staticmethod
    def evaluate(df: pd.DataFrame, mappings: Dict[str, str]) -> Dict[str, Any]:
        """
        Score a SCIENTIFIC mode DataFrame across all eight readiness dimensions.

        Parameters
        ----------
        df:
            The source DataFrame (full dataset, not a slice).
        mappings:
            Column → scientific-role mapping dict.

        Returns
        -------
        dict with keys:
            score        — float (0–100)
            tier         — str (EXCELLENT | GOOD | ACCEPTABLE | POOR | INSUFFICIENT)
            breakdown    — dict[dimension_name, score]
            deductions   — list[str]  (human-readable reasons for score reduction)
            recommendations — list[str] (actionable improvement tips)
        """
        if df is None or df.empty:
            return {
                "score": 0.0,
                "tier": "INSUFFICIENT",
                "breakdown": {dim: 0.0 for dim in [
                    "completeness", "consistency", "variance",
                    "class_balance", "leakage_risk", "feature_diversity",
                    "outlier_density", "sample_adequacy",
                ]},
                "deductions": ["Dataset is empty."],
                "recommendations": ["Upload a dataset with at least 10 rows and 2 columns."],
            }

        try:
            breakdown: Dict[str, float] = {}
            deductions: List[str] = []
            recommendations: List[str] = []

            # ── 1. Completeness ───────────────────────────────────────────────
            score_completeness = ScientificReadinessEngine._score_completeness(
                df, deductions, recommendations
            )
            breakdown["completeness"] = score_completeness

            # ── 2. Consistency ────────────────────────────────────────────────
            score_consistency = ScientificReadinessEngine._score_consistency(
                df, deductions, recommendations
            )
            breakdown["consistency"] = score_consistency

            # ── 3. Variance ───────────────────────────────────────────────────
            score_variance = ScientificReadinessEngine._score_variance(
                df, deductions, recommendations
            )
            breakdown["variance"] = score_variance

            # ── 4. Class Balance ──────────────────────────────────────────────
            score_class_balance = ScientificReadinessEngine._score_class_balance(
                df, mappings, deductions, recommendations
            )
            breakdown["class_balance"] = score_class_balance

            # ── 5. Leakage Risk ───────────────────────────────────────────────
            score_leakage = ScientificReadinessEngine._score_leakage_risk(
                df, mappings, deductions, recommendations
            )
            breakdown["leakage_risk"] = score_leakage

            # ── 6. Feature Diversity ──────────────────────────────────────────
            score_diversity = ScientificReadinessEngine._score_feature_diversity(
                df, deductions, recommendations
            )
            breakdown["feature_diversity"] = score_diversity

            # ── 7. Outlier Density ────────────────────────────────────────────
            score_outliers = ScientificReadinessEngine._score_outlier_density(
                df, deductions, recommendations
            )
            breakdown["outlier_density"] = score_outliers

            # ── 8. Sample Adequacy ────────────────────────────────────────────
            score_adequacy = ScientificReadinessEngine._score_sample_adequacy(
                df, deductions, recommendations
            )
            breakdown["sample_adequacy"] = score_adequacy

            # ── Final score ───────────────────────────────────────────────────
            final_score = float(np.mean(list(breakdown.values())))
            tier = _score_to_tier(final_score)

            logger.info(
                f"ScientificReadinessEngine: score={final_score:.1f} ({tier}), "
                f"breakdown={breakdown}"
            )

            return {
                "score": round(final_score, 2),
                "tier": tier,
                "breakdown": {k: round(v, 2) for k, v in breakdown.items()},
                "deductions": deductions,
                "recommendations": recommendations,
            }

        except Exception as exc:
            logger.error(f"ScientificReadinessEngine.evaluate() failed: {exc}", exc_info=True)
            return {
                "score": 0.0,
                "tier": "INSUFFICIENT",
                "breakdown": {},
                "deductions": [f"Readiness evaluation failed: {exc}"],
                "recommendations": ["Check the dataset for encoding issues and retry."],
            }

    # ── Dimension scorers ─────────────────────────────────────────────────────

    @staticmethod
    def _score_completeness(
        df: pd.DataFrame,
        deductions: List[str],
        recommendations: List[str],
    ) -> float:
        """Score 0–100: fraction of non-null cells."""
        total_cells = df.shape[0] * df.shape[1]
        if total_cells == 0:
            return 0.0
        null_frac = df.isnull().sum().sum() / total_cells
        score = (1.0 - null_frac) * 100.0
        if null_frac > 0.30:
            deductions.append(
                f"High missingness: {null_frac*100:.1f}% of cells are null."
            )
            recommendations.append(
                "Remove columns with >50% missing values and impute the rest."
            )
        elif null_frac > 0.10:
            deductions.append(f"Moderate missingness: {null_frac*100:.1f}% of cells are null.")
        return float(np.clip(score, 0.0, 100.0))

    @staticmethod
    def _score_consistency(
        df: pd.DataFrame,
        deductions: List[str],
        recommendations: List[str],
    ) -> float:
        """
        Score 0–100: for each numeric column check what fraction of values
        can be parsed as float vs. the actual dtype claim.  Mixed-type columns
        (object columns with many numeric-looking values) reduce the score.
        """
        object_cols = df.select_dtypes(include=["object"]).columns.tolist()
        if not object_cols:
            return 100.0

        inconsistent = 0
        for col in object_cols:
            sample = df[col].dropna().astype(str).head(200)
            if len(sample) == 0:
                continue
            numeric_count = sample.apply(
                lambda x: x.replace(".", "", 1).replace("-", "", 1).isdigit()
            ).sum()
            if numeric_count / len(sample) > 0.6:
                inconsistent += 1

        frac_inconsistent = inconsistent / max(len(object_cols), 1)
        score = (1.0 - frac_inconsistent) * 100.0
        if inconsistent > 0:
            deductions.append(
                f"{inconsistent} column(s) appear to be numeric but stored as text."
            )
            recommendations.append(
                "Cast numeric-looking string columns to float/int before analysis."
            )
        return float(np.clip(score, 0.0, 100.0))

    @staticmethod
    def _score_variance(
        df: pd.DataFrame,
        deductions: List[str],
        recommendations: List[str],
    ) -> float:
        """
        Score 0–100: penalise low-variance numeric columns.
        Zero-variance (constant) columns score 0; high-variance scores 100.
        """
        numeric_df = df.select_dtypes(include=[np.number])
        if numeric_df.empty:
            return 50.0  # neutral if no numeric columns

        variances = numeric_df.var(ddof=1)
        n_cols = len(variances)
        # Coefficient of variation proxy: columns where std < 1% of mean
        low_var_count = int((variances < 1e-8).sum())
        score = (1.0 - low_var_count / max(n_cols, 1)) * 100.0

        if low_var_count > 0:
            deductions.append(
                f"{low_var_count} numeric column(s) are near-constant (zero variance)."
            )
            recommendations.append(
                "Remove zero-variance columns (VarianceThreshold) to reduce noise."
            )
        return float(np.clip(score, 0.0, 100.0))

    @staticmethod
    def _score_class_balance(
        df: pd.DataFrame,
        mappings: Dict[str, str],
        deductions: List[str],
        recommendations: List[str],
    ) -> float:
        """
        Score 0–100: evenness of the target/outcome/category distribution.
        Uses Shannon entropy normalised by log(n_classes).
        If no suitable column is identified, returns a neutral 60.
        """
        # Find the best categorical target column
        target_col: str = None  # type: ignore[assignment]

        # Prefer mapped outcome/category/endpoint
        preference = ["outcome", "category", "endpoint", "treatment", "group"]
        for role in preference:
            col = next((k for k, v in mappings.items() if v == role and k in df.columns), None)
            if col and df[col].dtype == object:
                target_col = col
                break

        # Fallback: first object column with 2–50 unique values
        if target_col is None:
            for col in df.select_dtypes(include=["object"]).columns:
                n = df[col].nunique()
                if 2 <= n <= 50:
                    target_col = col
                    break

        if target_col is None:
            return 60.0  # neutral — no categorical target found

        vc = df[target_col].dropna().value_counts(normalize=True)
        n_classes = len(vc)
        if n_classes <= 1:
            return 60.0

        # Shannon entropy
        entropy = -float((vc * np.log(vc + 1e-12)).sum())
        max_entropy = float(np.log(n_classes))
        evenness = entropy / max_entropy if max_entropy > 0 else 1.0

        score = evenness * 100.0
        if evenness < 0.5:
            dominant_pct = float(vc.iloc[0] * 100)
            deductions.append(
                f"Severe class imbalance in '{target_col}': "
                f"dominant class holds {dominant_pct:.0f}% of rows."
            )
            recommendations.append(
                "Apply SMOTE or class-weight adjustments for balanced training."
            )
        return float(np.clip(score, 0.0, 100.0))

    @staticmethod
    def _score_leakage_risk(
        df: pd.DataFrame,
        mappings: Dict[str, str],
        deductions: List[str],
        recommendations: List[str],
    ) -> float:
        """
        Score 0–100: 100 - (max absolute Pearson correlation between any feature
        and the target column).  High correlation ≈ potential leakage.
        If no numeric target, returns a neutral 80.
        """
        # Find a numeric target column
        target_col: str = None  # type: ignore[assignment]
        for role in ["outcome", "value", "endpoint"]:
            col = next((k for k, v in mappings.items() if v == role and k in df.columns), None)
            if col:
                numeric_target = pd.to_numeric(df[col], errors="coerce").dropna()
                if len(numeric_target) > 10:
                    target_col = col
                    break

        if target_col is None:
            return 80.0  # neutral

        target_series = pd.to_numeric(df[target_col], errors="coerce")
        numeric_features = df.select_dtypes(include=[np.number]).drop(
            columns=[target_col], errors="ignore"
        )

        if numeric_features.empty:
            return 80.0

        max_corr = 0.0
        for col in numeric_features.columns:
            try:
                r = target_series.corr(numeric_features[col])
                if pd.notna(r):
                    max_corr = max(max_corr, abs(float(r)))
            except Exception:
                continue

        score = (1.0 - max_corr) * 100.0

        if max_corr > 0.95:
            deductions.append(
                f"Possible data leakage: a feature has {max_corr:.2f} correlation with target."
            )
            recommendations.append(
                "Identify and remove columns that are direct proxy encodings of the target."
            )
        return float(np.clip(score, 0.0, 100.0))

    @staticmethod
    def _score_feature_diversity(
        df: pd.DataFrame,
        deductions: List[str],
        recommendations: List[str],
    ) -> float:
        """
        Score 0–100: diversity of column types.
        Datasets with only one dtype (e.g. all strings) score lower.
        """
        dtypes = df.dtypes
        numeric_count = int((dtypes.apply(pd.api.types.is_numeric_dtype)).sum())
        categorical_count = len(dtypes) - numeric_count
        total = len(dtypes)

        if total == 0:
            return 0.0

        # Shannon entropy over {numeric, categorical}
        p_num = numeric_count / total
        p_cat = categorical_count / total

        diversity = 0.0
        if p_num > 0:
            diversity -= p_num * np.log2(p_num)
        if p_cat > 0:
            diversity -= p_cat * np.log2(p_cat)

        # Max entropy for 2 categories = log2(2) = 1.0
        score = (diversity / 1.0) * 100.0

        if p_num == 0:
            deductions.append("Dataset contains no numeric columns; modelling potential is limited.")
            recommendations.append("Encode categorical variables numerically (OHE / label encoding).")
        elif p_cat == 0:
            deductions.append("Dataset contains only numeric columns; no categorical context.")

        return float(np.clip(score, 0.0, 100.0))

    @staticmethod
    def _score_outlier_density(
        df: pd.DataFrame,
        deductions: List[str],
        recommendations: List[str],
    ) -> float:
        """
        Score 0–100: inverse fraction of statistical outliers across numeric columns.
        Outlier = |Z-score| > 3.
        """
        numeric_df = df.select_dtypes(include=[np.number]).dropna(axis=1, how="all")
        if numeric_df.empty:
            return 80.0  # neutral

        total_cells = numeric_df.shape[0] * numeric_df.shape[1]
        if total_cells == 0:
            return 80.0

        try:
            means = numeric_df.mean()
            stds = numeric_df.std(ddof=1)
            stds_safe = stds.replace(0, np.nan).fillna(1.0)
            z_scores = ((numeric_df - means) / stds_safe).abs()
            outlier_cells = int((z_scores > 3.0).sum().sum())
        except Exception as exc:
            logger.debug(f"Outlier computation failed: {exc}")
            return 80.0

        outlier_frac = outlier_cells / total_cells
        score = (1.0 - outlier_frac) * 100.0

        if outlier_frac > 0.05:
            deductions.append(
                f"High outlier density: {outlier_frac*100:.1f}% of numeric cells are statistical outliers (|Z|>3)."
            )
            recommendations.append(
                "Investigate outliers with a box-plot and apply winsorisation or log-transform."
            )
        return float(np.clip(score, 0.0, 100.0))

    @staticmethod
    def _score_sample_adequacy(
        df: pd.DataFrame,
        deductions: List[str],
        recommendations: List[str],
    ) -> float:
        """
        Score 0–100: rows-to-features ratio (n/p).
        Optimal: n/p >= 20 → 100.  n/p < 2 → 0.
        """
        n = df.shape[0]
        p = max(df.shape[1], 1)
        ratio = n / p

        if ratio >= 20:
            score = 100.0
        elif ratio >= 10:
            score = 80.0
        elif ratio >= 5:
            score = 60.0
        elif ratio >= 2:
            score = 40.0
        else:
            score = 20.0
            deductions.append(
                f"Critically low sample-to-feature ratio: {n} rows / {p} features = {ratio:.1f}."
            )
            recommendations.append(
                "Collect more data or reduce the feature count via PCA / feature selection."
            )

        if ratio < 5:
            deductions.append(
                f"Low sample adequacy: n/p ratio is {ratio:.1f} (recommended ≥ 10)."
            )
            recommendations.append(
                "Reduce dimensionality or gather additional observations."
            )
        return float(np.clip(score, 0.0, 100.0))
