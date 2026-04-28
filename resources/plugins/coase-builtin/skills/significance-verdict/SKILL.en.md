---
name: significance-verdict
description: Dual-criterion verdict on the main regression result for management research. Maps to full_research_workflow Step 7 + Step 8 branch decisions. Takes the main regression result and judges, per the product spec Step 7: 1) statistical significance (p-value < 0.05), 2) economic / substantive significance (whether the effect size is large enough). Effect-size judgment defaults to a human-in-the-loop. Returns one of three verdicts: Pass (proceed to 8b mechanisms + robustness), Retry (proceed to 8a bounded iteration), Eliminate (drop this hypothesis into the eliminated pool).
---

## Workflow Notes

- This skill only delivers the verdict; it does not iterate. Iteration is handled by executor_workflow Phase 4 under Step 8a rules.
- Only invoked at `full_research_workflow` Step 7. `idea-to-results` and `run-experiment` reuse executor_workflow's own judgment and do not go through this skill.
- The verdict is written to `verdict/stage_1_baseline_verdict.md`.

## Input

1. `executor/stage_1_run_baseline.md` (main regression result + coefficient / SE / p-value / magnitude / R² / sample size)
2. The "Interpretation boundary" in `planner/stage_7_baseline_design.md` (what the result can and cannot support)
3. The current hypothesis's expected sign and theoretical grounding (from `idea/stage_3_ranked.md`)
4. Iterations consumed so far (from `verdict/spec_log.md`)
5. The user's human-in-the-loop toggle in settings

## Verdict dimensions (verbatim, from product spec Step 7)

Judge whether the result has:

1. **Statistical significance**, i.e. p-value below 0.05
2. **Economic or substantive significance**, i.e. whether the effect size (the magnitude of impact) is large enough

For example, if X has a statistically significant effect on Y but the effect is extremely small, the study is not really meaningful. E.g., if we are studying whether X affects an app rating but find that a 1-SD increase in X moves the rating by only 0.00001, the finding is not meaningful.

## Verdict logic

### Statistical significance (fully automatable)

- **Pass stat**: p < 0.05 and the coefficient direction matches the expected sign
- **Fail stat – direction wrong**: p < 0.05 but the direction is opposite to the hypothesis's expected sign (this is a meaningful signal, not a simple failure — the hypothesis itself may be wrong and may need rethinking)
- **Fail stat – insignificant**: p ≥ 0.05

### Economic significance (defaults to human-in-the-loop)

Whether the effect size is "large enough" is a qualitative judgment, deeply context-dependent. This skill assesses it via:

1. Compute the standardized effect (e.g., a 1-SD increase in X corresponds to how much SD / pp / absolute change in Y)
2. Compare against actual variation in the outcome (effect / SD(Y), effect / mean(Y))
3. Compare against typical magnitudes in reference journals (if the agent can extract them from idea-critic's prior memory)
4. Output one of three labels:
   - **Meaningful**: effect size reaches the magnitude needed to substantively support the paper's conclusion
   - **Borderline**: an effect exists but is small; whether it is large enough depends on the research context
   - **Trivial**: effect size is extremely small (like the 0.00001 case) — even if statistically significant, it has no research meaning

**Human-in-the-loop (on by default)**:

- If `Meaningful` → mark pass econ directly
- If `Borderline` or `Trivial` → halt and present the computed effect, the comparison against the Y distribution, and the comparison against the literature to the user, who confirms whether to treat it as meaningful
- The user may turn off the human-in-the-loop in settings; once off, `Borderline` counts as pass and `Trivial` counts as fail

## Final verdict (combined logic)

| Statistical | Economic | Iteration count < spec_iterations (default 2) | Verdict |
|---|---|---|---|
| Pass stat (correct direction) | Meaningful | any | **PASS** → proceed to Step 8b mechanisms + robustness |
| Pass stat (correct direction) | Borderline (human says meaningful) | any | **PASS** |
| Pass stat (correct direction) | Borderline (human says not meaningful) / Trivial | yes | **RETRY** → proceed to Step 8a |
| Pass stat (correct direction) | Borderline (human says not meaningful) / Trivial | no (iterations exhausted) | **ELIMINATE** → drop into the eliminated pool |
| Pass stat (wrong direction) | any | any | **RETHINK** → not a simple failure; return to `idea-critic` to discuss whether the hypothesis itself needs to be reformulated (you may have found a valuable counter-result) |
| Fail stat (insignificant) | any | yes | **RETRY** → proceed to Step 8a |
| Fail stat (insignificant) | any | no (iterations exhausted) | **ELIMINATE** → drop into the eliminated pool |

## Step 8a iteration rules (hard constraints)

When the verdict is **RETRY**, executor_workflow Phase 4 may only adjust:

- **Control variable combinations**
- **Sample definition / filtering**
- **Variable treatment** (e.g., log transform, winsorize, building lag terms)

**Hard prohibitions**:

- May not switch FE (e.g., from firm-year FE to industry-year FE) hunting for a result
- May not switch cluster (e.g., from firm cluster to industry cluster) hunting for a result
- May not change the meaning of the estimand (a firm-year panel cannot become a pure cross-section)
- May not switch identification strategy (between DID / IV / RDD) — to truly switch identification, you must return to planner_workflow and rerun Phase 2 Step 3

Every retry must be logged in `verdict/spec_log.md`:
- What this round changed (controls / sample / variable treatment)
- The reason
- The baseline result under the alternative spec
- A comparison with the previous round

The hard cap on iterations is `spec_iterations` (default 2, max 3). Beyond the cap, the verdict must be ELIMINATE.

## Output

Write to `verdict/stage_1_baseline_verdict.md`, structured as:

```markdown
# Baseline Verdict

## Regression Summary
- Specification: [which attempt this is, baseline or alt spec N]
- Coefficient on X: [estimate]
- Standard error: [se]
- p-value: [p]
- Effect size (standardized): [value]
- Effect size (relative to Y mean/SD): [ratio]
- Sample size: [n]

## Statistical Significance Verdict
- Direction: [pos/neg] (expected: [pos/neg])
- p < 0.05: [Yes/No]
- Verdict: [Pass stat / Fail stat - direction wrong / Fail stat - insignificant]

## Economic Significance Verdict
- Magnitude analysis: [computation detail]
- Comparison to Y distribution: [comparison]
- Comparison to literature typical range (if available): [comparison]
- Meaningful / Borderline / Trivial: [label]
- Human-in-the-loop consulted: [Yes/No]
- User final call (if consulted): [Meaningful / Not meaningful]

## Combined Verdict
- **Final**: PASS / RETRY / ELIMINATE / RETHINK
- Iterations used so far: [N/max]
- Next step:
  - PASS → proceed to Step 8b, call executor_workflow Phase 5 to design mechanisms + robustness
  - RETRY → return to executor_workflow Phase 4 and adjust controls / sample / variable treatment under Step 8a hard constraints
  - ELIMINATE → write to idea/eliminated_pool.md and return to Step 14 to handle the next hypothesis
  - RETHINK → return to idea-critic discuss mode and reconsider whether the hypothesis needs a reversed restatement
```

## Related Skills

- `executor_workflow` Phase 4: invoked on RETRY
- `executor_workflow` Phase 5: invoked on PASS (entering mechanisms + robustness)
- `idea-critic` (discuss mode): invoked on RETHINK
