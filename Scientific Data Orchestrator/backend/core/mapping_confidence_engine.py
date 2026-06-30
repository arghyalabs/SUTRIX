"""
backend/core/mapping_confidence_engine.py

Orchestrates column evaluations and assigns V3 confidence scores.
Delegates to MappingEngineV2 to maintain single source of truth.
"""

from backend.core.mapping_engine_v2 import MappingEngineV2

class MappingConfidenceEngine:
    """
    Evaluates headers against the Universal Ontology and assigns AI confidence scores.
    """
    
    @staticmethod
    def evaluate_column(column_name: str) -> dict:
        """
        Returns a structured AI mapping payload.
        """
        engine = MappingEngineV2()
        res = engine.evaluate_column(column_name)
        
        return {
            "column": column_name,
            "mapped_to": res.mapped_to,
            "confidence": res.confidence,
            "confidence_score": int(res.confidence * 100),
            "exact_match": res.layer_reached == 1 or res.layer_reached == 2,
            "fuzzy_match": res.layer_reached == 3,
            "semantic_match": res.layer_reached == 4 or res.layer_reached == 5,
            "reasons": res.reasons
        }
