---
name: interpret
description: Interpret econometric output — regression tables, test statistics, and model diagnostics
tools:
  - Read
---

# /interpret — Interpret Econometric Results

When the user invokes /interpret and provides regression output or a results table, interpret the findings thoroughly and accurately.

## Interpretation Protocol

### 1. Identify the Model Type

Determine what type of model produced the output:
- OLS / GLS / WLS
- IV / 2SLS
- Fixed Effects / Random Effects panel model
- DID (TWFE)
- RDD (rdrobust)
- ARIMA / VAR

Tailor the interpretation to the specific model.

### 2. Coefficient Interpretation

For each reported coefficient:
- State the direction and magnitude of the effect
- Use the correct interpretation for the functional form (level-level, log-level, log-log, etc.)
- Translate to substantive / economic significance, not just statistical significance
- Apply the correct units (e.g., "a one-unit increase in X is associated with a β-unit change in Y")

**Common functional forms:**
- Level-Level: "A one-unit increase in X leads to a β-unit change in Y"
- Log-Level: "A one-unit increase in X leads to approximately β×100% change in Y"
- Log-Log: "A 1% increase in X leads to approximately β% change in Y (elasticity)"
- Interaction term: "The effect of X₁ differs by X₂; the total marginal effect is β₁ + β₃·X₂"

### 3. Statistical Significance

Explain:
- Which coefficients are statistically significant and at what level
- What the p-values and confidence intervals imply about precision
- Caution: distinguish statistical significance from economic importance

### 4. Model Fit

Interpret:
- R² / adjusted R²: proportion of variance explained (for OLS)
- F-statistic: joint significance of all regressors
- For IV: first-stage F-statistic (relevance), Sargan test (overidentification)
- For panel: within R² vs between R²
- For ARIMA: AIC/BIC, residual diagnostics

### 5. Diagnostic Flags

Identify and explain any issues in the output:
- **Low first-stage F-stat (< 10)**: weak instruments warning
- **Significant Sargan/Hansen**: instruments may be invalid
- **Breusch-Pagan significant**: heteroskedasticity present; check SE type used
- **DW statistic far from 2**: autocorrelation in residuals
- **Large VIF**: multicollinearity may inflate SE
- **Non-parallel pre-trends**: DID validity concern

### 6. Causal vs. Correlational Language

Adjust the language based on identification strategy:
- OLS without instruments: use "associated with" or "correlates with"
- IV / RDD / DID with valid design: use "causes", "effect of", "impact of"
- Always flag endogeneity concerns if present

### 7. Summary Statement

Conclude with 2–3 sentences summarizing: the main finding, its significance, any important caveats, and what it implies for the research question.

## Example Output Structure

> **Main Finding**: A one-standard-deviation increase in [X] is associated with a [β]-unit [increase/decrease] in [Y] (p < 0.05). This effect is both statistically and economically meaningful, representing approximately [X]% of the sample mean.
>
> **Caveats**: The coefficient on [control variable] is not significant, suggesting [interpretation]. Note that this OLS estimate may be biased if [endogeneity concern]; consider IV or RDD if an appropriate instrument can be found.

## See Also

- `/diagnose` — run diagnostics first if you have not yet validated the model
- `/robustness` — test whether the interpretation holds under alternative specifications
- `/method` — write up the empirical strategy and results in academic prose
- `/write` — draft the results section of your paper using this interpretation
- Skills: `ols-regression`, `iv-estimation`, `did-analysis`, `rdd-analysis`, `panel-data` — contain method-specific interpretation guidance
