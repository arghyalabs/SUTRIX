import os
import sys
import glob
import pandas as pd

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.schema_intelligence import SchemaIntelligenceEngine

files = glob.glob("uploads/active/*.xlsx")

for file_path in files:
    filename = os.path.basename(file_path)
    if len(filename) < 30:  # Skip simple named ones we already saw
        continue
    try:
        df = pd.read_excel(file_path, nrows=5)
        columns = list(df.columns)
        if len(columns) == 0:
            continue
            
        print(f"\nFile: {filename} ({len(columns)} columns, {len(df)} preview rows)")
        inferred = SchemaIntelligenceEngine.infer_schema(columns)
        for res in inferred:
            if res['mapped_to'] != 'none' or res['confidence'] > 0.4:
                print(f"  Column: {res['column']:30} -> Mapped to: {res['mapped_to']:20} (Confidence: {res['confidence']:.2f})")
    except Exception as e:
        print(f"Error reading {filename}: {e}")
