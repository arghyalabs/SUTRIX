import os
import sys
import unicodedata
import re

# Add parent directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Simple Python implementation of Levenshtein distance for robustness
def levenshtein_distance(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
        
    return previous_row[-1]

class ProposedFuzzyMatcher:
    @staticmethod
    def normalize_column_name(col: str) -> str:
        col = unicodedata.normalize('NFKD', col).encode('ascii', 'ignore').decode('utf-8')
        col = col.lower().strip()
        col = re.sub(r'[^a-z0-9]', ' ', col)
        col = re.sub(r'\s+', ' ', col).strip()
        return col

    @staticmethod
    def compute_similarity(source: str, target: str) -> float:
        s_norm = ProposedFuzzyMatcher.normalize_column_name(source)
        t_norm = ProposedFuzzyMatcher.normalize_column_name(target)
        
        if not s_norm or not t_norm:
            return 0.0
            
        if s_norm == t_norm:
            return 1.0
            
        # Check substring relation only for substrings of length >= 3
        # Or if it matches on a word boundary
        shorter, longer = (s_norm, t_norm) if len(s_norm) < len(t_norm) else (t_norm, s_norm)
        
        is_word_boundary = False
        words = longer.split(" ")
        if shorter in words:
            is_word_boundary = True
            
        if (len(shorter) >= 3 and shorter in longer) or is_word_boundary:
            ratio = len(shorter) / len(longer)
            # Higher score for word boundary matches
            base_score = 0.85 if is_word_boundary else 0.70
            return round(base_score + 0.14 * ratio, 2)
            
        # Check Levenshtein distance for typo detection
        dist = levenshtein_distance(s_norm, t_norm)
        max_len = max(len(s_norm), len(t_norm))
        
        # Stricter typo threshold: edit distance must be very small relative to string length
        if dist <= 1:
            return round(1.0 - (dist / max_len), 2)
        elif dist == 2 and max_len >= 6:
            return round(1.0 - (dist / max_len), 2)
            
        return 0.0

    @staticmethod
    def find_best_match(col_name: str, ontology: dict) -> tuple:
        best_key = "none"
        best_score = 0.0
        best_alias = "none"
        
        normalized_input = ProposedFuzzyMatcher.normalize_column_name(col_name)
        
        for standard_key, aliases in ontology.items():
            for alias in aliases:
                score = ProposedFuzzyMatcher.compute_similarity(normalized_input, alias)
                
                if score > best_score:
                    best_score = score
                    best_key = standard_key
                    best_alias = alias
                    
        return best_key, best_score, best_alias

# Let's test it on Reference Data columns!
from backend.core.scientific_ontology import SCIENTIFIC_VARIABLES

test_ontology = {}
for k, v in SCIENTIFIC_VARIABLES.items():
    test_ontology[k] = list(v["aliases"])

# Add route exposure to ontology
test_ontology["route"] = ["route", "route of administration", "route_of_administration", "administration route", "exposure route", "exposure_route", "admin route", "dosing route", "admin_route", "dosing_route", "oral", "dermal", "inhalation"]

columns = [
    "Substance", "Author", "Year", "OutputID", "Study", "TestType", "Species", 
    "Route", "DurationDays", "Endpoint", "qualifier", "value", "unit", "Effect", "Toxicity"
]

print("--- Test Proposed Fuzzy Matcher ---")
for col in columns:
    best_key, best_score, best_alias = ProposedFuzzyMatcher.find_best_match(col, test_ontology)
    mapped_key = best_key if best_score >= 0.50 else "none"
    print(f"Col: {col:15} -> Mapped: {mapped_key:15} (Score: {best_score:.2f}, Alias: '{best_alias}')")
