---
name: literature-review
description: Search, summarize, and synthesize economics literature; position your contribution
---

# Literature-Review

## Purpose

This skill helps economists conduct rigorous literature reviews: structuring database searches, summarizing individual papers, synthesizing evidence across the literature, identifying research gaps, and positioning the user's contribution clearly for submission.

## When to Use

- Starting a literature review for a new project
- Drafting the Related Literature section of a paper
- Finding prior work to cite in an introduction
- Identifying the right identification strategy used by others
- Responding to a referee request to engage more with the literature

---

## Step 1: Define the Research Domain

Ask the user before proceeding:

1. What is your specific research question? (One sentence)
2. What is the scope? (Single field / cross-disciplinary)
3. What is the time frame? (All years / post-2000 / recent decade)
4. Do you have access to specific databases? (JSTOR, EconLit, NBER, SSRN, Google Scholar)
5. Are there 2–3 seminal papers to anchor the search?
6. What identification strategy are you using? (DID, IV, RDD, RCT, structural)

The research question determines the **search axis**: topic-focused vs. method-focused vs. data-focused.

---

## Step 2: Design the Search Strategy

### 2.1 Keyword Construction

Structure keywords in three layers:

| Layer | Example | Purpose |
|-------|---------|---------|
| **Core concept** | "minimum wage" OR "wage floor" | Central topic |
| **Outcome** | employment OR jobs OR hours | What is being studied |
| **Method** | "difference-in-differences" OR DiD | Identification filter |

Combine with Boolean operators:
```
("minimum wage" OR "wage floor") AND (employment OR "labor demand")
AND ("difference-in-differences" OR "quasi-experiment" OR "natural experiment")
```

### 2.2 Database-Specific Search Tips

**Google Scholar**
- `"exact phrase"` — require exact match
- `author:surname` — papers by specific author
- `source:journal` — papers in a specific journal
- `-exclude` — exclude a term
- `2015..2024` — date range filter
- Use "Cited by" to find forward citations from seminal papers

**EconLit / JSTOR**
- Filter by JEL classification codes (e.g., J31 = Wage Level and Structure)
- Use field-specific search (`TI:` for title, `AB:` for abstract)
- Download citations in BibTeX format for Zotero

**NBER Working Papers (nber.org)**
- Search by JEL code or keyword
- Preprints: useful for the latest empirical research before journal publication
- Use "Related Papers" sidebar

**SSRN**
- Filter by Research Network (Economics Research Network)
- Sort by downloads or date

**Semantic Scholar / Connected Papers**
- Generate citation network visualization
- Find clusters of related work automatically

### 2.3 Forward and Backward Citations

For any seminal paper:
- **Backward**: Read its references — what is it building on?
- **Forward**: Use "Cited by N" in Google Scholar — what recent papers cite it?
- **Lateral**: Use Semantic Scholar or Connected Papers to find papers that cite similar papers

Aim to identify at least 3 clusters of related work, then review the 5–10 most-cited papers per cluster.

---

## Step 3: Triage and Organize Papers

### 3.1 Quick-Read Protocol

When first reading a paper:
1. Read abstract — does it match your question?
2. Scan Introduction conclusion paragraphs
3. Scan the Table 1 (data) and main regression table
4. Note identification strategy and main coefficient

Assign each paper to one category:
- **Core** (directly relevant, must cite and engage)
- **Background** (motivates the topic, cite briefly)
- **Methodological** (uses a technique you adopt)
- **Contradictory** (finds different results — must address)

### 3.2 Paper Summary Template

For each **Core** paper, fill in:

```markdown
## [Author(s)] ([Year])

**Title:** [Full title]
**Published in:** [Journal / Working Paper Series, Volume/Number]
**JEL Codes:** [e.g., J31, C21]

**Research Question:** [One sentence]

**Data:**
- Source: [Dataset name, e.g., CPS, NLSY, administrative records]
- Period: [Years]
- Sample: [N observations, unit of analysis]
- Geography: [Country / region]

**Identification Strategy:** [Method + instrument/threshold/variation used]

**Main Findings:**
1. [Key result with magnitude AND units, e.g., "A 10% MW increase reduces teen employment by 1–2%"]
2. [Second key result]
3. [Robustness or heterogeneity result]

**Validity Tests Conducted:**
- [Pre-trends test / falsification / balance check]

**Limitations:**
- [Main external validity concern]
- [Main internal validity concern]

**Relevance to your project:** [One sentence: how does this shape your research design?]

**Key quote:** "[Most important direct quote]" (p. XX)
```

---

## Step 4: Synthesize the Evidence

### 4.1 Dimensions of Synthesis

Organize findings along multiple dimensions:

| Dimension | What to compare |
|-----------|----------------|
| **Effect size** | What magnitude is typical? What drives variation in estimates? |
| **Direction** | Do all papers find the same sign? |
| **Identification** | OLS correlational vs. IV/RDD/RCT causal |
| **Context** | US vs. Europe vs. developing countries; different time periods |
| **Subgroups** | Are effects larger for low-skilled workers, small firms, etc.? |

### 4.2 Evidence Synthesis Table

```markdown
## Synthesis: What We Know

| Finding | N studies | Evidence Quality | Consensus |
|---------|-----------|-----------------|-----------|
| [Finding 1] | X | High / Medium / Low | Strong / Mixed / Contested |
| [Finding 2] | X | ... | ... |
```

**Evidence quality tiers:**
- **High**: Multiple RCTs or credible quasi-experiments across different contexts
- **Medium**: Quasi-experimental evidence from 1–2 contexts, or surveys with selection concerns
- **Low**: Descriptive or OLS-only evidence

### 4.3 Writing a Narrative Synthesis

**Do not just list papers.** Economics papers use narrative paragraphs. Follow this structure:

**Paragraph 1 — Establish the big picture:**
> "A large literature examines the effect of X on Y. Early work using OLS found [result], but identification concerns motivated subsequent quasi-experimental research (Author A, Year; Author B, Year). Taken together, this literature establishes that [broad conclusion]."

**Paragraph 2 — Highlight consensus:**
> "There is now broad agreement that [specific finding]. [Author A (Year)] shows [result] using [method] in [context]. [Author B (Year)] confirms this using [different method/data], finding [comparable result]."

**Paragraph 3 — Highlight disagreements (must engage, not ignore):**
> "[Author C (Year)], however, finds [contradictory result]. This discrepancy may reflect [methodological difference / data difference / context difference]. We return to this issue in Section X."

**Paragraph 4 — Identify gaps that motivate your paper:**
> "Despite this progress, two questions remain unanswered. First, [Gap 1]. Second, [Gap 2]. Our paper contributes by [your approach]."

### 4.4 Research Gaps Taxonomy

Identify gaps along these axes:

| Gap type | Example |
|----------|---------|
| **Geographic** | Existing evidence is US-only; no developing country evidence |
| **Temporal** | Studies focus on short-run effects; long-run unknown |
| **Subgroup** | Effects on high-skill workers unstudied |
| **Mechanism** | What drives the effect? (price, profit, productivity?) |
| **Methodological** | All existing papers use OLS; no credible IV evidence |
| **Data** | All use survey data; no administrative records |
| **Policy counterfactual** | Effects at lower/higher magnitudes unknown |

---

## Step 5: Position Your Contribution

This is the most important step for journal submission. Be specific.

### 5.1 Positioning Statement Structure

> "This paper makes [N] contributions to the literature on [topic]. First, we [contribution 1] — while [Author A (Year)] studies [X], our paper is the first to [Y]. Second, we use [data/method] which allows us to [identify/measure] [Z], addressing [limitation in prior work]. Third, our findings [extend/challenge/reconcile] the evidence from [Author B (Year)] by showing [how/why]."

### 5.2 Language Calibration

Match causal language to your identification strategy:

| Your method | Appropriate language |
|-------------|---------------------|
| OLS / correlational | "associated with", "correlates with", "predicts" |
| IV / RDD / DID | "causes", "effect of", "impact of" |
| RCT | "causal effect of", "experimentally estimated" |

**Avoid** claiming causality with OLS; **avoid** hedging excessively when you have a clean identification strategy.

### 5.3 Acknowledging Contradictory Work

Never ignore contradictory papers. Use these framings:

- **Methodological difference**: "While [Author A] finds [X], they use OLS which may reflect [confounder]. Our IV design addresses this concern."
- **Context difference**: "[Author B] studies a different setting ([country/period]); our context differs in [key way] which may explain the different estimates."
- **Magnitude difference**: "Our estimate is larger than [Author C], possibly reflecting [heterogeneity explanation]."

---

## Example Output: Full Literature Review

```markdown
# Literature Review: Effect of [X] on [Y]

## Search Strategy

**Databases:** EconLit, NBER, Google Scholar, SSRN
**Date range:** 2000–2024
**Search terms:**
- ("minimum wage" OR "wage floor") AND (employment OR jobs)
- ("minimum wage") AND ("difference-in-differences" OR "DiD")
- ("minimum wage") AND ("IV" OR "instrumental variable")

**Inclusion criteria:**
- Peer-reviewed or NBER working papers
- Focused on [specific outcome]
- Uses causal identification strategy

**Papers reviewed:** 47 total; 12 Core, 20 Background, 15 excluded

---

## Seminal Papers

### Card and Krueger (1994)
**Citation:** Card, D., & Krueger, A. B. (1994). Minimum Wages and Employment: A Case Study of
the Fast-Food Industry in New Jersey and Pennsylvania. *American Economic Review*, 84(4), 772–793.

**Research Question:** What is the effect of minimum wage increases on employment?

**Data & Method:**
- DiD: NJ (treatment) vs. PA (control) before and after NJ minimum wage increase
- Survey of fast-food restaurants (N ≈ 400 establishments)

**Key Findings:**
- No negative employment effect; slight increase in NJ relative to PA
- Contradicted the consensus view from competitive labor market theory

**Validity Tests:** Pre-trend analysis on wage levels; robustness to survey response bias

**Limitations:** Single state; short time window (one year); fast-food only

---

## Synthesis: What We Know

| Finding | Evidence Quality | Consensus |
|---------|-----------------|-----------|
| Small MW increases have minimal employment effects | High | Strong |
| Large increases (>$15) have larger employment losses | Medium | Growing |
| Effects heterogeneous by local labor market tightness | Medium | Growing |
| Mechanisms: price pass-through 60–100% | Medium | Mixed |

## Research Gaps

1. **Mechanism:** How do firms absorb higher labor costs? (prices, profits, productivity, hours?)
2. **Long-run:** Most studies focus on 1–2 years post-increase
3. **High-cost-of-living areas:** Do urban markets respond differently?
4. **Spillovers:** Effects on workers above the minimum wage

## Connection to Your Project

Your study contributes by:
- [Gap 1 your paper fills]
- [Novel data or method you use]
- [Specific prior paper your paper extends or challenges]
```

---

## Reference Management

### Recommended Tools

| Tool | Best for | Format |
|------|---------|--------|
| **Zotero** (free) | Academic research, browser import, group libraries | BibTeX / RIS |
| **Mendeley** | PDF management, annotation | BibTeX |
| **EndNote** | Institutional use, large libraries | various |

### BibTeX Best Practices

1. Use consistent cite keys: `AuthorYear` (e.g., `CardKrueger1994`)
2. Include DOI in every entry
3. Distinguish journal articles (`@article`) from working papers (`@unpublished`)
4. Keep a single `.bib` file per project; do not duplicate entries

Example BibTeX entry:
```bibtex
@article{CardKrueger1994,
  author  = {Card, David and Krueger, Alan B.},
  title   = {Minimum Wages and Employment: A Case Study of the Fast-Food
             Industry in New Jersey and Pennsylvania},
  journal = {American Economic Review},
  year    = {1994},
  volume  = {84},
  number  = {4},
  pages   = {772--793},
  doi     = {10.2307/2118030}
}
```

---

## Best Practices

1. **Use reference managers** (Zotero, Mendeley) — never cite from memory
2. **Read every paper you cite** — do not cite based on abstracts alone
3. **Track search queries** for reproducibility (record date and operator)
4. **Update before submission** — search again for papers published in the last 6 months
5. **Balance breadth and depth** — cover the field but engage deeply with the 5–10 most relevant papers
6. **Engage contradictory findings** — referees will know if you ignore them
7. **Distinguish correlation from causation** when summarizing others' work

---

## Common Pitfalls

- ❌ Only citing papers that support your argument
- ❌ Ignoring contradictory findings
- ❌ Confusing correlation with causation when describing OLS results
- ❌ Citing papers you have not read (mischaracterizing findings)
- ❌ Missing important recent papers (always do a final pre-submission search)
- ❌ Vague gap identification ("more research is needed") — be specific
- ❌ Overclaiming novelty when closely related work exists

---

## Related Skills & Commands

- **paper-writing**: Draft the full introduction and related literature section
- **/method**: Generate the methodology section informed by the literature
- **/analyze**: Start your empirical analysis based on identified gaps
- **beamer-ppt**: Create slides summarizing the literature for seminar presentations
- **/write**: Draft the complete related literature section of your paper
