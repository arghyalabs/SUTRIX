import numpy as np
import pandas as pd
from backend.core.advanced_analysis_helpers import (
    calculate_shannon_entropy,
    calculate_normality_fit,
    calculate_chemical_diversity,
    calculate_sparsity_grid
)

def test_calculate_shannon_entropy():
    # Uniform categories: H should be positive and non-zero
    s1 = pd.Series(["A", "B", "C", "D"])
    h1 = calculate_shannon_entropy(s1)
    assert h1 > 0.0
    
    # Pure single category: H should be exactly 0
    s2 = pd.Series(["A", "A", "A", "A"])
    h2 = calculate_shannon_entropy(s2)
    assert h2 == 0.0


def test_calculate_normality_fit():
    # Normal distribution test
    np.random.seed(42)
    normal_data = np.random.normal(loc=5.0, scale=1.0, size=50)
    s = pd.Series(normal_data)
    
    res = calculate_normality_fit(s, bin_count=5)
    assert res["is_numeric"] is True
    assert res["mean"] > 4.0 and res["mean"] < 6.0
    assert len(res["histogram"]) == 5
    
    # Check that normal curve overlays are positive numbers
    for bin_data in res["histogram"]:
        assert bin_data["normal_count"] >= 0.0


def test_calculate_chemical_diversity():
    # Test identical SMILES list with ring structure (benzene)
    smiles = ["c1ccccc1", "c1ccccc1", "c1ccccc1"]
    res = calculate_chemical_diversity(smiles)
    
    if res["supported"]:
        assert res["tanimoto_mean"] == 1.0
        assert res["scaffold_count"] == 1
        assert res["unique_compounds"] == 3


def test_calculate_sparsity_grid():
    # 2 columns, 2 rows
    df = pd.DataFrame({
        "A": [1, None],
        "B": ["value", ""]
    })
    grid = calculate_sparsity_grid(df, grid_rows=2, grid_cols=2)
    assert len(grid) == 4
    # A=1 (present), B="value" (present) -> row 0: [1, 1]
    # A=None (missing), B="" (missing) -> row 1: [0, 0]
    assert grid == [1, 1, 0, 0]
