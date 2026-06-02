import os
import glob

files = glob.glob("backend/**/*.py", recursive=True)

for f in files:
    try:
        with open(f, 'r', encoding='utf-8') as fh:
            content = fh.read()
        if "Unnamed Compound" in content or "unnamed" in content.lower():
            print(f"Found reference in {f}")
            # Print lines containing the term
            lines = content.split("\n")
            for i, line in enumerate(lines):
                if "Unnamed Compound" in line or "unnamed" in line.lower():
                    print(f"  Line {i+1}: {line.strip()}")
    except Exception as e:
        pass
