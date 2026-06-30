import pandas as pd
import glob
import os

def main():
    # Find ingested_demo_dataset.parquet or other ingested files
    files = glob.glob('uploads/parquet/ingested_*.parquet')
    for f in files:
        try:
            df = pd.read_parquet(f)
            print(f"File: {os.path.basename(f)}")
            print("Columns:", df.columns.tolist())
            print("Numeric columns:", df.select_dtypes(include=['number']).columns.tolist())
            print("-" * 50)
        except Exception as e:
            print(f"Failed to read {f}: {e}")

if __name__ == "__main__":
    main()
