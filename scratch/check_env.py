import os
import sys

print(f"sys.executable: {sys.executable}")
print(f"sys.path: {sys.path}")

try:
    import rapidfuzz
    print("rapidfuzz imported successfully! Version:", rapidfuzz.__version__)
except ImportError as e:
    print("Failed to import rapidfuzz:", e)
