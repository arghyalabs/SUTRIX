import os
import pandas as pd

file_path = "uploads/active/Reference Data.xlsx"
if os.path.exists(file_path):
    df = pd.read_excel(file_path, nrows=3)
    print(df.to_string())
else:
    print(f"{file_path} not found")
