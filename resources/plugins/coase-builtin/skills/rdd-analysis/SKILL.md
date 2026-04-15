---
name: rdd-analysis
description: Run regression-discontinuity designs with bandwidth, manipulation, and graphical diagnostics
---


# Regression Discontinuity Design (RDD) Skill

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when a threshold-based design is plausible and local randomization or continuity can be argued.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.

This skill covers sharp and fuzzy RDD: identification assumptions, bandwidth selection, local polynomial estimation, validity tests, and reporting standards for academic papers.

## Core Logic

RDD exploits a known threshold in a continuous "running variable" (X) that determines treatment assignment. Units just above and below the cutoff (c) are comparable on all dimensions except treatment.

**Sharp RDD**: Treatment perfectly determined by crossing cutoff
- T_i = 1 if X_i 鈮?c, T_i = 0 if X_i < c
- Estimand: Average treatment effect at the cutoff (蟿_SRD)

**Fuzzy RDD**: Crossing cutoff increases probability of treatment (like an instrument)
- Use when there's non-compliance around the cutoff
- Estimand: LATE at the cutoff (蟿_FRD = reduced form / first stage)

## RDD Assumptions

1. **Continuity of conditional expectation**: E[Y(0)|X] and E[Y(1)|X] are continuous at X = c
   - Means: units cannot precisely manipulate running variable to select into treatment
2. **No other discontinuities**: Nothing else changes discontinuously at the cutoff
3. **Bandwidth continuity**: Observations near cutoff are locally valid comparisons

## Complete RDD Workflow

### Step 1: Visualize the Discontinuity

Always plot the raw data with binned means before any regression.

```python
# Python

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when a threshold-based design is plausible and local randomization or continuity can be argued.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
import matplotlib.pyplot as plt
import numpy as np

# Bin the running variable

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when a threshold-based design is plausible and local randomization or continuity can be argued.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
df['bin'] = pd.cut(df['running_var'], bins=50)
bin_means = df.groupby('bin')[['running_var', 'y']].mean().reset_index()

plt.figure(figsize=(10, 6))
plt.scatter(bin_means['running_var'], bin_means['y'], s=30, color='steelblue')
plt.axvline(x=cutoff, color='red', linestyle='--', label='Cutoff')
plt.xlabel('Running Variable'); plt.ylabel('Outcome')
plt.title('RDD: Binned Scatter Plot')
plt.legend(); plt.show()
```

```r
# R (rdplot from rdrobust)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when a threshold-based design is plausible and local randomization or continuity can be argued.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(rdrobust)
rdplot(y = df$y, x = df$running_var, c = cutoff,
       title = "RDD Binned Scatter", x.label = "Running Variable",
       y.label = "Outcome")
```

```stata
rdplot y running_var, c(cutoff) graph_options(title("RDD Visualization"))
```

### Step 2: Bandwidth Selection

**Default**: Use Imbens-Kalyanaraman (IK) or Calonico-Cattaneo-Titiunik (CCT) optimal bandwidth.

```python
from rdrobust import rdrobust
result = rdrobust(df['y'], df['running_var'], c=cutoff)
print(result.summary())
```

```r
rdbwselect(y = df$y, x = df$running_var, c = cutoff)
```

```stata
rdbwselect y running_var, c(cutoff) all
```

### Step 3: Main RDD Estimate

```python
# Python (rdrobust) 鈥?triangular kernel, local linear

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when a threshold-based design is plausible and local randomization or continuity can be argued.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
result = rdrobust(y=df['y'], x=df['running_var'], c=cutoff,
                  kernel='triangular', p=1)
print(result.summary())
```

```r
# R

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when a threshold-based design is plausible and local randomization or continuity can be argued.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
main_rdd <- rdrobust(y = df$y, x = df$running_var, c = cutoff,
                     kernel = "triangular", p = 1)
summary(main_rdd)
```

```stata
rdrobust y running_var, c(cutoff) kernel(triangular) p(1)
```

### Step 4: Validity Tests (All Required)

#### 4a. Density/Manipulation Test (McCrary Test)

H鈧€: No discontinuity in density of running variable at cutoff

```python
from rdrobust import rddensity
density_test = rddensity(df['running_var'], c=cutoff)
print(density_test.summary())
```

```r
library(rddensity)
rdd_density <- rddensity(df$running_var, c = cutoff)
summary(rdd_density)
rdplotdensity(rdd_density, df$running_var)
```

```stata
rddensity running_var, c(cutoff)
```

**Interpretation**: p > 0.05 鈫?no bunching; manipulation unlikely 鉁?
#### 4b. Covariate Balance (Placebo Outcome Tests)

Run RDD on pre-determined covariates 鈥?should find no discontinuity.

```r
for (cov in c("age", "income_pre", "gender")) {
  res <- rdrobust(y = df[[cov]], x = df$running_var, c = cutoff)
  cat(cov, ": coef =", res$coef[1], ", p =", res$pv[3], "\n")
}
```

#### 4c. Placebo Cutoff Tests

Run RDD at fake cutoffs above and below actual cutoff 鈥?should find no effects.

```r
for (fake_c in c(cutoff - 5, cutoff + 5)) {
  df_sub <- df[df$running_var < cutoff, ]  # Use only control side
  res <- rdrobust(df_sub$y, df_sub$running_var, c = fake_c)
  cat("Placebo c =", fake_c, ": coef =", res$coef[1], "\n")
}
```

#### 4d. Bandwidth Sensitivity

Report estimates at 50%, 75%, 125%, 150% of optimal bandwidth.

```r
bw_opt <- rdbwselect(df$y, df$running_var, c = cutoff)$bws[1,1]
for (mult in c(0.5, 0.75, 1, 1.25, 1.5)) {
  res <- rdrobust(df$y, df$running_var, c = cutoff, h = bw_opt * mult)
  cat("BW =", round(bw_opt*mult,2), ": coef =", round(res$coef[1],3),
      ", p =", round(res$pv[3],3), "\n")
}
```

## Fuzzy RDD

```r
# R 鈥?fuzzy RDD (uses crossing as instrument for actual treatment)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when a threshold-based design is plausible and local randomization or continuity can be argued.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
fuzzy_rdd <- rdrobust(y = df$y, x = df$running_var, c = cutoff,
                      fuzzy = df$actual_treatment)
summary(fuzzy_rdd)
```

```stata
rdrobust y running_var, c(cutoff) fuzzy(actual_treatment)
```

## Reporting Standards

Report in this order:
1. **Binned scatter plot** showing discontinuity visually
2. **Main estimate** with optimal CCT bandwidth, triangular kernel, local linear
3. **Sensitivity table**: estimates across bandwidth multiples and polynomial orders
4. **Validity tests**: density test (McCrary), covariate balance, placebo cutoffs
5. **Sample size**: N total, N within bandwidth (left and right)

**Key sentence template for papers**:
> "We estimate the RDD using a local linear regression with a triangular kernel and the CCT optimal bandwidth (h = [X]). The point estimate at the cutoff is [尾] (SE = [se], p = [p])."


## Common Pitfalls

- **Using global polynomial regression**: High-order global polynomials (e.g., 5th degree) overfit and produce misleading results 鈥?always use local linear or local quadratic
- **Not showing the binned scatter plot**: The visual discontinuity is crucial for credibility 鈥?always include it
- **Ignoring manipulation**: A failed McCrary test means your RDD is fundamentally compromised 鈥?address the sorting concern
- **Reporting only one bandwidth**: Show sensitivity across 50%鈥?50% of optimal bandwidth to demonstrate robustness
- **Using RDD far from cutoff**: RDD estimates are valid only at the cutoff 鈥?do not extrapolate to units far from the threshold

## Working With Other Coase Skills

- This usually follows `stats` and `data-cleaning` to confirm the running variable and threshold definition.
- Send final results and plots to `table`, `figure`, and `paper-writing`.
- Do not rely on old `/diagnose`, `/robustness`, or `/plot` commands; do the checks and visuals inside the skill.

