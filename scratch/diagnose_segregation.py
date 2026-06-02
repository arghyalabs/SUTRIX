import pandas as pd
import json
import os

def main():
    # 1. Load session mapping
    session_file = 'uploads/sessions/session_SDO_CORE_iec6ack.json'
    with open(session_file, 'r') as f:
        session_data = json.load(f)
    
    mappings = session_data['mappings']
    print("Mappings in session:", json.dumps(mappings, indent=2))
    
    # 2. Load mapped parquet
    mapped_path = 'uploads/parquet/mapped_SDO_CORE_iec6ack.parquet'
    df = pd.read_parquet(mapped_path)
    
    print("\nColumns in mapped df:", df.columns.tolist())
    print("Mapped row 0 values:")
    print("Chemical_Name:", df.at[0, 'Chemical_Name'])
    print("SMILES:", df.at[0, 'SMILES'])
    print("Temperature_C:", df.at[0, 'Temperature_C'])
    print("Test_System:", df.at[0, 'Test_System'])
    
    # 3. Simulate process_segregation_task logic
    print("\n--- SIMULATING SEGREGATION PROCESS ---")
    enable_dedup = True
    prune_high_variance = True
    
    if enable_dedup:
        from backend.validation.duplicate_detector import SmartDeduplicator
        dedup = SmartDeduplicator()
        df, dedup_res = dedup.deduplicate(df, mappings)
        print("After deduplicate:")
        print("Chemical_Name:", df.at[0, 'Chemical_Name'])
        print("SMILES:", df.at[0, 'SMILES'])
        print("Temperature_C:", df.at[0, 'Temperature_C'])
        print("Test_System:", df.at[0, 'Test_System'])
        
    if prune_high_variance:
        from backend.processing.auditor import ScientificAuditor
        auditor = ScientificAuditor()
        flagged_df, vs = auditor.compute_variance_flags(df, mappings)
        df = flagged_df[flagged_df['audit_flag'] != 'High_Variance_Conflict'].copy()
        print("After variance pruning:")
        print("Chemical_Name:", df.at[0, 'Chemical_Name'])
        print("SMILES:", df.at[0, 'SMILES'])
        print("Temperature_C:", df.at[0, 'Temperature_C'])
        print("Test_System:", df.at[0, 'Test_System'])

    # 4. Now check if HierarchyEngine or LineageBuilder.run mutates it!
    from backend.core.lineage_builder import LineageBuilder
    hierarchy = ["Test_Type", "Exposure_Duration", "Species", "Endpoint"] # typical hierarchy
    lineage_data = LineageBuilder.run(
        df=df,
        hierarchy_cols=hierarchy,
        mappings=mappings,
        workspace_id='SDO_CORE_iec6ack',
        broadcast_fn=None
    )
    
    print("After LineageBuilder.run:")
    print("Chemical_Name:", df.at[0, 'Chemical_Name'])
    print("SMILES:", df.at[0, 'SMILES'])
    print("Temperature_C:", df.at[0, 'Temperature_C'])
    print("Test_System:", df.at[0, 'Test_System'])

if __name__ == '__main__':
    main()
