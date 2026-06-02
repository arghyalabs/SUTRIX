import os
import glob
import pandas as pd

def main():
    # Find most recently modified workspace
    dirs = glob.glob('workspaces/*')
    if not dirs:
        print("No workspaces found.")
        return
    recent_dir = max(dirs, key=os.path.getmtime)
    print(f"Most recent workspace directory: {recent_dir}")
    
    # Recursively find all parquet files in this workspace directory
    pq_files = []
    for root, d_names, f_names in os.walk(recent_dir):
        for f in f_names:
            if f.endswith('.parquet'):
                pq_files.append(os.path.join(root, f))
    
    print("Found Parquet files:", pq_files)
    
    for pf in pq_files:
        try:
            df = pd.read_parquet(pf)
            print(f"\nDataFrame {os.path.basename(pf)} columns:")
            print(df.columns.tolist()[:25])
            print("Numeric columns:")
            print(df.select_dtypes(include=['number']).columns.tolist()[:25])
            print(f"Total rows: {len(df)}")
        except Exception as e:
            print(f"Failed to read {pf}: {e}")

if __name__ == "__main__":
    main()
