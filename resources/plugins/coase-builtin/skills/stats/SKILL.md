---
name: stats
description: Run descriptive statistics, distribution checks, correlation work, and baseline diagnostics
---


# Descriptive Statistics & Summary Tables Skill

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.

This skill generates publication-quality summary statistics tables, balance tables, and correlation matrices 鈥?the essential "Table 1" found in every empirical economics paper.

## When to Use

- **Before any regression**: Summarize your sample to understand distributions and detect issues
- **For "Data" section of papers**: Standard Table 1 with means, SDs, and sample sizes
- **Treatment/control comparison**: Balance tables with t-tests or normalized differences
- **Variable relationships**: Correlation matrices for initial exploration

## Summary Statistics Table (Table 1)

### Python

```python
# Python 鈥?publication-quality summary stats

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
import pandas as pd

# Basic summary stats

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
desc = df[['income', 'age', 'education', 'hours_worked']].describe().T
desc = desc[['count', 'mean', 'std', 'min', '25%', '50%', '75%', 'max']]
desc.columns = ['N', 'Mean', 'SD', 'Min', 'P25', 'Median', 'P75', 'Max']
print(desc.round(3).to_string())

# Using tableone for clinical/econ style Table 1

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# pip install tableone

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
from tableone import TableOne
table1 = TableOne(df, columns=['income', 'age', 'education', 'hours_worked'],
                  categorical=['female', 'race'],
                  groupby='treatment', pval=True)
print(table1.tabulate(tablefmt="github"))
table1.to_excel("table1.xlsx")
```

### R

```r
# R 鈥?modelsummary::datasummary

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(modelsummary)

# Full descriptive table

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
datasummary(income + age + education + hours_worked ~
            N + Mean + SD + Min + Median + Max,
            data = df,
            output = "table1.tex")   # or .docx, .html

# By group (treatment/control)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
datasummary(income + age + education ~
            treatment * (N + Mean + SD),
            data = df,
            output = "balance.tex")

# Alternative: stargazer

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(stargazer)
stargazer(df[, c("income", "age", "education", "hours_worked")],
          type = "latex",
          summary.stat = c("n", "mean", "sd", "min", "median", "max"),
          title = "Summary Statistics",
          out = "table1.tex")
```

### Stata

```stata
* Stata 鈥?estpost/esttab for summary stats
estpost summarize income age education hours_worked, detail
esttab using "table1.tex", cells("count mean(fmt(3)) sd(fmt(3)) min max") ///
    nomtitle nonumber label replace title("Summary Statistics")

* By group
estpost ttest income age education hours_worked, by(treatment)
esttab using "balance.tex", cells("mu_1(fmt(3)) mu_2(fmt(3)) b(fmt(3) star)") ///
    star(* 0.10 ** 0.05 *** 0.01) replace ///
    collabels("Control" "Treatment" "Diff") ///
    title("Balance Table")

* Alternative: asdoc (simpler)
asdoc summarize income age education hours_worked, stat(N mean sd min max) ///
    save(table1.doc) replace
```

## Balance Tables (Treatment vs Control)

### Normalized Differences

Preferred over t-tests for balance assessment (Imbens & Rubin 2015): 螖 = (X虅鈧?鈭?X虅鈧€) / 鈭?S鈧伮?+ S鈧€虏). Rule: |螖| < 0.25 is acceptable.

```python
# Python 鈥?normalized differences

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
import numpy as np

def normalized_diff(treated, control):
    return (treated.mean() - control.mean()) / \
           np.sqrt(treated.var() + control.var())

for col in ['income', 'age', 'education']:
    nd = normalized_diff(df.loc[df.treatment==1, col],
                         df.loc[df.treatment==0, col])
    print(f"{col}: Norm. Diff. = {nd:.3f} {'鉁? if abs(nd) < 0.25 else '鉁?}")
```

```r
# R 鈥?cobalt for comprehensive balance

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(cobalt)
bal.tab(treatment ~ income + age + education + female,
        data = df, thresholds = c(m = 0.25),
        stats = c("mean.diffs", "variance.ratios"))
love.plot(treatment ~ income + age + education + female,
          data = df, binary = "std", threshold = 0.25)
```

```stata
* Stata 鈥?balance table with normalized differences
* After matching or for raw comparison:
iebaltab income age education female, grpvar(treatment) ///
    save("balance.xlsx") replace rowvarlabel ///
    pttest starsnoadd normdiff
```

## Correlation Matrix

```python
# Python 鈥?correlation matrix with significance

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
import scipy.stats as stats

vars = ['income', 'age', 'education', 'hours_worked']
corr = df[vars].corr()

# With p-values

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
def corr_with_pval(df, vars):
    n = len(vars)
    corr_mat = pd.DataFrame(index=vars, columns=vars)
    pval_mat = pd.DataFrame(index=vars, columns=vars)
    for i in range(n):
        for j in range(n):
            r, p = stats.pearsonr(df[vars[i]].dropna(), df[vars[j]].dropna())
            corr_mat.iloc[i,j] = f"{r:.3f}{'***' if p<.01 else '**' if p<.05 else '*' if p<.1 else ''}"
    return corr_mat

print(corr_with_pval(df, vars))
```

```r
# R 鈥?correlation matrix

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(modelsummary)
datasummary_correlation(df[, c("income", "age", "education", "hours_worked")],
                        output = "correlation.tex")

# With significance stars

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(Hmisc)
rcorr(as.matrix(df[, c("income", "age", "education")]))
```

```stata
* Stata 鈥?correlation matrix with significance
pwcorr income age education hours_worked, star(0.05) sig
* Export to LaTeX:
estpost correlate income age education hours_worked, matrix
esttab using "corr.tex", unstack not noobs replace
```

## Missing Data Summary

```python
# Python 鈥?missing data report

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
missing = df.isnull().sum()
missing_pct = (missing / len(df) * 100).round(2)
missing_report = pd.DataFrame({'N_Missing': missing, 'Pct_Missing': missing_pct})
missing_report = missing_report[missing_report.N_Missing > 0].sort_values('Pct_Missing', ascending=False)
print(missing_report)
```

```r
# R 鈥?missing data summary

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this before and after formal estimation as the main sanity-check layer for variables, groups, and distributions.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
library(naniar)
miss_var_summary(df)
vis_miss(df)    # missingness heatmap
```

```stata
* Stata 鈥?missing data
misstable summarize
misstable patterns
```

## Reporting Standards

### For the "Data" Section of Papers

1. **Table 1**: N, Mean, SD (and optionally Min, Max, Median) for all variables used in analysis
2. **Panel structure**: If panel data, report N units, T periods, and total N脳T
3. **Balance table**: If treatment/control design, show balance with t-tests or normalized differences
4. **Sample construction**: Note any sample restrictions (e.g., "dropped observations with missing income")
5. **Winsorization**: If applied, note percentiles (e.g., "winsorized at 1st and 99th percentiles")

### Formatting Conventions

| Convention | Details |
|------------|---------|
| Decimal places | 2鈥? for continuous variables; 3 for proportions |
| Standard errors | In parentheses below means (if reporting SE of mean) |
| Stars on differences | * p<0.10, ** p<0.05, *** p<0.01 |
| Sample size | Report N per column and per variable if different |
| Notes | State data source, sample period, variable definitions |

## Common Pitfalls

- **Reporting means for skewed variables**: Use median or log-transform for income, firm size, etc.
- **Ignoring missingness**: Always report % missing for each variable
- **Balance test p-hacking**: Use normalized differences instead of t-tests; many variables will be "significant" by chance with large N
- **Wrong clustering for SE**: Summary stats use individual-level data but main analysis may cluster at group level

## Working With Other Coase Skills

- Almost every estimation skill can use this as a first-pass validation layer.
- Summary statistics and tests often feed into `table`, `figure`, and the downstream identification skill.
- Do not rely on old `/analyze` or `/plot` commands; complete the baseline statistical work directly here.

