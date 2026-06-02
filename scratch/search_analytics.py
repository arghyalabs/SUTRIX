import os

def search():
    for root, dirs, files in os.walk('frontend/src'):
        for f in files:
            if f.endswith(('.tsx', '.ts')):
                path = os.path.join(root, f)
                try:
                    with open(path, 'r', encoding='utf-8') as file:
                        if 'SegregationAnalytics' in file.read():
                            print(f"Used in {path}")
                except Exception as e:
                    pass

if __name__ == '__main__':
    search()
