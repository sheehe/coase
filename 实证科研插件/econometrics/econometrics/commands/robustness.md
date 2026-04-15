---
name: robustness
description: Generate a robustness check plan and code for econometric analyses
tools:
  - Read
  - Write
  - Bash
---

# /robustness — Robustness Checks

When the user invokes /robustness, design and implement a comprehensive set of robustness checks appropriate for their analysis.

## Step 1: Identify the Base Analysis

Determine from context or ask the user:
- Which method was used (OLS, IV, DID, RDD, panel FE, time series)?
- What is the main specification and sample?
- What are the primary concerns about the identification strategy?

## Step 2: Generate Method-Specific Robustness Checks

### OLS Robustness

1. **Alternative standard errors**: Report HC1, HC3, clustered SE side by side
2. **Subsample analysis**: Split by key demographic or geographic subgroups
3. **Control variable sensitivity**: Stepwise addition of controls; Oster (2019) δ-test for coefficient stability
4. **Outlier sensitivity**: Remove top/bottom 1% of dependent variable
5. **Functional form**: Test log transformation; add quadratic terms
6. **RESET test**: Test for misspecification

```python
# Oster (2019) coefficient stability
# δ = (β_uncontrolled - β_controlled) / (β_controlled - β_hypothetical_omitted)
# δ > 1 suggests OVB unlikely to explain the full effect
delta = (beta_baseline - beta_controlled) / (beta_controlled - 0)
print(f"Oster delta: {delta:.3f} (>1 suggests robust)")
```

### IV/2SLS Robustness

1. **Instrument strength**: Report F-stat, partial R², Shea's partial R²
2. **Alternative instruments**: Add or swap instruments; compare estimates
3. **LIML vs 2SLS**: Check robustness to weak instruments
4. **Control set sensitivity**: Add/remove controls in first and second stage
5. **Placebo instrument**: Use an instrument that should have no first-stage effect

```stata
* Stata — compare 2SLS, LIML, and OLS
ivregress 2sls y w (x = z), robust
ivregress liml y w (x = z), robust
reg y x w, robust
```

### DID Robustness

1. **Pre-trend test**: Event study with 3+ pre-periods; joint F-test of pre-treatment dummies = 0
2. **Placebo treatment dates**: Assign treatment 1–2 years earlier; effect should be zero
3. **Alternative control groups**: Restrict to comparable units; change comparison group
4. **Staggered design estimators**: Compare TWFE, Callaway-Sant'Anna, Sun-Abraham
5. **Inference method**: Wild cluster bootstrap (if few clusters)

```r
# Wild cluster bootstrap (if clusters < 30)
library(fwildclusterboot)
boot_did <- boottest(twfe_model, clustid = "entity_id",
                     param = "treat_post", B = 9999)
print(boot_did)
```

### RDD Robustness

1. **Bandwidth sensitivity**: Report estimates at 50%, 75%, 100%, 125%, 150% of optimal BW
2. **Polynomial order**: Compare p=1, p=2, p=3
3. **Kernel type**: Compare triangular, uniform, Epanechnikov
4. **Donut-hole**: Exclude observations within 1, 2, 3 units of cutoff
5. **Placebo cutoffs**: Run RDD at alternative cutoffs away from actual cutoff
6. **Covariate balance**: RDD on pre-determined covariates should yield null

### Panel FE Robustness

1. **Alternative SE clustering**: Entity-level vs state-level vs two-way clustered
2. **Sample period sensitivity**: Vary start/end dates
3. **Dropping outlier units/years**: Jackknife by unit or year
4. **One-way vs two-way FE**: Add/remove time fixed effects
5. **Dynamic specification**: Add lagged dependent variable

### Time Series Robustness

1. **Alternative lag lengths**: AIC-optimal vs BIC-optimal vs sequential testing
2. **Structural break tests**: Chow test, Zivot-Andrews
3. **Alternative estimation window**: Expand/contract sample
4. **Sub-period analysis**: Estimate over pre/post break periods
5. **Forecast comparison**: ARIMA vs Random Walk; report RMSE ratio

## Step 3: Generate Robustness Table

Produce a structured table showing:
- Column (1): Main specification
- Columns (2)–(N): Each robustness variant
- Rows: Main coefficient of interest, SE, N, notes

```r
# R — create robustness table with modelsummary
library(modelsummary)
modelsummary(
  list("Main" = m1, "Alt SE" = m2, "Subsample" = m3, "Log Y" = m4),
  coef_map = c("treat_post" = "Treatment Effect"),
  gof_omit = "AIC|BIC|Log",
  stars = TRUE,
  title = "Robustness Checks"
)
```

## Step 4: Summarize and Report

- State which specifications yield stable estimates and which show changes
- Explain what any deviations imply about the main result
- Recommend the most credible specification based on the checks
- Highlight if the main result holds across all reasonable specifications

## Step 5: Format Output Table

Use the `table` skill to produce a publication-ready robustness table:
- Save as `tables/table_robustness.tex` (LaTeX) and `.csv` (raw)
- Column headers: (1) Main, (2)–(N) each robustness variant
- Include row: "Main coefficient", SE in parentheses, N, FE indicators

### Robustness Table: LaTeX Layout

Robustness tables are almost always wide (spec label + description + 4–6 numeric columns). Always use landscape orientation and a trimmed description column:

```latex
% Recommended structure for robustness table body file
\begin{landscape}
\begin{table}[ht]
\centering
\caption{\textbf{Robustness Checks: ...}}
\label{tab:robustness}
\begin{threeparttable}
{\footnotesize\setlength{\tabcolsep}{5pt}
\begin{tabular}{l p{5.5cm} c c c c c}
\toprule
Spec. & Description & $\hat{\beta}$ & SE & $p$-val & $N$ & $R^2$ \\
\midrule
\textbf{R1} & \textbf{Main specification} & ... \\
R2 & Alternative SE clustering & ... \\
...
\bottomrule
\end{tabular}}
\begin{tablenotes}[flushleft]\small
\item \textit{Notes}: Brief note. SE clustered at [level].
$^{***}p<0.01$, $^{**}p<0.05$, $^{*}p<0.10$.
\end{tablenotes}
\end{threeparttable}
\end{table}
\end{landscape}
```

### Oster (2019) Coefficient Stability Row

The Oster δ result is best placed as a separate section at the bottom of the robustness table, **not** as an additional row with the same column structure as the regression specs. A δ value doesn't have an SE or R², so forcing it into the standard columns creates a row full of dashes that wastes space and confuses readers.

Use a `\midrule` separator and a spanning cell:

```latex
\midrule
\multicolumn{7}{l}{\textit{Oster (2019) Coefficient Stability}} \\
\quad $\delta$ &
  \multicolumn{6}{l}{%
    $\delta = -2{,}738$; \quad
    $|\delta| \gg 1$ implies OVB implausibly large to overturn result.} \\
\bottomrule
```

Keep the text in the `\multicolumn` cell short enough to fit on one line in landscape mode (under ~55 characters of text + math). If the interpretation needs more space, move it to the `tablenotes` paragraph instead:

```latex
% Alternative: reference in tablenotes
\quad $\delta$ & \multicolumn{6}{l}{$\delta = -2{,}738$} \\
\bottomrule
...
\begin{tablenotes}\small
\item Oster (2019) $\delta$ is the ratio of selection on unobservables to
observables required to attribute the entire result to omitted variable bias.
$|\delta| \gg 1$ implies the result is robust to OVB.
\end{tablenotes}
```

## See Also

- `/diagnose` — run diagnostics first to identify which robustness checks are most needed
- `/analyze` — return here if a robustness check suggests the main specification needs revision
- `/interpret` — interpret the main result before running robustness
- Skill: `table` — format and export the robustness table to LaTeX
- Skill: `synthetic-control` — robustness for synthetic control (donor pool sensitivity, placebo tests)
- Skill: `ml-causal` — heterogeneity and specification robustness for causal ML methods
