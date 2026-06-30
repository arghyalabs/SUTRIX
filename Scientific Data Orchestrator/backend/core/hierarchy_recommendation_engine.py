# -----------------------------------------------------------------------------
# Scientific Data Orchestrator (SDO) — Hierarchy Recommendation Engine
# Computes information gain and ontology-guided hierarchy suggestions.
# -----------------------------------------------------------------------------
"""
backend/core/hierarchy_recommendation_engine.py

Uses Information Gain (Shannon entropy), cardinality, missingness, and
scientific relevance to score and rank dataset columns for hierarchical segregation.
Works for both MOLECULAR and SCIENTIFIC modes.
"""

import math
import logging
from dataclasses import dataclass, asdict
from typing import List, Dict, Any
import pandas as pd
import numpy as np

logger = logging.getLogger("sdo.core.hierarchy_recommendation")

@dataclass
class HierarchyRecommendation:
    """Represents a recommended column split in the hierarchy builder."""
    column: str
    score: float          # 0–100
    rank: int
    info_gain: float      # Shannon entropy
    cardinality: int      # unique non-null values
    missing_pct: float
    reason: str

class HierarchyRecommendationEngine:
    """
    Stateless scorer that recommends columns for building the hierarchy tree.
    Combines information theory (entropy) and scientific ontology context.
    """

    @staticmethod
    def recommend(
        df: pd.DataFrame,
        mappings: Dict[str, str],
        dataset_mode: str,
        n: int = 5
    ) -> List[HierarchyRecommendation]:
        """
        Rank the columns of the DataFrame based on their utility as hierarchy nodes.

        Parameters
        ----------
        df:
            The dataset to evaluate.
        mappings:
            Column → scientific-role mapping dict.
        dataset_mode:
            "MOLECULAR" | "SCIENTIFIC" | "HYBRID"
        n:
            Maximum number of recommendations to return.

        Returns
        -------
        List[HierarchyRecommendation]
        """
        if df is None or df.empty:
            return []

        recommendations: List[HierarchyRecommendation] = []
        total_rows = len(df)

        # Ignore columns that are unique chemical identifiers or high-cardinality ID keys
        priority_identifier_roles = {
            "canonical_smiles", "smiles", "cas_number", "chemical_id", "chemical_name",
            "entity_id", "entity_name", "patient_id", "subject_id", "participant_id",
            "sample_id", "material_id", "device_id"
        }

        # Filter candidate columns
        candidates = []
        for col in df.columns:
            role = mappings.get(col, "none")
            if role in priority_identifier_roles:
                continue
            
            # Avoid compound-like column name patterns
            col_lower = str(col).lower()
            if any(x in col_lower for x in ["smiles", "cas_", "inchi", "structure", "id", "uuid"]):
                if role == "none":
                    continue
            
            candidates.append(col)

        for col in candidates:
            # Drop nulls and count unique values
            non_null_series = df[col].dropna()
            cardinality = non_null_series.nunique()
            
            # Columns with 0 or 1 unique values cannot segment the dataset
            if cardinality < 2 or total_rows == 0:
                continue

            # Compute missingness percentage
            missing_count = total_rows - len(non_null_series)
            missing_pct = round((missing_count / total_rows) * 100, 2)

            # ── 1. Calculate Shannon Entropy (Information Gain Proxy) ──────────
            vc = non_null_series.value_counts()
            entropy = 0.0
            for count in vc.values:
                p = count / len(non_null_series)
                if p > 0:
                    entropy -= p * math.log2(p)

            # Normalise entropy (evenness): 0 to 1
            max_entropy = math.log2(cardinality)
            evenness = (entropy / max_entropy) if max_entropy > 0 else 1.0

            # ── 2. Calculate Scoring Components ───────────────────────────────
            # A. Entropy Contribution (max 30 points): even splits are preferred
            entropy_score = evenness * 30.0

            # B. Cardinality Score (max 20 points): optimal is 2 to 12 groups
            if 2 <= cardinality <= 8:
                cardinality_score = 20.0
            elif 9 <= cardinality <= 15:
                cardinality_score = 15.0
            elif 16 <= cardinality <= 30:
                cardinality_score = 10.0
            else:  # High cardinality causes massive fragmentation
                cardinality_score = max(0.0, 20.0 - (cardinality - 30) * 0.2)

            # C. Missingness Penalty (max 20 points): low missingness is preferred
            missing_score = max(0.0, (1.0 - (missing_pct / 100.0)) * 20.0)

            # D. Scientific Ontology Boost (max 30 points)
            role = mappings.get(col, "none")
            ontology_score = 0.0
            reasons = []

            if dataset_mode == "SCIENTIFIC":
                scientific_priority = {
                    "category": 30.0, "group": 30.0, "treatment": 25.0,
                    "site_id": 20.0, "location": 20.0, "region": 20.0,
                    "department": 15.0, "outcome": 15.0
                }
            else: # MOLECULAR/HYBRID
                scientific_priority = {
                    "study_type": 30.0, "toxicity_category": 30.0, "species": 25.0,
                    "organism": 25.0, "endpoint": 20.0, "duration": 15.0, "exposure_time": 15.0
                }

            if role in scientific_priority:
                ontology_score = scientific_priority[role]
                reasons.append(f"Highly relevant scientific role '{role}' mapped.")
            elif role != "none":
                ontology_score = 10.0
                reasons.append(f"Standard ontology field '{role}' mapped.")
            else:
                # Deduce role importance from column names
                col_clean = col_lower.replace("_", " ").strip()
                if "species" in col_clean or "organism" in col_clean or "taxa" in col_clean:
                    ontology_score = 20.0
                    reasons.append("Column name strongly indicates species/biological model.")
                elif "endpoint" in col_clean or "effect" in col_clean:
                    ontology_score = 20.0
                    reasons.append("Column name strongly indicates assay endpoint.")
                elif "duration" in col_clean or "time" in col_clean or "hour" in col_clean:
                    ontology_score = 15.0
                    reasons.append("Column name suggests exposure duration/time dimension.")
                elif "treatment" in col_clean or "group" in col_clean or "category" in col_clean:
                    ontology_score = 15.0
                    reasons.append("Column name indicates grouping or treatment variable.")

            # Combine scores
            final_score = round(entropy_score + cardinality_score + missing_score + ontology_score, 1)

            # Generate descriptive reason
            if not reasons:
                if evenness > 0.8:
                    reasons.append("Well-distributed data groups suitable for branching.")
                else:
                    reasons.append("Offers basic categorical splits.")
            
            if missing_pct > 15.0:
                reasons.append(f"Note: Muted by {missing_pct:.0f}% missing values.")

            reason_str = " ".join(reasons)

            recommendations.append(
                HierarchyRecommendation(
                    column=col,
                    score=float(np.clip(final_score, 0.0, 100.0)),
                    rank=0, # set after sorting
                    info_gain=round(entropy, 3),
                    cardinality=cardinality,
                    missing_pct=missing_pct,
                    reason=reason_str
                )
            )

        # Sort by score descending
        recommendations.sort(key=lambda r: r.score, reverse=True)
        
        # Assign rank and take top n
        for idx, rec in enumerate(recommendations):
            rec.rank = idx + 1

        return recommendations[:n]
