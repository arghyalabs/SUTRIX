import pandas as pd
import json
import os
from backend.core.scientific_runtime import ScientificRuntime
from backend.utils.qualifier_parser import QualifierParser

def main():
    # 1. Load session mapping
    session_file = 'uploads/sessions/session_SDO_CORE_iec6ack.json'
    with open(session_file, 'r') as f:
        session_data = json.load(f)
    
    mappings = session_data['mappings']
    print("Initial mappings in session:", json.dumps(mappings, indent=2))
    
    # 2. Load ingested parquet
    ingested_path = 'uploads/parquet/ingested_SDO_CORE_iec6ack.parquet'
    df = pd.read_parquet(ingested_path)
    
    print("\nColumns in ingested df:", df.columns.tolist())
    print("Ingested row 0 values:")
    print("Chemical_Name:", df.at[0, 'Chemical_Name'])
    print("SMILES:", df.at[0, 'SMILES'])
    print("Temperature_C:", df.at[0, 'Temperature_C'])
    print("Test_System:", df.at[0, 'Test_System'])
    
    # 3. Simulate apply_column_mapping logic
    final_mappings = mappings.copy()
    val_col = next((k for k, v in mappings.items() if v == 'value'), None)
    print(f"\nval_col resolved to: {val_col}")
    
    if val_col and val_col in df.columns:
        parser = QualifierParser()
        q_vals, q_quals, q_units, q_qsar = [], [], [], []
        for val in df[val_col]:
            res = parser.parse(val)
            if res:
                q_vals.append(res.value)
                q_quals.append(res.qualifier.value if res.qualifier else None)
                q_units.append(res.unit)
                q_qsar.append(res.qsar_ready)
            else:
                q_vals.append(float('nan'))
                q_quals.append(None)
                q_units.append("")
                q_qsar.append(False)

        df[f"{val_col}_numeric"] = q_vals
        df[f"{val_col}_qualifier"] = q_quals
        df[f"{val_col}_unit"] = q_units
        df[f"{val_col}_qsar_ready"] = q_qsar

        final_mappings[f"{val_col}_numeric"] = 'value'
        final_mappings[f"{val_col}_qualifier"] = 'qualifier'
        if not any(v == 'unit' for v in mappings.values()):
            final_mappings[f"{val_col}_unit"] = 'unit'
        final_mappings[val_col] = 'none'

        smiles_col = next((k for k, v in final_mappings.items() if v in ['canonical_smiles', 'smiles']), None)
        print(f"smiles_col in apply_column_mapping: {smiles_col}")
        if smiles_col and smiles_col in df.columns:
            df[smiles_col] = df[smiles_col].astype(str).apply(ScientificRuntime.canonicalize_smiles)

    print("\nAfter apply_column_mapping simulation:")
    print("Chemical_Name:", df.at[0, 'Chemical_Name'])
    print("SMILES:", df.at[0, 'SMILES'])
    print("Temperature_C:", df.at[0, 'Temperature_C'])
    print("Test_System:", df.at[0, 'Test_System'])
    
    # 4. Now simulate Segregation or other parts to see where it gets overwritten!
    print("\nLet's see if there is any other place where df is saved/overwritten.")
    print("Checking if df contains 'SMILES' with Temperature value.")

if __name__ == '__main__':
    main()
