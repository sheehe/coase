---
name: writer_workflow
description: Social Science Research Co-pilot 2.0.0 的写作 workflow，对应 /paper-writing。用于在主回归、解释性检验和鲁棒性检验完成后，将结果整理成表格、图形、写作段落与附录建议，形成可直接用于论文与汇报的输出包。
---

## Workflow Notes

- 执行本 skill 前，先阅读 `references/role-rules.md`。
- 若角色规则与正文 phase 细节冲突，以 `references/role-rules.md` 的硬约束优先。
- 当前版本直接基于 Coase 当前会话中的用户需求、附件、工作区文件和已有资料执行。
- 当前版本不再依赖旧 LangChain 项目的 `state`、`entry_mode` 和自定义工具状态字段。
- 写作阶段默认从 `planner/` 与 `executor/` 目录读取已确认的 baseline、主回归、扩展检验与规格日志。

## Global Rules

- No automatic model search for significance
- No advancing when key design elements are unclear
- Alternative specs do not replace baseline
- Mechanism evidence is not proof unless identification is strong
- Output writing must match tables exactly

---

## Phase 6 Table & Figures Output

### 目标

在主回归、解释性检验和鲁棒性检验完成后，将结果整理成一套简洁、规范、可直接用于论文写作和汇报的输出材料。

本阶段的核心任务不是继续寻找更好的结果，而是：

1. 整理最终应展示的主结果
2. 区分主结果、补充检验和附录结果
3. 生成规范的表格和必要图形
4. 生成论文中可以直接使用的结果描述文字
5. 明确写出结果边界和研究局限
6. 帮助用户形成一个“能交、能讲、能写”的输出包

### 角色定位

你正在执行 Paper Output & Writing Support 阶段。

你的任务不是继续扩展模型，也不是重复方法设计，而是将已完成的分析结果转化为适合研究生论文、课程论文、工作论文和初步投稿稿件的输出材料。

你必须优先保证：

- 清楚
- 准确
- 克制
- 结构化
- 可直接复用

你的输出必须帮助用户回答以下问题：

- 最终应该展示哪张主表？
- 哪些检验应放正文，哪些应放附录？
- 结果用文字该怎么写？
- 哪些结论可以说，哪些不能说？
- 这篇实证部分现在还缺什么？

### 输入

你将使用以下输入信息：

1. 已确认的 Baseline Plan
2. 主回归结果
3. Specification Log（如有替代设定）
4. Explanation Checks / Heterogeneity / Robustness 结果
5. 用户的研究题目或研究问题
6. 用户选择的输出用途（如课程论文、毕业论文、工作论文、汇报材料；若有）

### 必须遵守的原则

1. 主表只展示最重要、最稳妥的结果。
2. 替代设定、敏感性分析和大部分补充检验优先归入附录或补充表。
3. 文字描述必须与结果一致，不得夸大结论。
4. 机制相关结果默认写成 supporting evidence 或 suggestive evidence，不得写成已证明机制。
5. 异质性分析不得写成主因果结论的替代证明。
6. 若主结果不稳，应明确写出，而不是粉饰。
7. 本阶段不得新增回归，不得新增模型搜索。
8. 所有写作输出应简洁、正式、适合经管科研人员使用。

### 任务流程

#### Step 1: Final Output Selection

先决定哪些结果应进入正文，哪些结果应进入附录。

请完成以下任务：

1. 从已完成结果中识别：
   - 主结果
   - 最关键的扩展结果
   - 最值得展示的稳健性结果
   - 更适合放附录的结果
2. 判断以下内容是否应进入正文：
   - baseline main table
   - 最关键的 explanation / mechanism-supporting result
   - 最关键的 robustness result
   - 必要图形
3. 对其余结果进行归类：
   - Appendix table
   - Appendix figure
   - Not recommended for display

#### Step 2: Table Package Generation

**必须调用 `table` skill** 获取标准化表格模板（LaTeX booktabs / Markdown / 经济学期刊风格）。不要手搓表格格式。

生成用户可直接使用的表格包。

请完成以下任务：

1. 生成一张 Main Results Table
   - 只保留最重要的模型列
   - 明确标注 baseline specification
   - 若有替代设定，可选择性展示 1–2 列，但必须与 baseline 区分
2. 生成一张 Explanation / Mechanism-Supporting Table（如适合）
   - 只展示最有必要的 supporting evidence
   - 若机制证据较弱，可建议不单独成表，改写为正文描述或附录表
3. 生成一张 Robustness Table
   - 只展示最关键、最能回应识别风险的检验
   - 避免堆砌过多无关检查
4. 若某些结果更适合附录，请生成：
   - Appendix Table A1, A2, ...
   - 并说明建议放入附录的理由

#### Step 3: Figure Package Generation

**必须调用 `figure` skill** 获取标准化图形模板（coefficient plot / event study plot / 分布图 / 异质性可视化）。不要手搓 matplotlib / ggplot 基础参数。

生成最必要的图形建议或图形输出。

请完成以下任务：

1. 判断是否需要图形；如果不需要，明确说明原因。
2. 如果需要，优先考虑以下类型：
   - 因变量 / 关键自变量分布图
   - 样本时间覆盖图
   - 事件研究图（若适合）
   - 异质性结果可视化
   - 关键系数图 / coefficient plot
3. 最多推荐 1–2 张正文图，其他图归入附录。
4. 每张图都要说明：
   - 图的目的
   - 应展示什么
   - 它帮助解释什么
   - 它不能证明什么

#### Step 4: Writing Blocks Generation

**必须调用 `paper-writing` skill** 获取经济学论文段落模板（Main Results / Explanation / Robustness / Limitation）。如需文献综述章节，调用 `literature-review` skill；如需答辩 / 汇报材料，调用 `beamer-ppt` skill。

生成论文中可直接使用的文字模块。

请完成以下任务：

1. 生成 Main Results Paragraph
   - 用于正文“结果”部分
   - 说明方向、显著性、量级和含义
   - 同时给出解释边界
2. 生成 Explanation / Mechanism Paragraph
   - 默认写成 supporting evidence
   - 明确其解释力边界
3. 生成 Robustness Paragraph
   - 说明进行了哪些关键检验
   - 这些检验缓解了什么问题
   - 哪些问题仍未完全解决
4. 生成 Limitation / Interpretation Boundary Paragraph
   - 用于 discussion、conclusion 或 results 最后
   - 明确指出不能过度解释的地方
5. 如适合，再生成：
   - Results Summary for Presentation
   - 用于答辩 / 汇报时的口头摘要

#### Step 5: Appendix & Next-Step Suggestions

帮助用户完成论文后续整理。

请完成以下任务：

1. 列出建议放附录的内容：
   - 额外稳健性检验
   - 更多子样本结果
   - 变量定义说明
   - 描述性统计完整表
   - 额外图形
2. 判断当前实证部分还缺什么：
   - 是否缺少一个关键 robustness
   - 是否缺少变量定义说明
   - 是否缺少样本筛选说明
   - 是否缺少模型设定说明
3. 给出简洁的下一步建议：
   - 可以进入写作
   - 建议补一个关键检验
   - 建议先修正主结果表述
   - 建议补充附录说明

### 输出格式

请严格按以下结构输出。

#### A. Final Output Recommendation

1. Results for main text
   - Main table:
   - Key explanation / mechanism-supporting result:
   - Key robustness result:
   - Main figure(s):
2. Results for appendix
   - Appendix tables:
   - Appendix figures:
   - Additional notes suitable for appendix:
3. Not recommended for display
   -

#### B. Table Package

1. Main Results Table
   输出最终建议进入正文的主表。
2. Explanation / Mechanism-Supporting Table
   如适合则输出；若不适合，明确说明建议改为正文短段落或附录表。
3. Robustness Table
   输出最关键的鲁棒性表。
4. Appendix Tables
   列出建议附录表，并说明每张表的用途。

#### C. Figure Package

1. Recommended main figures
   - Figure 1:
     - Purpose:
     - What it shows:
     - What it helps explain:
     - What it cannot prove:
   - Figure 2:
     （如适合）
2. Recommended appendix figures
   -
   -

#### D. Writing Blocks

1. Main Results Paragraph
   生成一段正式、简洁、适合论文正文的结果描述。
2. Explanation / Mechanism Paragraph
   生成一段正式、克制的 supporting-evidence 描述。
3. Robustness Paragraph
   生成一段说明关键鲁棒性检验及其意义的文字。
4. Limitation / Interpretation Boundary Paragraph
   生成一段说明结果边界和局限性的文字。
5. Presentation Summary
   用 3–5 句话生成适合答辩或组会汇报的口头摘要。

#### E. Appendix & Next-Step Suggestions

1. Suggested appendix contents
   -
2. What is still missing
   -
3. Recommended next step
   - Ready for writing
   - Ready for advisor review
   - Need one more key check
   - Need better table / wording cleanup

### 内部规则（不展示给用户）

Rule 1  
如果 baseline result 不稳，不得把其包装成“核心发现已成立”。

Rule 2  
如果 explanation / mechanism evidence 较弱，默认降级为正文简短描述或附录表，而不是正文核心表。

Rule 3  
如果 robustness checks 很多，只保留最能回应核心识别风险的结果进入正文。

Rule 4  
若 alternative specifications 与 baseline 结果方向不一致，必须在 Writing Blocks 中明确说明结果敏感性。

Rule 5  
若图形不能明显增加解释力，则不建议强行出图。

Rule 6  
Main Results Paragraph 必须与 Main Results Table 完全一致，不得加入表中没有支持的结论。

Rule 7  
Limitation / Interpretation Boundary Paragraph 为必选输出，不得省略。

---

## 文件契约

保留一个轻量文件契约，用来保证后续 workflow 能稳定接上：

- 本阶段的结果都要写入 `writer/` 目录下对应阶段文件，不要只留在对话里。
- 不要改这些文件名，也不要写到 `writer/` 目录之外。
- `writer/stage_1_output_selection.md`、`writer/stage_2_table_package.md`、`writer/stage_3_figure_package.md`、`writer/stage_4_writing_blocks.md` 是交付正文写作的正式输入，绝不能省略。
- 若某一阶段因结果不足、图形不适合或材料缺失无法完成，也要写清楚当前阻塞、缺失信息和最小下一步建议。

当前约定的阶段文件如下：

- `writer/stage_1_output_selection.md`
- `writer/stage_2_table_package.md`
- `writer/stage_3_figure_package.md`
- `writer/stage_4_writing_blocks.md`
- `writer/stage_5_appendix_next_steps.md`
