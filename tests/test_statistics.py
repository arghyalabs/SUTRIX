import os
import shutil
import pytest
import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from backend.main import app
from backend.core.workspace_registry import registry
from backend.core.database.duckdb_engine import duckdb_engine

client = TestClient(app)

@pytest.fixture
def stats_workspace():
    # Setup temporary workspace
    client_id = "test_stats_workspace_id"
    context = registry.get_context(client_id)
    
    # Create mock dataset
    np.random.seed(42)
    group1 = np.random.normal(loc=10.0, scale=1.0, size=30)
    group2 = np.random.normal(loc=12.0, scale=1.0, size=30) # different mean, same variance
    group3 = np.random.normal(loc=15.0, scale=2.5, size=30) # different mean, different variance (for Welch/fallback)
    
    # For regression
    x1 = np.random.uniform(1, 10, 90)
    x2 = x1 * 2 + np.random.normal(0, 0.1, 90) # high correlation/VIF
    x3 = np.random.uniform(5, 15, 90) # low correlation
    y = 3.0 * x1 + 1.5 * x3 + np.random.normal(0, 1.0, 90)
    
    df = pd.DataFrame({
        "group": ["A"] * 30 + ["B"] * 30 + ["C"] * 30,
        "t_target": list(group1) + list(group2) + [np.nan] * 30, # for 2-group t-test
        "anova_target": list(group1) + list(group2) + list(group3),
        "y": y,
        "x1": x1,
        "x2": x2,
        "x3": x3,
        "missing_col": [1.0] * 45 + [None] * 45
    })
    
    # Save to active parquet checkpoint path
    os.makedirs(context.workspace_dir, exist_ok=True)
    parquet_path = os.path.join(context.workspace_dir, "active_dataset.parquet")
    df.to_parquet(parquet_path)
    context.parquet_path = parquet_path
    context.dataframe_cache = df
    context.touch(save_to_disk=True)
    
    # Register in DuckDB
    table_name = f"ws_{client_id}_active"
    duckdb_engine.register_dataframe(df, table_name)
    
    yield client_id, df
    
    # Cleanup
    shutil.rmtree(context.workspace_dir, ignore_errors=True)

def test_assumption_health_endpoint(stats_workspace):
    client_id, df = stats_workspace
    
    payload = {
        "client_id": client_id,
        "columns": ["t_target", "x1", "missing_col"],
        "target_column": "t_target",
        "group_column": "group"
    }
    
    res = client.post("/api/statistics/assumption-health", json=payload)
    assert res.status_code == 200
    data = res.json()
    
    assert "normality" in data
    assert "homogeneity" in data
    assert "multicollinearity_vif" in data
    assert "outliers" in data
    assert "missingness" in data
    
    # Missingness check validation
    missingness = data["missingness"]
    missing_col_info = next(m for m in missingness if m["column"] == "missing_col")
    assert missing_col_info["missing_count"] == 45
    assert missing_col_info["missing_percentage"] == 50.0

def test_hypothesis_test_t_test(stats_workspace):
    client_id, df = stats_workspace
    
    payload = {
        "client_id": client_id,
        "test_type": "T_TEST",
        "target_column": "t_target",
        "group_column": "group",
        "run_fallback": True
    }
    
    res = client.post("/api/statistics/hypothesis-test", json=payload)
    assert res.status_code == 200
    data = res.json()
    
    assert data["test_used"] in ["Independent T-test", "Welch T-test"]
    assert "results" in data
    assert "narrative" in data
    assert "statistic" in data["results"]
    assert "p_value" in data["results"]
    assert data["results"]["p_value"] < 0.05

def test_hypothesis_test_anova(stats_workspace):
    client_id, df = stats_workspace
    
    payload = {
        "client_id": client_id,
        "test_type": "ANOVA",
        "target_column": "anova_target",
        "group_column": "group",
        "run_fallback": True
    }
    
    res = client.post("/api/statistics/hypothesis-test", json=payload)
    assert res.status_code == 200
    data = res.json()
    
    assert "One-way ANOVA" in data["test_used"] or "Kruskal-Wallis" in data["test_used"]
    assert "results" in data
    assert "narrative" in data
    
    # Should have post-hoc pairwise comparisons
    if data["results"].get("post_hoc") is not None:
        assert len(data["results"]["post_hoc"]) == 3

def test_hypothesis_test_regression(stats_workspace):
    client_id, df = stats_workspace
    
    payload = {
        "client_id": client_id,
        "test_type": "REGRESSION",
        "target_column": "y",
        "predictor_columns": ["x1", "x2", "x3"]
    }
    
    res = client.post("/api/statistics/hypothesis-test", json=payload)
    assert res.status_code == 200
    data = res.json()
    
    assert data["test_used"] == "Multiple Linear Regression"
    assert "results" in data
    assert "narrative" in data
    
    results = data["results"]
    assert "r_squared" in results
    assert "adjusted_r_squared" in results
    assert "coefficients" in results
    assert "vif" in results
    
    assert len(results["coefficients"]) == 4
    
    # Multicollinearity check
    assert results["vif"]["x1"] > 5.0
