import sqlite3
import pandas as pd

def main():
    db_path = "sutrix_science.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cursor.fetchall()]
    print("Tables in sutrix_science.db:", tables)
    for table in tables:
        print(f"\nTable {table}:")
        df = pd.read_sql_query(f"SELECT * FROM [{table}] LIMIT 3", conn)
        print(df.head(2))
        cursor.execute(f"SELECT COUNT(*) FROM [{table}]")
        print(f"Total rows in {table}: {cursor.fetchone()[0]}")
    conn.close()

if __name__ == "__main__":
    main()
