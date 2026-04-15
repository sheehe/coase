---
name: paper-writing
description: Draft economics papers, sections, result paragraphs, and submission-style prose
---


# Paper Writing

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this after design, data, estimates, and mechanisms are sufficiently stable to turn into a paper draft.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.

## Purpose

This skill helps economists draft, structure, and polish academic papers with proper conventions for economics journals. It provides templates for different paper types and guidance on academic writing style.

## When to Use

- Starting a new research paper from scratch
- Restructuring an existing draft
- Writing specific sections (introduction, literature review, conclusion)
- Preparing papers for journal submission

## Instructions

### Step 1: Identify Paper Type

Ask the user:
1. Is this empirical or theoretical?
2. What is the target journal/audience?
3. What stage is the paper at? (outline, first draft, revision)
4. What sections need help?

### Step 2: Follow the IMRAD Structure

For empirical papers, use:
1. **Introduction** - Motivation, research question, contribution
2. **Literature Review** - Related work and positioning
3. **Data & Methods** - Sources, sample, empirical strategy
4. **Results** - Main findings with tables/figures
5. **Discussion** - Interpretation, mechanisms, limitations
6. **Conclusion** - Summary and implications

### Step 3: Apply Economics Writing Conventions

- **First paragraph** should state the research question and main finding
- **Use present tense** for established facts, past tense for your findings
- **Be precise** with causal language (effect vs. association)
- **Cite heavily** in the literature review
- **Lead with results** in the results section

## Example Output: Introduction Template

```latex
\section{Introduction}

% Hook - Why does this matter?
[TOPIC] is a fundamental question in economics, with implications for 
[POLICY AREA] and [BROADER RELEVANCE]. Despite extensive research, 
we still lack clear evidence on [SPECIFIC GAP].

% Research question
This paper asks: [RESEARCH QUESTION IN PLAIN LANGUAGE]? 
Specifically, we examine whether [PRECISE FORMULATION OF THE QUESTION].

% Preview of answer
We find that [MAIN RESULT IN ONE SENTENCE]. This effect is 
[economically significant / modest / heterogeneous], with 
[QUANTITATIVE SUMMARY: e.g., "a one standard deviation increase 
in X associated with a Y percent increase in Z"].

% Methodology (brief)
To identify this effect, we exploit [IDENTIFICATION STRATEGY: 
natural experiment / RCT / instrumental variable / RDD]. 
Our data come from [DATA SOURCE], covering [TIME PERIOD] 
and [SAMPLE SIZE] observations.

% Contribution / Related literature
Our paper contributes to several strands of literature. 
First, we extend the work of \citet{Author2020} by [EXTENSION]. 
Second, we provide new evidence on [MECHANISM/CHANNEL] that 
complements \citet{OtherAuthor2019}. Finally, our findings 
have implications for [POLICY/FUTURE RESEARCH].

% Roadmap
The remainder of the paper is organized as follows. 
Section~\ref{sec:background} provides background and reviews 
related literature. Section~\ref{sec:data} describes our data 
and empirical strategy. Section~\ref{sec:results} presents our 
main findings. Section~\ref{sec:robustness} discusses robustness 
checks. Section~\ref{sec:conclusion} concludes.
```

## Example Output: Literature Review Template

```latex
\section{Literature Review}
\label{sec:literature}

% Thematic organization: group papers by research strand, not chronologically
This paper builds on three strands of literature.

% Strand 1: Core literature
The first strand examines [BROAD TOPIC]. Early contributions by
\citet{Seminal1} and \citet{Seminal2} established [FOUNDATIONAL FINDING].
More recent work has extended these insights to [EXTENSION],
with \citet{Recent1} showing [KEY FINDING] and \citet{Recent2}
documenting [COMPLEMENTARY FINDING] using [DATA/METHOD].

% Strand 2: Related mechanism or context
The second strand studies [RELATED TOPIC / MECHANISM].
\citet{Author3} provide evidence that [MECHANISM FINDING],
a pattern confirmed by \citet{Author4} in the context of
[DIFFERENT SETTING]. This literature suggests that [IMPLICATION FOR OUR PAPER].

% Strand 3: Methodological or empirical context
The third strand concerns [EMPIRICAL CONTEXT / IDENTIFICATION].
Several papers exploit [SIMILAR IDENTIFICATION STRATEGY]:
\citet{Author5} use [INSTRUMENT/EVENT] to identify [EFFECT],
finding [RESULT]. Our approach is closest to \citet{Author6},
who [BRIEF DESCRIPTION]. We extend their work by [HOW WE DIFFER].

% Positioning: be explicit about the contribution
This paper contributes to these literatures in two ways.
First, [CONTRIBUTION 1: what new evidence you provide].
Second, [CONTRIBUTION 2: new method, context, or mechanism].
Unlike [CLOSEST PAPER], we [KEY DISTINCTION].
```

## Example Output: Data & Methods Template

```latex
\section{Data and Empirical Strategy}
\label{sec:data}

\subsection{Data Sources and Sample Construction}

Our primary data come from [DATA SOURCE], which covers
[UNIT OF OBSERVATION] over the period [START YEAR]--[END YEAR].
[BRIEF DESCRIPTION OF WHAT THE DATA CONTAINS AND HOW IT WAS COLLECTED].

We construct our sample by [SAMPLE SELECTION STEPS].
We [INCLUDE/EXCLUDE] [CRITERIA], resulting in a final sample of
[N] [UNITS] ([OBS] observations). [NOTE any important restrictions
or potential selection concerns].

Our main outcome variable is [OUTCOME], measured as [DEFINITION].
The treatment variable is [TREATMENT], which takes value one if
[CONDITION] and zero otherwise.
Table~\ref{tab:sumstats} reports summary statistics.

\subsection{Empirical Strategy}

Our baseline specification is:

\begin{equation}
Y_{it} = \alpha + \beta \, D_{it} + \mathbf{X}_{it}'\gamma + \mu_i + \lambda_t + \varepsilon_{it}
\label{eq:baseline}
\end{equation}

\noindent where $Y_{it}$ is [OUTCOME], $D_{it}$ is [TREATMENT],
$\mathbf{X}_{it}$ is a vector of controls including [CONTROL LIST],
$\mu_i$ are [entity/firm/individual] fixed effects,
$\lambda_t$ are year fixed effects,
and $\varepsilon_{it}$ is the error term.
Standard errors are clustered at the [LEVEL] level to account for
[SERIAL CORRELATION / SPATIAL CORRELATION].

% Identification argument 鈥?be explicit
The key identification assumption is [ASSUMPTION IN PLAIN LANGUAGE].
This would be violated if [POTENTIAL THREAT]. We address this concern
by [STRATEGY: e.g., including controls, conducting placebo tests,
using an instrument]. [BRIEFLY STATE EVIDENCE FOR VALIDITY,
e.g., pre-trend tests, balance tables, first-stage F-statistic].
```

## Example Output: Discussion Template

```latex
\section{Discussion}
\label{sec:discussion}

\subsection{Mechanisms}

Our results are consistent with [MAIN MECHANISM].
To provide evidence for this channel, we [TEST: e.g., split sample
by X, examine intermediate outcomes, test for mediators].
Table~\ref{tab:mechanisms} shows that the effect is [larger/present only]
among [SUBGROUP WHERE MECHANISM APPLIES], consistent with
[MECHANISM EXPLANATION].

An alternative explanation is [ALTERNATIVE MECHANISM].
However, this would predict [TESTABLE IMPLICATION OF ALTERNATIVE],
which we do not observe in [EVIDENCE]. We therefore conclude that
[MECHANISM FAVORED BY DATA].

\subsection{Heterogeneity}

[INTRODUCE HETEROGENEITY DIMENSION AND WHY IT IS THEORETICALLY INTERESTING]

Table~\ref{tab:hetero} reports treatment effects separately for
[SUBGROUP 1] and [SUBGROUP 2]. The effect is [X times larger /
present only] for [SUBGROUP], consistent with [EXPLANATION].
[SUBGROUP] may respond more because [ECONOMIC REASON].

\subsection{External Validity and Limitations}

Our estimates apply most directly to [POPULATION/CONTEXT].
Several factors may limit external validity.
First, [LIMITATION 1: e.g., our sample covers only X country/sector].
Whether these findings generalize to [OTHER CONTEXT] is an open question.
Second, [LIMITATION 2: e.g., our identification relies on a specific
policy change that may not be representative].
Third, [LIMITATION 3: data quality, measurement error, partial compliance].

\subsection{Policy Implications}

Our findings suggest that [POLICY INTERVENTION] could [EFFECT ON OUTCOME].
Back-of-the-envelope calculations suggest [QUANTITATIVE POLICY IMPLICATION].
However, policymakers should be cautious because [CAVEAT:
e.g., general equilibrium effects, targeting concerns, political economy].
```

## Example Output: Results Section Template

```latex
\section{Results}
\label{sec:results}

% Lead with the main finding
Table~\ref{tab:main} presents our main results. Column (1) shows 
the baseline OLS specification without controls. The coefficient 
on [TREATMENT VARIABLE] is [POINT ESTIMATE] (s.e. = [SE]), 
statistically significant at the [1/5/10] percent level.

% Add controls incrementally
In column (2), we add [CONTROL SET 1]. The point estimate 
[increases/decreases slightly/remains stable] to [ESTIMATE]. 
Column (3) includes [CONTROL SET 2] and adds [FIXED EFFECTS]. 
Our preferred specification in column (4) includes [FULL CONTROLS] 
and yields [FINAL ESTIMATE].

% Interpret magnitude
To gauge economic significance, note that [INTERPRETATION]. 
A one standard deviation increase in [X] is associated with 
a [Y] percent [increase/decrease] in [OUTCOME], or roughly 
[COMPARISON TO MEAN/OTHER BENCHMARK].

% Brief mention of mechanisms/heterogeneity if relevant
Table~\ref{tab:hetero} explores heterogeneity by [DIMENSION]. 
We find that the effect is [larger/concentrated among] 
[SUBGROUP], suggesting that [INTERPRETATION].

\begin{table}[htbp]
\centering
\caption{Main Results: Effect of X on Y}
\label{tab:main}
\begin{tabular}{lcccc}
\hline\hline
 & (1) & (2) & (3) & (4) \\
 & OLS & + Controls & + FE & Preferred \\
\hline
Treatment & 0.052*** & 0.048*** & 0.041** & 0.039** \\
          & (0.012)  & (0.011)  & (0.015) & (0.016) \\
\\
Controls       & No  & Yes & Yes & Yes \\
Fixed Effects  & No  & No  & Yes & Yes \\
Cluster SE     & No  & No  & No  & Yes \\
\\
Observations   & 10,000 & 9,850 & 9,850 & 9,850 \\
R-squared      & 0.05   & 0.12  & 0.35  & 0.35  \\
\hline\hline
\multicolumn{5}{l}{\footnotesize Notes: * p<0.10, ** p<0.05, *** p<0.01.} \\
\multicolumn{5}{l}{\footnotesize Standard errors in parentheses.} \\
\end{tabular}
\end{table}
```

## Example Output: Conclusion Template

```latex
\section{Conclusion}
\label{sec:conclusion}

% Restate question and answer
This paper examined [RESEARCH QUESTION]. Using [METHOD/DATA], 
we found that [MAIN FINDING]. This result is robust to 
[ROBUSTNESS CHECKS].

% Implications
Our findings have several implications. For policy, they suggest 
that [POLICY IMPLICATION]. For theory, they provide support for 
[THEORETICAL MECHANISM] and challenge [ALTERNATIVE VIEW].

% Limitations (brief, honest)
Several limitations warrant mention. First, [LIMITATION 1: 
e.g., external validity]. Second, [LIMITATION 2: e.g., 
data constraints]. Future research could address these by 
[SUGGESTION].

% Future directions
This paper opens several avenues for future work. 
[DIRECTION 1]. [DIRECTION 2]. We hope our findings 
stimulate further research on [BROADER TOPIC].
```

## Writing Tips

### For Introductions
- **First sentence should grab attention** - not "This paper examines..."
- **State your contribution clearly** - what's new about this paper?
- **Be specific about magnitudes** - don't just say "large effect"
- **Acknowledge limitations** preemptively in the last paragraph

### For Results
- **Lead with numbers** - put the coefficient in the first sentence
- **Interpret economically** - what does a 0.05 coefficient mean?
- **Guide the reader** through tables column by column
- **Don't oversell** - distinguish statistical from economic significance

### For Conclusions
- **Don't introduce new results** - synthesize what you've shown
- **Be honest about limitations** - reviewers will find them anyway
- **End on the contribution** - remind readers why this matters

## Common Pitfalls

- 鉂?Burying the main result in the middle of the paper
- 鉂?Using "significant" without specifying statistical or economic
- 鉂?Over-claiming causality without proper identification
- 鉂?Literature review that's just a list of papers
- 鉂?Conclusion that's just a summary

## LaTeX Paper Template: Preamble and Front Matter

When generating the full `.tex` file, use this structure. It incorporates the conventions that AER/QJE expect and avoids the layout issues that commonly arise when compiling locally.

### Preamble

```latex
\documentclass[12pt]{article}
\usepackage{amsmath,amssymb}
\usepackage[margin=1.25in]{geometry}
\usepackage{setspace}
\usepackage{booktabs,caption,threeparttable,pdflscape,makecell}
\usepackage{graphicx}
\usepackage{hyperref}
\usepackage{natbib}
\usepackage{appendix}
\usepackage{subcaption}
% \usepackage{microtype}   % enable if distribution supports it

\setstretch{1.5}           % body text at 1.5x spacing (standard for submissions)
\captionsetup{labelfont=bf, labelsep=period, font=small}
\hypersetup{colorlinks=true, linkcolor=black, citecolor=black, urlcolor=blue}
\graphicspath{{../figures/}}   % figures/ relative to the paper's directory
```

### Title + Abstract (First Page)

The global `\setstretch{1.5}` would push the abstract onto page 2 if applied to the title block. Wrap the front matter in `\begin{spacing}{1.0}` to keep it compact. Economics journals do not use a table of contents 鈥?omit it entirely.

```latex
\begin{document}

\thispagestyle{empty}
\begin{spacing}{1.0}          % override 1.5x just for this page
\begin{center}
  {\large\bfseries Your Paper Title Here:\\[0.2em]
  Subtitle If Any}\par
  \vspace{0.7em}
  {\normalsize\bfseries Author Name}\par
  \vspace{0.2em}
  {\small \textit{Affiliation} \quad \href{mailto:email@uni.edu}{email@uni.edu}}\par
  \vspace{0.2em}
  {\small Month Year}\par
\end{center}
\vspace{0.5em}
\begin{abstract}
\noindent [Abstract text, 150-250 words]
\end{abstract}
\vspace{0.4em}
\noindent\textbf{JEL Codes:} J23, J31, O33 \quad
\textbf{Keywords:} keyword1, keyword2, keyword3

\vspace{0.3em}
\noindent\footnotesize\textit{I thank [seminar participants] for helpful comments.
All errors are my own.}
\normalsize
\end{spacing}
\clearpage

% NO \tableofcontents 鈥?economics journals don't use one

\section{Introduction}
...
```

### Key Front-Matter Conventions

- **No `\titlepage` environment** 鈥?it forces abstract to a separate page
- **No `\tableofcontents`** 鈥?not standard in economics journal submissions
- **`\begin{spacing}{1.0}` wrapping the title block** 鈥?the global 1.5x stretch would otherwise inflate the title's line spacing
- **`\thispagestyle{empty}`** 鈥?suppresses page number on cover page
- **Title font: `\large\bfseries`** not `\LARGE`** 鈥?`\LARGE` combined with 1.5x stretch consumes too much vertical space

### Compile Workflow and Log Checking

After generating the `.tex` file, always compile twice (for cross-references) and inspect the log:

```bash
cd paper/
pdflatex -interaction=nonstopmode paper.tex
pdflatex -interaction=nonstopmode paper.tex  # second pass for \ref, \cite

# Check for common problems:

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this after design, data, estimates, and mechanisms are sufficiently stable to turn into a paper draft.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
grep -i "overfull\\|undefined\\|missing\\|error" paper.log

# Specifically: overfull tables

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this after design, data, estimates, and mechanisms are sufficiently stable to turn into a paper draft.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
grep "Overfull .hbox" paper.log
# > 10pt: table or figure is visibly cut off at page margin 鈥?fix that table

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this after design, data, estimates, and mechanisms are sufficiently stable to turn into a paper draft.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
# 1-5pt:  minor, usually invisible 鈥?acceptable

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this after design, data, estimates, and mechanisms are sufficiently stable to turn into a paper draft.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.

# Missing packages

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this after design, data, estimates, and mechanisms are sufficiently stable to turn into a paper draft.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
grep "File.*not found" paper.log
# If siunitx.sty: switch to c or dcolumn columns (see table skill)

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this after design, data, estimates, and mechanisms are sufficiently stable to turn into a paper draft.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.

# Unicode characters in .tex files

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this after design, data, estimates, and mechanisms are sufficiently stable to turn into a paper draft.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
grep "Unicode character" paper.log
# Find the file and replace with LaTeX macro equivalents

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this after design, data, estimates, and mechanisms are sufficiently stable to turn into a paper draft.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.
```

**Auto-fix checklist for the three most common compile errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| `File 'siunitx.sty' not found` | table used `S` columns | Switch to `c` or `D{.}{.}{-1}` |
| `Unicode character U+XXXX` | Python wrote `鈮, `鈫抈 directly into .tex | Replace with `$\geq$`, `$\rightarrow$` |
| `Overfull \hbox (Xpt too wide)` > 10pt | Table overflows margin | Add `\begin{landscape}`, `\footnotesize`, `p{Xcm}` column |
| `\Misplaced \omit` / `\Misplaced \span` | `\multicolumn` used outside tabular | Body file is missing `\begin{table}...\begin{tabular}` wrapper |

## Working With Other Coase Skills

- This normally depends on `literature-review`, `table`, `figure`, and the relevant empirical skills.
- If the evidence is too thin, hand the task back to the analysis skill rather than polishing weak text.
- Do not rely on old `/method` or `/interpret` commands; treat writing as a continuous part of the Coase workflow.

