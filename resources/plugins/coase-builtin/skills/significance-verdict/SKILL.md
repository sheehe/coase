---
name: significance-verdict
description: 经管主回归结果双重判定器。对应 full_research_workflow Step 7 + Step 8 分支决策。输入主回归结果，按《产品讨论书》step 7 原则判定：1) 统计意义上的显著性（p-value < 0.05），2) 经济意义 / 实质意义上的显著性（effect size 是否够大）。默认在 effect size 判定引入 human-in-the-loop。判决结果分三档：Pass（进 8b 机制 + 稳健性）、Retry（进 8a 有限迭代）、Eliminate（该假设放弃进淘汰库）。
---

## Workflow Notes

- 本 skill 只做判定，不做迭代。迭代由 executor_workflow Phase 4 按 step 8a 规则执行。
- 仅被 `full_research_workflow` Step 7 调用。`idea-to-results` 和 `run-experiment` 直接沿用 executor_workflow 自身的判断，不走本 skill。
- 本 skill 的判定写入 `verdict/stage_1_baseline_verdict.md`。

## Input

1. `executor/stage_1_run_baseline.md`（主回归结果 + coefficient / SE / p-value / magnitude / R² / sample size）
2. `planner/stage_7_baseline_design.md` 中的 "Interpretation boundary"（结果能支持什么、不能支持什么）
3. 当前假设的 expected sign 和 theoretical grounding（来自 `idea/stage_3_ranked.md`）
4. 当前已用掉的迭代次数（来自 `verdict/spec_log.md`）
5. 用户在设置页关于 human-in-the-loop 的开关

## 判定维度（原文，来自《产品讨论书》Step 7）

判定结果是否具有：

1. **统计意义上的显著性**，即 P-value 是否小于 0.05
2. **经济意义或实质意义上的显著性**，即 effect size（影响效果）是否够大

举例而言，如果 X 对 Y 具有统计上显著的影响，但是影响效果极其小，那么这个研究其实就没有太大意义。比如我们研究 X 是否对 app 评分有影响，但是我们发现 X 上升一个 SD 就只会对 app 评分有 0.00001 的影响，那么这个发现就没有什么意义。

## 判定逻辑

### 统计显著性（可完全自动化）

- **Pass stat**: p < 0.05 且系数方向与 expected sign 一致
- **Fail stat - direction wrong**: p < 0.05 但方向与 hypothesis expected sign 相反（这是个重要信号，不简单算失败——可能 hypothesis 本身错了，需要重思考）
- **Fail stat - insignificant**: p ≥ 0.05

### 经济显著性（默认引入 human-in-the-loop）

Effect size 是否"够大"是定性判断，高度依赖研究场景。本 skill 按以下步骤评估：

1. 计算标准化效应量（例如：X 上升 1 SD 对应 Y 上升多少 SD / 百分点 / 绝对值）
2. 与因变量的实际 variation 作对比（effect / SD(Y), effect / mean(Y)）
3. 与参考期刊常见数量级对比（若 agent 能从 idea-critic 历史记忆中提取）
4. 给出三档建议：
   - **Meaningful**: 效应量达到"对论文结论有实质意义"的量级
   - **Borderline**: 效应量存在，但偏小，是否够大取决于研究情境
   - **Trivial**: 效应量极小（类似 0.00001 案例），即便统计显著也没有研究意义

**Human-in-the-loop（默认开启）**：

- 若 `Meaningful` → 直接标记 pass econ
- 若 `Borderline` 或 `Trivial` → 停下来把计算的效应量、与 Y 分布的对比、与参考文献的对比交给用户，用户确认是否视为有意义
- 用户可在设置里关闭 human-in-the-loop，关闭后 `Borderline` 视为 pass，`Trivial` 视为 fail

## 最终判决（组合逻辑）

| 统计显著性 | 经济显著性 | 当前迭代次数 < spec_iterations (默认 2) | 判决 |
|---|---|---|---|
| Pass stat (方向正确) | Meaningful | 任意 | **PASS** → 进入 Step 8b 机制 + 稳健性 |
| Pass stat (方向正确) | Borderline (human 确认有意义) | 任意 | **PASS** |
| Pass stat (方向正确) | Borderline (human 确认无意义) / Trivial | 是 | **RETRY** → 进入 Step 8a |
| Pass stat (方向正确) | Borderline (human 确认无意义) / Trivial | 否（已用完迭代） | **ELIMINATE** → 进淘汰库 |
| Pass stat (方向错误) | 任意 | 任意 | **RETHINK** → 不视为简单失败，返回 `idea-critic` 讨论是否 hypothesis 本身需重新表述（可能发现了有价值的反向结果） |
| Fail stat (不显著) | 任意 | 是 | **RETRY** → 进入 Step 8a |
| Fail stat (不显著) | 任意 | 否（已用完迭代） | **ELIMINATE** → 进淘汰库 |

## Step 8a 迭代规则（硬约束）

判决为 **RETRY** 时，executor_workflow Phase 4 只能做以下类型的调整：

- 调整**控制变量组合**
- 调整**样本定义 / 筛选**
- 调整**变量处理**（如对数化、winsorize、滞后项构造）

**硬禁止**：

- 不得换 FE（如从 firm-year FE 换成 industry-year FE）来找结果
- 不得换 cluster（如从 firm cluster 换成 industry cluster）来找结果
- 不得改变 estimand 含义（原本是 firm-year panel 不能变成纯横截面）
- 不得换识别策略（DID / IV / RDD 之间）—— 若真的需要换识别策略，只能回到 planner_workflow 重走 Phase 2 Step 3

所有 retry 必须在 `verdict/spec_log.md` 中记录：
- 本次 changed what（controls / sample / variable treatment）
- 理由
- 替代设定后的 baseline result
- 与上一轮对比

迭代次数硬上限 `spec_iterations`（默认 2，最大 3）。超出上限必须 ELIMINATE。

## Output

写入 `verdict/stage_1_baseline_verdict.md`，结构：

```markdown
# Baseline Verdict

## Regression Summary
- Specification: [当前第几次尝试，baseline 或 alt spec N]
- Coefficient on X: [estimate]
- Standard error: [se]
- p-value: [p]
- Effect size (standardized): [value]
- Effect size (relative to Y mean/SD): [ratio]
- Sample size: [n]

## Statistical Significance Verdict
- Direction: [正/负] (expected: [正/负])
- p < 0.05: [Yes/No]
- Verdict: [Pass stat / Fail stat - direction wrong / Fail stat - insignificant]

## Economic Significance Verdict
- Magnitude analysis: [计算细节]
- Comparison to Y distribution: [对比]
- Comparison to literature typical range (if available): [对比]
- Meaningful / Borderline / Trivial: [label]
- Human-in-the-loop consulted: [Yes/No]
- User final call (if consulted): [Meaningful / Not meaningful]

## Combined Verdict
- **Final**: PASS / RETRY / ELIMINATE / RETHINK
- Iterations used so far: [N/max]
- Next step:
  - PASS → 进入 Step 8b，调用 executor_workflow Phase 5 设计机制 + 稳健性
  - RETRY → 回到 executor_workflow Phase 4，遵守 Step 8a 硬约束调整控制变量 / 样本 / 变量处理
  - ELIMINATE → 写入 idea/eliminated_pool.md，回到 Step 14 处理下一个假设
  - RETHINK → 回到 idea-critic discuss mode，重新讨论 hypothesis 是否需要反向重述
```

## Related Skills

- `executor_workflow` Phase 4：被 RETRY 时调用
- `executor_workflow` Phase 5：被 PASS 时调用（进入机制 + 稳健性）
- `idea-critic` (discuss mode)：被 RETHINK 时调用
