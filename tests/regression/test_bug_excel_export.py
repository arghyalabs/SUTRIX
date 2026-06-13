import io
import zipfile
import pandas as pd
from fastapi.testclient import TestClient
from backend.main import app
from backend.core.workspace_registry import registry

def test_bulk_subgroup_excel_export(tmp_path):
    client = TestClient(app)
    
    # 1. Setup mock workspace context
    client_id = "test_bulk_export_excel"
    context = registry.get_context(client_id)
    
    # Write a dummy dataset
    df = pd.DataFrame({
        "chemical_name": ["Benzene", "Aspirin"],
        "canonical_smiles": ["c1ccccc1", "CC(=O)Oc1ccccc1C(=O)O"],
        "species": ["fish", "fish"],
        "endpoint": ["LC50", "LC50"],
        "value": [10.0, 50.0],
        "unit": ["mg/L", "mg/L"]
    })
    
    workspace_dir = tmp_path / "workspace"
    workspace_dir.mkdir()
    context.workspace_dir = str(workspace_dir)
    
    parquet_path = workspace_dir / "dataset.parquet"
    df.to_parquet(parquet_path)
    context.parquet_path = str(parquet_path)
    context.dataframe_cache = df
    context.touch(save_to_disk=True)
    
    # 2. Invoke the export endpoint with format='xlsx'
    payload = {
        "subgroup_ids": ["root"],
        "format": "xlsx"
    }
    
    response = client.post(f"/api/features/{client_id}/export-subgroups", json=payload)
    assert response.status_code == 200
    
    # 3. Read the returned ZIP content
    zip_bytes = io.BytesIO(response.content)
    with zipfile.ZipFile(zip_bytes, "r") as zf:
        namelist = zf.namelist()
        assert "manifest.json" in namelist
        assert "root/metadata.json" in namelist
        assert "root/dataset.xlsx" in namelist  # Assert xlsx exists
        
        # Verify that we can parse the generated Excel file
        excel_bytes = zf.read("root/dataset.xlsx")
        excel_df = pd.read_excel(io.BytesIO(excel_bytes))
        assert len(excel_df) == 2
        assert "canonical_smiles" in excel_df.columns
