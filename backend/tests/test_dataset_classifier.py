# -----------------------------------------------------------------------------
# Scientific Data Orchestrator (SDO) — Dataset Classifier Tests
# Verifies molecular, scientific, and hybrid classification scenarios.
# -----------------------------------------------------------------------------
"""
backend/tests/test_dataset_classifier.py

Automated unit tests verifying the correctness of the DatasetClassifier engine
across molecular datasets, clinical scientific datasets, and hybrid cases.
"""

import pandas as pd
from backend.core.dataset_classifier import DatasetClassifier

def test_dataset_classifier_molecular():
    """Verify that a dataset containing valid SMILES structures is classified as MOLECULAR."""
    df = pd.DataFrame({
        "smiles": ["CCO", "CCN", "CCC", "CCCl", "CCO", "CCN", "CCC", "CCCl", "CCO", "CCN"],
        "endpoint": [1.2, 0.8, 2.5, 0.4, 1.2, 0.8, 2.5, 0.4, 1.2, 0.8]
    })
    mappings = {"smiles": "canonical_smiles", "endpoint": "endpoint"}
    classification = DatasetClassifier.classify(df, mappings)
    
    assert classification.dataset_mode == "MOLECULAR"
    assert classification.smiles_detected is True
    assert classification.smiles_col == "smiles"
    assert classification.structure_coverage_pct == 100.0
    assert classification.primary_entity_type == "Compound"

def test_dataset_classifier_scientific_clinical():
    """Verify that a clinical research dataset is classified as SCIENTIFIC with the correct domain and entity."""
    df = pd.DataFrame({
        "Patient_ID": ["P1001", "P1002", "P1003", "P1004"],
        "Age": [54, 32, 41, 62],
        "Treatment_Arm": ["Active", "Placebo", "Active", "Placebo"],
        "ICD9_Diagnosis": ["410.9", "250.0", "410.9", "250.0"]
    })
    mappings = {
        "Patient_ID": "patient_id",
        "Age": "age",
        "Treatment_Arm": "treatment_group",
        "ICD9_Diagnosis": "diagnosis"
    }
    classification = DatasetClassifier.classify(df, mappings)
    
    assert classification.dataset_mode == "SCIENTIFIC"
    assert classification.smiles_detected is False
    assert classification.detected_domain == "Clinical Research"
    assert classification.primary_entity_type == "Patient"
    assert classification.primary_entity_col == "Patient_ID"

def test_dataset_classifier_scientific_ecotox():
    """Verify that an ecotoxicology dataset without structures is classified as SCIENTIFIC with Ecotox domain."""
    df = pd.DataFrame({
        "Test_Species": ["Daphnia magna", "Pimephales promelas", "Oncorhynchus mykiss"],
        "Assay_Endpoint": ["LC50", "EC50", "NOEC"],
        "Measured_Concentration": [4.2, 12.8, 1.5]
    })
    mappings = {
        "Test_Species": "organism",
        "Assay_Endpoint": "endpoint",
        "Measured_Concentration": "value"
    }
    classification = DatasetClassifier.classify(df, mappings)
    
    assert classification.dataset_mode == "SCIENTIFIC"
    assert classification.smiles_detected is False
    assert classification.detected_domain == "Ecotoxicology"

def test_dataset_classifier_hybrid():
    """Verify that a dataset containing 30% valid molecular structures is classified as HYBRID."""
    df = pd.DataFrame({
        "identifier": ["Aspirin", "Water", "Ethanol", "UnresolvedCompoundA", "UnresolvedCompoundB", "UnresolvedCompoundC", "UnresolvedCompoundD", "UnresolvedCompoundE", "UnresolvedCompoundF", "UnresolvedCompoundG"],
        "smiles": ["CC(=O)Oc1ccccc1C(=O)O", "O", "CCO", "", None, "", None, "", None, ""],
        "value": [1.5, 0.0, 2.3, 4.1, 5.0, 1.2, 0.9, 8.4, 3.2, 6.7]
    })
    mappings = {
        "identifier": "chemical_name",
        "smiles": "canonical_smiles",
        "value": "value"
    }
    classification = DatasetClassifier.classify(df, mappings)
    
    # 3 out of 10 rows have valid SMILES = 30.0% coverage (HYBRID is between 10.0% and 50.0%)
    assert classification.dataset_mode == "HYBRID"
    assert classification.smiles_detected is True
    assert classification.structure_coverage_pct == 30.0
    assert classification.primary_entity_type == "Compound"
