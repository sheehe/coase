---
name: present
description: Generate a Beamer presentation from a completed econometric analysis
tools:
  - Read
  - Write
---

# /present — Beamer Slide Generation

When the user invokes /present, build a Beamer slide deck from the completed analysis using the `beamer-ppt` skill. All figure formatting follows the standards defined in the `figure` skill.

## Step 1: Gather Inputs

Ask the user for:
- **Paper title** and authors
- **Presentation type** (determines slide count and depth):
  - 15-min conference talk (~12–15 slides)
  - 45-min seminar (~30–35 slides)
  - Job market talk (~45–50 slides)
- **Key results** to highlight (main coefficient, policy implication, headline finding)
- **Figures and tables** to include (paths or descriptions)
- **Beamer theme preference** (default: Madrid or Warsaw; AER-style: Boadilla with minimal color)

Read any existing outputs in the working directory:
- Figures (`figures/*.pdf`)
- Tables (`tables/*.tex`)
- Writing drafts (`writing/*.md`, `writing/*.tex`)

## Step 2: Structure the Slide Outline

Use the `beamer-ppt` skill to build the outline appropriate for the presentation type:

| Slide Type | 15-min | 45-min | Job Market |
|------------|--------|--------|------------|
| Title | 1 | 1 | 1 |
| Motivation / Research Question | 1–2 | 2–3 | 3–4 |
| Literature / Contribution | 1 | 2–3 | 3–4 |
| Data and Sample | 1 | 2 | 2–3 |
| Empirical Strategy | 1–2 | 3–4 | 4–5 |
| Main Results | 2–3 | 4–6 | 6–8 |
| Robustness / Heterogeneity | 1 | 3–4 | 4–6 |
| Conclusion | 1 | 1–2 | 2 |
| Appendix (backup slides) | 2–3 | 5–8 | 8–12 |

Present the outline to the user for approval before generating LaTeX.

## Step 3: Populate Slides

Pull in key results, coefficient tables, and figures:
- Embed figures using `\includegraphics` (PDF preferred per `figure` skill standards)
- Format tables with `booktabs` for consistency with journal submission
- Add speaker notes (`\note{}`) for main results and robustness slides
- Highlight key numbers using `\alert{}` or `\textbf{}`

## Step 4: Apply Style

Apply a journal-appropriate Beamer theme:
- **Conference / Seminar**: Boadilla or Madrid, navy/gray palette, minimal decoration
- **Job Market**: Clean theme (e.g., `metropolis`), no navigation bars, high-contrast
- Reference `figure` skill export standards: PDF vector figures, 300 dpi PNG fallback

Include standard preamble packages: `booktabs`, `graphicx`, `amsmath`, `natbib`, `hyperref`.

## Step 5: Save

Write the final Beamer source to `slides.tex` in the working directory. Provide a compilation command:

```bash
pdflatex slides.tex && bibtex slides && pdflatex slides.tex && pdflatex slides.tex
```

List any missing figures or tables that need to be generated first, with commands to produce them (`/plot`, `/write`).

## Recommended Workflow Before Calling /present

1. `/analyze` → run the main analysis
2. `/diagnose` → validate model
3. `/robustness` → run robustness checks
4. `/plot` → generate all figures
5. `/write` → draft the paper sections
6. `/present` → create the slide deck from the above outputs

## See Also

- Skill: `beamer-ppt` — LaTeX Beamer template, theme customization, animation strategy
- Skill: `figure` — figure formatting standards used in Step 4
- `/plot` — generate figures before embedding in slides
- `/write` — draft the paper; key numbers and framing to reuse in slides
- `/robustness` — generate robustness tables for backup slides
