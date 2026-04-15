# Econometrics Plugin

A comprehensive econometrics skill set for empirical study, covering from data fetching & cleaning to identification strategies, estimation methods, diagnostics, and academic writing with code support for Python, R, and Stata. Compatible with Claude, Codex and Openclaw.

## Skills

| Skill | Triggers | Description |
|-------|----------|-------------|
| **ols-regression** | "OLS", "linear regression", "最小二乘法", "线性回归", "跑回归" | OLS estimation, assumption testing, heteroskedasticity, robust SE, coefficient interpretation |
| **time-series** | "ARIMA", "unit root", "Granger causality", "时间序列", "平稳性" | Stationarity tests (ADF/KPSS), ARIMA, VAR/VECM, cointegration, forecasting |
| **panel-data** | "fixed effects", "Hausman test", "面板数据", "固定效应" | FE/RE models, two-way FE, clustered SE, dynamic panels |
| **iv-estimation** | "instrumental variables", "2SLS", "工具变量", "内生性", "两阶段最小二乘法" | IV/2SLS, first-stage diagnostics, weak instruments, Bartik instruments, judge designs, PSM |
| **did-analysis** | "difference-in-differences", "DID", "parallel trends", "双重差分", "平行趋势" | DID/TWFE, event study, staggered DID (CS, SA, BJS, dCDH), pre-trends power analysis |
| **rdd-analysis** | "regression discontinuity", "RDD", "断点回归", "带宽选择" | Sharp/fuzzy RDD, bandwidth selection, validity tests, discrete RV, multi-cutoff/multi-score RDD |
| **synthetic-control** | "synthetic control", "SCM", "合成控制", "合成控制法" | Abadie-Diamond-Hainmueller SCM, augmented SCM, synthetic DID, placebo inference, MSPE ratios |
| **ml-causal** | "causal forest", "double ML", "DML", "GRF", "因果森林", "双重机器学习" | Causal Forest (GRF), Double/Debiased ML, LASSO variable selection, CATE, BLP/CLAN analysis |
| **stats** | "summary statistics", "Table 1", "balance table", "描述性统计", "平衡性检验" | Publication-quality summary tables, balance tables, correlation matrices, missing data reports |
| **table** | "regression table", "LaTeX table", "esttab", "modelsummary", "回归表格" | Multi-model regression tables, multi-panel layouts, journal-specific formatting (AER, QJE) |
| **figure** | "publication figure", "event study plot", "binscatter", "coefficient plot", "论文图表" | Journal-quality figures (AER/QJE standards): event study, binscatter, RDD, density, coefplot |
| **data-fetcher** | "FRED", "World Bank", "fetch data", "download data", "获取数据" | Fetch economic data from FRED, World Bank, IMF, BLS, OECD with documented Python code |
| **data-cleaning** | "clean data", "data preparation", "merge datasets", "数据清洗", "数据整理" | Clean and transform messy data in Stata with reproducible, well-documented workflows |
| **literature-review** | "literature review", "related work", "文献综述", "相关文献" | Search, summarize, and synthesize economics literature; identify gaps and organize findings |
| **paper-writing** | "write paper", "draft paper", "论文写作", "学术写作" | Draft economics papers with proper structure, journal conventions, and academic style |
| **beamer-ppt** | "Beamer", "slides", "presentation", "PPT", "幻灯片", "演示文稿" | Create professional academic presentations in LaTeX Beamer for conferences and seminars |

## Commands

| Command | Description |
|---------|-------------|
| `/analyze` | Start a full econometric analysis workflow for a dataset or research question |
| `/interpret` | Interpret regression output, test statistics, and model diagnostics |
| `/method` | Generate a publication-quality methods section for your paper |
| `/plot` | Generate publication-quality diagram or table code |
| `/robustness` | Design and run robustness checks appropriate for your identification strategy |
| `/diagnose` | Run comprehensive model diagnostics with pass/fail report and suggested fixes |

## Quick Start

**For a new analysis:**
> `/analyze` - How to study the causal effects of X on Y using my dataset

**For result interpretation:**
> `/interpret` - Here's my regression output. Can you interpret it?

**For diagnostics:**
> `/diagnose` - Check my OLS model for heteroskedasticity, multicollinearity, and specification issues.

**For writing up:**
> `/method` — I'm using two-way FE with clustered SE. Generate methods section for my paper.

**For robustness:**
> `/robustness` — Check my DID estimates.

**For visualization:**
> `/plot` - Generate a beautiful parallel trend testing diagram for my DID experiment.

## Code Language Support

All skills and commands generate code in:
- **Python** — using `statsmodels`, `linearmodels`, `rdrobust`, `arch`, `doubleml`, `econml`
- **R** — using `fixest`, `plm`, `AER`, `rdrobust`, `did`, `grf`, `DoubleML`, `modelsummary`, `Synth`
- **Stata** — using standard and SSC packages (`reghdfe`, `ivreg2`, `rdrobust`, `csdid`, `ddml`, `synth`)

## Method Selection Guide

```
Research Question
 ├─ Cross-section, no endogeneity → OLS (ols-regression)
 ├─ Repeated observations on same units → Panel FE/RE (panel-data)
 ├─ Treatment endogenous + instrument → IV/2SLS (iv-estimation)
 ├─ Selection on observables → PSM (iv-estimation) / Matching
 ├─ Pre/post policy with control group → DID (did-analysis)
 ├─ Single treated unit, many controls → Synthetic Control (synthetic-control)
 ├─ Threshold assignment rule → RDD (rdd-analysis)
 ├─ Heterogeneous treatment effects → Causal Forest/DML (ml-causal)
 └─ Temporal patterns, forecasting → Time Series (time-series)
```
