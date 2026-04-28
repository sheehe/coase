---
name: planner_workflow
description: Planning workflow, maps to /idea-discovery. Used before running any main regression to complete Idea–Data Alignment and the Baseline Research Proposal & Design, so that the user locks in a baseline design that is runnable, interpretable, and auditable before entering code execution.
---

## Workflow Notes

- Before executing this skill, first read `references/role-rules.md`.
- If the role rules conflict with the per-phase detail in this body, the hard constraints in `references/role-rules.md` win.
- The current version executes directly off the user's needs, attachments, workspace files, and existing materials in the current Coase session.

---

## Research-purpose adaptation

Before any Phase begins, read **research_purpose** from context — it sets the methodological tone.
It binds Phase 3 scoring weights, the Phase 4 quality-gate thresholds, and the Phase 7 Baseline Memo requirements:

| Purpose | Methodology requirement | Forbidden |
|------|----------|-------|
| **causal** | Must pick one of DID / Event Study / IV / RDD / PSM as the identification strategy; identification assumptions must be explicit; reserve at least 2 defenses (e.g., placebo + pre-trend) | Disguising a plain regression with no identification strategy as a causal identification |
| **associative** | Pick the appropriate regression family by outcome type (OLS / Logit / Probit / Poisson, etc.) + fixed effects or clustered SE; must declare in Phase 7 "this is an associative study; the results do not support a causal interpretation"; hypothesis statements use "associated with / correlated with" rather than "influence / cause" | Using causal phrasing such as "the effect of X on Y" |

**When the data does not support a causal project's strategy**: must return to Phase 1 to **adjust the research question** (e.g., change outcome, narrow the sample, find an alternative treatment) — do not silently downgrade to associative. The user picked causal expecting a causal conclusion; a quiet downgrade is a breach of contract.

**Methodological-rigor scoring on associative projects**: do not score on "does it have a causal identification strategy". Instead score on "does it honestly state the research nature; are collinearity and reverse causality discussed as boundary; is there an association-style robustness plan (whether the association direction is stable across subsamples / FE specifications / control combinations)".

---

## File-output contract (every Phase must commit)

**Downstream Reviewer and Executor read your output by fixed file name**. Before each Phase ends, you **must** write the corresponding file, otherwise it counts as not done.

| Phase | File | Key fields |
|------|------|---------|
| 1 | `planner/stage_1_alignment.md` | Data snapshot, Alignment, Feasible starts, GO/NO-GO |
| 2 | `planner/stage_2_literature.md` | Key literature table, Gap, 2–3 research directions |
| 3 | `planner/stage_3_hypothesis.md` | Candidate hypotheses + eight-dimension scores + composite score + final pick |
| 4 | `planner/stage_4_quality_gate.md` | Signals, decision, iteration record (append on backtrack, do not overwrite) |
| 5 | `planner/stage_5_variable_mapping.md` | Outcome / X / Controls / FE / Cluster mapping |
| 6 | `planner/stage_6_data_support.md` | Data structure, sample size, missingness, support level |
| 7 | `planner/stage_7_baseline_design.md` | **The single Executor input — must be written**; Baseline equation + the 5 Core-design elements |
| 8 | `planner/stage_8_descriptive_snapshot.md` | Descriptive-stats table, Visuals, Confirmation |

**Hard rules**:
- The "Output" section of each Phase points to the file names above, character for character
- No renaming (`baseline.md`, `plan.md`, `final.md` are all rejected)
- Do not write outside `planner/`
- Long content (literature abstracts, regression results, tables) **goes to disk only; do not paste back into the conversation** — keep only the conclusion and file location
- If a Phase is skipped due to insufficient data or backtracking, **still write a placeholder file** stating "reason for skip + status: skipped"
---


### Reading reference papers (if any)


Steps:
1. Check the "Available reference papers (references/)" list in context to see what PDFs are available
2. Spawn a sub-agent to read each PDF
3. For each paper, extract: core finding, identification strategy (DID/IV/RD, etc.), data and key variables used
4. Use the extraction as the prior basis for Phase 2 literature search — prefer validating these strategies' applicability over re-searching from scratch

### Reading research-plan documents (if any)

Steps:
1. Check the "Available research-plan documents (plans/)" list in context to see what files are available
2. Read the contents of each file
3. Understand what the user already has: research question, core hypothesis, variable design, expected identification strategy
4. Use this as the starting point for Phase 1 data alignment (focus on confirming how well the plan matches the data, rather than generating directions from scratch)

---

### Phase 1: Idea–Data Alignment (PDF Phase 1)

**Goal**: help the user build an executable preliminary match between the research idea and existing data.

Principles:
- Lead from data feasibility, not from maximum theoretical novelty; balance both
- If the user only has a vague idea, propose 1–3 executable research-question candidates based on data conditions; do not over-expand
- Only propose questions supported by the current data
- If the proposal does not match the data, prefer the smallest-modification fix
- Data scale dictates read/scan strategy — see "Step 0" below; do not Read full files regardless of scale

Recommended approach (data-exploration protocol, in order):

**Step 0 (mandatory, before Step 1)**: data-scale assessment and read strategy

Use lightweight means (file size, `head`, `scan_column(mode="sample")`) to estimate the row count of each data file and pick a strategy by scale:

| Rows | Read strategy |
|------|---------|
| < 100K | Full column-wise scan permitted |
| 100K – 1M | Full scan for structural columns (id/time); for others, sample the first 5K rows for a distribution estimate |
| 1M – 10M | Full unique-value count only for id/time; everything else is sampled; recommend the user convert raw to parquet or query via DuckDB |
| > 10M | First confirm with the user whether to slice by time / industry / region; do not force a full scan |

**Forbidden**:
- Reading the entire raw CSV/DTA into context
- Pasting the full `summary()` of a large dataset, or a > 100 × 100 correlation matrix, into the conversation
- Outputting descriptive stats for all columns at once on a > 100-column dataset — group by topic/role first

**Step 1 (mandatory)**: for each data file
- Get the full column list and variable labels (Stata DTA `variable label` carries business meaning, e.g., b001 → operating revenue)
- Only after understanding the dataset's full variable list may you proceed

**Step 2 (mandatory)**: identify structural dimensions and full-scan them
- Identify candidate entity-ID columns (column name contains id/code/stkcd/firmid/company, or is a string / high-cardinality integer)
  → get the **exact** entity count (cannot estimate; this determines sample scale)
- Identify candidate time columns (column name contains year/date/time/period, or values are integers in 1990–2040)
  → get the full time span and granularity (determines panel length)

**Step 3 (as needed)**: for core research variables
- Understand variable distribution and missingness; judge whether identification assumptions can hold
- If a data dictionary already exists, top up semantic information first

**Until Steps 1 and 2 are complete, you may not enter the research-design stage.**

**Output format**:
A. Data snapshot (id count, observation count, time dimension, sample range, main variables, obvious limitations)
B. Alignment Assessment (matches well/partially/poorly, reasons)
C. Feasible starting points (max 3, each with: research question, data-support reason, candidate outcome / explanatory variable, possible baseline design, main risk)
D. Recommendation (best starting point, reason, what to confirm next)
E. GO/NO-GO DECISION

**Commit (mandatory)**: call the file-write tool to write A–E in full.

---

### Phase 2: Direction exploration (literature search and citation-network expansion)

**Goal**: based on the Idea–Data Alignment result, decide on viable research directions.

Recommended approach:
- Distill 2–3 keyword combinations per research direction
- Search relevant literature (5–10 papers per keyword group)
- Expand the citation network for the most relevant 2–3 papers (depth 1)
- Synthesize: main findings of existing research, research gap, available identification strategies, fit with the data

**Output**: list of key papers (author, year, title, core finding, identification strategy), gap analysis, recommended 2–3 directions (ranked by feasibility), the identification strategy that best fits each direction.

**Commit (mandatory)**: write the literature table + gap + directions in full. Full literature abstracts go **to disk only; do not paste back into the conversation**.

---

### Phase 3: Hypothesis generation and refinement (Self-Debate)

**Goal**: generate 2–3 research hypotheses; pick the best via a self-debate mechanism.

Recommended approach:
- Propose 2–3 candidate hypotheses, each containing: causal-relation statement (X→Y, mechanism), identification strategy, expected sign and magnitude
- For each hypothesis: first put forward the supporting argument, then make a rebuttal yourself, then deliver a synthesized judgment

**Six-dimension evaluation** (each item 1–10, aligned with Reviewer Mode A):

| Dimension | Evaluation focus |
|------|---------|
| 1. Theoretical contribution | Where is the marginal contribution relative to the most relevant existing work? Does it fill a real gap? |
| 2. Methodological rigor | **causal**: is the identification strategy credible? Is the core identification assumption testable? Are the defenses (placebo / pre-trend / falsification) sufficient? <br>**associative**: is the associative nature honestly stated? Are collinearity and reverse causality discussed as boundary? Is the association-style robustness plan reasonable? |
| 3. Data backing | Do the key variables exist, with sufficient variation, sample size, and panel structure? |
| 4. Identification / association persuasiveness | **causal**: is the source of exogeneity clear (e.g., exogeneity of a policy shock, exclusion of an IV)? <br>**associative**: is the association interpretable? Are the collinearity structure and main alternative explanations stated? |
| 5. Publication potential | Which tier of journal is targeted? Assess given current heat and competition |
| 6. Feasibility | Given current data and tools, can it be completed in reasonable time? |

**Weighted scoring formula** (specialized by research_purpose):

| Dimension | causal weight | associative weight |
|------|:---------:|:---------------:|
| Methodological rigor | 30% | 20% |
| Theoretical contribution | 20% | 25% |
| Data backing | 20% | 25% |
| Identification / association persuasiveness | 15% | 15% |
| Publication potential | 10% | 10% |
| Feasibility | 5% | 5% |

`composite = methodological_rigor×w1 + theoretical_contribution×w2 + data_backing×w3 + identification_or_association_persuasiveness×w4 + publication_potential×w5 + feasibility×w6`

- Pick the best hypothesis; give the rationale

**Output**: candidate-hypothesis list (with eight-dimension scores and weighted composite), self-debate record, the final pick + rationale, the research-design framework for that hypothesis.

**Commit (mandatory)**: note the file is `planner/stage_3_hypothesis.md` — do not drop the `planner/` prefix.

---

### Phase 4: Idea Quality Gate (iteration-decision checkpoint)

**Goal**: deliver a quality verdict on the best hypothesis picked at Phase 3 — proceed directly, or backtrack to improve. This is the last line of defense against low-quality ideas entering execution.

**Constraint**: at most **2 backtracks** (iteration_count ≤ 2). If after 2 backtracks the quality is still substandard, you must enter Phase 4 with a diagnostic report; the downstream Reviewer and HITL stages make the final decision.

#### Step 1: compute quality signals

For the best hypothesis chosen at Phase 3, compute quality signals separately by **research_purpose**:

**Causal projects**:

| Signal | Trigger | Meaning |
|------|---------|------|
| **RED: hard flaw** | Methodological rigor < 5 OR identification/association persuasiveness < 5 | Identification strategy not credible, or no feasible causal strategy; risk of pushing forward is very high |
| **YELLOW: weak spot** | Composite weighted score < 6.0 | Overall quality insufficient, but no single fatal flaw |
| **ORANGE: data-unsupported** | Data backing < 5 | Data does not support the current causal strategy; should adjust outcome / treatment or research question |
| **GREEN: pass** | None of the above | Quality acceptable; proceed directly to Phase 5 |

**Associative projects** (thresholds 0.5 lower across the board, since associative work does not chase top-tier identification rigor):

| Signal | Trigger | Meaning |
|------|---------|------|
| **RED: hard flaw** | Theoretical contribution < 4 OR data backing < 5 | The core selling points of associative work are "story + data"; neither may collapse |
| **YELLOW: weak spot** | Composite weighted score < 5.5 | Overall quality insufficient |
| **ORANGE: blurred framing** | Methodological rigor < 4 (for associative this means "not declared as associative" or "collinearity / reverse causality not discussed") | The nature is not clearly stated; risk of being misread by reviewers as "disguised causal" |
| **GREEN: pass** | None of the above | Quality acceptable; proceed directly to Phase 5 |

**Important**: for an associative project, "methodological rigor < 5" **no longer auto-triggers RED** — associative work does not do causal identification, and "no DID/IV" should not be a fatal deduction. Only when even "honest declaration + collinearity / reverse-causality discussion" is missing does it count as a methodological hard flaw.

#### Step 2: routing decision

```
GREEN → proceed to Phase 5

RED/YELLOW/ORANGE AND iteration_count < 2 → enter Step 3 (diagnostic backtrack)

RED/YELLOW/ORANGE AND iteration_count = 2 → produce an "iteration-exhausted report",
  recording: directions tried, per-round improvement and score change, the remaining best
  hypothesis and its known risks. Append the report to the end of stage_4_quality_gate.md;
  proceed to Phase 5 carrying the risk flags.
```

#### Step 3: Diagnostic Backtrack

Pick the backtrack target by the **weakest dimension** (the table below applies to both causal and associative; the specific "action" must be tuned by research_purpose):

| Weakest dimension | Diagnosis | Backtrack target | Specific action |
|---------|------|---------|---------|
| Data backing < 5 | Insufficient variables or data structure mismatched | **Back to Phase 1** | Re-examine the data; try different outcome / treatment combinations, or relax sample-restriction conditions. **For a causal project, if all causal strategies are infeasible, the research question must be adjusted — do not downgrade to associative** |
| Theoretical contribution < 5 | Insufficient differentiation from existing literature | **Back to Phase 2** | Expand literature search (add cross-domain keywords, expand the citation network to depth 2); look for a new gap |
| Methodological rigor < 5 (causal) | Identification strategy not credible | **Back to Phase 2** | Search alternative identification strategies for similar problems (DID infeasible → try IV or RDD); focus on methodology papers |
| Methodological rigor < 4 (associative) | Failed to honestly declare associative nature, or failed to discuss collinearity / reverse causality | **In-Phase 3 fix** | Replace "influence" with "associated with" in the hypothesis statement; add collinearity discussion (VIF), reverse-causality discussion, and the association-style robustness plan |
| Identification / association persuasiveness < 5 | **causal**: source of exogeneity unclear; **associative**: association direction not interpretable | **In-Phase 3 fix** | causal: top up identification-assumption discussion (e.g., IV exclusion, DID parallel trends); associative: top up collinearity and main alternative-explanation discussion |

**Backtrack execution rules**:
- Each backtrack must append one `## Iteration {n}` record in `stage_4_quality_gate.md`, including: trigger signal, diagnostic conclusion, backtrack target, what changed this round
- After backtracking, re-execute the target Phase, **handling only the issues flagged by the diagnosis** — do not redo passed parts
- After the backtrack, return to Phase 3 to generate / revise hypotheses, rescore, and pass the Quality Gate again

#### Step 4: record the iteration trail

Whether or not a backtrack triggers, write (full path including the `planner/` prefix). **On backtrack, append the Iteration record; do not overwrite history** (read existing content first, concatenate, then write):

```markdown
## Quality Gate Result
- Composite weighted score: {score}/10
- Triggered signal: {GREEN/RED/YELLOW/ORANGE}
- Iteration count: {iteration_count}/2
- Decision: {PASS → Phase 5 / BACKTRACK → Phase {n} / EXHAUST → Phase 5 with risk flags}
```

If a backtrack was triggered, additionally record:
```markdown
### Iteration {n} record
- Trigger reason: {weakest dimension and its score}
- Backtrack target: Phase {n}
- This round's change: {what specifically was changed}
- Post-improvement scores: {new eight-dimension scores and composite}
- Score change: {composite from X.X → Y.Y, change ±Z.Z}
```

---

### Phase 5: Variable Mapping Confirmation (PDF Phase 2 Step 1)

**Goal**: confirm whether the variable mapping between the research design and the data holds.

Recommended approach:
- Identify and confirm: dependent variable, key explanatory variable, main controls, fixed-effect variables, cluster variable, variables that need further construction
- For each variable category, judge: existence (verify with `check_variable_exists`), definition clarity, transformation/construction needed, measurement or missingness issues
- If the variable mapping is unclear, flag it explicitly; prefer the smallest-correction proposal; do not push forward

**Output format**:
A. Variable Mapping Confirmation (Outcome, Key explanatory variable, Main controls, Fixed-effect candidates, Cluster candidates, Variables needing construction, Mapping issues to resolve)

**Commit (mandatory)**

---

### Phase 6: Data Support Check (PDF Phase 2 Step 2)

**Goal**: confirm that the full data supports the current baseline design.

Recommended approach: based on `get_dataset_columns` + `scan_column(mode="full")`, verify the data structure; use `scan_column(mode="sample")` to verify key-variable distributions and missingness rates. Check:
- Whether the sample is large enough to support the current model
- Whether the data structure aligns with the model (cross-section / panel / time-series / multi-level)
- Whether the time dimension meets the design's needs
- Whether key variables vary enough
- Whether missingness materially affects the baseline
- Whether there are obvious outliers, duplicate observations, or coding issues
- For treatment timing / event time / policy-shock designs, confirm the relevant time variables are available

If the data does not support the current design: state the cause clearly, propose the minimum necessary adjustment, hold off on locking the model

**Output format**:
B. Data Support Check (data structure, usable sample size, time coverage, key-variable variation, missingness concerns, outlier concerns, support level: Supported/Partially/Not supported, the minimum adjustment plan if not fully supported)

**Commit (mandatory)**

---

### Phase 7: Baseline Design Lock (PDF Phase 2 Step 3)

**Goal**: lock the main model after variable mapping and data-supportability are essentially established.

Recommended approach:
- Provide a baseline equation, or a clear model description
- Explicitly list: dependent variable, key explanatory variable, controls, fixed effects, SE handling, model type (OLS / LOGIT / POISSON, etc.)
- Make the identification / association strategy explicit (specialized by research_purpose):
  - **causal**: must specify one of DID / Event Study / IV / RDD / PSM, with the identification assumption stated (e.g., DID parallel trends, IV exclusion)
  - **associative**: explicitly declared as associative; list the theoretical mechanism behind the association direction and the main collinearity sources
- Explain why this baseline was chosen
- State what the current baseline can and cannot support
- List candidate directions for downstream extension analysis (robustness, heterogeneity; for a causal project, also mechanism tests)

**Output format**:
C. Baseline Plan Memo
  - Main model — one-sentence description
  - Core design — five elements
  - **Research purpose**: causal or associative (mandatory; consistent with the contextual research_purpose)
  - Why this baseline — 2–4 sentences
  - **Key identification assumption** (mandatory for causal; for associative, write "N/A, this is an associative study")
  - **Interpretation boundary** (associative must declare "the results of this study are associative findings; they do not support a causal interpretation; hypothesis statements use 'associated with / correlated with', not 'influence / cause'"; causal explains the external-validity boundary)
  - Candidate next-step checks

**Commit (mandatory; not skippable)**: write the complete baseline memo.

**This step is the single Executor input file**, which Executor will read; if you do not write it, the entire downstream pipeline halts. Even if the data is only "partially supported", even if you are still uncertain, **you must write a draft version** and mark at the file head:

```
---
status: draft | locked | partial
open_questions: [...]
---
```

---

### Phase 8: Descriptive Snapshot (PDF Phase 2 Step 4)

**Goal**: top up the minimum descriptive-statistics needed to support the decision. Note: only the minimum descriptives that support the decision — do not output too many tables/figures.

Recommended approach:
- For each core variable, get the distribution stats (mean / quantiles / missingness rate)
- Provide a descriptive-stats table containing at least the dependent variable, the key explanatory variable, and key controls
- When useful, suggest 1–2 most-helpful figures

**Output format**:
D. Descriptive Snapshot (descriptive-stats table, helpful visuals, what the descriptives suggest — at most 5 sentences)
E. User Confirmation (Proceed to Run Baseline / Revise Variable Mapping / Revise Baseline Design / Need More Data)

**Commit (mandatory)**
---

## Final self-check (run at the end of all Phases)

**Before** delivering the final summary, verify all 8 files have been generated:

- [ ] `planner/stage_1_alignment.md`
- [ ] `planner/stage_2_literature.md`
- [ ] `planner/stage_3_hypothesis.md`
- [ ] `planner/stage_4_quality_gate.md`
- [ ] `planner/stage_5_variable_mapping.md`
- [ ] `planner/stage_6_data_support.md`
- [ ] `planner/stage_7_baseline_design.md` ← most critical
- [ ] `planner/stage_8_descriptive_snapshot.md`

If any is missing → **fix it before delivering the final summary**. If a Phase has been reasonably skipped, still write a placeholder file stating the reason for skip + `status: skipped`.

After the check, deliver a complete research-plan summary (under 5,000 words) covering: research question, hypothesis, identification strategy, baseline equation, variable list, robustness-test plan.

---

## Phase 9: User-confirmation checkpoint (HITL, mandatory)

**Purpose**: the Planner output directly determines what regression Executor will run and what plan Reviewer will review. Committing the summary is not user endorsement — **you must pause here and let the user confirm or request changes**, then the upper-level orchestrator hands control to the next skill.

### Hard rules

1. **Stop the skill's execution immediately after delivering the final summary**. Do not, in the same conversation turn, call paper-reviewer, executor_workflow, or any downstream skill, and do not loop back to Phase 1 on your own.
2. The summary must conclude with a "waiting for user confirmation" block that explicitly lists three options:
   - **A. Confirm the plan**: when the user gives an explicit affirmative ("confirm / approved / proceed to review"), control is returned to the orchestrator and paper-reviewer is entered.
   - **B. Local revision**: the user names a specific Phase to change (e.g., "Phase 7, switch to IV", "Phase 3, swap the hypothesis to X"). Planner only recycles the named Phase, **overwriting or appending the corresponding `stage_*.md`**; other passed Phases are not rerun. After the revision, **return to Phase 9** and wait for confirmation again.
   - **C. Full redo**: the user asks to scrap and restart; rerun from Phase 1, overwriting `stage_*.md` files as needed.
3. **Standard for "confirmation"**: an explicit affirmative from the user ("confirm / agreed / approved / proceed to next step / ok to start running", etc.). Silence, vague replies, and a nod-style "ok" do **not** count as confirmation — follow up with "are you confirming the move into paper-reviewer?".
4. **Strictly forbidden**:
   - ❌ Deciding for the user that "the plan is good enough, go straight to Reviewer".
   - ❌ Treating "let me think", "let's go for now" as the A-option confirmation signal.
   - ❌ Changing the baseline-memo `status` from `draft / partial` to `locked` before confirmation is received.

### Fixed tail block at the end of the summary (write in this exact format)

```
---
**Planner stage complete — waiting for your confirmation**

- [A] Confirm the plan → proceed to paper-reviewer
- [B] Local revision → name the Phase to change and the direction; I will only recycle that Phase
- [C] Full redo → re-plan from Phase 1

Please pick A / B / C, or simply state your revision request.
```

This block must appear verbatim — do not abridge it, translate it into another language, or replace it with an implicit phrasing.
