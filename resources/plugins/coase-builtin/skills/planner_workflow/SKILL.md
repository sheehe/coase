---
name: planner_workflow
description: 规划 workflow，对应 /idea-discovery。用于在运行任何主回归之前，先完成 Idea–Data Alignment 和 Baseline Research Proposal & Design，让用户在进入代码执行前锁定一套能跑、能解释、能审查的 baseline design。
---

## Workflow Notes

- 执行本 skill 前，先阅读 `references/role-rules.md`。
- 若角色规则与正文 phase 细节冲突，以 `references/role-rules.md` 的硬约束优先。
- 当前版本直接基于 Coase 当前会话中的用户需求、附件、工作区文件和已有资料执行。

---

## 研究目的适配

在开始任何 Phase 前，先从上下文中读取 **research_purpose** 字段，它决定了方法学基调。
Phase 3 评分权重、Phase 4 质量关卡阈值、Phase 7 Baseline Memo 的要求：

| 目的 | 方法学要求 | 不可做 |
|------|----------|-------|
| **causal** | 必须挑选 DID / Event Study / IV / RDD / PSM 之一作为识别策略；明确识别假设；至少预留 2 条防线（如 placebo + pre-trend）| 用无识别策略的普通回归冒充因果识别 |
| **associative** | 根据 outcome 类型选合适回归族（OLS / Logit / Probit / Poisson 等）+ 固定效应或聚类标准误；必须在 Phase 7 声明 "本研究为关联性研究，结果不支持因果解读"；假设表述用"关联/相关"而非"影响/导致" | 使用"X 对 Y 的影响"等因果措辞 |

**causal 项目的数据不支持策略时**：必须回到 Phase 1 **调整研究问题**（如改变 outcome、
缩小样本、寻找替代 treatment），而不是降级为 associative。用户选 causal 就是期望因果结论，
偷偷降级等于违约。

**associative 项目的方法严谨性评分**：不以"是否有因果识别"为评分依据，而以"是否如实
标注研究性质、是否讨论共线性和反向因果作为边界、是否有关联性稳健性检验（不同子样本/
不同 FE/不同控制变量组合下关联方向是否稳定）"为准。

---

## 文件落盘契约（每个 Phase 必须落盘）

**下游 Reviewer 和 Executor 按固定文件名读取你的输出**。每个 Phase 结束前**必须**写入对应文件，否则等同于没做。

| Phase | 文件 | 关键字段 |
|------|------|---------|
| 1 | `planner/stage_1_alignment.md` | Data snapshot, Alignment, Feasible starts, GO/NO-GO |
| 2 | `planner/stage_2_literature.md` | 关键文献表, Gap, 2-3 研究方向 |
| 3 | `planner/stage_3_hypothesis.md` | 候选假设 + 八维度评分 + 综合分 + 最终选择 |
| 4 | `planner/stage_4_quality_gate.md` | 信号, 决策, 迭代记录（回溯时追加不覆盖） |
| 5 | `planner/stage_5_variable_mapping.md` | Outcome/X/Controls/FE/Cluster 映射 |
| 6 | `planner/stage_6_data_support.md` | 数据结构, 样本量, 缺失, 支撑程度 |
| 7 | `planner/stage_7_baseline_design.md` | **Executor 的唯一输入，必须写**；Baseline equation + Core design 五要素 |
| 8 | `planner/stage_8_descriptive_snapshot.md` | 描述性统计表, Visuals, Confirmation |

**硬性规则**：
- 每个 Phase 的"输出"段说的文件名就是以上文件名，，一字不差
- 禁止改名（`baseline.md`、`plan.md`、`final.md` 都不行）
- 禁止写到 `planner/` 之外的路径
- 长内容（文献 abstract、回归结果、表格）**只落盘不粘回对话**，保留结论和文件位置即可
- 如果某个 Phase 因数据不足或回溯被跳过，**仍然要写一个占位文件**，文件内容说明"跳过的原因 + status: skipped"
---


### 读取参考文献（若有）


步骤：
1. 查看上下文"可用参考文献（references/）"列表，确认有哪些 PDF 文件
2. 对每个 PDF派子agent去读取
3. 提取每篇文献的：核心发现、识别策略（DID/IV/RD 等）、使用的数据与关键变量
4. 将提取结果作为 Phase 2 文献搜索的先验基础——优先验证这些策略的适用性，而非重新搜索

### 读取研究方案文档（若有）

步骤：
1. 查看上下文"可用研究方案文档（plans/）"列表，确认有哪些文件
2. 对每个文件读取内容
3. 理解用户已有的：研究问题、核心假设、变量设计、预期识别策略
4. 以此作为 Phase 1 数据对齐的起点（重点确认方案与数据的匹配程度，而非从零生成方向）

---

### Phase 1: Idea–Data Alignment（PDF Phase 1）

**目标**：帮助用户在研究想法和已有数据之间建立可执行的初步匹配。

原则：
- 优先从数据可行性出发，而不是从理论创新最大化出发，综合两方面。
- 若用户只有模糊想法，可基于数据条件提出1-3个可执行研究问题候选，不得无限扩展
- 只能提出受当前数据支持的问题
- 若 proposal 与数据不匹配，优先提出最小修改方案

推荐方法（数据探索协议，按顺序执行）：

**步骤 1（必须）**：对每个数据文件
- 获取全部列名和变量标签（Stata DTA 的 variable label 含业务含义，如 b001→营业收入）
- 理解数据集的完整变量列表后，才能进行后续分析

**步骤 2（必须）**：识别结构性维度并全量扫描
- 识别疑似实体ID列（列名含 id/code/stkcd/firmid/企业 等，或字符型/高基数整数）
  → 获得**精确**实体数量（不能靠估算，这决定研究样本规模）
- 识别疑似时间列（列名含 year/date/time/period/年/月 等，或取值在 1990-2040 的整数）
  → 获得完整时间跨度和时间粒度（决定面板长度）

**步骤 3（按需）**：对研究核心变量调用
- 了解变量分布、缺失率，判断是否满足识别假设
- 如数据字典已存在，可先补充语义信息

**在完成步骤 1 和步骤 2 之前，禁止进入研究设计阶段。**

**输出格式**：
A. 数据 snapshot（Id数量、观测值数量、时间维度、样本范围、主要变量、明显限制）
B. Alignment Assessment（matches well/partially/poorly，原因）
C. Feasible starting points（最多3个，每个含研究问题、数据支持理由、候选 outcome/自变量、可能 baseline design、主要风险）
D. Recommendation（Best starting point、原因、下一步需确认什么）
E. GO/NO-GO DECISION

**落盘（必须）**：调用写文件工具把 A-E 全部写入。

---

### Phase 2: 方向探索（文献搜索与引文网络扩展）

**目标**：基于 Idea-Data Alignment 结果，确定可行的研究方向。

推荐方法：
- 根据研究方向提炼2-3个搜索关键词组合
- 搜索相关文献（每组关键词5-10篇）
- 对最相关的2-3篇论文扩展引文网络（深度1层）
- 综合分析：现有研究主要发现、研究空白（Gap）、可用识别策略、与数据的契合度

**输出**：关键文献列表（作者、年份、标题、核心发现、识别策略）、研究空白分析、推荐2-3个研究方向（按可行性排序）、每个方向适合的识别策略

**落盘（必须）**：把文献表 + Gap + 方向全部写入。文献的完整 abstract **只落盘不粘对话**。

---

### Phase 3: 假设生成与精炼（Self-Debate）

**目标**：生成2-3个研究假设，通过自我辩论机制筛选最优假设。

推荐方法：
- 提出2-3个候选假设，每个包括：因果关系表述（X→Y，机制）、识别策略、预期效应方向和大小
- 对每个假设：先提出支持论点，再自己提出反驳，最后给出综合判断

**六维度评估**（每项1-10分，与 Reviewer Mode A 统一）：

| 维度 | 评估要点 |
|------|---------|
| 1. 理论贡献 | 相对于最相关的已有研究，边际贡献在哪里？是否填补了真正的 Gap？ |
| 2. 方法严谨性 | **causal**: 识别策略是否可信？核心识别假设是否可检验？防线（placebo/pre-trend/falsification）是否充分？<br>**associative**: 是否如实标注关联性质？共线性和反向因果是否作为边界讨论？关联性稳健性检验方案是否合理？ |
| 3. 数据支撑 | 关键变量是否存在、变异是否充分、样本量和面板结构是否足够？ |
| 4. 识别/关联说服力 | **causal**: 识别假设的外部性来源是否清晰（如政策冲击的外生性、工具变量的排他性）？<br>**associative**: 关联是否可解释？是否说明了共线性结构和主要替代解释？ |
| 5. 发表潜力 | 对标哪个层次的期刊？结合当前热度和竞争评估 |
| 6. 可行性 | 在当前数据和工具条件下，能否在合理时间内完成？ |

**加权评分公式**（按 research_purpose 分化）：

| 维度 | causal 权重 | associative 权重 |
|------|:---------:|:---------------:|
| 方法严谨性 | 30% | 20% |
| 理论贡献 | 20% | 25% |
| 数据支撑 | 20% | 25% |
| 识别/关联说服力 | 15% | 15% |
| 发表潜力 | 10% | 10% |
| 可行性 | 5% | 5% |

`综合分 = 方法严谨性×w1 + 理论贡献×w2 + 数据支撑×w3 + 识别/关联说服力×w4 + 发表潜力×w5 + 可行性×w6`

- 选出最优假设，给出选择理由

**输出**：候选假设清单（含八维度评分及加权综合分）、自我辩论记录、最终选择的假设及理由、该假设的研究设计框架。

**落盘（必须）**：注意是 `planner/stage_3_hypothesis.md`，不要漏了 `planner/` 前缀。

---

### Phase 4: Idea Quality Gate（迭代决策关卡）

**目标**：对 Phase 3 选出的最优假设做质量裁决，决定是直接推进还是回溯改进。这是防止低质量 idea 进入执行阶段的最后防线。

**约束**：最多触发 **2 次回溯**（iteration_count ≤ 2）。如果 2 次回溯后仍不达标，必须携带诊断报告进入 Phase 4，由后续 Reviewer 和 HITL 环节最终裁决。

#### 步骤 1：计算质量信号

对 Phase 3 选出的最优假设，按 **research_purpose** 分别计算质量信号：

**causal 项目**：

| 信号 | 触发条件 | 含义 |
|------|---------|------|
| **RED: 硬伤** | 方法严谨性 < 5 或 识别/关联说服力 < 5 | 识别策略不可信或无可行因果策略，继续推进风险极高 |
| **YELLOW: 短板** | 综合加权分 < 6.0 | 整体质量不足，但无单一致命缺陷 |
| **ORANGE: 数据不支持** | 数据支撑 < 5 | 数据不支持当前因果策略，应调整 outcome/treatment 或研究问题 |
| **GREEN: 通过** | 以上均不触发 | 质量合格，直接进入 Phase 5 |

**associative 项目**（阈值整体低 0.5 分，因为关联性研究本身就不追求顶刊识别严谨性）：

| 信号 | 触发条件 | 含义 |
|------|---------|------|
| **RED: 硬伤** | 理论贡献 < 4 或 数据支撑 < 5 | 关联性研究的核心卖点是"故事 + 数据"，这两项不能塌 |
| **YELLOW: 短板** | 综合加权分 < 5.5 | 整体质量不足 |
| **ORANGE: 定位模糊** | 方法严谨性 < 4（对 associative 而言意味着"未声明为关联性研究"或"未讨论共线性/反向因果"）| 性质声明不清晰，容易被审稿人误解为"伪装因果" |
| **GREEN: 通过** | 以上均不触发 | 质量合格，直接进入 Phase 5 |

**重要**：associative 项目的"方法严谨性 < 5"**不再自动触发 RED**——关联性研究本就不做
因果识别，不应该被"没有 DID/IV"这条扣到致命分。只有当它连"如实声明 + 讨论共线性/反向因果"
都没做到时才算方法学硬伤。

#### 步骤 2：路由决策

```
GREEN → 直接进入 Phase 5

RED/YELLOW/ORANGE 且 iteration_count < 2 → 进入步骤 3（诊断回溯）

RED/YELLOW/ORANGE 且 iteration_count = 2 → 生成「迭代耗尽报告」，
  记录：尝试过的方向、每轮改进及评分变化、剩余最优假设及其已知风险。
  将报告附加到 stage_4_quality_gate.md 末尾，带着风险标注进入 Phase 5。
```

#### 步骤 3：诊断回溯（Diagnostic Backtrack）

根据**最弱维度**确定回溯目标（下表对 causal 和 associative 通用，但具体"行动"需按 research_purpose 调整）：

| 最弱维度 | 诊断 | 回溯目标 | 具体行动 |
|---------|------|---------|---------|
| 数据支撑 < 5 | 变量不足或数据结构不匹配 | **回到 Phase 1** | 重新审视数据，尝试不同的 outcome/treatment 变量组合，或放宽样本限制条件。**causal 项目若所有因果策略都不可行，必须调整研究问题，不得降级为 associative** |
| 理论贡献 < 5 | 与已有文献区分度不够 | **回到 Phase 2** | 扩大文献搜索范围（增加跨领域关键词、扩展2层引文网络），寻找新的 Gap |
| 方法严谨性 < 5（causal）| 识别策略不可信 | **回到 Phase 2** | 搜索同类问题的替代识别策略（如 DID 不可行→尝试 IV 或 RDD），重点搜索方法论文献 |
| 方法严谨性 < 4（associative）| 未如实声明关联性质，或未讨论共线性/反向因果 | **Phase 3 内修正** | 在假设表述中把"影响"改为"关联"；增加共线性讨论（VIF）、反向因果讨论、关联性稳健性检验方案 |
| 识别/关联说服力 < 5 | **causal**: 识别假设的外生性来源不清晰；**associative**: 关联方向不可解释 | **Phase 3 内修正** | causal: 补充识别假设讨论（如 IV 的排他性、DID 的平行趋势）；associative: 补充共线性和主要替代解释讨论 |

**回溯执行规则**：
- 每次回溯必须在 `stage_4_quality_gate.md` 中追加一条 `## Iteration {n}` 记录，包含：触发信号、诊断结论、回溯目标、本轮改变了什么
- 回溯后重新执行目标 Phase，**只处理诊断指出的问题**，不重做已通过的部分
- 回溯完成后重新进入 Phase 3 生成/修正假设，重新评分，再过一次 Quality Gate

#### 步骤 4：记录迭代轨迹

无论是否触发回溯，都写入（完整路径，含 `planner/` 前缀）。**回溯时追加 Iteration 记录，不覆盖历史**（先读出现有内容，拼接后再写）：

```markdown
## Quality Gate 结果
- 综合加权分: {score}/10
- 触发信号: {GREEN/RED/YELLOW/ORANGE}
- 迭代次数: {iteration_count}/2
- 决策: {PASS → Phase 5 / BACKTRACK → Phase {n} / EXHAUST → Phase 5 with risk flags}
```

若触发了回溯，额外记录：
```markdown
### Iteration {n} 记录
- 触发原因: {最弱维度及得分}
- 回溯目标: Phase {n}
- 本轮变更: {具体做了什么改变}
- 改进后评分: {新的八维度评分及综合分}
- 评分变化: {综合分从 X.X → Y.Y，变化 ±Z.Z}
```

---

### Phase 5: Variable Mapping Confirmation（PDF Phase 2 Step 1）

**目标**：确认研究设计和数据之间的变量映射关系是否成立。

推荐方法：
- 识别并确认：因变量、核心自变量、主要控制变量、固定效应变量、聚类变量、需进一步构造的变量
- 对每类变量判断：是否存在（用 `check_variable_exists` 验证）、定义是否清晰、是否需要转换或构造、是否有测量或缺失问题
- 若变量映射不清楚，必须明确指出，优先提出最小修正方案，不得直接继续

**输出格式**：
A. Variable Mapping Confirmation（Outcome、Key explanatory variable、Main controls、Fixed effects candidates、Cluster candidates、Variables needing construction、Mapping issues to resolve）

**落盘（必须）**

---

### Phase 6: Data Support Check（PDF Phase 2 Step 2）

**目标**：确认完整数据是否支持当前 baseline design。

推荐方法：基于 `get_dataset_columns` + `scan_column(mode="full")` 核对数据结构，`scan_column(mode="sample")` 核对关键变量分布与缺失率，检查：
- 样本量是否足以支持当前模型
- 数据结构是否与模型一致（横截面/面板/时序/多层级）
- 时间维度是否满足设计需求
- 关键变量是否有足够变化
- 缺失值是否显著影响 baseline
- 是否存在明显异常值、重复观测或变量编码问题
- 若涉及 treatment timing/事件时间/政策冲击，确认关键时间变量可用

若数据不能支持当前设计：明确指出原因、提出最小必要调整、暂不进入模型锁定

**输出格式**：
B. Data Support Check（数据结构、可用样本量、时间覆盖、关键变量变化、缺失值担忧、异常值担忧、支持程度: Supported/Partially/Not supported、若不完全支持则给出最小调整方案）

**落盘（必须）**

---

### Phase 7: Baseline Design Lock（PDF Phase 2 Step 3）

**目标**：在变量映射和数据支持性都基本成立后，锁定主模型。

推荐方法：
- 给出 baseline equation 或清晰的模型描述
- 明确列出：因变量、核心自变量、控制变量、固定效应、标准误处理、模型类型（OLS/LOGIT/POISSON 等）
- 明确识别/关联策略（按 research_purpose 分）：
  - **causal**: 必须指定 DID/Event Study/IV/RDD/PSM 之一，并明确识别假设（如 DID 的平行趋势、IV 的排他性）
  - **associative**: 明确声明为关联性研究，列出关联方向的理论机制和主要共线性来源
- 说明为什么选择这个 baseline
- 说明当前 baseline 可以支持什么、不能支持什么
- 给出后续扩展分析的候选方向（稳健性检验、异质性分析；causal 项目额外包含机制检验）

**输出格式**：
C. Baseline Plan Memo
  - Main model 一句话描述
  - Core design 五要素
  - **Research purpose**: causal 或 associative（必填，与上下文 research_purpose 一致）
  - Why this baseline 2-4 句
  - **Key identification assumption**（causal 项目必填；associative 项目填"N/A，本研究为关联性研究"）
  - **Interpretation boundary**（associative 项目必须声明"本研究结果为关联性发现，
    不支持因果解读；假设表述使用'关联/相关'，不使用'影响/导致'"；causal 项目说明外部有效性边界）
  - Candidate next-step checks

**落盘（必须、不可跳过）**写入完整 baseline memo。

**这一步是 Executor 的唯一输入文件**，Executor 会读取；如果你不写这个文件，整个后续流水线直接停摆。即使当前数据只 "partially supported"、即使你还拿不定主意，**也必须写一份 draft 版本**并在文件头部标注：

```
---
status: draft | locked | partial
open_questions: [...]
---
```

---

### Phase 8: Descriptive Snapshot（PDF Phase 2 Step 4）

**目标**：补充支持决策所需的最小描述性统计信息。注意：只提供支持决策的最小 descriptives，不要输出过多图表。

推荐方法：
- 对每个核心变量获取分布统计量（均值/分位数/缺失率）
- 给出描述性统计表，至少包含因变量、核心自变量、关键控制变量
- 在必要时提供 1-2 个最有帮助的图表建议

**输出格式**：
D. Descriptive Snapshot（描述性统计表、Helpful visuals、What the descriptives suggest 不超过5句）
E. User Confirmation（Proceed to Run Baseline / Revise Variable Mapping / Revise Baseline Design / Need More Data）

**落盘（必须）**
---

## 最终自检（所有 Phase 结束后执行）

在给出最终摘要**之前**，核对以下 8 个文件是否都已生成：

- [ ] `planner/stage_1_alignment.md`
- [ ] `planner/stage_2_literature.md`
- [ ] `planner/stage_3_hypothesis.md`
- [ ] `planner/stage_4_quality_gate.md`
- [ ] `planner/stage_5_variable_mapping.md`
- [ ] `planner/stage_6_data_support.md`
- [ ] `planner/stage_7_baseline_design.md` ← 最关键
- [ ] `planner/stage_8_descriptive_snapshot.md`

任何一个缺失 → **立刻补写**再输出最终摘要。如果确实某 Phase 被合理跳过，也要写占位文件，文件内容说明跳过原因 + `status: skipped`。

完成核对后，提供一份完整的研究计划摘要（不超过5000字），涵盖：研究问题、假设、识别策略、基准方程、变量列表、稳健性检验计划。这份摘要将作为 Planner 的最终输出，传递给 Reviewer 审阅。
