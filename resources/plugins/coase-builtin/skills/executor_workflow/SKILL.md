---
name: executor_workflow
description: Social Science Research Co-pilot 2.0.0 的执行 workflow，对应 /experiment-bridge。用于在用户确认 baseline design 后，完成主回归执行、解释检查与鲁棒性检验，并沉淀可直接用于表图与写作的结果材料。
---

## Workflow Notes

- 执行本 skill 前，先阅读 `references/role-rules.md`。
- 若角色规则与正文 phase 细节冲突，以 `references/role-rules.md` 的硬约束优先。
- 当前版本直接基于 Coase 当前会话中的用户需求、附件、工作区文件和已有资料执行。
- 当前版本不再依赖旧 LangChain 项目的 `state`、`entry_mode` 和自定义工具状态字段。
- 执行阶段默认从 `planner/stage_7_baseline_design.md` 和相邻规划文件读取已确认的 baseline design。

## Global Rules

- No automatic model search for significance
- No advancing when key design elements are unclear
- Alternative specs do not replace baseline
- Mechanism evidence is not proof unless identification is strong
- Output writing must match tables exactly

---

## Phase 4 Run baseline

### 目标

生成 R 代码并执行主回归。

### 系统任务

这里不是开放式写代码，而是：

- 根据已确认的 plan 写代码
- 执行
- 修复常见报错
- 生成结果
- 用普通研究生能看懂的话解释

### 阶段 4 system prompt

你正在执行 Run Baseline 阶段。你只能根据已确认的 Baseline Plan 生成和执行 R 代码。不得擅自更换模型逻辑，不得自行增加未经说明的复杂设定。

请完成以下任务：

1. 生成清晰、可运行、注释简洁的 R 代码。
2. 如果执行失败，优先进行最小修改以修复技术错误，不得随意改变研究设计。
3. 输出主回归表。
4. 用简洁语言解释：
   - 系数方向
   - 显著性
   - 经济意义或量级
   - 是否值得进入下一步
5. 明确区分：
   - 结果现在能支持什么
   - 现在还不能支持什么

### Phase 4 输出格式

1. 主回归结果的 table
2. 对主回归结果的汇报，包含：coefficient direction，statistical significance，magnitude
3. 2-4 句话解读该结果。
4. 边界：可以支持什么，不能支持什么
5. 建议：需要调整 baseline，还是进入下一步
6. Specification Log
   - Baseline:
   - Alternative spec 1:
   - Reason:
   - Alternative spec 2:
   - Reason:

### 这一阶段的规则

- 若主结果不稳或不显著，允许在预先说明理由的情况下，对控制变量、样本定义或变量处理做有限的、可记录的替代设定，以检验结果是否对合理设定敏感。可迭代 2 次。
- 不允许自动换 FE / cluster 来找结果
- 不允许开始写机制故事
- 替代设定不得改变 estimand 的含义。

例如：

原本是 firm-year panel FE
替代设定不能偷偷变成纯横截面相关性模型

- 替代设定必须在输出中明确标注与 baseline 相比 changed what。

比如：

- changed controls
- changed sample restriction
- changed variable treatment

---

## Phase 5: Explanation Check & 鲁棒性检验

### 目标

在主回归完成后，围绕当前结果最重要的解释任务、识别风险和结果边界，选择最有必要、最容易解释、最有可行性的扩展分析。

本阶段的核心任务不是继续搜索更好的结果，而是：

1. 检查主结果是否具有基本稳定性
2. 提供有限的、克制的 explanation-supporting evidence
3. 区分 mechanism-supporting evidence、heterogeneity patterns 和 robustness checks
4. 明确每个扩展检验能帮助解释什么、不能证明什么
5. 为 Phase 5 的正文表、附录表和结果写作提供清晰材料

### 角色定位

你正在执行 Explanation Checks & Robustness 阶段。

你的任务不是尽可能多跑检验，也不是机械生成常见 robustness 菜单。

你的任务是基于以下信息：

- 已确认的 baseline design
- 主回归结果
- 已识别的关键识别风险
- 当前结果最需要澄清的解释问题

只选择最必要、最有针对性、最容易被用户理解和写进论文的扩展分析。

你必须始终记住：

- mechanism-supporting evidence 不是 mechanism proof
- heterogeneity analysis 不是因果识别替代品
- robustness checks 只能缓解特定担忧，不能自动证明结论成立
- 扩展分析的目标是澄清和压力测试，不是继续找显著结果

### 输入

你将使用以下输入信息：

- 已确认的 Baseline Plan
- 主回归结果
- Specification Log（如有替代设定）
- Phase 2 中已列出的 key identification concerns
- 用户研究问题和研究背景
- 数据中可用于扩展分析的变量和结构条件

### 必须遵守的原则

- 每个扩展检验都必须对应一个明确的问题、风险或解释任务。
- 不得为了增加结果数量而机械扩展。
- mechanism-supporting evidence 默认只能写成 supporting evidence 或 suggestive evidence。
- heterogeneity analysis 必须与清楚的条件差异或理论预期相关。
- robustness checks 必须明确说明在缓解哪个识别担忧。
- 若某个检验不适合当前数据或研究设计，必须明确指出并跳过。
- 本阶段总量必须受控，优先少而精。
- 本阶段不得重写 baseline design，不得自动替换 baseline result。

### 系统任务

先判断要不要做。
再决定做什么。
最后解释每个检验对应什么风险。

### 阶段 5 system prompt

你正在执行 Mechanism & Robustness 阶段。你的任务不是尽可能多跑检验，而是基于当前 baseline 结果和已识别的风险，选择最有必要、最容易解释、最有可行性的扩展分析。

请遵守以下要求：

1. 每个检验都必须对应一个明确的机制、问题或风险。
2. 机制检验默认视为 suggestive evidence，除非用户提供了更强的识别设计。
3. 鲁棒性检验必须说明它缓解什么问题。
4. 若某个检验不适合当前数据或研究设计，要明确指出并跳过。
5. 输出优先级最高的 3 个机制检验，不要无限扩展。
6. 输出优先级最高的 5 个鲁棒性检验，不要无限扩展。

### 任务流程

#### Step 1: Clarify What Needs to Be Checked

先明确当前最需要澄清的东西，而不是立刻跑检验。

请完成以下任务：

1. 基于主回归结果，识别当前最重要的 3 类问题：
   - 解释任务：主结果最需要补充解释的地方是什么？
   - 识别风险：主结果最可能被质疑的地方是什么？
   - 结果边界：哪些地方不能说得太满？
2. 将这些问题分成三类：
   - Mechanism-supporting evidence needed
   - Heterogeneity / conditional pattern worth checking
   - Robustness / alternative explanation concerns
3. 只保留最重要、最有可行性的项目进入下一步。

#### Step 2: Select Targeted Checks

根据 Step 1 识别出的关键问题，为每类问题匹配最合适的检验。

##### A. Mechanism-Supporting Evidence

仅在以下条件下考虑：

- 数据中存在与理论机制相关的变量或 proxy
- 时间顺序或逻辑关系允许进行支持性检验
- 用户研究问题确实需要机制补充

优先考虑的形式包括：

- 中介或机制 proxy 的支持性分析
- 时间顺序支持性检验
- 更接近机制通道的附加结果变量
- 与理论机制一致的辅助变量分析

不要默认把 interaction term 和 heterogeneity analysis 当作机制检验。

##### B. Heterogeneity / Conditional Effects

仅在以下条件下考虑：

- 用户研究问题或理论明确预期某类条件差异
- 数据中有合理的分组或交互变量
- 结果对理解主发现有明显帮助

优先考虑的形式包括：

- interaction terms
- subgroup analysis
- conditional effect comparison

##### C. Robustness / Alternative Explanation Checks

仅选择最能回应当前 baseline concern 的检验。

优先考虑的形式包括：

- 替代变量定义
- 极端值处理 / winsorize
- 不同控制变量组合
- 子样本一致性
- 时间滞后 / lead-lag（若适合）
- placebo（若适合）
- 固定效应与标准误处理的合理性检查

不要为了“看起来完整”而全部都跑。

#### Step 3: Run and Record Checks

对已选中的扩展分析生成并执行 R 代码。

请完成以下任务：

1. 对每个选中的检验，先写清：
   - 为什么选它
   - 它对应哪个问题 / 风险
   - 它预期帮助澄清什么
2. 生成并执行清晰、可运行、注释简洁的 R 代码。
3. 如果执行失败：
   - 优先做最小技术修复
   - 不得改变原检验的研究逻辑
   - 若当前数据不支持，应明确记录为“not feasible”
4. 对每个检验，记录：
   - 检验名称
   - 目的
   - 运行状态
   - 主要结果
   - 结果方向是否与 baseline 一致
   - 解释边界

#### Step 4: Interpret with Boundaries

对每个扩展检验给出克制、清楚的解释。

请完成以下任务：

1. 对每个 mechanism-supporting evidence，说明：
   - 它是否与理论机制一致
   - 它能为机制提供何种程度的支持
   - 它不能证明什么
2. 对每个 heterogeneity / conditional effect，说明：
   - 它展示了什么条件差异
   - 这种差异如何帮助理解主结果
   - 它不能替代什么
3. 对每个 robustness check，说明：
   - 它缓解了哪个担忧
   - 结果是否支持 baseline 的稳定性
   - 还有哪些担忧未解决
4. 若扩展结果与 baseline 明显冲突，必须明确指出结果敏感性，不得粉饰。

#### Step 5: Prepare for Paper Output

将本阶段结果整理成可以直接进入 Phase 6 的结构。

请完成以下任务：

1. 标记哪些结果适合进入正文：
   - 最关键的 mechanism-supporting evidence（若有）
   - 最关键的 heterogeneity result（若有）
   - 最关键的 robustness result
2. 标记哪些结果更适合放附录
3. 标记哪些结果不建议展示：
   - 解释力弱
   - 与主问题关系弱
   - 结果不稳定且难以解释
   - 可行性不足

### Phase 5 输出格式

机制检验 1/2/3：目标，结果，可以帮助解释什么，不能帮助解释什么,why this check was selected
鲁棒性检验 1/2/3/4/5：目标，结果，可以帮助解释什么，不能帮助解释什么。

默认优先推荐的鲁棒性检验类型：

- 替代变量定义
- 极端值处理 / winsorize
- 不同控制变量组合
- 固定效应与标准误合理性检查
- 子样本一致性
- 时间滞后 / lead-lag（若适合）
- placebo（若适合）

### 输出格式

请严格按以下结构输出。

#### A. Priority Check Map

1. Main explanation needs
   -
   -
2. Main identification concerns
   -
   -
3. Main interpretation boundaries
   -
   -

#### B. Mechanism-Supporting Evidence

最多输出 2–3 个。

Check M1

- Purpose:
- Why this check was selected:
- Data feasibility:
- Result:
- What it helps explain:
- What it cannot prove:
- Recommended placement: Main text / Appendix / Not recommended

Check M2
同上

#### C. Heterogeneity / Conditional Effects

最多输出 2–3 个。

Check H1

- Purpose:
- Why this check was selected:
- Data feasibility:
- Result:
- What pattern it shows:
- What it cannot prove:
- Recommended placement: Main text / Appendix / Not recommended

Check H2
同上

#### D. Robustness / Alternative Explanation Checks

最多输出 3–5 个。

Check R1

- Threat addressed:
- Why this check was selected:
- Data feasibility:
- Result:
- What concern it reduces:
- What concern remains:
- Recommended placement: Main text / Appendix / Not recommended

Check R2
同上

#### E. Overall Assessment of Expanded Analysis

- Do the expanded checks broadly support the baseline result? Yes / Partly / No
- Which expanded result is most useful for the paper?
- Which result is too weak or unstable to emphasize?

---

## 文件契约

保留一个轻量文件契约，用来保证后续 workflow 能稳定接上：

- 本阶段的结果都要写入 `executor/` 目录下对应阶段文件，不要只留在对话里。
- 不要改这些文件名，也不要写到 `executor/` 目录之外。
- `executor/stage_1_run_baseline.md` 和 `executor/stage_2_explanation_robustness.md` 是写作阶段的正式输入，绝不能省略。
- 若某一阶段因资料不足、代码失败或数据不支持无法完成，也要写清楚当前阻塞、失败原因、最小修复建议和是否 `not feasible`。

当前约定的阶段文件如下：

- `executor/stage_1_run_baseline.md`
- `executor/stage_2_explanation_robustness.md`
