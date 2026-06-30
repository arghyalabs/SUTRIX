import os
import sys

# Configure stdout to use UTF-8
sys.stdout.reconfigure(encoding='utf-8')

with open("frontend/src/components/modeling/ModelingReadinessWorkspace.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Search for the main return block or outer divs in ModelingReadinessWorkspace
lines = content.split("\n")
print(f"Total lines: {len(lines)}")

# Print the top 35 lines of the file to see imports and structure
print("\n--- TOP OF FILE ---")
for i in range(min(35, len(lines))):
    print(f"{i+1}: {lines[i]}")

# Print the bottom 80 lines of the file to see the return JSX
print("\n--- BOTTOM OF FILE ---")
for i in range(len(lines) - 80, len(lines)):
    if i >= 0:
        print(f"{i+1}: {lines[i]}")
