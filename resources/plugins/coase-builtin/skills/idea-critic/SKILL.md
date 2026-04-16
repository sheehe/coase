---
name: idea-critic
description: 经管研究多模型对抗评分 / critique 工具。对应 full_research_workflow Step 2 / 3 / 5 / 9 / 11。用户在设置页选定"评审模型组"（多 provider），本 skill 并行调度所有选中的模型对假设 / 方案 / 检验结果做独立评审，聚合后输出共识 + 分歧。四个模式：discuss（假设研究价值讨论）、score（1-10 评分 + threshold 过滤）、design-critique（方案批评）、result-critique（结果批评）。
---

## Workflow Notes

- 被 `full_research_workflow` 在多个 step 复用。用户感知上只看到"多模型对抗"，不需要知道底层是 SDK 直连还是 MCP（实际上是直接调用用户配置的多个 provider）。
- 至少需要 2 个不同 provider 的模型配置。若用户只配置了 1 个，停下来提示用户"对抗评分至少需要 2 个不同模型"，让用户补配。
- 本 skill 是纯评审工具，不提交最终决定。最终决定由用户（human-in-the-loop）或 `significance-verdict`（结果判定）给出。

## Invocation Modes

### Mode 1: `discuss`（对应 Step 2）

**输入**：`idea/stage_1_hypotheses.md` 中的 X 个假设。

**任务**：对每个假设，让每个选中的模型独立分析其研究价值。可搜索文献（若 provider 支持），判断：

- 是否回应了某个文献 tension / paradox
- 是否有新颖性
- 是否与现有参考期刊（SMJ / OrgSci / AMJ / JIBS / SEJ / JBV）的风格匹配
- 是否存在已有文献已经充分回答

每轮每个模型出一份分析报告。如此循环几轮（默认 `critique_rounds = 2`），每轮后让上一轮的模型读到其他模型的意见，再次修正自己的分析，直到每个假设都较好（所有模型共识比较收敛）或达到轮数上限。

**输出**：`idea/stage_2_critique_rounds.md`，每轮追加，含每个模型每个假设的分析 + 本轮共识摘要。

### Mode 2: `score`（对应 Step 3）

**输入**：`idea/stage_1_hypotheses.md` + `idea/stage_2_critique_rounds.md`（若 Mode 1 已跑过）。

**任务**：每个模型独立给每个假设 1-10 分，评分维度（每个维度 1-10，最终总分为加权平均）：

- **研究价值 / 新颖性**（权重 0.3）
- **数据可行性**（权重 0.25）
- **识别可信度**（权重 0.25）
- **参考期刊适配度**（权重 0.2）

聚合：所有模型的加权总分再平均，得到每个假设的最终 score。

**Threshold 过滤**：

- 高于 `score_threshold`（默认 7）的假设 → 按分数从高到低排列，进入"通过名单"
- 低于 threshold 的假设 → 进入"补充讨论"阶段，给它 `rescue_rounds`（默认 2）轮机会修改后重新打分。若仍不过线，进入 `idea/eliminated_pool.md` 供未来回避。

**Human-in-the-loop（默认开启）**：在 threshold 过滤后、进入 Step 4 前，把通过名单给用户确认。用户可：

- 放行首选假设
- 跳过首选，选第二
- 把某个被淘汰的假设手动召回

**输出**：`idea/stage_3_ranked.md`，含所有假设的逐模型评分、聚合分数、通过 / 淘汰状态。同时更新 `idea/eliminated_pool.md`。

### Mode 3: `design-critique`（对应 Step 5 + Step 9）

**输入**：`planner/stage_7_baseline_design.md`（Step 5 时）或 `executor/stage_2_explanation_robustness.md` 中的 Mechanism / Robustness 方案（Step 9 时）。

**任务**：每个模型独立审查方案，重点批评：

- 样本选择是否合理（是否有选择偏差）
- 变量选择是否能 rule out alternative story
- 识别策略是否成立（平行趋势 / 外生性 / 连续性等假设）
- FE / cluster 是否匹配数据结构
- 是否有未考虑的竞争性解释

输出：Accept / Modify / Reject + 具体修改建议。

**聚合规则**：

- 所有模型 Accept → 通过，进入执行
- 有模型 Reject → 必须采纳 Reject 理由中的关键点，回到 planner 重设计
- Modify 意见按"共识项 → 分歧项"排序，交给 agent 或 human 决定是否采纳

**输出**：追加到对应阶段文件的 `critique` 小节。

### Mode 4: `result-critique`（对应 Step 11）

**输入**：`executor/stage_2_explanation_robustness.md` 中的机制 / 异质性 / 稳健性结果。

**任务**：每个模型独立批评：

- 机制证据是否真的在支持机制，还是只是异质性
- 稳健性检验是否真的回应了 Phase 2 列出的 identification concern
- 有没有某个检验结果与 baseline 冲突却被粉饰
- 解释是否过度（mechanism-supporting 写成 mechanism proof）

输出：对每个检验给出"Convincing / Suggestive / Not convincing"标签 + 理由。

**输出**：`verdict/stage_2_extended_verdict.md`，给出：

- 每个检验的聚合标签
- 建议保留进正文的检验
- 建议降为附录或删除的检验
- 建议 executor_workflow Phase 5 补跑或修正的检验

## 多模型并行调度（技术说明）

本 skill 通过调用 **`mcp__coase-critic-panel__invoke`** 这个 tool 完成多模型对抗评分。该 tool 由 Coase 内建的 in-process MCP server 暴露，会读取用户在"设置 → 评审模型组"里配置的 provider 列表，并行向每个 provider 发起裸 Anthropic Messages API 调用（不走完整 Agent SDK CLI，成本低、速度快），返回聚合后的多模型独立回答。

### Tool 签名

```
mcp__coase-critic-panel__invoke({
  user_prompt: string,      // 发给每个评审模型的用户消息
  system_prompt?: string,   // 可选：给评审模型设定角色（例如"经管审稿人"）
  max_tokens?: number,      // 默认 4096
  timeout_ms?: number,      // 默认 60000
})
```

### 使用示范

每个 mode（discuss / score / design-critique / result-critique）按以下套路：

1. **准备 user_prompt**：按当前 mode 的评分维度 / critique 任务构造 prompt 模板，把待评审的 idea / 方案 / 结果作为 context 塞进去
2. **准备 system_prompt**：根据 mode 给评审角色定位（例如 "你是 SMJ 的经管审稿人，请严苛审查以下 idea"）
3. **调用 tool**：`mcp__coase-critic-panel__invoke({ user_prompt, system_prompt })`
4. **解析返回**：tool 返回 markdown 格式的聚合结果，含每个模型的独立回答
5. **聚合**：你（agent）自己做共识 / 分歧分析，按本 skill 各 mode 要求的输出格式整理

### 前置检查

调用 tool 前：
- 如果 `mcp__coase-critic-panel__invoke` 返回 `isError=true` 且提示"评审模型组尚未配置"，停下来告诉用户去设置页勾选至少 2 个不同 provider，不要继续
- 如果返回的 entries 里有多个 `ok=false` 的条目，在聚合时明确标注哪些模型失败 / 超时，剩余模型是否够形成对抗（< 2 则停下）

## 必须遵守的原则

1. 评分和 critique 必须来自真正独立的模型调用（不允许单一模型 self-critique 后聚合）
2. 至少 2 个不同 provider，建议 3-4 个，上限 6 个（token 成本考虑）
3. 聚合时必须展示每个模型的原始意见，不能只给聚合结果（便于用户理解分歧来源）
4. 对抗的目标是**让假设 / 方案 / 结果变得更好**，不是单纯否决
5. 循环轮数不得超过上限（critique_rounds max 3, rescue_rounds max 3），防止死循环

## Output Files

- Mode 1: `idea/stage_2_critique_rounds.md`
- Mode 2: `idea/stage_3_ranked.md` + 更新 `idea/eliminated_pool.md`
- Mode 3: 追加到 `planner/stage_7_baseline_design.md` 或 `executor/stage_2_explanation_robustness.md`
- Mode 4: `verdict/stage_2_extended_verdict.md`
