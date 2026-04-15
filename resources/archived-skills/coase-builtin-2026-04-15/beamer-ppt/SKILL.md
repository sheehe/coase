---
name: beamer-ppt
description: Turn completed research outputs into Beamer seminar, defense, and presentation decks
---


# Beamer-ppt-Creator

## Coase Adaptation

This skill is used directly inside Coase. Do not depend on old slash commands, deleted references folders, or extra wrapper skills.
- Coase uses a soft-orchestration workflow with one main agent plus optional sub-agents; the main agent should call this skill naturally when needed.
- Prefer Claude Code / Agent SDK built-in tools that are already available in Coase, such as Read, Write, Edit, Glob, Grep, Bash, WebFetch, and WebSearch.
- When code execution is needed, choose the path that is actually runnable in the current environment. Do not force Python or Stata output if runtime support is unclear.
- In Coase, prioritize reproducible outputs: scripts, logs, results, tables, figures, paper text, or presentation materials, not just abstract advice.
- Typical role in the Coase workflow: Use this after the paper draft, tables, figures, and headline findings are already stable enough to present.
- If cross-skill collaboration is needed, let the main agent call the neighboring skills directly instead of referencing old `/...` commands.

## Purpose

This skill helps economists create professional academic presentations using LaTeX Beamer. It provides templates for conference talks, job market presentations, and seminar presentations with proper structure and clean aesthetics.

## When to Use

- Preparing conference presentations
- Creating job market talk slides
- Making seminar/workshop presentations
- Converting a paper into presentation slides

## Instructions

### Step 1: Understand the Context

Ask the user:
1. What type of presentation? (20-min conference, 90-min seminar, job market)
2. What's the paper/project about?
3. What's the target audience expertise level?
4. Do they have specific style preferences?

### Step 2: Structure by Time

| Duration | Structure |
|----------|-----------|
| 15-20 min | Motivation (2) 鈫?Question (1) 鈫?Method (2) 鈫?Results (3-4) 鈫?Conclusion (1) |
| 45-60 min | Add literature review, more results detail, robustness |
| 90 min | Full seminar with theoretical framework, extensive empirics |

### Step 3: Follow Presentation Best Practices

- **One idea per slide**
- **Minimal text** - use bullets of 3-6 words
- **Big fonts** - minimum 20pt for content
- **Consistent colors** - use a limited palette
- **Reveal incrementally** using `\pause` or `<+->` for complex slides

## Example Output

```latex
\documentclass[aspectratio=169, 11pt]{beamer}

% ============================================
% THEME AND APPEARANCE
% ============================================

% Clean minimal theme
\usetheme{metropolis}
\usecolortheme{default}

% Or for a more traditional look:
% \usetheme{Madrid}
% \usecolortheme{whale}

% Custom colors
\definecolor{darkblue}{RGB}{0, 51, 102}
\definecolor{lightgray}{RGB}{245, 245, 245}

\setbeamercolor{frametitle}{bg=darkblue, fg=white}
\setbeamercolor{title}{fg=darkblue}
\setbeamercolor{structure}{fg=darkblue}

% Remove navigation symbols
\setbeamertemplate{navigation symbols}{}

% Frame numbers
\setbeamertemplate{footline}[frame number]

% ============================================
% PACKAGES
% ============================================

\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{tikz}
\usepackage{pgfplots}
\pgfplotsset{compat=1.17}

% ============================================
% TITLE PAGE
% ============================================

\title{The Effect of X on Y: \\Evidence from Z}
\subtitle{Short and Descriptive}
\author{Your Name}
\institute{Your University}
\date{Conference Name \\ Month Year}

\begin{document}

% Title slide
\begin{frame}[plain]
    \titlepage
\end{frame}

% ============================================
% MOTIVATION (2-3 slides)
% ============================================

\begin{frame}{Motivation: Why This Matters}
    \begin{itemize}
        \item<1-> \textbf{Big picture:} [One sentence on broad relevance]
        \item<2-> \textbf{Specific puzzle:} [What we don't know]
        \item<3-> \textbf{Stakes:} [Why should we care?]
    \end{itemize}
    
    \vspace{1em}
    
    \only<4>{
    \begin{block}{Key Statistic}
        \Large \textbf{X\%} of [outcome] can be explained by [factor]
    \end{block}
    }
\end{frame}

\begin{frame}{What We Know (and Don't Know)}
    \textbf{Previous literature:}
    \begin{itemize}
        \item Author et al. (2020): Finding 1
        \item Other Author (2019): Finding 2
    \end{itemize}
    
    \vspace{1em}
    
    \textbf{Gap we fill:}
    \begin{itemize}
        \item[\textcolor{red}{?}] [Open question our paper addresses]
    \end{itemize}
\end{frame}

% ============================================
% RESEARCH QUESTION (1 slide)
% ============================================

\begin{frame}{This Paper}
    \begin{center}
        \Large
        \textbf{Research Question:} \\[1em]
        Does [X] cause [Y]? \\[2em]
    \end{center}
    
    \textbf{Preview of findings:}
    \begin{itemize}
        \item Main result in plain language
        \item Key magnitude: [Quantitative summary]
    \end{itemize}
\end{frame}

% ============================================
% EMPIRICAL STRATEGY (2-3 slides)
% ============================================

\begin{frame}{Data}
    \textbf{Sources:}
    \begin{itemize}
        \item Dataset 1: [Description, years, N]
        \item Dataset 2: [Description, matching method]
    \end{itemize}
    
    \vspace{1em}
    
    \textbf{Sample:}
    \begin{itemize}
        \item Unit of observation: [What is an observation?]
        \item Final sample: [N] observations, [Time period]
    \end{itemize}
\end{frame}

\begin{frame}{Identification Strategy}
    \textbf{Challenge:} [Endogeneity concern in one sentence]
    
    \vspace{1em}
    
    \textbf{Solution:} We exploit [natural experiment / instrument / RDD]
    
    \vspace{1em}
    
    \textbf{Key assumption:} [Identification assumption in plain language]
    
    \begin{equation*}
        Y_{it} = \alpha + \beta \cdot \text{Treatment}_{it} + \gamma X_{it} + \mu_i + \delta_t + \varepsilon_{it}
    \end{equation*}
\end{frame}

% ============================================
% RESULTS (3-5 slides)
% ============================================

\begin{frame}{Main Result}
    \begin{center}
        \includegraphics[width=0.8\textwidth]{figures/main_result.pdf}
    \end{center}
    
    \vspace{0.5em}
    
    \textbf{Takeaway:} [One sentence interpretation]
\end{frame}

\begin{frame}{Main Result: Regression Table}
    \begin{table}
        \centering
        \small
        \begin{tabular}{lccc}
            \toprule
            & (1) & (2) & (3) \\
            & OLS & + Controls & + FE \\
            \midrule
            Treatment & 0.052*** & 0.048*** & 0.041** \\
                      & (0.012)  & (0.011)  & (0.015) \\
            \midrule
            Controls & No & Yes & Yes \\
            Fixed Effects & No & No & Yes \\
            N & 10,000 & 9,850 & 9,850 \\
            \bottomrule
        \end{tabular}
    \end{table}
    
    \textbf{Economic magnitude:} 1 SD increase in X $\rightarrow$ Y\% increase in outcome
\end{frame}

\begin{frame}{Robustness Checks}
    \begin{itemize}
        \item[\checkmark] Alternative specifications
        \item[\checkmark] Placebo tests
        \item[\checkmark] Different sample cuts
        \item[\checkmark] [Other relevant checks]
    \end{itemize}
    
    \vspace{1em}
    
    $\rightarrow$ Results robust across specifications
\end{frame}

% ============================================
% CONCLUSION (1 slide)
% ============================================

\begin{frame}{Takeaways}
    \begin{enumerate}
        \item \textbf{Finding 1:} [Main result]
        \item \textbf{Finding 2:} [Secondary result]
        \item \textbf{Implication:} [Policy/theory takeaway]
    \end{enumerate}
    
    \vspace{2em}
    
    \begin{center}
        \Large Thank you! \\[0.5em]
        \normalsize your.email@university.edu
    \end{center}
\end{frame}

% ============================================
% APPENDIX
% ============================================

\appendix

\begin{frame}[noframenumbering]{Appendix: Additional Results}
    [Backup slides for Q\&A]
\end{frame}

\end{document}
```

## Theme Recommendations

| Audience | Theme | Notes |
|----------|-------|-------|
| Academic | `metropolis` | Clean, modern, minimal |
| Conference | `Madrid` | Traditional, professional |
| Job market | `default` with custom colors | Safe, customizable |
| Policy | `CambridgeUS` | Authoritative look |

## Best Practices

1. **One message per slide** - if you need more, split it
2. **Use figures over tables** when possible
3. **Highlight key numbers** in results tables
4. **Build complex slides** incrementally with `\pause`
5. **Prepare backup slides** for anticipated questions
6. **Practice timing** - 1-2 minutes per slide max

## Common Pitfalls

- 鉂?Too much text on slides
- 鉂?Reading slides word-for-word
- 鉂?Tables with too many columns
- 鉂?Skipping the roadmap/preview
- 鉂?Ending with "Questions?" instead of takeaways

## Working With Other Coase Skills

- Inputs usually come from `paper-writing`, `table`, and `figure`.
- If the evidence is still unstable, return to the relevant analysis skill before polishing slides.
- Do not rely on old `/plot` or `/method` commands inside Coase; let the main agent call neighboring skills directly.

