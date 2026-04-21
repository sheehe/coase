---
name: full_research_workflow
description: Coase 完整研究管线（对应 /full-research）。上层编排器——把 idea 发现 → baseline 设计 → 方案评审 → 主回归执行 → 显著性判定 → 机制与稳健性 → 结果评审 → 表图输出串起来。不实现任何 Phase 细节，所有规则都在下游 skill 里。
---

## 你只负责调度

这个 skill 是"指挥棒"，本身不规定流程细节。具体每一步做什么、落盘到哪里、Internal Rules 是什么，都由下游 skill 的 SKILL.md 决定——**直接按下游 skill 执行**即可。
planner_workflow---paper-reviewer---executor_workflow---paper-reviewer
按照这个顺序去执行。