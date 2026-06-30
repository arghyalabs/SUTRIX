import os

def search():
    for root, dirs, files in os.walk('frontend/src'):
        for f in files:
            if f.endswith(('.tsx', '.ts')):
                path = os.path.join(root, f)
                try:
                    with open(path, 'r', encoding='utf-8') as file:
                        content = file.read()
                        if 'Dataset Composition' in content or 'Composition Distribution' in content:
                            print(f"Found in {path}")
                except Exception as e:
                    pass

if __name__ == '__main__':
    search()
