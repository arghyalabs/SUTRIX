import pandas as pd

def main():
    path = "uploads/active/Reference Data.xlsx"
    try:
        xl = pd.ExcelFile(path)
        print("Sheet names:", xl.sheet_names)
        df = xl.parse(xl.sheet_names[0])
        print("Columns:", list(df.columns))
        print("Row count:", len(df))
        print("\nFirst 3 rows:")
        print(df.head(3))
        
        # Check if there are any columns containing typical toxicological variables
        for col in df.columns:
            # unique values containing 'Animal' or 'toxicity'
            unique_vals = df[col].dropna().astype(str).unique()
            animal_vals = [v for v in unique_vals if 'Animal' in v]
            toxicity_vals = [v for v in unique_vals if 'toxicity' in v]
            if animal_vals:
                print(f"Col '{col}' contains Animal values: {animal_vals[:5]}")
            if toxicity_vals:
                print(f"Col '{col}' contains toxicity values: {toxicity_vals[:5]}")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()
