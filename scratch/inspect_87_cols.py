import os
import sys
import pandas as pd

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.schema_intelligence import SchemaIntelligenceEngine

files = [
    "uploads/active/3e51cea6c3fcf7406b17881275e1f1a8606b962bae6829bc358b7043556f4b41.xlsx",
    "uploads/active/47835242ed5562af9960df8a8e2d18194559103d9149e19e74e46fbc6bcad4d7.xlsx"
]

for file_path in files:
    filename = os.path.basename(file_path)
    if os.path.exists(file_path):
        df = pd.read_excel(file_path, nrows=5)
        columns = list(df.columns)
        print(f"\n=========================================")
        print(f"File: {filename} ({len(columns)} columns)")
        print(f"=========================================")
        inferred = SchemaIntelligenceEngine.infer_schema(columns)
        
        # Print mapped ones
        mapped_count = 0
        for res in inferred:
            if res['mapped_to'] != 'none':
                mapped_count += 1
                print(f"  Column: {res['column']:30} -> Mapped to: {res['mapped_to']:20} (Confidence: {res['confidence']:.2f})")
            elif "smiles" in res['column'].lower() or "cas" in res['column'].lower() or "cid" in res['column'].lower():
                print(f"  [UNMAPPED IMPORTANT] Column: {res['column']:30} -> Confidence: {res['confidence']:.2f}")
                
        print(f"Total mapped columns: {mapped_count} / {len(columns)}")
