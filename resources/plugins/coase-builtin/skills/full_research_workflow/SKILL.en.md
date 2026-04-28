---
name: full_research_workflow
description: Coase end-to-end research pipeline (maps to /full-research). Top-level orchestrator that strings together idea discovery → baseline design → design review → main regression → significance verdict → mechanisms & robustness → result review → tables & figures. Does not implement any phase detail — all rules live in the downstream skills.
---

## You are only responsible for orchestration

This skill is the "baton". It does not prescribe phase detail. What each step does, where outputs land, what the Internal Rules are — that all comes from the downstream skill's SKILL.md. **Execute strictly per the downstream skill.**

### Execution order (with HITL gates)

```
planner_workflow
  └── [HITL gate 1] Wait for the user's explicit confirmation of the baseline plan
paper-reviewer (review the Planner output)
  └── [HITL gate 2] If the review concludes REVISE / REJECT, wait for the user to decide
                    whether to recycle Planner or proceed to Executor
executor_workflow
  └── [HITL gate 3] Wait for the user's explicit confirmation of the main regression and
                    mechanism/robustness results
paper-reviewer (review the Executor output)
```

### Hard HITL rules (the orchestrator must obey)

1. **Gate 1 (Planner → Reviewer)**: `planner_workflow` halts on its own at its Phase 9 and prints a "waiting for confirmation" tail block. Until the user gives an explicit affirmative ("confirm / approved / proceed to review", etc.), you are **absolutely not allowed** to auto-invoke paper-reviewer.
   - User picks A → call paper-reviewer.
   - User picks B / C or gives concrete revision feedback → hand control back to planner_workflow for a rerun. Do **not** edit the Planner output files yourself.
2. **Gate 2 (Reviewer → Executor)**: When paper-reviewer returns REVISE / REJECT, the orchestrator **must not** unilaterally decide "the review concern is a data limitation we cannot fix, push through anyway". Surface the review conclusion to the user and let the user choose:
   - Recycle planner_workflow to revise the design; or
   - Explicitly authorize "known risk, proceed to Executor".
   Only when the review concludes PASS/ACCEPT may you go straight into executor_workflow.
3. **Gate 3 (Executor → Reviewer)**: After executor_workflow produces the main regression plus mechanism/robustness results, the orchestrator waits for the user to confirm whether to enter the second paper-reviewer round. If the user wants additional tests, recycle executor_workflow.

### Strictly forbidden

- ❌ Skipping a downstream skill at any HITL gate before the user's explicit confirmation.
- ❌ Treating "ok", "let's go for now", "let me think" as confirmation — only an explicit affirmative counts.
- ❌ Bypassing planner_workflow to edit `planner/stage_*.md` yourself, or bypassing executor_workflow to edit outputs under `executor/` yourself.
