---
name: paper_review_workflow
description: Coase 工作流 W5 论文评审。对已有论文 draft 做 referee 视角对抗审查。支持 self-review（自评找漏洞）、reviewer-2（模拟严苛审稿）、both 三种模式。调用用户已配置的"评审模型组"，多模型并行生成 referee report，聚合后输出意见清单和改稿 todo。
---

## Workflow Notes

- 本工作流不改写用户论文，只输出评审报告和建议
- 工作目录：`review/`
- 必须调用用户在设置页选定的"评审模型组"（provider 多选），至少 2 个不同模型才能形成"对抗"

## Input

用户应提供：
1. 论文 draft（LaTeX / PDF / Markdown / plain text 皆可）
2. 评审模式：`self-review` / `reviewer-2` / `both`
3. （可选）目标期刊或投稿场景，用于调整评审严格程度
4. （可选）用户最担心的问题或希望重点审查的章节

若 2 未指定，默认 `both`。

## Phase 1: 论文理解

读 draft，提炼成结构化摘要：
- Research question
- Identification strategy（含关键诊断是否通过）
- Sample & data
- Main findings（方向、量级、显著性）
- Claimed contributions
- 论文自述的 limitations

输出 `review/stage_1_paper_summary.md`。

此阶段若发现 draft 明显缺失某部分（比如没有诊断章节、没有 robustness），停下来告诉用户是否继续评审还是先补完再来。

## Phase 2: 多模型对抗评审

读取用户设置的"评审模型组"（provider 多选）。对每个选中的 provider，调用 `paper-reviewer` skill 独立生成一份 referee report。

每份 report 必须覆盖：

**A. 识别与内部效度**
- 识别策略的假设是否成立？证据是否充分？
- 是否存在未讨论的遗漏变量、反向因果、选择偏差？
- 诊断是否充分？（平行趋势 / 弱工具 / 带宽敏感性 / 测量误差）

**B. 外部效度**
- 样本范围决定了结论适用到多远？
- 机制是否能推广到其他 setting？

**C. 计量 / 统计 soundness**
- 标准误聚类是否合理？
- 多重比较问题？
- 功效是否足够支持 null result 的解读？

**D. 写作与贡献**
- 研究问题表述是否清晰、可证伪？
- 贡献声明是否过度 / 不足？
- 与已有文献的定位是否准确？

**E. 总体评价**
- 推荐：Accept / Minor Revision / Major Revision / Reject
- 最致命的 3 条意见（按严重度排序）

每个模型的 report 写入 `review/stage_2_referee_reports/{model_id}.md`。

**模式差异**：
- `self-review`：prompt 强调"找自己论文的弱点，宽容度中等"
- `reviewer-2`：prompt 强调"严苛审稿人，寻找拒稿理由"
- `both`：对每个模型各跑一次两种模式，产出 2N 份 report

## Phase 3: 意见聚合与优先级排序

合并所有 referee report，按以下三档排序：

**高优先级（共识）**：所有模型都提到的同一问题，或 ≥ 75% 模型提到的问题。这是必须在改稿中解决的。

**中优先级（重大分歧）**：模型间推荐差距大（比如一个 Accept 一个 Reject），或某条意见只有部分模型提出但论据充分。值得单独讨论，用户自己判断是否采纳。

**低优先级（单一模型独有）**：只有一个模型提到且其他模型未反对。仅供参考。

对每条高/中优先级意见，生成统一的 meta-description：
- 问题描述（去重后的简洁版）
- 哪些模型提到
- 被引用的具体章节/段落
- 意见背后的理论依据

输出 `review/stage_3_aggregated_report.md`，含聚合推荐（把各模型推荐投票 + 计算共识推荐）。

## Phase 4: 改稿 Todo 清单

把 stage_3 里的高、中优先级意见转成可执行 action items：

每条 todo 含：
- 问题（原文引用）
- 修改类型：`补实验` / `改写作` / `加诊断` / `承认限制` / `重新定位贡献` / `补文献`
- 建议的改法（具体到段落）
- 预估工作量（小 / 中 / 大）
- 是否影响主结论（是 / 否）

若某意见要求补实验（比如补一个 robustness），建议用户手动跳转到 `/run-experiment`，但不自动发起。本工作流不擅自补跑回归。

若某意见无法通过改稿解决（真正的研究设计限制），建议在 Limitation 章节明确承认。

输出 `review/stage_4_revision_todo.md`，按优先级排序。

## File Contract

- `review/stage_1_paper_summary.md`
- `review/stage_2_referee_reports/{model_id}.md`（N 份，N 为选中模型数；both 模式下为 2N）
- `review/stage_3_aggregated_report.md`
- `review/stage_4_revision_todo.md`

## Related Skills

- `paper-reviewer`: 单个模型的 referee report 生成（被 Phase 2 并行调度多次）

## Global Rules

- 不得替用户改稿，只输出意见和建议
- 不得擅自补跑回归或实验
- 评审结论（推荐）必须基于多模型聚合，不得让单一模型决定
- 若用户只配置了 1 个评审模型，停下来提示用户"至少需要 2 个不同模型形成对抗"，让用户补配
