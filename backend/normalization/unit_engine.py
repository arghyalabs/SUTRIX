"""
SUTRIX V6 — Unit Harmonization Engine
Core scientific logic for unit detection, conversion, and quality checks.
"""
import re
import math
import logging
from typing import Dict, List, Optional, Any, Tuple
import pandas as pd
import numpy as np

from rdkit import Chem
from rdkit.Chem import Descriptors
from backend.normalization.formula_parser import parse_formula_weight, ATOMIC_WEIGHTS
from backend.cache.structure_cache import global_cache
from backend.database.manager import DatabaseManager

logger = logging.getLogger("sdo.normalization.unit_engine")

# ─── Unit Pattern Registry ────────────────────────────────────────────────────
# Maps unit string → canonical unit label
UNIT_ALIASES: Dict[str, str] = {
    # Concentration — mass/volume
    "mg/l": "mg/L", "mg/L": "mg/L", "mgl": "mg/L", "mg l-1": "mg/L",
    "ug/l": "µg/L", "µg/l": "µg/L", "µg/L": "µg/L", "ug/L": "µg/L", "mcg/l": "µg/L",
    "ng/l": "ng/L", "ng/L": "ng/L",
    "ppm": "mg/L",  # in aqueous ecotox, ppm is equivalent to mg/L
    "ppb": "µg/L",  # in aqueous ecotox, ppb is equivalent to µg/L
    
    # Concentration — molar
    "mol/l": "mol/L", "mol/L": "mol/L", "m": "mol/L",
    "mmol/l": "mmol/L", "mmol/L": "mmol/L", "mm": "mmol/L",
    "umol/l": "µmol/L", "µmol/l": "µmol/L", "µmol/L": "µmol/L", "um": "µmol/L", "µm": "µmol/L",
    "nmol/l": "nmol/L", "nmol/L": "nmol/L", "nm": "nmol/L",
    
    # Concentration — solid/mass
    "mg/kg": "mg/kg",
    "ug/kg": "µg/kg", "µg/kg": "µg/kg",
    "ng/kg": "ng/kg",
    "%": "%",
    
    # Time
    "h": "hours", "hr": "hours", "hours": "hours", "hour": "hours",
    "d": "days", "day": "days", "days": "days",
    "w": "weeks", "wk": "weeks", "weeks": "weeks",
    "mo": "months", "months": "months",
    
    # Temperature
    "c": "°C", "°c": "°C", "celsius": "°C",
    "k": "K", "kelvin": "K",
    
    # pH
    "ph": "pH",
}

# Column name patterns that suggest a unit
COLUMN_NAME_PATTERNS: List[Tuple[re.Pattern, str, int]] = [
    (re.compile(r'lc50|ec50|ic50|noec|loec|ld50', re.I), 'mg/L', 20),
    (re.compile(r'p(lc|ec|ic)50', re.I), 'µmol/L', 20),
    (re.compile(r'conc|concentration', re.I), 'mg/L', 10),
    (re.compile(r'dose', re.I), 'mg/kg', 10),
    (re.compile(r'time|duration|exposure', re.I), 'hours', 15),
    (re.compile(r'temp|temperature', re.I), '°C', 20),
    (re.compile(r'ph\b', re.I), 'pH', 25),
    (re.compile(r'mw|mol.*wt|molecular.*weight', re.I), 'g/mol', 25),
]

# Inline synonym registry of common toxicology compounds for instant offline resolving
COMMON_COMPOUND_DICTIONARY = {
    "aspirin": {"smiles": "CC(=O)OC1=CC=CC=C1C(=O)O", "cas": "50-78-2", "name": "Aspirin"},
    "caffeine": {"smiles": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", "cas": "58-08-2", "name": "Caffeine"},
    "bisphenol a": {"smiles": "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1", "cas": "80-05-7", "name": "Bisphenol A"},
    "bpa": {"smiles": "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1", "cas": "80-05-7", "name": "Bisphenol A"},
    "atrazine": {"smiles": "CCNc1nc(Cl)nc(NC(C)C)n1", "cas": "1912-24-9", "name": "Atrazine"},
    "paracetamol": {"smiles": "CC(=O)Nc1ccc(O)cc1", "cas": "103-90-2", "name": "Paracetamol"},
    "acetaminophen": {"smiles": "CC(=O)Nc1ccc(O)cc1", "cas": "103-90-2", "name": "Paracetamol"},
    "copper sulfate": {"smiles": "[Cu+2].[O-]S(=O)(=O)[O-]", "cas": "7758-98-7", "name": "Copper sulfate"},
    "benzene": {"smiles": "c1ccccc1", "cas": "71-43-2", "name": "Benzene"},
    "water": {"smiles": "O", "cas": "7732-18-5", "name": "Water"},
    "phenol": {"smiles": "Oc1ccccc1", "cas": "108-95-2", "name": "Phenol"},
    "ibuprofen": {"smiles": "CC(C)Cc1ccc(C(C)C(=O)O)cc1", "cas": "15687-27-1", "name": "Ibuprofen"},
    "lead nitrate": {"smiles": "[Pb+2].[O-][N+](=O)[O-].[O-][N+](=O)[O-]", "cas": "10099-74-8", "name": "Lead nitrate"},
    "sodium chloride": {"smiles": "[Na+].[Cl-]", "cas": "7647-14-5", "name": "Sodium chloride"}
}


# Endpoint canonical name mapping
ENDPOINT_CANONICAL: Dict[str, str] = {
    r'(96.?h|96.?hr|96.?hour).*lc50|lc50.*96': 'LC50_Fish_96h',
    r'(48.?h|48.?hr).*lc50|lc50.*48': 'LC50_Fish_48h',
    r'(24.?h|24.?hr).*lc50|lc50.*24': 'LC50_Fish_24h',
    r'(48.?h|48.?hr).*ec50|ec50.*48.*daph': 'EC50_Daphnia_48h',
    r'(24.?h|24.?hr).*ec50|ec50.*24.*daph': 'EC50_Daphnia_24h',
    r'\bec50\b': 'EC50',
    r'\blc50\b': 'LC50',
    r'\bic50\b': 'IC50',
    r'\bld50\b': 'LD50',
    r'\bnoec\b': 'NOEC',
    r'\bloec\b': 'LOEC',
    r'\bnoael\b': 'NOAEL',
    r'\bloael\b': 'LOAEL',
}

# Species canonical name mapping
SPECIES_CANONICAL: Dict[str, str] = {
    'danio rerio': 'Danio rerio', 'zebrafish': 'Danio rerio', 'zebra fish': 'Danio rerio',
    'fathead minnow': 'Pimephales promelas', 'pimephales promelas': 'Pimephales promelas',
    'rainbow trout': 'Oncorhynchus mykiss', 'oncorhynchus mykiss': 'Oncorhynchus mykiss',
    'medaka': 'Oryzias latipes', 'oryzias latipes': 'Oryzias latipes',
    'bluegill': 'Lepomis macrochirus', 'lepomis macrochirus': 'Lepomis macrochirus',
    'daphnia magna': 'Daphnia magna', 'daphnia': 'Daphnia magna', 'd. magna': 'Daphnia magna',
    'water flea': 'Daphnia magna', 'artemia': 'Artemia salina', 'brine shrimp': 'Artemia salina',
    'selenastrum capricornutum': 'Raphidocelis subcapitata',
    'pseudokirchneriella subcapitata': 'Raphidocelis subcapitata',
    'raphidocelis subcapitata': 'Raphidocelis subcapitata', 'green algae': 'Raphidocelis subcapitata',
    'chlamydomonas reinhardtii': 'Chlamydomonas reinhardtii',
    'rat': 'Rattus norvegicus', 'rattus norvegicus': 'Rattus norvegicus',
    'mouse': 'Mus musculus', 'mus musculus': 'Mus musculus',
    'rabbit': 'Oryctolagus cuniculus', 'dog': 'Canis lupus familiaris', 'human': 'Homo sapiens',
    'earthworm': 'Eisenia fetida', 'eisenia fetida': 'Eisenia fetida',
}


class UnitEngine:
    """Advanced Compound-Aware Unit Harmonization and Normalization Engine."""

    # ─── Unit Normalization Helpers ──────────────────────────────────────────

    @staticmethod
    def normalize_unit_string(u: str) -> str:
        if not u or not isinstance(u, str):
            return "Unknown"
        u_clean = u.strip().lower()
        # Direct check
        if u_clean in UNIT_ALIASES:
            return UNIT_ALIASES[u_clean]
        # Regex or clean matching
        u_sub = u_clean.replace(" ", "").replace("_", "/")
        if u_sub in UNIT_ALIASES:
            return UNIT_ALIASES[u_sub]
        return u

    @staticmethod
    def get_unit_category(u: str) -> Optional[str]:
        u = UnitEngine.normalize_unit_string(u)
        if u in ['mg/L', 'µg/L', 'ng/L']:
            return 'mass'
        if u in ['mol/L', 'mmol/L', 'µmol/L', 'nmol/L']:
            return 'molar'
        if u in ['mg/kg', 'µg/kg', 'ng/kg', '%']:
            return 'solid'
        if u.lower() in ['plc50', 'pec50', 'pic50', 'pkd', 'pki']:
            return 'log_molar'
        return None

    # ─── Unit Context Parser ──────────────────────────────────────────────────

    @staticmethod
    def parse_unit_from_string(s: str) -> Optional[str]:
        """Extracts and canonicalizes a unit suffix or word within a string."""
        if not s or not isinstance(s, str):
            return None
        s_lower = s.lower().replace("_", "/").replace(" ", "")
        
        # Priority checking standard suffixes
        for alias, canonical in UNIT_ALIASES.items():
            alias_clean = alias.lower().replace("/", "")
            s_clean = s_lower.replace("/", "")
            if alias_clean in s_clean:
                # Extra check to ensure it doesn't match a fragment (like 'm' in 'temperature')
                if len(alias_clean) > 2 or alias_clean == s_clean[-len(alias_clean):]:
                    return canonical
        return None

    @staticmethod
    def detect_row_unit(row: pd.Series, val_col: Optional[str], unit_col: Optional[str], endpoint_col: Optional[str]) -> str:
        """
        Parses mixed unit context for a single row from value text, unit column,
        endpoint text, or column header.
        """
        # 1. Parse value cell string (e.g. "0.45 mg/L")
        if val_col and val_col in row.index:
            val_cell = row[val_col]
            if isinstance(val_cell, str):
                match = re.match(r'^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*([a-zA-Zµ°C%/-]+[0-9-]*)\s*$', val_cell)
                if match:
                    unit_candidate = match.group(1)
                    canonical = UnitEngine.normalize_unit_string(unit_candidate)
                    if canonical != "Unknown":
                        return canonical

        # 2. Check mapped/detected unit column
        if unit_col and unit_col in row.index:
            unit_val = str(row[unit_col]).strip()
            canonical = UnitEngine.normalize_unit_string(unit_val)
            if canonical != "Unknown":
                return canonical

        # 3. Check endpoint cell value (e.g. "LC50_ppm", "EC50_ug_L")
        if endpoint_col and endpoint_col in row.index:
            endpoint_val = row[endpoint_col]
            if isinstance(endpoint_val, str):
                canonical = UnitEngine.parse_unit_from_string(endpoint_val)
                if canonical:
                    return canonical

        # 4. Check column name header directly
        if val_col:
            canonical = UnitEngine.parse_unit_from_string(val_col)
            if canonical:
                return canonical

        return "Unknown"

    # ─── Compound & MW Priority Resolution ─────────────────────────────────────

    @staticmethod
    def resolve_row_compound_and_mw(row: pd.Series, chem_col: Optional[str], cas_col: Optional[str],
                                    smiles_col: Optional[str], inchi_col: Optional[str],
                                    formula_col: Optional[str]) -> Dict[str, Any]:
        """
        Resolves compound structure and molecular weight offline using the priority hierarchy:
        SMILES -> InChI -> InChIKey -> Formula -> CAS -> IUPAC -> Name -> Synonym Dictionary -> Unresolved
        """
        # 1. SMILES
        if smiles_col and smiles_col in row.index and pd.notna(row[smiles_col]):
            smiles_val = str(row[smiles_col]).strip()
            if smiles_val and smiles_val.lower() not in ('nan', 'none', ''):
                try:
                    mol = Chem.MolFromSmiles(smiles_val)
                    if mol:
                        mw = Descriptors.MolWt(mol)
                        canonical = Chem.MolToSmiles(mol, isomericSmiles=True, canonical=True)
                        formula = Chem.rdMolDescriptors.CalcMolFormula(mol)
                        # Sync identity cache
                        global_cache.put(smiles_val, {"smiles": canonical, "molecular_weight": mw, "source": "SMILES", "confidence": 1.0}, "smiles")
                        return {"mw": round(mw, 4), "mw_source": "SMILES", "confidence": "High", "structure": canonical, "compound_name": smiles_val, "formula": formula}
                except Exception:
                    pass

        # 2. InChI
        if inchi_col and inchi_col in row.index and pd.notna(row[inchi_col]):
            inchi_val = str(row[inchi_col]).strip()
            if inchi_val and inchi_val.lower().startswith("inchi="):
                try:
                    mol = Chem.MolFromInchi(inchi_val)
                    if mol:
                        mw = Descriptors.MolWt(mol)
                        canonical = Chem.MolToSmiles(mol, isomericSmiles=True, canonical=True)
                        formula = Chem.rdMolDescriptors.CalcMolFormula(mol)
                        global_cache.put(inchi_val, {"smiles": canonical, "molecular_weight": mw, "source": "InChI", "confidence": 1.0}, "inchi")
                        return {"mw": round(mw, 4), "mw_source": "InChI", "confidence": "High", "structure": canonical, "compound_name": inchi_val, "formula": formula}
                except Exception:
                    pass

        # 3. Formula
        if formula_col and formula_col in row.index and pd.notna(row[formula_col]):
            formula_val = str(row[formula_col]).strip()
            if formula_val and formula_val.lower() not in ('nan', 'none', ''):
                try:
                    mw = parse_formula_weight(formula_val)
                    return {"mw": round(mw, 4), "mw_source": "Formula", "confidence": "High", "structure": None, "compound_name": formula_val, "formula": formula_val}
                except Exception:
                    pass

        # 4. CAS Number
        if cas_col and cas_col in row.index and pd.notna(row[cas_col]):
            cas_val = str(row[cas_col]).strip()
            if cas_val and cas_val.lower() not in ('nan', 'none', ''):
                clean_cas = cas_val.replace(" ", "")
                # A. Check synonym dictionary
                for entry in COMMON_COMPOUND_DICTIONARY.values():
                    if entry["cas"] == clean_cas:
                        try:
                            mol = Chem.MolFromSmiles(entry["smiles"])
                            if mol:
                                mw = Descriptors.MolWt(mol)
                                formula = Chem.rdMolDescriptors.CalcMolFormula(mol)
                                return {"mw": round(mw, 4), "mw_source": "Common Name Dictionary", "confidence": "Low", "structure": entry["smiles"], "compound_name": entry["name"], "formula": formula}
                        except Exception:
                            pass

                # B. Check global structure cache
                cached = global_cache.get(cas_val, "cas")
                if cached and cached.get("smiles"):
                    try:
                        mol = Chem.MolFromSmiles(cached["smiles"])
                        if mol:
                            mw = Descriptors.MolWt(mol)
                            formula = Chem.rdMolDescriptors.CalcMolFormula(mol)
                            return {"mw": round(mw, 4), "mw_source": "CAS Cache", "confidence": "Medium", "structure": cached["smiles"], "compound_name": cas_val, "formula": formula}
                    except Exception:
                        pass

                # C. Check sutrix_science compound_registry
                try:
                    db_hit = DatabaseManager.get_compound_by_identifier(cas_val)
                    if db_hit and db_hit.get("compound"):
                        comp = db_hit["compound"]
                        if comp.canonical_smiles:
                            mol = Chem.MolFromSmiles(comp.canonical_smiles)
                            if mol:
                                mw = Descriptors.MolWt(mol)
                                formula = comp.molecular_formula or Chem.rdMolDescriptors.CalcMolFormula(mol)
                                return {"mw": round(mw, 4), "mw_source": "CAS Cache", "confidence": "Medium", "structure": comp.canonical_smiles, "compound_name": comp.compound_name or cas_val, "formula": formula}
                        if comp.molecular_weight:
                            return {"mw": round(comp.molecular_weight, 4), "mw_source": "CAS Cache", "confidence": "Medium", "structure": None, "compound_name": comp.compound_name or cas_val, "formula": comp.molecular_formula}
                except Exception:
                    pass

        # 5. Chemical Name / Common Name
        if chem_col and chem_col in row.index and pd.notna(row[chem_col]):
            name_val = str(row[chem_col]).strip()
            if name_val and name_val.lower() not in ('nan', 'none', ''):
                clean_name = name_val.lower()
                # A. Check synonym dictionary
                if clean_name in COMMON_COMPOUND_DICTIONARY:
                    entry = COMMON_COMPOUND_DICTIONARY[clean_name]
                    try:
                        mol = Chem.MolFromSmiles(entry["smiles"])
                        if mol:
                            mw = Descriptors.MolWt(mol)
                            formula = Chem.rdMolDescriptors.CalcMolFormula(mol)
                            return {"mw": round(mw, 4), "mw_source": "Common Name Dictionary", "confidence": "Low", "structure": entry["smiles"], "compound_name": entry["name"], "formula": formula}
                    except Exception:
                        pass

                # B. Check global structure cache
                cached = global_cache.get(name_val, "name")
                if cached and cached.get("smiles"):
                    try:
                        mol = Chem.MolFromSmiles(cached["smiles"])
                        if mol:
                            mw = Descriptors.MolWt(mol)
                            formula = Chem.rdMolDescriptors.CalcMolFormula(mol)
                            return {"mw": round(mw, 4), "mw_source": "Name Cache", "confidence": "Medium", "structure": cached["smiles"], "compound_name": name_val, "formula": formula}
                    except Exception:
                        pass

                # C. Check sutrix_science compound_registry
                try:
                    db_hit = DatabaseManager.get_compound_by_identifier(name_val)
                    if db_hit and db_hit.get("compound"):
                        comp = db_hit["compound"]
                        if comp.canonical_smiles:
                            mol = Chem.MolFromSmiles(comp.canonical_smiles)
                            if mol:
                                mw = Descriptors.MolWt(mol)
                                formula = comp.molecular_formula or Chem.rdMolDescriptors.CalcMolFormula(mol)
                                return {"mw": round(mw, 4), "mw_source": "Name Cache", "confidence": "Medium", "structure": comp.canonical_smiles, "compound_name": comp.compound_name or name_val, "formula": formula}
                        if comp.molecular_weight:
                            return {"mw": round(comp.molecular_weight, 4), "mw_source": "Name Cache", "confidence": "Medium", "structure": None, "compound_name": comp.compound_name or name_val, "formula": comp.molecular_formula}
                except Exception:
                    pass

        # 6. Unresolved
        lbl = "Unknown"
        if chem_col and chem_col in row.index and pd.notna(row[chem_col]):
            lbl = str(row[chem_col]).strip()
        elif cas_col and cas_col in row.index and pd.notna(row[cas_col]):
            lbl = str(row[cas_col]).strip()

        return {"mw": None, "mw_source": "Missing", "confidence": "Failed", "structure": None, "compound_name": lbl, "formula": None}

    # ─── Endpoint Safety Verification ──────────────────────────────────────────

    @staticmethod
    def validate_endpoint_conversion(endpoint: str, from_unit: str, to_unit: str) -> Tuple[bool, str, str]:
        """
        Validates if conversion is feasible and safe for the given endpoint.
        Returns (is_allowed, category, message).
        """
        ep_lower = str(endpoint).lower().strip()
        
        # Forbidden endpoints
        forbidden_keywords = ['mortality %', 'mortality', 'behavior score', 'behavior', 'score', 'noec class', 'categorical', '%', 'percent']
        if any(k in ep_lower for k in forbidden_keywords):
            return False, "forbidden", f"Endpoint '{endpoint}' represents mortality, behavior, or categorical score. Molar conversion is forbidden."
            
        # Special dose-response endpoints
        special_endpoints = ['lc50', 'ec50', 'ic50', 'kd', 'ki', 'noec', 'loec']
        is_special_ep = any(k in ep_lower for k in special_endpoints)
        
        from_cat = UnitEngine.get_unit_category(from_unit)
        to_cat = UnitEngine.get_unit_category(to_unit)
        
        if to_cat == 'log_molar':
            if not is_special_ep:
                return False, "forbidden", f"Log-molar transformation (pX) is only defined for quantitative dose-response endpoints (LC50, EC50, etc.). Endpoint '{endpoint}' is not compatible."
            return True, "special", "Dose-response log-molar transformation (pX = -log10[mol/L])."
            
        return True, "safe", "Standard mass/molar conversion."

    # ─── Row-wise Value Conversion Engine ─────────────────────────────────────

    @staticmethod
    def convert_value(val: float, from_unit: str, to_unit: str, mw: Optional[float] = None) -> Tuple[float, str]:
        """
        Converts a single value row-wise, returning the converted float and mathematical formula string.
        """
        from_canonical = UnitEngine.normalize_unit_string(from_unit)
        to_canonical = UnitEngine.normalize_unit_string(to_unit)
        
        if from_canonical == to_canonical:
            return val, "No conversion needed"
            
        from_cat = UnitEngine.get_unit_category(from_canonical)
        to_cat = UnitEngine.get_unit_category(to_canonical)
        
        if not from_cat or not to_cat:
            raise ValueError(f"Unsupported unit conversion category from '{from_canonical}' to '{to_canonical}'")
            
        # 1. Mass to Mass
        if from_cat == 'mass' and to_cat == 'mass':
            factors = {
                ("mg/L", "µg/L"): 1000.0,
                ("µg/L", "mg/L"): 0.001,
                ("mg/L", "ng/L"): 1_000_000.0,
                ("ng/L", "mg/L"): 1e-6,
                ("µg/L", "ng/L"): 1000.0,
                ("ng/L", "µg/L"): 0.001
            }
            factor = factors.get((from_canonical, to_canonical), 1.0)
            formula_str = f"{to_canonical} = {from_canonical} × {factor}"
            return val * factor, formula_str
            
        # 2. Molar to Molar
        if from_cat == 'molar' and to_cat == 'molar':
            factors = {
                ("mol/L", "mmol/L"): 1000.0,
                ("mmol/L", "mol/L"): 0.001,
                ("mmol/L", "µmol/L"): 1000.0,
                ("µmol/L", "mmol/L"): 0.001,
                ("µmol/L", "nmol/L"): 1000.0,
                ("nmol/L", "µmol/L"): 0.001,
                ("mol/L", "µmol/L"): 1_000_000.0,
                ("µmol/L", "mol/L"): 1e-6
            }
            factor = factors.get((from_canonical, to_canonical), 1.0)
            formula_str = f"{to_canonical} = {from_canonical} × {factor}"
            return val * factor, formula_str

        # 3. Solid to Solid
        if from_cat == 'solid' and to_cat == 'solid':
            factors = {
                ("mg/kg", "µg/kg"): 1000.0,
                ("µg/kg", "mg/kg"): 0.001,
                ("mg/kg", "ng/kg"): 1_000_000.0,
                ("ng/kg", "mg/kg"): 1e-6,
                ("%", "mg/kg"): 10_000.0,
                ("mg/kg", "%"): 1e-4
            }
            factor = factors.get((from_canonical, to_canonical), 1.0)
            formula_str = f"{to_canonical} = {from_canonical} × {factor}"
            return val * factor, formula_str

        # 4. Mass to Molar (µmol/L, mmol/L, mol/L)
        if from_cat == 'mass' and to_cat == 'molar':
            if not mw or mw <= 0:
                raise ValueError(f"Conversion from '{from_canonical}' to '{to_canonical}' requires a valid Molecular Weight (MW).")
            # Convert to mg/L first
            mass_to_mgl = {
                "mg/L": 1.0,
                "µg/L": 0.001,
                "ng/L": 1e-6
            }
            val_mgl = val * mass_to_mgl.get(from_canonical, 1.0)
            
            if to_canonical == "µmol/L":
                converted = (val_mgl * 1000.0) / mw
                formula_str = f"µmol/L = ({from_canonical} × 1000) / MW" if from_canonical == "mg/L" else f"µmol/L = ({from_canonical} / MW)"
            elif to_canonical == "mmol/L":
                converted = val_mgl / mw
                formula_str = f"mmol/L = {from_canonical} / MW"
            else: # mol/L
                converted = val_mgl / (mw * 1000.0)
                formula_str = f"mol/L = {from_canonical} / (MW × 1000)"
            return converted, formula_str

        # 5. Molar to Mass
        if from_cat == 'molar' and to_cat == 'mass':
            if not mw or mw <= 0:
                raise ValueError(f"Conversion from '{from_canonical}' to '{to_canonical}' requires a valid Molecular Weight (MW).")
            # Convert to mol/L first
            mol_factors = {
                "mol/L": 1.0,
                "mmol/L": 1e-3,
                "µmol/L": 1e-6,
                "nmol/L": 1e-9
            }
            val_mol = val * mol_factors.get(from_canonical, 1.0)
            mgl_val = val_mol * mw * 1000.0
            
            if to_canonical == "mg/L":
                converted = mgl_val
                formula_str = f"mg/L = {from_canonical} × MW / 1000" if from_canonical == "µmol/L" else f"mg/L = {from_canonical} × MW × 1000"
            elif to_canonical == "µg/L":
                converted = mgl_val * 1000.0
                formula_str = f"µg/L = {from_canonical} × MW" if from_canonical == "µmol/L" else f"µg/L = {from_canonical} × MW × 1,000,000"
            else: # ng/L
                converted = mgl_val * 1_000_000.0
                formula_str = f"ng/L = {from_canonical} × MW × 1000" if from_canonical == "µmol/L" else f"ng/L = {from_canonical} × MW × 1,000,000,000"
            return converted, formula_str

        # 6. Conversions involving Log Molar (pX)
        if to_cat == 'log_molar':
            # Convert source to mol/L first
            if from_cat == 'molar':
                mol_factors = {
                    "mol/L": 1.0,
                    "mmol/L": 1e-3,
                    "µmol/L": 1e-6,
                    "nmol/L": 1e-9
                }
                val_mol = val * mol_factors.get(from_canonical, 1.0)
                formula_str = f"{to_canonical} = -log10({from_canonical} × 1e-6)" if from_canonical == "µmol/L" else f"{to_canonical} = -log10({from_canonical})"
            elif from_cat == 'mass':
                if not mw or mw <= 0:
                    raise ValueError(f"Conversion from '{from_canonical}' to '{to_canonical}' requires a valid Molecular Weight (MW).")
                # mass -> mol/L: mol/L = (mass * factor) / (1000 * MW)
                mass_to_mgl = {"mg/L": 1.0, "µg/L": 0.001, "ng/L": 1e-6}
                val_mgl = val * mass_to_mgl.get(from_canonical, 1.0)
                val_mol = val_mgl / (mw * 1000.0)
                formula_str = f"{to_canonical} = -log10({from_canonical} / (MW × 1000))"
            else:
                raise ValueError("Log-molar conversion only supported from concentration values.")
                
            if val_mol <= 0:
                raise ValueError("Log transform error: Molar concentration must be strictly positive.")
            return -math.log10(val_mol), formula_str

        if from_cat == 'log_molar':
            # Convert pX to mol/L: mol/L = 10^(-pX)
            val_mol = 10**(-val)
            if to_canonical == "mol/L":
                return val_mol, "mol/L = 10^(-pX)"
            elif to_canonical == "mmol/L":
                return val_mol * 1000.0, "mmol/L = 10^(-pX) × 1000"
            elif to_canonical == "µmol/L":
                return val_mol * 1_000_000.0, "µmol/L = 10^(-pX) × 1,000,000"
            elif to_canonical == "mg/L":
                if not mw or mw <= 0:
                    raise ValueError(f"Conversion from '{from_canonical}' to '{to_canonical}' requires a valid Molecular Weight (MW).")
                return val_mol * mw * 1000.0, "mg/L = 10^(-pX) × MW × 1000"
            elif to_canonical == "µg/L":
                if not mw or mw <= 0:
                    raise ValueError(f"Conversion from '{from_canonical}' to '{to_canonical}' requires a valid Molecular Weight (MW).")
                return val_mol * mw * 1_000_000.0, "µg/L = 10^(-pX) × MW × 1,000,000"
            else:
                raise ValueError(f"Cannot convert from log-molar to '{to_canonical}' directly.")

        # 7. Solid to Aqueous fallback (e.g. mg/kg ↔ mg/L)
        if (from_cat == 'solid' and to_cat in ('mass', 'molar')) or (from_cat in ('mass', 'molar') and to_cat == 'solid'):
            # Assume density = 1.0 kg/L for water solutions
            if from_canonical == "mg/kg" and to_canonical == "mg/L":
                return val, "mg/L = mg/kg (assumed density = 1.0 kg/L)"
            elif from_canonical == "mg/L" and to_canonical == "mg/kg":
                return val, "mg/kg = mg/L (assumed density = 1.0 kg/L)"
            elif from_canonical == "µg/kg" and to_canonical == "µg/L":
                return val, "µg/L = µg/kg (assumed density = 1.0 kg/L)"
            elif from_canonical == "µg/L" and to_canonical == "µg/kg":
                return val, "µg/kg = µg/L (assumed density = 1.0 kg/L)"
            else:
                # Convert to ppm (mg/kg or mg/L) first, then proceed
                raise ValueError(f"Conversion between solid '{from_canonical}' and liquid '{to_canonical}' is not standard. Normalize to mg/kg or mg/L first.")

        raise ValueError(f"No valid scientific conversion path from '{from_canonical}' to '{to_canonical}'")

    # ─── Legacy Backward Compatibility ────────────────────────────────────────

    @staticmethod
    def detect_units(df: pd.DataFrame) -> List[Dict[str, Any]]:
        results = []
        for col in df.columns:
            results.append(UnitEngine._detect_column_unit(col, df[col]))
        return results

    @staticmethod
    def _detect_column_unit(col_name: str, series: pd.Series) -> Dict[str, Any]:
        detected_unit = None
        confidence = 0
        method = "no_match"
        mixed_units = False

        for pattern, unit, bonus in COLUMN_NAME_PATTERNS:
            if pattern.search(col_name):
                detected_unit = unit
                confidence = min(95, 60 + bonus)
                method = "column_name_pattern"
                break

        if series.dtype == object or str(series.dtype).startswith('str'):
            sample = series.dropna().astype(str).head(50)
            found_units = []
            for val in sample:
                v = val.strip().lower()
                for alias, canonical in UNIT_ALIASES.items():
                    if v == alias or v.endswith(' ' + alias):
                        found_units.append(canonical)
                        break
            if found_units:
                unique_found = list(set(found_units))
                detected_unit = max(set(found_units), key=found_units.count)
                confidence = min(98, 70 + len(found_units) * 2)
                method = "value_scan"
                mixed_units = len(unique_found) > 1

        if detected_unit is None and pd.api.types.is_numeric_dtype(series):
            non_null = series.dropna()
            if len(non_null) > 0:
                median = float(non_null.median())
                col_lower = col_name.lower()
                if any(k in col_lower for k in ['lc50', 'ec50', 'ic50', 'ld50', 'noec', 'conc']):
                    if 0.001 <= median <= 10000:
                        detected_unit = 'mg/L'
                        confidence = 55
                        method = "value_range_heuristic"
                    elif 0.000001 <= median <= 10:
                        detected_unit = 'µmol/L'
                        confidence = 50
                        method = "value_range_heuristic"

        return {
            "column": col_name,
            "detected_unit": detected_unit,
            "confidence": confidence,
            "method": method,
            "mixed_units_detected": mixed_units,
            "dtype": str(series.dtype),
            "sample_values": series.dropna().head(3).tolist() if detected_unit else [],
        }

    @staticmethod
    def convert_column(series: pd.Series, from_unit: str, to_unit: str, mw_series: Optional[pd.Series] = None, mw_scalar: Optional[float] = None) -> Tuple[pd.Series, List[str]]:
        warnings = []
        if from_unit == to_unit:
            return series.copy(), []
        converted_list = []
        for i, val in enumerate(series):
            if pd.isna(val):
                converted_list.append(np.nan)
                continue
            mw = mw_scalar
            if mw_series is not None and i < len(mw_series):
                mw = mw_series.iloc[i]
            try:
                c_val, _ = UnitEngine.convert_value(float(val), from_unit, to_unit, mw)
                converted_list.append(c_val)
            except Exception as e:
                converted_list.append(np.nan)
                warnings.append(f"Row {i} conversion error: {e}")
        return pd.Series(converted_list, index=series.index), list(set(warnings))

    @staticmethod
    def log_transform(series: pd.Series, transform: str) -> Tuple[pd.Series, List[str]]:
        warnings = []
        non_positive = (series <= 0).sum()
        if non_positive > 0:
            warnings.append(f"{non_positive} non-positive values will produce NaN after log transform")
        safe = series.where(series > 0)
        if transform == 'log10':
            return np.log10(safe), warnings
        elif transform == 'ln':
            return np.log(safe), warnings
        elif transform == 'neg_log10':
            return -np.log10(safe), warnings
        else:
            raise ValueError(f"Unknown transform: '{transform}'")

    @staticmethod
    def detect_endpoint_variants(series: pd.Series) -> List[Dict[str, Any]]:
        unique_vals = series.dropna().astype(str).str.strip().unique().tolist()
        results = []
        for val in unique_vals:
            canonical = UnitEngine._suggest_endpoint_canonical(val)
            results.append({
                "raw_value": val,
                "suggested_canonical": canonical,
                "frequency": int((series.astype(str).str.strip() == val).sum()),
            })
        return sorted(results, key=lambda x: -x['frequency'])

    @staticmethod
    def _suggest_endpoint_canonical(raw: str) -> Optional[str]:
        raw_lower = raw.lower().strip()
        for pattern_str, canonical in ENDPOINT_CANONICAL.items():
            if re.search(pattern_str, raw_lower):
                return canonical
        return raw

    @staticmethod
    def apply_endpoint_mapping(series: pd.Series, mapping: Dict[str, str]) -> pd.Series:
        return series.astype(str).str.strip().map(lambda v: mapping.get(v, v))

    @staticmethod
    def detect_species_variants(series: pd.Series) -> List[Dict[str, Any]]:
        unique_vals = series.dropna().astype(str).str.strip().unique().tolist()
        results = []
        for val in unique_vals:
            canonical = SPECIES_CANONICAL.get(val.lower().strip())
            results.append({
                "raw_value": val,
                "suggested_canonical": canonical or val,
                "known": canonical is not None,
                "frequency": int((series.astype(str).str.strip() == val).sum()),
            })
        return sorted(results, key=lambda x: -x['frequency'])

    @staticmethod
    def apply_species_mapping(series: pd.Series, mapping: Dict[str, str]) -> pd.Series:
        return series.astype(str).str.strip().map(lambda v: mapping.get(v, v))

    @staticmethod
    def run_quality_checks(df: pd.DataFrame) -> List[Dict[str, Any]]:
        issues = []
        for col in df.columns:
            series = df[col]
            if pd.api.types.is_numeric_dtype(series):
                col_lower = col.lower()
                if any(k in col_lower for k in ['lc50', 'ec50', 'ic50', 'conc', 'dose', 'ld50']):
                    neg_rows = df.index[series < 0].tolist()
                    if neg_rows:
                        issues.append({
                            "severity": "ERROR",
                            "type": "impossible_value",
                            "column": col,
                            "description": f"Negative concentration values in '{col}'",
                            "affected_rows": neg_rows[:10],
                            "count": len(neg_rows),
                        })
                mean = series.mean()
                std = series.std()
                if std > 0:
                    outlier_rows = df.index[np.abs(series - mean) > 3 * std].tolist()
                    if outlier_rows:
                        issues.append({
                            "severity": "WARNING",
                            "type": "outlier",
                            "column": col,
                            "description": f"Values >3 SD from mean in '{col}'",
                            "affected_rows": outlier_rows[:10],
                            "count": len(outlier_rows),
                        })
            if 'ph' in col.lower() and pd.api.types.is_numeric_dtype(series):
                bad_rows = df.index[(series < 0) | (series > 14)].tolist()
                if bad_rows:
                    issues.append({
                        "severity": "ERROR",
                        "type": "impossible_value",
                        "column": col,
                        "description": f"pH values outside 0-14 in '{col}'",
                        "affected_rows": bad_rows[:10],
                        "count": len(bad_rows),
                    })
        return issues

    @staticmethod
    def compute_quality_score(df: pd.DataFrame, issues: List[Dict]) -> Dict[str, Any]:
        total_cells = df.size
        missing_cells = df.isna().sum().sum()
        completeness = max(0, 1 - missing_cells / max(1, total_cells))
        completeness_score = round(completeness * 25, 1)
        mixed_unit_count = sum(1 for i in issues if i['type'] == 'mixed_units')
        unit_score = max(0, 25 - mixed_unit_count * 5)
        dup_count = sum(1 for i in issues if i['type'] == 'duplicate_endpoint')
        endpoint_score = max(0, 25 - dup_count * 5)
        error_count = sum(1 for i in issues if i['severity'] == 'ERROR')
        consistency_score = max(0, 25 - error_count * 5)
        total = completeness_score + unit_score + endpoint_score + consistency_score
        return {
            "total": round(total, 1),
            "dimensions": {
                "completeness": {"score": completeness_score, "max": 25, "detail": f"{missing_cells} missing cells of {total_cells}"},
                "unit_integrity": {"score": unit_score, "max": 25, "detail": f"{mixed_unit_count} mixed-unit columns"},
                "endpoint_integrity": {"score": endpoint_score, "max": 25, "detail": f"{dup_count} duplicate endpoint groups"},
                "consistency": {"score": consistency_score, "max": 25, "detail": f"{error_count} impossible value issues"},
            },
            "grade": "A" if total >= 90 else "B" if total >= 75 else "C" if total >= 60 else "D" if total >= 40 else "F",
            "total_issues": len(issues),
            "error_count": error_count,
            "warning_count": sum(1 for i in issues if i['severity'] == 'WARNING'),
        }
