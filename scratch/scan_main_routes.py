import re

with open("backend/main.py", "r", encoding="utf-8") as f:
    content = f.read()

# Find all lines starting with @app or containing api router
lines = content.split("\n")
for i, line in enumerate(lines):
    if "@app.post" in line or "@app.get" in line or "router" in line or "/api/" in line:
        print(f"Line {i+1}: {line}")
