---
name: full_research_workflow
description: Coase 工作流 W1 完整研究管线（经管 Research Co-pilot）。从研究方向和数据出发，依次执行：读 readme / 扫描数据 → 生成 X 个假设 → 多模型对抗分析与评分迭代 → 阈值过滤 → 研究方案设计 → 模型对抗审方案 → 主回归 → 判定（p < 0.05 + effect size 双重）→ 通过则进入机制 + 鲁棒性检验；不通过则有限迭代或进入淘汰库 → 对检验结果再次模型对抗 → 保存最终表图 → 处理下一个候选假设。全程可选 human-in-the-loop。遵循《经管 Research Co-pilot 产品讨论书》第三节的 14 步流程。
---

## Workflow Notes

- 本工作流是上层编排器，内部依次调用 `planner_workflow`、`executor_workflow`，以及 `idea-generator` / `idea-critic` / `significance-verdict` 三个新 skill。不要重复实现它们的逻辑。
- 工作目录布局：`idea/`, `planner/`, `executor/`, `verdict/`。每阶段产物落入对应目录的 stage 文件。
- 本 skill 定位为 **经管学者** 视角（非"社会科学学者"或经济学通用），参考期刊：SMJ, Organization Science, AMJ, JIBS, SEJ, JBV（不是 AJPS / AER）。
- 对抗评分至少调用 2 个不同 provider 的模型。若用户未在设置页配置"评审模型组"，先提示用户配置再继续。
- 方法迭代（step 8a）严格遵守 executor_workflow Phase 4 的规则：只允许调整**控制变量 / 样本定义 / 变量处理**，**不允许换 FE / cluster 来找结果**，**不允许改变 estimand 含义**。每次替代设定必须标注 changed what。

## Global Rules

- No automatic model search for significance
- No advancing when key design elements are unclear
- Alternative specs do not replace baseline
- Mechanism evidence is not proof unless identification is strong
- Output writing must match tables exactly

---

## 一. 经管研究的概论（原文，来自《产品讨论书》）

经管研究总体上遵循"基于理论提出假设，通过实证数据分析验证假设"的研究流程。具体而言，研究人员通过文献、田野调查、访谈等方式产生了对某一个因果关系及其机制的假设，然后再用相关的数据构建变量，通过计量经济学等方法验证这个假设是否在现实中存在，以下试举一例：

例：长期以来，大家都很关心创业公司是否应该使用一个扁平化的组织架构，以及扁平化的架构到底会对创业公司的绩效表现带来什么影响。从过去文献来看，扁平化架构对企业的影响是多元甚至冲突的，有些认为对创业公司绩效有正面作用，有些认为有负面作用（也就是所谓的 tension，即过去的文献存在某些 paradox）。这种过去研究的冲突性使得这个话题具有研究的价值。某篇 SMJ 的文章就进一步探索了这个问题。具体来说，研究人员首先关注这个问题，与创业公司进行了一些访谈，进而得出一个假设，即：创业公司的扁平化会正面的影响创业公司的创造性表现，但是会负面影响公司的财务表现。之前的文献没有区分这两种表现，所以会有冲突的结论。这是两个假设。研究人员进一步收集了美国游戏开发公司的相关数据，验证了这两个假设。同时，作者提出这两个因果关系发生的机制为：This study suggests that while a flatter hierarchy can improve ideation and creative success, it can result in haphazard execution and commercial failure by overwhelming managers with the burden of direction and causing subordinates to drift into power struggles and aimless idea explorations. 作者进一步通过异质性分析等方法验证了这个机制的存在。

研究的假设一般为一个因果性，即 X 的提升带来 Y 的提升，或 X 的提升带来 Y 的下降。也就是说，一个假设不仅仅涵盖 X 和 Y 有相关性，还应该包括这个相关性的符号方向。当然，这里的 X 不一定只能是一个连续变量，也可以是某一个政策，或者某一个事件。总而言之，相关性 + 符号方向构成了假设，再通过计量经济学证明该因果性的存在及这个因果性产生背后的机制才是一个完整的研究。

---

## 二. 经管研究的相关计量经济学分析（原文）

经管研究的分析内容基本为 3 类：**因果主检验，机制分析，及鲁棒性检验**。

1. 研究人员首先要通过 DID，IV，RD 等计量方法证明假设，即 X 和 Y 之间的因果关系切实存在。这是主检验。
2. 对这个因果关系背后的机制进行机制检验，多数通过异质性分析或调节效应分析来进行。举例而言，如果这个主分析是不确定性带来创业公司绩效表现的下降，那么作者可能提出背后的机制是因为不确定性会抑制企业动员资源的能力所导致的。那么在这种情况下，可以进行异质性分析，即分开对资源多的企业和资源少的企业分成两个子样本进行分析，如果这个因果关系在这两个子样本之间有显著的差异，那么可以合理推断资源确实是这个因果关系背后的重要机制。或，通过调节分析，即将"资源"这一变量放进原回归，测试"资源"这个变量是否会显著的削弱或者加强原效应，那么也可以为这一机制检验提供实证证据。
3. 对 main analysis 进行鲁棒性检验，常规的鲁棒性检验包括：
   1. 更换分析模型，效应是否依然存在（alternative model）
   2. 各类子样本分别测试，效应是否依然存在（alternative sample）
   3. 更换主变量的 measure 方法，效应是否依然存在（alternative measurement）
   4. DID 之类的方法可能还包括反事实检验（placebo test）等

也就是说，一个完整的分析应该包括这三部分。总体上来说，经管研究对结果的汇报主要以 table 为主，辅以少量的 figure。Figure 一般在三种情况下需要：

1. DID 需要通过 figure 展现平行效应假设是否通过及事件后分期效应
2. RD 需要通过 figure 展现断点是否确实是一个随机断点
3. 调节效应需要通过 figure 展示调节效应是否真实存在

---

## 三. 14-Step Co-pilot 完整流程（原文，human-in-the-loop）

### Step 1a

LLM 对现有数据的 readme 文档（如 variable list, sample description）进行阅读，进而 develop 出 X 个有意思的假设。在没有 readme 文档的情况下，LLM 可以直接对部分数据样本进行扫描建立认识，并保存好数据探索结果。这个探索数据过程只进行一次，之后如果发现是同一数据集，则直接找之前的探索结果。

### Step 1b

人类输入 X 个可能的假设。

### Step 2

LLM 对这几个假设进行分析，如搜索文献等，判断这几个假设是否具有研究价值。这一步可以融入模型对抗，通过一个 agent 来评判上个 agent 给出的假设分析，并给出建议，如此循环几轮，直到每个假设都较好。

### Step 3

LLM 对假设进行 1-10 分评分，从最高到最低分排列，将 X 分设为 threshold，通过 threshold 分数的假设按最高分到最低分轮流进入下一轮，低于 threshold 的假设补充 X 轮讨论看是否能够修改到可以通过模型对抗打分得到高于 threshold 的分数，如还是不行则进入淘汰库供 LLM 之后回避。这一步可以融入 human in the loop 需要人类干预决策是否进入下一轮（optional，可供选择是否需要融入 human in the loop）。

### Step 4

LLM 基于假设和本地数据和公共数据（公共数据 api）开始设计研究方案，主要包括：

1. 样本选择，可能只需要用到本地数据的一个子样本
2. 变量选择，主要需要用到哪些变量
3. 因果识别策略选择，DID 还是 IV 还是 RD
4. 其它模型相关的部分，如固定效应，cluster standard error 等等（rule out alternative story）

### Step 5

模型对抗 LLM 对这一实验方案进行分析及建议，与原 LLM 否决该方案 / 形成新的最终方案。

### Step 6

LLM 调用 R 开始进行主回归分析，在这一步暂时不需要进行鲁棒性检验或机制检验 / 异质性分析。只需要主回归结果即可。

### Step 7

判定结果是否具有：

1. **统计意义上的显著性**，即 P-value 是否小于 0.05
2. **经济意义或实质意义上的显著性**，即 effect size（影响效果）是否够大

举例而言，如果 X 对 Y 具有统计上显著的影响，但是影响效果极其小，那么这个研究其实就没有太大意义。比如我们研究 X 是否对 app 评分有影响，但是我们发现 X 上升一个 SD 就只会对 app 评分有 0.00001 的影响，那么这个发现就没有什么意义。这里可以引入 human in the loop 的选项，相当于是一个 option，可以选择是否需要人类介入判定。

### Step 8a

如果上一轮判定结果不通过，则通过 X 次迭代（调整模型、变量、样本等方式）尝试是否会有符合判定的结果。如果 X 次后均不通过，则该 idea 放弃，进入淘汰库。可能要引入 AI 对描述性统计和分布有一个更好的理解之后 accordingly 的调整。

**重要补充（Coase 实现约束）**：本步骤的"调整"严格遵守 executor_workflow Phase 4 规则——只允许调整**控制变量 / 样本定义 / 变量处理**；**不允许自动换 FE / cluster 来找结果**；**替代设定不得改变 estimand 含义**；所有替代设定必须在 Specification Log 中明确标注 changed what。

### Step 8b

如果上一轮判定结果通过，则开始进行相关的机制检验及鲁棒性检验的方案设计。

### Step 9

模型对抗 LLM 对机制检验和鲁棒性检验方案进行分析及建议，与原 LLM 否决该方案 / 形成新的最终方案。

### Step 10

基于最终方案完成异质性分析和机制检验。

### Step 11

引入模型对抗对检验结果进行判定是否通过。可以进行分析与修改建议。

### Step 12

LLM 基于模型对抗的结果对 analysis 进行修改，重新形成最新结果。

### Step 13

将最终分析结果的表与图保存到本地。

### Step 14

开始对第三步中排名第二的假设（如有，因为有可能只有一个假设评分高于 threshold）重复流程。这里要注意上下文可能太多，开始产生幻觉，应该怎么规避。

### 注 1

在大部分情况下，不需要 LLM 出图，尽量只出必要的图（即前文关于 figure 的讨论）以节省时间和 token。

### 注 2

现有 prompt 中有几个地方需要更改：

1. 将最初的 agent 定性"社会科学学者"改为"经管学者"
2. 将后面参考的期刊杂志从 AJPS, AER 等改为 **SMJ, Organization Science, AMJ, JIBS, SEJ, JBV**

---

## 技术实现映射（Coase 内部编排）

下表将 14 步流程映射到具体 skill / workflow / 产物文件：

| Step | 原文任务 | 调用 skill / workflow | 产物 |
|---|---|---|---|
| 1a | 读 readme / 扫描数据 → 生成 X 个假设 | `idea-generator` | `idea/stage_1_hypotheses.md` |
| 1b | 人类输入 X 个假设 | human input | `idea/stage_1_hypotheses.md` |
| 2 | 模型对抗分析假设，循环几轮直到每个假设都较好 | `idea-critic`（discuss mode） | `idea/stage_2_critique_rounds.md`（追加每轮） |
| 3 | 1-10 评分 + threshold 过滤 + 淘汰库 | `idea-critic`（score mode） | `idea/stage_3_ranked.md`, `idea/eliminated_pool.md` |
| 4 | 设计研究方案（样本 / 变量 / 识别策略 / FE / cluster） | `planner_workflow` Phase 2 + 8 个方法 skill 之一 | `planner/stage_5_variable_mapping.md` ~ `planner/stage_7_baseline_design.md` |
| 5 | 模型对抗审方案 | `idea-critic`（design-critique mode） | `planner/stage_7_baseline_design.md` 补充 critique 小节 |
| 6 | R 主回归 | `executor_workflow` Phase 4 + 对应方法 skill | `executor/stage_1_run_baseline.md` |
| 7 | p < 0.05 + effect size 双重判定 | `significance-verdict` | `verdict/stage_1_baseline_verdict.md` |
| 8a | 判定不通过 → 迭代 X 次（遵守 Phase 4 规则） | executor 回退 + spec log | `executor/stage_1_run_baseline.md` 中的 Specification Log |
| 8a-fail | 迭代 X 次仍不通过 → 进淘汰库 | 写入 `idea/eliminated_pool.md`，回到 step 14 处理下一个假设 | — |
| 8b | 判定通过 → 设计机制 + 稳健性 | `planner_workflow` 扩展 + `executor_workflow` Phase 5 | — |
| 9 | 模型对抗审机制 / 稳健性方案 | `idea-critic`（design-critique mode） | `executor/stage_2_explanation_robustness.md` 补充 critique 小节 |
| 10 | 执行异质性 + 机制 | `executor_workflow` Phase 5 | `executor/stage_2_explanation_robustness.md` |
| 11 | 模型对抗判定检验结果 | `idea-critic`（result-critique mode） | `verdict/stage_2_extended_verdict.md` |
| 12 | 基于对抗修改 analysis | `executor_workflow` Phase 5 迭代 | `executor/stage_2_explanation_robustness.md` 追加 |
| 13 | 保存 table / figure | `table` skill + `figure` skill（仅必要图，见注 1） | `executor/figures/`, `executor/tables/` |
| 14 | 处理排名第二假设（若 threshold 通过名单有多个） | 回到 step 4，注意 context 管理防止幻觉 | — |

### Human-in-the-loop 介入点

以下步骤默认启用人类介入（用户可在设置里关闭）：

- **Step 3**：是否让某个通过 threshold 的假设进入下一轮
- **Step 7**：主回归判定通过 / 不通过（尤其 effect size 是否"够大"这种半定性判断）
- **Step 8a-fail**：是否放入淘汰库，还是还想手动再试

### 默认参数

以下是原文中 X 占位的 Coase 默认值，用户可在 workflow 调用时覆盖：

- **Step 1a/1b 假设数量**：`num_hypotheses = 3`（最大 5）
- **Step 2 对抗循环轮数**：`critique_rounds = 2`（最大 3）
- **Step 3 threshold**：`score_threshold = 7`（1-10 分制）
- **Step 3 低分假设补充讨论轮数**：`rescue_rounds = 2`
- **Step 8a 迭代次数**：`spec_iterations = 2`（最大 3，硬上限；Phase 4 规则锁定）
- **Step 14 context 管理**：每处理完一个假设必须新开子任务，防止累积幻觉

### 评审模型组调用

Step 2 / 5 / 9 / 11 的"模型对抗" 在 Coase 实现上是通过调用 **`mcp__coase-critic-panel__invoke`** tool 完成（Coase 内建 in-process MCP server 提供）。tool 读取用户在"设置 → 评审模型组"里配置的 provider 列表，并行向每个 provider 发起裸 Anthropic Messages API 调用，返回每个模型独立的回答，由 agent（在 `idea-critic` skill 的指引下）做聚合分析。用户感知上只需在设置页勾选模型，不需要知道底层是 MCP。具体 tool 签名和使用方法详见 `idea-critic` skill 文档。

## File Contract

必须写入的阶段文件，不要改文件名，不要写到对应目录之外：

- `idea/stage_0_intake.md`（用户方向 + 数据列表 + 约束）
- `idea/stage_1_hypotheses.md`（step 1a/1b 产生的 X 个假设）
- `idea/stage_2_critique_rounds.md`（step 2 每轮对抗记录）
- `idea/stage_3_ranked.md`（step 3 评分 + 通过名单）
- `idea/eliminated_pool.md`（所有被淘汰的假设，供未来回避）
- `planner/stage_1_alignment.md` ~ `planner/stage_8_descriptive_snapshot.md`（planner_workflow 负责）
- `executor/stage_1_run_baseline.md`, `executor/stage_2_explanation_robustness.md`（executor_workflow 负责）
- `verdict/stage_1_baseline_verdict.md`（step 7 判定记录）
- `verdict/stage_2_extended_verdict.md`（step 11 机制 / 稳健性判定记录）
- `verdict/spec_log.md`（step 8a 的所有迭代记录，每条含 changed what + reason + result）
- `verdict/final_verdict.md`（本轮假设收尾总结）

若某一步因资料不足、数据不支持或代码失败无法完成，也要写清楚当前阻塞、缺失信息、最小下一步建议。

## Related Skills

- `idea-generator`：Step 1a（读数据 + 生成 X 个假设）
- `idea-critic`：Step 2 / 3 / 5 / 9 / 11（多模型对抗评分 + 方案 critique + 结果 critique）
- `significance-verdict`：Step 7（p-value + effect size 双重判定）+ Step 8 分支决策
- `planner_workflow`：Step 4 规划（含 8 个方法 skill 的识别策略 dispatch）
- `executor_workflow`：Step 6 / 10 / 12 执行
- `table` / `figure`：Step 13 产出（仅必要图）
