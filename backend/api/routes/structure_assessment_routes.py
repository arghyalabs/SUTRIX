"""
backend/api/routes/structure_assessment_routes.py

SUTRIX V5 — Step 6: Dataset Readiness & Structure Assessment
Classifies the active subgroup as MOLECULAR, HYBRID, or NAME_ONLY.
Computes SMILES coverage, recovery impact prediction, and recommendation.
"""

import os
import logging
import time
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException

from backend.core.workspace_registry import registry

logger = logging.getLogger("sdo.api.structure_assessment")

router = APIRouter(prefix="/api/assessment", tags=["structure-assessment"])


def _get_context_with_subgroup(client_id: str):
    """Get context, raising 400 if subgroup has not been selected."""
    context = registry.get_context(client_id)
    if not getattr(context, 'subgroup_selected', False):
        raise HTTPException(
            status_code=400,
            detail="Dataset Readiness requires a selected subgroup. Complete Step 5 (Subgroup Selection) first."
        )
    return context


def _classify_structure_state(coverage_pct: float) -> str:
    if coverage_pct >= 99.9:
        return "MOLECULAR"
    elif coverage_pct >= 50.0:
        return "HYBRID"
    else:
        return "NAME_ONLY"


def _get_recommendation(structure_state: str, coverage_pct: float) -> tuple[str, str]:
    """Returns (recommendation_code, recommendation_reason)."""
    if structure_state == "MOLECULAR":
        return (
            "proceed",
            "100% SMILES coverage detected. Descriptor generation can start immediately — no recovery needed."
        )
    elif structure_state == "HYBRID" and coverage_pct >= 70.0:
        missing_pct = 100.0 - coverage_pct
        return (
            "optional_recovery",
            f"{coverage_pct:.1f}% SMILES coverage. The missing {missing_pct:.1f}% may provide marginal improvement. "
            f"You can proceed directly to Descriptor Enrichment or optionally recover the missing structures."
        )
    elif structure_state == "HYBRID":
        missing_pct = 100.0 - coverage_pct
        return (
            "recommended_recovery",
            f"Only {coverage_pct:.1f}% SMILES coverage detected. Recovering the missing {missing_pct:.1f}% of structures "
            f"is strongly recommended to ensure adequate descriptor quality for QSAR modeling."
        )
    else:  # NAME_ONLY
        return (
            "recovery_required",
            f"SMILES coverage is {coverage_pct:.1f}% — essentially no structural data. "
            f"Descriptor generation is unavailable until structure recovery is complete. "
            f"Structure recovery is required to proceed."
        )


def _predict_post_recovery_impact(
    structures_missing: int,
    structures_available: int,
    total_unique: int,
    coverage_pct: float
) -> Dict[str, Any]:
    """Estimates the impact of running structure recovery."""
    # Assume ~85% recovery success rate from literature averages
    RECOVERY_RATE = 0.85
    estimated_recovered = int(structures_missing * RECOVERY_RATE)
    new_available = structures_available + estimated_recovered
    new_coverage = round((new_available / total_unique) * 100, 1) if total_unique > 0 else 0.0

    # Descriptor count estimation (rough: ~5.3 descriptors per compound for RDKit+Morgan)
    current_descriptors = int(structures_available * 5.3)
    predicted_descriptors = int(new_available * 5.3)

    # AI readiness delta (empirical approximation)
    base_readiness = min(95, int(coverage_pct * 0.95))
    predicted_readiness = min(95, int(new_coverage * 0.95))

    return {
        "predicted_post_recovery_coverage_pct": new_coverage,
        "predicted_recovered_compounds": estimated_recovered,
        "current_descriptors_estimate": current_descriptors,
        "predicted_post_recovery_descriptors": predicted_descriptors,
        "current_ai_readiness_estimate": base_readiness,
        "predicted_post_recovery_ai_readiness": predicted_readiness,
        "estimated_recovery_rate": RECOVERY_RATE,
    }


@router.get("/{client_id}/structure-status")
async def get_structure_status(client_id: str):
    """
    Analyzes the active subgroup dataset to classify its structural state.
    Returns SMILES coverage, classification (MOLECULAR/HYBRID/NAME_ONLY),
    recovery impact prediction, and a recommendation.
    """
    context = _get_context_with_subgroup(client_id)

    try:
        df = context.load_active_dataset()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load active dataset: {e}")

    # Identify SMILES column from mappings
    smiles_col = None
    mappings = getattr(context, 'mappings', {}) or {}
    # mappings maps user_col → role. Find role=smiles or similar.
    role_to_col = {v: k for k, v in mappings.items()}
    for candidate_role in ['smiles', 'SMILES', 'canonical_smiles', 'isomeric_smiles', 'structure']:
        if candidate_role in role_to_col:
            smiles_col = role_to_col[candidate_role]
            break
    
    # If not found via mappings, try direct column name heuristics
    if smiles_col is None:
        for col in df.columns:
            if col.lower() in ['smiles', 'canonical_smiles', 'isomeric_smiles', 'structure', 'mol']:
                smiles_col = col
                break

    # Find compound name/CAS column for unique compound count
    chem_col = role_to_col.get('chemical_name') or role_to_col.get('cas_number')
    if chem_col is None:
        for col in df.columns:
            if col.lower() in ['name', 'compound', 'chemical', 'cas', 'substance']:
                chem_col = col
                break

    total_rows = len(df)
    
    # Count unique compounds
    if chem_col and chem_col in df.columns:
        total_unique_compounds = int(df[chem_col].dropna().astype(str).str.strip().nunique())
    else:
        total_unique_compounds = total_rows  # fallback

    # Compute SMILES coverage
    if smiles_col and smiles_col in df.columns:
        smiles_series = df[smiles_col].astype(str).str.strip()
        valid_smiles_mask = smiles_series.notna() & (smiles_series != '') & (smiles_series != 'nan') & (smiles_series != 'None')
        structures_available = int(valid_smiles_mask.sum())
        
        # For unique compound SMILES coverage
        if chem_col and chem_col in df.columns:
            compound_smiles = df[[chem_col, smiles_col]].dropna(subset=[chem_col])
            compound_smiles = compound_smiles.copy()
            compound_smiles['_has_smiles'] = valid_smiles_mask.reindex(compound_smiles.index, fill_value=False)
            unique_with_smiles = compound_smiles.groupby(chem_col)['_has_smiles'].any().sum()
            structures_available_unique = int(unique_with_smiles)
        else:
            structures_available_unique = structures_available
    else:
        structures_available_unique = 0
    
    structures_missing = total_unique_compounds - structures_available_unique
    structures_missing = max(0, structures_missing)
    
    coverage_pct = round(
        (structures_available_unique / total_unique_compounds) * 100, 1
    ) if total_unique_compounds > 0 else 0.0

    # Classify
    structure_state = _classify_structure_state(coverage_pct)
    recommendation, recommendation_reason = _get_recommendation(structure_state, coverage_pct)
    impact = _predict_post_recovery_impact(
        structures_missing, structures_available_unique, total_unique_compounds, coverage_pct
    )

    # Persist to context
    context.structure_state = structure_state
    context.smiles_coverage_pct = coverage_pct
    context.total_unique_compounds = total_unique_compounds
    context.structures_available = structures_available_unique
    context.structures_missing = structures_missing
    context.touch(save_to_disk=True)

    return {
        "structure_state": structure_state,
        "smiles_column": smiles_col,
        "total_unique_compounds": total_unique_compounds,
        "structures_available": structures_available_unique,
        "structures_missing": structures_missing,
        "smiles_coverage_pct": coverage_pct,
        "dataset_rows": total_rows,
        "recommendation": recommendation,
        "recommendation_reason": recommendation_reason,
        "can_proceed_to_descriptors": structure_state in ("MOLECULAR", "HYBRID"),
        "recovery_required": structure_state == "NAME_ONLY",
        **impact,
    }


@router.get("/{client_id}/recovery-already-done")
async def check_recovery_status(client_id: str):
    """Returns whether recovery has been completed and the post-recovery coverage."""
    context = registry.get_context(client_id)
    return {
        "recovery_attempted": getattr(context, 'recovery_attempted', False),
        "recovery_completed": getattr(context, 'recovery_completed', False),
        "post_recovery_coverage_pct": getattr(context, 'post_recovery_coverage_pct', 0.0),
        "structure_state": getattr(context, 'structure_state', 'UNKNOWN'),
    }
