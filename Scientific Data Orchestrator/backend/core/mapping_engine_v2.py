"""
backend/core/mapping_engine_v2.py

Authoritative Variable Matching Engine V3 for SUTRIX.
Matches raw data columns to scientific semantic ontology targets.
Integrates Layer 4.5 — Value Pattern Recognition & Multi-Signal Confidence Scoring.
"""

import re
import difflib
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import pandas as pd

from backend.core.scientific_ontology import (
    UNIVERSAL_ONTOLOGY, SCIENTIFIC_VARIABLES,
    CAS_REGEX, SMILES_HEURISTIC_REGEX, SPECIES_NOMENCLATURE_REGEX, ENDPOINT_TYPICAL_REGEX
)
from backend.core.workspace_registry import registry

@dataclass
class MappingResult:
    column: str
    mapped_to: str
    confidence: float
    layer_reached: int
    needs_user_confirmation: bool
    reasons: List[str] = field(default_factory=list)
    alternatives: List[Dict[str, Any]] = field(default_factory=list)

def is_smiles_value(val: str) -> bool:
    """Heuristic check to determine if a string represents a valid SMILES structure."""
    val = str(val).strip()
    if not val or len(val) < 3:
        return False
    # Validate typical SMILES characters
    valid_chars = set("CNOPSFIClBrH[]()=@#+-/\\1234567890%:.c_n_o_p_s_i")
    if any(c not in valid_chars for c in val):
        return False
    # Must contain at least one organic atom indicator
    if not any(a in val for a in ["C", "N", "O", "P", "S", "F", "Cl", "Br", "I", "c", "n", "o"]):
        return False
    return True

class MappingEngineV2:
    """
    MappingEngine V3 incorporating column names, actual data patterns, and statistical context.
    """
    
    def __init__(self):
        self.ontology = UNIVERSAL_ONTOLOGY

    def _get_column_series(self, col_name: str, client_id: Optional[str] = None) -> Optional[pd.Series]:
        """Tries to retrieve the actual data series from the active workspace context."""
        context = None
        if client_id:
            context = registry.get_context(client_id)
        else:
            if registry.workspaces:
                context = list(registry.workspaces.values())[0]
                
        if context:
            try:
                df = context.load_slice()
                if col_name in df.columns:
                    return df[col_name]
            except Exception:
                pass
        return None

    def evaluate_column(self, col: str, client_id: Optional[str] = None) -> MappingResult:
        col_normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
        reasons = []
        
        # 1. Fetch actual column data if available
        col_series = self._get_column_series(col, client_id)
        
        # Initialize pattern recognition ratios
        cas_ratio = 0.0
        smiles_ratio = 0.0
        species_ratio = 0.0
        endpoint_ratio = 0.0
        is_numeric = False
        
        if col_series is not None:
            is_numeric = pd.api.types.is_numeric_dtype(col_series)
            non_null = col_series.dropna().astype(str)
            if not non_null.empty:
                # CAS check
                cas_count = sum(1 for v in non_null if CAS_REGEX.match(v.strip()))
                cas_ratio = cas_count / len(non_null)
                
                # SMILES check
                smiles_count = sum(1 for v in non_null if is_smiles_value(v))
                smiles_ratio = smiles_count / len(non_null)
                
                # Species check
                species_count = sum(1 for v in non_null if SPECIES_NOMENCLATURE_REGEX.match(v.strip()))
                species_ratio = species_count / len(non_null)
                
                # Endpoint check
                endpoint_count = sum(1 for v in non_null if ENDPOINT_TYPICAL_REGEX.match(v.strip()))
                endpoint_ratio = endpoint_count / len(non_null)

        # 2. Score candidates using the three signals (Name, Pattern, Statistical Context)
        candidates = []
        for std_key, meta in SCIENTIFIC_VARIABLES.items():
            # Signal A: Column Name Score (Fuzzy match)
            best_name_score = 0.0
            
            # Match standard key
            seq = difflib.SequenceMatcher(None, col_normalized, std_key.lower())
            best_name_score = max(best_name_score, seq.ratio())
            
            # Match aliases
            for alias in meta["aliases"]:
                alias_norm = alias.lower().replace(" ", "_").replace("-", "_")
                seq = difflib.SequenceMatcher(None, col_normalized, alias_norm)
                best_name_score = max(best_name_score, seq.ratio())
                
                # Exact synapse match check
                if col_normalized == alias_norm:
                    best_name_score = max(best_name_score, 1.0)
                elif f"_{alias_norm}_" in f"_{col_normalized}_":
                    best_name_score = max(best_name_score, 0.90)
                elif col_normalized.startswith(alias_norm + "_") or col_normalized.endswith("_" + alias_norm):
                    best_name_score = max(best_name_score, 0.85)
                    
            # Signal B: Value Pattern Score
            pattern_score = 0.0
            if std_key == "cas" and cas_ratio > 0.30:
                pattern_score = 0.98
            elif std_key == "smiles" and smiles_ratio > 0.30:
                pattern_score = 0.98
            elif std_key in ("species", "organism") and species_ratio > 0.30:
                pattern_score = 0.95
            elif std_key in ("endpoint", "toxicity_endpoint") and endpoint_ratio > 0.30:
                pattern_score = 0.95
                
            # Signal C: Statistical Context Score
            stat_score = 0.5 # Default if no data context loaded
            if col_series is not None:
                category = meta.get("category", "")
                is_typically_numeric = (
                    category in ("concentration", "exposure", "physicochemical") or 
                    std_key in ("latitude", "longitude", "value")
                )
                if is_typically_numeric:
                    # Typically numeric
                    stat_score = 1.0 if is_numeric else 0.2
                else:
                    # Typically categorical (includes units, chemical identifiers, species, endpoints, etc.)
                    stat_score = 1.0 if not is_numeric else 0.2
                    
            # Compute V3 Final Weighted Score
            # If no data series is loaded, base score purely on name matching
            if col_series is None:
                final_score = best_name_score
            else:
                # Final Score = 0.4 * Column Name Score + 0.3 * Value Pattern Score + 0.3 * Statistical Context Score
                final_score = (0.4 * best_name_score) + (0.3 * pattern_score) + (0.3 * stat_score)
            
            candidates.append({
                "std_key": std_key,
                "name_score": best_name_score,
                "pattern_score": pattern_score,
                "stat_score": stat_score,
                "score": final_score
            })

        # Sort candidates by best overall score
        candidates.sort(key=lambda x: x["score"], reverse=True)

        # Gather standard key alternatives (unique standard keys, best score first)
        seen_alt = set()
        alternatives = []
        for c in candidates:
            k = c["std_key"]
            if k not in seen_alt:
                seen_alt.add(k)
                alternatives.append({
                    "mapped_to": k,
                    "confidence": round(c["score"], 2),
                    "matched_alias": k
                })
                
        best_cand = candidates[0] if candidates else None

        # Build detailed reasons
        if best_cand:
            reasons.append(f"Primary signal matches ontology '{best_cand['std_key']}' with name confidence {int(best_cand['name_score']*100)}%.")
            if best_cand['pattern_score'] > 0:
                reasons.append(f"Value patterns matching target: recognized with {int(best_cand['pattern_score']*100)}% accuracy.")
            if best_cand['stat_score'] > 0.8:
                reasons.append("Statistical context aligns with expected standard type.")

        # Determine matched layers
        layer_reached = 5
        mapped_key = "generic_variable" # Fallback to Generic instead of None
        confidence = 0.5
        
        if best_cand:
            confidence = round(best_cand["score"], 2)
            mapped_key = best_cand["std_key"]
            
            # Map unmapped or extremely low-scoring to generic_variable
            if confidence < 0.45:
                mapped_key = "generic_variable"
                reasons.append("Low overall confidence. Reclassified to UNKNOWN BUT USABLE generic_variable.")
                
            # Classify layers
            if best_cand["name_score"] >= 0.99:
                layer_reached = 1
            elif best_cand["name_score"] >= 0.90:
                layer_reached = 2
            elif best_cand["name_score"] >= 0.70:
                layer_reached = 3
            elif best_cand["pattern_score"] >= 0.90:
                layer_reached = 4 # Pattern match
            else:
                layer_reached = 5 # Semantic/statistical match

        # Filter out self from alternatives
        alts = [a for a in alternatives if a["mapped_to"] != mapped_key][:3]

        return MappingResult(
            column=col,
            mapped_to=mapped_key,
            confidence=confidence,
            layer_reached=layer_reached,
            needs_user_confirmation=confidence < 0.85,
            reasons=reasons,
            alternatives=alts
        )
