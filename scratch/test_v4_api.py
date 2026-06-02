import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"
CLIENT_ID = "TEST_V4_API"

def main():
    print("Testing V4 API Architecture...")
    
    # 1. We need a dataset first. Let's trigger demo load.
    print(f"\n1. Loading demo dataset for client {CLIENT_ID}")
    res = requests.post(f"{BASE_URL}/api/demo_ingest", data={"client_id": CLIENT_ID})
    print("Demo load:", res.status_code, res.json())
    
    job_id = res.json().get('job_id')
    if job_id:
        print(f"Waiting for job {job_id} to complete...")
        while True:
            job_res = requests.get(f"{BASE_URL}/api/jobs/{job_id}")
            if job_res.status_code == 200:
                job_data = job_res.json()
                if job_data['status'] in ['COMPLETED', 'FAILED']:
                    print(f"Job finished with status: {job_data['status']}")
                    break
            time.sleep(2)
            
    print("\n1b. Applying Mapping...")
    mappings = {
        "canonical_smiles": "SMILES",
        "value": "Value",
        "endpoint": "Endpoint",
        "unit": "Unit"
    }
    res = requests.post(f"{BASE_URL}/api/mapping", json={"client_id": CLIENT_ID, "mappings": mappings})
    print("Mapping status:", res.status_code)

    print("\n1c. Triggering Segregation...")
    seg_payload = {
        "client_id": CLIENT_ID,
        "enable_dedup": True,
        "enable_variance_pruning": False,
        "selected_hierarchy": ["Endpoint", "Species"]
    }
    res = requests.post(f"{BASE_URL}/api/segregate", json=seg_payload)
    print("Segregation status:", res.status_code, res.json())
    job_id = res.json().get('job_id')
    if job_id:
        print(f"Waiting for segregation job {job_id} to complete...")
        while True:
            job_res = requests.get(f"{BASE_URL}/api/jobs/{job_id}")
            if job_res.status_code == 200:
                job_data = job_res.json()
                if job_data['status'] in ['COMPLETED', 'FAILED']:
                    print(f"Job finished with status: {job_data['status']}")
                    break
            time.sleep(2)
            
    # 2. Segregation (trigger a mock or bypass if demo dataset is small)
    print("\n2. Getting subgroups...")
    res = requests.get(f"{BASE_URL}/api/analysis/subgroups/{CLIENT_ID}")
    print("Subgroups Status:", res.status_code)
    try:
        subgroups = res.json()
        print(f"Found {len(subgroups)} subgroups.")
    except Exception as e:
        print("Failed to parse JSON:", e)
        subgroups = []
        
    if not subgroups:
        print("Skipping subgroup selection test due to no subgroups.")
    else:
        print("\n3. Selecting subgroups...")
        node_ids = [subgroups[0]['node_id']]
        res = requests.post(f"{BASE_URL}/api/analysis/subgroups/{CLIENT_ID}/select", json={"node_ids": node_ids})
        print("Selection Status:", res.status_code)
        print("Selection Result:", res.json())
        
    print("\n4. Running Feature Selection...")
    fs_payload = {
        "client_id": CLIENT_ID,
        "variance_threshold": 0.01,
        "correlation_threshold": 0.85,
        "mi_fraction": 0.5,
        "run_rfe": False,
        "rfe_n_features": 20
    }
    res = requests.post(f"{BASE_URL}/api/modeling/feature-selection/run", json=fs_payload)
    print("Feature Selection Status:", res.status_code)
    try:
        print("Feature Selection Result:", res.json())
    except:
        print("Failed to parse JSON")

    print("\n5. Running Modeling Analysis...")
    res = requests.post(f"{BASE_URL}/api/modeling/analyze", json={"client_id": CLIENT_ID})
    print("Modeling Analysis Status:", res.status_code)
    try:
        result = res.json()
        print("Modeling Analysis Result keys:", result.keys())
        if 'ml_benchmarks' in result:
            print("ML Benchmarks task:", result['ml_benchmarks'].get('task'))
            print("ML Benchmarks status:", result['ml_benchmarks'].get('status'))
            print("Number of models benchmarked:", len(result['ml_benchmarks'].get('benchmarks', [])))
    except:
        print("Failed to parse JSON")

if __name__ == "__main__":
    main()
