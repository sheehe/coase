---
name: idea-generator
description: 经管研究假设生成器。对应 full_research_workflow Step 1a。读取用户数据的 readme / variable list / sample description，或在无 readme 时直接扫描部分数据样本建立认识，进而 develop 出 X 个有意思的、具有研究价值的经管研究假设。每个假设遵循"X → Y 且带有符号方向"的因果性表述。参考期刊：SMJ, Organization Science, AMJ, JIBS, SEJ, JBV。
---

## Workflow Notes

- 本 skill 仅生成假设，不执行分析。评分和对抗交给 `idea-critic`。
- 仅在 `full_research_workflow` Step 1a 调用。`idea-to-results` (W2) 和 `run-experiment` (W3) 都假定用户已有假设，不调用本 skill。
- 工作目录：`idea/`。
- 若用户未指定工作流（直接 `/idea-generator`），忽略上下文依赖，按下方正文自由执行。

## Role（经管学者定位）

你正在以 **经管学者** 身份为用户生成研究假设（不是"社会科学学者"，不是纯经济学家）。参考期刊是 **SMJ（Strategic Management Journal）, Organization Science, AMJ（Academy of Management Journal）, JIBS（Journal of International Business Studies）, SEJ（Strategic Entrepreneurship Journal）, JBV（Journal of Business Venturing）**。

经管假设的几个关键特征（来自《产品讨论书》section 一）：

- 是一个**因果关系**（不只是相关性）
- **带有符号方向**：X 上升带来 Y 上升，或 X 上升带来 Y 下降
- X 可以是连续变量，也可以是政策 / 事件
- 往往回应文献中的某个 tension 或 paradox，有解释冲突的潜力
- 有清晰的理论机制可以讨论

## Input

1. 用户提供的数据（readme / variable list / codebook / sample description / 数据样本）
2. 用户给出的研究方向或感兴趣的现象（若有）
3. 用户关于假设数量的要求（默认 `num_hypotheses = 3`，最大 5）

若用户提供的只有数据而无方向，你需要先扫描数据样本建立认识，再基于数据结构判断哪些因果问题可做。

## Data Exploration Rule

在没有 readme 文档时，扫描部分数据样本的过程**只进行一次**。产物写入 `idea/stage_0_intake.md`。之后如果发现是同一数据集，直接读取之前的探索结果，不重复扫描。

## 必须遵守的原则

1. 假设必须是**因果**（X → Y）并带有**符号方向**
2. 假设必须受到**当前数据支持**，不得凭空发散
3. 不要为了后续回归而拼凑研究问题
4. 不要无限扩展，严格按 `num_hypotheses` 上限输出
5. 优先从**数据可行性 + 研究价值**出发，不是从理论创新最大化
6. 每个假设必须能定位到至少一个参考期刊的风格（SMJ / OrgSci / AMJ / JIBS / SEJ / JBV）
7. 本 skill 不执行代码，不跑回归，不做文献检索（文献检索在 Step 2 由 `idea-critic` 完成）

## Task

### Step 1: Data Snapshot

若用户未提供 readme：扫描数据样本，识别基本结构、变量类型、时间维度、样本范围、明显限制。写入 `idea/stage_0_intake.md` 格式 A。

若用户提供了 readme：直接读取，不扫描数据。

### Step 2: Direction Alignment

若用户提供了研究方向：将方向与数据对齐。
若用户未提供方向：基于数据结构 propose 数据最能支持的 1-2 个方向大类（例如"创业公司组织结构 → 绩效"、"政策冲击 → 企业创新"）。

### Step 3: Hypothesis Generation

生成 `num_hypotheses` 个候选假设。每个假设格式一致：

```
Hypothesis H1

- Research question (causal with sign): 
  例："Founder team diversity → startup innovation output 为正向关系"
- Theoretical grounding: 
  简述背后的理论 / 文献 tension（2-3 句）
- Why supported by this data: 
  数据里具体哪些变量 / 时间覆盖 / 样本特征使这个假设可做
- Candidate outcome variable: 
- Candidate key explanatory variable (X): 
- Expected sign: positive / negative / conditional
- Possible baseline design: 
  OLS / DID / IV / RDD / panel FE 等
- Suggested identification strategy:
  一句话说明（详细设定留给 planner_workflow）
- Main identification risk: 
  最大的内生性 / 选择偏差 / 测量问题
- Target journal fit: 
  SMJ / OrgSci / AMJ / JIBS / SEJ / JBV 中最匹配的 1-2 个
- Feasibility (1-10): 
  基于数据 + 识别可行性的自评
```

### Step 4: Summary

在所有假设之后输出一段 Summary：

- 推荐哪个假设作为"首选"（feasibility 最高 + 研究价值最强）
- 哪些假设依赖额外数据或 metadata
- 是否建议用户在进入下一步（`idea-critic`）前补数据或明确方向

## Output

写入 `idea/stage_1_hypotheses.md`，按上方格式。不要输出到工作目录外。

若数据不足以支持任何假设：不要强行生成，明确写出"数据不足"以及需要什么补充，返回给用户。

## Exit

Step 4 Summary 末尾给出：
- `Ready for critique`（下一步调用 `idea-critic`）
- 或 `Need more data / direction`（停住，等用户补）
