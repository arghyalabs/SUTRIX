import os
import glob
from backend.core.workspace_registry import registry

def main():
    dirs = glob.glob('workspaces/*')
    client_ids = [os.path.basename(d) for d in dirs if os.path.isdir(d)]
    
    for client_id in client_ids:
        try:
            ctx = registry.get_context(client_id)
            if ctx and ctx.active_lineage:
                print(f"Workspace: {client_id}")
                print("Hierarchy Columns:", ctx.active_hierarchy)
                lineage = ctx.active_lineage
                print("Total nodes:", lineage.get("total_nodes"))
                print("Max depth:", lineage.get("max_depth"))
                print("Nodes sample (first 10):")
                for node in lineage.get("nodes", [])[:10]:
                    print(f"  ID: {node.get('id')} | Name: {node.get('node_name')} | Parent: {node.get('parent_id')} | Path: {node.get('path')} | Rows: {node.get('row_count')}")
                
                # Check segmentation_results
                print("Segmentation Results:", ctx.segmentation_results)
                print("-" * 50)
        except Exception as e:
            pass

if __name__ == "__main__":
    main()
