"""
Debug script to trace the exact enrichment pipeline flow.
Run: python debug_enrichment.py
"""
import pandas as pd
from backend.cache.descriptor_cache import ScientificDescriptorCache
from backend.parallel.descriptor_pool import calculate_descriptors_multiprocess

# Simulate queue_executor behavior
df = pd.read_parquet(r'uploads/parquet/mapped_SDO_CORE_mslmn4t.parquet')
print("DF shape:", df.shape)
print("DF columns:", df.columns.tolist())

# Same column resolution logic as queue_executor
mappings = {'Chemical_Name': 'chemical_name', 'CAS_Number': 'cas_number', 'SMILES': 'canonical_smiles'}
sci_to_user = {v: k for k, v in mappings.items()}
smiles_col = sci_to_user.get('canonical_smiles') or sci_to_user.get('smiles')
print("SMILES col resolved to:", smiles_col)

# Get unique SMILES
unique_smiles_in_df = df[smiles_col].dropna().astype(str).str.strip().unique().tolist()
unique_smiles_in_df = [s for s in unique_smiles_in_df if s]
print("Total unique SMILES:", len(unique_smiles_in_df))
print("First 3 SMILES:", unique_smiles_in_df[:3])

# Phase 2: Check cache
cache = ScientificDescriptorCache()
stats = cache.get_statistics()
print("\nCache stats:", stats)

# Phase 3: Calculate
selected = ['MolWt', 'LogP', 'TPSA']
smiles_to_calc = unique_smiles_in_df[:3]
print("\nCalculating descriptors for", len(smiles_to_calc), "SMILES...")
print("Selected descriptors:", selected)

results = calculate_descriptors_multiprocess(smiles_to_calc, 'fast', False, None, selected)
print("\nResults (first 3):")
for smi, res in list(results.items())[:3]:
    print("  SMILES:", smi[:40])
    print("  Success:", res.get('success'))
    print("  Data keys:", list(res.get('data', {}).keys()))
    print("  MolWt:", res.get('data', {}).get('MolWt'))
    print()

# Phase 4: Assembly
print("\nSimulating DataFrame assembly...")
sample_desc = next((v["data"] for v in results.values() if v.get("success") and v.get("data")), {})
descriptor_keys = list(sample_desc.keys())
print("Descriptor keys to add:", descriptor_keys)

enriched_df = df.head(3).copy()
for dk in descriptor_keys:
    if dk not in enriched_df.columns:
        enriched_df[dk] = None

for idx, row in enriched_df.iterrows():
    sm = str(row[smiles_col]).strip() if pd.notna(row[smiles_col]) else ""
    if sm in results:
        res = results[sm]
        if res.get("success") and res.get("data"):
            for dk, val in res["data"].items():
                enriched_df.at[idx, dk] = val

print("\nEnriched DF columns:", enriched_df.columns.tolist())
print("MolWt sample:", enriched_df['MolWt'].tolist() if 'MolWt' in enriched_df.columns else "NOT PRESENT")
