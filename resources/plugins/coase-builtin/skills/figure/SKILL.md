---
name: figure
description: |
  Econometrics skill for generating publication-quality figures for top economics journals. Activates when the user asks about:
  "econometric figure", "publication figure", "journal figure", "AER figure",
  "QJE figure", "event study plot", "coefficient plot", "coefplot",
  "binned scatter", "binscatter", "RDD plot", "parallel trends plot",
  "kernel density", "distribution plot", "time series plot", "map",
  "figure formatting", "academic plot", "论文图表", "学术图", "系数图",
  "事件研究图", "散点图", "分布图", "趋势图", "回归可视化"
---
## Workflow Integration

若当前会话由 Coase 研究工作流触发（`/full-research` / `/idea-to-results` / `/run-experiment`），本 skill 的输出必须按以下规则落入阶段文件，**不得自行新建目录或脱离工作流上下文**：

- **规划阶段 · Descriptive Snapshot**: 生成 1-2 张最有帮助的描述性图形（因变量分布 / 处理组对照组比较 / 样本年份覆盖），路径记入 `planner/stage_8_descriptive_snapshot.md`。
- **执行阶段 · Robustness**: 事件研究图 / 平行趋势图 / coefficient plot 等识别支持性图形，文件路径记入 `executor/stage_2_explanation_robustness.md`。

若用户未指定工作流（直接提问使用本方法），忽略本节，按下方正文自由执行。

---

# Publication-Quality Figures Skill

This skill generates figure code that meets the formatting standards of top economics journals (AER, QJE, ReStud, Econometrica, JPE). It covers the most common econometric figure types with precise control over fonts, colors, dimensions, and export formats.

## Journal Requirements Summary

| Requirement | AER / QJE / ReStud Standard |
|-------------|----------------------------|
| File format | PDF (vector) or EPS; PNG at 300+ DPI for raster |
| Dimensions | Width: 3.4in (single column) or 7in (full page); height ≤ 9in |
| Font | Matching journal body font; minimum 8pt for labels |
| Colors | Must be readable in grayscale; avoid red-green pairs |
| Line width | ≥ 0.5pt for data lines; ≥ 0.75pt for axes |
| Legend | Inside plot area or below; no box border preferred |
| Notes | Figure notes below, starting with "Notes:" |
| Numbering | "Figure 1:", "Figure 2:" etc. in caption |

## Base Setup: Journal-Ready Defaults

### Python (matplotlib)

```python
# Python — journal-quality defaults
import matplotlib.pyplot as plt
import matplotlib as mpl
import numpy as np

# AER/QJE style defaults
plt.rcParams.update({
    'figure.figsize': (7, 4.5),
    'figure.dpi': 300,
    'font.family': 'serif',
    'font.serif': ['Times New Roman', 'Computer Modern Roman'],
    'font.size': 11,
    'axes.labelsize': 12,
    'axes.titlesize': 13,
    'xtick.labelsize': 10,
    'ytick.labelsize': 10,
    'legend.fontsize': 10,
    'axes.linewidth': 0.8,
    'lines.linewidth': 1.5,
    'lines.markersize': 5,
    'axes.spines.top': False,
    'axes.spines.right': False,
    'savefig.bbox': 'tight',
    'savefig.pad_inches': 0.05,
})

# Grayscale-safe color palette
COLORS = ['#2c3e50', '#e74c3c', '#3498db', '#27ae60', '#f39c12', '#8e44ad']
MARKERS = ['o', 's', '^', 'D', 'v', 'P']
LINESTYLES = ['-', '--', '-.', ':', (0, (3, 1, 1, 1)), (0, (5, 2))]
```

### R (ggplot2)

```r
# R — journal-quality ggplot2 theme
library(ggplot2)
library(scales)

theme_econ <- function(base_size = 11, base_family = "serif") {
  theme_minimal(base_size = base_size, base_family = base_family) %+replace%
    theme(
      # Clean axes
      panel.grid.major = element_line(color = "grey90", linewidth = 0.3),
      panel.grid.minor = element_blank(),
      axis.line = element_line(color = "black", linewidth = 0.5),
      axis.ticks = element_line(color = "black", linewidth = 0.3),
      # Text
      axis.title = element_text(size = rel(1.1)),
      axis.text = element_text(size = rel(0.9), color = "black"),
      plot.title = element_text(size = rel(1.2), face = "bold", hjust = 0),
      plot.subtitle = element_text(size = rel(0.95), color = "grey30"),
      plot.caption = element_text(size = rel(0.8), hjust = 0, color = "grey40"),
      # Legend
      legend.position = "bottom",
      legend.title = element_blank(),
      legend.background = element_blank(),
      legend.key = element_blank(),
      # Margins
      plot.margin = margin(10, 15, 10, 10)
    )
}

# Grayscale-safe palette
econ_colors <- c("#2c3e50", "#e74c3c", "#3498db", "#27ae60", "#f39c12", "#8e44ad")

# Export function
save_econ_fig <- function(plot, filename, width = 7, height = 4.5) {
  ggsave(filename, plot, width = width, height = height, dpi = 300,
         device = cairo_pdf)  # vector PDF with embedded fonts
}
```

### Stata

```stata
* Stata — journal-quality graph scheme
set scheme s2color
graph set window fontface "Times New Roman"

* Global graph options for consistency
global graph_opts ///
    graphregion(color(white) margin(small)) ///
    plotregion(margin(medium)) ///
    ylabel(, angle(horizontal) nogrid labsize(small)) ///
    xlabel(, labsize(small)) ///
    legend(region(lcolor(none)) size(small) rows(1) position(6))

* Export as PDF
graph export "figure.pdf", as(pdf) replace
```

## Common Econometric Figure Types

### 1. Event Study / Dynamic Treatment Effects

```python
# Python — event study plot
import pandas as pd

def plot_event_study(coefs, ses, periods, ref_period=-1,
                     treatment_time=0, title="Event Study",
                     ylabel="Coefficient Estimate"):
    fig, ax = plt.subplots(figsize=(7, 4.5))

    # Confidence intervals
    ci_lower = [c - 1.96 * s for c, s in zip(coefs, ses)]
    ci_upper = [c + 1.96 * s for c, s in zip(coefs, ses)]

    # Plot CI band
    ax.fill_between(periods, ci_lower, ci_upper,
                    alpha=0.15, color=COLORS[0])
    # Point estimates
    ax.plot(periods, coefs, 'o-', color=COLORS[0],
            markersize=5, linewidth=1.5, zorder=5)

    # Reference lines
    ax.axhline(y=0, color='black', linewidth=0.5, linestyle='-')
    ax.axvline(x=treatment_time - 0.5, color='grey', linewidth=0.8,
               linestyle='--', alpha=0.7)

    # Labels
    ax.set_xlabel("Periods Relative to Treatment")
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.annotate("Treatment", xy=(treatment_time - 0.5, ax.get_ylim()[1] * 0.9),
                fontsize=9, color='grey40', ha='right')

    plt.tight_layout()
    plt.savefig("event_study.pdf")
    return fig
```

```r
# R — event study (fixest + broom + ggplot2)
# 关键约定：FILTER_KEY 必须匹配你 fixest 模型 term 里实际出现的字符串，
# 否则 filter 抓空、estimate 退化为 logical，ggplot 会画出 y 轴只有 "TRUE" 的废图。
library(fixest); library(broom); library(dplyr); library(ggplot2); library(stringr)

es <- feols(y ~ i(rel_time, treat, ref = -1) | entity_id + year,
            data = df, cluster = ~entity_id)
# i(rel_time, treat, ref=-1) 生成的 term 形如 "rel_time::-3:treat" → FILTER_KEY = "rel_time"
# 若改用 i(year, treat) 或自定义 time_to_treat 列，把 FILTER_KEY 与正则同步换掉
FILTER_KEY <- "rel_time"
PERIOD_RX  <- "-?\\d+"

es_df <- tidy(es, conf.int = TRUE) %>%
  filter(grepl(FILTER_KEY, term)) %>%
  mutate(period = as.numeric(str_extract(term, PERIOD_RX))) %>%
  bind_rows(tibble(period = -1, estimate = 0, conf.low = 0, conf.high = 0))

# 防御：filter 抓空时立刻报错而不是画废图
stopifnot(nrow(es_df) > 1, is.numeric(es_df$estimate))

p_event <- ggplot(es_df, aes(x = period, y = estimate)) +
  geom_ribbon(aes(ymin = conf.low, ymax = conf.high),
              fill = econ_colors[1], alpha = 0.15) +
  geom_point(color = econ_colors[1], size = 2) +
  geom_line(color = econ_colors[1], linewidth = 0.8) +
  geom_hline(yintercept = 0, linewidth = 0.5) +
  geom_vline(xintercept = -0.5, linetype = "dashed", color = "grey50") +
  labs(x = "Periods Relative to Treatment",
       y = "Coefficient Estimate",
       title = "Event Study: Dynamic Treatment Effects",
       caption = "Notes: 95% CIs. SE clustered at entity level.") +
  theme_econ()

save_econ_fig(p_event, "event_study.pdf")

# 快速预览（无需 ggplot 自定义）：iplot(es)
```

```stata
* Stata — event study plot
reghdfe y ib(-1).rel_time, absorb(entity_id year) cluster(entity_id)

coefplot, vertical drop(_cons) ///
    yline(0, lcolor(black) lwidth(thin)) ///
    xline(4.5, lcolor(gs8) lpattern(dash)) ///
    ciopts(recast(rcap) lcolor(navy) lwidth(thin)) ///
    mcolor(navy) msymbol(circle) ///
    ytitle("Coefficient Estimate") ///
    xtitle("Periods Relative to Treatment") ///
    title("Event Study: Dynamic Treatment Effects") ///
    note("Notes: 95% CIs shown. SEs clustered at entity level.") ///
    $graph_opts
graph export "event_study.pdf", as(pdf) replace
```

### 2. Coefficient Plot (Multiple Models)

```python
# Python — coefficient plot comparing specifications
def plot_coefplot(models, model_names, var_names, var_labels=None):
    fig, ax = plt.subplots(figsize=(7, 0.6 * len(var_names) + 1.5))
    var_labels = var_labels or var_names
    n_models = len(models)
    offsets = np.linspace(-0.15 * (n_models-1), 0.15 * (n_models-1), n_models)

    for j, (coefs, ses, name) in enumerate(zip(
        [m['coefs'] for m in models],
        [m['ses'] for m in models],
        model_names)):

        y_pos = np.arange(len(var_names)) + offsets[j]
        ax.errorbar(coefs, y_pos, xerr=1.96 * np.array(ses),
                    fmt='o', color=COLORS[j], markersize=5,
                    capsize=3, linewidth=1.2, label=name)

    ax.axvline(x=0, color='black', linewidth=0.5)
    ax.set_yticks(range(len(var_names)))
    ax.set_yticklabels(var_labels)
    ax.set_xlabel("Coefficient Estimate")
    ax.legend(loc='lower right', frameon=False)
    ax.invert_yaxis()
    plt.tight_layout()
    plt.savefig("coefplot.pdf")
```

```r
# R — coefficient plot via modelsummary::modelplot
library(modelsummary); library(ggplot2)

# 多模型对比（替换 m1/m2/m3 为你的 fixest/lm 对象）
p_coef_multi <- modelplot(
  list("OLS" = m1, "IV" = m2, "FE" = m3),
  coef_map = c("x1" = "Treatment", "x2" = "Income", "x3" = "Education"),
  color = "model"
) +
  geom_vline(xintercept = 0, linetype = "dashed") +
  scale_color_manual(values = econ_colors[1:3]) +
  labs(x = "Coefficient Estimate", y = NULL) +
  theme_econ()
save_econ_fig(p_coef_multi, "coefplot_multi.pdf")

# 单模型简化版（隐藏 Intercept；main_model 替换为你的实际模型对象）
p_coef_single <- modelplot(main_model, coef_omit = "Intercept") +
  geom_vline(xintercept = 0, linetype = "dashed") +
  labs(x = "Coefficient Estimate", y = NULL) +
  theme_econ()
save_econ_fig(p_coef_single, "coefplot.pdf")
```

### 3. Binned Scatter Plot (binscatter)

```python
# Python — binned scatter with linear fit
def plot_binscatter(x, y, n_bins=20, controls=None, xlabel="X", ylabel="Y",
                    title="", residualize=False):
    import statsmodels.api as sm

    if residualize and controls is not None:
        # Residualize both x and y on controls
        x = sm.OLS(x, sm.add_constant(controls)).fit().resid
        y = sm.OLS(y, sm.add_constant(controls)).fit().resid

    # Create bins
    bins = pd.qcut(x, n_bins, duplicates='drop')
    bin_means = pd.DataFrame({'x': x, 'y': y, 'bin': bins}).groupby('bin').mean()

    fig, ax = plt.subplots(figsize=(7, 4.5))
    ax.scatter(bin_means['x'], bin_means['y'], color=COLORS[0],
               s=40, zorder=5, edgecolors='white', linewidth=0.5)

    # Linear fit
    z = np.polyfit(bin_means['x'], bin_means['y'], 1)
    x_line = np.linspace(bin_means['x'].min(), bin_means['x'].max(), 100)
    ax.plot(x_line, np.polyval(z, x_line), color=COLORS[1],
            linewidth=1.2, linestyle='--')

    slope, pval = z[0], sm.OLS(y, sm.add_constant(x)).fit().pvalues[1]
    ax.annotate(f"Slope = {slope:.3f} (p = {pval:.3f})",
                xy=(0.05, 0.95), xycoords='axes fraction',
                fontsize=10, va='top')

    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    plt.tight_layout()
    plt.savefig("binscatter.pdf")
```

```r
# R — binscatter with binsreg (Cattaneo et al.)
library(binsreg)
binsreg(y = df$y, x = df$x, w = ~ x1 + x2,  # controls
        data = df, dots = c(0, 0), line = c(3, 3),
        ci = c(3, 3), cb = c(3, 3),
        title = "Binned Scatter: Y vs X",
        x.label = "X Variable", y.label = "Y Variable")

# ggplot2 manual version
library(dplyr)
df_binned <- df %>%
  mutate(bin = ntile(x, 20)) %>%
  group_by(bin) %>%
  summarize(x = mean(x), y = mean(y))

ggplot(df_binned, aes(x = x, y = y)) +
  geom_point(color = econ_colors[1], size = 3) +
  geom_smooth(method = "lm", se = FALSE, color = econ_colors[2],
              linetype = "dashed", linewidth = 0.8) +
  labs(x = "X Variable", y = "Y Variable") +
  theme_econ()
```

```stata
* Stata — binscatter
ssc install binscatter

binscatter y x, controls(x1 x2) nquantiles(20) ///
    lcolor(navy) mcolor(navy) ///
    ytitle("Y Variable") xtitle("X Variable") ///
    title("Binned Scatter: Y vs X") ///
    $graph_opts
graph export "binscatter.pdf", as(pdf) replace
```

### 4. RDD Visualization

```python
# Python — RDD plot with local polynomial fit
def plot_rdd(running_var, outcome, cutoff, bandwidth=None,
             n_bins=20, title="Regression Discontinuity"):
    fig, ax = plt.subplots(figsize=(7, 4.5))

    # Binned means (separate for each side)
    for side, mask, color in [("Control", running_var < cutoff, COLORS[0]),
                               ("Treated", running_var >= cutoff, COLORS[1])]:
        x_side = running_var[mask]
        y_side = outcome[mask]
        bins = pd.qcut(x_side, min(n_bins, len(x_side)//5), duplicates='drop')
        bm = pd.DataFrame({'x': x_side, 'y': y_side, 'bin': bins}).groupby('bin').mean()
        ax.scatter(bm['x'], bm['y'], color=color, s=35, zorder=5,
                   edgecolors='white', linewidth=0.5)

        # Local polynomial fit
        z = np.polyfit(x_side, y_side, 1)
        x_fit = np.linspace(x_side.min(), x_side.max(), 200)
        ax.plot(x_fit, np.polyval(z, x_fit), color=color, linewidth=1.5)

    # Cutoff line
    ax.axvline(x=cutoff, color='grey', linewidth=1, linestyle='--')
    ax.set_xlabel("Running Variable")
    ax.set_ylabel("Outcome")
    ax.set_title(title)

    if bandwidth:
        ax.axvspan(cutoff - bandwidth, cutoff + bandwidth,
                   alpha=0.05, color='grey')

    plt.tight_layout()
    plt.savefig("rdd_plot.pdf")
```

```r
# R — RDD plot (rdrobust)
library(rdrobust)
rdplot(y = df$y, x = df$running_var, c = cutoff,
       title = "Regression Discontinuity",
       x.label = "Running Variable", y.label = "Outcome",
       col.dots = econ_colors[1:2], col.lines = econ_colors[1:2])

# ggplot2 version
ggplot(df, aes(x = running_var, y = y)) +
  geom_point(aes(color = running_var >= cutoff), alpha = 0.15, size = 1) +
  geom_smooth(data = filter(df, running_var < cutoff),
              method = "lm", formula = y ~ poly(x, 1),
              color = econ_colors[1], fill = econ_colors[1], alpha = 0.1) +
  geom_smooth(data = filter(df, running_var >= cutoff),
              method = "lm", formula = y ~ poly(x, 1),
              color = econ_colors[2], fill = econ_colors[2], alpha = 0.1) +
  geom_vline(xintercept = cutoff, linetype = "dashed", color = "grey40") +
  scale_color_manual(values = econ_colors[1:2], guide = "none") +
  labs(x = "Running Variable", y = "Outcome",
       title = "Regression Discontinuity Design") +
  theme_econ()
```

```stata
* Stata — RDD plot
rdplot y running_var, c(cutoff) ///
    graph_options(title("Regression Discontinuity") ///
    ytitle("Outcome") xtitle("Running Variable") ///
    $graph_opts)
graph export "rdd_plot.pdf", as(pdf) replace
```

### 5. Kernel Density / Distribution Comparison

```python
# Python — overlapping density plot
from scipy.stats import gaussian_kde

def plot_density(groups, labels, xlabel="Value", title=""):
    fig, ax = plt.subplots(figsize=(7, 4.5))
    for i, (data, label) in enumerate(zip(groups, labels)):
        kde = gaussian_kde(data, bw_method='silverman')
        x_grid = np.linspace(data.min() - data.std(), data.max() + data.std(), 300)
        ax.plot(x_grid, kde(x_grid), color=COLORS[i], linewidth=1.5, label=label)
        ax.fill_between(x_grid, kde(x_grid), alpha=0.1, color=COLORS[i])
    ax.set_xlabel(xlabel)
    ax.set_ylabel("Density")
    ax.set_title(title)
    ax.legend(frameon=False)
    plt.tight_layout()
    plt.savefig("density.pdf")
```

```r
# R — density comparison
ggplot(df, aes(x = outcome, fill = group, color = group)) +
  geom_density(alpha = 0.15, linewidth = 0.8) +
  scale_fill_manual(values = econ_colors[1:2]) +
  scale_color_manual(values = econ_colors[1:2]) +
  labs(x = "Outcome", y = "Density",
       title = "Distribution by Group") +
  theme_econ()
```

```stata
* Stata — density comparison
twoway (kdensity outcome if group == 0, lcolor(navy) lwidth(medthick)) ///
       (kdensity outcome if group == 1, lcolor(cranberry) lwidth(medthick) ///
        lpattern(dash)), ///
       legend(label(1 "Control") label(2 "Treatment")) ///
       ytitle("Density") xtitle("Outcome") ///
       title("Distribution by Group") ///
       $graph_opts
graph export "density.pdf", as(pdf) replace
```

### 6. Time Series / Trend Plot

```python
# Python — time series with shaded recession bars
def plot_timeseries(dates, series_dict, recessions=None,
                    ylabel="", title=""):
    fig, ax = plt.subplots(figsize=(7, 4.5))
    for i, (label, values) in enumerate(series_dict.items()):
        ax.plot(dates, values, color=COLORS[i], linewidth=1.5,
                linestyle=LINESTYLES[i], label=label)

    if recessions:
        for start, end in recessions:
            ax.axvspan(start, end, alpha=0.08, color='grey')

    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend(frameon=False, loc='best')
    fig.autofmt_xdate()
    plt.tight_layout()
    plt.savefig("timeseries.pdf")
```

```r
# R — time series with recession shading
library(ggplot2)

ggplot(df, aes(x = date, y = value)) +
  geom_rect(data = recessions,
            aes(xmin = start, xmax = end, ymin = -Inf, ymax = Inf),
            inherit.aes = FALSE, fill = "grey", alpha = 0.1) +
  geom_line(aes(color = series, linetype = series), linewidth = 0.8) +
  scale_color_manual(values = econ_colors) +
  labs(x = "", y = "Value", title = "Time Series Comparison") +
  theme_econ()
```

### 7. Synthetic Control Gap Plot

```python
# Python — treated vs synthetic control + gap
def plot_synth(years, treated, synthetic, treatment_year, title=""):
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))

    # Panel A: Levels
    ax = axes[0]
    ax.plot(years, treated, color=COLORS[0], linewidth=1.5, label="Treated")
    ax.plot(years, synthetic, color=COLORS[1], linewidth=1.5,
            linestyle='--', label="Synthetic Control")
    ax.axvline(x=treatment_year, color='grey', linewidth=0.8, linestyle='--')
    ax.set_title("(a) Treated vs. Synthetic Control")
    ax.set_ylabel("Outcome")
    ax.legend(frameon=False)

    # Panel B: Gap
    ax = axes[1]
    gap = np.array(treated) - np.array(synthetic)
    ax.plot(years, gap, color=COLORS[0], linewidth=1.5)
    ax.fill_between(years, 0, gap, where=np.array(years) >= treatment_year,
                    alpha=0.15, color=COLORS[0])
    ax.axhline(y=0, color='black', linewidth=0.5)
    ax.axvline(x=treatment_year, color='grey', linewidth=0.8, linestyle='--')
    ax.set_title("(b) Treatment Effect (Gap)")
    ax.set_ylabel("Treated − Synthetic")

    for ax in axes:
        ax.set_xlabel("Year")
    plt.tight_layout()
    plt.savefig("synth_plot.pdf")
```

### 8. Pre/Post Group Means (DiD Descriptive Trends)

事件研究图之前，每篇 DiD 论文都会先放一张**处理组 vs 对照组的均值随时间变化图**，带 95% CI ribbon 和 treatment 年份的虚线——下方为标准模板，照搬即可。

```r
library(ggplot2)

trends_data <- analysis_data %>%
  group_by(year, treatment_group) %>%
  summarise(mean_outcome = mean(outcome, na.rm = TRUE),
            se = sd(outcome, na.rm = TRUE) / sqrt(n()))

p_trends <- ggplot(trends_data, aes(x = year, y = mean_outcome,
                                     color = treatment_group,
                                     linetype = treatment_group)) +
  geom_line(size = 1) +
  geom_point(size = 2) +
  geom_ribbon(aes(ymin = mean_outcome - 1.96*se,
                  ymax = mean_outcome + 1.96*se,
                  fill = treatment_group),
              alpha = 0.2, color = NA) +
  geom_vline(xintercept = treatment_year, linetype = "dashed", color = "gray40") +
  annotate("text", x = treatment_year, y = Inf, label = "Treatment",
           vjust = 2, hjust = 0.5, size = 3) +
  scale_color_manual(values = c("Control" = "#1f77b4", "Treated" = "#ff7f0e")) +
  scale_fill_manual(values = c("Control" = "#1f77b4", "Treated" = "#ff7f0e")) +
  labs(x = "Year", y = "Outcome", color = "", fill = "", linetype = "") +
  theme_minimal() +
  theme(legend.position = "bottom",
        panel.grid.minor = element_blank())

ggsave("output/figures/figure1_trends.pdf", p_trends, width = 8, height = 5)
```

> 接入本 skill 的 journal-ready 基础设施时，把 `scale_color_manual / scale_fill_manual` 配色换成 `econ_colors[1:2]`、`theme_minimal() + theme(...)` 替换为 `theme_econ()`、`ggsave(...)` 替换为 `save_econ_fig(p_trends, "figure1_trends.pdf")` 即可，其余代码保持原样。

### 9. Heterogeneity Bar Plot (Subgroup Coefficients)

按某维度分组（地区、行业、规模等）分别跑回归后展示处理效应大小与 95% CI——典型样式：每个子组一根柱 + 误差棒 + 0 参考虚线。

**中文字体注意**：若图例 / 横轴需要显示中文，必须显式注册系统字体并启用 `showtext`，否则 PDF 里中文会渲染成 `□□□□` 方框。

```r
# R — heterogeneity bar plot (subgroup coefficients with 95% CI)
library(fixest); library(broom); library(dplyr); library(purrr); library(ggplot2)

# 中文显示（仅在图中含中文时启用；纯英文图可跳过）
# library(showtext); library(sysfonts)
# font_add("CN", "C:/Windows/Fonts/msyh.ttc")  # Windows 微软雅黑；macOS 改 PingFang.ttc
# showtext_auto()

# 1) 按 group_var 拆分数据，对每个子样本拟合相同 spec
group_var <- "region"   # 改成你的分组变量名
het_models <- df %>%
  split(.[[group_var]]) %>%
  lapply(function(d) feols(y ~ treat | entity_id + year, data = d,
                           cluster = ~entity_id))

# 2) 抽 treat 系数。term 名要与你模型一致（这里假设回归量直接叫 "treat"）
TREAT_TERM <- "treat"
het_df <- imap_dfr(het_models, ~ tidy(.x, conf.int = TRUE) %>%
                                  filter(term == TREAT_TERM) %>%
                                  mutate(group = .y))

stopifnot(nrow(het_df) >= 2, is.numeric(het_df$estimate))  # 防御：抓空立刻报错

# 3) 画图
p_het <- ggplot(het_df, aes(x = reorder(group, estimate), y = estimate,
                            fill = group)) +
  geom_col(width = 0.6, alpha = 0.85, show.legend = FALSE) +
  geom_errorbar(aes(ymin = conf.low, ymax = conf.high),
                width = 0.15, linewidth = 0.5) +
  geom_hline(yintercept = 0, linetype = "dashed", color = "grey40") +
  scale_fill_manual(values = rep(econ_colors, length.out = nrow(het_df))) +
  labs(x = NULL, y = "Coefficient (Treatment)",
       title = "Heterogeneity Analysis",
       caption = "Notes: 95% CIs. SE clustered at entity level.") +
  theme_econ() +
  theme(axis.text.x = element_text(angle = 30, hjust = 1))

save_econ_fig(p_het, "heterogeneity.pdf")
```

### 10. Multi-Panel Figures

```python
# Python — multi-panel layout
fig, axes = plt.subplots(2, 2, figsize=(12, 9))

for i, (ax, data, title) in enumerate(zip(
    axes.flat, datasets, panel_titles)):
    ax.scatter(data['x'], data['y'], color=COLORS[0], s=20, alpha=0.5)
    ax.set_title(f"({chr(97+i)}) {title}", fontsize=11)
    ax.set_xlabel("X")
    ax.set_ylabel("Y")

plt.tight_layout()
plt.savefig("multipanel.pdf")
```

```r
# R — multi-panel with patchwork
library(patchwork)

p1 <- ggplot(df, aes(x, y1)) + geom_point(size = 1, alpha = 0.3) +
  labs(title = "(a) Panel A") + theme_econ()
p2 <- ggplot(df, aes(x, y2)) + geom_point(size = 1, alpha = 0.3) +
  labs(title = "(b) Panel B") + theme_econ()
p3 <- ggplot(df, aes(x, y3)) + geom_line() +
  labs(title = "(c) Panel C") + theme_econ()
p4 <- ggplot(df, aes(x, y4)) + geom_line() +
  labs(title = "(d) Panel D") + theme_econ()

combined <- (p1 | p2) / (p3 | p4)
save_econ_fig(combined, "multipanel.pdf", width = 12, height = 9)
```

```stata
* Stata — multi-panel with graph combine
graph combine panel_a panel_b panel_c panel_d, ///
    rows(2) cols(2) ///
    title("Figure 1: Main Results") ///
    $graph_opts
graph export "multipanel.pdf", as(pdf) replace
```

## Formatting Checklist

Before submitting to a journal, verify:

- [ ] **Vector format**: Exported as PDF (not PNG/JPG) for line plots
- [ ] **Readable in grayscale**: Print in B&W to check
- [ ] **Font consistency**: Same font family as paper body text
- [ ] **Axis labels**: Descriptive, with units (e.g., "Income (1000 USD)")
- [ ] **No chartjunk**: Remove gridlines, borders, and unnecessary decoration
- [ ] **Proper aspect ratio**: Not stretched or compressed
- [ ] **Legend placement**: Inside plot if space allows; below otherwise
- [ ] **Panel labels**: (a), (b), (c) for multi-panel figures
- [ ] **Notes below figure**: Data source, sample, key definitions
- [ ] **CI/SE shown**: For any estimated quantities (coefficients, treatment effects)
- [ ] **Reference lines**: Zero line for coefficient plots; cutoff for RDD; treatment date for event study

## Common Pitfalls

- **Using default matplotlib/ggplot themes**: They look unprofessional — always customize
- **Raster exports for line plots**: Use PDF/EPS, not PNG, for any plot with lines or text
- **Too many colors**: Limit to 3–4 distinguishable colors; use linestyle for additional series
- **Tiny axis labels**: Minimum 8pt after scaling to final size in the paper
- **Missing confidence intervals**: Never show point estimates without uncertainty
- **3D plots**: Almost never appropriate in economics — use 2D alternatives
- **Pie charts**: Never use in academic economics papers

## Output File Management

Consistent figure naming and directory layout prevents the most common assembly problem: the paper's `\includegraphics{}` calls pointing to files that don't exist or are scattered across subdirectories (`data/bartik/`, `data/results/`, `output/`, etc.).

### Standard Convention

Save **all** figures to a single `figures/` directory at the project root. Use zero-padded sequential prefixes:

```
figures/
  fig01_aaei_distribution.pdf
  fig02_parallel_trends.pdf
  fig03_event_study_wages.pdf
  fig04_event_study_employment.pdf
  fig05_heterogeneity_wage_group.pdf
  ...
```

The numeric prefix (`fig01_`, `fig02_`, ...) makes insertion order explicit and survives alphabetical sorting. The descriptive suffix means you can identify the figure without opening it.

### Python Helper

Add this to any figure-generating script to enforce the convention:

```python
import os, matplotlib.pyplot as plt

FIGURES_DIR = "figures"
os.makedirs(FIGURES_DIR, exist_ok=True)

def save_fig(fig, fig_num: int, name: str, formats=("pdf",)):
    """Save to figures/figNN_name.ext with consistent naming."""
    for fmt in formats:
        path = os.path.join(FIGURES_DIR, f"fig{fig_num:02d}_{name}.{fmt}")
        fig.savefig(path, bbox_inches='tight', dpi=300)
        print(f"Saved: {path}")
    return path

# Usage:
fig, ax = plt.subplots(figsize=(7, 4.5))
# ... plotting code ...
save_fig(fig, fig_num=3, name="event_study_wages")
```

### R Helper

```r
FIGURES_DIR <- "figures"
dir.create(FIGURES_DIR, showWarnings = FALSE, recursive = TRUE)

save_fig <- function(plot, fig_num, name, width = 7, height = 4.5) {
  path <- file.path(FIGURES_DIR, sprintf("fig%02d_%s.pdf", fig_num, name))
  ggsave(path, plot, width = width, height = height, device = cairo_pdf)
  cat("Saved:", path, "\n")
  invisible(path)
}

# Usage:
p <- ggplot(...) + theme_econ()
save_fig(p, fig_num = 3, name = "event_study_wages")
```

### In the LaTeX Paper

```latex
% In preamble — point to figures/ once:
\graphicspath{{../figures/}}

% In the paper body — no path needed in each call:
\begin{figure}[htbp]
  \centering
  \includegraphics[width=0.9\textwidth]{fig03_event_study_wages}
  \caption{Event Study: Effect of AI Exposure on Log Wages}
  \label{fig:event_study}
\end{figure}
```

When multiple scripts generate figures (e.g., main analysis, robustness, heterogeneity), add a comment block at the top of each script listing which figure numbers it produces. This prevents two scripts overwriting the same file.

## Related Skills & Commands

- **/plot**: Command that generates visualization code for specific analyses
- **stats**: Summary statistics that inform what to visualize
- **table**: Companion tables that present the same results numerically
- **did-analysis**: Event study plots are the key figure for DID papers
- **rdd-analysis**: RDD binned scatter is essential for discontinuity papers
- **synthetic-control**: Gap plots and placebo plots for SCM papers
