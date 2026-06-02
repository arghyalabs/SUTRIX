import pandas as pd
import json

def _resolve_compound_fields(row, mappings):
    def get_best_col(roles, preferred_pattern=None):
        candidates = [col for col, role in mappings.items() if role in roles and col in row.index]
        print(f"  get_best_col({roles}): candidates={candidates}")
        if not candidates:
            return None
        if len(candidates) == 1:
            return candidates[0]
        if preferred_pattern:
            import re
            pat = re.compile(preferred_pattern, re.IGNORECASE)
            pattern_candidates = [c for c in candidates if pat.search(c)]
            print(f"  matching pattern {preferred_pattern}: pattern_candidates={pattern_candidates}")
            if pattern_candidates:
                return pattern_candidates[0]
        return candidates[0]

    name_col = get_best_col(["chemical_name", "chemical_id", "compound_name", "substance_name", "test_substance", "material_name"], r"(name|chem|comp|substance)")
    cas_col = get_best_col(["cas_number", "cas"], r"cas")
    smiles_col = get_best_col(["canonical_smiles", "isomeric_smiles", "smiles"], r"(smile|struct)")
    
    print(f"  Resolved columns: name_col={name_col}, cas_col={cas_col}, smiles_col={smiles_col}")
    return name_col, cas_col, smiles_col

def main():
    session_file = 'uploads/sessions/session_SDO_CORE_iec6ack.json'
    with open(session_file, 'r') as f:
        session_data = json.load(f)
    mappings = session_data['mappings']
    
    df = pd.read_parquet('uploads/parquet/enriched_dataset_fb91fba9-072a-4615-a1dc-0505ef4f176a.parquet')
    row = df.iloc[0]
    
    print("Row index keys (columns):", list(row.index))
    _resolve_compound_fields(row, mappings)

if __name__ == '__main__':
    main()
