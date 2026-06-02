import requests
import json

api_base = 'http://127.0.0.1:8000'

# List of recently modified active sessions
sessions = ['SDO_CORE_brbr1n9', 'SDO_CORE_v86qlfi', 'SDO_CORE_whk21gs', 'SDO_CORE_q2lagrw']

for session in sessions:
    print(f"\n=================== TESTING SESSION: {session} ===================")
    
    # 1. Test /search
    try:
        search_url = f"{api_base}/api/explorer/{session}/search?limit=3"
        r = requests.get(search_url)
        print("Search API Status:", r.status_code)
        if r.status_code == 200:
            search_data = r.json()
            print("Total records:", search_data.get("total"))
            results = search_data.get("results", [])
            for idx, res in enumerate(results):
                print(f"\n--- Result {idx} ---")
                print("Chemical_Name:", res.get("Chemical_Name"))
                print("chemical_name:", res.get("chemical_name"))
                print("SMILES (col):", res.get("SMILES"))
                print("smiles (resolved):", res.get("smiles"))
                print("Temperature_C:", res.get("Temperature_C"))
                print("Test_System:", res.get("Test_System"))
        else:
            print("Error response:", r.text)
    except Exception as e:
        print("Search API connection error:", e)

    # 2. Test /compound for the first smiles
    try:
        if r.status_code == 200 and results:
            first_res = results[0]
            sm = first_res.get("smiles") or first_res.get("SMILES") or first_res.get("smile")
            if sm:
                comp_url = f"{api_base}/api/explorer/{session}/compound?smiles={requests.utils.quote(str(sm))}"
                rc = requests.get(comp_url)
                print("\nCompound Detail API Status:", rc.status_code)
                if rc.status_code == 200:
                    detail = rc.json()
                    print("Detail Name:", detail.get("name"))
                    print("Detail CAS:", detail.get("cas"))
                    print("Detail SMILES:", detail.get("smiles"))
                else:
                    print("Error detail response:", rc.text)
    except Exception as e:
        print("Detail API error:", e)
