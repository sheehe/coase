---
name: executor_workflow
description: Maps to /experiment-bridge. Used after the user confirms the baseline design to run the main regression, perform explanation checks and robustness tests, and produce result materials directly usable for tables, figures, and writing.
---

## Workflow Notes

- Before executing this skill, first read `references/role-rules.md`.
- If the role rules conflict with the per-phase detail in this body, the hard constraints in `references/role-rules.md` win.
- The current version executes directly off the user's needs, attachments, workspace files, and existing materials in the current Coase session.
- The execution stage by default reads the confirmed baseline design from `planner/stage_7_baseline_design.md` and adjacent planning files.

---

## Research-purpose adaptation (read before execution; binds every Phase)

At startup you **must** read **research_purpose** from context (the global system prompt or the `Research purpose` field at the head of `planner/stage_7_baseline_design.md`). It binds the regression-execution rubric and the conclusion phrasing. The Planner has already specialized methodology by this field — Executor **only executes; it does not re-categorize**.

| Purpose | Execution requirement | Conclusion phrasing | Forbidden |
|------|---------|---------|-------|
| **causal** | Strictly execute the identification strategy locked by Planner (DID / Event Study / IV / RDD / PSM); placebo / pre-trend / falsification defenses must be run | Use causal language: "the causal effect of X on Y is …", "we identify …", "the treatment effect …" | Weakening Planner's already-locked causal conclusion with "associated with / correlated with / remains significant after controlling for …" |
| **associative** | Execute the regression family specified by Planner (OLS / Logit / Probit / Poisson, etc.) + FE / clustered SE; add collinearity (VIF) and reverse-causality discussion as boundary | When first presenting the main result, you must declare "this is an associative study; the results do not support a causal interpretation"; phrasing is uniformly "associated / correlated / remains significant after controlling for …" | Passing off "causal effect / impact / leads to / makes …" as a causal conclusion |

**No silent downgrade**: if a causal project's identification strategy fails on the data (parallel trends fail, weak IV, no variation in the RDD bandwidth, narrow common support for PSM), you **must** record the failure cause + diagnostic evidence in `executor/specification_log.md` and recommend in `stage_5_assessment.md` that the user return to Planner to revise the research question or identification strategy — **you may not unilaterally re-categorize the project as associative and continue**. The user picked causal expecting a causal conclusion; a quiet downgrade is a breach of contract.

**Self-check before writing each Phase's stage_*.md**: read through the text you are about to commit and ensure all conclusion-bearing phrasing is consistent with `research_purpose`. The Phase 5 final summary is the only conclusion the user sees; the "Research type" line must align exactly with `research_purpose`.

---

## Recommended analysis-execution flow

The flow below is a recommendation. Adjust order or skip steps as the situation requires.

---

## File-output contract (every Phase must commit)

Downstream Reviewer (Mode B) and Writer read your output by fixed file name. Before each Phase ends, you **must** call the write tool to write the corresponding stage_*.md, otherwise it counts as not done.

> ### ⚠️ Path warning (extremely easy to get wrong; violates the downstream contract)
>
> **`stage_*.md` must land at the root of `executor/`**, never inside `executor/scripts/` or any other subdirectory.
> `executor/scripts/` is only for `.R` scripts.

| Phase | File | Key content |
|------|------|---------|
| 1 | `executor/stage_1_data_preparation.md` | Data prep notes + sample size + variable list |
| 2 | `executor/stage_2_run_baseline.md` | Main regression result text + coefficient/SE report + 2–4 sentences of interpretation |
| 3 | `executor/stage_3_explanation_robustness.md` | Priority Check Map + mechanisms / heterogeneity / robustness |
| 4 | `executor/stage_4_table_figure_output.md` | Table Package + Figure Package list + file paths |
| 5 | `executor/stage_5_assessment.md` | Appendix & Next-Step Suggestions |
| ongoing | `executor/specification_log.md` | All specs run (including failed ones) |

**Hard rules**:
- The content of `stage_*.md` is a **natural-language summary**, not raw R output
- The **raw data** of tables and figures lands under `executor/outputs/tables/` and `executor/outputs/figures/`; `stage_*.md` only references the path
- Do not paste the full `summary(model)` output into `stage_*.md` — pick the key lines
- Long content goes to disk only; do not paste back into the conversation

---

## Unified R command templates (mandatory)

Below is the cross-project "standard recipe" Executor shares — table / figure / regression conventions are locked here. **Use these directly in scripts**; tweak parameters for spec changes; **do not swap the libraries or rewrite the helpers**. To switch styles, justify it in `specification_log.md` first.

### 1) Package loading (fixed at the top of every .R script)

```r
suppressPackageStartupMessages({
  library(data.table)    # data wrangling (fread/fwrite)
  library(arrow)         # parquet I/O
  library(fixest)        # regression (high-dim FE + C++ backend)
  library(modelsummary)  # tables / coefficient plots
  library(ggfixest)      # event study (ggiplot)
  library(ggplot2)       # plots
  library(scales)        # axis formatting
})
```

### 2) Regression (baseline and multi-column comparison)

```r
# Two-way FE + cluster SE — the most common short-panel recipe
m <- feols(y ~ x + z1 + z2 | firm + year, data = dt, cluster = ~firm)

# A multi-column main table must use a named list (modelsummary reads column names)
mods <- list(
  "(1) Pooled"     = feols(y ~ x,                       data = dt, cluster = ~firm),
  "(2) + Controls" = feols(y ~ x + z1 + z2,             data = dt, cluster = ~firm),
  "(3) + FE"       = feols(y ~ x + z1 + z2 | firm+year, data = dt, cluster = ~firm)
)
```

### 3) Tables (CSV is the single source of truth — set numeric precision once)

```r
modelsummary(
  mods,
  output    = "data.frame",
  fmt       = 4,                                          # coefficients/SE 4 digits
  estimate  = "{estimate}{stars}",
  statistic = "({std.error})",
  stars     = c('*' = .1, '**' = .05, '***' = .01),
  gof_omit  = "AIC|BIC|Log.|RMSE|R2 Adj|R2 Within"
) |> fwrite("executor/outputs/tables/table_baseline.csv")
```

### 4) Unified figure spec (must use theme_coase + save_fig)

```r
# Academic minimal: no minor grid / black border / grayscale palette / top legend
theme_coase <- function(base_size = 11) {
  theme_minimal(base_size = base_size, base_family = "sans") +
    theme(
      panel.grid.minor   = element_blank(),
      panel.grid.major.x = element_blank(),
      panel.grid.major.y = element_line(linewidth = .25, color = "grey85"),
      panel.border       = element_rect(color = "black", fill = NA, linewidth = .5),
      axis.ticks         = element_line(color = "black", linewidth = .35),
      axis.text          = element_text(color = "black"),
      legend.position    = "top",
      legend.title       = element_blank(),
      plot.margin        = margin(8, 12, 8, 8)
    )
}
theme_set(theme_coase())

# Palette: ≤4 categories use grayscale; >4 use viridis (scale_*_viridis_d(option = "D"))
pal_gray <- c("#000000", "#7F7F7F", "#BFBFBF", "#404040")

# Dual-format save (PNG 300 DPI + PDF vector; figures with CJK characters must use cairo_pdf)
save_fig <- function(p, name, w = 7, h = 5) {
  ggsave(sprintf("executor/outputs/figures/%s.png", name),
         p, dpi = 300, width = w, height = h)
  ggsave(sprintf("executor/outputs/figures/%s.pdf", name),
         p, device = cairo_pdf, width = w, height = h)
}
```

### 5) Common figure templates (use directly)

```r
# (a) Coefficient plot: multi-model main-regression comparison — modelplot ships ggplot
p <- modelplot(mods, coef_omit = "Intercept|z1|z2") +
  geom_vline(xintercept = 0, linetype = "dashed", color = "grey50") +
  scale_color_manual(values = pal_gray) +
  labs(x = NULL, y = NULL)
save_fig(p, "fig_coef_baseline")

# (b) Event Study: DID parallel trends + dynamic effects
es <- feols(y ~ i(rel_year, treated, ref = -1) | firm + year,
            data = dt, cluster = ~firm)
p <- ggiplot(es, ref.line = 0,
             xlab = "Years relative to event",
             ylab = "Coefficient") + theme_coase()
save_fig(p, "fig_event_study")

# (c) Scatter + fit line: bivariate descriptive
p <- ggplot(dt, aes(x = x, y = y)) +
  geom_point(alpha = .25, size = .8, color = pal_gray[2]) +
  geom_smooth(method = "lm", color = pal_gray[1], se = TRUE, linewidth = .5) +
  scale_x_continuous(labels = label_comma()) +
  labs(x = "X label", y = "Y label")
save_fig(p, "fig_scatter_xy")

# (d) Heterogeneity bar plot: subsample coefficients + 95% CI
# `agg` must already be aggregated to a data.table with group / subgroup / est / lo / hi
p <- ggplot(agg, aes(x = group, y = est, fill = subgroup)) +
  geom_col(position = position_dodge(.7), width = .65) +
  geom_errorbar(aes(ymin = lo, ymax = hi),
                position = position_dodge(.7), width = .15) +
  scale_fill_manual(values = pal_gray) +
  labs(x = NULL, y = "Estimate")
save_fig(p, "fig_heterog_bar")
```

### 6) CJK-character figures — special note

- A PDF containing CJK characters **must** use `device = cairo_pdf`, otherwise CJK glyphs render as boxes or vanish (`save_fig` already defaults to this)
- CJK fonts: on Windows use `family = "Microsoft YaHei"`, on Mac use `family = "PingFang SC"`; override at the ggplot top level via `theme(text = element_text(family = "..."))`
- Do not mix CJK and English labels — a single figure should be entirely in one language, decided by the `research_purpose` context

---

### Phase 1: Environment & data preparation + data quality gate + pre-regression diagnostics

**Goal**: prepare the data environment for analysis, complete the data-quality gate checks, and run pre-regression diagnostics before entering the baseline regression. This Phase is the most error-prone part of an empirical project; the three blocks below must be executed in full.

#### 1.A Basic data preparation

- Read the baseline-design file (`planner/stage_7_baseline_design.md`) to understand the required variables and regression spec
- Create `01_data_preparation.R`: load required packages (data.table, haven, fixest, etc.), read raw data, clean, build variables, save the cleaned analysis dataset
- Run the script
- Verify the output file is generated and key variables exist with the correct types

##### 1.A.1 Big-data scale adaptation (check size before reading raw data; avoid blowing R's memory)

Use the sample size recorded in Phase 1 `stage_1_alignment.md` and pick tools by size:

| Rows | Read method | Cleaned storage |
|------|---------|---------|
| < 100K | `data.table::fread()` full read | csv / RData both fine |
| 100K – 1M | `fread(select = c(...))` to read only needed columns | **convert to parquet** (`arrow::write_parquet`) or fst; do not repeatedly funnel through csv |
| 1M – 10M | Use `duckdb::dbGetQuery(con, "SELECT ... FROM read_csv_auto('...')")` to filter/aggregate in SQL, then bring into R | parquet + persistent DuckDB |
| > 10M | **Do not read into R in one shot**; use DuckDB / Arrow for sliced queries, or partition by time/industry and process in batches | partitioned parquet |

**Hard rules**:
- Before merging multiple tables, `nrow()` each table and estimate the upper bound of the cartesian product; if expected post-merge rows > 100M, report and check with the baseline designer
- When the main regression has N > 1M, **must use `fixest::feols`** (C++ backend, efficient on large samples and high-dim FE); do not push through with `lm()` / `plm()`
- When computing a correlation matrix or VIF on > 100 variables, group by topic; do not print a > 100 × 100 matrix into stage_1
- When the descriptive-stats table has > 50 variable rows, split it into multiple tables on disk; stage_1 only references paths

#### 1.B Data quality gate (6 mandatory checks; must be written into stage_1)

1. **Primary-key consistency**: report single-table primary-key uniqueness + cross-year primary-key stability. **Common pitfalls**: company-name changes / company-code re-encoding / survey-data primary keys drifting across years. If duplicates or drift exist, clean before merge.
2. **Multi-source merge quality**: when merging multiple tables, you must report **match rate** + **structural difference of unmatched samples** (random missingness vs. systematic exclusion of some category). Do not silently push through an abnormally low match rate.
3. **Sample-deletion log**: for every batch of deletions, record in stage_1 "reason for deletion + N before + N after". **Order of deletions affects the result** — be explicit.
4. **Derived-variable verification**: **derived metrics** supplied by CSMAR / Wind / other secondary platforms (e.g., pre-computed TFP, investment efficiency, governance index) must be verified against their definition once; **when feasible, prefer computing from raw variables yourself** rather than over-trusting the platform's derivations.
5. **Out-of-scope sample handling**: whether to exclude ST / *ST / financial industries (banks, insurance, securities) / subsidiaries / samples with severe missingness — the exclusion rule must be **explicitly declared** in stage_1.
6. **Missing-value strategy**: for each key variable, pick one of "linear interpolation / mean imputation / drop / Heckman two-step" and explain why. **When an important variable is heavily missing, sample-selection bias must be considered** (cf. executor_system.md Rule 8 / Planner Rule 7's Selection item).

#### 1.C Pre-regression diagnostics (6 items)

1. **Descriptive statistics**: N / mean / SD / min / p25 / p50 / p75 / max, plus the **correlation matrix** (`cor()` or `modelsummary::datasummary_correlation`). Save the descriptive-stats table to `executor/outputs/tables/desc_stats.*`.
2. **Outlier handling**: winsorize at 1%/99% (`DescTools::Winsorize`) or drop outright; explain the choice — winsorize for poor data quality, drop for obvious entry errors. **Do not handle silently.**
3. **Distribution and log transformation**: consider logging continuous variables with severe skew; ⚠️ **when the DV has many zeros do not casually use `log(1+x)`** (the top-five economics journals have criticized abuse of log(1+x)); alternatives are the IHS transform (`asinh`) or switching to Poisson / NB regression.
4. **Variable units and magnitude**: keep core variables on similar magnitudes (e.g., amounts in 100M units rather than yuan) to avoid coefficients that are too large or too small to interpret.
5. **VIF multicollinearity check**: `car::vif()` or `performance::check_collinearity()`. **VIF < 10 passes; > 5 needs explanation**. **You may exclude FE variables when computing VIF** — some FEs inflate VIF artificially without affecting the estimate. When VIF is severely above threshold, drop or merge variables.
6. **Data-type judgment**:
   - **Cross-sectional**: plain OLS / Logit / Probit, etc.
   - **Short panel (large n, small T; most common)**: generally treated as stationary, **no unit-root test**; go straight to Panel FE
   - **Long panel (small n, large T; less common)**: needs unit-root testing; if non-stationary, consider panel cointegration or error-correction
   Record the data-type judgment explicitly in stage_1 — **this drives the model choice in Phase 2 baseline**.

**Output**: data-prep script (saved under `executor/scripts/`), description of the cleaned analysis dataset, sample-size record, data-quality gate results, pre-regression diagnostic results.

**Commit (mandatory)**: record:
- 1.A data-prep process + final sample size + key-variable types and missingness rates + cleaned dataset path
- 1.B all 6 data-quality gate results (one paragraph each)
- 1.C all 6 pre-regression diagnostic results (including VIF values, outlier-handling choice, data-type conclusion, descriptive-stats table path)

---

### Phase 2: Run Baseline

**Goal**: execute the main regression and produce a trustworthy baseline result.

Recommended approach:
- Re-read the baseline design (`planner/stage_7_baseline_design.md`); execute strictly as designed
- Create `02_baseline_regression.R`: clean, runnable, lightly commented R code
- Run; if it fails, prefer the smallest fix to the technical error — do not arbitrarily change the research design
- Produce the main regression table; in plain language explain coefficient direction, significance, and economic magnitude

If the main result is unstable or insignificant, you may make limited alternative-spec adjustments to controls, sample definition, or variable treatment (at most 2 attempts), with the change clearly labeled.

**Output format**:
1. Main regression table
2. Report of coefficient direction, statistical significance, magnitude
3. 2–4 sentences of interpretation
4. Boundary: what it can and cannot support
5. Specification Log → append to `executor/specification_log.md`

**Commit (mandatory)**:
- Write items 1–4 (natural-language summary + table-path references)
- Append item 5 (read existing content and concatenate before writing; do not overwrite)

---

### Phase 3: Explanation Check & Robustness

**Goal**: based on the baseline result, choose the most necessary extension analyses. Not "as many as possible" — selectively.

Recommended approach:
**Step 1: clarify what needs to be tested**
- Identify where the main result most needs additional explanation (Mechanism-supporting evidence needed)
- Identify where the main result is most likely to be challenged (Robustness concerns)
- Identify the boundaries of the result (Heterogeneity worth checking)

**Step 2: pick targeted tests**
- Mechanism-Supporting Evidence: only when the data has the relevant variables and the temporal relation is reasonable (at most 2–3)
- Heterogeneity: only when theory clearly predicts a conditional difference (at most 2–3)
- Robustness Checks: only the ones most directly addressing baseline concerns (at most 3–5)
- If a test is not appropriate for the data, output "not feasible"

**Step 3: execute and record**
- For each chosen test: state why it is chosen, which concern it answers
- Execute
- On failure, do the smallest technical fix; do not change the test logic

**Output format**: Priority Check Map, Mechanism-Supporting Evidence (max 3), Heterogeneity (max 3), Robustness Checks (max 5), Overall Assessment

**Commit (mandatory)**:
- Write all 5 sections
- Append to `executor/specification_log.md` (same as Phase 2; read first, concatenate, then write)

---

### Phase 4: Table & Figure Output

**Goal**: convert the completed analysis into publication-quality output materials.

Recommended approach:
**Step 1: Final Output Selection**
- Identify, from completed results, the main result, the most critical extension result, and the most worthwhile robustness result
- Decide which go into the main text and which into the appendix

**Step 2: Table Package**
- Use tools to generate tables
- Main Results Table (keep only the most important columns; mark the baseline specification)
- Explanation/Mechanism Table (if mechanism evidence is weak, switch to in-text description or appendix table)
- Robustness Table (show only the most critical tests)
- Save tables to `executor/outputs/tables/`. **The agent only writes `.csv` (single source of truth)**:
  - In R, use `modelsummary(..., output="data.frame")` + `fwrite`, or directly `write.csv(df, "table_xxx.csv")`
  - Numeric precision is decided once in CSV (coefficients/SE 4 decimals, p-values 4, N integer); post-processing does not change numbers
  - **The same-name `.md` (GFM pipe table) is auto-derived by the orchestrator**; the agent does not hand-write it. Any hand-written `.md` / `.tex` / `.xlsx` will be overwritten on the next sync or conflict with the single source of truth
  - **Naming**: uniform `table_{role}.csv`, with `role ∈ {baseline, mechanism, robust, heterog, desc_stats, corr_matrix}`. On iteration, **overwrite the same file name**; do not add `_v2` / `_new` / `_final` / `_vN` suffixes (record iteration history in `specification_log.md`, not in file names)
- Each table ultimately commits two files: `.csv` (agent-written) + same-name `.md` (auto-derived)

**Step 3: Figure Package**
- Decide whether figures are needed; if not, state the reason explicitly
- Recommend at most 3–7 main-text figures; the rest go to appendix
- Use `analyze_image` to verify figure quality
- Save to `executor/outputs/figures/`. **Always call `save_fig(p, name)` from Section 4 of the unified R command templates** — it already handles PNG 300 DPI + PDF vector + cairo_pdf CJK support
- Apply `+ theme_coase()` to the ggplot object first (or rely on the global `theme_set`), then `save_fig`; do not bypass the helper to call `ggsave` yourself

**Output format**: Final Output Recommendation, Table Package, Figure Package

**Commit (mandatory)**: the file must list:
- For every table under `executor/outputs/tables/`: the four-file set (`.tex` / `.csv` / `.md` / `.xlsx`) paths plus a one-line description
- For every figure under `executor/outputs/figures/`: the two-file set (`.png` / `.pdf`) paths plus a one-line description
- Which go to main text, which go to appendix

---

### Phase 5: Output Assessment

**Goal**: assess output completeness and provide next-step recommendations.

Recommended approach:
- List content recommended for the appendix
- Judge what is still missing in the empirical section (key robustness, variable-definition notes, sample-filtering notes, etc.)
- Provide concise next-step recommendations

**Output format**: Appendix & Next-Step Suggestions (recommended appendix content, what is still missing, recommended next step)

**Commit (mandatory)**.

---

## Final self-check (run at the end of all Phases)

**Before** delivering the final summary, verify the following files:

- [ ] `executor/stage_1_data_preparation.md`
- [ ] `executor/stage_2_run_baseline.md` ← required by Reviewer Mode B
- [ ] `executor/stage_3_explanation_robustness.md` ← required by Reviewer Mode B
- [ ] `executor/stage_4_table_figure_output.md`
- [ ] `executor/stage_5_assessment.md`
- [ ] `executor/specification_log.md` ← required by Reviewer Mode B
- [ ] At least one `executor/outputs/tables/table_{role}.csv` (main regression table, single source of truth)
- [ ] The matching `executor/outputs/tables/table_{role}.md` (auto-derived by the orchestrator; the agent does not hand-write it. If missing, sync did not fire; any subsequent tool_use can re-trigger it)
- [ ] No `.tex` / `.xlsx` files under `tables/`, and no redundant CSVs with `_v2` / `_final`-style suffixes
- [ ] If figures are produced: each figure must have both `.png` (300 DPI) and `.pdf` (vector; if it contains CJK, use `cairo_pdf`)

If any is missing → fix it before delivering the final summary.

**Research-purpose consistency check (mandatory before the final summary)**:

1. Read the `Research purpose` field at the head of `planner/stage_7_baseline_design.md`; call it `P`
2. Scan the full text of `stage_2_run_baseline.md` / `stage_3_explanation_robustness.md` / `stage_5_assessment.md` and the final summary you are about to deliver:
   - `P = causal` → "associative study", "non-causal identification", "merely a correlation", "this study does not support a causal interpretation" and similar downgrade phrases are forbidden
   - `P = associative` → the final summary must contain an explicit statement "this is an associative study; the results do not support a causal interpretation", and "causal effect", "X causes Y", "X makes Y rise" and similar causal phrases are forbidden
3. If you find any phrasing in conflict with `P` → **fix the stage_*.md first, then rewrite the summary**; do not deliver an inconsistent conclusion to the user
4. If the causal strategy genuinely failed and a downgrade really is warranted, follow the "no silent downgrade" clause: log it in specification_log + stage_5 and recommend the user return to Planner — do not change the rubric on the fly inside the summary

After the check, deliver a complete Executor-stage summary (under 5,000 words) covering: baseline regression results, key findings, robustness conclusions, list of tables and figures produced, Specification Log digest, recommendations for the Writer. The summary must open with one line **"Research type: {P}"**, exactly aligned with Planner.
