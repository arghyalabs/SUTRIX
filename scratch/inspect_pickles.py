import os
import glob
import pickle
import pandas as pd

files = glob.glob("uploads/*.pkl")

for f in files:
    try:
        with open(f, 'rb') as fh:
            obj = pickle.load(fh)
        if isinstance(obj, pd.DataFrame):
            print(f"Pickle: {os.path.basename(f)} | DataFrame | Rows: {len(obj)} | Cols: {list(obj.columns)}")
        else:
            print(f"Pickle: {os.path.basename(f)} | {type(obj)}")
    except Exception as e:
        print(f"Error {f}: {e}")
