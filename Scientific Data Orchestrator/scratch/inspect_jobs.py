import sqlite3

def main():
    conn = sqlite3.connect('sdo_jobs.db')
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print("Tables:", tables)
    
    for t in tables:
        table_name = t[0]
        print(f"\n=== {table_name} ===")
        cursor.execute(f"PRAGMA table_info({table_name})")
        print("Schema:", cursor.fetchall())
        cursor.execute(f"SELECT * FROM {table_name} ORDER BY ROWID DESC LIMIT 10")
        print("Recent Rows:")
        for r in cursor.fetchall():
            print(r)
            
    conn.close()

if __name__ == '__main__':
    main()
