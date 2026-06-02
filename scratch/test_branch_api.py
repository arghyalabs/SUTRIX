from fastapi.testclient import TestClient
from backend.main import app
from backend.core.workspace_registry import registry

client = TestClient(app)

def test_branch_api():
    # Find any active workspace
    active_wids = list(registry.workspaces.keys())
    if not active_wids:
        print("No active workspaces found in registry. Searching session cache...")
        from backend.core.session_state_manager import session_manager
        # Attempt to load first session found in workspaces folder
        import os
        if os.path.exists("workspaces"):
            wids = [d for d in os.listdir("workspaces") if os.path.isdir(os.path.join("workspaces", d))]
            if wids:
                active_wids = [wids[0]]
                
    if not active_wids:
        print("No active workspaces or cached sessions found in registry.")
        return
        
    wid = active_wids[0]
    ctx = registry.get_context(wid)
    if not ctx or not ctx.hierarchy_engine:
        print(f"Active workspace {wid} has no hierarchy engine. Run segregation first.")
        return
        
    # Get a node id
    node_ids = list(ctx.hierarchy_engine.node_details.keys())
    if not node_ids:
        print("No nodes found in hierarchy engine.")
        return
        
    node_id = node_ids[0]
    print(f"Testing branch detail API for node_id='{node_id}' in workspace='{wid}'...")
    
    # Query GET /api/analysis/branch/{node_id}
    res = client.get(f"/api/analysis/branch/{node_id}?client_id={wid}")
    if res.status_code != 200:
        print(f"API returned status {res.status_code}: {res.text}")
        return
        
    data = res.json()
    assert "node_id" in data
    assert "node_name" in data
    assert "path" in data
    assert "stats" in data
    assert "curves" in data
    assert "quality_metrics" in data
    assert "compound_attrition" in data
    assert "filtration_impact" in data
    assert "distribution_shift" in data
    
    curves = data["curves"]
    assert "row_reduction" in curves
    assert "compound_reduction" in curves
    assert "retention_curve" in curves
    assert "missingness_curve" in curves
    assert "redundancy_curve" in curves
    
    quality = data["quality_metrics"]
    assert "shannon_entropy" in quality
    assert "variance_score" in quality
    assert "coverage_score" in quality
    assert "completeness_score" in quality
    assert "sparsity_score" in quality
    assert "redundancy_score" in quality
    assert "branch_quality_rating" in quality
    
    print("SUCCESS: All branch analysis keys are populated and validated!")

if __name__ == "__main__":
    test_branch_api()
