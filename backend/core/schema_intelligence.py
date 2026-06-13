from typing import List, Dict, Any
from backend.core.mapping_engine_v2 import MappingEngineV2
from backend.core.ecotox.ecotox_classifier import EcotoxClassifier

class SchemaIntelligenceEngine:
    """
    Top-level API interface that orchestrates the detection sequence across all columns.
    Enriched with Ecotoxicology & Regulatory Toxicology Ontology overlay mappings.
    Now utilizes MappingEngineV2 for 5-layer matching.
    """
    
    @staticmethod
    def infer_schema(columns: List[str], client_id: Optional[str] = None) -> List[Dict[str, Any]]:
        from typing import Optional
        inferred_mappings = []
        engine = MappingEngineV2()
        
        # Translation map to normalize internal keys to canonical backend keys
        translation_map = {
            "smiles": "canonical_smiles",
            "inchi": "canonical_smiles",
            "inchikey": "canonical_smiles",
            "molfile": "canonical_smiles",
            "sdf": "canonical_smiles",
            "organism": "species",
            "taxon": "species",
            "test_species": "species",
            "host_species": "species",
            "exposed_species": "species",
            "target_species": "species",
            "exposure_duration": "duration",
            "exposure_time": "duration",
            "contact_time": "duration",
            "observation_period": "duration",
            "treatment_duration": "duration",
            "exposure_route": "route",
            "concentration": "value",
            "dose": "value",
            "administered_dose": "value",
            "exposure_concentration": "value",
            "test_concentration": "value",
            "pxc50": "value",
            "regression_target": "value",
            "pic50": "value",
            "potency": "value",
            "ic50": "value",
            "ec50": "value",
            "ki": "value",
        }
        
        for col in columns:
            # 1. Base mapping confidence from V2 engine
            res = engine.evaluate_column(col, client_id)
            
            # Form dict with backward-compatible shape + new fields
            mapping_result = {
                "column": col,
                "mapped_to": translation_map.get(res.mapped_to, res.mapped_to),
                "confidence": res.confidence,
                "confidence_score": int(res.confidence * 100),
                "exact_match": res.layer_reached == 1 or res.layer_reached == 2,
                "fuzzy_match": res.layer_reached == 3,
                "semantic_match": res.layer_reached == 4,
                "layer_reached": res.layer_reached,
                "needs_user_confirmation": res.needs_user_confirmation,
                "alternatives": [
                    {**alt, "mapped_to": translation_map.get(alt["mapped_to"], alt["mapped_to"])}
                    for alt in res.alternatives
                ],
                "reasons": res.reasons
            }
            
            # 2. Advanced Ecotox / Regulatory Classification Overlay
            ecotox_intel = EcotoxClassifier.classify(col)
            
            # Expose ecotox payload to the React frontend
            mapping_result["ecotox"] = ecotox_intel
            
            # If Ecotox found a strong endpoint, it might override a weak base mapping
            if ecotox_intel["endpoint"] and mapping_result["confidence"] < 0.8:
                # Ecotox found a high-value endpoint inside a messy string
                mapping_result["mapped_to"] = "endpoint"
                mapping_result["confidence"] = max(mapping_result["confidence"], ecotox_intel["confidence"])
                mapping_result["confidence_score"] = int(mapping_result["confidence"] * 100)
                
            # Merge reasons
            for r in ecotox_intel["reasons"]:
                if r not in mapping_result["reasons"]:
                    mapping_result["reasons"].append(r)
                
            inferred_mappings.append(mapping_result)
            
        return inferred_mappings
