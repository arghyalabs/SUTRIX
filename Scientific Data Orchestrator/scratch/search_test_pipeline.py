import os

def search_files():
    results = []
    for root, dirs, files in os.walk('.'):
        if 'node_modules' in root or '.git' in root or 'dist' in root:
            continue
        for f in files:
            if f.endswith('.tsx') or f.endswith('.ts'):
                path = os.path.join(root, f)
                try:
                    with open(path, 'r', encoding='utf-8') as file:
                        for line_num, line in enumerate(file, 1):
                            if 'Dataset Composition' in line or 'Download Raw ZIP' in line or 'Proceed to Enrichment' in line:
                                results.append((path, line_num, line.strip()))
                except Exception:
                    pass
    for path, line_num, line in results:
        cleaned_line = line.encode('ascii', 'ignore').decode('ascii')
        print(f"{path}:{line_num}: {cleaned_line}")

if __name__ == "__main__":
    search_files()
