"""
backend/core/recovery_eta_engine.py

Calculates per-source retrieval rates and time estimates for chemical structure recovery.
"""

from typing import List, Dict

class RecoveryETAEngine:
    # Empirical API limits (requests per minute) per source
    RATES = {
        "pubchem": 45,    # PubChem allows ~5 req/sec safely
        "chembl": 30,     # ChEMBL is slightly slower
        "comptox": 20,    # EPA CompTox rate limiting is tighter
    }
    
    @staticmethod
    def estimate(unique_count: int, cached_count: int, sources: List[str]) -> dict:
        to_fetch = max(0, unique_count - cached_count)
        
        estimates_per_source = {}
        for source in sources:
            rate = RecoveryETAEngine.RATES.get(source.lower(), 25)
            # Calculate estimated minutes
            est_min = round(to_fetch / rate, 1) if rate > 0 else 0.0
            
            hours = int(est_min // 60)
            minutes = int(est_min % 60)
            if hours > 0:
                display = f"{hours}h {minutes}m"
            else:
                display = f"{minutes}m" if minutes > 0 else "under a minute"
                
            estimates_per_source[source] = {
                "rate_per_min": rate,
                "estimated_minutes": est_min,
                "estimated_display": display
            }
            
        return {
            "unique_compounds": unique_count,
            "cached_already": cached_count,
            "to_fetch": to_fetch,
            "estimates_per_source": estimates_per_source
        }
