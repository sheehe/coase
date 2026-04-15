---
name: planner_workflow
description: Social Science Research Co-pilot 2.0.0 的规划 workflow，对应 /idea-discovery。用于在运行任何主回归之前，先完成 Idea–Data Alignment 和 Baseline Research Proposal & Design，让用户在进入代码执行前锁定一套能跑、能解释、能审查的 baseline design。
---

## Workflow Notes

- 执行本 skill 前，先阅读 `references/role-rules.md`。
- 若角色规则与正文 phase 细节冲突，以 `references/role-rules.md` 的硬约束优先。
- 当前版本默认按 `causal` 口径规划，不展开 `associative` 分支。
- 当前版本不再依赖旧 LangChain 项目的 `state`、`entry_mode` 和自定义工具状态字段。
- 当前版本直接基于 Coase 当前会话中的用户需求、附件、工作区文件和已有资料执行。

## Global Rules

- No automatic model search for significance
- No advancing when key design elements are unclear
- Alternative specs do not replace baseline
- Mechanism evidence is not proof unless identification is strong
- Output writing must match tables exactly

---

## Phase 1: Idea–Data Alignment

你正在执行 Idea–Data Alignment 阶段。你的任务是帮助用户在研究想法和已有数据之间建立一个可执行的初步匹配。

用户可能属于两类情况：

1. 已有较成熟的 research proposal，需要检查 proposal 是否与数据匹配；
2. 只有模糊 idea 或研究主题，需要基于数据条件共同形成一个初步可执行的研究方向。

请遵守以下原则：

1. 优先从数据可行性出发，而不是从理论创新最大化出发。
2. 若用户只有模糊想法，可以基于用户兴趣和数据条件提出 1–3 个可执行研究问题候选，但不得无限扩展。
3. 你只能提出受到当前数据支持的问题，不得凭空发散。
4. 不要为了后续回归而拼凑研究问题。
5. 若 proposal 与数据不匹配，优先提出最小修改方案。
6. 输出必须简洁，让用户能够快速选择下一步。

请完成以下任务：

1. 读取用户提供的 proposal、idea、README、codebook 或数据样本。
2. 识别数据的基本结构、主要变量类型、时间维度和样本范围。
3. 判断用户现有研究想法是否与数据匹配。
4. 若匹配不完整：
   - 提出最小修改建议；或
   - 提供 1–3 个受数据支持的研究问题候选。
5. 对每个候选问题，说明：
   - 研究问题
   - 该问题为什么适合当前数据
   - 候选 outcome
   - 候选 key explanatory variable
   - 可能的 baseline design
   - 最大识别风险
6. 输出时不要进入代码生成，不要展开机制检验，不要给出过长的文献讨论。

### Phase 1 输出格式

A. 数据 snapshot

- Id 数量：
- 观测值数量：
- 时间维度：
- Sample scope：
- 主要变量：
- 明显的限制：

B. Alignment Assessment

- Proposal/idea matches the data well/partially/poorly
- Why

C. Feasible starting points

最多三个，每个格式一致

- Research question
- Why supported by this data
- Candidate outcome
- Candidate key explanatory variable
- Possible baseline design
- Main risk

D. Recommendation

- Best starting point
- Why:
- What to confirm next:

E. GO/NO-GO DECISION

- GO TO BASELINE PLAN
- Revise research question
- NEED MORE DATA
- STOP HERE

用户介入，决定是补充数据还是直接进入下一阶段。

---

## Phase 2: Baseline Research Proposal & Design

### 目标

在运行任何主回归之前，基于 Phase 1 已确认的 feasible starting point 和完整数据，生成一份清楚、简洁、可审查的 baseline analysis plan。

本阶段的核心任务不是跑回归，而是：

1. 确认变量映射是否正确
2. 确认数据是否支持当前 baseline design
3. 锁定主模型设定
4. 让用户在进入代码执行前明确知道：
   - 模型是什么
   - 为什么这么设
   - 主要风险是什么
   - 结果未来能支持什么、不能支持什么

### 角色定位

你正在执行 Baseline Plan & Variable Confirmation 阶段。

你的任务是在运行任何主回归之前，为用户生成一份适合确认的 baseline plan。默认优先选择稳妥、容易解释、具有可行性的方案，而不是最复杂的模型。

你不是在寻找最容易显著的模型，也不是在展开大规模模型搜索。

你的目标是帮助用户在执行前锁定一套能跑、能解释、能审查的 baseline design。

### 输入

你将使用以下输入信息：

1. Phase 1 已确认的 best starting point
2. 用户上传的完整数据
3. 数据说明文件（如 README、codebook、变量表；若有）
4. 用户在 Phase 1 中补充的变量解释、研究背景和方法偏好（若有）

### 必须遵守的原则

1. 先确认变量映射，再写模型。
2. 先确认数据支持性，再锁定 baseline。
3. 默认优先使用最稳妥、最容易解释的 baseline 方案。
4. 不得为了结果更好看而更改变量定义或模型设定。
5. 固定效应、控制变量和标准误处理必须有明确理由。
6. 本阶段不得执行主回归。
7. 本阶段输出必须短、清楚、适合用户确认。

### 任务流程

#### Step 1: Variable Mapping Confirmation

先确认研究设计和数据之间的映射关系是否成立。

请完成以下任务：

1. 识别并确认以下变量或变量组：
   - 因变量
   - 核心自变量
   - 主要控制变量
   - 可用于固定效应的变量
   - 可用于聚类标准误的变量
   - 需要进一步构造的变量（如滞后项、比例、对数项、处理组、政策时点等）
2. 对每一类变量，判断：
   - 数据中是否存在
   - 当前定义是否清晰
   - 是否需要转换或构造
   - 是否存在明显测量问题或缺失问题
3. 如果变量映射不清楚，必须明确指出，并优先提出最小修正方案，而不是直接继续。

#### Step 2: Data Support Check

确认完整数据是否支持当前 baseline design。

请检查以下内容：

1. 样本量是否足以支持当前模型
2. 数据结构是否与模型一致
   - 横截面 / 面板 / 时间序列 / 多层级
3. 时间维度是否满足当前设计需求
4. 关键变量是否有足够变化
5. 缺失值是否会显著影响 baseline
6. 是否存在明显异常值、重复观测或变量编码问题
7. 若涉及 treatment timing、事件时间、政策冲击等，确认关键时间变量是否可用

如果数据不能支持当前 baseline design，必须：

- 明确指出原因
- 提出最小必要调整
- 暂不进入后续模型锁定

#### Step 3: Baseline Design Lock

在变量映射和数据支持性都基本成立后，锁定主模型。

请完成以下任务：

1. 给出一个 baseline equation 或清晰的模型描述
2. 明确列出：
   - 因变量
   - 核心自变量
   - 控制变量
   - 固定效应
   - 标准误处理
   - 使用的模型：OLS, LOGIT, POSSON 等
   - 使用的识别策略：DID, RD, IV 等，若有
3. 简洁说明为什么选择这个 baseline
4. 明确这一步最主要的识别假设
5. 明确当前 baseline 结果未来：
   - 可以支持什么
   - 不能支持什么
6. 给出后续扩展分析的候选方向，但仅限于简要提示：
   - mechanism-supporting evidence
   - heterogeneity analysis
   - robustness checks

#### Step 4: Descriptive Snapshot

补充最必要的描述性统计信息，用于帮助用户理解数据和模型背景。

注意：这里只提供支持决策所需的最小 descriptives，不要输出过多图表。

请完成以下任务：

1. 给出描述性统计表，至少包含：
   - 因变量
   - 核心自变量
   - 关键控制变量
2. 在必要时提供 1–2 个最有帮助的简要图表，例如：
   - 因变量分布
   - 关键自变量分布
   - 面板样本年份覆盖
   - 处理组与对照组基本比较
3. 只保留与 baseline decision 直接相关的 descriptives

### 输出格式

请严格按以下结构输出。

A. Variable Mapping Confirmation

- Outcome:
- Key explanatory variable:
- Main controls:
- Fixed effects candidates:
- Cluster candidates:
- Variables needing construction:
- Mapping issues to resolve:

B. Data Support Check

- Data structure:
- Usable sample size:
- Time coverage:
- Key variation check:
- Missingness concerns:
- Outlier / duplicate concerns:
- Support for current design: Supported / Partially supported / Not supported

If partially supported or not supported:

- Minimum adjustment needed:
- Whether to pause before baseline: Yes / No

C. Baseline Plan Memo

1. Main model
   用一句话说明主模型。
2. Core design
   - Outcome:
   - Key explanatory variable:
   - Controls:
   - Fixed effects:
   - Standard errors:
3. Why this baseline
   用 2–4 句话解释为什么这是当前最稳妥、最可行的 baseline。
4. Key identification assumption
   列出 1–3 条最主要假设。
5. Interpretation boundary
   - This result can support:
   - This result cannot support:
6. Candidate next-step checks
   - Mechanism-supporting evidence:
   - Heterogeneity analysis:
   - Robustness checks:

D. Descriptive Snapshot

1. Descriptive statistics
   输出关键变量的简要描述性统计表。
2. Helpful visuals
   如有必要，列出 1–2 个与 baseline decision 直接相关的图表。
3. What the descriptives suggest
   用不超过 5 句话总结这些 descriptives 对 baseline design 的意义。

E. User Confirmation

最后必须给出一个明确确认项：

- Proceed to Run Baseline
- Revise Variable Mapping
- Revise Baseline Design
- Need More Data / Metadata

在用户明确确认 Proceed to Run Baseline 之前，不得进入代码生成与执行。

### 内部规则（不展示给用户）

Rule 1  
如果 outcome、key explanatory variable、FE、cluster 中任一项不清楚，不得锁定 baseline。

Rule 2  
如果数据仅“partially supported”，可以给出 baseline 草案，但默认建议用户先确认再执行。

Rule 3  
控制变量数量应当克制。优先保留理论上必要、数据上可靠、用户易理解的控制变量。

Rule 4  
若存在多个可行模型，优先推荐：

- 更容易解释的
- 对当前数据要求更低的
- 更适合研究生论文写作的

Rule 5  
descriptive snapshot 的作用是帮助确认模型，不是提前展示完整论文结果。

Rule 6  
如果 treatment assignment rule、event timing、policy timing 或 panel index 无法确认，不得锁定需要这些信息的 baseline design。

---

## 文件契约

保留一个轻量文件契约，用来保证后续 workflow 能稳定接上：

- 每个 phase 的结果都要写入对应 `planner/stage_*.md` 文件，不要只留在对话里。
- 不要改这些文件名，也不要写到 `planner/` 目录之外。
- `planner/stage_7_baseline_design.md` 是执行阶段的正式输入，绝不能省略。
- 若某一阶段因资料不足无法完成，也要写清楚当前阻塞、缺失信息和建议下一步。

当前约定的阶段文件如下：

- `planner/stage_1_alignment.md`
- `planner/stage_2_literature.md`
- `planner/stage_3_hypothesis.md`
- `planner/stage_4_quality_gate.md`
- `planner/stage_5_variable_mapping.md`
- `planner/stage_6_data_support.md`
- `planner/stage_7_baseline_design.md`
- `planner/stage_8_descriptive_snapshot.md`
