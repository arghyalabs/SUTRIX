import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import pandas as pd
import numpy as np
import scipy.stats as stats
from sklearn.linear_model import LinearRegression

from backend.core.workspace_registry import registry
from backend.core.statistics.explainers import ScientificNarrativeGenerator
from backend.core.replay.event_sourcer import EventSourcer

logger = logging.getLogger("sdo.api.routes.statistics")

router = APIRouter(prefix="/api/statistics", tags=["Statistics"])

class AssumptionHealthPayload(BaseModel):
    client_id: str
    columns: List[str]
    target_column: Optional[str] = None
    group_column: Optional[str] = None

class HypothesisTestPayload(BaseModel):
    client_id: str
    test_type: str  # T_TEST, ANOVA, REGRESSION
    target_column: str
    group_column: Optional[str] = None
    predictor_columns: Optional[List[str]] = None
    run_fallback: Optional[bool] = True

@router.post("/assumption-health")
def compute_assumption_health(payload: AssumptionHealthPayload) -> Dict[str, Any]:
    """
    Computes live statistical diagnostics for the active spreadsheet dataset:
    - Shapiro-Wilk Normality test (sampled to 5000 rows if necessary)
    - Levene's Homogeneity of Variance test
    - Variance Inflation Factor (VIF) for Multicollinearity checks
    - IQR-based Outlier detection
    - Missingness cell ratios
    """
    context = registry.get_context(payload.client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Workspace context not found")

    df = context.load_active_dataset()
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Active dataset is empty or not loaded")

    # 1. Normality checks
    normality_results = []
    for col in payload.columns:
        if col not in df.columns:
            continue
        # Drop missing values for calculations
        series = df[col].dropna()
        if len(series) < 3:
            normality_results.append({
                "column": col,
                "test": "Normality",
                "passed": False,
                "p_value": None,
                "statistic": None,
                "message": "Too few observations (n < 3)"
            })
            continue

        # Sample if size is huge (Shapiro-Wilk is limited to N <= 5000 in scipy)
        if len(series) > 5000:
            data_sample = series.sample(n=5000, random_state=42).values
        else:
            data_sample = series.values

        try:
            shapiro_stat, shapiro_p = stats.shapiro(data_sample)
            passed = bool(shapiro_p > 0.05)
            normality_results.append({
                "column": col,
                "test": "Normality",
                "passed": passed,
                "p_value": float(shapiro_p),
                "statistic": float(shapiro_stat),
                "message": "Shapiro-Wilk normality test completed"
            })
        except Exception as e:
            normality_results.append({
                "column": col,
                "test": "Normality",
                "passed": False,
                "p_value": None,
                "statistic": None,
                "message": f"Normality check failed: {str(e)}"
            })

    # 2. Homogeneity of variance checks (Levene's test)
    homogeneity_results = []
    if payload.group_column and payload.target_column:
        g_col = payload.group_column
        t_col = payload.target_column
        if g_col in df.columns and t_col in df.columns:
            groups = []
            unique_groups = df[g_col].dropna().unique()
            for g in unique_groups:
                g_vals = df[df[g_col] == g][t_col].dropna()
                if len(g_vals) > 0:
                    groups.append(g_vals.values)

            if len(groups) >= 2:
                try:
                    levene_stat, levene_p = stats.levene(*groups)
                    passed = bool(levene_p > 0.05)
                    homogeneity_results.append({
                        "test": "Homogeneity",
                        "passed": passed,
                        "p_value": float(levene_p),
                        "statistic": float(levene_stat),
                        "message": "Levene's homogeneity test completed"
                    })
                except Exception as e:
                    homogeneity_results.append({
                        "test": "Homogeneity",
                        "passed": False,
                        "p_value": None,
                        "statistic": None,
                        "message": f"Levene's test failed: {str(e)}"
                    })
            else:
                homogeneity_results.append({
                    "test": "Homogeneity",
                    "passed": False,
                    "p_value": None,
                    "statistic": None,
                    "message": "Fewer than 2 valid groups found"
                })

    # 3. Multicollinearity (VIF)
    vif_results = {}
    numeric_cols = [c for c in payload.columns if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]
    if len(numeric_cols) >= 2:
        try:
            sub_df = df[numeric_cols].dropna()
            if len(sub_df) > len(numeric_cols):
                for col in numeric_cols:
                    other_cols = [c for c in numeric_cols if c != col]
                    X = sub_df[other_cols].values
                    y = sub_df[col].values
                    lr = LinearRegression()
                    lr.fit(X, y)
                    r2 = lr.score(X, y)
                    if r2 >= 1.0:
                        vif_results[col] = float('inf')
                    else:
                        vif_results[col] = float(1.0 / (1.0 - r2))
            else:
                for col in numeric_cols:
                    vif_results[col] = 1.0
        except Exception as e:
            logger.warning(f"VIF calculations failed: {e}")

    # 4. Outliers detection (IQR)
    outlier_results = []
    for col in payload.columns:
        if col not in df.columns or not pd.api.types.is_numeric_dtype(df[col]):
            continue
        series = df[col].dropna()
        if len(series) > 0:
            q1 = series.quantile(0.25)
            q3 = series.quantile(0.75)
            iqr = q3 - q1
            lower_bound = q1 - 1.5 * iqr
            upper_bound = q3 + 1.5 * iqr
            outliers = series[(series < lower_bound) | (series > upper_bound)]
            outlier_results.append({
                "column": col,
                "outlier_count": len(outliers),
                "outlier_percentage": round((len(outliers) / len(series)) * 100, 2),
                "lower_bound": float(lower_bound),
                "upper_bound": float(upper_bound)
            })

    # 5. Missingness check
    missingness_results = []
    for col in payload.columns:
        if col not in df.columns:
            continue
        missing_count = int(df[col].isna().sum())
        total_count = len(df)
        missingness_results.append({
            "column": col,
            "missing_count": missing_count,
            "missing_percentage": round((missing_count / total_count) * 100, 2) if total_count > 0 else 0.0
        })

    return {
        "workspace_id": payload.client_id,
        "normality": normality_results,
        "homogeneity": homogeneity_results,
        "multicollinearity_vif": vif_results,
        "outliers": outlier_results,
        "missingness": missingness_results
    }

@router.post("/hypothesis-test")
def execute_hypothesis_test(payload: HypothesisTestPayload) -> Dict[str, Any]:
    """
    Executes frequentist statistical tests (T-test, ANOVA, Regression) on active data:
    - Normality & Homogeneity checks occur pre-test.
    - Assumption Guardian™ triggers fallback tests (e.g. Mann-Whitney U, Kruskal-Wallis) automatically.
    - Generates publication-ready Scientific Narrative Reports™.
    - Logs the test step into the event sourcing logs for Workflow Replay.
    """
    context = registry.get_context(payload.client_id)
    if not context:
        raise HTTPException(status_code=404, detail="Workspace context not found")

    df = context.load_active_dataset()
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Active dataset is empty or not loaded")

    test_type = payload.test_type.upper()
    test_used = ""
    fallback_triggered = False
    assumptions = []
    results = {}

    if test_type == "T_TEST":
        group_col = payload.group_column
        target_col = payload.target_column
        
        if not group_col or group_col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Group column {group_col} not found")
        if not target_col or target_col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Target column {target_col} not found")
            
        valid_df = df[[group_col, target_col]].dropna()
        unique_groups = valid_df[group_col].unique()
        if len(unique_groups) != 2:
            raise HTTPException(status_code=400, detail=f"T-test requires exactly 2 groups with valid data, found: {list(unique_groups)}")
            
        group1_vals = df[df[group_col] == unique_groups[0]][target_col].dropna().values
        group2_vals = df[df[group_col] == unique_groups[1]][target_col].dropna().values
        
        if len(group1_vals) < 3 or len(group2_vals) < 3:
            raise HTTPException(status_code=400, detail="Each group must have at least 3 observations")
            
        # Test Normality
        shap_p1 = stats.shapiro(group1_vals)[1] if len(group1_vals) < 5000 else stats.shapiro(pd.Series(group1_vals).sample(5000))[1]
        shap_p2 = stats.shapiro(group2_vals)[1] if len(group2_vals) < 5000 else stats.shapiro(pd.Series(group2_vals).sample(5000))[1]
        normality_passed = (shap_p1 > 0.05) and (shap_p2 > 0.05)
        
        # Test Homogeneity
        levene_stat, levene_p = stats.levene(group1_vals, group2_vals)
        homogeneity_passed = (levene_p > 0.05)
        
        assumptions = [
            {"test": "Normality", "passed": bool(normality_passed), "p_value": float(min(shap_p1, shap_p2))},
            {"test": "Homogeneity", "passed": bool(homogeneity_passed), "p_value": float(levene_p)}
        ]
        
        if not normality_passed and payload.run_fallback:
            test_used = "Mann-Whitney U"
            fallback_triggered = True
            stat, p_val = stats.mannwhitneyu(group1_vals, group2_vals, alternative='two-sided')
            df_val = float(len(group1_vals) + len(group2_vals) - 2)
            results = {
                "statistic": float(stat),
                "p_value": float(p_val),
                "df": df_val,
                "group1_mean": float(np.mean(group1_vals)),
                "group2_mean": float(np.mean(group2_vals))
            }
        else:
            equal_var = bool(homogeneity_passed)
            stat, p_val = stats.ttest_ind(group1_vals, group2_vals, equal_var=equal_var)
            if not equal_var:
                test_used = "Welch T-test"
                # Welch-Satterthwaite df
                v1, v2 = np.var(group1_vals, ddof=1), np.var(group2_vals, ddof=1)
                n1, n2 = len(group1_vals), len(group2_vals)
                df_val = (v1/n1 + v2/n2)**2 / ((v1/n1)**2/(n1-1) + (v2/n2)**2/(n2-1))
            else:
                test_used = "Independent T-test"
                df_val = float(len(group1_vals) + len(group2_vals) - 2)
                
            results = {
                "statistic": float(stat),
                "p_value": float(p_val),
                "df": float(df_val),
                "group1_mean": float(np.mean(group1_vals)),
                "group2_mean": float(np.mean(group2_vals)),
                "group1_std": float(np.std(group1_vals, ddof=1)),
                "group2_std": float(np.std(group2_vals, ddof=1))
            }
            
        narrative = ScientificNarrativeGenerator.independent_t_test(
            df_name="active_sheet",
            group_col=group_col,
            target_col=target_col,
            t_stat=float(stat),
            p_val=float(p_val),
            assumptions=assumptions
        )

    elif test_type == "ANOVA":
        group_col = payload.group_column
        target_col = payload.target_column
        
        if not group_col or group_col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Group column {group_col} not found")
        if not target_col or target_col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Target column {target_col} not found")
            
        unique_groups = df[group_col].dropna().unique()
        if len(unique_groups) < 2:
            raise HTTPException(status_code=400, detail="ANOVA requires at least 2 distinct groups")
            
        groups_vals = []
        group_names = []
        for g in unique_groups:
            vals = df[df[group_col] == g][target_col].dropna().values
            if len(vals) >= 3:
                groups_vals.append(vals)
                group_names.append(g)
                
        if len(groups_vals) < 2:
            raise HTTPException(status_code=400, detail="At least 2 groups must have at least 3 observations")
            
        # Test Normality
        norm_passed = True
        min_norm_p = 1.0
        for vals in groups_vals:
            p_val = stats.shapiro(vals)[1] if len(vals) < 5000 else stats.shapiro(pd.Series(vals).sample(5000))[1]
            min_norm_p = min(min_norm_p, p_val)
            if p_val <= 0.05:
                norm_passed = False
                
        # Test Homogeneity
        levene_stat, levene_p = stats.levene(*groups_vals)
        homogeneity_passed = (levene_p > 0.05)
        
        assumptions = [
            {"test": "Normality", "passed": bool(norm_passed), "p_value": float(min_norm_p)},
            {"test": "Homogeneity", "passed": bool(homogeneity_passed), "p_value": float(levene_p)}
        ]
        
        post_hoc = None
        if (not norm_passed or not homogeneity_passed) and payload.run_fallback:
            test_used = "Kruskal-Wallis"
            fallback_triggered = True
            stat, p_val = stats.kruskal(*groups_vals)
            df_val = float(len(groups_vals) - 1)
            
            # Bonferroni corrected pairwise Mann-Whitney U tests
            if p_val < 0.05 and len(groups_vals) >= 3:
                post_hoc = []
                comparisons = 0
                for i in range(len(groups_vals)):
                    for j in range(i+1, len(groups_vals)):
                        comparisons += 1
                for i in range(len(groups_vals)):
                    for j in range(i+1, len(groups_vals)):
                        mw_stat, mw_p = stats.mannwhitneyu(groups_vals[i], groups_vals[j])
                        adj_p = min(1.0, mw_p * comparisons)
                        post_hoc.append({
                            "group1": str(group_names[i]),
                            "group2": str(group_names[j]),
                            "mean_diff": float(np.mean(groups_vals[i]) - np.mean(groups_vals[j])),
                            "p_value": float(adj_p),
                            "significant": bool(adj_p < 0.05)
                        })
            results = {
                "statistic": float(stat),
                "p_value": float(p_val),
                "df": df_val,
                "group_means": {str(k): float(np.mean(v)) for k, v in zip(group_names, groups_vals)},
                "post_hoc": post_hoc
            }
        else:
            test_used = "One-way ANOVA"
            stat, p_val = stats.f_oneway(*groups_vals)
            df_between = len(groups_vals) - 1
            df_within = sum(len(g) for g in groups_vals) - len(groups_vals)
            
            # Tukey HSD Post-hoc
            if p_val < 0.05 and len(groups_vals) >= 3:
                try:
                    tukey_res = stats.tukey_hsd(*groups_vals)
                    post_hoc = []
                    for i in range(len(groups_vals)):
                        for j in range(i+1, len(groups_vals)):
                            post_hoc.append({
                                "group1": str(group_names[i]),
                                "group2": str(group_names[j]),
                                "mean_diff": float(tukey_res.statistic[i, j]),
                                "p_value": float(tukey_res.pvalue[i, j]),
                                "significant": bool(tukey_res.pvalue[i, j] < 0.05)
                            })
                except Exception as e:
                    logger.warning(f"Tukey HSD post hoc failed: {e}")
                    
            results = {
                "statistic": float(stat),
                "p_value": float(p_val),
                "df_between": float(df_between),
                "df_within": float(df_within),
                "group_means": {str(k): float(np.mean(v)) for k, v in zip(group_names, groups_vals)},
                "group_stds": {str(k): float(np.std(v, ddof=1)) for k, v in zip(group_names, groups_vals)},
                "post_hoc": post_hoc
            }
            
        narrative = ScientificNarrativeGenerator.one_way_anova(
            df_name="active_sheet",
            group_col=group_col,
            target_col=target_col,
            f_stat=float(stat),
            p_val=float(p_val),
            assumptions=assumptions
        )

    elif test_type == "REGRESSION":
        test_used = "Multiple Linear Regression"
        target_col = payload.target_column
        predictor_cols = payload.predictor_columns
        
        if not predictor_cols:
            raise HTTPException(status_code=400, detail="Regression requires predictor columns")
        if target_col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Target column {target_col} not found")
        for col in predictor_cols:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Predictor column {col} not found")
                
        # Drop rows with any NaN values in target or predictors
        cols = [target_col] + predictor_cols
        sub_df = df[cols].dropna()
        if len(sub_df) < len(predictor_cols) + 2:
            raise HTTPException(status_code=400, detail="Too few observations for linear regression fit")
            
        y = sub_df[target_col].values
        X = sub_df[predictor_cols].values
        n = len(sub_df)
        p = len(predictor_cols)
        
        # Fit OLS
        lr = LinearRegression()
        lr.fit(X, y)
        y_pred = lr.predict(X)
        
        # Calculate regression stats
        rss = np.sum((y - y_pred)**2)
        tss = np.sum((y - np.mean(y))**2)
        r2 = 1.0 - (rss / tss) if tss > 0.0 else 0.0
        adj_r2 = 1.0 - (1.0 - r2) * (n - 1) / (n - p - 1)
        
        mss = tss - rss
        f_stat = (mss / p) / (rss / (n - p - 1)) if rss > 0 and n - p - 1 > 0 else 0.0
        model_p = 1.0 - stats.f.cdf(f_stat, p, n - p - 1)
        
        # Coefficients table stats
        sigma_sq = rss / (n - p - 1)
        X_design = np.hstack([np.ones((n, 1)), X])
        try:
            cov_matrix = np.linalg.inv(X_design.T @ X_design) * sigma_sq
            var_diag = np.diag(cov_matrix)
            standard_errors = np.sqrt(var_diag)
        except Exception:
            standard_errors = [0.0] * (p + 1)
            
        estimates = [lr.intercept_] + list(lr.coef_)
        t_stats = [estimates[i] / standard_errors[i] if standard_errors[i] > 0 else 0.0 for i in range(p + 1)]
        coef_p_values = [2 * (1 - stats.t.cdf(abs(t_stats[i]), n - p - 1)) for i in range(p + 1)]
        
        coef_table = []
        coef_table.append({
            "variable": "Intercept",
            "estimate": float(estimates[0]),
            "standard_error": float(standard_errors[0]),
            "t_statistic": float(t_stats[0]),
            "p_value": float(coef_p_values[0])
        })
        for i, col in enumerate(predictor_cols):
            coef_table.append({
                "variable": col,
                "estimate": float(estimates[i+1]),
                "standard_error": float(standard_errors[i+1]),
                "t_statistic": float(t_stats[i+1]),
                "p_value": float(coef_p_values[i+1])
            })
            
        # VIF diagnostic
        vif_check = {}
        if p >= 2:
            for i, col in enumerate(predictor_cols):
                other_cols = [c for c in predictor_cols if c != col]
                X_other = sub_df[other_cols].values
                y_col = sub_df[col].values
                lr_vif = LinearRegression()
                lr_vif.fit(X_other, y_col)
                r2_vif = lr_vif.score(X_other, y_col)
                if r2_vif >= 1.0:
                    vif_check[col] = float('inf')
                else:
                    vif_check[col] = float(1.0 / (1.0 - r2_vif))
        else:
            for col in predictor_cols:
                vif_check[col] = 1.0
                
        results = {
            "r_squared": float(r2),
            "adjusted_r_squared": float(adj_r2),
            "f_statistic": float(f_stat),
            "model_p_value": float(model_p),
            "n_observations": int(n),
            "coefficients": coef_table,
            "vif": vif_check
        }
        
        narrative = ScientificNarrativeGenerator.linear_regression(
            df_name="active_sheet",
            independent_cols=predictor_cols,
            target_col=target_col,
            r2=float(r2),
            f_stat=float(f_stat),
            p_val=float(model_p),
            vif_check=vif_check
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported test type: {test_type}")

    # 4. Record event in SQLite audit log
    branch_id = f"br_{payload.client_id}_{context.active_branch_id}" if getattr(context, "active_branch_id", None) else f"br_{payload.client_id}_main"
    event_payload = {
        "test_type": payload.test_type,
        "target_column": payload.target_column,
        "group_column": payload.group_column,
        "predictor_columns": payload.predictor_columns,
        "results": {
            "test_used": test_used,
            "statistic": float(results.get("statistic", results.get("f_statistic", 0.0))),
            "p_value": float(results.get("p_value", results.get("model_p_value", 1.0))),
            "fallback_triggered": fallback_triggered
        }
    }
    try:
        EventSourcer.record_event(payload.client_id, branch_id, "STATS_TEST", event_payload)
    except Exception as e:
        logger.error(f"Failed to record event for STATS_TEST: {e}")

    return {
        "workspace_id": payload.client_id,
        "test_used": test_used,
        "fallback_triggered": fallback_triggered,
        "assumptions": assumptions,
        "results": results,
        "narrative": narrative
    }
