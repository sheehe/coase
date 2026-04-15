---
name: ols-regression
description: Run OLS baselines, robust standard errors, and core regression diagnostics
---


# OLS Regression Skill

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this as the first empirical baseline for many projects before escalating to more specialized identification strategies.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.

This skill provides comprehensive guidance for OLS regression and linear models in empirical research. It covers model specification, assumption testing, diagnostic checks, and result interpretation, with code examples in Python, R, and Stata.

## Core Workflow

When assisting with OLS regression, follow this sequence:

1. **Clarify the research question and data** 鈥?understand dependent variable, key regressors, and sample
2. **Specify the model** 鈥?choose functional form, control variables, fixed effects if needed
3. **Run the regression** 鈥?provide code in the user's preferred language
4. **Check assumptions** 鈥?run diagnostics systematically (see references)
5. **Interpret and report** 鈥?explain coefficients, significance, fit, and caveats

## Key Concepts

### Model Specification
- Write the regression equation explicitly: Y = 尾鈧€ + 尾鈧乆鈧?+ ... + 尾鈧朮鈧?+ 蔚
- Consider log transformations for skewed variables or elasticity interpretation
- Include relevant controls to reduce omitted variable bias
- Watch for irrelevant variables inflating standard errors

### The Gauss-Markov Assumptions
1. Linearity in parameters
2. Random sampling
3. No perfect multicollinearity
4. Zero conditional mean of errors: E(蔚|X) = 0
5. Homoskedasticity: Var(蔚|X) = 蟽虏
6. (For inference) Normally distributed errors

Violation of assumptions 4鈥? does not bias OLS but affects standard errors. Violation of assumption 4 (endogeneity) biases estimates 鈥?recommend IV methods.

### Standard Error Options
- **Default OLS SE**: valid only under homoskedasticity
- **HC robust SE (White)**: use when heteroskedasticity is suspected; always safe for cross-section data
- **Clustered SE**: use when observations are grouped (e.g., by firm, region, year)
- **Newey-West SE**: use for time series with autocorrelation

## Quick Code Templates

### Python (statsmodels)
```python
import statsmodels.api as sm
import statsmodels.formula.api as smf

# With robust standard errors

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this as the first empirical baseline for many projects before escalating to more specialized identification strategies.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
model = smf.ols('y ~ x1 + x2 + x3', data=df).fit(cov_type='HC3')
print(model.summary())
```

### R
```r
library(lmtest)
library(sandwich)

model <- lm(y ~ x1 + x2 + x3, data = df)
coeftest(model, vcov = vcovHC(model, type = "HC3"))
```

### Stata
```stata
reg y x1 x2 x3, robust
```

## Diagnostics Checklist


| Issue | Test | Quick Fix |
|-------|------|-----------|
| Heteroskedasticity | Breusch-Pagan, White test | Robust SE |
| Autocorrelation | Durbin-Watson, Breusch-Godfrey | Newey-West SE |
| Multicollinearity | VIF > 10 | Drop/combine variables |
| Non-normality of errors | Jarque-Bera | Check outliers; large N mitigates |
| Omitted variable bias | Ramsey RESET | Respecify model |

## Reporting Standards (Academic)

- Report coefficients with standard errors in parentheses (or t-stats)
- Use asterisks for significance: * p<0.10, ** p<0.05, *** p<0.01
- Always state which standard errors are used (robust, clustered, etc.)
- Report R虏, adjusted R虏, N, and F-statistic
- Describe the identification strategy and potential endogeneity concerns


## Common Pitfalls

- **Claiming causality without identification**: OLS with controls does not establish causality 鈥?use IV, DID, or RDD for causal claims
- **Using default SE with clustered data**: Always cluster SE at the group level when observations are grouped
- **Including "bad controls"**: Don't control for post-treatment variables (mediators) 鈥?they introduce collider bias
- **Log-transforming variables with zeros**: ln(0) is undefined; use asinh(x) or ln(x+1) with appropriate interpretation
- **Reporting R虏 as evidence of a good model**: High R虏 does not mean the model is correctly specified or causal

## Working With Other Coase Skills

- This usually follows `data-cleaning` and `stats`.
- It often leads naturally into `panel-data`, `iv-estimation`, or `did-analysis`.
- Do not rely on old `/diagnose`, `/robustness`, or `/interpret` commands; provide diagnostics and interpretation directly.

