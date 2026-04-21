---
name: full_research_workflow
description: Coase 完整研究管线（对应 /full-research）。从研究方向和数据出发，串联 idea 生成 → 多模型对抗评分 → planner_workflow 锁 baseline → paper-reviewer 评方案 → executor_workflow 跑主回归 → significance-verdict 判定 → 机制 + 稳健性 → paper-reviewer 评结果 → 表图落盘 → 下一个候选假设。本 skill 是上层编排器，**不复制下游 skill 的 Phase 细节**，具体规则由各下游 skill 自己负责。
---

## Workflow Notes

- 本 skill 是编排器，依次调用 `idea-generator` / `idea-critic` / `planner_workflow` / `paper-reviewer` / `executor_workflow` / `significance-verdict`。每个下游 skill 的 Phase 内部细节、落盘文件名、Internal Rules 都由下游 skill 自己定义，本 skill 只负责**把它们串起来**并管理跨 skill 的交接。
- 定位 **经管学者**（非"社会科学学者"或纯经济学）。参考期刊：SMJ, Organization Science, AMJ, JIBS, SEJ, JBV。
- 工作目录布局（按 skill 归属，禁止改名跨写）：`idea/`（本 workflow）、`planner/`（planner_workflow）、`executor/`（executor_workflow）、`review/`（paper-reviewer）、`verdict/`（significance-verdict + 本 workflow）。
- **前置检查**：
  1. 评审模型组（critic panel）至少配置 1 个独立 provider——未配置时停下提示用户去"设置 → 评审模型组"勾选。panelSize=1 走单 critic 评语、panelSize≥2 走对抗共识。
  2. 上下文已注入 `research_purpose` 字段（causal / associative），由"研究设置"面板驱动。**不读 research_purpose 直接默认 causal 口径是错的**，所有下游 skill 都会按这个字段分支。

## Related Skills

| Skill | 角色 | 产物目录 |
|-------|------|---------|
| `idea-generator` | 基于用户方向 + 数据生成 X 个候选假设（Step 1a） | `idea/` |
| `idea-critic` | 多模型对抗 discuss / score / design-critique / result-critique（Step 2 / 3 / 5 / 9 / 11） | `idea/`（评分轮次）、`review/`（设计/结果批评） |
| `planner_workflow` | Phase 1-8 锁 baseline design | `planner/` |
| `paper-reviewer` | Mode A（方案） / Mode B（执行结果） / Mode C（draft）评审 | `review/` |
| `executor_workflow` | Phase 1-5 跑 baseline + 机制 + 稳健性 + 表图 | `executor/` |
| `significance-verdict` | 主回归 Pass / Retry / Eliminate 判定 | `verdict/` |

## 流程概览（14 步）

> 粗体 = 必跑。下游 skill 的 Phase 号在括号里标出，细则读那个 skill 即可。

| Step | 动作 | 承担 skill / 产物 |
|-----|------|------------------|
| 0 | **Intake**：记录用户研究方向、数据清单、约束 | 本 workflow → `idea/stage_0_intake.md` |
| 1a | **生成 X 个假设** | `idea-generator` → `idea/stage_1_hypotheses.md` |
| 1b | 数据 readme 缺失时的数据扫描 | 同上，在 stage_1 里合并 |
| 2 | **多模型对抗 discuss**（研究价值讨论） | `idea-critic` mode=discuss → `idea/stage_2_critique_rounds.md` |
| 3 | **评分 + 阈值过滤**（1–10 分 + 加权综合分） | `idea-critic` mode=score → `idea/stage_3_ranked.md` + `idea/eliminated_pool.md` |
| 4 | **用户选定**（human-in-the-loop） | 本 workflow 提示用户从通过名单挑 1 个假设 |
| 5 | **方案设计**：Phase 1–8 Baseline Research Proposal & Design | `planner_workflow`（含其内部 Phase 4 Quality Gate，最多 2 次回溯） |
| 6 | **方案评审**：Mode A | `paper-reviewer` → `review/stage_1_design_review/{provider}.md`；REVISE 时回到 Step 5，最多 2 次 |
| 7 | **主回归执行**：Phase 1–2 | `executor_workflow` Phase 1 + 2 → `executor/stage_1_*.md`、`executor/stage_2_run_baseline.md`、`executor/specification_log.md` |
| 8 | **显著性判定** | `significance-verdict` → `verdict/stage_1_baseline_verdict.md`（Pass / Retry / Eliminate） |
| 8a | Retry 分支：有限迭代（iterations ≤ 2，硬上限） | `executor_workflow` Phase 2 的替代设定规则；**禁止**换 FE / cluster / estimand，只能改 controls / sample / 变量处理；每次迭代追加 `verdict/spec_log.md` |
| 8b | Eliminate 分支：该假设放弃 | 记入 `idea/eliminated_pool.md`（reason + 时间戳），回到 Step 4 选下一假设 |
| 8c | Pass 分支：进入机制 + 稳健性 | 继续 Step 9 |
| 9 | **机制 / 异质性 / 稳健性** + **中间对抗评审** | `executor_workflow` Phase 3；完成后 `idea-critic` mode=result-critique 对扩展结果做一次对抗 → `review/stage_2_result_review/{provider}.md` |
| 10 | 必要时回到 Phase 3 补做被 critic 点出的检验（iterations ≤ 1） | `executor_workflow` Phase 3 + `verdict/spec_log.md` |
| 11 | **扩展结果判定** | 本 workflow 综合 executor Phase 3 + critic 评审，写入 `verdict/stage_2_extended_verdict.md`（不另跑 significance-verdict；它只对 baseline 判定） |
| 12 | **表图落盘** | `executor_workflow` Phase 4 → `executor/outputs/tables/*.{tex,csv,md,xlsx}`、`executor/outputs/figures/*.{png,pdf}`、`executor/stage_4_table_figure_output.md` |
| 13 | **产出总结** | `executor_workflow` Phase 5 → `executor/stage_5_assessment.md`；本 workflow 汇总写 `verdict/final_verdict.md` |
| 14 | **处理下一假设**：每个假设收尾**必须新开子任务**（Task tool），防止累积上下文幻觉；idea/eliminated_pool.md / verdict/ 由编排器主 agent 保留 | 本 workflow |

## 评审模型组调用

Step 2 / 3 / 6 / 9 的"模型对抗"由 Coase 内建 in-process MCP server 提供的 **`mcp__coase-critic-panel__invoke`** tool 完成。tool 读取"设置 → 评审模型组"里配置的 provider 列表，并行发起裸 Anthropic Messages API 调用，返回每个 provider 的独立回答。聚合逻辑（共识 / 分歧 / 单一模型独有）由 `idea-critic` 或 `paper-reviewer` 自己处理。tool 签名和错误处理详见对应 skill 文档，本 workflow 不复制。

- **Step 2 / 3**：走 `idea-critic`（discuss / score 模式）
- **Step 6**：走 `paper-reviewer`（Mode A，方案级）
- **Step 9**：扩展结果层面，优先 `paper-reviewer` Mode B；若只想要快速评分风格的反馈，用 `idea-critic` mode=result-critique

## 迭代与终止规则（硬上限）

| 环节 | 最多迭代 | 触发条件 | 超限处理 |
|------|---------|---------|---------|
| Planner Quality Gate（Phase 4） | 2 次（由 planner_workflow 自己执行） | RED / YELLOW / ORANGE | 生成"迭代耗尽报告"进入 Step 6，由评审和用户兜底 |
| Step 6 方案评审 REVISE | 2 次 | 连续 REVISE | 把剩余问题列入 `review/stage_1_design_review/open_issues.md`，带风险进入 Step 7 |
| Step 8a Retry（baseline 迭代） | 2 次 | significance-verdict=Retry | 若仍 Retry，转 Eliminate；Step 8b 路径 |
| Step 10 扩展补做 | 1 次 | Step 9 critic 指出关键遗漏 | 把未解决项写进 `verdict/stage_2_extended_verdict.md` 的 open_risks 段，继续 Step 12 |

**所有迭代**（Step 6 / 8a / 10）都必须在 `verdict/spec_log.md` 里追加一条：时间戳 + 触发来源 + changed what + reason + result。spec_log 按追加写，不覆盖。

**Step 14 context 管理**：每处理完一个假设必须让主编排 agent 新开子任务处理下一个，不在同一上下文里累积多个假设的中间产物。

## research_purpose 穿透

- `research_purpose = causal`：idea-critic 评分权重、planner Phase 3 / 7 方法要求、paper-reviewer 评分维度都按因果口径走。Step 8 判定中"识别通过 + null + 功效足"是合法 null result，按 `verdict/stage_2_extended_verdict.md` 的 null result 路径继续 robustness，**不得**因为不显著就切换方法（那叫 p-hacking）。
- `research_purpose = associative`：所有下游不再以"是否有 DID / IV"打分，但 Step 5 / 6 / 9 / 11 必须核验 Interpretation boundary 里显式声明了"本研究为关联性研究，结果不支持因果解读"，假设表述用"关联 / 相关"不用"影响 / 导致"。
- **禁止**在本 workflow 任何环节偷偷把 causal 项目降级为 associative；若数据确实不支持任一因果策略，回到 Step 4 调整研究问题（由 planner_workflow Phase 4 Quality Gate 的 backtrack 规则执行）。

## exploratory_mode（可选逃生舱）

仅当用户显式声明 exploratory 时启用。放宽 Step 8a 的"禁止换 FE / cluster"限制，允许更自由的规格探索；但**所有产物必须在 stage 文件和表图 caption 中加 `EXPLORATORY` 水印**，significance-verdict 不进入正式发表通道。默认关闭。

## File Contract（按 skill 归属汇总）

下游 skill 自己的 stage 文件命名由各自 SKILL.md 负责，本 workflow 只负责这几个编排层文件：

- `idea/stage_0_intake.md` — 用户方向 + 数据清单 + 约束
- `idea/stage_1_hypotheses.md` — Step 1a 产生的 X 个假设（idea-generator 写）
- `idea/stage_2_critique_rounds.md` — Step 2 每轮对抗记录（idea-critic 写）
- `idea/stage_3_ranked.md` — Step 3 评分 + 通过名单（idea-critic 写）
- `idea/eliminated_pool.md` — 所有被淘汰的假设（追加写，含淘汰理由 + 时间戳）
- `verdict/stage_1_baseline_verdict.md` — Step 8 判定（significance-verdict 写）
- `verdict/stage_2_extended_verdict.md` — Step 11 扩展判定 + 机制/稳健性综合（本 workflow 写）
- `verdict/spec_log.md` — 所有迭代记录（追加写，禁止覆盖）
- `verdict/final_verdict.md` — 本假设收尾总结（本 workflow 写）

下游 skill 负责自己的目录：

- `planner/stage_1_alignment.md` ~ `planner/stage_8_descriptive_snapshot.md` → 见 `planner_workflow` SKILL.md
- `executor/stage_1_data_preparation.md` ~ `executor/stage_5_assessment.md` + `executor/specification_log.md` + `executor/outputs/` → 见 `executor_workflow` SKILL.md
- `review/stage_1_design_review/{provider}.md`（Step 6） / `review/stage_2_result_review/{provider}.md`（Step 9） → 见 `paper-reviewer` SKILL.md

**硬性规则**：
- 所有 stage_* 文件名**一字不差**，禁止自造（`baseline.md` / `plan.md` / `final.md` 都不行）
- 禁止把长内容（文献 abstract、回归全表、模型 summary）粘回对话——落盘即可，对话里只保留结论 + 文件路径
- 若某步因数据不足或代码失败无法完成，仍要写占位文件，内容含 "status: skipped / blocked" + 原因 + 最小下一步建议

## 最终自检

完成一个假设的 Step 0–13 后，给出总结**之前**核对：

- [ ] `idea/stage_0_intake.md` ~ `idea/stage_3_ranked.md` 齐全
- [ ] `planner/stage_7_baseline_design.md` 存在且 status ∈ {locked, partial}
- [ ] `executor/stage_2_run_baseline.md` 存在
- [ ] `verdict/stage_1_baseline_verdict.md` 存在，明确给出 Pass / Retry / Eliminate
- [ ] 若 Pass：`executor/stage_3_explanation_robustness.md` + `executor/stage_4_table_figure_output.md` + `verdict/stage_2_extended_verdict.md` 齐全
- [ ] `verdict/final_verdict.md` 存在，含：研究问题、最终假设、判定结果、关键表图路径、风险与 open_issues

缺任何一个 → 立刻补写再输出最终总结。下一假设开始时用 Task tool **新开子任务**，不在当前上下文里继续。
