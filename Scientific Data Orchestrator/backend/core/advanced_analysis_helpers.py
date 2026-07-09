import math
import random
import numpy as np
import pandas as pd
from scipy import stats
from typing import Optional

# RDKit imports are wrapped inside a try-except to ensure the app starts even if RDKit has install issues
try:
    from rdkit import Chem
    from rdkit.Chem import AllChem
    from rdkit.Chem.Scaffolds import MurckoScaffold
    from rdkit import DataStructs
    RDKIT_AVAILABLE = True
except ImportError:
    RDKIT_AVAILABLE = False


def calculate_shannon_entropy(series: pd.Series) -> float:
    """
    Computes Shannon Information Entropy for a categorical series.
    Formula: H(X) = -sum(p(x_i) * log_e(p(x_i)))
    """
    clean_series = series.dropna().astype(str)
    if clean_series.empty:
        return 0.0
    
    counts = clean_series.value_counts()
    total = len(clean_series)
    
    entropy = 0.0
    for count in counts.values:
        p = count / total
        if p > 0:
            entropy -= p * math.log(p)
            
    return round(entropy, 4)


def calculate_normality_fit(series: pd.Series, bin_count: int = 12) -> dict:
    """
    Computes potency distribution stats, Shapiro-Wilk normality, 
    and theoretical Gaussian fit coordinates.
    """
    numeric_series = pd.to_numeric(series, errors='coerce').dropna()
    
    if len(numeric_series) < 3:
        return {
            "is_numeric": False,
            "shapiro_w": 0.0,
            "shapiro_p": 0.0,
            "verdict": "Insufficient Data",
            "skewness": 0.0,
            "histogram": []
        }
        
    mean = float(numeric_series.mean())
    std = float(numeric_series.std())
    median = float(numeric_series.median())
    
    # Calculate Shapiro-Wilk test
    try:
        shapiro_w, shapiro_p = stats.shapiro(numeric_series.values)
        shapiro_w = float(shapiro_w)
        shapiro_p = float(shapiro_p)
    except Exception:
        shapiro_w, shapiro_p = 0.0, 0.0
        
    # Verdict based on standard alpha = 0.05
    verdict = "Normal" if shapiro_p >= 0.05 else "Non-Normal"
    
    # Skewness
    try:
        skew = float(stats.skew(numeric_series.values))
    except Exception:
        skew = 0.0
        
    # Histogram counts and actual bins
    counts, bins = np.histogram(numeric_series.values, bins=bin_count)
    total_count = len(numeric_series)
    
    histogram = []
    for i in range(len(counts)):
        bin_start = float(bins[i])
        bin_end = float(bins[i+1])
        bin_center = (bin_start + bin_end) / 2
        actual_count = int(counts[i])
        
        # Calculate theoretical Gaussian count for this bin
        # PDF: f(x) = (1 / (std * sqrt(2*pi))) * exp(-0.5 * ((x - mean)/std)^2)
        # Expected count in bin = PDF * total_count * bin_width
        bin_width = bin_end - bin_start
        if std > 0:
            pdf_val = (1.0 / (std * math.sqrt(2 * math.pi))) * math.exp(-0.5 * ((bin_center - mean) / std) ** 2)
            expected_count = pdf_val * total_count * bin_width
        else:
            expected_count = total_count if (mean >= bin_start and mean <= bin_end) else 0.0
            
        histogram.append({
            "bin_start": round(bin_start, 4),
            "bin_end": round(bin_end, 4),
            "bin_label": f"{bin_start:.2f}-{bin_end:.2f}",
            "actual_count": actual_count,
            "normal_count": round(expected_count, 2)
        })
        
    return {
        "is_numeric": True,
        "mean": round(mean, 4),
        "median": round(median, 4),
        "std": round(std, 4),
        "shapiro_w": round(shapiro_w, 4),
        "shapiro_p": round(shapiro_p, 4),
        "verdict": verdict,
        "skewness": round(skew, 4),
        "histogram": histogram
    }


def calculate_chemical_diversity(smiles_list: list, sample_limit: int = 150) -> dict:
    """
    Computes scaffold diversity (Bemis-Murcko) and Tanimoto similarity metrics using RDKit.
    For large lists, it samples to prevent high quadratic overhead.
    """
    if not RDKIT_AVAILABLE:
        return {
            "supported": False,
            "reason": "RDKit is not installed on the system",
            "tanimoto_mean": 0.0,
            "tanimoto_std": 0.0,
            "scaffold_count": 0,
            "unique_compounds": 0
        }
        
    # Clean and parse SMILES list
    valid_mols = []
    scaffolds = set()
    
    for sm in smiles_list:
        if not sm or not isinstance(sm, str) or sm.strip() == "":
            continue
        try:
            mol = Chem.MolFromSmiles(sm)
            if mol:
                valid_mols.append(mol)
                # Compute Murcko Scaffold
                scaffold_mol = MurckoScaffold.GetScaffoldForMol(mol)
                scaffold_smiles = Chem.MolToSmiles(scaffold_mol)
                if scaffold_smiles:
                    scaffolds.add(scaffold_smiles)
        except Exception:
            continue
            
    unique_compounds = len(valid_mols)
    if unique_compounds == 0:
        return {
            "supported": True,
            "tanimoto_mean": 0.0,
            "tanimoto_std": 0.0,
            "scaffold_count": 0,
            "unique_compounds": 0
        }
        
    # Limit compounds for pairwise Tanimoto calculations (O(N^2))
    diversity_mols = valid_mols
    if len(valid_mols) > sample_limit:
        random.seed(42)
        diversity_mols = random.sample(valid_mols, sample_limit)
        
    # Compute fingerprints
    fps = []
    for mol in diversity_mols:
        try:
            fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=1024)
            if fp:
                fps.append(fp)
        except Exception:
            continue
            
    # Calculate pairwise Tanimoto similarities
    similarities = []
    for i in range(len(fps)):
        for j in range(i + 1, len(fps)):
            sim = DataStructs.TanimotoSimilarity(fps[i], fps[j])
            similarities.append(sim)
            
    if similarities:
        tan_mean = float(np.mean(similarities))
        tan_std = float(np.std(similarities))
    else:
        # Default similarity when only 1 compound is present
        tan_mean = 1.0
        tan_std = 0.0
        
    return {
        "supported": True,
        "tanimoto_mean": round(tan_mean, 4),
        "tanimoto_std": round(tan_std, 4),
        "scaffold_count": len(scaffolds),
        "unique_compounds": unique_compounds
    }


def calculate_sparsity_grid(df: pd.DataFrame, grid_rows: int = 10, grid_cols: int = 10) -> list:
    """
    Creates a grid_rows x grid_cols binary cell list mapping dataset presence.
    1 indicates present cell, 0 indicates missing/null cell.
    """
    if df.empty or len(df.columns) == 0:
        return [0] * (grid_rows * grid_cols)
        
    # Uniformly select columns
    cols_count = len(df.columns)
    col_indices = [int(i) for i in np.linspace(0, cols_count - 1, min(grid_cols, cols_count))]
    selected_cols = [df.columns[i] for i in col_indices]
    
    # Uniformly select rows
    rows_count = len(df)
    row_indices = [int(i) for i in np.linspace(0, rows_count - 1, min(grid_rows, rows_count))]
    
    grid = []
    for r_idx in row_indices:
        row_cells = []
        for col in selected_cols:
            val = df.iloc[r_idx][col]
            is_present = 1 if (pd.notnull(val) and str(val).strip() != "") else 0
            row_cells.append(is_present)
            
        # Pad with 0 if columns count is smaller than grid_cols
        while len(row_cells) < grid_cols:
            row_cells.append(0)
        grid.extend(row_cells)
        
    # Pad with complete 0 rows if rows count is smaller than grid_rows
    while len(grid) < (grid_rows * grid_cols):
        grid.extend([0] * grid_cols)
        
    return grid
