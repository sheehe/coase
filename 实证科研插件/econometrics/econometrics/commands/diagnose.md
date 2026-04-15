---
name: diagnose
description: Run comprehensive model diagnostics and generate a structured diagnostic report
tools:
  - Read
  - Write
  - Bash
---

# /diagnose — Model Diagnostics

When the user invokes /diagnose, run all relevant diagnostic tests for their econometric model and produce a structured report with pass/fail indicators and suggested fixes.

## Step 1: Identify the Model

Determine from context or ask the user:
- What type of model? (OLS, IV, panel FE, DID, RDD, time series, probit/logit)
- What is the main specification?
- What are the key variables (dependent, independent, instruments, fixed effects)?
- What language is the code in (Python, R, or Stata)?

## Step 2: Run Method-Specific Diagnostics

### OLS Diagnostics

Run all of the following tests:

| Test | What It Checks | H₀ | Pass If |
|------|---------------|-----|---------|
| VIF | Multicollinearity | — | VIF < 10 for all variables |
| Breusch-Pagan | Heteroskedasticity | Homoskedastic errors | p > 0.05 |
| White Test | Heteroskedasticity (general) | Homoskedastic errors | p > 0.05 |
| Breusch-Godfrey | Serial correlation | No autocorrelation | p > 0.05 |
| Durbin-Watson | Serial correlation | No autocorrelation | DW ≈ 2 |
| Jarque-Bera | Normality of residuals | Normal residuals | p > 0.05 |
| RESET | Functional form | Correct specification | p > 0.05 |
| Cook's Distance | Influential observations | — | No obs > 4/N |

```python
# Python — complete OLS diagnostics
import statsmodels.formula.api as smf
from statsmodels.stats.diagnostic import (het_breuschpagan, het_white,
    acorr_breusch_godfrey, linear_reset)
from statsmodels.stats.stattools import jarque_bera, durbin_watson
from statsmodels.stats.outliers_influence import variance_inflation_factor

model = smf.ols('y ~ x1 + x2 + x3', data=df).fit()

# 1. Multicollinearity (VIF)
X = model.model.exog
vif = [variance_inflation_factor(X, i) for i in range(1, X.shape[1])]
print("VIF:", dict(zip(model.model.exog_names[1:], [f"{v:.2f}" for v in vif])))

# 2. Heteroskedasticity
bp = het_breuschpagan(model.resid, model.model.exog)
print(f"Breusch-Pagan: LM={bp[0]:.4f}, p={bp[1]:.4f} → {'FAIL' if bp[1]<0.05 else 'PASS'}")

wh = het_white(model.resid, model.model.exog)
print(f"White Test: LM={wh[0]:.4f}, p={wh[1]:.4f} → {'FAIL' if wh[1]<0.05 else 'PASS'}")

# 3. Serial Correlation
bg = acorr_breusch_godfrey(model, nlags=2)
print(f"Breusch-Godfrey: LM={bg[0]:.4f}, p={bg[1]:.4f} → {'FAIL' if bg[1]<0.05 else 'PASS'}")

dw = durbin_watson(model.resid)
print(f"Durbin-Watson: {dw:.4f} → {'PASS' if 1.5 < dw < 2.5 else 'WARN'}")

# 4. Normality
jb = jarque_bera(model.resid)
print(f"Jarque-Bera: stat={jb[0]:.4f}, p={jb[1]:.4f} → {'FAIL' if jb[1]<0.05 else 'PASS'}")

# 5. Functional Form (RESET)
reset = linear_reset(model, power=3, use_f=True)
print(f"RESET: F={reset.fvalue:.4f}, p={reset.pvalue:.4f} → {'FAIL' if reset.pvalue<0.05 else 'PASS'}")
```

```r
# R — complete OLS diagnostics
library(lmtest); library(car); library(nortest)

model <- lm(y ~ x1 + x2 + x3, data = df)

# 1. VIF
vif_vals <- vif(model)
cat("VIF:\n"); print(round(vif_vals, 2))
cat("→", ifelse(all(vif_vals < 10), "PASS", "FAIL"), "\n\n")

# 2. Breusch-Pagan
bp <- bptest(model)
cat("Breusch-Pagan: p =", bp$p.value, "→", ifelse(bp$p.value > 0.05, "PASS", "FAIL"), "\n")

# 3. Breusch-Godfrey
bg <- bgtest(model, order = 2)
cat("Breusch-Godfrey: p =", bg$p.value, "→", ifelse(bg$p.value > 0.05, "PASS", "FAIL"), "\n")

# 4. Durbin-Watson
dw <- dwtest(model)
cat("Durbin-Watson:", dw$statistic, "→", ifelse(dw$p.value > 0.05, "PASS", "WARN"), "\n")

# 5. Jarque-Bera
jb <- jarque.bera.test(residuals(model))
cat("Jarque-Bera: p =", jb$p.value, "→", ifelse(jb$p.value > 0.05, "PASS", "FAIL"), "\n")

# 6. RESET
reset <- resettest(model, power = 2:3)
cat("RESET: p =", reset$p.value, "→", ifelse(reset$p.value > 0.05, "PASS", "FAIL"), "\n")

# 7. Influential observations
cooks <- cooks.distance(model)
cat("Cook's D max:", max(cooks), "→", ifelse(max(cooks) < 4/nrow(df), "PASS", "WARN"), "\n")
```

```stata
* Stata — complete OLS diagnostics
reg y x1 x2 x3

* VIF
estat vif

* Breusch-Pagan
estat hettest

* White test
estat imtest, white

* Breusch-Godfrey (requires tsset)
estat bgodfrey, lags(1 2)

* RESET
estat ovtest

* Normality of residuals
predict resid, residuals
sktest resid
swilk resid

* Influential observations
predict cooksd, cooksd
summarize cooksd
```

### IV/2SLS Diagnostics

| Test | What It Checks | Pass If |
|------|---------------|---------|
| First-stage F | Instrument relevance | F > 10 (or > 16.4) |
| Partial R² | Instrument explanatory power | Meaningfully > 0 |
| Wu-Hausman | Endogeneity of regressor | p < 0.05 → use IV |
| Sargan-Hansen | Overidentification (multiple instruments) | p > 0.05 |
| Anderson-Rubin | Weak-instrument-robust test | Check with F borderline |
| Kleibergen-Paap | Underidentification | p < 0.05 → identified |

```r
# R
library(AER)
iv <- ivreg(y ~ x_endog + w1 + w2 | z1 + z2 + w1 + w2, data = df)
summary(iv, diagnostics = TRUE)
# Prints: Weak instruments, Wu-Hausman, Sargan tests
```

```stata
* Stata
ivregress 2sls y w1 w2 (x_endog = z1 z2), robust first
estat firststage       // F-stat, partial R²
estat endogenous       // Wu-Hausman
estat overid           // Sargan-Hansen
```

### Panel Data Diagnostics

| Test | What It Checks | Pass If |
|------|---------------|---------|
| Hausman | FE vs RE | p < 0.05 → use FE |
| Modified Wald | Group-wise heteroskedasticity | p > 0.05 |
| Wooldridge | Serial correlation in panels | p > 0.05 |
| Pesaran CD | Cross-sectional dependence | p > 0.05 |

```stata
* Stata — panel diagnostics
xtset id time

* Hausman test
xtreg y x1 x2, fe
estimates store fe
xtreg y x1 x2, re
estimates store re
hausman fe re

* Modified Wald (heteroskedasticity)
xttest3

* Wooldridge serial correlation
xtserial y x1 x2

* Pesaran CD (cross-sectional dependence)
xtcsd, pesaran abs
```

```r
# R
library(plm)
panel <- pdata.frame(df, index = c("id", "time"))
fe <- plm(y ~ x1 + x2, data = panel, model = "within")
re <- plm(y ~ x1 + x2, data = panel, model = "random")

# Hausman
phtest(fe, re)

# Serial correlation (Wooldridge)
pwartest(fe)

# Cross-sectional dependence (Pesaran)
pcdtest(fe, test = "cd")
```

### DID Diagnostics

| Test | What It Checks | Pass If |
|------|---------------|---------|
| Pre-trend test | Parallel trends assumption | Pre-period coefficients ≈ 0 |
| Bacon decomposition | TWFE bias (staggered) | No problematic comparisons dominate |
| Granger placebo | No anticipation effects | Fake treatment shows null effect |

```r
# R — DID diagnostics
library(fixest)
es <- feols(y ~ i(rel_time, treat, ref = -1) | id + year, data = df, cluster = ~id)

# Joint test: all pre-treatment coefficients = 0
pre_coefs <- grep("rel_time::-", names(coef(es)), value = TRUE)
wald(es, keep = pre_coefs)

# Bacon decomposition
library(bacondecomp)
bacon(y ~ treat_post, data = df, id_var = "id", time_var = "year")
```

### RDD Diagnostics

| Test | What It Checks | Pass If |
|------|---------------|---------|
| McCrary density | Running variable manipulation | p > 0.05 |
| Covariate balance | No discontinuity in pre-determined vars | p > 0.05 for all |
| Bandwidth sensitivity | Robustness to BW choice | Stable across BW multiples |
| Placebo cutoffs | No effects at false cutoffs | p > 0.05 |

```r
# R — RDD diagnostics
library(rdrobust); library(rddensity)

# Density test
rdd_density <- rddensity(df$running_var, c = cutoff)
summary(rdd_density)

# Covariate balance
for (cov in c("age", "income_pre", "gender")) {
  res <- rdrobust(df[[cov]], df$running_var, c = cutoff)
  cat(cov, ": p =", res$pv[3], "→", ifelse(res$pv[3] > 0.05, "PASS", "FAIL"), "\n")
}
```

### Time Series Diagnostics

| Test | What It Checks | Pass If |
|------|---------------|---------|
| ADF / KPSS | Stationarity | ADF: p < 0.05; KPSS: p > 0.05 |
| Ljung-Box | Residual autocorrelation | p > 0.05 |
| ARCH-LM | Conditional heteroskedasticity | p > 0.05 (or use GARCH) |
| Stability (CUSUM) | Parameter stability | Within bounds |

```stata
* Stata — time series diagnostics
tsset time

* Unit root
dfuller y, lags(4) trend
kpss y

* Residual autocorrelation
reg y x1 x2
predict resid, residuals
wntestq resid, lags(12)

* ARCH effects
estat archlm, lags(1 2 4)
```

## Step 3: Generate Diagnostic Report

Produce a structured report in this format:

```
═══════════════════════════════════════════
       MODEL DIAGNOSTIC REPORT
═══════════════════════════════════════════
Model: [OLS/IV/Panel FE/DID/RDD/Time Series]
Specification: Y = f(X1, X2, ...) + controls
N = [sample size]
═══════════════════════════════════════════

TEST RESULTS
─────────────────────────────────────────
 Test                  Statistic   Result
─────────────────────────────────────────
 VIF (max)             [value]     ✓ PASS
 Breusch-Pagan         p = [val]   ✗ FAIL
 White Test            p = [val]   ✗ FAIL
 Breusch-Godfrey       p = [val]   ✓ PASS
 Durbin-Watson         [value]     ✓ PASS
 Jarque-Bera           p = [val]   ✓ PASS
 RESET                 p = [val]   ✓ PASS
─────────────────────────────────────────

ISSUES DETECTED & RECOMMENDATIONS
─────────────────────────────────────────
 ✗ Heteroskedasticity detected
   → Use robust standard errors (HC1 or HC3)
   → Or use WLS if variance function is known

 ✓ No multicollinearity issues
 ✓ No serial correlation
 ✓ Correct functional form
═══════════════════════════════════════════
```

Save the report to `diagnostic_report.md` in the working directory.

## Step 4: Suggest Fixes

For each failed test, provide the specific fix:

| Issue | Fix |
|-------|-----|
| Heteroskedasticity | Use `robust` SE (HC1/HC3) or WLS |
| Multicollinearity (VIF > 10) | Drop or combine collinear variables |
| Serial correlation | Add lagged DV, use Newey-West SE, or AR(1) errors |
| Non-normal residuals | Use robust inference (large N); consider log-transform |
| RESET failure | Add polynomial terms, try log-transform, check for omitted variables |
| Weak instruments (F < 10) | Find stronger instruments, use LIML or AR confidence sets |
| Hausman rejects RE | Use fixed effects |
| Parallel trends violation | Consider alternative control groups, use CS estimator |

Generate corrected code implementing the suggested fixes and save to `analysis_corrected.[py/R/do]`.

## See Also

- `/analyze` — run the main analysis before calling `/diagnose`
- `/robustness` — after diagnostics pass, run robustness checks to stress-test the result
- `/interpret` — interpret results once diagnostics are clean
- Skills: `ols-regression`, `iv-estimation`, `did-analysis`, `rdd-analysis`, `panel-data`, `time-series` — each contains the method-specific diagnostic tests in detail
