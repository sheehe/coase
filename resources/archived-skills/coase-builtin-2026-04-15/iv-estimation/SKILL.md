---
name: iv-estimation
description: Run instrumental-variables, 2SLS, and weak-instrument diagnostics
---


# Instrumental Variables & Treatment Effects Skill

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.

This skill covers IV/2SLS estimation and propensity score matching (PSM) for causal inference when treatment is endogenous. It helps identify valid instruments, run 2SLS, test instrument validity, and implement PSM.

## When to Use IV vs PSM

| Method | Use When |
|--------|----------|
| **IV / 2SLS** | Treatment is endogenous; a valid instrument exists |
| **PSM** | Selection on observables assumption is credible; rich covariate data |
| **OLS + controls** | Selection on observables, limited instruments |

## IV / 2SLS Framework

### Conditions for a Valid Instrument Z for endogenous X

1. **Relevance**: Cov(Z, X) 鈮?0 鈥?Z must be correlated with the endogenous regressor
2. **Exclusion restriction**: Cov(Z, 蔚) = 0 鈥?Z affects Y only through X (cannot be tested directly)
3. **Independence**: Z is as-good-as-randomly assigned (exogenous)

### Two-Stage Least Squares Procedure

**Stage 1**: Regress endogenous X on instruments Z and exogenous controls W
- X虃 = 纬鈧€ + 纬鈧乑 + 纬鈧俉 + v
- Check F-statistic > 10 (Stock-Yogo rule of thumb); ideally > 16.4 (5% bias threshold)

**Stage 2**: Regress Y on predicted X虃 and controls W
- Y = 尾鈧€ + 尾鈧乆虃 + 尾鈧俉 + 蔚
- SE must be corrected for the two-stage estimation (done automatically by software)

### Quick Code Templates

```python
# Python (linearmodels)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
from linearmodels.iv import IV2SLS

# Formula: dependent ~ exogenous [endogenous ~ instruments]

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
model = IV2SLS.from_formula(
    'y ~ 1 + w1 + w2 + [x_endog ~ z1 + z2]', data=df
)
result = model.fit(cov_type='robust')
print(result.summary)

# First-stage diagnostics

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
print(result.first_stage.diagnostics)
# Check: partial F-stat, Shea partial R虏

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
```

```r
# R (AER)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(AER)
iv_model <- ivreg(y ~ x_endog + w1 + w2 | z1 + z2 + w1 + w2, data = df)
summary(iv_model, diagnostics = TRUE)
# Shows: weak instruments F-test, Wu-Hausman endogeneity test, Sargan overID test

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
```

```stata
* Stata
ivregress 2sls y w1 w2 (x_endog = z1 z2), robust first
estat firststage      // First-stage diagnostics
estat endogenous      // Wu-Hausman test
estat overid          // Sargan-Hansen overidentification test
```

## Key Diagnostic Tests

| Test | Null Hypothesis | Interpretation |
|------|-----------------|----------------|
| **First-stage F-stat** | Instruments are weak | F > 10 鈫?relevant instruments |
| **Wu-Hausman** | X is exogenous (OLS consistent) | p < 0.05 鈫?endogeneity confirmed, use IV |
| **Sargan-Hansen** | All instruments valid (overID only) | p > 0.05 鈫?instruments pass overID test |
| **Anderson-Rubin** | Robust to weak instruments | Use when F-stat is borderline |

## Propensity Score Matching (PSM)

### Assumptions
1. **Conditional independence** (unconfoundedness): Treatment T 鈯?Y(0), Y(1) | X
2. **Common support** (overlap): 0 < P(T=1|X) < 1 for all X

### PSM Procedure

```python
# Python

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
from sklearn.linear_model import LogisticRegression
import numpy as np

# Step 1: Estimate propensity scores

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
lr = LogisticRegression(max_iter=1000)
lr.fit(df[covariates], df['treatment'])
df['pscore'] = lr.predict_proba(df[covariates])[:, 1]

# Step 2: Check common support

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
import matplotlib.pyplot as plt
df.groupby('treatment')['pscore'].plot.hist(alpha=0.5, bins=30)

# Step 3: Match (nearest neighbor, 1:1 without replacement)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
treated = df[df['treatment'] == 1].copy()
control = df[df['treatment'] == 0].copy()

from sklearn.neighbors import NearestNeighbors
nn = NearestNeighbors(n_neighbors=1)
nn.fit(control[['pscore']])
distances, indices = nn.kneighbors(treated[['pscore']])

matched_control = control.iloc[indices.flatten()].copy()
matched_df = pd.concat([treated, matched_control])

# Step 4: Estimate ATT

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
att = matched_df.groupby('treatment')['y'].mean().diff().iloc[-1]
print(f"ATT: {att:.4f}")
```

```r
# R (MatchIt)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(MatchIt)
match_out <- matchit(treatment ~ x1 + x2 + x3, data = df,
                     method = "nearest", ratio = 1, replace = FALSE)
summary(match_out)

# Covariate balance

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
plot(match_out, type = "jitter")
plot(summary(match_out))

# Estimate ATT

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this when endogeneity is central and a credible instrument exists, including first-stage checks, exclusion discussion, and weak-IV diagnostics.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
matched_data <- match.data(match_out)
att_model <- lm(y ~ treatment, data = matched_data, weights = weights)
coeftest(att_model, vcov = vcovCL(att_model, ~subclass))
```

```stata
* Stata (psmatch2 from SSC)
psmatch2 treatment x1 x2 x3, outcome(y) neighbor(1) common
pstest x1 x2 x3
```

## Reporting IV Results

1. **Always show first-stage results** with F-statistic
2. **Report OLS alongside IV** to illustrate endogeneity bias direction
3. **State the exclusion restriction** argument explicitly 鈥?this cannot be statistically tested
4. **Interpret LATE not ATE**: IV estimates are local to compliers (those induced by instrument)
5. **Overidentification test**: report Sargan p-value when instruments > endogenous regressors


## Common Pitfalls

- **Using 2SLS with weak instruments without robust inference**: When F < 10, use LIML or Anderson-Rubin confidence sets instead of 2SLS
- **Not arguing for exclusion restriction**: The exclusion restriction cannot be tested statistically 鈥?you must make a convincing argument
- **Confusing LATE with ATE**: IV estimates the local average treatment effect for compliers, not the population average
- **Clustering SE at the wrong level in Bartik IV**: With shift-share instruments, inference should account for the exposure shares structure
- **Over-identifying without caution**: Adding more instruments improves efficiency but only if all are valid 鈥?a significant Sargan test means at least one instrument is invalid
- **Using PSM without checking common support**: If treated and control propensity score distributions barely overlap, matching is unreliable

## Working With Other Coase Skills

- This usually depends on prior justification from planning or `literature-review`.
- Results should often continue into `table`, `figure`, and `paper-writing`.
- Do not rely on the old `/diagnose` or `/robustness` commands; include diagnostics and robustness directly.

