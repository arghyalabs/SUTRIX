import os
import pandas as pd
import glob

files = glob.glob("uploads/active/*.xlsx")

for f in files:
    try:
        df = pd.read_excel(f)
        non_null_smiles = 0
        smile_col = None
        for col in df.columns:
            if "smile" in col.lower() or "structure" in col.lower():
                smile_col = col
                non_null_smiles = df[col].notna().sum()
                break
        print(f"File: {os.path.basename(f)} | Total Rows: {len(df)} | Smile Col: {smile_col} | Non-null smiles: {non_null_smiles}")
    except Exception as e:
        print(f"Error {f}: {e}")
