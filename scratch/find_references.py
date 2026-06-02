import os
import glob

# Search in python files
files = glob.glob("backend/**/*.py", recursive=True)

for f in files:
    try:
        with open(f, 'r', encoding='utf-8') as fh:
            content = fh.read()
        if "synonym_mapper" in content or "ScientificSynonymMapper" in content:
            print(f"Found reference in {f}")
    except Exception as e:
        pass
