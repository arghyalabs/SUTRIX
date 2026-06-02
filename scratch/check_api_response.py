import json
import os
import glob
from backend.core.workspace_registry import registry
from backend.api.routes.modeling_routes import _results_cache

def main():
    # Print registry methods/attrs
    print("Registry attributes:", [a for a in dir(registry) if not a.startswith('_')])
    
    # List workspace directories
    dirs = glob.glob('workspaces/*')
    if not dirs:
        print("No workspaces found.")
        return
    
    client_ids = [os.path.basename(d) for d in dirs if os.path.isdir(d)]
    print("Client IDs in workspaces:", client_ids)
    
    for client_id in client_ids:
        ctx = registry.get_context(client_id)
        if ctx:
            print(f"\nContext found for {client_id}:")
            print("dataset_mode:", ctx.dataset_mode)
            print("mappings:", ctx.mappings)
            print("parquet_path:", ctx.parquet_path)
            
            # Trigger run_modeling_analysis if cache is empty
            if client_id not in _results_cache:
                print(f"Triggering run_modeling_analysis for {client_id}...")
                import asyncio
                from backend.api.routes.modeling_routes import run_modeling_analysis
                from backend.api.validators.request_validator import BaseClientPayload
                payload = BaseClientPayload(client_id=client_id)
                try:
                    loop = asyncio.get_event_loop()
                    res = loop.run_until_complete(run_modeling_analysis(payload))
                    print("Analysis completed successfully.")
                except Exception as e:
                    print("Analysis failed:", e)
            
            if client_id in _results_cache:
                data = _results_cache[client_id]
                readiness = data.get("readiness", {})
                print("Readiness keys:", list(readiness.keys()))
                print("ai_score:", readiness.get("ai_score"))
                print("score:", readiness.get("score"))
                print("tier:", readiness.get("tier"))
                print("deductions in readiness:", readiness.get("deductions"))
                print("recommendations in readiness:", readiness.get("recommendations"))
                
                visualizations = data.get("visualizations", {})
                print("Visualizations keys:", list(visualizations.keys()))
                if "correlation_matrix" in visualizations:
                    corr = visualizations["correlation_matrix"]
                    print("Correlation matrix labels:", corr.get("labels"))
                    print("Correlation matrix z size:", len(corr.get("z", [])))
                else:
                    print("NO correlation_matrix in visualizations!")
                break

if __name__ == "__main__":
    main()
