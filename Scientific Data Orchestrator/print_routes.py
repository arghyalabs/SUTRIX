import sys
sys.path.append('.')
from backend.main import app

for route in app.routes:
    print(f"{getattr(route, 'methods', '')} {getattr(route, 'path', '')}")
