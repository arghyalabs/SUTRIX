import scipy.stats as stats
from typing import Dict, Any, List

class ScientificNarrativeGenerator:
    """
    Deterministic template-driven generator for Scientific Narrative Reports™ and Explainable Analytics™.
    Binds directly to statistical output objects to compile publication-ready paragraphs.
    """

    @staticmethod
    def independent_t_test(df_name: str, group_col: str, target_col: str, t_stat: float, p_val: float, assumptions: List[Dict[str, Any]]) -> str:
        normality_passed = all(a['passed'] for a in assumptions if a['test'] == 'Normality')
        variance_passed = all(a['passed'] for a in assumptions if a['test'] == 'Homogeneity')

        narrative = (
            f"An independent-samples t-test was conducted on dataset '{df_name}' to evaluate "
            f"if significant differences exist in mean values of target metric '{target_col}' "
            f"across the two groups defined by '{group_col}'. "
        )

        if normality_passed and variance_passed:
            narrative += "Pre-test assumption verification confirmed normal distribution (Shapiro-Wilk) and homogeneity of variances (Levene's test). "
        else:
            violations = []
            if not normality_passed: violations.append("normality")
            if not variance_passed: violations.append("homogeneity of variance")
            narrative += f"Assumption testing indicated deviations from {" and ".join(violations)}, "
            if not normality_passed:
                narrative += "suggesting a non-parametric Mann-Whitney U test would provide a more robust evidence basis. "
            else:
                narrative += "suggesting Welch's t-test correction. "

        if p_val < 0.05:
            narrative += (
                f"The analysis revealed a statistically significant difference between the group means "
                f"(t-statistic = {t_stat:.4f}, p = {p_val:.4e}). The null hypothesis of equal means is rejected."
            )
        else:
            narrative += (
                f"The analysis did not identify a statistically significant difference "
                f"between the evaluated groups (t-statistic = {t_stat:.4f}, p = {p_val:.4f}). There is insufficient evidence "
                f"to reject the null hypothesis of equal group means."
            )
        return narrative

    @staticmethod
    def one_way_anova(df_name: str, group_col: str, target_col: str, f_stat: float, p_val: float, assumptions: List[Dict[str, Any]]) -> str:
        normality_passed = all(a['passed'] for a in assumptions if a['test'] == 'Normality')
        variance_passed = all(a['passed'] for a in assumptions if a['test'] == 'Homogeneity')

        narrative = (
            f"A one-way Analysis of Variance (ANOVA) was executed on dataset '{df_name}' to compare "
            f"the effect of categorical variable '{group_col}' on continuous target metric '{target_col}'. "
        )

        if normality_passed and variance_passed:
            narrative += "Pre-test assumption verification confirmed normality of group residuals (Shapiro-Wilk) and equal variances across cohorts (Levene's test). "
        else:
            violations = []
            if not normality_passed: violations.append("normality")
            if not variance_passed: violations.append("homogeneity of variance")
            narrative += (
                f"Pre-test assumption checks indicated violations of {', '.join(violations)}. "
                f"Consequently, a non-parametric Kruskal-Wallis test is recommended to verify significance without distributional assumptions. "
            )

        if p_val < 0.05:
            narrative += (
                f"The ANOVA F-test confirmed statistically significant differences in means "
                f"across the defined groups (F-statistic = {f_stat:.4f}, p = {p_val:.4e}). Post-hoc pairwise evaluations "
                f"(e.g. Tukey HSD) should be conducted to isolate specific cohort differences."
            )
        else:
            narrative += (
                f"The ANOVA did not detect statistically significant differences "
                f"between group means (F-statistic = {f_stat:.4f}, p = {p_val:.4f}). Group membership does not significantly "
                f"explain the variance observed in '{target_col}'."
            )
        return narrative

    @staticmethod
    def linear_regression(df_name: str, independent_cols: List[str], target_col: str, r2: float, f_stat: float, p_val: float, vif_check: Dict[str, float]) -> str:
        ind_str = ", ".join(independent_cols)
        narrative = (
            f"A multiple linear regression analysis was performed on dataset '{df_name}' to evaluate "
            f"how the independent variable(s) [{ind_str}] predict the continuous outcome '{target_col}'. "
        )

        # Check multicollinearity via VIF
        collinear_vars = [k for k, v in vif_check.items() if v > 5.0]
        if collinear_vars:
            narrative += (
                f"Warning: Multicollinearity diagnostics identified high Variance Inflation Factors "
                f"(VIF > 5.0) for [{', '.join(collinear_vars)}], suggesting collinear features are inflating standard errors. "
            )
        else:
            narrative += "Variance Inflation Factors (VIF) were below 5.0 for all covariates, confirming no significant multicollinearity. "

        narrative += f"The overall model fit was registered with an R-squared of {r2:.4f}, explaining {r2*100:.2f}% of the variance in the target. "
        
        if p_val < 0.05:
            narrative += (
                f"The overall regression model was statistically significant "
                f"(F-statistic = {f_stat:.4f}, p = {p_val:.4e}), suggesting the set of predictors significantly improves "
                f"prediction accuracy over the baseline mean model."
            )
        else:
            narrative += (
                f"The regression model did not reach statistical significance "
                f"(F-statistic = {f_stat:.4f}, p = {p_val:.4f}), indicating the predictors do not explain a significant portion "
                f"of the variance in '{target_col}'."
            )
        return narrative
