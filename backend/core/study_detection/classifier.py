import re
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Tuple

# Patterns to identify columns matching specific study types
PATTERNS = {
    "SMILES": re.compile(r'smiles|structure|formula|inchi|smarts|sdf', re.I),
    "CAS": re.compile(r'cas(_no|_num)?|registry_no', re.I),
    "CLINICAL": re.compile(r'usubjid|aedecod|subjid|arm|cohort|survival|censor|patient|subject|dose_group|visit', re.I),
    "SURVEY": re.compile(r'q\d+|question|respondent|gender|age|likert|satisfaction|agree|opinion|survey', re.I),
    "DOE": re.compile(r'factor|run(_no|_num)?|block|treatment|level|mixture|response_surface', re.I)
}

LIKERT_RESPONSES = {"agree", "disagree", "neutral", "satisfied", "unsatisfied", "strongly"}

class StudyTypeDetector:
    """
    3-Layer Study-Type Detection Engine:
    - Layer 1: Rule-Based Column & Format Heuristics
    - Layer 2: Statistical Profiling (Censoring ratios, straight-lining variance, distinct values)
    - Layer 3: Decision-Tree Classifier on Metadata Vectors
    """

    @staticmethod
    def detect(df: pd.DataFrame) -> Dict[str, Any]:
        if df.empty:
            return {
                "detected_domain": "GENERAL",
                "confidence_score": 0.0,
                "triggered_rules": ["empty_dataset"],
                "metadata": {}
            }

        # ─── Layer 1: Rule-Based Feature Extraction ───────────────────────────
        col_names = [str(c).lower() for c in df.columns]
        num_columns = len(df.columns)
        num_rows = len(df)
        
        has_smiles = False
        has_cas = False
        has_clinical = False
        has_survey = False
        has_doe = False
        
        smiles_cols = []
        clinical_cols = []
        survey_cols = []
        doe_cols = []

        # Check column names
        for col in df.columns:
            col_str = str(col).lower()
            if PATTERNS["SMILES"].search(col_str):
                has_smiles = True
                smiles_cols.append(col)
            if PATTERNS["CAS"].search(col_str):
                has_cas = True
            if PATTERNS["CLINICAL"].search(col_str):
                has_clinical = True
                clinical_cols.append(col)
            if PATTERNS["SURVEY"].search(col_str):
                has_survey = True
                survey_cols.append(col)
            if PATTERNS["DOE"].search(col_str):
                has_doe = True
                doe_cols.append(col)

        # Check values for structural formats (Layer 1 value scanning)
        smiles_val_matches = 0
        likert_val_matches = 0
        
        sample_df = df.head(100)
        for col in sample_df.columns:
            non_null = sample_df[col].dropna()
            if non_null.empty:
                continue
            
            # String columns checks
            if non_null.dtype == object or str(non_null.dtype).startswith('str'):
                sample_vals = non_null.astype(str).str.strip()
                # Check for SMILES (looks like C1=CC=CC=C1 etc.)
                smiles_pattern = re.compile(r'^C[a-zA-Z0-9\(\)\=\#\-\+\@]*$|^[a-zA-Z0-9\(\)\=\#\-\+\@]{5,}$')
                smiles_matches = sample_vals.apply(lambda x: bool(smiles_pattern.match(x))).sum()
                if smiles_matches > len(non_null) * 0.5:
                    has_smiles = True
                    smiles_val_matches += 1
                
                # Check for Likert scale responses
                likert_matches = sample_vals.apply(lambda x: x.lower() in LIKERT_RESPONSES).sum()
                if likert_matches > len(non_null) * 0.3:
                    has_survey = True
                    likert_val_matches += 1

        # ─── Layer 2: Statistical Profiling ───────────────────────────────────
        triggered_rules = []
        is_survival = False
        has_low_variance_rows = False
        is_orthogonal_doe = False

        # 1. Censoring check for clinical survival analysis
        censor_cols = [c for c in col_names if "censor" in c or "event" in c]
        if censor_cols:
            for c in censor_cols:
                # Find matching column object
                col_obj = next(col for col in df.columns if str(col).lower() == c)
                vals = df[col_obj].dropna().unique()
                if set(vals).issubset({0, 1, 0.0, 1.0}):
                    is_survival = True
                    triggered_rules.append("binary_censoring_distribution")

        # 2. Row variance for survey straight-lining
        numeric_df = df.select_dtypes(include=[np.number])
        if len(numeric_df.columns) >= 5:
            # Check row-wise variance across numeric columns
            row_vars = numeric_df.var(axis=1)
            low_var_ratio = (row_vars < 0.1).mean()
            if low_var_ratio > 0.1:  # More than 10% of rows have very low variance (straight-lining)
                has_low_variance_rows = True
                triggered_rules.append("survey_straight_lining_detected")

        # 3. Orthogonality for DOE designs
        if len(numeric_df.columns) >= 2 and len(df) < 200:
            # Check if columns have discrete balanced levels (e.g. -1, 0, 1)
            balanced_cols = 0
            for col in numeric_df.columns:
                vals = numeric_df[col].dropna().unique()
                if len(vals) in [2, 3] and set(vals).issubset({-1, 0, 1, -1.0, 0.0, 1.0}):
                    balanced_cols += 1
            if balanced_cols >= 2:
                is_orthogonal_doe = True
                triggered_rules.append("orthogonal_doe_factors_detected")

        # Compile rules
        if has_smiles: triggered_rules.append("smiles_column_heuristics")
        if has_cas: triggered_rules.append("cas_column_heuristics")
        if has_clinical: triggered_rules.append("clinical_column_heuristics")
        if has_survey: triggered_rules.append("survey_column_heuristics")
        if has_doe: triggered_rules.append("doe_column_heuristics")
        if smiles_val_matches > 0: triggered_rules.append("smiles_value_signatures")
        if likert_val_matches > 0: triggered_rules.append("likert_scale_signatures")

        # ─── Layer 3: Decision-Tree Classifier ───────────────────────────────
        # Metadata feature extraction vector
        features = {
            "num_cols": num_columns,
            "num_rows": num_rows,
            "smiles_score": (2 if has_smiles else 0) + (2 if smiles_val_matches > 0 else 0) + (1 if has_cas else 0),
            "clinical_score": (2 if has_clinical else 0) + (3 if is_survival else 0),
            "survey_score": (2 if has_survey else 0) + (2 if likert_val_matches > 0 else 0) + (2 if has_low_variance_rows else 0),
            "doe_score": (2 if has_doe else 0) + (3 if is_orthogonal_doe else 0)
        }

        # Deterministic metadata decision-tree logic:
        scores = {
            "QSAR": features["smiles_score"],
            "CLINICAL": features["clinical_score"],
            "SURVEY": features["survey_score"],
            "DOE": features["doe_score"]
        }

        max_domain = max(scores, key=scores.get)
        max_score = scores[max_domain]

        if max_score > 0:
            detected_domain = max_domain
            # Calculate a confidence score bounded between 0.0 and 1.0
            confidence_score = min(0.99, 0.40 + (max_score * 0.15))
        else:
            detected_domain = "GENERAL"
            confidence_score = 0.50

        return {
            "detected_domain": detected_domain,
            "confidence_score": round(float(confidence_score), 2),
            "triggered_rules": triggered_rules,
            "metadata": {
                "num_rows": num_rows,
                "num_cols": num_columns,
                "numeric_cols_count": len(numeric_df.columns),
                "text_cols_count": num_columns - len(numeric_df.columns),
                "features": features
            }
        }
