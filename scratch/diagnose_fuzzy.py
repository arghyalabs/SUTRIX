import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.fuzzy_matcher import FuzzyMatcher
from backend.core.scientific_ontology import UNIVERSAL_ONTOLOGY

for col in ["Author", "Year", "OutputID", "Route"]:
    clean_name = FuzzyMatcher.normalize_column_name(col)
    best_key = "none"
    best_score = 0.0
    matched_alias = None
    
    for standard_key, aliases in UNIVERSAL_ONTOLOGY.items():
        for alias in aliases:
            score = FuzzyMatcher.compute_similarity(clean_name, alias)
            if score > best_score:
                best_score = score
                best_key = standard_key
                matched_alias = alias
                
    print(f"Col: {col} -> Mapped to: {best_key} with score {best_score:.4f} (Matched alias: '{matched_alias}')")
