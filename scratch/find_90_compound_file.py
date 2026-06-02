import os
import sys
import glob
import pandas as pd

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.schema_intelligence import SchemaIntelligenceEngine
from backend.core.mapping_confidence_engine import MappingConfidenceEngine

files = glob.glob("uploads/active/*.xlsx") + glob.glob("uploads/active/*.csv")

for file_path in files:
    filename = os.path.basename(file_path)
    try:
        if file_path.endswith(".xlsx"):
            df = pd.read_excel(file_path)
        else:
            df = pd.read_csv(file_path)
        
        num_rows = len(df)
        print(f"File: {filename} | Rows: {num_rows} | Cols: {len(df.columns)}")
        
        # Check if this might be the "90 compounds" file
        if 80 <= num_rows <= 100 or "smiles" in [c.lower() for c in df.columns] or "smile" in [c.lower() for c in df.columns]:
            print(f"--> POTENTIAL MATCH: {filename} ({num_rows} rows)")
            columns = list(df.columns)
            inferred = SchemaIntelligenceEngine.infer_schema(columns)
            for res in inferred:
                print(f"    Col: {res['column']:25} -> Mapped: {res['mapped_to']:20} (Conf: {res['confidence']:.2f})")
    except Exception as e:
        print(f"Error reading {filename}: {e}")
