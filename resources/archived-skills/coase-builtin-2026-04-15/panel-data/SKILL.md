---
name: panel-data
description: Run fixed-effects, random-effects, first-difference, and clustered panel-data models
---


# Panel Data Models Skill

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.

This skill covers panel data econometrics: pooled OLS, fixed effects (FE), random effects (RE), and two-way FE models. It guides model selection, assumption testing, and interpretation for longitudinal/panel datasets.

## Key Terminology

- **Panel dataset**: observations on N units (individuals, firms, countries) over T time periods
- **Balanced panel**: every unit observed in every period
- **Unbalanced panel**: some unit-period observations missing
- **Unobserved heterogeneity (伪岬?**: time-invariant unit-specific factors (e.g., firm culture, individual ability)

## Model Selection Framework

```
Start
 鈹溾攢 Is unobserved heterogeneity correlated with regressors?
 鈹?   鈹溾攢 YES 鈫?Fixed Effects (FE)
 鈹?   鈹斺攢 NO  鈫?Random Effects (RE) 鈥?test with Hausman
 鈹? 鈹溾攢 Are time effects important?
 鈹?   鈹溾攢 YES 鈫?Two-Way FE (entity + time dummies)
 鈹?   鈹斺攢 NO  鈫?One-Way FE
 鈹? 鈹斺攢 Need to estimate effect of time-invariant variables?
      鈹溾攢 YES 鈫?Random Effects or Mundlak/Correlated RE
      鈹斺攢 NO  鈫?Fixed Effects preferred
```

### Hausman Test Decision Rule
- H鈧€: RE is consistent (伪岬?uncorrelated with X)
- H鈧? FE is consistent but RE is not (伪岬?correlated with X)
- **p < 0.05**: Use Fixed Effects
- **p 鈮?0.05**: Random Effects is efficient

### Mundlak / Correlated Random Effects (CRE)

Use when you need RE to estimate time-invariant variable effects, but want to relax the strict exogeneity assumption of RE. CRE includes group means of time-varying regressors in the RE equation, making it equivalent to FE for those variables while still estimating time-invariant effects.

```r
# R 鈥?Mundlak CRE approach

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(plm); library(dplyr)

# Compute entity means of time-varying regressors

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
panel_df_cre <- df %>%
  group_by(entity_id) %>%
  mutate(x1_mean = mean(x1),
         x2_mean = mean(x2)) %>%
  ungroup()

panel_cre <- pdata.frame(panel_df_cre, index = c("entity_id", "time_var"))

# RE model augmented with group means (Mundlak approach):

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
cre_model <- plm(y ~ x1 + x2 + time_invariant_var + x1_mean + x2_mean,
                 data   = panel_cre,
                 model  = "random")
summary(cre_model)
# Coefficients on x1_mean, x2_mean test the correlation between 伪岬?and X

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# (equivalent to Hausman test; joint significance = prefer FE)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# Coefficient on time_invariant_var is identified via between variation

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
```

```stata
* Stata 鈥?Mundlak CRE
* Step 1: compute entity means
bysort entity_id: egen x1_mean = mean(x1)
bysort entity_id: egen x2_mean = mean(x2)

* Step 2: RE model with group means added
xtreg y x1 x2 time_invariant_var x1_mean x2_mean, re

* Test joint significance of group means (Mundlak test):
testparm x1_mean x2_mean
* p < 0.05 鈫?group means matter 鈫?prefer FE for time-varying regressors
```

## Quick Code Templates

### Fixed Effects

```python
# Python (linearmodels)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
from linearmodels.panel import PanelOLS
import pandas as pd

# Set multi-index: entity and time

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
df = df.set_index(['entity_id', 'time_var'])

model = PanelOLS(df['y'], df[['x1', 'x2']], entity_effects=True,
                 time_effects=True)  # Two-way FE
result = model.fit(cov_type='clustered', cluster_entity=True)
print(result.summary)
```

```r
# R (plm)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(plm)
panel_df <- pdata.frame(df, index = c("entity_id", "time_var"))

# One-way FE

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
fe_model <- plm(y ~ x1 + x2, data = panel_df, model = "within")

# Two-way FE

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
twfe_model <- plm(y ~ x1 + x2, data = panel_df, model = "within",
                  effect = "twoways")

# Clustered SE

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(lmtest); library(sandwich)
coeftest(fe_model, vcov = vcovHC(fe_model, cluster = "group"))
```

```stata
* Stata 鈥?Two-way FE with clustered SE
xtset entity_id time_var
xtreg y x1 x2 i.time_var, fe cluster(entity_id)
```

### Random Effects

```python
from linearmodels.panel import RandomEffects

re_model = RandomEffects(df['y'], df[['x1', 'x2']])
re_result = re_model.fit()
print(re_result.summary)
```

```r
re_model <- plm(y ~ x1 + x2, data = panel_df, model = "random")
summary(re_model)
```

```stata
xtreg y x1 x2, re
```

### Hausman Test

```python
from linearmodels.panel import compare
# Compare FE vs RE

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
print(compare({'FE': fe_result, 'RE': re_result}))
# Or use statsmodels hausman

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
```

```r
phtest(fe_model, re_model)
# p < 0.05 鈫?prefer Fixed Effects

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
```

```stata
hausman fe_estimates re_estimates
```

## Dynamic Panels and Arellano-Bond GMM

Use when the model includes a lagged dependent variable (Y岬⑩倻鈧嬧倎) in short-T panels. The within (FE) estimator is biased in this case (Nickell 1981 bias). Arellano-Bond uses lagged levels as instruments for the differenced equation.

**When to use**: Short T (T < 10), panel includes lagged DV, suspicion of endogenous regressors.

```r
# R 鈥?Arellano-Bond GMM (plm package)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(plm)

# Difference GMM (Arellano-Bond 1991)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
ab <- pgmm(
  y ~ lag(y, 1) + x1 + x2 | lag(y, 2:4),   # instruments: lags 2-4 of y
  data  = panel_df,
  effect = "individual",
  model  = "twosteps"   # two-step is asymptotically efficient
)
summary(ab, robust = TRUE)

# Key diagnostics:

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# AR(1): should be significant (differencing induces MA(1))

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# AR(2): should be insignificant (no serial correlation in levels)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# Hansen J test: p > 0.05 鈫?instruments are valid

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
```

```python
# Python 鈥?Arellano-Bond GMM (linearmodels)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# Note: linearmodels does not directly implement Arellano-Bond;

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# use the dedicated BetterArellano approach or wrap via R

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# Alternatively, use system GMM via a custom estimator:

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# pip install pydynpd

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
import pydynpd

# pydynpd syntax

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
command_str = "y L1.y x1 x2 | gmm(y, 2 4) iv(x1 x2)"
results = pydynpd.regression.abond(command_str, df, ["entity_id", "time_var"])
print(results.summary)
```

```stata
* Stata 鈥?Arellano-Bond with xtabond2 (preferred)
ssc install xtabond2

xtset entity_id time_var

* Difference GMM:
xtabond2 y L.y x1 x2, gmm(L.y, lag(2 4)) iv(x1 x2) ///
    twostep robust noleveleq

* System GMM (adds level equation with lagged differences as instruments):
xtabond2 y L.y x1 x2, gmm(L.y, lag(2 4)) iv(x1 x2) twostep robust

* Diagnostics reported automatically:
* - AR(1), AR(2) tests
* - Hansen J test of overidentifying restrictions
```

**Interpretation rules**:
- AR(1) significant, AR(2) insignificant 鈫?no second-order serial correlation in levels 鉁?- Hansen J p > 0.05 鈫?instruments jointly valid 鉁?- Too many instruments (> N) weakens the Hansen test 鈥?restrict lag range

## Standard Errors for Panel Data

| Situation | Recommended SE |
|-----------|---------------|
| Serial correlation within entities | Cluster by entity |
| Cross-sectional dependence | Driscoll-Kraay SE |
| Both serial + cross-sectional | Two-way clustering |
| Heteroskedasticity only | HC robust SE |

### Driscoll-Kraay and Two-Way Clustering Code

**Driscoll-Kraay SE**: Robust to cross-sectional dependence and serial correlation. Preferred for macro panels (small N, large T).

```r
# R 鈥?Driscoll-Kraay SE (sandwich package)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(plm); library(sandwich); library(lmtest)

fe_model <- plm(y ~ x1 + x2, data = panel_df, model = "within")

# Driscoll-Kraay SE (robust to cross-sectional and serial dependence):

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
coeftest(fe_model, vcov = vcovSCC(fe_model, type = "HC1", maxlag = 4))
# maxlag: number of lags for serial correlation (typically T^0.25)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
```

```stata
* Stata 鈥?Driscoll-Kraay SE
xtscc y x1 x2, fe lag(4)
* lag(4) = bandwidth parameter; use T^0.25 as a rule of thumb
```

**Two-way clustering**: Clusters at both entity and time level. Use when treatment varies at both levels.

```r
# R 鈥?Two-way clustering (sandwich)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(sandwich); library(lmtest)

# Manually compute two-way clustered SE:

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# V_twoway = V_entity + V_time - V_entity脳time

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for unit-time panels that need FE, RE, FD, clustered errors, and panel-specific identification discussion.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
vcov_entity <- vcovCL(fe_model, cluster = ~entity_id)
vcov_time   <- vcovCL(fe_model, cluster = ~time_var)
vcov_both   <- vcovCL(fe_model, cluster = ~entity_id + time_var)
coeftest(fe_model, vcov = vcov_both)
```

```stata
* Stata 鈥?Two-way clustering
xtreg y x1 x2 i.time_var, fe vce(cluster entity_id)  // cluster by entity only
* For two-way clustering (entity AND time):
reghdfe y x1 x2, absorb(entity_id time_var) vce(cluster entity_id time_var)
```

## Interpreting Fixed Effects Results

- FE coefficients identify **within-unit** variation only
- Cannot estimate effect of time-invariant variables (absorbed by unit FEs)
- Two-way FE removes both unit trends and aggregate time trends
- Always report whether entity FE, time FE, or both are included

## Reporting Standards

- State panel dimensions: N = [units], T = [periods], total obs
- Report whether SE are clustered (at entity level is standard)
- Specify which effects are included (entity, time, or both)
- Report F-test for joint significance of fixed effects
- Include Hausman test result when choosing FE over RE


## Common Pitfalls

- **Using RE when FE is appropriate**: If Hausman test rejects, RE is inconsistent 鈥?always test
- **Clustering at the wrong level**: Cluster SE at the level of treatment variation, not the individual level
- **Nickell bias**: Including lagged DV in short-T panels with FE is biased 鈥?use Arellano-Bond GMM
- **Ignoring cross-sectional dependence**: In macro panels (small N, large T), standard FE SE are invalid 鈥?use Driscoll-Kraay
- **Interpreting FE coefficients as between-unit effects**: FE estimates are purely within-unit; they cannot speak to cross-unit differences

## Working With Other Coase Skills

- This usually requires `data-cleaning` to define the panel index and handle missingness first.
- Results typically continue into `table`, `figure`, and `paper-writing`.
- Do not rely on old `/diagnose` or `/robustness` commands; include model comparison and robustness directly.

