from backend.api.routes.simple_analysis_routes import _get_branch_payload
from backend.core.workspace_registry import registry
import json

def main():
    client_id = "SDO_CORE_wva6dtz"
    node_id = "24175233ff5b" # Leaf node '72h'
    
    # Pre-load workspace
    ctx = registry.get_context(client_id)
    if not ctx or not ctx.hierarchy_engine:
        print("Workspace or hierarchy engine not found")
        return
        
    payload = _get_branch_payload(node_id, client_id)
    print("Node Path:", payload.get("path"))
    print("Node Name:", payload.get("node_name"))
    
    print("\nCurves Labels:")
    print(payload.get("curves", {}).get("labels"))
    print("Row Reduction:")
    print(payload.get("curves", {}).get("row_reduction"))
    print("Compound Reduction:")
    print(payload.get("curves", {}).get("compound_reduction"))
    
    print("\nCompound Attrition:")
    for att in payload.get("compound_attrition", []):
        print(f"  {att['label']}: {att['unique_compounds']} compounds (reduction={att['reduction_pct']}%)")

if __name__ == "__main__":
    main()
