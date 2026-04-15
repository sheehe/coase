---
name: plot
description: Generate publication-quality econometric figures and diagnostic plots
tools:
  - Read
  - Write
  - Bash
---

# /plot — Econometric Visualization

When the user invokes /plot, identify the appropriate figure type and delegate to the `figure` skill for all formatting standards, journal defaults, and export conventions.

## Step 1: Identify What to Plot

Ask or infer from context which figure type is needed:

| Figure Type | When to Use |
|-------------|-------------|
| Event study / dynamic DID | Pre/post treatment effects over time; DID validity |
| Binscatter | Visualize conditional means and nonparametric relationships |
| RDD plot | Scatter with fitted polynomial on each side of cutoff |
| Coefficient plot | Multiple regression estimates with confidence intervals |
| Density / distribution comparison | Treatment vs control; pre/post matching |
| Time series plot | Raw series, ACF/PACF, forecast with uncertainty bands |
| Synthetic control gap plot | Treated vs synthetic control over time |
| Multi-panel figure | Combine 2–4 related plots into a journal-ready figure |

## Step 2: Apply Figure Standards

All figures are produced following the standards defined in the `figure` skill:
- Default journal style: AER/QJE (grayscale, no grid, minimal borders)
- Font: Times New Roman or Computer Modern, 11–12 pt
- Export: PDF (vector) primary, PNG (300 dpi) for drafts
- Size: single-column (3.5 in) or full-page (7 in) width

Use the `/figure` skill directly when you need fine-grained control over any of these defaults.

## Step 3: Generate and Save

1. Produce complete, runnable code in the user's preferred language (Python / R / Stata)
2. Run the code if a dataset is available
3. Save to `figures/[descriptive_name].[pdf|png]`
4. Explain what the figure reveals and flag any visible concerns (e.g., clear pre-trends, bunching at cutoff, fat tails)

## Step 4: Suggest Next Steps

After generating the figure, recommend follow-up actions:
- Diagnostic concerns → `/diagnose`
- Results ready for a paper → `/write`
- Results ready for slides → `/present`
- Need robustness visualization → `/robustness` (produces tables you can visualize here)

## See Also

- Skill: `figure` — all figure formatting details, journal standards, and full code examples
- `/diagnose` — if the figure reveals pre-trend violations, bunching, or density manipulation
- `/write` — embed the figure in a paper draft
- `/present` — embed the figure in a Beamer slide deck
- `/robustness` — generate alternative specifications to compare visually
