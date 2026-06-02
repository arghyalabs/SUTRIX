import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.scientific_ontology import SCIENTIFIC_VARIABLES

print("Is 'route' in SCIENTIFIC_VARIABLES?", "route" in SCIENTIFIC_VARIABLES)
if "route" in SCIENTIFIC_VARIABLES:
    print(SCIENTIFIC_VARIABLES["route"])
else:
    print("Keys in SCIENTIFIC_VARIABLES:")
    print(list(SCIENTIFIC_VARIABLES.keys()))
