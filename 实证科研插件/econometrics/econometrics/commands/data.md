---
name: data
description: Orchestrate the full data preparation pipeline from acquisition to summary statistics
tools:
  - Read
  - Write
  - Bash
---

# /data — Data Preparation Pipeline

When the user invokes /data, guide them through the complete data pipeline: acquire, clean, and describe. Each step delegates to the appropriate skill.

## Step 1: Acquire

Ask the user:
- Do you already have a dataset, or do you need to fetch data from an external source?
- If fetching: which source? (FRED, World Bank, BLS, Census, IPUMS, Yahoo Finance, custom API)
- What variables and time range do you need?

If the user needs data from an external source, use the `data-fetcher` skill:
- Generate API authentication and download code
- Save raw data to `data/raw/[source_name].[csv|dta]`
- Log data vintage and retrieval date in `data/raw/data_log.md`

If the user already has data, skip to Step 2.

## Step 2: Clean

Use the `data-cleaning` skill to prepare the raw dataset:

- Inspect variable types, missing values, and outliers
- Standardize variable names (snake_case)
- Handle missingness (listwise deletion, imputation, or flag-and-keep based on user preference)
- Construct derived variables (lags, logs, interactions, treatment indicators)
- Merge multiple data sources if needed
- Save cleaned dataset to `data/clean/[project_name]_clean.[csv|dta|parquet]`

Produce a data cleaning log documenting every transformation applied.

## Step 3: Describe

Use the `stats` skill to generate summary statistics:

- **Table 1**: Full sample descriptive statistics (N, mean, SD, min, max, p25, p75)
- **Balance table**: Treatment vs control group comparison with p-values (if treatment variable exists)
- **Missingness report**: Variables with >5% missing; flag potential MCAR/MAR/MNAR issues
- **Correlation matrix**: Key variables (flag pairs with |r| > 0.8)

Save output to:
- `tables/table1_descriptive.tex` (LaTeX) and `.csv` (raw)
- `tables/table_balance.tex` if treatment variable exists

## Step 4: Output and Next Steps

Summarize what was produced:
- Dataset location and dimensions (N observations × K variables)
- Key data quality issues found and how they were handled
- Notable patterns from summary statistics (distributional issues, outliers, imbalance)

Suggest next step based on context:
- Research question identified → `/analyze` to select and run estimation method
- Data quality concerns remain → `/diagnose` to run formal diagnostic tests
- Ready to describe data for a paper → `/write` (data section)
