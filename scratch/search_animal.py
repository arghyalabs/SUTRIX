import sqlite3
import glob
import os
import pandas as pd

def main():
    # Search DBs
    for db_path in glob.glob('*.db') + glob.glob('**/*.db', recursive=True):
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [r[0] for r in cursor.fetchall()]
            for table in tables:
                cursor.execute(f"PRAGMA table_info([{table}])")
                cols = [c[1] for c in cursor.fetchall()]
                for col in cols:
                    try:
                        cursor.execute(f"SELECT COUNT(*) FROM [{table}] WHERE [{col}] LIKE '%Animal%'")
                        count = cursor.fetchone()[0]
                        if count > 0:
                            print(f'Found in DB {db_path}, Table {table}, Col {col}: {count} rows')
                    except Exception as ex:
                        pass
            conn.close()
        except Exception as e:
            pass

    # Search CSV files
    for csv_path in glob.glob('**/*.csv', recursive=True):
        if 'node_modules' in csv_path or '.venv' in csv_path:
            continue
        try:
            df = pd.read_csv(csv_path)
            for col in df.columns:
                matches = df[df[col].astype(str).str.contains('Animal', na=False)]
                if not matches.empty:
                    print(f'Found in CSV {csv_path}, Col {col}: {len(matches)} rows')
        except Exception:
            pass

if __name__ == "__main__":
    main()
