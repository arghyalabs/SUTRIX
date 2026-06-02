import sqlite3
import json

db_path = 'a:/Scientific Data Orchestrator/Scientific Data Orchestrator/sutrix_science.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("=== TABLES ===")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
for t in tables:
    print(t[0])

for t in tables:
    table_name = t[0]
    print(f"\n=== {table_name} SCHEMA ===")
    cursor.execute(f"PRAGMA table_info({table_name})")
    print(cursor.fetchall())
    
    print(f"=== {table_name} ROWS ===")
    cursor.execute(f"SELECT * FROM {table_name} LIMIT 3")
    print(cursor.fetchall())

conn.close()
