with open('frontend/src/components/analysis/NodeVisualization.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
    for line in content.split('\n'):
        if 'Composition' in line or 'Distribution' in line:
            print(line)
