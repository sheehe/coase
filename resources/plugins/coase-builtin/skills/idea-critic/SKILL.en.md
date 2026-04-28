---
name: idea-critic
description: Multi-model adversarial scoring / critique tool for management research. Maps to full_research_workflow Steps 2 / 3 / 5 / 9 / 11. The user picks a "review model panel" (multiple providers) in settings; this skill dispatches all selected models in parallel for independent reviews of hypotheses / plans / test results, then aggregates consensus + divergence. Four modes: discuss (research-value discussion of a hypothesis), score (1–10 scoring + threshold filtering), design-critique (plan critique), result-critique (result critique).
---

## Workflow Notes

- Reused by `full_research_workflow` at multiple steps. The user only sees "multi-model adversarial review" — they do not need to know whether the underlying call goes through SDK or MCP (in fact it directly calls the user's configured providers).
- At least 1 provider independent of the main model must be configured as a critic. panelSize=1 runs single-critic critique mode (one independent review, no consensus/divergence aggregation); panelSize≥2 runs multi-party adversarial consensus mode (aggregating consensus + divergence). If the user has zero configured, halt and ask them to pick at least 1 independent provider in settings.
- This skill is a pure review tool; it does not commit the final decision. Final decisions are made by the user (human-in-the-loop) or by `significance-verdict` (result verdicts).

## Invocation Modes

### Mode 1: `discuss` (Step 2)

**Input**: the X hypotheses in `idea/stage_1_hypotheses.md`.

**Task**: for each hypothesis, have each selected model independently analyze its research value. Search literature (if the provider supports it) and judge:

- Whether it responds to a literature tension / paradox
- Whether it has novelty
- Whether it matches the style of the reference journals (SMJ / OrgSci / AMJ / JIBS / SEJ / JBV)
- Whether existing literature has already adequately answered it

Each round, each model produces one analysis report. Loop a few rounds (default `critique_rounds = 2`); after each round let each model read the other models' opinions and revise its own analysis. Continue until each hypothesis is in good shape (consensus across models has converged) or the round cap is reached.

**Output**: `idea/stage_2_critique_rounds.md`, appended each round, containing each model's per-hypothesis analysis plus a per-round consensus summary.

### Mode 2: `score` (Step 3)

**Input**: `idea/stage_1_hypotheses.md` + `idea/stage_2_critique_rounds.md` (if Mode 1 has been run).

**Task**: each model independently scores each hypothesis 1–10 across the dimensions below (each 1–10; the final total is the weighted average):

- **Research value / novelty** (weight 0.3)
- **Data feasibility** (weight 0.25)
- **Identification credibility** (weight 0.25)
- **Reference-journal fit** (weight 0.2)

Aggregate: average the weighted totals across all models to get each hypothesis's final score.

**Threshold filter**:

- Hypotheses above `score_threshold` (default 7) → ranked by score, enter the "pass list"
- Hypotheses below the threshold → enter a "rescue discussion" stage and get `rescue_rounds` (default 2) rounds to be revised and rescored. If they still fail, they go into `idea/eliminated_pool.md` for future avoidance.

**Human-in-the-loop (on by default)**: after the threshold filter and before Step 4, present the pass list to the user for confirmation. The user may:

- Approve the top pick
- Skip the top pick and choose the second
- Manually rescue a specific eliminated hypothesis

**Output**: `idea/stage_3_ranked.md`, containing per-hypothesis per-model scores, aggregate scores, and pass/eliminate status. Also update `idea/eliminated_pool.md`.

### Mode 3: `design-critique` (Steps 5 + 9)

**Input**: `planner/stage_7_baseline_design.md` (at Step 5) or the Mechanism / Robustness plan inside `executor/stage_2_explanation_robustness.md` (at Step 9).

**Task**: each model independently reviews the plan, focusing on:

- Whether sample selection is reasonable (any selection bias)
- Whether variable selection can rule out alternative stories
- Whether the identification strategy holds (parallel trends / exogeneity / continuity, etc.)
- Whether FE / cluster matches the data structure
- Whether any competing explanation is overlooked

Output: Accept / Modify / Reject + concrete revision suggestions.

**Aggregation rules**:

- All models Accept → pass, proceed to execution
- Any model Reject → must adopt the key points behind the Reject; return to planner for redesign
- Modify suggestions are sorted "consensus items → divergent items" and handed to the agent or human to decide whether to adopt

**Output**: appended to the `critique` subsection of the corresponding stage file.

### Mode 4: `result-critique` (Step 11)

**Input**: the mechanism / heterogeneity / robustness results in `executor/stage_2_explanation_robustness.md`.

**Task**: each model independently critiques:

- Whether the mechanism evidence actually supports the mechanism, or merely shows heterogeneity
- Whether robustness checks actually answer the identification concerns enumerated in Phase 2
- Whether any test result conflicts with the baseline yet has been papered over
- Whether the interpretation overreaches (writing "mechanism-supporting" as "mechanism proof")

Output: a "Convincing / Suggestive / Not convincing" label + reason for each test.

**Output**: `verdict/stage_2_extended_verdict.md`, containing:

- Per-test aggregated label
- Tests recommended to keep in the main text
- Tests recommended to demote to appendix or drop
- Tests recommended for executor_workflow Phase 5 to rerun or fix

## Multi-model parallel dispatch (technical note)

This skill performs multi-model adversarial scoring via the **`mcp__coase-critic-panel__invoke`** tool. The tool is exposed by the in-process MCP server bundled with Coase; it reads the provider list configured under "Settings → Review Model Panel" and issues bare Anthropic Messages API calls to each provider in parallel (it does not go through the full Agent SDK CLI — lower cost, faster), and returns aggregated independent answers from multiple models.

### Tool signature

```
mcp__coase-critic-panel__invoke({
  user_prompt: string,      // user message sent to each review model
  system_prompt?: string,   // optional: role for the review model (e.g. "management referee")
  max_tokens?: number,      // default 4096
  timeout_ms?: number,      // default 60000
})
```

### Usage pattern

For every mode (discuss / score / design-critique / result-critique), follow this pattern:

1. **Build user_prompt**: construct a prompt template per the current mode's scoring dimensions / critique task and embed the artifact under review (idea / plan / result) as context
2. **Build system_prompt**: set the reviewer role per the mode (e.g., "You are an SMJ management referee — review the following idea strictly")
3. **Call the tool**: `mcp__coase-critic-panel__invoke({ user_prompt, system_prompt })`
4. **Parse the return**: the tool returns an aggregated markdown payload containing each model's independent answer
5. **Aggregate**: you (the agent) do the consensus / divergence analysis yourself, formatted to match this skill's per-mode output spec

### Pre-check

Before calling the tool:
- If `mcp__coase-critic-panel__invoke` returns `isError=true` with "review model panel not configured", halt and tell the user to pick at least 1 independent provider in settings; do not continue
- If multiple entries in the returned payload have `ok=false`, clearly mark which models failed/timed out when aggregating; if only 1 succeeded, downgrade to single-critic critique mode; if 0 succeeded, halt and report to the user

## Principles you must follow

1. Scoring and critique must come from genuinely independent model calls (single-model self-critique-then-aggregate is not allowed)
2. At least 1 independent provider (single-critic critique mode); ≥ 2 recommended for adversarial consensus mode; 3–4 is best; cap at 6 (token-cost consideration)
3. When aggregating, you must show each model's raw opinion — do not produce only the aggregate (so the user can see where the divergence comes from)
4. The goal of the adversary is to **make the hypothesis / plan / result better**, not simply to reject
5. Round counts must not exceed the caps (critique_rounds max 3, rescue_rounds max 3) to prevent infinite loops

## Output Files

- Mode 1: `idea/stage_2_critique_rounds.md`
- Mode 2: `idea/stage_3_ranked.md` + update `idea/eliminated_pool.md`
- Mode 3: append to `planner/stage_7_baseline_design.md` or `executor/stage_2_explanation_robustness.md`
- Mode 4: `verdict/stage_2_extended_verdict.md`
