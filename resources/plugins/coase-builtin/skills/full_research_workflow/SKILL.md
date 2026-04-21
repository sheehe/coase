---
name: full_research_workflow
description: Coase 完整研究管线（对应 /full-research）。上层编排器——把 idea 发现 → baseline 设计 → 方案评审 → 主回归执行 → 显著性判定 → 机制与稳健性 → 结果评审 → 表图输出串起来。不实现任何 Phase 细节，所有规则都在下游 skill 里。
---

## 你只负责调度

这个 skill 是"指挥棒"，本身不规定流程细节。具体每一步做什么、落盘到哪里、Internal Rules 是什么，都由下游 skill 的 SKILL.md 决定——**直接按下游 skill 执行**即可。

## 前置检查

1. **评审模型组**：用户在"设置 → 评审模型组"至少配置 1 个独立 provider。未配置时停下提示用户去配。
2. **研究目的**：上下文里有 `research_purpose: causal|associative` 字段（由"研究设置"注入）。所有下游 skill 都按这个字段分支，不要擅自默认为 causal。

## 可用下游 skill

| Skill | 用途 | 什么时候调 |
|-------|------|------------|
| `idea-generator` | 从数据 + 研究方向生成 X 个候选假设 | 最开始，用户还没有具体假设时 |
| `idea-critic` | 多模型对抗评分（discuss / score / design-critique / result-critique 四种模式） | 假设筛选、方案打分、结果对抗 |
| `planner_workflow` | Phase 1-8 锁 baseline design，产出 `planner/stage_7_baseline_design.md` | 用户选定一个假设后 |
| `paper-reviewer` | Mode A 评方案 / Mode B 评结果 / Mode C 评 draft | 方案锁定后、主结果跑完后 |
| `executor_workflow` | Phase 1-5 跑数据准备 + 主回归 + 稳健性 + 表图 | baseline 锁定后 |
| `significance-verdict` | 主回归 Pass / Retry / Eliminate 判定 | 主回归跑完后 |

## 推荐串联顺序

1. `idea-generator` → `idea-critic` 评分筛选 → 用户选一个假设
2. `planner_workflow` 锁 baseline design
3. `paper-reviewer` Mode A 评方案；REVISE 就回到 planner
4. `executor_workflow` Phase 1-2 跑 baseline → `significance-verdict` 判定
   - Retry 走 executor 自己的替代设定规则（它自己限 2 次）
   - Eliminate 记入 `idea/eliminated_pool.md` 换下一假设
   - Pass 进入 Phase 3
5. `executor_workflow` Phase 3 跑机制 + 稳健性 → `paper-reviewer` Mode B 评结果
6. `executor_workflow` Phase 4-5 出表图 + 总结

每一步的具体 Phase 规则、落盘文件名、迭代上限都**读下游 skill 自己的 SKILL.md**，不在这里重复。

## 评审模型组怎么调

`idea-critic` 和 `paper-reviewer` 都通过 `mcp__coase-critic-panel__invoke` tool 并行调度用户配置的多 provider，聚合逻辑由它们自己处理。你只管按需调用这两个 skill，不要自己直接调 tool。

## 几条硬规则（其他全部交给下游）

- **每处理完一个假设必须新开子任务**处理下一个，不要在同一上下文里累积多个假设。
- **禁止**把 causal 项目偷偷降级为 associative——数据不支持因果策略时，让 planner_workflow 按自己的 Quality Gate 规则调整研究问题。
- **禁止**因为 p 值不显著就切换识别方法。`significance-verdict` 里识别通过 + null result 就是合法 null result，继续走稳健性不叫失败。
- 工作目录按 skill 归属：`idea/` / `planner/` / `executor/` / `review/` / `verdict/`——**下游 skill 自己管自己的目录**，不要混写。
