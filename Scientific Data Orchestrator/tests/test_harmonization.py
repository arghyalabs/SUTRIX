import pytest
from backend.normalization.formula_parser import parse_formula_weight
from backend.normalization.unit_engine import UnitEngine

def test_formula_parser_valid():
    """Verify that valid chemical formulas parse and calculate correctly."""
    # Caffeine: C8H10N4O2 -> C: 12.011*8, H: 1.008*10, N: 14.007*4, O: 15.999*2
    # 96.088 + 10.08 + 56.028 + 31.998 = 194.194
    assert parse_formula_weight("C8H10N4O2") == 194.194
    
    # Water: H2O
    assert parse_formula_weight("H2O") == 18.015
    
    # Lead nitrate: Pb(NO3)2 -> Pb: 207.2, N: 14.007, O: 15.999
    # 207.2 + 2 * (14.007 + 3 * 15.999) = 207.2 + 2 * 62.004 = 331.208
    assert parse_formula_weight("Pb(NO3)2") == 331.208

def test_formula_parser_invalid():
    """Verify that invalid formulas raise ValueError."""
    with pytest.raises(ValueError):
        parse_formula_weight("InvalidElementX")
    with pytest.raises(ValueError):
        parse_formula_weight("C8H10(N4O2")
    with pytest.raises(ValueError):
        parse_formula_weight("Pb(NO3))2")

def test_unit_context_detection():
    """Verify unit detection from header strings, value strings, and endpoints."""
    # Suffix extraction
    assert UnitEngine.parse_unit_from_string("Concentration_ug_L") == "µg/L"
    assert UnitEngine.parse_unit_from_string("LC50_ppm") == "mg/L"
    
    # Value cell parsing
    import pandas as pd
    row1 = pd.Series({"value_col": "0.45 mg/L"})
    assert UnitEngine.detect_row_unit(row1, "value_col", None, None) == "mg/L"
    
    row2 = pd.Series({"value_col": 2.5, "unit_col": "ppb"})
    assert UnitEngine.detect_row_unit(row2, "value_col", "unit_col", None) == "µg/L"

def test_endpoint_safety_rules():
    """Verify endpoint categorizations (Safe, Special, Forbidden)."""
    # Safe
    allowed, cat, msg = UnitEngine.validate_endpoint_conversion("LC50", "mg/L", "µg/L")
    assert allowed is True
    assert cat == "safe"
    
    # Special pX transform
    allowed, cat, msg = UnitEngine.validate_endpoint_conversion("EC50", "mg/L", "pEC50")
    assert allowed is True
    assert cat == "special"
    
    # Forbidden transformations
    allowed, cat, msg = UnitEngine.validate_endpoint_conversion("Mortality %", "mg/L", "µmol/L")
    assert allowed is False
    assert cat == "forbidden"
    
    allowed, cat, msg = UnitEngine.validate_endpoint_conversion("Behavior Score", "mg/L", "pLC50")
    assert allowed is False
    assert cat == "forbidden"

def test_row_value_conversions():
    """Verify molar and mass conversions and formula logging."""
    # 1. Mass to Mass
    val, formula = UnitEngine.convert_value(1.5, "mg/L", "µg/L")
    assert val == 1500.0
    assert "µg/L = mg/L × 1000" in formula
    
    # 2. Mass to Molar (Aspirin MW = 180.158)
    val, formula = UnitEngine.convert_value(180.158, "mg/L", "µmol/L", mw=180.158)
    assert pytest.approx(val) == 1000.0
    assert "µmol/L = (mg/L × 1000) / MW" in formula
    
    # 3. Molar to Mass (Aspirin MW = 180.158)
    val, formula = UnitEngine.convert_value(1000.0, "µmol/L", "mg/L", mw=180.158)
    assert pytest.approx(val) == 180.158
    assert "mg/L = µmol/L × MW / 1000" in formula

    # 4. Molar to Log Molar (pX)
    val, formula = UnitEngine.convert_value(1000.0, "µmol/L", "pLC50")
    # 1000 µmol/L = 1e-3 mol/L -> -log10(1e-3) = 3
    assert pytest.approx(val) == 3.0
    assert "pLC50 = -log10(µmol/L × 1e-6)" in formula

def test_workspace_reset_subgroup_state():
    """Verify that reset_subgroup_state resets all subgroup/recovery variables."""
    from backend.core.workspace_registry import PipelineContext
    context = PipelineContext(workspace_id="test_reset_ws")
    
    # Set non-default subgroup values
    context.subgroup_selected = True
    context.active_subgroup_path = "some/subgroup.parquet"
    context.recovered_subgroup_path = "some/recovered.parquet"
    context.selected_node_ids = ["node1", "node2"]
    context.subgroup_metadata = {"name": "subgroup1", "rows": 10}
    context.recovery_attempted = True
    context.recovery_completed = True
    context.structure_state = "MOLECULAR"
    context.smiles_coverage_pct = 95.0
    
    context.reset_subgroup_state()
    
    assert context.subgroup_selected is False
    assert context.active_subgroup_path is None
    assert context.recovered_subgroup_path is None
    assert context.selected_node_ids == []
    assert context.subgroup_metadata == {}
    assert context.recovery_attempted is False
    assert context.recovery_completed is False
    assert context.structure_state == "UNKNOWN"
    assert context.smiles_coverage_pct == 0.0
