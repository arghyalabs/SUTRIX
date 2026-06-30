import pandas as pd
import json

parquet_path = 'a:/Scientific Data Orchestrator/Scientific Data Orchestrator/uploads/parquet/enriched_dataset_fb91fba9-072a-4615-a1dc-0505ef4f176a.parquet'
df = pd.read_parquet(parquet_path)
print("Columns in enriched parquet:")
print(df.columns.tolist())
print("\nFirst row:")
print(df.iloc[0].to_dict())
