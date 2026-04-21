---
name: full_research_workflow
description: Coase 完整研究管线（对应 /full-research）。上层编排器——把 idea 发现 → baseline 设计 → 方案评审 → 主回归执行 → 显著性判定 → 机制与稳健性 → 结果评审 → 表图输出串起来。不实现任何 Phase 细节，所有规则都在下游 skill 里。
---

## 你只负责调度

这个 skill 是"指挥棒"，本身不规定流程细节。具体每一步做什么、落盘到哪里、Internal Rules 是什么，都由下游 skill 的 SKILL.md 决定——**直接按下游 skill 执行**即可。

### 执行顺序（带 HITL 关卡）

```
planner_workflow
  └── [HITL 关卡 1] 等待用户对 baseline plan 的明确确认
paper-reviewer（评审 Planner 产出）
  └── [HITL 关卡 2] 若评审结论为 REVISE / REJECT，等用户决定回炉 Planner 还是继续 Executor
executor_workflow
  └── [HITL 关卡 3] 等待用户对主回归与机制/稳健性结果的确认
paper-reviewer（评审 Executor 产出）
```

### HITL 关卡硬性规则（编排器必须遵守）

1. **关卡 1（Planner → Reviewer）**：`planner_workflow` 执行到它自己的 Phase 9 就会主动停下并输出"等待确认"尾段。在用户没有给出明确肯定表述（"确认 / 通过 / 进入评审"等）之前，**绝对不允许**自动调用 paper-reviewer。
   - 用户选 A → 调用 paper-reviewer。
   - 用户选 B / C 或给出具体修改意见 → 把控制权交回 planner_workflow 回炉，不得自己动笔改 Planner 的落盘文件。
2. **关卡 2（Reviewer → Executor）**：paper-reviewer 给出 REVISE / REJECT 时，编排器**不得自作主张**判断"评审问题是数据限制无法解决，硬着头皮往下推"。必须把评审结论交给用户，由用户选择：
   - 回炉 planner_workflow 改设计；
   - 或显式授权"已知风险，继续执行 Executor"。
   REVIEW 结论为 PASS/ACCEPT 时方可直接进入 executor_workflow。
3. **关卡 3（Executor → Reviewer）**：executor_workflow 产出主回归与机制/稳健性结果后，编排器等用户确认是否进入第二轮 paper-reviewer；用户要求补跑额外检验，则回炉 executor_workflow。

### 严禁行为

- ❌ 在任一 HITL 关卡未收到用户明确确认时，越级调用下游 skill。
- ❌ 把用户的"嗯"、"先这样"、"再看看"当作确认信号——必须是明确肯定才算通过。
- ❌ 绕过 planner_workflow 自行修改 `planner/stage_*.md`，或绕过 executor_workflow 自行修改 `executor/` 下的产出。