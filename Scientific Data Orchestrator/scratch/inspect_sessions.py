import os
import json
import glob

session_files = glob.glob('a:/Scientific Data Orchestrator/Scientific Data Orchestrator/uploads/sessions/session_SDO_CORE_*.json')
session_files.sort(key=os.path.getmtime, reverse=True)

print("Recently modified sessions:")
for filepath in session_files[:5]:
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        size = os.path.getsize(filepath)
        print(f"\nFile: {os.path.basename(filepath)} (Size: {size} bytes)")
        print(f"Dataset Mode: {data.get('dataset_mode')}")
        print("Mappings:")
        print(json.dumps(data.get('mappings'), indent=2))
        print("Parquet Path:", data.get('parquet_path'))
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
