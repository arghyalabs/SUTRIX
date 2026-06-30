from fastapi import APIRouter
from typing import Dict, List
import logging
from rdkit.Chem import Descriptors

logger = logging.getLogger("sdo.backend.api.descriptor_routes")

router = APIRouter()

@router.get("/api/descriptors", response_model=Dict[str, List[str]])
def list_descriptors():
    """
    Returns a dictionary with arrays of available RDKit and Mordred descriptor names.
    """
    rdkit_descs = [name for name, _ in Descriptors._descList]
    mordred_descs = []
    try:
        import numpy
        # NumPy 2.x compatibility monkeypatch for old mordred library
        if not hasattr(numpy, "product"):
            numpy.product = numpy.prod

        import collections
        import collections.abc
        # Python 3.10+ compatibility monkeypatches for old mordred library
        collections.MutableMapping = collections.abc.MutableMapping
        collections.Iterable = collections.abc.Iterable
        collections.Sequence = collections.abc.Sequence
        collections.Mapping = collections.abc.Mapping
        collections.Callable = collections.abc.Callable
        collections.MutableSequence = collections.abc.MutableSequence

        from mordred import Calculator, descriptors
        calc = Calculator(descriptors, ignore_3D=False)
        mordred_descs = [str(d) for d in calc.descriptors]
    except Exception as e:
        logger.warning(f"Failed to load mordred descriptors for list: {e}")
        # Return an empty list if Mordred is not available
        mordred_descs = []
        
    return {
        "rdkit": rdkit_descs,
        "mordred": mordred_descs
    }

from fastapi import HTTPException
from backend.core.workspace_registry import registry

@router.get("/api/descriptors/{client_id}/pre-generation-summary")
def get_pre_generation_summary(client_id: str):
    """
    Returns a summary of the active subgroup before descriptor generation,
    including smart descriptor recommendations based on dataset size tier.
    """
    context = registry.get_context(client_id)
    
    if not getattr(context, 'subgroup_selected', False):
        raise HTTPException(
            status_code=400,
            detail="Pre-generation summary requires a selected subgroup. Complete Step 5 first."
        )
    
    # Structure state guard
    structure_state = getattr(context, 'structure_state', 'UNKNOWN')
    recovery_completed = getattr(context, 'recovery_completed', False)
    if structure_state == 'NAME_ONLY' and not recovery_completed:
        raise HTTPException(
            status_code=400,
            detail="Descriptor generation requires structures. Complete Step 7 (Chemical Structure Recovery) first."
        )
    
    try:
        df = context.load_active_dataset()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load active dataset: {e}")
    
    rows = len(df)
    
    # Compute unique compounds and SMILES availability
    mappings = getattr(context, 'mappings', {}) or {}
    role_to_col = {v: k for k, v in mappings.items()}
    chem_col = role_to_col.get('chemical_name')
    smiles_col = role_to_col.get('smiles') or role_to_col.get('canonical_smiles')
    
    if not smiles_col:
        for col in df.columns:
            if col.lower() in ['smiles', 'canonical_smiles', 'isomeric_smiles']:
                smiles_col = col
                break
    
    unique_compounds = int(df[chem_col].nunique()) if chem_col and chem_col in df.columns else rows
    
    smiles_available = 0
    smiles_coverage_pct = getattr(context, 'smiles_coverage_pct', 0.0)
    if recovery_completed:
        smiles_coverage_pct = getattr(context, 'post_recovery_coverage_pct', smiles_coverage_pct)
    
    if smiles_col and smiles_col in df.columns:
        valid = df[smiles_col].astype(str).str.strip()
        smiles_available = int((valid.notna() & (valid != '') & (valid != 'nan') & (valid != 'None')).sum())
    
    # Dataset size tier and descriptor recommendations
    if rows < 500:
        tier = "SMALL"
        recommended_engines = ["rdkit", "morgan"]
        recommended_fps = ["morgan", "maccs"]
        reason = (
            f"Small dataset ({rows:,} rows). RDKit + Morgan fingerprints provides adequate "
            f"descriptor coverage without excessive memory overhead."
        )
        estimated_descriptors = unique_compounds * 220
        estimated_memory_mb = round(unique_compounds * 0.6)
        estimated_time_minutes = max(1, round(unique_compounds * 0.002))
    elif rows <= 5000:
        tier = "MEDIUM"
        recommended_engines = ["rdkit", "mordred"]
        recommended_fps = ["morgan", "maccs", "topological"]
        reason = (
            f"Medium dataset ({rows:,} rows). RDKit + Mordred provides comprehensive "
            f"descriptor coverage. Morgan fingerprints recommended for similarity analysis."
        )
        estimated_descriptors = unique_compounds * 1820
        estimated_memory_mb = round(unique_compounds * 0.18)
        estimated_time_minutes = max(1, round(unique_compounds * 0.025))
    else:
        tier = "LARGE"
        recommended_engines = ["morgan"]
        recommended_fps = ["morgan"]
        reason = (
            f"Large dataset ({rows:,} rows). Morgan fingerprints recommended — "
            f"comprehensive descriptor generation may require significant memory. "
            f"Apply feature filtering after generation."
        )
        estimated_descriptors = unique_compounds * 2048
        estimated_memory_mb = round(unique_compounds * 0.25)
        estimated_time_minutes = max(5, round(unique_compounds * 0.05))
    
    return {
        "subgroup_name": context.subgroup_metadata.get('name', 'Active Subgroup') if hasattr(context, 'subgroup_metadata') else 'Active Subgroup',
        "rows": rows,
        "unique_compounds": unique_compounds,
        "smiles_available": smiles_available,
        "smiles_coverage_pct": smiles_coverage_pct,
        "dataset_size_tier": tier,
        "descriptor_recommendation": {
            "primary_engines": recommended_engines,
            "fingerprint_types": recommended_fps,
            "reason": reason,
            "estimated_descriptors": estimated_descriptors,
            "estimated_memory_mb": estimated_memory_mb,
            "estimated_time_minutes": estimated_time_minutes,
        }
    }
