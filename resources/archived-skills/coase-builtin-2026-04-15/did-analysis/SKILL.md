---
name: did-analysis
description: Run difference-in-differences, event-study, and staggered-adoption DID analysis
---


# Difference-in-Differences (DID) Skill

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for treatment-control or policy-shock settings, including parallel-trends checks, baseline DID, dynamic effects, and robustness.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.

This skill guides complete DID analysis: from assumption validation and model specification to staggered treatment designs and event study regressions. Designed for policy evaluation and natural experiment settings.

## Core DID Logic

DID compares the change in outcomes for a treatment group before and after treatment to the change for a control group over the same period.

**DID Estimator** = (炔_treat,post 鈭?炔_treat,pre) 鈭?(炔_ctrl,post 鈭?炔_ctrl,pre)

**Key Assumption (Parallel Trends)**: In the absence of treatment, the treatment group's outcome would have evolved in parallel with the control group.

## DID Workflow

1. **Design check**: Confirm treatment/control assignment and timing
2. **Parallel trends**: Test with pre-treatment event study regression
3. **Baseline regression**: 2脳2 DID or TWFE regression
4. **Staggered design check**: If adoption dates vary, use robust estimators
5. **Robustness**: Placebo treatment, alternative control groups, callaway-santanna

## Basic 2脳2 DID Model

```
Y_it = 尾鈧€ + 尾鈧伮稵reat_i + 尾鈧偮稰ost_t + 尾鈧兟?Treat_i 脳 Post_t) + 蔚_it

尾鈧?= DID estimate (ATT)
```

### Code Templates

```python
# Python 鈥?2脳2 DID with TWFE

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for treatment-control or policy-shock settings, including parallel-trends checks, baseline DID, dynamic effects, and robustness.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
import statsmodels.formula.api as smf

# Simple 2x2

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for treatment-control or policy-shock settings, including parallel-trends checks, baseline DID, dynamic effects, and robustness.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
model = smf.ols('y ~ treat + post + treat_post', data=df).fit(cov_type='HC3')

# TWFE with entity and time FE (preferred)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for treatment-control or policy-shock settings, including parallel-trends checks, baseline DID, dynamic effects, and robustness.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
from linearmodels.panel import PanelOLS
df_panel = df.set_index(['entity_id', 'year'])
twfe = PanelOLS(df_panel['y'], df_panel[['treat_post']],
                entity_effects=True, time_effects=True)
result = twfe.fit(cov_type='clustered', cluster_entity=True)
print(result.summary)
```

```r
# R 鈥?TWFE

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for treatment-control or policy-shock settings, including parallel-trends checks, baseline DID, dynamic effects, and robustness.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(plm); library(lmtest); library(sandwich)
panel_df <- pdata.frame(df, index = c("entity_id", "year"))
twfe <- plm(y ~ treat_post, data = panel_df, model = "within", effect = "twoways")
coeftest(twfe, vcov = vcovHC(twfe, cluster = "group"))
```

```stata
* Stata 鈥?TWFE with clustered SE
xtset entity_id year
xtreg y treat_post i.year, fe cluster(entity_id)
* Or equivalently:
reghdfe y treat_post, absorb(entity_id year) cluster(entity_id)
```

## Parallel Trends: Event Study Regression

Replace the single `treat_post` dummy with relative-time dummies to visualize pre-trends:

```stata
* Stata 鈥?event study
reghdfe y ib(-1).rel_time, absorb(entity_id year) cluster(entity_id)
coefplot, vertical yline(0) xline(0) ///
    title("Event Study: Pre/Post Treatment Effects") ///
    xlabel(, angle(45))
```

```r
# R 鈥?event study

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for treatment-control or policy-shock settings, including parallel-trends checks, baseline DID, dynamic effects, and robustness.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(fixest)
es_model <- feols(y ~ i(rel_time, treat, ref = -1) | entity_id + year,
                  data = df, cluster = ~entity_id)
iplot(es_model, xlab = "Periods relative to treatment")
```

**Interpreting the event study plot:**
- Pre-treatment coefficients 鈮?0 鈫?parallel trends assumption holds
- Pre-trend test: joint F-test for all pre-treatment coefficients = 0
- Post-treatment coefficients show dynamic treatment effects

## Staggered DID

When units adopt treatment at different times, standard TWFE can be biased (Callaway-Sant'Anna, Sun-Abraham).

```r
# R 鈥?Callaway-Sant'Anna estimator (csdid)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for treatment-control or policy-shock settings, including parallel-trends checks, baseline DID, dynamic effects, and robustness.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(did)
cs_result <- att_gt(yname = "y",
                    gname = "cohort_year",   # year of first treatment (0 if never treated)
                    idname = "entity_id",
                    tname  = "year",
                    xformla = ~x1 + x2,
                    data = df)

# Aggregate to average ATT

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for treatment-control or policy-shock settings, including parallel-trends checks, baseline DID, dynamic effects, and robustness.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
aggte(cs_result, type = "simple")   # Overall ATT
aggte(cs_result, type = "dynamic")  # Dynamic effects
ggdid(cs_result)
```

```r
# R 鈥?Sun-Abraham (fixest)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this for treatment-control or policy-shock settings, including parallel-trends checks, baseline DID, dynamic effects, and robustness.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(fixest)
sa_model <- feols(y ~ sunab(cohort_year, year) | entity_id + year,
                  data = df, cluster = ~entity_id)
iplot(sa_model)
```

```stata
* Stata 鈥?Callaway-Sant'Anna (csdid from SSC)
csdid y x1 x2, ivar(entity_id) time(year) gvar(cohort_year)
csdid_plot
```

## Robustness Checks for DID

1. **Placebo treatment dates**: assign fake treatment 1鈥? periods before actual treatment
2. **Placebo treatment groups**: run DID using only control units with a fake treatment
3. **Alternative control groups**: restrict to more comparable controls
4. **Continuous treatment intensity**: use dose-response DID

## Reporting Standards

- Report event study plot as Figure (essential for credibility)
- State the parallel trends assumption and supporting evidence
- Report DID coefficient with clustered SE (cluster at entity level)
- Discuss potential violations: anticipation effects, Ashenfelter's dip, spillovers
- For staggered designs, always use CS or SA estimators and explain why


## Common Pitfalls

- **Using TWFE with staggered treatment and heterogeneous effects**: Standard TWFE is biased 鈥?use Callaway-Sant'Anna, Sun-Abraham, or Borusyak-Jaravel-Spiess
- **Clustering at the treatment level**: Don't cluster at the individual level if treatment varies at the state level 鈥?cluster at the state level
- **Failing to reject pre-trends 鈮?parallel trends hold**: Low power is common; use Roth (2022) power analysis to assess
- **Ignoring anticipation effects**: If agents anticipate treatment, pre-treatment coefficients may be non-zero even with parallel trends
- **Not showing the event study plot**: Reviewers expect to see pre-trends visually 鈥?always include the event study figure

## Working With Other Coase Skills

- This usually follows `data-cleaning` and `stats`.
- Send results to `table` and `figure` for publication-grade outputs.
- Then use `paper-writing` for interpretation and drafting instead of old `/diagnose`, `/robustness`, or `/method` commands.

