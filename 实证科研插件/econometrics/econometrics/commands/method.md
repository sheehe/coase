---
name: method
description: Generate a methods section for an academic paper based on the econometric approach used
tools:
  - Write
---

# /method — Generate Academic Methods Section

When the user invokes /methods, generate a polished, publication-quality methods section for an economics or social science paper.

## Step 1: Gather Information

Ask the user for the following if not already provided:
- Econometric method(s) used (OLS, IV, DID, RDD, panel FE, time series, etc.)
- Research question and main hypothesis
- Dataset description: source, sample period, N observations, unit of observation
- Key variables: dependent variable, treatment/key regressor, controls
- Standard errors used (robust, clustered, Newey-West, etc.)
- Any validity tests performed and their results
- Target journal or field (if known, to match tone)

## Step 2: Write the Methods Section

Structure the methods section with these subsections:

### 2.1 Data
- Data source(s) and access method
- Sample period and geographic scope
- Unit of observation and sample size
- Key variable definitions and construction
- Any sample restrictions or exclusions

### 2.2 Empirical Strategy
- State the identification strategy and the causal question
- Write out the main estimating equation with formal notation
- Explain what each term represents
- Describe the source of identification (e.g., instrument, policy cutoff, treatment variation)

### 2.3 Validity and Assumptions
- Discuss key identifying assumptions (parallel trends, exclusion restriction, continuity, etc.)
- Describe tests used to validate these assumptions
- Report validity test results (briefly; details in appendix)

### 2.4 Standard Errors
- State the standard error type used
- Justify the choice (e.g., "We cluster standard errors at the [level] to account for serial correlation within [unit]")

## Writing Style Guidelines

- Write in past tense, third person or first person plural (match journal convention)
- Use formal econometric notation: subscripts i (unit), t (time), β for coefficients, ε for error
- Spell out all acronyms on first use (e.g., "two-stage least squares (2SLS)")
- Cite relevant methodological papers (e.g., Callaway and Sant'Anna (2021) for staggered DID)
- Keep the section concise: 400–800 words for a standard methods section
- Include the estimating equation as a numbered equation block

## Example Equation Formats

**OLS:**
> Y_it = α + βX_it + γW_it + μ_i + λ_t + ε_it  ... (1)

**DID:**
> Y_it = α + βTreat_i + δPost_t + τ(Treat_i × Post_t) + γX_it + ε_it  ... (1)
> where τ is the DID estimator of the average treatment effect on the treated (ATT).

**RDD:**
> Y_i = α + τD_i + f(X_i) + ε_i  ... (1)
> where D_i = 1[X_i ≥ c] and f(·) is a local linear function estimated separately on each side of the cutoff c.

**IV (2SLS):**
> First stage:  X_i = π₀ + π₁Z_i + π₂W_i + v_i  ... (1)
> Second stage: Y_i = β₀ + β₁X̂_i + β₂W_i + ε_i  ... (2)

## Step 3: Save the Output

Save the generated methods section to a file named `methods_section.md` in the working directory, formatted in clean Markdown. Offer to also generate a LaTeX version (`.tex`) if the user is writing in LaTeX.

## See Also

- `/analyze` — run the empirical analysis before writing the methods section
- `/diagnose` — the validity test results (Section 2.3) come from `/diagnose` output
- `/write` — draft the full paper using the methods section generated here
- Skill: `did-analysis` — for staggered DID method details and Callaway-Sant'Anna citation guidance
- Skill: `iv-estimation` — for 2SLS equation notation and exclusion restriction discussion
- Skill: `rdd-analysis` — for RDD continuity assumption framing and bandwidth justification
