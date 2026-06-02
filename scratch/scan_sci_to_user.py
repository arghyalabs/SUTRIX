import os
import re

pattern = re.compile(r'sci_to_user\s*=')
workspace_dir = 'a:/Scientific Data Orchestrator/Scientific Data Orchestrator'

print("Scanning for sci_to_user usage:")
for root, dirs, files in os.walk(workspace_dir):
    if '.venv' in root or '.git' in root or 'node_modules' in root:
        continue
    for file in files:
        if file.endswith('.py'):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    for idx, line in enumerate(f, 1):
                        if pattern.search(line):
                            print(f"{os.path.relpath(filepath, workspace_dir)}:L{idx} - {line.strip()}")
            except Exception as e:
                pass
