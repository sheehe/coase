---
name: analyze
description: Start a full econometric analysis workflow for a dataset or research question
tools:
  - Read
  - Write
  - Bash
---

# /analyze — Econometric Analysis Workflow

When the user invokes /analyze, conduct a structured econometric analysis by following these steps:

## Step 1: Gather Context

Ask the user for:
- The research question or hypothesis to test
- The outcome variable (dependent variable)
- The key explanatory variables (independent variables / treatment)
- Data format (CSV, Stata .dta, R data, etc.) and location
- Preferred output language: Python, R, or Stata

If a file path or dataset is provided, read it and summarize its structure (N observations, variables, data types, missing values).

## Step 2: Recommend a Method

Based on the research question, recommend the appropriate estimator:

| Situation | Recommended Method |
|-----------|-------------------|
| Cross-section, no endogeneity | OLS (use /ols-regression skill) |
| Panel data available | Fixed/Random Effects (use /panel-data skill) |
| Treatment endogenous, instrument exists | IV/2SLS (use /iv-estimation skill) |
| Pre/post policy with control group | DID (use /did-analysis skill) |
| Threshold assignment rule | RDD (use /rdd-analysis skill) |
| Time series data | ARIMA/VAR (use /time-series skill) |
| Single treated unit, many controls | Synthetic Control (use /synthetic-control skill) |
| High-dimensional controls or heterogeneous CATE | ML Causal Inference (use /ml-causal skill) |

Explain the reasoning for the recommendation in plain language.

## Step 3: Generate Analysis Code

Produce complete, runnable code for the recommended method in the user's preferred language. Include:
- Data loading and cleaning steps
- Descriptive statistics table
- Main regression/model estimation
- Appropriate standard errors (robust or clustered)
- Key diagnostic tests
- Results summary

Save the code to a file named `analysis_[method].py` (or .R / .do) in the working directory.

## Step 3.5: Run Diagnostics (Mandatory)

Before interpreting results, call `/diagnose` to validate the model. Do not skip this step.

- `/diagnose` will run method-specific tests and return a pass/fail report
- If critical tests fail (e.g., weak instruments F < 10, pre-trends rejected, unit roots in levels), revise the specification before proceeding

## Step 4: Interpret Results

After the user runs the code and shares output:
- Explain the main coefficient estimates in plain language
- Note statistical significance and effect sizes
- Flag any diagnostic failures (e.g., weak instruments, pre-trends violation)
- Recommend follow-up robustness checks using `/robustness`

## Output Format

Present results as:

1. **Plain-language summary** (2–3 sentences): What is the estimated effect, how large is it, is it statistically significant?
2. **Key coefficient table**: Point estimate, SE, 95% CI, p-value for the main variable of interest
3. **Diagnostics summary**: Each test with Pass / Warning / Fail status
4. **Next steps**: Choose from the options below based on diagnostic results

| Situation | Next command |
|-----------|-------------|
| Diagnostics passed → interpret results | `/interpret` |
| Diagnostics failed → fix specification | `/diagnose` (re-run) |
| Ready for robustness checks | `/robustness` |
| Ready to write up | `/method`, then `/write` |
| Need to visualize results | `/plot` |

## See Also

- `/diagnose` — run formal diagnostic tests before interpreting
- `/robustness` — sensitivity analysis after main results confirmed
- `/interpret` — detailed interpretation of output
- `/plot` — visualize coefficients, event studies, binscatter
- Skills: `ols-regression`, `panel-data`, `iv-estimation`, `did-analysis`, `rdd-analysis`, `time-series`, `synthetic-control`, `ml-causal`
