---
name: table
description: |
  Econometrics skill for creating publication-quality LaTeX regression and summary tables. Activates when the user asks about:
  "regression table", "LaTeX table", "esttab", "stargazer", "modelsummary",
  "publication table", "format results", "multi-panel table", "journal table",
  "export regression results", "table formatting", "回归表格", "LaTeX表格",
  "结果导出", "论文表格", "回归结果格式化", "多模型表格"
---
## Workflow Integration

若当前会话由 Coase 研究工作流触发（`/full-research` / `/idea-to-results` / `/run-experiment`），本 skill 的输出必须按以下规则落入阶段文件，**不得自行新建目录或脱离工作流上下文**：

- **规划阶段 · Descriptive Snapshot**: 生成 Table 1（描述性统计 + 处理组-对照组均衡表），路径记入 `planner/stage_8_descriptive_snapshot.md`。**强制使用** `modelsummary::datasummary()` / `datasummary_balance()`，见下文 "Descriptive & Balance Tables"。
- **执行阶段 · Run Baseline**: 生成主回归 Main Results Table，LaTeX booktabs 或 Markdown 格式，填入 `executor/stage_1_run_baseline.md`。
- **执行阶段 · Robustness**: 生成 Robustness Table 与 Mechanism-Supporting Table（若适用），填入 `executor/stage_2_explanation_robustness.md`。

若用户未指定工作流（直接提问使用本方法），忽略本节，按下方正文自由执行。

---

# LaTeX Table Formatting Skill

This skill generates publication-quality regression tables, summary statistics tables, and multi-panel layouts for economics journals. Covers the major table-making tools: `esttab/estout` (Stata), `modelsummary/fixest::etable` (R), and `stargazer` (R/Python).

## Quick Decision: Which Tool to Use

| Tool | Language | Best For |
|------|----------|----------|
| `esttab/estout` | Stata | Most flexible; Stata-native workflows |
| `modelsummary` | R | Modern, clean API; many output formats |
| `fixest::etable` | R | Fast tables from `fixest` regressions |
| `stargazer` | R | Classic; widely used in econ |
| `statsmodels` summary + manual | Python | Custom formatting |

## Descriptive & Balance Tables (Table 1)

几乎所有实证论文的 Table 1 不是描述性统计就是处理组均衡表。**强制使用** `modelsummary::datasummary()` 与 `datasummary_balance()`——下方为标准模板，照搬即可。

```r
library(modelsummary)

# 输出路径不存在时 modelsummary 会直接报错，先建目录
dir.create("output/tables", recursive = TRUE, showWarnings = FALSE)

# Summary statistics —— 把左侧公式里的变量名换成你数据集里实际存在的列
datasummary(
  outcome + treatment + control1 + control2 ~
    N + Mean + SD + Min + Max,
  data = analysis_data,
  output = "output/tables/table1_descriptives.tex",
  title = "Summary Statistics",
  notes = "Sample includes [description]. Data from [source]."
)

# Balance table —— ~treatment 右侧必须是二值/分类变量
datasummary_balance(
  ~ treatment,
  data = analysis_data,
  output = "output/tables/table1_balance.tex",
  title = "Balance Across Treatment Groups"
)
```

## Regression Tables

### Stata — esttab/estout

```stata
* Stata — multi-model regression table
ssc install estout

* Run models
eststo clear
eststo m1: reg y x1, robust
eststo m2: reg y x1 x2, robust
eststo m3: reg y x1 x2 x3, robust
eststo m4: reghdfe y x1 x2 x3, absorb(fe_var) cluster(cluster_var)

* Export to LaTeX
esttab m1 m2 m3 m4 using "results.tex", replace ///
    b(3) se(3) ///                          // 3 decimal places
    star(* 0.10 ** 0.05 *** 0.01) ///       // significance stars
    title("Main Results") ///
    mtitles("OLS" "OLS" "OLS" "FE") ///     // column titles
    label ///                                // use variable labels
    keep(x1 x2 x3) ///                      // show only key vars
    order(x1 x2 x3) ///
    stats(N r2 r2_a, fmt(%9.0fc %9.3f %9.3f) ///
          labels("Observations" "R-squared" "Adj. R-squared")) ///
    addnotes("Robust standard errors in parentheses." ///
             "*** p<0.01, ** p<0.05, * p<0.1") ///
    booktabs ///                             // professional formatting
    fragment                                 // no \begin{table} wrapper

* Multi-panel table
esttab m1 m2 using "panel_a.tex", replace booktabs fragment ///
    prehead("\begin{table}[htbp]" "\centering" "\caption{Results}" ///
            "\begin{tabular}{lcc}" "\toprule" ///
            "& \multicolumn{2}{c}{\textit{Panel A: Full Sample}} \\" ///
            "\cmidrule(lr){2-3}")
esttab m3 m4 using "panel_b.tex", replace booktabs fragment ///
    prehead("\midrule" ///
            "& \multicolumn{2}{c}{\textit{Panel B: Subsample}} \\" ///
            "\cmidrule(lr){2-3}") ///
    postfoot("\bottomrule" "\end{tabular}" ///
             "\begin{tablenotes}" "\small" ///
             "\item Standard errors in parentheses." ///
             "\end{tablenotes}" "\end{table}")
```

### R — modelsummary

```r
# R — modelsummary (主回归 / 稳健性 / FE 指示，三合一标准模板)
library(modelsummary); library(tibble)
dir.create("output/tables", recursive = TRUE, showWarnings = FALSE)

# 1) 拟合一组规格逐步加控制变量 / 固定效应（按你的实际变量名替换 x1/x2/x3）
m1 <- lm(y ~ x1, data = df)
m2 <- lm(y ~ x1 + x2, data = df)
m3 <- lm(y ~ x1 + x2 + x3, data = df)
main_models <- list("(1)" = m1, "(2)" = m2, "(3)" = m3)
stopifnot(length(main_models) > 0)   # 防御：空列表会导出诡异空表

# 2) Main Results：coef_map 的左侧 key 必须与模型 term 字面一致，
#    否则该行不会出现在表里（modelsummary 不会报错，只是悄悄丢掉）
modelsummary(
  main_models,
  output = "output/tables/table2_main.tex",
  stars  = c('*' = 0.1, '**' = 0.05, '***' = 0.01),
  coef_map = c(
    "x1" = "Treatment",
    "x2" = "Control 1",
    "x3" = "Control 2"
  ),
  # nobs / r.squared 通用；"FE: xxx" 这类 GOF 仅 fixest::feols 模型对象有，
  # 用 lm/glm 时该行不会出现，需要换成 add_rows 手填 Yes/No
  gof_map  = c("nobs", "r.squared", "adj.r.squared"),
  add_rows = tribble(
    ~term,          ~"(1)", ~"(2)", ~"(3)",
    "Year FE",      "No",   "Yes",  "Yes",
    "Industry FE",  "No",   "No",   "Yes"
  ),
  title = "Effect of [Treatment] on [Outcome]",
  notes = list(
    "Standard errors clustered at [level] in parentheses.",
    "* p<0.1, ** p<0.05, *** p<0.01"
  )
)

# 3) Robustness 表：只展示处理变量、隐藏 nuisance 控制项
#    coef_omit 是 regex —— "control" 只会匹配 term 名包含 "control" 字符串的变量；
#    如果你的控制变量叫 gdp_pc / pop / age（不含 "control"），下面这条不起作用，
#    应改为正向白名单 coef_map = c("treatment" = "Treatment") 来强制只显示处理变量。
robustness_models <- list("(1)" = m1, "(2)" = m2, "(3)" = m3)  # 替换为你的稳健性回归
stopifnot(length(robustness_models) > 0)

modelsummary(
  robustness_models,
  output = "output/tables/table3_robustness.tex",
  stars  = c('*' = 0.1, '**' = 0.05, '***' = 0.01),
  coef_map = c("x1" = "Treatment"),  # 白名单：只展示 Treatment 一行
  gof_map  = c("nobs", "r.squared"),
  title = "Robustness Checks",
  notes = "See notes to Table 2."
)
```

### R — fixest::etable

```r
# R — etable (fast, built into fixest)
library(fixest)

m1 <- feols(y ~ x1, data = df, vcov = "HC1")
m2 <- feols(y ~ x1 + x2 | year, data = df, vcov = ~cluster_var)
m3 <- feols(y ~ x1 + x2 | year + industry, data = df, vcov = ~cluster_var)

etable(m1, m2, m3,
       tex = TRUE,
       file = "results.tex",
       dict = c(x1 = "Treatment", x2 = "Control"),
       order = c("Treatment", "Control"),
       drop = "Intercept",
       fixef.group = list("Year FE" = "year",
                          "Industry FE" = "industry"),
       style.tex = style.tex("aer"),    # AER journal style
       title = "Main Results",
       notes = "Clustered standard errors in parentheses.")
```

### R — stargazer

```r
# R — stargazer (classic)
library(stargazer)

stargazer(m1, m2, m3,
          type = "latex",
          out = "results.tex",
          title = "Main Results",
          dep.var.labels = "Outcome Variable",
          covariate.labels = c("Treatment", "Control 1", "Control 2"),
          keep = c("x1", "x2", "x3"),
          add.lines = list(
            c("Year FE", "No", "Yes", "Yes"),
            c("Industry FE", "No", "No", "Yes")
          ),
          omit.stat = c("f", "ser"),
          notes = "Robust standard errors in parentheses.",
          notes.align = "l",
          star.cutoffs = c(0.1, 0.05, 0.01))
```

### Python — Manual LaTeX Generation

```python
# Python — generate LaTeX table from statsmodels
import statsmodels.formula.api as smf

models = {
    '(1)': smf.ols('y ~ x1', data=df).fit(cov_type='HC1'),
    '(2)': smf.ols('y ~ x1 + x2', data=df).fit(cov_type='HC1'),
    '(3)': smf.ols('y ~ x1 + x2 + x3', data=df).fit(cov_type='HC1'),
}

# Using statsmodels summary_col
from statsmodels.iolib.summary2 import summary_col
result = summary_col(list(models.values()),
                     stars=True,
                     float_format='%.3f',
                     model_names=list(models.keys()),
                     info_dict={'N': lambda x: f"{int(x.nobs)}",
                                'R²': lambda x: f"{x.rsquared:.3f}"})
print(result.as_latex())

# For more control, use pystout:
# pip install pystout
from pystout import pystout
pystout(models=list(models.values()),
        file='results.tex',
        endog_names=list(models.keys()),
        exognames=['x1', 'x2', 'x3'],
        stars={0.1: '*', 0.05: '**', 0.01: '***'})
```

## Journal-Specific Styles

### AER (American Economic Review)

```r
# fixest style
etable(m1, m2, m3, style.tex = style.tex("aer"), tex = TRUE)
```

Key conventions: booktabs rules, no vertical lines, significance noted in footnote not with stars (AER discourages stars).

### QJE / ReStud / Econometrica

```stata
* Stata — clean academic style
esttab m1 m2 m3 using "results.tex", replace ///
    b(3) se(3) star(* 0.10 ** 0.05 *** 0.01) ///
    booktabs fragment ///
    alignment(D{.}{.}{-1}) ///
    prehead("\begin{table}[htbp]" "\centering" ///
            "\caption{Title Here}\label{tab:main}" ///
            "\begin{tabular}{l*{3}{D{.}{.}{-1}}}" "\toprule") ///
    postfoot("\bottomrule" "\end{tabular}" ///
             "\begin{tablenotes}[flushleft]\footnotesize" ///
             "\item \textit{Notes:} Standard errors in parentheses." ///
             " *** p$<$0.01, ** p$<$0.05, * p$<$0.1" ///
             "\end{tablenotes}" "\end{table}")
```

## Multi-Panel and Complex Layouts

### Side-by-Side Panels

```stata
* Panel A: OLS, Panel B: IV
esttab m_ols1 m_ols2 using "table.tex", replace booktabs fragment ///
    prehead("\begin{table}[htbp]\centering" ///
            "\caption{OLS and IV Estimates}" ///
            "\begin{tabular}{lcc}\toprule" ///
            "& \multicolumn{2}{c}{\textit{Panel A: OLS}} \\" ///
            "\cmidrule(lr){2-3}")
esttab m_iv1 m_iv2 using "table.tex", append booktabs fragment ///
    prehead("\midrule" ///
            "& \multicolumn{2}{c}{\textit{Panel B: IV/2SLS}} \\" ///
            "\cmidrule(lr){2-3}") ///
    postfoot("\bottomrule\end{tabular}\end{table}")
```

### Interaction Effects Table

```r
# R — interaction table
library(modelsummary)
m_interaction <- lm(y ~ x1 * group, data = df)
modelsummary(m_interaction,
             coef_rename = c("x1" = "Treatment",
                             "group" = "Group",
                             "x1:group" = "Treatment × Group"),
             output = "interaction.tex")
```

## Tips for Clean Tables

| Tip | Details |
|-----|---------|
| Use `booktabs` | `\toprule`, `\midrule`, `\bottomrule` instead of `\hline` |
| No vertical lines | Standard in economics journals |
| Align decimals | Use `dcolumn` package with `D{.}{.}{-1}` column type |
| Stars in notes | Clearly state significance levels in table notes |
| Variable labels | Use descriptive names, not variable codes |
| Fixed effects rows | Show Yes/No indicators for FE inclusions |
| Consistent decimals | 3 decimals for coefficients/SE; 0 for N |
| Notes placement | Below the table, left-aligned, smaller font |

## Common Pitfalls

- **Too many decimals**: 3 is standard for coefficients; more is noise
- **Missing clustering info**: Always state what SE are clustered on
- **Forgetting FE indicators**: Reviewers need to know which FE are included
- **Stars without notes**: Always define significance levels
- **Cramming too many models**: 4–6 columns is typical maximum

## LaTeX Integration: Paper-Ready Output

When the output will be `\input{}`-ed into a compiled paper (rather than compiled standalone), three things consistently cause failures. Address them upfront.

### 1. Body-Only Files — No Document Wrapper

Tools like `esttab`, `stargazer`, and manual Python scripts often emit a standalone `.tex` file with `\documentclass...\begin{document}...\end{document}`. This breaks `\input{}` in the parent paper because LaTeX cannot nest document environments.

Always generate two versions: the full standalone file for spot-checking, and a **body-only** file stripped of the document wrapper for inclusion in the paper.

```python
# Python — strip wrapper and save body-only file
import re

def save_body_only(tex_path):
    """Strip \documentclass...\\end{document} wrapper; keep only the table content."""
    with open(tex_path) as f:
        txt = f.read()
    m = re.search(r'\\begin\{document\}(.*?)\\end\{document\}', txt, re.DOTALL)
    body = m.group(1).strip() if m else txt
    body_path = tex_path.replace('.tex', '_body.tex')
    with open(body_path, 'w') as f:
        f.write(body)
    return body_path
```

In the parent paper, include as:
```latex
\input{tables/table2_main_results_body}   % no .tex extension needed
```

Make sure each body file contains the full `\begin{table}...\end{table}` block — not just the `\begin{tabular}` fragment. A missing `\begin{table}` wrapper causes `\multicolumn` and `\caption` errors at compile time.

### 2. Avoid siunitx by Default

The `siunitx` package (used for the `S` decimal-aligned column type) is absent in many TeX distributions and causes `! LaTeX Error: File 'siunitx.sty' not found`. Prefer standard column types:

```latex
% Instead of: \begin{tabular}{l S S S}   (requires siunitx)
% Use:        \begin{tabular}{l c c c}    (always works)

% For strict decimal alignment without siunitx, use the dcolumn package:
\usepackage{dcolumn}                       % ships with every standard TeX distro
\begin{tabular}{l D{.}{.}{-1} D{.}{.}{-1}}
```

For most robustness and heterogeneity tables, `c` columns are sufficient — the numbers are clearly readable without strict decimal alignment.

Also avoid Unicode characters in Python-generated `.tex` files. Characters like `>=`, `->`, `<=` typed directly will break LaTeX. Always use their LaTeX equivalents: `$\geq$`, `$\rightarrow$`, `$\leq$`.

### 3. Overflow Prevention for Wide Tables

A table with 6 or more columns, or with a text description column, will almost certainly overflow the page width in portrait mode. Apply these fixes together:

```latex
% Rule: >=6 columns → wrap in landscape; text description column → use p{Xcm} not l

\usepackage{pdflscape}    % add to preamble

% In the body file:
\begin{landscape}
\begin{table}[ht]
\centering
\caption{...}
\begin{threeparttable}
{\footnotesize\setlength{\tabcolsep}{4pt}     % shrink font + column padding
\begin{tabular}{p{4.5cm} c c c c c c}         % p{} for text col, c for data cols
...
\end{tabular}}
\begin{tablenotes}[flushleft]\small
\item \textit{Notes}: ...
\end{tablenotes}
\end{threeparttable}
\end{table}
\end{landscape}
```

**Quick reference for portrait mode** (1.25in margins, ~16.5cm text width):

| Columns | First column | Approach |
|---------|-------------|----------|
| 3-4 | `l` | Portrait, no special treatment needed |
| 5-6 | `p{4.5cm}` + `{\footnotesize\setlength{\tabcolsep}{4pt}}` | Portrait, tight |
| 7+ | `p{Xcm}` + `\footnotesize` | Landscape always |

Keep `\begin{tablenotes}` text concise — a long inline math expression that cannot line-break (e.g., a full regression formula) will produce an `Overfull \hbox` even when the table itself fits. Summarize the spec in plain language in the note and put the equation in the methods section instead.

## Related Skills & Commands

- **stats**: Summary statistics tables (Table 1)
- **ols-regression**: Generate regression results to format
- **/robustness**: Side-by-side robustness specifications tables
- **/method**: Methods section references the tables
