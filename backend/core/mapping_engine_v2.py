"""
backend/core/mapping_engine_v2.py

Authoritative 5-layer variable matching engine for SUTRIX.
Matches raw data columns to scientific semantic ontology targets.
"""

import difflib
from dataclasses import dataclass, field
from typing import List, Dict, Any
from backend.core.scientific_alias_registry import UNIVERSAL_ONTOLOGY

@dataclass
class MappingResult:
    column: str
    mapped_to: str
    confidence: float
    layer_reached: int
    needs_user_confirmation: bool
    reasons: List[str] = field(default_factory=list)
    alternatives: List[Dict[str, Any]] = field(default_factory=list)

class MappingEngineV2:
    """
    5-layer scientific variable mapping engine.
    """
    
    def __init__(self):
        # Build registry dictionary for lookup
        self.ontology = UNIVERSAL_ONTOLOGY

    def evaluate_column(self, col: str) -> MappingResult:
        col_normalized = col.lower().strip().replace(" ", "_").replace("-", "_")
        
        # Layer 1: Exact Match on standard keys
        for std_key in self.ontology.keys():
            if col_normalized == std_key.lower():
                return MappingResult(
                    column=col,
                    mapped_to=std_key,
                    confidence=1.0,
                    layer_reached=1,
                    needs_user_confirmation=False,
                    reasons=["Exact standard key match."]
                )

        # Layer 2: Synonym Match
        for std_key, aliases in self.ontology.items():
            for alias in aliases:
                alias_norm = alias.lower().replace(" ", "_").replace("-", "_")
                if col_normalized == alias_norm:
                    return MappingResult(
                        column=col,
                        mapped_to=std_key,
                        confidence=0.95,
                        layer_reached=2,
                        needs_user_confirmation=False,
                        reasons=[f"Synonym match found: '{alias}' mapping to '{std_key}'."]
                    )

        # Let's collect candidates for fuzzy/semantic matches to populate alternatives
        candidates = []
        for std_key, aliases in self.ontology.items():
            for alias in aliases:
                alias_norm = alias.lower().replace(" ", "_").replace("-", "_")
                
                # Check fuzzy score
                seq = difflib.SequenceMatcher(None, col_normalized, alias_norm)
                fuzzy_score = seq.ratio()
                
                # Check semantic/token overlap score
                col_tokens = set(col_normalized.split("_"))
                alias_tokens = set(alias_norm.split("_"))
                overlap = col_tokens.intersection(alias_tokens)
                union = col_tokens.union(alias_tokens)
                jaccard = len(overlap) / len(union) if union else 0.0
                
                semantic_score = jaccard
                if col_normalized in alias_norm or alias_norm in col_normalized:
                    semantic_score = max(semantic_score, 0.6)
                
                candidates.append({
                    "std_key": std_key,
                    "alias": alias,
                    "fuzzy_score": fuzzy_score,
                    "semantic_score": semantic_score,
                    "score": max(fuzzy_score, semantic_score)
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
                    "matched_alias": c["alias"]
                })
        
        best_cand = candidates[0] if candidates else None

        # Layer 3: Fuzzy Match (threshold >= 0.70)
        if best_cand and best_cand["fuzzy_score"] >= 0.70:
            mapped_key = best_cand["std_key"]
            confidence = round(best_cand["fuzzy_score"], 2)
            alts = [a for a in alternatives if a["mapped_to"] != mapped_key][:3]
            return MappingResult(
                column=col,
                mapped_to=mapped_key,
                confidence=confidence,
                layer_reached=3,
                needs_user_confirmation=confidence < 0.85,
                reasons=[f"Fuzzy match '{best_cand['alias']}' is similar to '{col}'."],
                alternatives=alts
            )

        # Layer 4: AI Semantic Match (threshold >= 0.55)
        if best_cand and best_cand["semantic_score"] >= 0.55:
            mapped_key = best_cand["std_key"]
            confidence = round(best_cand["semantic_score"], 2)
            alts = [a for a in alternatives if a["mapped_to"] != mapped_key][:3]
            return MappingResult(
                column=col,
                mapped_to=mapped_key,
                confidence=confidence,
                layer_reached=4,
                needs_user_confirmation=True,
                reasons=[f"Semantic token overlap match with '{best_cand['alias']}'."],
                alternatives=alts
            )

        # Layer 5: Fallback User Confirmation (low or 0 confidence)
        mapped_key = best_cand["std_key"] if best_cand else "none"
        confidence = round(best_cand["score"], 2) if best_cand else 0.0
        alts = [a for a in alternatives if a["mapped_to"] != mapped_key][:3] if best_cand else []
        return MappingResult(
            column=col,
            mapped_to=mapped_key,
            confidence=confidence,
            layer_reached=5,
            needs_user_confirmation=True,
            reasons=["No confident automatic match found. Please confirm mapping."],
            alternatives=alts
        )
